# M1 S2 · Taste-driven Commercial UI Audit (Owner)

**Current product outcome: COMMERCIAL_UI_NOT_YET_ACCEPTED.** Previous `CODE_PASS`, 53 H5 regressions and 24 screenshot captures are engineering evidence, **not** proof of premium production UX.

## Source and implementation
- External user-provided source: [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill), pinned commit `a60a36dc2bb3bb77ccf17f2f62041f5ca8a458b9`.
- Selected: `redesign-existing-projects` and `minimalist-ui`, both vendored unchanged in `skills/taste-*/SKILL.md` with MIT notice; default `design-taste-frontend` is for public/marketing pages, **not** our technician mobile App.
- Working method: **scan → diagnose → targeted real-component fix → matched-viewport screenshot → visual judgment → H5/MP/App regressions**. Do not use random photo/font generators, marketing bento layouts, or unrelated framework replacements.
- Read `skills/xlink-s2-commercial-taste/SKILL.md` before any S2 frontend changes. The existing `skills/xlink-r2-frontend-qa/SKILL.md`, App Design System and approved Appointment UX remain authoritative for mobile geometry and actual interactions.

## Actual H5 evidence: the 390×844 and 375×667 12-frame sheets

Review input: [S2 #126 review artifact at successful HEAD 334e133f](https://github.com/xlink-bj/xlink-technician-app/actions/runs/38428279113/artifacts/11829397708). All frames are DEV source-modeled synthetic data. No live Production screenshot or backend write.

| Stage | Screens | Visual finding | Priority/status |
| --- | --- | --- | --- |
| Login | Existing smoke | User-approved; do not alter without an observed regression | ACCEPTED BASELINE |
| WorkOrder | 01 | User-approved real work-order list and navigation | ACCEPTED BASELINE |
| Appointment | 02 | User-approved reference: concise primary task, clear fields, bottom action | ACCEPTED BASELINE |
| Survey | 03–04 | Full dynamic form exists, but some media selectors/field states remain plain engineering controls. Verify touch geometry, meaningful media states and first screen focus without inventing dynamic fields | S2 REWORK REQUIRED |
| Quotation | 05 | Empty state is dominated by a pale-blue illustration, repeated explanation and decorative 3-step card stack; primary `添加维修部位` action comes late. Overuse of gradients/shadows, nested cards vs actual task | **P0 VISUAL; first Taste-informed code slice in #126** |
| Catalog | 06 | Product cards and tabs are functional but dense; scan SKU eligibility and price/unknown states without misrepresenting Price/Order | S2 REWORK REQUIRED |
| Quote group | 07 | Control density and nested group hierarchy need user-centered review, especially 375px footer and keyboard states | S2 REWORK REQUIRED |
| Signing | 08–12 | The developer signing scenario harness is **not** the product signing UX; only screens 11/12 are the actual guarded Order/Contract read component. DEV/source jargon overpowers status in several sections | S2 REWORK REQUIRED |

## Concrete initial change — actual Quotation Empty State
Path: `src/features/work-orders/quotation/QuotationActionContent.vue`.
- Preserve selected-group Port, `quotation-add-group` action, all disabled/read-only/writer gates and mock provenance.
- Move `添加维修部位` to the primary focal position directly after short contextual copy.
- Reduce decorative blue box image to a low-emphasis secondary detail; flatten oversized gradient/shadow stacks and empty card minimum height.
- Use existing semantic Design System tokens, no new font/icons, no external images or dependencies.
- Preserve operator state copy: `本机报价草稿`, `未提交后台` where applicable, and no fabricated official Order.

## Product acceptance definition
**Every priority surface** must meet all criteria with actual matching-viewport screenshots: (1) the technician sees the current task and action immediately; (2) no dense DEV/R1/Mock diagnostics dominate the screen; (3) clear type/spacing/control hierarchy using the same accepted Appointment grammar; (4) empty, pending, error, saved and read-only are visually distinct; (5) buttons/scroll/keyboard/safe area work at 375/390; (6) R1/real role/Order/Contract safety is preserved.

Track the difference explicitly:
- `ENGINEERING_CODE_PASS`: typecheck, full unit tests, 53 H5 regression, MP/App build.
- `SCREENSHOT_PIPELINE_PASS`: deterministic 12 frames at two widths with no external requests.
- `COMMERCIAL_UI_ACCEPTED`: **Owner visually approves real user tasks after inspecting screenshots**. Neither previous state implies this one.

## Main plan and next
- #1 S1 source-backed engineering locked; live-read evidence #124 remains open and separate.
- **#2 S2 ACTIVE / VISUAL QUALITY GATE OPEN**. Current: Taste integration + first actual Quotation empty-state redesign. Next: inspect new screenshots and iterate on Survey media, Quotation catalog/group, actual Signing read UI.
- #3 S3 WeChat DevTools/device QA: not started.
- #4 S4 authorized read-first + business-write integration: not started; no Production writes.
