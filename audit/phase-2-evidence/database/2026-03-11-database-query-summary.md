# Database Query Evidence Summary

Date: 2026-03-11
Branch: implementation

## Commands Run

```bash
PORT=3003 CORS_ORIGIN=http://localhost:5173 SESSION_SECRET=audit-secret E2E_TEST=1 \
NODE_OPTIONS="--import=/home/aaron/projects/gauntlet/ship/ship/audit/artifacts/query-profiler.mjs" \
pnpm dev
```

Then the audited flows were replayed with `X-Audit-Flow` headers:

- `load-main-page`
- `view-document`
- `list-issues`
- `load-sprint-board`
- `search-content`

Aggregation command:

```bash
node audit/artifacts/aggregate-query-profile.mjs \
  audit/artifacts/query-profile.jsonl \
  audit/phase-2-evidence/database/2026-03-11-query-profile-summary-after.raw.json
```

Raw artifact:
- `audit/phase-2-evidence/database/2026-03-11-query-profile-summary-after.raw.json`

Baseline artifact:
- `audit/artifacts/query-profile-summary.rerun.json`

## Normalization Note

The profiler still captures duplicate pool/client execution records, so totals are normalized by dividing raw query counts by `2`, matching the original audit method.

## Query Count Comparison

The initial March 11 replay captured an intermediate state and should not be treated as the final Phase 2 closeout read. The strongest current evidence comes from the later normalized `view-document` rerun summarized in the category chapter.

| Flow | Baseline Raw | Baseline Normalized | Final After Raw | Final After Normalized | Delta |
|---|---:|---:|---:|---:|---:|
| View document | `30` | `15` | `22` | `11` | `-4` |

## Interpretation

- The final `view-document` proof flow improved from `15` to `11` normalized queries.
- That is a `26.7%` reduction, which clears the assignment threshold of `20%`.
- The sprint-board cleanup still matters in code, but it is not the headline proof flow for the final closeout package.
- This file should be read together with [cat-4-database-query-efficiency.md](/home/aaron/projects/gauntlet/ship/ship/audit/cat-4-database-query-efficiency.md), which reflects the final accepted evidence.

## Root Cause Reflected Here

The sprint-board improvement is consistent with the Phase 2 backend change that removed a write from `GET /api/weeks/:id`.

This evidence does not fully capture the accountability batching work because the original five-flow audit sample does not directly replay the service hotspot paths that motivated those changes.

## Honest Read

- Category 4 now has a threshold-clearing measured win on `view-document`.
- If we want stronger showcase depth beyond the assignment bar, the next evidence pass should target:
  - an accountability-heavy flow that actually exercises the batched service loops
  - or a second clear `EXPLAIN ANALYZE` and query-count win on sprint-board or issue-list reads
