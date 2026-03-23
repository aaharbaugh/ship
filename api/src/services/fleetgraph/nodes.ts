import type { FleetGraphTriggerSource } from '@ship/shared';
import type { DocumentType } from '@ship/shared';

export type FleetGraphNodeId =
  | 'load-trigger-context'
  | 'load-document'
  | 'load-associations'
  | 'resolve-anchor-context'
  | 'resolve-execution-context'
  | 'load-related-documents'
  | 'build-graph'
  | 'score-graph'
  | 'decide-action'
  | 'human-review'
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
    id: 'decide-action',
    description: 'Choose the next graph branch based on readiness findings and trigger mode.',
    dependsOn: ['score-graph'],
  },
  {
    id: 'human-review',
    description: 'Pause on a human decision before high-impact follow-up actions continue.',
    dependsOn: ['decide-action'],
  },
  {
    id: 'persist-metadata',
    description: 'Write FleetGraph metadata back through Ship REST endpoints only.',
    dependsOn: ['decide-action'],
  },
  {
    id: 'draft-report',
    description: 'Prepare a draft quality report for human review when thresholds are crossed.',
    dependsOn: ['human-review'],
  },
];

export function buildFleetGraphRunPlan(
  rootDocumentId: string,
  triggerSource: FleetGraphTriggerSource,
  rootDocumentType: DocumentType | string
): FleetGraphRunPlan {
  const branchNode = resolveFleetGraphContextBranch(rootDocumentType);
  const preBuildNodes: FleetGraphNodeDefinition[] = [
    BASE_DOCUMENT_RUN_NODES[0]!,
    BASE_DOCUMENT_RUN_NODES[1]!,
    BASE_DOCUMENT_RUN_NODES[2]!,
    branchNode,
    {
      id: 'load-related-documents',
      description:
        branchNode.id === 'resolve-anchor-context'
          ? 'Climb to the containing project/program context before expanding nearby graph documents.'
          : 'Fan out into child execution documents before expanding nearby graph documents.',
      dependsOn: [branchNode.id],
    },
  ];

  return {
    triggerSource,
    rootDocumentId,
    nodes: [
      ...preBuildNodes,
      ...BASE_DOCUMENT_RUN_NODES.slice(3),
    ],
  };
}

function resolveFleetGraphContextBranch(
  rootDocumentType: DocumentType | string
): FleetGraphNodeDefinition {
  const anchorTypes = new Set(['issue', 'standup', 'weekly_plan', 'weekly_retro', 'wiki']);

  if (anchorTypes.has(rootDocumentType)) {
    return {
      id: 'resolve-anchor-context',
      description: 'Climb upward to the nearest parent project or program before graph expansion.',
      dependsOn: ['load-associations'],
    };
  }

  return {
    id: 'resolve-execution-context',
    description: 'Expand downward into child execution documents before graph expansion.',
    dependsOn: ['load-associations'],
  };
}
