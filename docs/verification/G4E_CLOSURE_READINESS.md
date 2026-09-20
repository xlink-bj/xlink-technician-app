# G4-E Closure Readiness

Audit baseline: `381582b224d2102aa052cd4ca70ea7d82816a1cc`

Branch: `rebuild/g4e-onsite-inspection`

Issue: `#21`

This is an evidence and governance audit. It does not implement LBS check-in,
real watermark execution, automatic check-in, backend changes, serviceGoods,
surveyDrawing, or G4-F.

## Executive result

- **Frontend Engineering Foundation:** `PASS`
- **Current G4-E Product Scope:** `PARTIAL` — product-deferred capabilities
  and externally owned contracts remain explicit.
- **Production Readiness:** `PARTIAL` — live contract, device, visual and
  authorized mutation validation remain pending or not authorized.
- **Recommendation:** **G4-E FRONTEND ENGINEERING READY FOR
  PRODUCT/INTEGRATION GATE**.
- **G4-F:** not authorized.

The conclusion is not a claim that G4-E is production-complete. It means the
remaining work is no longer an unclassified frontend engineering blocker.

## Closure matrix

| Capability / area | Status | Evidence | Blocking G4-E frontend engineering? | Blocking production readiness? | Owner / next dependency |
| --- | --- | --- | --- | --- | --- |
| Survey contract / Runtime | `PASS` | 61-row sanitized Survey contract, Adapter semantic proof, Dynamic Form Runtime | No | No | FRONTEND; maintain contract checks |
| Survey / InspectionAppointment separation | `PASS` | Explicit Survey purpose routing and separate Inspection domain artifact | No | No | FRONTEND; no domain conflation |
| Mobile `showList` applicability / visibility | `PASS` | 45 mobile-detail rows; hidden/inapplicable rows excluded from rendering, warning and submission | No | No | FRONTEND; future live schema revalidation |
| Generic fields | `PASS` | Required ordinary controls use verified text/digit/cascade/multi-value paths | No | No | FRONTEND; visual QA remains separate |
| Leakage Cause | `PASS` | Full provider grouping, controlled experience, multi-value persistence and visibility semantics | No | Yes, visual gate only | FRONTEND + VISUAL_QA; authenticated UX review |
| Ordinary media foundation | `PASS` | Neutral `MediaValueRef`, durable store, queue, upload boundary and form-save boundary | No | Yes | FRONTEND; device/live media validation |
| Required media source-backed behavior | `PASS` | `images1`/`images2` execute through Mock/source-backed queue path and block save until authoritative media exists | No | Yes | FRONTEND foundation; DEVICE_QA/BACKEND for production contract |
| Required media production semantics | `PARTIAL` | Max-count/aggregate, camera/location and server idempotency are not fully evidenced | No | Yes | BACKEND / PRODUCT; complete contract and authorize live validation |
| Weak-network media durability | `PASS` | Durable local asset and persistent queue are implemented; ambiguous upload is not blindly retried | No | Yes | DEVICE_QA; MP/App restart smoke |
| Camera watermark architecture | `PASS` | Post-upload abstraction, source checkpoint, final-ref boundary and pre-upload fail-closed preflight | No | No | FRONTEND; keep real adapter disabled |
| Real watermark execution | `BLOCKED_EXTERNAL` | GCJ02/GPS84 conflict, idempotency/reconciliation gap, fixed backend temp paths, no live authorization | No | Yes | BACKEND + PRODUCT; resolve contract/concurrency and authorize |
| Survey onsite LBS check-in | `BLOCKED_EXTERNAL` | Requirement is P0, but owner/command/read/coordinate/time/appointment-near semantics are UNKNOWN | No | Yes | BACKEND + PRODUCT; provide verified Survey contract |
| `serviceGoods` / `projPackage` | `DEFERRED_NON_BLOCKING` | Historical recommendation capability; explicitly deferred | No | No | PRODUCT; only re-open with new evidence |
| `surveyDrawing` / `surveyTool` | `DEFERRED_NON_BLOCKING` | Special tool protocol explicitly deferred; excluded and no generic fallback | No | No | PRODUCT; only re-open with new evidence |
| MP device restart recovery | `DEVICE_VALIDATION_PENDING` | Build verified; authenticated MP device restart and saved-file survival not smoked | No | Yes | DEVICE_QA |
| App device restart recovery | `DEVICE_VALIDATION_PENDING` | Build verified; authenticated App device restart and saved-file survival not smoked | No | Yes | DEVICE_QA |
| Beta active-schema revalidation | `LIVE_CONTRACT_REVALIDATION_PENDING` | `XLINK_SCHEMA_API_BASE_URL` and `XLINK_SCHEMA_SESSION_REF` absent in current environment | No | Yes | ENVIRONMENT; restore live read-only discovery environment |
| Real Survey read | `LIVE_VALIDATION_PENDING` | No live active Survey read in this audit | No | Yes | ENVIRONMENT; read-only Beta verification |
| Real media upload | `NOT_AUTHORIZED` | Real Beta/Qiniu mutation not authorized | No | Yes | PRODUCT; explicit later authorization |
| Real Survey Save | `NOT_AUTHORIZED` | No real Survey mutation performed | No | Yes | PRODUCT; explicit later authorization |
| Workflow completion | `NOT_AUTHORIZED` | No real workflow/process mutation performed | No | Yes | PRODUCT; explicit later authorization |
| Authenticated MP visual review | `VISUAL_VALIDATION_PENDING` | No accepted authenticated MP Survey visual evidence | No | Yes | VISUAL_QA |
| Authenticated App visual review | `VISUAL_VALIDATION_PENDING` | No accepted authenticated App Survey visual evidence | No | Yes | VISUAL_QA |
| Required/optional media states | `VISUAL_VALIDATION_PENDING` | Runtime tests exist; accepted authenticated visual review is pending | No | Yes | VISUAL_QA |
| Weak-network/error/retry states | `VISUAL_VALIDATION_PENDING` | Queue/error behavior is tested; device/product visual review is pending | No | Yes | VISUAL_QA |
| Survey information hierarchy | `VISUAL_VALIDATION_PENDING` | No accepted authenticated MP/App product review | No | Yes | VISUAL_QA |

## Form executability audit

The mobile-detail Survey contract has 45 applicable rows. The required field
split is:

- 9 required ordinary/controlled fields: `part`, `squareMeter`, `gapLength`,
  `length`, `width`, `perimeter`, `planeArea`, `height`, `leakageCause` — all
  `SUPPORTED`.
- 2 required ordinary media fields: `images1`, `images2` — executable through
  the Mock/source-backed durable media path; production media semantics remain
  `PARTIAL`.
- `surveyDrawing` is required in the historical contract but is explicitly
  `DEFERRED_NON_BLOCKING`, excluded from rendering/submission and prohibited
  from generic fallback.
- `serviceGoods` is explicitly `DEFERRED_NON_BLOCKING`, excluded from the
  action path and non-blocking.

Result: **no visible required unsupported field** and no visible required
unknown field. Leakage Cause is supported by its controlled experience. This
is why the residual media/live/device items do not masquerade as a frontend
form-executability defect.

## Complete residual UNKNOWN / PARTIAL classification

The audit does not silently discard remaining uncertainty:

| Observed residual | Classification | Owner | Blocks frontend engineering? | Explanation |
| --- | --- | --- | --- | --- |
| `projPackage` / `serviceGoods` provider UNKNOWN | `DEFERRED_NON_BLOCKING` | PRODUCT | No | Product-deferred legacy recommendation capability |
| `surveyDrawing` special-tool UNKNOWN | `DEFERRED_NON_BLOCKING` | PRODUCT | No | Explicitly excluded; no generic fallback |
| 23 Survey media capability rows PARTIAL | `LIVE_VALIDATION_PENDING` | BACKEND | No | Generic source-backed path exists; production media contract remains incomplete |
| Media max-count/aggregate and camera policy UNKNOWN | `BLOCKED_EXTERNAL` | BACKEND | No | No client rule is invented |
| MP/App media restart status PARTIAL | `DEVICE_VALIDATION_PENDING` | DEVICE_QA | No | Requires authenticated device smoke |
| Survey onsite owner/command/time/location/reconciliation UNKNOWN | `BLOCKED_EXTERNAL` | BACKEND | No | Requires verified business/backend contract |
| Appointment-near trigger/window/distance UNKNOWN | `BLOCKED_EXTERNAL` | PRODUCT | No | No auto-check-in implementation or invented threshold |

The machine-readable artifact records each class with owner and blocker
impact. The checker fails if an UNKNOWN/PARTIAL residual is added without an
owner, if a deferred field becomes a closure blocker, or if a required visible
unsupported field is silently omitted.

## Environment and evidence levels

| Evidence | Current classification |
| --- | --- |
| Automated contract/runtime tests | `PASS` |
| MP/App builds | `PASS` (build verification only) |
| MP device restart / durable file survival | `DEVICE_VALIDATION_PENDING` |
| App device restart / durable file survival | `DEVICE_VALIDATION_PENDING` |
| Authenticated Survey UI review | `VISUAL_VALIDATION_PENDING` |
| Active Beta Survey schema recapture | `LIVE_CONTRACT_REVALIDATION_PENDING` |
| Real media upload / watermark | `NOT_AUTHORIZED` plus external contract blockers |
| Real Survey Save | `NOT_AUTHORIZED` |
| Real workflow completion | `NOT_AUTHORIZED` |

Current environment status:

- `XLINK_SCHEMA_API_BASE_URL`: absent
- `XLINK_SCHEMA_SESSION_REF`: absent
- This means live contract revalidation is pending; it does not invalidate
  accepted deterministic/source-backed architecture.

## Closure decision

The frontend engineering foundation is ready for a Product/Integration Gate.
Closing the product scope still requires the owners listed above to resolve or
explicitly accept the external/backend, live, device and visual dependencies.
No such dependency should be re-labeled as a frontend TODO merely because it
is not yet production-validated.

The artifact is checked by:

```text
pnpm run check:g4e-closure-readiness
```

This audit does not close Issue #21, merge the branch, authorize real writes,
or start G4-F.
