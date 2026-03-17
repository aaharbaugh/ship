import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/Skeleton';
import { FleetGraphViewer } from '@/components/FleetGraphViewer';
import type { FleetGraphDebugResponse } from '@/hooks/useFleetGraphDebugQuery';
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

const STATUS_STYLES: Record<'green' | 'yellow' | 'red', string> = {
  green: 'bg-green-500/10 text-green-700 border-green-500/20',
  yellow: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  red: 'bg-red-500/10 text-red-700 border-red-500/20',
};

const PRIORITY_STYLES: Record<'high' | 'medium' | 'low', string> = {
  high: 'text-red-700',
  medium: 'text-yellow-700',
  low: 'text-slate-600',
};

const FILTER_BUTTON_BASE =
  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors';

export function FleetGraphDebugPanel({
  data,
  isLoading,
  error,
  persisted,
  onPersist,
  isPersisting,
  onCreateReportDraft,
  isCreatingReportDraft,
  onPublishReport,
  isPublishingReport,
  reports,
}: {
  data?: FleetGraphDebugResponse;
  isLoading: boolean;
  error?: Error | null;
  persisted?: PersistedFleetGraphView | null;
  onPersist?: () => void;
  isPersisting?: boolean;
  onCreateReportDraft?: () => void;
  isCreatingReportDraft?: boolean;
  onPublishReport?: (reportId: string) => void;
  isPublishingReport?: boolean;
  reports?: FleetGraphReportListItem[];
}) {
  if (isLoading) {
    return (
      <div className="border-b border-border bg-slate-50/70 px-4 py-3">
        <div className="mx-auto max-w-6xl space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="border-b border-border bg-slate-50/70 px-4 py-3">
        <div className="mx-auto max-w-6xl text-xs text-muted">
          FleetGraph debug unavailable.
        </div>
      </div>
    );
  }

  const primaryDocument =
    data.analysis.documents.find((document) => document.documentId === data.rootDocumentId) ??
    data.analysis.documents[0];
  const availableTypes = useMemo(
    () => Array.from(new Set(data.graph.nodes.map((node) => node.documentType))).sort(),
    [data.graph.nodes]
  );
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const filteredGraph = useMemo(() => {
    if (activeTypes.length === 0) {
      return data.graph;
    }

    const allowed = new Set(
      data.graph.nodes
        .filter((node) => node.id === data.rootDocumentId || activeTypes.includes(node.documentType))
        .map((node) => node.id)
    );

    return {
      ...data.graph,
      nodes: data.graph.nodes.filter((node) => allowed.has(node.id)),
      edges: data.graph.edges.filter((edge) => allowed.has(edge.from) && allowed.has(edge.to)),
    };
  }, [activeTypes, data.graph, data.rootDocumentId]);
  const [selectedNodeId, setSelectedNodeId] = useState(data.rootDocumentId);
  const effectiveSelectedNodeId = filteredGraph.nodes.some((node) => node.id === selectedNodeId)
    ? selectedNodeId
    : data.rootDocumentId;
  const selectedAnalysis =
    data.analysis.documents.find((document) => document.documentId === effectiveSelectedNodeId) ??
    primaryDocument;
  const selectedGraphNode = filteredGraph.nodes.find((node) => node.id === effectiveSelectedNodeId);
  const selectedScoringDocument = data.scoringPayload.documents.find((document) => document.id === effectiveSelectedNodeId);
  const connectedEdges = useMemo(
    () => filteredGraph.edges.filter((edge) => edge.from === effectiveSelectedNodeId || edge.to === effectiveSelectedNodeId),
    [effectiveSelectedNodeId, filteredGraph.edges]
  );
  const displayStatus = persisted?.qualityStatus ?? primaryDocument?.qualityStatus;
  const displayScore = persisted?.qualityScore ?? primaryDocument?.qualityScore;
  const displaySummary = persisted?.qualitySummary ?? primaryDocument?.summary;
  const displayTags = persisted?.qualityTags ?? primaryDocument?.tags ?? [];
  const qualityReportId = persisted?.qualityReportId ?? null;
  const linkedReport = reports?.find((report) => report.id === qualityReportId);
  const sourceLabel = persisted
    ? 'Persisted metadata'
    : data.analysis.mode === 'gpt-4o'
      ? `Live ${data.analysis.model ?? 'gpt-4o'} analysis`
      : 'Live deterministic analysis';

  return (
    <div className="border-b border-border bg-slate-50/70 px-4 py-3">
      <div className="mx-auto max-w-6xl space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-medium text-foreground">FleetGraph Debug</span>
          <span>{sourceLabel}</span>
          <span>{data.scoringPayload.documentCount} docs</span>
          <span>{data.scoringPayload.edgeCount} edges</span>
          <span>{persisted?.lastScoredAt || data.analysis.generatedAt}</span>
          {onPersist && (
            <div className="ml-auto flex items-center gap-2">
              {onCreateReportDraft && (
                <button
                  type="button"
                  onClick={onCreateReportDraft}
                  disabled={isCreatingReportDraft || !!qualityReportId}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {qualityReportId
                    ? 'Draft Report Linked'
                    : isCreatingReportDraft
                      ? 'Creating Report...'
                      : 'Create Draft Report'}
                </button>
              )}
              {qualityReportId && (
                <a
                  href={`/documents/${qualityReportId}`}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-slate-100"
                >
                  Open Draft Report
                </a>
              )}
              {qualityReportId && linkedReport?.state !== 'published' && onPublishReport && (
                <button
                  type="button"
                  onClick={() => onPublishReport(qualityReportId)}
                  disabled={isPublishingReport}
                  className="rounded-md border border-border bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPublishingReport ? 'Publishing...' : 'Publish Report'}
                </button>
              )}
              <button
                type="button"
                onClick={onPersist}
                disabled={isPersisting}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPersisting ? 'Persisting...' : 'Persist Analysis'}
              </button>
            </div>
          )}
        </div>

        {displayStatus && typeof displayScore === 'number' && displaySummary && (
          <div className="flex flex-wrap items-start gap-3">
            <div className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-wide',
              STATUS_STYLES[displayStatus]
            )}>
              {displayStatus} {Math.round(displayScore * 100)}%
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-foreground">
                {displaySummary}
              </p>
              {displayTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {displayTags.map((tag) => (
                    <span
                      key={`${tag.key}-${tag.label}`}
                      className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted"
                    >
                      {tag.label}
                    </span>
                  ))}
                </div>
              )}
              {qualityReportId && (
                <div className="text-xs text-muted">
                  Linked report {linkedReport?.state === 'published' ? 'published.' : 'ready for review.'}
                </div>
              )}
            </div>
          </div>
        )}

        {!persisted && data.analysis.remediationSuggestions.length > 0 && (
          <div className="grid gap-2 md:grid-cols-2">
            {data.analysis.remediationSuggestions.slice(0, 4).map((suggestion, index) => (
              <div key={`${suggestion.title}-${index}`} className="rounded-md border border-border bg-background px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">{suggestion.title}</span>
                  <span className={cn('text-xs font-medium uppercase', PRIORITY_STYLES[suggestion.priority])}>
                    {suggestion.priority}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">{suggestion.rationale}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTypes([])}
            className={cn(
              FILTER_BUTTON_BASE,
              activeTypes.length === 0
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-border bg-background text-muted hover:bg-slate-100'
            )}
          >
            All
          </button>
          {availableTypes.map((documentType) => {
            const active = activeTypes.includes(documentType);
            return (
              <button
                key={documentType}
                type="button"
                onClick={() =>
                  setActiveTypes((current) =>
                    current.includes(documentType)
                      ? current.filter((type) => type !== documentType)
                      : [...current, documentType]
                  )
                }
                className={cn(
                  FILTER_BUTTON_BASE,
                  active
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-border bg-background text-muted hover:bg-slate-100'
                )}
              >
                {documentType}
              </button>
            );
          })}
        </div>

        <FleetGraphViewer
          rootDocumentId={data.rootDocumentId}
          graph={filteredGraph}
          selectedNodeId={effectiveSelectedNodeId}
          onSelectNode={setSelectedNodeId}
        />

        {reports && reports.length > 0 && (
          <div className="rounded-xl border border-border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">Recent FleetGraph Reports</h3>
              <span className="text-xs text-muted">{reports.length} linked drafts</span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {reports.slice(0, 6).map((report) => (
                <a
                  key={report.id}
                  href={`/documents/${report.id}`}
                  className="rounded-lg border border-border bg-slate-50 px-3 py-2 transition-colors hover:bg-slate-100"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">{report.title}</span>
                    {report.qualityStatus && typeof report.qualityScore === 'number' && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-muted">
                          {report.state}
                        </span>
                        <span
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
                            STATUS_STYLES[report.qualityStatus]
                          )}
                        >
                          {report.qualityStatus} {Math.round(report.qualityScore * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {report.state === 'published'
                      ? report.publishedAt ?? report.updatedAt ?? 'No timestamp'
                      : report.generatedAt ?? report.updatedAt ?? 'No timestamp'}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {selectedAnalysis && selectedGraphNode && (
          <div className="rounded-xl border border-border bg-white p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-wide',
                STATUS_STYLES[selectedAnalysis.qualityStatus]
              )}>
                {selectedAnalysis.qualityStatus} {Math.round(selectedAnalysis.qualityScore * 100)}%
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{selectedGraphNode.title}</h3>
                  <span className="text-xs uppercase tracking-wide text-muted">
                    {selectedGraphNode.documentType}
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground">{selectedAnalysis.summary}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted">Tags</div>
                <div className="flex flex-wrap gap-2">
                  {selectedAnalysis.tags.length > 0 ? selectedAnalysis.tags.map((tag) => (
                    <span
                      key={`${selectedAnalysis.documentId}-${tag.key}`}
                      className="rounded-full border border-border bg-slate-50 px-2 py-0.5 text-xs text-muted"
                    >
                      {tag.label}
                    </span>
                  )) : (
                    <span className="text-xs text-muted">No findings</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted">Graph Context</div>
                <div className="space-y-1 text-xs text-muted">
                  <div>Connected edges: {connectedEdges.length}</div>
                  <div>Parent: {selectedGraphNode.parentId ?? 'None'}</div>
                  <div>Belongs to: {selectedGraphNode.belongsTo.length > 0 ? selectedGraphNode.belongsTo.map((item) => item.type).join(', ') : 'None'}</div>
                  <div>Owner: {selectedScoringDocument?.ownerId ?? 'None'}</div>
                </div>
              </div>
            </div>

            {selectedScoringDocument?.summaryText && (
              <div className="mt-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted">Summary Text</div>
                <p className="mt-1 text-xs leading-5 text-muted">{selectedScoringDocument.summaryText}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
