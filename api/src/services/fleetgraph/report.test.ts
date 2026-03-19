import { describe, expect, it, vi } from 'vitest';
import {
  createFleetGraphQualityReportDraft,
  deleteFleetGraphQualityReport,
  publishFleetGraphQualityReport,
  updateFleetGraphQualityReportDraft,
} from './report.js';
import type { FleetGraphShipApiClient } from './client.js';
import type { FleetGraphPreparedRun } from './runner.js';
import type { FleetGraphAnalysis } from './analyze.js';

describe('FleetGraph quality report drafting', () => {
  it('builds a PM-friendly report with named findings and actions', async () => {
    const createQualityReportDraft = vi.fn().mockResolvedValue({ id: 'report-1' });
    const client = {
      listDocuments: vi.fn(),
      getDocument: vi.fn(),
      getDocumentAssociations: vi.fn(),
      getReverseAssociations: vi.fn(),
      updateDocumentMetadata: vi.fn(),
      deleteDocument: vi.fn(),
      createQualityReportDraft,
      updateQualityReportDraft: vi.fn(),
    } satisfies FleetGraphShipApiClient;

    const prepared = {
      rootDocumentId: 'project-1',
      triggerSource: 'manual',
      nodeIds: [],
      context: {
        rootDocument: {
          id: 'project-1',
          workspace_id: 'ws-1',
          document_type: 'project',
          title: 'Project Atlas',
          parent_id: null,
          properties: {},
          content: null,
          belongs_to: [],
        },
        directAssociations: [],
        reverseAssociations: [],
        relatedDocuments: [
          {
            id: 'issue-1',
            workspace_id: 'ws-1',
            document_type: 'issue',
            title: 'Fix onboarding path',
            parent_id: null,
            properties: {},
            content: null,
            belongs_to: [],
          },
        ],
        expandedDocuments: [
          {
            id: 'project-1',
            workspace_id: 'ws-1',
            document_type: 'project',
            title: 'Project Atlas',
            parent_id: null,
            properties: {},
            content: null,
            belongs_to: [],
          },
          {
            id: 'issue-1',
            workspace_id: 'ws-1',
            document_type: 'issue',
            title: 'Fix onboarding path',
            parent_id: null,
            properties: {},
            content: null,
            belongs_to: [],
          },
        ],
        expandedAssociations: [
          {
            document_id: 'issue-1',
            related_id: 'project-1',
            relationship_type: 'project',
            related_title: 'Project Atlas',
            related_document_type: 'project',
          },
        ],
        maxDepthReached: 1,
        truncated: false,
        depthLimit: 2,
        documentLimit: 40,
      },
      graph: {
        rootDocumentId: 'project-1',
        metadata: {
          maxDepthReached: 1,
          truncated: false,
          depthLimit: 2,
          documentLimit: 40,
        },
        nodes: [
          {
            id: 'project-1',
            documentType: 'project',
            title: 'Project Atlas',
            parentId: null,
            belongsTo: [],
            content: null,
            properties: {},
          },
          {
            id: 'issue-1',
            documentType: 'issue',
            title: 'Fix onboarding path',
            parentId: null,
            belongsTo: [],
            content: null,
            properties: {},
          },
        ],
        edges: [
          {
            from: 'issue-1',
            to: 'project-1',
            relationshipType: 'project',
            direction: 'outbound',
          },
        ],
      },
      scoringPayload: {
        rootDocumentId: 'project-1',
        documentCount: 2,
        edgeCount: 1,
        maxDepthReached: 1,
        truncated: false,
        documents: [],
        edges: [],
      },
    } satisfies FleetGraphPreparedRun;

    const analysis = {
      generatedAt: '2026-03-16T00:00:00.000Z',
      rootDocumentId: 'project-1',
      mode: 'gpt-4o',
      model: 'gpt-4o',
      remediationSuggestions: [
        {
          title: 'Clarify onboarding acceptance criteria',
          priority: 'high',
          rationale: 'The issue lacks clear completion conditions.',
          document_id: 'issue-1',
        },
      ],
      documents: [
        {
          documentId: 'project-1',
          documentType: 'project',
          qualityScore: 0.64,
          qualityStatus: 'yellow',
          summary: 'Project Atlas is yellow because execution details are uneven.',
          tags: [],
          metadata: {},
        },
        {
          documentId: 'issue-1',
          documentType: 'issue',
          qualityScore: 0.32,
          qualityStatus: 'red',
          summary: 'Fix onboarding path is red because FleetGraph detected missing acceptance criteria.',
          tags: [
            {
              key: 'missing_acceptance_criteria',
              label: 'Missing acceptance criteria',
              severity: 'high',
            },
          ],
          metadata: {},
        },
      ],
    } satisfies FleetGraphAnalysis;

    const result = await createFleetGraphQualityReportDraft(client, prepared, analysis);

    expect(result.reportId).toBe('report-1');
    expect(createQualityReportDraft).toHaveBeenCalledTimes(1);
    const draft = createQualityReportDraft.mock.calls[0]?.[0];
    expect(draft.title).toContain('Project Atlas');
    expect(draft.content).toContain('## Health Snapshot');
    expect(draft.content).toContain('## Priority Findings');
    expect(draft.content).toContain('Fix onboarding path');
    expect(draft.content).toContain('Clarify onboarding acceptance criteria');
    expect(draft.content).toContain('Target: Fix onboarding path');
    expect(draft.content).toContain('Graph depth reached: 1');
    expect(draft.metadata.fleetgraph_director_response_options).toHaveLength(3);
  });

  it('marks a FleetGraph quality report as published', async () => {
    const updateDocumentMetadata = vi.fn().mockResolvedValue(undefined);
    const client = {
      listDocuments: vi.fn(),
      getDocument: vi.fn().mockResolvedValue({
        id: 'report-1',
        workspace_id: 'ws-1',
        document_type: 'wiki',
        title: 'FleetGraph Quality Report: Project Atlas',
        parent_id: null,
        properties: {
          fleetgraph_report_type: 'quality_report',
          fleetgraph_report_state: 'draft',
        },
        content: null,
        belongs_to: [],
      }),
      getDocumentAssociations: vi.fn(),
      getReverseAssociations: vi.fn(),
      updateDocumentMetadata,
      deleteDocument: vi.fn(),
      createQualityReportDraft: vi.fn(),
      updateQualityReportDraft: vi.fn(),
    } satisfies FleetGraphShipApiClient;

    const result = await publishFleetGraphQualityReport(client, 'report-1');

    expect(result.reportId).toBe('report-1');
    expect(typeof result.publishedAt).toBe('string');
    expect(updateDocumentMetadata).toHaveBeenCalledWith(
      'report-1',
      expect.objectContaining({
        fleetgraph_report_state: 'published',
        fleetgraph_report_published_at: expect.any(String),
      })
    );
  });

  it('updates an existing FleetGraph quality report draft', async () => {
    const updateQualityReportDraft = vi.fn().mockResolvedValue(undefined);
    const client = {
      listDocuments: vi.fn(),
      getDocument: vi.fn(),
      getDocumentAssociations: vi.fn(),
      getReverseAssociations: vi.fn(),
      updateDocumentMetadata: vi.fn(),
      deleteDocument: vi.fn(),
      createQualityReportDraft: vi.fn(),
      updateQualityReportDraft,
    } satisfies FleetGraphShipApiClient;

    const prepared = {
      rootDocumentId: 'project-1',
      triggerSource: 'manual',
      nodeIds: [],
      context: {
        rootDocument: {
          id: 'project-1',
          workspace_id: 'ws-1',
          document_type: 'project',
          title: 'Project Atlas',
          parent_id: null,
          properties: {},
          content: null,
          belongs_to: [],
        },
        directAssociations: [],
        reverseAssociations: [],
        relatedDocuments: [],
        expandedDocuments: [
          {
            id: 'project-1',
            workspace_id: 'ws-1',
            document_type: 'project',
            title: 'Project Atlas',
            parent_id: null,
            properties: {},
            content: null,
            belongs_to: [],
          },
        ],
        expandedAssociations: [],
        maxDepthReached: 1,
        truncated: false,
        depthLimit: 2,
        documentLimit: 40,
      },
      graph: {
        rootDocumentId: 'project-1',
        metadata: {
          maxDepthReached: 1,
          truncated: false,
          depthLimit: 2,
          documentLimit: 40,
        },
        nodes: [],
        edges: [],
      },
      scoringPayload: {
        rootDocumentId: 'project-1',
        documentCount: 1,
        edgeCount: 0,
        maxDepthReached: 1,
        truncated: false,
        documents: [],
        edges: [],
      },
    } satisfies FleetGraphPreparedRun;

    const analysis = {
      generatedAt: '2026-03-16T00:00:00.000Z',
      rootDocumentId: 'project-1',
      mode: 'gpt-4o',
      model: 'gpt-4o',
      remediationSuggestions: [],
      documents: [
        {
          documentId: 'project-1',
          documentType: 'project',
          qualityScore: 0.64,
          qualityStatus: 'yellow',
          summary: 'Project Atlas is yellow because execution details are uneven.',
          tags: [],
          metadata: {},
        },
      ],
    } satisfies FleetGraphAnalysis;

    const result = await updateFleetGraphQualityReportDraft(
      client,
      'report-1',
      prepared,
      analysis
    );

    expect(result).toEqual({ reportId: 'report-1' });
    expect(updateQualityReportDraft).toHaveBeenCalledWith(
      'report-1',
      expect.objectContaining({
        title: 'FleetGraph Quality Report: Project Atlas',
        metadata: expect.objectContaining({
          fleetgraph_report_state: 'draft',
          quality_status: 'yellow',
        }),
      })
    );
  });
  it('clears linked document metadata before deleting a FleetGraph report', async () => {
    const updateDocumentMetadata = vi.fn().mockResolvedValue(undefined);
    const deleteDocument = vi.fn().mockResolvedValue(undefined);
    const client = {
      listDocuments: vi.fn().mockResolvedValue([
        {
          id: 'project-1',
          workspace_id: 'ws-1',
          document_type: 'project',
          title: 'Project Atlas',
          parent_id: null,
          properties: {
            quality_report_id: 'report-1',
            quality_status: 'red',
          },
          content: null,
          belongs_to: [],
        },
        {
          id: 'project-2',
          workspace_id: 'ws-1',
          document_type: 'project',
          title: 'Project Beta',
          parent_id: null,
          properties: {
            quality_report_id: 'report-other',
          },
          content: null,
          belongs_to: [],
        },
      ]),
      getDocument: vi.fn().mockResolvedValue({
        id: 'report-1',
        workspace_id: 'ws-1',
        document_type: 'wiki',
        title: 'FleetGraph Quality Report: Project Atlas',
        parent_id: null,
        properties: {
          fleetgraph_report_type: 'quality_report',
        },
        content: null,
        belongs_to: [],
      }),
      getDocumentAssociations: vi.fn(),
      getReverseAssociations: vi.fn(),
      updateDocumentMetadata,
      deleteDocument,
      createQualityReportDraft: vi.fn(),
      updateQualityReportDraft: vi.fn(),
    } satisfies FleetGraphShipApiClient;

    const result = await deleteFleetGraphQualityReport(client, 'report-1');

    expect(updateDocumentMetadata).toHaveBeenCalledWith('project-1', {
      quality_status: 'red',
    });
    expect(deleteDocument).toHaveBeenCalledWith('report-1');
    expect(result).toEqual({
      reportId: 'report-1',
      clearedDocumentIds: ['project-1'],
    });
  });
});
