# EQ08 — P1 Form and Command Architecture Boundaries

Status: **Draft candidate**, not production/R1 runtime parity. Base: EQ07 P0 exact `934cca0c8aa5bd92fbb1317cd056c90eebc8b93e`. No merge or external writes.

## Responsibility ownership

| Layer | Owns | Does not own |
| --- | --- | --- |
| `@runtimes/dynamic-form` | Pure field state, visibility and normalization engine | XLink business visit/SKU/Workflow semantics; backend transport |
| `features/work-orders/action-form-schema.ts` | **One source** of R1 FormFieldRead -> FormFieldSchema metadata for mobile_detail | Feature-specific business rules; network requests |
| `features/work-orders/appointment-form-runtime.ts` | Appointment field roles, `need=1/0` applicability, conditional admission, save-only normalization | Back-end JSON wire format; Workflow command |
| `features/work-orders/dynamic-form-action.ts` | General action content and evidenced Survey leakage/media exceptional controls | Duplicate schema mapping; any network write |
| `features/work-orders/action-workspace.ts` | User/role + WorkOrder Action state, P0 revision fencing, explicit save vs completion transition | Low-level R1 endpoint encoding |
| `adapters/api/action-command-wires.ts` | **Pure** R1 FormData upsert and Workflow Process wire representations | Dispatch, retries, optimistic workflow success, price inference |
| `adapters/api/technician-api-commands.ts` | Transport invocation, response normalization, save then complete ordering (where permitted) | Duplicated field metadata and raw command JSON assembly |

## Non-negotiable invariants

1. `saveDynamicForm` persists FormData only. **Never** treats `biz/extForm/upsert` success as Workflow Complete.
2. `workflow/process` requires its own explicit command and verified FormData ID for form-based completion. Accept Order uses a different, identity-preserving Process body.
3. `need=0` deferred Appointment remains guarded by `deferred_appointment_datetime_encoding_unknown` until actual R1 transport contract is authorized and confirmed.
4. User/role revision, Action identity, in-flight write leases, valid saved FormData and explicit retry/reconciliation gates from EQ07 remain untouched.
5. Unsupported visible conditional fields fail closed. Inapplicable/hidden draft values remain local and are excluded from effective submission.
6. The generic Form Runtime never infers effective tenant/SKU catalog prices or authorizes Formal Order type=1 mutations.
7. No production/business writes, no R1 source/back-end changes, no Golden snapshots updates or release.

## Integration and proof

This stacked PR includes the **source-backed conditional Appointment runtime** and five tests from independent Draft #185 on the EQ07 stack. Keep #185 Draft until lead decides reconciliation; this PR does not merge or close it. #186 catalog price-scope remains an independent Draft, not silently incorporated.

The EQ08 read-only CI lane requires isolated schema/wire parity + existing R1 Appointment, Survey, Order regression tests, critical and full checks, H5/MP/App builds, original H5 main Mock journey and unchanged approved Gallery/Business Goldens. Tests are synthetic/offline only.

Real R1 workflows, tenant/SKU effective prices, deferred visit datetime encoding, and device parity remain separate blocked runtime evidence gates.
