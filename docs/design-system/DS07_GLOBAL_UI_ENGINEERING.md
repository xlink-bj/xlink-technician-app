# DS-07｜全局 UI 工程治理与现有 M1 功能闭环（2026-10-17）

**Stage: engineering baseline; zero business behavior changes and zero global re-skin.**
**Owner gate:** freeze this engineering standard first; page appearance and commercial quality require independent visual acceptance.
**Base:** stacked on DS-06 #151 and the existing M1 Draft. Never merge directly to `main` while upstream review gates remain open.

## 1. Architecture — exactly one visual authority

| Layer | Single owner | Business page may do |
|---|---|---|
| L0 — Foundation semantic tokens | `src/shared/ui/design-system.scss` (`:root,page`) | consume `var(--app-*)`; no new business-owned color, shadow, radius or type scale |
| L1 — UI primitives & states | `src/shared/ui/App*.vue` + its shared style definitions | pass data, event and finite variants; no per-page component re-skin |
| L2 — Domain UX patterns | `ActionWorkspaceShell`, `AppRecordCard`, form layouts, step/action patterns | compose primitives and business data; special interaction must be separately reviewed |
| L3 — Pages & features | work-order list/detail, appointment, inspection, quotation, signing | own information architecture, layout geometry, guard and business state; not visual language |

**Historical bridge:** `mobile-craft-v1.scss` and its `--xl-*` selectors exist for Q01/C01 visual experiments. They are **legacy adapters**, not a second Design System. Their foundational values alias canonical `--app-craft-*` tokens in `design-system.scss`. Do not add any new `--xl-*` variables or make new pages depend directly on `.xl-craft`; promote a reviewed variant into shared App primitives instead. Legacy `--app-color-primary` is intentionally unchanged during this compatibility stage.

**DS-06** dark task card is a bounded visual experiment, *not* an approved brand-global Card or Button variant. Do not globally adopt until product signoff.

## 2. Actual current UI inventory

Current shared library: 27 `src/shared/ui` files (25+ Vue primitives/headers plus style/types). Found two partially duplicative theme namespaces. The following are source-level measurements of CSS color literal occurrences in the H5 stage (hex/rgba only; **counts are debt signals, not UI quality scores**):

| Module | Source | hard-coded CSS hex | rgba |
|---|---|---:|---:|
| Work-order list | `src/pages/work-orders/work-orders.vue` | 85 | 5 |
| Work-order detail | `src/pages/work-orders/detail.vue` | 109 | 1 |
| Q00 catalog/order hub | `src/features/work-orders/quotation/QuotationOrderHub.vue` | 43 | 1 |
| Q01 | `src/features/work-orders/quotation/Q01EntryScreen.vue` | 1 | 1 |
| Shared dynamic form | `src/features/work-orders/components/GenericDynamicFormActionContent.vue` | 6 | 2 |
| Appointment / action time | `src/pages/work-orders/action-time.vue` | 0 | 0 |
| Main action workspace | `src/pages/work-orders/action-workspace.vue` | 0 | 0 |
| C01 read-only signing | `src/pages/work-orders/signing-order-read.vue` | 0 | 0 |

*Scope: style blocks only, snapshot of DS-06 HEAD. JS-defined semantic icons, marketing images and color-coded Workflow states require separate review.*

## 3. Scope of "built-function" end-to-end normalization

First retain and verify M1 existing user path: **login → work order list → detail/current task → appointment → inspection → quotation (Q00/Q01/Q03) → read-only signing C01**, subject to availability and actual implemented paths. Do not claim signing or submit/order writes exist if gates are closed. R1 backend business semantics are unchanged.

A single **component-state matrix** is the primary delivery artifact:
- Button: primary/secondary/text, enabled/pressed/loading/disabled, touch >=44px
- Field: label, required, hint, error, default, focus, readonly, disabled
- Input / Textarea / Selector / Cascade: existing standard API and events only
- Status: semantic warning/error/success/info, not page palette
- Record/Surface: raised/flat/interactive, no new per-page shadow
- Amount: formatted factual source only, no fabricated display values
- Action bar: bottom safe-area + business guard ownership
- Work-order task focus: DS-06 candidate, **not** a new universal palette

The default is to **reuse**; a genuinely special UX pattern requires a design rationale and one shared implementation, not scattered CSS.

## 4. Delivery sequence and the three engineering gates

**DS-07.A — contract & ratchet (this PR):**
- Add one canonical foundation token owner; DS05 theme aliases preserve current screenshot output.
- Record legacy page color-literal counts and an automated **ratchet**: no growth in first active legacy surfaces. This does not declare them acceptable; it blocks additional drift while migration continues.
- Extend `check:ui-governance` so the ratchet executes in the normal CI and local verification.
- No business view is globally restyled and no reference Golden is rewritten.

**DS-07.B — shared components & Gallery:**
- Standardize component state variant APIs, design tokens and actual Gallery screenshots.
- Protect against visual overrides via source-level ownership rule + specific component-state tests. Central component CSS is reviewed once.

**DS-07.C — migrate existing M1 surfaces incrementally:**
- Start **work order list/detail** (currently worst duplicated styling), then appointment/inspection, quotation, signing.
- Each page migration **deletes** obsolete local material rules, does not append another CSS layer.
- Keep all business Workflow guards and existing API interaction untouched.
- For each completed page: real H5 320/375/390, before/after visual audit, interactions/disabled/read-only, no clipped scroll/bar, and MP smoke where supported.
- Ratchet threshold reduced after migration (never increased to conceal debt).

**DS-07.D — close the loop:**
- One M1 end-to-end safe Mock H5 walkthrough, one shared Gallery state audit, one UI-ownership report, visual Master-vs-actual comparisons on representative pages.
- `ENGINEERING_PASS` is distinct from `COMMERCIAL_UI_ACCEPTED`. Product Owner signs off any refreshed visual Golden and cross-device release.

## 5. Non-goals / guardrails

No new business forms, signing/write capabilities, price engine changes, production data requests, catalog mutations, changed Workflow execution semantics, layout redesign or design signoff in DS-07.A. This PR must not force DS-06 navy style on all pages. A green CI cannot substitute for commercial visual quality.
