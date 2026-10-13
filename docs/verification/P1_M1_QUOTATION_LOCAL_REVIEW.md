# P1 M1 — quotation local grouped closeout (DEV Mock only)

Owner requested moving from P0 models toward P1 quotation closure. Source-bounded review was added to the actual Action Workspace's existing QuotationActionContent, not to a new product UI or to Order commands.

The existing R1-shaped draft contains WorkOrder + workflow node, 1:N repair-part groups, package/procedure/material/measure selections, package layer configuration and local persistence. `validateQuotationDraft` already enforces group composition, quantity and package-material layer validity. `reviewLocalQuotationForP1` now reports a group-by-group local review, including the first outstanding error, selected counts and configured packages. It never infers authoritative SKU, sourceType/tenant ExtField, pricing, legal Order, or workflow state.

Crucially, current Quotation Mock package IDs (`mock-catalog-package-basic` / `mock-catalog-material-sealant`) DO NOT match the independent synthetic SPU/SKU test fixture IDs (`synthetic-package-roof` / `synthetic-spu-roof`). Even though both have passing isolated tests, it would be false to mark the Quote's actual source SKU as verified or silently assign one fixture's result to another. Therefore SKU source, effective ExtFields and pricing remain explicitly **unverified**, Order remains **not_created**, and no submit enablement changes.

The new Dev-only collapsed review affordance is placed after repair groups in actual main App, preserving the approved first-step and first-two commercial Quote UX. Real main App Playwright now needs to verify two repair groups, independent selection, local review message, no official quote write, restore/hard reload and 375/390px screenshots of actionable group statuses. Native #64 still blocked; real GoodsService role/WorkOrder SKU read #75 and Owner catalog visual #41 remain separate.

Gate: P1_LOCAL_GROUP_REVIEW_CODE_PENDING_CI / LIVE_SKU_PRINCIPAL_UNKNOWN / REAL_ORDER_WRITE_BLOCKED / DRAFT_NO_MERGE.
