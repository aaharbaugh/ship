import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  useFleetGraphChatMutation,
  type FleetGraphChatMessage,
  type FleetGraphInsightsResponse,
} from '@/hooks/useFleetGraphInsightsQuery';
import type { FleetGraphReportListItem } from '@/hooks/useFleetGraphReportsQuery';

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
  onRequestLiveAnalysis,
  onPersist,
  isPersisting,
  onCreateReportDraft,
  onOpenReport,
  isCreatingReportDraft,
  reports,
}: {
  documentId: string;
  data?: FleetGraphInsightsResponse;
  isLoading: boolean;
  error?: Error | null;
  persisted?: PersistedFleetGraphView | null;
  liveAnalysisRequested?: boolean;
  onRequestLiveAnalysis?: () => void;
  onPersist?: () => void;
  isPersisting?: boolean;
  onCreateReportDraft?: () => void;
  onOpenReport?: (reportId: string) => void;
  isCreatingReportDraft?: boolean;
  reports?: FleetGraphReportListItem[];
}) {
  const [open, setOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<FleetGraphChatMessage[]>([]);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const chatMutation = useFleetGraphChatMutation(documentId);
  const qualityReportId = persisted?.qualityReportId ?? null;
  const linkedReport = reports?.find((report) => report.id === qualityReportId);
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
  const rawTags = persisted?.qualityTags ?? primaryDocument?.tags ?? [];
  const displayTags = useMemo(
    () => filterRedundantTags(rawTags, displaySummary),
    [rawTags, displaySummary]
  );
  const conciseSuggestions = useMemo(
    () => (data ? buildConciseSuggestions(data.analysis.remediationSuggestions, displayTags) : []),
    [data, displayTags]
  );

  const statusLabel =
    displayStatus === 'green'
      ? 'Done'
      : displayStatus === 'yellow'
        ? 'Needs small corrections'
        : displayStatus === 'red'
          ? 'Needs work'
          : 'Unavailable';

  const actionLabel =
    qualityReportId && onCreateReportDraft
      ? isCreatingReportDraft
        ? 'Updating Report...'
        : 'Update Report'
      : onCreateReportDraft
        ? isCreatingReportDraft
          ? 'Creating Report...'
          : 'Create Report'
        : null;

  useEffect(() => {
    setMessages([]);
    setChatInput('');
    setSuggestedPrompts(
      data
        ? getSeedPrompts(data)
        : ['What is the biggest risk here?', 'What should I fix first?', 'Is this ready to execute?']
    );
  }, [documentId, data]);

  const submitChatQuestion = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || chatMutation.isPending) {
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

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="flex h-7 items-center gap-2 rounded-full border border-slate-700 bg-black px-2.5 text-xs text-white hover:bg-slate-900"
          aria-label="Open FleetGraph"
          title="Open FleetGraph"
        >
          <LightbulbIcon className="h-3.5 w-3.5" />
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              displayStatus ? STATUS_DOT_STYLES[displayStatus] : 'bg-slate-500'
            )}
          />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/65" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] w-[min(92vw,40rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-800 bg-black p-5 shadow-2xl shadow-black/70">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-semibold text-white">
                FleetGraph
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-400">
                Quick PM review and report actions for this document.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white hover:bg-slate-900">
              Close
            </Dialog.Close>
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
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
                <p className="max-w-2xl text-sm text-white">
                  {displaySummary ?? 'Run live analysis or create a report to see FleetGraph feedback for this document.'}
                </p>
                {displayTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {displayTags.slice(0, 4).map((tag) => (
                      <span
                        key={`${tag.key}-${tag.label}`}
                        className="rounded-full border border-slate-700 bg-black px-2 py-0.5 text-xs text-slate-300"
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>
                )}
                {(persisted?.lastScoredAt || data?.analysis.generatedAt) && (
                  <div className="text-xs text-slate-500">
                    Updated {formatShortTimestamp(persisted?.lastScoredAt || data?.analysis.generatedAt)}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-stretch gap-2">
                {actionLabel && (
                  <button
                    type="button"
                    onClick={() => {
                      onCreateReportDraft?.();
                    }}
                    disabled={Boolean(isCreatingReportDraft)}
                    className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLabel}
                  </button>
                )}
                {qualityReportId && onOpenReport && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenReport(qualityReportId);
                      setOpen(false);
                    }}
                    className="rounded-md border border-slate-700 bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                  >
                    {linkedReport?.state === 'published' ? 'Open Report' : 'Open Draft'}
                  </button>
                )}
                {onRequestLiveAnalysis && (
                  <button
                    type="button"
                    onClick={onRequestLiveAnalysis}
                    disabled={Boolean(liveAnalysisRequested || isLoading)}
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoading || liveAnalysisRequested ? 'Running Review...' : 'Run Fresh Review'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {conciseSuggestions.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Recommended Next Steps
              </div>
              <div className="mt-3 space-y-3">
                {conciseSuggestions.map((suggestion, index) => (
                  <div key={`${suggestion.title}-${index}`} className="rounded-lg border border-slate-800 bg-black p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-medium text-white">{suggestion.title}</div>
                      <span className="text-[11px] uppercase tracking-wide text-slate-500">
                        {suggestion.priority}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      {suggestion.rationale}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Ask FleetGraph
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => submitChatQuestion(prompt)}
                  disabled={chatMutation.isPending}
                  className="rounded-full border border-slate-700 bg-black px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-3">
              {messages.length === 0 ? (
                <div className="rounded-lg border border-slate-800 bg-black p-3 text-xs leading-5 text-slate-500">
                  Ask what is blocking execution, what to fix first, or whether this document is ready to move.
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={cn(
                      'rounded-lg border p-3 text-sm leading-6',
                      message.role === 'user'
                        ? 'border-slate-700 bg-black text-slate-100'
                        : 'border-slate-800 bg-slate-900 text-slate-200'
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
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                submitChatQuestion(chatInput);
              }}
            >
              <input
                type="text"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask about risks, readiness, or next steps"
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
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
            <div>
              {error
                ? 'Live analysis unavailable.'
                : data
                  ? `${data.scoringPayload.documentCount} docs reviewed`
                  : 'Use live analysis only when you want a fresh check.'}
            </div>
            {onPersist && data && (
              <button
                type="button"
                onClick={onPersist}
                disabled={Boolean(isPersisting)}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPersisting ? 'Persisting...' : 'Persist Snapshot'}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function getSeedPrompts(data: FleetGraphInsightsResponse): string[] {
  const rootDocument = data.graph.nodes.find((node) => node.id === data.rootDocumentId);
  const typeLabel = rootDocument?.documentType ?? 'document';

  return [
    `What is the biggest risk in this ${typeLabel}?`,
    'What should I fix first?',
    'Is this ready to execute?',
  ];
}

function buildConciseSuggestions(
  suggestions: FleetGraphInsightsResponse['analysis']['remediationSuggestions'],
  tags: PersistedFleetGraphView['qualityTags']
) {
  const normalizedTags = new Set(tags.map((tag) => normalizeFleetGraphText(tag.label)));
  const seen = new Set<string>();

  return suggestions
    .flatMap((suggestion) => {
      const titleKey = normalizeFleetGraphText(suggestion.title);
      if (!titleKey || seen.has(titleKey)) {
        return [];
      }

      const titleWithoutPrefix = titleKey.replace(/^improve [a-z_]+:\s*/, '');
      if (normalizedTags.has(titleWithoutPrefix)) {
        return [];
      }

      seen.add(titleKey);
      return [suggestion];
    })
    .slice(0, 3);
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

  if (status === 'red' && /^missing content\.?$/i.test(next)) {
    return 'This reads like a placeholder and is not ready to execute.';
  }

  return next.charAt(0).toUpperCase() + next.slice(1);
}

function filterRedundantTags(
  tags: PersistedFleetGraphView['qualityTags'],
  summary: string | null
) {
  const normalizedSummary = normalizeFleetGraphText(summary).replace(/[.?!]+$/g, '');

  return tags.filter((tag) => {
    const normalizedLabel = normalizeFleetGraphText(tag.label);

    if (!normalizedLabel) {
      return false;
    }

    if (normalizedSummary && normalizedSummary.includes(normalizedLabel)) {
      return false;
    }

    return true;
  });
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

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 18h6M10 22h4M8.5 14.5A6.5 6.5 0 1115.5 14.5c-.63.62-1.13 1.11-1.45 1.55-.31.44-.55.91-.72 1.45h-2.66c-.17-.54-.41-1.01-.72-1.45-.32-.44-.82-.93-1.45-1.55z" />
    </svg>
  );
}
