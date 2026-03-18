# FleetGraph Evals

FleetGraph now has two layers of automated quality checks:

- unit/integration-style tests for runtime behavior
- a small deterministic eval corpus for scoring regressions

## Current Coverage

Backend tests:

- `analyze.test.ts`
- `runner.test.ts`
- `reasoning.test.ts`
- `scan.test.ts`
- `report.test.ts`
- `feedback.test.ts`
- `triggers.test.ts`
- `readiness.test.ts`
- `eval.test.ts`

## Eval Corpus

The deterministic regression set lives in:

- `api/src/services/fleetgraph/eval.ts`

It currently covers:

- healthy owned project
- thin ownerless wiki
- issue missing acceptance criteria
- low-signal standup
- healthy linked project graph

## What This Catches

- accidental scoring regressions in the deterministic analyzer
- queue dedupe and batch behavior regressions
- readiness/deployment status regressions

## What Is Still Missing

- GPT-4o quality evals over real LangSmith traces
- route-level integration tests for `api/src/routes/fleetgraph.ts`
- frontend tests for FleetGraph review surfaces
- human-reviewed false-positive / false-negative scoring samples

## Next Eval Step

The next serious eval upgrade should be a LangSmith-backed review set:

1. capture real Ship graph payloads from traces
2. label expected root status and top findings
3. compare model outputs against those expectations across prompt/model revisions
