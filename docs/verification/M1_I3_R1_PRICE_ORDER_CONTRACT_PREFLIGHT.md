# M1-I3 — R1 pricing / grouped Order contract: read-only preflight

**Status:** PREPARATORY / NOT I3 ACCEPTED. I2 remains `IN_REVIEW (3/4)` with R1 live SKU read outstanding; no I3 Gate advancement or business write is authorized.

**Authoritative R1 source:** `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`, `business/subpackages/order/placeOrders.vue`. This audit is deliberately bounded to that pinned page. Other R1 pages/backend behavior are **not inferred**.

**New App candidate:** `xlink-bj/xlink-technician-app` stacked on I2 Draft #104 `3060e5cb47ff9698bbb34eb5e5a33315646afc1e`. Relevant code: `src/features/work-orders/quotation/{validation,hydration,pricing,order-encoder,engine}.ts`. Existing synthetic tests: `tests/g4f/quotation-engine.test.ts`.

## 1. Critical contract mismatch before any write

| Topic | Pinned R1 directly observed | New App directly observed | Decision |
| --- | --- | --- | --- |
| Operation | `quote()` assembles `params` then calls `basic/order/creatQuotation` with `{ data: JSON.stringify(params) }` (R1 approximately lines 6658–6967) | The `encodeR1OfficialOrderType1` payload is a local projection; `quotation-order-api` adapter owns its transport semantics | Do **not** equate page-level `quote()` with the New App official Order command until route/action is corroborated |
| **type** | R1 `quote()`: explicit comment `type 0代表生成报价,1代表生成订单`; actual `params.type = 0` | New App `R1OfficialOrderType1Payload.type = 1`, encoded value `type: 1`; I3 #93 names `Order.type=1` | **UNRESOLVED ROUTE/OBJECT SEMANTICS — STOP for parity claim.** Need locate the pinned R1 `type:1` caller and determine quote vs order stage; don't change to 0 or declare 1 right by guess |
| Confirm + replay | R1 `quote()` uses `common.osg.isRepeatClick('placeOrder')` and interactive confirm prior to `creatQuotation` | New App has a separate confirmation/submit state and fail-closed readback gates | Functional approximation is not proof of R1 persistence or workflow transition; no live write authorized |

Source-level R1 `type:0` is a **fact about this page's `quote()`**, not a claim that the entire R1 application never writes `type:1`.

**Additional pinned-snapshot sibling audit (same SHA):** `business/subpackages/order/orders.vue` reads `basic/order/query` with `is:type|integer#and = 0` for its quotation-filter path; `business/subpackages/order/order.vue` reads `basic/order/query` for order details. Neither sibling page provided a `type:1` creation caller or a `creatQuotation` write when inspected. This is **negative evidence limited to three inspected pages**, not a repository-wide exhaustive search, backend contract, or authorization to change `type` in New App.

## 2. Quantity / price / projection matrix

| Concept | Pinned R1 page behavior | New App candidate | Required I3 evidence |
| --- | --- | --- | --- |
| Repair grouping | `this.orderList` holds one object per repair section with `repairParts`, `constructionLocation`, `partDescription`, `constructionSite`, `maintainAreaNum`, `agelimit`, `agelimitMax`; grouped `projPackages/procedures/materials/measures` | `QuotationDraft.groups` maps these categories and `order-encoder.ts` serializes `bjProducts.orderList` | Confirm what fields are required in target Order route; do not invent missing construction site/warranty details |
| Package pricing | Per selected package: `markup = Σ(materialList[i].exts.price > 0)`; `amount=price+markup`; charge `max(amount * number, minimumPrice)` | `pricing.ts` computes package markup/minimum; `order-encoder.ts` material component quantity from coefficient | Golden examples with markup=0/positive, minimum threshold and exact rounding |
| Package non-SKU materials | In `quote()`, material number is `Math.ceil((Number(package.number) * material.coefficient) / Number(material.material.spec)) || 0` when package `pricingMethod != '1'` | `packageMaterialNumber` uses ceil and blocks missing or nonpositive coefficient/spec; more conservative | Compare known catalog spec/coefficient identity, zero/NaN source fallback, and pending guard; do not emit fabricated child rows |
| Package SKU-mode | `pricingMethod == '1'` filters package child `skus` to `number > 0`; no flat SPU fallback | `order-encoder` returns `encoding.package_sku_path_not_authorized` | **BLOCKED for type-1 payload** until real SKU price/identity verified; no fake package rows |
| Procedure pricing | `max(guideUnitPrice * number, minimumGuideTotalPrice)`; selected rows also set `describe = desc`, `amount=guideUnitPrice` | `pricing.ts` minimum and encoder category mapping | Golden cases around minimum, duplicate groups, empty unit, source rounding |
| Direct material pricing | SPU with `skus`: sum only positive `sku.price * sku.number`, append SKU rows to `order.materials.data` (not an SPU priced row); no SKU: `price * number` | Local v4 stores `skuId, attributes, quantity` but **does not store authoritative SKU price**; pricing/encoding blocks SKU/SPU | **BLOCKED** until authorized SKU catalog price read, source price precision, and exact SKU serialization are confirmed; do not infer SKU price from SPU |
| Measure pricing | `guideUnitPrice * number`, included in group category totals | `pricing.ts` measure calculation | Golden zero/decimal cases |
| Extra/reduction | `addItems` and `deleteItems` positive quantities contribute to `calcTotalPrice()`; emitted as separate `bjProducts` sections | New encoder sets empty sections; other/preferential amounts to zero | Absence in UI is **capability gap**, not proof that all R1 orders use zero |
| Origin/discount/final | `originPrice = amountToFixed(total)`; coupon subtraction, multiplicative discount and preferential subtraction follow individual `amountToFixed` steps. `quote()` sends `originPrice`, `totalPrice`, `discount`, `preferentialAmount` | `pricing.ts` implements neutral (discount=1, coupon=0, preferential=0), separate `calcTotalPrice` / `fillOrder` projections and `r1AmountToFixed` | Verify source rounding with fixture snapshots; **non-neutral discounts/coupons remain unsupported** |
| Categories/subtotal | R1 `quote()` emits category `{totalAmount, data}`, summing valid rows; category totals and top-level rounding can differ | Encoder emits `bjProducts.orderList`, category totals, `otherItemsAmount:0`, `preferentialAmount:0` | Compare row totals + grouped subtotal + top-level amount separately, not by forcing equality |
| Request envelope | `productIds` JSON string; `bjProducts` JSON string; `exts.serviceAppointmentNum`, coupon details, `serviceType`, `sourceType` and `isCreateBjdPDF:'1'` | New encoder has these neutral fields, but omits unconfirmed owner, discount inputs, and other fields in pinned `quote()` | Separate nullable/optional from required fields for the **actual** endpoint and type-1 operation |

## 3. Eight conservative offline goldens required before I3 can be accepted

1. Two repair parts and same material in both: independent line counts and group subtotals.
2. Package markup and minimum, including unequal `calcTotalPrice` and `fillOrder` per-row rounding.
3. Procedure minimum, measure decimal quantity, material without SKU.
4. SKU material with two positive quantity rows: ensure **no payload** when SKU authoritative price is absent (current safety invariant).
5. Package with `pricingMethod='1'`: ensure no guessed SKU payload or price.
6. Non-SKU package coefficient/spec ceil, spec missing/zero returns **BLOCKED**, not `NaN` order.
7. Non-neutral discount, coupon, add/remove item: explicit unsupported rather than silently claiming R1 equivalence.
8. Same-order edit, ambiguous command outcome, subsequent authoritative readback: no second dispatch, no inferred success.

`tests/g4f/quotation-engine.test.ts` covers several synthetic cases already. Reuse it and extend only gaps. These golden cases are a **future test requirement**, not assertions that all eight currently pass.

## 4. Gate and execution boundary

- **I2**: R1 actual raw `exts`/sales Code/SKU result needed from authorized **read-only** context (Issue #92). Still `IN_REVIEW 3/4`; do not mark ACCEPTED by extrapolating this source audit.
- **I3**: this document prepares a single mapping matrix (DoD #1 **partial**). It is NOT acceptance of field equivalence, prices or official `type:1`.
- **Production/Beta writes**: not authorized. Never invoke `basic/order/creatQuotation`, create/update order, workflow commands, media upload, or signing.
- **No schema/backend/R1 change.** Keep all downstream PRs Draft. Begin target I3 implementation only after confirming the business contract difference, with explicit I2 gate coordination.
