# FleetGraph

## Status

FleetGraph is currently implemented as a REST-bound graph analysis subsystem inside Ship.

Current MVP status:

- Graph execution is wired end-to-end against real Ship REST data.
- At least one proactive detection path is running:
  - save-triggered / collaboration-idle-triggered analysis
  - nightly workspace scan
- Human-in-the-loop gates are implemented for:
  - publishing quality reports
  - sending director feedback
- LangSmith tracing is wired into the runtime and GPT-4o reasoning path.
- On-demand report refresh now updates the report artifact and root linkage without rewriting metadata across the full scanned subtree.
- PM-facing outputs now include an executive summary for the scanned graph in addition to per-document findings.
- The document-level FleetGraph popup now includes embedded contextual chat tied to the current document view.

## MVP Checklist

- [x] Graph running with at least one proactive detection wired end-to-end
- [ ] LangSmith tracing enabled with at least two shared trace links submitted
- [x] `FLEETGRAPH.md` submitted with Agent Responsibility and Use Cases sections completed
- [x] Graph outline complete with node types, edges, and branching conditions documented
- [x] At least one human-in-the-loop gate implemented
- [x] Running against real Ship data with no mocked app/runtime responses
- [ ] Deployed and publicly accessible
- [x] Trigger model decision documented and defended

Current gaps for external MVP completion:

- public deployment
- trace-link submission
- final polish of the PM-facing workflow and documentation

## Agent Responsibility

FleetGraph is responsible for proactively evaluating the quality of connected Ship work graphs and surfacing actionable issues before they become project execution problems.

For the current on-demand UX, FleetGraph is primarily positioned as a contextual PM review tool:

- it starts from the document the user is looking at
- it scans the nearby work graph
- it produces one executive summary plus supporting findings
- it can refresh or draft a report for that root context
- it includes an embedded chat surface for document-scoped follow-up questions like risk, readiness, and next steps

For MVP, FleetGraph is allowed to:

- read Ship documents and graph edges through Ship REST endpoints only
- traverse document relationships using:
  - `parent_id`
  - `belongs_to`
  - `document_associations`
  - reverse associations
- score document graphs for quality and readiness
- write FleetGraph metadata back into document `properties`
- draft quality reports for PM review
- generate director feedback options
- build review-session summaries across many findings

For MVP, FleetGraph is not allowed to autonomously:

- publish a report without human confirmation
- send director feedback without human confirmation
- mutate document body content directly
- use direct database access as the FleetGraph data layer

## Use Cases

### 1. PM reviews a project quality report

Trigger:

- a project document is saved
- or a nightly scan runs

FleetGraph:

- traverses the connected project graph
- scores project, sprint, issue, and related documents
- drafts a quality report

Human decision:

- PM reviews and confirms before publish

### 2. Engineer starts an issue that is not ready

Trigger:

- an issue is edited while active or in progress

FleetGraph:

- detects missing readiness signals like weak content, missing owner, or missing acceptance context
- writes quality tags into document metadata

Human decision:

- engineer decides whether to proceed or fix the issue context first

### 3. PM detects blocker propagation across linked work

Trigger:

- a graph run includes unresolved blocking relationships

FleetGraph:

- identifies linked downstream documents affected by the blocker
- surfaces the issue in the project graph and report

Human decision:

- PM triages, reassigns, or escalates

### 4. Owner has a thin or under-specified document

Trigger:

- document save
- nightly scan

FleetGraph:

- detects thin content, weak ownership, or incomplete context
- writes quality summary and tags to the document

Human decision:

- owner updates the document

### 5. Director sends feedback after report review

Trigger:

- a FleetGraph quality report is published and reviewed

FleetGraph:

- generates response options for the report
- stores those options on the report document

Human decision:

- director selects one option and confirms send

### 6. PM reviews an entire chunk of findings at once

Trigger:

- multiple reports/findings exist in the current FleetGraph batch

FleetGraph:

- flattens findings into a review session
- groups them into red, yellow, and other lanes

Human decision:

- PM reviews the whole batch and bulk-publishes drafts or drills into detail only where needed

## Trigger Model Decision

### Decision

Hybrid trigger model:

- save-triggered analysis for low-latency proactive detection
- nightly scan as the safety-net path

### Why this model

Poll-only was rejected because it misses the low-latency requirement for proactive detection.

Webhook/save-only was rejected because absence-based conditions can exist even when no document is saved.

The hybrid model gives:

- fast detection after meaningful content changes
- coverage for no-save conditions like missing expected activity
- predictable periodic re-evaluation through nightly scan

### Current implementation detail

For collaboration/Y.js editing, FleetGraph does not run on every persistence pulse.

Instead:

- collaborative changes persist normally
- FleetGraph captures the latest content hash
- FleetGraph queues only after the collaborative document goes idle or all collaborators disconnect

This keeps the trigger model proactive without tying graph execution directly to noisy Y.js persistence frequency.

## Graph Outline

FleetGraph is implemented as a graph of reusable nodes rather than separate per-entrypoint implementations.

The important shape is:

- many entry points
- one shared core prepare/score/persist path
- multiple consumers of the same outputs

### Entry Nodes

- `documents.ts` save/update routes
- collaboration idle checkpoint in `api/src/collaboration/index.ts`
- manual insights route in `api/src/routes/fleetgraph.ts`
- nightly scan route in `api/src/routes/fleetgraph.ts`

### Shared Core Nodes

- `enqueueFleetGraphRun()` in `triggers.ts`
- `flushFleetGraphQueue()` in `triggers.ts`
- `executeFleetGraphTrigger()` in `execute.ts`
- `prepareFleetGraphRun()` in `runner.ts`
- `buildFleetGraphSnapshot()` in `graph.ts`
- `buildFleetGraphScoringPayload()` in `payload.ts`
- `analyzeFleetGraphWithReasoning()` in `reasoning.ts`
- `persistFleetGraphAnalysis()` in `persist.ts`

### Shared Traversal Subnodes

These are documented in `api/src/services/fleetgraph/nodes.ts`:

- `load-trigger-context`
- `load-document`
- `load-associations`
- `load-related-documents`
- `build-graph`
- `score-graph`
- `persist-metadata`
- `draft-report`

### Branch Nodes

- `createFleetGraphQualityReportDraft()` in `report.ts`
- `publishFleetGraphQualityReport()` in `report.ts`
- `sendFleetGraphDirectorFeedback()` in `feedback.ts`
- `listFleetGraphReports()` in `reports.ts`
- `getFleetGraphReportDetail()` in `reports.ts`
- `getFleetGraphReviewSession()` in `reports.ts`

### Branching Conditions

- if trigger is duplicate content hash:
  - skip queueing
- if queue flush selects the event:
  - execute shared runtime path
- if `OPENAI_API_KEY` is absent:
  - use deterministic analysis only
- if report already exists:
  - reuse linked report instead of drafting a new one
- if report publish is requested:
  - require human confirmation
- if director feedback is requested:
  - require human confirmation
- if nightly scan is configured to draft reports:
  - create draft reports only for non-green root results without existing report links

## Human-In-The-Loop Gates

Implemented gates:

- report publish confirmation
- director feedback confirmation

These are exposed in the FleetGraph review surfaces:

- report queue
- report detail page
- batch review session

## Real Ship Data

FleetGraph runs against real Ship data in the app/runtime path.

It currently uses:

- Ship REST document endpoints
- Ship REST graph/association endpoints
- real document `properties`
- real document content

FleetGraph does not use mocked responses in the running app flow.

## REST Boundary

FleetGraph is intentionally REST-bound.

That means:

- FleetGraph reads and writes through Ship REST endpoints
- save seams in Ship act as trigger points only
- FleetGraph logic is not implemented as direct DB queries over project data

This preserves the presearch boundary that FleetGraph should behave like a client of Ship, even when running in the same codebase.

## LangSmith

LangSmith is enabled in the FleetGraph runtime for:

- shared `traceable` function tracing
- wrapped OpenAI GPT-4o calls via `wrapOpenAI`
- FleetGraph-specific trace metadata such as:
  - root document id
  - document count
  - edge count
  - graph depth
  - truncation

Required env on API:

- `LANGSMITH_API_KEY`
- `LANGSMITH_TRACING=true`
- `LANGSMITH_PROJECT`

Trace submission file:

- `TRACE_LINKS.md`

Readiness check route:

- `GET /api/fleetgraph/readiness`

## Current UI Surface

Current MVP surfaces:

- document-level FleetGraph insights panel
- FleetGraph reports queue
- FleetGraph report detail page
- FleetGraph batch review session page

Deferred:

- inline `>>` prompt UX inside the editor
- dedicated on-demand chat assistant UX beyond the current insights flow

## Deployment

Current status:

- local Docker/dev deployment is working
- not yet publicly deployed

Deployment runbook:

- `../RAILWAY_DEPLOYMENT.md`

Deployment-ready runtime additions completed in code:

- `GET /api/fleetgraph/readiness` for env/runtime verification
- `pnpm fleetgraph:nightly-scan` for Railway cron or scheduled execution

Public deployment target for MVP:

- one Railway web service from the repo root
- one Railway Postgres database
- Ship web and API served from the same origin

Remaining action outside the repo:

- deploy the service publicly and record the URL

## Diagrams

Supporting diagrams in this folder:

- `FLEETGRAPH_GRAPH.svg`
- `FLEETGRAPH_RUNTIME_GRAPH.svg`
- `FLEETGRAPH_CIRCULAR_NODE_GRAPH.svg`
- `FLEETGRAPH_REUSE_GRAPH.svg`
- `TRACE_LINKS.md`

The most useful diagram for dependency overlap is:

- `FLEETGRAPH_REUSE_GRAPH.svg`

## Tests And Evals

Automated test coverage now exists for:

- deterministic analysis
- graph preparation
- reasoning merge safeguards
- workspace scan behavior
- quality report drafting and publishing
- director feedback writeback
- queued trigger batching and dedupe
- deployment readiness status
- deterministic eval corpus regression checks

Eval documentation:

- `EVALS.md`

Still missing for a fuller MVP hardening pass:

- route-level integration coverage for FleetGraph endpoints
- frontend test coverage for FleetGraph review surfaces
- GPT-4o evals using captured LangSmith traces
