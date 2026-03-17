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

async function fetchFleetGraphReports(): Promise<FleetGraphReportListItem[]> {
  const response = await apiGet('/api/fleetgraph/reports');
  if (!response.ok) {
    throw new Error('Failed to fetch FleetGraph reports');
  }

  const payload = (await response.json()) as { reports: FleetGraphReportListItem[] };
  return payload.reports;
}

export function useFleetGraphReportsQuery() {
  return useQuery({
    queryKey: ['fleetgraph-reports'],
    queryFn: fetchFleetGraphReports,
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
