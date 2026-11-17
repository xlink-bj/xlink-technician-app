# H5 business test lanes

> Current selection guide · reviewed 2026-11-17 · baseline `main@95917dbb8398e259bb658351ae0fdc44f04732a4`.

Use `pnpm exec playwright test --config config/playwright/<config> [file]` for a scoped run. The default `pnpm test:main-h5-mock` is the ordinary local synthetic business collection: Home/list/detail, appointment/survey navigation, quotation/Order/signing read, input/search, visual contracts and recovery. It is not a live backend or write authorization check. Tests intercept or deny external requests; dedicated configurations may enable writes only against their explicitly intercepted synthetic HTTP target.

## What changed and what it saves

The supplied baseline report (artifact `14297439148`) collected 396 cases in 104 files: 166 executed successfully in 50 files and 230 skipped in 54 files for unavailable fixture/brand/metadata. Default collection now selects 165 cases in the same 50 files. The 54 dedicated files remain available through the explicit configurations or fixture flags below. Runtime guards remain intact. Collection counts were checked with Playwright `--list`; current browser execution is NOT_RUN. Expected conditional skips are zero in the default environment; this is not a claim of a current browser PASS.

Selection verification: 56 existing explicit configurations collected exactly the same case identities before and after the base-config change; all 15 direct fixture/brand opt-ins still collect their named spec when enabled. Typecheck, config-layout and 16 Mock routing/fault unit tests passed. After adding the P08 selector, all 54 filtered files were checked against collecting dedicated or fixture/brand entries: no file is unreachable. P08 selects 2 cases at 375/430; without that selector the media profile retains its original 5 cases. Its grant and intercepted fixture identities were checked statically. These checks do not start a browser or server.

The one removed executed case duplicated standalone appointment/survey rejection at the default 390×844 viewport. Its URL, title, unavailable-state, return-copy, content-absence and network/error assertions are retained in the existing 320/375/390 parameterized case; those cases additionally check overflow and screenshots. No business assertion or viewport was dropped.

The 230 baseline skips totalled only 904 ms; excluding their collection improves report clarity, not a 25-minute runtime reduction. Baseline default report duration was 1,499,068 ms, with 1,488,965 ms summed executing-case duration. Workbench (10 cases, 265,358 ms) and quotation (22 cases, 137,034 ms) remain major costs. Workbench 360/430 journeys exercise category counts, stack depth, schedule and construction navigation, and work-selection returns; they contain no fixed sleep. No safe redundant wait was established, so those journeys remain.

## Triggers and interpretation

`Validate Main H5 Smoke` runs on main pushes with its existing explicit 16-case selection. Complete `validate-main-h5.yml` runs nightly/manual; its `h5-ux` and repeat jobs also accept `[L3-H5]` PRs, while business flows accept `[FORM-BATCH]` PRs. Other lifecycle/edit/create jobs retain their existing PR conditions. The table names the actual complete-workflow job that consumes each dedicated suite; a manual-only row is a coverage gap, not an implied CI PASS. A direct main-config opt-in command must include the file path, so a fixture change does not run unrelated default business cases.

The configured job conditions are unchanged:

| Complete-workflow job | Trigger |
| --- | --- |
| `h5-ux`, `r1-main-repeat-ui` | nightly / manual / `[L3-H5]` PR |
| `main-app-flows-h5`, `scoped-create-lifecycle-h5` | nightly / manual / `[FORM-BATCH]` PR |
| `draft-lifecycle-h5`, `scoped-existing-media-h5` | nightly / manual / `[FORM-BATCH]` or `[L3-H5]` PR |

## Dedicated collection excluded from the default

Config names below are relative to `config/playwright/`. `main-h5-mock.config.ts + FLAG` means set the listed flags to `true` and pass that single spec path. Metadata profiles are selected by their dedicated config, not by toggling a generic write switch.

| Spec under `tests/h5-main-mock/` | Cases | Required environment / config | Complete-workflow consumer |
| --- | ---: | --- | --- |
| `brand-node-workspace.spec.ts` | 5 | `brand-node-workspace.config.ts`; config metadata `brandNodeWorkspace` | **Manual only / no CI execution** |
| `configured-file-create.spec.ts` | 4 | `configured-file-create.config.ts` + `XLINK_H5_CONFIGURED_FILE_CREATE=true`; readonly variant: `configured-file-readonly.config.ts` + `XLINK_H5_CONFIGURED_FILE_READ=true` | `scoped-create-lifecycle-h5` |
| `configured-record-edit.spec.ts` | 9 | `configured-record-edit.config.ts`; config metadata `configuredRecordEdit` | `scoped-existing-media-h5` |
| `dev-mock-dynamic-form-workspace.spec.ts` | 5 | `dev-mock-dynamic-form-workspace.config.ts`; config metadata `devMockDynamicFormWorkspace` | `draft-lifecycle-h5` |
| `duplicate-file-fields.spec.ts` | 2 | `duplicate-file-fields.config.ts`; `XLINK_H5_DUPLICATE_FILE=true` | `scoped-existing-media-h5` |
| `forms-cascade-create.spec.ts` | 7 | `forms-cascade-create.config.ts`; `XLINK_H5_FORMS_CASCADE_CREATE=true` | `scoped-create-lifecycle-h5` |
| `forms-choice-create.spec.ts` | 6 | `forms-choice-create.config.ts`; `XLINK_H5_FORMS_CHOICE_CREATE=true` | `scoped-create-lifecycle-h5` |
| `forms-mixed-create.spec.ts` | 8 | `forms-mixed-create.config.ts`; `XLINK_H5_FORMS_MIXED_CREATE=true` | `scoped-create-lifecycle-h5` |
| `forms-scalar-subset.spec.ts` | 3 | `forms-scalar-subset.config.ts`; `XLINK_H5_FORMS_SCALAR_SUBSET=true` | `scoped-existing-media-h5` |
| `generic-map-edit.spec.ts` | 6 | `generic-map-edit.config.ts`; `XLINK_H5_GENERIC_MAP_EDIT=true` | `scoped-existing-media-h5` |
| `identity-submission.spec.ts` | 2 | `identity-submission.config.ts`; config metadata `identitySubmission` | **Manual only / no CI execution** |
| `map-choice-datetime-edit.spec.ts` | 7 | `map-choice-datetime-edit.config.ts`; config metadata `mapChoiceDatetimeEdit` | `scoped-existing-media-h5` |
| `map-conditional-cascade-edit.spec.ts` | 10 | `map-choice-datetime-edit.config.ts`; config metadata `mapChoiceDatetimeEdit` | `scoped-existing-media-h5` |
| `map-default-controls-edit.spec.ts` | 5 | `map-choice-datetime-edit.config.ts`; config metadata `mapChoiceDatetimeEdit` | `scoped-existing-media-h5` |
| `map-remaining-scalars-edit.spec.ts` | 6 | `map-choice-datetime-edit.config.ts`; config metadata `mapChoiceDatetimeEdit` | `scoped-existing-media-h5` |
| `normal-action-workspace.spec.ts` | 5 | `normal-action-workspace.config.ts`; config metadata `normalActionWorkspace` | `draft-lifecycle-h5` |
| `normal-appointment-experience.spec.ts` | 2 | `normal-appointment-experience.config.ts`, `brand-survey-host.config.ts`; config metadata `normalAppointmentExperience` | `scoped-create-lifecycle-h5`, `scoped-existing-media-h5` |
| `normal-form-draft-boundaries.spec.ts` | 9 | `normal-form-draft-boundaries.config.ts`; config metadata `normalFormDraftBoundaries` | `draft-lifecycle-h5` |
| `normal-form-fresh-original.spec.ts` | 2 | `normal-form-fresh-original.config.ts`; config metadata `normalFormFreshOriginal` | `draft-lifecycle-h5` |
| `normal-r1-file-upload.spec.ts` | 1 | `normal-r1-file-upload.config.ts`; `XLINK_H5_NORMAL_R1_FILE_UPLOAD=true` | `scoped-existing-media-h5` |
| `normal-r1-image-recovery.spec.ts` | 8 | `normal-r1-image-recovery.config.ts`; `XLINK_H5_NORMAL_R1_IMAGE_RECOVERY=true` | `scoped-existing-media-h5` |
| `normal-repeat-workspace.spec.ts` | 3 | `normal-repeat-workspace.config.ts`; config metadata `normalRepeatWorkspace` | `scoped-create-lifecycle-h5` |
| `normal-survey-cause-read.spec.ts` | 7 | `normal-survey-cause-read.config.ts`; `XLINK_H5_NORMAL_SURVEY_CAUSE_READ=true` | `scoped-create-lifecycle-h5` |
| `ordinary-create-draft.spec.ts` | 3 | `ordinary-create-draft.config.ts`; `XLINK_H5_ORDINARY_CREATE_DRAFT=true` | `scoped-create-lifecycle-h5` |
| `ordinary-create-plan.spec.ts` | 7 | `ordinary-create-plan.config.ts`; `XLINK_H5_ORDINARY_CREATE_PLAN=true` | `scoped-create-lifecycle-h5` |
| `ordinary-ui-atomicity.spec.ts` | 7 | `ordinary-ui-atomicity.config.ts`; `XLINK_H5_ORDINARY_UI_ATOMICITY=true` | `scoped-create-lifecycle-h5` |
| `p08-normal-file-targets.spec.ts` | 2 | `survey-first-media-save.config.ts` + `XLINK_H5_MEDIA_TARGETS=true` + `XLINK_H5_SURVEY_FIRST_MEDIA_SAVE=true` | **Manual only / no CI execution** |
| `repeat-appointment-edit.spec.ts` | 3 | `repeat-appointment-edit.config.ts`; `XLINK_H5_REPEAT_APPOINTMENT_EDIT=true` | `scoped-existing-media-h5` |
| `role-field-visibility.spec.ts` | 5 | `role-field-visibility.config.ts`; config metadata `roleFieldVisibility` | `scoped-existing-media-h5` |
| `survey-59-read.spec.ts` | 6 | `survey-59-read.config.ts`; `XLINK_H5_SURVEY_59=true` | `main-app-flows-h5` |
| `survey-conditional-create.spec.ts` | 3 | `survey-conditional-create.config.ts`; `XLINK_H5_SURVEY_CONDITIONAL_CREATE=true` | `scoped-create-lifecycle-h5` |
| `survey-first-media-save.spec.ts` | 5 | `survey-first-media-save.config.ts`; `XLINK_H5_SURVEY_FIRST_MEDIA_SAVE=true` | `scoped-create-lifecycle-h5` |
| `survey-part-create.spec.ts` | 3 | `survey-part-create.config.ts`; `XLINK_H5_SURVEY_PART_CREATE=true` | `scoped-create-lifecycle-h5` |
| `survey-regions-is-read.spec.ts` | 8 | `survey-regions-is-read.config.ts`; `XLINK_H5_SURVEY_REGIONS_IS_READ=true` | `scoped-create-lifecycle-h5` |
| `switch-rate-create.spec.ts` | 5 | `switch-rate-create.config.ts`; `XLINK_H5_SWITCH_RATE_CREATE=true` | `scoped-create-lifecycle-h5` |
| `work-order-authority-revocation.spec.ts` | 10 | `work-order-authority-revocation.config.ts`; `XLINK_H5_AUTHORITY_REVOCATION=true` | `scoped-existing-media-h5` |
| `work-order-detail-load-lifecycle.spec.ts` | 2 | `work-order-detail-lifecycle.config.ts`; `XLINK_H5_DETAIL_LIFECYCLE=true` | `scoped-create-lifecycle-h5` |
| `work-order-information-role.spec.ts` | 5 | `work-order-information-role.config.ts`; config metadata `informationRole` | `scoped-existing-media-h5` |
| `work-order-refresh-navigation.spec.ts` | 2 | `work-order-refresh-navigation.config.ts`; `XLINK_H5_REFRESH_NAVIGATION=true` | `scoped-create-lifecycle-h5` |
| `brand-disabled-button.spec.ts` | 1 | `main-h5-mock.config.ts`, `VITE_XLINK_BRAND=yuhong` | **Manual only / no CI execution** |
| `catalog-scale.spec.ts` | 2 | `catalog-scale.config.ts` | `main-app-flows-h5` |
| `deep-cascade-record.spec.ts` | 1 | `main-h5-mock.config.ts` + process.env.VITE_XLINK_R1_DEEP_CASCADE === 'true' | `main-app-flows-h5` |
| `dev-mock-forms-repeat-quotation.spec.ts` | 9 | `main-h5-mock.config.ts` + process.env.VITE_XLINK_R1_MP_UX_FIXTURES === 'true' | `main-app-flows-h5`, `r1-main-repeat-ui` |
| `dev-mock-special-media-conflict.spec.ts` | 3 | `main-h5-mock.config.ts` + process.env.VITE_XLINK_R1_SPECIAL_MEDIA === 'true' | `main-app-flows-h5` |
| `dynamic-form-scalar-closure.spec.ts` | 1 | `main-h5-mock.config.ts` + process.env.VITE_XLINK_DYNAMIC_SCALAR_QA === 'true' | `main-app-flows-h5` |
| `forms-save-process-readback.spec.ts` | 4 | `main-h5-mock.config.ts` + process.env.VITE_XLINK_R1_MP_UX_FIXTURES === 'true' | `main-app-flows-h5` |
| `mock-repeat-query.spec.ts` | 2 | `mock-repeat-query.config.ts` | `main-app-flows-h5` |
| `normal-survey-mock-reader.spec.ts` | 1 | `brand-survey-host.config.ts` | `main-app-flows-h5`, `scoped-create-lifecycle-h5` |
| `r1-array-cascade-fields.spec.ts` | 1 | `main-h5-mock.config.ts` + process.env.VITE_XLINK_R1_MP_UX_FIXTURES === 'true' && process.env.VITE_XLINK_R1_ARRAY_CASCADE_FIELDS === 'true' | `main-app-flows-h5` |
| `r1-repeat-read.spec.ts` | 1 | `main-h5-mock.config.ts` + process.env.VITE_XLINK_R1_MP_UX_FIXTURES === 'true' | **Manual only / no CI execution** |
| `r1-source-formdef-multifield.spec.ts` | 1 | `main-h5-mock.config.ts` + process.env.VITE_XLINK_R1_MP_UX_FIXTURES === 'true' | `main-app-flows-h5` |
| `r1-temporal-rating-fields.spec.ts` | 2 | `main-h5-mock.config.ts` + process.env.VITE_XLINK_R1_TEMPORAL_RATING_FIELDS === 'true' | `main-app-flows-h5` |
| `r1-typed-primitive-fields.spec.ts` | 1 | `main-h5-mock.config.ts` + process.env.VITE_XLINK_R1_MP_UX_FIXTURES === 'true' && process.env.VITE_XLINK_R1_TYPED_PRIMITIVE_FIELDS === 'true' | `main-app-flows-h5` |
| `special-business-record.spec.ts` | 2 | `main-h5-mock.config.ts` + process.env.VITE_XLINK_R1_BUSINESS_FIELDS === 'true' | `main-app-flows-h5` |

## Remaining coverage gaps

- `brand-node-workspace.config.ts` (5) and `identity-submission.config.ts` (2) have explicit profiles but no complete-workflow consumer. Their runtime metadata prevents default execution; removing default skips does not remove executed coverage.
- `brand-disabled-button.spec.ts` (1) is runnable with the Yuhong brand through the main config, but the explicit brand CI file list does not include it.
- `r1-repeat-read.spec.ts` (1) has no explicit CI consumer. Its old direct-Detail panel expectation must be reconciled with the current Workspace entry before adding it to CI; the active forms/repeat acceptance and repeat-query suites cover separate current flows.
- `p08-normal-file-targets.spec.ts` (2) now has an explicit config selection but no CI consumer. It fails the second upload at 375/430, whereas `survey-first-media-save.spec.ts` fails the first upload. It has unique target-position assertions and must not be deleted as a textual duplicate. Run it with `XLINK_H5_MEDIA_TARGETS=true XLINK_H5_SURVEY_FIRST_MEDIA_SAVE=true pnpm exec playwright test --config config/playwright/survey-first-media-save.config.ts`. The config supplies the exact synthetic tenant/user/role/work/node/definition and v3 create grant for the two intercepted file fields; the existing CI selection stays on the original five cases.

These are bounded follow-ups, not justification to enable a real endpoint or remove safety guards. This batch does not silently add unverified cases to complete CI.

## Default business files

| Spec | Business capability | Collected cases |
| --- | --- | ---: |
| `b-appointment-review.spec.ts` | Appointment entry / read | 4 |
| `b2x-presentation-separation.spec.ts` | Shared controls / visual / content boundaries | 3 |
| `brand-appointment.spec.ts` | Appointment entry / read | 1 |
| `brand-archive-feedback.spec.ts` | Work orders / detail / archives / construction read | 1 |
| `brand-attachment-states.spec.ts` | Shared controls / visual / content boundaries | 2 |
| `brand-detail.spec.ts` | Work orders / detail / archives / construction read | 1 |
| `brand-entry-archives.spec.ts` | Work orders / detail / archives / construction read | 1 |
| `brand-foundation.spec.ts` | Shared controls / visual / content boundaries | 1 |
| `brand-home.spec.ts` | Home tasks / navigation / session | 2 |
| `brand-list.spec.ts` | Work orders / detail / archives / construction read | 1 |
| `brand-quotation.spec.ts` | Quotation selection / pricing / Order / draft | 4 |
| `brand-signing-read-feedback.spec.ts` | Order / signing / contract read boundary | 1 |
| `brand-signing-read.spec.ts` | Order / signing / contract read boundary | 3 |
| `c1-workbench.spec.ts` | Home tasks / navigation / session | 10 |
| `construction-read.spec.ts` | Work orders / detail / archives / construction read | 1 |
| `deferred-appointment-r1.spec.ts` | Appointment entry / read | 3 |
| `detail-archives.spec.ts` | Work orders / detail / archives / construction read | 4 |
| `device-action-mock.spec.ts` | Device Action synthetic entry | 1 |
| `ds07c4b-quote-signing.spec.ts` | Order / signing / contract read boundary | 3 |
| `ds07c4b-signing-state-visual.spec.ts` | Order / signing / contract read boundary | 3 |
| `dynamic-field-registry.spec.ts` | Shared controls / visual / content boundaries | 1 |
| `input-delivery.spec.ts` | Input / search delivery | 12 |
| `m1-i7-six-stage-integration.spec.ts` | Cross-business workflow / isolation | 2 |
| `m1-quotation-ux-prototype.spec.ts` | Quotation selection / pricing / Order / draft | 3 |
| `m1-r1-contract-preview.spec.ts` | Order / signing / contract read boundary | 3 |
| `m1-signing-official-order-read.spec.ts` | Order / signing / contract read boundary | 3 |
| `m3-p1-commercial-journey-430.spec.ts` | Cross-business workflow / isolation | 1 |
| `m3-quotation-navigation-430.spec.ts` | Quotation selection / pricing / Order / draft | 1 |
| `m3-signing-read-430.spec.ts` | Order / signing / contract read boundary | 1 |
| `m3-survey-media-430.spec.ts` | Survey / media / recovery | 2 |
| `main-app-quotation.spec.ts` | Mixed business: authenticated shell; Appointment → Survey → Quotation; catalog / SKU / drafts / Order / signing-read; legacy standalone rejection | 21 |
| `main-shell.spec.ts` | Home tasks / navigation / session | 7 |
| `media-interrupted-receipt.spec.ts` | Survey / media / recovery | 2 |
| `mock-business-closure.spec.ts` | Cross-business workflow / isolation | 2 |
| `mock-order-feedback.spec.ts` | Quotation selection / pricing / Order / draft | 4 |
| `normal-mock-form-preview-entry.spec.ts` | Shared controls / visual / content boundaries | 4 |
| `operator-control-geometry.spec.ts` | Shared controls / visual / content boundaries | 1 |
| `order-fields-flow.spec.ts` | Quotation selection / pricing / Order / draft | 1 |
| `p05-quotation-workspace.spec.ts` | Quotation selection / pricing / Order / draft | 3 |
| `package-price-source.spec.ts` | Quotation selection / pricing / Order / draft | 1 |
| `q01-visual-baseline.spec.ts` | Quotation selection / pricing / Order / draft | 2 |
| `q03-commercial-baseline.spec.ts` | Quotation selection / pricing / Order / draft | 4 |
| `qsign-readonly-closure.spec.ts` | Order / signing / contract read boundary | 5 |
| `quotation-catalog-action-width.spec.ts` | Quotation selection / pricing / Order / draft | 2 |
| `quotation-input-delivery.spec.ts` | Quotation selection / pricing / Order / draft | 9 |
| `r1-child-subflow-preview.spec.ts` | Work orders / detail / archives / construction read | 2 |
| `search-delivery.spec.ts` | Input / search delivery | 6 |
| `weak-network-recovery.spec.ts` | Survey / media / recovery | 4 |
| `work-order-categories.spec.ts` | Work orders / detail / archives / construction read | 4 |
| `workspace-typography.spec.ts` | Shared controls / visual / content boundaries | 2 |
