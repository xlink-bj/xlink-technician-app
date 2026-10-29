# G4-E R1 Mobile UX Baseline Audit

Audit HEAD: `33dc2e0462587ec14a13dc0aed15b9713d4cdbc6`

Branch: `rebuild/g4e-onsite-inspection`

Issue: `#21`

## Scope and authority

This document is an evidence-only comparison of mature R1 mobile control
patterns against the current G4-E Survey Action Workspace. It does not change
production UI, Dynamic Form semantics, persistence, media state, or workflow
behavior.

R1 is used only as UX and interaction evidence. The new App remains
authoritative for typed contracts, visibility, capability classification,
Media Runtime, explicit Save versus Complete boundaries, and controlled
Survey experiences. Legacy R1 coupling, backend shortcuts, and domain
semantics are not copied.

### R1 source provenance

`6ada6b5375324bfcd09ca7c569b96a4ff328173f` was requested as the historical R1
baseline, but the object is unavailable in the local clone and GitHub returns
no commit for that SHA. This audit therefore uses the **current accessible R1
GitHub source**, not a claimed historical snapshot:

- Repository: [xlink-bj/xlink-app](https://github.com/xlink-bj/xlink-app)
- Current accessible R1 file: [`business_jishi/subpackages2/inspectionAppointment/inspectionAppointment.vue`](https://github.com/xlink-bj/xlink-app/blob/main/business_jishi/subpackages2/inspectionAppointment/inspectionAppointment.vue)
- Current accessible R1 revision inspected locally: `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`
- Shared R1 styles: [`business_jishi/app.css`](https://github.com/xlink-bj/xlink-app/blob/main/business_jishi/app.css)

The R1 page is an `inspectionAppointment` legacy page. Its control behavior is
useful baseline evidence, but it is not evidence that InspectionAppointment is
the Survey domain or that its legacy save/workflow coupling belongs in G4-E.

## Evidence map

The main R1 evidence locations are:

- Read/display field projection: `inspectionAppointment.vue:997-1243`.
- Edit form shell and control branches: `inspectionAppointment.vue:2312-3232`.
- MP cascader popup and App picker path: `inspectionAppointment.vue:3455-3477` and `2523-2583`.
- Leakage Cause bottom popup: `inspectionAppointment.vue:3929-3993`.
- Submit confirmation and required-field validation: `inspectionAppointment.vue:5688-5800`.
- Select, cascade, business-selector and controlled-experience interactions:
  `inspectionAppointment.vue:6538-6704`.
- Cascade value-path persistence and dependent-field clearing:
  `inspectionAppointment.vue:6735-6772`.
- Upload entry: `inspectionAppointment.vue:2700-2777` and
  `inspectionAppointment.vue:7043-7053`.
- Shared R1 visual rules: `app.css:1481-1564` and the page-specific tree
  selector at `inspectionAppointment.vue:10921-10979`.

Current New-App evidence is the source at audit HEAD, including:

- Dynamic field projection and capability/visibility gate:
  `src/features/work-orders/components/GenericDynamicFormActionContent.vue:11-119`.
- Shared field label/required/error contract:
  `src/shared/ui/AppField.vue:1-24`.
- Cross-platform text and textarea controls:
  `src/shared/ui/AppInput.vue:1-69` and `src/shared/ui/AppTextarea.vue:1-69`.
- Choice controls and Survey hierarchical cascade:
  `src/shared/ui/AppChoiceGroup.vue`, `src/shared/ui/AppMultiChoiceGroup.vue`,
  and `src/shared/ui/AppCascadeSelector.vue:1-143`.
- Survey Leakage Cause controlled experience:
  `src/features/work-orders/components/SurveyLeakageCauseExperience.vue:1-124`.
- Action Workspace shell, persistent action bar and draft status:
  `src/shared/ui/ActionWorkspaceShell.vue:1-213`.
- Survey page action labels and Runtime submit boundary:
  `src/pages/work-orders/action-workspace.vue:1-142`.

## Control-family parity matrix

Parity compares observable mobile UX patterns, not source-code similarity.
`DIVERGED` is not automatically a defect; the divergence classification says
whether the new App choice is intentional or still needs product evidence.

| Control family | R1 evidence | R1 UX pattern | Current New App | Parity | Divergence | Action | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Text / number / digit | `van-field` branches in `inspectionAppointment.vue:2397-2421`, native text branch near `3216-3232` | Label and value in a cell; input is aligned to the value side; required and disabled state are attached to the field | `AppField` owns label/required/error and `AppInput` owns cross-platform input/read-only focus state | `PARTIAL` | `UNKNOWN` | `COPY_THEN_IMPROVE` | HIGH |
| Textarea | `inspectionAppointment.vue:3060-3118`, `3645-3662` | A labeled multiline field in the same cell/form shell, with disabled styling and required marker | `AppField` + `AppTextarea`, with native disabled read-only behavior and state-driven focus/placeholder styling | `PARTIAL` | `INTENTIONAL_APPROVED` | `KEEP_NEW_APP` | HIGH |
| Select | `inspectionAppointment.vue:2497-2521`, `6637-6643`, `6707-6733` | Tapping a cell opens an action-sheet style selection; selected label returns to the cell | `AppChoiceGroup` renders options inline as explicit mobile controls | `PARTIAL` | `UNKNOWN` | `COPY_THEN_IMPROVE` | HIGH |
| Radio | `inspectionAppointment.vue:2631-2660`, shared flex rules in `app.css:1505-1531` | Labelled cell with a vertical radio group; disabled state is visible but values remain readable | `AppChoiceGroup` presents the same single-value contract as touch controls | `PARTIAL` | `INTENTIONAL_APPROVED` | `KEEP_NEW_APP` | HIGH |
| Checkbox | `inspectionAppointment.vue:2662-2693`, shared rules in `app.css:1533-1547` | Labelled cell with a vertical checkbox group; multiple values are preserved | `AppMultiChoiceGroup` preserves array semantics and exposes selected state with touch-sized controls | `PARTIAL` | `INTENTIONAL_APPROVED` | `KEEP_NEW_APP` | HIGH |
| Cascade | `inspectionAppointment.vue:2523-2583`, MP popup `3455-3477`, value-path write `6737-6772` | Platform-specific picker/popup; selected path is written as the complete ordered value path | Generic cascade retains the same path contract; Survey uses a bounded hierarchical parent/child presentation in `AppCascadeSelector` | `DIVERGED` | `INTENTIONAL_APPROVED` | `KEEP_NEW_APP` | HIGH |
| File / image upload | `inspectionAppointment.vue:1177-1226` display and `2717-2777` edit | Separate label/count row, uploader grid/thumbnails, max count and configured upload text; picker is an explicit media interaction | New App uses the shared Media Runtime and durable queue; current presentation is a compact media row with status copy and explicit picker/retry action | `PARTIAL` | `UNKNOWN` | `COPY_THEN_IMPROVE` | HIGH |
| Required state | `:required` bindings in `inspectionAppointment.vue:2416-2419`, `2516-2519`, `2640-2643` and validation `5736-5777` | Required marker is attached to the field and missing required content blocks the submit path | `AppField` renders the marker; Runtime computes effective required state and validation precedes Save/Complete | `MATCH` | `INTENTIONAL_APPROVED` | `KEEP_NEW_APP` | HIGH |
| Readonly / disabled | R1 `formFieldIdsReadOnly` checks throughout `inspectionAppointment.vue:2397-3232`; disabled control styling in `app.css:1580-1588` and page styles | Read-only fields cannot be edited, while their values remain visible | Runtime `readOnly` is mapped to supported native disabled behavior and independent read-only presentation | `MATCH` | `INTENTIONAL_APPROVED` | `KEEP_NEW_APP` | HIGH |
| Title / section header | R1 `title` branch `inspectionAppointment.vue:1229-1237`, edit branch `2780-2789` | Dedicated full-width headline row, distinct from an editable field | `PRESENTATION_ONLY` fields render as labelled divider rows inside the Action Workspace | `PARTIAL` | `UNKNOWN` | `COPY_THEN_IMPROVE` | MEDIUM |
| Gap / separator | R1 `gap` branch `inspectionAppointment.vue:1239-1242`, `2791-2797`; `.c-cell-gap` in `app.css:1481-1488` | Dedicated full-width separator/background row; optional configured content is not a generic control | New App currently renders a centered line-label presentation row for visible presentation-only fields | `DIVERGED` | `UNKNOWN` | `COPY_BASELINE` | HIGH |
| Validation / error feedback | R1 alerts/toasts in `inspectionAppointment.vue:5736-5792` | Submit-time blocking alert/toast, often one missing field at a time | New App keeps validation in Runtime and exposes localized inline field/status feedback without collapsing Save into Complete | `PARTIAL` | `INTENTIONAL_APPROVED` | `KEEP_NEW_APP` | HIGH |
| Survey Leakage Cause experience | R1 `van-popup` + MP `van-tree-select` / App two-column tree at `inspectionAppointment.vue:3929-3993`; full-provider grouping in `6554-6596` | Dedicated bottom popup; left group navigation, right multi-select causes; current part sets default group only | New App uses a Survey-controlled experience with grouped multi-choice options, full-provider selection semantics and explicit open/complete controls | `PARTIAL` | `INTENTIONAL_APPROVED` | `COPY_THEN_IMPROVE` | HIGH |
| Form shell / mobile action placement | R1 bottom `van-popup` edit shell with `van-nav-bar` and top-right `提交` at `inspectionAppointment.vue:2312-2393`; legacy submit may save and workflow-process together at `5688-5723` | Form is a bottom sheet; navigation and submit action live in the popup header | New App uses a full-page `ActionWorkspaceShell`, persistent bottom action bar, explicit `保存表单`, and Runtime-owned `完成勘查` | `DIVERGED` | `INTENTIONAL_APPROVED` | `KEEP_NEW_APP` | HIGH |

## Interpretation of current differences

### Faithful evolution

- Required, read-only, visibility and field capability remain Runtime-owned;
  the new components do not move business decisions into Vue rendering.
- Cascade selections still emit the complete ordered value path. The Survey
  hierarchy is a presentation override, not a new value model.
- Multi-value choice controls preserve array semantics rather than flattening
  values into scalar labels.
- Media state is more explicit than R1: local, uploading, uploaded, failed and
  ambiguous outcomes are represented by the shared Media Runtime instead of
  treating a selected local file as an uploaded form value.
- Save and Complete are intentionally separated. R1's coupled submit behavior
  is not a baseline to copy into G4-E.

### Accidental or unresolved divergences

- The current presentation-only separator is not equivalent to R1's dedicated
  `.c-cell-gap` row. It can make backend gap labels look like ordinary centred
  content and can add visual noise between fields. This is the clearest parity
  gap.
- The current media row does not yet expose the full R1 label/count/thumbnail
  structure in the same place. Its state copy is semantically safer, but the
  product review should decide whether preview/count/max affordances need a
  Survey presentation refinement.
- Inline select/radio/checkbox controls intentionally differ from R1's cell and
  popup composition. Their touch behavior is sound in the new design system,
  but exact density, wrapping and long-label behavior need product review.

### Explicitly not imported from R1

- R1's `serviceGoods` / `projPackage` experience.
- R1's `surveyTool` / `surveyDrawing` special tool.
- R1's Survey/Inspection naming or backend persistence assumptions.
- R1's combined save-and-workflow completion boundary.
- R1's location/check-in or media watermark execution as a production contract.

## Top Priority Parity Gaps

Priorities are implementation priorities for visual/product review, not a
severity score and not authorization to implement in this audit.

1. **P1 — Gap/separator presentation:** align the New App presentation-only
   row with the R1 dedicated separator intent. Keep it non-editable and avoid
   presenting a configured gap label as an ordinary field heading.
2. **P1 — Media presentation completeness:** retain the current truthful queue
   states, then review whether Survey media needs an R1-shaped label/count,
   max-count and preview/grid composition without weakening the shared queue or
   form-save boundary.
3. **P2 — Long-label control density:** validate select/radio/checkbox layouts
   against long Chinese labels and narrow devices. Preserve the current typed
   value contracts; this is a presentation decision only.
4. **P2 — Leakage Cause presentation convergence:** compare the current inline
   controlled experience with the R1 bottom-popup tree pattern on MP and App.
   Keep full-provider grouping and selection semantics; decide whether the
   product wants a bottom-sheet presentation for better focus.
5. **P3 — Section/header hierarchy:** decide whether presentation-only title
   rows need a stronger R1-like section treatment while preserving the current
   45-field ordering and Runtime visibility rules.

## Recommended actions

### COPY_BASELINE

- Dedicated gap/separator intent: copy R1's non-control, full-width separator
  treatment; do not copy legacy field coupling.

### COPY_THEN_IMPROVE

- Media presentation: copy the proven label/count/preview information hierarchy
  while keeping the New-App durable queue states and explicit Save boundary.
- Select and Leakage Cause composition: use R1's mature popup/grouping pattern
  as a reference, then validate against current cross-platform controls and
  accessibility/readability needs.
- Section hierarchy: use R1's clear separation between field controls and
  presentation rows, without importing its raw field identity assumptions.

### KEEP_NEW_APP

- Runtime visibility/capability gating, typed values and fail-closed behavior.
- Survey repair-part hierarchical presentation with unchanged cascade paths.
- Shared cross-platform Input/Textarea and Choice controls.
- Neutral Media Runtime, durable queue, explicit status copy and no blind retry.
- Full-page Action Workspace and persistent action bar.
- Separate `保存表单` from `完成勘查`.
- Inline localized validation rather than relying on legacy global alerts.

### NEEDS_PRODUCT_DECISION

- Whether the current Survey media row should become a richer preview/count
  surface after the product visual gate.
- Whether Leakage Cause should remain inline or move to an R1-like bottom-sheet
  presentation on one or both platforms.
- Exact visual density for long-label ordinary choice controls.

## Audit boundaries and verification state

- Production UI source: **not modified**.
- Business semantics: **not modified**.
- Survey deferred items remain absent: `serviceGoods`, `surveyDrawing`, and
  Survey LBS onsite check-in.
- Current H5 screenshots remain Mock/Product Review evidence only; they are not
  authenticated MP/App evidence. No screenshots were regenerated in this
  audit.
- This document is an R1 baseline audit, not a Product Owner visual PASS and
  not authorization for G4-F.
