# R1 SKU catalog parity — bounded read evidence

**Status:** R1/New App request and projection contracts are covered by tests. Bounded current-role Production reads confirmed WorkOrder → type=1 Order associations and SPU-only Order material identities. All 40 distinct SPUs found in the returned Order pages were queried once; each returned an empty active SKU page. No selected SKU ID was present in the returned Order details. Order-to-catalog variant matching remains `NOT_VERIFIED`; R1 UI runtime matching remains `NOT_RUN`.

## Scope and source truth

- R1 frontend: `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`, `business/subpackages/order/placeOrders.vue`.
- Backend reference: `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`. No backend or R1 code was modified.
- The query paths and parameters below follow the pinned R1 page. The isolated audit runner adds one-page caps for evidence collection and does not enable these routes in the Production App transport.

| Concern | Pinned R1 behavior | New App behavior / verification |
| --- | --- | --- |
| Sales attributes | `biz/extField/query` for active `material` ExtFields; only `frontEndConfig.salesAttribute` fields participate. | Existing `listMaterialSalesFields` uses the same route/filter, validates the fields, and requests matching `valueOption` dictionaries. Synthetic contract tests verify exact request shape and fail closed on incomplete options. Production App reads remain disabled. |
| Code options | `i/code/selectCode.do` with `codeId`/`eleid` pairs and R1’s configured tenant value. | Existing adapter matches that contract. The isolated audit guard permits one exact request per run for IDs returned by the ExtField read; it does not accept another tenant, extra providers, or a retry. |
| Direct Material SKU | `basic/material/query`, active state and exact `spuid`; R1 does not add `sourceType` to this request. | Existing New App direct SKU request matches the R1 route and filters. The Product App still blocks Production SKU reads. The isolated audit uses `page=1, rows=30`, without `_all`, and at most one page per Order-derived SPU. |
| Package Material identity | In `getOrderById`, direct selected SKUs are read from `materials.data` as `_id` + `spuid`. In a package, `materialList[].material._id` is the material/SPU identity; selected variants, when present, are in `materialList[].skus`. `material.exts.skuCode` contributes to the package's composite SKU code and is not a selected catalog SKU ID. | The audit parser follows these distinctions and never treats a package relation `_id` or `skuCode` as a SKU variant ID. The active SKU lookup below uses the verified SPU parent. |
| Package Material SKU lookup | R1 uses `basic/material/query` with `'in:spuid|array#and'` for package material SKU selection. | Existing adapter retains that distinct request contract and has synthetic regression coverage. This Production audit used one exact SPU per page and did not use the multi-SPU package lookup. |
| Attribute matching | R1 `skuMatch` compares the selected values to `sku.exts[key]`. Its `getMaterialSKU` projection rebuilds `exts` with only `commonName` and an empty `attributeValues`, which appears to drop other selected attributes before matching. | Existing New App adapter projects only allowlisted sales-attribute values from raw `exts`; tests cover exact matching, ambiguity and malformed/missing attributes. The R1 projection discrepancy is source-simulated only; no live R1 picker result is claimed. |
| Price meaning | R1 SKU `price` is a unit-price input. Saved Order `amount` and `totalAmount` are captured Order values, with Order-level amounts/discounts kept separate. | Existing read models preserve SKU unit price separately from captured Order line amounts and totals. Tests prohibit substituting catalog price for persisted Order pricing. |

## Production read attempt

The local preflight passed: Production target configured, technician login configured, Mock off, real business writes disabled. The order summary used the current technician role and scanned sequential role-visible WorkOrder pages (`rows=3`), with a bounded `type=1` Order query (`rows=3`) for each listed WorkOrder.

- Login: 1; role tree: 1; WorkOrder pages: 41; WorkOrders checked: 121.
- The bounded Order pages returned 89 type=1 Order rows across 79 WorkOrders. Those rows contained 178 material lines: all 178 projected an SPU ID, 155 also projected a SKU code, and 0 projected a SKU ID. Each WorkOrder query returned at most three Order rows; total Order completeness remains bounded/unverified.
- The initial selector required both a material SKU ID and SPU ID on one line. That criterion correctly withheld a match, but its original summary parser also missed the R1 package shape. It has now been corrected against the read-only R1 source: direct selected SKU rows use `_id` + `spuid`; package rows identify the SPU through `material._id`, and saved package SKU rows (when present) use `materialList[].skus`.
- The 88 returned Order details were identity-checked against their listed type=1 Order ID and WorkOrder. Their 16 direct material rows were ID-only (no `spuid`/`skuId`), and 162 package material rows had nested material IDs and no `skus` arrays. Under the pinned R1 projection these yielded 178 SPU-only material lines and zero selected SKU IDs. The 155 `skuCode` values are package material code components used to construct a composite package code; they are not SKU catalog IDs.
- The runner queried one active SKU page for each of the 40 distinct SPUs that appeared in both the scoped Order projection and its verified detail (`basic/material/query`, `page=1, rows=30, state=1`, exact `spuid`, no `_all`). All 40 pages returned `total=0`. Thus, the currently visible bounded Orders prove WorkOrder → Order and Order → SPU relationships, but do not provide a selected SKU ID or an active catalog SKU under those SPUs.
- This is still a bounded result: each WorkOrder Order lookup returned at most three rows, so later Order pages were not read; the catalog request only checks active variants in one page. It does not rule out later Orders, inactive/historical SKU rows, other roles, or another tenant's records. No SKU-code-to-catalog matching was attempted because R1's package `skuCode` is composite and is not a SKU ID.
- Unexpected blocked requests: 0; business mutation requests: 0; raw responses, IDs, prices, or credentials persisted: none.
- These counts describe the bounded pages visible to this technician, not every Order or catalog row for the WorkOrders, another role, tenant, or time range. SPU values were intentionally not persisted; candidate SPUs were resolved in memory from role-scoped Order reads.

No global catalog discovery was attempted. The next useful evidence is either a role-visible Order page beyond the first three rows that contains a true selected SKU, or a WorkOrder-linked Order whose referenced SPU has an active SKU row. Do not infer SKU ID from a package relation ID or code, and do not substitute current catalog price for captured Order pricing.

## Automated coverage

- `tests/g4f/r1-sku-read-audit.test.ts` covers exact route/body guards, current-role Order detail scoping, bounded unique Order-derived SPU SKU pages, complete ExtField/Code mapping, independent Order/SKU/SPU identity summaries, duplicate/foreign identity rejection, bounded-page ambiguity, R1 package/direct-material identity projection, redacted summaries, and captured-versus-current unit-price distinction.
- `tests/g4f/r1-material-sku-read-compatibility.test.ts`, `tests/g4f/r1-material-sales-extfield-code-read.test.ts`, and `tests/g4f/r1-material-sku-preview-bridge.test.ts` continue to cover the app adapter and picker semantics with synthetic data.
- H5 Playwright runs the actual New App in isolated DEV Mock only. It does not substitute for Production catalog reads or R1 UI runtime evidence.

**Gate state:** New App code/source parity `CODE_PASS`; bounded role-visible Order association `OBSERVED` (89 Order rows / 79 WorkOrders in the returned pages); SPU ID present on 178/178 returned material lines; selected SKU ID on 0/178; 40 distinct Order-derived SPUs queried, with active SKU rows `0` on all 40 first pages; SKU/catalog and attribute equivalence `NOT_VERIFIED`; R1 runtime `NOT_RUN`; Production/Beta writes `0`.
