import type { DocumentType, FleetGraphTriggerSource } from '@ship/shared';

export interface FleetGraphTriggerEvent {
  workspaceId: string;
  documentId: string;
  source: FleetGraphTriggerSource;
  documentType?: DocumentType | string | null;
  userId?: string | null;
}

export interface FleetGraphTriggerResult {
  accepted: boolean;
  mode: 'noop';
}

export function enqueueFleetGraphRun(event: FleetGraphTriggerEvent): FleetGraphTriggerResult {
  // Save paths should only emit a trigger. The FleetGraph runner itself is kept
  // behind a REST-client boundary so we can honor the presearch constraint.
  console.info('[FleetGraph] Trigger accepted', {
    workspaceId: event.workspaceId,
    documentId: event.documentId,
    source: event.source,
    documentType: event.documentType ?? null,
    userId: event.userId ?? null,
  });

  return {
    accepted: true,
    mode: 'noop',
  };
}
