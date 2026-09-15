# G4-B AU-02 Work Order List Review

## Method and evidence

This correction used the accepted evidence first, followed by a targeted
read-only rescan of R1 at SHA
`6ada6b5375324bfcd09ca7c569b96a4ff328173f`:

**REUSE → VERIFY → GAP ANALYSIS → TARGETED RESCAN**

The targeted rescan covered:

- `resources/technician/mainWorkOrderListContract.js`
- `pages/serviceAppointment/serviceAppointments.vue`
- `subpackages/login/loginAuth.vue`
- `resources/js/common.js` (`getSAMenu`)
- `resources/js/identityContext.js`

The evidence establishes that `function/changeRole` supplies the current role's
function tree. `getSAMenu` retains only role-visible leaf functions marked for
Work Order list display, then orders them by the function's display order.
The list page activates the first retained function by default. The selected
function's normalized adapter projection determines the read mode and scope:
the workflow-node read mode uses the workflow-node list path, while the
ordinary mode uses the service-appointment list path and both preserve the
selected function's server-side scope inside the API Adapter.

The source evidence does not establish that this role-visible scope means
ownership or assignment to the authenticated user. The new App therefore does
not use the labels “My Work Orders” or “Assigned work orders”.

## V1 decision

The smallest business-correct V1 is one **Role-visible Work Orders** list. It
represents the first Work Order list scope visible to the authenticated
current role, which matches the Legacy default activation without recreating
the Legacy tab/menu architecture. The API Adapter performs the bounded role
scope projection; feature and UI code receive only normalized
`WorkOrderSummary` items and the semantic `page` / `pageSize` query.

The new App deliberately has no user-selectable tabs or count cards in this
slice. It does not claim full Legacy parity.

For a workflow-node scope, the API Adapter maps the nested `data` service
appointment payload into `WorkOrderSummary`; the workflow-node identifier and
node metadata are discarded at that boundary. Role scope is resolved for each
list read rather than cached by RoleId, so a later session cannot inherit a
previous session's menu scope.

## V1 policy

| Concern | G4-B decision | Evidence boundary |
| --- | --- | --- |
| List meaning | One **Role-visible Work Orders** list for the current role's default visible function | `function/changeRole` → role-visible `saMenu` → first ordered function is the Legacy default. No assignment/ownership claim is made. |
| Role/menu projection | Adapter-only read projection; no raw function tree, action URL, type, status, or order-state field crosses into features | R1 `loginAuth.vue`, `getSAMenu`, and `mainWorkOrderListContract.js`. |
| Tabs | No tabs | Multiple role-visible functions exist in Legacy, but V1 does not need to recreate tab navigation to provide the default role scope. |
| Counts | No count cards or tab counts | `function/dataCount` did not yield a stable count mapping in the accepted evidence. |
| Refresh | Manual refresh reads page 1 and replaces the current list | This is bounded app behavior; Legacy freshness parity is not claimed. |
| Pagination | Semantic `page` / `pageSize`; load-more only when `totalCount` safely derives `hasMore` | Paging fields are evidenced; no arbitrary feature filters or sort fields are added. |
| Endpoint selection | Adapter maps the selected role scope to `querySAWorkflowNode` for workflow-node mode or `query` for ordinary mode | R1 main-list contract and accepted route-family evidence; `.do` aliases are not assumed. |

## Explicit unknowns

- exact semantics of non-default role-visible functions and whether a later
  slice needs selectable tabs;
- exact `function/dataCount` mapping and whether counts are required by a
  future V1 business decision;
- `.do` versus non-`.do` edge-case equivalence and canonical production
  spelling;
- server freshness guarantees beyond a manual page-one refresh;
- additional filters, sorting, or role-specific display fields beyond this
  bounded default scope;
- behavior when role-menu loading fails or the current role has no visible
  Work Order function; the new App fails explicitly rather than falling back
  to an unscoped list.

These unknowns do not justify exposing backend menu/query conventions in the
shared port or feature/UI layers.

## Data fidelity follow-up

The accepted role-visible list scope remains unchanged. The enriched semantic
row decision and field-by-field evidence matrix are recorded in
[`G4B_WORK_ORDER_DATA_FIDELITY.md`](./G4B_WORK_ORDER_DATA_FIDELITY.md). The
current list UI is intentionally not visually redesigned by that follow-up;
it only consumes normalized values. The current adapter disposition is recorded
in [`G4B_LIST_DATA_HARDENING.md`](./G4B_LIST_DATA_HARDENING.md).

## V5 bounded semantic additions

The accepted search proposal is now implemented as the single optional
semantic input `WorkOrderListQuery.searchText`. The feature trims it, treats
blank input as absent, resets reads to page one, and applies the same input to
ordinary and SANode modes. The API Adapter alone projects the input to the
six R1-evidenced server-side search fields (`title`, `name`, `phone`,
`address`, `describe`, and `orderNum`); those raw keys do not cross the shared
port.

The accepted district decision is now implemented as the optional semantic
`WorkOrderSummary.serviceDistrict`. The API Adapter resolves raw
`data.district` through an adapter-owned copy of the pinned R1 `county_list`
dictionary. Missing or unmapped codes omit the field, and `serviceAddress`
remains a separate raw-address mapping; the adapter never parses the address
to infer a district.

No status, type, category, appointment, distance, nearby, phone, tab, count,
or arbitrary-filter field was added. These remain deferred or unknown under
the existing G4-B scope decision.

## Session-invalid invariant

When the normalized API read result is `session_invalid`, the Work Order List
clears its own data and invokes the existing application `endSession` boundary.
That boundary clears the current and persisted normalized session through the
Auth/Storage adapter, so the Session Store becomes unauthenticated and both
Home and Work Order access guards stop treating the user as authenticated.
No refresh endpoint or remote logout endpoint is added by G4-B. R1's
`restart` sentinel was inspected as compatibility evidence only; its raw
mapping remains outside the new App contract.

## Safety

- No additional XLink calls were made for this correction.
- No production endpoint, mutation, credential, or customer data was used.
- R1, R2, and R3 were read-only and not modified.
