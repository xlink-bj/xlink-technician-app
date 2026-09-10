# Technician API Contract Baseline

## Status

**G1-A1 evidence harvest complete for the current evidence set.** This is a
candidate contract baseline for G2 decisions, not a claim that every path is
the current production contract. Runtime verification is deliberately limited
to the evidence already committed in R1/R2/R3; no XLink API calls were made by
this task.

The method is:

**REUSE → VERIFY → GAP ANALYSIS → TARGETED RESCAN**

The new repository is the only writable implementation target. R1, R2, R3,
and the local-only Java tree were read as evidence only.

## Evidence register

Short IDs used below resolve to the exact source records in
[API_EVIDENCE_TRACEABILITY.md](./API_EVIDENCE_TRACEABILITY.md).

| ID | Evidence | Pinned reference | What it can prove |
| --- | --- | --- | --- |
| R1-S | `api_specs/business_core_beta.json`, `business_order_beta.json`, `business_order_write_beta.json` | R1 `6ada6b5375324bfcd09ca7c569b96a4ff328173f` | Machine-readable beta request/expectation candidates and explicit read/write classification. |
| R1-T | `docs/api-test-tooling.md`, `scripts/api_client.py`, `api_inspect.py`, `api_smoke.py` | R1 `6ada6b5375324bfcd09ca7c569b96a4ff328173f` | Form POST client, session handling, inspection and guarded smoke-test behavior. |
| R1-A | `docs/architecture/*` | R1 `6ada6b5375324bfcd09ca7c569b96a4ff328173f` | Backend map, auth/role map, page map, and work-order detail inventory. |
| R1-C | Current Technician call sites and `resources/technician/*Contract.js` | R1 `6ada6b5375324bfcd09ca7c569b96a4ff328173f` | Actual legacy request construction, field names, path variants, and workflow/form usage. |
| R2-R | `web/lib/erm/sources/*` and raw cloud-read modules | R2 `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185` | Raw backend reads used by the Web integration. |
| R2-N | `web/lib/erm/*`, `docs/12-domain-glossary.md` | R2 `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185` | Normalized domain/read-model mappings; not a raw mobile contract. |
| R2-B | `web/app/api/*`, `docs/05-integration-strategy.md` | R2 `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185` | BFF boundary, auth cookie behavior, and normalized Web API shape. |
| R3-S | `business/api_specs/*` at the pinned committed tree | R3 `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` | Historical duplicate/variant machine-readable specs. R3 dirty content was not used. |
| R3-A | `business/docs/architecture/*`, `api-test-tooling.md` at the pinned tree | R3 `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` | Historical documentation overlapping R1 architecture and tooling evidence. |
| J | `/Users/yesun/Code/xlink/code/cloud/...` | No Git repository or commit metadata | Local-only Java controller mapping hints. `LOCAL_ONLY_UNVERIFIED`; never copied into this repository. |

## Contract boundary

### RAW_BACKEND

The Technician contract candidate is the legacy/mobile-facing backend surface:
form-encoded POST requests under the `/fsgo/wm/` base, with `JSESSIONID`
session behavior established by R1 tooling and characterization. Both `.do`
and non-`.do` path spellings occur in evidence. Path, method, body fields,
response envelope, and state-transition semantics remain independently
verifiable at the targeted-rescan points below.

### NORMALIZED_DOMAIN_MODEL

R2's `WorkOrder`, `WorkOrderActivity`, `Dashboard`, `ServiceResource`, and
read-only workflow models are normalized ERM/BFF outputs. They are valuable
field mappings and terminology, but they are not a license to expose raw cloud
fields or to treat `/api/work-orders` as a backend mobile endpoint. The new app
must keep this boundary explicit.

## Consolidated candidate operations

The table contains **73 candidate API operation records**. A record may group
closely coupled path variants or helper endpoints only when the source evidence
shows they form one business operation; the exact variants remain in the path
column and in the traceability matrix. `H` means multiple mutually reinforcing
sources, `M` means reusable evidence with a material verification gap, and `L`
means historical/local-only evidence that cannot yet drive implementation.

| ID | Candidate method and path family | Flow/domain | Key request / response evidence | Sources | Confidence |
| --- | --- | --- | --- | --- | --- |
| API-01 | POST `index/phoneLogin.do` | Login | `method`, `phone`, `code`, `tenant`; session token is returned in `data.token` and becomes `JSESSIONID`. | R1-T,R1-C,R1-A,R2-B,J | H |
| API-02 | POST `index/getPhoneNumber` | Login / MP | MP phone-number exchange; exact platform payload and response need verification. | R1-C,R1-A,J | M |
| API-03 | POST `function/changeRole` | Login / role | `roleIds`; response includes `functionList` and current-role/menu data. | R1-S,R1-C,R1-A,J | H |
| API-04 | POST `function/query` | Login / permissions | Role/function query candidate; response shape is only partially characterized. | R1-A,J | M |
| API-05 | POST `function/dataCount` | Home / list counts | `functions`; response `data` used for capability/count information. | R1-S,R1-C,R1-A,R2-R,J | H |
| API-06 | POST `role/queryRoleByPersonInTenant` | Login / role | Person/tenant role lookup. | R1-A,J | H |
| API-07 | POST `user/upsertAppPushClientid` | Login / push | App push client identifier upsert; platform-specific push semantics remain open. | R1-C,R1-A,J | H |
| API-08 | POST `document/query` | Home | Home document/notice read in the legacy map; response not in the beta smoke specs. | R1-A,R1-C,J | M |
| API-09 | POST `/basic/qrcode/scan` | Home / navigation | QR scan lookup candidate; native scanner input and response routing need verification. | R1-A,R1-C,J | M |
| API-10 | POST `biz/extForm/upsert/2740509195179410307` | Home | Fixed home form write candidate; form definition is historical evidence, not a generic contract. | R1-A,R1-C,J | M |
| API-11 | POST `basic/serviceAppointment/surveyTimeoutQuery` | Home / appointment | Timeout reminder query. | R1-A,R1-C,J | H |
| API-12 | GET/POST `/biz/cc/supervisor`, `/biz/cc/supervisorTodo` | Home / tasks | Supervisor and todo reads in the legacy home map; raw response not consolidated. | R1-A,R1-C,J | M |
| API-13 | POST `basic/serviceAppointment/querySAWorkflowNode[.do]` | Work-order list | Page/rows, `sortField`, `sortOrder`, `orderState`, state/status, regex search, GPS/advanced filters; response is a `data[]` work-order row. | R1-S,R1-C,R1-A,R2-R,R3-S,J | H |
| API-14 | POST `basic/serviceAppointment/query[.do]` | Work-order list | Ordinary service-appointment list with paging, sorting, regex and status filters. | R1-C,R1-A,R2-R,J | H |
| API-15 | POST `basic/serviceAppointment/queryWorkflowNode[.do]` | Work-order list | Alternate list path used for workflow-node views; exact tab semantics need verification. | R1-C,R1-A,J | M |
| API-16 | POST/GET `basic/serviceAppointment/queryById/{id}[.do]` | Work-order detail | `type=query`; response includes service appointment, workflow, and workflow-node data. | R1-S,R1-C,R1-A,R2-R,R3-S,J | H |
| API-17 | POST `basic/tagType/query` | Work-order list/detail | Tag-type lookup. | R1-C,R1-A,J | H |
| API-18 | POST `basic/tag/query` | Work-order list/detail | Tag lookup. | R1-C,R1-A,J | H |
| API-19 | POST `biz/serviceResource/query` | Work-order list/detail | Resource/technician lookup and filter data. | R1-C,R1-A,R2-R,J | H |
| API-20 | POST `biz/action/query.do` | Detail / activity | `bizType=serviceAppointment`, `sid`, action type set; R2 maps rows to normalized activity. | R1-C,R1-A,R2-R,R2-N,J | H |
| API-21 | POST `user/query` | Detail / customer | User/headman lookup used by detail flows. | R1-C,R1-A,R2-N,J | H |
| API-22 | POST `biz/labour/query` | Detail / construction | Labour/resource lookup used by detail flows. | R1-A,R1-C,J | H |
| API-23 | POST `biz/note/upsert` | Detail / activity | `sid`, `smodule=serviceAppointment`, task time, content, media list. | R1-C,R1-A,J | H |
| API-24 | POST `basic/serviceAppointment/upsertContact` | Customer contact | Contact update candidate; exact contact schema and permissions are unverified. | R1-C,R1-A,J | M |
| API-25 | POST `basic/serviceAppointment/bindPWGroupName` | Customer/contact | Binds a group/name relationship from detail flow. | R1-C,R1-A,J | M |
| API-26 | POST `basic/serviceAppointment/dispatchByCondition[.do]`, `allot[.do]` | Appointment | Assignment/dispatch candidates; legacy call-site names differ from architecture summary. | R1-C,R1-A,J | M |
| API-27 | POST `basic/serviceAppointment/handleReallocateByScheduleFlag` | Appointment | Reallocation by schedule flag. | R1-A,J | M |
| API-28 | POST `basic/serviceAppointment/handleRestore` | Appointment/workflow | Restore action. | R1-C,R1-A,J | H |
| API-29 | POST `basic/serviceAppointment/handleRefused` | Appointment/workflow | Refusal action and reason payload need verification. | R1-C,R1-A,J | M |
| API-30 | POST `basic/serviceAppointment/selfExamination` | Appointment/inspection | Self-examination action; state transition and response are not characterized. | R1-C,R1-A,J | M |
| API-31 | POST `workflow/process` | Workflow | `workflowNodeId`, form definition/data IDs, `smodule=serviceAppointment`, `sid`; advances workflow. | R1-C,R1-A,J | H |
| API-32 | POST `workflow/rollback` | Workflow | Node/work-order identifiers; rollback transition. | R1-C,R1-A,J | H |
| API-33 | POST `workflow/takeback` | Workflow | Node/work-order identifiers; takeback transition. | R1-C,R1-A,J | H |
| API-34 | POST `workflow/cancel` | Workflow | `workflowId`, module, service appointment; cancellation transition. | R1-C,R1-A,J | H |
| API-35 | POST `workflow/startSubWorkflow` | Workflow | Workflow definition, parent flow node, form data ID. | R1-C,R1-A,J | H |
| API-36 | POST `workflow/queryByParentWorkflowNodeId/{parentNodeId}` | Workflow | Parent-node lookup with create-time/id ordering. | R1-C,R1-A,J | H |
| API-37 | POST/GET `workflowDef/queryById/{workflowDefId}` | Workflow | Workflow-definition read. | R1-C,R1-A,J | H |
| API-38 | POST/GET `workflow/queryNode/{workflowNodeId|runId}` | Workflow | Node/run read; exact identifier meaning differs by call site. | R1-S,R1-C,R1-A,J | M |
| API-39 | POST `biz/extField/query` | Dynamic form | `extId`, sort/order/state, `_all`; returns field definitions. | R1-C,R1-A,R2-R,J | H |
| API-40 | POST `biz/extForm/query/{formDefId}` | Dynamic form / inspection | Form data query with sort/create time and `_id`/`sid` filters. | R1-C,R1-A,R2-R,J | H |
| API-41 | GET/POST `biz/extForm/findByIdWithWorkflow` | Dynamic form / workflow | `extId`, `id`; R1 and R2 disagree on verb/call style. | R1-C,R1-A,R2-R,J | M |
| API-42 | POST `biz/extForm/upsert/{formDefId}` | Dynamic form / inspection | `dataStr=JSON.stringify(params)`; form-specific write. | R1-C,R1-A,J | H |
| API-43 | POST `biz/extForm/remove/{formDefId}` | Dynamic form | Form-data removal candidate. | R1-A,J | M |
| API-44 | POST `biz/extForm/queryByColName/{colName}` | Dynamic form | Column-name lookup, including `leakageCause` and `noteItems` usages. | R1-C,R1-A,J | H |
| API-45 | POST `groovyScript/query` | Dynamic form | Form/script metadata lookup. | R1-A,R1-C,J | M |
| API-46 | POST `code/query` | Dynamic form | Code-label lookup. | R1-C,R1-A,R2-R,J | H |
| API-47 | POST `i/code/selectCode.do` | Dynamic form / labels | `jsonPara`/tenant-style code lookup in R2 raw source. | R1-A,R2-R,J | M |
| API-48 | POST `i/code/selectMultistageCode.do` | Dynamic form / labels | Multistage code lookup used by detail form logic. | R1-A,R1-C,J | M |
| API-49 | POST `workflowNode/updateExts/{wnId}` | Dynamic form / workflow | Persists workflow-node extension/form linkage. | R1-A,R1-C,J | M |
| API-50 | POST `basic/serviceAppointment/handleServiceAppointmentFieldValues` | Inspection / detail | `data` contains serialized `{sid, describe}` or status/field values. | R1-C,R1-A,J | H |
| API-51 | POST `basic/survey/createSurveyPDFUrl` | Inspection | Legacy body contains the misspelled `sureyId`; generates survey PDF URL. | R1-C,R1-A,J | M |
| API-52 | POST `measurementData/upsert` | Inspection | Serialized survey measurement/statistics payload. | R1-C,R1-A,J | M |
| API-53 | POST `basic/order/queryById` | Estimate / order | Order detail read. | R1-S,R1-C,R1-A,R2-R,R3-S,J | H |
| API-54 | POST `basic/order/clearOrderFieldQuery` | Estimate / order | `_all`, service-appointment id, sort/state; order-field read. | R1-A,R1-C,R2-R,J | H |
| API-55 | POST `basic/order/upsert` | Estimate / quotation | Order/quotation upsert candidate; payload contract is not complete. | R1-A,R1-C,J | M |
| API-56 | POST `basic/order/creatQuotation` | Estimate / quotation | Quotation creation candidate; spelling is preserved from evidence. | R1-A,R1-C,J | M |
| API-57 | POST `basic/order/orderConfirm` | Estimate / quotation | Explicitly mutating write fixture; requires isolated verification and authorization. | R1-S,R1-A,R1-C,R3-S,J | H |
| API-58 | POST `basic/order/sendMessage` | Estimate / customer | Order/customer message action. | R1-A,R1-C,J | M |
| API-59 | POST `basic/contract/query.do` | Estimate / contract | Paging/sort and service appointment/order filters. | R1-S,R1-C,R1-A,R2-R,R3-S,J | H |
| API-60 | GET/POST `basic/contract/queryById/{id}` | Contract | Contract detail including document number and Qiniu URL fields in R2. | R1-A,R2-R,J | M |
| API-61 | POST `basic/contract/upsert` / `remove` | Contract | Contract lifecycle writes; exact request/authorization not consolidated. | R1-A,J | M |
| API-62 | POST `basic/contract/getContractSignatureUrl` | Contract / signing | Signature URL retrieval. | R1-A,R1-C,J | M |
| API-63 | POST `basic/acceptance/generateAcceptanceReportPDF` | Acceptance | `signImageUrl`, `acceptanceId`, `extId`; report generation. | R1-C,R1-A,J | H |
| API-64 | POST `biz/project/acceptProject` | Acceptance / project | Project acceptance action in backend map; not in core beta read spec. | R1-A,J | M |
| API-65 | POST `basic/product/query` | Construction / estimate | Product catalog lookup. | R1-A,R1-C,J | H |
| API-66 | POST `biz/projPackage/queryWithRank` | Construction / estimate | Ranked package lookup. | R1-A,R1-C,J | H |
| API-67 | POST `biz/procedure/queryWithRank` | Construction | Procedure lookup with service-type, acceptance, repair-parts, and source filters. | R1-C,R1-A,J | H |
| API-68 | POST `basic/operation/currentOperation` | Construction | Current operation read; no body in legacy call site. | R1-C,R1-A,J | H |
| API-69 | POST `back/super/file/upToken.do` | Media | File upload-token candidate; subsequent upload is external Qiniu/native client behavior. | R1-C,R1-A,J | M |
| API-70 | POST `biz/album/album` | Media | Album query/delete/photo payload; exact media schema needs verification. | R1-C,R1-A,J | M |
| API-71 | POST `biz/project/queryProject` | Project/supporting | Project list/read; R2 normalizes a related project view. | R1-A,R2-R,R2-N,J | M |
| API-72 | POST `biz/project/dataCount` | Project/supporting | Project count read. | R1-S,R1-A,R2-R,J | H |
| API-73 | POST `biz/project/getLedgerById` | Project/supporting | Ledger read used by project/detail support. | R1-A,J | M |

## Transport and session baseline

- R1's shared client uses a form-encoded POST by default and a base under
  `/fsgo/wm/`; the R1 characterization records a `JSESSIONID` obtained from
  the login response token.
- The current evidence does not establish a refresh-token protocol, expiry
  header, retry rule, logout contract, or production host contract.
- R2's BFF accepts JSON at its own route, forwards raw form requests when
  configured, and sets HTTP-only cookies. That is a Web integration boundary,
  not a replacement for the mobile contract.
- R1 call sites contain `.do` and non-`.do` spellings for related operations.
  The spelling is therefore part of the targeted verification backlog, not
  silently normalized here.
- Read-only smoke specs are not proof that a write is safe. `orderConfirm`,
  form upsert, workflow transitions, and other writes remain separately
  classified.

## Core flow coverage

| Stage | Current status | Evidence conclusion | Blocking UNKNOWNs for G2 |
| --- | --- | --- | --- |
| Login | SUFFICIENT_FOR_DESIGN | Login, session token, role change, and MP phone path are mapped. | Session expiry/refresh, production contract, and platform-specific login verification. |
| Home | PARTIAL | Existing home reads and count helpers are identified; R2 dashboard is normalized evidence. | Canonical home/count composition and permission-dependent modules. |
| Work Order List | SUFFICIENT_FOR_DESIGN | R1/R2/R3 converge on list fields, filters, sorting, and service-appointment reads. | `.do` equivalence and tab/count semantics. |
| Work Order Detail | SUFFICIENT_FOR_DESIGN | Detail, activity, resources, workflow, forms, order, contract, and media reads are mapped. | Identifier semantics for workflow run/node and exact response envelopes. |
| Customer Contact | PARTIAL | Contact update, user/labour lookup, notes, and phone/navigation helpers are identified. | Contact DTO, permissions, and customer identity source. |
| Appointment | PARTIAL | Dispatch, reallocation, restore/refusal, and timeout helpers are identified. | Mutation payloads, assignment state machine, and idempotency. |
| On-site Inspection | PARTIAL | Survey form, field values, measurement data, and PDF paths are identified. | Submit serialization, evidence/media rules, and PDF generation preconditions. |
| Inspection Form | PARTIAL | Dynamic form/field reads, upsert, code labels, and workflow extension are identified. | Supported field/control subset and unsupported-capability behavior. |
| Estimate / Quotation | SUFFICIENT_FOR_DESIGN | Order and contract read paths plus quotation/order-confirm candidates are bounded. | Exact write schemas, server validation, and signing boundary. |
| Construction | PARTIAL | Product/package/procedure/operation reads and labour support are mapped. | Construction transition writes and workflow coupling. |
| Acceptance | PARTIAL | Acceptance report, project acceptance, contract/signature helpers are identified. | Acceptance submission and signing state transitions. |

## Explicit conflicts and gaps

### Conflicts found

1. **R1/R3 spec drift:** the R1 core/order specs add explicit `mutates:false`
   metadata; the corresponding R3 committed specs do not. R1 order evidence
   also isolates `orderConfirm` in a write fixture while the R3 order spec
   includes an extra confirm step. This is recorded as provenance/spec-version
   drift, not merged away.
2. **Path spelling drift:** `.do` and non-`.do` variants coexist across R1
   call sites, R1 specs, and R2 raw Sources. Canonical production spelling is
   UNKNOWN.
3. **Count composition drift:** R1 uses `function/dataCount` and service
   appointment list reads; R2 derives Web totals from list/BFF composition in
   some paths. These are not assumed equivalent.
4. **Verb drift:** R1 legacy access to `findByIdWithWorkflow` is POST-style in
   the shared client/call-site evidence while R2's raw Source uses GET. Verb
   and response equivalence require targeted verification.
5. **Contract-layer drift:** R2 normalized ERM/BFF models deliberately differ
   from raw backend fields. This is an architecture boundary, not a reason to
   make the raw mobile API look like the Web API.
6. **Backend provenance gap:** Java controller mappings exist in a separate
   local-only tree with no Git provenance. They are useful hints only and are
   explicitly `LOCAL_ONLY_UNVERIFIED`.

### P0 targeted verification

- Establish the current beta/production environment contract, login response,
  session expiry/refresh behavior, and error envelope without recording
  credentials.
- Verify canonical work-order list/count paths, `.do` variants, filters,
  pagination, and tab totals.
- Verify workflow node/run identifiers and transition response invariants;
  this gates a safe Workflow Runtime boundary.
- Verify dynamic-form read/write envelope and form-data identity; define the
  supported V1 subset and explicit failure behavior for unsupported controls.

### P1 targeted verification

- Appointment assignment/reallocation/refusal payloads and idempotency.
- Quotation/order upsert and `orderConfirm` preconditions.
- Inspection measurement/form submission and acceptance/signature transitions.
- Construction workflow coupling and service-process writes.
- Contact update, media token/upload/delete, and native location/QR behavior.

## G1-A1 disposition

The existing R1/R2/R3 assets were inventoried and evaluated before this
consolidation. Reusable API/backend research is traceable in the evidence
matrix. Conflicts, bounded dynamic-form/workflow scope, native/platform
unknowns, and remaining P0/P1 items are explicit. No application
implementation, dependency installation, backend mutation, or reference-repo
modification belongs to this baseline.
