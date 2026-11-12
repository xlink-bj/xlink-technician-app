# Normal appointment experience over the existing controller

The normal Workspace now offers the existing appointment time-selection presentation and a save-only confirmation over its current exact-record controller. Data adaptation and experience choice remain separate. There is no new draft store, writer, grant or backend protocol; a node purpose or URL alone cannot select an editable experience.

The host checks the reader's current private appointment evidence and the established six-field metadata codec. The Panel separately requires current `canEdit(record)`. Unsupported or unproven bindings keep the generic or readonly path. Projected fields, values and validation stay in that Panel; presentation receives a readonly value view and guarded update/save callbacks bound to the original snapshot, record, edit identity and generation. Revocation, a fresh source or cancelled/reopened editing rejects old callbacks.

Only the picker pane and unconfirmed date/time are temporary presentation state. Cancel returns without changing the draft. Confirmation uses the original Panel `save(false)`; it never calls the legacy Workspace submit or emits Process. The old enabled appointment page consumes the same extracted pure time block and retains its own original lifecycle. Existing exact-ID ACK/readback, other-record preservation, uncertain/no-replay, create/complete denial and hidden empty `reasons1` refusal remain unchanged. Existing-edit durable recovery and backend CAS are not added. The previously disclosed Date-to-String backend boundary remains; this experience does not claim date precision repair or new backend authority.

Commands using the installed project tools:

```sh
VITE_XLINK_ENVIRONMENT=test pnpm exec vitest run tests/engineering/normal-appointment-experience.test.ts
pnpm exec playwright test --config config/playwright/normal-appointment-experience.config.ts
XLINK_H5_REPEAT_APPOINTMENT_EDIT=true pnpm exec playwright test --config config/playwright/repeat-appointment-edit.config.ts
pnpm exec playwright test --config config/playwright/main-h5-mock.config.ts tests/h5-main-mock/deferred-appointment-r1.spec.ts
```

The first command runs six actual-SFC lifecycle cases, including an authorized A-to-B record switch. The dedicated normal-App config discovers two intercepted cases with no additional grep or skipped case: save-only with cancel/return/reentry, and observed permission loss before dispatch. Its metadata opt-in excludes these fixtures from unrelated broad Mock runs. Existing three appointment edit regressions retain all condition, same-ID, other-record, uncertain and Back assertions; only the visible save controls now go through review and confirmation. The existing one-case enabled time/confirmation regression remains on its original CI step. Results and attachments for the new two-case command are isolated under `test-results/normal-appointment-experience/` and collected by the existing scoped job without changing its security settings or timeout.

All new fixtures declare an explicit synthetic scoped v2 permission and intercept their transport. They are not real server authorization, production accounts or real Java/Mongo acceptance. No real backend, upload, signing, deployment, native or commercial visual acceptance is implied. The earlier legacy-method RED is retained as evidence that filling the legacy `appointmentForm` would be the wrong integration route; the normal experience does not change that method into a new authorization path.
