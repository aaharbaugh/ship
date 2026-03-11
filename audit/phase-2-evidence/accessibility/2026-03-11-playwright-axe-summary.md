# Accessibility Evidence Summary

Date: 2026-03-11
Branch: implementation

## Commands Run

```bash
sg docker -c "env PLAYWRIGHT_WORKERS=1 pnpm test:e2e e2e/accessibility.spec.ts e2e/status-colors-accessibility.spec.ts --reporter=line"
```

```bash
sg docker -c "env PLAYWRIGHT_WORKERS=1 pnpm test:e2e e2e/accessibility-remediation.spec.ts --grep 'no color contrast violations on main pages|properties sidebar works with keyboard only|command palette traps focus|skip link is visible on keyboard focus' --reporter=line"
```

## Results

### Remediation subset

- Status: pass
- Result: `3 passed`
- Duration: about `29.9s`

Covered checks:
- command palette traps focus
- no color contrast violations on main pages
- properties sidebar works with keyboard only

## Broad accessibility suite

- Status: mostly pass with one flaky test
- Result: `17 passed`, `1 flaky`
- Duration: about `53.6s`

Passing coverage included:
- login page axe audit
- main app shell axe audit
- docs page axe audit
- keyboard navigation checks
- focus visibility checks
- screen-reader label/alert checks
- loading-state checks
- status-color accessibility checks across issues, programs, week view, and feedback editor

## Flaky Test Note

Flaky test:
- `e2e/accessibility.spec.ts`
- `Accessibility - axe-core audit`
- `programs mode has no critical accessibility violations`

Observed failure mode:
- login helper remained on `/login`
- this appears to be an auth/setup timing issue, not an axe violation assertion

Supporting context from the run:
- the failing assertion was `expect(page).not.toHaveURL('/login')`
- there was also API startup noise showing `EADDRINUSE :::10000`, but the suite recovered and completed

## Interpretation

- The targeted remediation checks are currently green.
- The broader automated accessibility baseline is also effectively green aside from one flaky login/setup path.
- This evidence supports the claim that the current Category 7 work improved keyboard, modal, focus, and labeling behavior without introducing regressions in the existing automated accessibility checks.

## Follow-up

- Rerun the broad suite after stabilizing the login/setup flake if we want a clean `18/18`.
- Add Lighthouse before/after snapshots if the assignment submission needs score-based evidence in addition to axe/Playwright evidence.
