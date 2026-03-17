# FleetGraph REST API Inventory

## Purpose

This document maps FleetGraph needs against Ship's current REST surface so we can keep FleetGraph REST-only and add Ship API support only where needed.

Status labels:

- `Available`: endpoint already exists and looks usable
- `Partial`: endpoint exists but does not fully cover FleetGraph needs
- `Missing`: no obvious endpoint found in the current repo

## What FleetGraph Needs

FleetGraph needs to be able to:

- fetch a seed document and its metadata
- walk graph edges
- expand to project/sprint/issue/standup context
- identify actor role and document owner
- read and later write FleetGraph metadata in document `properties`
- create/publish quality reports
- support a nightly scan entrypoint

## Existing Ship REST Surface

## 1. Generic document access

### `GET /api/documents`

Status: `Available`

Use for:

- listing documents by type
- broad document discovery

Known limits:

- query support appears limited to `type` and `parent_id`
- no obvious owner-based filtering

### `GET /api/documents/:id`

Status: `Available`

Use for:

- seed document fetch
- document `properties`
- owner-related fields already flattened for some document types
- `belongs_to` associations on some document types

### `GET /api/documents/:id/content`

Status: `Available`

Use for:

- retrieving TipTap JSON for document summarization

### `PATCH /api/documents/:id`

Status: `Available`

Use for:

- updating document `properties`
- later writing FleetGraph metadata, if we choose to use the generic document update surface

Risk:

- too broad for a service actor if we want tighter write boundaries

### `PATCH /api/documents/:id/content`

Status: `Available`

Use for:

- not needed for FleetGraph MVP writes

## 2. Graph traversal endpoints

### `GET /api/documents/:id/associations`

Status: `Available`

Use for:

- forward graph edges from a document

### `GET /api/documents/:id/reverse-associations`

Status: `Available`

Use for:

- reverse graph traversal
- blocker or downstream impact analysis

### `GET /api/documents/:id/context`

Status: `Available`

Use for:

- ancestors, siblings, children, and some contextual graph expansion

Assessment:

- probably helpful for the first fetch node, though FleetGraph may still prefer explicit edge walking for determinism

## 3. Project-level endpoints

### `GET /api/projects`

Status: `Partial`

Use for:

- project discovery

Known question:

- not yet confirmed whether it can filter to active projects in the exact way nightly scans need

### `GET /api/projects/:id`

Status: `Available`

Use for:

- project metadata
- owner and project properties

### `GET /api/projects/:id/issues`

Status: `Available`

Use for:

- project issue inventory

### `GET /api/projects/:id/weeks`

Status: `Available`

Use for:

- week/sprint expansion under a project

### `GET /api/projects/:id/sprints`

Status: `Available`

Use for:

- sprint listing if FleetGraph treats project timeboxes as sprints

## 4. Week/sprint endpoints

### `GET /api/weeks/:id`

Status: `Available`

Use for:

- week metadata

### `GET /api/weeks/:id/issues`

Status: `Available`

Use for:

- issue set for a specific sprint/week

### `GET /api/weeks/:id/standups`

Status: `Available`

Use for:

- standup activity in sprint context

### `GET /api/weeks/:id/review`

Status: `Available`

Use for:

- review state and approval context

### `GET /api/weeks`

Status: `Partial`

Use for:

- broader sprint discovery

Known question:

- not yet confirmed whether it supports active-only filters suitable for nightly scan enumeration

## 5. Issue endpoints

### `GET /api/issues`

Status: `Partial`

Use for:

- broad issue listing

Known question:

- may be enough for secondary fetches, but project/week-scoped issue endpoints are more useful

### `GET /api/issues/:id`

Status: `Available`

Use for:

- detailed issue reads when a project-level listing is not enough

## 6. Standup endpoints

### `GET /api/standups`

Status: `Partial`

Use for:

- broad standup access

Likely better option:

- use `GET /api/weeks/:id/standups` when operating in sprint scope

### `GET /api/standups/status`

Status: `Available`

Use for:

- targeted standup completion state

Assessment:

- useful for UI, but nightly FleetGraph likely still needs raw standup documents and relationships

## 7. Accountability and role-related endpoints

### `GET /api/accountability/action-items`

Status: `Available`

Use for:

- surfacing existing accountability items

Assessment:

- good for UI integration
- not enough alone for FleetGraph graph reasoning

### Workspace membership and role context

Status: `Partial`

What exists:

- workspace/member endpoints in `/api/workspaces/:id/members`
- user session endpoints in `/api/auth/me`

Gap:

- no obvious FleetGraph-friendly endpoint that returns:
  - current workspace membership role
  - document owner role
  - director/PM/engineer interpretation

## 8. AI endpoints

### `GET /api/ai/status`

Status: `Available`

Use for:

- current advisory AI availability check

### `POST /api/ai/analyze-plan`
### `POST /api/ai/analyze-retro`

Status: `Available`

Assessment:

- these are specific to weekly plan/retro quality
- FleetGraph should not depend on them directly

## Gaps Ship Likely Needs For FleetGraph

## High-confidence missing or weak areas

### 1. Active project enumeration for nightly scans

Need:

- a clear endpoint to list only active projects for a workspace

Candidate:

- extend `GET /api/projects` with stable filters

### 2. Owner-scoped document listing

Need:

- documents owned by a person/user across types, for thin-document checks

Candidate:

- extend `GET /api/documents`
- or add a purpose-built owner document query endpoint

### 3. Role resolution endpoint

Need:

- one endpoint that resolves:
  - workspace membership role
  - document ownership
  - FleetGraph role mapping

### 4. FleetGraph metadata write boundary

Need:

- a narrow write endpoint for FleetGraph metadata updates, if we do not want to use generic document patch

Candidate:

- `PATCH /api/documents/:id/properties/fleetgraph`

### 5. Quality report draft/publish workflow

Need:

- create draft
- fetch draft
- publish with confirmation

Current status:

- no obvious existing endpoint for this exact workflow

### 6. Out-of-process trigger ingress

Need:

- if FleetGraph runs separately from Ship, it needs a trigger endpoint Ship can call after document saves

Candidate:

- `POST /api/fleetgraph/triggers`

## Recommended Minimum Ship API Additions

If we want to stay very close to the current API while enabling FleetGraph, I’d recommend only these initial additions:

1. `GET /api/projects?status=active`
2. `GET /api/documents?owner_id=:id` or equivalent owner-scoped listing
3. `GET /api/fleetgraph/context/:documentId`
   Returns a normalized seed payload so FleetGraph does less fan-out itself.
4. `PATCH /api/documents/:id/properties/fleetgraph`
   Narrow metadata write surface.
5. `POST /api/fleetgraph/triggers`
   Only needed if FleetGraph runs out-of-process.

## Suggested Next Step

Before writing code, decide whether FleetGraph should:

- call many existing Ship endpoints directly, or
- rely on one or two new aggregation endpoints that return a normalized graph seed

The tradeoff is simple:

- direct endpoint composition keeps Ship API thinner
- aggregation endpoints keep FleetGraph simpler and cheaper to operate
