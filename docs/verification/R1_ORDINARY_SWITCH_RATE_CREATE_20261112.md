# Historical ordinary configured Switch / Rate first-create

This document preserves the initial bounded increment below. Current ordinary first creation uses the [unified field plan](R1_ORDINARY_CREATE_FIELD_PLAN_20261112.md); the historical exclusions for coexisting file, array and conditional fields are not global limits on that plan. The unused standalone Switch/Rate implementation has been removed. Its real normal reader/provider regression suite remains unchanged, including strict values, scope and receipt checks. This cleanup changes no current permission or wire contract.

## Archived increment

This slice supports metadata-driven, non-special generic Map forms, with arbitrary field names. It reuses the existing binary and rating controls and Dynamic Form Runtime. It does not modify the shared Runtime's boolean compatibility.

## Supported domain

The normal reader must positively establish exact string `Ext.type='0'`, matching tenant/field/collection identities, an ordinary collection (excluding survey, inspectionAppointment and serviceAppointment), and current complete raw field metadata. The normal provider requires the existing exact version-1 create grant, actor/session/role/work-order/run/node/definition/field IDs, current reader generation, zero records and all fields fillable. Read facts alone do not grant a write. Copied metadata or caller values cannot choose the new normalizer.

The initial bounded subset is 1–50 unique scalar rows, including at least one Switch or Rate, no files, no array choices, no readonly or surface-excluded rows and no conditional rules. Other scalar types retain existing Runtime normalization; scalar Select/Radio require verified, flat, scoped Code options. Unknown field/provider/custom-control configuration rejects the whole capability. Explicit count/half/step/alternate-switch-value configurations are unsupported rather than guessed.

| Field | New ordinary input and wire | Missing / optional | Refused |
| --- | --- | --- | --- |
| Switch | exact strings `'1'` and `'0'`, preserved as strings | true absence or explicit empty string is omitted; required needs either state | booleans, numeric 0/1, `'true'`/`'false'`, whitespace codes, null, own undefined, arrays and objects |
| Rate | numeric safe integers 1–5, preserved as numbers | absence/empty optional is omitted; initial visual zero means unselected, not saved zero | zero, fractions, NaN/Infinity, numeric strings, booleans, null, own undefined, arrays and objects |

No default value is inserted. The existing optional rating clear button emits empty; repeated same-star clicks retain the selected score. The existing readonly scalar formatter displays stored Switch code `0`/`1`; this slice does not redesign display labels.

## Transaction and lifecycle

The normal forms protocol remains one `biz/extForm/upsert/{definition}` followed by one `workflowNode/updateExts/{node}` and authoritative readback. Preset 1 writes root; preset 0 uses the existing root plus EXTS mirror. The exact raw ACK and raw readback must preserve expected slots, omission and scalar types; `false`, `'0'` and `0` are never ACK-equivalent. The existing command lock and uncertain-state handling remain. Observed external authority withdrawal during owned fresh-read gaps is permanently invalidating, including restoration before the read completes. The new source proof shares that protection and fresh metadata seal.

This first-create capability cannot authorize edit, append, completion/Process, upload or delete. No Switch/Rate configuration is routed through the earlier scalar hidden-draft helper. Conditional Switch/Rate forms are explicitly unsupported in this first slice; implementing them requires separate Runtime condition-context/omission evidence. Mixed-picture schema and greater-than-50 metadata subsets remain separately unsupported; their published scalar validators are unchanged. Typed roots/EXTS, appointment, existing records, canonical 59-field coverage, production/native/Qiniu remain unestablished. The later bounded ordinary Java/Mongo result is recorded separately below; it does not establish typed storage.

## Fixed source basis

- Legacy `xlink-bj/xlink-app` commit `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`, `business_jishi/subpackages/extForm/extForm.vue:148–173` binds Switch active/inactive values `1`/`0`; `374–392` renders default `van-rate` without half/count override. Pinned control source confirms default five stars, integer changes and no same-star clear-to-zero.
- Backend `xlink-bj/xlink-cloud-backend` commit `5fc008d32e771205260f120621c1c4fc62d0824e`, `ExtFormServiceImpl`: special Survey/InspectionAppointment create precedes ordinary type0 Map handling; full Map save preserves submitted scalar shape but is not domain validation or CAS. Typed DTO coercion is not permission to send fractional scores.
- Independent source/contract work recorded 34 App/provider/panel assertions and 19 inputs projected into three Java targets (57 projections). Those projections intentionally include invalid inputs and are not 57 valid cases, Mongo persistence, production configuration or this slice's tests.

## Local verification

Baseline normal-reader/provider regressions: four actual failures in field projection, optional omission and renamed first creates; no business command was sent. Final focused/browser/quality results are recorded below after execution. Tests use only explicit synthetic metadata and intercepted normal-App APIs, never a special test page, injected node type, fake grant expansion or real backend command. Early browser locator failures are retained separately; they are not product acceptance.

Final combined local execution: new normal-reader/provider suite **85 PASS**; 13 directly related files **545 PASS**; `VITE_XLINK_ENVIRONMENT=test pnpm run verify:full` **306 files / 5,379 PASS**, typecheck/architecture/dependency/quality gates exit 0; H5/MP/App release builds exit 0. The first final-gate attempt stopped before unit execution on TS7034/TS7005 for an inferred hydrated-field array; an explicit erased type annotation fixed it. The before/after emitted reader JS is identical and hashed. Failed logs are retained.

Normal App opt-in H5: new Switch/Rate **5 PASS**, existing choice **6 PASS**, ordinary hidden draft **3 PASS**, normal image **1 PASS**, typed image **2 PASS** = **17 PASS / 0 skip**. New five cases use real visible controls, native visible Back/reentry (fresh draft), optional clear and same-star retention, renamed metadata, scalar zero/Code mixing, required refusal, wrong-type ACK and fresh readonly drift. Three successful cases each issue the expected two synthetic commands; malformed ACK stops after one upsert, readonly drift sends none. All new cases have zero Process/upload/delete/external requests. API responses are intercepted synthetic fixtures, not Java/Mongo acceptance. Initial browser role-locator failures were preserved (2 failed, 1 intentionally interrupted at an observed pre-write locator wait, 2 not run); corrected Uni-compatible selectors passed without changing product controls or semantic assertions.

The newly added spec is `tests/h5-main-mock/switch-rate-create.spec.ts`; opt-in command is `XLINK_H5_SWITCH_RATE_CREATE=true pnpm exec playwright test --config config/playwright/switch-rate-create.config.ts`. Its browser/output/JSON/attachment paths are portable and separate. This original slice did not include CI hookup. Later private CI closure and independent review are recorded below; no publication, remote CI or native execution is claimed.

## Subsequent private review and real ordinary chain

B2 corrected19 and this Switch/Rate8 increment independently reached RELEASE_PRIVATE_CANDIDATE. The final combined37 verification is307 files/5397 tests, verify:full exit0 in85.51s, including typecheck/boundaries/dependencies/quality; MP/App builds exit0 in10.72s/7.04s. These ran before this documentation-only closure; all32 non-document paths remain identical. Prior5379/full/three builds belong to the earlier26 tree. The final verification's first attempt mistakenly inherited build-only release environment: unknown Mock environment correctly disabled synthetic reads,7 quotation-test failures/5390 passes, exit1 in90.09s. Its log remains; only command environment changed to CI test, with no assertion/product change.

The separately verified real report SHA256 is `23315d9e3460234adb57500451d13b26e60e847b6f6bf93f7d28c87dd38923a3`. On the earlier exact released24 and an explicit ordinary type0 four-field synthetic configuration, normal App controls, fixed Java and Mongo preserved root Switch String0, another root/EXTS String1 and Rate Int32 4; optional Rate absent. Double-click produced only1 upsert and1 full updateExts. All20 raw objects matched across same-DB restart before login; fresh no-grant/write-off cold read succeeded, then onlyAccount.updateTime changed.

Total73 realHTTP/4logins comprises a7-read origin-driver failure and an11-read incorrect DTO-property assertion (both0writes), followed by39 warm and16 cold reads. Original failed drivers/logs are retained; no business write was replayed. Process/upload/delete0. wholeNodeByte is explicitly NOT_PASS: the existing Node DTO removes two redundant top-level permission copies and adds defaults; authoritative nodeDef permissions and full business EXTS were retained. This is not whole-node byte preservation or a backend repair. Metadata Date precision/timezone losslessness is not claimed.

The ordinary first-create result is separate from the now-verified six-field UI11 atomicity/lifecycle, one save and no-grant cold read. Its original frozen create driver remains exit1/NOT_PASS due to a post-save hidden-row text oracle; no whole-script PASS is claimed. Typed/full59/production/native acceptance remains unestablished. No real chain was replayed in Cloud. The existing scoped CI now privately includes this5-case suite and the other ordinary suites; actual local CI-equivalent5 passed in37.17s. Entire hosted15-minute budget and remote run remain pending.

## Final six-field real evidence

The independently verified sanitized report SHA256 is `40ff13348802b3a95a494b9920ab301eb4d0cf9b734b7f06c2cad18dc06ee122`. On the exact earlier successful24 plus UI11 (35 source paths), UI11 atomicity/lifecycle, one real save and separate no-grant/write-off cold read are verified. **The original frozen create driver remains exit1/NOT_PASS; this is not a whole-script green claim.**

Actual normal controls showed native input and both authoritative props equal`on`, with the original DOM/date handles and other date/memo values retained. Date/Time Done→hide and Date Done→Back observed the old close callback cancelled;0pageerror. Exact cursor/selection remains unverified. The zero-write UI probe made25 JavaHTTP; the save run27 and independent cold observer16, total68 realHTTP/3logins. Exactly1upsert+1complete updateExts,0Process/upload/external/duplicate business requests; no save replay.

Authoritative query and independent BSON verify the same saved record: visitDate`2028-02-29`, mode`off`, memo retained; visitTime/visitAt/followupAt strictly absent from both root andEXTS. Objects20→22; all22 raw hashes exact across full owned-service restart before login; cold21 unchanged, onlyAccount.updateTime changed. Initial login also materialized known backend defaults. wholeNodeByte remains NOT_PASS because fixedNodeDTO removes redundant top-level permission copies/adds defaults; authoritative nodeDef permissions, full businessEXTS and retained zero preserved. Metadata Date precision/timezone losslessness and CAS are not claimed.

After successful save/ACK/query/BSON audits, the frozen create script expected a hidden followup row to display“未保存”. Existing readonly projection skips hidden rows, so this text oracle timed out (exit1); source/assertion/original failure remain unchanged. A separate cold-only observer passed the correct hidden-row-absent expectation without another write. This does not relabel the original driver PASS or silently delete its assertion. All owned boots exited normally and ports closed; earlier source/data/evidence retained. Reusable scenario-oracle alignment remains a test follow-up. No production/native/full59/commercial acceptance or original complete backend build is implied.
