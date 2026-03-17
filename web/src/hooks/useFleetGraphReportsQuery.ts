import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

export interface FleetGraphReportListItem {
  id: string;
  title: string;
  rootDocumentId: string | null;
  qualityStatus: 'green' | 'yellow' | 'red' | null;
  qualityScore: number | null;
  generatedAt: string | null;
  updatedAt: string | null;
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
