import type { DocumentType, FleetGraphTriggerSource } from '@ship/shared';
import { pool } from '../../db/client.js';
import { executeFleetGraphTrigger } from './execute.js';

export interface FleetGraphTriggerEvent {
  workspaceId: string;
  documentId: string;
  source: FleetGraphTriggerSource;
  documentType?: DocumentType | string | null;
  userId?: string | null;
  contentHash?: string | null;
}

export interface FleetGraphTriggerResult {
  accepted: boolean;
  mode: 'queued' | 'skipped';
  reason?: 'duplicate_hash' | 'already_queued';
}

export interface FleetGraphQueueStatus {
  batchIntervalMs: number;
  maxDocumentsPerFlush: number;
  isFlushing: boolean;
  lastFlushStartedAt: string | null;
  lastFlushCompletedAt: string | null;
  leaseTimeoutMs: number;
  pendingCount: number;
  runningCount: number;
  failedCount: number;
  completedCount: number;
  workspaceGroups: Array<{
    workspaceId: string;
    pendingCount: number;
    runningCount: number;
  }>;
  pendingDocuments: Array<{
    id: string;
    workspaceId: string;
    documentId: string;
    source: FleetGraphTriggerSource;
    documentType?: DocumentType | string | null;
    userId?: string | null;
    contentHash?: string | null;
    status: 'pending' | 'running';
    attemptCount: number;
    leasedBy: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

interface FleetGraphJobRecord {
  id: string;
  workspace_id: string;
  document_id: string;
  source: FleetGraphTriggerSource;
  document_type: DocumentType | string | null;
  user_id: string | null;
  content_hash: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempt_count: number;
  max_attempts: number;
  leased_by: string | null;
  lease_expires_at: string | null;
  available_at: string | null;
  created_at: string;
  updated_at: string;
}

const BATCH_INTERVAL_MS = Number(process.env.FLEETGRAPH_BATCH_INTERVAL_MS || 4 * 60 * 1000);
const MAX_DOCUMENTS_PER_FLUSH = Number(process.env.FLEETGRAPH_MAX_DOCUMENTS_PER_FLUSH || 24);
const LEASE_TIMEOUT_MS = Number(process.env.FLEETGRAPH_LEASE_TIMEOUT_MS || 10 * 60 * 1000);
const RETRY_DELAY_MS = Number(process.env.FLEETGRAPH_RETRY_DELAY_MS || 60_000);
const MAX_ATTEMPTS = Number(process.env.FLEETGRAPH_MAX_ATTEMPTS || 3);

let batchInterval: NodeJS.Timeout | null = null;
let isFlushing = false;
let lastFlushStartedAt: string | null = null;
let lastFlushCompletedAt: string | null = null;

export async function enqueueFleetGraphRun(
  event: FleetGraphTriggerEvent
): Promise<FleetGraphTriggerResult> {
  ensureFleetGraphBatchProcessor();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const latestCompletedResult = await client.query<Pick<FleetGraphJobRecord, 'content_hash'>>(
      `
        SELECT content_hash
        FROM fleetgraph_jobs
        WHERE document_id = $1
          AND status = 'completed'
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [event.documentId]
    );
    const activeJobsResult = await client.query<FleetGraphJobRecord>(
      `
        SELECT *
        FROM fleetgraph_jobs
        WHERE document_id = $1
          AND status IN ('pending', 'running')
        ORDER BY
          CASE status WHEN 'running' THEN 0 ELSE 1 END,
          created_at ASC
        FOR UPDATE
      `,
      [event.documentId]
    );

    const latestCompletedHash = latestCompletedResult.rows[0]?.content_hash ?? null;
    const activeJobs = activeJobsResult.rows;
    const normalizedHash = event.contentHash ?? null;

    if (normalizedHash && latestCompletedHash === normalizedHash && activeJobs.length === 0) {
      await client.query('COMMIT');
      return { accepted: false, mode: 'skipped', reason: 'duplicate_hash' };
    }

    if (
      normalizedHash &&
      activeJobs.some((job) => job.content_hash === normalizedHash)
    ) {
      await client.query('COMMIT');
      return { accepted: false, mode: 'skipped', reason: 'already_queued' };
    }

    const pendingJob = activeJobs.find((job) => job.status === 'pending');

    if (pendingJob) {
      await client.query(
        `
          UPDATE fleetgraph_jobs
          SET
            workspace_id = $2,
            source = $3,
            document_type = $4,
            user_id = $5,
            content_hash = $6,
            available_at = now(),
            updated_at = now()
          WHERE id = $1
        `,
        [
          pendingJob.id,
          event.workspaceId,
          event.source,
          event.documentType ?? null,
          event.userId ?? null,
          normalizedHash,
        ]
      );
    } else {
      await client.query(
        `
          INSERT INTO fleetgraph_jobs (
            workspace_id,
            document_id,
            source,
            document_type,
            user_id,
            content_hash,
            status,
            max_attempts,
            available_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, now())
        `,
        [
          event.workspaceId,
          event.documentId,
          event.source,
          event.documentType ?? null,
          event.userId ?? null,
          normalizedHash,
          MAX_ATTEMPTS,
        ]
      );
    }

    await client.query('COMMIT');

    console.info('[FleetGraph] Trigger queued', {
      workspaceId: event.workspaceId,
      documentId: event.documentId,
      source: event.source,
      documentType: event.documentType ?? null,
      userId: event.userId ?? null,
      contentHash: normalizedHash,
    });

    return { accepted: true, mode: 'queued' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function flushFleetGraphQueue(): Promise<void> {
  if (isFlushing) {
    return;
  }

  isFlushing = true;
  lastFlushStartedAt = new Date().toISOString();

  const results = {
    executed: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    await requeueExpiredFleetGraphJobs();
    const workerId = buildWorkerId();
    const batch = await claimFleetGraphJobBatch(workerId, MAX_DOCUMENTS_PER_FLUSH);

    if (batch.length === 0) {
      return;
    }

    console.info('[FleetGraph] Batch flush started', {
      executingDocuments: batch.length,
      batchIntervalMs: BATCH_INTERVAL_MS,
      maxDocumentsPerFlush: MAX_DOCUMENTS_PER_FLUSH,
      workerId,
    });

    for (const job of batch) {
      const event = toTriggerEvent(job);

      try {
        const result = await executeFleetGraphTrigger(event);
        if (result.executed) {
          results.executed += 1;
          await markFleetGraphJobCompleted(job.id);
        } else {
          results.skipped += 1;
          await markFleetGraphJobCompleted(job.id);
        }
      } catch (error) {
        results.failed += 1;
        await markFleetGraphJobFailed(job, error);
        console.error('[FleetGraph] Execution failed', {
          jobId: job.id,
          workspaceId: job.workspace_id,
          documentId: job.document_id,
          source: job.source,
          error,
        });
      }
    }
  } finally {
    isFlushing = false;
    lastFlushCompletedAt = new Date().toISOString();
    console.info('[FleetGraph] Batch flush completed', {
      ...results,
      lastFlushCompletedAt,
    });
  }
}

export async function getFleetGraphQueueStatus(): Promise<FleetGraphQueueStatus> {
  const [countsResult, workspaceGroupsResult, pendingDocumentsResult] = await Promise.all([
    pool.query<{
      pending_count: string;
      running_count: string;
      failed_count: string;
      completed_count: string;
    }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
          COUNT(*) FILTER (WHERE status = 'running') AS running_count,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed_count
        FROM fleetgraph_jobs
      `
    ),
    pool.query<{
      workspace_id: string;
      pending_count: string;
      running_count: string;
    }>(
      `
        SELECT
          workspace_id,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
          COUNT(*) FILTER (WHERE status = 'running') AS running_count
        FROM fleetgraph_jobs
        WHERE status IN ('pending', 'running')
        GROUP BY workspace_id
        ORDER BY
          COUNT(*) FILTER (WHERE status = 'pending') DESC,
          COUNT(*) FILTER (WHERE status = 'running') DESC
      `
    ),
    pool.query<FleetGraphJobRecord>(
      `
        SELECT *
        FROM fleetgraph_jobs
        WHERE status IN ('pending', 'running')
        ORDER BY
          CASE status WHEN 'running' THEN 0 ELSE 1 END,
          created_at ASC
        LIMIT 25
      `
    ),
  ]);

  const counts = countsResult.rows[0];

  return {
    batchIntervalMs: BATCH_INTERVAL_MS,
    maxDocumentsPerFlush: MAX_DOCUMENTS_PER_FLUSH,
    leaseTimeoutMs: LEASE_TIMEOUT_MS,
    isFlushing,
    pendingCount: Number(counts?.pending_count ?? 0),
    runningCount: Number(counts?.running_count ?? 0),
    failedCount: Number(counts?.failed_count ?? 0),
    completedCount: Number(counts?.completed_count ?? 0),
    lastFlushStartedAt,
    lastFlushCompletedAt,
    workspaceGroups: workspaceGroupsResult.rows.map((row) => ({
      workspaceId: row.workspace_id,
      pendingCount: Number(row.pending_count),
      runningCount: Number(row.running_count),
    })),
    pendingDocuments: pendingDocumentsResult.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      documentId: row.document_id,
      source: row.source,
      documentType: row.document_type ?? null,
      userId: row.user_id ?? null,
      contentHash: row.content_hash ?? null,
      status: row.status as 'pending' | 'running',
      attemptCount: row.attempt_count,
      leasedBy: row.leased_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

export function startFleetGraphWorker(): void {
  ensureFleetGraphBatchProcessor();
}

function ensureFleetGraphBatchProcessor(): void {
  if (batchInterval || process.env.FLEETGRAPH_WORKER_ENABLED === 'false') {
    return;
  }

  batchInterval = setInterval(() => {
    void flushFleetGraphQueue();
  }, BATCH_INTERVAL_MS);

  batchInterval.unref?.();
}

async function claimFleetGraphJobBatch(
  workerId: string,
  maxDocumentsPerFlush: number
): Promise<FleetGraphJobRecord[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const candidateResult = await client.query<FleetGraphJobRecord>(
      `
        SELECT *
        FROM fleetgraph_jobs
        WHERE status = 'pending'
          AND COALESCE(available_at, now()) <= now()
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `,
      [Math.max(maxDocumentsPerFlush * 4, maxDocumentsPerFlush)]
    );

    const selected = selectBatchForFlush(
      candidateResult.rows.map((row) => toTriggerEvent(row)),
      maxDocumentsPerFlush
    );

    if (selected.length === 0) {
      await client.query('COMMIT');
      return [];
    }

    const selectedIds = selected.map((event) =>
      candidateResult.rows.find((row) => row.document_id === event.documentId)?.id
    ).filter((value): value is string => Boolean(value));

    const updatedResult = await client.query<FleetGraphJobRecord>(
      `
        UPDATE fleetgraph_jobs
        SET
          status = 'running',
          leased_by = $2,
          lease_expires_at = now() + ($3::text || ' milliseconds')::interval,
          attempt_count = attempt_count + 1,
          updated_at = now()
        WHERE id = ANY($1::uuid[])
        RETURNING *
      `,
      [selectedIds, workerId, LEASE_TIMEOUT_MS]
    );

    await client.query('COMMIT');
    return updatedResult.rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function requeueExpiredFleetGraphJobs(): Promise<void> {
  await pool.query(
    `
      UPDATE fleetgraph_jobs
      SET
        status = 'pending',
        leased_by = NULL,
        lease_expires_at = NULL,
        available_at = now(),
        updated_at = now()
      WHERE status = 'running'
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at < now()
    `
  );
}

async function markFleetGraphJobCompleted(jobId: string): Promise<void> {
  await pool.query(
    `
      UPDATE fleetgraph_jobs
      SET
        status = 'completed',
        leased_by = NULL,
        lease_expires_at = NULL,
        updated_at = now()
      WHERE id = $1
    `,
    [jobId]
  );
}

async function markFleetGraphJobFailed(
  job: FleetGraphJobRecord,
  error: unknown
): Promise<void> {
  const shouldRetry = job.attempt_count < job.max_attempts;
  const errorMessage = summarizeFleetGraphError(error);

  await pool.query(
    `
      UPDATE fleetgraph_jobs
      SET
        status = $2,
        leased_by = NULL,
        lease_expires_at = NULL,
        available_at =
          CASE
            WHEN $2 = 'pending' THEN now() + ($3::text || ' milliseconds')::interval
            ELSE available_at
          END,
        last_error = $4,
        updated_at = now()
      WHERE id = $1
    `,
    [job.id, shouldRetry ? 'pending' : 'failed', RETRY_DELAY_MS, errorMessage]
  );
}

function selectBatchForFlush(
  events: FleetGraphTriggerEvent[],
  maxDocumentsPerFlush: number
): FleetGraphTriggerEvent[] {
  if (events.length <= maxDocumentsPerFlush) {
    return events;
  }

  const workspaceQueues = new Map<string, FleetGraphTriggerEvent[]>();
  for (const event of events) {
    const queue = workspaceQueues.get(event.workspaceId) ?? [];
    queue.push(event);
    workspaceQueues.set(event.workspaceId, queue);
  }

  const executionBatch: FleetGraphTriggerEvent[] = [];
  while (executionBatch.length < maxDocumentsPerFlush && workspaceQueues.size > 0) {
    for (const [workspaceId, queue] of workspaceQueues) {
      const next = queue.shift();
      if (next) {
        executionBatch.push(next);
      }

      if (queue.length === 0) {
        workspaceQueues.delete(workspaceId);
      } else {
        workspaceQueues.set(workspaceId, queue);
      }

      if (executionBatch.length >= maxDocumentsPerFlush) {
        break;
      }
    }
  }

  return executionBatch;
}

function toTriggerEvent(job: FleetGraphJobRecord): FleetGraphTriggerEvent {
  return {
    workspaceId: job.workspace_id,
    documentId: job.document_id,
    source: job.source,
    documentType: job.document_type ?? null,
    userId: job.user_id ?? null,
    contentHash: job.content_hash ?? null,
  };
}

function summarizeFleetGraphError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }

  return String(error).slice(0, 500);
}

function buildWorkerId(): string {
  return `${process.env.HOSTNAME ?? 'local'}:${process.pid}`;
}

export function resetFleetGraphQueueForTests(): void {
  isFlushing = false;
  lastFlushStartedAt = null;
  lastFlushCompletedAt = null;

  if (batchInterval) {
    clearInterval(batchInterval);
    batchInterval = null;
  }
}
