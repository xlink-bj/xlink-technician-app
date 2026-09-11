# G4-B Work Order Data Fidelity

## Status and method

This note records the semantic-data correction for the G4-UX Work Order List.
It does not redesign the List UI or add a new business capability.

Evidence was evaluated in this order:

**REUSE → VERIFY → GAP ANALYSIS → TARGETED RESCAN**

The accepted Beta observation `A2-20260910-beta-read-01` confirms the Work Order
list read envelope, paging fields, normal empty-page behavior, and two returned
rows. The sanitized Beta record deliberately does not retain row values or
customer data, so row-field business meaning is taken from the pinned R1
contract and call sites, not inferred from R2 visuals.

Pinned R1 evidence:

- `resources/technician/mainWorkOrderListContract.js`
- `pages/serviceAppointment/serviceAppointments.vue`
- `resources/js/common.js` (`getSAMenu`)
- `resources/js/identityContext.js`

R1's `normalizeMainWorkOrderRow` puts both SANode and ordinary service-
appointment rows under `data`. For SANode, `data` is the nested service-
appointment payload. For ordinary mode, `data` is the row payload (or the
service-appointment payload copied below a current workflow node). R1 list
rendering uses `data._id`, `data.orderNum`, `data.name`, `data.address`, and
selected optional fields from `data.exts`.

## Field matrix

`SANode path` and `ordinary path` below are raw adapter inputs. They must not
appear in shared feature/UI contracts.

| Candidate field | Classification | SANode raw source → path | Ordinary raw source → path | Evidence and semantic meaning | Nullability / final decision |
| --- | --- | --- | --- | --- | --- |
| WorkOrderId | `VERIFIED_STABLE` | `data._id` | row `_id`, normalized as `data._id` | R1 normalizer and detail read identify the service appointment `_id` as the business work-order identity. The SANode wrapper `_id` is a workflow-node identity and is excluded. | Required for a row; mapping fails if absent. Accepted as `WorkOrderId`. |
| Display/order number | `VERIFIED_STABLE` | `data.orderNum` | row `orderNum`, normalized as `data.orderNum` | R1 list displays the order number and the detail contract reads the same service-appointment `orderNum`. | Source is used by the observed list, but Beta nullability was not retained; shared field is optional. Accepted as `displayNumber`. |
| Work-order/task title | `RAW_PRESENT_SEMANTICS_UNCLEAR` | raw `data.title` may be searchable, but R1 normalized list rendering does not establish it as a task title | raw `title` may be searchable; `name` is rendered as customer information | R1's `name` is the customer display value, not a proven task title. R2 visual text is not business evidence. | Omitted from the new summary; no mock title is invented. |
| Task/work type | `RAW_PRESENT_SEMANTICS_UNCLEAR` | `data.serviceType` | row `serviceType` | The raw code is observed and affects Legacy icon branches, but a stable semantic label/provider for this list is not accepted. | Raw code and icon policy omitted; defer to a bounded domain decision. |
| Service category | `RAW_PRESENT_SEMANTICS_UNCLEAR` | `data.serviceType` and related code lookup | row `serviceType` and related code lookup | Field presence is evidenced, but code meaning and cross-role label resolution are not sufficient for a shared list model. | Omitted; no raw status/type code crosses the port. |
| Customer name | `VERIFIED_STABLE` | `data.name` | row `name`, normalized as `data.name` | R1 renders `data.name` in the customer/person section; G4-C independently accepted the same semantic `customerName` from Detail. | Optional because the R1 UI tolerates an absent/empty display value. Accepted as `customerName`. |
| Service address | `VERIFIED_STABLE` | `data.address` | row `address`, normalized as `data.address` | R1 renders address with optional district context; G4-C independently accepted the service-appointment `address` meaning. | Optional; accepted as `serviceAddress`. |
| District / area | `RAW_PRESENT_SEMANTICS_UNCLEAR` | `data.district`, `data.area[]` | row `district`, `area[]` | District requires area-code lookup and `area[]` is a location hierarchy, not a display-ready semantic string in the accepted port. | Omitted; no area lookup or raw code is added to G4-B. |
| Workflow/current-task label | `RAW_PRESENT_SEMANTICS_UNCLEAR` | wrapper `nodeDef.*`, node `state`, nested `data.*` | optional workflow-node wrapper plus row data | Node identity/category and current-task visibility belong to the Workflow Runtime; the list must not expose node metadata or infer labels from it. | Omitted; defer to Workflow Runtime / later slice evidence. |
| Semantic status | `RAW_PRESENT_SEMANTICS_UNCLEAR` | `data.status` plus wrapper `state` | row `status` | R1 displays a code-table label and applies numeric status policies, but the normalized V1 status vocabulary and precedence are not accepted. | Omitted; raw `status`/`state` never reaches shared models. |
| Priority | `RAW_PRESENT_SEMANTICS_UNCLEAR` | possible `data.priority` | possible row `priority` | R1 proves priority can affect query ordering, not that it is a stable row display meaning for this V1 list. | Omitted; no priority sorting/filtering is exposed. |
| Appointment/time summary | `VERIFIED_OPTIONAL` | `data.exts.applyTimeStr` or `data.applyTime` | row `exts.applyTimeStr` or `applyTime` | R1 conditionally renders an appointment time for selected status ranges. Exact status gating and target date representation are not part of the accepted summary. | Kept as a later candidate, not added to this contract. G4-D owns appointment evidence. |
| Contact availability | `RAW_PRESENT_SEMANTICS_UNCLEAR` | `data.phone`, `data.contactIds`, plus status/role policy | row `phone`, `contactIds`, plus status/role policy | Raw contact fields exist, but list action eligibility depends on unaccepted status/role policy. G4-C accepted direct dialing in Detail only. | Omitted from G4-B; no list quick action is added. |
| Distance | `NOT_AVAILABLE` | client-derived from `data.gpsPoint` and current device location | same | R1 computes distance after the list response; it is not a stable backend row field and requires a platform location capability. | Omitted; no location call or distance value is mocked. |
| Nearby-customer concept | `NOT_AVAILABLE` | derived from GPS and separate nearby/community reads | same | R1 exposes a convenience action backed by additional reads/location context, not a core Work Order summary field. | Omitted; no nearby query or card is added. |
| Phone/list quick-action eligibility | `RAW_PRESENT_SEMANTICS_UNCLEAR` | raw phone/contact plus raw status/node/role conditions | same | R1 button visibility is a Legacy policy combination, not an accepted normalized capability contract. | Omitted; contact actions remain outside this list correction. |

## Accepted summary contract

The previous summary exposed only `id` and an unverified `title` derived from
raw `name`. The corrected contract is intentionally still small:

```ts
interface WorkOrderSummary {
  readonly id: WorkOrderId
  readonly displayNumber?: string
  readonly customerName?: string
  readonly serviceAddress?: string
}
```

`WorkOrderDetail` already exposes the same three optional business fields, so
the accepted mock List → Detail journey can be checked for semantic agreement.
No raw code, workflow-node identifier, node metadata, handler URL, or backend
envelope is exposed.

## Adapter normalization

The API Adapter continues to select the role-visible mode internally:

- SANode response: unwrap `node.data`, then map the nested service-appointment
  `_id`, `orderNum`, `name`, and `address`.
- Ordinary response: map the service-appointment row `_id`, `orderNum`, `name`,
  and `address` directly.

Both paths produce the same `WorkOrderSummary` semantics. The SANode wrapper
`_id`, `state`, and `nodeDef` are discarded at this boundary.

## Mock dataset and consistency

The DATA scenario remains role-scoped SANode data with three synthetic rows.
The raw fixtures contain backend-shaped `orderNum`, `name`, `address`,
`serviceType`, and `status` fields, while the adapter emits only the accepted
semantic summary. The records intentionally include:

- short and long synthetic display numbers/customer/address values;
- two raw service-type values retained only to exercise backend-shaped input;
- one row without an address to prove optional-field handling;
- no invented task title and no unverified semantic status variation.

All three SANode WorkOrderIds have local raw Detail fixtures. Each Detail
fixture reuses the same display number, customer name, and optional address as
the List fixture and is passed through the same API Adapter mapping. The
ordinary raw list also uses the first two service-appointment records to prove
ordinary normalization.

The EMPTY scenario remains deterministic and local. It does not fall through
to the real backend. Synthetic IDs remain locally owned in every mock mode and
never reach `uni.request`.

## Verification and safety

- Added SANode and ordinary enriched normalization coverage.
- Added optional-field and List → Detail consistency coverage for every
  synthetic WorkOrderId.
- Added raw-code/UI-alias isolation and fixture-sanitization assertions.
- No additional Beta or production network call was made for this correction.
- No mutation, customer call, credential, dependency, or reference-repository
  write was introduced.
