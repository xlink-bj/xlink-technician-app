# #69 — DEV Mock R1-like Catalog Taxonomy Slice

## Evidence and context
Draft #68 read normalization & pure classifier, pinned R1 `placeOrders.vue` and `procedureFilter.js`. Verified R1 uses serviceType-dependent code dictionaries. The existing new-App endpoints `code/query`, `i/code/selectCode.do` and `i/code/selectMultistageCode.do` are **not interchangeable**; authorized live codeType and current-tenant option provenance are UNKNOWN. This slice deliberately does not send a request to obtain them.

## Strict DEV-only behavior
The **real main-App QuotationActionContent**, when `import.meta.env.DEV && productReviewOnly === true`, shows an explicitly labelled synthetic taxonomy toolbar, distinct from real catalog search and selection. Source simulations: packages `synthetic-roof/synthetic-wall`, procedures `synthetic-prep/synthetic-seal`, Material type `1/2` (not claim of true current tenant type1/type2 dictionaries), Measure no verified filter. The helper locally simulates R1 serviceType 11 **only for deterministic fixture behavior**, never rewrites the business WorkOrder serviceType or request body.

Per current repair group and catalog kind, selected filter is held in in-memory scoped state. Search is independently scoped using the existing group/kind key. A matching item is viewable/selectable, a source-confirmed nonmatch is hidden, and a metadata-unknown item remains visibly `适用性未核实` with a **disabled** product action and command guard. Choosing `全部` restores unchanged original list behavior. Existing package layers/quantity/official Order logic unchanged.

No new Production/Beta API, field provider, dynamic form, price, SKU, Order/Workflow/Contract command; no claim the UI proves current tenant product eligibility. Unit and main App Playwright must demonstrate package filters, unknown result, category switches, group isolation, edits and no external request. Capture filter page states at 375/390 widths as screenshot artifacts.

## Gates
`DEV_MOCK_FILTER_TECH_PENDING / REAL_R1_DICTIONARY_SOURCE_UNVERIFIED / LIVE_FILTER_NOT_ACTIVATED / OWNER_RUNTIME_VISUAL_PENDING / NO_MERGE`.
