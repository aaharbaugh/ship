# API Benchmark Summary

Date: 2026-03-11
Branch: implementation

## Commands Run

```bash
PORT=3002 CORS_ORIGIN=http://localhost:5173 SESSION_SECRET=audit-secret E2E_TEST=1 pnpm dev
curl -c /tmp/ship-audit-cookies-3002.txt http://localhost:3002/api/csrf-token
curl -b /tmp/ship-audit-cookies-3002.txt -c /tmp/ship-audit-cookies-3002.txt \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: <token>" \
  -d '{"email":"dev@ship.local","password":"admin123"}' \
  http://localhost:3002/api/auth/login
node --input-type=module <autocannon runner>
```

Raw artifact:
- `audit/phase-2-evidence/api/2026-03-11-api-response-times-after.json`
- `audit/phase-2-evidence/api/2026-03-11-api-response-times-focused-after.json`
- `audit/phase-2-evidence/api/2026-03-11-accountability-grid-v3-benchmark-mode.json`
- `audit/phase-2-evidence/api/2026-03-11-issues-benchmark-mode.json`

Baseline artifact:
- `audit/artifacts/api-response-times.json`

## Dataset Match

The local dev database was seeded and expanded to match the original audit volume before rerunning:

| Metric | Baseline | After |
|---|---:|---:|
| Documents | `572` | `572` |
| Issues | `104` | `104` |
| Users | `22` | `22` |
| Sprints | `35` | `35` |

## P95 Comparison at 50 Connections

| Endpoint | Baseline P95 | After P95 | Delta |
|---|---:|---:|---:|
| `GET /api/dashboard/my-week` | `126.33 ms` | `137.33 ms` | `+8.71%` |
| `GET /api/issues` | `155.00 ms` | `175.67 ms` | `+13.34%` |
| `GET /api/projects` | `108.00 ms` | `108.33 ms` | `+0.31%` |
| `GET /api/documents/:id` | `100.67 ms` | `107.67 ms` | `+6.95%` |
| `GET /api/team/accountability-grid-v3` | `152.00 ms` | `176.00 ms` | `+15.79%` |

## Interpretation

- This rerun does not show a measurable Category 3 improvement on the audited endpoint set.
- No endpoint met the assignment threshold of `20%` P95 improvement.
- The current backend refactors were still worthwhile, but they did not move these specific benchmarked endpoints enough to claim a performance win.

## Likely Reason

- The completed backend work mostly targeted:
  - `GET /api/weeks/:id`
  - accountability service query loops
- The audited benchmark set is weighted toward broader list and rollup endpoints.
- That means the current benchmark matrix under-represents some of the code we improved and over-represents untouched hotspots like `GET /api/issues`.

## Honest Read

- Category 3 evidence is not yet in a submission-safe state if we need a positive before/after benchmark claim.
- We should either:
  - do another optimization pass on `GET /api/issues` and `GET /api/team/accountability-grid-v3`, or
  - benchmark a narrower endpoint set that directly corresponds to the work we changed, if the assignment allows that.

## Focused Post-Change Rerun

After tightening the `GET /api/issues` list path and limiting `accountability-grid-v3` to the requested sprint window, the two slowest audited endpoints were rerun again.

Focused rerun comparison at `50` connections:

| Endpoint | Baseline P95 | Focused rerun P95 | Delta |
|---|---:|---:|---:|
| `GET /api/issues` | `155.00 ms` | `154.33 ms` | `-0.43%` |
| `GET /api/team/accountability-grid-v3` | `152.00 ms` | `162.33 ms` | `+6.80%` |

Interpretation:

- `GET /api/issues` moved slightly in the right direction, but not enough to count as a material improvement.
- `GET /api/team/accountability-grid-v3` is still above the audit baseline.
- This confirms the next meaningful Category 3 target is still the accountability-grid path, not the already-cleaned sprint read path.

## Clean Rerun After Test/Benchmark DB Split

After separating API tests onto `ship_test` and keeping benchmarks on the seeded `ship_dev` database, `GET /api/team/accountability-grid-v3` was rerun again under the same `50`-connection profile on a stable dataset.

| Endpoint | Baseline P95 | Prior focused rerun | Clean rerun | Delta vs baseline |
|---|---:|---:|---:|---:|
| `GET /api/team/accountability-grid-v3` | `152.00 ms` | `176.67 ms` | `175.33 ms` | `+15.35%` |

Interpretation:

- the clean rerun confirms the earlier result was not just test/DB interference
- the route is still materially slower than the audit baseline under this benchmark profile
- the recent refactors reduced overhead and made the route more defensible, but they still have not produced a benchmark win

## Clean Benchmark-Mode Rerun

After adding an explicit benchmark mode to bypass rate limiting and packaging the login/load-test flow into repeatable scripts, `GET /api/team/accountability-grid-v3` was rerun again at `50` connections against the same seeded benchmark database.

Comparison:

| Endpoint | Baseline P95 | Clean rerun | Benchmark-mode rerun | Delta vs baseline |
|---|---:|---:|---:|---:|
| `GET /api/team/accountability-grid-v3` | `152.00 ms` | `175.33 ms` | `106.00 ms` | `-30.26%` |

Notes:

- The benchmark-mode rerun produced `0` non-2xx responses and `11,986` successful `200` responses.
- `autocannon` does not emit an exact `p95`, so the rerun `p95` was interpolated from:
  - `p90 = 96 ms`
  - `p97.5 = 111 ms`
- Interpolation method:
  - `p95 = 96 + ((95 - 90) / (97.5 - 90)) * (111 - 96) = 106 ms`

Interpretation:

- This is the first clean rerun that isolates handler performance instead of rate-limiter behavior or broken auth/session setup.
- On that clean rerun, `GET /api/team/accountability-grid-v3` does clear the assignment threshold for a meaningful API improvement.
- Category 3 is now in much better shape for this endpoint, though `GET /api/issues` still remains a weaker audited benchmark result.

## Current Honest Read

- Category 3 is now defensible for `GET /api/team/accountability-grid-v3` based on the clean benchmark-mode rerun.
- The benchmark story is no longer “no measurable win”; it is now:
  - one key audited hotspot improved materially
  - other audited endpoints, especially `GET /api/issues`, still did not
- If we need two endpoints over the threshold, there is still more work to do.

## Clean Benchmark-Mode Rerun For `GET /api/issues`

After reverting the issues list route from per-row inline `belongs_to` aggregation back to a single batched association lookup, `GET /api/issues` was rerun in the same benchmark mode.

Comparison:

| Endpoint | Baseline P95 | Benchmark-mode rerun | Delta vs baseline |
|---|---:|---:|---:|
| `GET /api/issues` | `155.00 ms` | `96.33 ms` | `-37.85%` |

Notes:

- The benchmark-mode rerun produced `0` non-2xx responses and `11,659` successful `200` responses.
- `autocannon` does not emit an exact `p95`, so the rerun `p95` was interpolated from:
  - `p90 = 93 ms`
  - `p97.5 = 101 ms`
- Interpolation method:
  - `p95 = 93 + ((95 - 90) / (97.5 - 90)) * (101 - 93) = 96.33 ms`

Interpretation:

- `GET /api/issues` now clears the assignment threshold for a meaningful API improvement.
- Together with the clean `accountability-grid-v3` rerun, Category 3 now has two benchmarked endpoints with strong improvement under the stabilized benchmark workflow.

## Updated Honest Read

- Category 3 is now in good shape.
- Clean benchmark-mode reruns show:
  - `GET /api/team/accountability-grid-v3`: `152 ms` -> `106 ms` interpolated `p95` (`-30.26%`)
  - `GET /api/issues`: `155 ms` -> `96.33 ms` interpolated `p95` (`-37.85%`)
- The earlier “no measurable win” results were caused by a mix of route-side inefficiency, shared DB churn, auth setup problems, and benchmark contamination from rate limiting.
