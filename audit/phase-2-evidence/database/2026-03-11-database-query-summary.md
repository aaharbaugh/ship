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

| Flow | Baseline Raw | Baseline Normalized | After Raw | After Normalized | Delta |
|---|---:|---:|---:|---:|---:|
| Load main page | `28` | `14` | `28` | `14` | `0` |
| View document | `30` | `15` | `32` | `16` | `+1` |
| List issues | `20` | `10` | `20` | `10` | `0` |
| Load sprint board | `32` | `16` | `30` | `15` | `-1` |
| Search content | `20` | `10` | `20` | `10` | `0` |

## Interpretation

- The sprint-board flow improved from `16` to `15` normalized queries.
- That is the strongest direct evidence of the `GET /api/weeks/:id` read-path cleanup removing unnecessary database work.
- The assignment threshold of `20%` query-count reduction is not met by this rerun.
- One audited flow (`view-document`) is slightly worse in the rerun and should not be claimed as an improvement.

## Root Cause Reflected Here

The sprint-board improvement is consistent with the Phase 2 backend change that removed a write from `GET /api/weeks/:id`.

This evidence does not fully capture the accountability batching work because the original five-flow audit sample does not directly replay the service hotspot paths that motivated those changes.

## Honest Read

- Category 4 has a real measured improvement, but not yet a threshold-clearing one.
- If we want stronger database proof, the next evidence pass should target:
  - an accountability-heavy flow that actually exercises the batched service loops
  - or `EXPLAIN ANALYZE` output on the specific query shapes we changed
