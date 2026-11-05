# G4-F Selectable Catalog Contexts 2–4 — 2026-11-05

**Status: `PROD_READ_ONLY_CATALOG_CONTEXTS_COMPLETE_FOR_CURRENT_ROLE_LIST`.** Four distinct `serviceType` / `sourceType` pairs with a current enabled `place_order` action were found in the complete current technician WorkOrder list. Contexts 2–4 had their R1 catalog and SKU-read chains completed; context 1 is documented in the [2026-11-04 read](G4F_SELECTABLE_CATALOG_PROD_READ_20261104.md). This is read evidence only; no Order list was read in these context-only passes and no quote, Workflow, upload, or business write was attempted.

## Scope and safety

- Authenticated with the preconfigured local technician profile. Credentials were not printed or persisted. Session storage was memory-only; no browser/local storage was used.
- The ordinal-5 discovery pass read all 41 role-scoped WorkOrder pages (121 rows) and 121 list-derived details; all detail reads succeeded. It found four distinct eligible pairs and exhausted the current role-visible list without finding a fifth. The selected WorkOrder detail had to match its own `workOrderId`, and its current Workflow projection had to enable `place_order`.
- The report intentionally omits WorkOrder, service/source, product, SPU, SKU, Code, customer, and price values. Context ordinal means the order in which distinct pairs appeared in this role-scoped scan; it is not a business identifier.
- Used the application `QuotationCatalogReadAdapter` and Production read transport. All catalog pages used active-state, service type, source type, stable sort, and bounded page sizes. No `_all` request was made.
- In each context, Package detail reads were restricted to IDs returned by that scoped package list. Material SKU reads were restricted to that context's listed direct Materials and exact SPU references found in its Package details, using the R1 single-SPU and Package batch request shapes with `rows=30` and active state.
- Resolved the one active material sales ExtField through its exact returned Code dictionary IDs before reading SKU pages. Static selector dictionaries were resolved through the same WorkOrder-scoped adapter and configured R1 tenant.
- **Production business mutation requests: 0.** Order query, quote write, Workflow completion, upload, coupon, PDF/customer interaction, and role change requests: 0.

## Context comparison

| Distinct context ordinal | Packages | Procedures | Materials | Measures (机措) | Package details | Context-local SPUs read for active SKU | Active SKU rows |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 ([2026-11-04 report](G4F_SELECTABLE_CATALOG_PROD_READ_20261104.md)) | 27 | 66 | 89 | 4 | 27 | 93 | 0 |
| 2 | 27 | 66 | 89 | 4 | 27 | 93 | 0 |
| 3 | 27 | 66 | 89 | 4 | 27 | 93 | 0 |
| 4 | 1 | 0 | 14 | 0 | 1 | 15 | 0 |

Each context independently resolved one active material sales field with 66 Code options and the same six static selector option counts: package parts 7, package types 5, package age limits 4, procedure types 8, selected material types 9, and package material layers 6. This table compares counts only. Product/SPU identities were not retained, so cross-context overlap and identity equivalence are unknown.

## Observed catalog shape

| R1 selector in context 2 | Active rows | Pages | Reported total | Complete |
| --- | ---: | ---: | ---: | --- |
| Packages | 27 | 2 | 27 | Yes |
| Procedures | 66 | 4 | 66 | Yes |
| Materials | 89 | 5 | 89 | Yes |
| Measures (机措) | 4 | 1 | 4 | Yes |

All 27 listed Package details were read successfully. Their compositions contained 64 procedure references, 87 material references, and no measure references. Direct Materials plus Package composition resolved to 93 unique SPUs within this context.

The adapter completed 115 bounded SKU reads for all 93 SPUs in context 2; all succeeded and returned **zero active SKU rows**. Context 3 had the same 27/66/89/4 list counts and Package composition counts, and its 115 SKU reads also returned zero active rows for all 93 context-local SPUs. Context 4 had one Package, no Procedure rows, 14 Materials, and no Measure rows. Its Package detail had one Procedure reference and one Material reference; the resulting 15 context-local SPUs were all read successfully and returned zero active rows. This means only that the exact R1 active-state query returned empty row sets for those context-local SPUs. It does not mean Production has no SKU records globally, and it does not cover inactive/historical rows, other roles, or unlisted WorkOrder contexts.

## Interpretation and limits

- The complete current role-visible WorkOrder list contained four distinct enabled `place_order` service/source pairs; the discovery pass read all 121 details without failures and found no fifth pair. This is complete only for that role-list snapshot, not all technicians or future list state.
- Contexts 1–3 each exposed 27 Packages, 66 Procedures, 89 Materials, 4 Measures, and 93 context-local SPUs; all three active SKU reads returned empty. Context 4 exposed a smaller catalog and its 15 active-state SKU reads were also empty.
- Because raw identities were intentionally not retained, cross-context SPU overlap and whether equal counts represent the same products are unknown.
- The WorkOrder list scan found no evidence here about Order-to-SKU/SPU linkage: this catalog-only mode made zero Order requests. Do not infer that the WorkOrder's Orders lack material identities.
- Complete list and Package reads establish the current role-visible catalog shapes for the four discovered contexts only. They do not establish final quotation prices, discounts, SKU eligibility outside those contexts, or complete cross-role availability.
- Order identity discovery remains bounded separately by its page-one / three-row read contract and is incomplete where a WorkOrder reports additional Order pages.
