# G4-F Phase 1K — Production Read-Only Integration

**Status: PARTIAL — bounded Production reads and UI integration are available; the sampled work orders had no active `placeOrder` action, and the quote sample did not expose SKU/SPU-bearing rows. Beta write-chain validation remains `BLOCKED_ENV`.**

| Property | Value |
| --- | --- |
| Repository / branch | `xlink-technician-app` / `codex/g4f-phase1k-prod-read-integration` |
| Implementation baseline | `dc3c13aa06e769a60623f5ab95fe4d50859db528` |
| Implementation source revision | `854b30e3ca8345026dcdbc206e65cda034e3c528` (source/tests commit; evidence follows in a docs-only commit) |
| R1 source revision | `xlink-app` `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` |
| Backend source revision | `xlink-cloud-backend` `5fc008d32e771205260f120621c1c4fc62d0824e` |
| Environment | Authenticated Production; approved local test-account profile, values omitted |
| Live smoke | Completed 2026-10-08; real app adapters; sanitized output only |
| Mutation boundary | Login-time account/session permission context was authorized; Production business mutation requests: **0** |
| Persistence | No credentials, session, raw response, raw IDs, customer values, literal prices, or full URLs persisted |

## Source-verified route boundary

The Production read transport requires both the `prod` environment or canonical Production host and an exact allowlisted request shape. The command and upload transports remain blocked in Production. Source was checked against the revisions above; the local backend checkout is a source snapshot, not a separately verified Git HEAD.

| Route | Source evidence / request boundary | Phase 1K use |
| --- | --- | --- |
| `index/phoneLogin.do` | Existing authenticated quick-login flow. It can persist account permission/session context; this is the only explicitly authorized persistence side effect. | One login request; session held in memory for the smoke. |
| `function/queryTreeByRoleId` | Role-tree read; exact `roleId` query only. `function/changeRole` is explicitly blocked because it persists `Account.permissionRoleId`. | One request to resolve the account's role-scoped list action. |
| `basic/serviceAppointment/query` / `querySAWorkflowNode` | Work Order list reads use the role-tree-selected mode and bounded list body. | One page, at most three rows. |
| `basic/serviceAppointment/queryById/{id}` | Work Order detail read; the adapter accepts only an ID returned by the current session's role-scoped list and does not send the legacy `type=query` permission bypass. | Three list-derived detail reads. |
| `basic/order/query` | `OrderController.query` injects the authenticated account tenant. `OrderServiceImpl.query` applies normal data-scope behavior and can filter by `serviceAppointmentId`; R1 Work Order detail also uses `is:serviceAppointmentId|string#and`. This is **not** treated as a user-wide “my orders” endpoint. Phase 1K requires an exact list-derived Work Order identity, `type=1`, page 1, and a maximum of three rows. | Three one-row reads, each tied to one of the three returned Work Orders. The application detail view uses the same filter with a maximum of three rows. |
| `biz/projPackage/queryWithRank`, `biz/procedure/queryWithRank`, `basic/material/queryWithRank`, `biz/measure/queryWithRank` | Each controller delegates to `GoodsService.queryWithRank`; the accepted R1 context/filter shape is enforced. No write route is allowed. | One source-context read per catalog kind. |
| `biz/projPackage/findById/{id}` | `ProjPackageController.findById` delegates to package detail read; ID must come from the successful package list in the same smoke session. | One detail read for a list-returned package. |
| `basic/order/queryById` | Backend source lookup is not sufficiently scoped for Production browsing. | Blocked by the Production transport; not called by the Production UI or smoke. |

The smoke request executor independently blocks any route/body outside this bounded matrix before network access. It does not retry requests and does not print response bodies, IDs, names, prices, or server URLs.

## Production read result

The live smoke used the app's `AuthSessionAdapter`, `UniApiReadTransport`, role-scoped Technician API, quotation catalog adapter, and dedicated quotation Order read adapter. Temporary session and returned record identities existed only in process memory.

| Observation | Result |
| --- | --- |
| Login / role tree | Login succeeded; one role-tree read succeeded. Login-time account/session permission-context persistence is separately authorized. |
| Work Orders | One bounded page returned 3 rows; all 3 list-derived detail reads succeeded. |
| Workflow | No sampled detail contained an active `placeOrder` node; no current quotation action was claimed or opened. This is a bounded sample, not evidence that the account has no such work orders. |
| Catalog context | All three sampled details contained a usable service-type context. |
| Existing type-1 Order | Three one-row queries were run, each filtered to a different Work Order ID from the role-scoped list and to `type=1`; 3 rows returned and each matched its selected Work Order. |
| Package catalog | 27 rows returned in the observed context; one package detail read succeeded. |
| Procedure catalog | 66 rows returned. |
| Material catalog | 89 rows returned. |
| Measure catalog | 4 rows returned. |
| SKU/SPU | 0 of the 3 sampled rows exposed a recognized SKU/SPU identity. This is not proof those fields do not exist in other records. |
| PDF | All 3 sampled rows exposed a PDF-field-presence marker. No URL was persisted or opened/downloaded; host authorization and PDF validity remain unverified. |

The final live run made **14 Production requests total**: 1 authorized login, 1 role-tree read, 1 Work Order list, 3 list-derived Work Order details, 3 Work-Order-scoped type-1 Order reads (one row each), 4 catalog-list reads, and 1 list-derived package-detail read. The sanitized result was: 3 Work Orders / 3 details; 3 type-1 Orders / 3 Work Order matches; 3 Orders with grouped content; 3 recognized groups / 21 recognized lines / 0 unsupported groups; 0 SKU/SPU identities; 3 PDF-field-presence markers; 27 packages / 66 procedures / 89 materials / 4 measures; package detail succeeded. Unexpected network attempts: 0. Production business mutation requests: 0. No production-looking mock fallback is used when a real read fails.

### Historical query accounting and scope correction

One earlier `basic/order/query` request used only page/row parameters, without a Work Order filter. Source inspection then established that this endpoint is tenant/data-scope filtered, not intrinsically restricted to the current user's own Work Orders. This was **one separate Production request**, excluded from the final 14-request bounded smoke. Its sanitized aggregate briefly appeared in local runner output, but no raw response, identities, customer fields, or prices were emitted or persisted. Therefore the explicitly accounted evidence is one earlier unscoped query plus the final 14-request smoke; this is not asserted to be an exhaustive count of every Production request across all Phase 1K activity. The final live smoke harness enforced list provenance before sending each scoped request. The application adapter and synthetic regression tests are now also fail-closed unless the Work Order ID was returned by a successful list in the current authenticated session; every accepted quote row is checked against the requested Work Order before projection.

### Local review artifact audit

During verification, the local `.review/g4-e/` artifact directory was found unavailable. The verification, screenshot, and build scripts were inspected for cleanup operations targeting that path; none was found. Known review-build cleanup/output paths are under `unpackage/`, not `.review/g4-e/`. The directory contents could not be recovered from this workspace, so the cause of its loss remains **UNKNOWN**; no specific verification command is attributed as the cause.

## Application behavior

- Work Order list and detail use the existing authenticated, role-scoped app adapters. Production detail suppresses customer contact actions and does not call `function/changeRole` or use the `type=query` bypass.
- The Production detail page has a dedicated “报价记录 · 只读” tab. It reads only the selected Work Order's recent bounded type-1 Order rows, handles loading/empty/denied/retryable states, and does not open/download PDF documents.
- Server Order content is projected as a non-editable grouped display. Recognized SKU/SPU identity is preserved in the read projection when returned; unrecognized group/field structures remain visibly unsupported and read-only. Server records never hydrate or overwrite a local quotation draft.
- The `place_order` quotation Action Workspace remains a local composition surface only when an allowed current action exists. In Production its submit action is absent/disabled, the UI labels the local draft as unsubmitted, and store-level submit/edit/readback methods fail closed. No sampled Work Order supplied a current active `placeOrder` action in this smoke.
- Existing Order direct-ID reads, Order writes, Workflow Complete/process, form writes, uploads, customer communication, contracts, coupons, and payments remain blocked or unused.

## Verification results

The implementation is validated with synthetic redacted fixtures and the bounded live smoke. Build success is not treated as native-device runtime evidence.

| Check | Result |
| --- | --- |
| Bounded Production read smoke | PASS; 14 requests total: 1 login, 1 role tree, 1 Work Order list, 3 list-derived details, 3 Work-Order-scoped one-row Order reads, 4 catalog list reads, 1 list-derived package detail. |
| Unexpected network attempts | 0 |
| Production business mutation requests | **0** |
| Quote/workflow/form writes, upload, customer interaction | **0** |
| `pnpm run verify` | PASS; boundaries, UI governance, Phase 1A/1B checks, typecheck, 507 tests. |
| `pnpm run test:uni-h5-review` | PASS; 4 Playwright tests. |
| `pnpm run test:design-system-review` | PASS; 4 Playwright tests. |
| `pnpm run test:h5-review` | PASS; 32 Playwright tests, including G4-E scenarios and semantics. |
| `pnpm run test:uni-h5-g4f-review` | PASS; 12 Playwright tests. |
| `pnpm run build:uni-h5-review` | PASS. |
| `pnpm run build:mp-weixin-review` | PASS. |
| `pnpm run build:mp-weixin` | PASS. |
| `pnpm run build:app` | PASS. |
| `pnpm run check:g4e-review-harness` | PASS. |
| `pnpm run check:g4e-closure-readiness` | PASS. |
| `git diff --check` | PASS. |

Playwright ran Chromium `153.0.8010.12`. These are automated browser/build checks, not physical-device or authenticated native-App runtime evidence. The scoped Production smoke ran separately with zero blocked unexpected requests and zero business mutation requests.

## Remaining unknowns and blockers

| Item | Status | Boundary / next evidence |
| --- | --- | --- |
| Active Production `placeOrder` action on an approved test Work Order | `UNKNOWN` in the sampled page | The three sampled details had no active node; discover only through further bounded role-scoped list reads. |
| Type-1 Order contents for the selected Work Orders | 3 rows returned; 3 groups and 21 lines were recognized, with 0 unsupported groups | Sample limited to three Work Orders / one row per Work Order; no amount values are retained in evidence. |
| SKU/SPU-rich existing Order | `UNKNOWN` / not observed | No sampled row exposed a recognized SKU/SPU identity; this bounded absence is not global evidence. |
| PDF field host authorization and document validity | `UNKNOWN` | Presence marker observed on all 3 rows; no open/download route is implemented or called. |
| Historical Order edit and same-ID readback | `NOT_AUTHORIZED` in Production | Requires the separate Beta write-chain gate; server snapshots remain non-editable here. |
| Quote create/update/send/confirm/conversion and parent workflow completion | `NOT_AUTHORIZED` in Production; Beta write validation `BLOCKED_ENV` | No Production business writes. |
| Physical MP/App runtime and permission behavior | `DEVICE_VALIDATION_PENDING` | Builds and browser tests are not device evidence. |

## Safety

- Production business mutation request count: **0**.
- `function/changeRole`: **not called**.
- Order create/update/send/confirm/conversion: **not called**.
- Workflow start/process/complete: **not called**.
- Form mutation, upload, customer contact/message, coupon, contract, payment: **not called**.
- Credentials, session cookies/tokens, IDs, customer PII, literal prices, raw payloads, and full API URLs in repository evidence: **none**.
- MongoDB as an application data source: **not used**.
- Beta write-chain validation: **BLOCKED_ENV / not performed**.
- PR #30: remains open; no PR merge, Issue #29 closure, or G4-G work is authorized by this slice.
