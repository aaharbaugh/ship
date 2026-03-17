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
  reason?: 'duplicate_hash';
}

const pendingByDocument = new Map<string, NodeJS.Timeout>();
const lastHashByDocument = new Map<string, string>();

export function enqueueFleetGraphRun(event: FleetGraphTriggerEvent): FleetGraphTriggerResult {
  const contentHash = event.contentHash ?? null;
  const existingHash = lastHashByDocument.get(event.documentId);

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

  const existingTimer = pendingByDocument.get(event.documentId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const debounceMs = event.source === 'collaboration_persist' ? 8000 : 1500;

  pendingByDocument.set(
    event.documentId,
    setTimeout(() => {
      if (contentHash) {
        lastHashByDocument.set(event.documentId, contentHash);
      }

      console.info('[FleetGraph] Trigger accepted', {
        workspaceId: event.workspaceId,
        documentId: event.documentId,
        source: event.source,
        documentType: event.documentType ?? null,
        userId: event.userId ?? null,
        contentHash,
        debounceMs,
      });

      pendingByDocument.delete(event.documentId);

      void executeFleetGraphTrigger(event).catch((error) => {
        console.error('[FleetGraph] Execution failed', {
          workspaceId: event.workspaceId,
          documentId: event.documentId,
          source: event.source,
          error,
        });
      });
    }, debounceMs)
  );

  return {
    accepted: true,
    mode: 'queued',
  };
}
