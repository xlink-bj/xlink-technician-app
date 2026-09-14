# G4-UX Business Mock Runtime

Status: opt-in UX development infrastructure. It is not a production data mode.

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

The mock is checked inside `src/adapters/api/uni-api-read-transport.ts` before
session/cookie injection and `uni.request`, but only after an authenticated
`SessionRef` is present. A matched route returns a raw backend-shaped fixture
and then passes through the same Technician API adapter mapping as a real
response. An unmatched non-synthetic route returns `null` and falls through to
the real read transport. No write or mutation route is mocked.

## Safety and activation

- Default: OFF.
- Deterministic mock modes are `off`, `data`, and `empty`.
- Storage key: `xlink_technician_business_mock_enabled`.
- Mode storage key: `xlink_technician_business_mock_mode`.
- Optional non-production build flag: `VITE_XLINK_MOCK=true`.
- `VITE_XLINK_ENVIRONMENT=prod` is a hard disable, regardless of storage or
  build flag.
- Unknown/missing environment is also disabled.
- No fixture contains credentials, tokens, tenant values, real customer data,
  or real phone numbers.

After real Login in a non-production build, tap the Home `修链 / 屋顶维修`
brand line five times within 1.5 seconds. The hidden developer panel then
exposes one switch: `演示数据`. Enable it and choose `数据` or `空状态` under
`演示状态`. `数据` renders the synthetic SANODE/ordinary records, complete
local Detail fixtures, and R2-shaped follow-up action records. The adapter
sorts those records newest-first and derives their title, icon, tone, and
badge from the verified action type/text semantics. `空状态` returns a
deterministic empty list (`data=[]`, `total=0`) for the mocked Work Order list
routes and an empty follow-up action response for synthetic Details; it never
uses a real request for those mocked paths. Disable it to restore real
transport behavior. The panel is not
unlockable in a production environment and is absent during normal Home use.

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
