import { analyzeFleetGraphPayload } from './analyze.js';
import {
  deriveFleetGraphExecutedPath,
  deriveFleetGraphNextPath,
  deriveFleetGraphTraceDecision,
} from './tracing.js';
import type { FleetGraphScoringPayload } from './payload.js';

export interface FleetGraphEvalCase {
  id: string;
  useCaseId: string;
  useCaseTitle: string;
  description: string;
  payload: FleetGraphScoringPayload;
  expected: {
    rootStatus: 'green' | 'yellow' | 'red';
    rootTagKeys: string[];
    outcome:
      | 'healthy'
      | 'persist_metadata'
      | 'human_review_required'
      | 'draft_report_recommended';
    executedPath: string[];
    nextPath: string[];
    humanDecisionRequired: boolean;
    proposedAction:
      | 'none'
      | 'persist_metadata'
      | 'review_findings'
      | 'draft_quality_report';
    resultSummary: string;
  };
}

export interface FleetGraphEvalResult {
  id: string;
  useCaseId: string;
  useCaseTitle: string;
  passed: boolean;
  actualRootStatus: 'green' | 'yellow' | 'red' | null;
  actualRootTagKeys: string[];
  actualOutcome:
    | 'healthy'
    | 'persist_metadata'
    | 'human_review_required'
    | 'draft_report_recommended'
    | null;
  actualExecutedPath: string[];
  actualNextPath: string[];
  actualHumanDecisionRequired: boolean | null;
  actualProposedAction:
    | 'none'
    | 'persist_metadata'
    | 'review_findings'
    | 'draft_quality_report'
    | null;
  expectedRootStatus: 'green' | 'yellow' | 'red';
  expectedRootTagKeys: string[];
  expectedOutcome:
    | 'healthy'
      | 'persist_metadata'
      | 'human_review_required'
      | 'draft_report_recommended';
  expectedExecutedPath: string[];
  expectedNextPath: string[];
  expectedHumanDecisionRequired: boolean;
  expectedProposedAction:
    | 'none'
    | 'persist_metadata'
    | 'review_findings'
    | 'draft_quality_report';
  expectedResultSummary: string;
}

export const fleetGraphEvalCases: FleetGraphEvalCase[] = [
  {
    id: 'healthy-project',
    useCaseId: 'uc-healthy-project-review',
    useCaseTitle: 'PM reviews a healthy project quality report',
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
      outcome: 'healthy',
      executedPath: [
        'load-trigger-context',
        'load-document',
        'load-associations',
        'load-related-documents',
        'build-graph',
        'score-graph',
        'decide-action',
      ],
      nextPath: [],
      humanDecisionRequired: false,
      proposedAction: 'none',
      resultSummary: 'FleetGraph confirms the graph is healthy and does not require a human gate.',
    },
  },
  {
    id: 'thin-ownerless-wiki',
    useCaseId: 'uc-thin-document-owner-fix',
    useCaseTitle: 'Owner has a thin or under-specified document',
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
      outcome: 'human_review_required',
      executedPath: [
        'load-trigger-context',
        'load-document',
        'load-associations',
        'load-related-documents',
        'build-graph',
        'score-graph',
        'decide-action',
      ],
      nextPath: ['human-review'],
      humanDecisionRequired: true,
      proposedAction: 'review_findings',
      resultSummary: 'FleetGraph routes the finding to human review instead of silently accepting weak documentation.',
    },
  },
  {
    id: 'issue-missing-acceptance',
    useCaseId: 'uc-issue-not-ready',
    useCaseTitle: 'Engineer starts an issue that is not ready',
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
      outcome: 'draft_report_recommended',
      executedPath: [
        'load-trigger-context',
        'load-document',
        'load-associations',
        'load-related-documents',
        'build-graph',
        'score-graph',
        'decide-action',
      ],
      nextPath: ['human-review', 'draft-report'],
      humanDecisionRequired: true,
      proposedAction: 'draft_quality_report',
      resultSummary: 'FleetGraph identifies an execution blocker and recommends a human-reviewed draft report path.',
    },
  },
  {
    id: 'empty-standup',
    useCaseId: 'uc-low-signal-reporting',
    useCaseTitle: 'Low-signal reporting triggers human review',
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
      outcome: 'human_review_required',
      executedPath: [
        'load-trigger-context',
        'load-document',
        'load-associations',
        'load-related-documents',
        'build-graph',
        'score-graph',
        'decide-action',
      ],
      nextPath: ['human-review'],
      humanDecisionRequired: true,
      proposedAction: 'review_findings',
      resultSummary: 'FleetGraph flags weak reporting and routes the result to a human decision point.',
    },
  },
  {
    id: 'linked-project-health',
    useCaseId: 'uc-linked-context-stays-green',
    useCaseTitle: 'Connected project context remains healthy',
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
      outcome: 'healthy',
      executedPath: [
        'load-trigger-context',
        'load-document',
        'load-associations',
        'load-related-documents',
        'build-graph',
        'score-graph',
        'decide-action',
      ],
      nextPath: [],
      humanDecisionRequired: false,
      proposedAction: 'none',
      resultSummary: 'FleetGraph proves that connected context can still resolve to a healthy outcome.',
    },
  },
  {
    id: 'blocked-project-graph',
    useCaseId: 'uc-blocker-propagation',
    useCaseTitle: 'PM detects blocker propagation across linked work',
    description: 'A blocked project graph should recommend human review and a draft report path.',
    payload: {
      rootDocumentId: 'project-3',
      documentCount: 3,
      edgeCount: 2,
      maxDepthReached: 1,
      truncated: false,
      documents: [
        {
          id: 'project-3',
          documentType: 'project',
          title: 'Migration Track',
          summaryText: 'Migration Track is active but the rollout issue is blocked by an unresolved dependency.',
          hasContent: true,
          qualityScore: null,
          qualityStatus: null,
          ownerId: 'owner-1',
          tags: [],
          belongsToIds: [],
        },
        {
          id: 'issue-3',
          documentType: 'issue',
          title: 'Cutover rollout',
          summaryText: 'Rollout depends on an unresolved dependency and still lacks concrete completion conditions.',
          hasContent: true,
          qualityScore: null,
          qualityStatus: null,
          ownerId: 'owner-2',
          tags: [],
          belongsToIds: ['project-3'],
        },
        {
          id: 'issue-4',
          documentType: 'issue',
          title: 'Dependency cleanup',
          summaryText: 'Cleanup work is blocked and still lacks clear done conditions for the dependency handoff.',
          hasContent: true,
          qualityScore: null,
          qualityStatus: null,
          ownerId: 'owner-3',
          tags: [],
          belongsToIds: ['project-3'],
        },
      ],
      edges: [
        {
          from: 'issue-3',
          to: 'project-3',
          relationshipType: 'project',
          direction: 'outbound',
        },
        {
          from: 'issue-4',
          to: 'issue-3',
          relationshipType: 'blocked_by',
          direction: 'outbound',
        },
      ],
    },
    expected: {
      rootStatus: 'green',
      rootTagKeys: [],
      outcome: 'draft_report_recommended',
      executedPath: [
        'load-trigger-context',
        'load-document',
        'load-associations',
        'load-related-documents',
        'build-graph',
        'score-graph',
        'decide-action',
      ],
      nextPath: ['human-review', 'draft-report'],
      humanDecisionRequired: true,
      proposedAction: 'draft_quality_report',
      resultSummary: 'FleetGraph identifies downstream blocker risk in the connected graph and recommends the human-reviewed report path.',
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
    const decision = deriveFleetGraphTraceDecision(analysis);
    const actualOutcome = decision?.outcome ?? null;
    const actualExecutedPath = deriveFleetGraphExecutedPath('insights', decision);
    const actualNextPath = deriveFleetGraphNextPath('insights', decision);
    const actualHumanDecisionRequired = decision?.humanDecisionRequired ?? null;
    const actualProposedAction = decision?.proposedAction ?? null;
    const passed =
      actualRootStatus === testCase.expected.rootStatus &&
      JSON.stringify(actualRootTagKeys) === JSON.stringify(expectedRootTagKeys) &&
      actualOutcome === testCase.expected.outcome &&
      JSON.stringify(actualExecutedPath) === JSON.stringify(testCase.expected.executedPath) &&
      JSON.stringify(actualNextPath) === JSON.stringify(testCase.expected.nextPath) &&
      actualHumanDecisionRequired === testCase.expected.humanDecisionRequired &&
      actualProposedAction === testCase.expected.proposedAction;

    return {
      id: testCase.id,
      useCaseId: testCase.useCaseId,
      useCaseTitle: testCase.useCaseTitle,
      passed,
      actualRootStatus,
      actualRootTagKeys,
      actualOutcome,
      actualExecutedPath,
      actualNextPath,
      actualHumanDecisionRequired,
      actualProposedAction,
      expectedRootStatus: testCase.expected.rootStatus,
      expectedRootTagKeys,
      expectedOutcome: testCase.expected.outcome,
      expectedExecutedPath: testCase.expected.executedPath,
      expectedNextPath: testCase.expected.nextPath,
      expectedHumanDecisionRequired: testCase.expected.humanDecisionRequired,
      expectedProposedAction: testCase.expected.proposedAction,
      expectedResultSummary: testCase.expected.resultSummary,
    };
  });
}
