# G4-F Catalog Runtime — R1 Parity Audit

Status: `H5_VISUAL_PROXY` / `MOCK_PRODUCT_REVIEW`. This is a source-backed UI/runtime comparison, not live catalog evidence, authenticated product acceptance, or device validation.

## Evidence

- R1 repository: `xlink-bj/xlink-app` at pinned revision `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`.
- Main reference: `business/subpackages/order/placeOrders.vue` (category/search around lines 1282–1348; package eligibility and cards around 1351–1545; procedure filtering around 1578–1620; material/SKU behavior around 1705–1868; measure behavior around 1869–1950; selection initialization around 4419–4505; package detail and layer handling around 6399–6575).
- New App: `src/features/work-orders/quotation/QuotationActionContent.vue`, `catalog-browser-store.ts`, `composition-store.ts`, and the `QuotationCatalogReadPort` adapters/models.
- Handoff: approved third-page catalog design and `docs/ux/G4F_CATALOG_UI_SPEC_V1.md`. Mock names and category artwork are illustrative only.

## Behavior map

| Behavior | Classification | Evidence / boundary |
| --- | --- | --- |
| Four catalog categories and selected-category navigation | `PARITY` | Both expose package, procedure, material, and measure (new UI label: 机措). |
| Search scope per repair group and category | `PARITY` | R1 stores each category's `searchValue` on the active order group. New App keys local query state by `groupId + kind`; it does not alter the quote draft. |
| Search matching fields | `PARITY` | R1: package name; procedure content; material name or code; measure content. New App uses these exact fields. Synthetic procedure/measure fixtures now include `content` to exercise the observed R1 search contract. Matching remains substring/case-sensitive like R1 `indexOf`. |
| Category-specific search placeholder | `PARITY` | Mirrors R1's four prompts. |
| Package repair-part filter | `UNSUPPORTED` | R1 filters package `exts.repairParts` or `exts.constructionParts` based on service type. The normalized Package read model does not provide verified parsed option semantics; no filter is fabricated. |
| Package warranty/age-limit filter | `UNSUPPORTED` | R1 has an `agelimit` filter. A raw package age limit exists, but the current catalog interaction contract has no validated filter option set; no filter is invented. |
| Procedure subtype filter | `UNSUPPORTED` | R1 exposes configured procedure types and `matchProcedureType`; the current read contract does not provide the verified option/provider mapping. |
| Material type filter | `UNSUPPORTED` | R1 filters by material type. A raw numeric `type` is retained, but this App has no verified user-facing type-option mapping. |
| Catalog images | `DIFFERENCE` | R1 can render catalog image fields and a remote logo fallback. The current normalized catalog contract does not expose verified image URLs. The new UI uses local category illustration marked “示意”; it neither invents product photography nor makes external image requests. |
| Price feedback | `DIFFERENCE` | R1 displays provider price fields. The new App keeps “金额待核验” because the current UI does not have a verified authoritative display-price contract; it never substitutes zero or a sample price. |
| Package detail and included items | `PARITY` | The App reads package detail and presents returned procedure/material/measure structure; absent/malformed references remain explicit. |
| Package material layer selection | `PARTIAL` | App preserves only source-provided layer identity and requires one choice per returned layer before local configuration. It does not infer layers or labels. |
| Package SKU/SPU selection | `UNSUPPORTED` | R1 has a SKU-dependent branch. SKU/SPU selection is not enabled by the accepted G4 catalog contract and remains deferred; the App does not imply that a catalog Material row is a SKU. |
| Direct procedure/material/measure selection | `DIFFERENCE` | New App's accepted local composition bridge adds a single item and returns to its workbench; R1 keeps the selector open and exposes inline quantity controls. New App quantity edits remain on the workbench. Existing same-group duplicate selection is idempotent and does not increment quantity; changing that would violate the reviewed Phase 1F contract, so this pass does not emulate R1's stepper by silently changing quantity. |
| Quantity adjustment | `DIFFERENCE` | R1 exposes quantity controls in the selection view. New App edits the existing selection from the workbench and preserves the current explicit quantity validation. |
| Group context and return | `PARITY` | Catalog is scoped to the selected repair-part group; close/back returns to the same group while preserving its repair path, description, quantity, and selected draft rows. |
| Catalog loading/empty/error states | `PARITY` | New App keeps per-category loading, empty, blocked, and retryable/terminal error states without treating a failed read as a selection. |
| Production/Beta writes and quote submission | `NOT_APPLICABLE` | This page uses the existing read-only catalog port and local composition path only. It does not create or submit server orders, complete workflow, or perform customer actions. |

## Review disposition

The implemented page changes presentation and uses the already accepted local composition/configuration operations. It does not expand read endpoints or business mutation capability. The search semantics are deliberately narrowed to the pinned R1 fields, not broadened by matching arbitrary code/specification/description values.

The unsupported filters, SKU/SPU, live image/price, and inline selector quantity behavior are explicit capability differences, not claims of full R1 parity. Resolving any of them requires a verified read-model/interaction contract or a separately reviewed change to the accepted composition invariant.

## Validation boundary

The generated evidence is deterministic synthetic data in a local uni-app H5 review harness. It is not authenticated, live Beta/Production, MP device, App device, or production-readiness evidence. H5 tests assert the runtime page and interactions; MP/App builds only prove compilation.
