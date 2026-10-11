# P1 M1.5 / #75 — Material sales-attribute and code-option provenance

## Source evidence (R1 + backend, pinned)

Source-only security and compatibility analysis; not Beta/Production entitlement proof:

- R1 `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`,
  `business/subpackages/order/placeOrders.vue` L3498–3560:
  - `biz/extField/query` with `colName=material`, enabled state, all rows and sort;
  - `frontEndConfig.salesAttribute` selects the sale attributes;
  - each selected field's `valueOption` becomes `jsonPara[{codeId,eleid}]`;
  - `i/code/selectCode.do` returns entries with `eleid` and `options:{value:label}`;
  - **R1 hardcodes a tenantId** into the selectCode request, which must NOT
    be copied to the new App.
- Backend `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`:
  - `modulemini/i/CodeCfgController.java`: `/i/code/selectCode` accepts
    request `jsonPara` and optional **caller-provided `tenantId`**.
  - `service/code/CodeServiceImpl.java` L35–148: `selectCodeNew()`
    defaults to the authenticated user's tenant only if the tenantId
    argument was not provided. DB code options are queried using the
    resulting `tenantId`, enabled state, and requested code types; per
    type a `value → name` map is assembled. A `java` code type may
    use class-based enums/CustomCode instead of the ordinary DB path.
    This is not proof that arbitrary tenant queries actually succeed
    under all deployed middleware/permissions.
  - `modulemini/biz/ExtFieldController.java` forces current account
    tenantId for field list `/query`, but `CodeCfgController` accepts a
    separate optional tenantId. The two cannot automatically be assumed
    to share the same tenant scope.
  - `service/biz/ExtFieldServiceImpl.java` returns ExtFields (with optional
    per-user/org/role Customize ordering). This does not independently
    authorize an arbitrary SPU or WorkOrder.

## Code added

- `src/shared/sku-synthetic-sale-options.ts`:
  - accepts only a **synthetic_fixture** origin and a successful current
    WorkOrder/source-ID preflight from M1.4;
  - checks that synthetic code tenant and synthetic ExtField/SPU tenants
    exactly match the supplied current principal; blocks missing sourceType,
    foreign/inactive SPU, incomplete responses, malformed/duplicate fields,
    duplicate/foreign code IDs and absent/malformed SPU option values;
  - respects R1 `valueOption` and SPU `exts[field.name]` membership;
    only projects options present in the selected SPU, without guessing
    other code values or prices;
  - async synthetic-only reader drops stale results when session, role,
    WorkOrder, service/source type, catalog or selected SPU set changes.
- `tests/g4f/sku-synthetic-sale-options.test.ts`: option mapping,
  tenant mismatch, foreign SPU, broken code results, malformed frontEndConfig,
  incomplete/duplicate options, lack of real authority and stale responses.

A passing fixture means **`synthetic_structure_only`**.
`realReadAuthorized=false`, `backendWorkOrderAcl=unverified`,
`codeTenantAuthority=unverified` and `officialSkuSelection=false`.
There is NO network route, real SKU adapter, pricing authority, workflow
write or commercial UI integration.

## Blocking requirements before live SKU options

1. Backend must enforce authenticated tenant and role for Material
   ExtField **AND** selectCode requests, independently of client-provided
   tenantId. Need explicit source review or server-side enforcement, not
   frontend-only comparison. Review `java` and CustomCode option sources.
2. Server must bind the WorkOrder/ServiceAppointment to the current
   principal and authorized SPU IDs; prohibit foreign SPUs and arbitrary
   `spuid`/multi-SPU enumeration or sourceType filter bypass.
3. Provide complete and bounded SKU/ExtField/code option pages, active
   state and concrete error cases. A `_all=1` hint alone is not proof.
4. Only with separately approved bounded Beta **read** evidence can a
   real adapter be considered. Any official SKU choice, amount, stock,
   Order.type=1 creation or signing/workflow mutations require additional
   independent gates.

**Gate:** SOURCE_R1_CODE_CALL_GRAPH_VERIFIED /
SYNTHETIC_SALE_OPTIONS_CONTRACT_ONLY / SERVER_TENANT_OPTION_AUTH_UNKNOWN /
REAL_SKU_PROVIDER_BLOCKED / OWNER_UX_41_PENDING / DRAFT_NO_MERGE.
