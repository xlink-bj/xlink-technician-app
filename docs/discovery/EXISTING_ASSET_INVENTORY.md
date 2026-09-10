# Existing Asset Inventory

## Purpose and scope

This inventory answers: what is already known, where it came from, how
authoritative it is, and what still needs to be rediscovered.

This is the foundation inventory only. It records the three known reference
repositories and the material assets named by the program brief. Path existence,
repository identity, branch, HEAD, and relevant initial worktree state were
verified on 2026-09-10. The assets have not yet been deeply read or rescanned.

Old documentation is not treated as truth merely because it exists. Each asset
must be evaluated for what it proves, when it was produced, what it was derived
from, whether current Legacy/runtime still agrees, and whether it can remove
new scanning work.

## Evidence authority classifications

- `AUTHORITATIVE_BACKEND` — verified current backend contract or specification.
- `OBSERVED_RUNTIME` — behavior observed from a current running application.
- `MACHINE_READABLE_SCAN` — machine-readable API/schema/scan output.
- `IMPLEMENTATION_REFERENCE` — implementation that records behavior or mapping.
- `DERIVED_DOCUMENTATION` — documentation derived from another source.
- `HISTORICAL_ONLY` — historical evidence that requires current verification.

These labels are evidence classifications, not permission to copy source code
into the new repository.

## Inventory schema

Every material asset record must contain:

| Field | Meaning |
| --- | --- |
| Source repository | Repository name and reference role |
| Local path / repository path | Local path and path within the source repository |
| Reference SHA where possible | Commit anchoring the observation |
| Asset type | Documentation, executable tooling, API spec, adapter, source, or other |
| Domain coverage | Business areas evidenced |
| API coverage | Endpoints, contracts, payloads, or API tooling evidenced |
| Runtime coverage | Client/runtime/platform behavior evidenced |
| Whether machine-readable | YES / NO / UNKNOWN |
| Whether executable | YES / NO / UNKNOWN |
| Last-known freshness | Known date, pinned SHA, or UNKNOWN |
| Authority level | One authority classification above |
| Can reuse directly | YES / PARTIAL / NO |
| Verification required | YES / NO |
| Notes / conflicts | What it proves, limitations, conflicts, and next action |

## Reference repository baseline

| ID | Repository | Local path | Branch | Reference SHA | Initial state | Role |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | `xlink-bj/xlink-business-jishi-3.0` | `/Users/yesun/Code/xlink-business-jishi-3.0` | `modernization/engineering-foundation` | `6ada6b5375324bfcd09ca7c569b96a4ff328173f` | Clean and synchronized with upstream | Current Technician legacy runtime and behavior reference |
| R2 | `xlink-bj/xlink-business-3.0` | `/Users/yesun/Code/xlink-business-3.0` | `main` | `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185` | Clean at local HEAD | Experimental Web integration and domain-model reference |
| R3 | `xlink-bj/xlink-app` | `/Users/yesun/Code/xlink-app` | `main` | `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` | Local worktree has unrelated modifications and untracked paths; listed API-spec/docs paths show no changes | Historical App/API/backend research reference |

R3 must not be treated as a clean workspace baseline until a later task pins
the relevant evidence to a reviewed commit or otherwise records the working-tree
state. The local-only Java/backend-source question remains **UNKNOWN** because
the foundation step does not perform the requested deep source inventory.

## Initial material asset records

The records below capture known assets without claiming that they are current
contracts. `PARTIAL` means the asset can be reused as evidence or a candidate,
but must be verified before it is used as a new implementation contract.

| ID | Source repository | Local path / repository path | Reference SHA | Asset type | Domain coverage | API coverage | Runtime coverage | Machine-readable | Executable | Last-known freshness | Authority level | Can reuse directly | Verification required | Notes / conflicts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1-01 | R1 | `/Users/yesun/Code/xlink-business-jishi-3.0/docs/` | `6ada6b5` | Documentation collection | Current Technician behavior and project findings; exact contents pending review | UNKNOWN until indexed | Likely current-runtime characterization; verify per document | UNKNOWN | UNKNOWN | SHA-pinned; document dates not yet assessed | DERIVED_DOCUMENTATION | PARTIAL | YES | Inventory before creating replacement discovery tooling. |
| R1-02 | R1 | `scripts/api_client.py` | `6ada6b5` | API client/tooling | Technician/API exploration | Request execution and shared client behavior | Test/runtime interaction evidence | NO | YES | SHA-pinned; execution history not yet assessed | IMPLEMENTATION_REFERENCE | PARTIAL | YES | Reuse understanding and validated helpers only; do not copy into the new app. |
| R1-03 | R1 | `scripts/api_inspect.py` | `6ada6b5` | API inspection tooling | Technician/API exploration | Endpoint/payload inspection | Test/runtime interaction evidence | NO | YES | SHA-pinned; output provenance not yet assessed | IMPLEMENTATION_REFERENCE | PARTIAL | YES | Inspect existing capabilities before writing new scan tooling. |
| R1-04 | R1 | `scripts/api_smoke.py` | `6ada6b5` | API smoke-test tooling | Technician/API exploration | Smoke coverage and request/response checks | Test-environment behavior if outputs are available | NO | YES | SHA-pinned; test-environment freshness not yet assessed | IMPLEMENTATION_REFERENCE | PARTIAL | YES | Existing checks are candidates for targeted verification, not proof by themselves. |
| R1-05 | R1 | `docs/api-test-tooling.md` | `6ada6b5` | Tooling documentation | API discovery process | API test and inspection usage | Test workflow | NO | NO | SHA-pinned; document provenance not yet assessed | DERIVED_DOCUMENTATION | PARTIAL | YES | Read together with the scripts and record any stale assumptions. |
| R2-01 | R2 | `/Users/yesun/Code/xlink-business-3.0/docs/` | `06b885e` | Documentation collection | Web integration, field service, domain vocabulary | Adapter/BFF and backend semantics where documented | Web implementation behavior where documented | UNKNOWN | UNKNOWN | Local HEAD pinned; dates/provenance not yet assessed | DERIVED_DOCUMENTATION | PARTIAL | YES | Use as architectural and integration evidence, not as the mobile architecture template. |
| R2-02 | R2 | `docs/05-integration-strategy.md` | `06b885e` | Integration strategy | Backend integration and boundaries | Raw backend versus adapter/BFF semantics | Web integration behavior | NO | NO | Local HEAD pinned; currentness not yet assessed | DERIVED_DOCUMENTATION | PARTIAL | YES | Explicitly separate raw backend contracts from normalized models. |
| R2-03 | R2 | `docs/11-field-service-reference.md` | `06b885e` | Domain/reference documentation | Field Service domain | Endpoint/model implications where documented | Web field-service behavior | NO | NO | Local HEAD pinned; currentness not yet assessed | DERIVED_DOCUMENTATION | PARTIAL | YES | Candidate source for vocabulary and behavior comparison. |
| R2-04 | R2 | `docs/12-domain-glossary.md` | `06b885e` | Domain glossary | Field Service and related business vocabulary | Field meanings where documented | Not direct runtime evidence | NO | NO | Local HEAD pinned; currentness not yet assessed | DERIVED_DOCUMENTATION | PARTIAL | YES | Use for terminology; verify against current API/runtime behavior. |
| R2-05 | R2 | `web/lib/erm/` | `06b885e` | ERM/read-model implementation area | Domain translation and read models | Normalized model and mapping evidence | Web model behavior | NO | YES | Local HEAD pinned; implementation history not yet assessed | IMPLEMENTATION_REFERENCE | PARTIAL | YES | Do not assume ERM models are raw mobile API contracts. |
| R2-06 | R2 | `web/app/api/` | `06b885e` | Web API/BFF implementation area | Web integration and field service | Adapter/BFF request/response behavior | Web runtime behavior | NO | YES | Local HEAD pinned; implementation history not yet assessed | IMPLEMENTATION_REFERENCE | PARTIAL | YES | Compare with current Technician call sites and backend evidence. |
| R3-01 | R3 | `/Users/yesun/Code/xlink-app/business/api_specs/` | `6c0a97b` | API specification collection | Historical Business/App behavior | Machine-readable endpoint/schema candidates | Historical client compatibility | YES / UNKNOWN per file | NO | Historical; exact production/test provenance not yet assessed | MACHINE_READABLE_SCAN | PARTIAL | YES | Candidate evidence only; verify against current backend and R1 usage. |
| R3-02 | R3 | `business/api_specs/business_core_beta.json` | `6c0a97b` | JSON API specification | Historical Business core | Core endpoint/method/schema candidates | Historical App compatibility | YES | NO | Historical beta artifact; date/provenance not yet assessed | MACHINE_READABLE_SCAN | PARTIAL | YES | Reuse as candidate contract; record conflicts explicitly. |
| R3-03 | R3 | `business/api_specs/business_order_beta.json` | `6c0a97b` | JSON API specification | Historical orders/work orders | Order endpoint/method/schema candidates | Historical App compatibility | YES | NO | Historical beta artifact; date/provenance not yet assessed | MACHINE_READABLE_SCAN | PARTIAL | YES | Reuse as candidate contract; verify against current Technician flows. |
| R3-04 | R3 | `business/docs/` | `6c0a97b` | Documentation collection | Historical App/API/backend findings | API and backend evidence where documented | Historical client behavior | UNKNOWN | UNKNOWN | Historical; document dates/provenance not yet assessed | HISTORICAL_ONLY | PARTIAL | YES | Search systematically in a later targeted pass; do not assume completeness. |

## Conflicts and unknowns at foundation stage

No endpoint-level conflict has been merged or declared resolved in this
foundation inventory. The following remain explicit UNKNOWN areas:

- whether any listed documentation is current relative to the R1 runtime;
- whether R2 normalized/ERM/BFF models differ from raw mobile API contracts;
- whether R3 API specs match current backend behavior;
- whether local Java backend source exists in R3 and whether it is represented at
  the corresponding GitHub path/version;
- which artifacts have executable, reproducible outputs and what environment
  produced those outputs;
- which legacy behaviors are intentional business exceptions versus historical
  defects.

When conflicts are found, record each source, exact difference, likely
explanation, current behavior, and required verification. Never silently merge
conflicting evidence.

## Next action

Use this inventory to plan **REUSE → VERIFY → GAP ANALYSIS → TARGETED RESCAN**.
Do not start a full scan from zero, and do not copy backend or legacy source into
`xlink-technician-app`.
