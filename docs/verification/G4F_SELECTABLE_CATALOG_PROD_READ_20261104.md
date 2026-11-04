# G4-F Current-Role Selectable Catalog Read — 2026-11-04

**Status: COMPLETE for one verified Production `place_order` Work Order context.** This is a bounded, read-only catalog observation; it is not a quote-creation or final-price validation.

## Scope and safety

- Authenticated through the local technician login configuration. Session storage was memory-only; no credential, raw response, product name, price, or business ID was persisted.
- Scanned 9 pages of the current role's Work Order list (3 rows per page), then verified one current, enabled `place_order` action and its WorkOrder-derived `serviceType` and `sourceType` before reading the catalog.
- Exercised the application's `QuotationCatalogReadAdapter` and Production read transport. Catalog requests kept the R1 active-state and service/source filters, used `page` + `rows=20`, and did not use `_all=1`.
- Package details were read only for IDs returned by that scoped package list (27 maximum in this run). SKU requests were audit-only and limited to exact SPU identities returned by the material catalog or those listed package details; each page used `page`, `rows=30`, active state, and one exact `spuid`.
- No Production business mutation, quote write, Workflow completion, upload, or customer interaction request was sent.

## Current selectable catalog

| R1 selector | Active rows | Pages | Reported total | Complete |
| --- | ---: | ---: | ---: | --- |
| Packages | 27 | 2 | 27 | Yes |
| Procedures | 66 | 4 | 66 | Yes |
| Materials | 89 | 5 | 89 | Yes |
| Measures (机措) | 4 | 1 | 4 | Yes |

All 27 listed package details passed identity and structure mapping. Their compositions contained 64 procedure references, 87 material references, and 0 measure references. The direct material catalog and package compositions referenced 93 unique SPUs. All 93 SPUs were queried through the bounded R1 active-SKU route; each reported zero active SKU rows. Thus this WorkOrder context exposes selectable material rows, while no active variants were returned for its current SPU set. This does not establish SKU availability for other service/source contexts, inactive historical products, or other roles.

## Existing WorkOrder-linked Order evidence

For the first 3 WorkOrders from the same role-scoped list, one type=1 Order row per WorkOrder was queried. All 3 rows matched the requested WorkOrder and contained recognized SKU/SPU identity; 4 quotation groups and 15 nested lines were recognized, with no unsupported group in this bound. This confirms that current Order snapshots can contain SKU/SPU identities; it does not prove that each historical product remains active in today's selector catalog.

## Application changes

- The Production read gate now accepts only exact R1 catalog pages from 1 through 50, with 20 rows, active state, service type, source type, and stable R1 sorting. It rejects `_all`, oversized pages, and extra filters.
- Catalog reads use the shared current session/user/role fingerprint. R1 may omit `roleVersion`; when it does, the catalog adapter still requires the WorkOrder to be listed under the current role before and after each read. Package detail remains restricted to a package ID returned by that scoped list, and role/context changes discard results.
- The Production SKU application route remains blocked. No active SKU rows were returned by this context's audit-only exact-SPU reads, so this work does not enable SKU reads in the product app.

## Limits

The catalog is complete for the one verified WorkOrder service/source context only. Other service types, source types, roles, tenants, inactive rows, material sales-field dictionaries, and final quotation pricing were not established. Catalog unit prices remain inputs to quotation rules, not final quote totals.
