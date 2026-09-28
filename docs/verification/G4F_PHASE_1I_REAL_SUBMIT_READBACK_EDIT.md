# G4-F Phase 1I — Real Submit + Readback + Edit

Status: implementation candidate for Web Review. This document records source evidence and code behavior; it is not authorization to execute a live mutation.

## Source evidence inspected

- R1 frontend: `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29`, `business/subpackages/order/placeOrders.vue` (`fillOrder`, `doSaveOrder`, `startWorkflow`, `getOrderById`, and package material quantity calculation).
- Backend: `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`, `OrderController`, `OrderServiceImpl`, `Order`, `PayExtDataEntity`, `ExtDataEntity`, `DataEntity`, and `Entity`.

## Mutation contract matrix

| Contract item | Status | Evidence / implementation consequence |
|---|---|---|
| `basic/order/upsert` | VERIFIED | `OrderController.upsert_pc` accepts form parameter `order` as JSON; adapter sends exactly `{ order: JSON.stringify(order) }`. |
| Create vs update identity | VERIFIED | Backend branches on `_id` absence; create assigns a server ID, update loads the existing Order and saves the supplied snapshot. Create success returns `data: order`, including its assigned `_id`. |
| `type=1` official Order | VERIFIED | R1 `fillOrder(1)` emits type 1; adapter rejects any other type before dispatch. |
| `serviceAppointmentId` | VERIFIED / REQUIRED | Backend looks up the active ServiceAppointment by this ID and rejects missing/inactive records. Payload uses the current WorkOrder identity. |
| `workflowId` | VERIFIED / REQUIRED FOR NEW CREATE | R1 starts `workflow/startWorkflow/order/null/{workflowFormDefId}` with `{saId}`, then assigns returned `entity._id` to `params.workflowId`. Existing-order edit does not start this child workflow. Missing child definition blocks create. |
| Child workflow start response | VERIFIED | Backend `WorkflowController.startWorkflow` returns `ReturnStatus(status=1, entity=Workflow)`. The command normalizer explicitly accepts this source-backed envelope. |
| `ownerName` | OPTIONAL / TENANT SCRIPT UNKNOWN | R1 includes an editable name. Backend upsert service does not require or default it in the inspected method; tenant-specific pre-script may impose extra requirements. Current payload omits it rather than guessing a person identity. |
| `ownerPhone` | OPTIONAL WITH SERVER FALLBACK | R1 includes an editable phone. Backend create defaults an empty value from ServiceAppointment phone. Current payload omits it; no masked/display phone is sent. Tenant pre-script behavior remains unknown. |
| `description` | OPTIONAL / PRODUCT INPUT DEFERRED | R1 serializes the description field; no required check appears in the inspected upsert path. Current composition UX does not own this input and omits it. |
| `exts.serviceAppointmentNum` | OPTIONAL, SOURCE-BACKED | R1 copies the ServiceAppointment order number; current encoder includes it only when the detail projection supplies it. |
| `exts.serviceType` | VERIFIED, SOURCE-BACKED | R1 sets it from the active service type; current encoder requires the adapter-derived WorkOrder catalog context. |
| `exts.sourceType` | OPTIONAL, SOURCE-BACKED | Backend create copies it from ServiceAppointment when available. Current encoder includes only the observed catalog context value. |
| `exts.isCreateBjdPDF='1'` | VERIFIED, SIDE-EFFECTFUL | R1 sets this on save; backend generates quotation/warranty documents and a message when present. This has been retained because it is the active R1 path; the side effect requires prominent confirmation and is not exercised here. |
| Coupon fields | VERIFIED AS R1 FIELDS; MUTATION DEFERRED | R1 supports coupon use/activation commands. Phase 1I does not invoke them; payload keeps only neutral values. Existing non-neutral coupon state blocks edit. |
| Returned Order identity | VERIFIED FOR UPSERT | Backend returns the saved Order in `ReturnStatus.data`; adapter requires its `_id`. No client-generated identity is used for create. |
| Readback endpoint/query | VERIFIED | R1 uses `POST basic/order/queryById` with `{id}`; adapter maps a minimal Order read model and explicit replace-snapshot fields. |
| PDF URL field | PARTIAL | `Order.qiniuList` is a transient list in the backend model. The read adapter accepts non-empty strings, but a stable per-order URL contract and cross-platform open behavior have not been proven. No PDF link is presented as validated. |
| `state` / `processState` | VERIFIED AS BACKEND FIELDS; EDIT REQUIRES `state=1`, `processState=0` | Backend uses active Order state and process state. Missing values fail closed for replacement editing. |
| Update replace-snapshot | VERIFIED, GUARDED | Backend update saves the supplied Order object; R1 starts from its loaded Order and mutates selected fields. Adapter carries the entity field set, including inherited payment/settlement fields. Non-neutral or unrecognized commercial/payment state blocks edit. |
| Server side effects | VERIFIED | Upsert validates active ServiceAppointment, creates order number and snapshots, runs tenant Order pre-script on create, generates PDF/warranty and message for `isCreateBjdPDF=1`, saves Order, updates ServiceAppointment total/paid amounts and pay state, and invokes SLA update. Errors from some post-save services are caught by backend. |

## Standard Package quantity

R1's non-SKU Package encoding derives each package material row as:

```text
ceil(package.number × material.coefficient / Number(material.material.spec))
```

The current encoder applies this only at payload generation time. It does not persist derived quantity into the local draft. Missing/non-finite/non-positive package quantity, coefficient, or material spec blocks encoding. Explicit `pricingMethod === '1'`, direct SPU/SKU materials, and other SKU paths remain unsupported. Tests cover formula parity and invalid inputs.

## Command boundary and execution gates

- `QuotationOrderCommandPort` is independent from catalog reads and parent Workflow Runtime commands.
- The adapter exposes only the verified child Order workflow start and official type-1 Order upsert.
- Real transport requests to `basic/order/upsert` and `workflow/startWorkflow/order/null/{id}` remain blocked unless `VITE_XLINK_ENABLE_REAL_WRITES=true`; that flag was not enabled for this work.
- No Beta or Production write request was executed.
- There is no `workflow/process`, parent workflow complete, quote confirmation, conversion, payment, coupon, or contract command in this path.

## State, duplicate protection, and readback

The persisted receipt contains only version, WorkOrder/node scope, local payload fingerprint, draft version, and optional child workflow/Order IDs. It contains no payload, customer fields, phone, credential, or raw response.

- The receipt is written before each external dispatch.
- A durable `prepared` receipt is explicitly pre-dispatch and may be superseded by a changed local payload; all dispatch/ambiguous/success states retain their existing no-blind-retry protections.
- A single-flight lock collapses repeated in-process submissions.
- Ambiguous start/upsert outcomes remain blocked from blind resubmission.
- Confirmed write success is recorded before readback. Readback failure remains business success with refresh pending; retry is read-only.
- Local draft finalization runs only after authoritative readback and only if the current payload fingerprint and draft version still match the submitted snapshot. A later local draft is not deleted by delayed readback.
- If a successful write cannot be followed by a durable receipt update, the earlier pre-dispatch marker still blocks another mutation. That record may require manual operational reconciliation; no automatic retry is attempted.

## Existing Order reconstruction and edit

- Read is by `basic/order/queryById` and must prove `type=1`, matching Order ID, and matching current ServiceAppointment.
- Reconstruction uses `bjProducts.orderList[]`; missing repair-part identity, group structure, item IDs, names, quantities, package component identity, or unique selected material layers makes the Order read-only. Package component identity preserves the saved component `_id`, embedded catalog item `_id`, explicit reference only when present, and exact supplied layer; no reference is synthesized from catalog identity.
- Current Package/Procedure/Material/Measure providers rehydrate the reconstructed identities before enabling edit.
- Existing local unsaved draft is never overwritten.
- Update sends the same `_id`, a projected existing Order snapshot plus current type-1 payload, and `processState=0`; it does not start a new child workflow.
- Missing/unsupported state, non-neutral discount, coupons, preferential/other amount, contract/payment/settlement state, product snapshots, additions/deletions, SPU/SKU rows, or SKU Package configuration blocks destructive edit.
- PDF URL presentation remains deferred until a valid URL and safe cross-platform open contract are established.

## Verification and safety result

Implementation tests use synthetic IDs and fake ports/transports only. No live credentials are read by the test suite.

No Beta/Production mutation, real Order write, customer action, coupon action, contract/payment action, parent workflow mutation, or G4-G work was performed.

Quotation Order readback is owned by the dedicated `QuotationOrderReadPort` / `quotation-order-api.ts` boundary. `TechnicianApiReadPort` and `technician-api.ts` do not own `basic/order/queryById` or Order normalization. The product submit confirmation and Action Workspace shell are shared by the production page and isolated H5 review harness; the harness injects synthetic ports only.

Verification on the review correction worktree:

| Command / suite | Result |
|---|---|
| `pnpm run verify` | PASS — boundaries, UI governance, Phase 1A/1H checks, typecheck, and unit suite |
| `pnpm test` | PASS — 44 files, 470 tests |
| `pnpm run test:h5-review` | PASS — 32 Playwright tests; Chromium 153.0.8010.12 |
| `pnpm run test:uni-h5-review` | PASS — 4 Playwright tests |
| `pnpm run test:design-system-review` | PASS — 4 Playwright tests |
| `pnpm run test:uni-h5-g4f-phase1b-review` | PASS — 7 Playwright tests; this isolated harness intentionally does not expose real Order submission |
| `pnpm exec playwright test --config playwright.uni-h5-g4f-review.config.ts tests/h5-review/g4f-quotation-phase1i.spec.ts` | PASS — synthetic product Action Workspace confirmation/single-flight lock, readback-pending blocked state, supported orderId edit, unsupported edit read-only, no external requests |
| `pnpm run build:uni-h5-g4f-review` | PASS |
| `pnpm run build:mp-weixin-review` | PASS |
| `pnpm run build:mp-weixin` | PASS |
| `pnpm run build:app` | PASS |
| `git diff --check` | PASS |

The product Action Workspace submit/edit UI is not authenticated against Beta in this slice. H5 integration evidence uses synthetic in-memory command/read ports against real product components; it is not live command execution evidence. Production write capability remains disabled in the review build configuration.

## Remaining constraints / UNKNOWNs

- Tenant-specific Order pre-script requirements for owner name/phone/description are not proven. These fields are omitted unless later evidence defines a safe source and need.
- `qiniuList` URL validity and cross-platform PDF open behavior are not proven; no actionable PDF link is claimed.
- The safety receipt is client-local and is not a server idempotency key. After ambiguous mutation plus unavailable read identity, operator/backend reconciliation is required; automatic retry stays prohibited.
- Real Beta chain validation and any real write are reserved for a separately authorized phase.
