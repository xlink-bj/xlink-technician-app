# G4-F P0 — R1 Material SPU / Sales Attribute / SKU Read Contract

Status: source-derived pure code candidate, CI pending; no Production read, no business write.

R1 pinned xlink-app@6c0a97b, business/subpackages/order/placeOrders.vue:
- L3498-3560 reads active material ExtFields (salesAttribute in frontEndConfig) and sales code options. R1 historical code uses a hardcoded tenant ID; never copy it into the new app.
- L6090-6184 uses SPU.exts[field.name] values to decide whether to present specification selection, and reconstructs historical selected SKU rows by spuid.
- L6191-6281 reads basic/material/query with spuid for direct-material SKU, compares all selected sales attributes and maintains SKU-specific number.
- L6289-6389 handles package-material SKU with separate package materialId/layer path. Do not merge those workflows.
Backend pinned xlink-cloud-backend@5fc008d Material.java stores spuid and several distinct price fields. MaterialServicelmpl.java query() applies tenantId but conditionally omits an org criterion when spuid exists; queryWxmini() uses a different conditional scope. Neither proves WorkOrder/role authorization for a new App SKU port. NO live read port added.

Pure projectR1MaterialSku consumes a source SPU, complete already-authorized active sales ExtFields, and SKU records (not authorization). It returns blocked/not_configured/no_skus/ready. It preserves SPU and SKU identity, active-state validation, exact parent relationship and read-only historical number. It rejects malformed sale options, duplicate field/sku IDs, inactive or foreign SKU, incomplete SKU sale attributes. matchR1MaterialSku returns one unique ID only on complete exact choice; incomplete/unavailable/ambiguous/blocked remain distinct. No SKU is auto-selected.

Mock fixtures in src/adapters/api/mock/material-sku.ts: synthetic SPU, two sale fields and two SKUs; no router, network, real tenant, price or stock. Unit tests include corruption and cross-SPU identities. Existing quote UI/API/Order drafts unchanged.

Next gates: prove actual tenant/role/source scoped reads and active code options from pinned backend; DEV Mock-only SKU spec UI with real main App screenshot checks; separate packaged-material SKU; never let a spec choice write Order, price or workflow without explicit authorization. Native device Gate #64 remains blocked.

Gate: P0_MATERIAL_SKU_PURE_MODEL_PENDING_CI / REAL_SKU_READ_AUTH_UNKNOWN / DEV_MOCK_UI_PENDING / PR_DRAFT_NO_MERGE.
