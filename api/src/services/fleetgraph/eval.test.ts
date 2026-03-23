import { describe, expect, it } from 'vitest';
import { fleetGraphEvalCases, runFleetGraphEvalCases } from './eval.js';

describe('FleetGraph eval corpus', () => {
  it('keeps the deterministic baseline cases passing', () => {
    const results = runFleetGraphEvalCases(fleetGraphEvalCases);
    const failures = results.filter((result) => !result.passed);
    const outcomes = new Set(results.map((result) => result.actualOutcome));
    const humanReviewed = results.filter((result) => result.actualHumanDecisionRequired);

    expect(failures).toEqual([]);
    expect(results).toHaveLength(6);
    expect(outcomes).toEqual(
      new Set(['healthy', 'human_review_required', 'draft_report_recommended'])
    );
    expect(humanReviewed).toHaveLength(4);
  });

  it('includes one flagship blocker-propagation proof case with a report branch', () => {
    const flagship = fleetGraphEvalCases.find((testCase) => testCase.id === 'blocked-project-graph');

    expect(flagship).toEqual(
      expect.objectContaining({
        useCaseId: 'uc-blocker-propagation',
        expected: expect.objectContaining({
          outcome: 'draft_report_recommended',
          nextPath: ['human-review', 'draft-report'],
          humanDecisionRequired: true,
        }),
      })
    );
  });
});
