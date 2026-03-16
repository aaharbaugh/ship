# E2E Failure Analysis - 2026-03-13

## Scope

This document captures the current E2E failure analysis from the Playwright run started on 2026-03-13.

Command used:

```bash
sg docker -c "cd /home/aaron/projects/gauntlet/ship/ship && PLAYWRIGHT_WORKERS=4 pnpm exec playwright test --reporter=json"
```

Important context:

- API unit tests passed: `29` files, `458` tests.
- Web unit tests passed: `16` files, `153` tests.
- The failures below are from the E2E suite only.
- This suite is broad and mixes together:
  - genuine product defects
  - brittle selectors
  - assumptions about seed data
  - assumptions about exact DOM structure

## Classification Legend

- `Real bug`: The test still reflects a valid product requirement and is finding a real issue.
- `Rewrite test`: The requirement is still valid, but the test setup or selector strategy is no longer aligned with the current app.
- `Seed/data drift`: The test assumes specific seeded data or date behavior that is no longer guaranteed.
- `Likely obsolete`: The test encodes a very specific implementation detail rather than a stable product contract.

## Current Failing Tests

| Test | File | Classification | Why it fails now | Recommendation |
|---|---|---|---|---|
| `screen readers can identify issue state without color` | `e2e/accessibility-remediation.spec.ts` | `Rewrite test` | The current app still renders `data-status-indicator` in issue and kanban views, but this test depends on the issues page rendering those indicators immediately after `goto('/issues')`. The selector is valid in principle, but the test is too optimistic about page state and list contents. | Keep the accessibility requirement. Update the test to wait for a real issue row or create an issue before asserting status indicator semantics. |
| `combobox has required ARIA attributes` | `e2e/accessibility-remediation.spec.ts` | `Rewrite test` | The test tries to open the first issue via `a[href*="/documents/"]`. On the current issues page, navigation is row-driven through `SelectableList` and click handlers, not guaranteed visible anchors. | Keep the combobox accessibility assertion. Replace the anchor scrape with a stable row interaction or create/open a known issue directly. |
| `properties sidebar forms have proper labels` | `e2e/accessibility-remediation.spec.ts` | `Rewrite test` | Same setup problem as above: it assumes `/issues` exposes visible `/documents/` anchors. The properties portal still exists, but the navigation step is brittle. | Keep the accessibility assertion. Fix test setup to navigate into a known issue using the actual interaction model. |
| `properties sidebar works with keyboard only` | `e2e/accessibility-remediation.spec.ts` | `Rewrite test` | Same brittle issue-opening step via `a[href*="/documents/"]`. | Keep the requirement. Rework the test to open a known issue deterministically before tabbing into the properties sidebar. |
| `navigating to nested document auto-expands tree ancestors` | `e2e/accessibility-remediation.spec.ts` | `Rewrite test` | The current tree implementation is collapsible and stateful. The test assumes the first `[aria-expanded]` item will reveal a nested child link after one click. That is not a stable seed guarantee. | Keep the requirement. Create or locate a specific nested document in setup, then verify expansion/highlighting against that known path. |
| `issue lists use semantic list markup` | `e2e/accessibility-remediation.spec.ts` | `Likely obsolete` | The test only accepts `table[role="grid"]` or a very specific `ul/li` pattern. The current list view is implemented via `SelectableList`, which provides a semantic grid but may not match this exact DOM shape. | Rewrite around stable accessibility guarantees, not exact container markup. Verify rows/cells or interactive list semantics rather than specific tag combinations. |
| `related form fields are grouped with fieldset` | `e2e/accessibility-remediation.spec.ts` | `Rewrite test` | Again depends on opening a document through a brittle link scrape on `/issues`. The assertion allows either group semantics or proper labeling, which is reasonable, but setup is stale. | Keep the intent. Fix navigation/setup. |
| `form fields have contextual help where needed` | `e2e/accessibility-remediation.spec.ts` | `Rewrite test` | Same issue-opening assumption. It also scans all page inputs after navigation, which makes the result highly sensitive to unrelated layout changes. | Narrow scope to the properties sidebar of a known issue and assert only fields that truly need format hints. |
| `issues page has no WCAG 2.2 AA violations` | `e2e/accessibility-remediation.spec.ts` | `Real bug` | Axe reports a real `color-contrast` violation on the `Create an issue` button. Current contrast in the failure log is `2.89:1`, below the required `4.5:1`. | Do not weaken this test. Fix the button color contrast. |
| `programs mode has no critical accessibility violations` | `e2e/accessibility.spec.ts` | `Real bug` | Axe reports a real `color-contrast` violation on the `Create your first program` button with the same failing contrast ratio. | Do not weaken this test. Fix the button color contrast. |
| `can navigate main app with keyboard - full flow from login to create issue` | `e2e/accessibility.spec.ts` | `Likely obsolete` | The test name claims a “full flow from login to create issue,” but the implementation only logs in, tabs twice, and asserts the page did not crash. The behavior under test does not match the title. | Rewrite or delete. If we keep it, it should either cover a real keyboard create-issue flow or be renamed to a much narrower smoke test. |
| `banner is red when overdue items exist` | `e2e/accountability-banner-urgency.spec.ts` | `Seed/data drift` | The test hard-codes “seed data has sprints from 3 months ago - items will be overdue.” The current `/api/accountability/action-items` route computes items dynamically from live inferred state. That assumption no longer holds. | Rewrite to create deterministic overdue conditions in the test instead of relying on seed age. |
| `urgency flags correctly reflect item days_overdue values` | `e2e/accountability-banner-urgency.spec.ts` | `Seed/data drift` | Same problem: it assumes seed data guarantees overdue items. The API still returns valid shape, but the test’s overdue expectation is not stable. | Keep the response-shape assertion, but create the due-date scenario explicitly in setup. |
| `clicking banner opens the action items modal` | `e2e/accountability-banner-urgency.spec.ts` | `Seed/data drift` | This test assumes a red or amber banner will be present after login. But the banner is rendered only when `itemCount > 0` in the current component. With no overdue/due-today items, the banner correctly does not render. | Rewrite to seed or create at least one actionable item before asserting modal behavior. |
| `creating standup removes action item on business days` | `e2e/accountability-standup.spec.ts` | `Rewrite test` | The test name implies the user should first see a standup item, but the captured failure indicates the suite hit the branch where it “did not see standup action item.” Standup generation is conditional on business day logic and inferred issue state. This needs deterministic setup around the current server-side date and sprint assignment logic. | Keep the business-day requirement. Make the preconditions explicit and assert weekend vs weekday behavior separately. |
| `allocated person without weekly_plan shows action item, creating plan removes it` | `e2e/accountability-week.spec.ts` | `Seed/data drift` | The test creates a sprint with `week_number: 1` / `sprint_number: 1` and assumes that is “in the past, so plan is due.” That depends on workspace dates and current inference rules. Those assumptions are fragile. | Rewrite to derive the currently due week from server state, then create the weekly-plan scenario against that computed week. |
| `can navigate to workspace detail by clicking workspace name` | `e2e/admin-workspace-members.spec.ts` | `Seed/data drift` | The test expects a seeded workspace named `Test Workspace`, but the failure snapshot shows the actual seeded row is `Dev User's Workspace`. The page itself is working; the seed name is different. | Rewrite to target the first workspace row or derive the expected name from the actual seeded workspace. |
| `workspace detail page shows members table` | `e2e/admin-workspace-members.spec.ts` | `Seed/data drift` | Same mismatch: test depends on `Test Workspace` existing by name. Snapshot shows a different workspace name, so the click target never matches. | Rewrite to navigate from the first visible workspace row instead of a hard-coded seed name. |
| `workspace detail page shows pending invites section` | `e2e/admin-workspace-members.spec.ts` | `Seed/data drift` | Same hard-coded `Test Workspace` assumption. | Rewrite setup to use the actual seeded workspace. |
| `workspace detail page shows add existing user section` | `e2e/admin-workspace-members.spec.ts` | `Seed/data drift` | Same hard-coded `Test Workspace` assumption. | Rewrite setup to use the actual seeded workspace. |

## Cross-Cutting Themes

### 1. Anchor-based navigation on `/issues` is no longer a stable contract

Several accessibility-remediation tests assume they can open an issue via:

```ts
page.locator('a[href*="/documents/"]').first()
```

That is no longer a reliable interaction model on the issues page. Current issue navigation is driven by row/item click handlers in [web/src/components/IssuesList.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/components/IssuesList.tsx), especially through `SelectableList` and `KanbanBoard`.

Implication:

- These tests are not proving the requirement is false.
- They are proving the setup strategy is out of date.

### 2. The accountability E2E tests encode old seed timing assumptions

The accountability banner and weekly accountability tests repeatedly assume:

- seeded sprints are old
- overdue items must therefore exist
- a specific week number is always due

That no longer matches the current implementation, where the route computes action items dynamically from inferred state in [api/src/routes/accountability.ts](/home/aaron/projects/gauntlet/ship/ship/api/src/routes/accountability.ts).

Implication:

- These tests should create their own due/overdue scenarios.
- They should not depend on “3 months ago” seed timing remaining true forever.

### 3. Some accessibility failures are legitimate and should stay failing

The contrast failures are real product issues. The current UI still uses button styling that fails WCAG contrast for:

- `Create an issue`
- `Create your first program`

Implication:

- These should be fixed in the UI.
- We should not change the test to hide or normalize these failures.

### 4. Admin tests are coupled to exact seed names

The admin workspace tests assume `Test Workspace` is present by name. The current run snapshot shows `Dev User's Workspace` instead.

Implication:

- These tests are not validating behavior robustly.
- They should derive targets from available seeded rows rather than one hard-coded workspace label.

## Proposed Action Plan

1. Fix the real accessibility contrast issues first.
2. Rewrite the `/issues` accessibility-remediation tests to create or locate a known issue through current list interactions.
3. Rewrite accountability E2E tests so they create deterministic due/overdue conditions rather than relying on seed age.
4. Rewrite admin workspace E2E tests to use the first available seeded workspace or explicitly create one in setup.
5. Delete or rename tests whose title overclaims what they actually verify, especially the keyboard “full flow” test.

## Notes

- This document is based on the failing tests captured from the current 2026-03-13 E2E run and associated `test-results/` artifacts.
- If additional failures appear later in the same run, append them here rather than replacing the earlier entries.
