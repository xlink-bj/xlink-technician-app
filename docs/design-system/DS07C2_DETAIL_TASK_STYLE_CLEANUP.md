# DS-07.C2 — Work Order Detail / Remove Shadow Task Style Authority

Status: Engineering-only cleanup. Real H5, exact work-order task behavior, and product presentation must be checked; no visual signoff or main merge in this Draft.

## Why

DS-06 introduced `WorkOrderTaskFocus.vue`, an independent task module already owning its geometry, colors, CTA feedback and disabled appearance. The former `detail.vue` style block still defined 88 lines of obsolete current-task card, six local task tones and 6 CTA color variants. Those styles silently competed with the real component, defeating the rule “one visual owner”.

## Change

- Remove obsolete `.current-task-card`, `.task-eyebrow`, `.task-title`, `.task-description`, `.primary-task-action` and `.task-action-note` declarations from **the real work-order detail page**. Do not delete `WorkOrderTaskFocus.vue`, its scoped style or business wiring.
- Keep `workflowProjection.currentTask` exact title/action, execution guard, production read-only exception and `handleCurrentTaskAction` exactly as before.
- Tighten the source debt ratchet for `src/pages/work-orders/detail.vue`:
  - Hex 109 → **80**
  - rgba 1 → **0**
  - inline `font-size` 35 → **30**
  - inline `border-radius` 15 → **13**
- Mandatory governance rejects reintroduction of the old task visual selectors into `detail.vue`.

## Visual and behavioral proof

- Work Order Detail H5: real 375/390px DOM/Screenshot Focus from DS-06 test, exact panel 169px, 19px radius, 25px title, 51px CTA and text contrast. Workflow button still routes to same Q00/Q01 experience using Mock; no business writes.
- Historical DS02A screenshot Golden was already deliberately outdated due DS-06 task redesign. **Do not update Golden** in a CSS-owner cleanup. Compare actual PNG with base branch / DS06 candidate for visual non-regression.
- DS01 shared Gallery and full Verify contract should not drift; no MP device acceptance claimed.
- Do not merge stacked Draft PRs automatically.

Next DS-07.C3: review shared search/status/empty form patterns. Prefer extracting proven shared components rather than moving arbitrary screen CSS into a global file.
