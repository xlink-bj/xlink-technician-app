# M1 I6 — R1 签约调用链 / 安全分界（源码固定版本）

**Status:** SOURCE VERIFIED for R1 entrypoints and selected existing backend effects; no real tenant read or writes. **I6 remains 2/4**, `#112` Draft; not a release gate.

- R1 front end: `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`
- Unchanged existing backend: `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`
- Authority: #89 frontend-only refactor; backend remains unchanged. UI source guard is **not** a backend permission grant.
- The R1 `common.osg.ajax` helper's transport HTTP verb has not been proven here; controller `@RequestMapping` alone does not prove verb. Exact path/body below are frontend-proven.

## Active R1 path

`business/subpackages2/workOrder/workOrder.vue:3373-3386` loads Orders and Contracts on the workflow `placeOrder` action; `:4583-4620` calls `basic/order/query` for the current WorkOrder; `:727-750` exposes offline/electronic signing **only** for `type==1 && processState==0 && exts.isAgain!=1`. `:772-885` renders an independent Contract tab. `:4898-4905` changes tabs. `:5025-5075` queries Contracts by WorkOrder and polls during pending states.

## Evidence matrix

| R1 frontend source | Existing request / input | Backend evidence and effect | Status for New App |
|---|---|---|---|
| `workOrder.vue:4583-4620` | `basic/order/query`, `workOrderId=this.id`, `_all=1`, state 0/1 | R1 lists many Orders per WorkOrder. This is distinct from local draft and from quote `type=0` | SOURCE_VERIFIED LIST; new read-only precheck already uses separately bounded `type=1` WorkOrder list |
| `workOrder.vue:5025-5075` | `basic/contract/query.do`, `_all=1`, `is:workOrderId\|string#and=this.id`, `in:state\|array-integer#and=1`, sort ascending updateTime | Backend `modulemini/basic/ContractController.java:48-57` applies current account `tenantId` then calls query | SOURCE_VERIFIED R1 READ; new App Contract list not yet wired/tested; role-specific live results NOT_RUN |
| `workOrder.vue:5117-5139` | `signature/applyForElectronicSignature`, `orderId_thread=item._id` (after explicit confirmation) | `modulemini/SignatureController.java:54-94` checks missing Order, processState 4, old contract; `SignatureServiceImpl.java:117-143` updates Order to state 4, generates Contract/PDF, begins online e-sign; `:248-297` may asynchronously upload document and send contract and SMS | **MUTATION + customer notification**; never invoked by read-only precheck |
| `workOrder.vue:5077-5115` | `signature/applyForElectronicSignature.do`, `orderId_thread=item._id, type=1` (after confirmation) | Same controller; nonempty `type` leads to `applyForOffLineContract` via `SignatureServiceImpl.java:141-148` | **MUTATION**, offline activation; must not simulate as local confirmation |
| `workOrder.vue:844-875,5231-5245` | `signature/againApplyForElectronicSignature`, `contractId` | `SignatureController.java:114-164` mutates Order state, clears signed fields, invokes signing service on one path | **MUTATION**, no blind retry. **SOURCE CONFLICT:** UI offers retry for `contractStatus=-3`, yet backend `:124-127` returns success early for exactly `-3`. Do not alter backend or claim retry effective without R1/live evidence |
| `workOrder.vue:869-875,5246-5260` | `signature/handleReminderContract`, `contractId` | `SignatureController.java:167-171` delegates reminder service; intended SMS resend per R1 action caption | **MUTATION / notification**, not safe to auto-repeat |
| `workOrder.vue:844-858,5199-5229` | `basic/contract/remove`, `id, cancelReason` | `modulemini/basic/ContractController.java:162-177` changes Contract by calling remove after status checks | **MUTATION**; cancellation guard is UI condition, not standalone authorization |
| `workOrder.vue:877-884,5261-5285` | Direct `qiniuUrls[last]` file download / image preview | R1 only exposes existing document URLs; attachment may contain PII or legally relevant signatures | Existing URL display/transfer is sensitive; **no PDF URL in current New App precheck** |
| `business/subpackages/contract/appendixes.vue:287-302` | `basic/contract/getSignatureUrl`, `sid, phone` | `modulemini/basic/ContractController.java:281-283` calls external signature-url service | Capability URL; **not an ordinary safe document preview** |
| `business/subpackages/contract/extForm.vue:905-996` | `createSupplementTreatypdf`, `createContractRefundpdf`, `createSingleSupplementTreatypdf` | Initiates supplement/refund business actions and sign process | **MUTATION**, distinct from initial Order signature |

## UI contract, not permission grant

- R1 initial buttons: `type=1`, `processState=0`, `exts.isAgain!=1`; R1 Contract actions: `contractStatus=-3` retry, `2` resend, `10/2/-3` + active state + no end date cancel. See `workOrder.vue:727-750,844-875`.
- Pure testable projection: `src/features/work-orders/signing/r1-signing-ui-rules.ts`. It does **not** call an API or provide signer entitlement. `signing-order-read.vue` displays the Order phase as a read-only notice; all Contract/Sign controls stay disabled.
- R1 `processState=4` means signing in progress, **not** signed; `getOrders` polling and `getContracts` polling are distinct. Back-end async signing can complete after initial request, so do not infer success from HTTP acceptance alone.
- R1 UI's `again=-3` vs backend early success is a **verified source discrepancy**. Escalate with reproducible existing-environment evidence, not speculative backend change.
- Backend `SignatureServiceImpl.java:283-329` shows SMS notifications for the appropriate source-type path; don't treat a send command as a pure read.
- Frontend file-source checks do not independently prove actual live role permissions, successful Contract readback, PDF authority, or post-signature workflow state.

## Next engineering gate

1. Preserve session/role-scoped Order precheck; integrate R1 Contract LIST only when using existing R1 request shape and scoped current-role WorkOrder membership, sanitized data, no PDF/QR capability; add cross-role/stale/multi-order tests. **No new backend ACL/interface.**
2. Build Contract status UI against authoritative list with states/error/empty/expired/retry separated. Route to next actions only after existing backend/R1 parity and separate Beta write approval; no silent SMS resend or duplicate sign.
3. Exact-HEAD tests/typecheck, H5, MP/App build in CI; Codex assists only with local R1/tenant/physical-device evidence. No Production business mutations, main merge, or claim of 4/4.
