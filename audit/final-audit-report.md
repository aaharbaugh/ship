# Ship Audit Report

Measurement window: March 10-11, 2026

## Executive Summary
- Ship is usable and functionally broad, but it is not uniformly healthy across engineering quality categories.
- Strongest areas: API performance under current load, baseline database query counts in sampled flows, and the presence of a large existing automated test suite.
- Weakest areas: backend type-safety discipline, oversized frontend bundle composition, runtime edge-case recovery, and incomplete accessibility conformance.
- Immediate business risk is moderate rather than existential: the app works, but quality debt is accumulating in places that will slow delivery and create user-facing confusion as scale and complexity grow.

## Audit Notes
- The repository’s pre-commit hook soft-fails when `comply` is missing, so commits can still proceed.
- The repo currently instructs contributors to install `comply` with `pip install comply-cli`, but that package name did not resolve in the audited WSL environment and `pipx install comply-cli` failed the same way.
- Practical implication: open-source compliance scanning is expected by the repo, but the documented installation path appears stale or org-specific and could not be validated during this audit.

## Windows / WSL Issues Encountered
- Git hooks run in the WSL/Linux shell context, not Windows CMD or PowerShell. Installing CLI tools on Windows did not make them available to the repo hook environment.
- Python package installation in WSL was blocked by an externally managed Python environment, which prevented the normal `pip install --user ...` workflow.
- The documented `comply` installation command did not work in WSL. Both `pip install comply-cli` and `pipx install comply-cli` failed because no matching public package could be resolved.
- Docker-backed local workflows were sensitive to shell context and permissions. In practice, Docker commands were most reliable when run through the approved `sg docker -c ...` path.
- Some local test and benchmark workflows depended on starting clean API processes on alternate ports because existing local state, especially rate-limiter state on `localhost:3000`, contaminated reruns.
- Root test commands and local tooling behavior were not always representative of the full product surface. For example, `pnpm test` only exercised the API suite, while additional web and Playwright coverage required separate commands and environment setup.
- The combination of Windows host tooling, WSL package management, Docker permissions, and repo-specific CLI expectations added non-trivial setup friction that should be treated as an onboarding and operability issue.

## Category Summary
| Category | Current Read | Main Risk |
|---|---|---|
| 1. Type Safety | Partial | High escape-hatch density in backend boundary code raises regression risk |
| 2. Bundle Size | Partial | One oversized main bundle slows startup and weak-network experience |
| 3. API Response Time | Acceptable | Tail latency widens on aggregate/list endpoints under concurrency |
| 4. Database Query Efficiency | Partial | Read-path writes and service-level query loops create scale risk |
| 5. Test Coverage and Quality | Mixed | Raw test count overstates reliability because web failures and E2E flake remain |
| 6. Runtime Error and Edge Case Handling | Partial | Happy path is stable, but offline/collaboration/upload failures are noisy and confusing |
| 7. Accessibility Compliance | Partial | Automated checks are decent, but contrast and screen-reader issues remain |

## Category 1: Type Safety
Source: [cat-1-type-safety.md](/home/aaron/projects/gauntlet/ship/ship/audit/cat-1-type-safety.md)

| Metric | Your Baseline |
|---|---|
| Total any types | 273 |
| Total type assertions (`as`) | 691 |
| Total non-null assertions (`!`) | 329 |
| Total `@ts-ignore` / `@ts-expect-error` | 1 |
| Strict mode enabled? | Yes |
| Strict mode error count (if disabled) | N/A, strict mode is enabled and `pnpm type-check` reports 0 errors |
| Top 5 violation-dense files | `api/src/routes/weeks.ts` (85), `api/src/__tests__/transformIssueLinks.test.ts` (66), `api/src/services/accountability.test.ts` (64), `api/src/__tests__/auth.test.ts` (63), `api/src/routes/projects.ts` (51) |

## Category 2: Frontend Bundle Size
Source: [cat-2-frontend-bundle-size.md](/home/aaron/projects/gauntlet/ship/ship/audit/cat-2-frontend-bundle-size.md)

| Metric | Your Baseline |
|---|---|
| Total production bundle size | 2,262.65 KB |
| Largest chunk | `index-C2vAyoQ1.js` - 2,025.10 KB |
| Number of chunks | 261 |
| Top 3 largest dependencies | `emoji-picker-react` (399.59 KB), `highlight.js` (377.92 KB), `yjs` (264.92 KB) |
| Unused dependencies identified | `@tanstack/query-sync-storage-persister` |
| Improvement Target | Reduce initial-load bundle weight by shrinking the main entry chunk and moving heavy editor/collaboration code behind effective lazy-loading boundaries. |

## Category 3: API Response Time
Source: [cat-3-api-response-time.md](/home/aaron/projects/gauntlet/ship/ship/audit/cat-3-api-response-time.md)

Final table below uses the `50`-connection baseline.

| Endpoint | P50 | P95 | P99 |
|---|---:|---:|---:|
| `GET /api/dashboard/my-week` | 48 ms | 122 ms | 140 ms |
| `GET /api/issues` | 56 ms | 142.67 ms | 174 ms |
| `GET /api/projects` | 40 ms | 110 ms | 131 ms |
| `GET /api/documents/:id` | 34 ms | 87.67 ms | 103 ms |
| `GET /api/team/accountability-grid-v3` | 55 ms | 145.33 ms | 174 ms |

## Category 4: Database Query Efficiency
Source: [cat-4-database-query-efficiency.md](/home/aaron/projects/gauntlet/ship/ship/audit/cat-4-database-query-efficiency.md)

| User Flow | Total Queries | Slowest Query (ms) | N+1 Detected? |
|---|---:|---:|---|
| Load main page | 14 | 10.325 ms | No |
| View a document | 15 | 1.945 ms | No |
| List issues | 10 | 2.241 ms | No |
| Load sprint board | 16 | 2.696 ms | No |
| Search content | 10 | 1.847 ms | No |

Improvement target:
- Reduce query count or query cost in the two heaviest measured flows (`load-sprint-board` and `view-document`) without changing user-visible behavior.
- Remove write work from read-only sprint-board loading.
- Collapse the accountability-service query loops into batched queries where possible.
- Improve index coverage for repeated JSONB property filters used by dashboard, sprint, and search flows.

## Category 5: Test Coverage and Quality
Source: [cat-5-test-coverage-and-quality.md](/home/aaron/projects/gauntlet/ship/ship/audit/cat-5-test-coverage-and-quality.md)

| Metric | Your Baseline |
|---|---|
| Total tests | `1,471` |
| Pass / Fail / Flaky | `1,440 / 19 / 12` across API, web, and one full Playwright run |
| Suite runtime | Root `pnpm test`: `24.67s`; web Vitest: `2.12s`; Playwright E2E: `37.0m` test time, `2381.38s` wall time |
| Critical flows with zero coverage | `caia-auth` / PIV auth, Claude workflow routes, admin credential workflow, invite acceptance happy path |
| Code coverage % (if measured) | Not measurable in current repo state; `@vitest/coverage-v8` missing for both API and web |

Improvement target:
- `web: 70% / api: 80%` line coverage once coverage instrumentation is made runnable
- Restore web Vitest to green and reduce the current Playwright failure/flaky set before treating the suite as a reliable release gate

## Category 6: Runtime Error and Edge Case Handling
Source: [cat-6-runtime-error-and-edge-case-handling.md](/home/aaron/projects/gauntlet/ship/ship/audit/cat-6-runtime-error-and-edge-case-handling.md)

| Metric | Your Baseline |
|---|---|
| Console errors during normal usage | `0` |
| Unhandled promise rejections (server) | `0` observed |
| Network disconnect recovery | `Partial` |
| Missing error boundaries | `AdminWorkspaceDetail`, `WorkspaceSettings`, `Projects`, `TeamMode`, `ReviewsPage`, most document-tab panels |
| Silent failures identified | `5` with reproduction steps listed above |

Improvement target:
- Reduce console-only runtime failures in collaboration, upload, and offline flows by replacing them with explicit recovery states and observable centralized error capture.

## Category 7: Accessibility Compliance
Source: [cat-7-accessibility-compliance.md](/home/aaron/projects/gauntlet/ship/ship/audit/cat-7-accessibility-compliance.md)

| Metric | Your Baseline |
|---|---|
| Lighthouse accessibility score (per page) | `/login` `98`, `/docs` `100`, `/issues` `100`, `/programs` `100`, `/projects` `96`, `/team` `96`, `/reviews` `96`, `/settings` `95`, `/admin` `88` |
| Total Critical/Serious violations | `0` observed on tested pages |
| Keyboard navigation completeness | `Full` |
| Color contrast failures | Present; systemic `text-accent` failures plus additional dark-background token failures found by CSS sweep |
| Missing ARIA labels or roles | No focused automated findings; manual review still recommended for the hotspot pages listed above |

Improvement target:
- Add a repo-native Lighthouse workflow for major pages so the audit can publish comparable page scores.
- Fix the manual NVDA issues identified in `/documents`, global app chrome, and `/team`, then keep those controls in regression coverage.
- Expand keyboard-only regression coverage to `Projects`, `TeamMode`, `ReviewsPage`, `WorkspaceSettings`, and `AdminDashboard`.
- Add a repo-native contrast audit that includes admin/settings/review surfaces and replace or retokenize low-contrast accent text on the dark theme.
- Add explicit regression coverage for the Action Items modal post-standup selection flow and the Status Overview person-detail return path.
