# Engineering Closure C3 — 测试质量、故障诊断与发布保护

**Parent:** Closure C2 Draft #192 `ffc3fe53d6a275a807ad943c177e15d42391ff70`. **Status:** OFFLINE CANDIDATE / DRAFT. No real business API writes, no deployment, no merge, no real Production/Beta read.

## 1. Actual coverage vs number of tests

Previous EQ01/EQ03 numbers were *source census*, explicitly **not** executed coverage. This C3 gate adds an independently pinned **Vitest 2.1.9 + @vitest/coverage-v8 2.1.9** measurement job for the safety-critical source scope (not whole-repository coverage):
- `src/features/work-orders/action-workspace-read-model.ts`: Appointment/Survey/Workflow Complete presentation guard
- `src/features/work-orders/quotation/order-submission.ts`: actor-bound receipt, ambiguous Order write and reconciliation
- `src/adapters/api/uni-api-command-transport.ts`: fail-closed production/business mutation transport

Selected original real behavior suites, plus new C3 transport drills, must execute instrumented source. `scripts/check-closure-c3-coverage.mjs` refuses missing/nonexecuted source or malformed V8 line/branch counters and produces numbers from `coverage/coverage-summary.json`.

**Honest limit:** first scoped baseline records actual execution, with **no invented global coverage percentage or preset target**. A >0 measurement is proof that instrumented source ran, not that its important branches are all covered. Provider is deliberately installed transiently **inside an isolated CI job** with pinned version and `--lockfile=false`; committed package/lockfile remain unchanged. This is a reproducible coverage pilot, not yet a reviewed permanent dependency or baseline regression threshold. A follow-up normal dependency/lockfile review should pin the provider before enabling default-branch coverage gating.

## 2. Runtime reliability proof we can actually establish offline

New `closure-c3-release-drills.test.ts` makes *real command adapter code* process synthetic requests and asserts that **zero network executor calls** occur for:
- Production flag override attempts (`VITE_XLINK_ENABLE_REAL_WRITES=true`) against Workflow, FormData, Order, quotation generation, confirmation and signing;
- canonical Production host, even when the build is mislabeled as staging;
- non-Production writes when the real-write flag is false;
- deferred Appointment `need=0` with source-unverified datetime encoding.

This is deeper than static string matching and checks actual transport exceptions. It is still **offline synthetic evidence**, not back-end tenant authorization or server-side idempotency.

## 3. Incident response & rollback controls

Machine-readable `closure-c3-readiness.json` and `scripts/check-closure-c3-release.mjs` document eight evidence categories and three **external blockers**. Nine intentional invalid readiness mutations must be rejected. The release result is always `HOLD_EXTERNAL_EVIDENCE` — no CI test, self-reported JSON or all-green Draft can turn into Production authorization.

### Incident handling / diagnostic intake

1. Freeze release and **retain the exact build SHA and target platform/runtime**; classify the first error as `session_invalid`, `authorization_denied`, `network_retryable`, `server_terminal`, `unsupported_capability`, or `cancelled`. Preserve whether request dispatched before failure, especially child Workflow/Order; a timeout or HTTP 5xx after dispatch is **ambiguous**, not safe to retry.
2. Collect **only bounded event metadata**: timestamp (minute granularity), platform, app version/commit, stage (`read/form_save/workflow_complete/quote_order/readback/media`), error category, outcome, role change observed (boolean), correlation reference in a restricted system. Never record passwords, session cookies/JSESSIONID, API authorization header, customer names, phone numbers, addresses, raw form/photo data or personally identifying Order IDs in public CI logs.
3. Recovery for `failed_retryable_before_write` may permit a new user action after validation; **never automatically replay `failed_ambiguous_after_dispatch`**. Perform authorized authoritative backend reconciliation first, preserve draft and receipt state, and involve the owner.
4. If actual release is degraded, use deployment-platform rollback to **previously verified artifact**, *not* revert DB schema blindly or delete Order receipts. Owner checks compatibility, migration reversibility, user write queues, caching and affected platforms; **no rollback script or credential access is executed in this Draft**.
5. Re-run minimal synthetic platform/regression smoke + authorized real smoke only with separately approved credentials, compare immutable version, and record incident closure.

### External blockers (release HOLD)

- Verify actual R1 Workflow/FormData command and authorization semantics, tenant/SKU effective price authority, backend-enforced idempotency, deferred Appointment `need=0` datetime encoding. Client guards are defense in depth.
- Confirm release mechanism/production build artifact IDs, environment isolation, rollout/kill-switch scope, named on-call owner, rollback command, reverse compatibility and **actual rehearsal**. Current repo CI tests cannot certify these.
- Owner signs live release/merge permission only after above and device testing. Until then all Drafts remain unmerged, Production business mutations remain disabled.

## 4. Acceptance and no-go rules

For exact C3 final HEAD: C3 offline release negative drills, scoped instrumented V8 coverage artifact, targeted and 236+ critical behavior tests, full regression suite, source/architecture gate, H5/MP-Weixin/App builds, original H5 six-stage Mock and unchanged Gallery/Business Goldens, and default Validate must succeed. No Production/Beta HTTP calls, no snapshot updates or business writes. Exact-head CI evidence linked on #193 and Issue #180.

**Do not claim:** whole-repo executed coverage, mutation testing score, Production observability integration, real rollback rehearsed, R1 live parity or go-live. These remain separately evidenced gates.
