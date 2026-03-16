# Bundle Evidence Summary

Date: 2026-03-11
Branch: implementation

## Command Run

```bash
pnpm --filter @ship/web build
```

## Baseline

Source: `audit/cat-2-frontend-bundle-size.md`

| Metric | Baseline |
|---|---:|
| Total production bundle size | `2,262.65 KB` |
| JavaScript bundle size | `2,197.70 KB` |
| CSS bundle size | `64.95 KB` |
| Largest chunk | `2,025.10 KB` |
| Largest chunk file | `index-C2vAyoQ1.js` |

## After

Measured from `web/dist/assets` after the current build:

| Metric | After |
|---|---:|
| Total production bundle size | `1,845.30 KB` |
| JavaScript bundle size | `1,780.65 KB` |
| CSS bundle size | `64.65 KB` |
| Largest chunk | `346.37 KB` |
| Largest chunk file | `index-Dmk9i3v8.js` |

## Delta

| Metric | Change |
|---|---:|
| Total production bundle size | `-417.35 KB` (`-18.44%`) |
| JavaScript bundle size | `-417.05 KB` (`-18.98%`) |
| CSS bundle size | `-0.30 KB` (`-0.47%`) |
| Largest chunk | `-1,678.73 KB` (`-82.89%`) |

## Key Current Chunks

Largest emitted chunks in the current build:

| Chunk | Size |
|---|---:|
| `index-Dmk9i3v8.js` | `346.37 KB` |
| `index-Ci8aPhrM.js` | `287.19 KB` |
| `Editor-CtRZP0j-.js` | `240.92 KB` |
| `UnifiedDocumentPage-D5lwwyb7.js` | `134.92 KB` |
| `App-BojGjp0B.js` | `86.45 KB` |
| `index-CQ-YUq_e.js` | `72.77 KB` |

## Interpretation

- The old `2,025.10 KB` main entry chunk is gone.
- Total bundle size now also clears the assignment's `15%` total-size reduction target.
- The strongest measurable win is still chunk architecture, but the total-byte story is now also strong enough to stand on its own.
- The old standalone `emoji-picker-react` chunk is gone after replacing that sidebar flow with a native emoji grid.

## Root Cause and Fixes Reflected Here

This build reflects the Category 2 refactors already completed:

- lazy-loaded route pages
- lazy-loaded editor entry points
- deferred editor collaboration providers
- removed the third-party emoji picker package in favor of a native emoji grid
- removed the syntax-highlighting payload
- cleaned mixed static/dynamic imports in slash commands

## Follow-up

- Remaining optimization work is now a second-wave pass on the large shared chunks and icon/runtime weight, not a threshold-rescue exercise.
