# Category 1: Type Safety

Measurement date: March 10, 2026

## Overview
- Type safety is not blocking daily use today, but the codebase relies on a large number of TypeScript escape hatches in critical backend paths.
- The main business risk is slower feature work and higher regression risk when changing document, API, and database boundary code.
- Bottom line: the foundation is workable because strict mode passes, but the backend needs cleanup before this becomes expensive engineering drag.

## Executive Summary
- TypeScript strict mode is enabled across the monorepo, and the current repo passes `pnpm type-check` with 0 compiler errors.
- Despite that, the codebase contains 1,294 explicit type-safety escape hatches across authored TypeScript: 273 `any` usages, 691 type assertions, 329 non-null assertions, and 1 suppression directive.
- The risk is concentrated in `api/`, which accounts for 853 of 1,294 measured violations, especially in large route files that mix SQL results, request parsing, and document property access.
- The highest-value improvement direction is to reduce type escape hatches at system boundaries first: database rows, request payloads, document properties, and editor/document JSON structures.

## Measurement Method
Tools and commands used:

```bash
rg --files -g 'tsconfig*.json' -g 'package.json' -g '!node_modules'
sed -n '1,220p' tsconfig.json
sed -n '1,220p' web/tsconfig.json
sed -n '1,220p' api/tsconfig.json
sed -n '1,220p' shared/tsconfig.json
pnpm type-check
node - <<'NODE'
// TypeScript AST scan for:
// - AnyKeyword
// - AsExpression / TypeAssertionExpression
// - NonNullExpression
// - @ts-ignore / @ts-expect-error in source text
NODE
```

Methodology:
- Used TypeScript compiler AST traversal rather than grep for baseline counts, because plain regex overcounted comments, prose, and generated output.
- Scoped the baseline to authored TypeScript under `web/`, `api/`, and `shared/`.
- Excluded generated or compiled directories: `node_modules/`, `dist/`, `build/`, `coverage/`, and `web/dev-dist/`.
- Verified strictness via `tsconfig.json` files and confirmed runtime baseline health via `pnpm type-check`.

## Baseline

### Core Metrics
| Metric | Total | web | api | shared |
|---|---:|---:|---:|---:|
| Explicit `any` types | 273 | 33 | 240 | 0 |
| Type assertions (`as` / angle-bracket assertions) | 691 | 372 | 317 | 2 |
| Non-null assertions (`!`) | 329 | 33 | 296 | 0 |
| `@ts-ignore` / `@ts-expect-error` | 1 | 1 | 0 | 0 |

### Configuration Status
| Metric | Baseline |
|---|---|
| Strict mode enabled? | Yes |
| `pnpm type-check` error count | 0 |
| Total measured type-safety violations | 1,294 |

### Package Concentration
| Package | Total violations | Share |
|---|---:|---:|
| `api/` | 853 | 65.9% |
| `web/` | 439 | 33.9% |
| `shared/` | 2 | 0.2% |

## Top 5 Violation-Dense Files
| File | Count | Why it is problematic |
|---|---:|---|
| `api/src/routes/weeks.ts` | 85 | Large route module combining request parsing, SQL result shaping, document property access, and aggressive non-null assumptions. |
| `api/src/__tests__/transformIssueLinks.test.ts` | 66 | Heavy use of `any` and `as any` in mocks and assertions, weakening test realism. |
| `api/src/services/accountability.test.ts` | 64 | Loosely typed mock results reduce confidence in production contract coverage. |
| `api/src/__tests__/auth.test.ts` | 63 | Authentication tests rely on broad coercions instead of typed fixtures. |
| `api/src/routes/projects.ts` | 51 | Production route file with mixed SQL row shaping, mutable `any[]` arrays, and repeated non-null assumptions. |

## Findings

### High
- `api/` is the dominant source of type-system bypasses.
  Why it matters: `api/` contains 65.9% of all measured violations and most of the production-facing risk.
  Evidence: `api/` contains 240 `any` usages, 317 type assertions, and 296 non-null assertions.

- Production boundary code is relying on non-null assertions instead of validated contracts.
  Why it matters: non-null assertions are runtime bets that can turn missing data or schema drift into production failures.
  Evidence: 296 of 329 non-null assertions are in `api/`.

- SQL row and document-property access patterns are under-typed.
  Why it matters: the route layer frequently treats database rows and `properties` payloads as structurally known without encoding those structures in TypeScript.
  Evidence: repeated `row: any` extractors and loosely typed row handling in `api/src/routes/weeks.ts`, `api/src/routes/issues.ts`, and `api/src/routes/projects.ts`.

### Medium
- Web code depends heavily on type assertions instead of narrower component and editor types.
  Why it matters: this lowers refactor safety in the UI and hides integration mistakes between editor APIs, document models, and component props.
  Evidence: `web/` contains 372 type assertions.

- Test code has a substantial amount of `any`-driven mocking.
  Why it matters: this is less severe than production route debt, but it can make test suites permissive where they should protect contracts.
  Evidence: three of the top five densest files are tests.

### Low
- Suppression directives are nearly absent.
  Why it matters: this is a positive signal. The team is generally not muting the compiler directly.
  Evidence: only 1 directive was found.

- `shared/` is already strongly typed.
  Why it matters: this package is not a meaningful contributor to type-safety debt.
  Evidence: `shared/` contains 2 type assertions and no measured `any`, non-null assertions, or suppression directives.

## Suggested Direction
Prioritize production boundary typing in `api/` before broad cleanup. The highest-return path is to replace loosely typed database rows, request payloads, and document property bags with explicit domain types and validated parsing, then reduce non-null assertions in the largest route modules.

## Improvement Target
The agreed target for this category is to eliminate 25% of measured type-safety violations without changing behavior. Against the current baseline of 1,294 measured violations, that implies removing or correctly replacing approximately 324 escape hatches.

## Remediation Rerun
Rerun date: March 13, 2026

Fresh recount using the same AST-based method:

| Metric | Baseline | Current |
|---|---:|---:|
| Explicit `any` types | 273 | 65 |
| Type assertions (`as` / angle-bracket assertions) | 691 | 556 |
| Non-null assertions (`!`) | 329 | 325 |
| `@ts-ignore` / `@ts-expect-error` | 1 | 1 |
| Total measured type-safety violations | 1,294 | 947 |

Current package breakdown:

| Package | Current violations |
|---|---:|
| `api/` | 506 |
| `web/` | 439 |
| `shared/` | 2 |

Current top 5 violation-dense files:

| File | Count |
|---|---:|
| `api/src/routes/weeks.ts` | 74 |
| `api/src/routes/issues.ts` | 44 |
| `api/src/routes/projects.ts` | 38 |
| `api/src/routes/team.ts` | 37 |
| `web/src/pages/UnifiedDocumentPage.tsx` | 37 |

Outcome:
- Reduction achieved: `1,294 -> 947`, a drop of `347` measured violations (`26.8%`).
- `pnpm type-check` passes with `0` errors after the refactors.
- This clears the category target of at least `25%` reduction.

## Audit Deliverable
| Metric | Your Baseline |
|---|---|
| Total any types | 273 |
| Total type assertions (`as`) | 691 |
| Total non-null assertions (`!`) | 329 |
| Total `@ts-ignore` / `@ts-expect-error` | 1 |
| Strict mode enabled? | Yes |
| Strict mode error count (if disabled) | N/A, strict mode is enabled and `pnpm type-check` reports 0 errors |
| Top 5 violation-dense files | `api/src/routes/weeks.ts` (85), `api/src/__tests__/transformIssueLinks.test.ts` (66), `api/src/services/accountability.test.ts` (64), `api/src/__tests__/auth.test.ts` (63), `api/src/routes/projects.ts` (51) |
