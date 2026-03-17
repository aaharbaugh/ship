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
}

export function buildFleetGraphSnapshot(context: FleetGraphFetchContext): FleetGraphGraphSnapshot {
  return tracedBuildFleetGraphSnapshot(context);
}

const tracedBuildFleetGraphSnapshot = traceable(
  function buildSnapshot(context: FleetGraphFetchContext): FleetGraphGraphSnapshot {
  const documentMap = new Map<string, FleetGraphDocumentRecord>();
  documentMap.set(context.rootDocument.id, context.rootDocument);

  for (const document of context.relatedDocuments) {
    documentMap.set(document.id, document);
  }

  const edges: FleetGraphEdgeSnapshot[] = [
    ...buildParentEdge(context.rootDocument),
    ...buildBelongsToEdges(context.rootDocument),
    ...buildAssociationEdges(context.directAssociations, 'outbound'),
    ...buildAssociationEdges(context.reverseAssociations, 'inbound'),
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
  };
  },
  fleetGraphTraceConfig('fleetgraph.build_graph')
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
  associations: FleetGraphAssociationRecord[],
  direction: 'outbound' | 'inbound'
): FleetGraphEdgeSnapshot[] {
  return associations.map((association) => ({
    from: direction === 'outbound' ? association.document_id : association.document_id,
    to: direction === 'outbound' ? association.related_id : association.related_id,
    relationshipType: association.relationship_type,
    direction,
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
