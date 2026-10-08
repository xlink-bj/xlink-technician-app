# G4-F Phase 1J — Beta Chain Verification + Workflow Closure + Production Hardening

Status: **PARTIAL — live Beta create/edit is blocked by safe-target access.** This report separates checked-in source evidence and deterministic local verification from claims that require an authenticated Beta business record.

## Revision and source provenance

- Authorized base: `89218f9c375a0cf593a3787cced1bf24779a3422`.
- Branch: `codex/g4f-phase1j-beta-closure-hardening`.
- Evidence revision: the branch commit carrying this report (exact HEAD is recorded in the associated Issue #29 / Draft PR).
- R1 source: `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29`.
- Backend source: `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`.

## Beta access and mutation boundary

The configured endpoint was the non-production Beta environment. Five read-only login requests were made across two distinct credential sets: once with the locally configured, previously documented test account; once with the separately documented local backup account; once through the existing business API client's defaults; once through the technician app's actual `resolveQuickLoginInput` → `submitLogin` → `AuthSessionAdapter` → `createUniAuthBackendDriver` path, using an in-memory-only storage stub and a fetch bridge for `uni.request`; and once through the R2-documented `.venv-api-tools` business API helper. The business-client, app-adapter, and R2-helper checks were not new credential sets: their phone, code, and tenant matched the technician app's local configuration. All five requests were rejected with the sanitized category `login_rejected`; none established an authenticated session. Consequently, no work-order/ServiceAppointment reads were made, no test/disposable target could be proven, and no target was selected. This is `BLOCKED_ENV`, not evidence that a work order or quotation is absent.

| Activity | Result |
|---|---|
| Beta login preflight | 5 requests / 2 distinct credential sets; all `login_rejected` |
| Beta ServiceAppointment / workflow / Order reads | 0 |
| Beta business mutations, including child workflow and Order create/update | 0 |
| Production API requests | 0 |
| Production business mutations | 0 |
| Safe test target proven | No; target not selected |
| Live write flag | Not enabled for this verification |

No raw response, identifiers, customer data, credentials, cookies, or payloads are persisted here. The documented backup account was attempted once; the business API client's defaults, technician app's actual auth adapter, and R2-documented helper were internally compared with the local app configuration and found to use the same primary credential set. The app adapter and R2 helper each received business `success=false`; the app adapter reported terminal failure. The temporary app probe was removed; no source/test file was retained. R2 source distinguishes local Mock quick login (creates `mock-ok` without Beta authentication) from Cloud Read login (calls the same Beta `phoneLogin.do` contract). The current local R2 checkout has no `.env.local`, so its active runtime mode cannot be inferred from the source checkout alone. No further credential guessing or guessed work-order ID was attempted. An old Cloud UI login sample was not reused because it is a stale administrative UI session artifact, not a current technician-app session.

## Production read-only evidence and access boundary

**Evidence class:** `VERIFIED_PROD_STRUCTURE` for the bounded Mongo snapshot; `SOURCE_SUPPORTED_INFERENCE` for R1/backend behavior; no Production business API behavior is claimed.

The ignored local Production profile was inspected by key names and non-secret mode only: it targets the Production environment, Mock is off, and the real-write flag is false. The separate ignored Mongo credential file is mode `0600`. No environment values or credentials are recorded here. A bounded Mongo read using that configured account confirmed the configured read-only identity could access the required collections. The account→user relationship was resolved in memory; only aggregate counts and field paths were emitted.

The first Production MP/App artifact scan found the configured quick-login phone in three built files. Vite's Production profile now replaces quick-login phone/code inputs with empty strings before bundling. After rebuilding both Production targets, a byte scan of 208 MP/App artifacts against the ignored local quick-login phone/code and Mongo URI/user/password values found **no matches**. The Mongo database-name setting is a non-credential identifier and was not treated as a secret. The local environment files remain ignored and were not modified or staged.

### Sanitized sample and current record shape

The scope was the active ServiceAppointments associated with the locally configured account's linked user, using the observed owner relation. The phone, account/user IDs, work-order IDs, Order IDs, tenant IDs, names, addresses, URLs, prices, and raw documents were not emitted or persisted.

| Evidence | Sanitized result |
|---|---|
| Active ServiceAppointments in scoped sample | 38; all had `workflowId`; all had `serviceType=11` |
| `sourceType` distribution | `1: 6`, `2: 8`, `3: 8`, `4: 15`, `5: 1` |
| Linked official type-1 Orders | 54 |
| Order `state` distribution | `1: 37`, `-1: 17` |
| Order `processState` distribution | `0: 22`, `1: 7`, `2: 1`, `3: 6`, `4: 13`, `-1: 4`, `-2: 1` |
| Orders per ServiceAppointment | 11 had none; 16 had one; 5 had two; 2 had three; 1 had four; 2 had five; 1 had eight |
| `bjProducts` | 54/54 parsed as structured data with top-level `orderList`, `addItems`, `deleteItems`, `otherItemsAmount`, `preferentialAmount` |
| Group shape | `repairParts`, `constructionLocation`, `partDescription`, `maintainAreaNum`, `projPackages`, `procedures`, `materials`, `measures`, `totalAmount`; `constructionSite` occurred on 3 groups |
| Group collection rows | 50 package rows, 32 procedure rows, 25 material rows, 5 measure rows across the sample; all four collection values used `{data: [...]}` wrappers |

The relationship counts are a snapshot, not proof that every Order is currently editable. State, workflow, contract, payment, discount, and SKU-specific constraints remain separate.

### R1 SKU/SPU semantics and edit safety

R1 source at `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`, `business_jishi/subpackages/order/placeOrders.vue`, confirms that package configuration builds a `skuCode` from the package `exts.spuCode` plus selected material `exts.skuCode` values (except the base layer), and that Order restoration groups SKU material rows by `spuid`. The current normalized composition/reconstruction does not preserve these codes or SKU-specific package material state.

The sanitized Production scan found these nonempty `skuCode` / `spuCode` paths in `bjProducts`; counts are distinct Orders per path, not raw values:

| Field path | Orders |
|---|---:|
| `bjProducts.orderList[].projPackages.data[].skuCode` | 33 |
| `bjProducts.orderList[].projPackages.data[].exts.spuCode` | 33 |
| `bjProducts.orderList[].projPackages.data[].materialList[].material.exts.skuCode` | 30 |
| `bjProducts.orderList[].materials.data[].exts.skuCode` | 1 |

Therefore same-ID replacement edit must fail closed when these SKU/SPU code markers or package material SKU metadata are present. The guard now checks these locations in addition to explicit `spuid`/`spuId`/`skus` and `pricingMethod='1'`. This does **not** classify every other sampled Order as edit-safe; no Production edit was attempted.

### Workflow and document evidence

| Evidence | Sanitized result | Limit |
|---|---|---|
| Parent workflows linked from the scoped ServiceAppointments | 38 found; state distribution `0: 37`, `10: 1` | Does not prove a `placeOrder` node or completion semantics |
| Child workflows linked from sampled Orders via each Order's `workflowId` | 54 found; state distribution `0: 38`, `-1: 16`; `formDataId` present on all | Sampled child workflow documents did not expose the inspected parent-flow link fields; no parent/child transition conclusion |
| `exts.bjdPDFurl` | Present and nonempty on 54/54; URL scheme `https`, host `pub.fsgo365.cn` | No object paths or full URLs retained; access/stability/platform behavior not verified |
| `exts.warrentyYearPDFurl` | Present and nonempty on 54/54 | Typo-preserving backend field name; document usability not verified |
| `exts.yjdPDFurl` | Present and nonempty on 14/54 | Document usability not verified |
| Top-level `qiniuList`, `documentId`, `warrantyUrl` | Absent in the sampled Order records | Does not exclude other tenant-specific document fields |

PDF field presence is structural evidence only; it does not authorize a document UI or prove a URL is usable. Presence of tenant fields is likewise not proof that an Order pre-script requires them.

### Production API and role context

**Production API requests made: none.** The application Production API read boundary now permits only the exact source-verified POST read `biz/extForm/queryByColName/leakageCause`, with its fixed `_all`/sort body and no query parameters. Backend `ExtFormController.queryByColName` delegates to `ExtFormServiceImpl.queryByColName`, which resolves the tenant Ext and performs a paged `find`; the controller/service path inspected contains no write. This route was not called in this continuation.

The requested “log in, then read business data without writing business records” path is **not available from the inspected existing login/role contract without a separate authorization for account/permission metadata writes**. The login write is not a quotation/work-order mutation, but it is still a persistent Production database write:

- Backend `IndexController.phoneLogin` stores account/user in session and Redis. For tenant accounts it clears `permissionOrgIds` and `permissionRole`, then calls `mongoTemplate.save(account)` before returning. This is a persistent account/permission-context write, so the app Production auth adapter remains blocked before dispatch unless that exact metadata write is separately authorized.
- `FunctionServiceImpl.changeRole` persists `Account.permissionRoleId` with `updateFirst`, then populates `permissionRole` and `permissionOrgIds` in context. The Production read-only adapter blocks `function/changeRole`.
- `FunctionServiceImpl.queryByRole` can clear/add to the current role-ID list when passed role IDs, and does not establish the permission role/org context used by protected business reads; it is not a safe substitute.
- The inspected `queryTreeByRoleId` path is a menu-tree read, not a WorkOrder data-scope contract. No source-backed side-effect-free role-context path for ServiceAppointment/Order reads was found.

The user's updated governance removes a blanket numerical “Production writes must equal zero” acceptance criterion, but it does **not** grant blanket write permission: each Production mutation still requires specific prior authorization. No login/role/business mutation has been authorized or performed here. Mongo remains evidence-only and is not wired as an App data source.

### Exact current classification

| Capability | Status |
|---|---|
| Sanitized Production Mongo structural evidence | `PASS` for the scoped read snapshot only |
| Production app login with no database writes | `BLOCKED_EXTERNAL` — current login persists account permission context |
| Production role selection for business data scope | `BLOCKED_EXTERNAL` — `changeRole` persists role state; no equivalent side-effect-free contract found |
| Production API WorkOrder/Order reads | `BLOCKED_EXTERNAL` — no authenticated safe role context/read path available; no API request made |
| Production bundle credential exposure | `PASS` after the local build redaction; no configured quick-login/Mongo credential values found in 208 rebuilt artifacts |
| Same-ID Production Order edit | `NOT_AUTHORIZED` and not attempted |
| Production business mutations in this continuation | `0` performed; zero is an observation, not a global acceptance requirement |

## Create, readback, tenant contract, and edit

All live chain outcomes remain `BLOCKED_ENV`: type-1 Order create, authoritative readback, tenant pre-script validation, and same-ID edit were not attempted. Their absence must not be read as a pass or failure. The existing implementation's synthetic/unit and H5 tests remain local evidence only.

The backend `OrderServiceImpl.upsert` source shows that a create requires an active ServiceAppointment and active tenant `Ext` definition for `colName=order`; it executes that definition's pre-script when present. Whether the current Beta tenant requires owner/contact/description fields remains `UNKNOWN` until a safe target can exercise the actual script.

The same source shows material side effects beyond storing the Order: with `exts.isCreateBjdPDF='1'`, it attempts quotation/warranty document generation and saves a customer-facing Message; it then saves the Order, recalculates ServiceAppointment total/paid amounts and possibly pay state, and invokes an SLA update. These effects reinforce the requirement for an explicitly disposable, non-customer test record before any authorized live create.

## Parent workflow closure

**Source evidence only; Beta result `BLOCKED_ENV`.** In R1 `placeOrders.vue`, the new type-1 path starts the child Order workflow (`workflow/startWorkflow/order/null/{workflowFormDefId}` with `saId`) and then calls `basic/order/upsert`. The inspected path contains no explicit parent ServiceAppointment `workflow/process`/completion call. The inspected backend `OrderServiceImpl.upsert` likewise does not complete the parent workflow.

This establishes that the inspected R1 path does not issue an explicit parent completion command; it does **not** prove from current Beta state that the parent `placeOrder` node closes correctly. No speculative parent transition was added. Live parent workflow state remains `UNKNOWN / BLOCKED_ENV`.

## PDF / document contract

Backend source generates a quotation PDF during the `isCreateBjdPDF='1'` branch and writes a URL-shaped value to `exts.bjdPDFurl`; it also has warranty-document generation paths. This is source-level evidence only. No Beta readback verified the field, URL usability, stability/access policy, or platform open behavior. The current quotation read adapter preserves the server snapshot and recognizes `qiniuList`, but no validated PDF action is presented. PDF UI remains absent; production document contract is `PARTIAL / UNKNOWN`.

## Receipt recovery and duplicate protection

Deterministic test coverage simulates process restart by restoring the persisted `write_succeeded_readback_pending` receipt, then retrying only authoritative readback. It asserts the child-workflow start and Order upsert remain at one call each. Existing tests also cover restoring succeeded receipts, ambiguous dispatch blocking, same-ID edit without a second child workflow, and delayed readback not deleting a newer local draft. These are synthetic local tests, not live Beta evidence.

## Platform evidence

- H5: the G4-F review harness exercises the real quotation Action Workspace with synthetic ports and guarded requests; it does not authenticate or contact Beta/Production business APIs.
- MP: build evidence is distinct from runtime evidence. The DevTools CLI and build artifact are available, but no G4-F-specific MP runtime harness with isolated request interception was available and the automator package is absent. Manual DevTools runtime was not opened to avoid inheriting persistent local authentication/customer state. No Android device was attached and no booted iOS simulator was available.
- App: build evidence is distinct from runtime/device evidence. No native App runtime smoke was performed.
- No authenticated UI, real media, real quotation create/edit, or device restart claim is made.

## Remaining blockers and next dependency

| Item | Status | Owner / evidence needed |
|---|---|---|
| Beta authenticated read access | `BLOCKED_ENV` | Environment / account owner: restore the approved Beta login path |
| Safe non-customer disposable ServiceAppointment | `BLOCKED_EXTERNAL` | Product/Beta data owner: identify and attest a disposable test record |
| Current active `placeOrder` pre-state and linked type-1 Orders | `UNKNOWN` | Read-only Beta preflight after access is restored |
| Tenant pre-script requirements | `UNKNOWN` | Safe-target Beta create response, only if approved and preflight passes |
| Parent workflow post-create state | `UNKNOWN` | Authoritative readback after the single bounded test chain |
| PDF field/URL behavior | `PARTIAL / UNKNOWN` | Beta Order readback and approved URL/platform validation |
| Same-ID Beta edit | `BLOCKED_ENV` | Requires successful safe-target create/readback first |
| Native MP/App runtime behavior | `DEVICE_VALIDATION_PENDING` | Device QA with an approved isolated test account/target |
| Production mutation/readiness | `NOT_AUTHORIZED` | Separate future authorization; no Production action is in scope |

No G4-G work was started. No parent workflow command, quote confirmation, conversion, payment, coupon, contract, upload, or customer action was performed.

## Verification

| Command / suite | Result |
|---|---|
| `pnpm run verify` | PASS — boundaries, UI governance, Phase 1A/1B checks, typecheck, 45 unit-test files / 493 tests |
| `pnpm run test:uni-h5-g4f-review` | PASS — 12 browser tests, including Phase 1B composition, Phase 1I synthetic submit/edit, and the current quotation workspace |
| `pnpm run test:h5-review` | PASS — 32 browser tests; Chromium 153.0.8010.12 |
| `pnpm run test:uni-h5-review` | PASS — 4 browser tests |
| `pnpm run test:design-system-review` | PASS — 4 browser tests |
| `pnpm run check:g4e-review-harness` | PASS |
| `pnpm run check:g4e-closure-readiness` | PASS |
| `pnpm run build:uni-h5-g4f-review` | PASS |
| `pnpm run build:mp-weixin-review` | PASS — Design System review artifact, not a G4-F runtime smoke |
| `pnpm run build:mp-weixin` | PASS |
| `pnpm run build:app` | PASS |
| `pnpm exec uni build -p mp-weixin --mode prod` | PASS — build only; no Production API request |
| `pnpm exec uni build -p app --mode prod` | PASS — build only; no Production API request |
| Production bundle credential scan | PASS — 208 MP/App artifacts; no configured quick-login phone/code or Mongo URI/user/password values found |
| `git diff --check` | PASS |

The deterministic restart test restores a pending receipt after the simulated runtime boundary and proves readback retry does not dispatch a second child-workflow start or Order upsert. Build success is not represented as authenticated or device runtime success. The local MP DevTools CLI/artifact are present, but the isolated G4-F runtime harness/automator needed for a safe smoke is unavailable; no such smoke is claimed.
