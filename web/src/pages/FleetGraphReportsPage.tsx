import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import {
  useFleetGraphBulkPublishReportsMutation,
  useFleetGraphPublishReportMutation,
  useFleetGraphQueueStatusQuery,
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
  const publishMutation = useFleetGraphPublishReportMutation();
  const bulkPublishMutation = useFleetGraphBulkPublishReportsMutation();
  const scanMutation = useFleetGraphWorkspaceScanMutation();
  const [stateFilter, setStateFilter] = useState<'all' | 'draft' | 'published'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'red' | 'yellow' | 'green'>('all');
  const [search, setSearch] = useState('');
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);

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
                  onPublish={() => publishMutation.mutate(report.id)}
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
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
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
  };
  selected?: boolean;
  onToggleSelected?: () => void;
  onPublish?: () => void;
  isPublishing?: boolean;
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
            to={`/documents/${report.id}`}
            className="rounded-md border border-slate-700 bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
          >
            Open Report
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
