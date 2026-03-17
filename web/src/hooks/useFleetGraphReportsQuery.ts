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

async function fetchFleetGraphReports(): Promise<FleetGraphReportListItem[]> {
  const response = await apiGet('/api/fleetgraph/reports');
  if (!response.ok) {
    throw new Error('Failed to fetch FleetGraph reports');
  }

  const payload = (await response.json()) as { reports: FleetGraphReportListItem[] };
  return payload.reports;
}

async function fetchFleetGraphQueueStatus(): Promise<FleetGraphQueueStatus> {
  const response = await apiGet('/api/fleetgraph/queue-status');
  if (!response.ok) {
    throw new Error('Failed to fetch FleetGraph queue status');
  }

  return response.json() as Promise<FleetGraphQueueStatus>;
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
        queryClient.invalidateQueries({ queryKey: ['document'] }),
      ]);
    },
  });
}
