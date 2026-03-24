import type {
  FleetGraphAssociationRecord,
  FleetGraphDocumentRecord,
} from './client.js';
import type { FleetGraphFetchContext } from './runner.js';
import { traceable } from 'langsmith/traceable';
import { fleetGraphTraceConfig } from './tracing.js';

export interface FleetGraphNodeSnapshot {
  id: string;
  documentType: string;
  title: string;
  parentId: string | null;
  belongsTo: Array<{ id: string; type: string; title?: string; color?: string }>;
  content: Record<string, unknown> | null;
  properties: Record<string, unknown>;
}

export interface FleetGraphEdgeSnapshot {
  from: string;
  to: string;
  relationshipType: string;
  direction: 'outbound' | 'inbound' | 'parent' | 'belongs_to';
}

export interface FleetGraphGraphSnapshot {
  rootDocumentId: string;
  nodes: FleetGraphNodeSnapshot[];
  edges: FleetGraphEdgeSnapshot[];
  metadata: {
    maxDepthReached: number;
    truncated: boolean;
    depthLimit: number;
    documentLimit: number;
  };
}

export function buildFleetGraphSnapshot(context: FleetGraphFetchContext): FleetGraphGraphSnapshot {
  return tracedBuildFleetGraphSnapshot(context);
}

const tracedBuildFleetGraphSnapshot = traceable(
  function buildSnapshot(context: FleetGraphFetchContext): FleetGraphGraphSnapshot {
    const documentMap = new Map<string, FleetGraphDocumentRecord>();

    for (const document of context.expandedDocuments) {
      documentMap.set(document.id, document);
    }

    documentMap.set(context.rootDocument.id, context.rootDocument);

    const edges: FleetGraphEdgeSnapshot[] = [
      ...[...documentMap.values()].flatMap((document) => buildParentEdge(document)),
      ...[...documentMap.values()].flatMap((document) => buildBelongsToEdges(document)),
      ...buildAssociationEdges(context.expandedAssociations),
    ];

    return {
      rootDocumentId: context.rootDocument.id,
      nodes: [...documentMap.values()].map((document) => ({
        id: document.id,
        documentType: document.document_type,
        title: document.title,
        parentId: document.parent_id,
        belongsTo: document.belongs_to ?? [],
        content: document.content ?? null,
        properties: document.properties,
      })),
      edges: dedupeEdges(edges),
      metadata: {
        maxDepthReached: context.maxDepthReached,
        truncated: context.truncated,
        depthLimit: context.depthLimit,
        documentLimit: context.documentLimit,
      },
    };
  },
  fleetGraphTraceConfig('fleetgraph.node.build_graph', {
    processInputs: (inputs) => {
      const [context] = 'args' in inputs ? (inputs.args as [FleetGraphFetchContext]) : [];
      if (!context) {
        return {};
      }

      return {
        rootDocumentId: context.rootDocument.id,
        expandedDocumentCount: context.expandedDocuments.length,
        expandedAssociationCount: context.expandedAssociations.length,
        maxDepthReached: context.maxDepthReached,
        truncated: context.truncated,
      };
    },
    processOutputs: (outputs) => {
      const graph = 'rootDocumentId' in outputs ? (outputs as FleetGraphGraphSnapshot) : null;
      if (!graph) {
        return {};
      }

      return {
        rootDocumentId: graph.rootDocumentId,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        maxDepthReached: graph.metadata.maxDepthReached,
        truncated: graph.metadata.truncated,
      };
    },
  })
);

function buildParentEdge(document: FleetGraphDocumentRecord): FleetGraphEdgeSnapshot[] {
  if (!document.parent_id) {
    return [];
  }

  return [
    {
      from: document.id,
      to: document.parent_id,
      relationshipType: 'parent',
      direction: 'parent',
    },
  ];
}

function buildBelongsToEdges(document: FleetGraphDocumentRecord): FleetGraphEdgeSnapshot[] {
  return (document.belongs_to ?? []).map((association) => ({
    from: document.id,
    to: association.id,
    relationshipType: association.type,
    direction: 'belongs_to' as const,
  }));
}

function buildAssociationEdges(
  associations: FleetGraphAssociationRecord[]
): FleetGraphEdgeSnapshot[] {
  return associations.map((association) => ({
    from: association.document_id,
    to: association.related_id,
    relationshipType: association.relationship_type,
    direction: 'outbound',
  }));
}

function dedupeEdges(edges: FleetGraphEdgeSnapshot[]): FleetGraphEdgeSnapshot[] {
  const seen = new Set<string>();
  const deduped: FleetGraphEdgeSnapshot[] = [];

  for (const edge of edges) {
    const key = `${edge.from}:${edge.to}:${edge.relationshipType}:${edge.direction}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(edge);
  }

  return deduped;
}
