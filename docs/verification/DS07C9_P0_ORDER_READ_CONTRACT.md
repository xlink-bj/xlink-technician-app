# DS-07.C9 — P0 Production Official-Order Read Boundary

**Status: DRAFT / source-level P0 fix awaiting independent CI and authorization acceptance.**
**Parent:** [C8 #165](https://github.com/xlink-bj/xlink-technician-app/pull/165), exact `3e99d96973d0e903475d037bbb25e10e5f97508a`.
**Allowed scope:** `src/shared/config/production-read-only.ts`, `tests/g4f/production-read-only.test.ts`, and this document + focused read-only workflow only.

## Finding: conflicting first-party contracts, not a verified production incident

1. `src/adapters/api/quotation-order-api.ts` emits **bounded** `basic/order/query` POST body: `page=1`, `rows=1|3`, `sortField=createTime`, `sortOrder=desc`, `is:serviceAppointmentId|string#and=<listed WorkOrder>`, `is:type|integer#and=1`; it **intentionally omits `_all`**.
2. `src/shared/config/production-read-only.ts` incorrectly required `_all='1'` in its Production read-only allowlist for the *same exact route*. No normally emitted adapter request could pass that test.
3. R1 `FlipPageInfo` uses `_all=1` to expand the requested `rows` limit to total. Therefore changing the adapter to send `_all=1` would weaken the backend limit, not fix the root issue.
4. Older `tests/g4f/production-read-only.test.ts` approved a synthetic transport request containing `_all=1`, while `tests/g4f/quotation-order-read.test.ts` explicitly required the **actual adapter** to omit it. Neither test alone covered the end-to-end adapter → Production transport contract.

**Consequence (from source, no live test):** valid official-Order list reads were blocked client-side by Production transport. No evidence of a Production incident, real customer access, or data leak.

## Minimal correction

- The allowlist now demands **exactly six** body keys, rejecting **all `_all` values** (including `0`), and retains `page=1`, `rows=1|3`, type `1`, strict WorkOrder ID and chronological sort; no additional query or tenant-bypass fields.
- Existing `basic/order/queryById` remains denied in Production. `basic/contract/query.do`, all signing/SMS/PDF and upload/write operations remain denied. Nothing changes in generic command transport, server, role management or the Order submission state machine.
- Regression tests send the actual `createQuotationOrderReadAdapter` request through `createUniApiReadTransport` under a synthetic Production profile, inspect encoded wire body, and assert a second, unlisted WorkOrder ID triggers **zero additional request calls**.
- Negative tests refuse `_all=1` at 1/3 rows, `_all=0`, wrong type, rows=4, unverified org keys, malformed WorkOrder ID, and unsanctioned `queryById`. All tests are local mocks; no genuine API request.

## Authorization boundary / limits

Allowlist checking is **only a local request-shape gate**, not a server or tenant ACL. Current app's WorkOrder membership check is in `QuotationOrderReadAdapter.isAuthorizedForCurrentSession` and in role-scoped list/cache guard. A separate caller who could invoke the raw read transport directly with an arbitrary *syntactically valid* WorkOrder ID would not be stopped by this allowlist alone.

**Thus release still requires independent real tenant/role enforcement evidence** (backend ACL, revocation/stale reads, and product-level permission review). Do not classify Production order browse as authorized beyond these deterministic bounds, and do not enable real signing or write APIs.

## Exit Gate

- [ ] Exact-head strict P0 test suite PASS, including full `pnpm verify`, typecheck, approved Golden/hash and all H5/MP-Weixin/App builds.
- [ ] Diff limited to the four review paths; backend and quote/contract/write sources unchanged.
- [ ] Separate authorized live *read-only* role and Order access check (not exercised by this PR).
- [ ] Explicit human merge/release approval **still required** after full 921+ commit ancestor review.

**No main merge, no Production network access or business writes are authorized by this fix.**
