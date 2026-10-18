# EQ-05A — Isolated, resettable Mock Command State Factory

**Parent:** [EQ-04 #173](https://github.com/xlink-bj/xlink-technician-app/pull/173), exact `5df64b0e9704ea04f60958a9da42f895def32256`. Draft only; no Production read/write or merged code.

## Root cause

The legacy `mock/router.ts` holds module-global mutable `commandState` containing the List response, WorkOrder Detail responses and a FormData map. It is manually reset between some tests and survives interactions by design, but makes it hard to create independent Appointment/Survey/Quotation scenarios and detect cross-test state leaks. Fixture identity and route ownership had already been extracted in EQ01; mutable state isolation is the next seam.

## Bounded implementation

`mock/command-state.ts` owns `createIsolatedMockCommandStateStore(seeds?)`. Explicit caller-provided seeds are **deep-cloned at construction**, while the default application's large fixture baseline stays **lazy (no eager JSON cloning on Production module import)**; each `current()` creates its own independent cloned snapshot; `reset()` discards only that instance's mutations. Detail/List and local FormData maps never share references across stores. No generated IDs/timestamps or network access. It is allowed to construct a controller for tests without importing the HTTP transport.

The existing application Mock router keeps **one default state instance** to retain all legacy state transitions, command responses and reset semantics; the external `resetMockCommandState` export is unchanged. The router no longer owns the module-global mutable state itself, but its business transition functions are intentionally unchanged.

**This does NOT yet replace every route with an injectable scenario engine.** EQ-05B should migrate the mutation/state machine methods (`acceptMockWorkOrder`, `saveMockAppointment`, Survey completion, formData lookup) to an injected controller, with deterministic per-scenario error/latency policies and cross-flow tests. That is tracked separately rather than claiming one factory solves complete Mock architecture.

## Proof

Direct behavior tests verify two instances diverge safely, reset is instance-local, original fixture seeds are not mutated even before first access, and the public router's idempotent route behavior survives default reset. Existing Mock DATA/EMPTY/OFF, current WorkOrder list/detail, Appointment & Survey flow, Order/Contract no-fallback and active role gates remain under original full regression.

Full `pnpm verify:full`, H5/MP/App real bundles, current Gallery 3 and commercial List/Detail/Q01 9 Goldens, real H5 Mock paths must PASS. Do not touch source SKU or server Order signing/authorization, no Golden promotion, no main merge.

**Unverified business truth remains HOLD:** R1 real SKU/price, backend tenant ACL, official Order type=1 acceptance and signed Contract result.
