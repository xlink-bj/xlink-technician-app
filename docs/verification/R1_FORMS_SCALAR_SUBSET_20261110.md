# Normal forms v2: bounded known scalar subset

Baseline: xlink-technician-app main c71138508fafc84081cf9fc6581d2b3f5a8e9bda, plus the previously frozen 27 local candidate files. Those 27 files remain byte-identical. This slice is private local development; no commit, push, CI dispatch, production request or real backend write.

## Behavior and evidence

The normal forms v2 provider already matches the exact grant fieldIds, fresh fillable IDs, actor/role/handler, runtime node and definition. Previously the shared normalizer and UI projection rejected every schema over 50 rows, even when explicit field or node readonly metadata left only a small authorized scalar set. Actual provider/action tests reproduced create/edit rejection (2 FAIL). The new branch permits 51–200 metadata rows with 1–50 precisely authorized known scalar fields. Metadata identity and value keys are checked across every row before selecting the subset; duplicate keys remain conservatively rejected. Static readonly evidence is field.readOnly=true or node.formFieldIdsReadOnly, never runtime failure.

Normal UI projection and validation use the same subset. Unknown writable rules/providers/types, media/nonempty arrays, presentation controls, invalid IDs, unapproved keys and readonly inputs remain blocked. Writable condition dependencies must themselves be flat writable scalar keys; readonly controller values cannot be obtained safely from the lossy display model, so this slice rejects those configurations. It does not expose private original data in the public projection. Large typed Appointment is rejected rather than bypassing its specialized business normalizer. Repeat and schemas at most 50 rows use the original implementation and grant rules.

Existing records on this new >50-row path are read-only. The v0 candidate incorrectly treated absent purpose as proof of generic persistence. External review reproduced a typed Survey original (`_class=com.fsgo.entity.basic.Survey`) with unclassified purpose that could dispatch an upsert. Actual provider/normalizer red tests confirmed 9 failures. `form.ts:43–54,343–351` derives purpose only when all field rows identify the same known Survey/Appointment collection; missing, mixed, other or forged generic colName produces undefined. `r1-node-forms-read.ts:265–284` validates Ext identity/type/collection but does not propagate positive non-typed provenance into the snapshot. Raw `_class` is not an adequate positive authorization contract either. Therefore v1 closes both large-schema edit projection and normalization unconditionally, including purpose absent, typed/unknown/missing/forged generic class markers. It does not blacklist one typed class then permit everything else. No reader/port/grant expansion is made. v0's generic edit and optional-clear implementation has been removed; its failures and review artifact remain preserved, not represented as finally released.

The <=50-row edit implementation is unchanged. Complete raw original preservation and optional clearing remain its existing contract, not newly validated large-schema capabilities. Large-schema create and append are the only new save capabilities. Explicit completion code is untouched and NOT_RUN for this subset.

Two consistency additions are restricted to this large forms branch: the provider freezes initial metadata/purpose/readonly/fillable as JSON bytes and compares every fresh read; actions also freeze the first pre-upsert state and compare before EXTS. An equivalent condition change is still drift. Before-dispatch changes cause zero writes. After-upsert changes stop before EXTS and retain the existing uncertain receipt/lock. These are local safety checks, not CAS or cross-client exclusivity.

## Inherited contract and limits

SOURCE: xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d, business/subpackages/serviceAppointment/serviceAppointment.vue:7118–7191 (required on visible non-readonly fields; gap excluded), 6990–7030 (complete raw data and EXTS), 7209 (whole-record save). Backend xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e, ExtFormServiceImpl:242–281 (typed Survey reconstruction), 282–326 (generic whole-document persistence). The existing frontend wire retains R1 preset storage and full EXTS replacement. Historical last-writer/concurrent replacement risk and typed Date fidelity are not repaired or proven safe by this frontend slice.

Synthetic metadata is 59 unique rows with explicit fixture permissions, not the captured real 59-row Survey definition. The latter still has duplicate keys, unknown provider/configuration/permission evidence and array/media controls; it is not enabled by this change. No production permissions or defaults are changed. Actual patch/clear remains <=50, references including deleted rows remain <=50 (49→50 allowed, 50→51 refused). No provider, mapper, wire, grant format/parser, reader, router, UI component, workflow, backend or price logic is changed.

## Verification

Actual Vitest provider/action coverage includes bounded metadata, grant/identity changes, unknown rules/values, required dependencies, metadata drift, post-dispatch uncertainty and reference capacity. v1 adds zero-transport existing-edit tests for all unavailable/ambiguous provenance cases. Earlier optional-clear red logs are retained only as v0 history; v1 does not enable that path. Internal v0 review was superseded by the external provenance blocker and must not be treated as final release.

Normal App H5 at 430×932 uses the real login/list/detail/read/editor/provider/transport path with all APIs fulfilled in-browser and every unknown/external request aborted. Dedicated opt-in only; default discovery skips all three tests. Scenarios: scalar create and exact saved-ID readback; fresh readonly revocation with zero writes; an existing typed record remains read-only despite an explicit edit operation grant and missing field-row colName. The synthetic server performs full replacement (no merging with the old row), supplies synthetic tenant/definition identity and acknowledges EXTS separately. No internal store or handler injection. UI saves do not call Process.

Commands and exact exit codes/counts are retained in the companion review manifest/summary. Commands use Node 22, pnpm 10.31.0:

- `VITE_XLINK_ENVIRONMENT=test pnpm exec vitest run tests/engineering/r1-forms-scalar-subset.test.ts tests/engineering/r1-normal-forms-actions.test.ts tests/engineering/r1-normal-forms-existing-actions.test.ts`
- `VITE_XLINK_ENVIRONMENT=test pnpm verify:full`
- `pnpm typecheck`
- `XLINK_H5_FORMS_SCALAR_SUBSET=true pnpm exec playwright test --config config/playwright/forms-scalar-subset.config.ts`
- `pnpm exec playwright test --config config/playwright/main-h5-mock.config.ts tests/h5-main-mock/forms-scalar-subset.spec.ts` (opt-in absent: SKIP)
- `pnpm build:h5`

NOT_RUN: complete current 59-row Survey UI writing, genuine Survey provider/configuration rules, typed existing edit, arrays/media, real Java/Mongo/HTTP persistence, Production/Beta authorization, real Workflow completion or native devices. No-op save and readonly-dependent conditions remain unsupported by this narrow branch. No UI/UX redesign.

Final v1 counts and exits are recorded in its review summary; v0 numbers remain in the retained original package. No old result is relabeled as a v1 pass. H5 preparation failures were preserved as fixture/selector issues, not product fixes.

Inherited empty-value detail: normalizeSubmission may omit an optional empty array (`note: []`) as empty. This is explicitly tested; no array is written in the scalar patch. Nonempty or malformed arrays cannot be emitted. Purpose is part of both frozen signatures: unchanged mapped field bytes do not excuse purpose drift; first-write drift causes zero commands, post-upsert drift retains uncertain and blocks EXTS/Process.
