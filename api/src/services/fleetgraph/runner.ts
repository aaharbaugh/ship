import type {
  FleetGraphAssociationRecord,
  FleetGraphDocumentRecord,
  FleetGraphShipApiClient,
  FleetGraphTriggerRequest,
} from './client.js';
import { buildFleetGraphSnapshot, type FleetGraphGraphSnapshot } from './graph.js';
import { buildFleetGraphRunPlan } from './nodes.js';
import { buildFleetGraphScoringPayload, type FleetGraphScoringPayload } from './payload.js';
import { traceable } from 'langsmith/traceable';
import { fleetGraphTraceConfig } from './tracing.js';

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
  expandedDocuments: FleetGraphDocumentRecord[];
  expandedAssociations: FleetGraphAssociationRecord[];
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
  return tracedPrepareFleetGraphRun(client, trigger);
}

const tracedPrepareFleetGraphRun = traceable(
  async function prepareRun(
    client: FleetGraphShipApiClient,
    trigger: FleetGraphTriggerRequest
  ): Promise<FleetGraphPreparedRun> {
    const traversal = await expandFleetGraphTraversal(client, trigger.documentId);
    const relatedDocuments = traversal.documents.filter(
      (document) => document.id !== traversal.rootDocument.id
    );
    const directAssociations = traversal.associations.filter(
      (association) => association.document_id === traversal.rootDocument.id
    );
    const reverseAssociations = traversal.associations.filter(
      (association) => association.related_id === traversal.rootDocument.id
    );
    const plan = buildFleetGraphRunPlan(traversal.rootDocument.id, trigger.source);

    const graph = buildFleetGraphSnapshot({
      rootDocument: traversal.rootDocument,
      directAssociations,
      reverseAssociations,
      relatedDocuments,
      expandedDocuments: traversal.documents,
      expandedAssociations: traversal.associations,
    });

    return {
      rootDocumentId: traversal.rootDocument.id,
      triggerSource: trigger.source,
      nodeIds: plan.nodes.map((node) => node.id),
      context: {
        rootDocument: traversal.rootDocument,
        directAssociations,
        reverseAssociations,
        relatedDocuments,
        expandedDocuments: traversal.documents,
        expandedAssociations: traversal.associations,
      },
      graph,
      scoringPayload: buildFleetGraphScoringPayload(graph),
    };
  },
  fleetGraphTraceConfig('fleetgraph.prepare_run')
);

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

const MAX_GRAPH_DEPTH = Number(process.env.FLEETGRAPH_MAX_GRAPH_DEPTH || 2);
const MAX_GRAPH_DOCUMENTS = Number(process.env.FLEETGRAPH_MAX_GRAPH_DOCUMENTS || 40);

async function expandFleetGraphTraversal(
  client: FleetGraphShipApiClient,
  rootDocumentId: string
): Promise<{
  rootDocument: FleetGraphDocumentRecord;
  documents: FleetGraphDocumentRecord[];
  associations: FleetGraphAssociationRecord[];
}> {
  const documentMap = new Map<string, FleetGraphDocumentRecord>();
  const associationMap = new Map<string, FleetGraphAssociationRecord>();
  const queue: Array<{ documentId: string; depth: number }> = [
    { documentId: rootDocumentId, depth: 0 },
  ];
  const queued = new Set<string>([rootDocumentId]);
  const rootDocument = await client.getDocument(rootDocumentId);
  documentMap.set(rootDocument.id, rootDocument);

  while (queue.length > 0 && documentMap.size < MAX_GRAPH_DOCUMENTS) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const currentDocument =
      documentMap.get(current.documentId) ?? (await client.getDocument(current.documentId));
    documentMap.set(currentDocument.id, currentDocument);

    const [directAssociations, reverseAssociations] = await Promise.all([
      client.getDocumentAssociations(currentDocument.id),
      client.getReverseAssociations(currentDocument.id),
    ]);

    for (const association of [...directAssociations, ...reverseAssociations]) {
      associationMap.set(
        `${association.document_id}:${association.related_id}:${association.relationship_type}`,
        association
      );
    }

    if (current.depth >= MAX_GRAPH_DEPTH) {
      continue;
    }

    const neighborIds = collectRelatedDocumentIds(
      currentDocument,
      directAssociations,
      reverseAssociations
    );

    const nextIds = neighborIds.filter(
      (documentId) => !documentMap.has(documentId) && !queued.has(documentId)
    );

    if (nextIds.length === 0) {
      continue;
    }

    const nextDocuments = await Promise.all(
      nextIds
        .slice(0, Math.max(0, MAX_GRAPH_DOCUMENTS - documentMap.size))
        .map((documentId) => client.getDocument(documentId))
    );

    for (const document of nextDocuments) {
      documentMap.set(document.id, document);
      queue.push({ documentId: document.id, depth: current.depth + 1 });
      queued.add(document.id);
    }
  }

  return {
    rootDocument,
    documents: [...documentMap.values()],
    associations: [...associationMap.values()],
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
