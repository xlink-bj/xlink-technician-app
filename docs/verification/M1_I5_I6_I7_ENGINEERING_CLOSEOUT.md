# M1 I5/I6/I7 — Engineering closeout candidate (DRAFT, not accepted)

## Provenance and merge safety

This branch directly descends from `#117@434f6a867b62865075950637574c13dacb61e8a0`, which includes the separately verified `#116@05316a47d266c56bf11236ac1cbd320488b31076` unified engineering baseline. This is a **stacked Draft PR against #117**. Original #116 audit manifest and five-file delta gate remain frozen; neither source PR nor protected main is modified. R1 and backend unchanged.

## Work package 1 — I5 quotation workbench

Existing real Vue quotation Workbench/Catalog/Package Configuration/repair-part return remains in place. New `quotation-submit-guard.ts` checks current page, workspace, invalid quantities and ambiguous/succeeded command state. The real `QuotationActionWorkspace.vue` uses the gate for **both** submit entry points, opening the confirmation and the final confirm action. Any draft revision or gate revocation closes the old modal: no stale confirmation can submit an edited quote. Backend safety checks/amount calculation unchanged; no production write is enabled. Add `m1-i5-quotation-submit-guard.test.ts` and keep existing composition/multi-group H5.

## Work package 2 — I6 signing read-side workbench

Existing `signing-order-read.vue` now gives specific Order/Contract/status steps in `signing-review-progress.ts`, covers loading, uncertain/blocked reads, external waiting, recorded sign state (not legal signature verification) and conflicts. Changing identity/Order/Contract/active-node evidence drops previously selected R1 intent; user must inspect again. DEV synthetic previews remain informational; server Signature/Contract mutations, SMS, PDF/QR, cancellation and Workflow Complete remain hard-denied, and all reads remain exact-identity and bounded. Remove obsolete copy implying a still-unresolved source field mismatch: canonical technician Contract query uses `serviceAppointmentId`. Unit and real main-App 375/390 H5 tests cover progress and renewed intent selection after read.

## Work package 3 — unified six-stage regression candidate

Run exact-HEAD GitHub Validate (unit/type/guards/MP/App) and real main App H5 (boot, six-stage DEV scenario, signing and G4-F regression), plus read-only ancestry compare of base #116 → #117 → this branch. The older #116 manifest is an immutable audit artifact rather than an updatable acceptance counter. This branch integrates #117 route hard-fences by ancestry, avoiding copied changes. Roll back via revert PR; no force push, no main merge.

## Acceptance truth and remaining external gates

Engineering verdict is **PENDING exact-HEAD CI** until checked. Even if it passes, M1 formal remains **1/8 accepted** (I5 1/4, I6 2/4, I7 1/4, I8 0/4), with full I5 interaction/device UX and real I6 signing/business effects not formally accepted.

Blocked external evidence: real active SPU/SKU, R1 money and official Order create/readback, Beta business write authorization, live Contract and signing identity, WeChat/Android/iOS physical runtime, Owner high-fidelity UX, main merge and release. This branch performs **no live tenant reads/writes, real signing/SMS/PDF, backend patch or main mutation**.
