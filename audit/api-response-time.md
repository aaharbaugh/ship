# Category 3: API Response Time

Measurement date: March 10, 2026

## Executive Summary
- The API response-time audit was run against a seeded local dataset that meets the required floor: `530` documents, `104` issues, `21` users, and `35` sprints.
- The five benchmarked endpoints were selected from actual frontend request patterns in common user flows: My Week, Issues, Projects, Document Detail, and Accountability Grid.
- Under the final benchmark profile of `80 req/sec` with `10`, `25`, and `50` simultaneous connections, the slowest endpoints at `50` connections were `GET /api/issues` and `GET /api/team/accountability-grid-v3`, both with P95 above `150 ms`.
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

pnpm dev

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
- Verified the starting dev dataset, then bulk-added audit-only users and documents to meet the category’s minimum data-volume requirement.
- Identified important endpoints by tracing frontend API usage in hooks, pages, and components instead of guessing from backend routes alone.
- Started a clean local API instance and authenticated as the seeded `dev@ship.local` user so benchmarks hit the real protected endpoints used by the frontend.
- Used `autocannon` as the load-testing tool.
- Benchmarked each selected endpoint at `10`, `25`, and `50` simultaneous connections.
- Capped load at `80 req/sec` for the final run to avoid dev/test rate-limit state overwhelming the benchmark and masking handler latency.

Notes:
- Raw artifact: `audit/artifacts/api-response-times.json`
- `autocannon` emits `p90`, `p97.5`, and `p99`, but not an exact `p95`. For this audit, `p95` is interpolated between `p90` and `p97.5` and that is called out explicitly in the artifact.
- A first benchmark attempt was discarded because the API limiter dominated results with `429` responses. The final artifact uses a clean benchmark instance and zero non-2xx responses across the reported runs.

## Seeded Baseline
| Metric | Baseline |
|---|---:|
| Documents | 530 |
| Issues | 104 |
| Users | 21 |
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
| `GET /api/dashboard/my-week` | 9 ms | 29 ms | 39 ms |
| `GET /api/issues` | 10 ms | 65.67 ms | 99 ms |
| `GET /api/projects` | 11 ms | 111 ms | 141 ms |
| `GET /api/documents/:id` | 11 ms | 71.33 ms | 91 ms |
| `GET /api/team/accountability-grid-v3` | 10 ms | 81 ms | 110 ms |

### 25 Connections
| Endpoint | P50 | P95 | P99 |
|---|---:|---:|---:|
| `GET /api/dashboard/my-week` | 23 ms | 61.67 ms | 75 ms |
| `GET /api/issues` | 26 ms | 66 ms | 81 ms |
| `GET /api/projects` | 20 ms | 49 ms | 60 ms |
| `GET /api/documents/:id` | 20 ms | 52.67 ms | 63 ms |
| `GET /api/team/accountability-grid-v3` | 27 ms | 75.33 ms | 92 ms |

### 50 Connections
| Endpoint | P50 | P95 | P99 |
|---|---:|---:|---:|
| `GET /api/dashboard/my-week` | 49 ms | 126.33 ms | 146 ms |
| `GET /api/issues` | 61 ms | 155 ms | 190 ms |
| `GET /api/projects` | 42 ms | 108 ms | 128 ms |
| `GET /api/documents/:id` | 37 ms | 100.67 ms | 119 ms |
| `GET /api/team/accountability-grid-v3` | 58 ms | 152 ms | 182 ms |

## Findings

### High
- `GET /api/issues` is the slowest endpoint under the highest tested concurrency.
  Why it matters: it is a core workflow endpoint and reaches the highest tail latency in the final matrix.
  Evidence: at `50` connections, `GET /api/issues` recorded `P50 61 ms`, `P95 155 ms`, and `P99 190 ms`.

- `GET /api/team/accountability-grid-v3` also degrades materially under concurrency.
  Why it matters: this endpoint likely powers broad management/status views and appears to aggregate more cross-entity state than simple list endpoints.
  Evidence: at `50` connections, it recorded `P50 58 ms`, `P95 152 ms`, and `P99 182 ms`.

### Medium
- `GET /api/dashboard/my-week` shows noticeable tail growth from `10` to `50` connections.
  Why it matters: this is the default landing experience, so even moderate tail growth affects perceived app responsiveness.
  Evidence: P95 rose from `29 ms` at `10` connections to `126.33 ms` at `50` connections.

- List and rollup endpoints widen faster than point reads.
  Why it matters: this suggests query complexity and aggregation cost matter more than simple document fetch overhead.
  Evidence: `GET /api/documents/:id` remained the fastest at `50` connections (`P95 100.67 ms`) while `GET /api/issues` and `GET /api/team/accountability-grid-v3` were materially slower.

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
| `GET /api/dashboard/my-week` | 49 ms | 126.33 ms | 146 ms |
| `GET /api/issues` | 61 ms | 155 ms | 190 ms |
| `GET /api/projects` | 42 ms | 108 ms | 128 ms |
| `GET /api/documents/:id` | 37 ms | 100.67 ms | 119 ms |
| `GET /api/team/accountability-grid-v3` | 58 ms | 152 ms | 182 ms |
