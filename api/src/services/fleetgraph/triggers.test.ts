import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const executeFleetGraphTrigger = vi.fn();

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
    executeFleetGraphTrigger.mockReset();
    executeFleetGraphTrigger.mockResolvedValue({ executed: true });
    resetFleetGraphQueueForTests();
  });

  afterEach(() => {
    resetFleetGraphQueueForTests();
  });

  it('skips duplicate hashes that were already executed', async () => {
    const first = enqueueFleetGraphRun({
      workspaceId: 'ws-1',
      documentId: 'doc-1',
      source: 'document_update',
      contentHash: 'hash-1',
    });

    expect(first).toEqual({
      accepted: true,
      mode: 'queued',
    });

    await flushFleetGraphQueue();

    const second = enqueueFleetGraphRun({
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
    expect(getFleetGraphQueueStatus().pendingCount).toBe(0);
    expect(executeFleetGraphTrigger).toHaveBeenCalledTimes(1);
  });

  it('replaces queued work for the same document and skips identical queued hashes', () => {
    const first = enqueueFleetGraphRun({
      workspaceId: 'ws-1',
      documentId: 'doc-1',
      source: 'document_update',
      contentHash: 'hash-1',
    });
    const duplicate = enqueueFleetGraphRun({
      workspaceId: 'ws-1',
      documentId: 'doc-1',
      source: 'document_update',
      contentHash: 'hash-1',
    });
    const replacement = enqueueFleetGraphRun({
      workspaceId: 'ws-1',
      documentId: 'doc-1',
      source: 'collaboration_persist',
      contentHash: 'hash-2',
      documentType: 'issue',
    });

    expect(first.accepted).toBe(true);
    expect(duplicate).toEqual({
      accepted: false,
      mode: 'skipped',
      reason: 'already_queued',
    });
    expect(replacement).toEqual({
      accepted: true,
      mode: 'queued',
    });

    const status = getFleetGraphQueueStatus();
    expect(status.pendingCount).toBe(1);
    expect(status.pendingDocuments[0]).toEqual(
      expect.objectContaining({
        documentId: 'doc-1',
        source: 'collaboration_persist',
        documentType: 'issue',
      })
    );
  });

  it('flushes a workspace-balanced batch and defers overflow', async () => {
    for (let index = 0; index < 30; index += 1) {
      const workspaceId = index < 20 ? 'ws-1' : 'ws-2';
      enqueueFleetGraphRun({
        workspaceId,
        documentId: `doc-${index}`,
        source: 'nightly_scan',
        contentHash: `hash-${index}`,
      });
    }

    await flushFleetGraphQueue();

    const executedWorkspaceCounts = executeFleetGraphTrigger.mock.calls.reduce<Record<string, number>>(
      (counts, [event]) => {
        const workspaceId = String(event.workspaceId);
        counts[workspaceId] = (counts[workspaceId] ?? 0) + 1;
        return counts;
      },
      {}
    );

    expect(executeFleetGraphTrigger).toHaveBeenCalledTimes(24);
    expect(executedWorkspaceCounts['ws-1']).toBe(14);
    expect(executedWorkspaceCounts['ws-2']).toBe(10);

    const status = getFleetGraphQueueStatus();
    expect(status.pendingCount).toBe(6);
    expect(status.workspaceGroups).toEqual([
      { workspaceId: 'ws-1', pendingCount: 6 },
    ]);
  });
});
