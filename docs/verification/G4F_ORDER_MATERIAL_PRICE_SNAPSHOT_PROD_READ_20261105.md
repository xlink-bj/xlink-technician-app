# R1 Current Material SPU Price and Order Snapshot Read — 2026-11-05

**Status: `BOUNDED_READ_COMPLETE_NO_DIRECT_MATERIAL_PRICE_PAIR_IN_SELECTED_PLACE_ORDER_SAMPLES`.** This read found no eligible standalone Material line in the first three type-1 Orders for one current `place_order` WorkOrder in each of the four role-visible service/source contexts. It does **not** establish that standalone Material Orders or matches do not exist elsewhere in the technician's WorkOrder history.

## Scope and safety

- Used the locally configured technician profile and current role-visible WorkOrder list. Credentials, session data, raw identities, labels and literal prices were not printed or persisted.
- Each chosen WorkOrder detail matched its list-derived identity and had an enabled current `place_order` action with non-empty `serviceType` and `sourceType`.
- Read only `type=1` Orders through the existing WorkOrder-scoped Order adapter, `page=1`, at most three rows, with no `_all` or arbitrary-ID Order query.
- Read the current R1 `mini` direct Material catalog for each selected context. Only a direct Material SPU referenced by the selected Order would trigger a scoped SKU read; unrelated package, procedure, measure and SKU data were not fetched by this comparison pass.
- **Production business mutation requests: 0.** Quote, Order, Workflow, upload, Contract and customer-interaction writes: 0.

## Sanitized outcomes

| Context ordinal in current role scan | Bounded type-1 Order result | Direct Material Order lines | Direct SPU price comparison |
| ---: | --- | ---: | --- |
| 1 | 1 Order | 0; the recognized Material rows were nested under a Package | `NO_DIRECT_MATERIAL_LINES` |
| 2 | 0 Orders | 0 | `NO_ORDER_IN_BOUND` |
| 3 | 0 Orders | 0 | `NO_ORDER_IN_BOUND` |
| 4 | 1 Order | 0; the recognized Material row was nested under a Package | `NO_DIRECT_MATERIAL_LINES` |

The ordinal is the encounter order of distinct service/source pairs; it is not a business identifier. The Order page bound is intentional. A zero-row page means no Order was returned by this exact page-one query, not that an unbounded Order search was performed.

## Interpretation

- A Package's embedded Material component is not an independent direct Material selection. Its amount depends on the exact Package snapshot, component identity, layer/coefficient and R1 package pricing branch. It must not be compared to the standalone Material SPU catalog price.
- For a standalone Material price comparison, the Order line must have an explicit SPU/reference provenance and match exactly one current direct Material catalog row in the same WorkOrder-derived service/source context. A projected Order row `_id` fallback, SKU ID/code, active SKU variants, missing unit snapshot, or truncated/ambiguous relationship remains unknown.
- R1's normalized current Material `price` is the `mini` selector price; the Order line `amount` is a historical unit snapshot and `totalAmount` is its persisted total. Equality to the current catalog price is not expected when prices changed and is not a write-path acceptance test.
- Earlier complete context-specific catalog reads found zero active SKU rows for every SPU read in the four current-role contexts (contexts 1–3: 93 each; context 4: 15). This concerns the sampled SPUs and current active SKU filter only. It does not mean that the ordinary direct Material SPU catalog is empty or that Production has no SKU records globally. See [G4-F selected catalog evidence](G4F_SELECTABLE_CATALOG_PROD_READ_20261105.md).

## Audit support added

The bounded audit runner can compare an exact selected type-1 Order page against the current direct Material catalog while retaining only counts in output. `QuotationOrderBrowseIdentity.spuIdSource` records whether the SPU came from an explicit Order-line field, embedded product field, embedded Material identity, Material reference, or a row-ID fallback. The comparison rejects the fallback and leaves SKU-bearing or variant-ambiguous lines unknown. Synthetic tests cover exact identity, mismatched prices, missing prices, SKU ambiguity, Package-child exclusion, duplicate identities and Order ownership conflict.

## Next evidence step

The selected Orders contain Package-contained Material rows, so the next price-evidence slice should first map an exact Order Package ID to the current context's listed Package and its listed Package detail, then verify the R1 `pricingMethod`, minimum-price and component snapshot relationship. A separate eligible WorkOrder sample is still required to validate a standalone direct Material SPU line. Neither step authorizes Production/Beta writes; #201 remains HOLD.
