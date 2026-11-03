# A: Local Draft / Weak Network / Media Recovery

Scope: R1-shaped offline Mock in the actual main App, 430×932 H5. No new server,
real API, real upload, Workflow advancement or automatic command synchronization.
The main App's existing synthetic protocol is the business receipt authority.

## Audit and changes

Reviewed `docs/architecture/LOCAL_DRAFT_AND_WEAK_NETWORK_ARCHITECTURE.md`,
Action Draft Repository, Action Workspace draft lifecycle, NetworkStatusPort,
Uni network adapter, MediaUploadQueue and native durable media store.

1. Generic Action Workspace already autosaves semantic values, flushes on exit,
   scopes drafts by identity and preserves failed-submit drafts. The dedicated
   forms/repeat editor instead kept incomplete edits only in a component ref.
   It now reuses **the same Action Draft Repository**, with user, role, work
   order, runtime node, FormDef and optional saved-record identity. Each input
   queues a local snapshot; empty fields and incomplete numeric input remain
   recoverable editor state, not proof of business success. Reads recheck scope
   and FormDef keys. An asynchronous read cannot replace newer typed input.
2. Browser network state now uses platform online/offline events behind the
   existing NetworkStatusPort. Offline status blocks explicit special commands
   before receipt dispatch; input and local persistence remain active. An
   online event only updates UI feedback. It never retries a save or Workflow
   command. Unknown network/backend outcomes still use the existing receipt
   fence and authoritative readback logic.
3. Special panel read refresh had incremented the same generation used for
   identity/operation validity. This invalidated network callbacks and hid
   failed-operation feedback. Separate read sequence and identity generation
   now reject stale reads without suppressing legitimate failure messages.
4. H5 queue metadata survived reload but its file bytes lived only in
   InMemoryDurableMediaStore. The browser now implements DurableMediaStorePort
   with IndexedDB Blob records, waits for transaction commit, and generates a
   fresh local Blob URL on resolve after reboot. Only local blob/data URLs are
   read, never a remote file URL. MP/App retain the native saveFile adapter.
5. Verified save completion writes a completed draft tombstone before best
   effort removal. It does not remove unfinished drafts merely because a save
   was attempted. No automatic offline command queue was added.

## Main App H5 acceptance paths

`tests/h5-main-mock/weak-network-recovery.spec.ts`:

- Type into the real 020 Workflow editor and wait for local save feedback.
- Set the browser context offline; continue editing and wait for local save.
- Click Save: receive explicit offline feedback, retain draft, no saved record.
- Create a second FormDef draft offline; switch back and recover the first.
- Reconnect: no saved record appears until the user explicitly submits.
- Create another work-order/node draft; close the first document and reopen
  its route in a fresh document in the same browser profile.
- Recover the first draft, explicitly Save, reload, verify new-record draft
  cleanup while sibling FormDef and work-order drafts survive independently.
- Edit a saved record without submitting, reload and reopen it: recover that
  record's draft while the authoritative row remains unchanged.

`tests/h5-main-mock/m3-survey-media-430.spec.ts`:

- Real browser file picker → shared queue → Mock upload → preview → reload.
- Inject a one-shot retryable upload failure, reload the whole App (destroying
  all in-memory media and old Blob URLs), explicitly retry the same queued
  file without opening the file chooser again, then reload successful preview.
- No external business/image request is sent; synthetic thumbnail GETs are
  fulfilled inside the test runner. No real upload is claimed.

A second weak-network H5 path injects a lost acknowledgement AFTER the local
Mock server persisted FormData. The App reports failure; after restart it keeps
the draft and unresolved receipt, does not fabricate an EXTS record and does not
create a duplicate FormData on subsequent reload. The test inspects the local
Mock snapshot to corroborate the visible pending state. It never clears an
ambiguous receipt merely to retry.

Additional controller/queue tests verify role revocation, node/FormDef/record
isolation, incomplete drafts, invalid inputs, stale results and ambiguity
fences. These supplement rather than replace the H5 acceptance paths.

## Limits and remaining work

- H5 evidence proves local recovery across document/page restarts in the same
  browser profile. It does not prove a cold offline PWA launch, cleared browser
  storage, OS eviction or native file behavior. No service worker/cache shell
  or browser-specific new backend is introduced.
- File persistence can fail (storage unavailable/quota); failures are explicit,
  with no fabricated durable task or successful upload. Main-App H5 injects
  quota-denied draft writes: no false save acknowledgement, retained prior
  values on restart, and explicit retry. Repository regressions reject older
  timestamped writes and completed tombstone resurrection; the main-App H5
  conflict case injects a competing newer stored revision and verifies that
  stale editor input cannot overwrite it. These guards are not atomic cross-tab
  compare-and-swap or OS-eviction certification.
- The shared media infrastructure is form-agnostic. A writable media field in
  the special forms/repeat transaction path remains Missing until an approved
  source-backed field/codec is composed into it; the R1 reference image remains
  read-only. This is tracked separately from real upload HOLD.
- LOCAL_DRAFT_PASS / WEAK_NETWORK_PASS / MEDIA_RECOVERY_PASS are bounded to the
  above successful H5 paths and final exact-head CI; they are not blanket
  certification of every form family or platform.

## This batch's local verification

- `LOCAL_DRAFT_PASS`: main-App H5 confirms new and saved-record drafts, sibling
  FormDefs, different work orders/nodes, document restart and post-save cleanup.
- `WEAK_NETWORK_PASS`: browser offline editing/autosave, failed offline submit,
  reconnect without replay, explicit save, lost commit ACK and preserved draft.
- `MEDIA_RECOVERY_PASS`: picker → injected failure → full App reload → explicit
  queue retry using IndexedDB bytes without selecting the file again.
- Unit-test counts and exact-head CI results belong to the current PR #265
  handoff; do not reuse the historical 1,633-test baseline as current evidence.
  Main-App H5 includes weak-network drafts, lost acknowledgement, quota-denied
  storage writes and the competing saved revision scenario. Each result must
  be checked on the final exact HEAD, not inferred from source changes alone.

These bounded PASS results do not close the Missing items in the capability
inventory and do not declare the entire A phase complete.
