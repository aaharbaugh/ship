# Category 7: Accessibility Compliance

Measurement date: March 10, 2026

## CEO Overview
- Accessibility is in decent shape on automated checks, but the product does not fully support its accessibility claim today.
- The main business risks are confirmed color-contrast failures and a small set of screen-reader issues on important controls.
- Bottom line: the app is closer to partial compliance than full compliance and should not be described as fully conformant without remediation.

## Executive Summary
- Ship publicly claims Section 508 compliance and WCAG 2.1 AA conformance in [README.md](/home/aaron/projects/gauntlet/ship/ship/README.md#L263).
- The current report includes manually recorded Lighthouse accessibility scores for the major pages, with the lowest score on the Admin Dashboard at `88`.
- The rerun baseline is strong on automated checks: the focused accessibility Playwright suite passed `18/18`, and the deeper remediation subset passed `3/3`.
- `0` critical or serious axe violations were observed on the tested pages, but a CSS-level contrast sweep found real color-contrast failures that the narrower page sample did not catch.
- Manual NVDA verification was completed on the major pages and found a small number of real control-labeling issues despite otherwise strong page-level results.
- The main remaining gap against the Category 7 checklist is a repo-native Lighthouse workflow; the scores in this report were captured manually rather than through a reproducible repo command.

## Measurement Method
Tools and commands used:

```bash
rg -n "lighthouse|pa11y|voiceover|nvda|screen reader|508|WCAG 2.1 AA|WCAG 2.2 AA" . -g '!node_modules'
sed -n '1,260p' e2e/accessibility.spec.ts
sed -n '1,260p' e2e/status-colors-accessibility.spec.ts
sed -n '732,755p' e2e/accessibility-remediation.spec.ts
sg docker -c "env PLAYWRIGHT_WORKERS=1 pnpm test:e2e e2e/accessibility.spec.ts e2e/status-colors-accessibility.spec.ts --reporter=line"
sg docker -c "env PLAYWRIGHT_WORKERS=1 pnpm test:e2e e2e/accessibility-remediation.spec.ts --grep 'no color contrast violations on main pages|properties sidebar works with keyboard only|command palette traps focus|skip link is visible on keyboard focus' --reporter=line"
command -v lighthouse || pnpm exec lighthouse --version
rg -n "aria-live|aria-label=|aria-labelledby=|role=\"alertdialog\"|role=\"navigation\"|role=\"main\"|role=\"complementary\"" web/src
node <contrast sweep script against `web/src` tokens and `#0d0d0d` background>
```

Methodology:
- Used the repo’s existing Playwright accessibility suites as the primary automated measurement surface.
- Treated the axe-core tests in `e2e/accessibility.spec.ts` as the baseline for critical/serious violations on major pages.
- Treated `e2e/status-colors-accessibility.spec.ts` and the remediation contrast check as the color-contrast baseline.
- Treated the keyboard-only tests in `e2e/accessibility.spec.ts` and the remediation command-palette/properties-sidebar checks as the keyboard-navigation baseline.
- Used source inspection to identify accessibility infrastructure and residual hotspots for ARIA/landmark review.
- Added a CSS-level contrast sweep over the `text-*` tokens used in `web/src`, using the app background color from [index.css](/home/aaron/projects/gauntlet/ship/ship/web/src/index.css) and theme tokens from [tailwind.config.js](/home/aaron/projects/gauntlet/ship/ship/web/tailwind.config.js), to catch pages outside the narrower automated sample.

Scope exclusions:
- Lighthouse per-page scoring in the table below was entered from a separate manual run rather than reproduced through a repo-native CLI workflow in this environment.
- VoiceOver was not tested in this audit. Manual screen-reader findings below are based on NVDA.

Notes:
- The focused automated suite passed `18/18` in `40.5s`.
- The focused remediation subset passed `3/3` in `26.6s`.
- Non-product shell noise was present during the run (`NO_COLOR` / `FORCE_COLOR` warnings), but that does not affect browser accessibility results.
- The CSS-level contrast sweep found that `text-accent` (`#005ea2`) on the app background (`#0d0d0d`) renders at `2.89:1`, which fails the WCAG 2.1 AA `4.5:1` minimum for normal text.

## Baseline

### Accessibility Baseline
| Metric | Your Baseline |
|---|---|
| Lighthouse accessibility score (per page) | Login `98`, Docs `100`, Issues `100`, Programs `100`, Projects `96`, Team `96`, Reviews `96`, Settings `95`, Admin `88` |
| Total Critical/Serious violations | `0` observed on tested pages |
| Keyboard navigation completeness | `Full` |
| Color contrast failures | CSS sweep found systemic failures, led by `text-accent` on dark background (`2.89:1`) |
| Missing ARIA labels or roles | `0` observed in focused automated checks; manual expansion still needed on button-dense admin/review surfaces |

### Lighthouse Page Scores
| Page | Route | Score |
|---|---|---|
| Login | `/login` | 98 |
| Docs | `/docs` | 100 |
| Issues | `/issues` | 100 |
| Programs | `/programs` | 100 |
| Projects | `/projects` | 96 |
| Team Mode | `/team` | 96 |
| Reviews | `/reviews` | 96 |
| Workspace Settings | `/settings` | 95 |
| Admin Dashboard | `/admin` | 88 |

### Screen Reader Verification Notes
| Page | Route | Screen Reader Used | Structure / Landmarks | Control Interaction | Notes |
|---|---|---|---|---|---|
| Login | `/login` | NVDA | Pass | Pass | No material screen-reader issues observed |
| Docs | `/docs` | NVDA | Pass | Partial | Page content is screen-readable overall; global chrome issues remain: user-initial icon reads as a single letter without useful context, and Settings / toolbar toggle controls do not announce clear purpose |
| Issues | `/issues` | NVDA | Pass | Pass | No material screen-reader issues observed |
| Programs | `/programs` | NVDA | Pass | Pass | No material screen-reader issues observed |
| Projects | `/projects` | NVDA | Pass | Pass | No material screen-reader issues observed |
| Team Mode | `/team` | NVDA | Pass | Partial | Page content is screen-readable overall; “View as current week” icon is not screen-reader understandable |
| Reviews | `/reviews` | NVDA | Pass | Pass | No material screen-reader issues observed |
| Workspace Settings | `/settings` | NVDA | Pass | Pass | No material screen-reader issues observed |
| Admin Dashboard | `/admin` | NVDA | Pass | Pass | No material screen-reader issues observed |

Additional manual NVDA findings:
- `/documents`: the Delete Document control is not screen-reader understandable.
- Global app chrome: the icon showing the username initial reads only as a letter and does not provide useful context.
- Global app chrome: the Settings button and the open/collapse toolbar control do not announce readable purpose.
- `/team`: the “View as current week” icon is not screen-reader understandable.
- Outside of the specific issues above, manual NVDA testing passed on the major pages.

### Page-Level Automated Results
| Page / Flow | Result | Evidence |
|---|---|---|
| Login page axe audit | Pass | `accessibility.spec.ts` passed the login-page critical/serious axe scan |
| Main app shell axe audit | Pass | `accessibility.spec.ts` passed the main-shell critical/serious axe scan |
| Docs page axe audit | Pass | `accessibility.spec.ts` passed the docs-mode critical/serious axe scan |
| Programs page axe audit | Pass | `accessibility.spec.ts` passed the programs-mode critical/serious axe scan |
| Login keyboard-only flow | Pass | `accessibility.spec.ts` passed full tab/enter login navigation |
| Main app keyboard smoke flow | Pass | `accessibility.spec.ts` passed focused keyboard navigation after login |
| Command palette focus trap | Pass | `accessibility-remediation.spec.ts` passed the command-palette focus-trap check |
| Properties sidebar keyboard-only flow | Pass | `accessibility-remediation.spec.ts` passed the keyboard-only sidebar audit |
| Color contrast on tested pages | Mixed | Focused automated contrast checks passed, but the broader CSS sweep found failing text tokens on pages outside the narrower sample, including admin surfaces |

## Findings

### High
- Color contrast is not fully compliant across the product despite the focused automated contrast tests passing.
  Why it matters: this directly undermines the Section 508 / WCAG 2.1 AA claim and affects legibility on core navigation and admin workflows.
  Evidence: the CSS-level sweep found `text-accent` (`#005ea2`) on the dark app background (`#0d0d0d`) at `2.89:1`, below the `4.5:1` requirement. A concrete example is the admin workspace name link in [AdminDashboard.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/AdminDashboard.tsx#L306).

- The repository still lacks a reproducible, repo-native Lighthouse workflow.
  Why it matters: the requested deliverable explicitly asks for Lighthouse scores per major page, and the current audit surface cannot regenerate those scores from a standard repo command.
  Evidence: `pnpm exec lighthouse --version` failed because the command is not available in this environment, so the page scores in this report were captured manually.

### Medium
- Keyboard reachability is broadly complete, but there are still concrete workflow/navigation issues.
  Why it matters: this does not negate general keyboard completeness, but it does leave important flows awkward or incomplete for users navigating without a mouse.
  Evidence: user validation identified two issues during manual use: the Action Items modal could not select the post-standup alert, and clicking a person name from Status Overview led to a detail view with no back button.

- The current automated contrast baseline is too narrow to support a blanket “no contrast failures” claim.
  Why it matters: the passing contrast tests cover selected pages and targeted status colors, but they do not currently sweep admin/settings/review surfaces where low-contrast accent text appears.
  Evidence: the targeted contrast check in `e2e/accessibility-remediation.spec.ts` passed, while the broader CSS token sweep found failing `text-accent`, `text-red-800`, `text-red-700`, `text-blue-600`, and `text-red-600` usages against the shared dark background.

- Automated accessibility coverage is strong but not equivalent to “every major page fully manually verified.”
  Why it matters: keyboard navigation passed on login, app-shell, command palette, and properties-sidebar flows, but the audit did not manually tab through every interactive control in admin, reviews, team, and workspace settings views.
  Evidence: the rerun passed `e2e/accessibility.spec.ts` and a focused remediation subset, but did not execute a full-page keyboard traversal across all complex surfaces.

- Button-dense workflow pages should remain on the manual verification list even though focused automated checks passed.
  Why it matters: these surfaces are the most likely places for accessible-name drift, focus-order regressions, or modal-state issues to appear over time.
  Evidence: source inspection shows dense interactive surfaces in [Projects.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/Projects.tsx), [TeamMode.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/TeamMode.tsx), [ReviewsPage.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/ReviewsPage.tsx), [WorkspaceSettings.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/WorkspaceSettings.tsx), and [AdminDashboard.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/AdminDashboard.tsx).

- Manual NVDA testing found a small set of real label/context issues despite otherwise passing page structure and control interaction.
  Why it matters: these are user-facing accessibility defects on important controls, not theoretical semantics gaps.
  Evidence: the Delete Document control in `/documents`, the user-initial icon, the Settings button, the toolbar toggle, and the Team Mode “View as current week” icon were all flagged in manual NVDA use.

### Low
- The automated baseline supports the claim that accessibility engineering is a first-class concern in the codebase.
  Why it matters: accessibility is not just documented; it is reflected in explicit axe, contrast, keyboard, focus, and ARIA regression coverage.
  Evidence: `e2e/accessibility.spec.ts`, `e2e/accessibility-remediation.spec.ts`, `e2e/status-colors-accessibility.spec.ts`, and semantics in [App.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/App.tsx), [SessionTimeoutModal.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/components/SessionTimeoutModal.tsx), and [KanbanBoard.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/components/KanbanBoard.tsx).

## Hotspots
| Location | Why it remains a hotspot |
|---|---|
| [AdminDashboard.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/AdminDashboard.tsx) | Confirmed contrast failure on `text-accent` links against the dark background |
| [AdminWorkspaceDetail.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/AdminWorkspaceDetail.tsx) | Uses the same failing accent-link pattern as the admin dashboard |
| [ActionItemsModal.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/components/ActionItemsModal.tsx) | Manual audit found the post-standup alert path could not be selected from the popup |
| [Documents.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/Documents.tsx) | Manual NVDA audit found the Delete Document control is not screen-reader understandable |
| [StatusOverviewHeatmap.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/components/StatusOverviewHeatmap.tsx) | Manual audit found navigation into a person/detail flow without a return/back affordance |
| [TopBar.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/components/TopBar.tsx) | Manual NVDA audit found the user-initial icon and Settings / toolbar toggle controls do not announce enough context |
| [Projects.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/Projects.tsx) | Button-dense bulk-action and filtering surface plus accent-text usage that should be included in contrast review |
| [TeamMode.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/TeamMode.tsx) | Complex interactive dashboard with multiple inline controls and modal paths; manual NVDA audit also found the “View as current week” icon is not screen-reader understandable |
| [ReviewsPage.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/ReviewsPage.tsx) | Dense review controls, panels, and stateful buttons that need continued keyboard/screen-reader verification |
| [WorkspaceSettings.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/WorkspaceSettings.tsx) | Tabbed settings/admin surface with many action buttons and list operations |
| [Documents.tsx](/home/aaron/projects/gauntlet/ship/ship/web/src/pages/Documents.tsx) | Empty-state links use the same accent-text pattern and should be treated as contrast review targets |

## Manual Navigation Findings
| Flow | Result | Why it matters |
|---|---|---|
| Action Items popup -> select post-standup alert | Workflow issue | A primary accountability workflow still has an interaction gap even though general keyboard reachability is intact |
| Status Overview -> click person name -> return to prior view | Navigation issue | The destination flow lacks a visible back/return affordance, breaking expected navigation recovery |
| General interactive navigation outside those flows | Pass | Major interactive surfaces were reachable in general use |

Keyboard completeness note:
- The current report treats keyboard navigation as `Full` for general reachability of interactive elements.
- The two findings above are retained as workflow/navigation issues so the report does not claim the end-to-end user experience is issue-free.

## Audit Deliverable
| Metric | Your Baseline |
|---|---|
| Lighthouse accessibility score (per page) | `/login` `98`, `/docs` `100`, `/issues` `100`, `/programs` `100`, `/projects` `96`, `/team` `96`, `/reviews` `96`, `/settings` `95`, `/admin` `88` |
| Total Critical/Serious violations | `0` observed on tested pages |
| Keyboard navigation completeness | `Full` |
| Color contrast failures | Present; systemic `text-accent` failures plus additional dark-background token failures found by CSS sweep |
| Missing ARIA labels or roles | No focused automated findings; manual review still recommended for the hotspot pages listed above |

Improvement target:
- Add a repo-native Lighthouse workflow for major pages so the audit can publish comparable page scores.
- Fix the manual NVDA issues identified in `/documents`, global app chrome, and `/team`, then keep those controls in regression coverage.
- Expand keyboard-only regression coverage to `Projects`, `TeamMode`, `ReviewsPage`, `WorkspaceSettings`, and `AdminDashboard`.
- Add a repo-native contrast audit that includes admin/settings/review surfaces and replace or retokenize low-contrast accent text on the dark theme.
- Add explicit regression coverage for the Action Items modal post-standup selection flow and the Status Overview person-detail return path.
