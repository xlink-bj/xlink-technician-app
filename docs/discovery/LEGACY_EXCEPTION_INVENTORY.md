# Technician Legacy Hardcode & Exception Inventory

## Purpose and evidence boundary

This is the G1-B static inventory for the Technician V1 rebuild. It identifies
material special-case behavior in the pinned Legacy implementation and assigns
each finding a classification, disposition, and owner gate. It is an evidence
record, not permission to copy Legacy source or to perform business writes.

The scan used the following committed evidence:

| Source | Pinned reference | Use |
| --- | --- | --- |
| R1 | `/Users/yesun/Code/xlink-business-jishi-3.0`, `modernization/engineering-foundation`, `6ada6b5375324bfcd09ca7c569b96a4ff328173f` | Primary Technician Legacy call sites and extracted contracts. |
| R2 | `/Users/yesun/Code/xlink-business-3.0`, `main`, `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185` | Supporting normalized/raw Web evidence where it corroborates a domain or form concept. |
| R3 | `/Users/yesun/Code/xlink-app`, committed `main` content at `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` | Historical API/spec comparison only; dirty/untracked content excluded. |

Method: `REUSE → VERIFY → GAP ANALYSIS → TARGETED RESCAN`.

Only the Technician V1 path was considered: Login, Home, Work Order List and
Detail, Customer Contact, Appointment, Inspection, Dynamic Inspection Form,
Estimate/Quotation, Construction, and Acceptance, plus shared workflow,
permission, lookup, media, location, and MP/App behavior. No runtime scan,
network call, production call, or business mutation was performed. Reference
repositories were not modified.

## Summary

Total material findings: **40**

By classification:

| Classification | Count |
| --- | ---: |
| BUSINESS_RULE | 11 |
| BACKEND_SCHEMA_COMPATIBILITY | 19 |
| PLATFORM_COMPATIBILITY | 5 |
| LEGACY_WORKAROUND | 4 |
| UNKNOWN_REQUIRES_VERIFICATION | 1 |

By disposition:

| Disposition | Count |
| --- | ---: |
| PRESERVE_AS_DOMAIN_RULE | 11 |
| NORMALIZE_IN_API_ADAPTER | 8 |
| IMPLEMENT_IN_WORKFLOW_RUNTIME | 3 |
| IMPLEMENT_IN_FORM_RUNTIME | 6 |
| IMPLEMENT_IN_PLATFORM_ADAPTER | 5 |
| VERIFY_DURING_G1_C | 5 |
| DROP_CANDIDATE | 2 |

The inventory has nine dynamic-form findings (LE-018–LE-026), thirteen
workflow-focused findings (LE-007, LE-009, LE-013, LE-015–LE-017, LE-027–LE-033),
and five platform findings (LE-002, LE-034–LE-037). These groups overlap by
design because a workflow node can also select a form or platform behavior.

## Classification and disposition rules

- `BUSINESS_RULE`: Technician/domain semantics that must be preserved, not necessarily the current UI implementation.
- `BACKEND_SCHEMA_COMPATIBILITY`: Behavior required by the current backend, workflow, form, or lookup contract.
- `PLATFORM_COMPATIBILITY`: MP-WEIXIN, APP-PLUS, device, or runtime-specific behavior.
- `LEGACY_WORKAROUND`: Historical workaround or architecture debt that is not automatically portable.
- `UNKNOWN_REQUIRES_VERIFICATION`: Intent cannot be established safely from static evidence.

Dispositions identify the target boundary: preserve domain meaning, normalize
transport/schema differences, implement in a runtime, verify at G1-C, or drop
as a Legacy-only branch.

## Inventory records

Each record contains the trigger, observed behavior, exact source reference,
corroboration status, omission/copy risks, confidence, and owner gate. Tenant
and role identifiers are intentionally redacted; fixed form/workflow IDs are
retained where they define a backend contract.

### Login, home, and list contracts

| ID | Classification / disposition | Area and trigger | Observed behavior and literal | R1 evidence and corroboration | Risk if omitted / copied mechanically | Confidence / owner |
| --- | --- | --- | --- | --- | --- | --- |
| LE-001 | BACKEND_SCHEMA_COMPATIBILITY / NORMALIZE_IN_API_ADAPTER | Login; `method` 1/2/3, phone, SMS, password | Client validates mainland phone shape and six-digit SMS, then sends method-specific code/password fields. | R1 `subpackages/login/loginAuth.vue:226,265-336`, `login()` / `getSms()`; R2 `web/app/api/auth/login/route.ts` corroborates a login boundary. | Omitted: incompatible login requests. Copied: validation becomes an accidental authority over backend policy. | HIGH / G3 Auth Adapter |
| LE-002 | PLATFORM_COMPATIBILITY / IMPLEMENT_IN_PLATFORM_ADAPTER | Login persistence; `wx.setStorageSync` | Login state is written through the MP global API, including cached login/user context. | R1 `subpackages/login/loginAuth.vue:349-352`; no R2/R3 platform corroboration used. | Omitted: MP login cannot resume. Copied: platform globals leak into shared business code and secrets may be persisted without a policy. | HIGH / G3 Auth + G1-D |
| LE-003 | BACKEND_SCHEMA_COMPATIBILITY / VERIFY_DURING_G1_C | Login tenant selection; fixed `tenantId` in SMS/login requests | A tenant value is embedded in login calls; literal is recorded as `TENANT_ID_REDACTED`. Static evidence cannot establish whether it is environment configuration or a permanent business partition. | R1 `subpackages/login/loginAuth.vue:276-283,329-336,542`; R1 `resources/js/common.js:487,2839`; no authoritative R2/R3 tenant mapping. | Omitted: login routed to the wrong tenant. Copied: tenant data is hardcoded into the new app and can cross environments. | MEDIUM / G1-C Auth/tenant verification |
| LE-004 | BACKEND_SCHEMA_COMPATIBILITY / NORMALIZE_IN_API_ADAPTER | Role/menu; `functionList`, `roleIds`, role change | Login response is reduced to nested function/button lists, cached as current-role capabilities, and consumed by Home/menu rendering. | R1 `subpackages/login/loginAuth.vue:430-466`, `pages/index/index.vue:797-807`; R2/R3 no direct equivalent used. | Omitted: incorrect menu/permission surface. Copied: UI cache is mistaken for server authorization. | HIGH / G3 Auth/API Adapter |
| LE-005 | LEGACY_WORKAROUND / DROP_CANDIDATE | Home; function name `成长通` plus a fixed role ID | One named menu item and one redacted role ID route to an indicator-score page. | R1 `pages/index/index.vue:194-206`; no R2/R3 corroboration. | Omitted: only the historical role-specific shortcut disappears. Copied: role behavior becomes opaque and non-configurable. | HIGH / G2 decision, G4 if retained |
| LE-006 | LEGACY_WORKAROUND / DROP_CANDIDATE | Home; function name `云店铺` with no `action` | A display name opens a partner-application page instead of using a declared action. | R1 `pages/index/index.vue:803-823`; no R2/R3 corroboration. | Omitted: Legacy-only partner shortcut is absent. Copied: labels become executable routing keys. | HIGH / G2 decision |
| LE-007 | BACKEND_SCHEMA_COMPATIBILITY / NORMALIZE_IN_API_ADAPTER | Work-order list endpoint; `func.type` and tab mode | `SANode` uses `basic/serviceAppointment/querySAWorkflowNode`; other modes use `basic/serviceAppointment/query`, with page-specific workflow-node variants. | R1 `resources/technician/mainWorkOrderListContract.js:14-60`, `pages/serviceAppointment/serviceAppointments.vue:2460-2494`; R2 `work-order-cloud-read.ts`, R3 core specs corroborate endpoint families only. | Omitted: tabs return wrong rows. Copied: endpoint choice is scattered through page components. | HIGH / G3 API Adapter |
| LE-008 | BUSINESS_RULE / PRESERVE_AS_DOMAIN_RULE | Work-order list; `orderState` and `type` | `shouldUseServiceAppointmentQuery` selects the ordinary query only for non-`SANode` and `orderState` `all` or `concern`. | R1 `resources/technician/workOrderContract.js:4-9`; no direct R2/R3 parity claim. | Omitted: tab population changes. Copied: current tab naming is mistaken for the complete domain model. | HIGH / G4 List slice |
| LE-009 | BACKEND_SCHEMA_COMPATIBILITY / NORMALIZE_IN_API_ADAPTER | List query; paging, search, state, status, GPS, date, priority, tags | Query uses page/rows, `state=1`, regex over title/name/phone/address/describe/orderNum, status arrays, GPS bounds, priority descending, appointment time ascending, and `exts.tagIds`. | R1 `resources/technician/mainWorkOrderListContract.js:21-53`, page call site `2460-2483`; R2 raw work-order read source and R3 specs corroborate filter families. | Omitted: incorrect list filtering/order. Copied: backend query syntax leaks into screens. | HIGH / G3 API Adapter |
| LE-010 | BACKEND_SCHEMA_COMPATIBILITY / NORMALIZE_IN_API_ADAPTER | List response; `workflowNodeList` shape | Non-`SANode` rows select the last workflow node, or fall back to `{nodeDef:{}, data:rawItem}` when no node exists. | R1 `resources/technician/mainWorkOrderListContract.js:64-77`; R2 normalized work-order model supports a normalized row but not this fallback rule. | Omitted: list crashes or loses active-node context. Copied: last-array-element ordering becomes an undocumented invariant. | HIGH / G3 API Adapter |
| LE-011 | BACKEND_SCHEMA_COMPATIBILITY / NORMALIZE_IN_API_ADAPTER | List row projection; `nodeDef`, `data`, `exts`, dynamic permission keys | A whitelist projects fields, forces `tagShow=false` and distance fields to `null`, and copies any key ending `ReassignPermission`. | R1 `resources/technician/mainWorkOrderListContract.js:79-137`; no direct R2/R3 corroboration. | Omitted: list actions/tags disappear. Copied: silent field loss and dynamic-key conventions become permanent API shape. | HIGH / G3 API Adapter |

### Workflow and status policy

| ID | Classification / disposition | Area and trigger | Observed behavior and literal | R1 evidence and corroboration | Risk if omitted / copied mechanically | Confidence / owner |
| --- | --- | --- | --- | --- | --- | --- |
| LE-012 | BUSINESS_RULE / PRESERVE_AS_DOMAIN_RULE | List status presentation; `201`, `999`, `102`, `300` | Handler/role conditions gate list actions; status `300` exposes allocation, while `102` and `300` choose different labels. | R1 `pages/serviceAppointment/serviceAppointments.vue:371-465`, `subpackages/serviceAppointment/serviceAppointments.vue:521`; no R2/R3 direct UI parity. | Omitted: technicians see or miss actions. Copied: numeric status checks spread across components. | HIGH / G4 List slice |
| LE-013 | BACKEND_SCHEMA_COMPATIBILITY / IMPLEMENT_IN_WORKFLOW_RUNTIME | Reallocation; `resourceRole` and fixed node IDs | Role `1` and `2` select different reallocation node IDs: `31596542169173`, `21732156850739`, `81596873713369`, `71732158922619`; `scheduleFlag` is also submitted. | R1 `pages/serviceAppointment/serviceAppointments.vue:1799-1908`; no R2/R3 node-ID corroboration. | Omitted: engineer/team reassignment can target the wrong node. Copied: opaque IDs become undeclared business logic. | HIGH / G1-C Workflow matrix → G4 |
| LE-014 | BUSINESS_RULE / PRESERVE_AS_DOMAIN_RULE | List/detail action visibility; statuses `104`, `105`, `200` plus role context | A role-specific note/action branch is shown for waiting-contact/waiting-appointment states and a temporary no-visit outcome. | R1 `pages/serviceAppointment/serviceAppointments.vue:425-465`, `resources/technician/workOrderStatusWriteContract.js:4-39`; no direct R2/R3 parity. | Omitted: required customer-contact exception is unavailable. Copied: role IDs and labels are hardcoded into UI policy. | HIGH / G4 Workflow slice |
| LE-015 | LEGACY_WORKAROUND / VERIFY_DURING_G1_C | Workflow-node visibility; node ID/state/type and source index | Visibility skips `nodeId='0'`, `state=-1`, and node types `accept`, `allot`, `dispatch`, but force-includes source index `1`. | R1 `resources/technician/workflowNodeVisibilityContract.js:8-52`; no R2/R3 confirmation of the index rule. | Omitted: hidden/extra nodes differ. Copied: array order becomes a hidden permission rule. | HIGH / G1-C Workflow matrix |
| LE-016 | BACKEND_SCHEMA_COMPATIBILITY / IMPLEMENT_IN_WORKFLOW_RUNTIME | Handler identity; `userId`, `roleId`, `orgId + '+' + roleId` | A node is handled by the logged-in user, role, or composite organization-role token. | R1 `subpackages/serviceAppointment/serviceAppointment.vue:2750-2763`; R2 domain glossary corroborates assignee/role concepts but not token encoding. | Omitted: valid handlers cannot act. Copied: identity encoding is embedded instead of normalized. | HIGH / G3 Workflow Runtime |
| LE-017 | BACKEND_SCHEMA_COMPATIBILITY / IMPLEMENT_IN_WORKFLOW_RUNTIME | Workflow/form identity; `runId`, `defId`, `workflowNodeId`, `nodeFormDefId`, `nodeFormDataId` | Main nodes use the active runtime node; subflows use `currentNode`; repeat/forms clear or reuse form IDs; subworkflow refresh uses `(defId, runId)`. | R1 `subpackages2/inspectionAppointment/inspectionAppointment.vue:6046-6138`, `serviceAppointment.vue:2571`; R2/R3 support workflow/form concepts but do not prove identity invariants. | Omitted: forms attach to the wrong runtime node. Copied: page state substitutes for a typed identity model. | HIGH / G1-C Workflow matrix → G3/G4 |
| LE-018 | BACKEND_SCHEMA_COMPATIBILITY / NORMALIZE_IN_API_ADAPTER | Form read; `formDefId`, `extId`, field and data paths | Field definitions use `biz/extField/query`; most data uses `biz/extForm/query/{formDefId}`; form `3285058246984486156` uses `/biz/extForm/findByIdWithWorkflow`. | R1 `resources/technician/workOrderFormReadContract.js:4-40`; R2 survey/form sources corroborate form reads; R3 specs corroborate historical form APIs. | Omitted: forms fail to load. Copied: special path condition remains hidden in components. | HIGH / G3 API Adapter |
| LE-019 | BACKEND_SCHEMA_COMPATIBILITY / VERIFY_DURING_G1_C | Form read exceptions; `notFilterBelongTo` | `notFilterBelongTo='1'` is sent for form IDs `3285058246984486156` and `3721799436069914536`; temporary-button logic separately excludes these IDs. | R1 `resources/technician/workOrderFormReadContract.js:18-40`, `subpackages/serviceAppointment/serviceAppointment.vue:285-291`; R2/R3 do not establish why ownership filtering is bypassed. | Omitted: historical forms may be empty. Copied: ownership isolation is silently bypassed for future forms. | HIGH / G1-C Form matrix |
| LE-020 | BACKEND_SCHEMA_COMPATIBILITY / IMPLEMENT_IN_FORM_RUNTIME | Node types and fixed form IDs; `forms`, `repeat`, `subflows`, `placeOrder`, `2522989775781119510`, `7971040108398070730` | Node type controls tabs, add/complete buttons, repeat records, appointment actions, and “去下单” label/icon for the survey/quotation form. | R1 `subpackages/serviceAppointment/components/TechnicianWorkflowCommandBar.vue:28-231`, `serviceAppointment.vue:118-219`, `subpackages2/inspectionAppointment/inspectionAppointment.vue:6046-6093`; R2/R3 corroborate workflow/form categories only. | Omitted: form workflow cannot complete. Copied: special form IDs become arbitrary UI switches. | HIGH / G1-C → G3/G4 |
| LE-021 | BACKEND_SCHEMA_COMPATIBILITY / IMPLEMENT_IN_FORM_RUNTIME | Dynamic form configuration; `frontEndConfig` | JSON configuration is parsed; `valueOption` becomes `cascadeCode_` or `codecfg_`; `tagType` changes rendering/behavior. | R1 `resources/js/common.js:2800-2819`; R2 `web/lib/cloud-code-labels.ts` corroborates code-label dependency. | Omitted: fields render without options/config. Copied: raw JSON parsing is duplicated in every form. | HIGH / G3 Dynamic Form Runtime |
| LE-022 | BACKEND_SCHEMA_COMPATIBILITY / IMPLEMENT_IN_FORM_RUNTIME | Dynamic visibility; `showField`, `showValue`, nested/array/cascade values | Legacy compatibility handles `$exist`, dotted fields, arrays, arrays of choices, and preset/`exts` values. | R1 `resources/js/common.js:2325-2406,2439-2597`; no R2/R3 equivalent for exact precedence. | Omitted: conditional fields appear incorrectly. Copied: undocumented precedence and legacy config quirks are frozen. | HIGH / G1-C → G3 |
| LE-023 | BACKEND_SCHEMA_COMPATIBILITY / IMPLEMENT_IN_FORM_RUNTIME | Option providers; field `workType`, `valueOption`, `select`, `bizSelect`, `cascade` | `workType` maps to the `workTypes` provider; other fields use `valueOption`; select/cascade/code paths use different option loaders. | R1 `subpackages2/inspectionAppointment/inspectionAppointment.vue:1000-1129,2504-2534`, `serviceAppointment.vue` form handlers; R2 code-label source corroborates lookup separation. | Omitted: options show wrong labels/values. Copied: provider names become view-specific literals. | HIGH / G1-C → G3 |
| LE-024 | BACKEND_SCHEMA_COMPATIBILITY / IMPLEMENT_IN_FORM_RUNTIME | Field type validation/serialization; `text`, `phone`, `number`, `digit` | Text/phone values are trimmed; `number` accepts digits only; `digit` accepts decimal values; other types pass through. | R1 `resources/technician/editableFieldWriteContract.js:6-11,45-75`; R2/R3 no direct validation parity. | Omitted: backend receives wrong value shapes. Copied: client validation is treated as complete schema validation. | HIGH / G3 Dynamic Form Runtime |
| LE-025 | BUSINESS_RULE / PRESERVE_AS_DOMAIN_RULE | Inspection measurement; form `7971040108398070730`, `part[0]='3'`, fields `length`/`width` | Area is derived as `length × width`, rounded to two decimals, with explicit zero/empty handling. | R1 `resources/technician/editableFieldWriteContract.js:4,14-43`; R2 survey source corroborates measurement domain, not this exact window rule. | Omitted: inspection estimate inputs are wrong. Copied: one form ID and part index become the only measurement model. | HIGH / G4 Inspection/Form slice |
| LE-026 | BACKEND_SCHEMA_COMPATIBILITY / IMPLEMENT_IN_FORM_RUNTIME | Fixed widget/config set; `bizSelect`, `cascade`, `radio`, `checkbox`, `switch`, `rate`, file/video, `max`, `fileType`, `uploadText` | Renderer selects controls and media constraints from `extField.type` and `frontEndConfig`; rate is read-only in one view. | R1 `subpackages2/inspectionAppointment/inspectionAppointment.vue:1040-1223,2523-2772`; R2 survey/form sources corroborate dynamic control data. | Omitted: unsupported controls silently degrade. Copied: every historical widget is assumed V1-supported. | HIGH / G1-C → G3/G4 |

### Domain, quotation, construction, and acceptance rules

| ID | Classification / disposition | Area and trigger | Observed behavior and literal | R1 evidence and corroboration | Risk if omitted / copied mechanically | Confidence / owner |
| --- | --- | --- | --- | --- | --- | --- |
| LE-027 | BUSINESS_RULE / PRESERVE_AS_DOMAIN_RULE | Service type `40`, `11`, `12` | Service type `40` uses `refreshParts` instead of `parts`; service types `11` and `12` suppress an album label option. | R1 `subpackages/serviceAppointment/serviceAppointment.vue` service-process/form branches; R2 domain glossary corroborates service-type concepts. | Omitted: construction/inspection choices differ by service. Copied: service-type numbers are scattered magic values. | MEDIUM / G4 Core slices |
| LE-028 | BUSINESS_RULE / PRESERVE_AS_DOMAIN_RULE | Service type `30`, subflows and acceptance | A subflow node offers “新增验收” for service type `30`, while other subflows offer “新增服务”; completion is separately gated. | R1 `TechnicianWorkflowCommandBar.vue:180-231`; R2/R3 no direct UI parity. | Omitted: acceptance cannot be initiated. Copied: one numeric service type controls a general workflow component. | HIGH / G4 Acceptance slice |
| LE-029 | BUSINESS_RULE / PRESERVE_AS_DOMAIN_RULE | Estimate/order workspace; `processState`, `deliveryOrderState`, `type`, `contractType` | Cost/profit, delivery-order, editing, and payment actions are gated by process states `-1,0,1,2,3,4`, delivery states `0,1,2`, item types `0,1`, and contract type `7`. | R1 `TechnicianOrderWorkspacePanel.vue:15-18,108-183,216-260`; R2 normalized work-order model corroborates order/activity concepts. | Omitted: quotation/construction progress actions misfire. Copied: presentation-state checks replace domain transitions. | HIGH / G4 Quotation/Construction |
| LE-030 | BUSINESS_RULE / PRESERVE_AS_DOMAIN_RULE | Contract lifecycle; `contractStatus`, `workType`, payment/refund flags | Contract status `10` means signed success, `-2` void, `2` signing, `-3` resend; `workType` `1/2/3` distinguishes no/electronic/offline signing; payment and settlement flags gate refund/add/deduction. | R1 `TechnicianContractWorkspacePanel.vue:78-100,103-231`; R2 archive/contract sources corroborate contract concepts. | Omitted: contract actions become unsafe or unavailable. Copied: labels and numeric states are not centralized. | HIGH / G4 Contract slice |
| LE-031 | LEGACY_WORKAROUND / VERIFY_DURING_G1_C | Quotation confirmation; `confirm` check is commented out | A comment says signing/editing should wait for homeowner quote confirmation, but the visible check is commented out and current conditions allow paths without it. | R1 `TechnicianOrderWorkspacePanel.vue:123-131,198-214,246-260`; no R2/R3 proof of intended enforcement. | Omitted: may preserve an unsafe legacy path. Copied: commented policy is treated as active contract. | HIGH / G1-C business-owner verification |
| LE-032 | BUSINESS_RULE / PRESERVE_AS_DOMAIN_RULE | Inspection appointment; statuses `104`, `105`, actions `200`, `204` | Waiting-contact/waiting-appointment can become “暂时不需要上门” (`200`); place-order statuses `203`, `206`, `205` can become “上门未成交” (`204`). | R1 `TechnicianWorkflowCommandBar.vue:28-42,145-162`, inspection appointment status branches; R2/R3 no direct action parity. | Omitted: technician cannot record required outcome. Copied: status codes are embedded in UI instead of a transition policy. | HIGH / G4 Inspection/Quotation |
| LE-033 | BUSINESS_RULE / PRESERVE_AS_DOMAIN_RULE | Workflow command bar; node types `placeOrder`, `subflows`, `forms`, `repeat`, service type `30` | Place-order and subflow command buttons are enabled only for matching node types, handler state, and form completion conditions. | R1 `TechnicianWorkflowCommandBar.vue:43-231`; R2 normalized activity model supports action boundary, not exact predicates. | Omitted: workflow cannot progress. Copied: command visibility is mistaken for authorization. | HIGH / G4 Workflow slices |
| LE-034 | PLATFORM_COMPATIBILITY / IMPLEMENT_IN_PLATFORM_ADAPTER | Calendar; MP-WEIXIN and APP-PLUS | MP requests `scope.addPhoneCalendar` and requires a user tap; App uses Android calendar permissions/content provider and iOS-specific handling. | R1 `resources/js/common.js:1400-1638`; no R2/R3 platform corroboration. | Omitted: appointment reminders fail on one platform. Copied: native permission logic contaminates shared runtime. | HIGH / G1-D → G3 Platform Adapter |
| LE-035 | PLATFORM_COMPATIBILITY / IMPLEMENT_IN_PLATFORM_ADAPTER | Location; MP-WEIXIN and APP-PLUS | MP authorization uses `scope.userLocation` and `wx.getLocation`; App uses `uni.getLocation`, system service checks, Android runtime permission, and iOS settings. | R1 `resources/js/common.js:1643-1669,1838-1985`; R1 list page consumes GPS bounds at `2460-2483`; no R2/R3 platform corroboration. | Omitted: map/filter/navigation behavior diverges. Copied: platform permission states leak into list/detail code. | HIGH / G1-D → G3 Platform Adapter |
| LE-036 | PLATFORM_COMPATIBILITY / IMPLEMENT_IN_PLATFORM_ADAPTER | Media upload; `wx.uploadFile`, Qiniu token, MP/App file shapes | Client obtains `back/super/file/upToken.do`, uploads to `https://up-z1.qiniup.com`, then transforms returned keys; file payload shape differs by control/platform. | R1 `resources/js/common.js:1362-1395`, `subpackages2/inspectionAppointment/inspectionAppointment.vue:9207-9270`, `serviceAppointment.vue:8700-8890`; R2/R3 no platform parity. | Omitted: inspection evidence cannot persist. Copied: Qiniu/`wx` details are coupled to forms. | HIGH / G1-D → G3 Platform Adapter |
| LE-037 | PLATFORM_COMPATIBILITY / IMPLEMENT_IN_PLATFORM_ADAPTER | Scan/camera; MP and App routes | Scan uses `wx.scanCode`; photographing routes to `camera` on MP and `camera2` on App; upload/canvas paths use platform-specific objects. | R1 `resources/js/common.js:382-394`, `serviceAppointment.vue:4314`, `inspectionAppointment.vue:10313-10325`; no R2/R3 platform corroboration. | Omitted: QR/camera flows unavailable. Copied: device APIs are called from business components. | HIGH / G1-D → G3 Platform Adapter |
| LE-038 | BUSINESS_RULE / PRESERVE_AS_DOMAIN_RULE | Customer contact display; phone masking | Work-order and contract panels mask an owner/contact phone using a `3 + 4 masked + 4` pattern before display. | R1 `TechnicianOrderWorkspacePanel.vue:30-44`, `TechnicianContractWorkspacePanel.vue:29-38`; no R2/R3 direct parity. | Omitted: privacy behavior regresses. Copied: masking format is treated as a universal data model. | MEDIUM / G4 Customer Contact |
| LE-039 | BACKEND_SCHEMA_COMPATIBILITY / NORMALIZE_IN_API_ADAPTER | Status/lookup labels; `codecfg_contractStatus`, `codecfg_processState`, `codecfg_serviceType`, `codelabel` | UI labels are resolved through code tables/cascade formatting while some status labels remain hardcoded in component conditions. | R1 `subpackages/serviceAppointment/serviceAppointment.vue` contract/options branches, `pages/serviceAppointment/serviceAppointments.vue:238-245`, `resources/js/common.js:458-480,2800-2819`; R2 `cloud-code-labels.ts` corroborates code lookup. | Omitted: codes render as raw values. Copied: labels and status semantics become duplicated across screens. | HIGH / G3 API/Form Adapter |
| LE-040 | UNKNOWN_REQUIRES_VERIFICATION / VERIFY_DURING_G1_C | Special tenant/customer/role branches; fixed IDs and named paths | Static evidence shows tenant-specific login and role/name shortcuts, but cannot establish whether these are active V1 requirements, stale migrations, or environment data. Tenant and role literals are redacted. | R1 `loginAuth.vue:276-283,329-336`, `pages/index/index.vue:194-206,803-823`, reallocation branches at `serviceAppointments.vue:1824-1843`; R2/R3 do not identify the current owner of these exceptions. | Omitted: an active customer rule could be lost. Copied: historical customer configuration becomes new-app architecture. | MEDIUM / G1-C business-owner/config verification |

## Dynamic-form special-case assessment

The nine dynamic-form findings separate schema-driven behavior from client-side
special cases as follows:

| Grouped finding(s) | Assessment | Rebuild implication |
| --- | --- | --- |
| grouped: LE-018, LE-021, LE-023, LE-026 | Schema-driven when `formDefId`, field `type`, `valueOption`, and parsed `frontEndConfig` are treated as backend descriptors. | Implement a bounded Dynamic Form Runtime and adapter; unsupported field types must fail explicitly. |
| grouped: LE-019, LE-020 | Client-side special cases around fixed form IDs, node types, ownership filtering, and button labels. | Keep behind a compatibility policy until G1-C confirms the intended contract. |
| grouped: LE-022 | Historical compatibility behavior for multiple visibility-config shapes. | Preserve only the supported subset and record precedence; do not blindly port all Legacy branches. |
| grouped: LE-024 | Mostly schema/type-driven validation with client-side normalization. | Put normalization/validation in the form runtime, with adapter serialization tests. |
| grouped: LE-025 | Genuine domain calculation for a known survey form/part selection, but triggered by fixed identifiers. | Preserve the calculation semantically and move the trigger into a declarative rule/configuration. |

Required G1-C questions are the supported field types, fixed widgets,
read-only/required precedence, option and cascade providers, visibility
dependencies, serialization transformations, and form/node identity joins.

## G2-impacting findings

These findings touch the proposed architecture boundaries, but none prevents
choosing those boundaries safely:

| Boundary | Findings | G2 classification | Reason |
| --- | --- | --- | --- |
| API Adapter | LE-001, LE-003, LE-004, LE-007, LE-009–LE-011, LE-018, LE-019, LE-039 | DOES_NOT_BLOCK_G2 | Route, envelope, query, lookup, and tenant concerns can be isolated behind an adapter; exact parity remains later verification. |
| Workflow Runtime | LE-013, LE-015–LE-017, LE-020, LE-028–LE-033 | DOES_NOT_BLOCK_G2 | Opaque identifiers and status predicates justify a runtime boundary; they do not require a different Vue 3 / uni-app architecture. |
| Dynamic Form Runtime | LE-019–LE-026 | DOES_NOT_BLOCK_G2 | The supported subset and explicit unsupported behavior can be bounded before implementation. |
| Platform Adapter | LE-002, LE-034–LE-037 | DOES_NOT_BLOCK_G2 | Native calls are already separable as platform adapters; G1-D must bound capability details. |
| Legacy exceptions | LE-005, LE-006, LE-031, LE-040 | DOES_NOT_BLOCK_G2 | These are drop/verification candidates and do not alter the shared architecture boundary. |

**BLOCKS_G2 count: 0.** The inventory supports the G2 direction: shared
Vue 3 / uni-app business code, API and auth adapters, Workflow Runtime,
bounded Dynamic Form Runtime, and explicit MP/App Platform Adapters.

## G1-C Input

G1-C must consume this inventory rather than rescan R1 from zero. The exact
follow-up subset is:

### Workflow Capability Matrix

- LE-013: verify the four reallocation node IDs and `resourceRole` mapping.
- LE-015: establish whether source-index `1` visibility is intentional or a Legacy workaround.
- LE-016–LE-017: define user/role/org-role handler identity and `runId`/`defId`/runtime-node/form-data relationships.
- LE-020 and LE-028–LE-033: define node-type action policy, status transitions, subworkflow/acceptance behavior, and quote-confirm gating.
- LE-040: identify active tenant/customer/role exceptions without copying redacted values into application code.

### Dynamic Form Capability Matrix

- LE-019–LE-020: confirm fixed form IDs, ownership-filter exceptions, and form/node special actions.
- LE-021–LE-023: define option providers, `workType` mapping, code/cascade lookup, and visibility configuration shapes.
- LE-022 and LE-026: define show/hide and read-only/required precedence plus the V1 widget subset.
- LE-024–LE-025: define serialization/validation and the declarative measurement rule for the survey form.

G1-C should record each answer as a contract or explicit `UNKNOWN`; no
application implementation belongs in G1-C discovery.

## Disposition and safety conclusion

- 11 findings are semantic domain rules to preserve.
- 8 findings belong in API/lookup normalization.
- 3 findings belong in Workflow Runtime.
- 6 findings belong in Dynamic Form Runtime.
- 5 findings belong in Platform Adapters.
- 5 findings require G1-C verification before implementation.
- 2 named-menu branches are drop candidates.
- No finding is a G2 architecture blocker.

This document does not copy Legacy source, change any reference repository,
call any XLink environment, install dependencies, or add application code.
