# DS-05 · Mobile Craft V1 / Two-Page Transfer Test

Status: **engineering candidate, neither page accepted**.
Reference: `Q01_Visual_Master_V2.html`, `Q01_Visual_Master_V2_390x844.png`, `Q01_Visual_Master_V2_SPEC.md` (2026-10-17 Owner-reviewed direction; precise master exists in the project deliverables). Target 390×844 and 375×667.

## Engineering contract

**Visual ownership:**
- `src/shared/ui/mobile-craft-v1.scss` provides all shared palettes, fonts, spacing, surfaces, control states, badges, progress, action and read-only rows under opt-in `.xl-craft`; no changes to existing non-pilot screens.
- `AppCraftHeading.vue` defines reusable title/eyebrow/subtitle typography. Both Q01 and C01 render it, with content supplied by their business container.
- Real Q01 only lays out the exact original three editable fields and source-backed cascade; it does **not** own price/authorization/API/Workflow. The 3-stage cue is visual, not business state.
- Real C01 signing read-only page reuses precisely the same tokens, header and surface grammar. All signing read models, contract warnings, source traceability, disabled actions and no-write policies are preserved.

**Do not re-invent UI in C01:** no local color palette, new button grammar, separate card border/shadow rules or new status meanings. Layout positioning/spacing can be local; visual treatment must come from common classes.

**Component State Matrix (mandatory before graduation):**
1. Button: default/pressed/disabled/loading, >=44px physical target, 52px primary.
2. Field: idle/placeholder/filled/focus/error/disabled; minimum 4.5:1 placeholder contrast on `#F1F5FA` (V2 is ~4.55).
3. Selector: source unavailability, native cascade, backing-data truth, dismiss and no fake items.
4. Surface and status: white raised surface; destructive/warning semantics retained (C01 is always read-only).
5. App typography: fixed role sizes/weights, tabular financial values, no page-owned brand colors.
6. Footer: safe area, focus/keyboard behavior, main action priority; no unauthorised submit.

## Gates

A — **CODE**: Validate quick, typecheck, UI governance, DS05 source contract; no new writes.
B — **LIVE VISUAL**: real uni-app H5 screenshots **both Q01 and C01**, 375/390. Real screenshot must be visually reviewed; Snapshot pixel diff is not an aesthetic acceptance criterion. Do not quietly rebaseline existing DS02A.
C — **PRODUCT**: Owner confirms real H5 Q01 is faithful to V2, *then* Owner reviews second-page C01 generated using the **same** approved shared rules. Any C01 redesign of shared components must require an explicit Design System change proposal affecting both pages.
D — **ROLL OUT**: only after both A-C fully pass. Scope thereafter extends to a third page with mostly composition work, not token reinvention.

**Forbidden:** merging stacked Draft branches to main, Production business writes, fabricated contract states, fake unit types, silent Golden promotion or claiming COMMERCIAL_UI_ACCEPTED from green CI alone.
