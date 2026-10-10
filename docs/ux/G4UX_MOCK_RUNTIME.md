# G4-UX Business Mock Runtime

Status: development/test-only UX infrastructure. It is not a production data mode.

## Purpose and evidence

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

## Local Production Login + Mock-only Business (G4-F DEV QA)

This is the established local UX-development pattern: **real Production
`index/phoneLogin.do` authentication only**, followed by **equivalent,
synthetic Mock business data and local drafts**. It is NOT an invitation
to test orders, appointment writes, surveys, uploads or other business
operations against Production. The Production phone-login endpoint may
update account/session permission metadata as previously authorized;
no other server-side operation is authorized by this mode.

The App explicitly separates the two API targets. Keep all private
configuration in ignored `.env.development.local` within the isolated
worktree. Start from the existing locally authorized Production login
settings (never copy them into GitHub or logs). Example non-secret keys:

```dotenv
VITE_XLINK_ENVIRONMENT=dev
VITE_XLINK_PLATFORM=mp-weixin
VITE_XLINK_API_BASE_URL=https://example.invalid
VITE_XLINK_AUTH_API_BASE_URL=https://xlink.fsgo365.cn
VITE_XLINK_MOCK=true
# The existing local Production quick-login phone, tenant, method and
# any local-only code are reused privately; do not commit or print them.
```

`VITE_XLINK_API_BASE_URL` is deliberately a nonproduction, unusable
business fallback address. `VITE_XLINK_AUTH_API_BASE_URL` is accepted
**only in a local Vite DEV server, with a non-production
`VITE_XLINK_ENVIRONMENT`, an HTTPS URL and the known Production host**;
it is used **only by the authentication driver**. An ordinary `prod`
business build still hard-disables Mock; this override is rejected outside
the local DEV-only profile. A missing/invalid config fails closed.

Run **`pnpm run dev:h5`** for the normal main App (NOT the synthetic-session
`dev:uni-h5-g4f-review` and not Design System review). After successful
real authentication: Home → Mock 数据 → 数据 → Action Workspace → 报价草稿.
The authenticated actor may be used to bind synthetic role visibility,
but there are NO subsequent business reads from either Production or Beta.

In this **auth-only Mock isolation**, all business transports share a
hard deny of network fallthrough: unmatched Work Order/Quotation/catalog
reads, Order/Workflow/appointment commands, media upload and other
adapter-routed requests return a safe failure without `uni.request`.
This is true **even if Mock is toggled OFF/EMPTY, a route is not recognized,
or `VITE_XLINK_ENABLE_REAL_WRITES=true` is mistakenly present**.
Home displays `业务网络已隔离` rather than `Real API` when Mock is OFF.
Existing general DEV/test mode without the explicit auth override retains
its separate historical behavior; this stronger isolation only applies to
the Production-authentication hybrid.

**QA evidence:** one approved Production login request is expected; count
**zero** subsequent business HTTP requests to Production, Beta or other
hosts, zero real Order/Workflow/upload mutations. Screenshots, route
navigation, Mock part/catalog selection, and local draft recovery come
from the normal authenticated main App. A failed/unavailable login remains
`BLOCKED_ENV` and must not be replaced with a fake session. This proves
Mock UX only, not live-backend parity, native keyboard/device behavior, or
same-WorkOrder Appointment→Survey→Quotation workflow progression.

## Credential-free H5 diagnosis (no Production login authorization)

When the normal main App's `进入登录` entry is absent locally, do **not**
attempt quick login or infer an unauthorized external request. First run the
ordinary **main-App H5** Playwright smoke with **only synthetic CI-provided**
values:

```sh
# Use an isolated exact-HEAD worktree, with NO real browser session.
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
