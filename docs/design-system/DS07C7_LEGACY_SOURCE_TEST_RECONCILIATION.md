# DS-07.C7 — Legacy Source-Guard Reconciliation

**Parent:** [#163](https://github.com/xlink-bj/xlink-technician-app/pull/163) at exact `34e90736d0819a8692c5ac4a00da48ecda30ef6b`.
**Scope:** FOUR test files and this validation-only documentation/workflow; **NO app source changed**.

## Inherited full-suite failure discovered

On the full Draft-stack `pnpm verify` in [#163 CI](https://github.com/xlink-bj/xlink-technician-app/actions/runs/39106424135), **1047 / 1053 unit tests passed, six source-string assertions failed** in 4 files. The complete real H5 Gate separately passed at the same exact parent. The six were not observed by earlier Validate quick (Draft intentionally skips full suite).

| Test source | Legacy assertion | Current actual ownership (must retain business guard) |
| --- | --- | --- |
| `tests/g4d/app-ui-design-system.test.ts` | Appointment inline `<AppIcon name="appointment">` | `<AppActionContentHeading icon="appointment">` on real action workspace, dynamic `AppIcon :name="icon"` in shared heading |
| `tests/g4ux/home-list-production.test.ts` | List template owns empty illustration/skeleton/search CSS | `AppWorkOrderEmptyState`, `AppWorkOrderSkeleton`, `AppFeedbackState`, `AppSearchBar` shared components; list still controls read state, search, role, pagination and business actions |
| `tests/g4ux/detail-production.test.ts` | Detail template owns `current-task-card` and skeleton CSS | `WorkOrderTaskFocus` with normalized current-task props and fail-closed disabled action; `AppWorkOrderSkeleton variant=detail` owns skeleton markup |
| `tests/g4f/quotation-empty-workbench.test.ts` | Q01 form fields inline in large `QuotationActionContent` | Real `Q01EntryScreen` owns display/test selectors; `QuotationActionContent` supplies verified options and maps events back to existing quotation composition methods |

The tests now check **both real consumer composition and extracted component contracts** rather than simply deleting assertions. No product copy, UI styles, new features, pricing authority, signing writes or backend changes.

## Validation Gate

The dedicated `DS07 C7 Full Verify` CI must pass:
- Exact ancestry from C6, six-file-only C7 delta (four tests + doc + workflow).
- `pnpm verify` all 1053 existing tests, UI governance, boundaries, typecheck, catalog contracts.
- Real H5, MP-Weixin, and uni-app App builds with test-only env isolated from bundles.
- Exact six Owner-approved Golden file SHA-256 hashes retained and unchanged.
- No tests skipped/masked and no Golden update.

Other known blockers remain explicit: full main-targeted 912-commit ancestry acceptance, physical devices and backend-confirmed real signed Contract. **No merge** and no Production writes.
