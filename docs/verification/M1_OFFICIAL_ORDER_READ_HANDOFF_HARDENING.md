# M1 P1.7 — Official type=1 Order read-only handoff hardening

**Source baseline:** Integrated DEV review [Draft #86](https://github.com/xlink-bj/xlink-technician-app/pull/86) exact `26dc6af3d896f143123ea9c23d77065b6cae934a`.  
**Role:** read-only Quotation Order list source for future explicit per-Order Signing overview. No Contract permission or signing action is inferred.

## Source-observed defects (on #86, not fabricated)

1. `src/features/work-orders/quotation/order-browse-store.ts`: a successful `load(WorkOrder, 1)` is cached by session identity + WorkOrder alone; a later `load(same WorkOrder, 3)` reuses the 1-row page. The same omission affects in-flight deduplication. Also the cached reply creates `pageSize: items.length` rather than returning actual server pagination metadata.
2. The Store had no independent validation of a returned Order's `serviceAppointmentId`, `type`, unique ID or count; the built-in API adapter verifies type/scope but any alternative port/future adapter could bypass the store boundary. `slice(0,3)` silently trims an oversize page.
3. `src/adapters/api/quotation-order-api.ts` verifies WorkOrder ownership and rejects more than **3 rows**, but not the actual requested bound **1** when client requests one. It did not reject duplicate Order IDs.
4. A thrown read-port Promise/exception could leave the Store in a `loading` state with no meaningful safe retry status.

## Implemented improvements

- Cache keyed by **session/role/version + WorkOrder + requested pageSize (1 or 3)**; return the accepted page's paging metadata intact. Never call one limited page exhaustive across the ServiceAppointment's potentially N official Orders.
- In-flight coalescing uses the same key. New WorkOrder or changed page request supersedes stale results; a role-version change/logout rechecks the identity before any result is committed. `clear()` resets all cached identities/pages.
- Store validates **every** result row: type=1, exact WorkOrder identity, nonempty unique OrderId, and size not exceeding the requested bound. Reject the whole page with generic, non-sensitive error copy; no partial or cross-WorkOrder leakage. No change to signing, pricing or quote submission.
- Adapter verifies requested `pageSize` (only 1 or 3), exact response bound, duplicate IDs, and existing list membership/WorkOrder ownership before returning any row.
- Unexpected thrown read port/transport error becomes sanitized retryable state, not a stuck spinner. A successful response without data fails closed.
- No change to `getQuotationOrderById` authorization: this direct ID path remains distinct and is **not** elevated to a safe Signing/Contract read. Original #39 Contract query policy and signing node/actor authorization remain unverified.

## Tests

`tests/g4f/quotation-order-browse-handoff.test.ts` covers exact 1↔3 cache, page metadata, in-flight coalescing, cross-size races, foreign WorkOrder, non-type1, duplicate/invalid/oversized IDs, missing response, thrown errors without leaking exception text, role/version and WorkOrder switching, logout, clear/invalidate and invalid input. `tests/g4f/quotation-order-read.test.ts` adds adapter 1-row bound, duplicate-ID and invalid size pre-transport cases.

Full CI must run at exact HEAD: Vitest, TypeScript, architecture and UI governance, MP/App bundle builds, actual main App H5 Mock Quote→Signing and legacy G4-F H5 regression. No backend/Beta/Production calls performed for these tests.

## Deliberate remaining gates

- **#41** Owner visual approval of Workbench/Catalog/Configure/Return **not given**. The visual prototype is not live commercial Vue UI.
- **#75** Server WorkOrder→SPU/Code tenant entitlement and real SKU reads **not approved**.
- **#39** Source-authorized server Order/Contract ownership, signing-specific Workflow node and role, Contract document access, PDF/status-sync side effects and Beta sign grant **not proven**.
- **#64** WeChat DevTools/Android/iOS runtime **NOT RUN**; compile PASS is not a real-device result.
- Local DEV Mock QuotationDraft remains unsubmitted and must never be treated as an official type1 Order.
- No Production/Beta business writes, Contract read, PDF generation, SMS, Workflow Complete or branch merges.

**Gate:** `ORDER_LIST_READ_BOUNDARY_HARDENED / CI_PENDING / SIGNING_NOT_AUTHORIZED / DRAFT_NO_MERGE`.
