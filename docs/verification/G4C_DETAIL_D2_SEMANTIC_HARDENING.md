# G4-UX Detail D2 Semantic Hardening

Status: engineering/data hardening for the accepted Detail visual shell. This
note does not redesign Detail, implement G4-D, or authorize workflow writes.

## Evidence checkpoint

Method: **REUSE → VERIFY → GAP ANALYSIS → TARGETED RESCAN**.

The targeted scan reused the accepted R1 evidence at
`xlink-business-jishi-3.0@6ada6b5375324bfcd09ca7c569b96a4ff328173f`, the
accepted G4-B/G4-C notes, and the existing Workflow Runtime contracts. R1
confirms that the Detail read returns `serviceAppointment`, `workflow`, and
`workflowNode`, and that workflow nodes carry raw `state` and `nodeDef` data.
The D2 slice did not yet establish a portable current-task/progress/action
read contract; D3 adds only the narrower current-task projection described in
the D3 scenario matrix.

## Mock/real convergence

All Mock Detail scenarios are backend-shaped `serviceAppointment` responses
with the same optional `workflow`, `workflowNode`, `status`, `describe`, and
`exts` fields observed in R1. They enter `TechnicianApiReadAdapter` through the
same `workOrderDetail` mapper as a real response. No feature or page code
branches on a WorkOrderId prefix.

The bounded fixture set contains six Detail reads while the accepted List
visual density remains three rows:

| Scenario | Raw evidence exercised |
| --- | --- |
| 001 | service appointment, status, nested repair path, distance, contact, workflow node |
| 002 | service appointment, status, workflow node, long customer/address values |
| 003 | early status, district/address, workflow node |
| 004 | status, `describe`, numeric/string distance, `exts.applyTimeStr`, two workflow nodes |
| 005 | status, `describe`, contact, workflow node |
| 006 | unknown status and absent optional customer/address/appointment fields |

`nodeDef`, raw `state`, `describe`, `applyTimeStr`, and raw status never cross
the shared Detail port. `workflowNode` is converted by the adapter into typed
node metadata for the existing Workflow Runtime; the page receives only the
runtime's bounded projection. Unknown status and missing optional values are
omitted rather than replaced with labels or fallback business content.

## Workflow and Current Task read model

No accepted source currently proves stable progress ordering/position or a
write authorization model. R1 provides the node visibility contract, and D3
reuses that rule through the existing Workflow Runtime rather than creating a
second policy engine. Array order, status labels, screenshots, menu positions,
and former hard-coded status task templates are not used as Current Task
identity.

D3's Workflow Runtime still exposes an action-capability candidate only when
exactly one normalized, visible, active node has a supported semantic action
intent. When exactly one candidate exists, the feature layer exposes its
normalized display name as the Current Task title and adds a small
presentation mapping for CTA label/tone. When zero or multiple candidates
exist, the card is absent; no array-order tie-break is allowed. Runtime domain
policy and current-slice execution authorization remain separate: the
projection may report `allowed`, while the UI CTA remains disabled and no
workflow command is sent. Raw status remains private to the adapter as the
ordinary `taskLabel` field only. Progress remains deferred, and the
Product-Owner decision to remove Task Context remains in force.

## Appointment and follow-up disposition

R1 conditionally renders `exts.applyTimeStr`, so its raw presence is retained
in representative fixtures. Exact appointment semantics and state gating are
not accepted for this slice; the field is not promoted into the Detail model.
G4-D owns the appointment evidence checkpoint and any later read-only model.
No appointment or workflow mutation is implemented.

R1 exposes `biz/action/query.do`, and R2 establishes the read-only action-row
shape and newest-first ordering used here. After the service-appointment
detail read, the adapter performs the companion action read with
`bizType=serviceAppointment`, the Work Order id, and action types `1,2,3,4,5,6`.
The adapter maps only supported action rows into title/content/owner/time and
the R2-aligned icon/tone/badge presentation fields. A missing, unsuccessful,
or empty action response leaves the detail successful with a truthful empty
state. No follow-up write is introduced.

## Service-part disposition

The follow-up implementation now uses the verified R1 mechanism: read
`exts.leakagesite_copy`, take the first value from each path, load the
tenant-scoped `repairParts` cascade through
`i/code/selectMultistageCode.do`, and resolve its `value/name` entries inside
the shared Technician API Adapter. List and Detail therefore use the same
normalization. A missing cascade entry omits the optional label; it does not
fabricate a direct code-to-label map.

## Quick-action capability boundary

| Action | Classification | Current behavior |
| --- | --- | --- |
| 联系 | `VERIFIED_EXECUTABLE` | Calls the existing in-memory normalized phone capability when available. |
| 资料 | `VERIFIED_LOCAL_READ_NAVIGATION` | Selects the read-only Customer tab. |
| 跟进 | `VERIFIED_LOCAL_READ_NAVIGATION` | Selects the read-only Follow-up tab. |
| 导航 | `UNSUPPORTED` | Displays a bounded explanation; no map capability is called. |
| Current Task primary | `READ_ONLY_PROJECTION` | Rendered only for one Runtime-approved candidate; CTA is disabled and non-mutating. |
| Task Context secondary | `UNSUPPORTED` | Omitted per the accepted Product-Owner Detail direction. |

## Safety

- No production or Beta call was made.
- No appointment/workflow/backend mutation was made.
- No credentials or customer PII were added.
- Reference repositories were read-only.
- No dependency or G4-D work was introduced.
