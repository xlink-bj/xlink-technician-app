# G4-D0 Accept → Contact → Appointment Evidence

Status: evidence checkpoint only. No G4-D implementation is included.

Repository: `xlink-bj/xlink-technician-app`
Branch: `rebuild/g4d-appointment`
Starting HEAD: `7388143e098213fb1a39d5357ee58ab5ff0687d8`
R1 authority: `/Users/yesun/Code/xlink-business-jishi-3.0`, pinned at
`6ada6b5375324bfcd09ca7c569b96a4ff328173f`
R2 reference: pinned UX/IA reference only; not used as business or API
authority.

This document contains sanitized repository evidence. It does not persist
production payloads, identifiers, phone numbers, customer data, addresses,
session values, or tokens.

## R1 business chain

The verified R1 technician sequence is:

`待接单 → 接单 → 工单详情 → 联系客户 / 沟通 → 预约上门时间 → 上门 / 勘察`

The chain is not a status-label-only state machine. The first decision point is
a runtime workflow node. R1 list UI exposes the accept/reject controls only
when the current item is an active, assigned `accept` node and the current
actor matches the node's handler evidence:

| Step | R1 evidence | Result |
| --- | --- | --- |
| Pre-accept | `pages/serviceAppointment/serviceAppointments.vue:499-531` | `state == 0`, `nodeDef.nodeType == 'accept'`, and handler match are required for 接单 / 拒绝. |
| Accept | same page, `:2042-2088` | A pre-check may show confirmation; the mutation itself is `workflow/process`. |
| Detail read | `subpackages/serviceAppointment/serviceAppointment.vue:2635-2693`; `resources/technician/workOrderDetailReadContract.js` | Detail is read with `basic/serviceAppointment/queryById/<id>` and workflow nodes are then visibility-filtered. |
| Contact | `subpackages/serviceAppointment/components/TechnicianWorkOrderSummaryActions.vue:97-115,205-215`; detail page `:2521-2526,5427-5447` | Direct phone data uses a direct phone branch; fallback requests a middle number before dialing. |
| Appointment | detail page `:3466-3589,3682-4042,4096-4210`; `resources/technician/workOrderFormReadContract.js` | Dynamic form definition/data are read, form data is upserted, and submission can process the active workflow node. |

R1 detail visibility deliberately filters `accept`, `allot`, and `dispatch`
nodes from the normal detail-node list. The old source-index-1 inclusion
exception is recorded as a legacy quirk in
`resources/technician/workflowNodeVisibilityContract.js`; it is not a valid
identity or visibility rule for the new app.

## Accept Order

### Action identity and eligibility

The semantic action is **accept_order** at the product boundary, backed by the
R1 generic workflow processing operation. Eligibility is not inferred from a
status label or list position. R1 requires all of the following:

1. the workflow item is in `state == 0`;
2. its declared node type is `accept`;
3. handler evidence matches the current user, current role, or the verified
   organization-role composite used by R1.

The new app must receive these as normalized command inputs and must not expose
raw `nodeDef`, numeric state, handler composites, or array indexes to the page.

### API and required IDs

R1 first calls:

```text
basic/serviceAppointment/selfExamination
```

with the service-appointment/work-order ID. A non-empty response opens an
accept confirmation; an empty response proceeds immediately. The exact
business meaning of every returned pre-check item is not established by the
frontend evidence.

The primary accept operation is:

```text
workflow/process
{
  sid: <service-appointment-id>,
  workflowNodeId: <accept-runtime-node-id>,
  smodule: "serviceAppointment"
}
```

The two required identity values are therefore the service-appointment
business ID and the accept workflow runtime-node ID. The source passes the
module discriminator as shown. The accept UI does not send the whole raw row
as command identity.

### Post-success behavior

The R1 list callback clears the map region, resets the page, reloads the list,
and refreshes the function count. This proves refresh requirements for the
list surface. It does not prove the exact backend values of the resulting
service-appointment status, assignee/handler state, next workflow node, or
whether every detail/contact gate changes immediately after success. Those
must be verified before implementation.

## Contact

R1 provides two contact paths from the detail summary:

- when the service appointment has a direct phone value, the component emits
  it and the page calls the platform phone API;
- otherwise the page calls
  `basic/winnerlook/getMiddleNumberBySid` with the service-appointment ID,
  receives a temporary/middle phone value, and then calls the platform phone
  API.

The fallback path is not a second business status transition. It is a contact
number lookup followed by a platform capability. R1 frontend evidence does not
establish a complete post-accept authorization matrix for direct versus middle
number contact, so G4-D must keep contact authorization separate from the
phone execution adapter and verify the gate with backend evidence.

The current new app correctly remains read-only and does not invent a relay
endpoint. Its current Contact capability is not evidence that a future
acceptance mutation has succeeded.

## Appointment

### Source field and read path

R1 displays and filters the appointment summary using
`serviceAppointment.exts.applyTimeStr`, with `serviceAppointment.applyTime` as
a display fallback in the list. The schedule surface also queries and parses
`exts.applyTimeStr`. This establishes a stable observed read/display field for
the legacy UI, but does not establish whether it is the canonical write source
or a derived projection. Timezone, locale, and server/client ownership are
also not proven.

### Form and write path

The appointment workflow form is identified in the R1 command-bar and detail
code by form definition ID `2522989775781119510`.

The form definition read is:

```text
biz/extField/query
{
  extId: <appointment-form-definition-id>,
  sortField: "order",
  sortOrder: "asc",
  "is:state|integer#and": 1,
  _all: "1"
}
```

Existing form data is read through `biz/extForm/query/<formDefId>` with the
form-data ID. R1 then builds a form payload containing the service appointment
ID, workflow/run and runtime-node references, form definition ID, and form
values, and saves it through:

```text
biz/extForm/upsert/<appointment-form-definition-id>
{ dataStr: <serialized-form-payload> }
```

The code explicitly uses appointment fields named `need`, `datetime`, and
`note` for the appointment UI and local calendar reminder. It also performs
generic required-field and field-type validation based on the returned form
definition. These names are observed R1 evidence, not a complete appointment
schema.

When the form is submitted rather than saved-only, R1 then calls:

```text
workflow/process
{
  workflowNodeId: <active-runtime-node-id>,
  nodeFormDefId: <appointment-form-definition-id>,
  nodeFormDataId: <saved-form-data-id>,
  smodule: "serviceAppointment",
  sid: <service-appointment-id>
}
```

This proves the frontend sequence **upsert form data → process the active
workflow node**. It does not prove the resulting status, next node, appointment
write invariants, duplicate behavior, or server-side validation. The phone
calendar call in R1 is a local reminder side effect and is not an appointment
backend mutation.

## Reject

Reject is part of the same pre-accept decision point and requires a non-empty
reason. R1 selects one of two operations from the node's `rejectMode`:

- `basic/serviceAppointment/handleRefused` with service-appointment ID and
  remark;
- `workflow/rollbackWorkflow` with service-appointment ID, runtime-node ID,
  remark, and `smodule: "serviceAppointment"`.

The exact resulting business state and whether the action belongs in the
minimum G4-D slice are not verified. **Implementation: DEFERRED. Resulting
state: UNKNOWN.** Do not port `rejectMode` as raw page policy.

## Reschedule

R1 proves appointment display/filtering and initial form submission, but no
stable, separate reschedule command, cancellation command, allowed-state
matrix, or server-side time-window rule was established in this checkpoint.

**Implementation: DEFERRED. Semantics: UNKNOWN.** The local calendar reminder
is not evidence of backend rescheduling.

## Current new-app gaps

The accepted G4-UX baseline intentionally contains a read-only projection:

- List and Detail use typed read ports and an API Adapter;
- Detail Current Task selection is Workflow Runtime-driven and uses a bounded
  semantic action intent;
- workflow execution is `disabled_read_only`;
- Contact is a read-only platform capability;
- no Accept Order, appointment form write, workflow transition, or calendar
  mutation port exists.

The minimum gaps for G4-D are:

1. a pre-accept List projection that normalizes the active `accept` node and
   exposes Accept Order eligibility without raw workflow fields;
2. a mutation port/command boundary for the self-examination gate and accept
   workflow process, with duplicate protection and refresh/invalidation;
3. a verified post-accept read projection for Detail, Contact, and the next
   appointment-capable task;
4. a typed appointment form-definition/data read model and a guarded
   form-save + workflow-process command;
5. backend-confirmed result/state/validation evidence before enabling writes.

No R2 visual behavior is being promoted to fill these gaps.

## Minimum G4-D implementation recommendation

After the blockers below are resolved, the smallest coherent implementation is:

`pre-accept List → guarded Accept Order → refresh/read Detail → Contact → read and submit Appointment form`

The implementation should have separate layers:

- normalized read data and command inputs in the Adapter/application boundary;
- domain eligibility and semantic action policy in the existing Workflow
  Runtime or a narrowly extended command policy;
- mutation execution in explicit API command ports;
- refresh/invalidation after every successful mutation;
- platform phone/calendar behavior outside the workflow Runtime.

Reject, reschedule/cancel, and local calendar reminder should remain outside
the first slice unless the missing evidence makes one a release requirement.

## Blocking unknowns

`G4_D_IMPLEMENTATION_READY = NO` because the following are true implementation
blockers, not cosmetic unknowns:

1. the backend result contract for `workflow/process` after Accept Order is not
   verified: resulting service-appointment status, handler ownership, next
   node, and refresh-consistency behavior are unknown;
2. the appointment backend contract is only partially evidenced: the exact
   required appointment fields, server-side validation/time rules, canonical
   persistence of `applyTimeStr`, and post-submit workflow result are unknown;
3. the post-accept authorization rule for direct/middle-number contact and the
   exact Detail/Contact eligibility boundary are not fully verified.

These must be answered from R1/backend evidence or an explicitly authorized
sanitized read-only verification before mutation implementation. No live
mutation endpoint was called in this checkpoint.

## Checkpoint conclusion

### STARTING HEAD

`7388143e098213fb1a39d5357ee58ab5ff0687d8`

### NEW HEAD

The documentation-only commit is recorded after this file is added.

### R1 BUSINESS CHAIN

`待接单 → 接单 → 工单详情 → 联系客户 / 沟通 → 预约上门时间 → 上门 / 勘察`

### ACCEPT ORDER

- action identity: semantic `accept_order`, implemented in R1 by `workflow/process`;
- required IDs: service-appointment ID + accept runtime-node ID;
- pre-check: `basic/serviceAppointment/selfExamination`;
- authorization: active `accept` node plus matching user/role/organization-role handler evidence;
- post-success: list and function-count refresh verified; exact business/workflow result remains unknown.

### APPOINTMENT

- source/read field: observed `exts.applyTimeStr`, with `applyTime` display fallback;
- form: definition `2522989775781119510`, fields including `need`, `datetime`, `note`;
- write sequence: `biz/extForm/upsert/<formDefId>` then `workflow/process`;
- local calendar reminder: observed, not a backend appointment mutation;
- resulting workflow/status semantics: not fully verified.

### REJECT

Required reason is verified; implementation deferred and resulting state unknown.

### RESCHEDULE

Deferred; no stable command or validation contract verified.

### CURRENT NEW-APP GAPS

Pre-accept command surface, mutation ports, post-accept refresh/eligibility, and
typed appointment form write path are not implemented by design.

### MINIMUM G4-D IMPLEMENTATION

Guarded Accept Order followed by verified post-accept Detail/Contact and
appointment form submission, with explicit read/write boundaries.

### BLOCKING UNKNOWNS

Accept result state, appointment validation/canonical persistence/post-submit
workflow result, and post-accept contact authorization.

### SOURCE CHANGES

NONE. This checkpoint adds documentation only.

### TEST CHANGES

NONE. No product source or test files were changed.

### LIVE BUSINESS MUTATIONS

NONE. No real order was accepted, no appointment was set, and no customer was
called.

### G4-E STARTED

NO.

### G4_D_IMPLEMENTATION_READY

`NO`
