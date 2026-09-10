# Existing Asset Inventory

## Scope and method

This record is the G1-A1 harvest of the existing XLink evidence set. Existing
artifacts were evaluated first using:

**REUSE → VERIFY → GAP ANALYSIS → TARGETED RESCAN**

No full discovery scan, runtime API call, backend mutation, dependency
installation, legacy copy, or reference-repository modification was performed.
Secrets and beta test credential values are intentionally not reproduced.

## Repository baselines

| ID | Repository | Local path | Branch | Pinned SHA | State verified on 2026-09-10 | Role |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | `xlink-bj/xlink-business-jishi-3.0` | `/Users/yesun/Code/xlink-business-jishi-3.0` | `modernization/engineering-foundation` | `6ada6b5375324bfcd09ca7c569b96a4ff328173f` | Clean, upstream counts `0 0` | Current Legacy Technician runtime, contracts, tooling, and architecture evidence. |
| R2 | `xlink-bj/xlink-business-3.0` | `/Users/yesun/Code/xlink-business-3.0` | `main` | `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185` | Clean at local HEAD | Web integration, raw-source adapters, normalized ERM/BFF, and domain vocabulary. |
| R3 | `xlink-bj/xlink-app` | `/Users/yesun/Code/xlink-app` | `main` | `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` | Pinned committed tree read; working tree has unrelated pre-existing changes/untracked paths and was not touched | Historical App/API/backend research and duplicate specs. |

R3 committed content at the pinned SHA contains no Java files. The dirty R3
working tree was not used as evidence. A separate plain local source tree was
found at `/Users/yesun/Code/xlink/code/cloud`; it is not a Git repository and
has no commit provenance. It is recorded below only as
`LOCAL_ONLY_UNVERIFIED`.

## Authority classifications

- `AUTHORITATIVE_BACKEND`: current backend contract with verified provenance.
- `OBSERVED_RUNTIME`: behavior observed from a current running application.
- `MACHINE_READABLE_SCAN`: structured spec or scan artifact.
- `IMPLEMENTATION_REFERENCE`: code that records a request, mapping, or guard.
- `DERIVED_DOCUMENTATION`: documentation derived from another source.
- `HISTORICAL_ONLY`: evidence requiring current verification.
- `LOCAL_ONLY_UNVERIFIED`: local source without repository/provenance anchor.

These labels classify evidence; they do not authorize copying source into the
new repository.

## Evaluated asset records

| ID | Source / exact path | Type and coverage | Authority | Reuse result | Evaluation and remaining verification |
| --- | --- | --- | --- | --- | --- |
| R1-01 | R1 `api_specs/business_core_beta.json` | Machine-readable beta core API spec; login, role, service appointment, project, contract reads | MACHINE_READABLE_SCAN | YES, as candidate | Seven read steps plus login runner behavior. R1 marks steps read-only; production and currentness remain unverified. |
| R1-02 | R1 `api_specs/business_order_beta.json` | Machine-readable beta order/contract read spec | MACHINE_READABLE_SCAN | YES, as candidate | Read setup is reusable; compare with current order/contract call sites. |
| R1-03 | R1 `api_specs/business_order_write_beta.json` | Guarded write fixture | MACHINE_READABLE_SCAN | PARTIAL | Isolates `basic/order/orderConfirm`; must remain separately authorized and targeted. |
| R1-04 | R1 `docs/api-test-tooling.md` | Test-tool process and beta environment notes | DERIVED_DOCUMENTATION | PARTIAL | Confirms beta-only tooling and safe read/write separation. Credential values were not copied. |
| R1-05 | R1 `scripts/api_client.py` | Requests session, form POST, `/fsgo/wm/` base, login/session handling | IMPLEMENTATION_REFERENCE | YES, as evidence | Establishes transport/session candidate; `verify=False` is a legacy tooling risk, not a new-app recommendation. |
| R1-06 | R1 `scripts/api_inspect.py` | Endpoint inspection helper and response/schema printing | IMPLEMENTATION_REFERENCE | YES, as process evidence | Reuse the inspection intent only; no inspection command was run in this task. |
| R1-07 | R1 `scripts/api_smoke.py` and shell wrappers | Spec-driven read-only smoke runner with explicit write guard | IMPLEMENTATION_REFERENCE | YES, as process evidence | Candidate for targeted verification later; no network execution occurred. |
| R1-08 | R1 `docs/modernization/API_CHARACTERIZATION.md` | Prior beta characterization | DERIVED_DOCUMENTATION | YES, with limits | Records form-encoded POST, `JSESSIONID`, filter syntax, and read/write boundaries. It does not establish production behavior. |
| R1-09 | R1 `docs/architecture/api-backend-map.md` | Domain-to-endpoint backend map | DERIVED_DOCUMENTATION | YES | High-value endpoint candidate index; verify against call sites/backend source. |
| R1-10 | R1 `docs/architecture/auth-and-role-map.md` | Login, role, menu, permission map | DERIVED_DOCUMENTATION | YES | Reusable auth/role behavior; refresh/error semantics remain unknown. |
| R1-11 | R1 `docs/architecture/page-api-map.md` | Login, home, list, detail API map | DERIVED_DOCUMENTATION | YES | Reusable flow inventory; several home helper responses remain uncharacterized. |
| R1-12 | R1 `docs/architecture/workorder-detail-api-inventory.md` | Detail workflow/form/order/contract/inspection/media inventory | DERIVED_DOCUMENTATION | YES | Main source for APIs 20–70 in the baseline; verify write semantics. |
| R1-13 | R1 `resources/technician/mainWorkOrderListContract.js` | Current list request builder | IMPLEMENTATION_REFERENCE | YES | Bounded list fields, filters, sort priority, and endpoint choice. |
| R1-14 | R1 `resources/technician/workOrderDetailReadContract.js` | Current detail read builder | IMPLEMENTATION_REFERENCE | YES | Establishes detail read path and `type=query` candidate. |
| R1-15 | R1 `resources/technician/workOrderFormReadContract.js` | Current dynamic-form read builder | IMPLEMENTATION_REFERENCE | YES | Establishes field/form read split and special form handling; supported subset remains open. |
| R1-16 | R1 `resources/technician/workOrderStatusWriteContract.js` | Current status/field write builder | IMPLEMENTATION_REFERENCE | PARTIAL | Preserves serialized status-reason branches; write response/idempotency unverified. |
| R1-17 | R1 `resources/technician/workflowNodeVisibilityContract.js` | Client-side workflow visibility rules | IMPLEMENTATION_REFERENCE | YES, as behavior evidence | Not an API endpoint. Reuse as a requirement input, not as server authorization. |
| R1-18 | R1 current call sites: login, list, detail, inspection pages | Legacy runtime request construction | IMPLEMENTATION_REFERENCE | YES, as evidence | Confirms actual field names, `.do` variants, workflow/form/media sequencing, and native boundaries. No source copied. |
| R2-01 | R2 `docs/05-integration-strategy.md` | UI → BFF → ERM → Sources → cloud boundary | DERIVED_DOCUMENTATION | YES | Establishes RAW_BACKEND vs normalized Web boundary. Not a mobile contract. |
| R2-02 | R2 `docs/11-field-service-reference.md` | Field-service domain/reference mapping | DERIVED_DOCUMENTATION | YES | Terminology and read-model comparison; verify raw behavior separately. |
| R2-03 | R2 `docs/12-domain-glossary.md` | WorkOrder, activity, project, dashboard, resource vocabulary | DERIVED_DOCUMENTATION | YES | Field mapping and normalized concepts; raw fields must not leak into app UI. |
| R2-04 | R2 `web/lib/erm/sources/work-order-cloud-read.ts` | Raw list/detail/activity reads | IMPLEMENTATION_REFERENCE | YES | Confirms service appointment list/detail, actions, and fallback reads used by Web. |
| R2-05 | R2 `web/lib/erm/sources/project-archives-cloud.ts` | Raw order/contract/project archive reads | IMPLEMENTATION_REFERENCE | PARTIAL | Reusable field and filter evidence; Web fallback/normalization is not a V1 mobile write contract. |
| R2-06 | R2 `web/lib/survey-form-cloud.ts`, `project-cloud.ts` | Raw survey/form/project reads | IMPLEMENTATION_REFERENCE | YES | Confirms form, code, project, and survey read candidates. |
| R2-07 | R2 `web/lib/erm/` | ERM mappers/read models | IMPLEMENTATION_REFERENCE | YES, as mapping evidence | Normalized `WorkOrder`, activity, dashboard, and workflow fields. Keep boundary explicit. |
| R2-08 | R2 `web/app/api/` | BFF login, work-order, detail, survey, dashboard routes | IMPLEMENTATION_REFERENCE | PARTIAL | Useful integration boundary and cookie behavior; `/api/*` routes are not raw backend endpoints. |
| R3-01 | R3 committed `business/api_specs/business_core_beta.json` | Historical duplicate core spec | MACHINE_READABLE_SCAN | YES, for comparison | Same domain candidates as R1 with spec metadata drift; dirty R3 content excluded. |
| R3-02 | R3 committed `business/api_specs/business_order_beta.json` | Historical duplicate order spec | MACHINE_READABLE_SCAN | YES, for comparison | Differs from R1 order spec by metadata/step composition; conflict recorded. |
| R3-03 | R3 committed `business/docs/architecture/*` | Historical architecture maps | HISTORICAL_ONLY | YES, corroborating | Relevant architecture docs overlap R1 byte-for-byte at the pinned commits; still not current backend authority. |
| R3-04 | R3 committed `business/docs/api-test-tooling.md` | Historical tooling guidance | HISTORICAL_ONLY | YES, corroborating | Overlaps R1 tooling documentation; no new authority. |
| J-01 | `/Users/yesun/Code/xlink/code/cloud/src/main/java/com/fsgo/modulemini/IndexController.java` | Local-only Java controller: `/index` login/phone mappings | LOCAL_ONLY_UNVERIFIED | PARTIAL, evidence only | SHA-256 `002a2210a1294ea220cff5b8354dff92cf07702b53984e326e49ccf04160696e`; no Git provenance. |
| J-02 | `/Users/yesun/Code/xlink/code/cloud/src/main/java/com/fsgo/modulemini/basic/ServiceAppointmentController.java` | Local-only Java service-appointment mappings | LOCAL_ONLY_UNVERIFIED | PARTIAL, evidence only | SHA-256 `d6d7b721594ed3b26fe8aa6288c94d494e2063ee2c31908e31008c01b6efecf4`; no Git provenance. |
| J-03 | Local-only `com/fsgo/modulemini` controller tree | ~128 controller mappings, including workflow, form, order, contract, acceptance, project, media | LOCAL_ONLY_UNVERIFIED | NO direct reuse | Mapping hints support targeted backend verification only. Source was not copied and cannot be treated as authoritative. |

## API/backend evidence harvested

The evaluated assets support these reusable conclusions:

- Login is `index/phoneLogin.do` with role/menu follow-up; MP has a separate
  phone-number path. The session/token and refresh/error contract is incomplete.
- Work-order list/detail behavior is strongly corroborated by R1 call sites,
  R1 specs, R1 architecture, R2 raw Sources, and R3 committed specs.
- Workflow and dynamic forms are real runtime capabilities, not generic UI
  assumptions. Their current node/form identity, write envelopes, and
  unsupported subset must be bounded before implementation.
- R2 supplies valuable raw field reads and normalized mappings, but its BFF and
  ERM are not a replacement for the mobile backend contract.
- Backend Java mappings are useful only as local-only hints until a reviewed,
  provenance-bearing backend revision is identified.

## Explicit non-reuse decisions

- Do not copy R1 scripts, Legacy pages, R2 BFF/ERM implementation, R3 dirty
  content, or local-only Java into the new app.
- Do not treat R2 mock fallbacks or disabled Web write paths as proof that raw
  backend writes are unavailable.
- Do not treat historical beta specs as production-authoritative.
- Do not include credentials, tokens, tenant values, or test-personal data in
  the new repository records.

## G1-A1 disposition

R1/R2/R3 assets have been inventoried and evaluated before any targeted rescan.
The resulting candidate API baseline and evidence matrix are now the reusable
inputs for G1-A2 through G1-A5 and for G2. Remaining work is explicitly
bounded as P0/P1 verification; it is not silently deferred or represented as
completed discovery.
