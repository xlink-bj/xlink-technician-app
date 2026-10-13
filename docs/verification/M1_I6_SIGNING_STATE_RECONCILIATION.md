> **Canonical technician R1 Contract query correction (2026-10-13):** This document's older `workOrder.vue` / `workOrderId` references describe an **alternative WorkOrder page**, not the primary Technician `ServiceAppointment` route. Primary `serviceAppointment.vue:9215–9229` uses `is:serviceAppointmentId|string#and` and `is:state|integer#or` / `is:exts.contractStatus|string#or`. The existing backend stores and looks up `serviceAppointmentId`. Importantly, backend `_all=1` overrides `rows`, so bounded New App reads **must omit _all**. This source-only correction is documented in [`M1_I6_CANONICAL_TECHNICIAN_CONTRACT_QUERY.md`](M1_I6_CANONICAL_TECHNICIAN_CONTRACT_QUERY.md). Real tenant parity and signer permissions are still NOT_RUN; real Contract reads remain disabled.

# M1 I6 — Signing state reconciliation and DEV-only Contract fixture

**Fixed R1 sources:** frontend `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`, `business/subpackages2/workOrder/workOrder.vue` 727–750, 772–885, 5025–5139, 5211–5260. Existing backend `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`, Contract entity and `EMongoTemplate.processParams` as recorded in `M1_I6_R1_SIGNING_CALLCHAIN_PARITY.md`.

## Directly delivered
- Formal pure read-model for official Order + exact-scoped Contract: not checked, bounded inconclusive, signing in progress, exception, recorded signed, unknown, contradictory/multi-version.
- R1 signing endpoint mapping remains **descriptive only**; every state denies initial/offline sign, re-sign, reminder, cancellation and other side effects. Status `-3` explicitly notes the R1/UI versus backend early return disagreement. A Contract status 10 concurrent with Order processState 0/4 remains contradictory, not definitive completion.
- One **isolated DEV H5 E2E synthetic fixture** is now bound to `mock-work-order-002` (the mock placeOrder WorkOrder), `mock-official-order-001` and `mock-contract-001`. These are **fabricated test-only records**, NOT a created official Order or a legal Contract. They are never sent to an external API. The reader can exercise the exact same sanitized projection UI.
- The adapter **denies all Contract preview reads by default**, independently of the page. Only a specifically injected synthetic WorkOrder and DEV+H5 E2E+Mock data flag permit the fixture. Staging/Beta/Production and real WorkOrders are all blocked. The Production transport Contract route allowlist remains closed.
- Main read page shows guarded Order, status reconciliation, mock-only Contract entry, no signing/SMS/PDF access. Boundaries tested with order/role revocation and cross-WorkOrder results.

## Known source and environment gaps
- **Unresolved:** R1 frontend filters Contract by `is:workOrderId|string#and`, pinned backend model stores `serviceAppointmentId` and parser has no visible alias. Cannot claim live parity from isolated fixtures.
- Signed contract actual credentials, role ACL, process transition, and asynchronous Qiyuesuo/SMS outcomes remain **not tested live**. Never infer no Contract from an empty/partial page.
- Codex assists with a separately authorized, bounded read-only R1/backend check in a permitted local account. Do not run actual signing, PDF/QR generation, cancellation, workflow write, customer SMS or API mutation.
- Draft PR only; no main merge and no increase in formal I6/M1 acceptance count without non-synthetic evidence.
