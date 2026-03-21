import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  useFleetGraphChatMutation,
  type FleetGraphChatMessage,
  type FleetGraphInsightsResponse,
} from '@/hooks/useFleetGraphInsightsQuery';

export interface PersistedFleetGraphView {
  qualityScore: number;
  qualityStatus: 'green' | 'yellow' | 'red';
  qualitySummary: string;
  qualityReportId?: string | null;
  qualityTags: Array<{
    key: string;
    label: string;
    severity: 'high' | 'medium' | 'low';
    source?: string | null;
  }>;
  lastScoredAt?: string | null;
}

const STATUS_BADGE_STYLES: Record<'green' | 'yellow' | 'red', string> = {
  green: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  yellow: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
  red: 'border-red-500/40 bg-red-500/10 text-red-200',
};

const STATUS_DOT_STYLES: Record<'green' | 'yellow' | 'red', string> = {
  green: 'bg-sky-400',
  yellow: 'bg-yellow-400',
  red: 'bg-red-400',
};

export function FleetGraphInsightsPanel({
  documentId,
  data,
  isLoading,
  error,
  persisted,
  liveAnalysisRequested,
  onRunReview,
  isRunningReview,
}: {
  documentId: string;
  data?: FleetGraphInsightsResponse;
  isLoading: boolean;
  error?: Error | null;
  persisted?: PersistedFleetGraphView | null;
  liveAnalysisRequested?: boolean;
  onRunReview?: () => void;
  isRunningReview?: boolean;
}) {
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<FleetGraphChatMessage[]>([]);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatMutation = useFleetGraphChatMutation(documentId);
  const primaryDocument =
    data?.analysis.documents.find((document) => document.documentId === data.rootDocumentId) ??
    data?.analysis.documents[0];
  const displayStatus = persisted?.qualityStatus ?? primaryDocument?.qualityStatus ?? null;
  const displayScore = persisted?.qualityScore ?? primaryDocument?.qualityScore ?? null;
  const rawSummary =
    data?.analysis.executiveSummary ??
    persisted?.qualitySummary ??
    primaryDocument?.summary ??
    null;
  const displaySummary = sanitizeFleetGraphSummary(rawSummary, displayStatus);
  const updatedAt = persisted?.lastScoredAt || data?.analysis.generatedAt;
  const scopeSummary = data ? buildScopeSummary(data) : null;
  const uncertaintySummary = data ? buildUncertaintySummary(data) : null;
  const evidencePoints = useMemo(
    () =>
      buildEvidencePoints({
        tags: primaryDocument?.tags ?? [],
        suggestions: data?.analysis.remediationSuggestions ?? [],
        summary: displaySummary,
      }),
    [primaryDocument?.tags, data?.analysis.remediationSuggestions, displaySummary]
  );
  const reviewBrief = useMemo(
    () => buildReviewBrief({ summary: displaySummary, status: displayStatus }),
    [displaySummary, displayStatus]
  );

  const statusLabel =
    displayStatus === 'green'
      ? 'Clear to run'
      : displayStatus === 'yellow'
        ? 'Tighten plan'
        : displayStatus === 'red'
          ? 'Fix blockers'
          : 'Unavailable';

  useEffect(() => {
    setMessages([]);
    setChatInput('');
    setSuggestedPrompts(
      data
        ? getSeedPrompts(data)
        : ['What is the biggest risk here?', 'What should I fix first?', 'Is this ready to execute?']
    );
  }, [documentId, data]);

  useEffect(() => {
    const container = chatScrollRef.current;
    const end = chatEndRef.current;

    if (!container || !end) {
      return;
    }

    requestAnimationFrame(() => {
      end.scrollIntoView({ block: 'end' });
      container.scrollTop = container.scrollHeight;
    });
  }, [messages, chatMutation.isPending]);

  const submitChatQuestion = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || chatMutation.isPending) {
      return;
    }

    const command = findChatToolAction(toolActions, trimmed);
    if (command) {
      setChatInput('');
      runToolAction(command, trimmed);
      return;
    }

    if (trimmed.startsWith('/')) {
      setMessages((current) => [
        ...current,
        { role: 'user', content: trimmed },
        {
          role: 'assistant',
          content: `FleetGraph does not recognize ${trimmed}. Try ${toolActions.map((action) => action.command).join(', ')}.`,
        },
      ]);
      setChatInput('');
      return;
    }

    const nextHistory = [...messages, { role: 'user' as const, content: trimmed }];
    setMessages(nextHistory);
    setChatInput('');

    chatMutation.mutate(
      {
        question: trimmed,
        history: messages.slice(-5),
      },
      {
        onSuccess: (result) => {
          setMessages((current) => [
            ...current,
            { role: 'assistant', content: result.answer },
          ]);
          if (result.suggestedPrompts.length > 0) {
            setSuggestedPrompts(result.suggestedPrompts);
          }
        },
        onError: () => {
          setMessages((current) => [
            ...current,
            {
              role: 'assistant',
              content: 'FleetGraph could not answer that right now. Try rerunning the review or asking a narrower question.',
            },
          ]);
        },
      }
    );
  };

  const runToolAction = (action: ChatToolAction, commandOverride?: string) => {
    if (chatMutation.isPending || action.pending) {
      return;
    }

    setMessages((current) => [
      ...current,
      { role: 'user', content: commandOverride ?? action.command },
      {
        role: 'assistant',
        content: action.unavailableReason ?? action.feedback,
      },
    ]);

    if (!action.unavailableReason) {
      action.onClick?.();
    }
  };

  const toolActions = getChatToolActions({
    canRunReview: Boolean(onRunReview),
    onRunReview,
    runReviewPending: Boolean(isRunningReview || liveAnalysisRequested || isLoading),
  });

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-lg shadow-black/30">
      <div className="border-b border-slate-800 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-white">
            <LightbulbIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-base font-semibold text-white">FleetGraph</div>
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  displayStatus ? STATUS_DOT_STYLES[displayStatus] : 'bg-slate-500'
                )}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">PM review for this document</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-3 py-3">
        <div className="rounded-xl border border-slate-800 bg-gradient-to-b from-slate-950 to-black p-3">
          <div className="min-w-0 space-y-3">
            <div className="flex items-start justify-between gap-3">
              {displayStatus && typeof displayScore === 'number' ? (
                <div
                  className={cn(
                    'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-wide',
                    STATUS_BADGE_STYLES[displayStatus]
                  )}
                >
                  {statusLabel} {Math.round(displayScore * 100)}%
                </div>
              ) : (
                <div className="inline-flex rounded-full border border-slate-700 bg-black px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-slate-300">
                  FleetGraph not run yet
                </div>
              )}
              {updatedAt && (
                <div className="pt-0.5 text-xs text-slate-500">
                  {formatShortTimestamp(updatedAt)}
                </div>
              )}
            </div>
            <div className="space-y-3">
              {scopeSummary && (
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Review Scope
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span>{scopeSummary.documentCount} docs</span>
                    <span>{scopeSummary.edgeCount} edges</span>
                    <span>depth {scopeSummary.maxDepthReached}</span>
                    <span>{scopeSummary.truncated ? 'bounded traversal' : 'full local scope'}</span>
                  </div>
                </div>
              )}
              {uncertaintySummary && (
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Confidence And Limits
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    {uncertaintySummary.summary}
                  </p>
                </div>
              )}
              <div>
                <p className="mt-1 text-sm leading-6 text-slate-100">
                  {reviewBrief.assessment}
                </p>
              </div>
              {evidencePoints[0] ? (
                <div className="rounded-lg border border-slate-800 bg-black/50 px-3 py-2 text-sm text-slate-200">
                  {evidencePoints[0]}
                </div>
              ) : null}
              {evidencePoints.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {evidencePoints.slice(1, 3).map((point) => (
                    <span
                      key={point}
                      className="rounded-full border border-slate-700 bg-black px-2 py-0.5 text-[11px] text-slate-300"
                    >
                      {point}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {onRunReview && (
              <button
                type="button"
                onClick={onRunReview}
                disabled={Boolean(isRunningReview || liveAnalysisRequested || isLoading)}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRunningReview || isLoading || liveAnalysisRequested ? 'Running Review...' : 'Run Review'}
              </button>
            )}
          </div>
        </div>

      </div>

      <div className="min-h-0 flex-1 px-3 pb-3">
        <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-white">Ask FleetGraph</div>
              <div className="text-xs text-slate-500">Ask about readiness, risk, or what to fix next.</div>
            </div>
            <div className="text-xs text-slate-500">
              {error
                ? 'Live analysis unavailable.'
                : data
                  ? `${data.scoringPayload.documentCount} docs reviewed`
                  : 'Context scoped to this document.'}
            </div>
          </div>

          <div
            ref={chatScrollRef}
            className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
          >
            {messages.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-800 bg-black/60 p-3 text-xs leading-5 text-slate-500">
                Start with what is blocked, what to fix first, or whether this work is ready to move.
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={cn(
                    'rounded-lg border p-3 text-sm leading-6',
                    message.role === 'user'
                      ? 'border-slate-700 bg-black text-slate-100'
                      : 'border-slate-800 bg-slate-900/80 text-slate-200'
                  )}
                >
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                    {message.role === 'user' ? 'You' : 'FleetGraph'}
                  </div>
                  <div>{message.content}</div>
                </div>
              ))
            )}
            {chatMutation.isPending && (
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm text-slate-400">
                FleetGraph is reviewing the current context...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="mt-3 border-t border-slate-800 pt-3">
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                submitChatQuestion(chatInput);
              }}
            >
              <input
                type="text"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask a PM-style question"
                className="h-10 flex-1 rounded-md border border-slate-800 bg-black px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-slate-600"
              />
              <button
                type="submit"
                disabled={chatMutation.isPending || chatInput.trim().length === 0}
                className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Send
              </button>
            </form>
            <div className="mt-3">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Suggested Questions
              </div>
              <div className="flex flex-wrap gap-2">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => submitChatQuestion(prompt)}
                  disabled={chatMutation.isPending}
                  className="rounded-full border border-slate-800 bg-black px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {prompt}
                </button>
              ))}
            </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function getSeedPrompts(data: FleetGraphInsightsResponse): string[] {
  const rootDocument = data.graph.nodes.find((node) => node.id === data.rootDocumentId);
  const typeLabel = rootDocument?.documentType ?? 'document';

  return [
    `What is the biggest risk in this ${typeLabel}?`,
    'What should happen next?',
    'What would a PM want to know?',
  ];
}

function getChatToolActions({
  canRunReview,
  onRunReview,
  runReviewPending,
}: {
  canRunReview: boolean;
  onRunReview?: () => void;
  runReviewPending?: boolean;
}) {
  const actions: ChatToolAction[] = [];

  actions.push({
    label: 'Run Review',
    command: '/run-review',
    aliases: ['/review', '/rerun-review'],
    feedback: 'Running a fresh FleetGraph review, saving the snapshot, and updating the linked report for this document now.',
    onClick: onRunReview,
    pending: Boolean(runReviewPending),
    unavailableReason:
      canRunReview
        ? undefined
        : 'FleetGraph cannot run a review from this view right now.',
  });

  return actions.slice(0, 1);
}

interface ChatToolAction {
  label: string;
  command: string;
  aliases?: string[];
  feedback: string;
  onClick?: () => void;
  pending?: boolean;
  unavailableReason?: string;
}

function findChatToolAction(
  actions: ChatToolAction[],
  input: string
): ChatToolAction | null {
  const normalized = input.trim().toLowerCase();

  if (normalized === '/help') {
    return {
      label: 'Help',
      command: '/help',
      feedback: `Available commands: ${actions.map((action) => action.command).join(', ')}.`,
    };
  }

  return (
    actions.find((action) =>
      [action.command, ...(action.aliases ?? [])].some(
        (candidate) => candidate.toLowerCase() === normalized
      )
    ) ?? null
  );
}

function normalizeFleetGraphText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function sanitizeFleetGraphSummary(
  summary: string | null | undefined,
  status: 'green' | 'yellow' | 'red' | null
): string | null {
  if (typeof summary !== 'string') {
    return null;
  }

  let next = summary.trim();
  if (!next) {
    return null;
  }

  next = next
    .replace(/^[^.?!]+?\s+is\s+(red|yellow|green)\s+because\s+/i, '')
    .replace(/^fleetgraph detected\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!next) {
    return null;
  }

  if (!/[.?!]$/.test(next)) {
    next = `${next}.`;
  }

  next = next
    .replace(/^the document is incomplete due to the absence of an owner.*$/i, 'Needs an owner.')
    .replace(/^key issues:\s*/i, '')
    .replace(/^missing content,\s*missing owner\.?$/i, 'Needs scope and an owner.')
    .replace(/^missing content,\s*missing acceptance criteria\.?$/i, 'Needs scope and acceptance criteria.')
    .replace(/^missing owner\.?$/i, 'Needs an owner.')
    .replace(/^missing content\.?$/i, 'Needs more detail before work can start.');

  if (status === 'red' && /^missing content\.?$/i.test(next)) {
    return 'This reads like a placeholder and is not ready to execute.';
  }

  return next.charAt(0).toUpperCase() + next.slice(1);
}

function buildReviewBrief({
  summary,
  status,
}: {
  summary: string | null;
  status: 'green' | 'yellow' | 'red' | null;
}) {
  const assessment =
    summary ?? 'This document needs a quick PM review before the next action is clear.';

  if (status === 'green') {
    return {
      assessment,
    };
  }

  if (status === 'yellow') {
    return {
      assessment,
    };
  }

  if (status === 'red') {
    return {
      assessment,
    };
  }

  return {
    assessment,
  };
}

function formatShortTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}


function buildScopeSummary(data: FleetGraphInsightsResponse): {
  summary: string;
  documentCount: number;
  edgeCount: number;
  maxDepthReached: number;
  truncated: boolean;
} {
  const { scoringPayload, graph } = data;
  const types = new Set(
    scoringPayload.documents
      .map((document) => document.documentType)
      .filter((value): value is string => Boolean(value))
  );

  return {
    summary: `Reviewed ${scoringPayload.documentCount} connected documents across ${types.size} document types around this root document.`,
    documentCount: scoringPayload.documentCount,
    edgeCount: scoringPayload.edgeCount,
    maxDepthReached: graph.metadata.maxDepthReached,
    truncated: graph.metadata.truncated,
  };
}

function buildEvidencePoints({
  tags,
  suggestions,
  summary,
}: {
  tags: Array<{ label: string }>;
  suggestions: Array<{ title: string }>;
  summary: string | null;
}): string[] {
  const points: string[] = [];

  for (const tag of tags.slice(0, 2)) {
    points.push(`Flagged: ${tag.label.replace(/_/g, ' ')}.`);
  }

  for (const suggestion of suggestions.slice(0, Math.max(0, 3 - points.length))) {
    points.push(`Suggested next step: ${suggestion.title}.`);
  }

  if (points.length === 0 && summary) {
    points.push(`Primary assessment: ${summary}`);
  }

  return points;
}

function buildUncertaintySummary(data: FleetGraphInsightsResponse): { summary: string } {
  if (data.graph.metadata.truncated) {
    return {
      summary:
        'FleetGraph hit the current traversal limit, so this review is helpful but may not include every connected document.',
    };
  }

  return {
    summary:
      'FleetGraph reviewed the full local scope it loaded for this document. Findings are heuristic, but they are grounded in the connected documents fetched here.',
  };
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 18h6M10 22h4M8.5 14.5A6.5 6.5 0 1115.5 14.5c-.63.62-1.13 1.11-1.45 1.55-.31.44-.55.91-.72 1.45h-2.66c-.17-.54-.41-1.01-.72-1.45-.32-.44-.82-.93-1.45-1.55z" />
    </svg>
  );
}
