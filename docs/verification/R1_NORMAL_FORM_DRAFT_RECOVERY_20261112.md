# Normal form first-create draft recovery

Scope: normal App forms/repeat first-create panels with **zero existing records**, supported non-media values only. Existing edit/append protocols remain independently authorized. This does not add API write permission or change R1 command parameters.

The Panel uses an injected thin adapter over the existing `ActionDraftRepository` and StoragePort. Identity includes authenticated user/role, actual configured tenant, order, runtime node, workflow run and definition. The stored record binds the normalized schema, fillable/read-only fields and actual optional role version; schema/permission/record drift blocks recovery without overwriting the stored copy. Session references and actorScope are never persisted. Media values, owned receipts, provider state and commands are excluded.

A successful fresh read and current capability projection precede the explicit recovery action. Same-scope reread keeps current values. Local autosaves serialize by semantic key within the current runtime, including accepted writes that finish after route unmount; stale callbacks cannot modify a new editor. This is not an atomic cross-tab/process CAS guarantee. Observed competing revisions fail closed.

Before a business save the local uncertain fence must be durable. Failure to persist that fence sends no business command. An unknown command result retains its fence and cannot be recovered as editable values or discarded for automatic replay. Verified success cleans the local draft separately from Workflow completion. Explicit discard is local-only and confirms intent; transient local cleanup failures can retry, and a completed tombstone cannot restore an old draft.

Non-target existing-record edit/append remains usable when there is no first-create recovery candidate. Newly observed records block an older first-create draft. Reliable existing-record version metadata is absent from FormDataRead, so this slice does not implement existing-record draft recovery. File recovery and arbitrary metadata/proofs are not restored.

## Review history and integration validation

V1 and V2 remain blocked historical candidates. Independent review reproduced an existing-editor value-loss bug in V1 and a delayed-discard/same-key-reread working-state deadlock in V2. V3 closes those cases with source/record/value ownership checks and guards that prevent reads while local draft work owns the editor. The original independent reviewer ran 38 cases with no skips and granted a limited release for integration of the exact V3 slice; this is not deployment or production acceptance.

The upstream V3 author reported 311 files / 5,763 tests and 21 synthetic normal-App H5 cases. Its three release builds were not rerun for V3; older build results remain historical. These counts are separate from the consuming integration results below.

The consuming integration preserves the four product files exactly. It adapts the dedicated H5 configuration to select the intended mode automatically and gives each mode a separate JSON, attachment and compiler output directory. A configuration metadata opt-in prevents this spec from accidentally running with the broad Mock suite's different server/grants. No application permission or business assertion is relaxed.

Run the two normal-App modes sequentially on the shared loopback port:

```sh
pnpm exec playwright test --config config/playwright/normal-form-draft-recovery.config.ts
XLINK_DRAFT_EXISTING_EDIT=true pnpm exec playwright test --config config/playwright/normal-form-draft-recovery.config.ts
```

The default command selects only 10 recovery cases. Existing mode selects only the two old-first-create-discard isolation cases. Neither mode requires an extra grep argument or counts excluded cases as skips. Default browser is bundled Playwright Chromium; `XLINK_DRAFT_CHROME=true` is an optional locally installed Chrome override, unused in Cloud validation. Results are retained separately under `test-results/normal-form-draft-recovery/normal10/` and `test-results/normal-form-draft-recovery/existing2/`; compiler outputs are likewise separate.

Cloud integration results: 204 focused tests passed; normal10 passed 10/10 in 42.42 seconds and existing2 passed 2/2 in 11.88 seconds, both with zero skips. The final combined-tree `VITE_XLINK_ENVIRONMENT=test VITE_XLINK_ENABLE_REAL_WRITES=false pnpm run verify:full` exited successfully: 312 files / 5,788 tests, including typecheck, architecture, dependency and quality gates (Vitest phase 70.74 seconds). Appointment edit compatibility passed 3/3 and generic Map edit compatibility passed 6/6, both with zero skips. Thus this integration executed 21 normal-App H5 cases, separately from the upstream author results. H5, MP-WEIXIN and App release builds each ran once and exited successfully (11.85, 10.73 and 7.69 seconds respectively). The scoped CI job adds only these two commands and their independent always-run archive paths. Its existing 15-minute timeout and every prior test/security setting remain unchanged; the previous hosted scoped test sequence took approximately 7 minutes 49 seconds, while the new pair adds approximately 54 seconds locally. Hosted final-tree timing is not yet established.

Validation uses actual main uni-app H5 login/list/detail routes at 430×932 with fully intercepted synthetic transport: zero real Java or production business requests/writes. Setup/browser/origin/oracle failures and the original recovery REDs remain historical and are not counted as current passes. Verified synthetic saves are not real-backend persistence acceptance.

No native execution, deployment, commit/push, new write authority, cross-process CAS or commercial visual acceptance is claimed. Screenshots and profiles remain local review artifacts.
