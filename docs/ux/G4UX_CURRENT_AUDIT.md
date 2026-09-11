# G4-UX Current Audit

Status: Phase A evidence baseline only; no product UI changes are included in this phase.

Audit baseline: `c0128a06fff271532d0e88f04d44066cf192ddd4`

## Method and scope

This audit uses the accepted application source plus targeted, read-only review of the pinned R1 Technician application and pinned R2 Web application. It separates:

- **FUNCTIONALLY ACCEPTABLE** — the current slice demonstrates the accepted behavior and boundary.
- **NOT PRODUCTION UX** — the behavior may be correct, but the copy, hierarchy, density, states, or visual treatment is not yet a release-quality baseline.

The current app is a foundation/vertical-slice implementation, so absence of later-slice behavior is recorded as a gap, not silently filled from Legacy.

## Evidence sources

### New application

- `src/pages/index/index.vue` — bootstrap, Login, and temporary authenticated Home.
- `src/pages/work-orders/work-orders.vue` — role-visible list and list states.
- `src/pages/work-orders/detail.vue` — detail information and Quick Actions.
- `src/features/session/login.ts`, `src/shared/state/session.ts` — bounded session behavior.
- `src/app/bootstrap.ts` — composition and bootstrap entry.
- `src/pages.json`, `src/manifest.json` — page/navigation and safe platform configuration.
- `docs/verification/G4C_DETAIL_CONTACT.md` — accepted contact and Detail Interaction Rule.

### Pinned R1 — `xlink-business-jishi-3.0`

Pinned SHA: `6ada6b5375324bfcd09ca7c569b96a4ff328173f`

- `pages/serviceAppointment/serviceAppointments.vue` — role/menu-scoped list, search, tabs/counts, cards, refresh and empty states.
- `subpackages/serviceAppointment/serviceAppointment.vue` — detail composition, information tabs, workflow rail/command area and sheets.
- `subpackages/serviceAppointment/components/TechnicianWorkOrderSummaryActions.vue` — summary hierarchy and direct-phone versus fallback contact behavior.
- `resources/technician/mainWorkOrderListContract.js` — ordinary and SANode list shapes.
- `resources/js/common.js` (`getSAMenu`) — legacy menu derivation evidence.
- `resources/js/identityContext.js` — legacy session/role/menu context evidence only.

### Pinned R2 — `xlink-business-3.0` Web

Pinned main SHA: `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185`

- `web/app/(app)/work-orders/[id]/page.tsx` — summary, quick actions, workflow context, read tabs and states.
- `web/app/(app)/projects/[id]/page.tsx` — current-task/action composition.
- `web/components/WorkflowStepRail.tsx` — workflow progress information architecture.
- `web/components/project/ProjectCurrentTaskCard.tsx` — primary/secondary action hierarchy.
- `web/components/project/ProjectTaskActionSheet.tsx` — independent action surface.
- `web/lib/project-detail-tabs.ts` — information-tab structure.

R1 is business/field-service evidence. R2 is an interaction and IA reference only. Neither source authorizes copying its storage, menu, Vuex, React, or component architecture.

## Screen audit

| Screen | FUNCTIONALLY ACCEPTABLE | NOT PRODUCTION UX / current gap | Phase A target implication |
| --- | --- | --- | --- |
| Login and bootstrap | Phone + verification-code inputs, semantic login flow, loading and feedback, double-submit protection, and a non-interactive `unknown` bootstrap state exist. | Copy is engineering-facing (`Technician App`, `Preparing secure session`, `Checking for an existing session…`). There is no product identity/reassurance hierarchy, shared input system, skeleton, safe-area treatment, or documented keyboard/error presentation. | Adopt a calm branded sign-in surface with explicit bootstrap/loading, inline validation, clear in-flight state, and production copy. |
| Home | Authenticated access is guarded; the user has a clear Work Orders entry and can sign out. No Home business data is falsely claimed. | It is a temporary single-card landing shell. `Technician Home`, `Role-visible Work Orders`, and `Open the current role's default list` read like implementation/authorization terms, not a technician workbench. There is no stable navigation chrome, identity context, safe area, or production empty/availability treatment. | Keep Home small, but give it a product-level workbench hierarchy and a human-readable, evidence-backed Work Orders label. |
| Work Order List | One role-visible list is implemented with loading, success, empty, retryable, terminal, manual retry/refresh, load-more, and semantic row navigation. Tabs/counts were not invented. | Rows expose only the intentionally small `id`/optional title model, so the page has weak business hierarchy and density. Loading is text-only; there is no skeleton or pull-to-refresh baseline. `Role-visible Work Orders`, `Default list for the current role`, and `Open Work Order detail` are development copy. Touch-target, long-title, safe-area, and status treatment are not production-defined. | Preserve the single business-correct role-visible scope; improve hierarchy only with evidence-backed fields and define consistent list states. Do not add Legacy tabs/counts by visual pressure. |
| Work Order Detail | Semantic WorkOrderId navigation, normalized detail, loading/retry/terminal/session-invalid behavior, masked contact display, and direct-phone Quick Action are present. Information and action regions are separate. | The page is sparse and English engineering copy is visible (`Work Order Detail`, `Quick actions`). Loading has no skeleton; long address wrapping, status emphasis, page-level navigation, and safe-area rules are not defined. A phone value that cannot be masked by the accepted pattern can leave an action without useful display context. No dynamic workflow action or information-tab execution is present, which is correct for G4-C. | Retain the summary/read surface and independent Quick Actions seam. Establish production detail hierarchy and states without embedding workflow actions in information content. |
| Customer Contact presentation | Direct dial is available when a normalized phone exists; contact-only fallback is not invoked. Phone display is masked and the phone is not placed in navigation or logs. | The direct action is not yet visually standardized across targets. Relay/private-number behavior remains UNKNOWN/deferred. Masking and availability behavior for unusual phone shapes need Beta evidence. No real call should be used as visual verification. | Keep contact as a stable lightweight Quick Action outside information cards; show masked data and an explicit unavailable state. |

## Cross-screen findings

Current functionality is sufficient to demonstrate the G4-A/G4-B/G4-C boundaries, but it is **not a production UX baseline** yet:

- Page styles repeat local colors, spacing, typography, cards, and buttons instead of using a product-specific token vocabulary.
- Most copy exposes implementation concepts (`role-visible`, `session`, `terminal`, `default list`) rather than technician intent.
- Loading is primarily text-only; skeleton, empty, retryable, terminal, session-invalid, and in-flight treatment needs one consistent visual language.
- Safe-area padding, native back behavior, minimum touch targets, keyboard behavior, long text/address wrapping, and small-screen density are not explicitly defined.
- The current semantic contracts intentionally omit many R1 fields. This audit does not authorize adding status, customer, appointment, or tab/count data without an evidence checkpoint.
- Home → List → Detail navigation works as a narrow slice; a broader shell, workflow Current Action, and later business pages remain out of scope.

## Accepted interaction boundary

The G4-C decision remains active:

- Information areas and future information tabs are read-oriented.
- Customer contact is a stable lightweight Quick Action.
- Dynamic workflow/current-task actions belong in an independent Current Action / Current Task surface, with a dedicated sheet, modal, or page.
- Dynamic workflow actions must never be modeled as information tabs.

## Remaining UX UNKNOWNs

These require approved beta observation or product review; they are not inferred from layout alone:

1. Real beta density, nullability, and the minimum useful list/detail field set for each role-visible function.
2. Whether any role requires a search, multiple functions/tabs, counts, or special ordering in V1.
3. Exact user-facing status labels and visual severity mapping for normalized statuses.
4. Phone masking behavior for non-standard values and whether contact-only relay is required in a later guarded slice.
5. MP, Android, and iOS differences in safe areas, keyboard, back navigation, and touch-target rendering.
6. Approved brand assets, Chinese production copy, iconography, and final accessibility/contrast acceptance.
