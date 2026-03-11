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
