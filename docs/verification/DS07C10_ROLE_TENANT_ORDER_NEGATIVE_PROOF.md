# DS-07.C10 — P0 Role / Tenant / Official Order / SKU Evidence Boundary

**Classification: source-backed synthetic offline proof, NOT a real tenant authorization audit.**
Parent: [C9 #166](https://github.com/xlink-bj/xlink-technician-app/pull/166), exact `61c9b20554c687aa8338fac7bfb72d0b96fb2ca1`. C10 adds **tests, documentation, CI only**; no application, API, backend, order, pricing or signing source changes.

## Purpose and coverage

C9 aligned the Production read-only route shape and actual `basic/order/query` adapter. C10 tests whether the **real application role-scoped list adapter** and **real Production read transport** compose with the **real bounded official Order adapter** under hostile conditions, using strictly local `uni.request` intercepts, not a production endpoint.

The synthetic scenarios enforce:

1. Before receiving a WorkOrder through the active role-scoped list, the Order read must dispatch **zero network requests**.
2. A listed WorkOrder may trigger only the type=1, `page=1`, `rows=3`, `_all`-free request, and return a **sanitized display projection** (not PDF/signature authority).
3. A different WorkOrder (not on the current role's list) must dispatch zero Order reads.
4. Changing user, role, roleVersion or sessionRef after list membership must revoke it, even when the cookie/sessionRef did not change.
5. A response arriving **after role switch** must be discarded, with no stale private Order data and no signing precheck.
6. Any Order response containing another WorkOrder's row must fail the entire page, not partially disclose it.
7. Even a valid read-only official Order cannot grant Contract read, signing, PDF or write permission.

The separately maintained source-backed pricing/SKU test suite also executes in CI, including `quotation-engine`, `quotation-sku-identity-review`, `quotation-sku-same-catalog`, `quotation-order-submission` and `quotation-order-signing-read-boundary`. These distinguish R1 calcTotalPrice vs fillOrder rounding, type=1 payload, SPU/SKU selection and *synthetic identity correspondence only*. No synthetic SKU is ever considered tenant-authorized.

## Boundaries not established by mock tests

- **Server tenant authorization:** `isProductionReadOnlyReadAllowed()` is a local **request-shape whitelist**, not backend ACL. A raw authorized `ApiReadTransport` call bypassing the application Order adapter's listed-WorkOrder predicate remains a trust-boundary concern unless server independently checks user/role/tenant. C10 neither assumes nor probes a real backend result.
- **R1 source SKU and financial parity:** source-verified material sales attributes, SKU option grants, effective negotiated prices and type=1 Order acceptance on real work orders are unverified. Local R1-compatible rounding calculations do not establish server-authoritative price.
- **Signing:** `contractStatus=2` from DEV samples is never proof of a real signed Contract. Signing, reminders, SMS, PDF and upload commands remain forbidden.
- **Devices:** MP-Weixin and native App bundle builds do not constitute end-to-end hardware/device evidence.
- **Release:** C8's 921+ commit lineage, formal M1 completion, authorized production read-only tenant proof, merge/release authorization remain HOLD.

## Separate authorized read-only verification (NOT executed here)

When the Owner authorizes a bounded account/session verification, require **two authorized test users/roles with explicitly known different WorkOrder scopes**, collect only redacted ID equality/mismatch and disposition (not PII or full response), compare role A and B list visibility, same-session role version changes, and order-request behavior; verify server denies foreign WorkOrder IDs and stale sessions. No queryById, Contract read or any write endpoint. If the server does not reject foreign but well-formed IDs, classify **BACKEND ACL BLOCKER**, not a new client allowlist success.

**C10 exit:** local negative evidence and all existing tests/builds PASS + exact diff restricted to C10 files. **Does not upgrade business or security production gate.**
