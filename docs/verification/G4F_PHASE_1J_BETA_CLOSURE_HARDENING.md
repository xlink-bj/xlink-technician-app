# G4-F Phase 1J — Beta Chain Verification + Workflow Closure + Production Hardening

Status: **PARTIAL — live Beta create/edit is blocked by safe-target access.** This report separates checked-in source evidence and deterministic local verification from claims that require an authenticated Beta business record.

## Revision and source provenance

- Authorized base: `89218f9c375a0cf593a3787cced1bf24779a3422`.
- Branch: `codex/g4f-phase1j-beta-closure-hardening`.
- Evidence revision: the branch commit carrying this report (exact HEAD is recorded in the associated Issue #29 / Draft PR).
- R1 source: `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29`.
- Backend source: `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`.

## Beta access and mutation boundary

The configured endpoint was the non-production Beta environment. Three read-only login requests were made across two distinct credential sets: once with the locally configured, previously documented test account; once with the separately documented local backup account; and once more through the existing business API client's defaults. The last request was not a third credential set: its phone, code, and tenant matched the technician app's local configuration. All three requests were rejected with the sanitized category `login_rejected`; none established an authenticated session. Consequently, no work-order/ServiceAppointment reads were made, no test/disposable target could be proven, and no target was selected. This is `BLOCKED_ENV`, not evidence that a work order or quotation is absent.

| Activity | Result |
|---|---|
| Beta login preflight | 3 requests / 2 distinct credential sets; all `login_rejected` |
| Beta ServiceAppointment / workflow / Order reads | 0 |
| Beta business mutations, including child workflow and Order create/update | 0 |
| Production requests or mutations | 0 |
| Safe test target proven | No; target not selected |
| Live write flag | Not enabled for this verification |

No raw response, identifiers, customer data, credentials, cookies, or payloads are persisted here. The documented backup account was attempted once; the business API client's defaults were internally compared with the local app configuration and found to be the same primary credential set. No further credential guessing or guessed work-order ID was attempted. An old Cloud UI login sample was not reused because it is a stale administrative UI session artifact, not a current technician-app session.

## Create, readback, tenant contract, and edit

All live chain outcomes remain `BLOCKED_ENV`: type-1 Order create, authoritative readback, tenant pre-script validation, and same-ID edit were not attempted. Their absence must not be read as a pass or failure. The existing implementation's synthetic/unit and H5 tests remain local evidence only.

The backend `OrderServiceImpl.upsert` source shows that a create requires an active ServiceAppointment and active tenant `Ext` definition for `colName=order`; it executes that definition's pre-script when present. Whether the current Beta tenant requires owner/contact/description fields remains `UNKNOWN` until a safe target can exercise the actual script.

The same source shows material side effects beyond storing the Order: with `exts.isCreateBjdPDF='1'`, it attempts quotation/warranty document generation and saves a customer-facing Message; it then saves the Order, recalculates ServiceAppointment total/paid amounts and possibly pay state, and invokes an SLA update. These effects reinforce the requirement for an explicitly disposable, non-customer test record before any authorized live create.

## Parent workflow closure

**Source evidence only; Beta result `BLOCKED_ENV`.** In R1 `placeOrders.vue`, the new type-1 path starts the child Order workflow (`workflow/startWorkflow/order/null/{workflowFormDefId}` with `saId`) and then calls `basic/order/upsert`. The inspected path contains no explicit parent ServiceAppointment `workflow/process`/completion call. The inspected backend `OrderServiceImpl.upsert` likewise does not complete the parent workflow.

This establishes that the inspected R1 path does not issue an explicit parent completion command; it does **not** prove from current Beta state that the parent `placeOrder` node closes correctly. No speculative parent transition was added. Live parent workflow state remains `UNKNOWN / BLOCKED_ENV`.

## PDF / document contract

Backend source generates a quotation PDF during the `isCreateBjdPDF='1'` branch and writes a URL-shaped value to `exts.bjdPDFurl`; it also has warranty-document generation paths. This is source-level evidence only. No Beta readback verified the field, URL usability, stability/access policy, or platform open behavior. The current quotation read adapter preserves the server snapshot and recognizes `qiniuList`, but no validated PDF action is presented. PDF UI remains absent; production document contract is `PARTIAL / UNKNOWN`.

## Receipt recovery and duplicate protection

Deterministic test coverage simulates process restart by restoring the persisted `write_succeeded_readback_pending` receipt, then retrying only authoritative readback. It asserts the child-workflow start and Order upsert remain at one call each. Existing tests also cover restoring succeeded receipts, ambiguous dispatch blocking, same-ID edit without a second child workflow, and delayed readback not deleting a newer local draft. These are synthetic local tests, not live Beta evidence.

## Platform evidence

- H5: the G4-F review harness exercises the real quotation Action Workspace with synthetic ports and guarded requests; it does not authenticate or contact Beta/Production business APIs.
- MP: build evidence is distinct from runtime evidence. The DevTools CLI and build artifact are available, but no G4-F-specific MP runtime harness with isolated request interception was available and the automator package is absent. Manual DevTools runtime was not opened to avoid inheriting persistent local authentication/customer state. No Android device was attached and no booted iOS simulator was available.
- App: build evidence is distinct from runtime/device evidence. No native App runtime smoke was performed.
- No authenticated UI, real media, real quotation create/edit, or device restart claim is made.

## Remaining blockers and next dependency

| Item | Status | Owner / evidence needed |
|---|---|---|
| Beta authenticated read access | `BLOCKED_ENV` | Environment / account owner: restore the approved Beta login path |
| Safe non-customer disposable ServiceAppointment | `BLOCKED_EXTERNAL` | Product/Beta data owner: identify and attest a disposable test record |
| Current active `placeOrder` pre-state and linked type-1 Orders | `UNKNOWN` | Read-only Beta preflight after access is restored |
| Tenant pre-script requirements | `UNKNOWN` | Safe-target Beta create response, only if approved and preflight passes |
| Parent workflow post-create state | `UNKNOWN` | Authoritative readback after the single bounded test chain |
| PDF field/URL behavior | `PARTIAL / UNKNOWN` | Beta Order readback and approved URL/platform validation |
| Same-ID Beta edit | `BLOCKED_ENV` | Requires successful safe-target create/readback first |
| Native MP/App runtime behavior | `DEVICE_VALIDATION_PENDING` | Device QA with an approved isolated test account/target |
| Production mutation/readiness | `NOT_AUTHORIZED` | Separate future authorization; no Production action is in scope |

No G4-G work was started. No parent workflow command, quote confirmation, conversion, payment, coupon, contract, upload, or customer action was performed.

## Verification

| Command / suite | Result |
|---|---|
| `pnpm run verify` | PASS — boundaries, UI governance, Phase 1A/1B checks, typecheck, 44 unit-test files / 474 tests |
| `pnpm run test:uni-h5-g4f-phase1b-review` | PASS — 7 browser tests |
| Phase 1I submit/edit H5 integration | PASS — 4 browser tests; synthetic ports only |
| `pnpm run test:h5-review` | PASS — 32 browser tests; Chromium 153.0.8010.12 |
| `pnpm run test:uni-h5-review` | PASS — 4 browser tests |
| `pnpm run test:design-system-review` | PASS — 4 browser tests |
| `pnpm run check:g4e-review-harness` | PASS |
| `pnpm run check:g4e-closure-readiness` | PASS |
| `pnpm run build:uni-h5-g4f-review` | PASS |
| `pnpm run build:mp-weixin-review` | PASS — Design System review artifact, not a G4-F runtime smoke |
| `pnpm run build:mp-weixin` | PASS |
| `pnpm run build:app` | PASS |
| `git diff --check` | PASS |

The deterministic restart test restores a pending receipt after the simulated runtime boundary and proves readback retry does not dispatch a second child-workflow start or Order upsert. Build success is not represented as authenticated or device runtime success. The local MP DevTools CLI/artifact are present, but the isolated G4-F runtime harness/automator needed for a safe smoke is unavailable; no such smoke is claimed.
