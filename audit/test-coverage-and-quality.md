# Category 5: Test Coverage and Quality

Measurement date: March 10, 2026

## CEO Overview
- The codebase has a large automated test suite, but the test story is less healthy than the raw test count suggests.
- The main business risk is false confidence: API tests are strong, but web tests are failing and the end-to-end suite still has real flaky cases.
- Bottom line: test investment exists, but reliability and coverage reporting need cleanup before leadership should treat the suite as a fully dependable release signal.

## Executive Summary
- The codebase contains `1,471` automated tests across API Vitest, web Vitest, and Playwright E2E.
- The default root command is misleading for leadership and contributors: `pnpm test` only runs the API suite, not web tests and not the `869` Playwright tests.
- API test reliability is currently strong when the suite has working database access: `451/451` tests passed in three consecutive runs with no observed flake, and a fresh elevated rerun also passed `451/451` in `21.11s`.
- Web unit tests are failing deterministically (`13` failed assertions across `3` files on all repeated runs), and the now-runnable Playwright suite finishes with `851` passed, `6` failed, and `12` flaky tests.

## Measurement Method
Tools and commands used:

```bash
pnpm test
pnpm test:e2e --list
env PLAYWRIGHT_WORKERS=1 pnpm test:e2e
pnpm --filter @ship/api exec vitest list
pnpm --filter @ship/web exec vitest list
pnpm --filter @ship/web test
pnpm --filter @ship/api test:coverage
pnpm --filter @ship/web exec vitest run --coverage
```

Methodology:
- Ran the repo-default baseline command first. This revealed that root `pnpm test` only executes `@ship/api` Vitest.
- Enumerated the Playwright suite with `--list` to get an exact E2E test count and file inventory before running it.
- Re-ran the executable suites to check for flake:
  - API suite: `3` full runs
  - Web suite: `3` full runs
  - Playwright E2E: one full run with `PLAYWRIGHT_WORKERS=1`; flake counts come from Playwright's own run classification, not from three repeated full-suite reruns
- Attempted coverage collection for both API and web. Both coverage runs failed immediately because `@vitest/coverage-v8` is not installed.

Notes:
- Root `pnpm test` is not the full product suite.
- In the default sandbox shell, `pnpm test` can fail before executing the API assertions because Vitest setup cannot reach `127.0.0.1:5433`. That is an environment/access issue in this session, not a red API baseline.
- Playwright uses Testcontainers-based isolated environments. In this session, the suite was made runnable by executing it through `sg docker -c ...` because the agent process did not initially inherit direct `docker.sock` group access.
- Coverage percentages could not be measured in this session because the configured coverage provider dependency is missing.

## Baseline

### Suite Inventory
| Suite | Files | Tests | Baseline status |
|---|---:|---:|---|
| API Vitest | 28 | 451 | Pass |
| Web Vitest | 16 | 151 | Fail |
| Playwright E2E | 71 | 869 | Mixed |
| Total | 115 | 1,471 | Mixed |

### Execution Results
| Suite | Pass | Fail | Flaky | Runtime |
|---|---:|---:|---:|---:|
| Root `pnpm test` (`@ship/api` only) | 451 | 0 | 0 | `24.67s` |
| Web Vitest | 138 | 13 | 0 observed | `2.12s` |
| Playwright E2E | 851 | 6 | 12 | `37.0m` test time, `2381.38s` wall time |

### Repeated-Run Reliability
| Suite | Run 1 | Run 2 | Run 3 | Reliability read |
|---|---|---|---|---|
| API Vitest | `451/451` pass | `451/451` pass | `451/451` pass | Stable |
| Web Vitest | `138 pass / 13 fail` | `138 pass / 13 fail` | `138 pass / 13 fail` | Deterministic failures, not flaky |
| Playwright E2E | `851 pass / 6 fail / 12 flaky` | not repeated end-to-end | not repeated end-to-end | Executable, but reliability issues remain |

## Flow Coverage Map
| Critical flow | Current coverage | Evidence |
|---|---|---|
| Document CRUD | Strong | API: `documents.test.ts`, `issues.test.ts`; E2E: `documents.spec.ts`, `document-workflows.spec.ts`, `issues.spec.ts` |
| Auth and session lifecycle | Strong | API: `auth.test.ts`, `__tests__/auth.test.ts`; E2E: `auth.spec.ts`, `authorization.spec.ts`, `session-timeout.spec.ts` |
| Sprint management | Strong | API: `weeks.test.ts`, `sprint-reviews.test.ts`, `accountability.test.ts`; E2E: `weeks.spec.ts`, `weekly-accountability.spec.ts`, `accountability-week.spec.ts` |
| Real-time sync / collaboration | Moderate | API: `collaboration.test.ts`, `api-content-preservation.test.ts`; E2E executes and covers backlinks, comments, images, and stale-data flows, but multiple flaky failures still reduce confidence |
| Search / mentions / backlinks | Strong | API: `search.test.ts`, backlinks logic tests; E2E: `search-api.spec.ts`, `mentions.spec.ts`, `backlinks.spec.ts` |
| Workspace/admin management | Strong | API: `workspaces.test.ts`; E2E: `workspaces.spec.ts`, `admin-workspace-members.spec.ts`, `authorization.spec.ts` |

## Critical Flows With Zero or Near-Zero Coverage
- PIV / CAIA authentication flow appears to have zero direct automated coverage.
  Evidence: untested route files include `caia-auth.ts`, and no matching dedicated API or E2E suite was found.

- Claude workflow routes appear to have zero direct automated coverage.
  Evidence: `claude.ts` has no paired route test, and the E2E inventory only covers `ai-analysis-api`, not a broader Claude workflow.

- Admin credential bootstrap and rotation flow appears to have zero direct automated coverage.
  Evidence: `admin-credentials.ts` has no paired route test and no dedicated E2E file.

- Invite acceptance success flow appears under-covered relative to other auth/admin paths.
  Evidence: the E2E inventory includes negative invite checks in `workspaces.spec.ts`, but no dedicated happy-path invite acceptance flow was evident.

## Findings

### High
- The repo-default test command hides most of the actual test surface.
  Why it matters: leadership or CI users can read a green `pnpm test` result as “the product test suite passed” when only the API package ran.
  Evidence: root [package.json](/home/aaron/projects/gauntlet/ship/ship/package.json) maps `test` to `pnpm --filter @ship/api test`.

- Web unit tests are currently red and fail deterministically.
  Why it matters: frontend regression signal is degraded even before E2E runs, and the failures point to test expectations drifting behind current product behavior.
  Evidence: three repeated runs produced the same `13` failures across [document-tabs.test.ts](/home/aaron/projects/gauntlet/ship/ship/web/src/lib/document-tabs.test.ts) and [DetailsExtension.test.ts](/home/aaron/projects/gauntlet/ship/ship/web/src/components/editor/DetailsExtension.test.ts).

- The end-to-end suite now runs, but it is not a reliable release gate yet.
  Why it matters: the highest-value product-level safety net still contains both real failing flows and flaky flows in core editor/navigation behavior.
  Evidence: the single-worker Playwright run finished with `6` failures and `12` flaky tests. Failures included backlinks removal, inline code shortcut, inline comments shortcut, TOC rename updates, table deletion, and simultaneous formatting edge cases.

### Medium
- Coverage reporting is configured in intent but not actually runnable.
  Why it matters: leadership cannot answer basic questions like “what percent of API or web code is covered?” without fixing the test tooling itself.
  Evidence: both API and web coverage commands fail immediately with `Cannot find dependency '@vitest/coverage-v8'`.

- Playwright flake evidence is real but not as strong as the API/web repeated-run evidence.
  Why it matters: the category prompt asks for three runs when assessing flake, and the current report only has one full executable E2E run plus Playwright's flaky-test classification.
  Evidence: API and web were repeated three times; Playwright was run once end-to-end because of runtime cost and harness complexity.

- The web unit suite is narrow relative to the size of the frontend.
  Why it matters: only `16` web test files exist, and they are concentrated in hooks, helpers, editor extensions, and one page-level test rather than broad app flow coverage.
  Evidence: web test inventory totals `151` tests across `16` files, with heavy concentration in `hooks/`, `lib/`, and editor extension tests.

- Route-level API coverage is uneven despite strong totals.
  Why it matters: some high-value route modules still have no direct tests, which creates blind spots behind an otherwise healthy API test count.
  Evidence: unpaired route modules include `activity.ts`, `admin.ts`, `admin-credentials.ts`, `ai.ts`, `caia-auth.ts`, `claude.ts`, `dashboard.ts`, `team.ts`, and `weekly-plans.ts`.

- AI-analysis E2E coverage depends on missing AWS credentials and therefore produces noisy infrastructure errors during otherwise successful test execution.
  Why it matters: the suite currently mixes product assertions with missing external-service credentials, which makes failures and logs harder to interpret.
  Evidence: `ai-analysis-api.spec.ts` emitted repeated `CredentialsProviderError: Could not load credentials from any providers` messages during the successful E2E run.

### Low
- No flaky tests were observed in the executable API and web suites.
  Why it matters: current failures are deterministic and therefore easier to triage than intermittent failures.
  Evidence: API passed `3/3` repeated runs; web failed the same assertions in repeated runs.

- The API suite itself is healthy and reasonably fast.
  Why it matters: backend contributors currently have a dependable regression net for route and service changes.
  Evidence: `451` API tests passed three times in roughly `23-26` seconds wall-clock, and a fresh rerun passed `451/451` in `21.11s` once database access was available.

## Suggested Direction
The first priority is to make the reported test surface honest and dependable: expose web and E2E status separately from root `pnpm test`, restore the web Vitest suite to green, and triage the current Playwright failure/flaky set into deterministic product bugs versus test timing issues. After that, fill the zero-coverage gaps in CAIA/PIV auth, Claude flows, and admin credential workflows, then turn code coverage reporting back on with a working provider package.

## Audit Deliverable
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
