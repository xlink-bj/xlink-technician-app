# R1 Current Material SPU Price and Order Snapshot Read — 2026-11-05

**Status: `ONE_R1_DIRECT_MATERIAL_SNAPSHOT_COMPARED; OTHER_PRICES_UNKNOWN`.** The first three type-1 Orders for one current `place_order` WorkOrder in each of the four contexts contain no directly comparable Material price pair. A separate bounded role-visible scan found one historical top-level direct Material line. Its R1 category position and serialized row shape establish SPU identity under the pinned R1 contract; it matched exactly one current WorkOrder-scoped Material SPU and its saved unit amount equaled that current `mini` price. This is one sample, not a global price-authority or freshness claim.

## Scope and safety

- Used the locally configured technician profile and current role-visible WorkOrder list. Credentials, session data, raw identities, labels and literal prices were not printed or persisted.
- Each chosen WorkOrder detail matched its list-derived identity and had an enabled current `place_order` action with non-empty `serviceType` and `sourceType`.
- Read only `type=1` Orders through the existing WorkOrder-scoped Order adapter, `page=1`, at most three rows, with no `_all` or arbitrary-ID Order query.
- Read the current R1 `mini` direct Material catalog for each selected context. Only a direct Material SPU referenced by the selected Order would trigger a scoped SKU read; unrelated package, procedure, measure and SKU data were not fetched by this comparison pass.
- Separately scanned list-derived role-visible WorkOrders with an exact WorkOrder-owned `quotationCatalogContext`, issuing only `type=1`, `page=1`, `rows=3` Order reads. The scan stopped on its first direct Material line, at WorkOrder 6; it did not query `basic/order/queryById` or continue into later records.
- **Production business mutation requests: 0.** Quote, Order, Workflow, upload, Contract and customer-interaction writes: 0.

## Sanitized outcomes

| Context ordinal in current role scan | Bounded type-1 Order result | Direct Material Order lines | Direct SPU price comparison |
| ---: | --- | ---: | --- |
| 1 | 1 Order | 0; the recognized Material rows were nested under a Package | `NO_DIRECT_MATERIAL_LINES` |
| 2 | 0 Orders | 0 | `NO_ORDER_IN_BOUND` |
| 3 | 0 Orders | 0 | `NO_ORDER_IN_BOUND` |
| 4 | 1 Order | 0; the recognized Material row was nested under a Package | `NO_DIRECT_MATERIAL_LINES` |

The ordinal is the encounter order of distinct service/source pairs; it is not a business identifier. The Order page bound is intentional. A zero-row page means no Order was returned by this exact page-one query, not that an unbounded Order search was performed.

The separate role-visible scan read 6 WorkOrder details, 6 exact WorkOrder-scoped Order pages and 7 Order rows before finding one top-level direct Material line. That WorkOrder had no current `place_order` action; its role-listed detail supplied the exact service/source context used for the read-only catalog comparison. The current context contained 87 Material rows across 5 pages. The line mapped through `r1_direct_material_row_id` provenance to exactly one current catalog row; its persisted unit amount equaled the current `mini` price (`comparableLines=1`, `equalToCurrent=1`, `differentFromCurrent=0`). The scoped SKU read for that SPU returned zero active rows. This is evidence for that one SPU and current service/source context only, not evidence that no active SKU rows exist elsewhere.

## Interpretation

- A Package's embedded Material component is not an independent direct Material selection. Its amount depends on the exact Package snapshot, component identity, layer/coefficient and R1 package pricing branch. It must not be compared to the standalone Material SPU catalog price.
- For a standalone Material price comparison, the Order line must have a source-backed SPU identity and match exactly one current direct Material catalog row in the same WorkOrder-derived service/source context. A generic projected Order row `_id` fallback, selected SKU composition/identity, active SKU variants, missing unit snapshot, or truncated/ambiguous relationship remains unknown.
- Pinned R1 `placeOrders.vue` groups selected SKU rows by explicit `spuid`, fetches their parent Material SPUs, attaches selected variants under `spu.skus`, and replaces the top-level direct Material list with those SPU rows (`6c0a97b:business/subpackages/order/placeOrders.vue:6127–6183`). Its `bjProducts.orderList` payload contains that direct category (`:4190–4203`, `:4235–4238`). When converting an existing quote, R1 replaces `orderData.bjProducts` with that serialized snapshot and changes its type to 1 (`:4288–4303`). The checked-out backend source at `5fc008d32e771205260f120621c1c4fc62d0824e` creates the official Order with `BeanUtils.copyProperties(order, officialOrder)` on the type-0 → type-1 path (`src/main/java/com/fsgo/service/basic/OrderServiceImpl.java:371–379`), preserving `bjProducts` in that source path.
- Therefore the app assigns `r1_direct_material_row_id` provenance only to a row in the top-level direct `materials.data` category with no SKU identity/composition claim. Package children and other generic row IDs remain fallback/unknown. Any non-empty SKU list nested under `skus` remains excluded from standalone SPU price comparison. This is static R1/backend source evidence plus one read-only Production sample; it does not assert every deployed historical record used this exact client path.
- R1's normalized current Material `price` is the `mini` selector price; the Order line `amount` is a historical unit snapshot and `totalAmount` is its persisted total. Equality to the current catalog price is not expected when prices changed and is not a write-path acceptance test.
- Earlier complete context-specific catalog reads found zero active SKU rows for every SPU read in the four current-role contexts (contexts 1–3: 93 each; context 4: 15). This concerns the sampled SPUs and current active SKU filter only. It does not mean that the ordinary direct Material SPU catalog is empty or that Production has no SKU records globally. See [G4-F selected catalog evidence](G4F_SELECTABLE_CATALOG_PROD_READ_20261105.md).

## Audit support added

The bounded audit runner supports `--catalog-context-only --compare-selected-order-material-prices --discover-direct-material-order`; a separate `--authorize-bounded-prod-read` is still required to authenticate. It scans at most 121 role-visible WorkOrders and at most one page of three type-1 Orders per WorkOrder, stopping at the first top-level Material line. It reads that WorkOrder's exact current Material context only after the hit. Output keeps counts and identity-source categories only. `QuotationOrderBrowseIdentity.spuIdSource` distinguishes explicit Order-line fields, embedded product/material references, the source-backed R1 direct Material category row, and the generic row-ID fallback. Comparison requires a source-backed identity, an exact single current catalog row, a no-SKU line, and a complete saved unit-price relationship. Synthetic tests cover each identity path, mismatched prices, missing prices, selected SKU composition, active SKU ambiguity, Package-child exclusion, duplicate identities and Order ownership conflict.

## Next evidence step

The Package-contained rows were followed in a separate [bounded Package price comparison](G4F_ORDER_PACKAGE_PRICE_SNAPSHOT_PROD_READ_20261105.md). One exact current Package/Order snapshot matched; a second historical Package was absent from its current filtered catalog and remains unknown. Direct Procedure and Measure rows have now been compared against their exact current providers in a separate [bounded snapshot read](G4F_ORDER_PROVIDER_PRICE_SNAPSHOT_PROD_READ_20261105.md): 3/3 rows matched and were equal in those samples. The remaining order/contract/workflow association and status evidence is separate; neither comparison authorizes Production/Beta writes, and #201 remains HOLD.
