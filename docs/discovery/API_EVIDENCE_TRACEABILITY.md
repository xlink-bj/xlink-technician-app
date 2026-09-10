# API Evidence Traceability

## Purpose

This matrix makes every material API conclusion traceable to a pinned source,
call site, implementation mapping, or explicitly bounded unknown. It records
evidence only; it does not authorize copying reference code or treating a
historical/beta artifact as production authority.

## Pinned source register

| Source ID | Repository / local source | Reference | Exact evidence paths |
| --- | --- | --- | --- |
| R1-S | `/Users/yesun/Code/xlink-business-jishi-3.0` | branch `modernization/engineering-foundation`, SHA `6ada6b5375324bfcd09ca7c569b96a4ff328173f` | `api_specs/business_core_beta.json`; `api_specs/business_order_beta.json`; `api_specs/business_order_write_beta.json` |
| R1-T | R1 | same SHA | `docs/api-test-tooling.md`; `scripts/api_client.py`; `scripts/api_inspect.py`; `scripts/api_smoke.py`; `scripts/run_api_smoke.sh`; `scripts/run_api_inspect.sh` |
| R1-A | R1 | same SHA | `docs/architecture/api-backend-map.md`; `docs/architecture/auth-and-role-map.md`; `docs/architecture/page-api-map.md`; `docs/architecture/workorder-detail-api-inventory.md`; `docs/modernization/API_CHARACTERIZATION.md` |
| R1-C | R1 | same SHA | `subpackages/login/loginAuth.vue`; `pages/serviceAppointment/serviceAppointments.vue`; `subpackages/serviceAppointment/serviceAppointment.vue`; `resources/js/common.js`; `resources/technician/mainWorkOrderListContract.js`; `resources/technician/workOrderDetailReadContract.js`; `resources/technician/workOrderFormReadContract.js`; `resources/technician/workOrderStatusWriteContract.js`; `resources/technician/workflowNodeVisibilityContract.js` |
| R2-R | `/Users/yesun/Code/xlink-business-3.0` | branch `main`, SHA `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185` | `web/lib/erm/sources/work-order-cloud-read.ts`; `web/lib/erm/sources/project-archives-cloud.ts`; `web/lib/survey-form-cloud.ts`; `web/lib/project-cloud.ts`; `web/lib/dashboard-cloud-read.ts`; `web/lib/cloud-code-labels.ts` |
| R2-N | R2 | same SHA | `web/lib/erm/`; `docs/11-field-service-reference.md`; `docs/12-domain-glossary.md` |
| R2-B | R2 | same SHA | `web/app/api/auth/login/route.ts`; `web/app/api/work-orders/route.ts`; related detail/survey/dashboard route files; `docs/05-integration-strategy.md` |
| R3-S | `/Users/yesun/Code/xlink-app` | branch `main`, pinned committed SHA `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` | `business/api_specs/business_core_beta.json`; `business/api_specs/business_order_beta.json`; `business/docs/*` |
| J | `/Users/yesun/Code/xlink/code/cloud` | no Git repository, no commit metadata | `src/main/java/com/fsgo/modulemini/IndexController.java`; `src/main/java/com/fsgo/modulemini/basic/ServiceAppointmentController.java`; other local-only controller files |

R3 working-tree changes and untracked paths were not used. No network request
was executed against any XLink environment during this task.

## Evidence-to-contract matrix

`CONFIRMED_CANDIDATE` means the evidence is sufficient to carry a candidate
into G2 design. `VERIFY_BEFORE_IMPLEMENTATION` means the behavior is known
enough to inventory but not enough to implement safely. `UNKNOWN` means the
source does not establish the required fact.

| Contract area | Evidence claim | Exact trace | Status | Required verification |
| --- | --- | --- | --- | --- |
| Login | Phone login posts method/phone/code/tenant and returns a session-bearing token. | R1-T `scripts/api_client.py`; R1-C `subpackages/login/loginAuth.vue`; R1-A `auth-and-role-map.md`; R2-B `auth/login/route.ts`; J `IndexController.java` | CONFIRMED_CANDIDATE | Current environment, error envelope, expiry/refresh, production parity. |
| Login / MP | MP obtains a phone number through a separate path. | R1-C `loginAuth.vue`; R1-A `api-backend-map.md`; J `IndexController.java` | VERIFY_BEFORE_IMPLEMENTATION | Platform payload, consent behavior, and response contract. |
| Role/menu | Role change uses `function/changeRole`; menu/function data is cached for authorization-aware UI. | R1-S core spec; R1-C `loginAuth.vue`; R1-A `auth-and-role-map.md` | CONFIRMED_CANDIDATE | Server-side authorization and failure behavior. |
| Push | App push client identifier is upserted after login when present. | R1-C `loginAuth.vue`; R1-A `api-backend-map.md`; J controller mapping | CONFIRMED_CANDIDATE | Android/iOS/MP adapter behavior and permissions. |
| Home | Home uses documents, QR, timeout, supervisor/todo, and fixed-form helpers in the Legacy map. | R1-A `page-api-map.md`; R1-C home/login call sites; J mappings | VERIFY_BEFORE_IMPLEMENTATION | Canonical module composition and count semantics. |
| Work-order list | Service appointment list has paging, sorting, state/status, regex, date, priority, and location filters. | R1-C `mainWorkOrderListContract.js`; R1-A `page-api-map.md`; R2-R `work-order-cloud-read.ts`; R3-S core spec | CONFIRMED_CANDIDATE | `.do` equivalence, response envelope, tab/count semantics. |
| Work-order detail | Detail read is `queryById` with `type=query` and returns service appointment/workflow/node material. | R1-S core spec; R1-C `workOrderDetailReadContract.js`, detail page; R1-A detail inventory; R2-R source; J controller | CONFIRMED_CANDIDATE | Identifier meanings, nullability, and fallback behavior. |
| Activity | Actions are queried by service appointment id and normalized by R2 to activity rows. | R1-C detail page; R1-A detail inventory; R2-R action source; R2-N activity mapper | CONFIRMED_CANDIDATE | Action type completeness and ordering. |
| Customer/contact | Contact upsert, user lookup, notes, and group binding are used in detail flows. | R1-C detail page; R1-A backend/detail maps; J service-appointment mapping | VERIFY_BEFORE_IMPLEMENTATION | Contact DTO, permissions, and idempotency. |
| Appointment | Dispatch, allot, reallocation, restore, refusal, self-examination, and timeout helpers exist as candidates. | R1-C list/detail pages; R1-A backend map; J service-appointment mapping | VERIFY_BEFORE_IMPLEMENTATION | State machine, payloads, concurrency, and error recovery. |
| Workflow read | Definitions, nodes, parent-child subflows, and current workflow node are read by separate paths. | R1-C detail page; R1-A detail inventory; J workflow/controller mappings | CONFIRMED_CANDIDATE | Run/node/definition identifier invariants. |
| Workflow write | Process, rollback, takeback, cancel, and subworkflow start are called with service appointment/module identifiers. | R1-C detail page; R1-A detail inventory; J workflow mappings | VERIFY_BEFORE_IMPLEMENTATION | Transition preconditions, response, idempotency, and authorization. |
| Dynamic form fields | `extField/query` returns field definitions with extId and state/sort controls. | R1-C `workOrderFormReadContract.js`; R1-A detail inventory; R2-R source; J ext-field mapping | CONFIRMED_CANDIDATE | Field-control subset and localization/code dependencies. |
| Dynamic form data | `extForm/query/{formDefId}` and `findByIdWithWorkflow` read form data. | R1-C form contract/detail page; R1-A detail inventory; R2-R survey/form source; J ext-form mapping | CONFIRMED_CANDIDATE | Verb/path variant, identity fields, and workflow join semantics. |
| Dynamic form write | `extForm/upsert/{formDefId}` serializes `dataStr`. | R1-C detail page; R1-A detail inventory; J ext-form mapping | VERIFY_BEFORE_IMPLEMENTATION | Schema, validation, attachment fields, and unsupported control behavior. |
| Code labels | Code query and multistage code paths support dynamic-form labels. | R1-C detail page; R1-A detail inventory; R2-R `cloud-code-labels.ts`; J code mapping | CONFIRMED_CANDIDATE | Tenant/locale parameters and cache behavior. |
| Inspection | Survey form, field values, measurement data, and PDF generation are separate paths. | R1-C inspection/detail pages; R1-A detail inventory; R2-R survey source; J survey/measurement mappings | VERIFY_BEFORE_IMPLEMENTATION | Submit envelope, media/evidence prerequisites, PDF readiness. |
| Order read | Order detail and order-field reads are in R1 specs/callsites and R2 raw sources. | R1-S order spec; R1-C detail page; R1-A detail inventory; R2-R archive source; R3-S order spec | CONFIRMED_CANDIDATE | Response field parity and empty-state behavior. |
| Quotation write | Order upsert, quotation creation, message, and confirm are candidate writes. | R1-C detail page; R1-A detail inventory; R1-S write fixture; J order mapping | VERIFY_BEFORE_IMPLEMENTATION | Exact schemas, validation, and safe isolated verification. |
| Contract read | Contract query and detail are used for service appointment/order context. | R1-S core/order specs; R1-C detail page; R1-A maps; R2-R archive source; R3-S specs | CONFIRMED_CANDIDATE | `.do`/verb variant and response fields. |
| Contract/signing write | Contract lifecycle, signature URL, and external signing helpers are mapped. | R1-C detail page; R1-A detail inventory; J contract mapping | VERIFY_BEFORE_IMPLEMENTATION | Authorization and signing state transitions. |
| Construction | Product, package, procedure, labour, and current-operation reads are used by detail flows. | R1-C detail page; R1-A maps; J product/procedure/operation mappings | CONFIRMED_CANDIDATE | Construction writes and workflow coupling. |
| Acceptance | Acceptance report PDF and project acceptance candidates exist. | R1-C detail page; R1-A maps; J acceptance/project mappings | VERIFY_BEFORE_IMPLEMENTATION | Acceptance submission and signing preconditions. |
| Media | Upload-token, external Qiniu upload, album, notes/media paths are used. | R1-C detail page; R1-A detail inventory; J file/album mapping | VERIFY_BEFORE_IMPLEMENTATION | Token scope, upload result persistence, deletion, and platform adapter behavior. |
| Native/location | GPS bounds are list filters; QR and media use native/platform capabilities. | R1-C list/detail pages; R1-A page/detail maps | VERIFY_BEFORE_IMPLEMENTATION | MP/App permission, coordinate, scanner, upload, and failure behavior. |

## R1 machine-readable spec findings

| Spec | Pinned path | Material result | Classification |
| --- | --- | --- | --- |
| Core | R1-S `api_specs/business_core_beta.json` | Login runner plus seven read steps: role change, function count, service appointment/workflow-node list, detail, project count/list, contract query. | READ_CANDIDATE |
| Order | R1-S `api_specs/business_order_beta.json` | Contract query and order detail read setup. | READ_CANDIDATE |
| Order write | R1-S `api_specs/business_order_write_beta.json` | Read setup plus isolated `basic/order/orderConfirm` mutation. | WRITE_CANDIDATE_REQUIRES_GUARD |

The R1 specs contain expected response paths such as `success`, `data`, list
rows, service-appointment identifiers/status, workflow identifiers/nodes, and
contract/order fields. These expected paths are candidate assertions, not
current production guarantees.

## R1 call-site findings

| Call-site area | Reusable finding | Verification note |
| --- | --- | --- |
| Login | Login stores token/user/current role, then changes role and may upsert push id. | Do not copy test phone/code/tenant values. Verify refresh/logout/error behavior. |
| List | SANode uses `querySAWorkflowNode`, ordinary list uses `query`, other tabs use workflow-node query; filters include state/status, regex, dates, GPS, priority. | Verify server-side filter semantics and list count composition. |
| Detail | Detail composes service appointment, workflow, forms, order, contract, inspection, media, action, resource, and note calls. | Preserve sequencing as evidence, not as a mandate to port Legacy architecture. |
| Workflow | Process passes node/form/module/id context; rollback/takeback/cancel and subflow operations are distinct. | Verify transition invariants before Workflow Runtime implementation. |
| Forms | Field definitions and form data are separate; one fixed form uses `findByIdWithWorkflow`; writes use serialized `dataStr`. | Define supported V1 control subset and explicit unsupported behavior. |
| Inspection | Survey PDF uses historical `sureyId` spelling; measurements are stored separately. | Verify whether spelling remains current before implementation. |
| Upload/media | Upload-token request precedes external Qiniu upload; album and notes persist media references. | Verify token and persistence contract; no upload executed here. |

## R2 raw-versus-normalized trace

R2 gives two different evidence layers which must not be collapsed:

| Layer | R2 evidence | Reusable conclusion |
| --- | --- | --- |
| RAW_BACKEND | `web/lib/erm/sources/*`, `work-order-cloud-read.ts`, `project-archives-cloud.ts`, survey/project/code sources | Confirms raw endpoint families, filter names, and some return-shape fields used by Web. |
| NORMALIZED_DOMAIN_MODEL | `web/lib/erm/*`, `docs/12-domain-glossary.md` | Confirms normalized meanings such as `WorkOrder.id/status/customer/address/appointment/assignee` and activity/workflow read models. |
| BFF | `web/app/api/*`, `docs/05-integration-strategy.md` | Confirms Web JSON routes, cookie boundary, and mock fallback behavior. Not a raw mobile contract. |

Important R2 limitations:

- Some Web writes are intentionally disabled or deferred; that does not prove
  raw backend writes are unavailable.
- Mock fallback paths are not backend observations.
- R2 uses GET for at least one form read where R1 legacy evidence is POST-style;
  this is an explicit conflict.

## R3 comparison and provenance

R3's pinned committed API specs and architecture docs were read through Git at
SHA `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`. Its working-tree changes and
untracked `business_3_0/web`/documentation paths were excluded.

The core spec blobs differ between R1 and R3; the order spec also differs in
step composition. R1 adds explicit `mutates:false` flags to read steps and
keeps `orderConfirm` in a separate write fixture. R3 does not carry identical
metadata/step boundaries. Therefore R3 corroborates historical knowledge but
does not override R1's safer read/write classification.

## Backend Java evidence status

The local-only tree contains controller mappings for identity, workflow,
service appointments, dynamic forms, orders, contracts, acceptance, projects,
media, and supporting lookup APIs. The two inspected anchor files have the
SHA-256 values recorded in `EXISTING_ASSET_INVENTORY.md`.

Because `/Users/yesun/Code/xlink/code/cloud` is not a Git repository and has no
reviewed commit anchor, this evidence is `LOCAL_ONLY_UNVERIFIED`. It is useful
for choosing targeted backend verification points, but it is not an
authoritative API contract and was not copied into the new repository.

## Unresolved evidence register

| ID | UNKNOWN | Why it matters | Targeted action |
| --- | --- | --- | --- |
| U-01 | Current environment and production parity | All endpoint conclusions could be beta-only. | Verify environment/host and safe read-only login/session behavior. |
| U-02 | Session refresh/expiry/error envelope | Required for shared auth adapter and retry policy. | Inspect current backend/client behavior without recording secrets. |
| U-03 | `.do` versus non-`.do` canonical paths | Affects every adapter and test fixture. | Verify exact route aliases and method handling. |
| U-04 | List/tab/count semantics | Drives Work Order List correctness. | Verify counts, filters, pagination, and empty/error states. |
| U-05 | Workflow node/run/definition identity | Prevents invalid transitions and stale writes. | Verify read joins and one guarded transition fixture. |
| U-06 | Dynamic form supported subset | Determines Dynamic Form Runtime scope. | Inventory field/control types and define explicit unsupported errors. |
| U-07 | Write schemas/idempotency | Prevents accidental duplicate business mutations. | Target appointment, form, quotation, inspection, and acceptance writes independently. |
| U-08 | Native capability boundaries | MP/App parity depends on scanner, location, upload, and permissions. | Build platform capability matrix before G2 finalization. |
| U-09 | Backend provenance | Local Java mappings may be stale or from another checkout. | Locate a reviewed Git/backend revision or keep mapping non-authoritative. |

## Traceability conclusion

The consolidated baseline is evidence-backed enough for G2 architecture
decisions about shared business code, explicit platform adapters, a Workflow
Runtime boundary, and a bounded Dynamic Form Runtime. It is not evidence-backed
enough to implement unverified write transitions or to claim production API
compatibility. Those items remain explicit P0/P1 targeted rescans.
