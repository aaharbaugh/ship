import { describe, expect, it, vi } from 'vitest';
import type { FleetGraphShipApiClient } from './client.js';
import { prepareFleetGraphRun, previewFleetGraphRun } from './runner.js';

function createMockClient(): FleetGraphShipApiClient {
  const getDocument = vi.fn(async (documentId: string) => {
    if (documentId === 'doc-1') {
      return {
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
        belongs_to: [
          { id: 'sprint-1', type: 'sprint', title: 'Week 1' },
        ],
      };
    }

    return {
      id: documentId,
      workspace_id: 'ws-1',
      document_type: documentId.startsWith('issue') ? 'issue' : 'wiki',
      title: `Related ${documentId}`,
      parent_id: null,
      properties: {
        quality_summary: `Summary for ${documentId}`,
      },
      content: null,
    };
  });

  return {
    listDocuments: vi.fn().mockResolvedValue([]),
    getDocument,
    getDocumentAssociations: vi.fn().mockResolvedValue([
      {
        document_id: 'doc-1',
        related_id: 'issue-1',
        relationship_type: 'project',
        related_title: 'Issue 1',
        related_document_type: 'issue',
      },
    ]),
    getReverseAssociations: vi.fn().mockResolvedValue([
      {
        document_id: 'standup-1',
        related_id: 'doc-1',
        relationship_type: 'project',
        related_title: 'Project Alpha',
        related_document_type: 'project',
      },
    ]),
    updateDocumentMetadata: vi.fn().mockResolvedValue(undefined),
    createQualityReportDraft: vi.fn().mockResolvedValue({ id: 'draft-1' }),
  };
}

describe('FleetGraph runner', () => {
  it('prepares the first fetch phase through the Ship API client', async () => {
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
      'program-1',
      'sprint-1',
      'standup-1',
    ]);
    expect(result.graph.rootDocumentId).toBe('doc-1');
    expect(result.graph.nodes.map((node) => node.id).sort()).toEqual([
      'doc-1',
      'issue-1',
      'program-1',
      'sprint-1',
      'standup-1',
    ]);
    expect(result.graph.edges.some((edge) => edge.relationshipType === 'parent')).toBe(true);
    expect(result.graph.edges.some((edge) => edge.relationshipType === 'sprint')).toBe(true);
    expect(result.scoringPayload.rootDocumentId).toBe('doc-1');
    expect(result.scoringPayload.documentCount).toBe(5);
    expect(result.scoringPayload.documents.find((doc) => doc.id === 'doc-1')?.ownerId).toBe('owner-1');
    expect(result.scoringPayload.documents.find((doc) => doc.id === 'doc-1')?.summaryText)
      .toContain('Project alpha needs acceptance criteria.');
    expect(result.scoringPayload.documents.find((doc) => doc.id === 'issue-1')?.summaryText)
      .toContain('Summary for issue-1');
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
