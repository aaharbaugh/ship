# Codebase Orientation

Working reference for auditing the Ship codebase. This is organized around the orientation checklist and keeps the focus on how the system actually works.

## Phase 1: First Contact

### 1. Repository Overview

- Monorepo with three main packages:
  - `web/`: React + Vite frontend
  - `api/`: Express API + WebSocket collaboration server
  - `shared/`: shared TypeScript types and constants
- The repo already existed locally for this review. I did not re-verify a full dev boot from scratch in this cleanup pass.
- Expected local dev flow from scripts/docs:
  - install deps with `pnpm install`
  - start Postgres locally
  - run migrations
  - start app with `pnpm dev`

#### Docs folder summary

The docs mostly push the same few ideas:

- keep the stack simple and well-understood
- use one codebase, not separate frontend/backend repos
- treat almost everything as a document
- organize work around programs, projects, weeks, and issues
- use AWS-native infrastructure and script-driven deploys

Important caveat: some docs are clearly historical or aspirational. The broad direction is useful, but the code is the final source of truth.

#### Shared package summary

The `shared/` package exports common types and constants used on both sides:

- `document.ts`: document model, document variants, issue/project/program/week properties, relationship types
- `workspace.ts`: workspace, membership, invites, audit log, roles
- `user.ts`: user identity types
- `auth.ts`, `api.ts`: shared API/auth shapes
- `constants.ts`: HTTP status codes, error codes, session timeout constants

This package is the common vocabulary layer. It keeps frontend and backend aligned on the meaning of things like `document_type`, `belongs_to`, and session timeout behavior.

#### Package relationship

```text
web/  -->  shared/  <--  api/

web/:
- renders UI
- calls REST API
- opens WebSocket connections for collaboration

api/:
- serves REST endpoints
- validates auth/session state
- persists to PostgreSQL
- hosts WebSocket/Yjs collaboration

shared/:
- shared types
- shared constants
- shared business language
```

### 2. Data Model

The schema falls into three buckets:

- auth/workspace tables: `users`, `workspaces`, `workspace_memberships`, `sessions`, `api_tokens`, `workspace_invites`, `audit_logs`
- core document tables: `documents`, `document_associations`, `document_history`, `document_snapshots`, `document_links`
- support tables: `comments`, `files`, `sprint_iterations`, `issue_iterations`

#### Unified document model

The center of the app is the `documents` table. Wiki pages, issues, programs, projects, weeks, people, weekly plans, weekly retros, standups, and reviews are all rows in that table.

What changes by type:

- `document_type` decides what kind of thing it is
- `properties` stores type-specific fields in JSONB
- `content` stores readable TipTap JSON
- `yjs_state` stores collaborative editor state

#### `document_type` discriminator

`document_type` is the main switch that tells the app how to behave. It is used to:

- filter queries
- choose UI sidebars and tabs
- decide which properties are expected
- route business logic in API handlers

Examples include `wiki`, `issue`, `program`, `project`, `sprint`, `person`, `weekly_plan`, `weekly_retro`, `standup`, and `weekly_review`.

#### Relationships

There are two relationship patterns:

- `parent_id`: simple hierarchy for containment, mostly tree-like nesting
- `document_associations`: flexible document-to-document links with `relationship_type`

Common association types:

- `program`
- `project`
- `sprint`
- `parent`

In plain English:

- `parent_id` means "this lives under that"
- `document_associations` means "this belongs to that"

### 3. Request Flow

#### Example: create issue

One concrete flow:

1. `web/src/pages/App.tsx` calls `handleCreateIssue`
2. that calls `createIssue()` from `useIssues()`
3. `web/src/hooks/useIssuesQuery.ts` posts to `/api/issues`
4. shared fetch helpers send cookies/headers and JSON
5. `api/src/app.ts` routes the request through middleware
6. `api/src/routes/issues.ts` validates the body with Zod
7. the API inserts a new `documents` row with `document_type = 'issue'`
8. it creates any needed associations in `document_associations`
9. the frontend does optimistic update, swaps in the real response, and invalidates list queries

#### Middleware chain

The practical order in `api/src/app.ts` is:

- `helmet`
- API rate limiting on `/api/*`
- `cors`
- `express.json`
- `express.urlencoded`
- `cookieParser`
- `express-session`
- route-level `conditionalCsrf`
- `authMiddleware` on protected routes
- route handler

#### Authentication

Authentication supports two paths:

- Bearer token via `api_tokens`
- session cookie via `sessions`

If there is no valid token, the app falls back to the session cookie. The middleware checks:

- session exists
- session is not idle-expired
- session is not past the absolute timeout
- user still belongs to the workspace

Unauthenticated requests fail before business logic. Typical outcomes:

- `401` no session / invalid session / expired session
- `403` membership revoked or no access

## Phase 2: Deep Dive

### 4. Real-time Collaboration

The API server hosts the WebSocket upgrade path in the same process as REST.

#### Connection flow

- browser connects to `/collaboration/:room` or `/events`
- server validates the session cookie before accepting
- server checks document visibility and workspace access
- if allowed, it joins the client to the Yjs room for that document

#### How Yjs sync works

- each document room gets a Yjs doc in memory
- clients exchange Yjs sync and awareness messages over WebSocket
- awareness handles presence/cursor state
- Yjs CRDT rules merge concurrent edits instead of overwriting one another

If two users type at the same time, Yjs merges both change streams. That is the main reason collaboration works without classic "last save wins" conflicts.

#### Persistence

The server debounces saves and writes back to `documents`:

- `yjs_state`: binary collaboration state
- `content`: JSON backup for normal API reads
- `properties`: extracted plan/criteria/vision/goals where relevant

Main file: `api/src/collaboration/index.ts`

### 5. TypeScript Patterns

- TypeScript version: `5.7.2`
- Root `tsconfig.json` uses:
  - `strict: true`
  - `noUncheckedIndexedAccess: true`
  - `noImplicitReturns: true`
  - `noFallthroughCasesInSwitch: true`
  - `module` / `moduleResolution`: `NodeNext`

#### Shared typing pattern

The core pattern is: define shared business types once in `shared/`, then use them in both the API and UI.

#### Examples

- Generics:
  - `shared/src/types/api.ts` -> `ApiResponse<T>`
  - `web/src/hooks/useSelection.ts` -> generic selection hook
  - `api/src/openapi/schemas/common.ts` -> generic paginated schema builder
- Discriminated unions:
  - `shared/src/types/document.ts` typed document variants keyed by `document_type`
- Utility types:
  - `Partial<>` is used heavily for update payloads across hooks and sidebars
  - `Pick<>` / `Omit<>` are not prominent in the current codebase
- Type guards:
  - `web/src/hooks/useIssuesQuery.ts` -> `isCascadeWarningError`
  - `web/src/lib/accountability.ts`
  - `api/src/routes/associations.ts` -> relationship type guard
  - `api/src/mcp/server.ts` -> reference object guard

No especially exotic TypeScript patterns stood out. The code is mostly straightforward, strict, and practical.

### 6. Testing Infrastructure

There are three main test layers:

- API tests with Vitest in `api/src/**/*.test.ts`
- frontend tests with Vitest in `web/src/**/*.test.ts(x)`
- browser E2E tests with Playwright in `e2e/*.spec.ts`

#### Playwright structure

- main config: `playwright.config.ts`
- most specs import `e2e/fixtures/isolated-env.ts`
- helper utilities live in `e2e/fixtures/test-helpers.ts`

The isolated fixture gives each Playwright worker:

- its own PostgreSQL test container
- its own API process
- its own Vite preview server

#### Test database setup/teardown

For Playwright:

- start a fresh Postgres container
- load `schema.sql`
- mark migrations as applied
- seed realistic baseline data
- stop and discard the container when the worker finishes

For API Vitest:

- `api/src/test/setup.ts` truncates tables before test files run

#### Test run results from this pass

- API: passed
  - `451` tests in `28` files
  - about `31.2s`
- Web: failed
  - `138` passed, `13` failed
  - failures centered in `document-tabs`, `DetailsExtension`, and `useSessionTimeout`
  - about `4.6s`
- Playwright: failed before test execution
  - global setup hit a Windows-incompatible `cp` command during API build
  - about `9.6s`

### 7. Build and Deploy

#### Dockerfile

The Docker build produces a production API container, not a full frontend+backend bundle.

It:

- installs production dependencies only
- copies prebuilt `shared/dist` and `api/dist`
- exposes port `80`
- runs DB migrations on startup
- starts the API server

In plain English: the container expects the code to already be built before packaging.

#### docker-compose.yml

`docker-compose.yml` is only for optional local Postgres. It starts:

- one `postgres` service

It does not start the frontend or API app.

#### Terraform / cloud expectations

The app expects AWS infrastructure roughly like this:

- S3 + CloudFront for the frontend
- Elastic Beanstalk for the API container
- Application Load Balancer in front of EB
- Aurora PostgreSQL Serverless v2 for the database
- VPC with public and private subnets
- security groups
- SSM Parameter Store for runtime config
- Secrets Manager for OAuth credentials
- WAF and CloudWatch logging around the edge/infrastructure

#### CI/CD

I did not find a repo-level `.github/workflows` pipeline.

What does exist:

- `scripts/deploy.sh`
- `scripts/deploy-api.sh`
- `scripts/deploy-frontend.sh`
- `scripts/deploy-infrastructure.sh`

So the current release story appears to be script-driven and manual/semi-manual, with Terraform + AWS CLI as the control plane.

## Phase 3: Synthesis

### 8. Architecture Assessment

#### 3 strongest decisions

1. Unified document model
   - one core entity powers docs, issues, projects, weeks, and more
   - this keeps the product model coherent and extensible

2. Monorepo with shared types
   - frontend and backend share the same business language
   - this reduces drift and makes refactors safer

3. Boring backend stack
   - Express + raw SQL + a small number of abstractions
   - easier to trace and maintain than a heavily abstracted system

#### 3 weakest points

1. Collaboration state lives in memory on the API node
   - simple, but risky for scale and multi-instance coordination

2. Deployment tooling is brittle
   - shell-heavy, environment-sensitive, and currently not fully cross-platform

3. Flexible data model shifts complexity into app logic
   - JSONB properties and generic associations are powerful, but they make validation, querying, and long-term reporting harder

#### Where to improve first

- harden collaboration for horizontal scaling
- standardize build/deploy so one path works on every machine
- tighten document-model conventions, validation, and query helpers

#### What I would tell a new engineer first

- learn the document model first; everything else is layered on top of it
- treat the server as the source of truth, even though the editor uses Yjs locally
- understand the three package boundaries: `web`, `api`, `shared`
- remember that programs, projects, weeks, and issues are different views of one document graph, not separate systems

#### What breaks first at 10x users

The collaboration layer breaks first, or becomes painful first.

Why:

- hot Yjs state is stored in memory on app instances
- WebSocket traffic grows fast
- persistence and reconnect behavior get more complex under load
- multi-instance coordination becomes a real problem

After that, the next pain point is likely query and reporting complexity around the flexible document model.
