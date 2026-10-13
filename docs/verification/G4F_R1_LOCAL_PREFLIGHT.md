# G4-F — R1 Local Quotation Preflight Evidence

Status: `PURE_SYNTHETIC_PLAN / NOT_CONNECTED / NO_BUSINESS_SUBMIT`

## Source basis

- R1 `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`, `business/subpackages/order/placeOrders.vue`: `onSelectionOpen` L4419–4450 checks **visible required** fields at catalog entry, but `placeOrder(type)` L3835–3860 checks final requiredness independently of visibility, with only a safely matching `dispensable` exemption. R1 still has phone/ID/area/file/select format and media rules outside this slice, and the order-encoder/pricing path must be verified separately.
- Project `validation.ts` validates group context, configured package versus procedure+material minimum, positive quantities; `order-extfield-effective-plan.ts` exposes per-row stage/condition/requiredness and blocked provider capabilities.
- The tenant-specific 32/32 active Order ExtField **schema shape** does not prove any current Work Order's effective fields. No new Production/Beta inspection is authorized or performed.

## Lead-coded bounded contribution

`local-preflight.ts` is a **pure, read-only synthetic evidence classifier** with no imports of production transports, commands, browser storage, `Order.exts` encoder, media uploader or Workflow adapter:

| Evidence dimension | Meaning |
| --- | --- |
| `composition` | Reuses existing `validateQuotationDraft()`; `synthetic_pass` only means local group structure passed, not R1 Order validity. |
| `selectionEntry` | Visible required ordinary fields; hidden fields do not prevent opening catalog; does NOT consult `dispensable`. |
| `finalRequiredness` | All active final required fields including conditionally hidden rows; safely matched `dispensable` exempts only this phase. |
| `pricing` | `local_engine_evaluated` only for a current-draft ready engine with pricing and local payload; never invents a total or authorizes a real quote. |
| `officialSubmission` | **Always `not_authorized`**, regardless of all other dimensions. |

Both field gates are **`unverified`** unless the caller explicitly asserts `schemaEvidence: 'complete_synthetic_fixture'` and supplies a matching `placeOrder` plan; that declaration is **test-only evidence**, not proof of a real tenant schema. Normal text/numeric requiredness uses conservative presence checks: numeric `0` is present as in R1; missing/false/empty array are missing. A present array/object or any special/provider-backed field is **unverified**, not silently accepted. This is **not** phone, ID, picker, upload, amount, coupon, or serializer validation.

No direct wiring to UI or submit commands is part of this PR. Existing review H5 screens, PR #56 mobile/selection tests and production-facing quotation behavior remain unchanged. Codex's current H5 screenshot task can continue independently.

## Next gate

After Lead code review/tests, integrate the *read-only* diagnostics into a **Mock-only quotation readiness area** using explicit synthetic fixture values, not a generic «ready to submit» badge. Actual per-work-order field applicability, providers, media persistence, amount calculations, and Order.exts round trip require separate evidence and authorization. Do not access Production, Beta, Mongo or business write paths. PR remains Draft until independent Lead + Owner UX acceptance.
