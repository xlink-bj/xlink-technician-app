# DS-07.C4.A — Appointment + Survey UI Ownership Migration

**State:** Draft engineering candidate. **Not visual-accepted**, not release-accepted.
Parent [#157](https://github.com/xlink-bj/xlink-technician-app/issues/157); implementation [#158](https://github.com/xlink-bj/xlink-technician-app/pull/158). Base C3 HEAD `07fe1baa59be7108f7d766725a4357d7b654140a`.

## Reuse, not business migration

| Actual consumer | Before | C4.A view ownership | Business/state ownership (unchanged) |
| --- | --- | --- | --- |
| Appointment at `action-workspace.vue` | Local icon/title/caption with five page-owned CSS blocks | `AppActionContentHeading`, shared by ordinary Appointment and Dynamic Survey | `appointmentForm`, choice/time/note, required/read-only rules, date picker, continue/submit guards |
| Survey at `GenericDynamicFormActionContent.vue` | Separate ordinary/survey heading with overlapping styles; per-block heading colors/status | `AppActionContentHeading` and feature-local `SurveyTaskSectionHeading` | Runtime field values, visibility, required, provider options, media/camera, calculated field grouping, Save and Complete gate |
| Leakage Cause at `SurveyLeakageCauseExperience.vue` | Independent task icon/status/title markup + local style | Same `SurveyTaskSectionHeading`, with cause tone and caller-controlled selection label | R1 cause provider, part dependencies, draft chips, confirm/cancel semantics, permission/read-only/submit checks |

`SurveyTaskSectionHeading` is **feature-local**: it does not gain data reads, status inference, Form Runtime, API, order or workflow authority. Component props accept the caller-calculated required/selected/status/title. `AppActionContentHeading` is display-only and shared by two real operational surfaces. Existing native `AppField`, `AppChoiceGroup`, `AppSelector`, `AppInput`, `AppTextarea` and Workspace ActionBar continue to own form control appearance and UX.

## Audited source-local CSS debt (three actual files)

Measurements count stylesheet blocks (`{ ... }`), CSS hex literals and dimension literals (`px`/`rpx`) in the **business files only**. New shared/feature presentation components own the moved declarations. These are relocation counts, not an invented whole-app LOC reduction.

| Business surface | CSS blocks: base → C4.A | CSS hex: base → C4.A | CSS dimensions: base → C4.A |
| --- | ---: | ---: | ---: |
| Appointment Workspace | 29 → 24 | 0 → 0 | 23 → 18 |
| Generic Dynamic / Survey | 102 → 79 | 6 → 1 | 130 → 105 |
| Leakage Cause | 57 → 52 | 3 → 1 | 79 → 66 |
| **Total** | **188 → 155 (-33)** | **9 → 2 (-7)** | **232 → 189 (-43)** |

The source of truth for business styling remains the Standard Design System. No global Craft opt-in, visual baseline regeneration or new dependency.

## Real H5 and safety regression

- Dedicated **Draft-compatible, credentials-free** H5 workflow: `.github/workflows/ds07c4a-h5-evidence.yml`.
- Test target: actual uni-app main App at **320 / 375 / 390px**, separate Appointment and Survey views with screenshot attachments, shared display components and local-only Mock network guard.
- Also covers normal Action Workspace route/title and full MOCK-019 Appointment → Survey → Quotation without business writes.
- Original App tests referenced removed page-specific CSS classes; replaced with stable `data-testid` on the shared heading.
- Full MOCK-019 test had an old quote read-only notice assertion: Q01 first repair-part step now uses `Q01EntryScreen` with a visible **订单说明 / 本机草稿不会自动提交** disclosure. The corrected test must require that notice and continued absence of submit Action; never drop the no-write assertion.
- Built H5, reviewed MP-Weixin build and TypeScript/UI governance are separate engineering gates.
- **Inherited unrelated visual hold:** DS02A Detail + Quote old Golden 320/375/390 mismatch, present before C4.A on #153 and #156. Do not weaken screenshots or update Golden without explicit Owner review.

## Remaining gates

1. Run real H5 test and inspect uploaded screenshots/traces; Owner visual acceptance remains separate.
2. Confirm no new runtime/role/permission regression, no production writes.
3. Obtain explicit Lead decision before marking C4.A complete and before starting C4.B.
