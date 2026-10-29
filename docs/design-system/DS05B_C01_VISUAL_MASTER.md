# C01 Visual Master V2 — Sign-off Read-only (2026-10-17)

**One actual business page.** Canonical design viewport: 390×844 CSS px; adaptive at 375×667. Design artifact in Lead handoff: `C01_Visual_Master_V2.html` (editable visual source), `C01_Visual_Master_V2_390.png` (rendered reference). This is a review candidate, not a signed-off Product baseline.

## Locked content contract
- Native uni-app navigation remains `签约前订单核验 · 只读`.
- Existing authenticated, source-scoped order information and identity result; preserve contract and signing authorization boundaries.
- Order identifier (may be long), actual `totalPrice` only when source has it, number of repair groups.
- Existing R1 process-stage warning; no reinterpretation of processState.
- Current-stage title, next-step explanation **derived from `signingReviewProgress`**; optional progress 1/3–3/3 shown only when title matches an explicit step index. Otherwise there is no invented stage tracker.
- Contract verification remains DEV-fixture-only; Production remains blocked. Never grant signing, SMS, file or command access in a visual component.
- All diagnostics and business explanations remain present, but below the primary decision hierarchy.

## Design specification / Craft V1 reuse
- Palette from `.xl-craft`: ink #17243A, primary #1769DC, neutral canvas #F7F9FC, white surface, subtle #E7EDF5 outline, neutral caption.
- Native page 390×844; content inset 20px, title ~27px, caption 11–12px.
- Order is the sole **raised** first-viewport card. Header title 14px, identity green badge, order number 13px, money ~28px, group count 11px.
- Stage presentation is **unboxed** and separated from the order with ~26px space; hairline three-segment progress is sourced from explicit stage only; stage heading 18px.
- Contract status is the second material surface, white and low elevation. Its only active CTA in DEV is the existing `readContracts()`, 50–52px, 14px semibold. Production no action. No future-signing CTA.
- Section surfaces, control feedback, money and status use `mobile-craft-v1.scss`; C01 owns spatial layout only.
- 375px must scroll naturally; do not compress typography or suppress required disclaimers to force full content into the first viewport.

## Visual acceptance and truthfulness
Compare **real uni-app H5** (not an illustration) with the 390×844 target: visual salience, baseline alignment, card density, neutral contrast, readable warnings, no truncation of amount and identifiers. Side-by-side test at 390 and 375. Test-only mocks may show `DEV-SYNTHETIC-NOT-SUBMITTED`; never treat their amount as actual money.

**Do not** rebaseline old DS02A visual screenshots, merge stacked Drafts, or claim full commercial visual signoff without Owner review.
