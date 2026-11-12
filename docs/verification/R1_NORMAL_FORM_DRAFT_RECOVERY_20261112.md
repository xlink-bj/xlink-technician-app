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

## Final identity and uncertain-result regression closure

The later Local closure is based on integrated main `7bfd4bfe3286b35bd0b761dc35c6c6e0d401a084`, which already contains the reviewed recovery and fresh-original fixes. This slice adds tests and the automatic main H5 gate; it changes no product source, API, grant, storage format or production-write policy. Earlier author/integration results above remain historical evidence rather than counts for this run.

Run `pnpm exec playwright test --config config/playwright/normal-form-draft-boundaries.config.ts`. Local Mac may set `XLINK_DRAFT_CHROME=true`; CI uses its pinned Playwright Chromium. The dedicated config selects nine cases with zero retries and its own output directory, inherits the established synthetic exact-scope grants and blocks other backend/network access. It uses normal Login → List → Detail → Action Workspace, the real reader/controller/repository and platform storage. It does not inject draft bytes, proof objects or providers.

| Boundary | Cases | Required result |
| --- | ---: | --- |
| User / role change, ordinary editing draft | 2 | Other identity has no recovery/editor/save; original disk bytes stay exact. Returning identity needs a fresh login/read and explicit recovery. Role refusal occurs before form reads. |
| User / role change after server accepts a write but its response is lost | 2 | Original uncertainty bytes stay exact; returning identity cannot restore, discard or repeat the business write. |
| Both write ACKs received, authoritative readback unavailable | 1 | A later successful read may display the saved row, but never converts the unresolved transaction into an editable draft or Workflow completion. |
| Full browser close/restart after lost response | 1 | Persistent synthetic profile plus a fresh login/read retains the fence and sends no new business command. |
| Local uncertain-fence storage failure before dispatch | 1 | Zero business commands; original editing draft survives. After reload, explicit recovery and a new deliberate Save may proceed. |
| Verified business save, local completed-tombstone write / removal failure | 2 | Backend-saved truth remains visible separately from local cleanup failure and incomplete Workflow. Restart never revives submitted input; permitted cleanup retries only local storage. |

Eight new Node regressions cover old user/role/session/version operations, fresh same-principal reauthentication for editing versus uncertainty, and actual Panel callbacks after actor replacement/unmount while a local pre-dispatch fence is delayed. The focused two-file group passed **65/65**. The first new Panel fixture mistakenly tapped the automatic-create container as a button (2 fixture errors); removing that nonexistent tap fixed the fixture without changing product code or relaxing assertions. Its original log is retained locally.

On this closure tree, `VITE_XLINK_ENVIRONMENT=test VITE_XLINK_ENABLE_REAL_WRITES=false pnpm run verify:full` passed **319 files / 5,905 tests**, including type, architecture, dependency and quality gates. Actual App H5 at viewport **430×932** passed **33/33**, with zero skipped/retried/flaky cases: new boundary9, normal recovery10, existing-edit isolation2, fresh-original2, normal Workspace5 and DEV Mock dynamic-form Workspace5. The special local run only overrides the browser channel to installed Chrome; source and assertions are unchanged. The new boundary9 also runs automatically in `Validate Main H5 UX`, with always-run JSON/trace/screenshot preservation under `test-results/normal-form-draft-boundaries/`.

Screenshots of returned identity, uncertainty with a visible saved row, pre-dispatch refusal and saved truth with failed local cleanup were visually inspected. Full-page screenshots may extend beyond the fixed viewport height. They remain synthetic local evidence, not Owner commercial visual acceptance. No live backend write/read, upload, Process, signing, native execution or deployment was performed. Existing-record/append durable drafts, media ownership restoration and cross-runtime atomic CAS remain outside this first-create nonmedia scope. Unresolved transactions stay fenced; this slice adds no automated transaction reconciliation or replay.

The prior 72 local changes were preserved before synchronizing the same canonical checkout: stash `cfdec7d4896aea93b685a42b82d8b2577c385969`, named `codex-preserve-canonical72-before-draft-final-20261112`. All 72 original file hashes were independently checked against its tracked/untracked trees. No worktree or application copy was created, and these old changes are excluded from this closure commit. Hosted exact-SHA CI is reported separately after publication; local counts do not imply hosted acceptance.
