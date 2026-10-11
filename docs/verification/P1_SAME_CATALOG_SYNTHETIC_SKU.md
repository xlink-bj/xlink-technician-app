# P1 same-Quote-Catalog SKU ID proof — DEV synthetic overlay, never a live SKU read

## What changed

The actual P1 Quote catalog fixture, mockQuotationCatalog, has a direct Material listing and a Package detail with material body links. Prior independent R1 SKU demonstrations use entirely different identifiers. #80 correctly reported **4/4 mismatches** in the real grouped quotation preview.

This new slice constructs a **distinct, explicitly hypothetical** SKU overlay from the EXISTING Quote catalog's *exact* package ID, direct Material SPU IDs and package body material IDs. It never silently renames unrelated P0 SKU records. The mock sales attribute definitions and R1 pricingMethod=1 do not exist in these original Quote Catalog responses: they are explicit synthetic assumptions for UI/mapping tests, NOT sourced commercial or authorization facts. No stock, price or official Order values are created.

The R1 package decoder now retains typed raw material layer alongside normalized UI layer code. Numeric 2 and text "2" remain distinct; mixed representations under the same normalized layer are rejected instead of merged. The Quote source comparison uses raw typed layer and exact body ID and Material SPU link, not labels or display layer.

The grouped DEV quotation local review shows **both** (a) unrelated standalone sample 4/4 ID mismatches and (b) same-Quote-catalog synthetic overlay exact-ID correlations. A positive (b) is intentionally only a structural test: no real SKU has been chosen, no authenticated tenant/role/WorkOrder SKU read has been proven, and official Order.type=1 creation remains forbidden. The demo cannot be promoted to a live catalog, even if CI passes.

## Release gates

Backend MaterialController /query calls GoodsServiceImpl.queryWithRank; sourceType omission/presence changes org and scope filters. #75 requires separately verified WorkOrder/role/tenant source authorization and code option ownership before bounded Beta read. #41 requires Owner commercial UX review. No live SKU reads, no official price, Order, Workflow, PDF or Contract actions. Native devices #64 blocked. PR Draft and no main merge.
