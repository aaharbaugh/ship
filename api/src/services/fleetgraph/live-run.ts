import type { FleetGraphShipApiClient } from './client.js';
import { persistFleetGraphAnalysis } from './persist.js';
import { createFleetGraphQualityReportDraft, updateFleetGraphQualityReportDraft } from './report.js';
import { analyzeFleetGraphForPurpose } from './reasoning.js';
import { prepareFleetGraphRun } from './runner.js';
import {
  deriveFleetGraphExecutedPath,
  deriveFleetGraphNextPath,
  deriveFleetGraphTraceDecision,
  withFleetGraphTraceAnalysis,
  type FleetGraphRunTraceSummary,
} from './tracing.js';

type FleetGraphLiveRunStatus = 'running' | 'completed' | 'failed';
type FleetGraphLiveStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface FleetGraphLiveRunStep {
  id: string;
  description: string;
  status: FleetGraphLiveStepStatus;
  completedAt?: string;
}

export interface FleetGraphLiveRunState {
  runId: string;
  documentId: string;
  workspaceId: string;
  triggerSource: 'manual';
  status: FleetGraphLiveRunStatus;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
  path: string[];
  nextPath: string[];
  currentStepId: string | null;
  trace?: FleetGraphRunTraceSummary;
  steps: FleetGraphLiveRunStep[];
}

const liveRuns = new Map<string, FleetGraphLiveRunState>();
const LIVE_RUN_TTL_MS = 1000 * 60 * 30;

export function startFleetGraphLiveReviewRun(args: {
  client: FleetGraphShipApiClient;
  workspaceId: string;
  documentId: string;
}): FleetGraphLiveRunState {
  pruneExpiredLiveRuns();

  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();
  const steps: FleetGraphLiveRunStep[] = [
    'load-trigger-context',
    'load-document',
    'load-associations',
    'resolve-anchor-context',
    'resolve-execution-context',
    'load-related-documents',
    'build-graph',
    'score-graph',
    'decide-action',
    'persist-metadata',
    'human-review',
    'draft-report',
  ].map((id, index) => ({
    id,
    description: index === 0 ? 'Starting FleetGraph review.' : 'Pending.',
    status: index === 0 ? 'in_progress' : 'pending',
  }));

  const state: FleetGraphLiveRunState = {
    runId,
    documentId: args.documentId,
    workspaceId: args.workspaceId,
    triggerSource: 'manual',
    status: 'running',
    startedAt,
    updatedAt: startedAt,
    completedAt: null,
    error: null,
    path: [],
    nextPath: [],
    currentStepId: 'load-trigger-context',
    steps,
  };

  liveRuns.set(runId, state);
  void executeLiveReviewRun(runId, args.client, args.workspaceId, args.documentId);
  return state;
}

export function getFleetGraphLiveReviewRun(runId: string): FleetGraphLiveRunState | null {
  pruneExpiredLiveRuns();
  return liveRuns.get(runId) ?? null;
}

async function executeLiveReviewRun(
  runId: string,
  client: FleetGraphShipApiClient,
  workspaceId: string,
  documentId: string
) {
  try {
    const prepared = await prepareFleetGraphRun(
      client,
      {
        workspaceId,
        documentId,
        source: 'manual',
      },
      {
        onStepCompleted: (stepId) => markStepCompleted(runId, stepId),
      }
    );

    startStep(runId, 'score-graph', 'Scoring the graph and generating findings.');
    const analysis = await analyzeFleetGraphForPurpose(prepared.scoringPayload, {
      triggerSource: 'manual',
      purpose: 'insights',
    });
    completeStep(runId, 'score-graph');

    startStep(runId, 'decide-action', 'Choosing the next graph branch from the findings.');
    const decision = deriveFleetGraphTraceDecision(analysis);
    completeStep(runId, 'decide-action');

    startStep(runId, 'persist-metadata', 'Writing FleetGraph metadata back to the reviewed documents.');
    await persistFleetGraphAnalysis(client, analysis);
    completeStep(runId, 'persist-metadata');

    const resolvedDecision = decision ?? {
      outcome: 'healthy' as const,
      proposedAction: 'none' as const,
      humanDecisionRequired: false,
      rootStatus: null,
      reason: 'FleetGraph did not surface a follow-up action for this run.',
    };

    let operation: 'insights' | 'draft_report' = 'insights';
    if (resolvedDecision.humanDecisionRequired) {
      startStep(runId, 'human-review', 'Preparing the human review branch for the current findings.');
      completeStep(runId, 'human-review');
    } else {
      markStepSkipped(runId, 'human-review');
      markStepSkipped(runId, 'draft-report');
    }

    if (resolvedDecision.outcome === 'draft_report_recommended') {
      operation = 'draft_report';
      startStep(runId, 'draft-report', 'Creating or updating the FleetGraph draft report artifact.');
      const existingReportId =
        typeof prepared.context.rootDocument.properties.quality_report_id === 'string'
          ? prepared.context.rootDocument.properties.quality_report_id
          : null;

      if (existingReportId) {
        await updateFleetGraphQualityReportDraft(client, existingReportId, prepared, analysis);
      } else {
        const report = await createFleetGraphQualityReportDraft(client, prepared, analysis);
        await client.updateDocumentMetadata(prepared.rootDocumentId, {
          ...(prepared.context.rootDocument.properties ?? {}),
          quality_report_id: report.reportId,
        });
      }
      completeStep(runId, 'draft-report');
    } else {
      markStepSkipped(runId, 'draft-report');
    }

    const trace = prepared.trace
      ? withFleetGraphTraceAnalysis(prepared.trace, analysis, operation)
      : undefined;
    finishRun(runId, {
      trace,
      path: trace?.path ?? deriveFleetGraphExecutedPath(operation, resolvedDecision),
      nextPath: trace?.nextPath ?? deriveFleetGraphNextPath(operation, resolvedDecision),
    });
  } catch (caught) {
    failRun(runId, caught instanceof Error ? caught.message : 'FleetGraph review failed');
  }
}

function startStep(runId: string, stepId: string, description: string) {
  const state = liveRuns.get(runId);
  if (!state) {
    return;
  }

  state.steps = state.steps.map((step) =>
    step.id === stepId
      ? {
          ...step,
          description,
          status: 'in_progress',
        }
      : step
  );
  state.currentStepId = stepId;
  state.updatedAt = new Date().toISOString();
}

function completeStep(runId: string, stepId: string) {
  const state = liveRuns.get(runId);
  if (!state) {
    return;
  }

  const completedAt = new Date().toISOString();
  state.steps = state.steps.map((step) =>
    step.id === stepId
      ? {
          ...step,
          status: 'completed',
          completedAt,
        }
      : step.status === 'in_progress'
        ? { ...step, status: 'pending' }
        : step
  );
  state.path = state.steps
    .filter((step) => step.status === 'completed')
    .map((step) => step.id);
  const nextPending = state.steps.find((step) => step.status === 'pending');
  if (nextPending) {
    state.steps = state.steps.map((step) =>
      step.id === nextPending.id ? { ...step, status: 'in_progress' } : step
    );
    state.currentStepId = nextPending.id;
  } else {
    state.currentStepId = null;
  }
  state.updatedAt = completedAt;
}

function markStepCompleted(runId: string, stepId: string) {
  const descriptions: Record<string, string> = {
    'load-trigger-context': 'Trigger received and root document selected.',
    'load-document': 'Seed document loaded from Ship.',
    'load-associations': 'Direct graph relationships loaded.',
    'resolve-anchor-context': 'Climbed upward to anchor the review in a parent project or program context.',
    'resolve-execution-context': 'Expanded downward into execution documents before broader graph traversal.',
    'load-related-documents': 'Nearby related documents loaded for the local graph.',
    'build-graph': 'Graph payload built and ready for scoring.',
  };
  if (stepId === 'resolve-anchor-context') {
    markStepSkipped(runId, 'resolve-execution-context');
  }
  if (stepId === 'resolve-execution-context') {
    markStepSkipped(runId, 'resolve-anchor-context');
  }
  startStep(runId, stepId, descriptions[stepId] ?? 'Step completed.');
  completeStep(runId, stepId);
}

function markStepSkipped(runId: string, stepId: string) {
  const state = liveRuns.get(runId);
  if (!state) {
    return;
  }

  state.steps = state.steps.map((step) =>
    step.id === stepId
      ? {
          ...step,
          status: 'completed',
          completedAt: new Date().toISOString(),
          description: 'Not needed for this graph branch.',
        }
      : step
  );
  state.updatedAt = new Date().toISOString();
}

function finishRun(
  runId: string,
  result: { trace?: FleetGraphRunTraceSummary; path: string[]; nextPath: string[] }
) {
  const state = liveRuns.get(runId);
  if (!state) {
    return;
  }

  state.status = 'completed';
  state.completedAt = new Date().toISOString();
  state.updatedAt = state.completedAt;
  state.currentStepId = null;
  state.trace = result.trace;
  state.path = result.path;
  state.nextPath = result.nextPath;
}

function failRun(runId: string, message: string) {
  const state = liveRuns.get(runId);
  if (!state) {
    return;
  }

  const failedStepId = state.currentStepId;

  state.status = 'failed';
  state.error = message;
  state.updatedAt = new Date().toISOString();
  state.completedAt = state.updatedAt;
  state.currentStepId = null;
  state.steps = state.steps.map((step) =>
    step.id === failedStepId ? { ...step, status: 'failed', description: message } : step
  );
}

function pruneExpiredLiveRuns() {
  const now = Date.now();
  for (const [runId, state] of liveRuns.entries()) {
    const completedAt = state.completedAt ? new Date(state.completedAt).getTime() : null;
    if (completedAt && now - completedAt > LIVE_RUN_TTL_MS) {
      liveRuns.delete(runId);
    }
  }
}
