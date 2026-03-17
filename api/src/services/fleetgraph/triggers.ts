import type { DocumentType, FleetGraphTriggerSource } from '@ship/shared';
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
  isFlushing: boolean;
  pendingCount: number;
  lastFlushStartedAt: string | null;
  lastFlushCompletedAt: string | null;
  pendingDocuments: Array<{
    workspaceId: string;
    documentId: string;
    source: FleetGraphTriggerSource;
    documentType?: DocumentType | string | null;
    userId?: string | null;
  }>;
}

const BATCH_INTERVAL_MS = Number(process.env.FLEETGRAPH_BATCH_INTERVAL_MS || 4 * 60 * 1000);
const pendingByDocument = new Map<string, FleetGraphTriggerEvent>();
const lastHashByDocument = new Map<string, string>();
let batchInterval: NodeJS.Timeout | null = null;
let isFlushing = false;
let lastFlushStartedAt: string | null = null;
let lastFlushCompletedAt: string | null = null;

export function enqueueFleetGraphRun(event: FleetGraphTriggerEvent): FleetGraphTriggerResult {
  ensureFleetGraphBatchProcessor();

  const contentHash = event.contentHash ?? null;
  const existingHash = lastHashByDocument.get(event.documentId);
  const queuedEvent = pendingByDocument.get(event.documentId);

  if (contentHash && existingHash === contentHash) {
    console.info('[FleetGraph] Trigger skipped', {
      workspaceId: event.workspaceId,
      documentId: event.documentId,
      source: event.source,
      reason: 'duplicate_hash',
    });
    return {
      accepted: false,
      mode: 'skipped',
      reason: 'duplicate_hash',
    };
  }

  if (contentHash && queuedEvent?.contentHash === contentHash) {
    console.info('[FleetGraph] Trigger skipped', {
      workspaceId: event.workspaceId,
      documentId: event.documentId,
      source: event.source,
      reason: 'already_queued',
    });
    return {
      accepted: false,
      mode: 'skipped',
      reason: 'already_queued',
    };
  }

  pendingByDocument.set(event.documentId, {
    ...event,
    contentHash,
  });

  console.info('[FleetGraph] Trigger queued', {
    workspaceId: event.workspaceId,
    documentId: event.documentId,
    source: event.source,
    documentType: event.documentType ?? null,
    userId: event.userId ?? null,
    contentHash,
    queueSize: pendingByDocument.size,
    batchIntervalMs: BATCH_INTERVAL_MS,
  });

  return {
    accepted: true,
    mode: 'queued',
  };
}

export async function flushFleetGraphQueue(): Promise<void> {
  if (isFlushing || pendingByDocument.size === 0) {
    return;
  }

  isFlushing = true;
  lastFlushStartedAt = new Date().toISOString();
  const batch = [...pendingByDocument.values()];
  pendingByDocument.clear();

  console.info('[FleetGraph] Batch flush started', {
    queuedDocuments: batch.length,
    batchIntervalMs: BATCH_INTERVAL_MS,
  });

  const results = {
    executed: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    for (const event of batch) {
      if (event.contentHash) {
        lastHashByDocument.set(event.documentId, event.contentHash);
      }

      console.info('[FleetGraph] Trigger accepted', {
        workspaceId: event.workspaceId,
        documentId: event.documentId,
        source: event.source,
        documentType: event.documentType ?? null,
        userId: event.userId ?? null,
        contentHash: event.contentHash ?? null,
      });

      try {
        const result = await executeFleetGraphTrigger(event);
        if (result.executed) {
          results.executed += 1;
        } else {
          results.skipped += 1;
        }
      } catch (error) {
        results.failed += 1;
        console.error('[FleetGraph] Execution failed', {
          workspaceId: event.workspaceId,
          documentId: event.documentId,
          source: event.source,
          error,
        });
      }
    }
  } finally {
    isFlushing = false;
    lastFlushCompletedAt = new Date().toISOString();
    console.info('[FleetGraph] Batch flush completed', {
      queuedDocuments: batch.length,
      ...results,
      remainingQueuedDocuments: pendingByDocument.size,
    });
  }
}

export function getFleetGraphQueueStatus(): FleetGraphQueueStatus {
  return {
    batchIntervalMs: BATCH_INTERVAL_MS,
    isFlushing,
    pendingCount: pendingByDocument.size,
    lastFlushStartedAt,
    lastFlushCompletedAt,
    pendingDocuments: [...pendingByDocument.values()].slice(0, 25).map((event) => ({
      workspaceId: event.workspaceId,
      documentId: event.documentId,
      source: event.source,
      documentType: event.documentType ?? null,
      userId: event.userId ?? null,
    })),
  };
}

function ensureFleetGraphBatchProcessor(): void {
  if (batchInterval) {
    return;
  }

  batchInterval = setInterval(() => {
    void flushFleetGraphQueue();
  }, BATCH_INTERVAL_MS);

  batchInterval.unref?.();
}
