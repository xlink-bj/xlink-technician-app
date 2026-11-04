# R1 SKU catalog parity — bounded read evidence

**Status:** source and New App request/projection parity are covered by tests. The current role-visible Production scan ended `BLOCKED_NO_ROLE_VISIBLE_SKU_ORDER_LINE`; no material ExtField, Code dictionary, or SKU catalog requests were sent. R1 UI runtime matching remains `NOT_RUN`.

## Scope and source truth

- R1 frontend: `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`, `business/subpackages/order/placeOrders.vue`.
- Backend reference: `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`. No backend or R1 code was modified.
- The query paths and parameters below follow the pinned R1 page. The isolated audit runner adds one-page caps for evidence collection and does not enable these routes in the Production App transport.

| Concern | Pinned R1 behavior | New App behavior / verification |
| --- | --- | --- |
| Sales attributes | `biz/extField/query` for active `material` ExtFields; only `frontEndConfig.salesAttribute` fields participate. | Existing `listMaterialSalesFields` uses the same route/filter, validates the fields, and requests matching `valueOption` dictionaries. Synthetic contract tests verify exact request shape and fail closed on incomplete options. Production App reads remain disabled. |
| Code options | `i/code/selectCode.do` with `codeId`/`eleid` pairs and R1’s configured tenant value. | Existing adapter matches that contract. The isolated audit guard permits one exact request for IDs returned by the ExtField read; it does not accept another tenant, extra providers, or a retry. |
| Direct Material SKU | `basic/material/query`, active state and exact `spuid`; R1 does not add `sourceType` to this request. | Existing New App direct SKU request matches the R1 route and filters. The Product App still blocks Production SKU reads. The isolated audit uses `page=1, rows=30`, without `_all`, and one SPU only. |
| Package Material SKUs | R1 uses `in:spuid|array#and`, including a one-SPU package. | Existing adapter retains that distinction and has synthetic regression coverage. |
| Attribute matching | R1 `skuMatch` compares the selected values to `sku.exts[key]`. Its `getMaterialSKU` projection rebuilds `exts` with only `commonName` and an empty `attributeValues`, which appears to drop other selected attributes before matching. | Existing New App adapter projects only allowlisted sales-attribute values from raw `exts`; tests cover exact matching, ambiguity and malformed/missing attributes. The R1 projection discrepancy is source-simulated only; no live R1 picker result is claimed. |
| Price meaning | R1 SKU `price` is a unit-price input. Saved Order `amount` and `totalAmount` are captured Order values, with Order-level amounts/discounts kept separate. | Existing read models preserve SKU unit price separately from captured Order line amounts and totals. Tests prohibit substituting catalog price for persisted Order pricing. |

## Production read attempt

The local preflight passed: Production target configured, technician login configured, Mock off, real business writes disabled. The one execution used the current technician role and scanned only sequential role-visible WorkOrder pages (`rows=3`), with a bounded `type=1` Order query (`rows=3`) for each listed WorkOrder.

- Login: 1; role tree: 1; WorkOrder pages: 41; WorkOrders checked: 121.
- No returned Order line exposed both a material SKU ID and its SPU ID in the current role-visible sample. The scan therefore stopped before the three SKU-related endpoints.
- ExtField reads: 0; Code dictionary reads: 0; SKU reads: 0.
- Unexpected blocked requests: 0; business mutation requests: 0; raw responses, IDs, prices, or credentials persisted: none.
- This bounded absence does not prove that SKU rows do not exist elsewhere or for another role, tenant, or time range. The prior single Order/Contract read is not reused as a SKU target because its raw identity was intentionally not retained and could not be revalidated in this run.

No broader catalog discovery was attempted. A future live SKU read requires a newly verified role-visible Order material line with exact SKU/SPU identity or a separately authorized test sample.

## Automated coverage

- `tests/g4f/r1-sku-read-audit.test.ts` covers exact route/body guards, one-call limits, complete ExtField/Code mapping, Order-to-SKU/SPU selection, duplicate/foreign identity rejection, bounded-page ambiguity, R1 projection behavior, redacted summaries, and captured-versus-current unit-price distinction.
- `tests/g4f/r1-material-sku-read-compatibility.test.ts`, `tests/g4f/r1-material-sales-extfield-code-read.test.ts`, and `tests/g4f/r1-material-sku-preview-bridge.test.ts` continue to cover the app adapter and picker semantics with synthetic data.
- H5 Playwright runs the actual New App in isolated DEV Mock only. It does not substitute for Production catalog reads or R1 UI runtime evidence.

**Gate state:** New App code/source parity `CODE_PASS`; live catalog/attribute equivalence `NOT_VERIFIED`; R1 runtime `NOT_RUN`; Production/Beta writes `0`.
