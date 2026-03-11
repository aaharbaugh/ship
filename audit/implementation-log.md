# Implementation Log

Use this file as the running record for Phase 2 implementation. Add one entry each time a meaningful chunk of work is completed.

## Entry Template

### Entry
- Date:
- Branch:
- Commit:
- Summary:
- Files changed:
- Categories improved:
- Baseline issue:
- What changed:
- Why this improves the system:
- Evidence captured:
- Follow-up needed:

## Entries

### Entry
- Date:
- Branch:
- Commit:
- Summary: Initialized Phase 2 implementation planning and evidence structure.
- Files changed:
  - `audit/phase-2-implementation-plan.md`
  - `audit/phase-2-progress-log.md`
  - `audit/phase-2-discovery-writeup.md`
  - `audit/phase-2-ai-usage.md`
  - `audit/phase-2-evidence/README.md`
- Categories improved:
  - Category 5: Test Coverage and Quality
  - Category 6: Runtime Error and Edge Case Handling
  - Category 7: Accessibility Compliance
  - Cross-category execution readiness for all 7 categories
- Baseline issue:
  - Phase 2 execution did not yet have a single structured place to record completed implementation chunks and tie them back to audit categories.
- What changed:
  - Added a dedicated implementation log format for recording work chunk by chunk with category mapping and evidence notes.
- Why this improves the system:
  - Makes the implementation process traceable, reproducible, and easier to convert into final submission documentation and interview talking points.
- Evidence captured:
  - Planning and evidence structure files under `audit/`
- Follow-up needed:
  - Append new entries as implementation work lands.

### Entry
- Date: 2026-03-11
- Branch: implementation
- Commit:
- Summary: Fixed the frontend unit test baseline, made root test scripts honest about suite scope, and added server-side runtime error traps.
- Files changed:
  - `package.json`
  - `api/src/index.ts`
  - `web/src/lib/document-tabs.test.ts`
  - `web/src/components/editor/DetailsExtension.test.ts`
  - `web/src/hooks/useSessionTimeout.test.ts`
- Categories improved:
  - Category 5: Test Coverage and Quality
  - Category 6: Runtime Error and Edge Case Handling
  - Category 1: Type Safety (minor improvement through stronger typed test usage and removal of stale assumptions)
- Baseline issue:
  - Root `pnpm test` only represented the API suite, which made the overall test signal misleading.
  - Web Vitest had deterministic failures caused by tests that no longer matched current product behavior.
  - Server startup lacked global `unhandledRejection` and `uncaughtException` handling.
- What changed:
  - Updated root scripts so `pnpm test` now runs both API and web unit suites, and added explicit `test:api`, `test:web`, `test:unit`, and `test:all` commands.
  - Updated `document-tabs` tests to match the current tab model, including sprint tabs and current tab ordering.
  - Updated `DetailsExtension` tests to reflect the real content model and include the companion nodes required by the extension.
  - Updated `useSessionTimeout` tests to mock the actual `apiPost('/api/auth/extend-session')` path instead of the wrong fetch behavior.
  - Added global `process.on('unhandledRejection', ...)` and `process.on('uncaughtException', ...)` handlers in API startup.
- Why this improves the system:
  - Contributors now get a more honest default unit-test signal.
  - The frontend suite is green again, which restores a usable regression loop before larger refactors.
  - Server-side async failures are now visible centrally instead of relying only on route-local catches.
- Evidence captured:
  - `pnpm --filter @ship/web test` passes: `16` files, `153` tests passed.
  - Root `pnpm test` now correctly exposes that API verification depends on database connectivity, instead of hiding the web suite entirely.
- Follow-up needed:
  - Coverage tooling is still not enabled because the coverage provider dependency is not yet wired in the repo.
  - API tests still require a reachable test database; rerun in the proper local/docker environment to validate `test:api` and `pnpm test`.

### Entry
- Date: 2026-03-11
- Branch: implementation
- Commit:
- Summary: Removed remaining warning noise from the web unit test suite so frontend verification is green and quiet.
- Files changed:
  - `web/src/contexts/SelectionPersistenceContext.test.tsx`
  - `web/src/hooks/useSessionTimeout.test.ts`
- Categories improved:
  - Category 5: Test Coverage and Quality
- Baseline issue:
  - The web suite passed, but it emitted noisy expected-error and `act(...)` warnings that weakened confidence in the test signal.
- What changed:
  - Tightened the `SelectionPersistenceContext` throw assertion to use a direct `toThrow(...)` pattern while suppressing expected console noise.
  - Added a small render helper in `useSessionTimeout` tests to flush mount-time async state updates under `act(...)`.
  - Updated the remaining event-listener test to use the same helper.
- Why this improves the system:
  - A passing suite is more useful when it is also quiet. This makes real regressions easier to spot and reduces the chance that contributors ignore test output.
- Evidence captured:
  - `pnpm --filter @ship/web test` passes cleanly: `16` files, `153` tests passed, no warning output.
- Follow-up needed:
  - Next step should move from test hygiene into measurable product refactoring, starting with a high-leverage backend hotspot.

### Entry
- Date: 2026-03-11
- Branch: implementation
- Commit:
- Summary: Removed the write from `GET /api/weeks/:id` and kept sprint snapshot hydration response-only for active sprints.
- Files changed:
  - `api/src/routes/weeks.ts`
  - `api/src/routes/weeks.test.ts`
- Categories improved:
  - Category 4: Database Query Efficiency
  - Category 1: Type Safety
  - Category 3: API Response Time
  - Category 5: Test Coverage and Quality
- Baseline issue:
  - `GET /api/weeks/:id` was taking a sprint snapshot and writing `planned_issue_ids` plus `snapshot_taken_at` back into `documents.properties` during a read request.
- What changed:
  - Added typed `SprintRow` and `SprintProperties` helpers around sprint extraction.
  - Added `hydrateSprintSnapshotForResponse(...)` so active sprints without persisted snapshots still return `planned_issue_ids` in the API response.
  - Stopped persisting snapshot data during `GET /api/weeks/:id`.
  - Added a regression test asserting that the GET response can include hydrated `planned_issue_ids` without mutating the database row.
- Why this improves the system:
  - Removes write amplification from a read path.
  - Makes the endpoint behavior safer for caching and repeated reads.
  - Reduces one of the audit’s clearest database-efficiency issues without changing user-visible output.
- Evidence captured:
  - `pnpm --filter @ship/api type-check` passes.
  - Regression test added in `weeks.test.ts` for non-persistent snapshot hydration.
- Follow-up needed:
  - Rerun `pnpm --filter @ship/api exec vitest run src/routes/weeks.test.ts` on the local machine with Postgres available to verify the new route test end-to-end.
