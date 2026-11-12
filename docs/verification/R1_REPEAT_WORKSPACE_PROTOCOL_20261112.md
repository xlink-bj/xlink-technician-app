# Normal Repeat Workspace and completion protocol

This private follow-up starts from published `d3ba96fc18148ce379018862f0527f0c7e49247b`. It does not add a second form host, field plan, controller or grant. Normal forms and Repeat already enter the same Action Workspace through the current-task CTA. Host availability is read-side eligibility; it does not make every Repeat operation writable.

| Source / content | Current entry and capability | Boundary |
| --- | --- | --- |
| Ordinary forms | Existing Workspace content and unified per-field first-create plan | Exact ordinary route, current grant, metadata/storage limits remain |
| Root workflow Repeat with supported scalar or verified conditional fields | Same original reader/Panel/provider in Workspace; v1 create and explicit complete grant | Create only with zero records; no append or arbitrary existing edit |
| Appointment Repeat | Same Workspace with `set_appointment`; v2 exact record-scoped edit/save-only controller | No create, complete or save-and-complete; full original record and other-record readback preserved |
| Verified typed/configured media Repeat | Same host, existing v3/v4 create-only provider, field/session/receipt proof | No existing edit or complete; unknown typed roots/tools remain unsupported |
| Historical, production main Repeat and child forms | Existing bounded readonly/timeline paths | No new executable task, child grant or production write |
| DEV A-stage special Mock forms/Repeat | Existing Detail-side transaction Panel, including closed-node pending receipt recovery | Still a separate entry; normal host tests do not migrate or accept this synthetic protocol |

## Confirmed protocol correction

The actual normal reader takes the runtime node from the root workflow returned by `serviceAppointment/queryById`: order workflow identity, runtime node workflow identity and source definition must agree. The existing provider binds its complete fields, actor/tenant/role/session, exact grant and private current-reader lease. It does not positively establish child workflow provenance.

Fixed [legacy serviceAppointment.vue](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/serviceAppointment/serviceAppointment.vue) distinguishes main `process('complate')` from child `doProcess(subNode)`. Main completion checks a nonempty form list and sends the actual main runtime node and definition with `nodeFormDataId:''`. Child completion sends the actual child runtime node and comma-joined saved IDs. The backend at `5fc008d32e771205260f120621c1c4fc62d0824e` passes runtime node and data ID into the workflow engine; those different data-slot values are not interchangeable. A success ReturnStatus remains an ACK, not proof of a stage transition.

The previous normal Repeat completion incorrectly selected the child batch encoder. The new `r1MainRepeatFinalizeProcess` keeps genuine Repeat source, requires one to fifty unique authoritative record IDs as a precondition, and leaves the wire data slot empty. Only the normal Repeat action changes encoder. The existing child `r1RepeatBatchProcess`, A-stage synthetic batch protocol, forms encoders, disabled general adapter and special guards remain unchanged. No real harmful mutation was demonstrated or executed in this investigation.

The original action regression first failed with a joined data slot while 27 controls passed. Guard tests additionally vary fresh actor/session/grant, closed/source node, foreign record definition/run and duplicate IDs. Existing uncertain ACK, recreation/no-replay, concurrency and ACK-without-transition tests remain. The typed Survey transport test now asserts the same root-node completion slot; it does not widen typed storage or grants.

## Normal UI contract and validation

Use normal Login → list → Detail `task-focus-action` → one `action-workspace-shell`, `normal-form-workspace-content` and original `r1-normal-form-read`. The generic submit is absent. Read through the visible “读取已保存表单” control. Main Repeat save-only remains a separate upsert; explicit completion requires its own request and confirmation and a fresh scoped read. The successful ACK alone does not claim a transition: the host rereads authoritative Detail. A contradictory ACK locks the old operation, and handler revocation removes completion without issuing Process.

The dedicated synthetic normal-App command is `pnpm exec playwright test --config config/playwright/normal-repeat-workspace.config.ts`. The configuration marks only its three tests and uses isolated loopback interception/output. No production backend or external provider is contacted. The existing appointment command remains `XLINK_H5_REPEAT_APPOINTMENT_EDIT=true pnpm exec playwright test --config config/playwright/repeat-appointment-edit.config.ts`; its three tests retain save/readback/other-record and uncertain-lock assertions and add explicit Workspace absence-of-completion and visible Back/reentry checks. Final executed counts are recorded with the private candidate receipt, not inferred from test registration.

## Remaining special-session convergence

The DEV special Panel cannot safely be moved by enabling the general adapter or changing only a CTA. Detail currently checks pending receipts even after a node closes. Its original Panel owns queued local writes, selected form/record identity, media tasks and recovery. A later migration must carry active editing and authoritative closed-node pending recovery as one owned session, expose explicit successful/failed local flush evidence, and revoke on actor/scope change. Merely awaiting its currently caught write promise would not establish successful persistence. This slice deliberately preserves that recovery path rather than presenting an active-only move as complete convergence.

No new child execution, delete, signing, messages/PDF, production/native capability, arbitrary typed writes, full business-configuration coverage or backend DTO repair is claimed. Previously published ordinary Workspace real acceptance and CI remain separate fixed evidence; these synthetic Repeat tests are not a new Java/Mongo acceptance.


## Executed candidate results

Author focused regression: 159 tests passed. Final `VITE_XLINK_ENVIRONMENT=test pnpm run verify:full`: 313 files / 5821 tests and all included type/boundary/dependency/quality gates passed, exit 0. Normal main Repeat H5: 3 passed; appointment edit H5: 3 passed. Both JSON reports have zero skips, retries, unexpected failures and pageerrors. All transport is synthetic loopback interception; each case's command ledger is retained. New main Repeat cases observe one upsert each, and only the two explicit completion cases send one Process each; the revoked case sends none. Appointment cases each send one exact-record upsert and no Process, EXTS or upload.

Initial failures remain separate: a package-manager startup failed before tests; the intended action RED showed the child IDs in the main wire; a new H5 config initially treated an inherited server array as an object; its numeric field locator used the wrong accessible role; and the positive synthetic ReturnStatus response omitted the fixed Java `isSuccess()` JSON property. The latter two failed before save or were rejected after the intercepted Process respectively; no real write occurred. Only fixture/config/locator corrections resolved those H5 setup failures; ACK and lifecycle guards were not weakened. Negative fixture opaque-ID type errors were corrected before the final typecheck/full run.

A native independent agent reviewed the root provenance and encoder delta with no source blocker. Its optional test startup failed before Vitest, so no extra independent execution count is claimed. No release builds, old real Java chains, broad nightly H5, workflow changes, Git staging or publication were performed in this private follow-up.
