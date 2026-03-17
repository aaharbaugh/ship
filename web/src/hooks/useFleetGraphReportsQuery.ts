import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';

export interface FleetGraphReportListItem {
  id: string;
  title: string;
  rootDocumentId: string | null;
  rootDocumentTitle: string | null;
  rootDocumentType: string | null;
  state: 'draft' | 'published';
  qualityStatus: 'green' | 'yellow' | 'red' | null;
  qualityScore: number | null;
  generatedAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
  directorResponseOptions: Array<{
    label: string;
    message: string;
    targetDocumentId: string | null;
  }>;
  directorFeedbackSentAt: string | null;
}

export interface FleetGraphReportDetail {
  report: FleetGraphReportListItem;
  reportContentText: string;
  rootDocument: {
    id: string;
    title: string;
    documentType: string;
    qualityStatus: 'green' | 'yellow' | 'red' | null;
    qualityScore: number | null;
    qualitySummary: string | null;
    lastScoredAt: string | null;
    directorFeedbackSentAt: string | null;
  } | null;
  targetDocuments: Array<{
    id: string;
    title: string;
    documentType: string;
    qualityStatus: 'green' | 'yellow' | 'red' | null;
    qualityScore: number | null;
    qualitySummary: string | null;
    directorFeedbackSentAt: string | null;
  }>;
}

export interface FleetGraphWorkspaceScanResult {
  workspaceId: string;
  scannedAt: string;
  source: 'nightly_scan';
  totalProjects: number;
  greenProjects: number;
  yellowProjects: number;
  redProjects: number;
  projects: Array<{
    documentId: string;
    title: string;
    qualityStatus: 'green' | 'yellow' | 'red';
    qualityScore: number;
    remediationCount: number;
    mode: 'deterministic' | 'gpt-4o';
    model: string | null;
    qualityReportId: string | null;
  }>;
}

export interface FleetGraphReviewSession {
  generatedAt: string;
  totalReports: number;
  totalFindings: number;
  redFindings: number;
  yellowFindings: number;
  draftReports: number;
  publishedReports: number;
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
}

export interface FleetGraphQueueStatus {
  batchIntervalMs: number;
  maxDocumentsPerFlush: number;
  isFlushing: boolean;
  pendingCount: number;
  lastFlushStartedAt: string | null;
  lastFlushCompletedAt: string | null;
  workspaceGroups: Array<{
    workspaceId: string;
    pendingCount: number;
  }>;
  pendingDocuments: Array<{
    workspaceId: string;
    documentId: string;
    source: string;
    documentType?: string | null;
    userId?: string | null;
  }>;
}

export interface FleetGraphReadinessStatus {
  ready: boolean;
  deployment: {
    nodeEnv: string;
    publicBaseUrl: string | null;
    internalApiUrl: string | null;
    publiclyAccessible: boolean;
  };
  runtime: {
    shipApiTokenConfigured: boolean;
    openAiConfigured: boolean;
    langSmithEnabled: boolean;
    langSmithProject: string | null;
    queueIntervalMs: number;
    maxDocumentsPerFlush: number;
    collaborationIdleMs: number;
    maxGraphDepth: number;
    maxGraphDocuments: number;
  };
  routes: {
    insights: string;
    reports: string;
    reviewSession: string;
    nightlyScanApi: string;
    nightlyScanScript: string;
  };
  missing: string[];
}

async function fetchFleetGraphReports(): Promise<FleetGraphReportListItem[]> {
  const response = await apiGet('/api/fleetgraph/reports');
  if (!response.ok) {
    throw new Error('Failed to fetch FleetGraph reports');
  }

  const payload = (await response.json()) as { reports: FleetGraphReportListItem[] };
  return payload.reports;
}

async function fetchFleetGraphReportDetail(reportId: string): Promise<FleetGraphReportDetail> {
  const response = await apiGet(`/api/fleetgraph/reports/${reportId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch FleetGraph report detail');
  }

  const payload = (await response.json()) as { report: FleetGraphReportDetail };
  return payload.report;
}

async function fetchFleetGraphQueueStatus(): Promise<FleetGraphQueueStatus> {
  const response = await apiGet('/api/fleetgraph/queue-status');
  if (!response.ok) {
    throw new Error('Failed to fetch FleetGraph queue status');
  }

  return response.json() as Promise<FleetGraphQueueStatus>;
}

async function fetchFleetGraphReviewSession(): Promise<FleetGraphReviewSession> {
  const response = await apiGet('/api/fleetgraph/review-session');
  if (!response.ok) {
    throw new Error('Failed to fetch FleetGraph review session');
  }

  const payload = (await response.json()) as { session: FleetGraphReviewSession };
  return payload.session;
}

async function fetchFleetGraphReadiness(): Promise<FleetGraphReadinessStatus> {
  const response = await apiGet('/api/fleetgraph/readiness');
  if (!response.ok) {
    throw new Error('Failed to fetch FleetGraph readiness');
  }

  return response.json() as Promise<FleetGraphReadinessStatus>;
}

export function useFleetGraphReportsQuery() {
  return useQuery({
    queryKey: ['fleetgraph-reports'],
    queryFn: fetchFleetGraphReports,
    staleTime: 30_000,
  });
}

export function useFleetGraphQueueStatusQuery() {
  return useQuery({
    queryKey: ['fleetgraph-queue-status'],
    queryFn: fetchFleetGraphQueueStatus,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useFleetGraphReviewSessionQuery() {
  return useQuery({
    queryKey: ['fleetgraph-review-session'],
    queryFn: fetchFleetGraphReviewSession,
    staleTime: 30_000,
  });
}

export function useFleetGraphReadinessQuery() {
  return useQuery({
    queryKey: ['fleetgraph-readiness'],
    queryFn: fetchFleetGraphReadiness,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useFleetGraphReportDetailQuery(reportId: string | undefined) {
  return useQuery({
    queryKey: ['fleetgraph-report-detail', reportId],
    queryFn: () => fetchFleetGraphReportDetail(reportId!),
    enabled: !!reportId,
    staleTime: 30_000,
  });
}

export function useFleetGraphPublishReportMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reportId: string) => {
      const response = await apiPost(`/api/fleetgraph/reports/${reportId}/publish`, {});
      if (!response.ok) {
        throw new Error('Failed to publish FleetGraph report');
      }

      return response.json() as Promise<{ reportId: string; publishedAt: string }>;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fleetgraph-reports'] }),
        queryClient.invalidateQueries({ queryKey: ['fleetgraph-report-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['fleetgraph-review-session'] }),
        queryClient.invalidateQueries({ queryKey: ['document'] }),
      ]);
    },
  });
}

export function useFleetGraphBulkPublishReportsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reportIds: string[]) => {
      return Promise.all(
        reportIds.map(async (reportId) => {
          const response = await apiPost(`/api/fleetgraph/reports/${reportId}/publish`, {});
          if (!response.ok) {
            throw new Error(`Failed to publish FleetGraph report ${reportId}`);
          }

          return response.json() as Promise<{ reportId: string; publishedAt: string }>;
        })
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fleetgraph-reports'] }),
        queryClient.invalidateQueries({ queryKey: ['fleetgraph-report-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['fleetgraph-review-session'] }),
        queryClient.invalidateQueries({ queryKey: ['document'] }),
      ]);
    },
  });
}

export function useFleetGraphWorkspaceScanMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (createDraftReports: boolean) => {
      const response = await apiPost('/api/fleetgraph/nightly-scan', { createDraftReports });
      if (!response.ok) {
        throw new Error('Failed to run FleetGraph workspace scan');
      }

      return response.json() as Promise<FleetGraphWorkspaceScanResult>;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fleetgraph-reports'] }),
        queryClient.invalidateQueries({ queryKey: ['fleetgraph-report-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['fleetgraph-review-session'] }),
        queryClient.invalidateQueries({ queryKey: ['document'] }),
      ]);
    },
  });
}

export function useFleetGraphDirectorFeedbackMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reportId,
      optionIndex,
    }: {
      reportId: string;
      optionIndex: number;
    }) => {
      const response = await apiPost(`/api/fleetgraph/reports/${reportId}/director-feedback`, {
        optionIndex,
      });
      if (!response.ok) {
        throw new Error('Failed to send FleetGraph director feedback');
      }

      return response.json() as Promise<{
        reportId: string;
        sentAt: string;
      }>;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fleetgraph-reports'] }),
        queryClient.invalidateQueries({ queryKey: ['fleetgraph-report-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['fleetgraph-review-session'] }),
        queryClient.invalidateQueries({ queryKey: ['document'] }),
      ]);
    },
  });
}
