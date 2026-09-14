# G4-UX R2 Work Order List Parity Gap

Status: focused audit only. This document does not authorize List UI,
contract, adapter, backend, or G4-D implementation changes.

Audit branch: `rebuild/g4-ux-production-baseline`

Audit HEAD before this document: `3c68e567641033c7a5874673b3c7611e2c23882a`

R2 visual / interaction source: `xlink-business-3.0`, pinned main
`06b885ed22477e79d50bc6f3a0ce0c96fbc1a185`

R1 field-service business source: `xlink-business-jishi-3.0`, pinned main
`6ada6b5375324bfcd09ca7c569b96a4ff328173f`

Method:

**REUSE → VERIFY → GAP ANALYSIS → TARGETED RESCAN**

## Scope and safety

- R2 Live was inspected temporarily at the mobile Work Order / Task List
  surface. The live view contained customer and address-related information.
- `R2_REFERENCE_SCREENSHOT = NOT_SAVED / PII`.
- No live R2 screenshot, customer data, phone data, log, ZIP, or image was
  persisted. The fixed reference for this audit is the pinned R2 source plus
  the structural notes below.
- Current Technician screenshots, where referenced, are synthetic/mock review
  evidence only and remain in the existing untracked review bundle.
- R1 and R2 repositories were read-only. No application source, shared
  contract, dependency, backend, or G4-D work is included.

## Evidence register

| Evidence | Use in this audit |
| --- | --- |
| R2 Live mobile Work Order / Task List, temporarily inspected | Visual structure, scan order, density, controls, and shell observations. Not saved because of PII. |
| R2 `web/components/list/ListControls.tsx` | Card anatomy, list states, tab/count and action patterns. |
| R2 `web/components/list/ServiceCard.tsx` | Task-card field grouping and phone affordance pattern. |
| R2 `web/components/list/ListSearchHeader.tsx` and `ListAdvancedFilterSheet.tsx` | Search/filter visual and interaction pattern. |
| R2 `web/components/AppTabBar.tsx` and `WorkOrdersInner.tsx` | Bottom navigation, status navigation, pagination, and list composition. |
| R2 `docs/18-task-list-ux-notes.md` and `docs/flows/work-orders.md` | Relationship between the visual list and the observed business mini-program behavior; not a blanket new-App contract. |
| R1 `resources/technician/mainWorkOrderListContract.js` | Ordinary/SANode read modes, raw field inventory, and nested SANode business payload shape. |
| R1 `pages/serviceAppointment/serviceAppointments.vue` | Role-visible list menu use, search/filter inputs, counts, read-path selection, and contact affordance evidence. |
| R1 `resources/js/common.js` (`getSAMenu`) | Role-visible Work Order function projection and raw action parameter extraction. |
| R1 `resources/js/identityContext.js` | Legacy persistence of role/menu context; evidence only, not an implementation pattern. |
| New App `docs/verification/G4B_AU02_WORK_ORDER_LIST.md` | Accepted V1 meaning: one role-visible Work Orders list; no unsupported My/Assigned claim, tabs, or counts. |
| New App `src/shared/ports/api.ts` and `src/adapters/api/technician-api.ts` | Current semantic list contract and adapter-owned raw mapping boundary. |

## Fixed R2 structural reference

The R2 Live view and pinned source agree on the following list structure. The
exact live records are deliberately not retained.

### Page shell and controls

1. A search field accepts task/customer/address-oriented search input.
2. A visually dominant blue search action sits beside the search field.
3. A separate filter action opens a bounded filter surface.
4. A horizontal status-navigation row exposes several status scopes and their
   counts, with the active item visually emphasized.
5. The list is a dense vertical scan of white rounded task cards.
6. A fixed bottom navigation presents Home, Tasks, Projects, and Account-like
   destinations in the R2 shell.

These are R2 visual/interaction observations. Search, filters, tabs, counts,
and destination semantics are not automatically accepted Technician V1
capabilities.

### Task-card anatomy and scan order

The observed R2 card reads approximately in this order:

1. Left color stripe and compact task/type icon.
2. Task/status label and a work-service or category badge.
3. Order/display number, visually aligned to the card header.
4. Location/address metadata, with distance and a small transport/location
   affordance where available.
5. Customer or business title as a separate content line.
6. Nearby-customer/context badge where the data supports it.
7. Circular phone/contact action at the lower action position.

The layout uses compact insets, short vertical gaps, clear white card surfaces,
restrained borders/shadows, high-contrast primary text, and lower-contrast
metadata. The card is designed for repeated scanning; it is materially denser
than the current Technician v4 row.

### Relative layout observations

No exact pixel values are claimed because the R2 Live screenshot was not saved.
The stable relationships that must be reviewed in a future implementation are:

- search/filter controls form the first interaction band;
- status navigation follows controls and remains horizontally scannable;
- cards have a consistent left stripe/icon anchor and compact internal insets;
- order identity and task identity share the first scan band;
- address and distance form one metadata band;
- customer/context information follows the metadata rather than replacing the
  task/status identity;
- phone is a distinct action, not an information-row decoration;
- bottom navigation is outside the scrollable card content and respects the
  device safe area.

## Current Technician v4 comparison

The current v4 implementation is intentionally bounded by the accepted
semantic contract. The classifications below describe the next parity
direction; they do not authorize changing the current List UI in this audit.

| Current element | Classification | Audit finding |
| --- | --- | --- |
| `工作范围` kicker | KEEP | Honest scope framing. It avoids claiming ownership or assignment and can remain as supporting context. |
| `当前可见工单` heading | KEEP | Matches the accepted role-visible V1 meaning; do not rename it to “我的工单” or “已分配工单”. |
| `刷新` pill | KEEP | Manual refresh is accepted behavior. Its visual treatment may later be tuned within the R2 rhythm. |
| `displayNumber` pill | REPLACE_WITH_R2_PATTERN | The field is semantically accepted, but R2 gives order identity a stronger card-header role rather than a detached generic pill. |
| Large customer-name heading | REPLACE_WITH_R2_PATTERN | Customer is not the proven task identity. R2 prioritizes task/status identity and keeps customer as a separate content layer. |
| Address divider treatment | REPLACE_WITH_R2_PATTERN | Address is accepted, but R2 groups location metadata with a location affordance and optional distance without inventing those fields now. |
| Generic blue glyph | REPLACE_WITH_R2_PATTERN | R2 uses a compact colored icon/stripe anchor. A future replacement must use only an evidenced semantic category; a generic raw-status color is not acceptable. |
| Circular chevron | KEEP | It is a clear row-navigation affordance and does not claim an unsupported business action. |
| Current card height | REPLACE_WITH_R2_PATTERN | v4 is sparse because the semantic row is intentionally small; R2 uses a denser task-card anatomy. |
| Current card spacing | REPLACE_WITH_R2_PATTERN | Insets and vertical gaps are more generous than the repeated-scan R2 pattern. |
| Current top composition | REPLACE_WITH_R2_PATTERN | v4 has scope/title/refresh only. R2 has a control band and status-navigation hierarchy, but those controls require business decisions first. |
| Current empty composition | KEEP | The current deterministic empty state is explicit and recoverable. Its final copy/illustration can remain a later visual decision. |

### What is actually a parity blocker

- The current card does not establish task/status/type/category hierarchy.
- The current card has no evidence-backed distance, nearby-customer, phone, or
  appointment-time presentation.
- Search/filter/status/count controls visible in R2 are absent, but their
  absence is partly a contract/product-decision gap rather than a CSS gap.
- The current top composition cannot be made R2-like safely by adding raw
  backend fields or guessed tabs.
- No current visual element is classified for unconditional deletion in this
  audit. The safe direction is to replace weak hierarchy with R2 patterns only
  after the semantic and product gates are closed.

## R2 capability and semantic audit

Classifications are deliberately separate from the recommendation. A
capability may be visible in R1/R2 while still lacking an accepted normalized
Technician contract.

Allowed classifications:

- `VERIFIED_SUPPORTED`
- `VERIFIED_SUPPORTED_BUT_NOT_NORMALIZED`
- `DERIVABLE_FROM_VERIFIED_DATA`
- `PRODUCT_DECISION_REQUIRED`
- `UNSUPPORTED`
- `UNKNOWN_NEEDS_TARGETED_SCAN`

Recommendations are limited to:

- `ADD_TO_CONTRACT`
- `DERIVE_IN_PRESENTATION`
- `KEEP_OMITTED`
- `PRODUCT_DECISION`
- `TARGETED_SCAN_REQUIRED`

| FIELD/CAPABILITY | EVIDENCE SOURCE | CURRENT CONTRACT | TARGET SEMANTIC NAME | OPTIONALITY | NORMALIZATION SOURCE | RISK | CLASSIFICATION | RECOMMENDATION |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Search | R1 `serviceAppointments.vue` search parameters; R2 `ListSearchHeader.tsx`; R2 task-list notes | No search field in `WorkOrderListQuery` | `workOrderSearchText` | Optional if approved | Adapter-owned search mapping after a bounded semantic decision | Raw regex/query keys and unclear scope could leak | `VERIFIED_SUPPORTED_BUT_NOT_NORMALIZED` | `TARGETED_SCAN_REQUIRED` |
| Filter | R1 `mainWorkOrderListContract.js` and page filter conditions; R2 filter sheet | No arbitrary filter bag | Bounded semantic list filter, exact shape TBD | Optional if approved | Role scope plus a later bounded adapter projection | Generalized filters would violate G3-B | `VERIFIED_SUPPORTED_BUT_NOT_NORMALIZED` | `TARGETED_SCAN_REQUIRED` |
| Status tabs | R1 role-visible `saMenu`, `type/status/orderState`; R2 status navigation | No tabs; one role-visible default list accepted | `roleVisibleWorkOrderScope` remains the current semantic scope; tab model TBD | Product-dependent | Adapter role/menu projection | Recreating raw menu/status conventions or false parity | `PRODUCT_DECISION_REQUIRED` | `PRODUCT_DECISION` |
| Status counts | R1 `function/dataCount`; R2 tab counts | No count contract | `workOrderScopeCount` only after exact semantics are verified | Optional | Adapter count normalization | Count mapping and freshness are not accepted | `VERIFIED_SUPPORTED_BUT_NOT_NORMALIZED` | `TARGETED_SCAN_REQUIRED` |
| Status/task label | R1 raw `type/status/orderState`; R2 card status/task label | No semantic status/task label | `taskStatusLabel` only with an accepted vocabulary | Optional | Adapter code/label normalization | Raw status codes and guessed severity colors | `VERIFIED_SUPPORTED_BUT_NOT_NORMALIZED` | `TARGETED_SCAN_REQUIRED` |
| Work/service type | R1 `serviceType`; R2 card type/category treatment | Not in `WorkOrderSummary` | `workServiceType` | Optional | Adapter normalization | Raw type values are not a shared vocabulary | `VERIFIED_SUPPORTED_BUT_NOT_NORMALIZED` | `TARGETED_SCAN_REQUIRED` |
| Category | R2 category badge; R1 menu/type evidence | Not in `WorkOrderSummary` | `workCategory` | Optional | Evidence-backed category mapping | Exact mapping and display policy unclear | `UNKNOWN_NEEDS_TARGETED_SCAN` | `TARGETED_SCAN_REQUIRED` |
| District | R1 `data.district`; R2 address/task context | Only combined `serviceAddress` | `serviceDistrict` | Optional | Adapter field mapping, not address string parsing | Role/business meaning and nullability need proof | `UNKNOWN_NEEDS_TARGETED_SCAN` | `TARGETED_SCAN_REQUIRED` |
| Display/order number | R1 `orderNum`; R2 card order number; current v4 field | `WorkOrderSummary.displayNumber?` | `displayNumber` | Optional | Adapter `orderNum` mapping | Low; nullability and presentation remain open | `VERIFIED_SUPPORTED` | `KEEP_OMITTED` |
| Customer identity/display | R1 `name`; R2 card customer line; current v4 field | `WorkOrderSummary.customerName?` | `customerName` | Optional | Adapter normalized name | Masking and exact customer-vs-business label remain product concerns | `VERIFIED_SUPPORTED` | `KEEP_OMITTED` |
| Service address | R1 `address`; R2 location metadata; current v4 field | `WorkOrderSummary.serviceAddress?` | `serviceAddress` | Optional | Adapter address mapping | Long text and masking/display policy remain open | `VERIFIED_SUPPORTED` | `KEEP_OMITTED` |
| Appointment time | R1 appointment fields and schedule evidence; R2 task/detail context | Not in list contract | `appointmentTime` | Optional if list needs it | Adapter time normalization | Exact list requirement and timezone/display semantics unknown | `VERIFIED_SUPPORTED_BUT_NOT_NORMALIZED` | `TARGETED_SCAN_REQUIRED` |
| Distance | R1 location/distance enrichment fields; R2 distance metadata | Not in list contract | `distance` | Optional and capability-dependent | Location/domain calculation or verified backend value | Permission, freshness, units, and source are unresolved | `VERIFIED_SUPPORTED_BUT_NOT_NORMALIZED` | `TARGETED_SCAN_REQUIRED` |
| Nearby-customer badge | R1 contact/nearby business paths; R2 nearby context badge | Not in list contract | `nearbyCustomerContext` | Optional | Explicit semantic backend mapping if verified | Meaning/count and privacy/display behavior are unclear | `VERIFIED_SUPPORTED_BUT_NOT_NORMALIZED` | `TARGETED_SCAN_REQUIRED` |
| Phone/contact availability | R1 direct-phone behavior and contact-only fallback; G4-C PhonePort boundary; R2 phone affordance | Contact exists only on `WorkOrderDetail`, not summary | `listContactCapability` | Product-dependent | Adapter contact policy + PhonePort | Direct list action and cross-target parity are not accepted | `VERIFIED_SUPPORTED_BUT_NOT_NORMALIZED` | `PRODUCT_DECISION` |
| Bottom navigation | R2 `AppTabBar.tsx` and live shell | No bottom-nav semantic contract | V1 navigation destination set, name TBD | Product-dependent | App shell composition, not API mapping | R2 Projects/Account destinations may not exist in V1 | `PRODUCT_DECISION_REQUIRED` | `PRODUCT_DECISION` |

### Classification counts

| Classification | Count |
| --- | ---: |
| `VERIFIED_SUPPORTED` | 3 |
| `VERIFIED_SUPPORTED_BUT_NOT_NORMALIZED` | 9 |
| `DERIVABLE_FROM_VERIFIED_DATA` | 0 |
| `PRODUCT_DECISION_REQUIRED` | 2 |
| `UNSUPPORTED` | 0 |
| `UNKNOWN_NEEDS_TARGETED_SCAN` | 2 |
| Total audited capabilities | 16 |

The count confirms the main diagnosis: the current v4 sparseness is not
primarily an implementation omission. Nine visible/meaningful R2 capabilities
have evidence but no bounded semantic projection, and two more require an
explicit product decision. The current three accepted fields should remain
stable until those gates are resolved.

### Top contract candidates, not yet authorized

These are candidates for a later evidence-backed contract proposal, not
changes made by this audit:

1. A bounded semantic search input, if V1 search is approved.
2. A normalized task/status/type/category vocabulary, if the target role and
   display policy are verified.
3. A bounded appointment-time display value, if list presentation is required.
4. A normalized distance value with source/availability semantics, if the
   platform capability and business need are confirmed.
5. A normalized nearby-customer context value, if the business meaning is
   proven.
6. A list contact capability, only after the product owner confirms direct
   list contact and MP/App parity.

No arbitrary filters, raw status fields, menu objects, endpoint names, or
backend query bags are candidates for the shared contract.

## App shell and platform boundary

R2’s web/mobile visual shell is a reference, not proof that every destination
belongs in this MP/App V1. The shell audit is therefore separate from the
semantic data audit.

| Surface | Decision | Reason |
| --- | --- | --- |
| Search row | `DEFER` | Strong R2 pattern, but current search semantic and role scope are not normalized. |
| Filter action/sheet | `DEFER` | Strong R2 pattern, but a bounded filter contract is not accepted. |
| Status tabs/counts | `PRODUCT_DECISION_REQUIRED` | R1 proves role/menu-scoped functions and R2 proves a tab/count pattern; V1 currently accepts one default role-visible list only. |
| Bottom navigation | `PRODUCT_DECISION_REQUIRED` | R2 destinations are not all accepted Technician capabilities; native MP chrome must remain distinct from product navigation. |
| Current single-list shell | `ADOPT` | It is the current accepted business-correct V1 scope and keeps unsupported controls omitted. |

### Native chrome versus product shell

The WeChat simulator’s status bar, capsule/menu area, navigation title, and
safe-area behavior are native/platform chrome. The page background, search or
filter controls, status navigation, task cards, empty state, and any bottom
navigation are product shell. Future parity review must not treat native chrome
differences as R2 product design decisions, and must not hide product-layout
gaps by cropping the native chrome away.

MP, Android, and iOS remain first-class target contracts. H5 is not a V1
target. Native device behavior remains a later G5 concern.

## WHY_V4_IS_STILL_FAR_FROM_R2

### 1. Visual implementation quality

v4 has a clean, safe, role-honest foundation, but its top composition is still
a title plus refresh action and its rows are sparse. R2 is a repeated-scan
work surface with a control band, status navigation, compact task cards,
stronger task identity, and explicit action placement. The current layout can
be visually coherent while still being structurally far from that reference.

### 2. Missing semantic data

The accepted `WorkOrderSummary` intentionally contains only `id`, optional
`displayNumber`, `customerName`, and `serviceAddress`. That prevents the new
App from safely rendering R2’s task/status/type/category, distance, nearby,
phone, and appointment-time hierarchy. Adding visual placeholders or reading
raw DTO fields would break the accepted adapter boundary. This is semantic
starvation, not a reason to weaken the contract.

### 3. Product-shell decisions are still open

R2 search, filters, status tabs, counts, and bottom navigation are visible
patterns, but the new App has not accepted their V1 scope. R1’s role-visible
menu behavior does not justify exposing raw menu tabs, and the accepted G4-B
decision deliberately chose one role-visible default list. The missing shell
therefore combines a real parity gap with legitimate product governance.

### 4. Platform differences

R2 reference structure is observed in a browser/mobile-like shell, while the
Technician target must preserve WeChat native chrome, MP safe areas, and the
same semantic contract for Android/iOS App targets. The product shell must be
re-expressed in uni-app; browser/React layout or native chrome cannot be copied
as implementation.

### 5. QA weakness exposed by v4

The prior v4 loop compared against a visual reference without retaining a
PII-safe fixed R2 artifact and without completing the semantic capability
matrix first. It consequently refined card CSS while the larger blockers were
data fidelity and unresolved shell decisions. This audit closes that gap by
separating visual pattern evidence, business evidence, semantic readiness, and
product decisions.

## Remaining UNKNOWNs and owners

1. Exact semantic search input and whether it is needed for the current role —
   targeted list contract scan / product owner.
2. Bounded filter model and whether advanced sort/date filters are V1 —
   targeted list contract scan / product owner.
3. Status/task/type/category vocabulary and color/display policy — targeted
   evidence scan before any status UI or contract extension.
4. District as a separate display field versus address-only presentation —
   targeted field mapping scan.
5. Status count source, freshness, and tab relationship — targeted scan; no
   count implementation yet.
6. Appointment-time list display and timezone semantics — Appointment/list
   evidence gate.
7. Distance source, permission, units, and stale-value policy — platform and
   business evidence gate.
8. Nearby-customer context meaning and privacy/display policy — targeted
   business scan.
9. Direct list contact requirement and MP/App parity — Product Owner/G4
   contact decision; G4-C detail contact does not automatically authorize list
   contact.
10. Bottom navigation destination set and whether it is part of V1 — product
    shell decision.
11. Final card density, exact tokens, state copy, and empty illustration —
    visual review after semantic/shell decisions.

## Audit conclusion

`G4UX_LIST_PARITY_AUDIT = COMPLETE`

`R2_REFERENCE_SCREENSHOT = NOT_SAVED / PII`

`APPLICATION_CODE_CHANGED = NO`

`SHARED_CONTRACT_CHANGED = NO`

`G4-D_STARTED = NO`

The next safe step is not another CSS refinement. It is a product/evidence
decision on the shell plus a targeted semantic contract proposal for only the
capabilities that are both required and sufficiently verified.
