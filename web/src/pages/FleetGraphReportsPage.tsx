import { useMemo } from 'react';
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

  const grouped = useMemo(() => {
    const reports = reportsQuery.data ?? [];
    return {
      drafts: reports.filter((report) => report.state === 'draft'),
      published: reports.filter((report) => report.state === 'published'),
    };
  }, [reportsQuery.data]);

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
            <span>{grouped.drafts.length} drafts</span>
            <span>{grouped.published.length} published</span>
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
            <EmptyState message="No FleetGraph draft reports yet." />
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
            <EmptyState message="No FleetGraph reports have been published yet." />
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
