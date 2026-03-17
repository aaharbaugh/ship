import { describe, expect, it, vi } from 'vitest';
import { createFleetGraphQualityReportDraft } from './report.js';
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
      createQualityReportDraft,
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
      },
      graph: {
        rootDocumentId: 'project-1',
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
  });
});
