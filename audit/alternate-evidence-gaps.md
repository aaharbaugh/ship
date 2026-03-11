# ShipShape Evidence Gaps

Review date: March 10, 2026

This file lists the current evidence gaps against the ShipShape prompt. It is not a replacement for the main audit docs. It is a working checklist of what is still weak, implicit, missing, or internally inconsistent.

## Orientation Appendix

### Missing or weak evidence

| Checklist Item | Current State | Evidence Gap |
|---|---|---|
| Clone/run from scratch with every setup step documented | Partially covered | Current orientation notes do not re-verify a clean boot and explicitly say this cleanup pass did not re-run a full fresh setup |
| Read every file in `docs/` and summarize key decisions | Partially covered | There is a high-level summary, but not a doc-by-doc reading record |
| Diagram of `web/`, `api/`, `shared/` relationship | Covered | No immediate gap |
| Map tables and relationships from schema | Covered | No immediate gap |
| Trace one user action end-to-end | Covered | No immediate gap |
| Identify middleware chain | Covered | No immediate gap |
| Explain unauthenticated request behavior | Covered | No immediate gap |
| Playwright structure and fixtures | Partial | The orientation doc does not yet read like a full test-infra walkthrough |
| How test DB is set up and torn down | Partial | Present in repo knowledge, not strongly captured in the orientation artifact |
| Run full test suite and record duration/pass rate | Partial | This exists in the test audit, but is not strongly linked back into orientation |
| Read Dockerfile and explain build output | Partial | Only lightly covered |
| Read `docker-compose.yml` and explain services | Partial | Only lightly covered |
| Skim Terraform and describe expected infrastructure | Partial | Mentioned broadly, not synthesized explicitly |
| Explain CI/CD pipeline | Partial | Not strongly documented in the orientation notes |
| 3 strongest architectural decisions | Partial | Themes are present, but not as an explicit top-3 answer |
| 3 weakest points / improvement focus | Partial | Themes are present, but not as an explicit top-3 answer |
| What to tell a new engineer first | Missing explicit answer | Not answered directly |
| What breaks first at 10x users | Missing explicit answer | Not answered directly |

## Category 1: Type Safety

Status: Strong

### Evidence gaps

- No material audit-blocking gap found.
- Optional strengthening only: preserve the AST-count script or artifact if you want exact reproducibility from the report alone.

## Category 2: Bundle Size

Status: Strong

### Evidence gaps

- No material audit-blocking gap found.
- Optional strengthening only: preserve the exact bundle-analysis command output alongside the treemap if you want a tighter reproduction trail.

## Category 3: API Response Time

Status: Strong

### Evidence gaps

- No material audit-blocking gap found.
- Optional strengthening only: explicitly call out the interpolated `P95` method in the deliverable table, not just in the methodology section.

## Category 4: Database Query Efficiency

Status: Moderate

### Missing or weak evidence

| Prompt Requirement | Current State | Evidence Gap |
|---|---|---|
| Enable PostgreSQL query logging | Not directly achieved | The current audit used an application-level query profiler because native logging was unavailable |
| Count total queries per flow | Covered | No immediate gap |
| Run `EXPLAIN ANALYZE` on slowest queries | Covered | No immediate gap |
| Check missing indexes against `WHERE` clauses | Covered | No immediate gap |
| Identify N+1 patterns | Covered | No immediate gap |

### Risk

- The category is still usable, but the evidence is weaker than the prompt’s preferred database-native logging path.

## Category 5: Test Coverage and Quality

Status: Moderate

### Missing or weak evidence

| Prompt Requirement | Current State | Evidence Gap |
|---|---|---|
| Run full suite and record pass/fail/runtime | Covered | No immediate gap |
| Read test files and catalog coverage | Covered | No immediate gap |
| Run suite 3 times and identify flake | Partially covered | Flake is discussed, but the artifact does not clearly present a full 3-run matrix |
| Map critical flows against existing coverage | Covered | No immediate gap |
| Configure/report code coverage if not already configured | Partial | It is unclear whether coverage was fully measured, intentionally deferred, or deemed out of scope |

### Risk

- The category likely passes as a baseline audit, but flake evidence and code-coverage handling should be made more explicit.

## Category 6: Runtime Error and Edge Case Handling

Status: Moderate

### Missing or weak evidence

| Prompt Requirement | Current State | Evidence Gap |
|---|---|---|
| Monitor console during normal usage | Covered | No immediate gap |
| Test network failure during collaborative editing | Covered | No immediate gap |
| Test malformed input: empty, long, special chars, HTML/script injection | Partial | The current artifact leans on validation/source review more than a clearly logged runtime exercise |
| Test concurrent edge cases: two users editing same field simultaneously | Partial | Existing E2E and collaboration findings cover parts of this, but the audit does not present a crisp direct manual run/result for this exact prompt item |
| Throttle network to 3G and note hangs/silent failures/loading states | Partial | The artifact mentions degraded/offline behavior, but not a direct named 3G-throttle run with recorded observations |
| Check server logs for unhandled errors during all scenarios | Partial | Server-side gap analysis exists, but centralized log evidence is weak and there is no global `unhandledRejection` trap |

### Concrete missing proof

- Runtime malformed-input reproduction notes are not clearly listed.
- A direct 3G-throttle checklist/result is not clearly listed.
- A direct server-log capture during the edge-case runs is not clearly listed.

## Category 7: Accessibility Compliance

Status: Moderate

### Missing or weak evidence

| Prompt Requirement | Current State | Evidence Gap |
|---|---|---|
| Lighthouse audit on every major page | Covered if using the manually entered score table | The scores exist now, but the methodology for how they were captured is not fully preserved in the repo artifact |
| Automated scanner with severity categories | Partial | Current report is strongest on `0` critical/serious on tested pages, but not a broad page-by-page severity rollup across Critical, Serious, Moderate, Minor |
| Full keyboard navigation testing | Partial / disputed | Automated keyboard checks are strong, and manual feedback says general access is fine, but the current report still labels completeness as `Partial` |
| Screen reader testing with VoiceOver/NVDA | Missing | No manual screen-reader evidence is currently documented |
| Color contrast checks against WCAG 2.1 AA | Covered | No immediate gap on proof of failure; contrast failures are now evidenced |

### Internal inconsistency

- The current accessibility report still says keyboard navigation completeness is `Partial`.
- Your latest manual position is that general keyboard access is effectively complete, with separate workflow/navigation issues.
- That means the current evidence set contains a rating mismatch that should be resolved before final submission.

## Cross-Cutting Gaps

### Reproducibility gaps

- Some categories describe one-off scripts or local commands, but not all of them leave behind a reproducible artifact.
- Manual measurements, especially Lighthouse and keyboard/screen-reader work, are more fragile unless the exact pages, flows, and environment are spelled out.

### Evidence-strength gaps

- Several categories are substantively correct but mix direct measurement with source inspection or inference from existing tests.
- That is most noticeable in Categories 6 and 7.

### Consistency gaps

- Category 7 currently contains a rating mismatch on keyboard completeness.
- Orientation and Category 5 both touch testing infrastructure, but not in a tightly connected way.

## Short Priority List

If you want the shortest path to a stronger baseline submission, the missing evidence to close first is:

1. Orientation appendix explicit-answer cleanup for the remaining checklist items.
2. Category 5 explicit flake-run accounting and code-coverage status language.
3. Category 6 direct evidence for malformed input, 3G throttle, and server-log review.
4. Category 7 screen-reader evidence, severity rollup, and keyboard-rating reconciliation.
