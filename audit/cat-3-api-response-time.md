# Category 3: API Response Time

Measurement date: March 11, 2026

## Overview
- Core API performance is acceptable today and does not show catastrophic latency under the tested load.
- The main business risk is not average speed, but slower tail latency on list and rollup endpoints that support high-visibility workflows.
- Bottom line: the API is stable enough for current use, but the heaviest endpoints should be optimized before scale increases.

## Executive Summary
- The API response-time audit was rerun against a seeded local dataset that exceeds the required floor: `572` documents, `104` issues, `22` users, and `35` sprints.
- The five benchmarked endpoints were selected from actual frontend request patterns in common user flows: My Week, Issues, Projects, Document Detail, and Accountability Grid.
- Under the final benchmark profile of `80 req/sec` with `10`, `25`, and `50` simultaneous connections, the slowest endpoints at `50` connections were still `GET /api/issues` and `GET /api/team/accountability-grid-v3`, now both in the mid-`140 ms` P95 range.
- The dominant risk pattern is not catastrophic latency, but widening tail latency under concurrency in aggregate/list endpoints that likely fan out across document properties, joins, and per-user rollups.

## Measurement Method
Tools and commands used:

```bash
node --input-type=module - <<'NODE'
// Query local Postgres for baseline seeded counts
NODE

node --input-type=module - <<'NODE'
// Add audit-only records to reach 500+ documents and 20+ users
NODE

PORT=3002 CORS_ORIGIN=http://localhost:5173 SESSION_SECRET=audit-secret E2E_TEST=1 pnpm dev

curl -c /tmp/ship-audit-cookies-3002.txt http://localhost:3002/api/csrf-token
curl -b /tmp/ship-audit-cookies-3002.txt -c /tmp/ship-audit-cookies-3002.txt \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: <token>" \
  -d '{"email":"dev@ship.local","password":"admin123"}' \
  http://localhost:3002/api/auth/login

node --input-type=module - <<'NODE'
// Use autocannon 8.0.0 from /tmp/ship-audit-tools against:
// - /api/dashboard/my-week
// - /api/issues
// - /api/projects
// - /api/documents/:id
// - /api/team/accountability-grid-v3?fromSprint=1&toSprint=10
// Run with connections 10, 25, 50 and overallRate=80 req/sec
// Save results to audit/artifacts/api-response-times.json
NODE
```

Methodology:
- Reseeded the local Docker development database, then bulk-added audit-only users and documents to exceed the category’s minimum data-volume requirement.
- Identified important endpoints by tracing frontend API usage in hooks, pages, and components instead of guessing from backend routes alone.
- Started a clean local API instance and authenticated as the seeded `dev@ship.local` user so benchmarks hit the real protected endpoints used by the frontend.
- Used `autocannon` as the load-testing tool.
- Benchmarked each selected endpoint at `10`, `25`, and `50` simultaneous connections.
- Capped load at `80 req/sec` for the final run to avoid dev/test rate-limit state overwhelming the benchmark and masking handler latency.

Notes:
- Raw artifact from the original run: `audit/artifacts/api-response-times.json`
- `autocannon` emits `p90`, `p97.5`, and `p99`, but not an exact `p95`. For this audit, `p95` is interpolated between `p90` and `p97.5` and that is called out explicitly in the artifact.
- A rerun against `localhost:3000` was discarded because the API limiter was already dirty and returned `429` responses. The valid March 11, 2026 rerun used a clean benchmark instance on `localhost:3002` and produced zero non-2xx responses across the reported runs.

## Seeded Baseline
| Metric | Baseline |
|---|---:|
| Documents | 572 |
| Issues | 104 |
| Users | 22 |
| Sprints | 35 |

## Selected Endpoints
These were chosen from common frontend flows:

| Flow | Endpoint | Why it matters |
|---|---|---|
| My Week landing page | `GET /api/dashboard/my-week` | Default landing experience and recurring user workflow |
| Issues view | `GET /api/issues` | Core work-tracking list with filters and issue-heavy usage |
| Projects view | `GET /api/projects` | Key planning and navigation surface |
| Document detail/editor | `GET /api/documents/:id` | Central read path for document-centric navigation |
| Accountability/Status view | `GET /api/team/accountability-grid-v3` | Broad rollup endpoint serving management/status workflows |

## Benchmark Results

### 10 Connections
| Endpoint | P50 | P95 | P99 |
|---|---:|---:|---:|
| `GET /api/dashboard/my-week` | 8 ms | 31 ms | 45 ms |
| `GET /api/issues` | 11 ms | 68.33 ms | 96 ms |
| `GET /api/projects` | 11 ms | 98.67 ms | 127 ms |
| `GET /api/documents/:id` | 10 ms | 74.33 ms | 96 ms |
| `GET /api/team/accountability-grid-v3` | 9 ms | 60 ms | 85 ms |

### 25 Connections
| Endpoint | P50 | P95 | P99 |
|---|---:|---:|---:|
| `GET /api/dashboard/my-week` | 21 ms | 63.67 ms | 80 ms |
| `GET /api/issues` | 25 ms | 63.67 ms | 78 ms |
| `GET /api/projects` | 18 ms | 48.33 ms | 59 ms |
| `GET /api/documents/:id` | 18 ms | 48.67 ms | 60 ms |
| `GET /api/team/accountability-grid-v3` | 24 ms | 65 ms | 78 ms |

### 50 Connections
| Endpoint | P50 | P95 | P99 |
|---|---:|---:|---:|
| `GET /api/dashboard/my-week` | 48 ms | 122 ms | 140 ms |
| `GET /api/issues` | 56 ms | 142.67 ms | 174 ms |
| `GET /api/projects` | 40 ms | 110 ms | 131 ms |
| `GET /api/documents/:id` | 34 ms | 87.67 ms | 103 ms |
| `GET /api/team/accountability-grid-v3` | 55 ms | 145.33 ms | 174 ms |

## Findings

### High
- `GET /api/issues` is the slowest endpoint under the highest tested concurrency.
  Why it matters: it is a core workflow endpoint and reaches the highest tail latency in the final matrix.
  Evidence: at `50` connections, `GET /api/issues` recorded `P50 56 ms`, `P95 142.67 ms`, and `P99 174 ms`.

- `GET /api/team/accountability-grid-v3` also degrades materially under concurrency.
  Why it matters: this endpoint likely powers broad management/status views and appears to aggregate more cross-entity state than simple list endpoints.
  Evidence: at `50` connections, it recorded `P50 55 ms`, `P95 145.33 ms`, and `P99 174 ms`.

### Medium
- `GET /api/dashboard/my-week` shows noticeable tail growth from `10` to `50` connections.
  Why it matters: this is the default landing experience, so even moderate tail growth affects perceived app responsiveness.
  Evidence: P95 rose from `31 ms` at `10` connections to `122 ms` at `50` connections.

- List and rollup endpoints widen faster than point reads.
  Why it matters: this suggests query complexity and aggregation cost matter more than simple document fetch overhead.
  Evidence: `GET /api/documents/:id` remained the fastest at `50` connections (`P95 87.67 ms`) while `GET /api/issues` and `GET /api/team/accountability-grid-v3` were materially slower.

### Low
- None of the final reported runs returned non-2xx responses.
  Why it matters: the final benchmark set reflects handler latency rather than failure-driven noise.
  Evidence: every run in `audit/artifacts/api-response-times.json` reports `non2xx: 0`, `errors: 0`, and `timeouts: 0`.

## Slow-Endpoint Hypotheses
- `GET /api/issues`
  Likely cost drivers: dynamic filtering, property-based querying on the unified `documents` table, joins for related entities, and response shaping across issue metadata.

- `GET /api/team/accountability-grid-v3`
  Likely cost drivers: multi-user and multi-sprint rollups, cross-document joins, and aggregation across assignments/accountability data.

- `GET /api/dashboard/my-week`
  Likely cost drivers: user-specific dashboard composition pulling several related counts or document states into a single payload.

## Suggested Direction
Focus future performance work on aggregate and list endpoints before point reads. The best candidates are `GET /api/issues`, `GET /api/team/accountability-grid-v3`, and `GET /api/dashboard/my-week`, because those endpoints widen most under concurrency and are tied directly to important user-facing screens.

## Audit Deliverable
Final table below uses the `50`-connection baseline, since that is the highest required concurrency level and the clearest stress signal.

| Endpoint | P50 | P95 | P99 |
|---|---:|---:|---:|
| `GET /api/dashboard/my-week` | 48 ms | 122 ms | 140 ms |
| `GET /api/issues` | 56 ms | 142.67 ms | 174 ms |
| `GET /api/projects` | 40 ms | 110 ms | 131 ms |
| `GET /api/documents/:id` | 34 ms | 87.67 ms | 103 ms |
| `GET /api/team/accountability-grid-v3` | 55 ms | 145.33 ms | 174 ms |
