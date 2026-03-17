import { describe, expect, it, vi } from 'vitest';
import type { FleetGraphShipApiClient } from './client.js';
import { prepareFleetGraphRun, previewFleetGraphRun } from './runner.js';

function createMockClient(): FleetGraphShipApiClient {
  const documentsById = new Map([
    [
      'doc-1',
      {
        id: 'doc-1',
        workspace_id: 'ws-1',
        document_type: 'project',
        title: 'Project Alpha',
        parent_id: 'program-1',
        properties: {
          owner_id: 'owner-1',
          quality_status: 'yellow',
        },
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Project alpha needs acceptance criteria.' }],
            },
          ],
        },
        belongs_to: [{ id: 'sprint-1', type: 'sprint', title: 'Week 1' }],
      },
    ],
    [
      'program-1',
      {
        id: 'program-1',
        workspace_id: 'ws-1',
        document_type: 'wiki',
        title: 'Program Overview',
        parent_id: null,
        properties: {
          quality_summary: 'Program summary',
        },
        content: null,
      },
    ],
    [
      'sprint-1',
      {
        id: 'sprint-1',
        workspace_id: 'ws-1',
        document_type: 'sprint',
        title: 'Sprint 1',
        parent_id: 'doc-1',
        properties: {
          quality_summary: 'Sprint summary',
        },
        content: null,
        belongs_to: [{ id: 'doc-1', type: 'project', title: 'Project Alpha' }],
      },
    ],
    [
      'issue-1',
      {
        id: 'issue-1',
        workspace_id: 'ws-1',
        document_type: 'issue',
        title: 'Issue 1',
        parent_id: 'sprint-1',
        properties: {
          quality_summary: 'Issue one summary',
        },
        content: null,
      },
    ],
    [
      'issue-2',
      {
        id: 'issue-2',
        workspace_id: 'ws-1',
        document_type: 'issue',
        title: 'Issue 2',
        parent_id: 'sprint-1',
        properties: {
          quality_summary: 'Issue two summary',
        },
        content: null,
      },
    ],
    [
      'standup-1',
      {
        id: 'standup-1',
        workspace_id: 'ws-1',
        document_type: 'standup',
        title: 'Standup 1',
        parent_id: null,
        properties: {
          quality_summary: 'Standup summary',
        },
        content: null,
      },
    ],
  ]);

  const getDocument = vi.fn(async (documentId: string) => {
    const document = documentsById.get(documentId);

    if (!document) {
      throw new Error(`Unknown document ${documentId}`);
    }

    return document;
  });

  const directAssociationsById: Record<string, Array<{
    document_id: string;
    related_id: string;
    relationship_type: string;
    related_title?: string;
    related_document_type?: string;
  }>> = {
    'doc-1': [
      {
        document_id: 'doc-1',
        related_id: 'issue-1',
        relationship_type: 'project',
        related_title: 'Issue 1',
        related_document_type: 'issue',
      },
    ],
    'sprint-1': [
      {
        document_id: 'sprint-1',
        related_id: 'issue-2',
        relationship_type: 'sprint',
        related_title: 'Issue 2',
        related_document_type: 'issue',
      },
    ],
    'issue-1': [
      {
        document_id: 'issue-1',
        related_id: 'standup-1',
        relationship_type: 'blocked_by',
        related_title: 'Standup 1',
        related_document_type: 'standup',
      },
    ],
  };

  const reverseAssociationsById: Record<string, Array<{
    document_id: string;
    related_id: string;
    relationship_type: string;
    related_title?: string;
    related_document_type?: string;
  }>> = {
    'doc-1': [
      {
        document_id: 'standup-1',
        related_id: 'doc-1',
        relationship_type: 'project',
        related_title: 'Project Alpha',
        related_document_type: 'project',
      },
    ],
  };

  return {
    listDocuments: vi.fn().mockResolvedValue([]),
    getDocument,
    getDocumentAssociations: vi
      .fn()
      .mockImplementation(async (documentId: string) => directAssociationsById[documentId] ?? []),
    getReverseAssociations: vi
      .fn()
      .mockImplementation(async (documentId: string) => reverseAssociationsById[documentId] ?? []),
    updateDocumentMetadata: vi.fn().mockResolvedValue(undefined),
    createQualityReportDraft: vi.fn().mockResolvedValue({ id: 'draft-1' }),
  };
}

describe('FleetGraph runner', () => {
  it('prepares a bounded recursive graph through the Ship API client', async () => {
    const client = createMockClient();

    const result = await prepareFleetGraphRun(client, {
      workspaceId: 'ws-1',
      documentId: 'doc-1',
      source: 'manual',
    });

    expect(client.getDocument).toHaveBeenCalledWith('doc-1');
    expect(client.getDocumentAssociations).toHaveBeenCalledWith('doc-1');
    expect(client.getReverseAssociations).toHaveBeenCalledWith('doc-1');
    expect(result.context.rootDocument.title).toBe('Project Alpha');
    expect(result.context.directAssociations).toHaveLength(1);
    expect(result.context.reverseAssociations).toHaveLength(1);
    expect(result.context.relatedDocuments.map((doc) => doc.id).sort()).toEqual([
      'issue-1',
      'issue-2',
      'program-1',
      'sprint-1',
      'standup-1',
    ]);
    expect(result.context.expandedDocuments.map((doc) => doc.id).sort()).toEqual([
      'doc-1',
      'issue-1',
      'issue-2',
      'program-1',
      'sprint-1',
      'standup-1',
    ]);
    expect(result.context.expandedAssociations).toHaveLength(3);
    expect(result.graph.rootDocumentId).toBe('doc-1');
    expect(result.graph.nodes.map((node) => node.id).sort()).toEqual([
      'doc-1',
      'issue-1',
      'issue-2',
      'program-1',
      'sprint-1',
      'standup-1',
    ]);
    expect(result.graph.edges.some((edge) => edge.relationshipType === 'parent')).toBe(true);
    expect(result.graph.edges.some((edge) => edge.relationshipType === 'sprint')).toBe(true);
    expect(result.graph.edges.some((edge) => edge.relationshipType === 'blocked_by')).toBe(true);
    expect(result.scoringPayload.rootDocumentId).toBe('doc-1');
    expect(result.scoringPayload.documentCount).toBe(6);
    expect(result.scoringPayload.documents.find((doc) => doc.id === 'doc-1')?.ownerId).toBe('owner-1');
    expect(result.scoringPayload.documents.find((doc) => doc.id === 'doc-1')?.summaryText)
      .toContain('Project alpha needs acceptance criteria.');
    expect(result.scoringPayload.documents.find((doc) => doc.id === 'issue-1')?.summaryText)
      .toContain('Issue one summary');
    expect(client.getDocument).toHaveBeenCalledWith('issue-2');
    expect(client.getDocumentAssociations).toHaveBeenCalledWith('issue-1');
    expect(result.nodeIds).toContain('load-document');
    expect(result.nodeIds).toContain('load-associations');
  });

  it('can return a lightweight preview from the prepared run', async () => {
    const client = createMockClient();

    const result = await previewFleetGraphRun(client, {
      workspaceId: 'ws-1',
      documentId: 'doc-1',
      source: 'manual',
    });

    expect(result.rootDocumentId).toBe('doc-1');
    expect(result.nodeIds).toContain('build-graph');
  });
});
