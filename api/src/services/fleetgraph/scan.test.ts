import { describe, expect, it, vi } from 'vitest';
import type { FleetGraphShipApiClient } from './client.js';
import { runFleetGraphWorkspaceScan } from './scan.js';

function createMockClient(): FleetGraphShipApiClient {
  const getDocument = vi.fn(async (documentId: string) => {
    if (documentId === 'project-1') {
      return {
        id: 'project-1',
        workspace_id: 'ws-1',
        document_type: 'project',
        title: 'Project Alpha',
        parent_id: null,
        properties: {
          owner_id: 'owner-1',
        },
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Project Alpha has enough detail to execute.' },
              ],
            },
          ],
        },
        belongs_to: [],
      };
    }

    return {
      id: documentId,
      workspace_id: 'ws-1',
      document_type: 'wiki',
      title: `Related ${documentId}`,
      parent_id: null,
      properties: {},
      content: null,
      belongs_to: [],
    };
  });

  return {
    listDocuments: vi.fn().mockResolvedValue([
      {
        id: 'project-1',
        workspace_id: 'ws-1',
        document_type: 'project',
        title: 'Project Alpha',
        parent_id: null,
        properties: {},
        content: null,
        belongs_to: [],
      },
    ]),
    getDocument,
    getDocumentAssociations: vi.fn().mockResolvedValue([]),
    getReverseAssociations: vi.fn().mockResolvedValue([]),
    updateDocumentMetadata: vi.fn().mockResolvedValue(undefined),
    createQualityReportDraft: vi.fn().mockResolvedValue({ id: 'draft-1' }),
  };
}

describe('FleetGraph workspace scan', () => {
  it('scans project roots and persists their analysis', async () => {
    const client = createMockClient();

    const result = await runFleetGraphWorkspaceScan(client, 'ws-1');

    expect(client.listDocuments).toHaveBeenCalledWith({ type: 'project' });
    expect(client.getDocument).toHaveBeenCalledWith('project-1');
    expect(client.updateDocumentMetadata).toHaveBeenCalled();
    expect(result.totalProjects).toBe(1);
    expect(result.projects[0]?.documentId).toBe('project-1');
    expect(result.projects[0]?.qualityStatus).toBe('green');
  });
});
