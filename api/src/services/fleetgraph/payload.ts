import { extractText, hasContent } from '../../utils/document-content.js';
import type { FleetGraphGraphSnapshot, FleetGraphNodeSnapshot } from './graph.js';
import { traceable } from 'langsmith/traceable';
import { fleetGraphTraceConfig } from './tracing.js';

export interface FleetGraphScoringDocument {
  id: string;
  documentType: string;
  title: string;
  summaryText: string;
  hasContent: boolean;
  qualityScore: number | null;
  qualityStatus: string | null;
  ownerId: string | null;
  tags: string[];
  belongsToIds: string[];
}

export interface FleetGraphScoringEdge {
  from: string;
  to: string;
  relationshipType: string;
  direction: string;
}

export interface FleetGraphScoringPayload {
  rootDocumentId: string;
  documentCount: number;
  edgeCount: number;
  maxDepthReached: number;
  truncated: boolean;
  documents: FleetGraphScoringDocument[];
  edges: FleetGraphScoringEdge[];
}

export function buildFleetGraphScoringPayload(
  graph: FleetGraphGraphSnapshot
): FleetGraphScoringPayload {
  return tracedBuildFleetGraphScoringPayload(graph);
}

const tracedBuildFleetGraphScoringPayload = traceable(
  function buildPayload(graph: FleetGraphGraphSnapshot): FleetGraphScoringPayload {
  return {
    rootDocumentId: graph.rootDocumentId,
    documentCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    maxDepthReached: graph.metadata.maxDepthReached,
    truncated: graph.metadata.truncated,
    documents: graph.nodes.map(toScoringDocument),
    edges: graph.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      relationshipType: edge.relationshipType,
      direction: edge.direction,
    })),
  };
  },
  fleetGraphTraceConfig('fleetgraph.subprocess.build_scoring_payload', {
    processInputs: (inputs) => {
      const [graph] = 'args' in inputs ? (inputs.args as [FleetGraphGraphSnapshot]) : [];
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
    processOutputs: (outputs) => {
      const payload = 'rootDocumentId' in outputs ? (outputs as FleetGraphScoringPayload) : null;
      if (!payload) {
        return {};
      }

      return {
        rootDocumentId: payload.rootDocumentId,
        documentCount: payload.documentCount,
        edgeCount: payload.edgeCount,
        maxDepthReached: payload.maxDepthReached,
        truncated: payload.truncated,
      };
    },
  })
);

function toScoringDocument(node: FleetGraphNodeSnapshot): FleetGraphScoringDocument {
  const content = node.content ?? null;
  const summaryText = extractSummaryText(content, node.properties);

  return {
    id: node.id,
    documentType: node.documentType,
    title: node.title,
    summaryText,
    hasContent: content ? hasContent(content) : summaryText.length > 0,
    qualityScore: typeof node.properties.quality_score === 'number' ? node.properties.quality_score : null,
    qualityStatus: typeof node.properties.quality_status === 'string' ? node.properties.quality_status : null,
    ownerId: extractOwnerId(node.properties),
    tags: extractTagLabels(node.properties.quality_tags),
    belongsToIds: node.belongsTo.map((association) => association.id),
  };
}

function extractSummaryText(
  content: Record<string, unknown> | null,
  properties: Record<string, unknown>
): string {
  if (content) {
    const text = extractText(content).trim();
    if (text.length > 0) {
      return text.slice(0, 1500);
    }
  }

  if (typeof properties.quality_summary === 'string' && properties.quality_summary.trim().length > 0) {
    return properties.quality_summary.trim().slice(0, 1500);
  }

  return '';
}

function extractOwnerId(properties: Record<string, unknown>): string | null {
  if (typeof properties.owner_id === 'string') {
    return properties.owner_id;
  }

  if (typeof properties.maintainer_id === 'string') {
    return properties.maintainer_id;
  }

  if (typeof properties.assignee_id === 'string') {
    return properties.assignee_id;
  }

  if (Array.isArray(properties.assignee_ids) && typeof properties.assignee_ids[0] === 'string') {
    return properties.assignee_ids[0];
  }

  if (typeof properties.author_id === 'string') {
    return properties.author_id;
  }

  return null;
}

function extractTagLabels(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) {
    return [];
  }

  return rawTags.flatMap((tag) => {
    if (!tag || typeof tag !== 'object') {
      return [];
    }

    const label = (tag as { label?: unknown }).label;
    return typeof label === 'string' ? [label] : [];
  });
}
