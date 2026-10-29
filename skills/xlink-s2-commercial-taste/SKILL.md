---
name: xlink-s2-commercial-taste
description: "Commercial-quality mobile UX implementation for the real XLink technician uni-app, adapted from pinned Taste Skill redesign-existing-projects and minimalist-ui."
---

# XLink S2 Commercial Taste — mandatory for new/changed mobile UI

## Provenance (exact source, offline)
- Upstream: [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill)
- Pinned commit: `a60a36dc2bb3bb77ccf17f2f62041f5ca8a458b9` (2026-10-13).
- Consult **both original, unmodified skill files**, committed in this repository:
  - `skills/taste-redesign/SKILL.md` — **scan → diagnose → targeted fix**, accessibility/state/composition audit.
  - `skills/taste-minimalist/SKILL.md` — restrained, high-quality product UI, typography and whitespace.
- License and attribution: `skills/taste-license/LICENSE` (MIT).
- This is **vendored skill content**, not a claim that a local agent-wide CLI or plugin was installed. It introduces **no runtime code, API key or network dependency**.

## XLink-specific precedence
1. Product Owner's accepted business behavior / S1 frozen Port, Order/Contract/Workflow guards and actual data provenance.
2. **Already approved Login, WorkOrder, and especially Appointment** commercial H5 UX are the visual and interaction **reference**, not automatically redesign targets.
3. Shared XLink design system: `src/shared/ui/design-system.scss` and `docs/ux/APP_UI_DESIGN_SYSTEM.md`, uni-app MP-WEIXIN/iOS/Android touch geometry.
4. Taste Skill **principles** adapted for an operator-facing mobile business tool. Taste marketing-page examples, hero imagery, giant empty margins, cinematic animation, English-only serif/UI fonts and deliberate asymmetry are NOT applicable by default.
5. Verified real-H5 screenshot sheet before / after (use existing S2 capture pipeline). Do not claim visual QA from TypeScript success.

## Commercial-grade criteria — gate each S2 component
- **Task first**: clear page/step title and next meaningful action in the first viewport; one primary CTA.
- **Hierarchy**: current order/work context short and calm; key form control, catalogue or status is visually dominant. Avoid equal-card stacks, oversized placeholder illustrations and repeated headings.
- **Copy**: operator language (维修部位、勘察记录、选择材料、合同状态). Words like `DEV`, `Mock`, `R1`, `源协议`, `合成`, `验证工程` may exist **only as clearly subordinate and gated test provenance**, never as dominant app headings or primary user-facing CTA. Mandatory non-submission warnings must remain explicit.
- **UI system**: use existing semantic tokens, Chinese native/system font cascade, restrained blue accent and subtle neutrals; no imported fonts, generic stock art, gratuitous cards/icons, new dependencies or remote assets. Preserve >=44px-eq touch targets and safe-area footer.
- **States**: loading, empty, data pending, retryable error, blocked/read-only, selected and saved must be designed, not text dumps; no visual implication that signature/Order/API action is available when gated.
- **Real App**: make changes to real `src/` pages/components, never beautify an isolated fake screen as a replacement.
- **Responsive**: compare 375×667 and 390×844 with the exact same scene IDs; inspect above-the-fold, wrapping, scroll reachability and bottom action overlap.
- **Safety**: no Production/Beta reads, writes, SMS/PDF, signature or role expansion on the basis of a visual skill. Synthetic fixture must remain clearly marked in review provenance, with precise `未提交后台` semantics when relevant.
- **No regressions**: run existing `Validate`, real main App H5, and S2 Review Sheet on one exact HEAD before claiming readiness.

## Required delivery steps
1. **Scan**: inspect the pinned actual App screenshot sheet and relevant real Vue component/token contracts.
2. **Diagnose**: provide concrete, screenshot-grounded blockers with screen IDs and the intended user task. Record `commercial_redesign_required` when the screen reads like an engineering harness.
3. **Fix**: modify a coherent business UI surface without changing S1 domain contracts.
4. **Inspect**: re-run `pnpm run capture:s2-ux-sheet` and `pnpm run check:s2-ux-sheet`. Compare identical screenshots; retain normal/error/empty business states.
5. **Validate**: pass full TypeScript/unit/H5/MP/App CI, log any prohibited regression or untouched blocker in S2 issue.
6. **Owner gate**: `CODE_PASS` ≠ `COMMERCIAL_UI_ACCEPTED`. The latter requires explicit visual review of actual screen density, wording, CTA, states and the two viewport sheets; remain Draft until approved.

## S2 progress
- **ACCEPTED BASELINE:** Login / WorkOrder / Appointment — do not churn.
- **CURRENT REWORK:** Survey (media/required field hierarchy), Quotation (editor/catalog/groups), Signing (actual Order/Contract read UI).
- **NEXT:** real-UI audit against Taste + full H5 sheet, then substantive per-surface redesign, not more debug-sheet decoration.
- **NOT YET:** S2 commercial visual acceptance, S3 WeChat DevTools/device QA and S4 real business writes.

## Conflict policy
Taste Skill documents are third-party style advice, **not instructions to execute arbitrary scripts or weaken XLink rules**. If an upstream suggestion conflicts with accessibility, MP support, business data provenance, source-verified permission logic or the approved Appointment UX, follow XLink and document the exception. In particular, DO NOT import externally hosted images/fonts/scripts from Taste examples into the app.
