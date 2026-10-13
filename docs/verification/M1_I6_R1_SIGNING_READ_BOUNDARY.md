# M1 I6 — R1 Order / Contract / Signing read boundary preflight

**State:** PREPARATORY CODE; not a real Contract integration and not I6 ACCEPTED. R1 pinned SHA: `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`. New App stack: Draft #107; Codex I2 authorized Production sample still waiting on a locally known accessible SPU.

## Pinned R1 source facts versus proposed New App boundary

| Topic | R1 evidence at pinned SHA | New App source / direct implementation | Gate |
| --- | --- | --- | --- |
| Official Order is distinct from a quote | `business/subpackages/order/order.vue` comments that `type:0` means quotation, `type:1` Order (approx line 1000); `placeOrders.vue.quote()` sends `type:0` to `basic/order/creatQuotation` | `src/shared/ports/quotation-order.ts` `QuotationOrderBrowseItem.type:1`, `basic/order/queryById` via `quotation-order-api.ts`; only officially returned type=1 can enter Signing preview | **No local type=1 candidate or unconfirmed quote** can be used as signed Order |
| R1 edit/contract gating | `business/subpackages/order/order.vue` lines 960–990: cancel only when unpaid and no `contractId`; edit only when `type==1`, not process complete, and `exts.isAgain==1 || !contractId`; lines 1146–1160 warn signed Contract must be cancelled / new Order | Signing review does **not infer** eligibility to sign from Order status or edit guard; no mutation route | Source describes edit/cancel guards, **not** sufficient signer authorization |
| Contract type and status | `business/subpackages/contract/appendixes.vue` shows `contractdocNum`, `supplementTreatyStatus`, `contractRefundStatus`, `singleSupplementTreatyStatus`, `qysTradeIn` (electronic/offline) | Local signing preview permits only display of currently WorkOrder-bound Order metadata | Contract status/source and signer roles **unverified**; no contract read automatically implied |
| Supplementary Contract queries | `business/subpackages/contract/appendixes.vue` lines 259–281 reads three separate `basic/contract/query...do` endpoints with `_all:1` | The new read-only workspace **never calls** these routes; only bounded `listTypeOneOrdersForWorkOrder(...,3)` then scoped `readScopedTypeOneOrderForSigningReview(workOrder,order)` | Different resource permission required, leave blocked |
| Electronic signing QR | R1 `appendixes.vue` ~289 uses `/basic/contract/getSignatureUrl` with `sid` and phone; displays QR | New workspace **never** requests signing URL; `signingAuthorized:false` hard boundary | QR carries signing capability: separately gated, not a harmless image-read |
| Contract add/deduct/refund/appendix | R1 `business/subpackages/contract/extForm.vue` lines 905–996 explicitly confirms electronic/offline flow and creates PDFs via `createSupplementTreatypdf.do`, `createContractRefundpdf.do`, `createSingleSupplementTreatypdf.do` | No calls, no generated Contract, no PDF or SMS claims. Synthetic Mock signing page is a preview only | These operations produce business side effects and require new authorized write contract |
| Consumer contract | `consumer/subpackages/contract/contracts.vue` lines 115–126 uses `/basic/contract/myContract` filtered by work order and Contract ID | Technician WorkOrder role cannot borrow Consumer contract visibility | Consumer permission is NOT technician signing entitlement |

## Preparatory I6 handoff implementation

`src/features/work-orders/signing/signing-review-read-workspace.ts` creates an **ephemeral** two-read coordinator:
1. Requires current session, role ID and version, exact WorkOrder/Order IDs, and caller-provided live role-visible WorkOrder membership. No stale session/role may reuse a prior preview.
2. First lists only up to three authoritative type=1 Orders for the WorkOrder. Exact selected Order must be in the returned visible subset. Absence on page 1 does **not** mean the Order does not exist.
3. Then reads the **exact** selected Order through the existing scoped, sanitized `readScopedTypeOneOrderForSigningReview` read port, checks both identities and both `signingAuthorized:false` / `contractReadAuthorized:false`.
4. Resets on next selection, logout, role-version change, WorkOrder switch or loss of live WorkOrder membership. Older async completions never overwrite a newer preview.
5. No Contract/PDF/raw Order/QR/phone return or persistence. No command port, real write, SMS or contract state transition.

**Tests** `tests/g4f/signing-review-workspace.test.ts`: positive identity-bound read, unknown ID, wrong owner/type, duplicates/overlarge pages, missing role, stale membership/session/role, multi-order selection, sanitized failures, capability false.

## Deliverables and non-claims

- This is a read-only orchestration module and tests, **not yet wired into production signing UI**. The existing signing mock page stays synthetic and clearly distinct from a formally created Order.
- R1 actual Contractor/User signer roles, authoritative Contract status, exact signing workflow, merchant authorizations and side effects remain **NOT_VERIFIED**. No direct Contract/QR/phone access.
- I6 remains **PLANNED**, though the **preflight code** can independently reach CODE_PASS. This does not increment the eight-iteration acceptance count.
- I2 live SKU evidence currently `BLOCKED_NO_APPROVED_SPU` with zero Production requests (see #92); I3 synthetic golden tests CODE_PASS but `type:0` vs `type:1` real-stage parity remains unresolved.
- Owner #41 / Beta #29 / physical device #64 remain independent. No merge or Production business write authorized.
