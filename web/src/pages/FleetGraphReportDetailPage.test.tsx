import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const publishMutate = vi.fn();
const directorFeedbackMutate = vi.fn();

vi.mock('@/components/FleetGraphViewer', () => ({
  FleetGraphViewer: ({
    graph,
  }: {
    graph: { nodes: Array<{ id: string }> };
  }) => (
    <div data-testid="fleetgraph-viewer">viewer:{graph.nodes.length}</div>
  ),
}));

vi.mock('@/hooks/useFleetGraphInsightsQuery', () => ({
  useFleetGraphInsightsQuery: () => ({
    isLoading: false,
    data: {
      rootDocumentId: 'project-1',
      triggerSource: 'manual',
      nodeIds: ['project-1', 'issue-1'],
      graph: {
        rootDocumentId: 'project-1',
        metadata: {
          maxDepthReached: 2,
          truncated: false,
          depthLimit: 3,
          documentLimit: 25,
        },
        nodes: [
          {
            id: 'project-1',
            documentType: 'project',
            title: 'Project Alpha',
            parentId: null,
            belongsTo: [],
          },
          {
            id: 'issue-1',
            documentType: 'issue',
            title: 'Issue Missing Acceptance Criteria',
            parentId: null,
            belongsTo: [],
          },
        ],
        edges: [
          {
            from: 'project-1',
            to: 'issue-1',
            relationshipType: 'project',
            direction: 'outbound',
          },
        ],
      },
      scoringPayload: {
        rootDocumentId: 'project-1',
        documentCount: 2,
        edgeCount: 1,
        maxDepthReached: 2,
        truncated: false,
        documents: [],
      },
      analysis: {
        generatedAt: '2026-03-18T04:00:00.000Z',
        rootDocumentId: 'project-1',
        mode: 'deterministic',
        model: null,
        remediationSuggestions: [],
        documents: [
          {
            documentId: 'project-1',
            documentType: 'project',
            qualityScore: 0.45,
            qualityStatus: 'red',
            summary: 'Project summary is too thin.',
            tags: [],
          },
          {
            documentId: 'issue-1',
            documentType: 'issue',
            qualityScore: 0.31,
            qualityStatus: 'red',
            summary: 'Acceptance criteria are missing.',
            tags: [],
          },
        ],
      },
    },
  }),
}));

vi.mock('@/hooks/useFleetGraphReportsQuery', () => ({
  useFleetGraphReportDetailQuery: () => ({
    isLoading: false,
    error: null,
    data: {
      report: {
        id: 'report-1',
        title: 'FleetGraph Quality Report: Project Alpha',
        rootDocumentId: 'project-1',
        rootDocumentTitle: 'Project Alpha',
        rootDocumentType: 'project',
        state: 'published',
        qualityStatus: 'red',
        qualityScore: 0.45,
        generatedAt: '2026-03-18T04:00:00.000Z',
        updatedAt: '2026-03-18T04:10:00.000Z',
        publishedAt: '2026-03-18T04:15:00.000Z',
        directorResponseOptions: [
          {
            label: 'Address top blocker',
            message: 'Please address the highest-risk gap before continuing.',
            targetDocumentId: 'issue-1',
          },
        ],
        directorFeedbackSentAt: null,
      },
      reportContentText: '# FleetGraph Quality Report\n\nTop blocker here.',
      rootDocument: {
        id: 'project-1',
        title: 'Project Alpha',
        documentType: 'project',
        qualityStatus: 'red',
        qualityScore: 0.45,
        qualitySummary: 'Project summary is too thin.',
        lastScoredAt: '2026-03-18T04:00:00.000Z',
        directorFeedbackSentAt: null,
      },
      targetDocuments: [
        {
          id: 'issue-1',
          title: 'Issue Missing Acceptance Criteria',
          documentType: 'issue',
          qualityStatus: 'red',
          qualityScore: 0.31,
          qualitySummary: 'Acceptance criteria are missing.',
          directorFeedbackSentAt: null,
        },
      ],
    },
  }),
  useFleetGraphPublishReportMutation: () => ({
    mutate: publishMutate,
    isPending: false,
  }),
  useFleetGraphDirectorFeedbackMutation: () => ({
    mutate: directorFeedbackMutate,
    isPending: false,
  }),
}));

import { FleetGraphReportDetailPage } from './FleetGraphReportDetailPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/team/reviews/fleetgraph/report-1']}>
      <Routes>
        <Route path="/team/reviews/fleetgraph/:id" element={<FleetGraphReportDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('FleetGraphReportDetailPage', () => {
  beforeEach(() => {
    publishMutate.mockReset();
    directorFeedbackMutate.mockReset();
  });

  it('renders the report narrative and loads the live graph snapshot on demand', () => {
    renderPage();

    expect(screen.getByText('FleetGraph Quality Report: Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('Report Narrative')).toBeInTheDocument();
    expect(screen.getByText('Linked Targets')).toBeInTheDocument();
    expect(screen.getByText('Director Responses')).toBeInTheDocument();
    expect(screen.getByText('Live Graph Snapshot')).toBeInTheDocument();
    expect(screen.getByText('Issue Missing Acceptance Criteria')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load Live Snapshot' }));
    expect(screen.getByTestId('fleetgraph-viewer')).toHaveTextContent('viewer:2');
  });
});
