# DS-01 — XLink Commercial UI Foundation v1.0

**Authority:** XLink Technician App / Business Truth → Workflow Runtime → Action Workspace → Action Content → Design System.  
**Status:** engineering candidate. Product visual acceptance remains a separate Owner gate.  
**Basis:** existing `APP_UI_DESIGN_SYSTEM.md`, `ACTION_WORKSPACE_UX_STANDARD.md`, `UI_DELIVERY_WORKFLOW.md`, approved S01 / Appointment, WeUI/Vant/Ant design reasoning (visual references, not runtime dependencies).

## 1. Identity and non-goals

Mature utilitarian enterprise/mobile visual grammar: a clear actionable hierarchy, restrained blue, generous but efficient whitespace, readable Chinese, thumb-ready targets, white work surfaces over cool-neutral backgrounds. Avoid gradients, unnecessary icons, decorative status blocks, fabricated business values, gimmicky animation.

DS-01 is **presentation only**. It cannot decide whether an order can be submitted, whether a workflow progressed, how much a quotation costs, or whether a local save equals a server save. Existing Runtime and adapters remain authoritative; business safety guards stay fail-closed.

Do **not** create another UI library; improve the existing shared UI, Gallery and cross-platform validation. Do not introduce arbitrary feature-level CSS overrides as a way to make a new button look good.

## 2. Foundation / semantic design tokens (frozen interface)

Source: `src/shared/ui/design-system.scss`. Existing `--app-color-*`, typography, spacing, radius and Action Workspace tokens remain the sole semantic source.

| Contract | v1.0 value / relation | Meaning |
| --- | --- | --- |
| Primary | `--app-color-primary: #2878f2` | one dominant action |
| Page/Surface | `#f3f6fa` / `#fff` | low-noise workspace |
| Primary text | `#1d2b40` | high-contrast headings / actions |
| Border / disabled | existing semantic color tokens | no feature-specific greys |
| Button compact | `88rpx` minimum physical target on 375px design viewport (44 CSS px) | dense but touch-friendly |
| Button regular | `--app-control-height: 88rpx` | default; backwards compatible |
| Button large | `100rpx` | prominent single-action CTA |
| Button radius | `--app-radius-control: 14rpx` | no per-page radius |
| Button weight | 750 | short Chinese labels readable |
| Press feedback | restrained opacity + 120ms transition | no scale or disruptive shift |
| Action Bar | `--app-color-surface`, `--app-color-border` | visual separation from scroll |
| Safe area | `16rpx + env(safe-area-inset-bottom)` | platform-aware bottom clearance |
| Action gap | `--app-action-bar-gap` | predictable dual action |

**Calibration caveat:** rpx equals the expected CSS-pixel reference only when converted by the target uni-app runtime and design width. Check 320/375/390 H5 and MP simulator. H5 PASS does not prove iOS/Android or keyboard handling on device.

## 3. Commercial Button API and visual anatomy

**Production component:** `src/shared/ui/AppButton.vue`, exported from `src/shared/ui/index.ts`.

- `variant = primary | secondary | text`. Primary = one dominant task CTA; Secondary = safe alternative; Text = low-emphasis local action.
- `size = compact | regular | large`, default regular. Compact cannot become a tiny touch target.
- `block` width, `disabled`, `loading`, `pressed`, `ariaLabel`, optional `leading` and `trailing` slots. Default slot is action text.
- Disabled or loading prevents native action **and** guards synthetic `tap`. Never dispatch multiple business commands. The *consumer* owns in-flight/idempotency; the button does not invent a business state machine.
- Long Chinese wraps safely; explicit accessible labels for icon-only or ambiguous actions.
- `Primary/Secondary/Text`, `enabled/disabled/pressed/loading`, three sizes, leading icon and long label are gallery-owned verified states.
- Do **not** add one-off page CSS for common button colors, font sizes, heights, radii, pressed or loading/disabled states. Choose semantic props.

## 4. Action Bar contract

**Production component:** `src/shared/ui/AppActionBar.vue`, embedded into the existing `ActionWorkspaceShell` footer.

- `layout = single | dual`, `label`, `preview` (review-only in Gallery). Slot holds real shared actions; no hard-coded CTA text, click handler, Save state or workflow commands.
- Normal Bar is an **in-flow footer inside the Workspace shell**, not a floating `position: fixed` overlay in an individual business component.
- `ActionWorkspaceShell` owns scrolling, viewport sizing and safe-area integration; `ActionWorkspaceFormActions` continues to own the established Save/Complete projection and distinct lifecycle.
- Primary is the dominant action; dual layout places Secondary before Primary. Disabled and loading states are props rendered from Runtime capability.
- Field-local action remains field-local. Local draft autosave, explicit Save and workflow Complete/Submit must not be conflated.
- Action Bar is presentation-only, so it is safe to share across Appointment, Survey and Quotation; it cannot authorize any write.

## 5. Mandatory evidence and production gates

1. **Governance:** `pnpm run check:ui-governance` checks component API presence, Gallery coverage and actual Workspace reuse.
2. **Unit/type/boundaries:** `pnpm run verify`, MP and App builds; no new production dependencies.
3. **True uni-app H5 Gallery:** `pnpm run test:uni-h5-review`, real shared components, 320/375/390, all Button variants/states, click guard, safe-area-ish footer geometry, long Chinese, no horizontal overflow or outside network.
4. **Review artifact:** screenshots `ds01-buttons-*.png`, `ds01-action-bar-*.png`, default Gallery screenshot set from actual compiled uni-app H5, plus real main-App smoke regression.
5. **Cross-platform:** `pnpm run build:mp-weixin-review` and existing calibration rubric. MP simulator **visual inspection is mandatory** for shared control geometry/token changes; real devices and keyboard/safe-area scenarios remain a separate release gate.
6. **Owner gate:** real-screen visual comparison with approved Appointment/S01 direction. Code PASS, screenshot generation or simulator build alone are **not** `COMMERCIAL_UI_ACCEPTED`.

## 6. Migration and exceptions\n\nDS-01 governance scans business Vue/SCSS and prohibits **new** selectors targeting `.app-button` visual anatomy. Existing selectors are frozen by per-file counts; a UI migration can only keep or reduce them. It deliberately does not prohibit correct semantic `AppButton` usage or hard-fail legacy screens.

DS-01 uses backward-compatible default Button API. Existing CSS overrides in Quotation and specialized screens are tracked as legacy debt, **not certified as DS-01 consumers by default**. Do not rewrite all Q00–Q03 in this scope. On the next touched business screen, choose shared Button/Action Bar first; if a proven domain variant cannot fit, document and test the exception rather than copy/paste new visual CSS.

**Definition of Done:** complete CI on exact final head; gallery visual review; MP simulator calibration; no broken S2 quotations, Survey Save/Complete or protected backend boundaries; Owner signoff before adopting as visually frozen production baseline.
