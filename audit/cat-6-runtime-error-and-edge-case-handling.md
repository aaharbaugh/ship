# Category 6: Runtime Error and Edge Case Handling

Measurement date: March 10, 2026
Rerun update: March 10, 2026

## Overview
- Normal usage looks stable, but failure handling becomes noisy and inconsistent when the app is pushed into offline, collaboration, and media-upload edge cases.
- The main business risk is user confusion rather than immediate hard crashes: the UI often stays alive while errors pile up underneath it.
- Bottom line: happy-path reliability is acceptable, but edge-case recovery is not yet robust enough for high-confidence production use.

## Executive Summary
- Baseline happy-path runtime behavior is acceptable: the focused rerun kept document-load and non-fault-injected error-handling flows clean, with `0` observed browser console errors during normal navigation and document open.
- Runtime resilience drops sharply in collaboration, image-upload, and offline scenarios, where the app emits repeated WebSocket and fetch errors while keeping the editor superficially usable.
- Server-side unhandled promise rejections were `0` observed in the focused runtime run, but the API process does not register a global `unhandledRejection` handler, so that signal is currently weak.
- Error handling is present but inconsistent: Ship has a shared React error boundary, yet many failure paths still resolve to `console.error`, `alert()`, silent retry, or stale UI rather than a coherent recovery state.
- The rerun confirmed the split behind the audit discrepancy: `0` is defensible for happy-path console noise, but edge-case collaboration and image flows can generate repeated console failures within a single session.
- This rerun is strongest on collaboration/offline/image runtime behavior; malformed-input and named 3G-throttle checklist items remain less directly evidenced in this specific pass.

## Measurement Method
Tools and commands used:

```bash
rg -n "unhandledRejection|onunhandledrejection|ErrorBoundary|alert\\(|console\\.(error|warn)|offline|online|WebSocket|reconnect|retry|escapeHtml|dangerouslySetInnerHTML|safeParse|z\\.object|zod" web api e2e
sed -n '1,220p' web/src/components/ui/ErrorBoundary.tsx
sed -n '520,570p' web/src/pages/App.tsx
sed -n '960,1010p' web/src/components/Editor.tsx
sed -n '1,240p' e2e/error-handling.spec.ts
sed -n '1,220p' e2e/content-caching.spec.ts
sed -n '1,260p' e2e/images.spec.ts
sed -n '1,260p' e2e/race-conditions.spec.ts
sed -n '1,220p' api/src/index.ts
sg docker -c "env PLAYWRIGHT_WORKERS=1 pnpm test:e2e e2e/error-handling.spec.ts e2e/content-caching.spec.ts e2e/images.spec.ts e2e/race-conditions.spec.ts --reporter=line"
sg docker -c "env PLAYWRIGHT_WORKERS=1 pnpm test:e2e e2e/error-handling.spec.ts e2e/content-caching.spec.ts e2e/images.spec.ts e2e/race-conditions.spec.ts --reporter=json"
```

Methodology:
- Used source inspection first to identify runtime safety mechanisms: React error boundaries, async retry paths, offline handling, WebSocket reconnect logic, input validation, and any global unhandled-rejection hooks.
- Used existing Playwright coverage to avoid inventing new audit-only product scripts. Focused on the tests that already exercise error handling, offline behavior, collaboration recovery, caching, image upload, and concurrent editing.
- Treated `e2e/content-caching.spec.ts` and the happy-path portions of `e2e/error-handling.spec.ts` as the “normal usage” baseline for console-noise measurement.
- Treated image upload, offline editing, and concurrent editing scenarios as edge-case measurements.
- Reviewed API process startup to verify whether unhandled promise rejections are globally trapped.
- Re-ran the focused suite through `sg docker` because this repository's Playwright/Testcontainers harness could not access Docker directly from the default shell in this environment.

Notes:
- The focused runtime subset exposed both browser console noise and request failures during image/offline scenarios. Those were counted as runtime handling findings even when the editor remained interactive.
- The API process logs many route- and collaboration-level errors, but no global `process.on('unhandledRejection', ...)` hook was found in startup code.
- React error boundaries were found in [ErrorBoundary.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/components/ui/ErrorBoundary.tsx), applied at [App.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/App.tsx#L542) and around the editor content in [Editor.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/components/Editor.tsx#L980).
- In the rerun, the first twelve focused happy-path and controlled-failure checks progressed cleanly before the suite entered the noisy image path. The first hard failure remained the image file-picker path in [images.spec.ts](/home/aaron/projects/gauntlet/ship/ship/e2e/images.spec.ts), which timed out waiting for `filechooser`.
- The rerun also surfaced non-product shell noise from the harness itself: repeated Node warnings that `NO_COLOR` is ignored when `FORCE_COLOR` is set. Those should not be counted as browser application console errors.
- This report is strongest where the rerun exercised existing error/offline/collaboration specs directly. Malformed-input handling is supported mainly by route validation and source inspection in this pass rather than a fresh dedicated runtime matrix.

## Baseline

### Runtime Baseline
| Metric | Your Baseline |
|---|---|
| Console errors during normal usage | `0` observed in focused happy-path flows (`content-caching` document load and `error-handling` non-offline flows) |
| Unhandled promise rejections (server) | `0` observed |
| Network disconnect recovery | `Partial` |
| Missing error boundaries | Local boundaries missing for route/page-level async failure surfaces in `AdminWorkspaceDetail`, `WorkspaceSettings`, `Projects`, `TeamMode`, `ReviewsPage`, and most document-tab panels |
| Silent failures identified | `5` |

### Edge-Case Runtime Evidence
| Scenario | Baseline behavior | Evidence |
|---|---|---|
| Document load and WebSocket connect | Pass | `content-caching.spec.ts` passed the WebSocket connect and “no WebSocket console errors” checks |
| Network disconnect while editing | Partial | `error-handling.spec.ts` shows text entry survives disconnect/reconnect, but offline/image flows still produce repeated fetch and WebSocket console errors |
| Temporary API failure | Pass | `error-handling.spec.ts` keeps the page responsive through injected `500` responses |
| CSRF expiration | Partial | Editor remains usable in the test, but errors are not surfaced as a clear user-facing recovery state |
| Image upload and offline editing | Fail / noisy partial recovery | The rerun again produced repeated file-chooser timeouts, WebSocket `429` handshake failures, `[RealtimeEvents] Error: Event`, request aborts, and offline console errors in `images.spec.ts` |
| Concurrent editing / rapid operations | Partial / flaky | Existing E2E suite passes many race-condition cases, but the fresh rerun also reproduced a flake in `race-conditions.spec.ts` (`rapid document creation does not cause duplicates`) where the editor never became visible on one of the created URLs |

## Hotspots
| Location | Why it is a hotspot |
|---|---|
| [Editor.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/components/Editor.tsx) | Central collaboration path; contains offline status, IndexedDB cache handling, WebSocket lifecycle handling, `alert()` recovery paths, and upload error logging |
| [useRealtimeEvents.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/hooks/useRealtimeEvents.tsx) | Reconnects on WebSocket failure but currently resolves parse/socket errors to console output rather than structured UI feedback |
| [useAutoSave.ts](/home/aaron/projects/gauntlet/ship/ship/web/src/hooks/useAutoSave.ts) | Retries silently and only logs after exhaustion, making save-failure visibility weak |
| [images.spec.ts](/home/aaron/projects/gauntlet/ship/ship/e2e/images.spec.ts) | Concentrates the clearest runtime degradation: file chooser instability, offline upload behavior, and console-noisy collaboration failures |
| [api/src/collaboration/index.ts](/home/aaron/projects/gauntlet/ship/ship/api/src/collaboration/index.ts) | Collaboration backend handles many failure modes, but several paths log and continue, leaving frontend recovery behavior to implicit reconnect logic |

## Findings

### High
- Collaboration and image-upload paths degrade noisily instead of failing cleanly.
  Why it matters: these are core editing workflows, and repeated WebSocket `429` handshake failures plus fetch errors create a state where the editor appears alive while synchronization is compromised.
  Evidence: the original run and rerun both logged repeated `WebSocket ... Unexpected response code: 429`, `[RealtimeEvents] Error: Event`, request aborts, `Error fetching backlinks: TypeError: Failed to fetch`, and offline fetch failures during [images.spec.ts](/home/aaron/projects/gauntlet/ship/ship/e2e/images.spec.ts).

- The image slash-command upload path is still a concrete runtime blocker.
  Why it matters: this is not just noisy logging; the rerun reproduced a user-facing failure in a core editor workflow.
  Evidence: [images.spec.ts](/home/aaron/projects/gauntlet/ship/ship/e2e/images.spec.ts) contains a standing `FIXME` for the file chooser path, and the rerun timed out at `page.waitForEvent('filechooser')` while the editor otherwise remained loaded.

- Runtime failures are often console-only or alert-based rather than modeled as durable UI states.
  Why it matters: users can continue interacting without understanding whether data is safe, queued, rejected, or stale.
  Evidence: [Editor.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/components/Editor.tsx) uses `alert()` for revoked/conversion cases; [useAutoSave.ts](/home/aaron/projects/gauntlet/ship/ship/web/src/hooks/useAutoSave.ts) retries silently; multiple pages only log fetch failures.

- There is no global server-side unhandled-rejection trap.
  Why it matters: if an async path escapes route-local `try/catch`, the audit currently has no reliable centralized signal for background promise failures.
  Evidence: [api/src/index.ts](/home/aaron/projects/gauntlet/ship/ship/api/src/index.ts) only wraps `main().catch(...)`; no `process.on('unhandledRejection', ...)` or equivalent startup hook was found.

### Medium
- Error boundaries exist, but they are broad and render-focused rather than targeted to high-risk surfaces.
  Why it matters: the app has some protection against render crashes, but most async/editor/network failures bypass those boundaries entirely.
  Evidence: the shared boundary is used at [App.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/App.tsx#L542) and inside [Editor.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/components/Editor.tsx#L980), while route-level async handlers in `Projects`, `TeamMode`, `ReviewsPage`, `AdminWorkspaceDetail`, and `WorkspaceSettings` rely on logging or alerts instead of localized recovery UI.

- Offline recovery is functional at the typing level but incomplete at the product level.
  Why it matters: preserving keystrokes is necessary, but not sufficient if related features like backlinks, embeds, comments, uploads, and sync status emit noisy failures or require manual retry.
  Evidence: [error-handling.spec.ts](/home/aaron/projects/gauntlet/ship/ship/e2e/error-handling.spec.ts) shows continued editing after disconnect, while [images.spec.ts](/home/aaron/projects/gauntlet/ship/ship/e2e/images.spec.ts) explicitly defers automatic retry when back online and the focused run showed repeated offline fetch/WebSocket errors.

- Edge-case reliability issues are already visible in the broader E2E baseline.
  Why it matters: runtime handling weaknesses are not isolated to synthetic audit tests; they align with existing failing and flaky product flows.
  Evidence: Category 5’s full E2E run failed on backlinks removal, simultaneous formatting, inline code/comment shortcuts, table deletion, and TOC rename updates, with additional flake in offline image upload, stale-data, and image persistence flows. The fresh focused rerun also reproduced flake in [race-conditions.spec.ts](/home/aaron/projects/gauntlet/ship/ship/e2e/race-conditions.spec.ts) for rapid document creation.

### Low
- Input validation and injection handling are stronger than the rest of the runtime story.
  Why it matters: malformed input risk appears more controlled than network/recovery risk.
  Evidence: route handlers across `api/src/routes/` use `zod` `safeParse`; search escaping and `escapeHtml` protections are present; no obvious `dangerouslySetInnerHTML` usage was found in the audit scan.

- Standard document navigation is not currently polluted by routine browser console errors.
  Why it matters: the base experience is cleaner than the stressed-edge experience, which helps prioritize remediation.
  Evidence: the rerun stayed clean through the `content-caching` flows and the first twelve focused `error-handling`/baseline checks before entering the noisy image path.

## Silent Failures Identified
| Reproduction | Silent or weakly surfaced behavior |
|---|---|
| Disconnect browser network while editing a document with backlinks and reconnect | Editing continues, but backlink fetch failures and WebSocket reconnect failures spill to console with no strong user-facing recovery message |
| Trigger autosave failure repeatedly | [useAutoSave.ts](/home/aaron/projects/gauntlet/ship/ship/web/src/hooks/useAutoSave.ts) retries silently and only logs after exhaustion |
| Cause realtime event parse/socket failure | [useRealtimeEvents.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/hooks/useRealtimeEvents.tsx) logs errors and reconnects, but no structured UI state is shown |
| Expire CSRF token during document editing | Editor remains interactive in test coverage, but the failure path is not surfaced as a clear action state for the user |
| Fail document conversion / file upload side effects | Several paths in [Editor.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/components/Editor.tsx) and file/upload components log errors or use `alert()` instead of durable inline error states |
| Trigger image upload via `/image` slash command in the rerun harness | The editor remains visible, but the upload path can stall at file-picker initiation while repeated WebSocket errors continue in the console |

## Suggested Direction
The next step is not “add more try/catch everywhere.” The higher-value move is to standardize runtime failure handling around a small set of explicit user-facing states for sync, upload, save, and collaboration health, then back that with centralized client/server error capture so edge-case failures stop disappearing into console logs and ad hoc alerts.

## 2026-03-14 Improvement Update

A focused remediation pass landed after the original runtime writeup to reduce the most visible alert-only and silent-failure paths.

Focused verification:

```bash
pnpm --filter @ship/web test FileAttachment.test.ts InviteAccept.test.tsx
pnpm --filter @ship/web type-check
```

Concrete runtime gaps improved:

- Editor collaboration recovery
  - revoked-access and converted-document fallbacks in `Editor.tsx` now use durable toasts instead of blocking `alert()` dialogs
- Upload failure visibility
  - image uploads now surface failure toasts through the editor upload callback
  - file attachments now surface blocked-type, oversize, and upload-failure states through the same callback model instead of `alert()`
- Autosave exhaustion visibility
  - `useAutoSave.ts` now supports an explicit `onError` callback, and the active title-save paths in `PersonEditor.tsx` and `UnifiedEditor.tsx` surface exhausted retry failures as user-visible toasts
- Admin/settings async recovery
  - key role-management failures in `AdminWorkspaceDetail.tsx` and `WorkspaceSettings.tsx` now use toasts instead of blocking alerts

Updated read:

- Category 6 is still the least polished evidence package in Phase 2, but the remaining weak spots are narrower now.
- The app has fewer console-only and alert-only failure paths in the highest-value user workflows than it did at the original audit baseline.

## Audit Deliverable
| Metric | Your Baseline |
|---|---|
| Console errors during normal usage | `0` |
| Unhandled promise rejections (server) | `0` observed |
| Network disconnect recovery | `Partial` |
| Missing error boundaries | `AdminWorkspaceDetail`, `WorkspaceSettings`, `Projects`, `TeamMode`, `ReviewsPage`, most document-tab panels |
| Silent failures identified | `5` with reproduction steps listed above |

Improvement target:
- Reduce console-only runtime failures in collaboration, upload, and offline flows by replacing them with explicit recovery states and observable centralized error capture.
