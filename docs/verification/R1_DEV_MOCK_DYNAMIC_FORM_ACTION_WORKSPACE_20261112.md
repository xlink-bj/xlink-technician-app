# DEV Mock dynamic form content in Action Workspace

This private candidate is based on `d09b51d3f8ccb7cada85e049267e0b5f6bf966e0`. It moves the existing DEV A-stage synthetic forms/repeat controller from the Detail side panel into the same Action Workspace host. It changes no real-backend write permission and adds no transaction protocol or storage data type.

## Entry and capability matrix

| Content | Current entry and authority | This candidate |
| --- | --- | --- |
| Normal forms/repeat, including existing appointment/media routes | Normal Workspace host; original reader/provider independently grants exact operations | Preserved; no new normal write capability |
| DEV A-stage synthetic active forms/repeat | Existing DEV availability and exact actor/node/source qualification | Detail `task-focus-action` opens Workspace with the original special Panel/controller |
| Closed node in the existing DEV A-stage synthetic transaction scope with pending receipt | Original controller classifies sibling receipts | `special-receipt-workspace-entry` opens a pending/read-only content host; unknown dispatch is not completed recovery |
| Closed state 10 in that DEV synthetic scope without receipt | Fresh original source qualification | Completed summary only; no special editor or generic Submit |
| Unverified real-backend transaction operations, readonly child nodes, historical timeline and signing | Existing restrictions | Unchanged |

The active route is `/pages/work-orders/action-workspace` with the exact work-order/node and `action=interact_with_form`. `action-workspace-shell` is unique; `special-form-workspace-content` contains the existing `a-stage-special-panel`. Detail no longer mounts that Panel. A URL or closed status never grants a command. The common host is presentation/lifecycle composition, not a second field engine or writer.

## Separate data and experience axes

Dynamic-form metadata, keys and verified field capabilities describe data; thin storage/save adapters preserve real differences such as ordinary Map collections versus typed Survey objects and their extensions. `forms`/`repeat` describe workflow source/behavior and do not select a data type. The experience layer independently chooses supported generic controls or a dedicated domain component, which may reuse the same dynamic data. This DEV synthetic controller host is neither a production data classifier nor a requirement that every business experience use the generic Panel.

Current normal-authorized Repeat appointment editing still uses the original normal Panel and provider; this slice does not connect the dedicated time/confirmation experience there. That would require reusing the reader's current exact-record appointment evidence and provider edit capability, including fresh original, grant, identity/schema/lease, replacement codec and uncertain fence. It cannot be selected solely by workflow node type or a field name.

A separate source-backed lease regression found that an enabled form read could arrive after its page had left, regardless of DEV resolver registration. Pending read ownership now uses the actual current page lease independently of content eligibility, while existing automatic appointment/transfer owners keep their own lifecycle. Merely registering a DEV resolver no longer selects normal host lease eligibility. No new form writer or experience is introduced.

## Persistence, ownership and receipts

`special-form-workspace-back` waits the latest real draft write. A false/error result keeps the page and input visible. Captured actor getters are bound to the view generation, so a replaced/unmounted view cannot start another command. Late seal/read results cannot alter a newer view. Cold reload uses actual same-order page-stack evidence for Back; otherwise it returns explicitly to that order's Detail.

The existing ActionDraftRepository remains unchanged. The special adapter serializes its exact role/action/content scope using the existing transaction lock. A retained completed generation clock rejects old autosaves after cleanup; successful controlled cleanup permits the next legitimate generation. There is no key deletion window for stale input to recreate an unfinished draft. The existing no-role legacy draft compatibility remains unchanged.

A local `specialSubmissionPending` marker seals input before the existing controller is called. It is neither an ACK nor proof of dispatch. Seal failure means zero controller calls. With no business receipt, sealed input remains available only for readonly checking; it does not automatically become an editable draft. Malformed markers/clocks fail closed. This intentionally includes a crash after sealing but before dispatch and a cleanup failure after the business receipt has been cleared. The candidate does not claim cross-device CAS or protection against arbitrary direct StoragePort writers.

Original sibling-FormDef receipt fencing, exact completed reconciliation, fresh state 10/full-record/field verification, Process batch encoding and command execution remain in the original controller. Internal DEV Mock dynamic-form names replace the former special host/controller names; the inverse rename reproduces the frozen implementation exactly, including persisted keys and external test IDs. `may_have_dispatched` remains unresolved. Failed tombstone cleanup does not clear the input or automatically replay a business command. A stale editor whose generation was superseded can refresh readonly revision feedback without dispatching its old edit.

## Validation and retained failures

Naming-stage product/test tree: `VITE_XLINK_ENVIRONMENT=test pnpm run verify:full`, exit 0, **317 files / 5855 tests** including typecheck, boundaries, dependencies and unchanged quality ceilings. Final H5, MP-Weixin and App release builds all exit 0; these are build checks, not native device acceptance.

Effective immutable-old delayed-storage probes failed twice; the same two race assertions pass against the new adapter. Current tests cover seal false/throw with zero controller execution, malformed metadata, legitimate next generation, latest flush failure, view replacement, late responses, closed pending qualification and unchanged quotation handoff. A bounded independent run passed 39 tests (generation 6, Panel 8, host 7, quotation 18); the later added edit-revision test is separate author evidence.

Historical failures are retained: first full run had 5843 passes plus an obsolete Detail-mount assertion and the 800-line page gate; a pure content host extraction restored the gate without increasing its limit. Second full had 5848 passes and six quotation SFC harness failures because it omitted a new pure lifecycle export; the harness import map was corrected without changing quotation product logic or assertions. The new edit-revision fixture first used a shallow text accessor; its recursive rendered-text assertion now passes. Early weak-network migration failures inserted the Workspace entry before the original explicit reload on a same-page query change, leaving the previous Detail visible. The final migration preserves the original URL/reload/customer-identity sequence before clicking the Workspace CTA; all original business assertions remain. The separate host suite covers visible Back.

Before the naming migration, related synthetic H5 had 20 passes (host 5, Stage1B 4, weak-network 4, normal Workspace 5, Mock repeat 2); the retained earlier 8-case compatibility run itself remained 7 passed / 1 failed before its weak-network correction. On the renamed tree, fresh verification passed 317 files / 5855 tests and the three representative H5 suites actually executed 12 cases: DEV Mock dynamic form host 5, normal Workspace 5 and Mock repeat 2. The initial Repeat command omitted its existing CLI opt-ins and skipped two cases; that result is retained and excluded from the successful count. The correctly opted-in run passed both cases. No full H5 catalog rerun is claimed. The first naming-stage full check stopped at an old Panel filename in a static parity checker; only that path was updated, with assertions unchanged, before the successful full rerun. The new dedicated suite uses `config/playwright/dev-mock-dynamic-form-workspace.config.ts`; normal Workspace and existing special compatibility suites remain independent. No new workflow wiring, remote CI execution, real Java/Mongo business, production/native/full business configuration acceptance or backend DTO repair is claimed here.

## Fresh-original lifecycle safety integration

The separately reviewed normal-reader/Panel correction binds an existing editor to its complete raw original, scope/schema and fresh edit eligibility. An explicit reread preserves live edits only while that baseline and its readonly identity continuity remain proven. Same-ID changed data invalidates the old editor; a failed read cannot become new original authorization. This does not persist existing edit drafts, grant new operations or establish backend CAS. The three product files are imported unchanged from the reviewed correction.

Two portable settled normal-App regressions cover same-original continuity versus changed original, and read failure/recovery versus a changed original. They use the same existing-edit synthetic grant and shared fixture as the established draft tests; normal10 and existing2 test bodies and separate outputs remain unchanged. The new `normal-form-fresh-original.config.ts` uses its own build/results/JSON directory and default Chromium. No new appointment-specific experience is connected here.

The final combined lease + fresh-original tree passed `verify:full` with **318 files / 5873 tests**, all included type/boundary/dependency/quality gates, and H5/MP/App builds. The exact five requested browser suites executed **24 tests**: DEV host 5, normal host 5, normal draft 10, existing-edit isolation 2 and fresh-original 2; final JSONs have zero skipped/retried/unexpected/flaky cases. Focused combined regression was 242 passes. Earlier naming-stage results remain historical and do not substitute for these combined-tree runs. No real backend business operation or hosted CI was run.

## Preparation-await ownership follow-up

Review of the previous combined60 found an earlier gap before `loadState` became `loading`: an ordinary page could wait for another action's local draft write, leave or be superseded, then resume its old load. Two deterministic real-store regressions preserve the original RED. The private pending owner now begins before any preparation await, checks exact session/route/preview/page identity, cancels on departure/clear/replacement, and uses the existing `ownedStillCurrent` hook throughout load/restore. Matching requests join the owned promise; the old completion cannot clear a newer owner. Existing automatic appointment and transfer flights retain their own owners. No permission, storage or business wire is added.

This follow-up passed 276 targeted tests and final `verify:full` **318 files / 5875 tests**. The shortest affected H5 rerun executed 12 cases (normal Workspace 5, fresh-original 2, DEV host 5) with zero skips/retries/unexpected/flaky cases. The previous combined60's 24 H5 and three builds remain historical evidence; builds were not rerun or claimed for this pure store follow-up.

A separate frozen-combined60 supplement passed the existing appointment time/confirmation and deferred-date recovery H5, but its MOCK-019 path is a local read-only preview, not enabled write authorization. A Survey experience case requires an existing Mock Process handoff first; it was not run under this task's restriction. Enabled proprietary-experience H5 and Survey-specific H5 therefore remain **NOT_ESTABLISHED** here; real-store unit and source comparisons are separate evidence.

A separately reported offline Survey adapter contract distinguishes current normal read-only preservation of arbitrary EXTS file fields from the legacy CommandAdapter's `surveyMediaValueCodec`, which recognizes its old named media keys. That legacy read boundary was not repaired here; its forms/repeat write guards remain closed and no failure of the current normal real chain is established. A future proprietary Survey experience must consume verified configuration-driven data/storage adapters, not assume the old codec covers arbitrary metadata.

## Fixed protocol sources

The legacy boundary is [xlink-app at 6c0a97b](https://github.com/xlink-bj/xlink-app/tree/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d); backend reference is [xlink-cloud-backend at 5fc008d](https://github.com/xlink-bj/xlink-cloud-backend/tree/5fc008d32e771205260f120621c1c4fc62d0824e). The separately published normal main-repeat finalization keeps its empty main-node data slot. The DEV special batch protocol is preserved independently and is not evidence for production special completion.
