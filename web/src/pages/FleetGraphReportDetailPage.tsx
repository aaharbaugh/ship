import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { FleetGraphViewer } from '@/components/FleetGraphViewer';
import { useFleetGraphInsightsQuery } from '@/hooks/useFleetGraphInsightsQuery';
import {
  useFleetGraphDirectorFeedbackMutation,
  useFleetGraphPublishReportMutation,
  useFleetGraphReportDetailQuery,
} from '@/hooks/useFleetGraphReportsQuery';

const STATUS_STYLES: Record<'green' | 'yellow' | 'red', string> = {
  green: 'bg-green-500/10 text-green-300 border-green-500/30',
  yellow: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  red: 'bg-red-500/10 text-red-300 border-red-500/30',
};

export function FleetGraphReportDetailPage() {
  const { id } = useParams();
  const detailQuery = useFleetGraphReportDetailQuery(id);
  const publishMutation = useFleetGraphPublishReportMutation();
  const directorFeedbackMutation = useFleetGraphDirectorFeedbackMutation();
  const [liveSnapshotRequested, setLiveSnapshotRequested] = useState(false);
  const rootDocumentId = detailQuery.data?.rootDocument?.id ?? detailQuery.data?.report.rootDocumentId ?? undefined;
  const insightsQuery = useFleetGraphInsightsQuery(rootDocumentId, liveSnapshotRequested);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(rootDocumentId);
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

  useEffect(() => {
    if (rootDocumentId) {
      setSelectedNodeId((current) => current ?? rootDocumentId);
    }
  }, [rootDocumentId]);

  useEffect(() => {
    setLiveSnapshotRequested(false);
  }, [id]);

  const report = detailQuery.data?.report;
  const graph = insightsQuery.data?.graph;
  const liveAnalysis = insightsQuery.data?.analysis;
  const selectedAnalysis = useMemo(
    () =>
      selectedNodeId && liveAnalysis
        ? liveAnalysis.documents.find((document) => document.documentId === selectedNodeId) ?? null
        : null,
    [liveAnalysis, selectedNodeId]
  );
  const selectedNode = useMemo(
    () =>
      selectedNodeId && graph
        ? graph.nodes.find((node) => node.id === selectedNodeId) ?? null
        : null,
    [graph, selectedNodeId]
  );

  if (detailQuery.isLoading) {
    return <PageShell>Loading FleetGraph report...</PageShell>;
  }

  if (detailQuery.error || !detailQuery.data || !report) {
    return <PageShell>Failed to load FleetGraph report detail.</PageShell>;
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            FleetGraph Review
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-white">{report.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
            <StatusBadge status={report.qualityStatus} score={report.qualityScore} />
            <span className="rounded-full border border-slate-700 bg-black px-2.5 py-1 uppercase tracking-wide">
              {report.state}
            </span>
            <span>Generated {formatFleetGraphTimestamp(report.generatedAt)}</span>
            {report.publishedAt && <span>Published {formatFleetGraphTimestamp(report.publishedAt)}</span>}
            {report.rootDocumentId && (
              <Link to={`/documents/${report.rootDocumentId}`} className="text-white underline underline-offset-4 hover:text-slate-200">
                Open root document
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to="/team/reviews/fleetgraph"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
          >
            Back To Queue
          </Link>
          {report.state === 'draft' && (
            <button
              type="button"
              onClick={() =>
                setPendingAction({
                  type: 'publish',
                  reportId: report.id,
                  title: report.title,
                })
              }
              className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-slate-200"
            >
              Publish Report
            </button>
          )}
        </div>
      </div>

      <div className="text-sm text-slate-400">
        Root: {report.rootDocumentTitle ?? 'Unknown'} · {detailQuery.data.targetDocuments.length} target document{detailQuery.data.targetDocuments.length === 1 ? '' : 's'}
        {report.directorFeedbackSentAt ? ` · feedback sent ${formatFleetGraphTimestamp(report.directorFeedbackSentAt)}` : ''}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-sm shadow-black/30">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white">
              Executive Summary
            </h2>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-200">
            {report.executiveSummary ?? detailQuery.data.rootDocument?.qualitySummary ?? 'No executive summary captured yet.'}
          </p>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-sm shadow-black/30">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white">
              Report Narrative
            </h2>
            <span className="text-xs text-slate-500">
              {detailQuery.data.reportContentText.length} characters
            </span>
          </div>
          <pre className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-200">
            {detailQuery.data.reportContentText || 'No report content extracted yet.'}
          </pre>
        </section>

        <section className="space-y-4">
          <PanelCard title="Root Health">
            {detailQuery.data.rootDocument ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-medium text-white">
                    {detailQuery.data.rootDocument.title}
                  </div>
                  <span className="text-xs uppercase tracking-wide text-slate-500">
                    {detailQuery.data.rootDocument.documentType}
                  </span>
                  <StatusBadge
                    status={detailQuery.data.rootDocument.qualityStatus}
                    score={detailQuery.data.rootDocument.qualityScore}
                  />
                </div>
                <p className="text-sm text-slate-300">
                  {detailQuery.data.rootDocument.qualitySummary ?? 'No persisted quality summary yet.'}
                </p>
                <div className="text-xs text-slate-500">
                  Last scored {formatFleetGraphTimestamp(detailQuery.data.rootDocument.lastScoredAt)}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">No linked root document found.</div>
            )}
          </PanelCard>

          <PanelCard title="Linked Targets">
            <div className="space-y-2">
              {detailQuery.data.targetDocuments.length === 0 ? (
                <div className="text-sm text-slate-500">No explicit target documents on this report yet.</div>
              ) : (
                detailQuery.data.targetDocuments.map((document) => (
                  <Link
                    key={document.id}
                    to={`/documents/${document.id}`}
                    className="block rounded-xl border border-slate-800 bg-black px-3 py-3 hover:bg-slate-900"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-medium text-white">{document.title}</div>
                      <span className="text-[11px] uppercase tracking-wide text-slate-500">
                        {document.documentType}
                      </span>
                      <StatusBadge status={document.qualityStatus} score={document.qualityScore} />
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {document.qualitySummary ?? 'No persisted summary yet.'}
                    </div>
                    {document.directorFeedbackSentAt && (
                      <div className="mt-2 text-[11px] text-slate-500">
                        Director feedback sent {formatFleetGraphTimestamp(document.directorFeedbackSentAt)}
                      </div>
                    )}
                  </Link>
                ))
              )}
            </div>
          </PanelCard>

          <PanelCard title="Director Responses">
            <div className="space-y-2">
              {report.directorResponseOptions.length === 0 ? (
                <div className="text-sm text-slate-500">No director response options generated yet.</div>
              ) : (
                report.directorResponseOptions.map((option, index) => (
                  <div
                    key={`${option.label}-${index}`}
                    className="rounded-xl border border-slate-800 bg-black px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white">{option.label}</div>
                        <div className="mt-1 text-xs text-slate-400">{option.message}</div>
                        {option.targetDocumentId && (
                          <div className="mt-2 text-[11px] text-slate-500">
                            Target document {option.targetDocumentId}
                          </div>
                        )}
                      </div>
                      {report.state === 'published' && (
                        <button
                          type="button"
                          onClick={() =>
                            setPendingAction({
                              type: 'director-feedback',
                              reportId: report.id,
                              reportTitle: report.title,
                              optionIndex: index,
                              optionLabel: option.label,
                              optionMessage: option.message,
                            })
                          }
                          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                        >
                          Send
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </PanelCard>
        </section>
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <PanelCard title="Live Graph Snapshot">
          {!liveSnapshotRequested ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-500">
                This report already includes persisted FleetGraph findings. Load a fresh snapshot only if you want to recompute the current graph.
              </div>
              <button
                type="button"
                onClick={() => setLiveSnapshotRequested(true)}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
              >
                Load Live Snapshot
              </button>
            </div>
          ) : insightsQuery.isLoading ? (
            <div className="text-sm text-slate-500">Loading live FleetGraph insights...</div>
          ) : graph ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                <span>{insightsQuery.data?.scoringPayload.documentCount} docs</span>
                <span>{insightsQuery.data?.scoringPayload.edgeCount} edges</span>
                <span>depth {graph.metadata.maxDepthReached}</span>
                {graph.metadata.truncated && <span>bounded traversal</span>}
              </div>
              <FleetGraphViewer
                rootDocumentId={graph.rootDocumentId}
                graph={graph}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
              />
            </div>
          ) : (
            <div className="text-sm text-slate-500">Live graph snapshot unavailable for this report.</div>
          )}
        </PanelCard>

        <PanelCard title="Live Findings">
          {!liveSnapshotRequested ? (
            <div className="text-sm text-slate-500">
              Live findings are available after you load a fresh snapshot.
            </div>
          ) : selectedNode && selectedAnalysis ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-800 bg-black px-3 py-3 text-xs leading-5 text-slate-400">
                {liveAnalysis?.executiveSummary ?? 'No executive summary available for this live snapshot.'}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-medium text-white">{selectedNode.title}</div>
                <span className="text-[11px] uppercase tracking-wide text-slate-500">
                  {selectedNode.documentType}
                </span>
                <StatusBadge
                  status={selectedAnalysis.qualityStatus}
                  score={selectedAnalysis.qualityScore}
                />
              </div>
              <p className="text-sm text-slate-300">{selectedAnalysis.summary}</p>
              <div className="flex flex-wrap gap-2">
                {selectedAnalysis.tags.map((tag) => (
                  <span
                    key={`${selectedNode.id}-${tag.key}`}
                    className="rounded-full border border-slate-700 bg-black px-2 py-0.5 text-[11px] text-slate-300"
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            </div>
          ) : liveAnalysis ? (
            <div className="space-y-2">
              {liveAnalysis.remediationSuggestions.slice(0, 5).map((suggestion, index) => (
                <div key={`${suggestion.title}-${index}`} className="rounded-xl border border-slate-800 bg-black px-3 py-3">
                  <div className="text-sm font-medium text-white">{suggestion.title}</div>
                  <div className="mt-1 text-xs text-slate-400">{suggestion.rationale}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">No live findings available.</div>
          )}
        </PanelCard>
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
              : 'Publishing should happen only after the PM has reviewed the report and supporting context.'
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
    </PageShell>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-auto bg-black">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">{children}</div>
    </div>
  );
}

function PanelCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-sm shadow-black/30">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white">{title}</h2>
      <div className="mt-4">{children}</div>
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
