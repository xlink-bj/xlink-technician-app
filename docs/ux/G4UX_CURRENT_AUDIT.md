# G4-UX Current Audit

Status: Phase A documentation correction; no product UI changes are included.

Audit branch baseline: `c0128a06fff271532d0e88f04d44066cf192ddd4` before this documentation correction.

## Reference priority for Production UX

For this G4-UX scope the priority is:

1. **Primary UX / visual / IA reference:** R2 — `xlink-business-3.0`, pinned main `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185`.
2. **Secondary reference:** R1 — `xlink-business-jishi-3.0`, pinned `6ada6b5375324bfcd09ca7c569b96a4ff328173f`.

R2 is the recent redesign/POC covering the same current surface: Login → Home → Work Order List → Work Order Detail. R1 remains important business, field-service, and backend evidence for other slices; it is secondary only for this Production UX baseline because its mature product is older and materially broader.

## Audit method

This audit distinguishes:

- **FUNCTIONALLY ACCEPTABLE:** source behavior and accepted architectural boundary are demonstrated.
- **NOT PRODUCTION UX:** the behavior may be correct, but current copy, hierarchy, density, state treatment, or rendering is not release-ready.
- **FUNCTIONAL BLOCKER:** the source path exists but the current target rendering cannot be traversed.

R2 evidence was read, not inferred from component names, across the complete current surface:

- `web/app/(auth)/login/page.tsx`
- `web/components/login/LoginWorkerScene.tsx`
- `web/components/AppTabShell.tsx`
- `web/components/AppTabBar.tsx`
- `web/components/screens/HomeScreen.tsx`
- `web/components/dashboard/TodayKeyMetricsCard.tsx`
- `web/components/dashboard/TodayResultCard.tsx`
- `web/app/(app)/work-orders/WorkOrdersInner.tsx`
- `web/components/list/ListControls.tsx`
- `web/components/list/ListSearchHeader.tsx`
- `web/components/list/ListAdvancedFilterSheet.tsx`
- `web/components/list/ServiceCard.tsx`
- `web/app/(app)/work-orders/[id]/page.tsx`
- `web/components/detail/DetailShell.tsx`
- `web/components/WorkflowStepRail.tsx`
- `web/components/project/ProjectCurrentTaskCard.tsx`
- `web/components/project/ProjectTaskActionSheet.tsx`
- `web/lib/project-detail-tabs.ts`

## New App source reviewed

- `src/pages/index/index.vue` — bootstrap, Login, and current authenticated Home shell.
- `src/pages/work-orders/work-orders.vue` — role-visible list and list states.
- `src/pages/work-orders/detail.vue` — detail information and Quick Actions.
- `src/features/session/login.ts`, `src/shared/state/session.ts` — bounded session behavior.
- `src/app/bootstrap.ts` — composition and bootstrap entry.
- `src/pages.json`, `src/manifest.json` — page/navigation and safe target configuration.
- `docs/verification/G4C_DETAIL_CONTACT.md` — accepted contact and Detail Interaction Rule.

## Current screen audit

| Screen | FUNCTIONALLY ACCEPTABLE | NOT PRODUCTION UX / blocker | Product implication |
| --- | --- | --- | --- |
| Login / bootstrap | Source contains phone + verification-code fields, semantic login, loading/feedback, double-submit protection, and non-interactive `unknown` bootstrap handling. | **MP functional blocker observed by human review:** on the current iPhone 12/13 Mini Program simulator rendering, the Login card ends after the verification-code field and the primary Sign in action is not visible. The source contains Sign in behavior, but the rendered Login path is therefore not functionally traversable. This audit does not speculate about root cause. Copy is also engineering-facing (`Technician App`, `Preparing secure session`, `Checking for an existing session…`), with no approved brand hierarchy, shared input treatment, or production state design. | Treat MP Login rendering as a G4-UX target functional blocker. Product/engineering must resolve the rendered path before the visual gate can pass. |
| Home | Authenticated access is guarded; a Work Orders entry and sign-out behavior exist; the screen does not falsely claim Home business data. | It is a temporary single-card landing shell. `Technician Home`, `Role-visible Work Orders`, and `Open the current role's default list` are implementation/authorization wording. There is no approved workbench hierarchy, stable shell, safe-area treatment, or production empty/availability treatment. | R2 supplies the primary Home composition evidence. Choose a bounded technician workbench; omit unaccepted dashboard capabilities. |
| Work Order List | Auth guard, one role-visible list, loading, success, empty, retryable, terminal, manual retry/refresh, load-more, and semantic row navigation exist. No Legacy tabs/counts were invented. | Rows use the intentionally small semantic model, so operational hierarchy/density is weak. Loading is text-only; there is no approved skeleton, search/filter treatment, touch-target baseline, or long-text strategy. Current labels expose implementation terms. | R2 is the primary visual/list reference, but its search, filters, tabs, counts, and richer cards are not automatically business-approved for this App. |
| Work Order Detail | Semantic WorkOrderId navigation, normalized detail, loading/retry/terminal/session-invalid behavior, masked contact, and direct-phone Quick Action exist. Information and action regions are separate. | Detail is sparse and uses engineering English copy. Loading has no approved skeleton; long address, status emphasis, safe areas, and cross-target layout need a baseline. No dynamic workflow action or information-tab execution is present, correctly. | Transfer R2’s summary → Quick Actions → information hierarchy. Keep Current Task/Workflow Action independent and deferred. |
| Customer Contact | Direct dial is available when a normalized direct phone exists; contact-only fallback is not invoked. Phone is masked and not placed in routes/logs. | Direct contact visual treatment is not yet approved across targets. Relay/private-number behavior is UNKNOWN/deferred. Non-standard phone masking and no-phone presentation need Beta evidence. | Keep contact as a stable lightweight Quick Action outside information content; never use a real call for UX verification. |

## R2 primary UX observations by screen

### Login

`web/app/(auth)/login/page.tsx` implements a staged mobile flow: branded launch scene with a worker illustration and trust cues, a login-method selection surface, then a code/password form. `LoginWorkerScene.tsx` supplies the visual worker/brand treatment. The form has visible labels, an OTP request affordance, agreement copy, inline errors, a dominant Login button, and secondary method actions. These are observed interactions, not evidence that password, quick login, OTP sending, or agreement policy belongs in the new Technician V1.

Transferable principle: establish trust and a clear next step, then keep the credential form focused. Mobile adaptation: preserve safe-area space, keep the primary action within the initial viewport where possible, and make keyboard/scroll behavior explicit. Unsupported capabilities to omit: password/social/quick login, test-code shortcuts, and any send-code behavior without an accepted contract. Product decisions required: whether the new App needs a launch step, brand assets, agreement copy, or only the accepted phone + verification-code form.

### Home

`HomeScreen.tsx` shows a gradient hero with company/channel, greeting, date, status, and a message affordance. It then selects a task-priority or metrics-oriented composition. The task variant has “今日任务”, empty handling, “今日结果”, and “快捷操作”; the metrics variant has task overview cells, key metrics/trend treatment, and compact quick actions. `TodayKeyMetricsCard.tsx` and `TodayResultCard.tsx` make data comparison a deliberate visual group. `AppTabShell.tsx` keeps visited top-level screens mounted while routing remains deep-linkable; `AppTabBar.tsx` provides a fixed bottom navigation with safe-area padding and Home/Tasks/Projects/Account destinations.

Transferable principle: put current work and the next meaningful action above secondary information, with a stable mobile shell. Mobile adaptation: account for bottom navigation, safe areas, small screens, and scroll depth. Unsupported capabilities to omit: message center, Projects/Account tabs, metrics/trends, quick actions, and task counts unless accepted by business evidence. Product decisions required: task-first versus metrics-first Home, whether a bottom shell is V1, approved greeting/brand treatment, and which workbench cards are actually supported.

### Work Order List

`WorkOrdersInner.tsx` uses a search header, optional advanced filter bottom sheet, role/filter tabs, paginated cards, full-list skeleton, empty state, error/retry state, and load-more status. `ListSearchHeader.tsx` provides search and filter controls. `ListAdvancedFilterSheet.tsx` groups sorting and date filtering in a bottom sheet. `ListControls.tsx` defines tab/count presentation, empty/error/retry, load-more, phone affordance, and card shell. `ServiceCard.tsx` gives each row a structured card: type/icon, order number, address/distance, customer, optional tag, and phone action.

Transferable principle: make scanning, recovery, and the next row action obvious. Mobile adaptation: retain card scan order, support horizontal overflow only where needed, use a bottom sheet for bounded filters, and preserve safe-area/touch targets. Unsupported capabilities to omit from the new App until accepted: search, advanced sort/date filters, multiple tabs, counts, direct list phone actions, and richer status/tags. Product decisions required: list density, search/filter exposure, tab/count exposure, and which fields are semantically useful for the current role.

### Work Order Detail

`web/app/(app)/work-orders/[id]/page.tsx` composes Back → `DetailSummaryCard` → Quick Actions → optional `WorkflowStepRail` → `DetailCurrentTaskCard` → `DetailContextCard` → `DetailTabbedSection`. Information tabs contain records, customer information, order information, and materials; read sheets and empty panes are explicit. `DetailShell.tsx` supplies the visual language for summary cards, quick actions, current-task primary action, context cards, information rows, tabs, empty panes, and back links. `WorkflowStepRail.tsx`, `ProjectCurrentTaskCard.tsx`, and `ProjectTaskActionSheet.tsx` show the independent workflow/action hierarchy. Loading is a pulse skeleton and failure includes a safe return path.

Transferable principle: establish context first, keep stable Quick Actions discoverable, then separate current business action from read-oriented information. Mobile adaptation: use a compact summary, a dedicated action sheet/modal/page for future actions, scrollable information tabs only when needed, and explicit back/skeleton/error behavior. Unsupported capabilities to omit now: R2 mock workflow execution, dynamic task actions, project-specific context, navigation/maps, records/materials fetching, and extra tabs not supported by the accepted G4-C contract. Product decisions required: whether/when to introduce a bottom tab shell or read tabs, the final summary field set, and the future Current Action surface.

## Cross-screen findings

- Current App functionality demonstrates the G4-A/B/C architecture, but it is not a production UX baseline.
- R2 provides the primary visual rhythm: branded entry, clear hero/section hierarchy, card surfaces, explicit skeleton/empty/error treatment, fixed mobile navigation, summary-first detail, and separate actions.
- Exact R2 colors, radii, typography sizes, spacing, shadows, icons, and component choices are reference observations, not approved new-App design values.
- The current App repeats local styling and engineering copy; its shared production visual language is not yet implemented.
- Safe area, keyboard, back navigation, minimum touch targets, long text/address wrapping, and narrow-device density require product/MP review.
- R1 adds mature field-service meaning and operational edge cases, but its broad tabs/counts/menu behavior must not pressure this App into parity.

## Toolchain note

The branch retains the prior explicit exact-version MP-WEIXIN compiler correction from `c0128a06fff271532d0e88f04d44066cf192ddd4`. It is required for real MP artifact generation and is not reverted or expanded in this documentation-only correction.

## Remaining UNKNOWNs

1. Root cause and fix for the MP iPhone 12/13 simulator Login primary-action visibility blocker.
2. Approved brand assets, Chinese production copy, Login launch/form choice, and Home composition.
3. R2-derived navigation shell choice for V1.
4. Actual Beta list/detail field density, nullability, status presentation, and role scope.
5. Whether search, filters, tabs, counts, or direct list contact are required for any V1 role.
6. Phone masking for non-standard values and future contact-only relay behavior.
7. MP target rendering details versus Android/iOS source/build integrity; device visual parity is G5 scope.
