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
It does not establish a portable current-task/progress/action read contract.

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

`workflowNode`, `nodeDef`, raw `state`, `describe`, `applyTimeStr`, and raw
status never cross the shared Detail port. The adapter emits only the
accepted normalized fields. Unknown status and missing optional values are
omitted rather than replaced with labels or fallback business content.

## Workflow and Current Task read model

No accepted source currently proves all of the following together: progress
ordering/position, current-node identity, task description/context, action
identity, action label, and action availability. In particular, the R1
visibility contract is a node filtering rule; it is not a portable Detail
progress model. Array order, status labels, screenshots, menu positions, and
the former hard-coded workflow template are not used as substitutes.

Therefore the unverified Workflow Progress, Current Task, and dynamic
follow-up blocks collapse in the current Detail page. The previous
Product-Owner decision to remove the Task Context card remains in force; it is
not reintroduced by this engineering hardening. The status code label remains
available only as the already accepted normalized status field in the
read-only Order tab; it is not treated as a current action.

## Appointment and follow-up disposition

R1 conditionally renders `exts.applyTimeStr`, so its raw presence is retained
in representative fixtures. Exact appointment semantics and state gating are
not accepted for this slice; the field is not promoted into the Detail model.
G4-D owns the appointment evidence checkpoint and any later read-only model.
No appointment or workflow mutation is implemented.

R1 exposes `biz/action/query.do`, but the accepted evidence does not yet
define a stable, normalized follow-up response/order contract. Follow-up data
is deferred and the page shows a truthful empty state. No follow-up write is
introduced.

## Service-part disposition

R1 proves that `exts.leakagesite_copy` is a nested path resolved through the
tenant-scoped `repairParts` cascade. The complete cascade response and the
meaning of the first path element are not verified. The former synthetic
`repair-part-code-001 → 屋面` production mapping is removed. The optional UI
slot remains structurally available for a later accepted dictionary resolver,
but the current adapter emits no service-part label.

## Quick-action capability boundary

| Action | Classification | Current behavior |
| --- | --- | --- |
| 联系 | `VERIFIED_EXECUTABLE` | Calls the existing in-memory normalized phone capability when available. |
| 资料 | `VERIFIED_LOCAL_READ_NAVIGATION` | Selects the read-only Customer tab. |
| 跟进 | `VERIFIED_LOCAL_READ_NAVIGATION` | Selects the read-only Follow-up tab. |
| 导航 | `UNSUPPORTED` | Displays a bounded explanation; no map capability is called. |
| Current Task primary | `UNSUPPORTED` | No action is rendered without an accepted semantic source. |
| Task Context secondary | `UNSUPPORTED` | Omitted per the accepted Product-Owner Detail direction. |

## Safety

- No production or Beta call was made.
- No appointment/workflow/backend mutation was made.
- No credentials or customer PII were added.
- Reference repositories were read-only.
- No dependency or G4-D work was introduced.
