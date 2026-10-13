# M1-S1 — One-pass Owner engineering audit and Mock foundation closeout

**Owner source audit:** 2026-10-13, six-stage technician App. This is an **engineering review candidate**, not Production data parity or legal-signature certification.

Source pins: `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`; `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`. Existing Codex local restricted-read matrix and real-data caveats: #120. New App base is stacked Draft #116→#117→#118→#121→#122→#123, preserving original review points and main.

## Code inventory (no repeat implementation unless evidence proves a gap)

| Stage | Current source-backed App implementation | Remaining evidence (not an excuse to replace the App with demo pages) |
| --- | --- | --- |
| L / Login | Real login form, R1 manual phone `^1[3-9]\\d{9}$` and SMS `^\\d{6}$` preflight, existing Auth Port and scoped role/session, isolated DEV quick login | L02 real legal-document URLs and explicit consent product decision; L03 persistence policy/Production login response & role semantics, live auth cannot be inferred from CI |
| W / WorkOrder | Real ServiceAppointment list/detail, permissions, workflow node/actions; synthetic different-WorkOrder and role isolation covered | Active SANode perspective/filter parity is SOURCE_ONLY for unobserved combinations; alternative R1 WorkOrder page not proven reachable |
| A / Appointment | Real dynamic FormDef/form value runtime, `need=1` datetime branch, `need=0` deferred, local save/complete interlocks and reentry | Production active FormDef/FormData permitted bounded read absent; real Workflow business mutation reserved for S4 |
| S / Survey | Real survey dynamic form, leakage cause groups, media-reference model, role/field guards, isolated read/write command adapters | Active Survey/ExtField sample not read live; actual upload/watermark/device and durable remote effects reserved for S3/S4 |
| Q / Quotation | Real Catalog/Package/layers/Procedures/Material/Measures, grouped local draft, SKU read-only optional branch, pricing source projections, type0 vs type1 command fence, exact-Order model/readback guard, safe submit preflight | Ordinary Material `serviceType+sourceType` positively confirmed in Production DB but no live API read; current role has no active SKU `state=1+spuid`. Do not conflate. Real amounts/order edits and side effects remain S4 |
| C / Signing | Real official Order and bounded Contract read-side workspace, per-role/source guard, status/handler progress, five source-modeled intents permanently non-dispatchable; independent synthetic signing story | Existing Contract API not approved/read, status `-3` replay conflict source-only; cannot claim electronic-signature validity, SMS/PDF, or write outcomes |

## Direct Owner source resolution: bounded catalog is a proven protocol

- `com/osg/framework/util/FlipPageInfo.java:init`: `size` or `rows` parsed, `page` parsed, `_all=1` triggers `setAll(true)`.
- `com/osg/entity/FlipInfo.java`: default `page=1,size=20,all=false`.
- `com/osg/framework/mongodb/EMongoTemplate.java:475–486`: `_all` enlarges size to total when total is requested, otherwise `query.skip(...).limit(pp.getSize())`. Thus requesting explicit `page=1, rows=20` without `_all` is source-supported bounded paging.
- `com/fsgo/modulemini/basic/MaterialController.java:queryWithRank` calls `FlipPageInfo(request)` then `GoodsServiceImpl.queryWithRank`, whose `sourceType` preserves tenant/org and sale-price overrides for mini. Do not use another endpoint or guess current role scope.

`#123` changes **only read-path behavior**: all four catalog routes now use `page/rows` with unchanged active-state/serviceType/sourceType/sort, and maximum page 50. Continuation requires a user tap; pagination metadata `page, rows, total` is modeled in the **same** real Port and Mock transport; old pages survive next-page failure; duplicated/stale pages fail closed; search results are labelled partial when more server pages remain. This is SOURCE_VERIFIED request semantics, **not yet a Production API-success claim**. `Q02` SKU uses a distinct read port and stays `NO_SAMPLE`.

## Mock and safety acceptance policy

Mock behavior must use the same typed read Ports and response envelopes, preserving `ServiceAppointment → WorkflowNode/FormDef/FormData → type=0 Quote vs type=1 Order → Contract` identities. Existing synthetic fixtures are explicit demo IDs, not copied Production values. Core automated suite and actual App H5 exercises L/W/A/S/Q and a **separate** source-shaped synthetic Signing review; the current local quote is not silently converted into an authoritative Order. Retryable/terminal failures, no-record, unknown enum/fields, role changes, async and duplicate writes must remain fail-closed. No real workflow/quotation/contract mutation, upload, signature, SMS or PDF is authorized.

An absent current Production sample does not mean a Model/Port is absent. Conversely a R1-source-modeled Contract/SKU or CI synthetic PASS **does not** constitute live data parity. The current Phase S1 code closure is judged on **no outstanding safe-source-provable engineering change** and exact-HEAD tests, while environment-specific evidence is classified with explicit impact on Stage 2 UX.

## Smallest remaining external evidence gate — Codex LOCAL ONLY

Codex must **not** be tasked with ordinary source review, protocol design, coding, CI or PR review. Those belong to Owner/Lead. Only when already explicitly authorized, Codex may use the user's local read-only environment to return **redacted** evidence for:
1. Existing active ServiceAppointment + FormDef/FormData (appointment/survey) under a preapproved role and bounded row scope, or `NEEDS_SCOPE_APPROVAL`;
2. Q01 ordinary Material API under exact verified `serviceType+sourceType, page/rows` and existing read authorization, or `NOT_RUN`; do not expand roles or query an unavailable SKU;
3. Authorized existing Contract-to-ServiceAppointment/Order status shape, or `NEEDS_SCOPE_APPROVAL`; no sign/PDF/SMS, no business write.

**Owner decision required to formally open Stage 2:** source-modeled contracts/Mock can be treated as S1 **engineering code locked** only after exact-head CI and no critical unknown that would change page structure. Environment gates not owned by Stage 1 (actual business writes, legally binding signature, device QA) stay explicitly in S3/S4; any active-schema contract that cannot be verified remains labelled `SOURCE_MODELED` not `LIVE_VERIFIED`. No automatic 8/8 M1 promotion and no Draft merge.
