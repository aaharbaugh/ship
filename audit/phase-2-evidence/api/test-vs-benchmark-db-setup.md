# Local DB Split For Tests And Benchmarks

Date: 2026-03-11
Branch: implementation

## Goal

Keep API tests from truncating the same local database that is being used for seeded performance and query benchmarks.

## Tracked Files

- `api/.env.local`
  - normal dev / benchmark database
- `api/.env.test.local`
  - Vitest-only database

## Recommended Local Setup

### 1. Keep the seeded benchmark database in `api/.env.local`

Example:

```bash
DATABASE_URL=postgresql://ship:ship_dev_password@localhost:5433/ship_dev
```

### 2. Create a separate test database once

```bash
psql postgresql://ship:ship_dev_password@localhost:5433/postgres -c "CREATE DATABASE ship_test;"
```

If `psql` is not installed in WSL, you can do the same through Docker or another Postgres client.

### 3. Create `api/.env.test.local`

```bash
cp api/.env.test.local.example api/.env.test.local
```

That file should point Vitest at the disposable test database:

```bash
TEST_DATABASE_URL=postgresql://ship:ship_dev_password@localhost:5433/ship_test
```

## How It Works

- when the API runs normally, it uses `DATABASE_URL`
- when the API runs under Vitest/test runtime, it prefers `TEST_DATABASE_URL`
- this keeps benchmark data stable while tests continue truncating their own database

## Practical Workflow

Seed the benchmark/dev DB:

```bash
pnpm --filter @ship/api db:seed
```

Run API tests against the isolated test DB:

```bash
pnpm --filter @ship/api test
```

Run benchmarks against the seeded benchmark/dev DB without test interference:

```bash
PORT=3002 CORS_ORIGIN=http://localhost:5173 SESSION_SECRET=audit-secret E2E_TEST=1 pnpm --filter @ship/api dev
```

## Why This Matters

The earlier Phase 2 measurement work was getting invalidated because API route tests truncate the shared local database in `src/test/setup.ts`. This split makes the benchmark and profiler evidence reproducible.
