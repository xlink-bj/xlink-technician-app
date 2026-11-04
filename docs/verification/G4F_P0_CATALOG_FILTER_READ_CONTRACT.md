# G4-F P0 R1 catalog filter read-contract

Status: SOURCE_PARITY_PARTIAL / PURE_CLASSIFIER_ONLY / NO_UI_FILTER / ONE_CONTEXT_STATIC_DICTIONARIES_READ.

Source revisions: R1 xlink-app@6c0a97b placeOrders.vue lines 1265-1750 and utils/procedureFilter.js; backend xlink-cloud-backend@5fc008d ProjPackage/Procedure/Material entity definitions. New App integrated Draft #38 cfe5e0a.

Read adapter now retains normalized R1 package extension repairParts / constructionParts and procedure repairProcedure codes. Package strict arrays or HTML-quoted JSON array strings are accepted; scalar/object/malformed input is UNKNOWN rather than silently empty. Procedure uses documented R1 scalar/array normalization, with unsafe object coercion excluded. Material already has typed category integer; no SKU is inferred.

The pure assess/classify function requires verified dictionary option codes for selected serviceType and kind. It returns match / not_match / unverified / not_applicable. For packages, service types 11/12/40 use repairParts, other types use constructionParts; procedure uses independent repairProcedure; material uses an explicitly verified type1 or type2 value. The function is NOT connected to UI filtering, pricing, or order writing. Invalid provider metadata is not a reason to hide or enable products.

On 2026-11-04, bounded Production reads through the real technician session captured all four current selector catalogs for one role-listed `place_order` WorkOrder context (27 packages, 66 procedures, 89 materials, 4 measures), all 27 listed package details, and six serviceType-selected static Code dictionaries. The same App adapter then read the active material sales field and its exact Code dictionary, followed by 115 bounded direct/batch SKU reads covering 93 unique SPUs. All selector and package pages completed; all 93 SPUs returned zero active SKU rows. See [G4F selectable catalog Production read](G4F_SELECTABLE_CATALOG_PROD_READ_20261104.md). The WorkOrder context is exact and read-only. This capture does not establish other service/source types, final pricing, quote creation, or historical catalog completeness. Production SKU and static Code reads require adapter-held WorkOrder context and exact request permits; direct generic transport requests remain denied.

Next gates:
P0-A Static Code option provenance is now read through the scoped adapter for one WorkOrder context, using the source-derived serviceType mapping for partsOne/refreshParts/constructionParts and type1/type2. This is not wired into UI filtering. Next, consume verified options through per-kind eligibility classification; unknown/missing dictionaries must remain unverified and must not hide or enable products. Other service/source contexts and dynamic cascade providers remain unverified.
P0-B Existing group and historic Order snapshot preservation across changed catalog selections and session/role switch.
P0-C Bounded Material SPU → R1 sales attributes → Code dictionary → direct/batch SKU read is now implemented and Production-read verified for one role-listed context. Its 93 SPUs returned zero active variants, so a selectable priced Material path remains unknown/blocked for this context; do not invent a SKU or effective price.
P1 Resume catalog/config/result visual polish with current approved UI assets; produce main H5 multi-screen montage at 390/375/320.
P2 Scoped native device Gate #64, then separate Owner-approved Beta write/readback gates.

No R1 type=0 route was restored, no product/price was guessed, catalog filter UI remains unwired, and no Production business writes were performed. The bounded Production reads captured above are limited to their explicit role/WorkOrder provenance and do not imply broader catalog or quotation-write authorization.
