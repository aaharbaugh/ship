import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const executeFleetGraphTrigger = vi.fn();

interface MockJob {
  id: string;
  workspace_id: string;
  document_id: string;
  source: string;
  document_type: string | null;
  user_id: string | null;
  content_hash: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempt_count: number;
  max_attempts: number;
  leased_by: string | null;
  lease_expires_at: string | null;
  available_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

let jobs: MockJob[] = [];
let jobSequence = 0;

function nowIso() {
  return new Date(Date.now() + jobSequence).toISOString();
}

function createJob(
  partial: Partial<MockJob> & Pick<MockJob, 'workspace_id' | 'document_id' | 'source'>
): MockJob {
  jobSequence += 1;
  const timestamp = nowIso();
  return {
    id: `job-${jobSequence}`,
    workspace_id: partial.workspace_id,
    document_id: partial.document_id,
    source: partial.source,
    document_type: partial.document_type ?? null,
    user_id: partial.user_id ?? null,
    content_hash: partial.content_hash ?? null,
    status: partial.status ?? 'pending',
    attempt_count: partial.attempt_count ?? 0,
    max_attempts: partial.max_attempts ?? 3,
    leased_by: partial.leased_by ?? null,
    lease_expires_at: partial.lease_expires_at ?? null,
    available_at: partial.available_at ?? timestamp,
    last_error: partial.last_error ?? null,
    created_at: partial.created_at ?? timestamp,
    updated_at: partial.updated_at ?? timestamp,
  };
}

async function mockQuery(sql: string, params: unknown[] = []) {
  const normalized = sql.replace(/\s+/g, ' ').trim();

  if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
    return { rows: [] };
  }

  if (normalized.includes("FROM fleetgraph_jobs WHERE document_id = $1 AND status = 'completed'")) {
    const documentId = String(params[0]);
    const row = [...jobs]
      .filter((job) => job.document_id === documentId && job.status === 'completed')
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0];
    return { rows: row ? [{ content_hash: row.content_hash }] : [] };
  }

  if (normalized.includes("FROM fleetgraph_jobs WHERE document_id = $1 AND status IN ('pending', 'running')")) {
    const documentId = String(params[0]);
    const rows = jobs
      .filter((job) => job.document_id === documentId && (job.status === 'pending' || job.status === 'running'))
      .sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === 'running' ? -1 : 1;
        }
        return left.created_at.localeCompare(right.created_at);
      });
    return { rows };
  }

  if (normalized.startsWith('UPDATE fleetgraph_jobs SET workspace_id = $2')) {
    const [jobId, workspaceId, source, documentType, userId, contentHash] = params as [
      string,
      string,
      string,
      string | null,
      string | null,
      string | null,
    ];
    const job = jobs.find((entry) => entry.id === jobId);
    if (job) {
      job.workspace_id = workspaceId;
      job.source = source;
      job.document_type = documentType;
      job.user_id = userId;
      job.content_hash = contentHash;
      job.available_at = new Date().toISOString();
      job.updated_at = new Date().toISOString();
    }
    return { rows: [] };
  }

  if (normalized.startsWith('INSERT INTO fleetgraph_jobs')) {
    const [workspaceId, documentId, source, documentType, userId, contentHash, maxAttempts] = params as [
      string,
      string,
      string,
      string | null,
      string | null,
      string | null,
      number,
    ];
    jobs.push(
      createJob({
        workspace_id: workspaceId,
        document_id: documentId,
        source,
        document_type: documentType,
        user_id: userId,
        content_hash: contentHash,
        max_attempts: maxAttempts,
      })
    );
    return { rows: [] };
  }

  if (normalized.startsWith('UPDATE fleetgraph_jobs SET status = \'pending\'')) {
    const now = Date.now();
    for (const job of jobs) {
      if (
        job.status === 'running' &&
        job.lease_expires_at &&
        new Date(job.lease_expires_at).getTime() < now
      ) {
        job.status = 'pending';
        job.leased_by = null;
        job.lease_expires_at = null;
        job.available_at = new Date().toISOString();
        job.updated_at = new Date().toISOString();
      }
    }
    return { rows: [] };
  }

  if (normalized.includes("FROM fleetgraph_jobs WHERE status = 'pending'")) {
    const limit = Number(params[0]);
    const rows = jobs
      .filter((job) => job.status === 'pending')
      .sort((left, right) => left.created_at.localeCompare(right.created_at))
      .slice(0, limit);
    return { rows };
  }

  if (normalized.startsWith('UPDATE fleetgraph_jobs SET status = \'running\'')) {
    const [selectedIds, workerId] = params as [string[], string];
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    const rows: MockJob[] = [];

    for (const job of jobs) {
      if (selectedIds.includes(job.id)) {
        job.status = 'running';
        job.leased_by = workerId;
        job.lease_expires_at = leaseExpiresAt;
        job.attempt_count += 1;
        job.updated_at = now.toISOString();
        rows.push({ ...job });
      }
    }

    return { rows };
  }

  if (normalized.startsWith('UPDATE fleetgraph_jobs SET status = \'completed\'')) {
    const [jobId] = params as [string];
    const job = jobs.find((entry) => entry.id === jobId);
    if (job) {
      job.status = 'completed';
      job.leased_by = null;
      job.lease_expires_at = null;
      job.updated_at = new Date().toISOString();
    }
    return { rows: [] };
  }

  if (normalized.startsWith('UPDATE fleetgraph_jobs SET status = $2')) {
    const [jobId, status, retryDelayMs, errorMessage] = params as [string, MockJob['status'], number, string];
    const job = jobs.find((entry) => entry.id === jobId);
    if (job) {
      job.status = status;
      job.leased_by = null;
      job.lease_expires_at = null;
      job.last_error = errorMessage;
      job.updated_at = new Date().toISOString();
      if (status === 'pending') {
        job.available_at = new Date(Date.now() + retryDelayMs).toISOString();
      }
    }
    return { rows: [] };
  }

  if (normalized.startsWith('SELECT COUNT(*) FILTER')) {
    return {
      rows: [{
        pending_count: String(jobs.filter((job) => job.status === 'pending').length),
        running_count: String(jobs.filter((job) => job.status === 'running').length),
        failed_count: String(jobs.filter((job) => job.status === 'failed').length),
        completed_count: String(jobs.filter((job) => job.status === 'completed').length),
      }],
    };
  }

  if (normalized.startsWith('SELECT workspace_id,')) {
    const grouped = new Map<string, { pending: number; running: number }>();
    for (const job of jobs.filter((entry) => entry.status === 'pending' || entry.status === 'running')) {
      const current = grouped.get(job.workspace_id) ?? { pending: 0, running: 0 };
      if (job.status === 'pending') current.pending += 1;
      if (job.status === 'running') current.running += 1;
      grouped.set(job.workspace_id, current);
    }

    return {
      rows: [...grouped.entries()].map(([workspace_id, counts]) => ({
        workspace_id,
        pending_count: String(counts.pending),
        running_count: String(counts.running),
      })),
    };
  }

  if (normalized.startsWith('SELECT * FROM fleetgraph_jobs WHERE status IN (\'pending\', \'running\')')) {
    const rows = jobs
      .filter((job) => job.status === 'pending' || job.status === 'running')
      .sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === 'running' ? -1 : 1;
        }
        return left.created_at.localeCompare(right.created_at);
      })
      .slice(0, 25);
    return { rows };
  }

  throw new Error(`Unhandled query in test: ${normalized}`);
}

const poolConnect = vi.fn(async () => ({
  query: mockQuery,
  release: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  pool: {
    connect: poolConnect,
    query: mockQuery,
  },
}));

vi.mock('./execute.js', () => ({
  executeFleetGraphTrigger,
}));

const {
  enqueueFleetGraphRun,
  flushFleetGraphQueue,
  getFleetGraphQueueStatus,
  resetFleetGraphQueueForTests,
} = await import('./triggers.js');

describe('FleetGraph trigger queue', () => {
  beforeEach(() => {
    jobs = [];
    jobSequence = 0;
    poolConnect.mockClear();
    executeFleetGraphTrigger.mockReset();
    executeFleetGraphTrigger.mockResolvedValue({ executed: true });
    resetFleetGraphQueueForTests();
  });

  afterEach(() => {
    resetFleetGraphQueueForTests();
  });

  it('skips duplicate hashes that were already executed', async () => {
    await enqueueFleetGraphRun({
      workspaceId: 'ws-1',
      documentId: 'doc-1',
      source: 'document_update',
      contentHash: 'hash-1',
    });

    await flushFleetGraphQueue();

    const second = await enqueueFleetGraphRun({
      workspaceId: 'ws-1',
      documentId: 'doc-1',
      source: 'document_update',
      contentHash: 'hash-1',
    });

    expect(second).toEqual({
      accepted: false,
      mode: 'skipped',
      reason: 'duplicate_hash',
    });
    expect((await getFleetGraphQueueStatus()).pendingCount).toBe(0);
    expect(executeFleetGraphTrigger).toHaveBeenCalledTimes(1);
  });

  it('replaces queued work for the same document and skips identical queued hashes', async () => {
    await enqueueFleetGraphRun({
      workspaceId: 'ws-1',
      documentId: 'doc-1',
      source: 'document_update',
      contentHash: 'hash-1',
    });

    const duplicate = await enqueueFleetGraphRun({
      workspaceId: 'ws-1',
      documentId: 'doc-1',
      source: 'document_update',
      contentHash: 'hash-1',
    });

    const replacement = await enqueueFleetGraphRun({
      workspaceId: 'ws-1',
      documentId: 'doc-1',
      source: 'collaboration_persist',
      contentHash: 'hash-2',
      documentType: 'issue',
    });

    expect(duplicate).toEqual({
      accepted: false,
      mode: 'skipped',
      reason: 'already_queued',
    });
    expect(replacement).toEqual({
      accepted: true,
      mode: 'queued',
    });

    const status = await getFleetGraphQueueStatus();
    expect(status.pendingCount).toBe(1);
    expect(status.pendingDocuments[0]).toEqual(
      expect.objectContaining({
        documentId: 'doc-1',
        source: 'collaboration_persist',
        documentType: 'issue',
        contentHash: 'hash-2',
      })
    );
  });

  it('flushes a workspace-balanced batch and defers overflow', async () => {
    for (let index = 0; index < 30; index += 1) {
      const workspaceId = index < 20 ? 'ws-1' : 'ws-2';
      await enqueueFleetGraphRun({
        workspaceId,
        documentId: `doc-${index}`,
        source: 'nightly_scan',
        contentHash: `hash-${index}`,
      });
    }

    await flushFleetGraphQueue();

    const executedWorkspaceCounts = executeFleetGraphTrigger.mock.calls.reduce<Record<string, number>>(
      (counts, [event]) => {
        counts[String(event.workspaceId)] = (counts[String(event.workspaceId)] ?? 0) + 1;
        return counts;
      },
      {}
    );

    expect(executeFleetGraphTrigger).toHaveBeenCalledTimes(24);
    expect(executedWorkspaceCounts['ws-1']).toBe(14);
    expect(executedWorkspaceCounts['ws-2']).toBe(10);

    const status = await getFleetGraphQueueStatus();
    expect(status.pendingCount).toBe(6);
  });

  it('requeues failed jobs until max attempts and then marks them failed', async () => {
    executeFleetGraphTrigger.mockRejectedValue(new Error('boom'));

    await enqueueFleetGraphRun({
      workspaceId: 'ws-1',
      documentId: 'doc-1',
      source: 'document_update',
      contentHash: 'hash-1',
    });

    await flushFleetGraphQueue();
    let status = await getFleetGraphQueueStatus();
    expect(status.pendingCount).toBe(1);
    expect(status.failedCount).toBe(0);

    const pending = jobs.find((job) => job.document_id === 'doc-1');
    if (pending) {
      pending.available_at = new Date(Date.now() - 1_000).toISOString();
    }

    await flushFleetGraphQueue();
    status = await getFleetGraphQueueStatus();
    expect(status.pendingCount).toBe(1);

    const pendingAgain = jobs.find((job) => job.document_id === 'doc-1');
    if (pendingAgain) {
      pendingAgain.available_at = new Date(Date.now() - 1_000).toISOString();
    }

    await flushFleetGraphQueue();
    status = await getFleetGraphQueueStatus();
    expect(status.pendingCount).toBe(0);
    expect(status.failedCount).toBe(1);
  });
});
