# Quotation action identity and explicit order refresh

This private candidate starts from `878c78317f0838f236c3df2ee8fd39ad8cbf75c6`. It changes quotation workspace state ownership and order-list freshness; no form-plan, media, grant, backend or workflow contract changes are included.

## Reproduced findings

Three valid regression cases failed before the correction. After a successful load of a different quotation work order, the real Action Workspace retained the previous blocked or ready `quotationEditState`. The load reset composition/catalog/engine but left the existing-edit order ID in its closure. The submission adapter still independently checks an existing order's exact work-order ownership; this investigation does **not** establish a cross-work-order write or claim that check was bypassed.

The real QuotationOrderHub mounted hook calls its `refresh()` function. With an exact-scope successful order page already cached, that function called the cacheable `browse.load()`: the reader stayed at one invocation and the old page remained. The successful-state template has no visible Refresh button. Its visible “重新读取” button appears only after read failure, where an ordinary load already bypasses the success cache. The confirmed freshness gap is therefore the Hub's refresh/reentry semantics, not a demonstrated successful-state button defect.

One initial test fixture lacked a material and correctly failed the existing direct-composition validator before reaching ready edit state. It was corrected by providing the required synthetic material, without changing product validation. The initial environment-selected pnpm command failed before tests; the existing provisioned project toolchain then ran the actual RED. Both original outputs remain separate from the three valid RED results.

## Correction and retained boundaries

Action loading clears the visible edit status and active order ID before the new read. A private in-memory edit-source registry now binds verified existing-order provenance to the complete user/role/work/node/action draft identity and session/role-version authorization scope. It survives a failed same-scope load, so a successful retry can restore that exact existing-order path. Pending/failed pages never regain visible ready state. Other work/node/action identities cannot borrow it; an observed authorization change leaves a revoked source marker that blocks treating its restored draft as a new order, including after authorization is restored. Submit checks this private source as well as the UI status. This adds no durable draft-format migration or process-restart edit-origin claim.

Order browsing now exposes `refresh()` separately from its existing cacheable `load()`. Refresh revalidates the authoritative read port without a TTL, while identical pending requests still coalesce. The Hub uses that operation for its existing mounted/watch/retry handler. Scope/page-size checks, response ownership validation and stale-response generations remain in the common read implementation. Failed refreshes keep old rows unavailable and a subsequent load reads again.

Persistent submission receipts are not removed or reset. A synthetic submission test starts at most one new-scope workflow attempt, returns an ambiguous result, switches away/back, and verifies that the exact stored receipt and no-replay lock survive. Same-scope existing edit uses its own order ID; new-scope submission does not even read the prior edit ID. The v2 failure/retry regression asserts one authoritative old-order read, one upsert with that old ID, and zero new workflow starts. These are controlled synthetic command spies, not backend writes. Production read-only denial and existing submission guards remain covered.

## Executed verification

- New actual-store/component module: 25 passing cases. It compiles the real Hub SFC and executes its mounted/watch/retry handlers with the real Pinia browse store; only shared presentation components use host-renderer substitutes. It is not a browser DOM or visual acceptance test.
- Directly related quotation submission, browse handoff, edit preflight, success handoff, Production readonly and Action Workspace regressions: 7 files / 111 tests passed, including those 25 cases. Repeated development runs overlap and are not additional unique coverage.
- Final typecheck, architecture boundaries, module dependency check/self-test: passed. One intermediate test-spy tuple typing error was corrected; its original log remains retained.
- Historical v1 normal-App quotation input/draft H5: 7 passed, zero skipped, 50.2 seconds; not rerun after the v2 source correction. Original rapid-input, quantity, IME, draft and page-error/network assertions were unchanged. All seven network ledgers report no external intent or browser error. This is input/draft compatibility evidence, not direct browser coverage of the new Hub reentry regression.

At the initial bounded-correction checkpoint, no full-suite or release build had been repeated; the later frozen-v3 verification is recorded below. No production request, real business command, Java/Mongo service, upload, publication or manual CI dispatch occurred. Limited independent v3 review is now complete as recorded below; successful-cache/ready-edit browser Hub coverage, native and real-backend acceptance remain separate gates.


## Additional visible Hub smoke and exact coverage limit

A supplemental private normal-App diagnostic at 430×932 used the same established quotation-input fixture, without changing product or fixture flags. It reached the scoped Hub's explicit read-unavailable state, clicked its visible “重新读取”, created a local draft through ordinary controls, added a local material, returned through “查看订单与签约进度”, and observed a remounted Hub with its one-group draft retained. No external request intent or page error was recorded.

The combined diagnostic is **FAIL / incomplete**, not an additional passing test: the next visible-list search for work number `26020` returned an empty result, so the intended second-work-action UI transition could not execute in this fixture. It was not converted into a synthetic production grant or a fabricated node. An earlier diagnostic also timed out because it sought the handoff button while still in the first-step empty-product state; the real button appears after adding a product. Both failures and their exact progress are preserved.

This fixture's ordinary official Order read is explicitly unavailable, so it cannot establish a successful cached-page refresh or ready existing-order edit through browser UI. The current 25 real store/SFC cases include those positive and negative behavioral checks. The seven existing input/draft H5 cases remain passing compatibility evidence; the supplemental partial diagnostic is reported separately and is not counted as PASS or as proof of a cross-work-order write. A future supported successful Order-read/edit fixture would be needed for that remaining browser coverage, while the underlying permissions and read fences remain intact.


## Independent blocker and v2 revision

Independent review found a regression in v1: ready existing edit → same-scope explicit reload fails → retry succeeds → restored draft submits through a new workflow start because the edit ID survived only in the failed load’s local closure. The project reproduction confirmed one synthetic start with zero old-order reads/upserts. This is a command-selection regression in controlled spies, not evidence of an actual newly created order or a cross-work-order backend write. Its RED and both original v0/v1 packages remain preserved.

The private bound source described above corrects that sequence. The final 24-case module includes it, changed work/node/action/session/actor/role-version negatives, late edit-read/upsert results and retained uncertainty receipts. Session change now yields an explicit blocked provenance state instead of an empty status when a known edited draft is restored; this stronger denial is intentional. Genuine fresh empty drafts do not inherit old edit identity. Browser/Hub refresh changes remain byte-identical to v1.

V1’s separate 311-file / 5,743-test verify:full result is historical and is not attributed to v2. V2 ran the 110 directly related tests, typecheck, boundary and dependency gates only; no full suite, browser, builds or real business action was repeated. An initial unsupported matcher, a command-wrapper assertion correction and an intermediate expected-message mismatch are retained separately from the effective command-selection RED. At that v2 checkpoint, independent re-review and final-tree full validation were still pending; this history is superseded only by the final v3 results below.


## V3: load-owned authorization observation

Independent review confirmed v2 fixed the transient network-failure retry, but identified one remaining observation gap: a ready edit started a same-scope reload, session changed while the detail read was pending, and the load itself returned `session_invalid`/cleared. Restoring the original session and reloading could revive the private source because the mismatch comparison had not revoked it. One new real-project RED reproduced a synthetic old-ID upsert after that sequence; no start or cross-scope real write occurred.

The existing load scope comparison now observes the exact active session it just read before accepting or rejecting scope. The equivalent `ensureLoaded` entry comparison also explicitly observes its already-read session. This uses the existing private-source revocation function and does not depend on a capability/computed getter being read by UI. The single new regression deliberately avoids such a getter while the replacement session is active. After restoring the original session, submission remains blocked with zero old-order reads, zero upsert and zero workflow start. Normal successful reload, transient network-failure edit recovery, legitimate new-scope creation and stale/uncertain receipt checks remain in the 111 passing related tests.

V3 adds only those two observation calls, the one regression and this documentation update relative to v2. Browse/Hub bytes remain unchanged. The new exact RED/GREEN, 25-case module / 111 related cases, typecheck and boundary check are final-v3 evidence. During that v3 implementation revision no full suite, H5, build or real business operation was rerun; the subsequent frozen-tree validation and limited independent review are recorded below. The incomplete visible-UI diagnostic remains historical FAIL/partial.


## Final frozen-v3 pre-integration result

Limited independent review passed the same 16-scenario script with assertions unchanged: transient network failure/retry retained the old-order read/upsert path (1/1, zero start) with no ready state on the failed page; a load-owned observed authorization change remained blocked after restoring the original identity, with zero get/upsert/start. Scope isolation, late preflight/upsert and ambiguous no-replay checks also passed. This is a limited synthetic-module review, not a real Order creation or cross-work-order backend-write observation.

The exact frozen four source/test files subsequently passed one `VITE_XLINK_ENVIRONMENT=test pnpm run verify:full`: 311 files / 5,753 tests and all gates, exit0, 88.10 seconds. The unchanged normal-App quotation input/draft command passed 7 cases / 0 skipped (52.51 seconds report time), preserving its assertions and empty external-intent/error ledgers. Only this documentation status clarification followed those runs. No release build or real Java/Mongo/business operation was repeated. The earlier supplemental Hub diagnostic remains FAIL/incomplete at the unavailable second-work fixture, and its successful-cache/ready-edit browser coverage limits remain open.
