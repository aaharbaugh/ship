import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/Skeleton';
import { FleetGraphViewer } from '@/components/FleetGraphViewer';
import type { FleetGraphDebugResponse } from '@/hooks/useFleetGraphDebugQuery';

export interface PersistedFleetGraphView {
  qualityScore: number;
  qualityStatus: 'green' | 'yellow' | 'red';
  qualitySummary: string;
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

export function FleetGraphDebugPanel({
  data,
  isLoading,
  error,
  persisted,
  onPersist,
  isPersisting,
}: {
  data?: FleetGraphDebugResponse;
  isLoading: boolean;
  error?: Error | null;
  persisted?: PersistedFleetGraphView | null;
  onPersist?: () => void;
  isPersisting?: boolean;
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
  const displayStatus = persisted?.qualityStatus ?? primaryDocument?.qualityStatus;
  const displayScore = persisted?.qualityScore ?? primaryDocument?.qualityScore;
  const displaySummary = persisted?.qualitySummary ?? primaryDocument?.summary;
  const displayTags = persisted?.qualityTags ?? primaryDocument?.tags ?? [];
  const sourceLabel = persisted ? 'Persisted metadata' : 'Live debug analysis';

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
            <button
              type="button"
              onClick={onPersist}
              disabled={isPersisting}
              className="ml-auto rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPersisting ? 'Persisting...' : 'Persist Analysis'}
            </button>
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

        <FleetGraphViewer
          rootDocumentId={data.rootDocumentId}
          graph={data.graph}
        />
      </div>
    </div>
  );
}
