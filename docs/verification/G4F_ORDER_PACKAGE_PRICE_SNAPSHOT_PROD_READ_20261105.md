# R1 Package Price and Order Snapshot Read — 2026-11-05

**Status: `ONE_EXACT_PACKAGE_SNAPSHOT_MATCH; SECOND_CONTEXT_UNMATCHED_TO_CURRENT_CATALOG`.** The first bounded sample produced one exact match between a role-scoped type-1 Order Package and its current scoped catalog item/detail. The second sample's historical Package ID was not in that WorkOrder's complete current selectable Package catalog, so no arbitrary detail request was sent. These samples do not establish global price freshness, server-side recalculation, or write-path parity.

## R1 pricing rule used

The pinned R1 client snapshot (`6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29`, `business/subpackages/order/placeOrders.vue`) provides the rule:

- The Package row uses `_id`, `amount`, `number`, `minimumPrice`, and `totalAmount`.
- Unit `amount` is the Package base `price` plus selected Package Material `exts.price` values greater than zero.
- `totalAmount` is the rounded `amount × number`, except that R1 substitutes `minimumPrice` when the product is below the floor.
- A populated material layer has exactly one selected component. Component identity, layer and selected `exts.price` are part of that Package snapshot. Package-child Material rows are not direct Material catalog selections.
- R1 `pricingMethod === '1'` uses a separate SKU composition branch and is not treated as the ordinary Package formula by this comparison.

The comparison requires the historical Package `_id` to match exactly one Package in the same WorkOrder-derived `serviceType/sourceType` catalog. It then requires the exact listed Package detail, one historical Material per current populated layer, matching component/reference identity, unambiguous values, and both saved unit and total snapshots. It compares cents using the R1 `toFixed(2)` boundary and applies the current minimum floor.

## Bounded Production read

- Used the locally configured technician profile and current role-visible WorkOrder list. Authentication/session data, WorkOrder/Order/Package identities, names, amounts and customer data were not printed or persisted.
- For each sample, verified a list-derived WorkOrder detail with an enabled `place_order` action and read only `type=1` Orders for that exact WorkOrder, `page=1`, `rows=3`.
- Package selector reads used that WorkOrder's exact catalog context. Package detail was requested only for an Order Package ID present in the complete current Package list.
- **Production business mutations: 0.** No quote, Order, Workflow, Contract, upload, PDF or customer-interaction write was attempted.

| Encounter ordinal of distinct current context | WorkOrder / Order bound | Current Package catalog | Exact Package detail | Price comparison |
| ---: | --- | --- | --- | --- |
| 1 | 1 matching type-1 Order; 1 Package line | 27 items across 2 pages; one exact unique Package ID match | 1 listed detail read successfully; selected component/layer identities matched | `COMPARED`: 1/1 current total equal, 0 different, 0 unknown; no selected component markup difference |
| 4 | 1 matching type-1 Order; 1 Package line | 1 item across 1 page; no exact Package ID match | Not requested because the historical ID was not listed | `NO_COMPARABLE_LINES`: 0 compared, 1 unknown |

The encounter ordinal is a sanitized sample label, not a business identity. The Order list query is intentionally bounded; the results do not represent all Orders for either WorkOrder or all Orders visible to the technician.

## Interpretation and limits

- The one exact match confirms that, for this sampled standard Package, R1's current scoped base/selected-component markup/floor projection agrees with the persisted type-1 Order unit and total snapshot.
- The unmatched historical Package in context 4 is not classified as deleted or invalid; it is simply absent from that WorkOrder's current filtered selector result.
- Equality in one sample does not prove other service/source contexts, other package variants, current Production UI rendering, price approval provenance, price freshness/versioning, or authoritative server recalculation.
- A DEV Mock comparison validates the modeled R1 protocol only. Production write behavior, quote creation, Order creation and Workflow completion remain unverified and unauthorized; `#201` remains HOLD.
- Earlier sampled contexts returned zero active SKU rows for the SPUs read in those contexts. This is scoped evidence only; it does not mean that direct Material SPU rows or all Production SKU records are absent.

## Audit support

The local read-only runner supports `--catalog-context-only --compare-selected-order-package-prices`. It makes one scoped Order-list request, reads only the current Package catalog, and requests details only for exact Order Package IDs returned by that catalog. Output contains sanitized counts only. If identity, page completeness, material-layer selection, SKU branch, or amount snapshots are incomplete or ambiguous, the line remains unknown. The default and unauthenticated invocation stays at zero network.
