import OpenAI from 'openai';
import { wrapOpenAI } from 'langsmith/wrappers/openai';
import { traceable } from 'langsmith/traceable';
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
  summary?: string;
  tags?: FleetGraphAlertTag[];
}

interface FleetGraphReasoningResponse {
  documents?: FleetGraphReasoningDocumentResult[];
  remediationSuggestions?: FleetGraphRemediationSuggestion[];
}

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
              'You are FleetGraph, a project-graph quality analyst. Return strict JSON only. Preserve deterministic findings, refine quality scoring conservatively, and suggest the highest-value remediation steps.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              task:
                'Review the project graph payload and deterministic findings. For each document, return optional overrides for qualityScore (0-1), qualityStatus, summary, and tags. Only include documents present in the payload. Keep tags concise and actionable. Add up to 5 remediationSuggestions.',
              payload,
              deterministic,
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

      return {
        rootDocumentId: payload.rootDocumentId,
        documentCount: payload.documentCount,
        edgeCount: payload.edgeCount,
        maxDepthReached: payload.maxDepthReached,
        truncated: payload.truncated,
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
  return fleetGraphTraceMetadata({
    rootDocumentId: payload.rootDocumentId,
    documentCount: payload.documentCount,
    edgeCount: payload.edgeCount,
    maxDepthReached: payload.maxDepthReached,
    truncated: payload.truncated,
    deterministicRedDocuments: deterministic.documents.filter(
      (document) => document.qualityStatus === 'red'
    ).length,
    deterministicYellowDocuments: deterministic.documents.filter(
      (document) => document.qualityStatus === 'yellow'
    ).length,
  });
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
    const summary = typeof override.summary === 'string' && override.summary.trim().length > 0
      ? override.summary.trim()
      : document.summary;

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
      reasoning.remediationSuggestions ?? []
    ),
    documents,
  };
}

function parseReasoningResponse(content: string): FleetGraphReasoningResponse {
  const parsed = JSON.parse(content) as FleetGraphReasoningResponse;
  return {
    documents: Array.isArray(parsed.documents) ? parsed.documents : [],
    remediationSuggestions: Array.isArray(parsed.remediationSuggestions)
      ? parsed.remediationSuggestions
      : [],
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
