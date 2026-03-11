# Audit Methodology

## Purpose
This document defines how the Ship codebase audit is run and documented. It exists to make the audit:

- Reviewable by engineering leadership
- Repeatable by future auditors
- Comparable over time
- Actionable without being overwhelming

The audit is diagnostic only. No fixes are made during the measurement phase.

## Audit Principles
- Measure before recommending.
- Use repeatable commands and document them.
- Prefer concrete baseline numbers over narrative claims.
- Separate generated artifacts from authored source where possible.
- Rank findings by business and engineering impact, not by count alone.
- Keep each category readable in under a few minutes.

## Deliverables
For each of the 7 audit categories, produce an individual Markdown report plus a final consolidated report.

Each category report must include:
- How the category was measured
- Baseline numbers
- Key weaknesses or opportunities
- Severity ranking for each finding
- A short suggested direction for future remediation

## Repository Scope
Primary application scope for baseline measurements:

- `web/`
- `api/`
- `shared/`

Default exclusions unless a category explicitly requires otherwise:

- `node_modules/`
- `dist/`
- `build/`
- `coverage/`
- `web/dev-dist/`
- Generated machine outputs that are not hand-maintained source

When exclusions are used, the category report must say so.

## Measurement Standard
Each category should follow the same 4-step structure.

### 1. Measure
State the exact tools, commands, and methodology used.

Guidelines:
- Prefer repo-native commands first, such as package scripts.
- Use fast local inspection tools such as `rg`, `find`, `sed`, `pnpm`, and compiler or test tooling already present in the repo.
- When regex counts may overcount, normalize with AST or tool-based analysis and state the difference.
- If a recommended visualization package is not already installed locally, use audit-only metadata extraction from the existing build toolchain rather than adding new dependencies during the audit.
- For frontend bundle audits, prefer keeping a dedicated visualization tool available behind an audit-only flag so a treemap can be regenerated without changing normal production builds.
- Note any exclusions or assumptions.

### 2. Baseline
Summarize the current state with concrete numbers.

Guidelines:
- Use totals first, then package breakdowns.
- Keep the primary baseline table compact enough to scan quickly.
- Include pass/fail status where relevant.
- If a metric is conditional, state the condition explicitly.

### 3. Diagnose
Convert raw measurements into a small number of clear findings.

Guidelines:
- Group related issues into patterns instead of listing every instance.
- Call out concentration points such as packages, subsystems, or hotspot files.
- Explain why the issue matters in operational, delivery, reliability, security, or maintainability terms.

### 4. Rank
Assign severity based on practical impact.

Default severity scale:
- `High`: Likely to create production risk, data integrity issues, security exposure, or major delivery drag.
- `Medium`: Raises regression risk, maintenance cost, or slows future changes materially.
- `Low`: Localized issue with limited near-term impact, but worth addressing opportunistically.

## Report Structure
Each category report should use this shape:

```md
# Category N: <Name>

## Executive Summary
- 2 to 4 bullets

## Measurement Method
- Tools
- Commands
- Scope and exclusions
- Normalization notes

## Baseline
- Compact table of baseline metrics
- Package breakdown
- Key status flags

## Hotspots
- Top files, modules, or flows with counts and short explanation

## Findings
### High
- Finding
- Why it matters
- Evidence

### Medium
- Finding
- Why it matters
- Evidence

### Low
- Finding
- Why it matters
- Evidence

## Suggested Direction
- Short paragraph only
```

## Executive Readability Rules
The audience includes CTO and CEO review. Category reports should therefore:

- Start with the business-relevant summary
- Keep raw command output out of the main narrative
- Use tables for baselines and hotspots
- Limit the main findings to the highest-signal issues
- Distinguish between systemic problems and localized cleanup

Detailed evidence can remain in command notes or supporting sections, but the first screen of each report should be understandable without engineering context.

## Historical Consistency
To keep future audits comparable:

- Reuse the same category names and metric definitions
- Preserve prior methodology unless there is a good reason to change it
- If methodology changes, document why
- Prefer absolute counts plus percentages when summarizing change over time

## File Conventions
Recommended audit file layout:

- `audit/AUDIT_METHODOLOGY.md`
- `audit/cat-1-type-safety.md`
- `audit/<category-name>.md`
- `audit/final-audit-report.md`

Each category report should include:
- Measurement date
- Commands used
- Scope exclusions
- Baseline totals

For repeatability, audit-only tooling and artifacts should follow these conventions when applicable:

- Feature flags such as `BUNDLE_ANALYZE=1` should enable analysis without altering normal builds.
- Treemap outputs should be written to `audit/artifacts/` when generated for a frontend bundle audit.
- Category reports should reference the artifact path and the exact command used to produce it.

## Category Notes

### Category 3: API Response Time
This category has a few measurement caveats that should be documented whenever they apply:

- The audit must be run against a seeded dataset that meets or exceeds the required floor. If the default seed is below the required volume, add audit-only records to the local dev database rather than changing application seed code during the audit.
- Endpoint selection should come from real frontend request paths used in common flows, not from backend route enumeration alone.
- Benchmarks should use an authenticated session if the frontend flow normally requires auth.
- If rate limiting, auth expiry, or other protective middleware contaminates the benchmark, note that explicitly and rerun against a clean local process or adjusted benchmark profile so the reported numbers reflect handler latency rather than middleware throttling.
- If the selected load-testing tool does not emit an exact required percentile, document the normalization method used. Example: if `autocannon` provides `p90`, `p97.5`, and `p99` but not exact `p95`, the audit should state that `p95` was interpolated from the available latency histogram outputs.
- Raw benchmark artifacts should be saved under `audit/artifacts/` and referenced from the category report.

### Category 4: Database Query Efficiency
This category has its own measurement caveats and should document them when they apply:

- If native PostgreSQL statement logging or `pg_stat_statements` is unavailable in the local dev environment, use an audit-only runtime query profiler rather than changing application code. The fallback should be called out explicitly in the report.
- If the runtime profiler captures both pool-level and client-level query calls, normalize duplicate counts before publishing baseline totals. The normalization rule should be stated in the report.
- User flows should be chosen from real frontend request paths used in common product workflows, not from backend route lists alone.
- For authenticated flows, profile the full request path the frontend actually takes, including auth/session overhead, but separate middleware overhead from application-query findings in the written diagnosis.
- `EXPLAIN ANALYZE` should be run on the slowest meaningful application queries, not on session-touch or auth bookkeeping queries unless those are themselves the finding.
- Query-count and `EXPLAIN` artifacts should be saved under `audit/artifacts/` when generated and referenced from the category report.

### Category 5: Test Coverage and Quality
This category should document a few measurement boundaries when they apply:

- The repository root `pnpm test` command may not represent the full product test surface. The report should state exactly which packages or suites that command does and does not execute.
- Reliability should distinguish between flaky application tests and deterministic environment failures. Example: a suite that consistently fails because Docker/Testcontainers is unavailable is not “flaky,” but it is still a major quality and operability finding.
- If a suite is too large to rerun blindly, prioritize three-pass checks on the executable suites and document any blocked suite separately with the reason it could not complete.
- If coverage scripts exist but fail because the provider package is missing, record that as a tooling gap rather than silently omitting coverage.
- For flow mapping, prefer product-level flows over file-level counts. The report should answer whether document CRUD, auth, real-time sync, sprint management, and other critical workflows are covered end-to-end, only at lower test layers, or not covered at all.

### Category 6: Runtime Error and Edge Case Handling
This category should document a few measurement boundaries when they apply:

- Use a blend of source inspection and targeted runtime exercises. Direct DevTools observation is ideal, but an automated Playwright run that captures browser console output and server stderr is acceptable when the same user flows are exercised.
- Separate happy-path console noise from edge-case console noise. A clean document-load flow should not be diluted by intentionally offline or fault-injected scenarios, but those scenarios should still be measured and called out separately.
- Record whether failures are user-visible, console-only, or completely silent. The distinction matters more than raw error volume.
- React error boundaries only catch render-time failures. Async fetch failures, WebSocket failures, autosave retries, and event-handler exceptions must be evaluated separately and should not be treated as “covered” just because a top-level boundary exists.
- If server-side unhandled rejection hooks are absent, report both the observed runtime count and the missing instrumentation as separate facts.
- Save any focused runtime logs or generated artifacts under `audit/artifacts/` when retained for reference, and cite the exact flow or test subset used to produce them.

## Current Audit Session
This audit session started on March 10, 2026 and uses the current repository state in the working tree as the baseline snapshot.
