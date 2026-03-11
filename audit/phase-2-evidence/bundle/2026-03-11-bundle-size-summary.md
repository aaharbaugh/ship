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
| Total production bundle size | `2,104.98 KB` |
| JavaScript bundle size | `2,040.70 KB` |
| CSS bundle size | `64.28 KB` |
| Largest chunk | `354.68 KB` |
| Largest chunk file | `index-CbVK_HhT.js` |

## Delta

| Metric | Change |
|---|---:|
| Total production bundle size | `-157.67 KB` (`-6.97%`) |
| JavaScript bundle size | `-157.00 KB` (`-7.14%`) |
| CSS bundle size | `-0.67 KB` (`-1.03%`) |
| Largest chunk | `-1,670.42 KB` (`-82.49%`) |

## Key Current Chunks

Largest emitted chunks in the current build:

| Chunk | Size |
|---|---:|
| `index-CbVK_HhT.js` | `354.68 KB` |
| `index-wgfuOQOS.js` | `293.95 KB` |
| `emoji-picker-react.esm-CZLFrkCt.js` | `271.11 KB` |
| `Editor-BKWov3M2.js` | `246.04 KB` |
| `UnifiedDocumentPage-Ddd-Li7v.js` | `135.25 KB` |
| `App-lX65Djfn.js` | `88.45 KB` |

## Interpretation

- The old `2,025.10 KB` main entry chunk is gone.
- The strongest measurable win is chunk architecture, not total byte reduction.
- Total bundle size did not meet the assignment's `15%` total-size reduction target.
- The evidence does support the code-splitting path of the assignment because the initial app load is no longer dominated by a single `~2 MB` main chunk.

## Root Cause and Fixes Reflected Here

This build reflects the Category 2 refactors already completed:

- lazy-loaded route pages
- lazy-loaded editor entry points
- deferred editor collaboration providers
- lazy-loaded emoji picker
- removed the syntax-highlighting payload
- cleaned mixed static/dynamic imports in slash commands

## Follow-up

- If we need to make the total-size case instead of the initial-load case, we need one more pass on the remaining large shared chunks and icon/runtime weight.
