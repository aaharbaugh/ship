# Category 4: Database Query Efficiency

Measurement date: March 10, 2026

## Executive Summary
- The database audit used an audit-only runtime query profiler because native PostgreSQL statement logging and `pg_stat_statements` were not available in the local dev environment.
- After normalizing duplicate profiler captures, the five measured user flows issued between `10` and `16` database queries each. The heaviest flows were `view-document` and `load-sprint-board`, both at `16` queries.
- No clear classic within-request N+1 pattern was found in the audited flows. The issue list already batch-loads associations, which is the correct direction.
- The main database risks are not runaway query counts, but query shapes that rely on JSONB property extraction without dedicated expression indexes, plus a `GET /api/weeks/:id` path that performs a write during a read flow.

## Measurement Method
Tools and commands used:

```bash
node --input-type=module - <<'NODE'
// Check local PostgreSQL settings for log_statement and pg_stat_statements availability
NODE

PORT=3003 CORS_ORIGIN=http://localhost:5173 SESSION_SECRET=audit-secret E2E_TEST=1 \
NODE_OPTIONS="--import=/home/aaron/projects/gauntlet/ship/ship/audit/artifacts/query-profiler.mjs" \
pnpm dev

curl -c /tmp/ship-audit-cookies-3003.txt http://localhost:3003/api/csrf-token
curl -b /tmp/ship-audit-cookies-3003.txt -c /tmp/ship-audit-cookies-3003.txt \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: <token>" \
  -d '{"email":"dev@ship.local","password":"admin123"}' \
  http://localhost:3003/api/auth/login

node audit/artifacts/aggregate-query-profile.mjs

node --input-type=module - <<'NODE'
// Run EXPLAIN ANALYZE against representative query shapes on localhost:5433
NODE
```

Methodology:
- Verified that native PostgreSQL statement logging was not enabled and `pg_stat_statements` was not available, so the audit used an instrumentation-only query profiler loaded via `NODE_OPTIONS`.
- Traced five user flows from real frontend request paths: load main page, view a document, list issues, load a sprint board, and search content.
- Tagged each flow with `X-Audit-Flow` headers so request-level query counts could be grouped and aggregated.
- Normalized final query counts by dividing raw profiler totals by `2`, because the first profiler version captured both pool-level and client-level query execution.
- Ran `EXPLAIN ANALYZE` on representative slow or structurally important query shapes from the measured flows.

Notes:
- Query profile artifact: `audit/artifacts/query-profile.jsonl`
- Aggregated summary artifact: `audit/artifacts/query-profile-summary.json`
- `EXPLAIN ANALYZE` artifact: `audit/artifacts/database-query-explain-summary.md`
- Native PostgreSQL logging baseline during the audit:
  - `log_statement = 'none'`
  - `log_min_duration_statement = -1`
  - `shared_preload_libraries = ''`
  - `pg_stat_statements` unavailable

## Baseline
Normalized totals below divide raw profiler counts by `2` to remove duplicate instrumentation captures.

| User Flow | Total Queries | Slowest Query (ms) | N+1 Detected? |
|---|---:|---:|---|
| Load main page | 14 | 12.318 ms | No |
| View a document | 16 | 3.345 ms | No |
| List issues | 10 | 2.369 ms | No |
| Load sprint board | 16 | 2.192 ms | No |
| Search content | 10 | 2.155 ms | No |

## Query Shape Evidence
Representative query-plan findings from `EXPLAIN ANALYZE`:

| Query Shape | Execution Time | Key Plan Detail | Diagnostic Meaning |
|---|---:|---|---|
| Weekly plan lookup for My Week | `0.043 ms` | `Bitmap Heap Scan` on `documents` using only `idx_documents_document_type` | Fast at current volume, but it filters `workspace_id`, `person_id`, and `week_number` after the type index instead of using a dedicated expression index |
| Issue association batch lookup | `0.277 ms` | `Seq Scan` on `document_associations` for `document_id = ANY(...)` | The issue list avoids N+1, but the batch query still falls back to a sequential scan for large ID sets |
| Search mentions documents | `0.250 ms` | `Seq Scan` on `documents` for `title ILIKE '%Audit%'` | Current dataset is small enough that search is still quick, but this shape will degrade with growth without trigram/text-search support |
| My Week project lookup | `0.103 ms` | `Bitmap Heap Scan` on `documents` using only `idx_documents_document_type` | JSONB filters on `assignee_ids` and `sprint_number` are evaluated after the broad type index |

## Index Coverage Observations
Current schema indexes provide a good base for broad document lookups:
- `idx_documents_document_type`
- `idx_documents_active (workspace_id, document_type) WHERE archived_at IS NULL AND deleted_at IS NULL`
- `idx_documents_properties` as a GIN index on `properties`
- `idx_document_associations_document_id`
- `idx_document_associations_related_id`
- `idx_document_associations_document_type`
- `idx_document_associations_related_type`

The audited query shapes still show coverage gaps:
- No dedicated expression index was evident for `weekly_plan` and `weekly_retro` lookups on `(properties->>'person_id')` plus `(properties->>'week_number')::int`.
- No dedicated expression index was evident for sprint lookups that filter `properties->'assignee_ids' ? <userId>` and `(properties->>'sprint_number')::int`.
- Search uses `title ILIKE '%...%'` and currently falls back to sequential scanning on `documents`.
- The issue association batch query used a sequential scan on `document_associations` for `document_id = ANY(...)`, which suggests current indexes help point lookups more than large batched membership reads.

## Findings

### High
- `GET /api/weeks/:id` performs a write during a read flow.
  Why it matters: this increases load on a request that should be read-only, creates write amplification during page loads, and makes caching or repeatability harder.
  Evidence: the query profiler captured `UPDATE documents SET properties = $1, updated_at = now() WHERE id = $2` as the slowest query in the sprint-board flow, and the route updates `planned_issue_ids` inside the `GET /api/weeks/:id` handler in [weeks.ts](/home/aaron/projects/gauntlet/ship/ship/api/src/routes/weeks.ts#L798).

- The unified `documents` table is carrying multiple important read paths through JSONB property extraction without dedicated expression indexes.
  Why it matters: these queries are still fast on the current dataset, but they depend on post-filtering after broad indexes and are likely to degrade as document volume grows.
  Evidence: `EXPLAIN ANALYZE` for the My Week weekly-plan lookup and project lookup both show `Bitmap Heap Scan` on `documents` using `idx_documents_document_type`, with `person_id`, `week_number`, `assignee_ids`, and `sprint_number` evaluated in filters rather than index conditions.

### Medium
- Search content currently relies on sequential scans for `title ILIKE '%...%'`.
  Why it matters: search is user-facing and often one of the first places where growth converts a “fast enough” query into a visible regression.
  Evidence: `EXPLAIN ANALYZE` for the search mentions documents query shows a `Seq Scan` on `documents` with `title ~~* '%Audit%'`.

- The issue list avoids N+1, but its batched association load still scans `document_associations` sequentially for large ID arrays.
  Why it matters: this is better than one-query-per-issue, but it still scales with the size of the association table and large issue result sets.
  Evidence: the list-issues flow uses a single batch association query, and `EXPLAIN ANALYZE` shows a `Seq Scan` on `document_associations` for `document_id = ANY(...)`.

- Auth/session queries are repeated across every measured flow and inflate total query count before feature-specific work begins.
  Why it matters: this is not a classic N+1, but it raises the fixed database cost of every user interaction.
  Evidence: every measured flow includes repeated session lookup, session touch, workspace lookup, and role checks in `audit/artifacts/query-profile-summary.json`.

### Low
- No obvious classic within-request N+1 pattern was found in the five audited flows.
  Why it matters: this narrows future optimization work toward query shape and indexing rather than broad ORM-style batching fixes.
  Evidence: the issue list explicitly batch-loads associations after the main issue query in [issues.ts](/home/aaron/projects/gauntlet/ship/ship/api/src/routes/issues.ts#L214), and none of the audited flows showed one query per returned item.

## Suggested Direction
The next optimization wave should prioritize query shape and indexing on the unified `documents` model before chasing raw query-count reductions. The highest-value targets are the read path that writes during sprint-board load, the property-based weekly-plan and sprint lookups, and search queries using `%...%` title matching.

## Audit Deliverable
| User Flow | Total Queries | Slowest Query (ms) | N+1 Detected? |
|---|---:|---:|---|
| Load main page | 14 | 12.318 ms | No |
| View a document | 16 | 3.345 ms | No |
| List issues | 10 | 2.369 ms | No |
| Load sprint board | 16 | 2.192 ms | No |
| Search content | 10 | 2.155 ms | No |

Improvement target:
- Reduce query count or query cost in the two heaviest flows (`view-document` and `load-sprint-board`) without changing user-visible behavior.
- Remove write work from read-only sprint-board loading.
- Improve index coverage for repeated JSONB property filters used by dashboard, sprint, and search flows.
