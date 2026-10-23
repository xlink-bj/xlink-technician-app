# DS-07.B — Standard UI Components: State and Ownership Contract

Status: **Draft / engineering candidate**. This is component readiness for an existing M1 project, NOT whole-app commercial visual signoff and NOT a new global redesign.

## One authority, one gallery

- **Canonical values**: root `--app-craft-*` in `src/shared/ui/design-system.scss`.
- **Component material owner**: `src/shared/ui/component-craft.scss`; it styles existing `App*` primitives ONLY within the explicit `AppVisualScope mode="craft"`.
- **Legacy compatibility**: `mobile-craft-v1.scss` retains `--xl-*` as root aliases for existing Q01/C01. New pages must not use that legacy namespace.
- **Global default**: `AppVisualScope mode="standard"` / unwrapped pages are unchanged. New skin requires visual Owner review and one explicit opt-in; it will not quietly retheme production.
- **Design review**: `__review/design-system-craft-matrix.vue` displays the **actual exported shared App primitives** and deterministic fixture texts; route is H5 review-only, not production pages.

## State matrix

| Primitive | Existing public API / caller-provided truth | States shown in Craft Gallery | Visual/UX contract |
|---|---|---|---|
| AppButton | variant, size, shape, block, elevated, disabled, loading, pressed, tap | primary, secondary, text, pressed, disabled, loading | >=44px touch; primary #1769DC with white text; no action for disabled/loading; interactive feedback |
| AppField | label, required, optional, supporting, error | required, normal, error, readonly (through child) | label 14px; semantic red on required/error; no page-owned typography |
| AppInput | modelValue, placeholder, disabled, readOnly, error, update | empty, filled, focused, error, disabled, readonly | 53px, surface #F1F5FA, 12px radius, canonical focus/error stroke |
| AppTextarea | modelValue, placeholder, disabled, readOnly, error, autoHeight, update | multiline, helper, error/disabled from common control rules | 96px review fixture; native autoHeight behavior remains caller-owned |
| AppSelector | selected, value, placeholder, disabled, readOnly, error, tap | empty, selected, readonly, disabled, error | >=53px target; caller supplies verified options, no fabricated selection |
| AppStatus | tone, variant, message, icon, quiet | neutral, success, warning, danger | explicit caller-provided information, no autonomous state changes |
| AppRecordCard / AppSurface | slots, interactive/layout/tone, compact | neutral raised surface, regular content | one 16px radius + canonical shadow; navigation belongs to caller |
| AppActionBar | layout, preview, elevated, label, slots | two-button preview, secondary/primary separation | full-width safe area still owned by Workspace; no business actions inside component |

## Engineering invariants

1. **Do not change component business/event APIs** in DS-07.B; styling is centralized and opt-in. Shared UI never infers permissions, quotations, status or successful submissions.
2. **Business pages own composition, never re-skin** buttons, form controls, cards, notices or action bars. Any genuinely unique interaction must document why it cannot use an existing component; propose a shared variant only after the second consumer.
3. **Component design is tested once** in Gallery at H5 320 / 375 / 390 including computed color, radius, error/focus state, CTA touch size, tap/disabled behavior, and a non-opted consumer that remains visually unchanged.
4. **Contrast:** canonical #1769DC with white text ~5.13:1. Check via real computed H5; never accept plain visual guesses.
5. **Cross-platform trigger:** changing shared primitive layout or styles requires MP-WEIXIN calibration before release as per `UI_DELIVERY_WORKFLOW.md`. The DS01 workflow builds MP Review for this candidate, but does not claim device-level signoff.
6. **Style debt ratchet** remains active from DS-07.A: no increasing inline UI paint/typography and no growing App primitive override selectors.

## Existing M1 migration after this gate

- DS-07.C first: work-order list/detail; remove repeated local CSS paint instead of overlaying more rules.
- Then appointment and inspection; last quotation/signing. Preserve the existing R1-backed data, role/workflow permissions and Mock-only constraints.
- Each page may first opt into `AppVisualScope`, **but only after UI screenshot review**; do not infer one global approval.
- Reduction in legacy style-debt baseline follows every accepted migration; never raise it to hide violations.

## Acceptance

**B Engineering Gate:** code governance + typecheck + Gallery screenshot/interaction test + visual screenshots H5 320/375/390. **B Visual Gate:** Owner reviews actual Gallery before promoting a new default. Real M1 workflow closure waits for DS-07.C/D; avoid claiming otherwise.
