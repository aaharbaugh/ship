import { describe, expect, it } from 'vitest';
import { analyzeFleetGraphPayload } from './analyze.js';

describe('FleetGraph deterministic analyzer', () => {
  it('flags thin or ownerless documents and preserves strong ones', () => {
    const analysis = analyzeFleetGraphPayload({
      rootDocumentId: 'doc-1',
      documentCount: 2,
      edgeCount: 1,
      maxDepthReached: 1,
      truncated: false,
      documents: [
        {
          id: 'doc-1',
          documentType: 'project',
          title: 'Project Alpha',
          summaryText: 'Project Alpha has a clear owner and enough context to act on.',
          hasContent: true,
          qualityScore: null,
          qualityStatus: null,
          ownerId: 'owner-1',
          tags: [],
          belongsToIds: [],
        },
        {
          id: 'issue-1',
          documentType: 'issue',
          title: 'Fix bug',
          summaryText: 'Fix it',
          hasContent: true,
          qualityScore: null,
          qualityStatus: null,
          ownerId: null,
          tags: [],
          belongsToIds: [],
        },
      ],
      edges: [
        {
          from: 'issue-1',
          to: 'doc-1',
          relationshipType: 'project',
          direction: 'outbound',
        },
      ],
    });

    expect(analysis.documents.find((doc) => doc.documentId === 'doc-1')?.qualityStatus).toBe('green');
    expect(analysis.documents.find((doc) => doc.documentId === 'issue-1')?.qualityStatus).toBe('yellow');
    expect(analysis.documents.find((doc) => doc.documentId === 'issue-1')?.tags.length).toBeGreaterThan(0);
    expect(analysis.remediationSuggestions.length).toBeGreaterThan(0);
  });
});
