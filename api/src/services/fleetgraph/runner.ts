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
import {
  buildFleetGraphRunTraceSummary,
  fleetGraphTraceConfig,
  type FleetGraphRunTraceSummary,
} from './tracing.js';

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
  maxDepthReached: number;
  truncated: boolean;
  depthLimit: number;
  documentLimit: number;
}

export interface FleetGraphPreparedRun extends FleetGraphRunPreview {
  context: FleetGraphFetchContext;
  graph: FleetGraphGraphSnapshot;
  scoringPayload: FleetGraphScoringPayload;
  trace?: FleetGraphRunTraceSummary;
}

export interface FleetGraphPrepareProgressCallbacks {
  onStepCompleted?: (stepId:
    | 'load-trigger-context'
    | 'load-document'
    | 'load-associations'
    | 'resolve-anchor-context'
    | 'resolve-execution-context'
    | 'load-related-documents'
    | 'build-graph') => void;
}

export async function prepareFleetGraphRun(
  client: FleetGraphShipApiClient,
  trigger: FleetGraphTriggerRequest,
  callbacks?: FleetGraphPrepareProgressCallbacks
): Promise<FleetGraphPreparedRun> {
  return tracedPrepareFleetGraphRun(client, trigger, callbacks);
}

const tracedPrepareFleetGraphRun = traceable(
  async function prepareRun(
    client: FleetGraphShipApiClient,
    trigger: FleetGraphTriggerRequest,
    callbacks?: FleetGraphPrepareProgressCallbacks
  ): Promise<FleetGraphPreparedRun> {
    const normalizedTrigger = normalizeFleetGraphTriggerRequest(trigger);
    callbacks?.onStepCompleted?.('load-trigger-context');
    const traversalConfig = resolveFleetGraphTraversalConfig(normalizedTrigger.source);
    const rootDocument = await loadFleetGraphRootDocument(client, normalizedTrigger.documentId);
    callbacks?.onStepCompleted?.('load-document');
    const branchMode = resolveFleetGraphTraversalBranch(rootDocument.document_type);
    const traversal = await expandFleetGraphTraversal(client, rootDocument, traversalConfig, branchMode);
    callbacks?.onStepCompleted?.('load-associations');
    callbacks?.onStepCompleted?.(
      branchMode === 'anchor-first' ? 'resolve-anchor-context' : 'resolve-execution-context'
    );
    callbacks?.onStepCompleted?.('load-related-documents');
    const relatedDocuments = traversal.documents.filter(
      (document) => document.id !== traversal.rootDocument.id
    );
    const directAssociations = traversal.associations.filter(
      (association) => association.document_id === traversal.rootDocument.id
    );
    const reverseAssociations = traversal.associations.filter(
      (association) => association.related_id === traversal.rootDocument.id
    );
    const plan = buildFleetGraphRunPlan(
      traversal.rootDocument.id,
      normalizedTrigger.source,
      traversal.rootDocument.document_type
    );

    const graph = buildFleetGraphSnapshot({
      rootDocument: traversal.rootDocument,
      directAssociations,
      reverseAssociations,
      relatedDocuments,
      expandedDocuments: traversal.documents,
      expandedAssociations: traversal.associations,
      maxDepthReached: traversal.maxDepthReached,
      truncated: traversal.truncated,
      depthLimit: traversalConfig.depthLimit,
      documentLimit: traversalConfig.documentLimit,
    });
    callbacks?.onStepCompleted?.('build-graph');

    return {
      rootDocumentId: traversal.rootDocument.id,
      triggerSource: normalizedTrigger.source,
      nodeIds: plan.nodes.map((node) => node.id),
      context: {
        rootDocument: traversal.rootDocument,
        directAssociations,
        reverseAssociations,
        relatedDocuments,
        expandedDocuments: traversal.documents,
        expandedAssociations: traversal.associations,
        maxDepthReached: traversal.maxDepthReached,
        truncated: traversal.truncated,
        depthLimit: traversalConfig.depthLimit,
        documentLimit: traversalConfig.documentLimit,
      },
      graph,
      scoringPayload: buildFleetGraphScoringPayload(graph),
      trace: buildFleetGraphRunTraceSummary({
        triggerSource: normalizedTrigger.source,
        rootDocumentId: traversal.rootDocument.id,
        nodes: plan.nodes,
        scope: {
          documentCount: graph.nodes.length,
          edgeCount: graph.edges.length,
          maxDepthReached: traversal.maxDepthReached,
          truncated: traversal.truncated,
          depthLimit: traversalConfig.depthLimit,
          documentLimit: traversalConfig.documentLimit,
        },
      }),
    };
  },
  fleetGraphTraceConfig('fleetgraph.run.prepare', {
    processInputs: (inputs) => {
      const [_, trigger] =
        'args' in inputs ? (inputs.args as [FleetGraphShipApiClient, FleetGraphTriggerRequest, FleetGraphPrepareProgressCallbacks | undefined]) : [];

      if (!trigger) {
        return {};
      }

      return {
        workspaceId: trigger.workspaceId,
        documentId: trigger.documentId,
        triggerSource: trigger.source,
        maxGraphDepth: resolveFleetGraphTraversalConfig(trigger.source).depthLimit,
        maxGraphDocuments: resolveFleetGraphTraversalConfig(trigger.source).documentLimit,
      };
    },
    processOutputs: (outputs) => {
      const prepared = 'rootDocumentId' in outputs ? (outputs as FleetGraphPreparedRun) : null;
      if (!prepared) {
        return {};
      }

      const trace = prepared.trace;
      if (!trace) {
        return {
          rootDocumentId: prepared.rootDocumentId,
          triggerSource: prepared.triggerSource,
        };
      }

      return {
        rootDocumentId: prepared.rootDocumentId,
        triggerSource: prepared.triggerSource,
        stepCount: trace.stepCount,
        documentCount: trace.scope.documentCount,
        edgeCount: trace.scope.edgeCount,
        maxDepthReached: trace.scope.maxDepthReached,
        truncated: trace.scope.truncated,
      };
    },
  })
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
const INTERACTIVE_GRAPH_DEPTH = Number(process.env.FLEETGRAPH_INTERACTIVE_GRAPH_DEPTH || 1);
const INTERACTIVE_GRAPH_DOCUMENTS = Number(process.env.FLEETGRAPH_INTERACTIVE_GRAPH_DOCUMENTS || 20);

async function expandFleetGraphTraversal(
  client: FleetGraphShipApiClient,
  rootDocument: FleetGraphDocumentRecord,
  traversalConfig: { depthLimit: number; documentLimit: number },
  branchMode: 'anchor-first' | 'execution-first'
): Promise<{
  rootDocument: FleetGraphDocumentRecord;
  documents: FleetGraphDocumentRecord[];
  associations: FleetGraphAssociationRecord[];
  maxDepthReached: number;
  truncated: boolean;
}> {
  const documentMap = new Map<string, FleetGraphDocumentRecord>();
  const associationMap = new Map<string, FleetGraphAssociationRecord>();
  const queue: Array<{ documentId: string; depth: number }> = [
    { documentId: rootDocument.id, depth: 0 },
  ];
  const queued = new Set<string>([rootDocument.id]);

  if (isFleetGraphReportDocument(rootDocument)) {
    throw new Error('FleetGraph report documents are output artifacts and cannot be reviewed');
  }

  documentMap.set(rootDocument.id, rootDocument);
  let maxDepthReached = 0;
  let truncated = false;

  while (queue.length > 0 && documentMap.size < traversalConfig.documentLimit) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const currentDocument =
      documentMap.get(current.documentId) ?? (await loadFleetGraphDocuments(client, [current.documentId]))[0];
    documentMap.set(currentDocument.id, currentDocument);
    maxDepthReached = Math.max(maxDepthReached, current.depth);

    const { directAssociations, reverseAssociations } = await loadFleetGraphRelationships(
      client,
      currentDocument.id
    );

    for (const association of [...directAssociations, ...reverseAssociations]) {
      associationMap.set(
        `${association.document_id}:${association.related_id}:${association.relationship_type}`,
        association
      );
    }

    if (current.depth >= traversalConfig.depthLimit) {
      continue;
    }

    const neighborIds = collectRelatedDocumentIds(
      currentDocument,
      directAssociations,
      reverseAssociations,
      branchMode,
      current.depth === 0
    );

    const nextIds = neighborIds.filter(
      (documentId) => !documentMap.has(documentId) && !queued.has(documentId)
    );

    if (nextIds.length === 0) {
      continue;
    }

    const nextDocuments = await loadFleetGraphDocuments(
      client,
      nextIds.slice(0, Math.max(0, traversalConfig.documentLimit - documentMap.size))
    );

    if (nextDocuments.length < nextIds.length) {
      truncated = true;
    }

    for (const document of nextDocuments) {
      if (isFleetGraphReportDocument(document)) {
        continue;
      }
      documentMap.set(document.id, document);
      queue.push({ documentId: document.id, depth: current.depth + 1 });
      queued.add(document.id);
    }
  }

  if (queue.length > 0) {
    truncated = true;
  }

  return {
    rootDocument,
    documents: [...documentMap.values()],
    associations: [...associationMap.values()],
    maxDepthReached,
    truncated,
  };
}

function resolveFleetGraphTraversalConfig(
  source: FleetGraphTriggerRequest['source']
): { depthLimit: number; documentLimit: number } {
  if (source === 'nightly_scan') {
    return {
      depthLimit: MAX_GRAPH_DEPTH,
      documentLimit: MAX_GRAPH_DOCUMENTS,
    };
  }

  return {
    depthLimit: INTERACTIVE_GRAPH_DEPTH,
    documentLimit: INTERACTIVE_GRAPH_DOCUMENTS,
  };
}

const normalizeFleetGraphTriggerRequest = traceable(
  function normalizeTriggerRequest(trigger: FleetGraphTriggerRequest): FleetGraphTriggerRequest {
    return trigger;
  },
  fleetGraphTraceConfig('fleetgraph.node.load_trigger_context', {
    processInputs: (inputs) => {
      const [trigger] = 'args' in inputs ? (inputs.args as [FleetGraphTriggerRequest]) : [];
      if (!trigger) {
        return {};
      }

      return {
        workspaceId: trigger.workspaceId,
        documentId: trigger.documentId,
        triggerSource: trigger.source,
      };
    },
    processOutputs: (outputs) => {
      const trigger = 'documentId' in outputs ? (outputs as FleetGraphTriggerRequest) : null;
      if (!trigger) {
        return {};
      }

      return {
        workspaceId: trigger.workspaceId,
        documentId: trigger.documentId,
        triggerSource: trigger.source,
      };
    },
  })
);

const loadFleetGraphRootDocument = traceable(
  async function loadRootDocument(
    client: FleetGraphShipApiClient,
    documentId: string
  ): Promise<FleetGraphDocumentRecord> {
    return client.getDocument(documentId);
  },
  fleetGraphTraceConfig('fleetgraph.node.load_document', {
    processInputs: (inputs) => {
      const [, documentId] =
        'args' in inputs ? (inputs.args as [FleetGraphShipApiClient, string]) : [];

      return documentId ? { documentId } : {};
    },
    processOutputs: (outputs) => {
      const document = 'id' in outputs ? (outputs as FleetGraphDocumentRecord) : null;
      if (!document) {
        return {};
      }

      return {
        documentId: document.id,
        documentType: document.document_type,
        title: document.title,
      };
    },
  })
);

const loadFleetGraphRelationships = traceable(
  async function loadRelationships(
    client: FleetGraphShipApiClient,
    documentId: string
  ): Promise<{
    directAssociations: FleetGraphAssociationRecord[];
    reverseAssociations: FleetGraphAssociationRecord[];
  }> {
    const [directAssociations, reverseAssociations] = await Promise.all([
      client.getDocumentAssociations(documentId),
      client.getReverseAssociations(documentId),
    ]);

    return {
      directAssociations,
      reverseAssociations,
    };
  },
  fleetGraphTraceConfig('fleetgraph.node.load_associations', {
    processInputs: (inputs) => {
      const [, documentId] =
        'args' in inputs ? (inputs.args as [FleetGraphShipApiClient, string]) : [];

      return documentId ? { documentId } : {};
    },
    processOutputs: (outputs) => {
      const relationships =
        'directAssociations' in outputs
          ? (outputs as {
              directAssociations: FleetGraphAssociationRecord[];
              reverseAssociations: FleetGraphAssociationRecord[];
            })
          : null;

      if (!relationships) {
        return {};
      }

      return {
        directAssociationCount: relationships.directAssociations.length,
        reverseAssociationCount: relationships.reverseAssociations.length,
      };
    },
  })
);

const loadFleetGraphDocuments = traceable(
  async function loadDocuments(
    client: FleetGraphShipApiClient,
    documentIds: string[]
  ): Promise<FleetGraphDocumentRecord[]> {
    return Promise.all(documentIds.map((documentId) => client.getDocument(documentId)));
  },
  fleetGraphTraceConfig('fleetgraph.node.load_related_documents', {
    processInputs: (inputs) => {
      const [, documentIds] =
        'args' in inputs ? (inputs.args as [FleetGraphShipApiClient, string[]]) : [];

      return Array.isArray(documentIds)
        ? {
            requestedDocumentCount: documentIds.length,
            requestedDocumentIds: documentIds,
          }
        : {};
    },
    processOutputs: (outputs) => {
      const documents = Array.isArray(outputs) ? (outputs as FleetGraphDocumentRecord[]) : null;
      if (!documents) {
        return {};
      }

      return {
        loadedDocumentCount: documents.length,
        loadedDocumentIds: documents.map((document) => document.id),
      };
    },
  })
);

function isFleetGraphReportDocument(document: FleetGraphDocumentRecord): boolean {
  return document.properties.fleetgraph_report_type === 'quality_report';
}

function collectRelatedDocumentIds(
  rootDocument: FleetGraphDocumentRecord,
  directAssociations: FleetGraphAssociationRecord[],
  reverseAssociations: FleetGraphAssociationRecord[],
  branchMode: 'anchor-first' | 'execution-first',
  isRootLevel: boolean
): string[] {
  const prioritizedIds: string[] = [];
  const fallbackIds: string[] = [];

  const pushUnique = (bucket: string[], id: string | null | undefined) => {
    if (!id || id === rootDocument.id || prioritizedIds.includes(id) || fallbackIds.includes(id)) {
      return;
    }
    bucket.push(id);
  };

  if (rootDocument.parent_id) {
    pushUnique(isRootLevel && branchMode === 'anchor-first' ? prioritizedIds : fallbackIds, rootDocument.parent_id);
  }

  for (const belongsTo of rootDocument.belongs_to ?? []) {
    pushUnique(isRootLevel && branchMode === 'anchor-first' ? prioritizedIds : fallbackIds, belongsTo.id);
  }

  for (const association of directAssociations) {
    const isExecutionNeighbor =
      association.relationship_type === 'project' || association.relationship_type === 'sprint';
    const targetBucket =
      isRootLevel && branchMode === 'execution-first' && isExecutionNeighbor
        ? prioritizedIds
        : fallbackIds;
    pushUnique(targetBucket, association.related_id);
  }

  for (const association of reverseAssociations) {
    const isExecutionNeighbor =
      association.relationship_type === 'project' || association.relationship_type === 'sprint';
    const targetBucket =
      isRootLevel && branchMode === 'execution-first' && isExecutionNeighbor
        ? prioritizedIds
        : fallbackIds;
    pushUnique(targetBucket, association.document_id);
  }

  return [...prioritizedIds, ...fallbackIds];
}

function resolveFleetGraphTraversalBranch(
  documentType: FleetGraphDocumentRecord['document_type']
): 'anchor-first' | 'execution-first' {
  if (['issue', 'standup', 'weekly_plan', 'weekly_retro', 'wiki'].includes(documentType)) {
    return 'anchor-first';
  }

  return 'execution-first';
}
