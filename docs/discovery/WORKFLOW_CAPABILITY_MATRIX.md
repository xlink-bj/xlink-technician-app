# Technician Workflow Capability Matrix

## Evidence boundary

This G1-C matrix consumes the accepted G1-B inventory. It is a targeted
contract-definition pass, not a rescan of R1 from zero. It uses committed
static evidence only:

| Source | Commit | Evidence used |
| --- | --- | --- |
| R1 | `6ada6b5375324bfcd09ca7c569b96a4ff328173f` | `resources/technician/*`; Technician list/detail pages; workflow command, order, and contract panels. |
| R2 | `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185` | Normalized work-order/activity concepts and raw workflow-adjacent sources where corroborating. |
| R3 | `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` | Committed historical API/spec evidence only. |
| New repository | `a748f4847135995fa114dd15eead3be70df75a7e` | Accepted G1-B merge baseline. |

No XLink API, production, workflow, or business mutation call was made. R1,
R2, and R3 remain read-only. Tenant, customer, and role literals remain
redacted.

## G1-C summary

- Workflow capabilities evaluated: **14**
- Remaining `UNKNOWN` capability decisions: **6**
- Fixed exceptions retained behind explicit boundaries: **6**
- New workflow DROP candidates confirmed: **0**; global G1-B menu DROP candidates `LE-005` and `LE-006` remain confirmed.
- `BLOCKS_G2`: **0**

The UNKNOWN count is the number of unique unresolved questions in the register
below; multiple capabilities can depend on the same question.

The matrix distinguishes observed Legacy behavior from the V1 semantic
contract. UI labels are not treated as authorization, and array positions are
not treated as workflow identity.

## Capability matrix

| ID / G1-B link | Capability | Legacy trigger / identifier | Observed Legacy behavior | Backend contract / evidence | V1 required semantics | Target boundary | Special-case required? | Disposition | Confidence | Remaining verification / owner gate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WF-001 / LE-013 | Reallocation target selection | `resourceRole` `1` or `2`; node IDs `31596542169173`, `21732156850739`, `81596873713369`, `71732158922619` | Different engineer/team reassignment paths select different runtime nodes and submit `scheduleFlag`. | R1 `pages/serviceAppointment/serviceAppointments.vue:1799-1908`; no R2/R3 proof that the IDs are configuration or immutable contract IDs. | Preserve the resource-role intent and send an opaque, validated target-node reference. | Workflow Runtime + API Adapter | Yes, but as metadata, not scattered hardcode. | Retain as opaque configuration pending provenance. | MEDIUM | Verify node metadata/source and active mapping before G4 reassignment slice. **UNKNOWN** |
| WF-002 / LE-015 | Workflow-node visibility | `nodeId='0'`, `state=-1`, node types `accept/allot/dispatch`, source index `1` | Skips system/closed/special nodes; force-includes source index `1` before role/handler visibility checks. | R1 `resources/technician/workflowNodeVisibilityContract.js:8-52`; index rule has no R2/R3 corroboration. | Filter by declared node state/type/visibility metadata. Never require array index for correctness. | Workflow Runtime | Skip policy yes; index rule no. | Preserve declared filters; isolate index behavior as a guarded compatibility exception. | HIGH for filters / LOW for index | Verify the semantic marker of the index-1 node in G4 workflow fixtures. **UNKNOWN** |
| WF-003 / LE-016 | Handler identity normalization | `userId`, `roleId`, `orgId + '+' + roleId` | Client considers a node handled when `handlerIds` contains user, role, or composite organization-role text. | R1 `subpackages/serviceAppointment/serviceAppointment.vue:2750-2763`; R2 confirms assignee/role concepts, not wire encoding. | Expose typed `UserHandler`, `RoleHandler`, and `OrganizationRoleHandler`; preserve backend encoding only in the adapter. | API Adapter → Workflow Runtime | Yes, wire compatibility only. | Decode wire identities into typed values; do not expose composite strings to screens. | HIGH observed / MEDIUM contract | Verify precedence and server authorization before G3 workflow implementation. **UNKNOWN** |
| WF-004 / LE-017 | Main workflow identity graph | `defId`, `runId`, `workflowNodeId`, runtime/current node, `nodeFormDefId`, `nodeFormDataId` | Main nodes use the active runtime node; form processing passes runtime node and form-definition/data identifiers. | R1 `inspectionAppointment.vue:6046-6093`, `serviceAppointment.vue:3784-3806`; A2 evidence confirms separate identifier fields but not all invariants. | Maintain typed, opaque identities with explicit parent/child relationships; reject ambiguous form attachment. | Workflow Runtime + API Adapter | Yes, identity joins are mandatory. | Preserve identifiers as separate fields; no ID reuse or guessed fallback. | HIGH observed / MEDIUM edge semantics | Verify a non-empty parent/child case and stale-node behavior before G3/G4 writes. **UNKNOWN** |
| WF-005 / LE-017 | Subworkflow identity and refresh | `defId`, `runId`, `workflow/queryNode/{runId}` | Opens a subworkflow by definition plus run ID, overlays runtime nodes onto definition nodes, and refreshes using the same pair. | R1 `serviceAppointment.vue:3162-3219`, `inspectionAppointment.vue:6110-6115`; R2/R3 support workflow concepts only. | Keep parent workflow ID, child definition ID, and child run ID distinct; refresh only the addressed child. | Workflow Runtime | Yes. | Implement explicit parent/child workflow context. | HIGH observed / MEDIUM backend semantics | Verify whether `runId` is globally unique and whether child completion updates parent; covered by U-WF-04. |
| WF-006 / LE-020 | Node-type action policy | `forms`, `repeat`, `subflows/subflow`, `placeOrder` | Node type selects tab shape, add/new form, complete, add product/acceptance, and place-order controls. | R1 `TechnicianWorkflowCommandBar.vue:43-231`, `serviceAppointment.vue:118-219`; R2 activity model supports an action boundary. | Model action availability as a runtime policy over node metadata and state, not as view labels. | Workflow Runtime | Yes, node-type policy. | Preserve semantic actions; derive labels in presentation. | HIGH | Verify the supported V1 node-type subset in G4 slice fixtures. |
| WF-007 / LE-020, LE-033 | Form/repeat completion | `nodeType` `forms` or `repeat`; `formList.length > 0`; node `state=0` | Completion requires at least one form for forms/repeat nodes; repeat records refresh their subworkflow or parent view. | R1 `inspectionAppointment.vue:6046-6057,6110-6125`; `serviceAppointment.vue:4136-4160`. | Define whether zero records, partial records, and completed nodes are valid; return explicit blocked-action reasons. | Workflow Runtime + Dynamic Form Runtime | Yes. | Preserve minimum-record and completion semantics as a policy. | HIGH observed / MEDIUM edge cases | Verify repeat submission cardinality and idempotency at G4. |
| WF-008 / LE-014, LE-032 | Status transition policy | `104/105 → 200`; `203/206/205 → 204` | Exposes “暂不上门” and “上门未成交” outcomes under specific status/node conditions; writes use distinct reason fields for `104/105` versus other statuses. | R1 `TechnicianWorkflowCommandBar.vue:28-42,145-162`, `workOrderStatusWriteContract.js:4-39`; no write executed. | Represent transitions as named commands with preconditions and backend status mapping; UI labels are not the contract. | Workflow Runtime + API Adapter | Yes, status mapping. | Preserve domain outcomes; centralize transition policy. | HIGH | Verify backend transition preconditions and reason payloads in G4 guarded fixtures. |
| WF-009 / LE-033 | Rollback, takeback, and cancel commands | `workflow/rollbackWorkflow`, `workflow/takebackWorkflow`, cancel/process paths | Separate commands exist; takeback warns that following data is removed, rollback presents delete semantics, and refresh differs for subflows/main flow. | R1 `inspectionAppointment.vue:6155-6197`; A2/API traceability records read/write boundaries; no mutation executed. | Runtime must expose distinct destructive-command intents, confirmation, refresh scope, and idempotency state. | Workflow Runtime + API Adapter | Yes, command policy. | Preserve command distinction; do not infer authorization from button visibility. | HIGH observed / MEDIUM write semantics | Verify preconditions, response envelope, and rollback/takeback data scope at G4. |
| WF-010 / LE-028 | Acceptance subflow selection | `serviceType='30'`, `addProductShow='1'`, subflow node | Service type `30` changes “新增服务” to “新增验收”; completion remains a separate node policy. | R1 `TechnicianWorkflowCommandBar.vue:180-231`; R2/R3 no direct UI corroboration. | Preserve acceptance as a domain operation, represented by workflow metadata where possible. | Workflow Runtime | Yes, service-type compatibility rule. | Retain semantic acceptance action; avoid hardcoded label routing. | HIGH | Verify active service-type mapping and acceptance node metadata at G4. |
| WF-011 / LE-029, LE-030 | Quotation/construction lifecycle gating | `processState -1/0/1/2/3/4`, `deliveryOrderState 0/1/2`, `contractStatus 10/-2/2/-3`, `workType 1/2/3` | Cost/profit, delivery, edit, payment, refund, signing, and contract actions are conditionally shown. | R1 `TechnicianOrderWorkspacePanel.vue:15-18,108-260`, `TechnicianContractWorkspacePanel.vue:78-231`; R2 contract/order sources corroborate domain concepts. | Keep a named state machine and action policy; do not copy numeric predicates into component templates. | Workflow Runtime | Yes, domain state policy. | Preserve semantics; normalize codes/labels through adapters. | HIGH | Verify complete state/action table in G4 quotation/construction slices. |
| WF-012 / LE-031 | Quotation-confirm gate | `exts.confirm`, homeowner quotation confirmation | A confirmation requirement is documented in comments, but the visible `confirm` check is commented out in the Legacy panel. | R1 `TechnicianOrderWorkspacePanel.vue:123-131,198-214,246-260`; no R2/R3 proof of current intended policy. | Do not silently assume the gate. Require an explicit business policy before enabling signing/editing transitions. | Workflow Runtime | Yes, unresolved policy. | Keep as an explicit feature flag/policy decision; do not port commented code. | HIGH evidence / LOW intent | Business-owner decision before G4 signing slice. **UNKNOWN** |
| WF-013 / LE-003, LE-040 | Tenant/customer/role workflow branches | Redacted tenant value, named Home branches, role-specific node paths | Static code contains tenant-specific login and named role/menu/reallocation branches; current active partition is not established. | R1 `loginAuth.vue:276-283,329-336`, `pages/index/index.vue:194-206,803-823`, `serviceAppointments.vue:1824-1843`; R2/R3 do not identify active ownership. | Treat these as external configuration or explicit capability flags; never encode literals in V1 code. | Auth/API Adapter + Workflow configuration | Yes, only if active evidence exists. | Unknown until configuration/business-owner verification; default to no Legacy branch. | MEDIUM | Verify active production/business partition at G3/G4 without copying sensitive values. **UNKNOWN** |
| WF-014 / LE-014, LE-032 | Action label versus transition semantics | Labels “暂不上门”, “上门未成交”, “去下单”, “新增验收” | Buttons and icons are selected by statuses, node types, and fixed form IDs; labels are presentation choices. | R1 `TechnicianWorkflowCommandBar.vue:28-42,120-162,197-231`; A2 contract baseline separates read contract from later writes. | Runtime commands carry stable semantic names; platform/UI layers localize labels and icons. | Workflow Runtime → Presentation | Yes, compatibility labels only. | Drop label-driven branching; preserve named command semantics. | HIGH | Verify localization/product wording at G4, not as API contract. |

## Identity and action policy decisions

The target identity model is intentionally typed and opaque:

```text
WorkflowDefinitionId
WorkflowRunId
WorkflowNodeRuntimeId
FormDefinitionId
FormDataId
SubworkflowRef { parentRunId, defId, runId }
HandlerIdentity = User | Role | OrganizationRole
```

The API Adapter owns conversion to/from current wire fields such as
`handlerIds`, `_id`, `workflowId`, `defId`, and `runId`. The Workflow Runtime
owns relationships, visibility, action preconditions, refresh scope, and
transition intent. No screen may infer identity from array position or from a
display label.

## Fixed exceptions retained

The following six exceptions remain explicit compatibility inputs rather than
being copied as unbounded hardcode:

1. Four reallocation node IDs, retained as opaque metadata pending provenance.
2. Legacy source-index `1` visibility, guarded and not a V1 identity rule.
3. `orgId + '+' + roleId` handler wire encoding, decoded only at the adapter boundary.
4. Separate main/subworkflow `defId` + `runId` refresh semantics.
5. Status transition mappings for `200`, `204`, `203`, `205`, and `206`.
6. Service type `30` acceptance action and the unresolved quotation-confirm policy.

## Remaining UNKNOWN register

| ID | Unknown | Why static evidence is insufficient | Owner gate |
| --- | --- | --- | --- |
| U-WF-01 | Whether reallocation node IDs are backend contract IDs or configurable workflow metadata. | The client only compares literals; no authoritative metadata provenance is present. | G4 guarded reassignment fixture / backend owner |
| U-WF-02 | Whether source-index `1` visibility is intentional business behavior. | It is an array-position exception with no semantic explanation in R2/R3. | G4 workflow fixture |
| U-WF-03 | Handler identity precedence and server authorization for user/role/org-role values. | Legacy membership checks do not prove backend precedence or authorization semantics. | G3 Workflow Runtime contract, then G4 |
| U-WF-04 | Full parent/child `runId` and stale-node invariants. | Existing evidence shows separate fields and refresh calls, but not a non-empty parent-child runtime case. | G3 identity contract, then G4 |
| U-WF-05 | Whether quotation confirmation is an active required gate. | The only evidence is a comment plus a disabled check. | Business owner before G4 signing slice |
| U-WF-06 | Whether tenant/customer/role branches are active V1 requirements. | Static committed source cannot establish current configuration or ownership. | G3/G4 configuration and business verification |

## G2 Architecture Input

- Workflow Runtime owns typed workflow identity, node visibility, action policy, transition intent, subworkflow refresh scope, and explicit compatibility exceptions.
- API Adapter owns endpoint/path differences, wire identifier encoding, status/code normalization, and opaque backend node references.
- Fixed IDs may be retained only as reviewed configuration/metadata with provenance; array indexes, labels, and tenant literals are not architecture.
- Platform-independent workflow semantics stop before native calendar, location, scan, camera, and upload behavior; those remain Platform Adapter responsibilities.
- The target Vue 3 / uni-app architecture, adapter boundary, and Workflow Runtime boundary are safe to choose now.
- `BLOCKS_G2 = 0`; the six UNKNOWNs are implementation/business verification items for G3/G4, not reasons to block G2.
