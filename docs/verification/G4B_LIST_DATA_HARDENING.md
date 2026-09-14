# G4-B Work Order List Semantic Hardening

Status: engineering hardening for the frozen G4-UX List presentation. This
note does not redesign the List and does not authorize Detail or G4-D work.

Method:

**REUSE → VERIFY → GAP ANALYSIS → TARGETED RESCAN**

Evidence was checked against pinned R1
`xlink-business-jishi-3.0@6ada6b5375324bfcd09ca7c569b96a4ff328173f`, including
`mainWorkOrderListContract.js`, `serviceAppointments.vue`, `common.js`, and
`identityContext.js`.

## Field decisions

| Current summary field | Classification | Current resolution |
| --- | --- | --- |
| `taskLabel` | `NEEDS_SAFE_BETA_VERIFICATION` | The service-appointment `status` remains adapter-only. Labels are looked up through the existing adapter-owned `code/query` read when a response supplies a status. There is no global status map, raw status fallback, or fabricated label for an unknown code. |
| `servicePartLabel` | `PRODUCT_UI_REQUIRED_BUT_BACKEND_CONTRACT_UNRESOLVED` | R1 source is `exts.leakagesite_copy` through the `repairParts` cascade. The old Mock-only `part` field is removed. Until a bounded cascade label read is verified, the optional UI slot remains structurally available but no value is emitted. |
| `serviceDistrict` | `VERIFIED_REAL_SEMANTIC` | Adapter-owned `county_list` mapping from the evidenced district code; missing/unmapped values are omitted. |
| `distanceText` | `VERIFIED_RAW_BUT_MAPPING_WRONG` | When an enriched row supplies numeric `exts.distance`, the adapter formats the evidenced display value as `N km`. The old top-level `distance` path is not read, and no client GPS calculation is introduced. |
| `communityOrderCount` | `VERIFIED_REAL_SEMANTIC` | Maps R1 `exts.communityOrdersTotal` and is rendered with the truthful `同小区` label. It is not called a nearby-customer count. |
| `contact` | `VERIFIED_RAW_BUT_MAPPING_WRONG` | A List direct-phone action is emitted only when a phone exists and the evidenced R1 status gate (`Number(status) > 103`) passes. Contact-only relay behavior remains deferred; Detail contact semantics are unchanged. |

The shared summary keeps optional presentation slots needed by the frozen
card, but the adapter is the only place that sees status codes, nested R1
paths, or status-gated contact policy. No raw status, workflow-node state,
service type, query key, or menu structure crosses the port.

## Mock data fidelity

Mock fixtures use the R1-shaped nested paths `exts.leakagesite_copy`,
`exts.distance`, and `exts.communityOrdersTotal`. They do not contain the
old UI-only `part`, `distance`, or `nearbyCustomers` aliases. The status labels
used in DATA come from a sanitized raw code-option response through the same
adapter lookup; they are not a second feature-side vocabulary.

The List remains role-visible and single-scope. Tabs, counts, arbitrary
filters, client distance calculation, nearby queries, and relay/private-number
contact behavior remain outside this slice.

## Dependencies and unrelated Login changes

`@dcloudio/uni-ui` remains required by the accepted `AppIcon` implementation.
`sass` remains required by the source/toolchain's SCSS compilation path. No
dependency cleanup is justified by this audit.

The Quick Login changes after `084f17e` are retained as the previously
requested, bounded G4-UX Login/test capability. They are not expanded by this
List hardening and are unrelated to List data semantics.

## Safety

- No production or Beta mutation was performed.
- No real phone call, credential discovery, or credential commit was performed.
- R1/R2/R3 repositories were read-only.
- No Detail, G4-D, backend write, or new dependency was introduced.
