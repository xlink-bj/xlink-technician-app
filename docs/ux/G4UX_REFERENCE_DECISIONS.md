# G4-UX Reference Decisions

Status: Phase A decision record. This document records product/interaction decisions; it does not port reference implementation architecture.

## Reference policy

| Source | Role in this rebuild | Technical rule |
| --- | --- | --- |
| R1 `xlink-business-jishi-3.0`, pinned `6ada6b5375324bfcd09ca7c569b96a4ff328173f` | Authoritative business and mature mobile field-service evidence. | Reuse verified business meaning and state evidence; re-express it through semantic contracts and explicit adapters. |
| R2 `xlink-business-3.0`, pinned main `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185` | Visual/IA/interaction reference for detail hierarchy and action placement. | Do not copy React code, routing, data model, styling implementation, or component architecture. |

## Decision matrix

| Source and exact evidence | Observed UX / interaction | Business reason | Decision | New App decision |
| --- | --- | --- | --- | --- |
| R1 `pages/serviceAppointment/serviceAppointments.vue`; `resources/js/common.js` (`getSAMenu`); `resources/js/identityContext.js` | Work Order functions are derived from the current role/menu; active function controls the list query. | A technician sees role-visible work, not an arbitrary global list. | **Preserve / Adapt** | Keep one bounded role-visible list for V1. Normalize only the semantic scope required by the current role. Never expose `functionList`, raw action URLs, storage keys, or menu objects. |
| R1 `pages/serviceAppointment/serviceAppointments.vue` | Search, tabs, counts, cards, pull-to-refresh, pagination, and empty states exist in the mature app. | These can support operational triage, but their exact V1 contract is role/menu dependent. | **Simplify / Verify** | Do not add tabs, counts, search, or special ordering until accepted evidence proves they are required. A single useful role-visible list is the current baseline. |
| R1 `resources/technician/mainWorkOrderListContract.js`; `pages/serviceAppointment/serviceAppointments.vue` | Ordinary rows and SANode rows have different shapes; SANode business data is nested under the workflow node. | The user needs the service-appointment/work-order identity, not the workflow-node identity. | **Preserve / Adapt** | Adapter-owned mode-aware mapping produces semantic WorkOrderSummary. Workflow node ids/status/nodeDef/raw data stay internal. |
| R1 `subpackages/serviceAppointment/components/TechnicianWorkOrderSummaryActions.vue` | Detail summary emphasizes order number, customer, address, status, and direct contact when phone exists. | A field technician needs identity and context before taking an action. | **Preserve / Adapt** | Keep a compact semantic summary. Add fields only after a G4 slice evidence checkpoint; do not copy raw status codes or the full Legacy card. |
| R1 `TechnicianWorkOrderSummaryActions.vue`; detail contact call sites | Phone present → direct contact. Contact identifiers are used by the no-phone intermediate-number path. | Direct contact is the shortest verified path; fallback has separate backend behavior. | **Preserve / Simplify** | Direct phone is the only implemented G4-C contact action. Contact-only relay/private-number behavior is UNKNOWN/deferred and must not be invented. |
| R1 `subpackages/serviceAppointment/serviceAppointment.vue` | Detail includes workflow-node/form views, dynamic records, album/files, and a bottom command area. | The legacy detail combines information and workflow operations. | **Adapt / Drop for now** | Preserve the business distinction, not the combined implementation: information remains read-oriented; workflow actions wait for the independent Current Action / Current Task surface. |
| R1 `resources/js/identityContext.js` | Role/session/menu context is persisted in legacy storage and reused by pages. | Role-visible behavior depends on current authenticated context. | **Preserve meaning / Drop implementation** | Keep session-scoped semantic state through the new ports/store. Do not reproduce legacy keys, synchronous storage, or menu parsing. |
| R2 `web/app/(app)/work-orders/[id]/page.tsx` | Summary / Quick Actions are followed by workflow context and read-oriented detail tabs. | Context and actions should be discoverable without making every information row executable. | **Preserve / Adapt** | Detail summary and Quick Actions remain distinct from information content. Current G4-C intentionally stops before workflow context. |
| R2 `web/app/(app)/projects/[id]/page.tsx`; `web/components/WorkflowStepRail.tsx` | Summary/Quick Actions → WorkflowStepRail → current task card → action sheet → detail tabs. | Current work is visually separated from historical/reference information. | **Preserve as IA reference** | Future workflow action placement follows this independent action-region rule. No current-task implementation is authorized in G4-C or this Phase A. |
| R2 `web/components/project/ProjectCurrentTaskCard.tsx`; `ProjectTaskActionSheet.tsx` | Primary action is prominent; secondary actions are grouped; execution opens a dedicated sheet. | Action hierarchy prevents accidental mixing of status information and business execution. | **Preserve / Adapt later** | Use a future Current Action / Current Task surface. Do not put dynamic workflow actions inside information tabs. |
| R2 `web/lib/project-detail-tabs.ts`; `DetailTabbedSection` use in detail page | Tabs group records, customer/project information, order information, and materials/documents. | Tabs organize read content and reduce a long detail page. | **Adapt** | Future tabs, if needed, are information/read surfaces only. Tab presence and names require G4 evidence; no dynamic action executes from a tab. |
| R2 detail page and `DetailShell` usage | Back navigation, summary card, loading pulse, empty/not-found, and error cards are explicit. | Users need stable orientation and recoverable states. | **Adapt** | Define one cross-target baseline for back, skeleton, empty, retryable, terminal, and session-invalid states using uni-app semantics, not R2 code. |
| R2 `ProjectCurrentTaskCard.tsx` visual treatment | Strong title/description hierarchy, one full-width primary action, bounded secondary action grid. | The next meaningful action should be obvious. | **Adapt** | Reserve this hierarchy for the future action surface. G4-C only uses the lightweight contact Quick Action. |
| R1 mobile cards plus R2 card/surface treatment | Surfaces separate work items and context from the page background. | Density and scanability matter in field work. | **Adapt** | Use a small token system for surfaces, spacing, borders, type, and touch targets. Do not copy Tailwind/React/Vant implementation. |

## Product decisions for the new App

1. **Business truth versus technical implementation:** R1 determines required business behavior only after targeted verification. The new App uses semantic models, typed boundaries, and explicit adapters.
2. **List scope:** The current V1 default is a role-visible Work Order list. “My Work Orders” and “Assigned Work Orders” are not accepted labels unless future evidence proves those meanings.
3. **Information versus action:** information cards/tabs are read-oriented. Current workflow/task actions are independent and belong to a dedicated action surface.
4. **Contact:** direct phone is a stable Quick Action when a normalized phone exists. No-phone relay/private-number behavior remains deferred.
5. **States:** loading, empty, retryable, terminal, session-invalid, and in-flight states are product surfaces, not raw error/transport displays.

## Non-porting rules

The new App must not copy R1/R2 menu parsing, storage keys, Vuex/React state, raw DTOs, endpoint strings, status hardcoding, array/index identity rules, component trees, or workaround structure. Evidence is converted into bounded semantic decisions and then verified in the new architecture.
