# FleetGraph Node Graph

## Purpose

This defines FleetGraph as a graph of nodes that operates over Ship's REST API, not direct database queries.

The guiding split is:

- Ship owns persistence, auth, and source-of-truth document behavior.
- FleetGraph owns graph traversal, reasoning, scoring, caching decisions, and human-gated actions.
- FleetGraph nodes consume Ship through REST endpoints only.

## Core Principles

- Every FleetGraph run starts from a trigger context.
- Nodes should pass structured payloads, not raw route responses.
- Graph traversal is explicit: `parent_id` plus `document_associations`.
- Reasoning happens on a compressed graph payload, not one model call per document.
- Human-gated actions are separate nodes from reasoning nodes.
- Writes back to Ship happen through REST only.

## Run Types

### 1. Proactive save-triggered run

Used when a document changes and FleetGraph should re-evaluate the affected graph.

### 2. Nightly safety-net run

Used to detect absence-based conditions that have no save event.

### 3. On-demand document run

Used when a user asks for contextual help from a document view.

## Shared Node Contracts

Every node should receive a `FleetGraphRunContext` and return a typed output.

### `FleetGraphRunContext`

- `run_id`
- `trigger_source`
- `workspace_id`
- `user_id` when user-initiated
- `root_document_id`
- `root_document_type` if known
- `requested_action`
- `timestamp`

### `FleetGraphDocumentRef`

- `id`
- `document_type`
- `title`
- `parent_id`
- `belongs_to`
- `properties`
- `content` or extracted plain text

## Node Sets

## A. Entry Nodes

### `trigger_context`

Responsibilities:

- normalize the incoming trigger into `FleetGraphRunContext`
- identify whether the run is save-triggered, nightly, or on-demand
- capture actor/user if present
- identify the seed document or project

Inputs:

- webhook payload, cron payload, or UI request

Outputs:

- `FleetGraphRunContext`

## B. Discovery Nodes

### `resolve_root_scope`

Responsibilities:

- fetch the seed document
- determine if the run should expand to:
  - document-only
  - project graph
  - sprint/week subgraph
- identify the containing project if the seed is an issue, standup, or sprint document

Likely Ship API usage:

- `GET /api/documents/:id`
- `GET /api/documents/:id/associations`
- `GET /api/documents/:id/context`

Outputs:

- `root_document`
- `project_id`
- `scope_kind`

### `resolve_actor_role`

Responsibilities:

- determine if actor is a director, PM/owner, or engineer
- map Ship roles to FleetGraph behavior

Likely Ship API usage:

- current membership/admin context
- owner fields on project/sprint/document payloads

Current status:

- not fully exposed by a single purpose-built endpoint yet

Outputs:

- `actor_role`
- `document_owner_role`

## C. Fetch Nodes

### `fetch_project`

Responsibilities:

- fetch project metadata, content, and FleetGraph-related properties

Likely Ship API usage:

- `GET /api/projects/:id`
- fallback `GET /api/documents/:id`

### `fetch_project_issues`

Responsibilities:

- fetch issues linked to the project
- identify blockers, state, assignee, and missing acceptance criteria

Likely Ship API usage:

- `GET /api/projects/:id/issues`
- possibly `GET /api/issues/:id`

### `fetch_project_sprints`

Responsibilities:

- fetch sprints/weeks for the project
- identify active sprint(s)

Likely Ship API usage:

- `GET /api/projects/:id/sprints`
- `GET /api/projects/:id/weeks`

### `fetch_sprint_details`

Responsibilities:

- fetch sprint/week detail, issues, standups, and review state

Likely Ship API usage:

- `GET /api/weeks/:id`
- `GET /api/weeks/:id/issues`
- `GET /api/weeks/:id/standups`
- `GET /api/weeks/:id/review`

### `fetch_document_graph_edges`

Responsibilities:

- fetch explicit graph edges for any node in scope
- walk forward and reverse associations where useful

Likely Ship API usage:

- `GET /api/documents/:id/associations`
- `GET /api/documents/:id/reverse-associations`

### `fetch_owned_documents`

Responsibilities:

- fetch documents owned by a person when checking for thin ownership docs

Current status:

- no obvious single REST endpoint for "all docs by owner_id/person"

Needs:

- either compose from existing document lists or add a Ship API endpoint

### `fetch_quality_context`

Responsibilities:

- load existing FleetGraph metadata already stored in document `properties`
- load linked quality report reference if present

Likely Ship API usage:

- existing document fetch endpoints, once FleetGraph metadata exists in `properties`

## D. Transform Nodes

### `extract_plain_text`

Responsibilities:

- convert TipTap content into compressed plain text per document
- strip boilerplate where appropriate

Note:

- this should happen inside FleetGraph, not by relying on DB-side content extraction

### `reuse_or_refresh_summary`

Responsibilities:

- compare current document content hash to cached summary hash
- reuse cached summary if content is unchanged
- mark documents that need fresh summarization

Outputs:

- `summary_inputs`
- `cache_hits`
- `cache_misses`

### `assemble_graph_payload`

Responsibilities:

- merge all fetched documents and edges into a reasoning payload
- include:
  - document summaries
  - ownership
  - blockers
  - sprint context
  - missing-field signals
  - current FleetGraph metadata

Outputs:

- `FleetGraphReasoningPayload`

## E. Reasoning Nodes

### `score_graph`

Responsibilities:

- score project, sprint, issue, and standup layers
- detect:
  - missing required issue context
  - blocker propagation
  - missing expected activity
  - thin owned docs
  - low-quality layers
- produce ranked remediation suggestions

Outputs:

- per-document scores
- graph-level status
- remediation suggestions
- director response options when applicable

### `answer_document_question`

Responsibilities:

- answer an on-demand user question using current document + local graph context
- either return answer-only output or propose a human-gated action

Outputs:

- `answer_only` or `proposed_action`

## F. Decision Nodes

### `route_on_threshold`

Responsibilities:

- decide whether a run is:
  - all-clear
  - alert-only
  - draft-report-worthy

### `route_on_mode`

Responsibilities:

- branch behavior for:
  - proactive run
  - nightly scan
  - on-demand run

### `hitl_gate`

Responsibilities:

- stop autonomous action until human approval exists

Use cases:

- publish quality report
- send director feedback
- promote on-demand output into permanent document content

## G. Write Nodes

### `write_document_metadata`

Responsibilities:

- write FleetGraph metadata back to document `properties`

Writes:

- `quality_score`
- `quality_status`
- `quality_summary`
- `quality_tags`
- `last_scored_at`
- `quality_report_id`
- `quality_summary_hash`

### `create_report_draft`

Responsibilities:

- create a draft report payload in Ship
- do not publish without confirmation

Open implementation choice:

- dedicated `quality_report` document type
- or temporary `wiki`-backed carrier

### `publish_report`

Responsibilities:

- publish the draft report after PM confirmation
- attach its id back onto related documents

### `write_director_feedback`

Responsibilities:

- write director-selected feedback to the target document(s)
- only after confirmation

## H. Output Nodes

### `return_proactive_findings`

Responsibilities:

- return document-level findings for existing Ship surfaces

### `return_on_demand_result`

Responsibilities:

- return ephemeral answer content for sidebar or future inline UX

## Recommended MVP Node Flow

## Save-triggered path

1. `trigger_context`
2. `resolve_root_scope`
3. `fetch_document_graph_edges`
4. `fetch_project`
5. `fetch_project_sprints`
6. `fetch_project_issues`
7. `fetch_sprint_details`
8. `fetch_quality_context`
9. `extract_plain_text`
10. `reuse_or_refresh_summary`
11. `assemble_graph_payload`
12. `score_graph`
13. `route_on_threshold`
14. `write_document_metadata`
15. optional `create_report_draft`
16. `return_proactive_findings`

## Nightly path

1. `trigger_context`
2. enumerate active projects
3. run the same graph fetch/transform/reason path per project
4. `write_document_metadata`
5. optional `create_report_draft`

## On-demand path

1. `trigger_context`
2. `resolve_root_scope`
3. `fetch_document_graph_edges`
4. `fetch_quality_context`
5. `extract_plain_text`
6. `assemble_graph_payload`
7. `answer_document_question`
8. `route_on_mode`
9. if answer-only, `return_on_demand_result`
10. if action proposed, `hitl_gate`

## Nodes That Probably Need New Ship API Support

- role resolution for workspace membership + document ownership in one response
- active-project enumeration for scheduled scans
- owner-scoped document listing
- a clean write endpoint for FleetGraph metadata updates
- a clean report-draft create/publish workflow
- a trigger endpoint if FleetGraph runs out-of-process

## Recommended Build Order

1. Define request/response contracts for:
   - `resolve_root_scope`
   - `fetch_project_graph`
   - `write_document_metadata`
2. Build the REST client wrapper FleetGraph will use.
3. Implement read-only fetch nodes first.
4. Implement transform/cache nodes.
5. Implement reasoning node.
6. Add write nodes and HITL gates last.

## Open Questions

- Should nightly scan operate workspace-wide or only over active projects returned by a new API endpoint?
- Do we want a true `quality_report` type in MVP, or a temporary carrier document?
- For on-demand mode, do we want to target sidebar-only for MVP and explicitly defer inline `>>`?
