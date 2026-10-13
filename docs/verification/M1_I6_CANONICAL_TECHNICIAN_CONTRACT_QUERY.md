# M1 I6 — Canonical Technician R1 Contract read contract (SOURCE-VERIFIED)

**2026-10-13 correction to earlier WorkOrder-page-only audit.** Frontend-only refactor; backend SHAs fixed; this engineering change performs **NO actual Beta/Production Contract read or writes**, leaves the real Contract read capability deny-by-default, and never grants signing permission.

## 1. Which R1 page is authoritative?

- Primary Technician R1 route: `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/serviceAppointment/serviceAppointment.vue`; also traced from `business/pages.json` ServiceAppointment main navigation in `M1_I1_R1_SIX_STAGE_PARITY_LEDGER.md` (W00/W01). **This is the active canonical technician path for the M1 WorkOrder, whose actual domain object is ServiceAppointment.**
- `serviceAppointment.vue:9215–9229` `getContracts`: `basic/contract/query.do`, `_all: '1'`, `is:serviceAppointmentId|string#and=this.id`, `is:state|integer#or='1'`, `is:exts.contractStatus|string#or='-2'`, sort `createTime desc`. Query response `:9232–9252` shows pending state and document refresh; **do not replicate automatic retry/polling against real endpoints without authorization**.
- `serviceAppointment.vue:608–633`: initial sign buttons for `type=1 && processState='0' && exts.isAgain!=1 && isHandler`. `:853–912`: signed/pending/exception, SMS, cancel, QR conditional UI. Actual electronic/offline writes `:9757–9800`.
- Alternative, noncanonical source: `business/subpackages2/workOrder/workOrder.vue:5025–5035` sends `is:workOrderId|string#and` and `in:state|array-integer#and` with `updateTime asc`. The previous I6 audit accidentally generalized this alternate page as the canonical technician Contract read. **Do NOT use it as the new technician adapter wire request.** Its existence remains a source fact, not proof of a working route or backend alias.

## 2. Fixed existing backend evidence (NO changes)

`xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`:

- `src/main/java/com/fsgo/entity/basic/Contract.java:31,38`: persisted `serviceAppointmentId`, `orderId`; no declared `workOrderId`.
- `src/main/java/com/fsgo/service/basic/ContractServiceImpl.java:150–165`: when a Contract is created, `setServiceAppointmentId(sa.get_id())`.
- `src/main/java/com/fsgo/modulemini/basic/ContractController.java:48–57`: existing `/query`, account tenantId forwarded into the service; **the controller does not prove signer authorization or HTTP verb**.
- `src/main/java/com/fsgo/service/basic/ContractServiceImpl.java:712–745`: looks up ServiceAppointment using **exact** `fpi.getParams().get("is:serviceAppointmentId|string#and")`; may alter Mongo filtering when `scheduleFlagOrg` matches; optional sourceType filter. This is why canonical R1 field parity matters, but it does **not** establish this particular signed-in role's live permission.
- `src/main/java/com/osg/framework/mongodb/EMongoTemplate.java:617–639,803–812`: typed field string parsed into Mongo `Criteria.where(key)`; no proven implicit WorkOrder-to-ServiceAppointment alias.
- **Critical backend page limit:** `src/main/java/com/osg/framework/util/FlipPageInfo.java` `init()` sets `all=true` when request includes `_all=1`. `src/main/java/com/osg/framework/mongodb/EMongoTemplate.java` `findByPage` checks `pp.isAll()` and increases `pp.setSize(pp.getTotal())` *before* `query.skip(...).limit(pp.getSize())`. Therefore **`_all=1, rows=3` is NOT database-bounded.** This was a safety problem in the prior New App Order/Contract prechecks. The code now deliberately omits `_all` for both lists (page=1, rows=3) while preserving the canonical R1 Contract WHERE/OR/sort conditions.

## 3. New App bounded projection & DEV tests

- `src/adapters/api/quotation-order-api.ts`: `listTypeOneOrdersForWorkOrder` and `listR1ContractsForSigningReview` each request a genuinely bounded first page (no `_all`), require current auth identity/role-listed ServiceAppointment and exact selected type=1 Order. Contract reads project only Order-matched stripped metadata; malformed/overlong/foreign-WorkOrder data fail closed. An empty/mismatched first page = **not proven**, never `no Contract`.
- `src/adapters/api/mock/router.ts`: the DEV-only fixture matches canonical ServiceAppointment filter **and** main-page OR predicates/sort; it refuses legacy alternate filter and `_all`, and synthetic IDs remain mock-owned to avoid live fallthrough.
- Regression tests assert wire-shape, pagination, invalidated `-2` Contract projection, alternate request denial, stale role/identity, cross-Order results and PII minimization.
- **Production/Beta read guard unchanged:** real `basic/contract/query.do` is not enabled, and `signature/*` mutation/SMS/PDF/QR remain hard-disabled. Synthetic browser PASS is not `OBSERVED_READ`.

## 4. Remaining evidence / gates

1. **SOURCE_VERIFIED:** Main R1 Contract field is `serviceAppointmentId`; backend stores/looks it up; previous main-route mismatch **resolved in source only**.
2. **UNVERIFIED in live tenant:** selected current-role ServiceAppointment and Contract list actual response shape/status, `scheduleFlagOrg` branch, row counts, signer ACL and documents; no live read performed. Do not infer from a zero page.
3. **NOT_RUN real business:** actual signing/Contract cancellation/SMS/PDF, asynchronous provider readback, Beta approval, MP/Android/iOS physical device/Owner UX. No backend patch, no real business command, no main merge.

Keep I6 original DoD **2/4** and M1 **1/8** formal; update after separate, narrow, explicitly authorized real-world evidence.

## 5. Primary R1 isHandler gate — source-verified, not yet wired to a trusted node

The technician ServiceAppointment page `business/subpackages/serviceAppointment/serviceAppointment.vue:6333–6346` defines `isHandler` from the **active current workflow node.handlerIds**: it checks `userId`, `roleId`, or `orgId + '+' + roleId`; a mere role-visible ServiceAppointment or matching official Order does **not** prove this handler gate. The main-page initial sign controls `:608–633` and Contract actions `:853–912` also require `isHandler`. The existing New App signing-intent preflight therefore adds an independent `currentNodeHandlerVerified` evidence flag, fail-closed in the actual App until a trusted current-node/actor projection is connected. Isolated unit tests may inject true to verify source condition candidates, **never** business authorization. The DEV page now truthfully marks all five commands blocked; actual dispatch has always been hard-disabled.
