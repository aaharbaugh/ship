import OpenAI from 'openai';
import { wrapOpenAI } from 'langsmith/wrappers/openai';
import { traceable } from 'langsmith/traceable';
import { z } from 'zod';
import type {
  FleetGraphAlertTag,
  FleetGraphDocumentMetadata,
  FleetGraphRemediationSuggestion,
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
  documents: z.array(reasoningDocumentSchema).max(40).optional(),
  remediationSuggestions: z.array(reasoningSuggestionSchema).max(5).optional(),
});

const DEFAULT_MODEL = process.env.FLEETGRAPH_OPENAI_MODEL || 'gpt-4o';

export async function analyzeFleetGraphWithReasoning(
  payload: FleetGraphScoringPayload
): Promise<FleetGraphAnalysis> {
  const deterministic = analyzeFleetGraphPayload(payload);
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
          name: 'fleetgraph.openai',
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
              'You are FleetGraph, a document quality analyst. Return strict JSON only. Focus on the quality, coherence, and actionability of the provided text. Preserve deterministic structural findings unless the text strongly justifies extra caution. Use the exact schema requested. Keep summaries concise, main issues concrete, tags short, and suggestions high-signal.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              task:
                'Review only the provided document text and deterministic hints. Return JSON with { documents, remediationSuggestions }. For each document, use { documentId, assessment, analysis, tags, suggestions }. assessment may include qualityStatus, qualityScore, confidence. analysis may include summary and mainIssues. Add tags only when the text supports them. Add per-document suggestions and up to 5 global remediationSuggestions.',
              documents: buildCompactReasoningInput(payload, deterministic),
            }),
          },
        ],
      }, {
        langsmithExtra: {
          name: 'fleetgraph.reasoning_completion',
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
  fleetGraphTraceConfig('fleetgraph.analyze_reasoning', {
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

function parseReasoningResponse(content: string): FleetGraphReasoningResponse {
  const parsed = reasoningResponseSchema.parse(JSON.parse(content));
  return {
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
