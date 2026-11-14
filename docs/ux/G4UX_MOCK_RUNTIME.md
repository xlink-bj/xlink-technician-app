# G4-UX Business Mock Runtime

Status: development/test-only UX infrastructure. It is not a production data mode.

## Current daily workflow (2026-11-14)

Use the three environment categories and explicit entry commands in [README](../../README.md#development-environments): local frontend/backend development, frontend-only Mock, and Production read-only. Beta is an explicitly selected remote target, not the local default. Run from the existing main checkout; no task worktree, disposable App copy or `.review` build project. Add/update affected tests, run the existing focused regressions and main-App H5 suite for UI changes, then push main and check exact-commit CI as specified in [AGENTS.md](../../AGENTS.md).

For daily credential-free Mock regression use `pnpm test:main-h5-mock` (see the final section below). The early authenticated Mock and Production-login hybrid sections below are historical implementation/reference material, not prerequisites for current development. They do not authorize new Production requests. `.review/` is for system screenshots only; reports/logs use `test-results/`.

## Historical authenticated Mock behavior and evidence

This runtime follows the small mock boundary used by `xlink-consumer-jishi-3.0`
at pinned commit `4ea444969260e26b67560f2d4c5da87a174b930a`. The new App keeps
the same architectural intent while using synthetic, narrow fixtures and the
accepted Technician API adapter. R1/R2 repositories remain read-only.

Real Login and session bootstrap are never mocked. Only accepted business read
routes are eligible for synthetic responses:

- `function/changeRole`
- `basic/serviceAppointment/querySAWorkflowNode`
- `basic/serviceAppointment/query`
- `basic/serviceAppointment/queryById/<synthetic-id>`
- `biz/action/query.do` for synthetic service-appointment follow-up reads
- G4-D command fixtures for synthetic IDs: accept precheck/process and
  appointment form upsert/process

The mock is checked inside `src/adapters/api/uni-api-read-transport.ts` before
session/cookie injection and `uni.request`, but only after an authenticated
`SessionRef` is present. A matched route returns a raw backend-shaped fixture
and then passes through the same Technician API adapter mapping as a real
response. The G4-D command routes use the same raw-response normalization path
for Mock and Real. An unmatched non-synthetic route returns `null` and falls
through to the real transport. Mock commands are bounded synthetic UX fixtures;
they do not write to a backend.

## Safety and activation

- Default: ON (`data`) in `dev`, `test`, and `staging` when no stored choice or
  explicit build disable is present.
- Deterministic mock modes are `off`, `data`, and `empty`.
- Storage key: `xlink_technician_business_mock_enabled`.
- Mode storage key: `xlink_technician_business_mock_mode`.
- Optional non-production build flag: `VITE_XLINK_MOCK=false` explicitly disables
  the default; `true` explicitly enables it.
- `VITE_XLINK_ENVIRONMENT=prod` is a hard disable, regardless of storage or
  build flag.
- Unknown/missing environment is also disabled.
- Real workflow/process and appointment-form upsert writes are blocked by
  default; explicit `VITE_XLINK_ENABLE_REAL_WRITES=true` is required for a
  later authorized real-write slice. Read-only command reads remain available.
- No fixture contains credentials, tokens, tenant values, real customer data,
  or real phone numbers.

After real Login in a non-production build, Home exposes the `Mock 数据` source
switch and a small `Mock` / `Real API` indicator. The switch is ON by default
for a new development/test installation and routes accepted business reads
through the existing Mock Runtime. Turning it OFF restores the real read
transport. Every source change clears the Work Order list and Detail stores
before reloading the list, so data from the two sources cannot coexist in the
same in-memory UI state. While Mock is ON, choose `数据` or `空状态` under
`Mock 场景`. The panel is unavailable in production.

An authenticated session is required for every mock business read. Missing
`SessionRef` produces normalized `session_invalid` and neither a mock response
nor `uni.request` is allowed. Real Login and session bootstrap are never
mocked.

The mock control is an application facade; raw route names, wire fields, and
fixtures remain inside adapter infrastructure. UI receives only normalized
`WorkOrderSummary`/`WorkOrderDetail` values. SANODE workflow-node IDs stay
internal; the nested service-appointment IDs are what the accepted adapter
normalizes as `WorkOrderId`.

Every synthetic WorkOrderId emitted by the mock list is owned by this local
runtime and has a corresponding local raw Detail response. Synthetic IDs never
fall through to the real backend. Legitimately unmocked non-synthetic reads may
still fall through when a real authenticated transport is available.

With mock mode OFF, the previously verified Beta behavior remains unchanged:
real Login succeeds and the role-visible SANODE list may return the legitimate
`EMPTY` state. That real Beta `EMPTY` is separate evidence from deterministic
Mock `EMPTY`. Mock mode is for deterministic UX review only and must not be used
as evidence of Beta or production business data.

## Quotation Mock in the main App (G4-F)

The same authenticated development Mock panel as Appointment now includes
**「报价草稿」** under **Action Workspace 场景** when Mock mode is **数据**.
It opens the existing `place_order` Action Workspace for the bounded
`mock-work-order-018-quotation-foundation` / `mock-workflow-node-018-place-order`
identity, using the shared R1-shaped synthetic fixture and the existing
Package / Procedure / Material / Measure mock catalog. It does not mount the
isolated `review-app-g4f` or fabricate a session.

**How to review:** use an ordinary authenticated *development* App session,
enable `Mock 数据` → `数据` on Home, tap `报价草稿`, choose a repair part,
enter the description and area, explore/package-configure/select catalog items,
then return, edit and reopen the local quotation draft. The exact synthetic
quotation ID is routed through normal Work Order detail/workflow identity and
is scoped to the existing DEV-only `productReviewOnly` UI guard.

The UI allows **local draft composition only**. Official Order confirmation,
Order creation, workflow starts/completion, authoritative prices, effective
tenant-specific ExtFields, signing and real readback are **not simulated**.
The simulated Appointment command success does **not** advance the same
Work Order into Survey and Quotation automatically. Hence this is not yet a
continuous Appointment→Survey→Quotation workflow simulator.

**Safety:** synthetic official `basic/order/upsert` payloads are identified
by embedded `order.serviceAppointmentId` and cannot fall back to a real
transport; synthetic `basic/order/query` work-order lookups and synthetic
`queryById` identities are also mock-owned even without a fixture.
Normal production business Mock stays hard-disabled and the legitimate
Production read/write capability policies remain unchanged. Unmatched
**non-synthetic** reads may still use the app's authenticated backend:
this is not an offline sandbox or a replacement for real Beta E2E.

**Gate:** source/CI verification and local main-App H5 test are distinct.
A browser proof must start from authenticated main-App Home, not from the
isolated product-review fixture's fake session. MP/App compilation is not
native device acceptance.

## Historical Production-login hybrid

The former Production Login + Mock-only business recipe is retained in
[the historical document](https://github.com/xlink-bj/xlink-technician-app/blob/a38b8ab7a00b024071ec129b08c43316f3e9266b/docs/ux/G4UX_MOCK_RUNTIME.md#local-production-login--mock-only-business-g4-f-dev-qa).
It is not a current startup instruction or a daily regression prerequisite.
Do not recreate its isolated worktree or reuse Production authentication for
ordinary development. Current environment selection is documented in README;
historical authorization does not authorize a new external operation.

## Main-App H5 boot diagnosis (no Production login authorization)

When the normal main App's `进入登录` entry is absent locally, do **not**
attempt quick login or infer an unauthorized external request. First run the
ordinary **main-App H5** Playwright smoke with **only synthetic CI-provided**
values:

```sh
# Run from the existing main checkout, with NO real browser session.
# Do not manually start another dev:h5 server on 5173.
pnpm run test:main-h5-boot
```

The Playwright config starts its **own** DEV server on `localhost:5173` with
`strictPort`. Port conflict is a test-environment failure, not permission
to attach to a stale server or choose a different port. The suite always
intercepts and aborts **every** non-local URL, including its synthetic
`POST index/phoneLogin.do` request. There are zero external sends. It
does not use a real account, real auth response or a fake application
session, and it does not run the detached G4-F Review App.

If the login entry fails to appear, `OFFLINE_BOOT_BLOCKED` reports only:
safe page route, DOM shape counts, browser error counts, local asset HTTP
status/path and blocked external **method + origin + pathname**. No
credentials, queries, payloads, headers, cookies, user-facing DOM text or
transformed entry source are logged. Do not turn off request interception
to diagnose. Treat a local bootstrap timeout as **BLOCKED_ENV**, not as
evidence that Production authentication failed.

Only after the local offline result is examined may Lead separately
authorize another Production authentication. The prior unrecorded external
request cannot be retroactively identified by a later successful offline
run. The entire main-App Mock quotation journey remains a different Gate.

## Repeatable credential-free main App Mock UX Gate

Use the **real ordinary uni-app H5 application**, not `review-app-g4f`,
for daily Mock UI integration and regression testing without repeated
Production authentication. This test-only composition is explicitly
different from actual user identity/permissions acceptance:

```sh
pnpm run test:main-h5-mock
```

The Playwright runner owns `localhost:5174` (strict port), supplies a
non-Production DEV-only `VITE_XLINK_H5_MOCK_E2E=true` test fixture with
`https://example.invalid` as the **sole inert business destination**,
and **does not configure any Production auth URL, phone or code**.
App startup restores a built-in, clearly synthetic technician Session
and role through the **normal `AuthSessionPort`**, then uses existing
`Mock DATA` adapters and the ordinary Home/Action Workspace routes.
This is a *Mock-only test identity*, **not a successful Production login
or authenticated R1 role permission proof**.

The configuration validator rejects this mode unless all are true:
local Vite `DEV`, environment `dev`, business API exactly
`https://example.invalid`, Mock enabled, no Production authentication
override and real-writes disabled. The resulting `authOnlyMockBusiness`
switch blocks **all non-Mock business read/command/upload transports**
from network fallback. The browser additionally aborts **every**
off-origin request before sending; even a blocked attempt FAILS QA.
Production builds and normal DEV auth remain unchanged.

`test:main-h5-mock` emits structured JSON and HTML under
`test-results/main-h5-mock/`; screenshots and traces are included
where applicable. CI's `actions/upload-artifact` runs **even when tests
fail**, retaining evidence for seven days. The suite must capture the
result, stage, sanitized network intents and JS errors; it must never
record real account data. This eliminates reliance on a manually
retained Codex execution transcript.

**Separate gates** remain:
1. *Mock UX Gate*: frequent CI/local browser tests with no real login.
2. *Authentication isolation Gate*: source-verified login-only
   integration, scheduled sparingly with a strict external allowlist and
   durable evidence installed before any request.
3. *Real business parity Gate*: authorized Beta/R1 contract and safe
   official Order read/write E2E, not inferred from Mock UI PASS.

When Mock UX breaks, fix the affected code/tests in the existing checkout and
rerun the relevant suite and CI. Local and Cloud Codex have equal development
responsibility; local OS/device/internal-system checks are needed only when the
changed behavior actually depends on those capabilities.
