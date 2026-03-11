# Phase 2 Implementation Plan

## Scope
This plan is for Phase 2 implementation across all seven audit categories. The audit is treated as guidance, not a rigid checklist, but its measured hotspots and improvement targets are used to drive prioritization.

Source inputs used:
- `audit/final-audit-report.md`
- `audit/cat-1-type-safety.md`
- `audit/cat-2-frontend-bundle-size.md`
- `audit/cat-3-api-response-time.md`
- `audit/cat-4-database-query-efficiency.md`
- `audit/cat-5-test-coverage-and-quality.md`
- `audit/cat-6-runtime-error-and-edge-case-handling.md`
- `audit/cat-7-accessibility-compliance.md`
- `audit/GFA_Week_4-ShipShape.pdf`

This plan now reflects both:
- the in-repo audit findings
- the assignment’s explicit Phase 2 rules, scoring criteria, and improvement thresholds from `GFA_Week_4-ShipShape.pdf`

## Phase 2 Goals
The point of this phase is not just to "pass the audit better." The point is to make Ship feel like a serious, maintainable product:
- safer to change
- faster to load and use
- more reliable in failure cases
- easier to demonstrate in interviews and code reviews
- backed by test evidence instead of optimistic assumptions

The assignment framing matters here:
- Phase 2 is `4.5 days`
- all 7 categories must improve measurably
- the audit guides priorities, but each category still needs evidence-backed progress
- depth beats breadth, but measurable proof beats promises

## Success Criteria
By the end of Phase 2, we should be able to show:
- materially reduced type-safety escape hatches in production backend code
- a meaningfully smaller initial frontend bundle, especially the main entry chunk
- better tail latency on the highest-value API endpoints
- reduced read-path query waste and fewer query-loop hotspots
- a test suite that is honest, green in the right places, and measurable with coverage
- explicit user-facing recovery states for save/sync/upload failures
- stronger accessibility evidence, including contrast fixes and regression coverage

In assignment terms, the output should also support:
- reproducible before/after measurements
- root-cause explanations, not surface patching
- clean commit separation
- demoable outcomes for a short walkthrough video

## Phase 2 Guardrails
These come directly from the assignment and should govern implementation choices:
- no cosmetic-only changes
- no removing functionality to make metrics look better
- every improvement should map to one of the 7 measured categories
- every category needs before/after evidence
- root cause must be documented for each major fix
- new code must be well typed and technically defensible
- commits should be logically separated and descriptively named

## Measurement and Evidence Requirements
For every category, Phase 2 should capture:
- baseline value from the audit
- exact post-change measurement
- reproduction command or method
- short root-cause explanation
- short explanation of why the chosen fix is better
- tradeoffs if relevant

Required evidence formats from the assignment:
- before/after benchmarks for API and query work
- before/after bundle analysis for frontend performance work
- reproducible accessibility evidence through Lighthouse or axe output
- reproduction steps and before/after behavior for runtime-error fixes
- meaningful test additions or flake fixes with documented rationale

## Delivery Strategy
Implementation should happen in waves, not category-by-category silos. Several audit categories overlap in the same files and flows, especially:
- `api/src/routes/weeks.ts`
- `api/src/routes/projects.ts`
- `api/src/services/accountability.ts`
- `web/src/components/Editor.tsx`
- `web/src/hooks/useAutoSave.ts`
- `web/src/hooks/useRealtimeEvents.tsx`
- admin, team, reviews, settings, and documents surfaces in `web/src/pages/`

Recommended delivery order:
1. Stabilize foundations: tests, instrumentation, and failure visibility
2. Refactor highest-risk backend boundaries: type safety, query shape, and endpoint hotspots
3. Reduce frontend initial-load cost by isolating editor/collaboration weight
4. Finish accessibility and workflow polish with regression coverage

This order matches the assignment’s bias toward:
- measure first
- fix root cause
- prove improvement
- document reasoning

## Workstreams

### 1. Type Safety
Audit target:
- Remove roughly 25% of measured type-safety escape hatches, with emphasis on production boundary code rather than cosmetic cleanup.

Assignment threshold:
- eliminate `25%` of type-safety violations
- superficial substitutions do not count
- replacing `any` with `unknown` without real narrowing does not count

Primary objectives:
- reduce `any`, `as`, and non-null assertions in production API code first
- replace runtime assumptions with validated contracts
- make tests use typed fixtures instead of permissive mocks

Priority files:
- `api/src/routes/weeks.ts`
- `api/src/routes/projects.ts`
- `api/src/routes/issues.ts`
- `api/src/services/accountability.ts`
- high-density tests:
  - `api/src/__tests__/transformIssueLinks.test.ts`
  - `api/src/services/accountability.test.ts`
  - `api/src/__tests__/auth.test.ts`

Implementation actions:
- Introduce explicit row/result types for common document queries and association queries.
- Add parsing helpers for `documents.properties` by document type instead of reading JSON blobs ad hoc inside routes.
- Replace route-local coercion with `zod` request and response shaping where values enter the system.
- Remove non-null assertions by restructuring guard clauses and typed narrowing.
- Create shared typed test factories for auth, accountability, issue, and document fixtures so tests stop depending on `as any`.
- Prefer demonstrating real TypeScript fluency in fixes:
  - discriminated unions for document types where useful
  - type guards for parsed property bags
  - utility types for shared DTO shaping
  - explicit return types on complex helpers

Definition of done:
- the largest backend route files have visibly fewer assertions and non-null operators
- boundary helpers exist for document-property decoding
- tests still pass with stricter fixture typing
- reduction is measurable against the audited baseline, not anecdotal

### 2. Frontend Bundle Size
Audit target:
- shrink first-load payload by reducing the oversized main entry chunk rather than merely increasing chunk count.

Assignment threshold:
- `15%` reduction in total production bundle size, or
- code splitting that reduces initial-load bundle weight by `20%`
- before/after bundle analysis output required

Primary objectives:
- move editor/collaboration-heavy code behind real lazy boundaries
- stop mixed static and dynamic imports from defeating code splitting
- remove unused frontend runtime weight

Primary hotspots:
- `emoji-picker-react`
- `highlight.js`
- `yjs`
- TipTap / ProseMirror editor stack
- upload/editor modules with overlapping static and dynamic imports

Implementation actions:
- Audit the import graph for editor-related modules and convert editor-only surfaces to route-level or component-level lazy loading.
- Remove static imports for modules already intended to load dynamically, especially around upload and file attachment flows.
- Defer emoji picker, syntax highlighting, rich collaboration bootstrapping, and media tooling until the editor path actually needs them.
- Review whether read-only document views can avoid loading the full collaborative editor runtime.
- Remove `@tanstack/query-sync-storage-persister` if it is still unused after verification.
- Add bundle budget reporting to the build output so regressions are visible.

Definition of done:
- main chunk materially smaller than the audited baseline
- editor-heavy dependencies no longer dominate initial app load for non-editor pages
- build output clearly shows chunk ownership and bundle budget deltas
- a before/after artifact exists that demonstrates either the `15%` total reduction or the `20%` initial-load reduction

### 3. API Response Time
Audit target:
- improve tail latency on aggregate and list endpoints, especially under concurrency.

Assignment threshold:
- `20%` reduction in P95 response time on at least `2` endpoints
- before/after benchmarks must be run under identical conditions
- root cause of each bottleneck must be documented

Primary objectives:
- reduce P95/P99 for:
  - `GET /api/issues`
  - `GET /api/team/accountability-grid-v3`
  - `GET /api/dashboard/my-week`
- preserve behavior while tightening endpoint internals

Implementation actions:
- profile endpoint internals for repeated data fetch, property extraction, and response shaping costs
- batch and cache within-request data dependencies where safe
- simplify heavy aggregation paths in accountability and dashboard services
- reduce redundant session/auth-related database work if middleware permits consolidation
- add a lightweight benchmark script or repeatable command for post-change measurement

Definition of done:
- the slowest list and rollup endpoints show lower tail latency than the March 11, 2026 baseline
- benchmark reruns are reproducible enough to compare before/after changes
- at least two endpoints clear the `20%` P95 improvement bar under comparable benchmark conditions

### 4. Database Query Efficiency
Audit target:
- reduce cost in the heaviest flows, remove write work from read paths, batch service loops, and improve index coverage.

Assignment threshold:
- `20%` reduction in total query count on at least one user flow, or
- `50%` improvement on the slowest query
- before/after `EXPLAIN ANALYZE` evidence required

Primary objectives:
- eliminate side-effect writes from read-only flows
- collapse source-level query loops in accountability code
- improve index support for repeated JSONB filters and search

Primary hotspots:
- write inside `GET /api/weeks/:id` in `api/src/routes/weeks.ts`
- query-per-loop patterns in `api/src/services/accountability.ts`
- weak index support for:
  - weekly plan / retro lookups
  - assignee and sprint filters
  - search title matching
  - large `document_associations` membership reads

Implementation actions:
- Move `planned_issue_ids` mutation out of the `GET /api/weeks/:id` read path.
- Refactor accountability service loops into batched queries and in-memory grouping.
- Add migration(s) for targeted expression indexes on the most repeated document-property filters.
- Evaluate trigram or text-search support for `title ILIKE '%...%'` search paths.
- Re-check association lookups to support batched reads without sequential scans where practical.
- Re-run query profiling on the same five audited flows after changes.

Definition of done:
- no write occurs during sprint-board read loading
- accountability service no longer performs obvious `for ... of` plus `await query` loops for major read paths
- audited heavy flows show equal or lower query count and improved query shape
- at least one audited flow hits the assignment threshold with evidence

### 5. Test Coverage and Quality
Audit target:
- make the test story honest, green, and measurable; aim for `web 70%` and `api 80%` line coverage once tooling works.

Assignment threshold:
- add meaningful tests for `3` previously untested critical paths, or
- fix `3` flaky tests with documented root-cause analysis
- each new meaningful test should explain the regression risk it protects against

Primary objectives:
- stop misleading contributors with incomplete root test commands
- get web Vitest back to green
- reduce Playwright failures and flake
- fill zero-coverage gaps in critical flows
- turn coverage reporting back on

Implementation actions:
- Update root scripts so test commands clearly distinguish:
  - API unit/integration
  - web unit
  - E2E
  - full CI / verification
- Fix deterministic web test failures in:
  - `web/src/lib/document-tabs.test.ts`
  - `web/src/components/editor/DetailsExtension.test.ts`
- Triage current Playwright failures into:
  - real product bugs
  - brittle selectors or timing issues
  - environment-specific harness failures
- Add direct tests for:
  - `caia-auth`
  - `claude`
  - `admin-credentials`
  - invite acceptance happy path
- Install and wire up `@vitest/coverage-v8` so line coverage becomes reportable.
- Add a release-readiness command that does not overclaim what was run.
- Add concise risk comments in new tests where the assignment expects rationale.

Definition of done:
- web Vitest is green
- the known failing/flaky Playwright set is materially smaller
- coverage commands run successfully
- missing critical route workflows have direct automated coverage
- at least one of the assignment thresholds is clearly satisfied and documented

### 6. Runtime Error and Edge Case Handling
Audit target:
- replace console-only failure behavior with explicit recovery states and centralized observability.

Assignment threshold:
- fix `3` error-handling gaps
- at least one fix must address a real user-facing data-loss or confusion risk
- each fix requires reproduction steps, before/after behavior, and screenshot or recording evidence

Primary objectives:
- make save/sync/upload/collaboration states visible to users
- reduce alert-driven and console-only error handling
- add server-side and client-side capture for failures that currently disappear

Primary hotspots:
- `web/src/components/Editor.tsx`
- `web/src/hooks/useAutoSave.ts`
- `web/src/hooks/useRealtimeEvents.tsx`
- route/page async handling in:
  - `AdminWorkspaceDetail`
  - `WorkspaceSettings`
  - `Projects`
  - `TeamMode`
  - `ReviewsPage`
- `api/src/index.ts`

Implementation actions:
- Introduce a small shared error-state model for:
  - saving
  - offline
  - reconnecting
  - upload failed
  - conversion failed
  - stale sync state
- Replace `alert()` and bare `console.error` paths in editor-related flows with durable inline banners, toasts, or action states.
- Add route/page-level async recovery UI for key app surfaces missing localized failure handling.
- Add `process.on('unhandledRejection', ...)` and related centralized server logging at startup.
- Improve upload retry and file-picker failure handling, especially around the `/image` slash command path.
- Add focused regression tests for offline reconnect, autosave exhaustion, upload failure, and collaboration degradation.

Definition of done:
- users can tell whether content is saved, queued, offline, or failed
- edge-case failures no longer primarily surface as console noise
- server startup includes centralized background failure capture
- at least three concrete error-handling gaps are fixed and documented with reproductions

### 7. Accessibility Compliance
Audit target:
- close manual accessibility gaps, fix contrast failures, and add reproducible tooling so accessibility claims are evidence-backed.

Assignment threshold:
- improve the lowest Lighthouse accessibility score by `10+` points, or
- fix all Critical/Serious violations on the `3` most important pages
- before/after Lighthouse or axe evidence required

Primary objectives:
- fix confirmed contrast failures
- fix manual NVDA naming/context issues
- extend regression coverage to hotspot workflows
- create a repeatable Lighthouse and contrast audit path

Primary hotspots:
- `web/src/pages/AdminDashboard.tsx`
- `web/src/pages/AdminWorkspaceDetail.tsx`
- `web/src/pages/Documents.tsx`
- `web/src/components/ActionItemsModal.tsx`
- `web/src/components/StatusOverviewHeatmap.tsx`
- global app chrome / top bar controls
- `web/src/pages/Projects.tsx`
- `web/src/pages/TeamMode.tsx`
- `web/src/pages/ReviewsPage.tsx`
- `web/src/pages/WorkspaceSettings.tsx`

Implementation actions:
- Replace or retokenize low-contrast text on dark backgrounds, starting with `text-accent` and other failing token combinations.
- Add accessible names and context to the user-initial icon, settings button, toolbar toggle, delete document control, and Team Mode current-week icon.
- Fix the Action Items modal selection issue and the missing return/back affordance from Status Overview person detail.
- Expand keyboard-only coverage for projects, team mode, reviews, workspace settings, and admin.
- Add a repo-native Lighthouse workflow for major routes.
- Add a repeatable contrast audit script covering admin/settings/review surfaces.

Definition of done:
- known manual accessibility defects are fixed
- major page accessibility scores are reproducible through the repo
- contrast regressions and keyboard workflow regressions are testable
- accessibility evidence clearly satisfies one of the assignment thresholds

## Cross-Cutting Refactor Themes

### A. Shared Contracts
Create stronger shared contracts between `api`, `web`, and `shared`:
- shared document-property types
- shared response DTOs where practical
- shared status/error enums for save/sync/upload states

This will improve categories 1, 5, and 6 together.

### B. Editor Surface Isolation
Treat the editor as a subsystem, not just a component:
- lazy-load it
- isolate collaboration bootstrap
- give it explicit runtime states
- test it intentionally

This will improve categories 2, 5, and 6 together.

### C. Route Decomposition
Break oversized route files into:
- parsing/validation
- query access
- domain transforms
- response serialization

This will improve categories 1, 3, 4, and 5 together.

### D. Reproducibility First
Every optimization and fix should leave behind a repeatable command, script, or written procedure.

This is required for grading and also makes the work much stronger in interviews.

## Suggested Execution Plan

### Wave 1: Make the repo trustworthy
Focus:
- fix root test script honesty
- restore web tests
- enable coverage tooling
- add centralized runtime error capture
- define where before/after artifacts will live

Why first:
- we should not do a large refactor without dependable feedback loops

Primary outputs:
- updated package scripts
- green web Vitest
- working coverage commands
- server/client runtime capture improvements
- an evidence structure for Phase 2 measurements

### Wave 2: Backend boundary refactor
Focus:
- `weeks.ts`
- `projects.ts`
- `issues.ts`
- `accountability.ts`

Why second:
- these files affect type safety, query efficiency, and API latency at the same time

Primary outputs:
- typed query helpers
- batched accountability queries
- no read-path writes in sprint-board loading
- lower-risk route code
- before/after benchmark and query evidence for changed endpoints and flows

### Wave 3: Frontend performance and editor reliability
Focus:
- lazy-loading and import-graph cleanup
- editor runtime states
- upload/offline/collaboration resilience

Why third:
- this gives visible product improvement and directly addresses the weakest runtime/user-perceived pain points

Primary outputs:
- smaller main bundle
- cleaner editor error handling
- improved upload/offline behavior
- artifacts proving bundle and runtime improvements

### Wave 4: Accessibility hardening and portfolio polish
Focus:
- contrast fixes
- accessible names
- keyboard workflow coverage
- Lighthouse workflow

Why fourth:
- these are the best final polish items for demonstrating quality and care in interviews

Primary outputs:
- stronger accessibility story
- reproducible quality evidence
- smoother demo-ready product flows
- final documentation package for submission and hiring use

## Suggested Milestones

### Milestone 1
- web tests green
- coverage tooling working
- runtime error capture standardized at startup and in key editor flows

### Milestone 2
- `weeks.ts` read-path write removed
- accountability service query loops batched
- top route files have meaningful type-safety reduction

### Milestone 3
- main bundle reduced materially
- non-editor routes avoid editor-heavy initial payload
- editor runtime states visible and tested

### Milestone 4
- manual accessibility findings resolved
- Lighthouse and contrast workflows reproducible
- release/demo checklist is evidence-backed

## Required Artifacts for Submission
The PDF makes the final deliverable expectations explicit. Phase 2 work should prepare these:
- improvement documentation for each of the 7 categories:
  - before measurement
  - root cause
  - fix description
  - after measurement
  - reproducibility proof
- discovery write-up:
  - 3 things learned with codebase references
- short demo support:
  - before/after numbers
  - concise reasoning notes
- AI usage reflection:
  - where AI helped
  - where it hindered
  - where suggestions needed correction

## Suggested Folder Structure
If you move planning into `audit/`, keep Phase 2 execution artifacts structured so the grading evidence is easy to follow:
- `audit/phase-2-implementation-plan.md`
- `audit/phase-2-progress-log.md`
- `audit/phase-2-evidence/`
- `audit/phase-2-evidence/bundle/`
- `audit/phase-2-evidence/api/`
- `audit/phase-2-evidence/database/`
- `audit/phase-2-evidence/tests/`
- `audit/phase-2-evidence/runtime/`
- `audit/phase-2-evidence/accessibility/`
- `audit/phase-2-discovery-writeup.md`
- `audit/phase-2-ai-usage.md`

## Evidence to Capture During Implementation
For job-readiness, every major improvement should leave evidence behind:
- before/after bundle size numbers
- before/after API benchmark numbers
- before/after query profile summaries
- before/after counts for `any` / `as` / `!` in targeted files
- test pass/fail/flaky deltas
- coverage percentages once enabled
- accessibility scores and regression test additions

Recommended artifact folder additions:
- `implementation/artifacts/phase2/`
- `implementation/checklists/`

## Recommended Repo Additions
- `audit/phase-2-implementation-plan.md` this file
- `audit/phase-2-progress-log.md`
- `audit/phase-2-discovery-writeup.md`
- `audit/phase-2-ai-usage.md`
- `audit/phase-2-evidence/README.md`

## Priority Decision Rule
When there is tension between fixing many small things and fixing fewer high-leverage things, choose the changes that:
1. satisfy a measurable assignment threshold
2. address real user or developer pain
3. show root-cause understanding
4. leave behind reproducible proof

That is the strongest path both for passing the project and for telling a credible hiring story.

## Hiring-Focused Outcome
If we execute this well, the story is strong:
- you identified concrete quality debt
- you prioritized by user impact and engineering leverage
- you improved architecture, not just styling
- you backed claims with measurements
- you left the codebase easier to extend safely

That is the kind of refactor story that reads well in interviews, portfolio walkthroughs, and code reviews.
