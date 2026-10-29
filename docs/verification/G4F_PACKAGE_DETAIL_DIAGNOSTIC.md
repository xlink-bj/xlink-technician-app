# G4-F Package Detail Diagnostic — Read Only

**Result:**

- `PACKAGE_DETAIL = PARTIAL`
- `FAILURE_SCOPE = PACKAGE_SPECIFIC`
- `SPU_SKU_CHAIN = PARTIAL`

This diagnostic compares a bounded five-package sample under the current authenticated non-production Beta context. Four package details returned structural data and one returned HTTP 500. Therefore the route is not globally failing for this sampled context. The differing results are consistent with a package-specific failure, but do not establish its cause.

| Property | Value |
| --- | --- |
| Branch | `rebuild/g4e-onsite-inspection` |
| Baseline / capture revision | `080c934763aa07a5ef9f197287ab21686e8b7c31` |
| Environment | Non-production Beta; `betaLocalDefaults()` guard passed and the API host was pinned through `assertBetaApiBaseUrl()` |
| Read harness | Existing `scripts/beta-api-client.mjs`; existing allowlist only |
| Authentication | Existing local App quick-login configuration; session held in process memory only |
| Persistence | Sanitized aliases, result categories, counts, and field names only; no raw payload or IDs |
| Mutation boundary | No writes, workflow commands, customer/contract actions, or uploads |

## Bounded sample and package-detail results

An account-visible active `placeOrder` work-order context supplied the service/source filters. The package query used the R1-compatible request keys:

- `_all = 1`
- `is:state|integer#and = 1`
- `in:serviceType|array#and` from the active work-order context
- `sourceType` from that context when present
- `sortField = order,_id`
- `sortOrder = asc`

The first five ranked package identities were held in memory and assigned aliases in response order. No package identifier or name is retained.

| Alias | `findById` result | Structural detail | `procedureList` | `materialList` | `measureList` | Embedded child objects |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Package-A | HTTP 500 | No detail object | — | — | — | — |
| Package-B | HTTP 2xx success | Yes | 1 | 1 | 0 | procedure 1/1; material 1/1; measure 0/0 |
| Package-C | HTTP 2xx success | Yes | 5 | 6 | 0 | procedure 5/5; material 6/6; measure 0/0 |
| Package-D | HTTP 2xx success | Yes | 1 | 1 | 0 | procedure 1/1; material 1/1; measure 0/0 |
| Package-E | HTTP 2xx success | Yes | 1 | 1 | 0 | procedure 1/1; material 1/1; measure 0/0 |

All four successful detail objects contained all three child-list properties; `measureList` was present but empty in each. Embedded object counts matched their corresponding child counts in the successful sample.

Across the package, child-body, and directly embedded child structures inspected, the following field names were observed: `order`, `coefficient`, `unit`, `price`, `guideUnitPrice`, `minimumGuideTotalPrice`, `minimumPrice`, `serviceCostPrice`, `servicePrice`, and `storeCostPrice`. The names `layer`, quantity-like fields (`quantity`, `qty`, `number`, `amount`, `count`), and `pricingMethod` were not observed in those inspected structures. These are sample observations only, not claims that such fields never exist in other package variants or deeper provider records.

### Capture-integrity note

The first pass showed one HTTP 500 and four HTTP 2xx responses, but the 2xx response envelope used `entity`, not `data`; no structural-success conclusion was taken from that incomplete parse. The same five aliases were read again and the `entity` object was inspected structurally. No raw response was written to disk. This document reports the correctly unwrapped pass.

## Material/SPU → SKU read

In Package-B, one material body contained a `materialId` that matched the `_id` of its embedded `material` object. The identity values were compared only in memory. This establishes the body-reference-to-embedded-material identity for that sampled row; it does not alone establish that the embedded object is an SPU with a populated SKU set.

Following the R1 source request, the existing allowlisted `basic/material/query` route was called with `_all = 1`, enabled-state filter, and `spuid` set to the matched embedded material identity. The HTTP request succeeded; its top-level FlipInfo `data` array was confirmed empty (`0` rows). No SKU row existed from which to inspect identity/spec/unit/sales-attribute/price field names or version/revision/freshness tokens.

**`SPU_SKU_CHAIN = PARTIAL`.** The material body reference and embedded identity match, but no SKU rows were returned for that one `spuid`; the remainder of the SPU→SKU contract is unverified. Empty results for this one sampled identity do not establish global absence of SKUs or an invalid filter.

## Backend source diagnostic — hypothesis only

Checked-in backend source at revision `5fc008d32e771205260f120621c1c4fc62d0824e`, `src/main/java/com/fsgo/service/project/ProjPackageServiceImpl.java`, resolves procedure/material/measure references into maps and assigns the possibly missing lookup result to each child body (`findById`, lines 115–134). It then sorts material and procedure bodies by dereferencing `a.getMaterial().getOrder()` and `a.getProcedure().getOrder()` without null guards (lines 136–158).

**Hypothesis only:** an orphan or otherwise unresolved material/procedure child reference could leave an embedded object null and trigger a null dereference during sorting. The four successful package details and one HTTP 500 are compatible with a package-specific data issue, but no server exception trace or per-package backend record was inspected. This is not a diagnosis of Package-A's failure.

## Classifications

| Classification | Result | Basis |
| --- | --- | --- |
| `PACKAGE_DETAIL` | `PARTIAL` | 4/5 sampled details returned structural data; 1/5 returned HTTP 500 |
| `FAILURE_SCOPE` | `PACKAGE_SPECIFIC` | Mixed outcomes under the same bounded query context prove the sampled route is not globally/systematically failing; the cause of the failing package remains unknown |
| `SPU_SKU_CHAIN` | `PARTIAL` | One body-to-embedded-material identity matched, but the R1-compatible `spuid` query returned zero SKU rows |

## Remaining UNKNOWNs

- Exact cause and server-side exception for Package-A's HTTP 500.
- Whether the failure is caused by an orphan child reference; source only supports this as a plausible hypothesis.
- Whether the empty SKU result is specific to the selected material identity or reflects additional filter/domain semantics.
- SKU identity/spec/unit/sales-attribute/price fields and any version, revision, price-version, effective-version, or freshness token.
- Whether `layer`, quantity, or `pricingMethod` fields exist in other package variants or in structures outside the inspected package/child/embedded levels.
- Real catalog adapter semantics, quote writes, quote reconciliation, and Workflow Complete remain outside this read-only diagnostic and unauthorized.

## Safety

- Production API contacted: **No**.
- Beta access: read-only, through the existing guarded client and already allowlisted routes.
- Package, material, order, quote, or workflow writes: **None**.
- Workflow process/completion, customer/contract action, or media upload: **None**.
- Raw identifiers, names, prices, customer values, credentials, session, or full payload persisted: **None**.
- G4-F Phase 1C: **Not authorized / not started**.
- G4-G: **Not authorized / not started**.
