# FleetGraph Proof Matrix

This is the reviewer-facing proof map for FleetGraph.

Every case should be easy to verify through:

`use case -> test case -> trace -> result`

## What To Capture

For every final-submission case, capture:

- the use case name
- the test case id from `api/src/services/fleetgraph/eval.ts`
- the expected executed path
- the expected next path
- the expected result
- the human decision point
- one trace screenshot or LangSmith link
- one UI/result screenshot

## Flagship Scenario

This should be the main demo story.

### Blocker Propagation Across Linked Work

Use case:

- PM detects blocker propagation across linked work.

Test case:

- `blocked-project-graph`

Why this is the strongest proof story:

- it shows FleetGraph starting from one root document
- it shows the graph pulling in linked work
- it takes a non-trivial conditional branch
- it identifies blocker/risk propagation rather than just thin content
- it routes to a human-reviewed report path
- it can demonstrate post-action state once the report is drafted or published

Expected path:

- `load-trigger-context`
- `load-document`
- `load-associations`
- `resolve-execution-context`
- `load-related-documents`
- `build-graph`
- `score-graph`
- `decide-action`

Expected next path:

- `human-review`
- `draft-report`

Expected result:

- `decision.outcome = draft_report_recommended`
- `decision.proposedAction = draft_quality_report`
- `decision.humanDecisionRequired = true`

Human decision point:

- PM confirms whether the blocker propagation should become a review artifact

Demo arc:

1. Open the root project document.
2. Run FleetGraph review and show the trace path progressing live.
3. Show the blocker propagation finding and the reason FleetGraph chose the report branch.
4. Show the draft report artifact.
5. Show the human publish step.
6. Show the document review trace updating to the published branch.

## Final Submission Cases

### 1. Healthy Project Stays Clear

Use case:

- PM reviews a healthy project graph and FleetGraph confirms it is ready.

Test case:

- `healthy-project`

Expected path:

- `load-trigger-context`
- `load-document`
- `load-associations`
- `resolve-execution-context`
- `load-related-documents`
- `build-graph`
- `score-graph`
- `decide-action`

Expected next path:

- none

Expected result:

- `decision.outcome = healthy`
- `decision.proposedAction = none`
- no human review required

Human decision point:

- none

### 2. Thin Ownerless Wiki Requires Review

Use case:

- FleetGraph detects weak documentation quality before execution drift spreads.

Test case:

- `thin-ownerless-wiki`

Expected path:

- `load-trigger-context`
- `load-document`
- `load-associations`
- `resolve-anchor-context`
- `load-related-documents`
- `build-graph`
- `score-graph`
- `decide-action`

Expected next path:

- `human-review`

Expected result:

- `decision.outcome = human_review_required`
- `decision.proposedAction = review_findings`

Human decision point:

- owner or PM decides whether to fix now or defer

### 3. Issue Missing Acceptance Criteria Recommends Report Path

Use case:

- FleetGraph detects a red execution blocker in an issue.

Test case:

- `issue-missing-acceptance`

Expected path:

- `load-trigger-context`
- `load-document`
- `load-associations`
- `resolve-anchor-context`
- `load-related-documents`
- `build-graph`
- `score-graph`
- `decide-action`

Expected next path:

- `human-review`
- `draft-report`

Expected result:

- `decision.outcome = draft_report_recommended`
- `decision.proposedAction = draft_quality_report`

Human decision point:

- PM reviews before drafting or publishing the artifact

### 4. Low-Signal Standup Triggers Human Review

Use case:

- FleetGraph catches low-signal reporting before it masks project risk.

Test case:

- `empty-standup`

Expected path:

- `load-trigger-context`
- `load-document`
- `load-associations`
- `resolve-anchor-context`
- `load-related-documents`
- `build-graph`
- `score-graph`
- `decide-action`

Expected next path:

- `human-review`

Expected result:

- `decision.outcome = human_review_required`
- `decision.proposedAction = review_findings`

Human decision point:

- manager or owner decides whether to revise the standup or accept the risk

### 5. Healthy Linked Project Graph Remains Green

Use case:

- FleetGraph verifies that linked context can still resolve to a healthy outcome.

Test case:

- `linked-project-health`

Expected path:

- `load-trigger-context`
- `load-document`
- `load-associations`
- `resolve-execution-context`
- `load-related-documents`
- `build-graph`
- `score-graph`
- `decide-action`

Expected next path:

- none

Expected result:

- `decision.outcome = healthy`
- connected issue context does not incorrectly downgrade the root

Human decision point:

- none

## Trace Fields That Must Be Visible

For each captured case, make sure the trace or UI visibly includes:

- `plannedPath`
- `path`
- `nextPath`
- `decision.outcome`
- `decision.proposedAction`
- `decision.humanDecisionRequired`

For the live demo, also show:

- the in-progress step updates
- the final executed path
- the artifact state after human action when applicable

## Evidence Checklist

Use this exact checklist when assembling the final:

- [ ] 5 use cases selected
- [ ] 5 matching test cases verified in `eval.ts`
- [ ] 5 expected results documented
- [ ] 5 trace captures collected
- [ ] at least 1 flagship scenario captured end to end
- [ ] proactive mode shown
- [ ] on-demand mode shown
- [ ] human-in-the-loop shown
- [ ] post-action artifact state shown for at least 1 case
