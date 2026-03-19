import OpenAI from 'openai';
import { wrapOpenAI } from 'langsmith/wrappers/openai';
import { traceable } from 'langsmith/traceable';
import { z } from 'zod';
import type { FleetGraphAnalysis } from './analyze.js';
import type { FleetGraphPreparedRun } from './runner.js';
import { fleetGraphTraceConfig, fleetGraphTraceMetadata } from './tracing.js';

export interface FleetGraphChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface FleetGraphChatResponse {
  answer: string;
  suggestedPrompts: string[];
}

const chatRequestSchema = z.object({
  answer: z.string().min(1),
  suggestedPrompts: z.array(z.string().min(1)).max(3).optional(),
});

const DEFAULT_MODEL = process.env.FLEETGRAPH_OPENAI_MODEL || 'gpt-4o';

export async function answerFleetGraphQuestion(
  prepared: FleetGraphPreparedRun,
  analysis: FleetGraphAnalysis,
  question: string,
  history: FleetGraphChatMessage[] = []
): Promise<FleetGraphChatResponse> {
  return tracedAnswerFleetGraphQuestion(prepared, analysis, question, history);
}

const tracedAnswerFleetGraphQuestion = traceable(
  async function answerQuestion(
    prepared: FleetGraphPreparedRun,
    analysis: FleetGraphAnalysis,
    question: string,
    history: FleetGraphChatMessage[]
  ): Promise<FleetGraphChatResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return buildFallbackAnswer(prepared, analysis, question);
    }

    const client = wrapOpenAI(
      new OpenAI({ apiKey }),
      {
        name: 'fleetgraph.chat.openai',
        tags: ['fleetgraph', 'chat', 'openai'],
        metadata: fleetGraphTraceMetadata({
          rootDocumentId: prepared.rootDocumentId,
        }),
      }
    );

    try {
      const response = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are FleetGraph, a contextual PM copilot inside Ship. Return strict JSON only with { answer, suggestedPrompts }. Answer the user based on the current Ship document and its nearby graph. Be direct, practical, and PM-oriented. Focus on what is blocked, what matters most, and what to do next. Do not invent project facts, owners, dates, or requirements that are not present in the provided context. Suggested prompts should be short follow-up questions the user could ask next.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              context: buildChatContext(prepared, analysis),
              history: history.slice(-6),
              question,
            }),
          },
        ],
      }, {
        langsmithExtra: {
          name: 'fleetgraph.chat_completion',
          tags: ['fleetgraph', 'chat'],
          metadata: {
            rootDocumentId: prepared.rootDocumentId,
            historyLength: history.length,
          },
        },
      });

      const message = response.choices[0]?.message?.content;
      if (!message) {
        return buildFallbackAnswer(prepared, analysis, question);
      }

      const parsed = chatRequestSchema.parse(JSON.parse(message));
      return {
        answer: parsed.answer.trim(),
        suggestedPrompts: (parsed.suggestedPrompts ?? []).slice(0, 3),
      };
    } catch {
      return buildFallbackAnswer(prepared, analysis, question);
    }
  },
  fleetGraphTraceConfig('fleetgraph.answer_question')
);

function buildChatContext(prepared: FleetGraphPreparedRun, analysis: FleetGraphAnalysis) {
  const root = prepared.context.rootDocument;
  const topDocuments = analysis.documents
    .slice()
    .sort((left, right) => rankStatus(right.qualityStatus) - rankStatus(left.qualityStatus))
    .slice(0, 8)
    .map((document) => ({
      documentId: document.documentId,
      documentType: document.documentType,
      qualityStatus: document.qualityStatus,
      qualityScore: document.qualityScore,
      summary: document.summary,
      tags: document.tags.map((tag) => tag.label),
    }));

  return {
    rootDocument: {
      id: root.id,
      title: root.title,
      documentType: root.document_type,
    },
    executiveSummary: analysis.executiveSummary,
    graph: {
      documentsReviewed: prepared.graph.nodes.length,
      relationshipsReviewed: prepared.graph.edges.length,
      maxDepthReached: prepared.graph.metadata.maxDepthReached,
      truncated: prepared.graph.metadata.truncated,
    },
    topDocuments,
    remediationSuggestions: analysis.remediationSuggestions.slice(0, 5),
  };
}

function buildFallbackAnswer(
  prepared: FleetGraphPreparedRun,
  analysis: FleetGraphAnalysis,
  question: string
): FleetGraphChatResponse {
  const topSuggestion = analysis.remediationSuggestions[0];
  const topRed = analysis.documents.find((document) => document.qualityStatus === 'red');
  const promptKey = question.toLowerCase();

  if (promptKey.includes('what') && promptKey.includes('do')) {
    return {
      answer: topSuggestion
        ? `${analysis.executiveSummary} Start with "${topSuggestion.title}" because ${topSuggestion.rationale}`
        : analysis.executiveSummary,
      suggestedPrompts: getSuggestedPrompts(prepared),
    };
  }

  if (promptKey.includes('risk') || promptKey.includes('blocked')) {
    return {
      answer: topRed
        ? `${analysis.executiveSummary} The highest-risk item in the current graph is ${topRed.documentType} "${findTitle(prepared, topRed.documentId)}". ${topRed.summary}`
        : analysis.executiveSummary,
      suggestedPrompts: getSuggestedPrompts(prepared),
    };
  }

  return {
    answer: `${analysis.executiveSummary}${topSuggestion ? ` Next best move: ${topSuggestion.title}. ${topSuggestion.rationale}` : ''}`,
    suggestedPrompts: getSuggestedPrompts(prepared),
  };
}

function getSuggestedPrompts(prepared: FleetGraphPreparedRun): string[] {
  const label = prepared.context.rootDocument.document_type;
  return [
    `What is the biggest risk in this ${label}?`,
    `What should I fix first?`,
    'Should this be ready to execute?',
  ];
}

function findTitle(prepared: FleetGraphPreparedRun, documentId: string): string {
  const document = prepared.context.expandedDocuments.find((entry) => entry.id === documentId);
  return document?.title ?? documentId;
}

function rankStatus(status: 'green' | 'yellow' | 'red'): number {
  if (status === 'green') return 0;
  if (status === 'yellow') return 1;
  return 2;
}
