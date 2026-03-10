# Category 2: Frontend Bundle Size

Measurement date: March 10, 2026

## Executive Summary
- The frontend production build emits `2,262.65 KB` of static assets, including `2,197.70 KB` of JavaScript and `64.95 KB` of CSS.
- Bundle size risk is dominated by one main entry chunk: `index-C2vAyoQ1.js` at `2,025.10 KB` minified (`589.49 KB` gzip), which is disproportionately large relative to every other chunk.
- Code splitting exists, but it is only partially effective. Lazy-loaded document tabs are split out, while several editor-related dynamic imports are neutralized by overlapping static imports and remain in the main bundle.
- The heaviest dependency contributors are editor/collaboration features and UX widgets, led by `emoji-picker-react`, `highlight.js`, and `yjs`.

## Measurement Method
Tools and commands used:

```bash
pnpm --filter @ship/web build
node --input-type=module - <<'NODE'
// Load rollup-plugin-visualizer from a temporary audit tools directory
// and run a one-off Vite production build that writes:
// audit/artifacts/frontend-bundle-treemap.html
NODE
rg -n "@uswds/uswds|query-sync-storage-persister" web
rg -n "React\\.lazy|\\blazy\\(|import\\(" web/src
node - <<'NODE'
// Summarize emitted asset sizes from web/dist/assets
NODE
node --input-type=module - <<'NODE'
// Run Vite build with an audit-only Rollup plugin that captures:
// - chunk names
// - chunk rendered sizes
// - per-module rendered sizes
// - dependency contribution totals from node_modules
NODE
node - <<'NODE'
// Cross-reference web/package.json dependencies against imports in web/src and web/scripts
NODE
```

Methodology:
- Built the production frontend using the repo’s existing `@ship/web` build script.
- Generated a treemap artifact with `rollup-plugin-visualizer` via a one-off external analysis command, without modifying app code or app dependencies.
- Recorded emitted asset sizes from the generated `web/dist/` output.
- Used audit-only Rollup metadata extraction through Vite to measure chunk sizes and dependency contribution without adding new visualization packages during the audit.
- Cross-referenced declared frontend dependencies against actual imports, dynamic imports, script usage, config references, and raw package-path references in `web/`, then manually validated candidates to avoid false positives.
- Reviewed source-level dynamic imports to determine whether code splitting is present and whether it is materially reducing initial bundle cost.

Notes:
- Treemap artifact path: `audit/artifacts/frontend-bundle-treemap.html`
- The dependency reanalysis still found only one clear unused runtime dependency.
- Vite emitted a chunk-size warning during the build and specifically flagged two dynamic imports that do not actually split because those modules are also statically imported elsewhere.

## Baseline

### Core Metrics
| Metric | Baseline |
|---|---|
| Total production bundle size | 2,262.65 KB |
| JavaScript bundle size | 2,197.70 KB |
| CSS bundle size | 64.95 KB |
| Largest chunk | `index-C2vAyoQ1.js` - 2,025.10 KB minified, 589.49 KB gzip |
| Number of chunks | 261 JS chunks |

### Top 10 Largest Chunks
| Chunk | Size |
|---|---:|
| `index-C2vAyoQ1.js` | 2,025.10 KB |
| `ProgramWeeksTab-BzbUWlt4.js` | 16.37 KB |
| `WeekReviewTab-DmxN07T1.js` | 12.35 KB |
| `StandupFeed-BjJLDai5.js` | 9.42 KB |
| `ProjectRetroTab-BV2rvgoM.js` | 8.83 KB |
| `ProjectWeeksTab-oE3MioHn.js` | 6.50 KB |
| `ProgramProjectsTab-eNNvrO8g.js` | 4.30 KB |
| `ProjectDetailsTab-gSyN3jFM.js` | 3.52 KB |
| `WeekPlanningTab-DWsXI-LK.js` | 2.92 KB |
| `WeekOverviewTab-BkUUf8Qc.js` | 1.84 KB |

### Top Dependency Contributors
| Dependency | Rendered size |
|---|---:|
| `emoji-picker-react` | 399.59 KB |
| `highlight.js` | 377.92 KB |
| `yjs` | 264.92 KB |
| `prosemirror-view` | 236.32 KB |
| `@tiptap/core` | 181.18 KB |
| `react-dom` | 131.74 KB |
| `prosemirror-model` | 121.23 KB |
| `@uswds/uswds` | 111.65 KB |
| `lib0` | 106.52 KB |
| `@dnd-kit/core` | 100.97 KB |

## Findings

### High
- The main application entry chunk is effectively carrying almost the entire frontend.
  Why it matters: the largest chunk is `2,025.10 KB`, while the next largest chunk is only `16.37 KB`.
  Evidence: `index-C2vAyoQ1.js` triggers Vite’s large-chunk warning.

- Code splitting is present but materially undermined by mixed dynamic and static imports.
  Why it matters: dynamic imports only reduce initial payload when the imported module is not already pulled into the main graph.
  Evidence: Vite reported that `src/services/upload.ts` and `src/components/editor/FileAttachment.tsx` are dynamically imported but also statically imported elsewhere.

- Heavy editor and collaboration dependencies dominate the bundle.
  Why it matters: these dependencies are large enough that they should be treated as explicit budget items.
  Evidence: top contributors include `emoji-picker-react`, `highlight.js`, and `yjs`.

### Medium
- Chunk count is high, but chunk effectiveness is low.
  Why it matters: 261 JavaScript chunks suggests that splitting is technically happening, but most meaningful payload still lands in the entry chunk.
  Evidence: after the 2,025.10 KB entry chunk, remaining top chunks fall sharply into the 16 KB to 2 KB range.

- The current bundle includes substantial feature weight for functionality that may not be needed on initial load.
  Why it matters: rich editing, emoji selection, syntax highlighting, and collaboration infrastructure are likely candidates for deferral.
  Evidence: the largest dependency contributors are concentrated in editor, syntax, and collaboration libraries.

### Low
- One declared dependency appears unused in the frontend source.
  Why it matters: this is a smaller issue than chunk architecture, but unused packages add maintenance overhead.
  Evidence: `@tanstack/query-sync-storage-persister` was declared in `web/package.json` but was not found in imports, dynamic imports, scripts, config references, or asset-path references across `web/`.

- `@uswds/uswds` is not unused, despite looking like a potential candidate in a naive import scan.
  Why it matters: asset-driven dependencies should not be mislabeled as dead weight.
  Evidence: the package is referenced by the icon generation pipeline and icon asset imports.

## Suggested Direction
Treat this as a bundle-architecture problem more than a chunk-count problem. The first priority is to reduce what lands in the main `index` chunk by isolating editor, upload, emoji, syntax-highlighting, and collaboration code behind genuinely separate loading boundaries.

## Improvement Target
The improvement target for this category is to reduce the production payload the browser must download on first load, with priority on shrinking the main entry chunk rather than just increasing the number of chunks.

## Audit Deliverable
| Metric | Your Baseline |
|---|---|
| Total production bundle size | 2,262.65 KB |
| Largest chunk | `index-C2vAyoQ1.js` - 2,025.10 KB |
| Number of chunks | 261 |
| Top 3 largest dependencies | `emoji-picker-react` (399.59 KB), `highlight.js` (377.92 KB), `yjs` (264.92 KB) |
| Unused dependencies identified | `@tanstack/query-sync-storage-persister` |
| Improvement Target | Reduce initial-load bundle weight by shrinking the main entry chunk and moving heavy editor/collaboration code behind effective lazy-loading boundaries. |
