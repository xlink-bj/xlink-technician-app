# R1 Current Material SPU Price and Order Snapshot Read — 2026-11-05

**Status: `ROLE_VISIBLE_DIRECT_MATERIAL_ORDER_FOUND; PRICE_UNKNOWN`.** The first three type-1 Orders for one current `place_order` WorkOrder in each of the four contexts contain no directly comparable Material price pair. A separate bounded role-visible scan did find a historical direct Material Order line, but its only SPU-shaped identity is an Order row-ID fallback. The fallback happens to equal one current catalog ID, but that coincidence is not accepted as identity, so its price remains unknown.

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

The separate role-visible scan read 6 WorkOrder details, 6 exact WorkOrder-scoped Order pages and 7 Order rows before finding one top-level direct Material line. That WorkOrder had no current `place_order` action; its role-listed detail supplied the exact service/source context used for the read-only catalog comparison. The current context contained 87 Material rows across 5 pages. The line's identity source was `row_id_fallback`; that value matched one catalog row ID, but `catalogSpuMatches=0`, `rowIdFallbackCatalogIdMatches=1`, and the line remained unknown. A SKU lookup was performed only for that candidate catalog ID and returned zero active rows. This is scoped evidence about that one candidate ID, not evidence that no active SKU rows exist elsewhere.

## Interpretation

- A Package's embedded Material component is not an independent direct Material selection. Its amount depends on the exact Package snapshot, component identity, layer/coefficient and R1 package pricing branch. It must not be compared to the standalone Material SPU catalog price.
- For a standalone Material price comparison, the Order line must have an explicit SPU/reference provenance and match exactly one current direct Material catalog row in the same WorkOrder-derived service/source context. A projected Order row `_id` fallback, SKU ID/code, active SKU variants, missing unit snapshot, or truncated/ambiguous relationship remains unknown.
- Pinned R1 `placeOrders.vue` groups selected SKU rows by explicit `spuid` (`6c0a97b:business/subpackages/order/placeOrders.vue:6150–6183`) and sends SKU rows or no-SKU Material rows as different objects in its type-0 `creatQuotation` payload (`:6799–6824`, `:6950–6954`). This explains why an explicit `spuid` is a strong join. It does not prove that the separate official type-1 conversion preserves every field; the observed type-1 row-ID fallback therefore stays unknown.
- R1's normalized current Material `price` is the `mini` selector price; the Order line `amount` is a historical unit snapshot and `totalAmount` is its persisted total. Equality to the current catalog price is not expected when prices changed and is not a write-path acceptance test.
- Earlier complete context-specific catalog reads found zero active SKU rows for every SPU read in the four current-role contexts (contexts 1–3: 93 each; context 4: 15). This concerns the sampled SPUs and current active SKU filter only. It does not mean that the ordinary direct Material SPU catalog is empty or that Production has no SKU records globally. See [G4-F selected catalog evidence](G4F_SELECTABLE_CATALOG_PROD_READ_20261105.md).

## Audit support added

The bounded audit runner supports `--catalog-context-only --compare-selected-order-material-prices --discover-direct-material-order`; a separate `--authorize-bounded-prod-read` is still required to authenticate. It scans at most 121 role-visible WorkOrders and at most one page of three type-1 Orders per WorkOrder, stopping at the first top-level Material line. It reads that WorkOrder's exact current Material context only after the hit. Output keeps counts and identity-source categories only. `QuotationOrderBrowseIdentity.spuIdSource` records whether an SPU came from an explicit Order-line field, embedded product field, embedded Material identity, Material reference, or row-ID fallback. The comparator reports row-ID/catalog equality as a diagnostic only and never promotes it to an SPU match. Synthetic tests cover exact identity, mismatched prices, missing prices, SKU ambiguity, Package-child exclusion, duplicate identities and Order ownership conflict.

## Next evidence step

The Package-contained rows were followed in a separate [bounded Package price comparison](G4F_ORDER_PACKAGE_PRICE_SNAPSHOT_PROD_READ_20261105.md). One exact current Package/Order snapshot matched; a second historical Package was absent from its current filtered catalog and remains unknown. For the direct Material sample, the next evidence needed is an explicit identity in the role-scoped type-1 Order projection or an independently source-verified type-1 conversion mapping; no arbitrary-ID detail read is used to fill the gap. Neither step authorizes Production/Beta writes; #201 remains HOLD.
