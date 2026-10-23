# DS-07.C11 — Production official Order raw-read authorization fence

**Classification:** P0 CLIENT-SIDE DEFENSE-IN-DEPTH / NO LIVE API / DRAFT_NO_MERGE.
Parent: [C10 #167](https://github.com/xlink-bj/xlink-technician-app/pull/167), exact `fb2404d4e2724ea9dcd1774ec0e83406c6d6cacc`.

## Defect class and source truth

C9 restricted the `basic/order/query` Production request BODY to a six-field, row-bounded, type=1, `_all`-free WorkOrder query. C10 proved normal **QuotationOrderReadAdapter** clients first verify the WorkOrder came from the role-scoped list. However, `createUniApiReadTransport()` itself had no WorkOrder membership predicate; any future direct caller holding that transport could submit a syntactically valid **foreign** WorkOrder ID and reach the server. This was a **client defense gap**, not evidence of actual data disclosure or proof that R1 backend lacks ACL.

R1 [xlink-cloud-backend@5fc008d](https://github.com/xlink-bj/xlink-cloud-backend/tree/5fc008d32e771205260f120621c1c4fc62d0824e) `GoodsServiceImpl.queryWithRank` statically shows current user/account, tenant and active-state restrictions, and a special **`sourceType` present** branch that modifies org/belongTo filtering. It does **not** demonstrate a WorkOrder↔SPU authorization check. As established by [P1 source authority audit](../verification/P1_SKU_REAL_READ_AUTHORITY_AUDIT.md), source type and matching SPU ID cannot establish sale-attribute/SKU or tenant-specific prices.

R1 [xlink-app@6c0a97b](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/order/placeOrders.vue) `quote()` creates quotation `type=0`. New App's official `type=1` command is the **separate conversion/official Order path**. There is NO authorization to assume those endpoints or prices interchangeable. R1 may execute tenant-specific pre-scripts and source prices are not established by synthetic fixtures.

## Minimal P0 code change

1. `src/adapters/api/uni-api-read-transport.ts` adds optional-but-**required-in-Production-Order-mode** callbacks: live role-list WorkOrder membership and a current `sessionRef/userId/roleId/roleVersion` fingerprint. On `basic/order/query`, **missing/false/throwing callbacks always return `authorization_denied` before request**, even when request shape passes the C9 whitelist.
2. A snapshot of session reference and identity is compared **again after async response**, before exposing any Order body. Role revocation or identity/session rotation discards the response; no private data returned.
3. `src/app/composition.ts` wires BOTH callbacks from the **same live role-scoped WorkOrder membership source and authenticated session** as `QuotationOrderReadAdapter`. Identity fingerprint is a shared callback (no independently drifting provider).
4. Existing C9 and C10 tests are updated to use the real same-role callback. A dedicated suite exercises missing callback, foreign-but-well-formed WorkOrder ID, false/throw/blank guards, approved bounded read, unauthorized `queryById`, revoked in-flight role, rotated roleVersion and changed session.

**No mutation transport or backend changes.** Does not enable a new endpoint, increase a page-size limit, change the R1 SKU/price/order encoder, alter visual Golden, authorize Contract PDF or sign anything. On a Production session lacking a trustworthy current roleVersion, Order reads remain **fail-closed**; this is intentional until an authorized role snapshot exists.

## Remaining independent release HOLD

- Client role membership is not a server authorization mechanism; R1 backend Order query **must independently reject foreign WorkOrder/tenant/role**. Two authorized test identities and role revocation need a **separately authorized bounded read-only server verification**, not a mock.
- Material salesAttribute code/options, WorkOrder-bound source SKU and authoritative price/stock, quote type 0 → Order type 1 conversion and exact server readback **NOT VERIFIED**. No new SKU provider or Order writes are enabled.
- MP-Weixin/iOS/Android physical acceptance, backend Contract signed success, complete main-target 921+ ancestry review and explicit human merge permission remain HOLD.

## Tests/exit gate

The Draft exact-HEAD workflow must enforce test contracts, complete `pnpm verify`, all 3 platform bundle builds, existing approved 3 Gallery + 9 List/Detail/Q01 Goldens and unchanged snapshot hashes. This is engineering proof only; it does not confer Production tenant/SKU authority.
