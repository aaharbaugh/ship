import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import {
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
  const scanMutation = useFleetGraphWorkspaceScanMutation();
  const [stateFilter, setStateFilter] = useState<'all' | 'draft' | 'published'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'red' | 'yellow' | 'green'>('all');
  const [search, setSearch] = useState('');
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<
    | null
    | { type: 'publish'; reportId: string; title: string }
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
        (report.rootDocumentId?.toLowerCase().includes(query) ?? false)
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
              Review recent FleetGraph quality reports, publish the ones that are ready,
              and jump directly into the linked project documents.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-3 text-xs text-slate-500">
              <span>{grouped.total} total</span>
              <span>{reports.length === filteredReports.length ? grouped.drafts.length : `${grouped.drafts.length} visible drafts`}</span>
              <span>{reports.length === filteredReports.length ? grouped.published.length : `${grouped.published.length} visible published`}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/team/reviews/fleetgraph/session"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
              >
                Open Review Session
              </Link>
              <button
                type="button"
                onClick={() => scanMutation.mutate(false)}
                disabled={scanMutation.isPending}
                className="rounded-md border border-slate-700 bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {scanMutation.isPending ? 'Scanning...' : 'Run Fresh Scan'}
              </button>
              <button
                type="button"
                onClick={() => scanMutation.mutate(true)}
                disabled={scanMutation.isPending}
                className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {scanMutation.isPending ? 'Scanning...' : 'Scan + Draft Reports'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <SummaryCard label="Open Drafts" value={reports.filter((report) => report.state === 'draft').length} tone="default" />
          <SummaryCard label="Red Reports" value={grouped.red} tone="red" />
          <SummaryCard label="Yellow Reports" value={grouped.yellow} tone="yellow" />
          <SummaryCard label="Published" value={reports.filter((report) => report.state === 'published').length} tone="green" />
        </div>

        {readinessQuery.data && (
          <div
            className={cn(
              'rounded-2xl border p-4 shadow-sm shadow-black/30',
              readinessQuery.data.ready
                ? 'border-emerald-900/60 bg-emerald-950/30'
                : 'border-amber-900/60 bg-amber-950/30'
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white">FleetGraph MVP Readiness</div>
                <div className="mt-1 text-xs text-slate-300">
                  {readinessQuery.data.ready
                    ? 'Runtime config looks complete for a public FleetGraph deployment.'
                    : 'FleetGraph is working, but public MVP rollout still has missing runtime pieces.'}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <ReadinessChip
                  label={readinessQuery.data.runtime.langSmithEnabled ? 'LangSmith on' : 'LangSmith missing'}
                  tone={readinessQuery.data.runtime.langSmithEnabled ? 'green' : 'yellow'}
                />
                <ReadinessChip
                  label={readinessQuery.data.runtime.openAiConfigured ? 'GPT-4o on' : 'OpenAI missing'}
                  tone={readinessQuery.data.runtime.openAiConfigured ? 'green' : 'yellow'}
                />
                <ReadinessChip
                  label={readinessQuery.data.deployment.publiclyAccessible ? 'Public URL set' : 'No public URL'}
                  tone={readinessQuery.data.deployment.publiclyAccessible ? 'green' : 'yellow'}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-300">
              <span className="rounded-full border border-slate-700 bg-black/40 px-2 py-0.5">
                queue {Math.round(readinessQuery.data.runtime.queueIntervalMs / 60000)} min
              </span>
              <span className="rounded-full border border-slate-700 bg-black/40 px-2 py-0.5">
                collab idle {Math.round(readinessQuery.data.runtime.collaborationIdleMs / 1000)} s
              </span>
              <span className="rounded-full border border-slate-700 bg-black/40 px-2 py-0.5">
                graph depth {readinessQuery.data.runtime.maxGraphDepth}
              </span>
              <span className="rounded-full border border-slate-700 bg-black/40 px-2 py-0.5">
                graph docs {readinessQuery.data.runtime.maxGraphDocuments}
              </span>
              {readinessQuery.data.deployment.publicBaseUrl && (
                <span className="rounded-full border border-slate-700 bg-black/40 px-2 py-0.5">
                  {readinessQuery.data.deployment.publicBaseUrl}
                </span>
              )}
            </div>

            {readinessQuery.data.missing.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {readinessQuery.data.missing.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-amber-700/50 bg-amber-950/60 px-2 py-0.5 text-[11px] text-amber-200"
                  >
                    missing {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {scanMutation.data && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm shadow-black/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white">Latest FleetGraph Scan</div>
                <div className="mt-1 text-xs text-slate-400">
                  {formatFleetGraphTimestamp(scanMutation.data.scannedAt)} · {scanMutation.data.totalProjects} projects · {scanMutation.data.redProjects} red · {scanMutation.data.yellowProjects} yellow · {scanMutation.data.greenProjects} green
                </div>
              </div>
              <div className="text-xs text-slate-500">
                {scanMutation.data.projects.filter((project) => project.qualityReportId).length} reports linked
              </div>
            </div>
          </div>
        )}

        {queueStatusQuery.data && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm shadow-black/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white">FleetGraph Queue</div>
                <div className="mt-1 text-xs text-slate-400">
                  {queueStatusQuery.data.pendingCount} queued · every {Math.round(queueStatusQuery.data.batchIntervalMs / 60000)} min · up to {queueStatusQuery.data.maxDocumentsPerFlush} docs/flush · {queueStatusQuery.data.isFlushing ? 'flush in progress' : 'idle'}
                </div>
              </div>
              <div className="text-xs text-slate-500">
                Last flush: {formatFleetGraphTimestamp(queueStatusQuery.data.lastFlushCompletedAt)}
              </div>
            </div>
            {queueStatusQuery.data.workspaceGroups.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {queueStatusQuery.data.workspaceGroups.slice(0, 6).map((group) => (
                  <span
                    key={group.workspaceId}
                    className="rounded-full border border-slate-700 bg-black px-2 py-0.5 text-[11px] text-slate-300"
                  >
                    workspace {group.workspaceId.slice(0, 8)} · {group.pendingCount}
                  </span>
                ))}
              </div>
            )}
            {queueStatusQuery.data.pendingDocuments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {queueStatusQuery.data.pendingDocuments.slice(0, 8).map((event) => (
                  <span
                    key={`${event.documentId}-${event.source}`}
                    className="rounded-full border border-slate-700 bg-black px-2 py-0.5 text-[11px] text-slate-300"
                  >
                    {event.documentType ?? 'document'} · {event.source}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

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
              <span className="text-xs text-slate-500">
                Publish after PM review
              </span>
            </div>
            {grouped.drafts.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedDraftIds((current) =>
                      allVisibleDraftsSelected ? current.filter((id) => !selectableDraftIds.includes(id)) : [...new Set([...current, ...selectableDraftIds])]
                    )
                  }
                  className="rounded-md border border-slate-700 bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                >
                  {allVisibleDraftsSelected ? 'Clear Visible' : 'Select Visible'}
                </button>
                <button
                  type="button"
                  onClick={() => bulkPublishMutation.mutate(selectedDraftIds)}
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
            <span className="text-xs text-slate-500">
              Recent published quality snapshots
            </span>
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
                : 'Send director feedback?'
            }
            description={
              pendingAction.type === 'publish'
                ? `This will mark "${pendingAction.title}" as published and move it into the reviewed state.`
                : `This will send "${pendingAction.optionLabel}" for "${pendingAction.reportTitle}" and write the feedback onto the affected document metadata.`
            }
            detail={
              pendingAction.type === 'director-feedback'
                ? pendingAction.optionMessage
                : 'Publishing should happen only after the PM has reviewed the draft report content.'
            }
            confirmLabel={
              pendingAction.type === 'publish'
                ? publishMutation.isPending
                  ? 'Publishing...'
                  : 'Confirm Publish'
                : directorFeedbackMutation.isPending
                  ? 'Sending...'
                  : 'Confirm Send'
            }
            disabled={publishMutation.isPending || directorFeedbackMutation.isPending}
            onCancel={() => setPendingAction(null)}
            onConfirm={() => {
              if (pendingAction.type === 'publish') {
                publishMutation.mutate(pendingAction.reportId, {
                  onSuccess: () => setPendingAction(null),
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

function ReadinessChip({
  label,
  tone,
}: {
  label: string;
  tone: 'green' | 'yellow';
}) {
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-[11px] font-medium',
        tone === 'green'
          ? 'border-emerald-700/50 bg-emerald-950/60 text-emerald-200'
          : 'border-amber-700/50 bg-amber-950/60 text-amber-200'
      )}
    >
      {label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'default' | 'red' | 'yellow' | 'green';
}) {
  const toneClass =
    tone === 'red'
      ? 'border-red-500/30 bg-red-500/10 text-red-200'
      : tone === 'yellow'
        ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200'
        : tone === 'green'
          ? 'border-green-500/30 bg-green-500/10 text-green-200'
          : 'border-slate-800 bg-slate-950 text-white';

  return (
    <div className={cn('rounded-2xl border p-4 shadow-sm', toneClass)}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
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
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <span>{label}</span>
      <select
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
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/team/reviews/fleetgraph/${report.id}`}
            className="rounded-md border border-slate-700 bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
          >
            Review Report
          </Link>
          <Link
            to={`/documents/${report.id}`}
            className="rounded-md border border-slate-700 bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
          >
            Open Raw Report
          </Link>
          {report.rootDocumentId && (
            <Link
              to={`/documents/${report.rootDocumentId}`}
              className="rounded-md border border-slate-700 bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
            >
              Open Root Doc
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
        <div className="mt-4 rounded-xl border border-slate-800 bg-black p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Director Feedback Options
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Select and send one response to the affected document context.
              </div>
            </div>
            <div className="text-xs text-slate-500">
              {report.directorFeedbackSentAt
                ? `Last sent ${formatFleetGraphTimestamp(report.directorFeedbackSentAt)}`
                : 'No director feedback sent yet'}
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {report.directorResponseOptions.map((option, index) => (
              <div
                key={`${report.id}-${option.label}-${index}`}
                className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white">{option.label}</div>
                    <div className="mt-1 text-xs text-slate-400">{option.message}</div>
                    {option.targetDocumentId && (
                      <div className="mt-2 text-[11px] text-slate-500">
                        Target document: {option.targetDocumentId}
                      </div>
                    )}
                  </div>
                  {onSendDirectorFeedback && (
                    <button
                      type="button"
                      onClick={() => onSendDirectorFeedback(index)}
                      disabled={isSendingDirectorFeedback}
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSendingDirectorFeedback ? 'Sending...' : 'Send Feedback'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
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
  return (
    <div className="fixed bottom-6 right-6 z-40 w-full max-w-md rounded-2xl border border-slate-700 bg-black p-4 shadow-2xl shadow-black/60">
      <div className="text-sm font-semibold text-white">{title}</div>
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
  );
}
