# FleetGraph Implementation Plan

## Goal

Build a FleetGraph MVP inside Ship that:

- scores project graphs proactively
- caches quality metadata on documents in `properties`
- surfaces actionable findings through existing Ship accountability patterns
- drafts, but does not auto-publish, project-level quality reports
- leaves higher-risk UX ideas like inline `>>` prompts behind explicit gates

This plan assumes the attached presearch is the source of product intent and translates it into a repo-aware implementation sequence for the current `ship` monorepo.

## MVP Boundaries

### In scope

- Hybrid trigger model:
  - document-save-triggered scoring path
  - nightly full-project safety-net scan
- Graph traversal using existing `document_associations` plus `parent_id`
- Document scoring for:
  - project
  - sprint/week
  - issue
  - standup
- Persisting FleetGraph metadata into document `properties`
- Draft quality report generation with human confirmation before publish
- Alert surfacing through existing accountability/banner/sidebar patterns
- Director feedback suggestions as pre-filled options, still human-confirmed before send

### Explicitly out of scope for MVP

- Direct DB access from an external Railway worker
- Fully autonomous writes that publish reports or send feedback without confirmation
- Permanent inline editor mutations from AI output without user confirmation
- New role model beyond existing workspace membership role + document ownership
- A hard-coded time-based notion of staleness

## Repo Fit

Ship already has several useful primitives we should reuse:

- Unified document model in [`shared/src/types/document.ts`](/home/aaron/projects/gauntlet/ship/ship/shared/src/types/document.ts)
- Document CRUD and JSONB `properties` updates in [`api/src/routes/documents.ts`](/home/aaron/projects/gauntlet/ship/ship/api/src/routes/documents.ts)
- Graph edges in [`api/src/routes/associations.ts`](/home/aaron/projects/gauntlet/ship/ship/api/src/routes/associations.ts)
- Existing accountability detection/service patterns in [`api/src/services/accountability.ts`](/home/aaron/projects/gauntlet/ship/ship/api/src/services/accountability.ts)
- Existing AI advisory UX in [`web/src/components/sidebars/QualityAssistant.tsx`](/home/aaron/projects/gauntlet/ship/ship/web/src/components/sidebars/QualityAssistant.tsx)
- Existing TipTap text extraction helpers in [`api/src/utils/document-content.ts`](/home/aaron/projects/gauntlet/ship/ship/api/src/utils/document-content.ts)

The fastest path is to implement FleetGraph as a first-class subsystem inside the existing API and web apps, not as a separate service first. We can still shape it so the trigger runner is deployable as a distinct Railway process later.

## Architecture Decision

### Recommended MVP architecture

Use an in-repo FleetGraph module in `api/` with three entrypoints:

- webhook-style trigger endpoint for document save events
- scheduled scan runner for nightly scans
- on-demand analysis endpoint for document-scoped queries

Core logic should live in shared FleetGraph service modules rather than route handlers so all three entrypoints reuse the same graph fetch, scoring, caching, and action logic.

### Why this is the right first step

- It avoids introducing a second auth boundary immediately.
- Current Ship auth/session/API-token middleware already exists.
- The API process already owns document reads, writes, and permission checks.
- We can still deploy the same logic in a separate worker later if load requires it.

## Phase Plan

## Phase 0: Resolve Spikes Before Main Build

### Spike 1: Save trigger viability

Goal: confirm how FleetGraph should be invoked on document changes.

Tasks:

- Inspect current save lifecycle in collaboration and document update paths.
- Determine whether there is an existing durable hook after document content/properties persistence.
- Decide whether MVP trigger is:
  - internal post-save enqueue in API, or
  - explicit webhook endpoint invoked by Ship itself

Exit criteria:

- documented trigger source
- debounce strategy confirmed
- loop prevention strategy confirmed

### Spike 2: Best proactive findings surface

Goal: reuse existing Ship surfaces instead of inventing a whole new alert system.

Tasks:

- audit current accountability banners, sidebars, action-item views, and document properties panel
- choose one primary proactive findings surface for MVP
- define fallback display when a quality report draft exists but is unpublished

Exit criteria:

- one chosen surface for document-level alerts
- one chosen surface for draft report review/publish

### Spike 3: On-demand UX risk

Goal: reduce editor integration risk.

Decision for MVP:

- do not build the `>>` inline ephemeral block first
- ship a document-scoped sidebar assistant instead

Exit criteria:

- sidebar-based on-demand experience specified
- inline `>>` interaction deferred until editor integration is justified

### Spike 4: `quality_report` document type scope

Goal: measure the true blast radius of adding a new document type.

Tasks:

- trace all `document_type` enums and UI assumptions
- inventory migrations, API validation schemas, tabs, sidebars, filters, and shared types impacted
- decide whether MVP uses:
  - a real `quality_report` document type, or
  - a `wiki` document with FleetGraph-specific properties as a temporary report carrier

Recommendation:

- If `quality_report` type plumbing is more than a small change, use a temporary `wiki`-backed report document for MVP and promote to first-class type in phase 2.

## Phase 1: Data Contract and Domain Model

Add FleetGraph metadata contracts to shared types.

### Deliverables

- Extend [`shared/src/types/document.ts`](/home/aaron/projects/gauntlet/ship/ship/shared/src/types/document.ts) with FleetGraph property shapes, likely:
  - `quality_score`
  - `quality_status`
  - `quality_summary`
  - `quality_tags`
  - `last_scored_at`
  - `quality_report_id`
  - `quality_summary_hash`
  - `fleetgraph_version`
  - `quality_alerts_seen_at` or similar UI helper if needed
- Add FleetGraph result types:
  - per-document score
  - graph score result
  - remediation suggestion
  - director response option
  - draft quality report payload
- Decide whether to add a dedicated `quality_report` document type now or defer

### Notes

- Keep all FleetGraph state in `properties` for MVP, matching the presearch.
- Avoid schema changes unless we need indexes for scale after validation.

## Phase 2: Backend Scoring Engine

Implement a FleetGraph service package under `api/src/services/fleetgraph/`.

### Proposed module split

- `types.ts`
- `graph-fetch.ts`
- `graph-cache.ts`
- `graph-score.ts`
- `graph-actions.ts`
- `triggers.ts`
- `prompts.ts`
- `role-resolution.ts`
- `report-render.ts`

### Graph fetch responsibilities

- Start from a seed document or project.
- Walk both:
  - `parent_id` hierarchy
  - `document_associations`
- Gather project, sprint/week, issue, standup, and ownership context.
- Normalize all fetched documents into a compressed graph payload.
- Reuse cached summaries from `properties` when content hash is unchanged.

### Scoring responsibilities

- Strip TipTap JSON to plain text with existing extraction helpers.
- Build one reasoning payload per graph run, not one model call per document.
- Use OpenAI SDK with GPT-4o for FleetGraph, separate from the existing Bedrock-based quality assistant.
- Return structured JSON only:
  - per-document scores
  - status color
  - missing fields / relationship gaps
  - blocker propagation
  - ranked remediation suggestions
  - optional director response suggestions

### Action responsibilities

- Write FleetGraph metadata into `properties`.
- Apply alert tags to flagged documents.
- Create a draft report object.
- Publish only after explicit human confirmation.

### Important implementation rule

The scorer must be idempotent. A FleetGraph write should not immediately trigger another full FleetGraph run unless the underlying human-authored content changed.

## Phase 3: Trigger Model

### Document save trigger

Implement an internal trigger first.

Recommended approach:

- Hook from document update/create success paths in the API and collaboration persistence path.
- Send a lightweight FleetGraph enqueue request with:
  - workspace id
  - document id
  - event type
  - timestamp
- Debounce by reading existing FleetGraph metadata before scoring.

Debounce checks:

- if the content hash is unchanged, skip
- if the only change was FleetGraph-owned properties, skip
- if a run happened recently for the same hash, skip

### Nightly safety-net scan

Implement a cron-invocable runner inside `api/`.

Recommended entrypoints:

- a protected admin/system route to trigger nightly scans
- a CLI script under `api/src/scripts/`

Nightly scan duties:

- enumerate active projects in each workspace
- score graphs even when no save event occurred
- detect absence-based findings such as expected standup gaps or unresolved blockers

### Queueing choice

For MVP, avoid external queue infrastructure unless needed immediately.

Recommended sequence:

1. synchronous request validates and enqueues lightweight in-process work
2. if that proves too fragile, move to Postgres-backed jobs or Railway queue in phase 2

## Phase 4: API Surface

Add FleetGraph-specific endpoints under `api/src/routes/`.

### Endpoints

- `POST /api/fleetgraph/trigger`
  - internal/system use
  - kicks off a run for a document or project
- `POST /api/fleetgraph/nightly-scan`
  - admin/system use
  - executes nightly project scans
- `GET /api/fleetgraph/documents/:id`
  - returns FleetGraph metadata for a document
- `GET /api/fleetgraph/reports/:id`
  - returns a report draft/published report payload
- `POST /api/fleetgraph/reports/:id/publish`
  - human-confirmed publish action
- `POST /api/fleetgraph/reports/:id/director-feedback`
  - human-confirmed feedback send action
- `POST /api/fleetgraph/documents/:id/ask`
  - on-demand document-scoped assistant entrypoint for MVP sidebar

### Auth model

- user-driven endpoints use existing session auth
- automated endpoints use existing API token auth
- publish and feedback actions check role:
  - PM/owner for report publish
  - director/admin for feedback send

## Phase 5: Frontend Experience

### MVP UX

Add FleetGraph to existing document views without changing the editor interaction model yet.

### UI components

- document quality badge/banner
- findings panel in sidebar or properties panel
- report draft review screen/modal
- director feedback option selector
- document-scoped FleetGraph assistant sidebar

### Best-fit starting points

- adapt or extend [`web/src/components/AccountabilityBanner.tsx`](/home/aaron/projects/gauntlet/ship/ship/web/src/components/AccountabilityBanner.tsx)
- reuse sidebar composition patterns from [`web/src/components/sidebars/QualityAssistant.tsx`](/home/aaron/projects/gauntlet/ship/ship/web/src/components/sidebars/QualityAssistant.tsx)
- add FleetGraph fetch helpers in [`web/src/lib/api.ts`](/home/aaron/projects/gauntlet/ship/ship/web/src/lib/api.ts)

### UX rules

- Findings are advisory, not blocking.
- Publish is always explicit.
- Director feedback is always explicit.
- On-demand AI output starts ephemeral in the sidebar; no direct editor mutation in MVP.

## Phase 6: Report Publishing

### Preferred MVP path

Create a draft report record first, then publish on confirm.

Two implementation options:

1. Real `quality_report` document type
2. `wiki` document with FleetGraph report properties

Recommended MVP choice:

- choose option 2 unless spike 4 shows the dedicated type is low-risk

### Draft lifecycle

- score run generates report payload
- payload is stored in a draft state
- PM/owner reviews
- confirm publishes document into project graph
- related documents receive `quality_report_id` in `properties`

## Phase 7: Infra and Deployment

### Environment variables

- `OPENAI_API_KEY`
- `SHIP_API_TOKEN` only if we split runner out of the main API process
- any tracing vars already used by the team if desired

### Railway deployment model

Recommended MVP:

- keep FleetGraph in the existing API service
- add one Railway scheduled job or cron hit for nightly scans

Later:

- split to dedicated worker if load or isolation requires it

### Observability

- log each run with:
  - trigger source
  - workspace id
  - project/document id
  - cache hit ratio
  - tokens in/out
  - run duration
  - publish result
- add clear failure logs for:
  - fetch failures
  - model failures
  - invalid JSON responses
  - skipped runs due to debounce

## Phase 8: Testing Strategy

### Unit tests

Add tests for:

- content hash / debounce logic
- graph traversal logic
- role resolution
- missing-field detection
- blocker propagation
- report draft generation
- publish permission checks

### API tests

Add route tests for:

- trigger endpoint auth
- nightly scan auth
- document FleetGraph metadata reads
- publish confirmation path
- director feedback confirmation path
- on-demand assistant endpoint

### Frontend tests

Add tests for:

- quality badge/banner rendering
- findings panel states
- report publish confirmation flow
- director feedback option selection
- sidebar assistant loading/error/success states

### End-to-end tests

Minimum E2E coverage:

- update an issue lacking acceptance criteria and confirm alert surfacing
- run a nightly scan and confirm a draft report appears
- publish a draft report and confirm linked documents show report context

## Recommended Delivery Slices

Implement in this order so we get usable value early.

### Slice 1: Read-only FleetGraph metadata

- shared FleetGraph types
- backend graph fetcher
- scoring service stub with fixture outputs
- metadata persisted into document properties
- basic document banner in UI

Success looks like:

- a document can show FleetGraph score/status/tags without any publishing flow

### Slice 2: Real scoring and nightly scans

- GPT-4o integration
- content hash cache
- nightly scan runner
- issue/sprint/project/standup scoring

Success looks like:

- active projects get updated FleetGraph metadata nightly with no manual step

### Slice 3: Draft report workflow

- draft report creation
- review UI
- publish confirmation path
- `quality_report_id` linking

Success looks like:

- PM can review and publish a draft report safely

### Slice 4: Director feedback workflow

- pre-filled response suggestions
- confirm-before-send flow
- alert surfacing on target documents

Success looks like:

- directors can respond to quality findings without freeform rework every time

### Slice 5: On-demand assistant sidebar

- document-scoped ask endpoint
- sidebar UI
- ephemeral response rendering

Success looks like:

- a user can ask for context-aware help from the current document without editing the doc automatically

## Concrete File-Level Starting Points

### Backend

- Add shared types in [`shared/src/types/document.ts`](/home/aaron/projects/gauntlet/ship/ship/shared/src/types/document.ts)
- Register new routes in [`api/src/app.ts`](/home/aaron/projects/gauntlet/ship/ship/api/src/app.ts)
- Create FleetGraph routes in `api/src/routes/fleetgraph.ts`
- Create FleetGraph services under `api/src/services/fleetgraph/`
- Reuse text extraction from [`api/src/utils/document-content.ts`](/home/aaron/projects/gauntlet/ship/ship/api/src/utils/document-content.ts)
- Hook save triggers from document persistence paths in [`api/src/routes/documents.ts`](/home/aaron/projects/gauntlet/ship/ship/api/src/routes/documents.ts) and collaboration persistence flow

### Frontend

- Add FleetGraph client helpers in [`web/src/lib/api.ts`](/home/aaron/projects/gauntlet/ship/ship/web/src/lib/api.ts)
- Add query hooks under `web/src/hooks/`
- Add UI components under `web/src/components/`
- Mount FleetGraph UI in [`web/src/pages/UnifiedDocumentPage.tsx`](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/UnifiedDocumentPage.tsx) and/or relevant sidebars

## Key Risks and Mitigations

### Risk: scoring loops from agent-written properties

Mitigation:

- store and compare content hash
- ignore FleetGraph-only property changes
- version FleetGraph metadata separately

### Risk: dedicated `quality_report` type is more invasive than expected

Mitigation:

- ship report payload on `wiki` first
- promote to first-class type later

### Risk: editor-inline `>>` prompt is expensive and fragile

Mitigation:

- use a sidebar assistant in MVP

### Risk: mixed AI stack increases operational complexity

Mitigation:

- isolate FleetGraph model client behind its own service boundary
- do not couple FleetGraph to the existing Bedrock quality assistant codepath

### Risk: nightly scans become expensive on large workspaces

Mitigation:

- cache summaries in `properties`
- score only changed documents deeply
- keep one model call per graph run

## Acceptance Criteria for MVP

- Saving a relevant document can trigger a FleetGraph run without causing loops.
- Nightly scan can score active projects and write document-level FleetGraph metadata.
- Document `properties` persist score, status, summary, tags, and last scored timestamp.
- Flagged documents show proactive findings in an existing Ship UI surface.
- A draft quality report can be reviewed and published only after human confirmation.
- Director feedback suggestions are generated, but sending them requires confirmation.
- On-demand FleetGraph assistance works in a document-scoped sidebar.

## Immediate Next Build Tasks

1. Resolve spike 1 and choose the actual save-trigger hook.
2. Resolve spike 4 and decide whether MVP uses a true `quality_report` type or a `wiki`-backed report.
3. Add shared FleetGraph property/result types.
4. Scaffold `api/src/services/fleetgraph/` and `api/src/routes/fleetgraph.ts`.
5. Implement read-only document FleetGraph metadata endpoint and UI badge first.
