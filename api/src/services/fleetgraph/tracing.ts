import type { TraceableConfig } from 'langsmith/traceable';
import type { FleetGraphAnalysis } from './analyze.js';
import type { FleetGraphNodeDefinition } from './nodes.js';

const DEFAULT_PROJECT = process.env.LANGSMITH_PROJECT || 'fleetgraph-dev';
let hasLoggedFleetGraphTracingStatus = false;

export interface FleetGraphRunTraceStep {
  id: string;
  description: string;
  dependsOn: string[];
  status: 'completed';
}

export interface FleetGraphRunTraceSummary {
  triggerSource: string;
  rootDocumentId: string;
  stepCount: number;
  path: string[];
  plannedPath: string[];
  nextPath: string[];
  scope: {
    documentCount: number;
    edgeCount: number;
    maxDepthReached: number;
    truncated: boolean;
    depthLimit: number;
    documentLimit: number;
  };
  steps: FleetGraphRunTraceStep[];
  decision?: {
    outcome:
      | 'healthy'
      | 'persist_metadata'
      | 'human_review_required'
      | 'draft_report_recommended';
    proposedAction:
      | 'none'
      | 'persist_metadata'
      | 'review_findings'
      | 'draft_quality_report';
    humanDecisionRequired: boolean;
    rootStatus: 'green' | 'yellow' | 'red' | null;
    reason: string;
  };
  analysis?: {
    generatedAt: string;
    mode: FleetGraphAnalysis['mode'];
    model: string | null;
    documentCount: number;
    suggestionCount: number;
    statuses: {
      green: number;
      yellow: number;
      red: number;
    };
  };
}

export function fleetGraphTraceConfig<Func extends (...args: any[]) => any>(
  name: string,
  extra?: Partial<TraceableConfig<Func>>
): TraceableConfig<Func> {
  return {
    name,
    project_name: DEFAULT_PROJECT,
    tags: ['fleetgraph'],
    ...extra,
  };
}

export function fleetGraphTraceMetadata(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  return {
    component: 'fleetgraph',
    ...Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => value !== undefined)
    ),
  };
}

export function isFleetGraphLangSmithEnabled(): boolean {
  const tracingFlag =
    process.env.LANGSMITH_TRACING ??
    process.env.LANGCHAIN_TRACING_V2;

  return Boolean(
    process.env.LANGSMITH_API_KEY &&
      tracingFlag &&
      tracingFlag !== 'false' &&
      tracingFlag !== '0'
  );
}

export function logFleetGraphTracingStatus(): void {
  if (hasLoggedFleetGraphTracingStatus) {
    return;
  }

  hasLoggedFleetGraphTracingStatus = true;
  console.info('[FleetGraph] LangSmith tracing', {
    enabled: isFleetGraphLangSmithEnabled(),
    project: DEFAULT_PROJECT,
    hasApiKey: Boolean(process.env.LANGSMITH_API_KEY),
    tracingFlag:
      process.env.LANGSMITH_TRACING ??
      process.env.LANGCHAIN_TRACING_V2 ??
      null,
  });
}

export function buildFleetGraphRunTraceSummary(args: {
  triggerSource: string;
  rootDocumentId: string;
  nodes: FleetGraphNodeDefinition[];
  scope: FleetGraphRunTraceSummary['scope'];
  analysis?: FleetGraphAnalysis;
}): FleetGraphRunTraceSummary {
  const analysis = args.analysis
    ? {
        generatedAt: args.analysis.generatedAt,
        mode: args.analysis.mode,
        model: args.analysis.model,
        documentCount: args.analysis.documents.length,
        suggestionCount: args.analysis.remediationSuggestions.length,
        statuses: {
          green: args.analysis.documents.filter((document) => document.qualityStatus === 'green').length,
          yellow: args.analysis.documents.filter((document) => document.qualityStatus === 'yellow').length,
          red: args.analysis.documents.filter((document) => document.qualityStatus === 'red').length,
        },
      }
    : undefined;

  return {
    triggerSource: args.triggerSource,
    rootDocumentId: args.rootDocumentId,
    stepCount: args.nodes.length,
    path: args.nodes
      .map((node) => node.id)
      .filter((id) =>
        [
          'load-trigger-context',
          'load-document',
          'load-associations',
          'resolve-anchor-context',
          'resolve-execution-context',
          'load-related-documents',
          'build-graph',
        ].includes(id)
      ),
    plannedPath: args.nodes.map((node) => node.id),
    nextPath: [],
    scope: args.scope,
    steps: args.nodes.map((node) => ({
      id: node.id,
      description: node.description,
      dependsOn: node.dependsOn,
      status: 'completed',
    })),
    analysis,
  };
}

export function withFleetGraphTraceAnalysis(
  trace: FleetGraphRunTraceSummary,
  analysis: FleetGraphAnalysis,
  operation: 'insights' | 'chat' | 'persist' | 'execute_trigger' | 'draft_report' = 'insights'
): FleetGraphRunTraceSummary {
  const next = buildFleetGraphRunTraceSummary({
    triggerSource: trace.triggerSource,
    rootDocumentId: trace.rootDocumentId,
    nodes: trace.steps.map((step) => ({
      id: step.id as FleetGraphNodeDefinition['id'],
      description: step.description,
      dependsOn: step.dependsOn as FleetGraphNodeDefinition['dependsOn'],
    })),
    scope: trace.scope,
    analysis,
  });

  const decision = deriveFleetGraphTraceDecision(analysis);

  return {
    ...next,
    path: deriveFleetGraphExecutedPath(
      operation,
      decision,
      resolveEarlyBranchNode(next.steps.map((step) => step.id))
    ),
    nextPath: deriveFleetGraphNextPath(operation, decision),
    decision,
  };
}

export function deriveFleetGraphTraceDecision(
  analysis: FleetGraphAnalysis
): FleetGraphRunTraceSummary['decision'] {
  const rootDocument =
    analysis.documents.find((document) => document.documentId === analysis.rootDocumentId) ??
    analysis.documents[0] ??
    null;
  const redCount = analysis.documents.filter((document) => document.qualityStatus === 'red').length;
  const yellowCount = analysis.documents.filter((document) => document.qualityStatus === 'yellow').length;
  const rootStatus = rootDocument?.qualityStatus ?? null;

  if (redCount === 0 && yellowCount === 0) {
    return {
      outcome: 'healthy',
      proposedAction: 'none',
      humanDecisionRequired: false,
      rootStatus,
      reason: 'No blocking or warning-level findings were detected in the analyzed graph.',
    };
  }

  if (rootStatus === 'red' || redCount > 0) {
    return {
      outcome: 'draft_report_recommended',
      proposedAction: 'draft_quality_report',
      humanDecisionRequired: true,
      rootStatus,
      reason: 'Red findings were detected, so FleetGraph should hand the result to a human review flow and recommend a draft report.',
    };
  }

  return {
    outcome: 'human_review_required',
    proposedAction: 'review_findings',
    humanDecisionRequired: true,
    rootStatus,
    reason: 'The graph is not fully healthy, so FleetGraph should preserve the findings and route them to a human decision point.',
  };
}

export function deriveFleetGraphExecutedPath(
  operation: 'insights' | 'chat' | 'persist' | 'execute_trigger' | 'draft_report',
  decision: FleetGraphRunTraceSummary['decision'],
  branchNode?: 'resolve-anchor-context' | 'resolve-execution-context'
): string[] {
  const base = [
    'load-trigger-context',
    'load-document',
    'load-associations',
    ...(branchNode ? [branchNode] : []),
    'load-related-documents',
    'build-graph',
    'score-graph',
    'decide-action',
  ];

  if (!decision) {
    return base;
  }

  if (operation === 'persist' || operation === 'execute_trigger') {
    return [...base, 'persist-metadata'];
  }

  if (operation === 'draft_report') {
    return [...base, 'human-review', 'draft-report'];
  }

  return base;
}

export function deriveFleetGraphNextPath(
  operation: 'insights' | 'chat' | 'persist' | 'execute_trigger' | 'draft_report',
  decision: FleetGraphRunTraceSummary['decision']
): string[] {
  if (!decision) {
    return [];
  }

  if (operation === 'draft_report') {
    return [];
  }

  if (decision.outcome === 'draft_report_recommended') {
    return ['human-review', 'draft-report'];
  }

  if (decision.outcome === 'human_review_required') {
    return ['human-review'];
  }

  return [];
}

function resolveEarlyBranchNode(
  stepIds: string[]
): 'resolve-anchor-context' | 'resolve-execution-context' | undefined {
  if (stepIds.includes('resolve-anchor-context')) {
    return 'resolve-anchor-context';
  }

  if (stepIds.includes('resolve-execution-context')) {
    return 'resolve-execution-context';
  }

  return undefined;
}
