# E2E Optimization Plan - 2026-03-13

## Why this plan exists

The current Playwright suite is too large and too coupled to implementation details to serve as a reliable release signal.

Observed outcomes from the 2026-03-13 run:

- API unit tests passed.
- Web unit tests passed.
- The full E2E suite produced a very large failure surface.
- The failures were not one single app outage. They clustered into:
  - real product defects
  - stale selectors
  - seed/data assumptions
  - implementation-coupled DOM assertions

The goal is not simply to "make the red go away." The goal is to make the suite trustworthy.

## Target Test Strategy

Split the current E2E suite into four layers.

### 1. Deploy Smoke

Purpose:

- fast release confidence
- minimal false positives
- deterministic setup only

Should gate deploy.

Candidate coverage:

- login
- navigate to docs
- create/edit/save document
- create issue
- open project/program
- one private-access check
- one collaboration/WebSocket check

Target size:

- `10` to `20` tests

### 2. Critical Workflow E2E

Purpose:

- browser-level validation for true end-to-end business flows

Candidate coverage:

- issue to project conversion
- weekly plan creation and review
- request changes flow
- private documents
- manager review flow
- core admin/member invitation flow

Target:

- fewer but deeper tests
- explicit, deterministic setup
- avoid depending on generic seed data

### 3. Accessibility Validation

Purpose:

- keep a11y regressions visible without making the whole suite brittle

Subdivide into:

- key-page axe scans
- targeted interaction accessibility flows
- component-level accessibility moved down to lower layers where possible

Rule:

- do not rely on broad seed assumptions just to reach a page state

### 4. Integration/API Coverage

Purpose:

- move inference-heavy and data-shape assertions out of Playwright

Candidate coverage to move down:

- accountability route behavior
- urgency flag logic
- request-changes authorization
- estimate calculations
- admin membership and invite response behavior

These belong in API tests unless the browser itself is part of the requirement.

## Decision Framework

For each current E2E test, put it in one of five buckets.

### Keep

Use for:

- critical user journey
- requires browser behavior
- low selector fragility
- deterministic setup possible

### Merge

Use for:

- tests that repeat the same setup and same page traversal
- tests that differ only by one heading or one small assertion

### Move

Use for:

- route logic
- response shape
- permission/inference logic
- deterministic calculations

Move these to API or component/integration tests.

### Rewrite

Use for:

- still-valid requirement
- current test is coupled to stale DOM structure or seed assumptions

### Remove

Use for:

- duplicate coverage with no unique signal
- implementation-detail assertions that are not product contracts
- tests whose title overclaims what is actually being verified

## Concrete Recommendations By Category

### Accessibility Remediation Suite

Current problem:

- too many tests reach state through brittle navigation
- multiple tests depend on scraping `a[href*="/documents/"]`
- some tests assert exact DOM shape instead of accessibility outcome

Plan:

- `Keep` the axe scans for key pages
- `Keep` genuine interaction a11y checks
- `Rewrite` any test that opens issues or docs through brittle anchor assumptions
- `Merge` properties-sidebar tests into a smaller number of deterministic issue-detail accessibility tests
- `Remove or rewrite` exact semantic container shape checks when they test implementation rather than actual accessibility

Specific direction:

- create/open a known issue in setup instead of scraping the first visible anchor
- test accessible names, focus order, roles, and contrast
- do not require one exact HTML structure when multiple valid implementations exist

### Accessibility Axe Suite

Current problem:

- valid high-signal suite, but currently mixed into a noisy broader run

Plan:

- `Keep`
- make this its own explicit suite for:
  - login
  - docs
  - issues
  - programs

Rule:

- failing axe scans should remain meaningful and should not depend on unrelated seeded content

### Accountability Banner and Accountability Flow Tests

Current problem:

- tests assume seeded overdue items or old sprint timing
- route logic is inference-based and dynamic

Plan:

- `Move` route-shape and urgency computation checks to API tests
- `Rewrite` browser tests to create the exact due/overdue scenario they need
- `Keep` one or two UI-level banner/modal smoke tests

Examples:

- keep: "banner renders when actionable items exist"
- move: "has_overdue and has_due_today correctly reflect days_overdue values"
- rewrite: any test that depends on "seeded sprints from 3 months ago"

### Admin Workspace / Member Management

Current problem:

- tests hard-code workspace names from old seeds
- several tests repeat identical navigation setup

Plan:

- `Rewrite` to create or select a workspace dynamically
- `Merge` multiple workspace-detail rendering checks into a single "workspace detail basics" test
- `Move` invite/member role API behavior to API tests where possible

Suggested split:

- one browser test for workspace detail page rendering
- one browser test for invite flow
- one browser test for add-existing-user flow
- role mutations and edge cases moved lower

### Private Documents

Current problem:

- high-value behavior, but likely expensive and repeated

Plan:

- `Keep`
- ensure deterministic setup with explicit creator/admin/other-user actors
- reduce duplicate variants that only differ by tiny assertion wording

This area is worth preserving because it is a real product boundary.

### Request Changes UI / API

Current problem:

- likely split across API and UI tests with overlap

Plan:

- `Keep` one browser flow proving the request-changes UI works
- `Move` authorization and status-code variants to API tests
- `Merge` plan and retro browser flows if they differ only superficially

### Weekly Accountability / Weeks / Program Week UX

Current problem:

- likely too many variations over similar week-planning workflows
- likely heavy seed dependence

Plan:

- `Keep` a small number of end-to-end week workflows
- `Move` date-dependent inference and route-shape assertions down to API tests
- `Rewrite` tests to derive current week/sprint state from the server when needed

### Syntax Highlighting / Editor Rich Interaction

Current problem:

- editor E2E tests are expensive and can be flaky
- there are many permutations

Plan:

- `Keep` a slim browser smoke set:
  - create code block
  - multiline content persists
  - save/reload persists
- `Move` lower-level editor behavior to component/editor tests if possible
- `Merge` overlapping syntax variants that do not represent distinct user risk

### Issue Estimates / Status Heatmap / TOC / Tables

Current problem:

- likely too many isolated UI micro-behavior tests at browser level

Plan:

- `Evaluate individually`
- `Move` calculations and formatting logic to unit/integration
- `Keep` only the highest-value end-user workflows in Playwright

## Suite Restructure Proposal

### New commands

Add explicit suite tiers:

```bash
pnpm test:e2e:smoke
pnpm test:e2e:critical
pnpm test:e2e:a11y
pnpm test:e2e:full
```

Suggested meanings:

- `smoke`: deploy gate
- `critical`: important browser workflows
- `a11y`: axe + focused interaction accessibility
- `full`: everything kept after cleanup

### Tagging / naming conventions

Use consistent grouping:

- `@smoke`
- `@critical`
- `@a11y`
- `@slow`
- `@seeded`

Goal:

- we should be able to answer "what are we running and why?" from the command line alone

## Design Rules For Rewritten Tests

### Rule 1: Create your own state when practical

Do not depend on generic seed content if the test can create the document/project/week it needs.

### Rule 2: Test user contracts, not implementation shape

Prefer:

- role-based selectors
- visible text
- stable labels
- explicit navigation outcomes

Avoid:

- generic `a[href*="/documents/"]` scrapes
- assumptions about internal wrapper structure
- assumptions about the first row/item in a list

### Rule 3: One browser test per unique user risk

If five tests share the same path and differ only by one heading assertion, merge them.

### Rule 4: Move pure logic down

If a test is primarily checking:

- computed flags
- date logic
- permission matrix
- response shape

it probably belongs below Playwright.

### Rule 5: Name tests honestly

If a test title says "full flow," it should actually execute that flow.

## Immediate Cleanup Priorities

### Priority 1

- Fix confirmed real accessibility bugs.
- Freeze deploy gating to smoke-only E2E, not the full suite.

### Priority 2

- Rewrite the stale `/issues` navigation pattern used across accessibility-remediation tests.
- Rewrite admin workspace tests to stop depending on one workspace name.
- Rewrite accountability tests to stop depending on seed age.

### Priority 3

- Collapse overlapping browser tests in admin, accessibility-remediation, and accountability areas.
- Move route-logic assertions to API tests.

### Priority 4

- Re-run the reduced suites and establish a new baseline.

## Recommended Deliverables

1. A small smoke suite that can realistically gate local deploy confidence.
2. A rewritten accessibility suite with deterministic setup.
3. Fewer but stronger workflow E2E tests.
4. More route and inference coverage moved into API tests.
5. An explicit list of removed tests and why they were removed.

## Bottom Line

The current E2E suite is not just failing because the app is broken. It is also failing because the suite has accumulated too much overlap, too much DOM coupling, and too much dependence on changing seed data.

The correct response is:

- fix real bugs
- rewrite brittle tests
- move logic checks down a layer
- shrink the deploy gate dramatically

That gives us a smaller suite with higher trust, instead of a giant suite that mostly teaches us to ignore red output.
