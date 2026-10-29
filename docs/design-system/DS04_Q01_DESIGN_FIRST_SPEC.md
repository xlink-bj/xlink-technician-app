# DS-04 · Q01 Design-first implementation contract

**Target:** exactly one first-stage Q01 quotation screen in the real uni-app H5, using the Owner-approved visual reference as inspiration, **not** an additional feature set. Stage 2/3, signing, business logic, APIs and permissions untouched.

## 1. Independent page composition, 390 × 844 CSS viewport
1. Native page chrome: title `新增订单` supplied by existing uni-app route, not redrawn.
2. Compact source-verified work order context; optional real address line only if read model supplies it.
3. Non-dismissable DEV local-draft provenance as a light, single-line trust strip.
4. Horizontal three-stage wayfinding: current Repair Part, following Quotation Items, final Confirmation. Presentation only; no synthetic Workflow transitions.
5. Large, separate `维修部位信息` heading with one sentence of task guidance.
6. Single white form surface: repair-part selector (62px), multiline description (98px), quantity input (56px). Exact three current fields only. Visible 14px field labels and 16px body input text. Fields scroll above the persistent CTA.
7. Quiet secondary catalog / finance information lower in the scroll, not competing with the form. Never suggest discount editing is supported.
8. Safe-area-aware fixed action bar: low-weight local Save Draft and one dominant Next CTA backed by the **existing** validated catalog-navigation handler.

## 2. Baseline metrics
| Element | Design dimension |
|---|---|
| Mobile working viewport | 390 × 844 / 375 × 667; responsive 320px |
| Canvas | foundation neutral page |
| Page horizontal inset | 16px (390 / 375), 12px (320) |
| Title | 23px / 30px, ~750 weight |
| Body input typography | 16px / 24px |
| Form label | 14px / 20px; required red marker only |
| Card radius | 18px; very subtle elevation |
| Control radius | 12px |
| Selector/quantity | >= 52px / 56px |
| Description | 98px, native multiline |
| All buttons | >=44px, Next 52px |
| Bottom safe area | env(safe-area-inset-bottom) |

## 3. Component contract
`Q01EntryScreen.vue` owns **presentation only**: source-supplied Group/Option state and validation messages as props, emits raw field actions upward, owns only picker open/closed UI state. It imports no quotation composition store, API provider, price engine or Workflow routing. Legacy quotation store/controller continues owning all business semantics.

Use only current `repairParts`, `partDescription`, `maintainAreaNum`, existing source-catalog options and existing validation. The reference illustration's fake address, unit picker, sample chips, search, extra media upload and invented catalog category rows **are not** authorized to implement.

## 4. Evidence & acceptance
- Snapshot both **reference and actual H5** in identical 390×844 framing; acknowledge the illustrated reference is a longer/taller device proportion and cannot equal 844px without scrolling.
- Run TypeScript, safety, UI governance and real H5 focused playbook.
- Capture 375/390 front view, opened source-backed cascading selector, and failure of premature Next.
- Do not edit existing Golden snapshot or loosen thresholds. Visually review with Owner: density, hierarchy, quality, and comfortable touch.
- Explicitly **separate code pass from commercial UI acceptance**. No merges without approved screenshot review.
