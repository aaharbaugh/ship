import { describe, expect, it } from 'vitest';
import { analyzeFleetGraphPayload } from './analyze.js';
import { mergeReasoningIntoAnalysis } from './reasoning.js';

describe('FleetGraph reasoning merge', () => {
  it('keeps deterministic safeguards while applying model refinements', () => {
    const deterministic = analyzeFleetGraphPayload({
      rootDocumentId: 'issue-1',
      documentCount: 1,
      edgeCount: 0,
      maxDepthReached: 0,
      truncated: false,
      documents: [
        {
          id: 'issue-1',
          documentType: 'issue',
          title: 'Fix onboarding bug',
          summaryText: 'Fix it',
          hasContent: true,
          qualityScore: null,
          qualityStatus: null,
          ownerId: null,
          tags: [],
          belongsToIds: [],
        },
      ],
      edges: [],
    });

    const merged = mergeReasoningIntoAnalysis(
      deterministic,
      {
        documents: [
          {
            documentId: 'issue-1',
            qualityScore: 0.92,
            qualityStatus: 'green',
            summary: 'This issue needs explicit acceptance criteria before work starts.',
            mainIssues: ['Expected outcomes are underspecified'],
            tags: [
              {
                key: 'missing_scope',
                label: 'Missing scope',
                severity: 'medium',
              },
            ],
            suggestions: [
              {
                title: 'Write concrete acceptance criteria',
                priority: 'high',
                rationale: 'Turn the work into executable completion conditions.',
              },
            ],
          },
        ],
        remediationSuggestions: [
          {
            title: 'Clarify issue scope',
            priority: 'medium',
            rationale: 'Add expected outcomes and acceptance criteria.',
            document_id: 'issue-1',
          },
        ],
      },
      'gpt-4o'
    );

    expect(merged.mode).toBe('gpt-4o');
    expect(merged.model).toBe('gpt-4o');
    expect(merged.documents[0]?.qualityStatus).toBe('red');
    expect(merged.documents[0]?.qualityScore).toBeLessThan(0.92);
    expect(merged.documents[0]?.summary).toContain('acceptance criteria');
    expect(merged.documents[0]?.tags.some((tag) => tag.key === 'missing_owner')).toBe(true);
    expect(merged.documents[0]?.tags.some((tag) => tag.key === 'missing_scope')).toBe(true);
    expect(merged.remediationSuggestions.some((suggestion) => suggestion.title === 'Clarify issue scope')).toBe(true);
  });
});
