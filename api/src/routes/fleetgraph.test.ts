import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockClient = {
    listDocuments: vi.fn(),
    getDocument: vi.fn(),
    getDocumentAssociations: vi.fn(),
    getReverseAssociations: vi.fn(),
    updateDocumentMetadata: vi.fn(),
    deleteDocument: vi.fn(),
    createQualityReportDraft: vi.fn(),
    updateQualityReportDraft: vi.fn(),
  };

  return {
    mockAuthMiddleware: vi.fn((req, _res, next) => {
      req.workspaceId = 'workspace-1';
      req.workspaceRole = 'admin';
      req.userId = 'user-1';
      req.isApiToken = false;
      req.isSuperAdmin = false;
      next();
    }),
    mockClient,
    createFleetGraphSessionClient: vi.fn(() => mockClient),
    createFleetGraphBearerClient: vi.fn(() => mockClient),
    prepareFleetGraphRun: vi.fn(),
    analyzeFleetGraphWithReasoning: vi.fn(),
    persistFleetGraphAnalysis: vi.fn(),
    createFleetGraphQualityReportDraft: vi.fn(),
    updateFleetGraphQualityReportDraft: vi.fn(),
    deleteFleetGraphQualityReport: vi.fn(),
    publishFleetGraphQualityReport: vi.fn(),
    getFleetGraphReportDetail: vi.fn(),
    getFleetGraphReviewSession: vi.fn(),
    listFleetGraphReports: vi.fn(),
    runFleetGraphWorkspaceScan: vi.fn(),
    getFleetGraphQueueStatus: vi.fn(),
    sendFleetGraphDirectorFeedback: vi.fn(),
    getFleetGraphReadinessStatus: vi.fn(),
    answerFleetGraphQuestion: vi.fn(),
  };
});

vi.mock('../services/fleetgraph/client.js', () => ({
  createFleetGraphSessionClient: mocks.createFleetGraphSessionClient,
  createFleetGraphBearerClient: mocks.createFleetGraphBearerClient,
}));

vi.mock('../services/fleetgraph/runner.js', () => ({
  prepareFleetGraphRun: mocks.prepareFleetGraphRun,
}));

vi.mock('../services/fleetgraph/reasoning.js', () => ({
  analyzeFleetGraphWithReasoning: mocks.analyzeFleetGraphWithReasoning,
}));

vi.mock('../services/fleetgraph/persist.js', () => ({
  persistFleetGraphAnalysis: mocks.persistFleetGraphAnalysis,
}));

vi.mock('../services/fleetgraph/report.js', () => ({
  createFleetGraphQualityReportDraft: mocks.createFleetGraphQualityReportDraft,
  updateFleetGraphQualityReportDraft: mocks.updateFleetGraphQualityReportDraft,
  deleteFleetGraphQualityReport: mocks.deleteFleetGraphQualityReport,
  publishFleetGraphQualityReport: mocks.publishFleetGraphQualityReport,
}));

vi.mock('../services/fleetgraph/reports.js', () => ({
  getFleetGraphReportDetail: mocks.getFleetGraphReportDetail,
  getFleetGraphReviewSession: mocks.getFleetGraphReviewSession,
  listFleetGraphReports: mocks.listFleetGraphReports,
}));

vi.mock('../services/fleetgraph/scan.js', () => ({
  runFleetGraphWorkspaceScan: mocks.runFleetGraphWorkspaceScan,
}));

vi.mock('../services/fleetgraph/triggers.js', () => ({
  getFleetGraphQueueStatus: mocks.getFleetGraphQueueStatus,
}));

vi.mock('../services/fleetgraph/feedback.js', () => ({
  sendFleetGraphDirectorFeedback: mocks.sendFleetGraphDirectorFeedback,
}));

vi.mock('../services/fleetgraph/readiness.js', () => ({
  getFleetGraphReadinessStatus: mocks.getFleetGraphReadinessStatus,
}));

vi.mock('../services/fleetgraph/chat.js', () => ({
  answerFleetGraphQuestion: mocks.answerFleetGraphQuestion,
}));

import {
  chatHandler,
  createReportDraftHandler,
  deleteReportHandler,
  directorFeedbackHandler,
  getReadinessHandler,
  getReportsHandler,
  nightlyScanHandler,
} from './fleetgraph-handlers.js';

function createContext(overrides: Partial<Parameters<typeof getReadinessHandler>[0]> = {}) {
  return {
    workspaceId: 'workspace-1',
    workspaceRole: 'admin',
    isApiToken: false,
    isSuperAdmin: false,
    headers: {
      cookie: 'session_id=test',
    },
    params: {},
    body: undefined,
    protocol: 'http',
    host: 'localhost:3000',
    ...overrides,
  };
}

describe('FleetGraph route handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getFleetGraphReadinessStatus.mockReturnValue({
      ready: true,
      deployment: {
        nodeEnv: 'test',
        publicBaseUrl: 'https://ship.test',
        internalApiUrl: 'http://api.test',
        publiclyAccessible: true,
      },
      runtime: {
        shipApiTokenConfigured: true,
        openAiConfigured: true,
        langSmithEnabled: true,
        langSmithProject: 'fleetgraph-test',
        queueIntervalMs: 300000,
        maxDocumentsPerFlush: 10,
        collaborationIdleMs: 30000,
        maxGraphDepth: 3,
        maxGraphDocuments: 25,
      },
      routes: {
        insights: '/api/fleetgraph/documents/:id',
        reports: '/api/fleetgraph/reports',
        reviewSession: '/api/fleetgraph/review-session',
        nightlyScanApi: '/api/fleetgraph/nightly-scan',
        nightlyScanScript: 'pnpm fleetgraph:nightly-scan',
      },
      missing: [],
    });

    mocks.getFleetGraphQueueStatus.mockReturnValue({
      batchIntervalMs: 300000,
      maxDocumentsPerFlush: 10,
      isFlushing: false,
      pendingCount: 0,
      lastFlushStartedAt: null,
      lastFlushCompletedAt: null,
      workspaceGroups: [],
      pendingDocuments: [],
    });

    mocks.listFleetGraphReports.mockResolvedValue([
      {
        id: 'report-1',
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
    ]);
  });

  it('returns readiness for admins', async () => {
    const response = await getReadinessHandler(createContext());

    expect(response.status).toBe(200);
    expect('ready' in response.body && response.body.ready).toBe(true);
    expect(mocks.getFleetGraphReadinessStatus).toHaveBeenCalledTimes(1);
  });

  it('rejects readiness for non-admin users', async () => {
    const response = await getReadinessHandler(createContext({ workspaceRole: 'member' }));

    expect(response.status).toBe(403);
    expect('error' in response.body && response.body.error).toContain('workspace admin access');
  });

  it('updates an existing linked report instead of creating a duplicate draft', async () => {
    mocks.prepareFleetGraphRun.mockResolvedValue({
      rootDocumentId: 'project-1',
      triggerSource: 'manual',
      graph: {
        nodes: [],
        edges: [],
        metadata: {
          maxDepthReached: 1,
          truncated: false,
          depthLimit: 3,
          documentLimit: 25,
        },
      },
      scoringPayload: { documents: [] },
      context: {
        rootDocument: {
          id: 'project-1',
          title: 'Project Alpha',
          properties: {
            quality_report_id: 'report-existing',
          },
        },
      },
    });
    mocks.analyzeFleetGraphWithReasoning.mockResolvedValue({
      generatedAt: '2026-03-18T02:00:00.000Z',
      rootDocumentId: 'project-1',
      mode: 'deterministic',
      model: null,
      remediationSuggestions: [],
      documents: [],
    });
    mocks.updateFleetGraphQualityReportDraft.mockResolvedValue({
      reportId: 'report-existing',
    });
    mocks.answerFleetGraphQuestion.mockResolvedValue({
      answer: 'Start by tightening the acceptance criteria.',
      suggestedPrompts: ['What should I fix first?'],
    });

    const response = await createReportDraftHandler(
      createContext({
        params: { id: 'project-1' },
      })
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      created: false,
      updated: true,
      reportId: 'report-existing',
    });
    expect(mocks.createFleetGraphQualityReportDraft).not.toHaveBeenCalled();
    expect(mocks.updateFleetGraphQualityReportDraft).toHaveBeenCalledTimes(1);
  });

  it('validates director feedback payloads before invoking the service', async () => {
    const response = await directorFeedbackHandler(
      createContext({
        params: { id: 'report-1' },
        body: {},
      })
    );

    expect(response.status).toBe(400);
    expect('error' in response.body && response.body.error).toContain('Invalid FleetGraph director feedback payload');
    expect(mocks.sendFleetGraphDirectorFeedback).not.toHaveBeenCalled();
  });

  it('deletes a FleetGraph report through the report service', async () => {
    mocks.deleteFleetGraphQualityReport.mockResolvedValue({
      reportId: 'report-1',
      clearedDocumentIds: ['project-1'],
    });

    const response = await deleteReportHandler(
      createContext({
        params: { id: 'report-1' },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteFleetGraphQualityReport).toHaveBeenCalledWith(
      mocks.mockClient,
      'report-1'
    );
    expect(response.body).toEqual({
      reportId: 'report-1',
      clearedDocumentIds: ['project-1'],
    });
  });

  it('answers a contextual FleetGraph chat question', async () => {
    mocks.prepareFleetGraphRun.mockResolvedValue({
      rootDocumentId: 'project-1',
      triggerSource: 'manual',
      graph: {
        nodes: [],
        edges: [],
        metadata: {
          maxDepthReached: 1,
          truncated: false,
          depthLimit: 3,
          documentLimit: 25,
        },
      },
      scoringPayload: { documents: [] },
      context: {
        rootDocument: {
          id: 'project-1',
          title: 'Project Alpha',
          properties: {},
        },
      },
    });
    mocks.analyzeFleetGraphWithReasoning.mockResolvedValue({
      generatedAt: '2026-03-18T02:00:00.000Z',
      rootDocumentId: 'project-1',
      mode: 'deterministic',
      model: null,
      executiveSummary: 'Project Alpha is not ready to execute yet.',
      remediationSuggestions: [],
      documents: [],
    });

    const response = await chatHandler(
      createContext({
        params: { id: 'project-1' },
        body: {
          question: 'What should I fix first?',
          history: [],
        },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.answerFleetGraphQuestion).toHaveBeenCalledTimes(1);
    expect(response.body).toEqual({
      answer: 'Start by tightening the acceptance criteria.',
      suggestedPrompts: ['What should I fix first?'],
    });
  });

  it('uses the scan service for nightly scans', async () => {
    mocks.runFleetGraphWorkspaceScan.mockResolvedValue({
      workspaceId: 'workspace-1',
      scannedAt: '2026-03-18T03:00:00.000Z',
      source: 'nightly_scan',
      totalProjects: 2,
      greenProjects: 1,
      yellowProjects: 1,
      redProjects: 0,
      projects: [],
    });

    const response = await nightlyScanHandler(
      createContext({
        body: { createDraftReports: true },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.runFleetGraphWorkspaceScan).toHaveBeenCalledWith(mocks.mockClient, 'workspace-1', {
      createDraftReports: true,
    });
    expect('totalProjects' in response.body && response.body.totalProjects).toBe(2);
  });

  it('lists report queue items through the route client', async () => {
    const response = await getReportsHandler(createContext());

    expect(response.status).toBe(200);
    expect(mocks.createFleetGraphSessionClient).toHaveBeenCalledTimes(1);
    expect(mocks.listFleetGraphReports).toHaveBeenCalledWith(mocks.mockClient);
    expect(response.body.reports).toHaveLength(1);
  });
});
