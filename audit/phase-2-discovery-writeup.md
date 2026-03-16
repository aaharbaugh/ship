# Phase 2 Discovery Write-up

Document 3 things learned during the audit and implementation process, with codebase references and short reflections.

## Discovery 1
- What I learned:
  - The biggest technical wins came from fixing the measurement workflow, not just the code paths themselves.
- Why it matters:
  - Until tests, benchmark auth, rate limiting, and DB separation were stable, it was too easy to misread good changes as bad results or bad setup as app regressions.
- Code references:
  - `api/src/db/client.ts`
  - `api/src/test/setup.ts`
  - `api/src/app.ts`
  - `scripts/start-api-benchmark.sh`
  - `scripts/login-benchmark-session.js`
- Reflection:
  - Tooling and measurement quality are part of the product engineering work, not just supporting detail.

## Discovery 2
- What I learned:
  - Several of the highest-value fixes crossed category boundaries at the same time.
- Why it matters:
  - The strongest refactors improved more than one dimension: for example, `weeks.ts` and `accountability.ts` touched type safety, API response time, database efficiency, and regression risk together.
- Code references:
  - `api/src/routes/weeks.ts`
  - `api/src/services/accountability.ts`
  - `api/src/routes/team.ts`
  - `api/src/routes/issues.ts`
- Reflection:
  - The audit categories are useful for evaluation, but the best implementation work often happens at the shared hotspots between them.

## Discovery 3
- What I learned:
  - Honest validation was more valuable than forcing every optimization to “count.”
- Why it matters:
  - Some changes benchmarked well and stayed; others, like the later association index experiment, did not hold up and were removed from the claimed wins.
- Code references:
  - `audit/phase-2-evidence/api/2026-03-11-api-benchmark-summary.md`
  - `scripts/run-issues-belongs-to-explain.sh`
  - `api/scripts/explain-issues-belongs-to-query.ts`
- Reflection:
  - The strongest final result is not “everything improved equally.” It is a codebase with clearly measured wins and a defensible explanation of what still needs work.
