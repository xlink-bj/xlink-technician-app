# R1 Package-Material SKU: domain, read authorization and Mock UX

Status: SOURCE-PINNED MODEL + DEV MOCK candidate, CI at exact HEAD required.
No Beta/Production API, Mongo, customer records, SDK, PDF, SMS, business write or merge in this work.

## Source baseline and behavioral truth

- R1 frontend: xlink-bj/xlink-app @ 6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d, business/subpackages/order/placeOrders.vue.
  - Lines 6280–6390: openPackageSpec, getPackageMaterialSKU, allPackageSpecSelected. Package material SKU uses a multiple-spuid filter and a separate materialId relationship. Direct Material SKU uses one spuid in getMaterialSKU at lines 6191–6241.
  - Lines 6410–6525: ProjPackage detail materialList is a collection of material-body records. Each carries its own _id (body identity), material._id (SPU), coefficient and exts.layer, plus a selected flag. Multiple candidate materials may share one layer. These are NOT SKU identities.
  - Lines 6650–6780: package submission chooses a special material-SKU quantity branch when exts.pricingMethod is 1. The other path computes using package quantity, coefficient and material specification. Our preview implements NEITHER calculation.
  - R1 frontend maps available SKU rows to material links. Because the legacy UI normalizes some fields before its subsequent matching, this project must preserve spuid from the original backend row rather than copy a potential information-loss or merge defect.

- Backend: xlink-bj/xlink-cloud-backend @ 5fc008d32e771205260f120621c1c4fc62d0824e.
  - src/main/java/com/fsgo/entity/basic/Material.java holds spuid, sourceTypeList, serviceType, scopeJson and several independent price/cost fields.
  - CORRECTED CONTROLLER CALL GRAPH: modulemini/basic/MaterialController.java and moduleweb/basic/MaterialController.java route /query to goodsService.queryWithRank(fpi, Material.class), **not** to MaterialServicelmpl.query(). MaterialServicelmpl.query()/queryWxmini() have separate conditional spuid branches, but their reachability from these /query controllers is NOT established; never use those methods as proof of actual R1 SKU read authorization.
  - The actual invoked GoodsServiceImpl.queryWithRank() (service/biz/GoodsServiceImpl.java lines 376–425) constructs tenantId equality and default active-state filtering, then branches on exact presence of sourceType. When present, it projects sourceTypeList and orgId, disables two automatic Mongo scope filters; when absent, another filter context applies, with a PC-specific condition. It also adds nin:scopeJson and modifies pricing projection in mini form. **Read-shaped route is not authorization proof** for any WorkOrder/principal/role/sourceType. R1 client basic/material/query does not by itself prove the same mini-form/price branch as queryWithRank.
  - src/main/java/com/fsgo/modulemini/basic/MaterialController.java exposes query/queryWithRank endpoints, but their names or read-shaped methods DO NOT prove access for the current technician Role, ServiceAppointment, WorkOrder, catalog sourceType or individual material. These are security-relevant unknowns.
  - R1 material sales attributes come from biz/extField/query filtered to material and enabled, and i/code/selectCode.do for option values, including a legacy hardcoded tenant in one R1 call. Do not use that tenant, any environment secret or assumed code table in the new app.

## Implementation (Draft #74 stacked on Draft #73)

1. Pure package SKU model (src/shared/package-material-sku-contract.ts):
   - Explicit Package ID and pricingMethod 1; material body link ID, materialId and material._id must agree. Source layer key is retained, without guessing layer ordering or mandatory/optional semantics beyond the source list.
   - SKU rows must belong to a supplied SPU, have unique SKU IDs and pass the existing direct-SPU attribute parser. The model rejects unexpected parents, duplicate IDs, malformed sources, incompatible pricing mode and invalid relations.
   - Same-layer alternatives remain separate body links. Selecting a different material link does not reuse the previous material SKU choice. Every source layer requires an explicitly chosen body link and one complete, unique SKU; missing, no match and multiple matches are distinct.
   - Historical SKU number, when present, is read-only metadata. Price, authoritative discounts, coefficient calculation, stock, official Order.type=1 and workflow state are never derived.

2. Synthetic-only real main App UI:
   - Extends the separate DEV Mock SKU review route from Draft #73, using ActionWorkspaceShell and AppButton, not the approved commercial quotation workspace.
   - Two mock layers, one with two materials and the other with one; one synthetic waterproof package; independent mock repair groups A and B.
   - Choice state is in component memory, scoped by group and layer. No automatic selection or persistence. Scenario changes invalidate all local choices. Production/Mock-off access stays guarded by existing DEV/identity check.
   - Explicit static scenarios: normal, missing SKU, duplicated attribute match, orphan SKU, duplicate SKU ID and non-SKU pricing method. No external read port or business mutation.
   - Separate direct-material and package-material SKU workflows retained. This does not turn the earlier Mock category filter PR #70 into a live authorized filter.

3. Tests:
   - Pure contract unit tests exercise identity, two layers, same-layer alternatives, multiple groups through the UI, unique/incomplete/ambiguous/missing SKU, mismatch, corrupted rows, pricing gates, immutability and absence of price/quantity write fields.
   - Main App Playwright tests on 375x667 and 390x844 check A fully configured, B alternative, switch-back isolation, ambiguous blocked, orphan/duplicate/other-pricing blocked. Eight real Chromium screenshots captured at four checkpoints x two viewports; network intents intercepted before sending.
   - Existing 6 main App Mock and 25 G4-F legacy tests remain required. MP/App bundle build is code compatibility only, not native-device PASS (#64).

## Explicit remaining blockers and release gates

- Secure read adapter: trace authenticated tenant/role/WorkOrder → material SPU → SKU query, sourceType/material scope, pagination, current tenant code options and policy in backend before a NEW non-Mock SKU read port. This review does not authorize production probing.
- Package configuration commerce: server-authoritative price/stock and permitted Order snapshot encoding are not verified. R1 coefficients/minimum prices are not a license for offline price creation.
- Owner quotation Catalog and configuration visual UX #41 still pending; main integration #38 stays Draft; signing and Beta type1 Order write remain separately gated.
- Real WeChat/Android/iOS #64 blocked environment, no invented runtime device results.

Gate: PACKAGE_SKU_SOURCE_MODEL + DEV_MOCK_CODE_CI_PENDING / REAL_SKU_READ_AUTH_UNKNOWN / OWNER_VISUAL_PENDING / NO_MAIN_MERGE.
