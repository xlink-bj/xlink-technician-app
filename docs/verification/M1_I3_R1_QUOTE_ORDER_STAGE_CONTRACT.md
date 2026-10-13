# M1 I3 — R1 quotation (type=0) vs official Order (type=1) source resolution

**2026-10-13. Fixed, unmodified authoritative sources:**
- R1 `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`
- existing backend `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`
- new frontend engineering main-facing Draft PR #116 source baseline `05316a47d266c56bf11236ac1cbd320488b31076`

## Source-verified business stages (not live-tenant verification)

| Path | R1 observed call chain | Existing backend verified effects | New App allowed today |
| --- | --- | --- | --- |
| **报价 type=0** | `business/subpackages/order/placeOrders.vue:4999–5052` branches `this.type==='0' → quote()`. `:6907–6959` sets `type:0`, `exts.isCreateBjdPDF='1'`, POST-like `basic/order/creatQuotation` with `data=JSON.stringify(params)` | `modulemini/basic/OrderController.java:111–122` parses `data` and calls `handleCreatQuotation`; `service/basic/OrderServiceImpl.java:496–520,615–648` allocates an Order ID, uses tenant/order form pre-script, can generate PDF, **saves an Order document**. Not a pure calculation/preview | **NO real dispatch**; current new App local preview is an in-memory/nonbusiness state. This route is denied even if generic real-write flag is set |
| **正式下单 type=1** | R1 `placeOrders.vue:4200–4284` selects `type=1` and starts `workflow/startWorkflow/order/null/{workflowFormDefId}` unless an existing Order; `:4289–4342` then calls `basic/order/upsert` with `order=JSON.stringify(params)` | `OrderController.java:103–109` maps upsert to existing `OrderServiceImpl.upsert`; `:203–230,335–350` validates ServiceAppointment and pre-script; `:441–492` creates quotation PDF/warranty, may save a customer message, updates Order/ServiceAppointment totals and SLA. Some effects are conditional on sourceType, serviceType and flags | New App retains **type=1-only** `upsertOfficialOrder`, workflow-init and explicit write-gating with ambiguous-result protection/readback. NO Beta/Production Order write authorized by this source review |
| **附属写操作** | R1 `placeOrders.vue:4319–4320,4344–4348` can consume coupons. Existing `basic/order/orderConfirm`, `quotation`, `sendMessage` paths are not ordinary read APIs | Existing controller `OrderController.java:132–215` mutates Order/notifications; coupon redemption changes state | No new App business use. Transport explicitly denies those paths pending separately reviewed business process and customer-impact gate |

**Correction of earlier I3 blocker:** `type=0` and `type=1` are not conflicting formats for one single write. They are **distinct R1 business stages**, with different endpoints and workflow behavior. Both are potentially persistent operations; `type=0` is **not** an uncommitted quote preview. The previously recorded stage/route ambiguity is SOURCE_RESOLVED, but monetary pricing, per-tenant scripts, child workflow creation, authoritative results and R1 SKU runtime are NOT_VERIFIED in an actual authorized tenant.

## Engineering safety implementation

- `uni-api-command-transport.ts` now exposes `isUnapprovedR1QuotationStageMutationPath`, an **independent transport hard fence before Session, Mock and HTTP dispatch** for `creatQuotation`, Order quotation/confirm/sendMessage and coupon redemption. A generic `VITE_XLINK_ENABLE_REAL_WRITES=true` cannot bypass it.
- Does **not** change the existing signed/Contract `signature/*` hard fence, official Order `basic/order/upsert`, child Workflow route, Pricing Runtime, R1 payload encoder or backend code. R1 official `isCreateBjdPDF='1'` is intentionally retained under the existing never-authorized-in-Production write gate; it must not be mislabeled side-effect-free.
- Tests cover canonical + encoded/alias routes, no-call network/Mock behavior, malformed encoded path denial, the separate existing type=1 adapter validation, and non-overblocking ordinary reads/official order routes.

## Remaining evidence and permissions

- **CODE only:** static R1/backend sources and synthetic tests. No actual Production/Beta use of `creatQuotation`, workflow, upsert, PDF/SMS or coupon APIs; no test customer/customer PII.
- **Blocked external:** I2 real active SKU/Code; I3 real pricing & Order readback and tenant pre-script side effects; I6 real Contract and signer; MP/Android/iOS real runtime; Owner UX and explicit Beta business-write approval.
- Keep original **I3 3/4** (real golden data still unverified), M1 **1/8** formally accepted; no unapproved Draft merge or release.

**Important:** these route fences intentionally refuse potentially legitimate R1 mutation endpoints *until* a separately authorized, fully reproduced client sequence and intended recipient impact are demonstrated. Do not disable the fence merely to turn a CI check green.
