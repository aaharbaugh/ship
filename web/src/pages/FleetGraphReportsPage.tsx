import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import {
  useFleetGraphBulkDeleteReportsMutation,
  useFleetGraphBulkPublishReportsMutation,
  useFleetGraphDirectorFeedbackMutation,
  useFleetGraphPublishReportMutation,
  useFleetGraphQueueStatusQuery,
  useFleetGraphReadinessQuery,
  useFleetGraphReportsQuery,
  useFleetGraphWorkspaceScanMutation,
} from '@/hooks/useFleetGraphReportsQuery';

const STATUS_STYLES: Record<'green' | 'yellow' | 'red', string> = {
  green: 'bg-green-500/10 text-green-300 border-green-500/30',
  yellow: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  red: 'bg-red-500/10 text-red-300 border-red-500/30',
};

export function FleetGraphReportsPage() {
  const reportsQuery = useFleetGraphReportsQuery();
  const queueStatusQuery = useFleetGraphQueueStatusQuery();
  const readinessQuery = useFleetGraphReadinessQuery();
  const publishMutation = useFleetGraphPublishReportMutation();
  const directorFeedbackMutation = useFleetGraphDirectorFeedbackMutation();
  const bulkPublishMutation = useFleetGraphBulkPublishReportsMutation();
  const bulkDeleteMutation = useFleetGraphBulkDeleteReportsMutation();
  const scanMutation = useFleetGraphWorkspaceScanMutation();
  const [stateFilter, setStateFilter] = useState<'all' | 'draft' | 'published'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'red' | 'yellow' | 'green'>('all');
  const [search, setSearch] = useState('');
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<
    | null
    | { type: 'publish'; reportId: string; title: string }
    | { type: 'bulk-publish'; reportIds: string[]; count: number }
    | { type: 'bulk-delete'; reportIds: string[]; count: number }
    | {
        type: 'director-feedback';
        reportId: string;
        reportTitle: string;
        optionIndex: number;
        optionLabel: string;
        optionMessage: string;
      }
  >(null);

  const reports = reportsQuery.data ?? [];
  const readinessRuntime = readinessQuery.data?.runtime as
    | {
        openAiConfigured: boolean;
        langSmithEnabled: boolean;
        interactiveGraphDepth?: number;
        interactiveAnalysisMode?: string;
      }
    | undefined;
  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();

    return reports.filter((report) => {
      if (stateFilter !== 'all' && report.state !== stateFilter) {
        return false;
      }

      if (severityFilter !== 'all' && report.qualityStatus !== severityFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        report.title.toLowerCase().includes(query) ||
        report.id.toLowerCase().includes(query) ||
        (report.rootDocumentId?.toLowerCase().includes(query) ?? false) ||
        (report.rootDocumentTitle?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [reports, search, severityFilter, stateFilter]);

  const grouped = useMemo(() => {
    const source = filteredReports;
    const red = reports.filter((report) => report.qualityStatus === 'red').length;
    const yellow = reports.filter((report) => report.qualityStatus === 'yellow').length;
    const green = reports.filter((report) => report.qualityStatus === 'green').length;
    return {
      total: reports.length,
      red,
      yellow,
      green,
      drafts: source.filter((report) => report.state === 'draft'),
      published: source.filter((report) => report.state === 'published'),
    };
  }, [filteredReports, reports]);

  const selectableDraftIds = useMemo(
    () => grouped.drafts.map((report) => report.id),
    [grouped.drafts]
  );
  const allVisibleDraftsSelected =
    selectableDraftIds.length > 0 &&
    selectableDraftIds.every((reportId) => selectedDraftIds.includes(reportId));
  const selectedVisibleCount = selectableDraftIds.filter((reportId) =>
    selectedDraftIds.includes(reportId)
  ).length;
  const selectedHiddenCount = selectedDraftIds.length - selectedVisibleCount;

  useEffect(() => {
    setSelectedDraftIds((current) => current.filter((reportId) => reports.some((report) => report.id === reportId && report.state === 'draft')));
  }, [reports]);

  if (reportsQuery.isLoading) {
    return (
      <div className="h-full bg-black p-6">
        <div className="text-sm text-slate-400">Loading FleetGraph reports...</div>
      </div>
    );
  }

  if (reportsQuery.error) {
    return (
      <div className="h-full bg-black p-6">
        <div className="text-sm text-red-300">Failed to load FleetGraph reports.</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-black">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              Team Reviews
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              FleetGraph Reports
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Review recent PM-style FleetGraph reports, publish what is ready, and open the full detail view only when you need deeper context.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-xs text-slate-500">
              {grouped.total} total · {grouped.drafts.length} drafts · {grouped.published.length} published
            </div>
            <span className="text-xs text-slate-500">Open a report to review it.</span>
          </div>
        </div>

        <details className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm shadow-black/30">
          <summary className="cursor-pointer list-none text-sm font-medium text-white">
            FleetGraph Diagnostics
          </summary>
          <div className="mt-3 space-y-3 text-xs text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => scanMutation.mutate(false)}
                disabled={scanMutation.isPending}
                className="rounded-md border border-slate-700 bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {scanMutation.isPending ? 'Scanning...' : 'Run Workspace Scan'}
              </button>
              {readinessQuery.data && (
                <>
                  <span>{readinessRuntime?.openAiConfigured ? 'OpenAI ready' : 'OpenAI missing'}</span>
                  <span>·</span>
                  <span>{readinessRuntime?.langSmithEnabled ? 'LangSmith on' : 'LangSmith missing'}</span>
                  {typeof readinessRuntime?.interactiveGraphDepth === 'number' && (
                    <>
                      <span>·</span>
                      <span>interactive depth {readinessRuntime.interactiveGraphDepth}</span>
                    </>
                  )}
                  {readinessRuntime?.interactiveAnalysisMode && (
                    <>
                      <span>·</span>
                      <span>interactive mode {readinessRuntime.interactiveAnalysisMode}</span>
                    </>
                  )}
                </>
              )}
              {queueStatusQuery.data && (
                <>
                  <span>·</span>
                  <span>{queueStatusQuery.data.pendingCount} queued</span>
                  <span>·</span>
                  <span>{queueStatusQuery.data.runningCount} running</span>
                </>
              )}
            </div>
            {queueStatusQuery.data ? (
              <div className="rounded-xl border border-slate-800 bg-black/40 p-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Worker Activity
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                  <span>
                    Last flush started{' '}
                    {queueStatusQuery.data.lastFlushStartedAt
                      ? formatFleetGraphTimestamp(queueStatusQuery.data.lastFlushStartedAt)
                      : 'never'}
                  </span>
                  <span>
                    Last flush completed{' '}
                    {queueStatusQuery.data.lastFlushCompletedAt
                      ? formatFleetGraphTimestamp(queueStatusQuery.data.lastFlushCompletedAt)
                      : 'never'}
                  </span>
                  <span>
                    Interval {Math.round(queueStatusQuery.data.batchIntervalMs / 1000)}s
                  </span>
                  <span>
                    Lease {Math.round(queueStatusQuery.data.leaseTimeoutMs / 1000)}s
                  </span>
                </div>
                {queueStatusQuery.data.pendingDocuments.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {queueStatusQuery.data.pendingDocuments.map((job) => (
                      <div
                        key={job.id}
                        className="rounded-lg border border-slate-800 bg-black/60 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                          <span
                            className={cn(
                              'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide',
                              job.status === 'running'
                                ? 'border-amber-800 bg-amber-950/40 text-amber-200'
                                : 'border-slate-700 bg-slate-950 text-slate-300'
                            )}
                          >
                            {job.status}
                          </span>
                          <span>{job.documentType ?? 'document'}</span>
                          <span>{job.documentId}</span>
                          <span>source {job.source}</span>
                          <span>attempt {job.attemptCount}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          Updated {formatFleetGraphTimestamp(job.updatedAt)}
                          {job.leasedBy ? ` · leased by ${job.leasedBy}` : ''}
                        </div>
                      </div>
                    ))}
                    <div className="text-[11px] text-slate-500">
                      If a LangSmith run is active, it likely corresponds to a running or recently updated job shown here.
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-slate-500">
                    No queued or running FleetGraph jobs right now.
                  </div>
                )}
              </div>
            ) : null}
            {readinessQuery.data?.missing.length ? (
              <div className="flex flex-wrap gap-2">
                {readinessQuery.data.missing.map((item) => (
                  <span key={item} className="rounded-full border border-slate-700 bg-black px-2 py-0.5 text-[11px] text-slate-300">
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
            {scanMutation.data && (
              <div>
                Last scan {formatFleetGraphTimestamp(scanMutation.data.scannedAt)} · {scanMutation.data.totalProjects} projects
              </div>
            )}
          </div>
        </details>

        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm shadow-black/30">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reports or root document IDs"
              className="h-10 min-w-[220px] flex-1 rounded-md border border-slate-800 bg-black px-3 text-sm text-white outline-none ring-0 placeholder:text-slate-500 focus:border-slate-600"
            />
            <FilterGroup
              label="State"
              value={stateFilter}
              options={['all', 'draft', 'published']}
              onChange={(value) => setStateFilter(value as 'all' | 'draft' | 'published')}
            />
            <FilterGroup
              label="Severity"
              value={severityFilter}
              options={['all', 'red', 'yellow', 'green']}
              onChange={(value) => setSeverityFilter(value as 'all' | 'red' | 'yellow' | 'green')}
            />
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white">
                Draft Reports
              </h2>
              <span className="text-xs text-slate-500">Publish after review.</span>
            </div>
            {grouped.drafts.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {selectedDraftIds.length > 0 && (
                  <span className="rounded-full border border-slate-700 bg-black px-2 py-1 text-[11px] font-medium text-slate-300">
                    {selectedDraftIds.length} selected
                  </span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setSelectedDraftIds((current) =>
                      allVisibleDraftsSelected ? current.filter((id) => !selectableDraftIds.includes(id)) : [...new Set([...current, ...selectableDraftIds])]
                    )
                  }
                  className="rounded-md border border-slate-700 bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                >
                  {allVisibleDraftsSelected ? 'Clear Selection' : 'Select Visible'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPendingAction({
                      type: 'bulk-delete',
                      reportIds: selectedDraftIds,
                      count: selectedDraftIds.length,
                    })
                  }
                  disabled={selectedDraftIds.length === 0 || bulkDeleteMutation.isPending}
                  className="rounded-md border border-red-900 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-950/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {bulkDeleteMutation.isPending ? 'Deleting...' : `Delete Selected (${selectedDraftIds.length})`}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPendingAction({
                      type: 'bulk-publish',
                      reportIds: selectedDraftIds,
                      count: selectedDraftIds.length,
                    })
                  }
                  disabled={selectedDraftIds.length === 0 || bulkPublishMutation.isPending}
                  className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {bulkPublishMutation.isPending ? 'Publishing Selected...' : `Publish Selected (${selectedDraftIds.length})`}
                </button>
              </div>
            )}
          </div>
          {grouped.drafts.length === 0 ? (
            <EmptyState message={filteredReports.length === 0 ? 'No reports match the current filters.' : 'No FleetGraph draft reports yet.'} />
          ) : (
            <div className="grid gap-3">
              {grouped.drafts.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  selected={selectedDraftIds.includes(report.id)}
                  onToggleSelected={() =>
                    setSelectedDraftIds((current) =>
                      current.includes(report.id)
                        ? current.filter((id) => id !== report.id)
                        : [...current, report.id]
                    )
                  }
                  onPublish={() =>
                    setPendingAction({
                      type: 'publish',
                      reportId: report.id,
                      title: report.title,
                    })
                  }
                  isPublishing={publishMutation.isPending}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white">
              Published Reports
            </h2>
            <span className="text-xs text-slate-500">Recent published snapshots.</span>
          </div>
          {grouped.published.length === 0 ? (
            <EmptyState message={filteredReports.length === 0 ? 'No reports match the current filters.' : 'No FleetGraph reports have been published yet.'} />
          ) : (
            <div className="grid gap-3">
              {grouped.published.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  onSendDirectorFeedback={(optionIndex) =>
                    setPendingAction({
                      type: 'director-feedback',
                      reportId: report.id,
                      reportTitle: report.title,
                      optionIndex,
                      optionLabel: report.directorResponseOptions[optionIndex]?.label ?? 'Send feedback',
                      optionMessage: report.directorResponseOptions[optionIndex]?.message ?? '',
                    })
                  }
                  isSendingDirectorFeedback={directorFeedbackMutation.isPending}
                />
              ))}
            </div>
          )}
        </section>

        {pendingAction && (
          <ConfirmationPanel
            title={
              pendingAction.type === 'publish'
                ? 'Publish FleetGraph report?'
                : pendingAction.type === 'bulk-delete'
                  ? 'Delete selected FleetGraph reports?'
                : pendingAction.type === 'bulk-publish'
                  ? 'Publish selected FleetGraph reports?'
                : 'Send director feedback?'
            }
            description={
              pendingAction.type === 'publish'
                ? `This will mark "${pendingAction.title}" as published and move it into the reviewed state.`
                : pendingAction.type === 'bulk-delete'
                  ? `This will permanently delete ${pendingAction.count} selected draft report${pendingAction.count === 1 ? '' : 's'}.`
                : pendingAction.type === 'bulk-publish'
                  ? `This will publish ${pendingAction.count} selected draft report${pendingAction.count === 1 ? '' : 's'} and move them into the reviewed state.`
                : `This will send "${pendingAction.optionLabel}" for "${pendingAction.reportTitle}" and write the feedback onto the affected document metadata.`
            }
            detail={
              pendingAction.type === 'director-feedback'
                ? pendingAction.optionMessage
                : pendingAction.type === 'bulk-delete'
                  ? 'Delete only reports you no longer need. This cannot be undone.'
                : pendingAction.type === 'bulk-publish'
                  ? 'Bulk publish should only happen after the PM has reviewed the visible draft set and confirmed the batch is ready.'
                  : 'Publishing should happen only after the PM has reviewed the draft report content.'
            }
            confirmLabel={
              pendingAction.type === 'publish'
                ? publishMutation.isPending
                  ? 'Publishing...'
                  : 'Confirm Publish'
                : pendingAction.type === 'bulk-delete'
                  ? bulkDeleteMutation.isPending
                    ? 'Deleting...'
                    : `Confirm Delete (${pendingAction.count})`
                : pendingAction.type === 'bulk-publish'
                  ? bulkPublishMutation.isPending
                    ? 'Publishing...'
                    : `Confirm Publish (${pendingAction.count})`
                : directorFeedbackMutation.isPending
                  ? 'Sending...'
                  : 'Confirm Send'
            }
            disabled={publishMutation.isPending || directorFeedbackMutation.isPending || bulkPublishMutation.isPending || bulkDeleteMutation.isPending}
            onCancel={() => setPendingAction(null)}
            onConfirm={() => {
              if (pendingAction.type === 'publish') {
                publishMutation.mutate(pendingAction.reportId, {
                  onSuccess: () => setPendingAction(null),
                });
                return;
              }

              if (pendingAction.type === 'bulk-delete') {
                bulkDeleteMutation.mutate(pendingAction.reportIds, {
                  onSuccess: () => {
                    setSelectedDraftIds([]);
                    setPendingAction(null);
                  },
                });
                return;
              }

              if (pendingAction.type === 'bulk-publish') {
                bulkPublishMutation.mutate(pendingAction.reportIds, {
                  onSuccess: () => {
                    setSelectedDraftIds([]);
                    setPendingAction(null);
                  },
                });
                return;
              }

              directorFeedbackMutation.mutate(
                {
                  reportId: pendingAction.reportId,
                  optionIndex: pendingAction.optionIndex,
                },
                {
                  onSuccess: () => setPendingAction(null),
                }
              );
            }}
          />
        )}
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const selectId = useId();
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <span id={`${selectId}-label`}>{label}</span>
      <select
        aria-labelledby={`${selectId}-label`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-slate-800 bg-black px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-slate-600"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReportCard({
  report,
  selected,
  onToggleSelected,
  onPublish,
  isPublishing,
  onSendDirectorFeedback,
  isSendingDirectorFeedback,
}: {
  report: {
    id: string;
    title: string;
    rootDocumentId: string | null;
    rootDocumentTitle: string | null;
    rootDocumentType: string | null;
    state: 'draft' | 'published';
    qualityStatus: 'green' | 'yellow' | 'red' | null;
    qualityScore: number | null;
    executiveSummary: string | null;
    generatedAt: string | null;
    publishedAt: string | null;
    directorResponseOptions: Array<{
      label: string;
      message: string;
      targetDocumentId: string | null;
    }>;
    directorFeedbackSentAt: string | null;
  };
  selected?: boolean;
  onToggleSelected?: () => void;
  onPublish?: () => void;
  isPublishing?: boolean;
  onSendDirectorFeedback?: (optionIndex: number) => void;
  isSendingDirectorFeedback?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm shadow-black/30">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {report.state === 'draft' && onToggleSelected && (
              <button
                type="button"
                onClick={onToggleSelected}
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded border text-[10px] font-bold transition-colors',
                  selected
                    ? 'border-white bg-white text-black'
                    : 'border-slate-700 bg-black text-slate-400 hover:bg-slate-900'
                )}
              >
                {selected ? '✓' : ''}
              </button>
            )}
            <h3 className="text-base font-semibold text-white">{report.title}</h3>
            <span className="rounded-full border border-slate-700 bg-black px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {report.state}
            </span>
            {report.qualityStatus && typeof report.qualityScore === 'number' && (
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
                  STATUS_STYLES[report.qualityStatus]
                )}
              >
                {report.qualityStatus} {Math.round(report.qualityScore * 100)}%
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
            <span>Generated: {formatFleetGraphTimestamp(report.generatedAt)}</span>
            {report.publishedAt && <span>Published: {formatFleetGraphTimestamp(report.publishedAt)}</span>}
            {report.rootDocumentTitle && (
              <span>
                Root: {report.rootDocumentTitle}
                {report.rootDocumentType ? ` (${report.rootDocumentType})` : ''}
              </span>
            )}
          </div>
          {report.executiveSummary && (
            <p className="mt-3 max-w-3xl text-sm text-slate-300">
              {report.executiveSummary}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/team/reviews/fleetgraph/${report.id}`}
            className="rounded-md border border-slate-700 bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
          >
            Open
          </Link>
          {report.rootDocumentId && (
            <Link
              to={`/documents/${report.rootDocumentId}`}
              className="text-xs text-slate-400 underline underline-offset-4 hover:text-white"
            >
              Root doc
            </Link>
          )}
          {report.state === 'draft' && onPublish && (
            <button
              type="button"
              onClick={onPublish}
              disabled={isPublishing}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPublishing ? 'Publishing...' : 'Publish'}
            </button>
          )}
        </div>
      </div>

      {report.state === 'published' && report.directorResponseOptions.length > 0 && (
        <div className="mt-3 text-xs text-slate-500">
          {report.directorResponseOptions.length} director response option{report.directorResponseOptions.length === 1 ? '' : 's'}
          {report.directorFeedbackSentAt
            ? ` · last sent ${formatFleetGraphTimestamp(report.directorFeedbackSentAt)}`
            : ''}
          {onSendDirectorFeedback && (
            <>
              {' · '}
              <Link to={`/team/reviews/fleetgraph/${report.id}`} className="text-white underline underline-offset-4 hover:text-slate-200">
                Send from detail view
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatFleetGraphTimestamp(value: string | null): string {
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950 px-4 py-6 text-sm text-slate-500">
      {message}
    </div>
  );
}

function ConfirmationPanel({
  title,
  description,
  detail,
  confirmLabel,
  disabled,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  detail: string;
  confirmLabel: string;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !disabled) {
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [disabled, onCancel]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !disabled) {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fleetgraph-confirmation-title"
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-black p-4 shadow-2xl shadow-black/60"
      >
        <div id="fleetgraph-confirmation-title" className="text-sm font-semibold text-white">{title}</div>
        <div className="mt-2 text-sm text-slate-300">{description}</div>
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
          {detail}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
