import { describe, expect, it, vi } from 'vitest';
import { sendFleetGraphDirectorFeedback } from './feedback.js';
import type { FleetGraphShipApiClient } from './client.js';

describe('FleetGraph director feedback', () => {
  it('writes confirmed feedback back onto the target document metadata', async () => {
    const updateDocumentMetadata = vi.fn().mockResolvedValue(undefined);
    const client = {
      listDocuments: vi.fn(),
      getDocument: vi.fn(async (documentId: string) => {
        if (documentId === 'report-1') {
          return {
            id: 'report-1',
            workspace_id: 'ws-1',
            document_type: 'wiki',
            title: 'FleetGraph Quality Report: Project Atlas',
            parent_id: null,
            properties: {
              fleetgraph_report_type: 'quality_report',
              fleetgraph_root_document_id: 'project-1',
              fleetgraph_director_response_options: [
                {
                  label: 'Address top blocker',
                  message: 'Please resolve the top blocker before continuing.',
                  target_document_id: 'issue-1',
                },
              ],
            },
            content: null,
            belongs_to: [],
          };
        }

        return {
          id: documentId,
          workspace_id: 'ws-1',
          document_type: 'issue',
          title: 'Issue 1',
          parent_id: null,
          properties: {
            quality_tags: [],
          },
          content: null,
          belongs_to: [],
        };
      }),
      getDocumentAssociations: vi.fn(),
      getReverseAssociations: vi.fn(),
      updateDocumentMetadata,
      deleteDocument: vi.fn(),
      createQualityReportDraft: vi.fn(),
      updateQualityReportDraft: vi.fn(),
    } satisfies FleetGraphShipApiClient;

    const result = await sendFleetGraphDirectorFeedback(client, 'report-1', 0);

    expect(result.reportId).toBe('report-1');
    expect(result.targetDocumentIds).toEqual(['issue-1']);
    expect(updateDocumentMetadata).toHaveBeenCalledWith(
      'issue-1',
      expect.objectContaining({
        quality_tags: expect.arrayContaining([
          expect.objectContaining({
            key: 'director_feedback',
          }),
        ]),
        fleetgraph_director_feedback: expect.objectContaining({
          report_id: 'report-1',
          message: 'Please resolve the top blocker before continuing.',
        }),
      })
    );
    expect(updateDocumentMetadata).toHaveBeenCalledWith(
      'report-1',
      expect.objectContaining({
        fleetgraph_director_feedback_sent_at: expect.any(String),
      })
    );
  });
});
