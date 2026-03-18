import { describe, expect, it } from 'vitest';
import { fleetGraphEvalCases, runFleetGraphEvalCases } from './eval.js';

describe('FleetGraph eval corpus', () => {
  it('keeps the deterministic baseline cases passing', () => {
    const results = runFleetGraphEvalCases(fleetGraphEvalCases);
    const failures = results.filter((result) => !result.passed);

    expect(failures).toEqual([]);
    expect(results).toHaveLength(5);
  });
});
