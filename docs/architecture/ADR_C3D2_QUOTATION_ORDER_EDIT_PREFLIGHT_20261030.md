# C3-D2 — Quotation Order Authority Preflight Extraction

> DRAFT · Base `main@e34f4eb64620604bc0472c3f6870674971f814f2` · 2026-10-30 · Owner review required

Extract the first read-only part of `loadQuotationOrderForEdit` to the feature-owned `quotation/order-edit-preflight.ts`. It calls only existing `QuotationOrderReadPort.getQuotationOrderById`, validates exact Order ID, official type=1 and current WorkOrder identity, then delegates to existing `quotationOrderEditBlockers` and `reconstructQuotationOrder`. It returns either a typed ready draft, a blocked message, or stale-session cancellation. No business mutation, provider change or new authorization.

The Store retains the Production read-only gate, role/descriptor/command-generation checks, quotationEditState, scoped local-draft non-overwrite guard, quotationCatalogRead `hydrateQuotationDraft` and price verification, `restoreServerOrderDraft`, successful existing Order ID assignment and all error messages. This extraction intentionally does NOT move draft repository reads, catalog hydration, quotations submission or readback, or relax the current editing policy.

Tests cover official identity success, role revocation before and during read, foreign ID/workOrder, non-type1, absent/failed read, paid/contracted/executing/discounted, unsupported additions and lossful package reconstruction. Existing G4-F order and real H5 quotation suites remain mandatory. All H5/MP-WEIXIN/APP builds, type/architecture/UI and browser CI must pass on exact PR HEAD before separate Owner merge approval. No Production writes, deployment or UI changes.
