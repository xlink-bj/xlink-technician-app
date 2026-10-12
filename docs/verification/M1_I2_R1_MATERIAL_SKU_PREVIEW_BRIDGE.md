# M1 I2 /8 — R1 material SKU three-source preview in REAL Quotation Catalog

Tracking [#92](https://github.com/xlink-bj/xlink-technician-app/issues/92) / [#33](https://github.com/xlink-bj/xlink-technician-app/issues/33). Source authority `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`, `business/subpackages/order/placeOrders.vue`. Parent [Draft #101](https://github.com/xlink-bj/xlink-technician-app/pull/101) exact HEAD `b914fc4a2e63d2a0236fde39ff312c770765e728`.

## R1 source truth and why naive SKU selection is unsafe

- R1 `:2983–3018` renders only SPU `exts[f.name]` candidate values, resolves labels via Code dictionary and then matches selected codes with SKU `exts[key]` (`:6259–6264`).
- R1 `:6191–6228` *also* takes the raw provider's SKU row and rewrites `exts` to `{commonName,attributeValues:{}}`, dropping per-SKU sales codes. Package path `:6306–6343` does likewise and additionally drops `spuid` before later grouping by `spuid` at `:6354`. These are **source-proven internal inconsistencies**, not evidence of actual production failure: other branches/restoration may provide attributes. We do not copy a lossy mapping into a new selector.
- The **existing R1 backend** `basic/material/queryWithRank` and `basic/material/query` already supply raw SPU / SKU objects in the respective provider responses; this slice reads and bounds only the attributes needed for a *read-only preview*. Actual business response completeness and actor rights are not proven by synthetic tests.

## Implemented source-to-UI readonly bridge

1. `quotation-catalog-api.ts` projects only bounded SPU `exts` **primitive code arrays** into `saleOptionCandidates`, ignoring unrelated objects/metadata. No whole `exts` object passed to UI or persisted as draft.
2. SKU reads accept an explicit ordered **saleFieldNames allowlist from verified ExtField+Code metadata** and project only those raw SKU `exts` scalar codes to `saleAttributeValues`. No SKU prices, cost, PII or inventory projected. R1 single-Material `spuid` request unchanged; multi Package remains distinct.
3. `material-sku-selection-preview.ts` intersects (a) material SPU offered codes, (b) current `valueOption` Code labels, (c) each same-parent live SKU's matching source attribute values; rejects malformed/incomplete, cross-SPU, missing labels, duplicate SKU and ambiguous combinations. Selection is exact **code** equality, never display label or row index. No automatic selection.
4. `catalog-browser-store.ts` loads read-only ExtField/Code then SKU in the current successfully-listed **material** context; invalidates stale async requests on Back, reload, category change and WorkOrder store `configure`. Underlying catalog adapter also drops responses across authenticated user/role/version changes.
5. `QuotationActionContent.vue`: from real Material catalog list, items with SPU candidate arrays show **查看规格（只读）**. A nested panel displays actual bounded Code labels, a unique SKU match confirmation or explicit unavailable/incomplete state. **No “加入报价” button** in preview, no quantity/price nor Order writing. For no sale-attribute candidate rows existing direct-add behavior remains as before.

## CI acceptance checks and explicit exclusions

- `tests/g4f/r1-material-sku-preview-bridge.test.ts`: Code whitelist/SPU restriction, unique exact code match, missing SKU ext, no label-based guess, duplicate SKU ambiguity, working browser preview, stale read after Back, foreign material block.
- `tests/g4f/r1-material-sku-read-compatibility.test.ts`: read adapter projects bounded raw provider SPU option candidates, only requested SKU scalar sale attrs and never financial/unrelated exts; prevents unsafe attribute names and drops stale user/role read.
- **No real Beta or Production API execution, backend patch, Production read expansion, native device test, official Order write or simulated success.** R1's own lossy `exts` mapping needs real business samples or additional R1 route confirmation before formal SKU configuration is allowed to mutate drafts.
- A UI-only read preview **does not complete I2** (actual SKU quantity, persisted selection, return/re-edit/role separation still pending) and does not replace #41 Owner approved final quote UX. Current project count remains M1 1/8 Accepted and I2 1/4 until further accepted gates.

Exact-head CI/H5 results to be logged in [#92](https://github.com/xlink-bj/xlink-technician-app/issues/92). All relevant PRs stay OPEN / DRAFT / NOT MERGED.
