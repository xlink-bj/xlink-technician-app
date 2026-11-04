# G4-F Current-Role Selectable Catalog Read — 2026-11-04

**Catalog status: COMPLETE for one verified Production `place_order` Work Order context. Order identity discovery: INCOMPLETE because one WorkOrder's first Order page reported more than three rows.** This is a bounded, read-only observation; it is not a quote-creation or final-price validation.

## Scope and safety

- Authenticated through the local technician login configuration. Session storage was memory-only; no credential, raw response, product name, price, or business ID was persisted.
- Scanned 9 pages of the current role's Work Order list (3 rows per page), then verified one current, enabled `place_order` action and its WorkOrder-derived `serviceType` and `sourceType` before reading the catalog.
- Exercised the application's `QuotationCatalogReadAdapter` and Production read transport. Catalog requests kept the R1 active-state and service/source filters, used `page` + `rows=20`, and did not use `_all=1`.
- Package details were read only for IDs returned by that scoped package list (27 in this run). Material SKU reads used the real `QuotationCatalogReadAdapter` and Production read transport: the adapter required the current role-listed WorkOrder, a direct Material identity or one exact Package detail, and an exact short-lived request permit. Direct Material requests used `spuid`; Package requests used R1's `in:spuid|array#and` batch form. Every request used `page`, `rows=30`, and active state.
- R1's material attribute chain was exercised in order: one bounded active `colName=material` ExtField read, then the exact returned Code dictionary IDs under the R1 tenant, then SKU pages. The read returned one sales field with 66 Code options; field names, option labels/values, product IDs, and prices were not written to this report.
- R1's static selector dictionaries were also read through the same role/WorkOrder-scoped adapter. Its serviceType branch chooses `partsOne` for 11/12, `refreshParts` for 40, otherwise `constructionParts`; Material uses `type2` for 40 and `type1` otherwise. The response also covered `packageType`, `repairProcedure`, `agelimitFilter`, and `maintenanceLayer`.
- No Production business mutation, quote write, Workflow completion, upload, or customer interaction request was sent.
- The follow-up Order scan remained within the same authenticated technician role: WorkOrder pages used 3 rows, each WorkOrder's `type=1` Order query used page 1 / 3 rows, and the scan stopped at 121 WorkOrders. Session/user/role identity remained unchanged. No exact IDs, codes, customer data, or prices were retained.

## Current selectable catalog

| R1 selector | Active rows | Pages | Reported total | Complete |
| --- | ---: | ---: | ---: | --- |
| Packages | 27 | 2 | 27 | Yes |
| Procedures | 66 | 4 | 66 | Yes |
| Materials | 89 | 5 | 89 | Yes |
| Measures (机措) | 4 | 1 | 4 | Yes |

The selected context returned 7 package-part options, 5 package-type options, 4 package-age filter options, 8 procedure-type options, 9 serviceType-selected material-type options, and 6 package material-layer options. Only counts are retained here; Code values and labels remain in memory.

All 27 listed package details passed identity and structure mapping. Their compositions contained 64 procedure references, 87 material references, and 0 measure references. The direct material catalog and package compositions referenced 93 unique SPUs. The App adapter completed 115 bounded SKU pages/requests across the 89 direct Material rows and 26 nonempty Package batches. All 93 unique SPUs were read successfully and returned zero active SKU rows. This WorkOrder context therefore exposes a complete material catalog and its R1 sales-attribute dictionary, but no active SKU variants for the current SPU set. This does not establish SKU availability for other service/source contexts, inactive historical products, or other roles.

## Existing WorkOrder-linked Order evidence

The initial 3 WorkOrders from the role-scoped list returned matching type=1 Order rows with recognized product identity fields; 4 groups and 15 nested lines were recognized. That earlier phrase “SKU/SPU identity” meant that the adapter recognized identity fields; it did not mean that a material line contained both a database SKU ID and SPU ID.

The expanded scan read the first type=1 Order page for 121 role-visible WorkOrders. It returned 89 Order rows across 79 WorkOrders, with 94 groups and 573 normalized lines recognized. Across those rows the normalized material lines contained 40 distinct SPU IDs, 0 SKU IDs, 28 distinct material SKU codes, 0 SPU codes, and no same-line pair of SKU ID + SPU ID or SKU code + SPU code. Thirty-three of the 40 SPU IDs overlapped the selected current catalog and all 33 SKU reads completed with zero active SKU rows. The currently enabled `place_order` WorkOrder had one Order row with two SPU IDs and two material SKU codes, but no SKU IDs or active SKU rows for those SPUs.

One WorkOrder's Order page reported more than three rows. Since this read stayed at the approved first page / three-row bound, the scan is **incomplete**: it cannot establish that no paired SKU/SPU identity exists elsewhere in that Order list. No candidate with a same-line SKU ID and SPU ID was found in the 121 first pages. The 28 SKU codes are business codes, not SKU database IDs, and were not used to infer a current selectable SKU.

## Application changes

- The Production read gate now accepts only exact R1 catalog pages from 1 through 50, with 20 rows, active state, service type, source type, and stable R1 sorting. It rejects `_all`, oversized pages, and extra filters.
- The Production Order browse gate remains page 1 with at most 3 rows, exact role-listed WorkOrder ID and `type=1`; a regression test confirms page 2 is rejected before network dispatch.
- Catalog reads use the shared current session/user/role fingerprint. R1 may omit `roleVersion`; when it does, the catalog adapter still requires the WorkOrder to be listed under the current role before and after each read. Package detail remains restricted to a package ID returned by that scoped list, and role/context changes discard results.
- The Production SKU application route is enabled only through the quotation adapter's exact-request permit. Direct generic transport calls remain denied; route shape alone cannot authorize an arbitrary SPU, sales field, or Code lookup.
- Static selector Code reads use the R1 serviceType mapping and the exact R1 tenant. Reading options does not itself filter or enable catalog products; missing or unverified dictionaries are not treated as an eligibility match.
- The R1 attribute → Code → SKU reads are data-read capability only. An empty active SKU response is reported as empty; it does not synthesize selectable variants or make any quote-write or final-price claim.

## Limits

The catalogs, six static selector dictionaries, and one material sales-field dictionary are complete for the verified WorkOrder service/source context only. The Order identity scan remains incomplete at one three-row page boundary. Other service types, source types, roles, tenants, inactive rows, UI filter parity, and final quotation pricing were not established. Catalog/SKU unit prices remain inputs to R1 quotation rules, not final quote totals.
