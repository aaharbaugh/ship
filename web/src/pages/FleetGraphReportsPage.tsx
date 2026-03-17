import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import {
  useFleetGraphPublishReportMutation,
  useFleetGraphReportsQuery,
} from '@/hooks/useFleetGraphReportsQuery';

const STATUS_STYLES: Record<'green' | 'yellow' | 'red', string> = {
  green: 'bg-green-500/10 text-green-700 border-green-500/20',
  yellow: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  red: 'bg-red-500/10 text-red-700 border-red-500/20',
};

export function FleetGraphReportsPage() {
  const reportsQuery = useFleetGraphReportsQuery();
  const publishMutation = useFleetGraphPublishReportMutation();
  const [stateFilter, setStateFilter] = useState<'all' | 'draft' | 'published'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'red' | 'yellow' | 'green'>('all');
  const [search, setSearch] = useState('');

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

  if (reportsQuery.isLoading) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted">Loading FleetGraph reports...</div>
      </div>
    );
  }

  if (reportsQuery.error) {
    return (
      <div className="p-6">
        <div className="text-sm text-red-600">Failed to load FleetGraph reports.</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
              Team Reviews
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              FleetGraph Reports
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Review recent FleetGraph quality reports, publish the ones that are ready,
              and jump directly into the linked project documents.
            </p>
          </div>
          <div className="flex gap-3 text-xs text-muted">
            <span>{grouped.total} total</span>
            <span>{reports.length === filteredReports.length ? grouped.drafts.length : `${grouped.drafts.length} visible drafts`}</span>
            <span>{reports.length === filteredReports.length ? grouped.published.length : `${grouped.published.length} visible published`}</span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <SummaryCard label="Open Drafts" value={reports.filter((report) => report.state === 'draft').length} tone="default" />
          <SummaryCard label="Red Reports" value={grouped.red} tone="red" />
          <SummaryCard label="Yellow Reports" value={grouped.yellow} tone="yellow" />
          <SummaryCard label="Published" value={reports.filter((report) => report.state === 'published').length} tone="green" />
        </div>

        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reports or root document IDs"
              className="h-10 min-w-[220px] flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none ring-0 placeholder:text-muted focus:border-slate-400"
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
              Draft Reports
            </h2>
            <span className="text-xs text-muted">
              Publish after PM review
            </span>
          </div>
          {grouped.drafts.length === 0 ? (
            <EmptyState message={filteredReports.length === 0 ? 'No reports match the current filters.' : 'No FleetGraph draft reports yet.'} />
          ) : (
            <div className="grid gap-3">
              {grouped.drafts.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  onPublish={() => publishMutation.mutate(report.id)}
                  isPublishing={publishMutation.isPending}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
              Published Reports
            </h2>
            <span className="text-xs text-muted">
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
      ? 'border-red-200 bg-red-50 text-red-700'
      : tone === 'yellow'
        ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
        : tone === 'green'
          ? 'border-green-200 bg-green-50 text-green-700'
          : 'border-border bg-white text-foreground';

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
    <label className="flex items-center gap-2 text-xs text-muted">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
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
  onPublish,
  isPublishing,
}: {
  report: {
    id: string;
    title: string;
    rootDocumentId: string | null;
    state: 'draft' | 'published';
    qualityStatus: 'green' | 'yellow' | 'red' | null;
    qualityScore: number | null;
    generatedAt: string | null;
    publishedAt: string | null;
  };
  onPublish?: () => void;
  isPublishing?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{report.title}</h3>
            <span className="rounded-full border border-border bg-slate-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">
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
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
            <span>Generated: {report.generatedAt ?? 'Unknown'}</span>
            {report.publishedAt && <span>Published: {report.publishedAt}</span>}
            {report.rootDocumentId && <span>Root document linked</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/documents/${report.id}`}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-slate-100"
          >
            Open Report
          </Link>
          {report.rootDocumentId && (
            <Link
              to={`/documents/${report.rootDocumentId}`}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-slate-100"
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-slate-50 px-4 py-6 text-sm text-muted">
      {message}
    </div>
  );
}
