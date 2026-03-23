import OpenAI from 'openai';
import { wrapOpenAI } from 'langsmith/wrappers/openai';
import { traceable } from 'langsmith/traceable';
import { z } from 'zod';
import type {
  FleetGraphAlertTag,
  FleetGraphDocumentMetadata,
  FleetGraphRemediationSuggestion,
  FleetGraphTriggerSource,
} from '@ship/shared';
import {
  analyzeFleetGraphPayload,
  type FleetGraphAnalysis,
} from './analyze.js';
import type { FleetGraphScoringPayload } from './payload.js';
import {
  fleetGraphTraceConfig,
  fleetGraphTraceMetadata,
} from './tracing.js';

interface FleetGraphReasoningDocumentResult {
  documentId: string;
  qualityScore?: number;
  qualityStatus?: 'green' | 'yellow' | 'red';
  confidence?: 'low' | 'medium' | 'high';
  summary?: string;
  mainIssues?: string[];
  tags?: FleetGraphAlertTag[];
  suggestions?: FleetGraphRemediationSuggestion[];
}

interface FleetGraphReasoningResponse {
  executiveSummary?: string;
  documents?: FleetGraphReasoningDocumentResult[];
  remediationSuggestions?: FleetGraphRemediationSuggestion[];
}

interface FleetGraphCompactReasoningDocumentInput {
  documentId: string;
  documentType: string;
  title: string;
  text: string;
  currentStatus: 'green' | 'yellow' | 'red';
  currentScore: number;
  deterministicTagKeys: string[];
}

interface FleetGraphCompactReasoningInput {
  rootDocumentId: string;
  documentCount: number;
  maxDepthReached: number;
  truncated: boolean;
  documents: FleetGraphCompactReasoningDocumentInput[];
}

const reasoningTagSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  severity: z.enum(['high', 'medium', 'low']),
  source: z.string().optional().nullable(),
});

const reasoningSuggestionSchema = z.object({
  title: z.string().min(1),
  priority: z.enum(['high', 'medium', 'low']),
  rationale: z.string().min(1),
  document_id: z.string().optional().nullable(),
});

const reasoningDocumentSchema = z.object({
  documentId: z.string().min(1),
  assessment: z.object({
    qualityStatus: z.enum(['green', 'yellow', 'red']).optional(),
    qualityScore: z.number().min(0).max(1).optional(),
    confidence: z.enum(['low', 'medium', 'high']).optional(),
  }).optional(),
  analysis: z.object({
    summary: z.string().min(1).optional(),
    mainIssues: z.array(z.string().min(1)).max(5).optional(),
  }).optional(),
  tags: z.array(reasoningTagSchema).max(6).optional(),
  suggestions: z.array(reasoningSuggestionSchema).max(3).optional(),
});

const reasoningResponseSchema = z.object({
  executiveSummary: z.string().min(1).optional(),
  documents: z.array(reasoningDocumentSchema).max(40).optional(),
  remediationSuggestions: z.array(reasoningSuggestionSchema).max(5).optional(),
});

const DEFAULT_MODEL = process.env.FLEETGRAPH_OPENAI_MODEL || 'gpt-4o';

export type FleetGraphAnalysisPurpose =
  | 'insights'
  | 'chat'
  | 'persist'
  | 'draft_report'
  | 'execute_trigger'
  | 'nightly_scan';

export async function analyzeFleetGraphWithReasoning(
  payload: FleetGraphScoringPayload
): Promise<FleetGraphAnalysis> {
  const deterministic = analyzeFleetGraphPayload(payload);
  return tracedAnalyzeFleetGraphWithReasoning(payload, deterministic);
}

export async function analyzeFleetGraphForPurpose(
  payload: FleetGraphScoringPayload,
  options: {
    triggerSource: FleetGraphTriggerSource;
    purpose: FleetGraphAnalysisPurpose;
  }
): Promise<FleetGraphAnalysis> {
  const deterministic = analyzeFleetGraphPayload(payload);
  const strategy = resolveFleetGraphAnalysisStrategy(options);

  if (strategy === 'deterministic') {
    return deterministic;
  }

  return tracedAnalyzeFleetGraphWithReasoning(payload, deterministic);
}

const tracedAnalyzeFleetGraphWithReasoning = traceable(
  async function analyzeWithReasoning(
    payload: FleetGraphScoringPayload,
    deterministic: FleetGraphAnalysis
  ): Promise<FleetGraphAnalysis> {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return deterministic;
    }

    try {
      const client = wrapOpenAI(
        new OpenAI({ apiKey }),
        {
          name: 'fleetgraph.subprocess.score_graph.openai',
          tags: ['fleetgraph', 'openai'],
          metadata: fleetGraphTraceMetadata({
            rootDocumentId: payload.rootDocumentId,
          }),
        }
      );
      const response = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are FleetGraph, a product manager reviewing document readiness for execution. Return strict JSON only. No markdown. No prose outside JSON. Your job is to assess whether each document is usable by a PM, engineer, or teammate to take the next step. Write like a PM doing a readiness review: say what is missing, say why that blocks execution, and say what should be added next. Keep it specific, direct, and short. Use only the provided text and deterministic hints. Do not invent scope, owners, requirements, or timelines that are not present. Do not add tags unless the document text or deterministic hints clearly support them. Do not mention missing owner unless owner information is actually present in the input schema and is missing there. Preserve deterministic findings unless the text clearly justifies a different conclusion. A strong analysis sounds like: "Not ready to execute because the task has no implementation detail or acceptance criteria." "This reads like a placeholder, not a workable issue." "The review has useful retrospective notes, but it does not assign follow-up actions." A weak analysis sounds like: "The document could use more detail." "There may be some missing information." Scoring guidance: green means clear enough to execute now, yellow means partially usable but needs a few specific fixes, red means not execution-ready. If text is obviously placeholder, junk, tautological, or only repeats deterministic findings, treat it as not execution-ready. Missing acceptance criteria should be called out as an execution blocker for issues and tasks. Missing implementation detail should be called out when the document does not describe what will be done. For sprint, program, and project docs, call out lack of goals, scope, or decision-making context. For reviews and retros, distinguish between observations and follow-up actions. Suggestions must be concrete edits, not generic advice. Prefer verbs like define, add, clarify, specify, list, split, attach. Avoid repeating the same suggestion wording across every document unless truly necessary.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              task:
                'Review the provided document text for execution readiness. Return JSON with { executiveSummary, documents, remediationSuggestions }. executiveSummary should be a concise PM-level read on the whole scanned graph: what is going wrong overall, why it matters, and what the team should do next. For each document, decide whether a PM would consider it ready to act on. Use PM-style language: what is missing, why it blocks execution, and what should be added next. Use { documentId, assessment, analysis, tags, suggestions }. assessment may include qualityStatus, qualityScore, confidence. analysis may include summary and mainIssues. Do not invent details. Do not add owner-related findings unless owner data is explicitly part of the input. Add tags only when the text or deterministic hints clearly support them. Add per-document suggestions and up to 5 global remediationSuggestions focused on the highest-leverage recurring fixes across the set.',
              documents: buildCompactReasoningInput(payload, deterministic),
            }),
          },
        ],
      }, {
        langsmithExtra: {
          name: 'fleetgraph.subprocess.score_graph.llm_completion',
          tags: ['fleetgraph', 'reasoning'],
          metadata: buildReasoningTraceMetadata(payload, deterministic),
        },
      });

      const message = response.choices[0]?.message?.content;
      if (!message) {
        return deterministic;
      }

      const parsed = parseReasoningResponse(message);
      return mergeReasoningIntoAnalysis(deterministic, parsed, DEFAULT_MODEL);
    } catch (error) {
      console.warn('[FleetGraph] Reasoning fallback to deterministic analysis', {
        rootDocumentId: payload.rootDocumentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return deterministic;
    }
  },
  fleetGraphTraceConfig('fleetgraph.node.score_graph', {
    getInvocationParams: (payload) => ({
      ls_provider: 'openai',
      ls_model_name: DEFAULT_MODEL,
      ls_model_type: 'chat',
      ls_stop: [],
      ls_temperature: 0,
    }),
    processInputs: (inputs) => {
      const [payload, deterministic] =
        'args' in inputs ? inputs.args as [FleetGraphScoringPayload, FleetGraphAnalysis] : [];

      if (!payload || !deterministic) {
        return {};
      }

      const compact = buildCompactReasoningInput(payload, deterministic);

      return {
        rootDocumentId: payload.rootDocumentId,
        documentCount: payload.documentCount,
        maxDepthReached: payload.maxDepthReached,
        truncated: payload.truncated,
        reasoningDocumentCount: compact.documents.length,
        emptyTextDocuments: compact.documents.filter((document) => document.text.length === 0).length,
        deterministicDocumentCount: deterministic.documents.length,
        deterministicSuggestionCount: deterministic.remediationSuggestions.length,
      };
    },
    processOutputs: (outputs) => {
      const analysis = 'mode' in outputs ? outputs as FleetGraphAnalysis : null;
      if (!analysis) {
        return {};
      }

      return {
        mode: analysis.mode,
        model: analysis.model,
        documents: analysis.documents.length,
        suggestions: analysis.remediationSuggestions.length,
      };
    },
  })
);

function resolveFleetGraphAnalysisStrategy(options: {
  triggerSource: FleetGraphTriggerSource;
  purpose: FleetGraphAnalysisPurpose;
}): 'deterministic' | 'reasoning' {
  if (options.purpose === 'draft_report' || options.purpose === 'nightly_scan') {
    return 'reasoning';
  }

  if (options.purpose === 'execute_trigger') {
    return options.triggerSource === 'nightly_scan' ? 'reasoning' : 'deterministic';
  }

  return 'deterministic';
}

function buildReasoningTraceMetadata(
  payload: FleetGraphScoringPayload,
  deterministic: FleetGraphAnalysis
): Record<string, unknown> {
  const compact = buildCompactReasoningInput(payload, deterministic);
  return fleetGraphTraceMetadata({
    rootDocumentId: payload.rootDocumentId,
    documentCount: payload.documentCount,
    edgeCount: payload.edgeCount,
    maxDepthReached: payload.maxDepthReached,
    truncated: payload.truncated,
    reasoningDocumentCount: compact.documents.length,
    deterministicRedDocuments: deterministic.documents.filter(
      (document) => document.qualityStatus === 'red'
    ).length,
    deterministicYellowDocuments: deterministic.documents.filter(
      (document) => document.qualityStatus === 'yellow'
    ).length,
  });
}

function buildCompactReasoningInput(
  payload: FleetGraphScoringPayload,
  deterministic: FleetGraphAnalysis
): FleetGraphCompactReasoningInput {
  const deterministicById = new Map(
    deterministic.documents.map((document) => [document.documentId, document])
  );

  return {
    rootDocumentId: payload.rootDocumentId,
    documentCount: payload.documentCount,
    maxDepthReached: payload.maxDepthReached,
    truncated: payload.truncated,
    documents: payload.documents.map((document) => {
      const deterministicDocument = deterministicById.get(document.id);

      return {
        documentId: document.id,
        documentType: document.documentType,
        title: document.title,
        text: document.summaryText.slice(0, 1200),
        currentStatus: deterministicDocument?.qualityStatus ?? 'yellow',
        currentScore: deterministicDocument?.qualityScore ?? 0.5,
        deterministicTagKeys: (deterministicDocument?.tags ?? []).map((tag) => tag.key),
      };
    }),
  };
}

export function mergeReasoningIntoAnalysis(
  deterministic: FleetGraphAnalysis,
  reasoning: FleetGraphReasoningResponse,
  model: string
): FleetGraphAnalysis {
  const reasoningById = new Map(
    (reasoning.documents ?? []).map((document) => [document.documentId, document])
  );
  const documents = deterministic.documents.map((document) => {
    const override = reasoningById.get(document.documentId);
    if (!override) {
      return document;
    }

    const tags = mergeTags(document.tags, override.tags ?? []);
    const qualityScore =
      typeof override.qualityScore === 'number'
        ? Number(Math.max(0.05, Math.min(1, Math.min(document.qualityScore, override.qualityScore))).toFixed(2))
        : document.qualityScore;
    const qualityStatus = worsenStatus(
      document.qualityStatus,
      override.qualityStatus,
      tags
    );
    const summary = buildMergedSummary(document.summary, override.summary, override.mainIssues);

    return {
      ...document,
      qualityScore,
      qualityStatus,
      summary,
      tags,
      metadata: toMetadata(document.metadata, qualityScore, qualityStatus, summary, tags, model),
    };
  });

  return {
    generatedAt: deterministic.generatedAt,
    rootDocumentId: deterministic.rootDocumentId,
    mode: 'gpt-4o',
    model,
    executiveSummary:
      typeof reasoning.executiveSummary === 'string' && reasoning.executiveSummary.trim().length > 0
        ? reasoning.executiveSummary.trim()
        : deterministic.executiveSummary,
    remediationSuggestions: mergeSuggestions(
      deterministic.remediationSuggestions,
      [
        ...(reasoning.remediationSuggestions ?? []),
        ...collectPerDocumentSuggestions(reasoning.documents ?? []),
      ]
    ),
    documents,
  };
}

export function parseReasoningResponse(content: string): FleetGraphReasoningResponse {
  const normalized = normalizeReasoningResponse(JSON.parse(content));
  const parsed = reasoningResponseSchema.parse(normalized);
  return {
    executiveSummary: parsed.executiveSummary,
    documents: (parsed.documents ?? []).map((document) => ({
      documentId: document.documentId,
      qualityScore: document.assessment?.qualityScore,
      qualityStatus: document.assessment?.qualityStatus,
      confidence: document.assessment?.confidence,
      summary: document.analysis?.summary,
      mainIssues: document.analysis?.mainIssues,
      tags: document.tags,
      suggestions: document.suggestions,
    })),
    remediationSuggestions: parsed.remediationSuggestions ?? [],
  };
}

function normalizeReasoningResponse(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  const response = value as Record<string, unknown>;

  return {
    ...response,
    executiveSummary: normalizeExecutiveSummary(response.executiveSummary),
    documents: Array.isArray(response.documents)
      ? response.documents.map((document) => normalizeReasoningDocument(document))
      : response.documents,
    remediationSuggestions: normalizeSuggestions(response.remediationSuggestions),
  };
}

function normalizeReasoningDocument(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  const document = value as Record<string, unknown>;
  const assessment =
    document.assessment && typeof document.assessment === 'object'
      ? document.assessment as Record<string, unknown>
      : undefined;
  const analysis =
    document.analysis && typeof document.analysis === 'object'
      ? document.analysis as Record<string, unknown>
      : undefined;

  return {
    ...document,
    assessment: assessment
      ? {
          ...assessment,
          qualityScore: normalizeQualityScore(assessment.qualityScore),
          confidence: normalizeConfidence(assessment.confidence),
        }
      : document.assessment,
    analysis: analysis
      ? {
          ...analysis,
          mainIssues: normalizeMainIssues(analysis.mainIssues),
        }
      : document.analysis,
    tags: normalizeTags(document.tags),
    suggestions: normalizeSuggestions(document.suggestions),
  };
}

function normalizeQualityScore(value: unknown): unknown {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return value;
  }

  if (value > 1 && value <= 100) {
    return Number((value / 100).toFixed(2));
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeConfidence(value: unknown): unknown {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return value;
    }

    if (normalized === 'very low' || normalized === 'lowest' || normalized === 'minimal') {
      return 'low';
    }

    if (
      normalized === 'moderate' ||
      normalized === 'moderately confident' ||
      normalized === 'average'
    ) {
      return 'medium';
    }

    if (normalized === 'very high' || normalized === 'strong' || normalized === 'highest') {
      return 'high';
    }
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return value;
  }

  if (value >= 0.75) return 'high';
  if (value >= 0.4) return 'medium';
  return 'low';
}

function normalizeMainIssues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0)
      .slice(0, 5);
  }

  if (typeof value === 'string') {
    return value
      .split(/\n|;|•|-/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .slice(0, 5);
  }

  return value;
}

function normalizeTags(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value
    .map((tag) => {
      if (tag && typeof tag === 'object') {
        return tag;
      }

      if (typeof tag !== 'string') {
        return null;
      }

      const label = tag.trim();
      if (!label) {
        return null;
      }

      return {
        key: toSnakeCase(label),
        label,
        severity: inferSeverity(label),
      };
    })
    .filter((tag): tag is Record<string, unknown> => tag !== null)
    .slice(0, 6);
}

function normalizeSuggestions(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value
    .map((suggestion) => {
      if (suggestion && typeof suggestion === 'object') {
        const objectSuggestion = suggestion as Record<string, unknown>;
        return {
          ...objectSuggestion,
          priority:
            objectSuggestion.priority === 'high' ||
            objectSuggestion.priority === 'medium' ||
            objectSuggestion.priority === 'low'
              ? objectSuggestion.priority
              : 'medium',
          rationale:
            typeof objectSuggestion.rationale === 'string' && objectSuggestion.rationale.trim().length > 0
              ? objectSuggestion.rationale.trim()
              : typeof objectSuggestion.title === 'string'
                ? objectSuggestion.title.trim()
                : 'Clarify the next step.',
        };
      }

      if (typeof suggestion !== 'string') {
        return null;
      }

      const title = suggestion.trim();
      if (!title) {
        return null;
      }

      return {
        title,
        priority: 'medium',
        rationale: title,
      };
    })
    .filter((suggestion) => suggestion !== null);
}

function inferSeverity(label: string): 'high' | 'medium' | 'low' {
  const normalized = label.toLowerCase();
  if (
    normalized.includes('block') ||
    normalized.includes('missing') ||
    normalized.includes('risk') ||
    normalized.includes('critical')
  ) {
    return 'high';
  }

  if (
    normalized.includes('unclear') ||
    normalized.includes('thin') ||
    normalized.includes('scope')
  ) {
    return 'medium';
  }

  return 'low';
}

function toSnakeCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function mergeTags(
  deterministic: FleetGraphAlertTag[],
  modelTags: FleetGraphAlertTag[]
): FleetGraphAlertTag[] {
  const merged = new Map<string, FleetGraphAlertTag>();

  for (const tag of deterministic) {
    merged.set(tag.key, tag);
  }

  for (const tag of modelTags) {
    merged.set(tag.key, {
      ...tag,
      source: tag.source ?? 'gpt-4o',
    });
  }

  return [...merged.values()];
}

function mergeSuggestions(
  deterministic: FleetGraphRemediationSuggestion[],
  modelSuggestions: FleetGraphRemediationSuggestion[]
): FleetGraphRemediationSuggestion[] {
  const merged = new Map<string, FleetGraphRemediationSuggestion>();

  for (const suggestion of [...modelSuggestions, ...deterministic]) {
    const key = `${suggestion.document_id ?? 'global'}:${suggestion.title}`;
    if (!merged.has(key)) {
      merged.set(key, suggestion);
    }
  }

  return [...merged.values()].slice(0, 10);
}

function collectPerDocumentSuggestions(
  documents: FleetGraphReasoningDocumentResult[]
): FleetGraphRemediationSuggestion[] {
  return documents.flatMap((document) =>
    (document.suggestions ?? []).map((suggestion) => ({
      ...suggestion,
      document_id: suggestion.document_id ?? document.documentId,
    }))
  );
}

function worsenStatus(
  deterministic: 'green' | 'yellow' | 'red',
  override: 'green' | 'yellow' | 'red' | undefined,
  tags: FleetGraphAlertTag[]
): 'green' | 'yellow' | 'red' {
  const status = rankStatus(override ?? deterministic) > rankStatus(deterministic)
    ? override ?? deterministic
    : deterministic;

  if (tags.some((tag) => tag.severity === 'high')) return 'red';
  if (tags.some((tag) => tag.severity === 'medium') && status === 'green') return 'yellow';
  return status;
}

function rankStatus(status: 'green' | 'yellow' | 'red'): number {
  if (status === 'green') return 0;
  if (status === 'yellow') return 1;
  return 2;
}

function toMetadata(
  metadata: FleetGraphDocumentMetadata,
  qualityScore: number,
  qualityStatus: 'green' | 'yellow' | 'red',
  summary: string,
  tags: FleetGraphAlertTag[],
  model: string
): FleetGraphDocumentMetadata {
  return {
    ...metadata,
    quality_score: qualityScore,
    quality_status: qualityStatus,
    quality_summary: summary,
    quality_tags: tags,
    last_scored_at: new Date().toISOString(),
    fleetgraph_version: `${model}-v1`,
  };
}

function buildMergedSummary(
  deterministicSummary: string,
  reasoningSummary: string | undefined,
  mainIssues: string[] | undefined
): string {
  const cleanReasoningSummary =
    typeof reasoningSummary === 'string' && reasoningSummary.trim().length > 0
      ? reasoningSummary.trim()
      : null;
  const cleanIssues = (mainIssues ?? [])
    .map((issue) => issue.trim())
    .filter((issue) => issue.length > 0)
    .slice(0, 3);

  if (cleanReasoningSummary && cleanIssues.length > 0) {
    return `${cleanReasoningSummary} Key issues: ${cleanIssues.join('; ')}.`;
  }

  if (cleanReasoningSummary) {
    return cleanReasoningSummary;
  }

  return deterministicSummary;
}

function normalizeExecutiveSummary(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : value;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const summaryObject = value as Record<string, unknown>;
  const candidateKeys = [
    'summary',
    'text',
    'message',
    'analysis',
    'executive_summary',
    'executiveSummary',
  ];

  for (const key of candidateKeys) {
    const candidate = summaryObject[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  const joinedValues = Object.values(summaryObject)
    .flatMap((entry) => {
      if (typeof entry === 'string' && entry.trim().length > 0) {
        return [entry.trim()];
      }

      if (Array.isArray(entry)) {
        return entry.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      }

      return [];
    })
    .slice(0, 3);

  if (joinedValues.length > 0) {
    return joinedValues.join(' ');
  }

  return value;
}
