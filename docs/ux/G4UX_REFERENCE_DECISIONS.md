# G4-UX Reference Decisions

Status: Phase A final documentation sync. R2 is the **LOCKED primary brand / visual / IA baseline** for Production UX; R1 remains secondary business/field-service evidence for this scope and remains important evidence elsewhere.

## Reference weighting

| Priority | Source | Role in G4-UX | Boundary |
| --- | --- | --- | --- |
| Primary / LOCKED | R2 `xlink-business-3.0`, pinned main `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185` | Recent redesign/POC covering Login → Home → Work Order List → Work Order Detail; locked primary brand, visual, IA, and interaction baseline. | Reproduce approved product UX in uni-app, not React/Next/Tailwind implementation. |
| Secondary | R1 `xlink-business-jishi-3.0`, pinned `6ada6b5375324bfcd09ca7c569b96a4ff328173f` | Mature Technician field-service business evidence, operational edge cases, and backend/business meaning. | Preserve verified business semantics where needed; do not let its broader Legacy surface define UX parity or architecture. |

The general Program Control rule is unchanged: R1 remains important business/backend evidence in other slices. This priority correction is specifically for the Production UX baseline.

## Locked Product Directions

- **Brand / visual / IA:** R2 is the locked primary baseline for this gate.
- **Login:** reproduce the R2 staged experience — brand launch → login method selection → login form — including its approved branded visual language and interaction hierarchy in uni-app.
- **Home:** reproduce the R2 task-first composition — current work/current task first, with the next meaningful action visually prioritized. Metrics-first is not an active G4-UX alternative.
- **Capability guard:** R2 password Login, OTP send, quick/test Login, or other debug affordances are `UI/DEV BEHAVIOR REQUIRES CONTRACT EVIDENCE` when not supported by accepted auth contracts. This sync does not authorize production auth APIs or shared-contract changes.

## R2-led decision matrix

| R2 exact evidence | Observed design / interaction | Transferable product principle | Mobile adaptation needed | Unsupported capability to omit now | New App decision / owner input |
| --- | --- | --- | --- | --- | --- |
| `web/app/(auth)/login/page.tsx`; `web/components/login/LoginWorkerScene.tsx` | Staged branded launch → method choice → focused form; worker scene, trust cues, labels, inline errors, dominant login action, secondary methods. | Build trust, orient the user, and make the primary next step obvious. | Keep safe-area space and the primary action reachable after keyboard/scroll; use only accepted semantic auth. | Password, quick login, social/QR, test-code shortcut, and send-code behavior without accepted contracts. | **LOCKED:** reproduce the staged R2 Login and its branded visual language/interaction hierarchy. Unsupported R2 auth behaviors are `UI/DEV BEHAVIOR REQUIRES CONTRACT EVIDENCE`; they do not authorize new auth APIs or shared-contract changes. |
| `web/components/AppTabShell.tsx`; `web/components/AppTabBar.tsx` | Visited tab screens stay mounted; URL/deep links remain; fixed bottom Home/Tasks/Projects/Account bar with safe-area padding. | Stable app orientation reduces navigation cost. | Adapt to MP/App safe areas and platform back behavior; do not assume all tabs exist in V1. | Projects/Account destinations and persistent tab-shell behavior without business acceptance. | Product owner must decide whether V1 uses a bottom shell and which destinations are real. |
| `web/components/screens/HomeScreen.tsx`; `TodayKeyMetricsCard.tsx`; `TodayResultCard.tsx` | Hero with identity/date/status; task-first and metrics-first variants; current tasks, result/metric cards, quick actions, explicit empty/loading/error. | Put current work and the next meaningful action above secondary context. | Constrain scroll depth, avoid dense metrics on narrow screens, respect bottom navigation. | Message center, dashboard analytics, trend metrics, task counts, and quick actions not supported by accepted business evidence. | **LOCKED:** use the R2 task-first Home composition; metrics-first is not an active G4-UX alternative. Product decisions remain for exact accepted task data/capabilities and shell details only. |
| `web/app/(app)/work-orders/WorkOrdersInner.tsx`; `web/components/list/ListSearchHeader.tsx`; `ListAdvancedFilterSheet.tsx` | Search header, optional filter button, bottom-sheet filters, role/filter tabs, paginated loading, empty/error/retry states. | Scanning and recovery should be explicit without overwhelming the primary list. | Use one-screen search/filter density; bottom sheet needs safe-area and dismissal behavior. | Search, advanced sort/date filter, multiple tabs, and counts until the current role/business contract accepts them. | Current baseline remains one role-visible list. Product owner must approve any search/filter/tab/count exposure. |
| `web/components/list/ListControls.tsx`; `web/components/list/ServiceCard.tsx` | Cards group type/icon, order number, address/distance, customer, tag, and contact affordance; skeleton/empty/error/load-more are first-class. | Use a predictable scan order and one clear row affordance. | Preserve hierarchy and touch targets; adapt long text and small width; use semantic fields only. | Raw statuses, raw menu labels, workflow-node ids, and richer R2 mock fields not accepted by the new contract. | Adapt card rhythm only after Beta confirms the minimum useful semantic fields and density. |
| `web/app/(app)/work-orders/[id]/page.tsx`; `web/components/detail/DetailShell.tsx` | Back → summary → Quick Actions → workflow context/current task → read-oriented tabs; explicit skeleton, empty/error, and info rows. | Context first; stable actions separate from information; recovery is visible. | Compact summary, platform back, safe-area handling, and scrollable read content. | Dynamic workflow actions, R2 mock data fetching, maps/navigation, and unaccepted tabs/materials/records. | Keep G4-C summary + Quick Actions. Future workflow actions must use Current Action / Current Task. |
| `web/components/WorkflowStepRail.tsx`; `ProjectCurrentTaskCard.tsx`; `ProjectTaskActionSheet.tsx` | Workflow progress, prominent primary task action, secondary actions, and dedicated sheet. | Current business action deserves an independent visual and interaction surface. | Use a sheet/modal/page that is reachable and dismissible on MP/App; retain disabled/in-flight states. | Workflow execution and appointment/inspection actions before their guarded slices. | Lock the independent action-region rule; no implementation in Phase A. |
| `web/lib/project-detail-tabs.ts`; `DetailTabbedSection` use | Tabs group records, customer/order information, and materials; tabs are read-oriented. | Tabs organize information, not business execution. | Use tabs only if content volume justifies them and back/scroll behavior is clear. | Dynamic actions modeled as tabs; tab names/capabilities not accepted by evidence. | Future tabs remain read-only and require a product/feature evidence checkpoint. |
| R2 detail components and global styles | Card surfaces, blue primary actions, compact type hierarchy, restrained borders/shadows, pulse skeleton, bottom navigation. | A coherent visual system improves scanability and confidence. | Re-express with uni-app-compatible tokens and target-safe layout, not copied CSS. | Exact colors, sizes, radii, shadows, icons, and component code as unapproved product decisions. | Values in the production baseline are proposals until human approval. |

## R1 secondary evidence matrix

| R1 exact evidence | Material business meaning added | Decision | Guard against Legacy parity |
| --- | --- | --- | --- |
| `pages/serviceAppointment/serviceAppointments.vue`; `resources/js/common.js` (`getSAMenu`); `resources/js/identityContext.js` | Work Order functions are role/menu scoped; active function determines the business read path. | Preserve the semantic role-visible scope; adapt to a bounded single list. | Do not expose `functionList`, action URLs, storage keys, or menu parsing. Do not claim “My” or “Assigned” without evidence. |
| `resources/technician/mainWorkOrderListContract.js` | Ordinary and SANode rows differ; SANode business identity is nested under the workflow node. | Preserve adapter mapping into semantic WorkOrderSummary. | Workflow-node ids/status/nodeDef/raw data never reach UX. |
| `subpackages/serviceAppointment/components/TechnicianWorkOrderSummaryActions.vue` | Direct phone contact is distinct from contact-only intermediate-number fallback. | Preserve direct phone Quick Action; defer relay/private-number behavior. | Do not call relay APIs or copy raw helper/role logic. |
| `subpackages/serviceAppointment/serviceAppointment.vue` | Legacy combines summary, information tabs, workflow nodes/forms, records, files, and command area. | Preserve the business distinction but simplify the new UX. | Do not copy the combined page architecture or force all Legacy surfaces into V1. |

## Locked interaction rule

- Information regions and future information tabs are read-oriented.
- Customer contact is a stable lightweight Quick Action.
- Dynamic workflow/current-task business actions belong in an independent Current Action / Current Task surface.
- Action execution uses a dedicated sheet, modal, or page when needed.
- Dynamic workflow actions must never be modeled as dynamic information tabs.

## Non-porting rules

R2 and R1 are evidence sources, not implementation templates. The new App must not copy Next/React/Vant/Vuex structure, raw DTOs, endpoint strings, menu storage, status hardcoding, array-index identity, or workaround logic. Business evidence is re-expressed through semantic models, typed boundaries, explicit adapters, and deterministic tests.
