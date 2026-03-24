import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import {
  useFleetGraphBulkPublishReportsMutation,
  useFleetGraphReviewSessionQuery,
} from '@/hooks/useFleetGraphReportsQuery';

const STATUS_STYLES: Record<'green' | 'yellow' | 'red', string> = {
  green: 'bg-green-500/10 text-green-300 border-green-500/30',
  yellow: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  red: 'bg-red-500/10 text-red-300 border-red-500/30',
};

export function FleetGraphReviewSessionPage() {
  const sessionQuery = useFleetGraphReviewSessionQuery();
  const bulkPublishMutation = useFleetGraphBulkPublishReportsMutation();
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);

  const findings = sessionQuery.data?.findings ?? [];
  const grouped = useMemo(() => ({
    red: findings.filter((finding) => finding.focusQualityStatus === 'red'),
    yellow: findings.filter((finding) => finding.focusQualityStatus === 'yellow'),
    other: findings.filter(
      (finding) =>
        finding.focusQualityStatus !== 'red' && finding.focusQualityStatus !== 'yellow'
    ),
  }), [findings]);
  const visibleDraftReportIds = useMemo(
    () => [...new Set(findings.filter((finding) => finding.reportState === 'draft').map((finding) => finding.reportId))],
    [findings]
  );
  const allDraftsSelected =
    visibleDraftReportIds.length > 0 &&
    visibleDraftReportIds.every((reportId) => selectedReportIds.includes(reportId));

  if (sessionQuery.isLoading) {
    return <PageShell>Loading FleetGraph review session...</PageShell>;
  }

  if (sessionQuery.error || !sessionQuery.data) {
    return <PageShell>Failed to load FleetGraph review session.</PageShell>;
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            FleetGraph Batch Review
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-white">Review Session</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Review the current FleetGraph batch as one working set. Triage the highest-risk findings first, then publish the drafts that are ready.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to="/team/reviews/fleetgraph"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
          >
            Back To Queue
          </Link>
          <button
            type="button"
            onClick={() =>
              setSelectedReportIds((current) =>
                allDraftsSelected
                  ? current.filter((id) => !visibleDraftReportIds.includes(id))
                  : [...new Set([...current, ...visibleDraftReportIds])]
              )
            }
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
          >
            {allDraftsSelected ? 'Clear Selection' : 'Select Drafts'}
          </button>
          <button
            type="button"
            onClick={() => bulkPublishMutation.mutate(selectedReportIds)}
            disabled={selectedReportIds.length === 0 || bulkPublishMutation.isPending}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bulkPublishMutation.isPending
              ? 'Publishing...'
              : `Publish Selected (${selectedReportIds.length})`}
          </button>
        </div>
      </div>

      <div className="text-sm text-slate-400">
        {sessionQuery.data.totalReports} reports · {sessionQuery.data.totalFindings} findings · {sessionQuery.data.redFindings} red · {sessionQuery.data.yellowFindings} yellow
      </div>

      <section className="grid gap-4 xl:grid-cols-3">
        <FindingLane
          title="Red Findings"
          subtitle="Highest-risk items."
          findings={grouped.red}
          selectedReportIds={selectedReportIds}
          onToggleReportId={(reportId) =>
            setSelectedReportIds((current) =>
              current.includes(reportId)
                ? current.filter((id) => id !== reportId)
                : [...current, reportId]
            )
          }
        />
        <FindingLane
          title="Yellow Findings"
          subtitle="Needs tightening."
          findings={grouped.yellow}
          selectedReportIds={selectedReportIds}
          onToggleReportId={(reportId) =>
            setSelectedReportIds((current) =>
              current.includes(reportId)
                ? current.filter((id) => id !== reportId)
                : [...current, reportId]
            )
          }
        />
        <FindingLane
          title="Other Findings"
          subtitle="Everything else."
          findings={grouped.other}
          selectedReportIds={selectedReportIds}
          onToggleReportId={(reportId) =>
            setSelectedReportIds((current) =>
              current.includes(reportId)
                ? current.filter((id) => id !== reportId)
                : [...current, reportId]
            )
          }
        />
      </section>
    </PageShell>
  );
}

function FindingLane({
  title,
  subtitle,
  findings,
  selectedReportIds,
  onToggleReportId,
}: {
  title: string;
  subtitle: string;
  findings: Array<{
    reportId: string;
    reportTitle: string;
    reportState: 'draft' | 'published';
    reportQualityStatus: 'green' | 'yellow' | 'red' | null;
    rootDocumentId: string | null;
    rootDocumentTitle: string | null;
    rootDocumentType: string | null;
    focusDocumentId: string;
    focusDocumentTitle: string;
    focusDocumentType: string;
    focusQualityStatus: 'green' | 'yellow' | 'red' | null;
    focusQualityScore: number | null;
    focusQualitySummary: string | null;
    directorFeedbackSentAt: string | null;
    directorResponseOptionsCount: number;
  }>;
  selectedReportIds: string[];
  onToggleReportId: (reportId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm shadow-black/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white">{title}</h2>
          <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
        </div>
        <div className="text-xs text-slate-500">{findings.length}</div>
      </div>

      <div className="mt-4 space-y-3">
        {findings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-black px-3 py-5 text-sm text-slate-500">
            No items in this lane.
          </div>
        ) : (
          findings.map((finding) => (
            <div key={`${finding.reportId}-${finding.focusDocumentId}`} className="rounded-xl border border-slate-800 bg-black p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {finding.reportState === 'draft' && (
                      <button
                        type="button"
                        onClick={() => onToggleReportId(finding.reportId)}
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded border text-[10px] font-bold transition-colors',
                          selectedReportIds.includes(finding.reportId)
                            ? 'border-white bg-white text-black'
                            : 'border-slate-700 bg-slate-950 text-slate-400 hover:bg-slate-900'
                        )}
                      >
                        {selectedReportIds.includes(finding.reportId) ? '✓' : ''}
                      </button>
                    )}
                    <div className="text-sm font-medium text-white">{finding.focusDocumentTitle}</div>
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">
                      {finding.focusDocumentType}
                    </span>
                    <StatusBadge status={finding.focusQualityStatus} score={finding.focusQualityScore} />
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    {finding.focusQualitySummary ?? 'No persisted summary yet.'}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
                    <span>Report: {finding.reportTitle}</span>
                    {finding.rootDocumentTitle && (
                      <span>
                        Root: {finding.rootDocumentTitle}
                        {finding.rootDocumentType ? ` (${finding.rootDocumentType})` : ''}
                      </span>
                    )}
                    <span>{finding.reportState}</span>
                    {finding.directorResponseOptionsCount > 0 && (
                      <span>{finding.directorResponseOptionsCount} director options</span>
                    )}
                    {finding.directorFeedbackSentAt && (
                      <span>Feedback sent {formatFleetGraphTimestamp(finding.directorFeedbackSentAt)}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Link
                    to={`/team/reviews/fleetgraph/${finding.reportId}`}
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                  >
                    Open
                  </Link>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function StatusBadge({
  status,
  score,
}: {
  status: 'green' | 'yellow' | 'red' | null;
  score: number | null;
}) {
  if (!status || typeof score !== 'number') {
    return null;
  }

  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
        STATUS_STYLES[status]
      )}
    >
      {status} {Math.round(score * 100)}%
    </span>
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

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-auto bg-black">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">{children}</div>
    </div>
  );
}
