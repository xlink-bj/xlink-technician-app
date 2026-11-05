# R1 Procedure/Measure Price and Order Snapshot Read — 2026-11-05

**Status: `DIRECT_PROVIDER_ORDER_SNAPSHOTS_COMPARED_FOR_BOUNDED_SAMPLES`.** The read-only audit found source-backed top-level Procedure and Measure rows in role-visible type-1 Orders. Three rows matched unique current providers in their exact WorkOrder-derived catalog context, and all three saved unit-price snapshots equaled the current `guideUnitPrice`. This is a small sample, not a global price-freshness, Order-write, or server-recalculation claim.

## R1 rules used

Pinned R1 frontend source: `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29`, `business/subpackages/order/placeOrders.vue`.

- `getProcedures()` and `getMeasures()` load active provider rows in the WorkOrder `serviceType/sourceType` context and retain each provider `_id` and `guideUnitPrice` (`placeOrders.vue:5562–5620`, `5687–5735`).
- On Order serialization, Procedure and Measure `amount` are set from `guideUnitPrice`. Measure `totalAmount` is R1's rounded `amount × number`; Procedure uses `minimumGuideTotalPrice` when the product is below the floor and otherwise the rounded product (`placeOrders.vue:4059–4132`; edit path `6770–6839`).
- The saved type-1 Order row is compared only to a unique current provider row with the same source-proven direct category `_id`. A generic or conflicting row/reference ID, invalid saved amount relationship, missing price, duplicate provider ID, wrong WorkOrder, or truncated Order page remains unknown. Package children are excluded from direct provider counts.

## Bounded Production read

- Used the locally configured technician identity and only role-visible WorkOrder list/detail reads. The Order association was required to match the selected WorkOrder exactly, with `type=1`, page 1, at most 3 rows per WorkOrder.
- Discovery is bounded to at most 121 role-visible WorkOrders and stops at the first eligible direct-provider Order. The Procedure sample inspected 3 WorkOrders; the Measure-targeted search inspected 4. No WorkOrder or Order IDs, names, amounts, customer data, session values, or credentials were printed or stored.
- The selected WorkOrder-derived catalog returned 66 Procedures across 4 pages and 4 Measures on 1 page. Catalog reads were issued only for categories present as direct rows in the discovered Order.
- **Production business mutations: 0.** Quote/Order/Workflow/Contract/upload/PDF/customer-interaction write requests: 0. Unexpected blocked network routes: 0.

| Discovery sample | Role-visible WorkOrders inspected | Exact type-1 Orders in selected WorkOrder | Direct rows in selected Orders | Unique current provider matches | Snapshot comparison |
| --- | ---: | ---: | --- | ---: | --- |
| Procedure-targeted by first direct-provider hit | 3 | 1 | Procedure 1, Measure 0 | 1 | `COMPARED`: 1 equal, 0 different, 0 unknown |
| Measure-targeted | 4 | 2 | Procedure 1, Measure 2 | 3 | `COMPARED`: 3 equal, 0 different, 0 unknown |

The Procedure-targeted sample's saved R1 amount relationship was valid, including the Procedure minimum-floor rule. The Measure-targeted sample's two direct Orders had complete first pages and valid saved amount relationships. No Order-list truncation or WorkOrder association conflict was reported.

## Interpretation and limits

- The sample confirms that the app's read projection can distinguish direct Procedure/Measure Order rows, match them to current WorkOrder-scoped provider IDs, and compare R1's persisted unit-price snapshots without substituting a catalog price into the historical row.
- Three equal prices only describe these specific rows at the time of this bounded read. They do not establish historical price versioning, broader tenant/technician coverage, current UI acceptance, server-side recalculation, or formal quote/Order write-path parity.
- This audit did not read or infer Contract state, Workflow completion, Order.type=0 quotes, arbitrary-ID Order details, or full Order histories. Production/Beta business writes remain disabled and Issue #201 remains HOLD.
- Earlier Material evidence remains scoped: one historical direct Material candidate's row ID fallback was not accepted as SPU identity, and its associated SKU probe returned zero active rows. That one candidate is not a claim that Production has no active SKUs; the direct Material SPU can be priced without making SKU a universal prerequisite.

## Audit support

The local runner supports:

```sh
node scripts/verify-g4f-prod-read.mjs \
  --catalog-context-only \
  --compare-selected-order-procedure-measure-prices \
  --discover-direct-provider-order \
  --authorize-bounded-prod-read
```

Use `--discover-direct-measure-order` to skip Procedure-only candidates while looking for a Measure row. Both modes require explicit bounded-read authorization; their preflight/default paths make zero network requests. The comparison output is count-only and keeps uncertain identities or incomplete pages unknown.
