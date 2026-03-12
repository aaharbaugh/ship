# Phase 2 AI Usage

Track AI usage for the project as requested by the assignment.

## Usage Summary
- Tools used:
  - Codex/GPT-based coding assistance in the repo workspace
- Where AI was most helpful:
  - fast codebase search and synthesis across route files, tests, and evidence docs
  - drafting repeatable benchmark and explain helpers
  - turning scattered implementation work into audit-aligned documentation
- Where AI was least helpful:
  - shell-heavy benchmarking steps when terminal wrapping or local environment quirks were involved
  - any task where the real answer depended on measured local output rather than code inspection
- Where AI suggestions had to be corrected:
  - benchmark/auth shell commands needed to be simplified into scripts after repeated terminal wrapping problems
  - one database index idea was tested, benchmarked, and then intentionally not kept as a claimed win because the planner did not use it
  - some test expectations had to be corrected once real runtime status logic was exercised locally
- Estimated share of final code that was AI-generated vs hand-written:
  - AI-assisted first drafts and edits were used heavily
  - final accepted output was still shaped by local validation, manual reruns, and human decisions about what evidence to keep or reject

## Cost / Volume Notes
- API/tool costs:
  - not separately tracked in this repo
- Token or request counts:
  - not separately tracked in this repo
- Notes:
  - AI was most effective when paired with local benchmarks, tests, and explain-plan checks rather than used as an authority on its own.
