import type { FleetGraphTriggerSource } from '@ship/shared';

export type FleetGraphNodeId =
  | 'load-trigger-context'
  | 'load-document'
  | 'load-associations'
  | 'load-related-documents'
  | 'build-graph'
  | 'score-graph'
  | 'persist-metadata'
  | 'draft-report';

export interface FleetGraphNodeDefinition {
  id: FleetGraphNodeId;
  description: string;
  dependsOn: FleetGraphNodeId[];
}

export interface FleetGraphRunPlan {
  triggerSource: FleetGraphTriggerSource;
  rootDocumentId: string;
  nodes: FleetGraphNodeDefinition[];
}

const BASE_DOCUMENT_RUN_NODES: FleetGraphNodeDefinition[] = [
  {
    id: 'load-trigger-context',
    description: 'Normalize the trigger payload and select the root document.',
    dependsOn: [],
  },
  {
    id: 'load-document',
    description: 'Fetch the seed document over the Ship REST API.',
    dependsOn: ['load-trigger-context'],
  },
  {
    id: 'load-associations',
    description: 'Fetch direct graph edges for the seed document over the Ship REST API.',
    dependsOn: ['load-document'],
  },
  {
    id: 'load-related-documents',
    description: 'Fetch adjacent documents needed to build the quality graph.',
    dependsOn: ['load-associations'],
  },
  {
    id: 'build-graph',
    description: 'Compress the fetched documents into a graph payload for scoring.',
    dependsOn: ['load-related-documents'],
  },
  {
    id: 'score-graph',
    description: 'Run reasoning over the graph payload and produce structured findings.',
    dependsOn: ['build-graph'],
  },
  {
    id: 'persist-metadata',
    description: 'Write FleetGraph metadata back through Ship REST endpoints only.',
    dependsOn: ['score-graph'],
  },
  {
    id: 'draft-report',
    description: 'Prepare a draft quality report for human review when thresholds are crossed.',
    dependsOn: ['score-graph'],
  },
];

export function buildFleetGraphRunPlan(
  rootDocumentId: string,
  triggerSource: FleetGraphTriggerSource
): FleetGraphRunPlan {
  return {
    triggerSource,
    rootDocumentId,
    nodes: BASE_DOCUMENT_RUN_NODES,
  };
}
