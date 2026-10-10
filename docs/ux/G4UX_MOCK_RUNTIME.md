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
