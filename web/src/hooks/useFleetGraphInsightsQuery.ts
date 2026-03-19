import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';

export interface FleetGraphInsightsDocumentAnalysis {
  documentId: string;
  documentType: string;
  qualityScore: number;
  qualityStatus: 'green' | 'yellow' | 'red';
  summary: string;
  tags: Array<{
    key: string;
    label: string;
    severity: 'high' | 'medium' | 'low';
    source?: string | null;
  }>;
}

export interface FleetGraphInsightsResponse {
  rootDocumentId: string;
  triggerSource: string;
  nodeIds: string[];
  graph: {
    rootDocumentId: string;
    metadata: {
      maxDepthReached: number;
      truncated: boolean;
      depthLimit: number;
      documentLimit: number;
    };
    nodes: Array<{
      id: string;
      documentType: string;
      title: string;
      parentId: string | null;
      belongsTo: Array<{
        id: string;
        type: string;
        title?: string;
        color?: string;
      }>;
    }>;
    edges: Array<{
      from: string;
      to: string;
      relationshipType: string;
      direction: string;
    }>;
  };
  scoringPayload: {
    rootDocumentId: string;
    documentCount: number;
    edgeCount: number;
    maxDepthReached: number;
    truncated: boolean;
    documents: Array<{
      id: string;
      documentType: string;
      title: string;
      summaryText: string;
      hasContent: boolean;
      qualityScore: number | null;
      qualityStatus: string | null;
      ownerId: string | null;
      tags: string[];
      belongsToIds: string[];
    }>;
  };
  analysis: {
    generatedAt: string;
    rootDocumentId: string;
    mode: 'deterministic' | 'gpt-4o';
    model: string | null;
    executiveSummary: string;
    remediationSuggestions: Array<{
      title: string;
      priority: 'high' | 'medium' | 'low';
      rationale: string;
      document_id?: string | null;
    }>;
    documents: FleetGraphInsightsDocumentAnalysis[];
  };
}

export interface FleetGraphChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface FleetGraphChatResponse {
  answer: string;
  suggestedPrompts: string[];
}

export const fleetGraphInsightsKeys = {
  all: ['fleetgraph-insights'] as const,
  detail: (id: string) => [...fleetGraphInsightsKeys.all, id] as const,
};

async function fetchFleetGraphInsights(documentId: string): Promise<FleetGraphInsightsResponse> {
  const res = await apiGet(`/api/fleetgraph/documents/${documentId}`);
  if (!res.ok) {
    const error = new Error('Failed to fetch FleetGraph insights') as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export function useFleetGraphInsightsQuery(
  documentId: string | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: fleetGraphInsightsKeys.detail(documentId || ''),
    queryFn: () => fetchFleetGraphInsights(documentId!),
    enabled: enabled && !!documentId,
    staleTime: 30_000,
  });
}

export function useFleetGraphPersistMutation(documentId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await apiPost(`/api/fleetgraph/documents/${documentId}/persist`, {});
      if (!res.ok) {
        throw new Error('Failed to persist FleetGraph analysis');
      }
      return res.json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: fleetGraphInsightsKeys.detail(documentId || '') }),
        queryClient.invalidateQueries({ queryKey: ['document', documentId] }),
      ]);
    },
  });
}

export function useFleetGraphReportDraftMutation(documentId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await apiPost(`/api/fleetgraph/documents/${documentId}/report-draft`, {});
      if (!res.ok) {
        throw new Error('Failed to create FleetGraph report draft');
      }
      return res.json() as Promise<{ created: boolean; updated: boolean; reportId: string }>;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: fleetGraphInsightsKeys.detail(documentId || '') }),
        queryClient.invalidateQueries({ queryKey: ['document', documentId] }),
        queryClient.invalidateQueries({ queryKey: ['documents'] }),
      ]);
    },
  });
}

export function useFleetGraphChatMutation(documentId: string | undefined) {
  return useMutation({
    mutationFn: async ({
      question,
      history,
    }: {
      question: string;
      history: FleetGraphChatMessage[];
    }) => {
      const res = await apiPost(`/api/fleetgraph/documents/${documentId}/chat`, {
        question,
        history,
      });
      if (!res.ok) {
        throw new Error('Failed to answer FleetGraph question');
      }
      return res.json() as Promise<FleetGraphChatResponse>;
    },
  });
}
