# G4-F P0 R1 catalog filter read-contract

Status: SOURCE_PARITY_PARTIAL / PURE_CLASSIFIER_ONLY / NO_UI_FILTER / NO_BETA_OR_PRODUCTION_CALL.

Source revisions: R1 xlink-app@6c0a97b placeOrders.vue lines 1265-1750 and utils/procedureFilter.js; backend xlink-cloud-backend@5fc008d ProjPackage/Procedure/Material entity definitions. New App integrated Draft #38 cfe5e0a.

Read adapter now retains normalized R1 package extension repairParts / constructionParts and procedure repairProcedure codes. Package strict arrays or HTML-quoted JSON array strings are accepted; scalar/object/malformed input is UNKNOWN rather than silently empty. Procedure uses documented R1 scalar/array normalization, with unsafe object coercion excluded. Material already has typed category integer; no SKU is inferred.

The pure assess/classify function requires verified dictionary option codes for selected serviceType and kind. It returns match / not_match / unverified / not_applicable. For packages, service types 11/12/40 use repairParts, other types use constructionParts; procedure uses independent repairProcedure; material uses an explicitly verified type1 or type2 value. The function is NOT connected to UI, authorization, pricing, or order writing. Invalid provider metadata is not a reason to hide or enable products.

Next gates:
P0-A Code-dictionary option provenance for partsOne, refreshParts, constructionParts, repairProcedure, type1/type2 and agelimitFilter, bound to WorkOrder serviceType/sourceType/current node. Mock-only browse filtering AFTER verified schema.
P0-B Existing group and historic Order snapshot preservation across changed catalog selections and session/role switch.
P0-C Full Material SPU -> attributes -> SKU -> quantity/read adapter, source-driven only and fail-closed for unknown SKU/provider.
P1 Resume catalog/config/result visual polish with current approved UI assets; produce main H5 multi-screen montage at 390/375/320.
P2 Scoped native device Gate #64, then separate Owner-approved Beta write/readback gates.

No Phase B authorization, no R1 type=0 route restored, no code-guess product/price, no UI change, no Production read/write. PR stays Draft.
