import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import type {
  FleetGraphInsightsResponse,
  FleetGraphLiveReviewRun,
} from '@/hooks/useFleetGraphInsightsQuery';
import type {
  FleetGraphReportDetail,
  FleetGraphReportListItem,
} from '@/hooks/useFleetGraphReportsQuery';
import type { PersistedFleetGraphView } from '@/components/FleetGraphInsightsPanel';

const STATUS_BADGE_STYLES: Record<'green' | 'yellow' | 'red', string> = {
  green: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  yellow: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  red: 'border-red-500/40 bg-red-500/10 text-red-200',
};

const STATUS_LABELS: Record<'green' | 'yellow' | 'red', string> = {
  green: 'Clear to run',
  yellow: 'Tighten plan',
  red: 'Fix blockers',
};

export function FleetGraphDocumentReview({
  data,
  isLoading,
  error,
  persisted,
  liveAnalysisRequested,
  onRunReview,
  isRunningReview,
  reports,
  reportDetail,
  isLoadingReportDetail,
  onPublishReport,
  isPublishingReport,
  liveRun,
  expanded: expandedProp,
  onExpandedChange,
}: {
  data?: FleetGraphInsightsResponse;
  isLoading: boolean;
  error?: Error | null;
  persisted?: PersistedFleetGraphView | null;
  liveAnalysisRequested?: boolean;
  onRunReview?: () => void;
  isRunningReview?: boolean;
  reports?: FleetGraphReportListItem[];
  reportDetail?: FleetGraphReportDetail;
  isLoadingReportDetail?: boolean;
  onPublishReport?: (reportId: string) => void;
  isPublishingReport?: boolean;
  liveRun?: FleetGraphLiveReviewRun | null;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = expandedProp ?? internalExpanded;
  const setExpanded = (next: boolean | ((current: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(expanded) : next;
    onExpandedChange?.(resolved);
    if (expandedProp === undefined) {
      setInternalExpanded(resolved);
    }
  };

  const qualityReportId = persisted?.qualityReportId ?? null;
  const linkedReport = reports?.find((report) => report.id === qualityReportId) ?? null;
  const primaryDocument =
    data?.analysis.documents.find((document) => document.documentId === data.rootDocumentId) ??
    data?.analysis.documents[0];
  const displayStatus = persisted?.qualityStatus ?? primaryDocument?.qualityStatus ?? null;
  const rawSummary =
    data?.analysis.executiveSummary ??
    persisted?.qualitySummary ??
    primaryDocument?.summary ??
    null;
  const displaySummary = sanitizeFleetGraphSummary(rawSummary, displayStatus);
  const updatedAt = persisted?.lastScoredAt ?? data?.analysis.generatedAt ?? null;
  const suggestions = data?.analysis.remediationSuggestions.slice(0, 3) ?? [];
  const tags = useMemo(
    () => (persisted?.qualityTags ?? primaryDocument?.tags ?? []).slice(0, 4),
    [persisted?.qualityTags, primaryDocument?.tags]
  );
  const scopeSummary = data ? buildScopeSummary(data) : null;
  const uncertaintySummary = data ? buildUncertaintySummary(data) : null;
  const healthSummary = useMemo(() => buildHealthSummary(data), [data]);
  const gameplan = useMemo(
    () => buildGameplan({ tags, suggestions, status: displayStatus }),
    [tags, suggestions, displayStatus]
  );
  const visibleTags = useMemo(
    () => buildVisibleTags(tags, gameplan),
    [tags, gameplan]
  );
  const detailSuggestions = useMemo(
    () => buildDetailSuggestions(suggestions, gameplan),
    [suggestions, gameplan]
  );
  const report = reportDetail?.report ?? linkedReport ?? null;
  const linkedTargets = reportDetail?.targetDocuments ?? [];
  const displayedTrace = useMemo(
    () => deriveDisplayedTrace(data?.trace, report, liveRun ?? null),
    [data?.trace, report, liveRun]
  );
  const hasVisibleContent =
    Boolean(displayStatus) ||
    Boolean(displaySummary) ||
    tags.length > 0 ||
    suggestions.length > 0 ||
    Boolean(isLoading) ||
    Boolean(error) ||
    Boolean(onRunReview);

  if (!hasVisibleContent) {
    return null;
  }

  const runLabel = isRunningReview || liveAnalysisRequested || isLoading ? 'Reviewing...' : 'Run Review';

  return (
    <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-950/95 shadow-sm shadow-black/30">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={expanded}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                FleetGraph Review
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {displayStatus ? (
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
                      STATUS_BADGE_STYLES[displayStatus]
                    )}
                  >
                    {STATUS_LABELS[displayStatus]}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300">
                    No review yet
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  {updatedAt ? `Updated ${formatShortTimestamp(updatedAt)}` : 'Run review to generate a gameplan'}
                </span>
                <span className="rounded-full border border-sky-900/60 bg-sky-950/40 px-2 py-0.5 text-[11px] font-medium text-sky-200">
                  Interactive run: quick deterministic check
                </span>
              </div>
            </div>
            <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-black text-slate-400">
              <ChevronIcon className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
            </span>
          </div>
        </button>

        <div className="flex flex-wrap gap-2">
          {onRunReview ? (
            <button
              type="button"
              onClick={onRunReview}
              disabled={Boolean(isRunningReview || liveAnalysisRequested || isLoading)}
              className="rounded-md border border-slate-700 bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {runLabel}
            </button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="space-y-3 border-t border-slate-800 px-4 py-4">
          {error ? (
            <div className="rounded-xl border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              FleetGraph could not load a review for this document right now.
            </div>
          ) : null}

          {displaySummary ? (
            <p className="text-sm leading-6 text-slate-100">{displaySummary}</p>
          ) : isLoading ? (
            <p className="text-sm text-slate-400">FleetGraph is reviewing the current document context...</p>
          ) : null}

          {gameplan.length > 0 ? (
            <div className="rounded-xl border border-slate-800 bg-black/40 px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Gameplan
              </div>
              <div className="mt-2 space-y-2">
                {gameplan.map((item, index) => (
                  <div key={item} className="flex gap-2 text-sm leading-6 text-slate-200">
                    <span className="text-slate-500">{index + 1}.</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 text-[11px]">
            {scopeSummary ? (
              <>
                <MetricPill>{scopeSummary.documentCount} docs</MetricPill>
                <MetricPill>{scopeSummary.edgeCount} edges</MetricPill>
                <MetricPill>depth {scopeSummary.maxDepthReached}</MetricPill>
              </>
            ) : null}
            {data?.trace ? (
              <>
                <MetricPill>{data.trace.stepCount} graph steps</MetricPill>
                <MetricPill>{data.trace.path.length} executed</MetricPill>
                <MetricPill>trigger {data.trace.triggerSource}</MetricPill>
                {data.trace.analysis?.model ? <MetricPill>model {data.trace.analysis.model}</MetricPill> : null}
              </>
            ) : null}
            {uncertaintySummary ? (
              <span
                className={cn(
                  'rounded-full border px-2 py-1',
                  uncertaintySummary.level === 'bounded'
                    ? 'border-amber-900/60 bg-amber-950/30 text-amber-200'
                    : 'border-slate-800 bg-black/40 text-slate-300'
                )}
              >
                {uncertaintySummary.level === 'bounded' ? 'Limited scope' : 'Full local scope'}
              </span>
            ) : null}
            {healthSummary ? (
              <>
                <span className={cn('rounded-full border px-2 py-1', STATUS_BADGE_STYLES[healthSummary.documentStatus])}>
                  Doc: {STATUS_LABELS[healthSummary.documentStatus]}
                </span>
                <span className={cn('rounded-full border px-2 py-1', STATUS_BADGE_STYLES[healthSummary.graphStatus])}>
                  Graph: {STATUS_LABELS[healthSummary.graphStatus]}
                </span>
              </>
            ) : null}
          </div>

          {visibleTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {visibleTags.slice(0, 4).map((tag) => (
                <span
                  key={tag.key}
                  className="rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-300"
                >
                  {humanizeEvidenceLabel(tag.label)}
                </span>
              ))}
            </div>
          ) : null}

          {displayedTrace ? (
            <div className="rounded-xl border border-slate-800 bg-black/40 px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Trace Path
              </div>
              <div className="mt-2 text-xs leading-5 text-slate-300">
                executed: {displayedTrace.path.join(' -> ')}
              </div>
              {displayedTrace.nextPath.length > 0 ? (
                <div className="mt-1 text-xs leading-5 text-amber-300">
                  next: {displayedTrace.nextPath.join(' -> ')}
                </div>
              ) : null}
              {displayedTrace.reason ? (
                <div className="mt-2 text-xs leading-5 text-slate-400">
                  {displayedTrace.reason}
                </div>
              ) : null}
              {liveRun?.status === 'running' ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {liveRun.steps.map((step) => (
                    <span
                      key={step.id}
                      className={cn(
                        'rounded-full border px-2 py-1 text-[11px]',
                        step.status === 'completed' && 'border-emerald-900/60 bg-emerald-950/30 text-emerald-200',
                        step.status === 'in_progress' && 'border-sky-900/60 bg-sky-950/30 text-sky-200',
                        step.status === 'pending' && 'border-slate-800 bg-black/40 text-slate-400',
                        step.status === 'failed' && 'border-red-900/60 bg-red-950/30 text-red-200'
                      )}
                    >
                      {step.id}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {report ? (
            <div className="rounded-xl border border-slate-800 bg-black/40">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-3 py-3">
                <div>
                  <Link
                    to={`/documents/${report.id}`}
                    className="text-sm font-medium text-white underline underline-offset-4 hover:text-slate-200"
                  >
                    Saved Artifact
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 uppercase tracking-wide text-slate-300">
                      {report.state}
                    </span>
                    {report.generatedAt ? <span>Generated {formatShortTimestamp(report.generatedAt)}</span> : null}
                    {report.publishedAt ? <span>Published {formatShortTimestamp(report.publishedAt)}</span> : null}
                  </div>
                </div>
                {report.state === 'draft' && onPublishReport ? (
                  <button
                    type="button"
                    onClick={() => onPublishReport(report.id)}
                    disabled={Boolean(isPublishingReport)}
                    className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPublishingReport ? 'Publishing...' : 'Publish Report'}
                  </button>
                ) : null}
              </div>

              <div className="space-y-3 px-3 py-3">
                {isLoadingReportDetail ? (
                  <div className="text-sm text-slate-500">Loading saved artifact...</div>
                ) : null}

                {(reportDetail?.reportContentText || linkedTargets.length > 0) ? (
                  <details className="rounded-lg border border-slate-800 bg-slate-950/70">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-white">
                      Full Artifact
                    </summary>
                    <div className="space-y-3 border-t border-slate-800 px-3 py-3">
                      {reportDetail?.reportContentText ? (
                        <pre className="whitespace-pre-wrap text-xs leading-6 text-slate-300">
                          {reportDetail.reportContentText}
                        </pre>
                      ) : null}
                      {linkedTargets.map((document) => (
                        <div key={document.id} className="rounded-lg border border-slate-800 bg-black px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-medium text-white">{document.title}</div>
                            <span className="text-[11px] uppercase tracking-wide text-slate-500">
                              {document.documentType}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            {document.qualitySummary ?? 'No persisted summary yet.'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            </div>
          ) : null}

          {detailSuggestions.length > 0 ? (
            <details className="rounded-xl border border-slate-800 bg-black/40">
              <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-white">
                Full Review Details
              </summary>
              <div className="space-y-3 border-t border-slate-800 px-3 py-3">
                {detailSuggestions.length > 0 ? (
                  <div className="space-y-2">
                    {detailSuggestions.map((suggestion) => (
                      <div
                        key={suggestion.key}
                        className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2"
                      >
                        <div className="text-sm leading-6 text-slate-200">
                          {suggestion.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function MetricPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-slate-800 bg-black/40 px-2 py-1 text-slate-300">
      {children}
    </span>
  );
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

function buildHealthSummary(
  data: FleetGraphInsightsResponse | undefined
): {
  documentStatus: 'green' | 'yellow' | 'red';
  graphStatus: 'green' | 'yellow' | 'red';
} | null {
  if (!data || data.analysis.documents.length === 0) {
    return null;
  }

  const root =
    data.analysis.documents.find((document) => document.documentId === data.rootDocumentId) ??
    data.analysis.documents[0];

  if (!root) {
    return null;
  }

  return {
    documentStatus: root.qualityStatus,
    graphStatus: summarizeGraphStatus(data.analysis.documents),
  };
}

function summarizeGraphStatus(
  documents: FleetGraphInsightsResponse['analysis']['documents']
): 'green' | 'yellow' | 'red' {
  if (documents.some((document) => document.qualityStatus === 'red')) {
    return 'red';
  }
  if (documents.some((document) => document.qualityStatus === 'yellow')) {
    return 'yellow';
  }
  return 'green';
}

function buildScopeSummary(data: FleetGraphInsightsResponse): {
  documentCount: number;
  edgeCount: number;
  maxDepthReached: number;
} {
  const { scoringPayload, graph } = data;
  return {
    documentCount: scoringPayload.documentCount,
    edgeCount: scoringPayload.edgeCount,
    maxDepthReached: graph.metadata.maxDepthReached,
  };
}

function deriveDisplayedTrace(
  trace: FleetGraphInsightsResponse['trace'] | undefined,
  report: FleetGraphReportDetail['report'] | FleetGraphReportListItem | null,
  liveRun: FleetGraphLiveReviewRun | null
): {
  path: string[];
  nextPath: string[];
  reason: string | null;
} | null {
  if (liveRun) {
    return {
      path: liveRun.path,
      nextPath: liveRun.nextPath,
      reason:
        liveRun.status === 'failed'
          ? liveRun.error ?? 'FleetGraph review failed before completing the graph.'
          : liveRun.status === 'running'
            ? `FleetGraph is currently running ${liveRun.currentStepId ?? 'the next graph step'} and updating the trace as each node completes.`
            : liveRun.trace?.decision?.reason ?? 'FleetGraph completed the live review run.',
    };
  }

  if (!trace) {
    return null;
  }

  const base = {
    path: trace.path,
    nextPath: trace.nextPath,
    reason: trace.decision?.reason ?? null,
  };

  if (!report) {
    return base;
  }

  if (report.state === 'published') {
    return {
      path: [...trace.path, 'human-review', 'draft-report', 'publish-report'],
      nextPath: [],
      reason:
        'A FleetGraph report has already been reviewed and published for these findings, so the graph has advanced past report creation and is now in the published artifact state.',
    };
  }

  return {
    path: [...trace.path, 'human-review', 'draft-report'],
    nextPath: [],
    reason:
      'A FleetGraph draft report already exists for these findings, so the graph has advanced past report recommendation and is waiting on human review or publication.',
  };
}

function buildGameplan({
  tags,
  suggestions,
  status,
}: {
  tags: Array<{ label: string }>;
  suggestions: Array<{ title: string; rationale?: string }>;
  status: 'green' | 'yellow' | 'red' | null;
}): string[] {
  const steps: string[] = [];

  for (const suggestion of suggestions.slice(0, 2)) {
    steps.push(tightenSentence(suggestion.title));
  }

  for (const tag of tags.slice(0, Math.max(0, 3 - steps.length))) {
    const label = humanizeEvidenceLabel(tag.label).toLowerCase();
    steps.push(`Fix ${label}`);
  }

  if (steps.length === 0 && status === 'green') {
    steps.push('Keep execution moving and rerun review if scope changes');
  }

  return Array.from(new Set(steps)).slice(0, 3);
}

function buildVisibleTags(
  tags: Array<{ key: string; label: string }>,
  gameplan: string[]
): Array<{ key: string; label: string }> {
  const normalizedGameplan = new Set(gameplan.map((item) => normalizeComparisonText(item)));
  return tags.filter((tag) => {
    const tagText = normalizeComparisonText(humanizeEvidenceLabel(tag.label));
    return !Array.from(normalizedGameplan).some(
      (planItem) => planItem.includes(tagText) || tagText.includes(planItem)
    );
  });
}

function buildDetailSuggestions(
  suggestions: Array<{ title: string; rationale?: string }>,
  gameplan: string[]
): Array<{ key: string; detail: string }> {
  const seen = new Set<string>();
  const normalizedGameplan = new Set(gameplan.map((item) => normalizeComparisonText(item)));

  return suggestions.flatMap((suggestion) => {
    const title = tightenSentence(suggestion.title);
    const rationale = typeof suggestion.rationale === 'string' ? suggestion.rationale.trim() : '';
    const detail =
      rationale && normalizeComparisonText(rationale) !== normalizeComparisonText(title)
        ? `${title}. ${rationale}`
        : `${title}.`;
    const key = normalizeComparisonText(detail);

    if (
      !key ||
      seen.has(key) ||
      Array.from(normalizedGameplan).some(
        (planItem) => key.includes(planItem) || planItem.includes(normalizeComparisonText(title))
      )
    ) {
      return [];
    }

    seen.add(key);
    return [{ key, detail }];
  });
}

function humanizeEvidenceLabel(label: string): string {
  return label.replace(/_/g, ' ');
}

function tightenSentence(value: string): string {
  const trimmed = value.trim().replace(/^Improve\s+/i, '').replace(/^Address\s+/i, '');
  const next = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return next.replace(/[.]+$/g, '');
}

function normalizeComparisonText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.]+$/g, '');
}

function buildUncertaintySummary(data: FleetGraphInsightsResponse): {
  level: 'bounded' | 'local';
} {
  if (data.graph.metadata.truncated) {
    return { level: 'bounded' };
  }

  return { level: 'local' };
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 9l6 6 6-6" />
    </svg>
  );
}
