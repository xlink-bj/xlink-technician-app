# G4-UX Work Order List Semantic Unlock Proposal

Status: evidence and contract-design proposal only. No List v5 UI, shared
contract, adapter, mock runtime, dependency, backend, or G4-D implementation
is included.

Branch: `rebuild/g4-ux-production-baseline`

Proposal baseline: `3af2eac2d899daf280c17fc889cbb5a95cd4a647`

Method:

**REUSE → VERIFY → GAP ANALYSIS → TARGETED RESCAN**

Business-semantic authority is R1, accepted G1/G4 evidence, and the current
Technician adapter/contracts. R2 is used only as a visual/interaction
reference; it does not authorize new business fields, statuses, filters, tabs,
counts, or navigation destinations.

## Evidence checkpoint

### Pinned sources reviewed

- R1 `xlink-business-jishi-3.0` at
  `6ada6b5375324bfcd09ca7c569b96a4ff328173f`:
  `resources/technician/mainWorkOrderListContract.js`,
  `pages/serviceAppointment/serviceAppointments.vue`,
  `resources/js/common.js`, and `resources/js/identityContext.js`.
- Accepted new-App evidence:
  `docs/discovery/API_CONTRACT_BASELINE.md`,
  `docs/discovery/API_EVIDENCE_TRACEABILITY.md`,
  `docs/discovery/API_P0_READ_VERIFICATION.md`,
  `docs/verification/G4B_AU02_WORK_ORDER_LIST.md`, and
  `docs/verification/G4B_WORK_ORDER_DATA_FIDELITY.md`.
- Current new-App boundary:
  `src/shared/ports/api.ts` and `src/adapters/api/technician-api.ts`.

R1 confirms that both SANode and ordinary list rows are normalized below
`data` by the Legacy list contract. SANode uses `node.data` for the business
service appointment; ordinary rows use the row payload as `data` (or attach it
below a workflow-node wrapper). The business Work Order identity is therefore
the nested/normalized service-appointment `_id`, not a workflow-node `_id`.

The current new App already preserves the important accepted fields:
`displayNumber`, `customerName`, and `serviceAddress`. They are not removal
candidates and need no contract extension from this proposal.

## Priority candidate verification

| Candidate | Exact raw shape observed | SANode mode | Ordinary mode | Optionality / nullability | Stable display meaning | Existing code → label mapping | Role/menu/workflow dependence | Classification | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Task/status label | `data.status` is consumed as a scalar that may be string-like or numeric; workflow wrapper also has `item.state`. | `node.data.status`; wrapper `state` influences styling and action conditions. | `row.status`; ordinary normalization places it below `data`. | List can render an empty label when the status code has no label. | A current service-appointment status label is evidenced, but task identity and lifecycle semantics are not yet a bounded shared vocabulary. | `codelabel('select', 'status', item.data.status)` exists; numeric comparisons also gate parts of the Legacy card. | Status filtering comes from the selected role-visible function; `state` and workflow-node mode affect behavior. | `VERIFIED_SUPPORTED_BUT_NOT_NORMALIZED` | `TARGETED_SCAN_REQUIRED` |
| Work/service type | `data.serviceType` is a scalar code. R1 uses a special branch for value `40` and another fallback icon; no stable list label is established there. | `node.data.serviceType`. | `row.serviceType` below normalized `data`. | Optional in the raw row and not safe to default to a display category. | A service-type concept exists, but the list’s stable user-facing vocabulary and cross-role meaning are not proven. | A binary icon branch exists in the list; code/options lookups exist elsewhere, but no accepted list label mapping is established. | Form behavior uses service type; selected menu/read mode can change the surrounding workflow context, but does not prove a list label. | `VERIFIED_SUPPORTED_BUT_NOT_NORMALIZED` | `TARGETED_SCAN_REQUIRED` |
| Appointment-time summary | `data.exts.applyTimeStr` with fallback `data.applyTime`. | Same values under `node.data`. | Same values under ordinary row `data`. | Conditionally present; R1 renders it only when the appointment value exists and `status < 203`. | “预约上门” is a stable observed meaning for that gated subset, not an unconditional card field. | `formatApplyTime(...)` formats the value; exact target timezone/value object is not normalized. | Status gating and the selected role/menu scope affect whether it is relevant; appointment ownership is G4-D. | `VERIFIED_SUPPORTED_BUT_NOT_NORMALIZED` | `DEFER` |
| District / address context | `data.district` is an area code coerced through `Number`; `data.address` is a string; `data.area[]` is a province/city/county code array in the raw contract. | `node.data.district`, `node.data.address`, and `node.data.area[]`. | Row values are placed under ordinary `data`. | District and address are independently optional; area hierarchy may be absent or incomplete. | R1 displays district text plus address, but the canonical target field and privacy/display policy are not yet fixed. | `formatDistrict` reads `areaList.county_list`; `area[]` uses province/city/county maps. This is UI-side lookup, not an accepted adapter semantic. | No direct role/menu dependency is proven; exact area-code mapping and future location policy remain open. | `UNKNOWN_NEEDS_TARGETED_SCAN` | `TARGETED_SCAN_REQUIRED` |

### Candidate conclusions

- No raw `status`, `state`, `serviceType`, `district`, `area`, `exts`, or
  workflow-node metadata should be added to the shared contract.
- Task/status and service type need a bounded vocabulary and mapping decision
  before a card can display them as semantic badges.
- Appointment time is a real observed list behavior, but its status gate and
  normalized time semantics belong to the appointment evidence boundary.
- District can be a useful presentation field only after the code-to-name
  source, nullability, and address composition are verified. It must not be
  parsed from an address string.

## Search contract verification

### What R1 actually searches

R1 keeps one user input, `searchValue`, trims it on search/clear, and sends it
server-side as an OR search across these six backend fields:

1. `title`
2. `name`
3. `phone`
4. `address`
5. `describe`
6. `orderNum`

The raw request uses backend regex/operator keys for those fields. Those keys
are adapter-owned and are not part of the target contract. The evidence does
support the semantic statement “search text may match task/customer/phone/
address/note/order-number data.” It does **not** establish `title` as a
stable display title; R1 renders `name` as customer information.

### Mode and paging behavior

- The same semantic search input is applied in ordinary and SANode modes.
- The read path differs by mode: SANode selects
  `querySAWorkflowNode`; ordinary service-appointment reads select `query`
  (with other workflow-node paths reserved by the selected function).
- Search resets the list to page 1 with the Legacy page size of 10 and clears
  previously loaded pages before the server read.
- Clear/empty search follows the same reset path. The raw Legacy builder may
  still emit empty regex values, but the target semantic contract should treat
  empty or whitespace-only input as no search text.
- Paging remains server-side. No client-side filtering is authorized.

### Bounded proposal

The smallest semantic query extension supported by this evidence is:

```ts
interface WorkOrderListQuery {
  readonly page: number
  readonly pageSize: number
  readonly searchText?: string
}
```

This is a review proposal only. `searchText` is one semantic input; the API
Adapter would later own the six-field OR mapping, mode-specific path, encoding,
and empty-input omission. No regex, operator, phone field, or arbitrary query
bag crosses the boundary.

`SEARCH_SEMANTIC_MODEL_POSSIBLE = YES`

## Status tabs and counts verification

### Role-visible tab/scope construction

R1 `getSAMenu` recursively finds leaf functions with `exts.tabDisplay === '1'`
whose action targets the service-appointment page. It extracts raw action
parameters named `orderState`, `status`, and `type`, then sorts the functions
by `order`. The list page takes the first sorted function as the default and
uses its function identity for later activation.

The selected function determines the read mode and raw query scope:

- `type=SANode` selects the SANode workflow-node read path;
- ordinary functions select the ordinary service-appointment path or another
  workflow-node path according to the Legacy function policy;
- `status` and `orderState` remain server-side scope inputs.

This is strong evidence for one semantic scope:

`RoleVisibleWorkOrderScope = the current role's selected/default visible Work
Order scope`

It is not evidence for a universal status-tab model or for “my/assigned”
ownership.

### Count behavior

R1 calls `/function/dataCount` with the serialized function list. The response
is stored as `functionCount` and rendered by looking up `functionCount[func._id]`
beside the backend function `func.name`; a fallback tab label is used when the
function name is absent. The accepted G1 evidence records that the sanitized
response did not expose stable count keys that could be safely mapped to a
new semantic tab/count contract.

Therefore:

- stable semantic default scope model: **YES**;
- stable semantic multi-tab model: **NO**;
- stable count mapping: **NO**;
- product decision still required: **YES**.

No tabs or counts are added to the current contract. No raw `functionList`,
action URL, function id, `type`, `status`, or `orderState` is proposed for
shared/application code.

## Proposed contract table

Recommendations in this table are proposals, not implementation authorization:
`ADD_NOW`, `DEFER`, `TARGETED_SCAN_REQUIRED`, or
`PRODUCT_DECISION_REQUIRED`.

| FIELD | SEMANTIC NAME | TYPE | OPTIONALITY | RAW SOURCE | NORMALIZATION RULE | ORDINARY MODE | SANODE MODE | DISPLAY MEANING | RISKS | RECOMMENDATION |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Search input | `searchText` | `string` | Optional; trim; blank means absent | `searchValue` mapped by adapter to six OR-search fields | Preserve one user-entered semantic text; omit blank wire criteria; never expose regex/operator names | Same search text maps to the ordinary list route | Same search text maps to the SANode list route | User searches supported task/customer/phone/address/note/order-number content | Searchable `title` is not a proven display title; phone search has privacy implications; server paging/reset must remain consistent | `ADD_NOW` |
| Task/status | `taskStatus` | Not yet safely typed; candidate bounded enum/value object only after scan | Optional | Ordinary `row.status`; SANode `node.data.status` plus wrapper `state` | Must use an evidence-backed status vocabulary and explicit precedence; never pass raw code | Map row status inside adapter | Map nested data status inside adapter and keep node state internal | Primary operational status/task label | Code-table availability, role scope, state precedence, and color policy are unresolved | `TARGETED_SCAN_REQUIRED` |
| Work/service type | `workServiceType` | Not yet safely typed; candidate semantic type after scan | Optional | Ordinary `row.serviceType`; SANode `node.data.serviceType` | Map only a verified code-to-semantic vocabulary; do not reuse the binary icon branch as a label | Adapter maps row value | Adapter maps nested data value | Type/category badge on the task card | Raw code has no accepted cross-role label; service-type behavior is also used by forms | `TARGETED_SCAN_REQUIRED` |
| Appointment-time summary | `appointmentTime` | Candidate normalized appointment-time value; exact shape TBD | Optional | `data.exts.applyTimeStr` or `data.applyTime` | Preserve only after defining status gate, timezone, precision, and missing-value behavior | Adapter reads ordinary data | Adapter reads nested SANode data | Optional “预约上门” metadata | It is not unconditional; appointment semantics are owned by G4-D and may differ by workflow state | `DEFER` |
| District context | `serviceDistrict` | Candidate `string` display name after verified area mapping | Optional | `data.district` plus area-code tables; address remains separate | Resolve an evidenced district code; never parse address text or expose area codes | Adapter maps ordinary row | Adapter maps nested data | Compact district/address context | Static UI lookup is not yet an accepted adapter source; privacy and address composition remain open | `TARGETED_SCAN_REQUIRED` |
| Status tabs | `roleVisibleWorkOrderScope` | Existing semantic scope, not a new field | Product-dependent | R1 role-visible menu/action projection | Keep projection internal to adapter and expose only the selected semantic scope | Ordinary route selected by scope | SANode route selected by scope | Potential future scope navigation | Multiple tabs and labels are not yet a product decision | `PRODUCT_DECISION_REQUIRED` |
| Counts | `workOrderScopeCount` | Candidate optional count value only after mapping | Product-dependent | R1 `/function/dataCount` keyed by function identity | Require stable semantic scope-to-count mapping and freshness rule | Unknown | Unknown | Potential future tab count | Accepted evidence does not establish count mapping or necessity | `PRODUCT_DECISION_REQUIRED` |

### Smallest useful WorkOrderSummary extension

The only `ADD_NOW` item in this proposal is the bounded query input
`searchText`; it does not extend `WorkOrderSummary`. The smallest safe
review-order for a future summary extension is:

1. Verify and name one semantic task/status vocabulary.
2. Verify and name one semantic work/service-type vocabulary.
3. Decide whether appointment time belongs on a list card or remains Detail /
   Appointment-only.
4. Verify district code mapping and decide whether it is separate from the
   address.

Only after those gates should the shared summary be extended with individual
optional semantic fields. Do not introduce a generic `metadata` bag, a nested
Legacy-shaped `data` object, a raw status code, a menu object, or a guessed
`task` aggregate. This is intentionally a staged proposal rather than an
unbounded V2 model.

## Mock impact for the proposed ADD_NOW field

No Mock runtime change is made by this document.

If `searchText` is accepted in a later implementation slice, the deterministic
Mock DATA design is:

- retain the existing three synthetic SANode records and their complete local
  Detail fixtures;
- do not add mock-only fields or real data;
- use the existing synthetic display number, customer name, and address values
  for the bounded semantic search behavior, while preserving the raw fixture
  fields that already represent R1 search evidence;
- blank/whitespace search returns the full deterministic DATA list;
- a non-empty search returns the deterministic subset according to the same
  accepted semantic search rule; no real backend fallback is allowed;
- a row with an absent optional address remains a valid result, proving
  optional-field handling;
- Mock EMPTY remains local and deterministic, independent of search input until
  a product decision defines empty-search/filter interaction.

This is a future fixture contract note only. It does not authorize changing
the mock router or adding fields now.

## Deferred dependencies

The following remain outside this proposal, as required by the parity audit:

- generic filters and advanced sort/date filters;
- distance and nearby-customer context;
- list phone/contact action;
- bottom navigation destinations;
- status-tab/count implementation;
- List v5 UI/CSS refinement;
- Work Order Detail and G4-D.

## Decision summary

| Question | Result |
| --- | --- |
| Search semantic model possible? | **YES** — propose optional `searchText`; implementation still requires review. |
| Default role-visible scope model stable? | **YES** — preserve current single role-visible scope. |
| Multi-tab semantic model stable? | **NO** — raw menu/action parameters are not a target contract. |
| Count mapping stable? | **NO** — `function/dataCount` result is not safely mapped in accepted evidence. |
| Product decision still required for tabs/counts? | **YES** |
| WorkOrderSummary extension safe to add in this slice? | **NO** — four display candidates require further bounded evidence or G4-D ownership. |
| Application code changed? | **NO** |
| Current shared contract changed? | **NO** |
| G4-D started? | **NO** |

`G4UX_LIST_SEMANTIC_UNLOCK_PROPOSAL = COMPLETE`
