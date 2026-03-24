import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bulkPublishMutate = vi.fn();
const bulkDeleteMutate = vi.fn();
const publishMutate = vi.fn();
const directorFeedbackMutate = vi.fn();
const scanMutate = vi.fn();

const mockReports = [
  {
    id: 'report-draft-red',
    title: 'FleetGraph Quality Report: Project Alpha',
    rootDocumentId: 'project-1',
    rootDocumentTitle: 'Project Alpha',
    rootDocumentType: 'project',
    state: 'draft',
    qualityStatus: 'red',
    qualityScore: 0.42,
    executiveSummary: 'Project Alpha is not ready to execute yet.',
    generatedAt: '2026-03-18T01:00:00.000Z',
    updatedAt: '2026-03-18T01:05:00.000Z',
    publishedAt: null,
    directorResponseOptions: [],
    directorFeedbackSentAt: null,
  },
  {
    id: 'report-draft-yellow',
    title: 'FleetGraph Quality Report: Project Beta',
    rootDocumentId: 'project-2',
    rootDocumentTitle: 'Project Beta',
    rootDocumentType: 'project',
    state: 'draft',
    qualityStatus: 'yellow',
    qualityScore: 0.61,
    executiveSummary: 'Project Beta needs a few execution-readiness fixes.',
    generatedAt: '2026-03-18T02:00:00.000Z',
    updatedAt: '2026-03-18T02:05:00.000Z',
    publishedAt: null,
    directorResponseOptions: [],
    directorFeedbackSentAt: null,
  },
  {
    id: 'report-published',
    title: 'FleetGraph Quality Report: Project Gamma',
    rootDocumentId: 'project-3',
    rootDocumentTitle: 'Project Gamma',
    rootDocumentType: 'project',
    state: 'published',
    qualityStatus: 'green',
    qualityScore: 0.91,
    executiveSummary: 'Project Gamma is ready to execute.',
    generatedAt: '2026-03-18T03:00:00.000Z',
    updatedAt: '2026-03-18T03:05:00.000Z',
    publishedAt: '2026-03-18T03:10:00.000Z',
    directorResponseOptions: [
      {
        label: 'Acknowledge healthy graph',
        message: 'Keep execution moving and rescan if context changes.',
        targetDocumentId: 'project-3',
      },
    ],
    directorFeedbackSentAt: null,
  },
];

const mockQueueStatus = {
  batchIntervalMs: 300000,
  maxDocumentsPerFlush: 10,
  isFlushing: false,
  leaseTimeoutMs: 600000,
  pendingCount: 2,
  runningCount: 1,
  failedCount: 0,
  completedCount: 12,
  lastFlushStartedAt: '2026-03-18T04:00:00.000Z',
  lastFlushCompletedAt: '2026-03-18T04:05:00.000Z',
  workspaceGroups: [{ workspaceId: 'workspace-1', pendingCount: 2, runningCount: 1 }],
  pendingDocuments: [
    {
      id: 'job-1',
      workspaceId: 'workspace-1',
      documentId: 'project-1',
      source: 'save',
      documentType: 'project',
      userId: 'user-1',
      contentHash: 'hash-1',
      status: 'running',
      attemptCount: 1,
      leasedBy: 'worker-1',
      createdAt: '2026-03-18T03:58:00.000Z',
      updatedAt: '2026-03-18T04:01:00.000Z',
    },
  ],
};

const mockReadiness = {
  ready: false,
  deployment: {
    nodeEnv: 'test',
    publicBaseUrl: null,
    internalApiUrl: 'http://api.test',
    publiclyAccessible: false,
  },
  runtime: {
    shipApiTokenConfigured: true,
    openAiConfigured: false,
    langSmithEnabled: true,
    langSmithProject: 'fleetgraph-test',
    queueIntervalMs: 300000,
    maxDocumentsPerFlush: 10,
    collaborationIdleMs: 30000,
    maxGraphDepth: 3,
    maxGraphDocuments: 25,
    interactiveGraphDepth: 1,
    interactiveGraphDocuments: 20,
    interactiveAnalysisMode: 'deterministic' as const,
    proactiveAnalysisMode: 'reasoning' as const,
  },
  routes: {
    insights: '/api/fleetgraph/documents/:id',
    reports: '/api/fleetgraph/reports',
    reviewSession: '/api/fleetgraph/review-session',
    nightlyScanApi: '/api/fleetgraph/nightly-scan',
    nightlyScanScript: 'pnpm fleetgraph:nightly-scan',
  },
  missing: ['OPENAI_API_KEY', 'SHIP_PUBLIC_BASE_URL'],
};

vi.mock('@/hooks/useFleetGraphReportsQuery', () => ({
  useFleetGraphReportsQuery: () => ({
    isLoading: false,
    error: null,
    data: mockReports,
  }),
  useFleetGraphQueueStatusQuery: () => ({
    data: mockQueueStatus,
  }),
  useFleetGraphReadinessQuery: () => ({
    data: mockReadiness,
  }),
  useFleetGraphPublishReportMutation: () => ({
    mutate: publishMutate,
    isPending: false,
  }),
  useFleetGraphDirectorFeedbackMutation: () => ({
    mutate: directorFeedbackMutate,
    isPending: false,
  }),
  useFleetGraphBulkPublishReportsMutation: () => ({
    mutate: bulkPublishMutate,
    isPending: false,
  }),
  useFleetGraphBulkDeleteReportsMutation: () => ({
    mutate: bulkDeleteMutate,
    isPending: false,
  }),
  useFleetGraphWorkspaceScanMutation: () => ({
    mutate: scanMutate,
    isPending: false,
    data: null,
  }),
}));

import { FleetGraphReportsPage } from './FleetGraphReportsPage';

function renderPage() {
  return render(
    <BrowserRouter>
      <FleetGraphReportsPage />
    </BrowserRouter>
  );
}

describe('FleetGraphReportsPage', () => {
  beforeEach(() => {
    bulkPublishMutate.mockReset();
    bulkDeleteMutate.mockReset();
    publishMutate.mockReset();
    directorFeedbackMutate.mockReset();
    scanMutate.mockReset();
  });

  it('renders diagnostics and report sections', () => {
    renderPage();

    expect(screen.getByText('FleetGraph Reports')).toBeInTheDocument();
    expect(screen.getByText('FleetGraph Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('Worker Activity')).toBeInTheDocument();
    expect(screen.getByText('1 running')).toBeInTheDocument();
    expect(screen.getByText(/source save/i)).toBeInTheDocument();
    expect(screen.getByText('Draft Reports')).toBeInTheDocument();
    expect(screen.getByText('Published Reports')).toBeInTheDocument();
  });

  it('filters the queue by severity and search text', () => {
    renderPage();

    fireEvent.change(screen.getByRole('combobox', { name: /Severity/i }), {
      target: { value: 'red' },
    });
    expect(screen.getByText('FleetGraph Quality Report: Project Alpha')).toBeInTheDocument();
    expect(screen.queryByText('FleetGraph Quality Report: Project Beta')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search reports or root document IDs'), {
      target: { value: 'gamma' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: /Severity/i }), {
      target: { value: 'all' },
    });

    expect(screen.getByText('FleetGraph Quality Report: Project Gamma')).toBeInTheDocument();
    expect(screen.queryByText('FleetGraph Quality Report: Project Alpha')).not.toBeInTheDocument();
  });

  it('selects visible draft reports and bulk publishes them', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Select Visible' }));
    expect(screen.getByRole('button', { name: 'Publish Selected (2)' })).toBeInTheDocument();
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Publish Selected (2)' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Publish selected FleetGraph reports?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Publish (2)' }));
    expect(bulkPublishMutate).toHaveBeenCalledWith(['report-draft-red', 'report-draft-yellow'], expect.any(Object));
  });

  it('selects visible draft reports and bulk deletes them', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Select Visible' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Selected (2)' }));

    expect(screen.getByText('Delete selected FleetGraph reports?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete (2)' }));
    expect(bulkDeleteMutate).toHaveBeenCalledWith(['report-draft-red', 'report-draft-yellow'], expect.any(Object));
  });

  it('runs scan actions from the queue header', () => {
    renderPage();

    fireEvent.click(screen.getByText('FleetGraph Diagnostics'));
    fireEvent.click(screen.getByRole('button', { name: 'Run Workspace Scan' }));

    expect(scanMutate).toHaveBeenNthCalledWith(1, false);
  });
});
