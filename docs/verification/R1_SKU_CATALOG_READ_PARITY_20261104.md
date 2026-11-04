# R1 SKU catalog parity — bounded read evidence

**Status:** R1/New App request and projection contracts are covered by tests. Bounded current-role Production reads confirmed WorkOrder → type=1 Order associations and independently projected SPU IDs / SKU codes. The first ten order-derived SPU candidate positions each returned an empty active SKU page. Order-to-catalog variant matching remains `NOT_VERIFIED`; R1 UI runtime matching remains `NOT_RUN`.

## Scope and source truth

- R1 frontend: `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`, `business/subpackages/order/placeOrders.vue`.
- Backend reference: `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`. No backend or R1 code was modified.
- The query paths and parameters below follow the pinned R1 page. The isolated audit runner adds one-page caps for evidence collection and does not enable these routes in the Production App transport.

| Concern | Pinned R1 behavior | New App behavior / verification |
| --- | --- | --- |
| Sales attributes | `biz/extField/query` for active `material` ExtFields; only `frontEndConfig.salesAttribute` fields participate. | Existing `listMaterialSalesFields` uses the same route/filter, validates the fields, and requests matching `valueOption` dictionaries. Synthetic contract tests verify exact request shape and fail closed on incomplete options. Production App reads remain disabled. |
| Code options | `i/code/selectCode.do` with `codeId`/`eleid` pairs and R1’s configured tenant value. | Existing adapter matches that contract. The isolated audit guard permits one exact request per run for IDs returned by the ExtField read; it does not accept another tenant, extra providers, or a retry. |
| Direct Material SKU | `basic/material/query`, active state and exact `spuid`; R1 does not add `sourceType` to this request. | Existing New App direct SKU request matches the R1 route and filters. The Product App still blocks Production SKU reads. The isolated audit uses `page=1, rows=30`, without `_all`, and one SPU only. |
| Package Material SKUs | R1 uses `in:spuid|array#and`, including a one-SPU package. | Existing adapter retains that distinction and has synthetic regression coverage. |
| Attribute matching | R1 `skuMatch` compares the selected values to `sku.exts[key]`. Its `getMaterialSKU` projection rebuilds `exts` with only `commonName` and an empty `attributeValues`, which appears to drop other selected attributes before matching. | Existing New App adapter projects only allowlisted sales-attribute values from raw `exts`; tests cover exact matching, ambiguity and malformed/missing attributes. The R1 projection discrepancy is source-simulated only; no live R1 picker result is claimed. |
| Price meaning | R1 SKU `price` is a unit-price input. Saved Order `amount` and `totalAmount` are captured Order values, with Order-level amounts/discounts kept separate. | Existing read models preserve SKU unit price separately from captured Order line amounts and totals. Tests prohibit substituting catalog price for persisted Order pricing. |

## Production read attempt

The local preflight passed: Production target configured, technician login configured, Mock off, real business writes disabled. The order summary used the current technician role and scanned sequential role-visible WorkOrder pages (`rows=3`), with a bounded `type=1` Order query (`rows=3`) for each listed WorkOrder.

- Login: 1; role tree: 1; WorkOrder pages: 41; WorkOrders checked: 121.
- The bounded Order pages returned 89 type=1 Order rows across 79 WorkOrders. Those rows contained 178 material lines: all 178 projected an SPU ID, 155 also projected a SKU code, and 0 projected a SKU ID. Each WorkOrder query returned at most three Order rows; total Order completeness remains bounded/unverified.
- The initial SKU selector required both a material SKU ID and SPU ID on one line. That criterion was too strict; its “no pair” result did **not** mean there were no associated Orders or no separate SKU/SPU evidence.
- Follow-up bounded probes selected the first ten order-derived SPU candidate positions in the same current-role ordering. For each candidate, the runner queried one complete active material ExtField page, its exact Code dictionary, and one `basic/material/query` page for that SPU (`page=1, rows=30, state=1`, no `_all`). All ten SKU responses reported `total=0`; each was a complete empty page. No SKU ID was present on those sampled Order lines, so SKU codes were not treated as catalog SKU IDs or used as a match key.
- Catalog SKU-to-Order SKU-code matching remains unverified. An empty current active SKU page for these candidates does not prove that every Order-referenced SPU or historical/inactive SKU is absent.
- Unexpected blocked requests: 0; business mutation requests: 0; raw responses, IDs, prices, or credentials persisted: none.
- These counts describe the bounded pages visible to this technician, not every Order or catalog row for the WorkOrders, another role, tenant, or time range. SPU values were intentionally not persisted; the ten candidate positions were resolved anew through the role-scoped reads in each bounded run.

No broad catalog discovery was attempted. Further parity evidence needs a role-visible Order line whose referenced SPU returns active SKU rows; correlation to the Order snapshot SKU code must then be established from R1 field semantics. Do not infer SKU ID from SKU code or substitute current catalog price for captured Order pricing.

## Automated coverage

- `tests/g4f/r1-sku-read-audit.test.ts` covers exact route/body guards, one-call limits, complete ExtField/Code mapping, independent Order/SKU/SPU identity summaries, duplicate/foreign identity rejection, bounded-page ambiguity, R1 projection behavior, redacted summaries, and captured-versus-current unit-price distinction.
- `tests/g4f/r1-material-sku-read-compatibility.test.ts`, `tests/g4f/r1-material-sales-extfield-code-read.test.ts`, and `tests/g4f/r1-material-sku-preview-bridge.test.ts` continue to cover the app adapter and picker semantics with synthetic data.
- H5 Playwright runs the actual New App in isolated DEV Mock only. It does not substitute for Production catalog reads or R1 UI runtime evidence.

**Gate state:** New App code/source parity `CODE_PASS`; bounded role-visible Order association `OBSERVED` (89 Order rows / 79 WorkOrders in the returned pages); SPU ID present on 178/178 sampled material lines; SKU ID on 0/178 and SKU code on 155/178; active SKU rows `0` for the first ten order-derived SPU candidate positions; SKU/catalog and attribute equivalence `NOT_VERIFIED`; R1 runtime `NOT_RUN`; Production/Beta writes `0`.
