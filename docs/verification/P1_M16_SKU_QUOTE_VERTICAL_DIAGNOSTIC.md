# P1 M1.6 — Quote → WorkOrder source → ExtField/valueOption vertical DEV diagnostic

**Delivery status:** DEV_SYNTHETIC_VERTICAL_SLICE / NO_BACKEND_SKU_AUTH /
NO_BETA_OR_PRODUCTION_READ / NO_QUOTE_WRITE. Implementation PR is Draft,
stacked on #83. #75 secure-read gate remains OPEN.

## Why this slice

M1.3 proved that real DEV Quote Catalog package/body/material IDs can be
matched to an explicitly synthetic SKU overlay (4/4 correlations). M1.4
added a transport-free WorkOrder/sourceID preflight. M1.5 added a
tenant-aware, synthetic Material ExtField/code option validator.

Those separate pieces had no integrated review in the **real main
Quotation Action**. This slice ties them together into a single,
strictly test-owned **readiness DIAGNOSTIC**, rather than creating
another isolated demo or falsely enabling a live SKU picker.

## End-to-end data and identity chain

1. Persisted local `QuotationDraft` (two independent repair groups).
   Collect direct Material selections and configured Package body material
   selections without changing those drafts.
2. Check the selected Package ID, exact material body link ID, referenced
   SPU ID and typed `exts.layer` against the **same actual Quote Catalog
   Mock**. Mixed numeric/text layer representations do not silently match.
3. Deduplicate the selected SPUs. Build a test-only currently-listed SPU
   set from that Quote Catalog's direct Material list and Package detail.
   Mark this mock listing complete **only within the static DEV fixture**;
   real backend pagination and completeness remain unverified.
4. Run `preflightSkuSourceIdentity()` against an explicitly **synthetic**
   session, role, tenant and WorkOrder. This is NOT the actual user's
   permission context and not a server ACL check.
5. For each exact selected SPU, run
   `auditSyntheticSkuSalesOptions()` using explicitly hypothetical
   Material ExtFields, `valueOption` and `eleid/options` code
   dictionary fixture, all scoped to the synthetic tenant.
6. Result: `synthetic_structure_only` with SPU/field/option counts or
   `blocked_synthetic` with a fail-closed reason. **Both always set
   `realSkuAuthorized=false` and `officialOrderAllowed=false`.**

The main Quotation Action's already-collapsed DEV local review now
shows the combined fixture status immediately after the existing 4/4
source identity evidence. This is deliberately not the commercial
Quotation Catalog UX redesigned in #41. It displays a separate warning
that real tenant/WorkOrder SKU authorization has not been verified.
The interaction remains a local read-only review; no sales choices are
fed into the official quotation model.

## Tests and surfaces

- `tests/g4f/p1-sku-readiness-review.test.ts`: complete two-group source
  path, 4/4 structural relation, 2 unique SPUs, 4 synthetic field
  projections, 4 code option projections; no-material, foreign direct
  SPU, wrong Package body, wrong typed layer, unconfigured Package,
  corrupted catalog, incomplete listing, missing role, cross-WorkOrder,
  tenant override, missing/foreign/duplicate code response, malformed
  fields and immutability.
- `tests/g4f/p1-sku-readiness-boundary.test.ts`: mock-only imports,
  explicit DEV + product-preview gating, no real SKU transport, and
  independent quotation submission blocker.
- `tests/h5-main-mock/main-app-quotation.spec.ts`: real main uni-app
  H5 across **375px/390px**, restored two-group draft after hard reload,
  exact displayed option count and explicit backend authorization
  warning, alongside existing review and no-submit guards.

Run full typecheck, architecture and UI guardrails, Vitest, WeChat MP
and native App builds, main-app H5 and legacy G4-F browser regression.
Build PASS is **not** a WeChat/Android/iOS runtime PASS (#64).

## Backend work package required to unlock actual SKU access

The below is a **policy proposal**, not an existing endpoint contract
and not a claim that the existing server already enforces it.

**A. Authorize on the server, not in query parameters.**

- Derive principal/session/current role/version and tenant from server
  authenticated context. Load the requested WorkOrder and its linked
  ServiceAppointment under the principal's permitted scope.
- Derive `serviceType` and `sourceType` from that authorized entity.
  Reject missing/untrusted source filters; never allow callers to
  trigger a broader GoodsService org/scope branch by omitting or
  providing `sourceType` or arbitrary `in:spuid`.
- Select only SPUs actually available in the authorized catalog
  and Package material body links; validate each requested SKU's
  `spuid` parent, tenant, org, state and scope.
- Define explicit pagination, deterministic ordering, bounded maximum
  results, complete vs partial semantics; duplicate/foreign/missing
  and stale responses must fail closed.
- Code/ExtField options must bind `tenantId` to that same server
  authenticated tenant. `CodeServiceImpl.selectCodeNew` currently
  accepts a caller-supplied tenant argument and defaults to session
  only if absent; **do not assume client matching fixes it**. Review
  regular DB code types, `java` and CustomCode sources separately.

**B. Proposed authorization negative matrix**

| Scenario | Expected server result |
| --- | --- |
| Same tenant, foreign WorkOrder | Deny before Material query |
| Same WorkOrder, foreign Material SPU | Deny, no partial SKU leakage |
| Role switched/revoked | Deny; invalidate outstanding reads |
| `sourceType` omitted vs provided by malicious caller | Equal enforced server scope, or deny |
| Direct `spuid` vs `in:spuid\|array` bypass attempt | Both constrained to same allowed SPUs |
| Foreign-tenant `i/code/selectCode` tenantId | Deny or ignore caller's tenantId |
| Duplicate SKU identity / mismatched `SKU.spuid` | Reject as corrupted result |
| Incomplete page, invalid ExtField, unknown option | Reject, no auto-selection |

**C. Gate for bounded Beta read**

Require source-backed server policy and negative tests; exact role,
disposable Beta WorkOrder/Package/SPU IDs; narrow read matrix,
server logs, sanitized outputs, rollback/disable plan and explicit
Lead+Owner approval. Until then no real SKU port or Production probing.

**Independent business blockers:** server price/stock authority,
`Order.type=1` submission and readback, signing handoff; #41 Owner
Quotation UX approval; #64 device runtime acceptance. This batch
does not start Construction/Acceptance.
