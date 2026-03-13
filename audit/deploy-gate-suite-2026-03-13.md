# Deploy Gate Suite - 2026-03-13

## Goal

Define a small E2E suite that is credible enough to gate a deployment without inheriting the noise of the full Playwright run.

## Command

From the repo root:

```bash
pnpm run test:e2e:smoke
```

On this machine, Docker group access is required for Playwright/Testcontainers, so the practical invocation is:

```bash
sg docker -c "cd /home/aaron/projects/gauntlet/ship/ship && pnpm run test:e2e:smoke"
```

## Included Coverage

The deploy gate currently lives in:

- [e2e/deploy-gate.smoke.spec.ts](/home/aaron/projects/gauntlet/ship/ship/e2e/deploy-gate.smoke.spec.ts)

It intentionally covers only high-signal user-facing behavior:

1. Authentication shell load
2. Document creation and reopen flow
3. Issue creation and issue-detail controls
4. Program detail route opens from seeded list
5. Project detail route opens from seeded list
6. Private document access isolation
7. Accountability banner rendering and modal open
8. Basic real-time collaboration sync across two pages

## Why These Tests Are In

- They validate the main user entrypoints that would block a useful deployment.
- They exercise both API and UI paths.
- They avoid broad seed assumptions where practical by creating their own data.
- They are narrow enough to debug quickly when one fails.

## Why Other E2E Areas Are Not In

These areas are still important, but they should not block deploy until they are stabilized:

- large accessibility remediation coverage outside the stabilized slice
- admin detail and invite workflows
- request-changes flow
- manager reviews
- issue estimates
- full weekly/accountability inference matrix

Those areas are currently better treated as:

- full regression coverage
- targeted bug-fix follow-up
- move-to-integration candidates

## Deploy Gate Standard

For a release candidate, the intended confidence set is:

```bash
sg docker -c "cd /home/aaron/projects/gauntlet/ship/ship && pnpm run test:api"
pnpm run test:web
sg docker -c "cd /home/aaron/projects/gauntlet/ship/ship && pnpm run test:e2e:smoke"
```

This is not the full product quality bar. It is the minimum credible release bar while the larger E2E suite is being redesigned.
