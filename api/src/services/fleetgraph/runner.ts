import type {
  FleetGraphAssociationRecord,
  FleetGraphDocumentRecord,
  FleetGraphShipApiClient,
  FleetGraphTriggerRequest,
} from './client.js';
import { buildFleetGraphSnapshot, type FleetGraphGraphSnapshot } from './graph.js';
import { buildFleetGraphRunPlan } from './nodes.js';
import { buildFleetGraphScoringPayload, type FleetGraphScoringPayload } from './payload.js';

export interface FleetGraphRunPreview {
  rootDocumentId: string;
  triggerSource: FleetGraphTriggerRequest['source'];
  nodeIds: string[];
}

export interface FleetGraphFetchContext {
  rootDocument: FleetGraphDocumentRecord;
  directAssociations: FleetGraphAssociationRecord[];
  reverseAssociations: FleetGraphAssociationRecord[];
  relatedDocuments: FleetGraphDocumentRecord[];
}

export interface FleetGraphPreparedRun extends FleetGraphRunPreview {
  context: FleetGraphFetchContext;
  graph: FleetGraphGraphSnapshot;
  scoringPayload: FleetGraphScoringPayload;
}

export async function prepareFleetGraphRun(
  client: FleetGraphShipApiClient,
  trigger: FleetGraphTriggerRequest
): Promise<FleetGraphPreparedRun> {
  const rootDocument = await client.getDocument(trigger.documentId);
  const [directAssociations, reverseAssociations] = await Promise.all([
    client.getDocumentAssociations(rootDocument.id),
    client.getReverseAssociations(rootDocument.id),
  ]);
  const relatedDocumentIds = collectRelatedDocumentIds(
    rootDocument,
    directAssociations,
    reverseAssociations
  );
  const relatedDocuments = await Promise.all(
    relatedDocumentIds.map((documentId) => client.getDocument(documentId))
  );
  const plan = buildFleetGraphRunPlan(rootDocument.id, trigger.source);

  const graph = buildFleetGraphSnapshot({
    rootDocument,
    directAssociations,
    reverseAssociations,
    relatedDocuments,
  });

  return {
    rootDocumentId: rootDocument.id,
    triggerSource: trigger.source,
    nodeIds: plan.nodes.map((node) => node.id),
    context: {
      rootDocument,
      directAssociations,
      reverseAssociations,
      relatedDocuments,
    },
    graph,
    scoringPayload: buildFleetGraphScoringPayload(graph),
  };
}

export async function previewFleetGraphRun(
  client: FleetGraphShipApiClient,
  trigger: FleetGraphTriggerRequest
): Promise<FleetGraphRunPreview> {
  const prepared = await prepareFleetGraphRun(client, trigger);
  return {
    rootDocumentId: prepared.rootDocumentId,
    triggerSource: prepared.triggerSource,
    nodeIds: prepared.nodeIds,
  };
}

function collectRelatedDocumentIds(
  rootDocument: FleetGraphDocumentRecord,
  directAssociations: FleetGraphAssociationRecord[],
  reverseAssociations: FleetGraphAssociationRecord[]
): string[] {
  const ids = new Set<string>();

  if (rootDocument.parent_id) {
    ids.add(rootDocument.parent_id);
  }

  for (const belongsTo of rootDocument.belongs_to ?? []) {
    ids.add(belongsTo.id);
  }

  for (const association of directAssociations) {
    ids.add(association.related_id);
  }

  for (const association of reverseAssociations) {
    ids.add(association.document_id);
  }

  ids.delete(rootDocument.id);

  return [...ids];
}
