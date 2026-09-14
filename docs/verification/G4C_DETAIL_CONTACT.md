# G4-C Work Order Detail and Customer Contact

## Evidence checkpoint

This slice used the accepted contracts first, then a targeted read-only review
of R1 at SHA `6ada6b5375324bfcd09ca7c569b96a4ff328173f`:

**REUSE → VERIFY → GAP ANALYSIS → TARGETED RESCAN**

Reviewed evidence included:

- `resources/technician/workOrderDetailReadContract.js`
- `subpackages/serviceAppointment/serviceAppointment.vue`
- `subpackages/serviceAppointment/components/TechnicianWorkOrderSummaryActions.vue`
- `resources/technician/mainWorkOrderListContract.js`
- `resources/js/common.js` and `resources/js/identityContext.js`
- the accepted API, platform, and target-architecture documents in this repository

R1 confirms that the detail read is
`basic/serviceAppointment/queryById/{id}` with `type=query`. The response
contains a service-appointment record plus workflow material. The summary
displays `orderNum`, `name`, and `address`. Its contact action directly calls
the service-appointment phone when present; the no-phone branch requests an
intermediate number through a separate helper.

## Bounded V1 detail model

The API Adapter maps only these evidence-backed semantic values:

| Shared value | Evidence-backed source | Decision |
| --- | --- | --- |
| `id` | service-appointment `_id` | Existing `WorkOrderId` contract retained. |
| `workflowRunId` | service-appointment/workflow run identity | Existing optional workflow identity retained; workflow-node records remain adapter-internal. |
| `displayNumber` | service-appointment `orderNum` | Added for useful detail identification. |
| `taskLabel` | service-appointment `status` + adapter-owned `code/query` status labels | Added as the same normalized status/task label used by the frozen list; raw status codes never leave the adapter. |
| `serviceDistrict` | service-appointment `district` + accepted county dictionary | Added for the detail summary location line; unmapped codes are omitted. |
| `customerName` | service-appointment `name` | Added because the Legacy summary labels and displays it as customer name. |
| `serviceAddress` | service-appointment `address` | Added because the Legacy summary displays the service address. |
| `distanceText` | service-appointment `exts.distance` | Added as a display-ready read value when the backend supplies a finite non-negative distance; no client-side location calculation. |
| `contact.contactRef` | first service-appointment `contactIds` entry | Added as an optional opaque `CustomerContactId`; it is never treated as `UserId` and is not required for direct dialing. |
| `contact.normalizedPhone` | service-appointment `phone`, trimmed at the adapter boundary | In-memory action input only; it is not persisted, logged, or placed in a route. |
| `contact.displayMask` | the evidenced `3 + 4 masked + 4` phone presentation pattern | Only the masked value is rendered; non-matching phone formats are not rendered. |

Raw status/state codes, `exts`, workflow nodes, node definitions, appointment
data, and backend envelopes are not part of the shared detail model. Status
labels are read through the adapter-owned code table, matching the list model;
an unknown code is omitted rather than guessed. Missing or unauthorized-detail
fallback behavior remains UNKNOWN and is surfaced as a normalized read failure
by the adapter.

The adapter accepts the R1-shaped detail envelope (`data.serviceAppointment`,
`data.workflow`, and `data.workflowNode`) as well as the narrow fixture shape
used by earlier tests. Only the service-appointment subject and optional
workflow-run identity are normalized; workflow-node and node-definition data
are deliberately not rendered by D1.

The page fetches only the detail subject. It does not load workflow, form,
appointment, order, contract, activity, or contact-maintenance domains. The
visible information card is an explicit read-only set of verified fields, not
a generic backend key/value dump.

## Customer contact decision

G4-C includes a direct-phone contact command whenever a detail phone is
available. This preserves the observed R1 detail action: `phone` is the direct
call input, while `contactIds` belongs to the no-phone intermediate-number
branch. An opaque contact reference is included in the semantic command when
available, but is not a precondition for direct dialing. The page does not
render the full phone number; it renders the evidenced masked form when the
number has the supported shape and an intentional contact action.

The R1 no-phone branch uses `getMiddleNumberBySid` and a relay/private-number
result. Its exact contract, authorization, and cross-target behavior are not
accepted, so G4-C does not reproduce it. `relay/private-number = UNKNOWN` and
is deferred to a separately verified contact policy.

`PhonePort` is the only feature-facing contact boundary. The thin uni-app
driver owns `uni.makePhoneCall` and normalizes success, cancellation,
unsupported, unavailable, and retryable outcomes. No automated test invokes a
real dialer. MP/Android/iOS source composition is shared; device/runtime
parity and native behavior remain G5 verification prerequisites.

No contact edit, upsert, note, group-binding, appointment, or workflow write is
implemented.

## Detail Interaction Rule

The pinned `xlink-business-3.0` Web reference at
`06b885ed22477e79d50bc6f3a0ce0c96fbc1a185` is accepted as an interaction and
information-architecture reference only. Its structure separates:

`Detail Summary / Quick Actions` → `WorkflowStepRail` →
`ProjectCurrentTaskCard` → `ProjectTaskActionSheet` → `DetailTabbedSection`.

The new Technician App adopts the following durable rule:

- information regions and future information Tabs are read-oriented surfaces
  for Work Order, customer, records, materials, and other information;
- dynamic workflow/current-task actions must never be modeled as dynamic
  information Tabs;
- current workflow/business actions belong to an independent Current Action /
  Current Task surface, with primary and optional secondary actions;
- action execution opens a dedicated sheet, modal, or page owned by that action
  surface;
- the G4-C Quick Actions row is inside the Summary card but remains a distinct
  action region outside the read-only information card and rows;
- the current Summary action row presents the evidence-shaped actions `联系客户`,
  `客户资料`, `记录跟进`, and `导航`; only direct phone contact executes in D1,
  while the other actions provide explicit deferred feedback until their
  corresponding read/platform contracts are verified;
- G4-C does not implement Workflow Runtime actions, workflow execution, or
  Appointment behavior.

This is an interaction boundary decision, not a copy of the R2 React
implementation.

## Remaining unknowns and gate assessment

- accepted semantic status vocabulary and status-label source;
- nullability and unauthorized behavior of `queryById`;
- relay/private-number wire contract and policy;
- whether a phone action is required for every target and selected V1 flow;
- runtime/device permission behavior for App and MP phone actions;
- whether more detail fields are required by a later Appointment slice.

These unknowns do not require a shared-contract or dependency-direction
change for G4-C. `BLOCKS_G4-D = 0` for the foundation of the next slice, while
release-level phone parity and any relay behavior remain explicitly gated by
later verification.

## Safety

- No live beta detail read was run because approved credentials/configuration
  were not available.
- No production call, customer call, backend mutation, or credential access
  occurred.
- Reference repositories were read-only.
