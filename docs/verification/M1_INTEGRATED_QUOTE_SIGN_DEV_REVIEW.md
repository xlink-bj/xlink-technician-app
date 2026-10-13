# M1 Integrated DEV Review Candidate — Quotation + Signing + UX Phase A

Date: 2026-10-11
Status: **REVIEW BRANCH / DRAFT ONLY / NO BUSINESS AUTHORIZATION**
Scope: Login → Work Orders → Appointment → Survey → Quotation → Signing (DEV Mock only).
Out of scope: Construction/Acceptance, Production SKU/Contract reads, Order submission, signature/PDF/SMS/workflow writes.

## Integration sources and hashes

This single branch is based on source-audited quotation [Draft #84](https://github.com/xlink-bj/xlink-technician-app/pull/84) exact HEAD `859174902c472cec831958b382e56c6b5e4aba22`, and integrates verified bounded files from two *independent* unmerged candidates:

- Signing [Draft #65](https://github.com/xlink-bj/xlink-technician-app/pull/65) pinned `77dc9f9d0f9888624bb8b7978739bf2c2b1a1828`: `src/app/signing-mock-review.ts`, `src/pages/work-orders/signing-mock-review.vue`, Signing Mock unit tests, source audit docs. The navigation registration and dev-only links are **applied to #84's latest versions**, not wholesale overwrite of action-workspace/quotation.
- UX Phase A [Draft #85](https://github.com/xlink-bj/xlink-technician-app/pull/85) pinned `1a3bed67eb514303bfc7284ab618caa9265576d0`: four-screen standalone HTML, dual-device Chromium screenshot tests and Owner decisions. **Not** installed as the official Vue Quotation component. Existing commercial Quotation UX gate #41 remains NOT APPROVED.
- All prior #84 features retained: P1 M1.6 current main Action DEV-only Quote Catalog SKU identity → scoped source preflight → synthetic sales options diagnostic and its negative tests. These do not authorize live Material/CodeService reads.

## Actual integrated main App data journey

1. Normal main App Mock Home opens the existing MOCK-019 continuous journey (Appointment → Survey → Quotation).
2. Quotation uses its **existing ActionWorkspaceShell**, actual local persisted grouped QuotationDraft, and existing DEV-only synthetic source identity/option diagnostic; save/official submission disabled in Mock and Production read-only.
3. Quotation's journey-context slot shows **next stage preview / independent signing Mock**. The copy explicitly says this local draft has **not been submitted** and did **not** generate an official Order.
4. Following the guarded DEV-only route opens an Order-specific Signing Mock read-only workbench. The model contains one WorkOrder, two *separate* synthetic type=1 Orders (one Order has two repair groups) and a Contract owned only by the second. A local draft is not made into an Order or Contract.
5. Switching Order changes Contract existence. Testing conceptual pending/signed/failed/expired, no-orders and read-failed states affects only local synthetic display. PDF preview and "发起签约" are **disabled**. No remote Contract read, status-sync, legal/financial terms, signer identities or customer communications.
6. Separate standalone #85 four-screen high-fidelity *proposal* can be opened and screenshotted in isolation; owner approval is a gate before changing the production Quotation front-end. No interaction in the proposal causes actual state changes in the uni-app app.

## Security and domain invariants

- **Business rule:** Source owner explicitly selected `Quotation Action → official Order.type=1`, not interim `type=0` quote/confirmation. Signing from an **authorized server-created Order ID** only, not a locally saved draft. R1/backend service appointment can have N Orders; Order can have N repair parts; Contract is bound to an Order ID and appointment ID. No arbitrary one-part-per-order rule.
- **No fake workflow:** Signing-specific Workflow Action is not authenticated/mapped in current Runtime; Mock review is not a production Action Workspace capability.
- **No real API:** Backend Material mini `/query` routes to GoodsServiceImpl.queryWithRank and `sourceType` presence changes org/scope filters; server WorkOrder→SPU ACL unknown (#75). CodeService selectCode accepts caller tenant, policy unknown. Live SKU read BLOCKED.
- **No live Contract:** ContractService conditional org/scope and Contract queryById direct findById lack independently verified ownership/role predicates. "Get signature URL", sync status, PDF generation, offline/online apply and reminders may mutate, write documents or contact third parties. All BLOCKED (#39).
- **No privileged Production use:** DEV H5 Mock with test-only user/role, no credentials, disabled official Order/contract commands. Screens contain synthetic identity, not customer PII.
- **No implicit stage completion:** A separately passing H5 Mock walk-through does not prove official submitted Order, signed Contract or Workflow Completed.
- **No build-to-device equivalence:** MP/native compilation success is not a real WeChat Developer Tools/Android/iOS runtime proof (#64).

## Consolidated regression gate

At exact integrated HEAD, verify independently:

1. Architecture boundary + UI governance + TypeScript + complete Vitest regression, including #84 SKU scopes and signing #65 identity/status tests.
2. WeChat Mini Program and uni-app App bundles.
3. Main App H5 Login shell 2/2, Quote Mock grouped/edit/persist/reload and SKU guards, integrated Quotation → independent Signing navigation, per-Order identity, error/status/disabled actions across 375 and 390px, **no external network intent**; legacy G4-F H5 unchanged.
4. Four-screen offline Owner concept tests at 375 and 390, 8 screenshots, categories, selection preservation and disabled commercial actions.
5. No unexpected write transport: no invocation of basic/order/orderConfirm, signature/applyForElectronicSignature, signature/syncContract, contract/pdf, SendMessage or Workflow Complete.

## Integration / next steps and owners

- **Web Lead:** review one CI run on *the same exact integrated HEAD*, inspect new main App Signing screenshots and existing #85 four-screen proof; publish retained blockers. Does **not** merge.
- **Product Owner #41:** decide on Workbench first fold, catalog cards/category behavior, package detail and return/modify UX. Only after acceptance should commercial Quotation Phase B be implemented.
- **Backend #75/#39:** prove authenticated WorkOrder/role/tenant scoped SKU and Order/Contract read predicates and per-Order signature entitlement, review status side effects, before bounded Beta reads. Existing backend source remains reference-only until separately authorized.
- **QA #64:** actual WeChat/Android/iOS runtime checks independent.
- **Business release:** separately approve disposable Beta `Order.type=1` and Sign/Contract workflows, with rollback and readback; never infer from Mock.

Gate: `INTEGRATED_DEV_M1_CODE_PENDING_EXACT_CI / OWNER_QUOTATION_UX_PENDING / LIVE_SKU_CONTRACT_AND_SIGNING_BLOCKED / NO_MERGE`.
