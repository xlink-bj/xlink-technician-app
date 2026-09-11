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
| `workflowRunId` | service-appointment/workflow run identity | Existing optional workflow identity retained. |
| `displayNumber` | service-appointment `orderNum` | Added for useful detail identification. |
| `customerName` | service-appointment `name` | Added because the Legacy summary labels and displays it as customer name. |
| `serviceAddress` | service-appointment `address` | Added because the Legacy summary displays the service address. |
| `contact.contactRef` | first service-appointment `contactIds` entry | Added as an opaque `CustomerContactId`; it is never treated as `UserId`. |
| `contact.normalizedPhone` | service-appointment `phone`, trimmed at the adapter boundary | In-memory action input only; it is not persisted, logged, or placed in a route. |
| `contact.displayMask` | the evidenced `3 + 4 masked + 4` phone presentation pattern | Only the masked value is rendered; non-matching phone formats are not rendered. |

Raw status/state codes, `exts`, workflow nodes, node definitions, appointment
data, and backend envelopes are not part of the shared detail model. A usable
status label requires an accepted code-label mapping and display policy, so it
remains an explicit follow-up rather than a guessed status vocabulary. Missing
or unauthorized-detail fallback behavior also remains UNKNOWN and is surfaced
as a normalized read failure by the adapter.

The page fetches only the detail subject. It does not load workflow, form,
appointment, order, contract, activity, or contact-maintenance domains.

## Customer contact decision

G4-C includes a direct-phone contact command when both an opaque contact
reference and a detail phone are available. This preserves the observed R1
detail action without exposing Legacy call helpers to the feature. The page
does not render the full phone number; it renders the evidenced masked form
when the number has the supported shape and an intentional contact action.

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
