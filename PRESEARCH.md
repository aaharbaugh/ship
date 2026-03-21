# FleetGraph Pre-Search

## Scope

FleetGraph is a project intelligence agent for Ship. Its job is to watch project documents and their nearby graph, detect execution risk early, and make the next action obvious for the person looking at the work.

The implementation in this repo is intentionally REST-bound: it reads and writes through Ship's own API instead of querying the database directly.

## Phase 1: Define The Agent

### 1. Agent Responsibility Scoping

#### What events in Ship should the agent monitor proactively?

- Document saves on project, sprint, issue, review, retro, and wiki documents.
- Collaboration idle/disconnect events after live editing settles.
- Nightly workspace scans over project roots as a safety net for "nothing changed, but the state is still bad" cases.

#### What constitutes a condition worth surfacing?

- A root project graph or current document scores `yellow` or `red`.
- An issue or task looks active but is not execution-ready.
- A graph contains linked downstream work with unresolved blockers or weak readiness signals.
- A document is thin, placeholder-like, missing acceptance criteria, missing implementation detail, or missing ownership metadata.
- A review or retro contains observations without follow-up actions.

#### What is the agent allowed to do without human approval?

- Read Ship documents and associations through REST.
- Traverse the local graph around a root document.
- Score documents and persist quality metadata back onto documents.
- Create draft review artifacts when the workflow explicitly allows drafting.
- Suggest director feedback options.
- Answer contextual questions in chat for the current document view.

#### What must always require confirmation?

- Publishing a FleetGraph quality report.
- Sending director feedback to the team.
- Any future action that changes document body content, reassigns ownership, or notifies humans outside the current review surface.

#### How does the agent know who is on a project?

- From the graph itself: `parent_id`, `belongs_to`, document associations, and reverse associations.
- From document metadata such as `owner_id`, `assignee_id`, and `assignee_ids`.
- From the current user's workspace role and session context when invoked on demand.

#### How does the agent know who to notify?

- The current implementation routes findings into Ship review surfaces instead of sending external notifications.
- PM/admin reviewers see draft reports in the FleetGraph queue and batch review session.
- Director feedback targets are derived from the report's highest-risk documents and stored as explicit response options for human confirmation.

#### How does on-demand mode use context from the current view?

- The current document becomes the root of the graph traversal.
- FleetGraph fetches the root document plus nearby linked documents and relationships.
- The chat and review surfaces use that exact scoped graph, not a global workspace chatbot context.

### 2. Use Case Discovery

#### Use Case 1: PM reviews a project before the weekly checkpoint

- Role: PM
- Trigger: project save or nightly scan
- Agent detects or produces: executive summary, document-level readiness scores, top blockers, and a draft quality report
- Human decides: whether to publish the report and which issues to triage first

Pain point discovered:
PMs can tell that a project feels off, but not which linked document is causing the drift.

#### Use Case 2: Engineer opens an issue that looks active but is not ready to execute

- Role: Engineer
- Trigger: issue save or contextual on-demand review
- Agent detects or produces: missing acceptance criteria, thin implementation detail, ownership gaps, and next edits to make
- Human decides: whether to fix the issue now or accept the risk and continue

Pain point discovered:
Teams often start moving on work that has a title and status but no real execution detail.

#### Use Case 3: PM spots blocker propagation across linked work

- Role: PM
- Trigger: graph analysis on a project or sprint with blocked linked issues
- Agent detects or produces: connected downstream documents impacted by the blocker, plus a prioritized remediation plan
- Human decides: whether to escalate, reassign, or narrow scope

Pain point discovered:
The risky part is not just the blocked issue; it is the unexamined blast radius across connected work.

#### Use Case 4: Director reviews a synthesized report instead of raw project documents

- Role: Director
- Trigger: PM publishes a FleetGraph report
- Agent detects or produces: prewritten response options tied to the highest-risk documents
- Human decides: which response to send, or whether to hold feedback

Pain point discovered:
Directors rarely have time to reconstruct project state from primary artifacts.

#### Use Case 5: PM processes many findings in one session

- Role: PM
- Trigger: multiple draft or published reports exist
- Agent detects or produces: a batch review session grouped by severity and report state
- Human decides: which reports to open, publish, or ignore for now

Pain point discovered:
Single-report workflows break down once there are many medium-risk problems across the workspace.

### 3. Trigger Model Decision

#### Decision

Hybrid: save/collaboration-idle triggers plus nightly scan.

#### Tradeoffs

- Poll-only:
  - Simpler to reason about.
  - Worse latency.
  - Misses the spirit of proactive detection when work is actively changing.
- Webhook/save-only:
  - Great latency after edits.
  - Misses absence-based problems, such as stale project state or graphs that remain unhealthy without new saves.
- Hybrid:
  - Best fit for the `< 5 minute` latency requirement.
  - Slightly higher run volume.
  - More moving parts, but much better coverage.

#### How stale is too stale?

- For issue and document readiness problems: more than a few minutes feels stale.
- For project-level drift checks: nightly is acceptable as a safety net if save-triggered runs also exist.

#### Cost intuition at scale

- 100 projects: nightly scan remains cheap if bounded to project roots.
- 1,000 projects: cost cliffs come from scanning too deeply and rerunning unchanged documents.
- Mitigation: dedupe by content hash, bounded graph depth, bounded document count, and queue batching.

## Phase 2: Graph Architecture

### 4. Node Design

#### Context nodes

- Normalize trigger source and root document.
- Identify current workspace and user role.
- Reject invalid roots such as FleetGraph report artifacts.

#### Fetch nodes

- Fetch root document.
- Fetch direct and reverse associations in parallel.
- Fetch adjacent documents needed for traversal.
- Expand the graph breadth-first within depth and document limits.

Parallel fetch requirement:
Direct and reverse association fetches already run in parallel via `Promise.all`.

#### Reasoning nodes

- Build scoring payload from the graph snapshot.
- Run deterministic readiness heuristics first.
- Optionally run LLM reasoning to sharpen summaries, severity, and remediation suggestions.

#### Action nodes

- Persist quality metadata.
- Create or update a draft quality report.
- Publish a report after confirmation.
- Send director feedback after confirmation.

#### Output nodes

- Document review panel.
- Contextual document chat.
- Reports queue.
- Batch review session.

#### Conditional edges

- Duplicate content hash -> skip queueing.
- Missing API token -> skip execution gracefully.
- Missing model API key -> deterministic analysis only.
- Healthy graph -> persist only.
- Unhealthy graph with drafting enabled -> persist and draft report.
- Publish or director feedback request -> human gate before action.

### 5. State Management

#### State carried across a graph run

- Root document id
- Trigger source
- Traversed documents and edges
- Graph depth/truncation metadata
- Per-document analysis
- Executive summary
- Remediation suggestions

#### State persisted between proactive runs

- Document-level FleetGraph metadata in document `properties`
- Linked `quality_report_id`
- Durable queue jobs in `fleetgraph_jobs`
- Completed job content hashes for dedupe

#### How redundant API calls are limited

- Content-hash dedupe before queue insertion
- Queue coalescing for pending jobs on the same document
- Bounded traversal depth and document count
- Root-scoped on-demand analysis instead of workspace-wide scans

### 6. Human-In-The-Loop Design

#### Actions requiring confirmation

- Report publish
- Director feedback send

#### Confirmation experience

- Review artifact appears in Ship first.
- User reviews the saved draft from the report queue, detail page, or batch review session.
- User explicitly presses publish or send feedback.

#### If the human dismisses or snoozes

- The draft remains as a persisted artifact.
- The project can be rescanned later.
- Metadata remains visible on the underlying documents so the signal is not lost.

### 7. Error And Failure Handling

#### When Ship API is down

- Fail the current job gracefully.
- Keep the job in the durable queue for retry up to the configured attempt limit.

#### Graceful degradation

- If the model API is missing or errors, fall back to deterministic analysis.
- If a linked document is missing, avoid crashing list/detail surfaces and continue where possible.

#### What gets cached and for how long

- Current implementation favors persisted metadata and durable job state over in-memory caching.
- The queue lease window acts as the main short-lived execution control.

## Phase 3: Stack And Deployment

### 8. Deployment Model

#### Where does the proactive agent run?

- In the Ship API service itself, backed by a durable DB queue and a scheduled nightly scan script.

#### How is it kept alive?

- Interval-based batch flushing for queued jobs.
- A standalone script entrypoint for nightly scans, suitable for Railway cron or another scheduler.

#### How does it authenticate without a user session?

- With `SHIP_API_TOKEN` against Ship's REST API.

### 9. Performance

#### How does the trigger model achieve `< 5 minute` detection latency?

- Save-triggered jobs enter the queue immediately.
- Default queue flush interval is four minutes.
- Collaboration edits wait for idle rather than firing on every persistence pulse.

#### Token budget per invocation

- Keep prompts bounded by:
  - max graph depth
  - max graph documents
  - summary-text truncation per document

#### Cost cliffs

- Nightly scans over too many projects.
- Deep graph traversals.
- Re-analyzing unchanged content.
- Excessive on-demand chat follow-ups on the same large graph.

## Pre-Search Outcome

The most defensible FleetGraph responsibility for early submission is:

- Proactively watch project and issue readiness.
- Persist machine-readable health signals onto documents.
- Produce review artifacts for PMs instead of only dashboards.
- Keep consequential actions human-confirmed.
- Make on-demand chat and review contextual to the document the user is already viewing.

Supporting implementation notes and diagrams live in [`fleetgraph/`](./fleetgraph).
