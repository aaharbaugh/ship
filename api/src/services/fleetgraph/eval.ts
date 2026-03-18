import { analyzeFleetGraphPayload } from './analyze.js';
import type { FleetGraphScoringPayload } from './payload.js';

export interface FleetGraphEvalCase {
  id: string;
  description: string;
  payload: FleetGraphScoringPayload;
  expected: {
    rootStatus: 'green' | 'yellow' | 'red';
    rootTagKeys: string[];
  };
}

export interface FleetGraphEvalResult {
  id: string;
  passed: boolean;
  actualRootStatus: 'green' | 'yellow' | 'red' | null;
  actualRootTagKeys: string[];
  expectedRootStatus: 'green' | 'yellow' | 'red';
  expectedRootTagKeys: string[];
}

export const fleetGraphEvalCases: FleetGraphEvalCase[] = [
  {
    id: 'healthy-project',
    description: 'Well-owned project stays green.',
    payload: {
      rootDocumentId: 'project-1',
      documentCount: 1,
      edgeCount: 0,
      maxDepthReached: 0,
      truncated: false,
      documents: [
        {
          id: 'project-1',
          documentType: 'project',
          title: 'Healthy Project',
          summaryText: 'Healthy Project has a clear owner, scope, and execution context for the team.',
          hasContent: true,
          qualityScore: null,
          qualityStatus: null,
          ownerId: 'owner-1',
          tags: [],
          belongsToIds: [],
        },
      ],
      edges: [],
    },
    expected: {
      rootStatus: 'green',
      rootTagKeys: [],
    },
  },
  {
    id: 'thin-ownerless-wiki',
    description: 'Thin wiki with no owner is yellow and tagged.',
    payload: {
      rootDocumentId: 'wiki-1',
      documentCount: 1,
      edgeCount: 0,
      maxDepthReached: 0,
      truncated: false,
      documents: [
        {
          id: 'wiki-1',
          documentType: 'wiki',
          title: 'Scratchpad',
          summaryText: 'todo',
          hasContent: true,
          qualityScore: null,
          qualityStatus: null,
          ownerId: null,
          tags: [],
          belongsToIds: [],
        },
      ],
      edges: [],
    },
    expected: {
      rootStatus: 'yellow',
      rootTagKeys: ['missing_owner', 'thin_content'],
    },
  },
  {
    id: 'issue-missing-acceptance',
    description: 'Issue missing scope should be red.',
    payload: {
      rootDocumentId: 'issue-1',
      documentCount: 1,
      edgeCount: 0,
      maxDepthReached: 0,
      truncated: false,
      documents: [
        {
          id: 'issue-1',
          documentType: 'issue',
          title: 'Implement export',
          summaryText: 'Build export',
          hasContent: true,
          qualityScore: null,
          qualityStatus: null,
          ownerId: 'owner-1',
          tags: [],
          belongsToIds: [],
        },
      ],
      edges: [],
    },
    expected: {
      rootStatus: 'red',
      rootTagKeys: ['missing_acceptance_criteria', 'thin_content'],
    },
  },
  {
    id: 'empty-standup',
    description: 'Low-signal standup should be yellow.',
    payload: {
      rootDocumentId: 'standup-1',
      documentCount: 1,
      edgeCount: 0,
      maxDepthReached: 0,
      truncated: false,
      documents: [
        {
          id: 'standup-1',
          documentType: 'standup',
          title: 'Daily Standup',
          summaryText: 'done',
          hasContent: true,
          qualityScore: null,
          qualityStatus: null,
          ownerId: 'owner-1',
          tags: [],
          belongsToIds: [],
        },
      ],
      edges: [],
    },
    expected: {
      rootStatus: 'yellow',
      rootTagKeys: ['low_signal_standup', 'thin_content'],
    },
  },
  {
    id: 'linked-project-health',
    description: 'A healthy root can stay green with connected issue context.',
    payload: {
      rootDocumentId: 'project-2',
      documentCount: 2,
      edgeCount: 1,
      maxDepthReached: 1,
      truncated: false,
      documents: [
        {
          id: 'project-2',
          documentType: 'project',
          title: 'Release Train',
          summaryText: 'Release Train has a clear owner, milestones, and linked execution documents.',
          hasContent: true,
          qualityScore: null,
          qualityStatus: null,
          ownerId: 'owner-1',
          tags: [],
          belongsToIds: [],
        },
        {
          id: 'issue-2',
          documentType: 'issue',
          title: 'QA signoff',
          summaryText: 'QA signoff requires browser matrix and deployment acceptance criteria for the release.',
          hasContent: true,
          qualityScore: null,
          qualityStatus: null,
          ownerId: 'owner-2',
          tags: [],
          belongsToIds: ['project-2'],
        },
      ],
      edges: [
        {
          from: 'issue-2',
          to: 'project-2',
          relationshipType: 'project',
          direction: 'outbound',
        },
      ],
    },
    expected: {
      rootStatus: 'green',
      rootTagKeys: [],
    },
  },
];

export function runFleetGraphEvalCases(
  cases: FleetGraphEvalCase[] = fleetGraphEvalCases
): FleetGraphEvalResult[] {
  return cases.map((testCase) => {
    const analysis = analyzeFleetGraphPayload(testCase.payload);
    const rootDocument =
      analysis.documents.find((document) => document.documentId === testCase.payload.rootDocumentId) ??
      analysis.documents[0];
    const actualRootTagKeys = [...(rootDocument?.tags ?? [])]
      .map((tag) => tag.key)
      .sort();
    const expectedRootTagKeys = [...testCase.expected.rootTagKeys].sort();
    const actualRootStatus = rootDocument?.qualityStatus ?? null;
    const passed =
      actualRootStatus === testCase.expected.rootStatus &&
      JSON.stringify(actualRootTagKeys) === JSON.stringify(expectedRootTagKeys);

    return {
      id: testCase.id,
      passed,
      actualRootStatus,
      actualRootTagKeys,
      expectedRootStatus: testCase.expected.rootStatus,
      expectedRootTagKeys,
    };
  });
}
