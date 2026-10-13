# M1-I2 — R1 per-SKU quantity / scoped local draft v4 (non-commercial)

Parent [Draft #102](https://github.com/xlink-bj/xlink-technician-app/pull/102), pinned R1 source `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` `business/subpackages/order/placeOrders.vue:2970–3036,6191–6275`. Scope is **new App frontend only**, no backend change, no business write.

## What the R1 source shows

- `placeOrders.vue:2970–3036` displays selected SKU quantities under one Material SPU, takes selected sales attributes, matches a SKU and adjusts its quantity through `skuNumberChange`.
- `:6267–6275` calculates SPU `number = sum(sku.number)`. Multiple SKUs for a Material SPU are allowed in R1.
- `:6199–6228` drops raw SKU sales `exts` in an intermediate transform; `:6259–6264` still matches `sku.exts[key]`. Actual R1 runtime route/response and business effect are **not verified**; this frontend retains exact source-derived SKU IDs and attribute codes *only in an isolated local intent* rather than inventing matching values or a server order line.
- New App `order-encoder.ts` explicitly blocks unverified SPU/SKU material path; current pricing does not have sufficient source evidence for true SKU price/margins.

## Frontend scope in this branch

- Local-only `QuotationMaterialSkuChoice { skuId, quantity, attributes }`; optional `skuChoices` ONLY on `QuotationMaterialSelection`. A repair group + exact source material ID must already exist. Per-SKU quantity is an integer 1..9999, max 50 distinct SKUs and bounded sum; SPU quantity equals the sum. Matched SKU/attributes are taken from the already-verified current preview UI, **not** inferred by name, order, price, or implicit fallback.
- Local draft schema **v4**, exact shape validation, bad data preserved/rejected rather than silently edited. Read support for **v2/v3** remains. No backend DB/schema/API migration. Existing action draft storage continues to bind to user, WorkOrder, workflow node; group and material are kept in the selected draft path. **Role alone is not currently an ActionDraftIdentity key**, so do not claim this validates cross-role readback or server authorization. Catalog adapter already invalidates stale role reads.
- Actual `QuotationActionContent.vue`: once a material has been added to the current repair group, after precise 3-way SPU+Code+SKU match it offers a local SKU quantity input and **save to local draft**. Editing the same SKU restores its count; reentering restores it from scoped draft. Existing material add action stays visible. Per-SKU lines are shown on the workbench; manual parent SPU quantity input is disabled after SKU choice. Removing the entire material via existing action also removes its SKU choices.
- `validation.ts` always marks a local SKU choice **not ready for official quotation**; `order-encoder.ts` has an explicit material SKU choice deny guard. No price estimate, SKU Order serialization, Workflow Complete, PDF, Contract or signature command is activated. This does not change #41 quotation UX Owner sign-off.

## Negative cases / non-claims

- Never persist selections from foreign material ID, absent group, empty/partial combination, duplicate SKU IDs for same exact attributes, bad or excessive counts, or mid-request role changes.
- Existing WorkOrder/user identity keys are preserved; restore in a different user or different WorkOrder must not read the previous user's group or SKU choices. Within a single logged-in user switching roles, formal role-specific draft isolation remains **unverified**, and is still part of I2/I7 gates.
- No option stock/price eligibility, discount or official R1 Order equivalence is proven by synthetic unit/H5 test. Beta data & official type1 Order tests [#29](https://github.com/xlink-bj/xlink-technician-app/issues/29), physical MP/iOS/Android [#64](https://github.com/xlink-bj/xlink-technician-app/issues/64) remain NOT_RUN.
- Stage work is **I2 IN_PROGRESS**, not 4/4; I1 ACCEPTED, M1 1/8. All PRs Draft/unmerged until Owner+Lead approval.

Code / validation: `src/features/work-orders/quotation/{model,composition-store,draft-codec,validation,order-encoder,QuotationActionContent}.ts|vue`, `tests/g4f/r1-material-sku-local-draft.test.ts`, `tests/g4f/quotation-composition.test.ts`; exact HEAD Validate/Main H5/MP/App status to be entered at #92.
