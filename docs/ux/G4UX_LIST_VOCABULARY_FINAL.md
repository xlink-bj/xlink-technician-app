# G4-UX Work Order List Final Semantic Vocabulary

Status: final targeted evidence checkpoint before any coherent List v5
contract, adapter, mock, or UI implementation. This document is a proposal;
it makes no implementation change.

Branch: `rebuild/g4-ux-production-baseline`

Proposal baseline: `53bb24b5fd112f9a84c5defbac623804cdc89314`

Method:

**REUSE → VERIFY → GAP ANALYSIS → TARGETED RESCAN**

## Authority and scope

- R1 `xlink-business-jishi-3.0` at pinned main
  `6ada6b5375324bfcd09ca7c569b96a4ff328173f` is the business-semantic source.
- Accepted G1/G4 documents and the current Technician adapter/contracts define
  the new-App boundary.
- R2 is not used as a business dictionary. It remains a visual/interaction
  reference only.
- Beta raw row values were not re-read in this checkpoint. The accepted Beta
  evidence deliberately sanitizes row values and does not retain customer,
  phone, address, or raw code data; no additional Beta probe was necessary to
  decide the safe normalization boundary.
- No application source, contract, adapter, mock runtime, dependency, backend,
  or reference repository was changed.

Implementation status: the two bounded decisions authorized by this document
have since been implemented in the new App: `WorkOrderListQuery.searchText`
and `WorkOrderSummary.serviceDistrict`. The implementation keeps the raw
search keys and the bundled `county_list` lookup inside the API Adapter; it
does not promote any deferred status/type/category semantics.

## Status vocabulary

### Source and raw shape

R1 list rows carry service-appointment status as a scalar at
`item.data.status`. In SANode mode this is `node.data.status`; in ordinary mode
the row status is placed below the normalized `data` wrapper. A SANode wrapper
also carries `item.state`.

The R1 list contains status literals in display/action gates, including
`102`, `103`, `104`, `105`, `200`, `201`, `203`, `300`, `400`, and `999`, plus
numeric ranges. These are observed implementation values, not a complete
vocabulary and not safe shared-contract values.

### Dictionary and labels

The list declares `codecfg_status: { codeId: 'STATUS' }`. R1's `codeoption`
helper obtains configured code options through `i/code/selectCode.do`, passing
the configured code id and a tenant-related value, then builds the local
`options.status` dictionary. `codelabel('select', 'status', value)` delegates
to `common.osg.codelabel`; an unmapped value becomes `未知` rather than a
verified business label.

Therefore the source and mapping mechanism are found, but the complete values
and concrete display labels are not stable in the pinned source. The accepted
sanitized Beta evidence does not retain concrete labels. The mapping may vary
with code-table/runtime context and must not be copied into a shared status
union or a guessed severity scheme.

### Concept separation

- `SERVICE_APPOINTMENT_STATUS`: the status code on `data.status`, potentially
  labelable through the runtime code table.
- `WORKFLOW_NODE_STATE`: the separate SANode wrapper `item.state`, used by R1
  for workflow-node presentation/action conditions. It is not the service
  appointment status and remains adapter/runtime-internal.
- `CURRENT_TASK / ACTION`: the current workflow node/action policy. It is not
  established by the list status label and remains a Workflow Runtime/future
  action-surface concern.

### Decision

`STATUS_SOURCE_FOUND = YES`

`STATUS_STABLE_VOCABULARY = NO`

`STATUS_DECISION = DEFER`

`taskStatusLabel?: string` is not `READY_FOR_NORMALIZATION` in this
checkpoint. A later scan must establish the code-table source, stable label
set, null behavior, service-appointment versus workflow precedence, and whether
the product actually wants a status badge. No raw `status` or `state` field is
proposed.

## Service/work type

### Source and raw shape

R1 list rows carry `serviceType` as a scalar code at `item.data.serviceType`.
SANode uses `node.data.serviceType`; ordinary rows use the ordinary service-
appointment row under `data`.

The list contains one explicit branch: `serviceType == '40'` selects one icon,
and all other values select the fallback icon. This proves a historical routing
or visual branch, not a complete user-facing vocabulary. It does not prove
that the icon filenames are type labels.

Other R1 service-appointment/form code configuration declares
`codecfg_serviceType: { codeId: 'serviceType' }`, which is also loaded through
the runtime code-option machinery. The pinned list source does not provide a
complete value-to-label table, and no accepted evidence proves that the values
or labels are stable across roles/tenants.

### Decision

`SERVICE_TYPE_SOURCE_FOUND = YES`

`SERVICE_TYPE_STABLE_VOCABULARY = NO`

`SERVICE_TYPE_DECISION = DEFER`

Do not propose `workServiceTypeLabel?: string` yet. A future scan must verify
whether this is service type, repair type, work type, product/category, or only
implementation-specific routing, then establish a stable semantic mapping.
The literal `40` must not become a shared enum member merely because it drives
an icon branch.

## Leakage-site / business category

### Source and raw shape

R1 list rendering reads `item.data.exts.leakagesite_copy[0]`, passes it through
`formatLeakagesite`, takes the first element of each path item, and resolves
the result with `common.osg.codelabelForArray('repairParts', ...)`. The raw
shape is therefore an optional nested path-like array, not a scalar display
label. SANode and ordinary rows expose it under the same nested service-
appointment `data` payload.

The `repairParts` vocabulary is configured as a cascade code. R1's
`selectMultistageCode` path loads the hierarchy through the runtime code-option
machinery using the current identity/tenant context. The list truncates the
resolved text after seven characters. No complete code/value/label set is
present in the pinned list source.

### Meaning and first-item test

The evidence supports “repair/location path” as a business-adjacent meaning.
It does not establish that the first path element is always a stable service
category, nor that it is always suitable for a single R2-style badge. The
display may be a top-level repair-part label, a location path prefix, or an
abbreviated result of a tenant-scoped cascade dictionary.

### Decision

`LEAKAGE_SITE_SOURCE_FOUND = YES`

`LEAKAGE_SITE_STABLE_VOCABULARY = NO`

`LEAKAGE_SITE_DECISION = UNKNOWN_AFTER_TARGETED_SCAN`

Neither `serviceCategoryLabel?: string` nor `leakageSiteLabel?: string` is
ready. A later targeted scan must capture sanitized representative shapes and
the dictionary contract, then decide whether the semantic name is repair
category, leakage location, or a more precise bounded concept. Do not use the
R2 badge text as the semantic authority.

## District / area display

### Source and lifecycle

R1 imports `resources/js/area.js` and initializes `areaList` from its exported
object during page setup. This is a bundled/static dictionary, not a per-row
API read. `area.js` contains deterministic `province_list`, `city_list`, and
`county_list` mappings. The list renders `formatDistrict(Number(district))`,
which reads `areaList.county_list[value]`.

The raw list fields are:

- optional `data.district`, interpreted as a county/district code;
- optional `data.address`, a separate free-text service address;
- optional `data.area[]`, a province/city/county code hierarchy used by other
  R1 location surfaces.

SANode and ordinary modes use the same service-appointment payload location.
The lookup is deterministic for codes present in the bundled dictionary and
has no demonstrated role/menu/workflow dependency. A missing dictionary entry
must produce omission, not an area code or a guessed label.

### Decision

`DISTRICT_SOURCE_FOUND = YES`

`DISTRICT_STABLE_MAPPING = YES`

`DISTRICT_DECISION = READY_FOR_NORMALIZATION`

The smallest safe semantic candidate is:

`serviceDistrict?: string`

It remains separate from `serviceAddress`; the address must not be parsed to
manufacture a district. The adapter would resolve a verified district code
through its approved area dictionary and omit the field when the code is
missing or unmapped. This is a proposal only; no shared contract change is
made here.

## Final decision matrix

| Candidate | Source found | Stable vocabulary/mapping | SANode vs ordinary | Optionality | Decision | Candidate target |
| --- | --- | --- | --- | --- | --- | --- |
| Service-appointment status | YES | NO; runtime/tenant code table and state precedence unresolved | Same `data.status`; SANode also has separate wrapper `state` | Optional/unknown labels render empty or unknown in R1 | `DEFER` | `taskStatusLabel?: string` only after a bounded status decision |
| Service/work type | YES | NO; only a partial icon branch and runtime code config | Same `data.serviceType` | Optional scalar code | `DEFER` | `workServiceTypeLabel?: string` only after vocabulary proof |
| Leakage site/category | YES | NO; cascade dictionary and first-path-segment meaning unresolved | Same nested `data.exts.leakagesite_copy` | Optional nested path | `UNKNOWN_AFTER_TARGETED_SCAN` | `serviceCategoryLabel?` or `leakageSiteLabel?` only after meaning proof |
| District/area | YES | YES for bundled `county_list` lookup, with omission on miss | Same `data.district` / `data.address` payload | Both district and address optional | `READY_FOR_NORMALIZATION` | `serviceDistrict?: string` |

## Final proposed WorkOrderSummary

This is the smallest review-only extension justified by the final scan:

```ts
interface WorkOrderSummary {
  readonly id: WorkOrderId
  readonly displayNumber?: string
  readonly customerName?: string
  readonly serviceAddress?: string
  readonly serviceDistrict?: string
}
```

Only `serviceDistrict` is classified `READY_FOR_NORMALIZATION`. This proposal
does not authorize implementing the field yet; the next implementation task
must separately accept the contract change and define the adapter’s dictionary
ownership/test fixtures.

Final fields still deferred:

- `taskStatusLabel` — status vocabulary, label source, and state precedence.
- `workServiceTypeLabel` — service/work/repair meaning and code vocabulary.
- `serviceCategoryLabel` / `leakageSiteLabel` — first-path semantics and
  cascade dictionary contract.
- appointment-time summary — G4-D owns appointment evidence and state gates.
- distance, nearby customer, list phone/contact, tabs, counts, and generic
  filters — remain outside this scan.

The approved search proposal remains separate:

`WorkOrderListQuery.searchText?: string`

It is still a bounded input proposal and does not alter this summary-field
decision.

## Visual consequence for a future R2-like card

The only ready field supports one narrow slot:

- `serviceDistrict` → secondary location metadata, shown adjacent to or before
  the accepted `serviceAddress` when both are present.

It does not support a primary operational label, category badge, or status
color. Those slots remain intentionally empty or use only already accepted
fields until their respective vocabulary gates pass. No UI implementation is
authorized by this document.

## Mock impact

No Mock DATA/EMPTY change is made.

If `serviceDistrict` is accepted in a later contract slice:

- use synthetic district codes whose lookup result is already represented by
  the approved bundled area dictionary;
- include one synthetic row with a mapped district and one without district;
- keep List → Detail values coherent where Detail carries the same semantic
  context;
- never commit real area/customer data or expose the raw area code in UI;
- exercise an unmapped-code case as omission, not as a raw numeric label.

No synthetic status, type, or leakage-category label may be added before those
vocabularies become ready. The R2 badge text must not be copied into fixtures
as a substitute for business evidence.

## Final reportable decisions

- Status source found: **YES**; stable vocabulary: **NO**; decision:
  **DEFER**.
- Service type source found: **YES**; stable vocabulary: **NO**; decision:
  **DEFER**.
- Leakage-site/category source found: **YES**; stable vocabulary: **NO**;
  decision: **UNKNOWN_AFTER_TARGETED_SCAN**.
- District source found: **YES**; stable mapping: **YES**; decision:
  **READY_FOR_NORMALIZATION**.
- Search remains an approved bounded proposal: **YES**.
- Application code changed: **NO**.
- G4-D started: **NO**.
