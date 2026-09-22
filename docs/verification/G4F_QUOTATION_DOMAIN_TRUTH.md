# G4-F Quotation Domain Truth — Phase 0 Evidence

Status: **SOURCE-BACKED LEGACY EVIDENCE / CONTRACT PARTIAL**

Repository baseline: `rebuild/g4e-onsite-inspection` at `b0a55ee5c694d2bc458e4eee4091a9fed2809f34`
Scope: static source inspection of R1 (`xlink-app`), backend (`xlink-cloud-backend`), and the current technician-app architecture. No Beta/Production API or database was contacted. No business write was issued.

This document records what the checked-in source proves. It is not a production quotation contract: the R1 project has tenant/service-specific behavior, dynamic workflow definitions and Groovy hooks, while the current active Beta quotation contract was not captured in this phase.

## Decision summary

- The legacy backend explicitly models `Order.type = 0` as a quotation and `Order.type = 1` as an actual order. The quotation is an `Order`, not a generic dynamic form record.
- R1 uses a **controlled quotation editor** for nested packages, procedures, materials/SKUs, measures, quantities, discounts and totals. `ExtField(colName=order)` supplies additional configured order fields; it does not replace the structured quote-line model.
- Formal `ProjPackage` selection exists in the quotation editor. The R1 Survey `serviceGoods` field is a separate Survey-era feature and is not evidence for the formal quotation package contract.
- R1 computes the displayed/submitted total in the client. Backend provider queries supply organization-scoped approved prices, and the quotation creation service runs a tenant-specific `order` pre-script before persistence. Therefore overall pricing authority is **MIXED / TENANT-DEPENDENT**, not a single verified formula contract.
- Quote creation, customer confirmation, conversion to an actual order, and workflow processing are distinct source paths. The source does **not** prove that creating a quote completes the active `placeOrder` workflow node, nor that customer confirmation is universally required before conversion.
- The current app has reusable Action Workspace and user/work-order/node-scoped draft infrastructure, but quotation execution remains deliberately unverified by Workflow Runtime policy. The nested quote editor, line codec, price reconciliation and quote-specific command/read contract are new business capabilities.

## 1. Business sequence

| Stage | Source-backed behavior | Evidence / certainty |
| --- | --- | --- |
| Workflow entry | R1 exposes the quotation/order entry from an active `placeOrder` node; the launch passes the work-order ID, workflow form-definition ID, runtime node ID (`orphanId`), service type and source type. In the inspection appointment screen the action is gated by the active node and handler checks. | R1 mobile behavior is verified; actual node definition and upstream prerequisites are runtime/config data not present in these repositories. |
| Survey completion → quote availability | No source in this audit proves that Survey completion is the rule that unlocks `placeOrder`. The R1 page checks the active workflow node; it does not read a Survey record to decide quote availability. | **UNKNOWN** — dynamic workflow configuration/business rule required. |
| Create quotation | R1 submits `Order.type=0` to `basic/order/creatQuotation`; backend assigns identity/creator/tenant/order number, executes the `order` Ext pre-script if configured, optionally generates a PDF, then saves the `Order`. | Source-backed legacy flow. PDF-generation exceptions are caught in the service before the Order save continues; this is not proof that every tenant always has a PDF. |
| Edit saved quotation | Backend `basic/order/upsert` has an existing-ID update path. R1 has a quote-to-order action for type 0, but the inspected mobile list does not expose the same ordinary `编辑` control for type-0 rows that it exposes for eligible type-1 orders. Whether product users may edit a quote in place in the currently deployed flow is therefore **PARTIAL / UNKNOWN**. | Backend update capability verified; user-facing quote-edit entry not verified. |
| Customer confirmation | A separate confirmation record is created when a quote is sent; the customer-facing `/i/bjd/quotation.do` action marks that confirmation record and `Order.exts.confirm` as confirmed. | Separate from quotation creation and from order conversion. Whether confirmation is mandatory is not proven. |
| Quote → actual order | R1's “转为订单” path starts an `order` sub-workflow, then saves type 1 through `basic/order/upsert`. Backend update logic detects type 0 → type 1 and creates a new official-order ID. | Separate from quote creation; exact business authorization/confirmation prerequisite remains unverified. |
| Workflow completion / next state | Quote creation's `creatQuotation` path does not call the generic workflow process endpoint. Generic workflow processing exists for forms, and R1 starts an order sub-workflow during conversion; no checked-in workflow definition proves exactly when the original `placeOrder` node completes or what next node is selected. | **UNKNOWN** — require the active workflow definition and a read-only runtime trace. |

**Save != Complete remains the required invariant.** In the observed R1 flow, “生成报价” creates/persists a quote; customer confirmation is another endpoint; quote-to-order conversion starts another workflow and writes an actual order. No evidence establishes that quote Save itself completes the parent workflow node. Do not couple quotation Save to Workflow Runtime completion.

**Actors:** R1 shows the quote entry under a `placeOrder` workflow node and checks the handler in the inspection appointment view. `handleCreatQuotation` requires an active authenticated backend `User` and stamps creator/updater identity. Customer confirmation is performed through the separate customer-facing confirmation form. Tenant role-to-node authorization details remain configuration/runtime-owned.

## 2. Domain identity and persistence

| Concept | Verified model | What is not proven |
| --- | --- | --- |
| Quotation identity | `Order._id`; `Order.type=0` (`DEMO_TYEP`). | No independent Estimate/Quotation entity was found in the inspected path. |
| Actual order identity | Also `Order._id`, with `type=1` (`OFFICIAL_TYEP`). Conversion from type 0 through `upsert` creates a new ID for the official order. | No universal order/quote revision-number model. |
| Work-order relation | `Order.serviceAppointmentId` and `serviceAppointmentNum`; R1 list queries by `serviceAppointmentId`. | The active production field values/constraints were not read. |
| Quote line snapshot | `Order.bjProducts` is a serialized JSON string. R1 builds it from `orderList`, `addItems`, `deleteItems`, `otherItemsAmount` and `preferentialAmount`; backend quotation PDF generation reads `bjProducts`. | No schema version or quote-price snapshot version was identified. |
| Other product snapshot | `Order.productIds`, `productsDetail` and `materialDetail` also exist. In the R1 type-0 quote request, `productIds` is sent as an empty array while quote lines are assembled in `bjProducts`; backend's `productsDetail` derivation is based on `productIds`. | Do not treat `productsDetail` as the quote-line authority without checking real records and the active PDF/consumer path. |
| Survey relation | The typed `Survey` has `sid`, `orderId`, and `contractId`; `Order` has `serviceAppointmentId` and `contractId`. R1 quote editor loads the `ServiceAppointment`, not a Survey entity/form. | No direct `surveyId` on `Order`, and no verified writer assigning `Survey.orderId` in the inspected save path. The exact Survey-to-quote association is **UNKNOWN**. |
| Confirmation identity | Sending creates a separate quotation-confirmation form record with its own `_id`, `orderId`, `pdfUrl`, `tenantId`, and `confirm`. Customer confirmation receives that form-record ID, then updates the associated Order's `exts.confirm`. | This is not a quotation revision ID. Re-send/multiple-record semantics and idempotency are undocumented. |
| Revision/version | Existing-ID `upsert` can update an Order; a new `creatQuotation` allocates a fresh Order ID. | No explicit quote revision/version field, optimistic concurrency token, price-list version, or single-active-quote constraint found. Multiple Orders can be listed for one service appointment. |

The backend `CostingEntry` model uses quote snapshot array-name/index in its `typeId` when `type` is quote-related. That is supporting evidence that quote details are nested/indexed snapshot data, not a generic scalar field bag; it is not the quote editor's complete persistence schema.

## 3. Package and product semantics

### Classification

| Capability | Classification | Evidence and boundary |
| --- | --- | --- |
| `ProjPackage` selection in quotation editor | `ACTIVE_QUOTATION` | R1 `placeOrders.vue` loads `biz/projPackage/queryWithRank`, filters by service type/source/state, displays repair-part and age-limit filters, and fetches package details with `biz/projPackage/findById/{id}`. Quote lines store selected package data under each `orderList` entry's `projPackages`. |
| Procedures / materials / measures | `ACTIVE_QUOTATION` | R1 has separate ranked providers and line groups: `biz/procedure/queryWithRank`, `basic/material/queryWithRank`, and `biz/measure/queryWithRank`; package material SKU lookup uses `basic/material/query`. |
| Survey `serviceGoods` | `SURVEY_LEGACY` | The R1 Survey form (`inspectionAppointment.vue`) has a `serviceGoods` field and queries packages for that Survey field. It is not the structured quotation editor's line model. **Do not restore this as quotation truth.** |
| Other product/SKU catalogs outside these paths | `UNKNOWN` | No broader current active production catalog contract was established. |

### Provider filters and price source

The R1 quote editor asks ranked providers for enabled items and passes `serviceType` and `sourceType`; package filtering by selected repair part and `agelimit` also occurs in the editor. The backend ranked mini-app controllers set `form=mini`. `GoodsServiceImpl.queryWithRank` scopes catalog rows to the current tenant/organization and, when applicable, overlays approved active organization price-body values:

- package: `ProjPackagePriceBody.guideUnitPrice` → returned `ProjPackage.price`, and `minimumGuideTotalPrice` → `minimumPrice`;
- procedure and measure: corresponding approved price body → `guideUnitPrice` and `minimumGuideTotalPrice`;
- material: mini-app result exposes the service price as `price`.

This proves the legacy provider path and its price overlay, not current Beta prices, selection rules, or freshness/version semantics. No quote payload field or provider response token was found that lets a saved local quote prove which price-list revision it used.

## 4. Pricing model and authority

R1's `calcTotalPrice()` computes the visible total on the client. The observed categories are:

- package price plus package-material markup, with a package minimum-start amount;
- procedure guide-unit-price × quantity, with a minimum total;
- materials/SKUs by provider price × quantity;
- measures by guide-unit-price × quantity;
- custom add/delete rows by entered price × quantity;
- coupon amount, discount multiplier and preferential amount.

The quote serializer additionally stores per-line/category totals and top-level `originPrice`, `otherAmount`, `preferentialAmount`, `discount`, `totalPrice`, `description`, coupon data and owner fields. Amount helper `amountToFixed` uses JavaScript `toFixed(2)`.

**Authority classification: `MIXED` (legacy R1 path), with production contract still `UNKNOWN`.** The client calculates the quote totals and submits those values; the inspected backend `handleCreatQuotation` does not show a separate authoritative total recalculation, but it does execute tenant-configured `order` pre-script before saving. Provider prices are supplied by backend ranked queries. Therefore a universal claim that either client or backend exclusively owns final pricing would be false.

Specific unresolved items:

- whether current Beta uses these exact formula branches or the same R1 client page;
- whether manual overrides are allowed for catalog rates beyond the explicit custom add/delete rows;
- how `otherAmount` participates in the final total in every service/source variant;
- whether tax is included, excluded, or applied at another stage. Backend PDF code contains more than one template statement about tax treatment, so tax must be treated as service/template-specific until mapped;
- rounding rules at each intermediate/final boundary and authoritative server validation;
- discount/coupon stacking limits and stale-coupon behavior;
- price-list versioning and stale-price conflict/reconciliation. No version check was found.

No new formula should be implemented from this legacy client calculation alone.

## 5. Survey → quotation handoff

The quote editor's R1 initialization reads the work order (`ServiceAppointment`) and passes `serviceType`, `sourceType`, and work-order ID into the quotation flow. It does not query `Survey` or a Survey form-data ID in the inspected quote-page path. The quote's `orderList` has its own `repairParts`, location/description and area fields; their presence does not prove they are copied from Survey.

| Survey candidate | Classification for the inspected R1 quote path | Evidence boundary |
| --- | --- | --- |
| Survey `part` | `UNKNOWN` | Quote lines have independent `repairParts`; no direct Survey read or mapping was found. |
| Survey measurements / area | `UNKNOWN` | Quote line `maintainAreaNum` exists, but no Survey measurement read/copy was found. |
| Survey leakage cause | `NOT_USED` | No read/use was found in the inspected quotation editor path; this does not assert every tenant/custom script ignores it. |
| Survey memo/advice | `NOT_USED` | No direct Survey read/use found in the inspected path; dynamic `order` pre-script remains outside source-level certainty. |
| Survey media | `NOT_USED` | No Survey media read/copy found in the inspected quote path. |
| Survey `serviceGoods` recommendation | `NOT_USED` as formal quote selection; the field is `SURVEY_LEGACY` | Formal quotation packages are selected from quote-stage providers. Do not migrate Survey selections into quote lines without an explicit product rule. |
| Work-order service/source context | `LIVE_REFERENCE` / provider context | Quote reads the ServiceAppointment and uses service/source type in provider requests; quote Order stores the ServiceAppointment ID/number. |

These are source-path findings, not assertions about current live Beta records. The handoff contract needs read-only evidence of an actual active Survey and quote in the same workflow before any snapshot policy is implemented.

## 6. Read contract matrix

Methods below are the R1 `common.osg.ajax` default (`POST`) unless otherwise noted. The R1 wrapper treats HTTP 200 with `success === false` as failure and does not invoke the success callback; literal `restart` is handled as session expiry. Endpoint-specific retryability and reconciliation are not documented by that wrapper.

| Purpose | Endpoint / method | Request shape | Response / identity | Failure and evidence |
| --- | --- | --- | --- | --- |
| Quote/order list for a work order | `basic/order/clearOrderFieldQuery` / POST | `_all=1`, `serviceAppointmentId`, `state in 0,1`, descending `createTime` | `FlipInfo<Order>`; each row keyed by `_id`; backend deliberately blanks `bjProducts` in this list response. | R1 uses to render type/status; backend `OrderController.queryNew` calls order query and clears line JSON. Not a line-detail read. |
| One existing quote/order | `basic/order/queryById` / POST | `id` | One `Order` keyed by `_id`; R1 hydrates `exts`, line JSON and price summary from `bjProducts`. | Backend throws if ID missing. R1 wrapper normalizes business failures as failures. |
| Work-order context | `basic/serviceAppointment/queryById/{workOrderId}` / POST in R1 call | work-order ID in route | R1 reads `res.data.serviceAppointment`; uses it as quote context. | No Survey/form read occurs here. |
| Configured Order fields | `biz/extField/query` / POST | `colName=order`, enabled state, mobile detail applicability `showList=4`, sorted by `order` | Field rows (`ExtField`); displayed values are carried in `Order.exts`. | Dynamic field definition can vary by tenant; no active Beta capture in this phase. |
| Quotation packages | `biz/projPackage/queryWithRank` / POST | enabled state, service type, source type, sort; `_all=1` | ranked `ProjPackage` rows with price/minimum price, unit, repair metadata and package bodies as available. | Backend forces mini-app price overlay; no version token identified. |
| Package detail | `biz/projPackage/findById/{packageId}` / POST in R1 call | package ID | `ReturnStatus.entity` with package and associated bodies. | R1 uses package body to build the nested line editor. |
| Procedures | `biz/procedure/queryWithRank` / POST | enabled state, service type, source type, sort | ranked procedure rows, unit price/minimum fields and applicability metadata. | Mini controller applies `form=mini`; tenant/org price overlay in `GoodsServiceImpl`. |
| Materials / SKUs | `basic/material/queryWithRank` / POST; `basic/material/query` / POST for package SPUs | enabled state, service type/source type; SKU query filters `spuid` | material/SKU rows with service price, unit/spec and attributes used by editor. | Mini controller and GoodsService apply service-price behavior; no quote version token. |
| Measures | `biz/measure/queryWithRank` / POST | enabled state, service type, source type, sort | ranked measure rows and guide-unit-price fields. | Mini controller applies `form=mini`; org price-body overlay. |
| Coupon provider | `basic/couponPrinting/queryByPhone.do` / POST | contact identity and optional existing coupon ID | available coupon rows used for discount/prerequisite display. | R1 checks coupon prerequisites client-side. Contract for stale/consumed-coupon reconciliation is not proven. |
| Post-save read | Parent work-order `onShow` → `refreshPlaceOrder()` → `getOrders()` → `basic/order/clearOrderFieldQuery` / POST | same ServiceAppointment ID and active states | refreshed order/quote list; detailed quote read later uses `queryById`. | Quote page's create success callback closes the page; this list reread is lifecycle-driven, not an inline authoritative reread tied to the create response. |

## 7. Write / command matrix

| Operation | Endpoint / method | Payload and IDs | Success / failure evidence | Idempotency, ambiguous outcome and reread |
| --- | --- | --- | --- | --- |
| Local quote draft autosave | No active quote-specific endpoint found. R1's temporary-form code is commented and explicitly returns for `type=0`. | No durable quote draft record proven in R1. | Not applicable. | Do not claim R1 quote recovery. Current app's generic Action Draft Repository can persist semantic state locally, but quote codec/identity is not implemented. |
| Client calculate/recalculate | No server endpoint in inspected R1 quote calculation path. `calcTotalPrice()` recomputes locally. | Nested line state plus discounts/coupons and current provider values. | UI result is client-calculated; no independent server calculation result returned by a recalc command was found. | Price staleness is unresolved; future Save must reconcile against read/provider truth rather than silently accepting stale cached prices. |
| Create quote (“生成报价”) | `basic/order/creatQuotation` / POST | `data=JSON.stringify(Order)` including `type:0`, `serviceAppointmentId`, `bjProducts`, `productIds`, totals, description, owner fields and `exts` (service/source context and configured Order fields). | Backend requires active user; rejects a non-empty `_id`; assigns IDs/audit/tenant/order number, runs configured `order` pre-script, may generate PDF, saves, returns `ReturnStatus(Order)`. HTTP 200 `success:false` is failure in R1 wrapper. | No idempotency key/client operation ID found. Retry after ambiguous create can create a second Order. Exact-ID reread is impossible until an ID is known; work-order list is not sufficient to uniquely reconcile when multiple quotes exist. **No blind retry.** |
| Update existing Order/quote | `basic/order/upsert` / POST | `order=JSON.stringify(Order)` with existing `_id`; quote editor serializer includes same line/price fields. | Backend looks up existing Order, returns a failure if absent, saves update; type-0 → type-1 conversion creates a new official-order ID. | Stable `_id` makes repeated same-value update addressable, but semantic idempotency/optimistic concurrency is not stated. Quote-edit UI exposure remains unverified. |
| Convert quote to actual order | R1 starts `workflow/startWorkflow/order/{formDataId}/{workflowFormDefId}` then calls `basic/order/upsert` with `type=1` and workflow/orphan identity. | Existing quote `_id`, work-order ID, active order-node workflow-definition/runtime-node IDs and converted Order payload. | Backend conversion is a separate type-0 → type-1 path; R1 refreshes the order list after save. | This is a separate business mutation and workflow start, not quote Save. Partial failure between workflow start and upsert/reconciliation is not documented. |
| Send quote to customer | `basic/order/sendMessage` / POST | `orderId` | Backend sets `exts.confirm=0`, creates a separate quote-confirmation record, then sends a customer message. | Not quote creation. Repeated-send and SMS failure cleanup/idempotency are not proven. No send was performed in this evidence task. |
| Customer confirmation | `/i/bjd/quotation.do` / POST (R1); backend `/i/bjd/quotation` handler | confirmation-record `id`, not the Order ID | Sets confirmation record `confirm=1` and associated Order `exts.confirm=1`; returns success. | Separate actor/action from technician quote Save. Repeated-call semantics and whether this is required before conversion remain unverified. |
| Workflow Complete | Generic R1 `/s/processWorkflow.do` exists for workflow form submission; **not called by the quote type-0 `quote()` path**. | Generic form workflow-node/form identity. | No quotation-specific completion command/response contract found. | The quote Save must not be used as a proxy for Workflow Runtime Complete. Require active workflow evidence before enabling any completion action. |

Backend `ReturnStatus` paths include HTTP-200 business failures such as inactive/missing user, missing Order, missing work order, unavailable form definition, and configured pre-script failure. R1 transport behavior correctly treats `success:false` as failure; a new Adapter must preserve that semantic boundary without exposing backend messages directly in Vue.

## 8. Dynamic Form vs controlled Quote Experience

The legacy quote page is structurally not a generic scalar dynamic form: its line editor composes nested package, procedure, material/SKU and measure lists, custom additions/deletions, per-category quantities/totals, discounts/coupons and generated quote snapshot JSON. The `order` ExtField rows are configurable supplementary fields only.

**Target classification:**

| Capability | Classification | Phase-0 recommendation |
| --- | --- | --- |
| Action Workspace shell and persistent footer | `REUSE_UNCHANGED` | Reuse the current Workspace context/status/action shell; preserve separate local draft, business Save, and workflow Complete states. |
| Shared inputs, textarea, selector and choice controls | `REUSE_UNCHANGED` / `SHARED_PATTERN` | Reuse for simple configured fields and local selections after contract mapping. Do not move quotation semantics into shared components. |
| Package/line-item editor, pricing summary, discount and revision handling | `BUSINESS_EXPERIENCE` | Build as a quotation-owned controlled experience with explicit normalized line model and a quote-specific serializer. |
| Quote API adapters, nested line codec, authoritative read/reconciliation, pricing freshness | `NEW_CAPABILITY_REQUIRED` | No quote read/command adapter or quote runtime exists in the current app. Workflow policy currently returns `policy_unverified` for `quotation`; this is correctly fail-closed. |
| Bottom Sheet / media pattern | `SHARED_PATTERN` / `NOT_APPLICABLE` | Reuse an existing pattern only when interaction semantics match. Media is not a proven quote-line capability. |
| UI delivery and H5 review | `REUSE_UNCHANGED` | Apply `docs/design-system/UI_DELIVERY_WORKFLOW.md` once product behavior is authorized; Phase 0 adds no review route or visual implementation. |

Do not serialize nested quote line items as generic `FormFieldValue` scalars. The Action Draft Runtime may own persistence orchestration, but the quotation content runtime must own quote-specific state normalization/versioning.

## 9. Draft and weak-network implications

1. R1's quote `temporaryForm()` / restore code is commented and explicitly excludes type 0. There is no source-backed durable quote draft behavior to preserve.
2. Current Action Draft identity already scopes by `userId`, `workOrderId`, `workflowNodeId`, `actionIntent`, `contentKind`, and optional `contentIdentity`; `quotation`/`quotation` content kinds exist as architecture slots. That does not authorize quotation execution today.
3. A future quote draft should persist only semantic editor state (line IDs, selected product/package identity, quantity, user-entered descriptions and locally changed values), never credentials/session tokens. Price/source/version identity must be included only after an authoritative price contract defines it.
4. On restore, re-read current quote/work-order/provider state and reconcile catalog/price identity before allowing business Save. The current backend evidence has no explicit price-list revision token; do not invent one or silently replay stale prices.
5. Local draft persistence is not an offline business mutation queue. A create/update command must not be automatically replayed after connectivity returns. An ambiguous create remains unresolved until a real authoritative reconciliation contract can identify the operation/quote.
6. Workflow-node identity changes must not silently retarget a restored quote draft. Keep the draft isolated by the Runtime-issued node/action/content identity and require explicit recovery policy if the node changes.

## 10. Deterministic Mock scenario plan (not implemented)

Use synthetic, backend-shaped fixtures through the same future Real/Mock Adapter → Quote Runtime → UI path. No scenario in this Phase 0 creates or changes a real quote.

| Scenario | Evidence-derived focus | Expected safety |
| --- | --- | --- |
| Fresh quote | No existing Order, work-order context loaded | Structured line editor starts empty; no implicit Survey copy. |
| Existing saved quote | Type-0 Order loaded by `_id` with `bjProducts` | Exact quote identity retained; do not confuse with type-1 order. |
| Survey context loaded | Synthetic Survey and ServiceAppointment have separate IDs/fields | Explicitly show only contract-approved handoff; no accidental `serviceGoods` transfer. |
| Package/product loaded | Synthetic provider rows for package/procedure/material/SKU/measure | Preserve provider IDs and source metadata; deterministic catalog data. |
| Quantity change/recalculation | Line quantities vary | Same normalized line model and pure calculator path; no backend call in Mock-only compute. |
| Validation failure | Missing required order Ext field or invalid line contract once verified | Validation blocks Save; never invent required fields in Phase 0. |
| Retryable Save failure | Normalized transport/business failure | Preserve local draft; explicit retry only when category permits. |
| Ambiguous Save | Create request dispatched, response lost | No blind replay; show unresolved/reconciliation state. |
| Successful Save + reread | Create/update returns business success | Mark business mutation success first, then authoritative quote/list reread; refresh failure must not invite duplicate create. |
| Complete eligible | Workflow Runtime reports explicitly authorized completion | Complete remains distinct from quote Save and is enabled only by Runtime decision. |
| Unsupported capability | Missing contract, price version or unsupported line kind | Fail closed; do not render scalar fallback for nested business lines. |

No stale-price/version-conflict fixture is specified yet: the source does not prove a version field or backend conflict response. Add one only after that contract is captured.

## 11. Evidence gaps and owners

| Unknown / gap | Status | Owner class | Why it matters / evidence needed |
| --- | --- | --- | --- |
| Current active Beta quote Order and exact `bjProducts` payload | `LIVE_VALIDATION_PENDING` | `ENVIRONMENT` + `BACKEND` | Obtain authorized read-only active quote/list/detail and sanitize it. No real API was contacted here. |
| Survey completion prerequisite and current `placeOrder` workflow node/handler config | `UNKNOWN` | `PRODUCT` + `BACKEND` | Inspect active workflow definition/runtime node and confirm whether Survey completion gates quote entry. |
| Survey-to-quote handoff policy | `UNKNOWN` | `PRODUCT` | Decide whether Survey values are copied, referenced, displayed only, or not used; validate against active records. |
| Current quote editing/revision policy, multiple quote semantics | `PARTIAL` | `PRODUCT` + `BACKEND` | Source supports ID update and multiple IDs but shows no revision/version rule; confirm expected create-vs-edit behavior. |
| Pricing authority, all discounts/coupons/manual overrides, tax and rounding | `PARTIAL` | `BACKEND` + `PRODUCT` | R1 calculates client-side, providers overlay organization prices, and a tenant script can mutate Order; verify active formula and server acceptance. |
| Price freshness/version conflict and Save reconciliation | `UNKNOWN` | `BACKEND` | No version token or exact conflict response found. Required before resilient quote editing. |
| Quote-create idempotency and ambiguous create lookup | `UNKNOWN` | `BACKEND` | No request key; multiple quote rows can exist. Need authoritative operation identity/read contract or keep Real create blocked. |
| Parent `placeOrder` workflow completion timing / next state | `UNKNOWN` | `BACKEND` + `PRODUCT` | Quote create does not call workflow process endpoint. Need a verified workflow trace and explicit Runtime mapping. |
| Customer confirmation requirement before conversion | `UNKNOWN` | `PRODUCT` | Confirmation exists separately; R1 conversion control is not visibly gated by `exts.confirm`. Confirm current policy. |
| Quote-specific local draft/restore behavior | `NOT_IMPLEMENTED` | `FRONTEND` (after contract gate) | R1 temporary quote draft is commented/excluded; target app has reusable generic draft infrastructure but no quote codec/runtime. |
| Current active workflow can authorize quotation in technician app | `NOT_AUTHORIZED` | `FRONTEND` / Program Gate | Current Workflow Runtime policy denies `quotation` as `policy_unverified`; do not bypass it in Vue. |

## 12. Smallest safe implementation sequence (recommendation only)

This is not authorization to start implementation. The next evidence checkpoint should first capture, read-only and with sanitized data:

1. An active Beta work order at the quote node, its Workflow Runtime decision, and the quote-related node definition.
2. The matching current Survey and one existing type-0 Order (if one exists), including sanitized `bjProducts`, `exts`, `serviceAppointmentId`, and any confirmation record relation.
3. Package/procedure/material/measure provider contracts and the effective returned price fields/version or an explicit statement that no version exists.
4. Quote create/update response semantics, exact confirmation requirement, and authoritative post-save/reconciliation read.
5. Product decision on whether technician quote Save and workflow Complete are separate actions, and the exact owner/actor authorization.

Only after those are reviewed should the smallest code slice be considered: quote read/model/codec + deterministic Mock scenarios, then user-scoped local draft, then Real read behind the existing source switch. Real quote writes remain disabled until a later explicit authorization, confirmed idempotency/reconciliation and a tested server pricing boundary. Workflow Complete should remain a separate Runtime-authorized command.

## 13. Source references

All paths below refer to the local sibling evidence repositories inspected read-only; line numbers are for the inspected source revision and may move independently of this app branch.

### R1 / `xlink-app`

- `business/subpackages2/inspectionAppointment/inspectionAppointment.vue` — `placeOrder` button and handler gating (`L2140-L2172`); quote/order list read (`L7153-L7196`); page return refresh (`L5006-L5014`); quote conversion launch (`L7253-L7268`); quote list quote confirmation/edit controls (`L358-L480`).
- `business/subpackages2/workOrder/workOrder.vue` — type-0 quote row and “转为订单” (`L714-L725`); quote-to-order launch and type-1 save (`L4677-L4745`).
- `business/subpackages/order/placeOrders.vue` — quote editor initialization/context (`L3443-L3495`); existing Order read (`L3571-L3616`); configured order fields (`L3618-L3678`); ServiceAppointment read (`L3772-L3809`); quote line and amount serialization (`L3991-L4234`); create/update command (`L4288-L4343`); package/procedure/material/measure providers (`L5498-L5708`); local total calculation/2-decimal helper (`L4652-L4657`, `L5798-L5889`); quote-create path (`L6682-L6960`); old quote temporary-draft code is commented and excludes type 0 (`L6982-L7012`).
- `business/resources/js/common.js` — R1 transport default method and response handling (`L112-L165`, `L177-L249`): session-expiry `restart`, business `success:false`, and success callback behavior.
- `business/subpackages/extForm/extForm.vue` — workflow form upsert versus `processWorkflow` (`L1842-L1853`, `L1896-L1934`); customer quote confirmation request (`L2780-L2792`).
- `business/subpackages2/inspectionAppointment/inspectionAppointment.vue` — Survey-era `serviceGoods` selector/query (`L4012-L4124`, `L6600-L6612`, `L8960-L8996`).

### `xlink-cloud-backend`

- `src/main/java/com/fsgo/entity/basic/Order.java` — `Order.type` constants and quote/order fields (`L17-L64`).
- `src/main/java/com/fsgo/entity/basic/Survey.java` — Survey identity/relation candidates, `serviceGoods`, `sid`, `orderId`, `contractId` (`L11-L48`).
- `src/main/java/com/fsgo/entity/basic/CostingEntry.java` — quote-array/index `typeId` representation (`L8-L26`).
- `src/main/java/com/fsgo/modulemini/basic/OrderController.java` — list/query, exact read, upsert, create quote (`L49-L123`); send quote/customer confirmation (`L166-L210`).
- `src/main/java/com/fsgo/moduleweb/i/bjdQuationController.java` — customer-facing confirmation endpoint and status updates (`L19-L38`).
- `src/main/java/com/fsgo/service/basic/OrderServiceImpl.java` — upsert and type-0 → type-1 conversion (`L203-L420`); quote creation, audit identity, tenant script, PDF and save (`L496-L649`).
- `src/main/java/com/fsgo/modulemini/biz/ProjPackageController.java` — package ranked read and detail route (`L24-L58`); Procedure/Measure/Material controllers similarly set `form=mini` for ranked reads.
- `src/main/java/com/fsgo/service/biz/GoodsServiceImpl.java` — tenant/org scoping, mini-app price overlay for materials, procedures, measures and packages (`L376-L459`).
- `src/main/java/com/fsgo/entity/biz/project/ProjPackage.java` and `ProjPackagePriceBody.java` — package base/minimum price and approved guide-price fields (`L18-L73`; `L7-L21`).
- `src/main/java/com/fsgo/service/basic/OrderServiceImpl.java` PDF variants contain different tax wording; this is why tax treatment is not generalized from one quote template.

### Current technician-app architecture

- `src/runtimes/action/types.ts` — `quotation` content-kind and draft identity slots (`L5-L13`, `L40-L64`).
- `src/runtimes/action/draft-repository.ts` — user-scoped generic draft repository API (`L21-L41`).
- `src/runtimes/workflow/policy.ts` — `quotation` is denied with `policy_unverified` (`L105-L115`).
- `src/shared/ui/ActionWorkspaceShell.vue`, `ActionWorkspaceFormActions.vue`, and `src/shared/ui/index.ts` — reusable workspace shell/actions and presentation components.
- `docs/architecture/LOCAL_DRAFT_AND_WEAK_NETWORK_ARCHITECTURE.md` — content-owned quotation editor state within generic draft orchestration (`L122-L138`).
- `docs/design-system/UI_DELIVERY_WORKFLOW.md` — component reuse and separation of local draft, explicit business Save, and workflow Complete (`L23-L58`).

## Phase-0 boundary

**Evidence result: PARTIAL, source-backed legacy contract only.** This is sufficient to set the target domain boundary and prevent a false generic-form implementation; it is not sufficient to authorize a Real quotation command, enable Runtime execution, declare production pricing truth, or start G4-G. No Survey, quote, order, customer, credential, or session payload from Beta/Production was captured or persisted.
