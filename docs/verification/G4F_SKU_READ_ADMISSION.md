# #75 Synthetic SKU read admission — source-based security boundary

This change is strictly a synthetic-only future SKU read gate, not real client or server authorization.

R1 mobile pinned xlink-app@6c0a97b, placeOrders.vue L6190–6390 has direct Material spuid and multi-spuid package reads. In the pinned Java backend xlink-cloud-backend@5fc008d, BOTH mini/PC basic/MaterialController /query handlers delegate to GoodsServiceImpl.queryWithRank, NOT MaterialServicelmpl.query. GoodsServiceImpl L376–425 binds tenantId and state but follows different org/sourceTypeList/scopeJson branches according to sourceType presence and platform form. There is still NO evidence for current technician role and WorkOrder-level SKU authorization. No production/Beta request is allowed.

src/shared/sku-synthetic-read-gate.ts provides bounded synthetic-only admission: complete current sessionRef, userId, roleId, roleVersion, tenantId, WorkOrder ID, serviceType, sourceType, context revision, and already-listed synthetic SPU IDs. Every request must name a source-listed SPU, max 10 IDs and complete max-40 response (otherwise blocked). It rechecks identity and catalog scope after the injected async synthetic provider returns; role/session/context swaps or an invalidated request are discarded. It rejects foreign, duplicate, inactive, malformed SKUs and strips price/org information. This client side filter is defensive programming, not a replacement for server-side WorkOrder and tenant permissions or a live SKU provider.

Tests cover missing identity, disabled runtime, guessed/unlisted SPUs, partial/overlong pages, foreign/duplicate/invalid SKU, concurrent stale results, role/session/tenant/workOrder/sourceType changes, clean empty responses, and no price projection. No live transport or handler is wired.

HARD GATES: inspect backend per request and effective current role, binding sourceType to ServiceAppointment, verify active material ExtField + code options, prove SKU pagination/scoping, then separately approve bounded Beta read. Do not enable Production, quote writes, workflow, contracts or SKU pricing. Remains Draft, no main merge.
