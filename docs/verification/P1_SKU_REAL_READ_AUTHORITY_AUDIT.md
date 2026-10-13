# P1 M1.4 / #75 — actual backend SKU read authority audit and source-only preflight

**State:** SOURCE_CALL_GRAPH_CONFIRMED / SERVER_WORKORDER_AUTH_UNKNOWN /
REAL_SKU_READ_BLOCKED / NO_BETA_APPROVAL. No real SKU request, price,
stock, contract, Order, Workflow write or product UX change.

## Evidence — pinned source (not runtime proof)

- R1: [xlink-app@6c0a97b](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue)
  L3498–3560 Material ExtField and value options, L6191–6281 direct SPU SKU query,
  L6289–6389 Package material multi-SPU query, L6410–6525 material body/link
  and layer, L6650–6780 SKU-price branch. Historical tenant literals in R1
  are NOT authority.
- Backend: [xlink-cloud-backend@5fc008d](https://github.com/xlink-bj/xlink-cloud-backend/tree/5fc008d32e771205260f120621c1c4fc62d0824e)
  under `src/main/java/com/fsgo/`:
  - `modulemini/basic/MaterialController.java` L30–60: `/query`
    delegates to `goodsService.queryWithRank` without setting `form`;
    `/queryWithRank` sets `form=mini`. They are NOT equivalent.
  - `moduleweb/basic/MaterialController.java` L30–60: `/query`
    sets `form=pc`, then delegates to the same GoodsService.
  - `service/biz/GoodsServiceImpl.java` L376–425: principal
    `currentUser/currentAccount`, tenantId equality, default active state,
    `sourceType` **property-presence** switch. When present, request-supplied
    sourceType feeds `sourceTypeList` and orgId filtering; two automatic
    Mongo org/belongTo filters are disabled. Otherwise the PC-specific
    org branch and underlying filters differ. `nin:scopeJson` is added.
    There is NO demonstrated lookup of the requested WorkOrder/ServiceAppointment
    in this SKU read method.
  - `interceptor/WeixinMiniInterceptor.java` and
    `interceptor/FsgoInterceptor.java` establish session/account/user
    context, but this inspection does NOT establish an item-level
    WorkOrder→Material SPU authorization decision.
  - `modulemini/biz/ExtFieldController.java` `/query` sets
    `tenantId` from current account; `service/biz/ExtFieldServiceImpl.java`
    issues the query and optional Customize overlay. Neither alone proves
    that sales-attribute options are valid for *this* WorkOrder/SPU.
  - `modulemini/basic/ServiceAppointmentController.java` query/detail
    routes are distinct from Material query. Its detail route also accepts
    a `type=query` permission-related branch; it is not proof that the
    Material read inherits WorkOrder ACL.

**Security conclusion:** authentication plus tenant/state filtering is
not the same as authorization for arbitrary `spuid` (single or multi)
against a particular WorkOrder, role, org and service/source type.
Client-selected `sourceType`, `in:spuid`, or an ID found in a catalog
must never be trusted as the server-side entitlement.

## Delivered in this slice

`src/shared/sku-live-read-preflight.ts` is a transport-free, PURE *candidate*
check. It requires a complete current principal, WorkOrder-bound catalog
context, explicit sourceType, complete listed Material SPU identity set,
bounded unique selection and exact selected-to-listed SPU membership.
It rejects missing/foreign/duplicated/unbounded/partial evidence.

A successful check is expressly **`source_identity_only`**, always with
`liveReadAuthorized=false` and backend authority, field/options, and SKU
pagination/scope marked unverified. It does not return an HTTP request,
execute a provider, grant live access, select a SKU, or supply price/stock.
Even a 4/4 ID-coherent synthetic overlay is not real source authorization.

Unit tests cover incomplete identities, missing `sourceType`, WorkOrder
mismatch, incomplete/paginated catalog, foreign/duplicate SPU, bounds and
immutable source data. Prior #81 tests and business UI remain unchanged.

## Server/Owner gates for an actual bounded SKU read

1. **Server binding:** authenticated principal+tenant+role and an authorized
   WorkOrder/ServiceAppointment are resolved on the server; bind
   `serviceType`/`sourceType` there. Show denied foreign WorkOrder/org/SPU,
   sourceType omitted vs supplied, direct `spuid` and multi-`spuid` cases.
   Where existing `/query` cannot enforce these, require a separately
   reviewed scoped backend endpoint or server policy. Frontend preflight
   does **not** repair a server authorization gap.
2. **Field provenance:** prove tenant-scoped ACTIVE Material ExtField
   `salesAttribute`, `valueOption` and `i/code/selectCode` options.
   Account for empty/malformed options and no hardcoded legacy tenant.
3. **Read completeness:** prove backend pagination, active SKU state,
   exact SKU.spuid parent, duplicate detection and all-page completeness;
   do not treat `_all=1` or a single page as proof without evidence.
4. **WorkOrder context consistency:** a server-authorized catalog snapshot
   must be bound to current session/role/version/WorkOrder/source and
   invalidated on role, WorkOrder, context, or provider change.
5. **Separate approval:** a bounded disposable Beta read needs explicit
   Lead+Owner authorization, per-call read matrix and redacted results.
   Production SKU enumeration, SKU pricing/stock, Order.type=1 submission,
   contract/signature and Workflow Complete remain independent gates.

**Status to carry forward:** SOURCE_READ_PATH_VERIFIED /
WORKORDER_BOUND_SERVER_ACL_UNPROVEN / REAL_SKU_PROVIDER_NOT_WIRED /
DEV_SOURCE_PREFLIGHT_ONLY / DRAFT_NO_MERGE. This source audit is NOT a
penetration test or a live entitlement verification.
