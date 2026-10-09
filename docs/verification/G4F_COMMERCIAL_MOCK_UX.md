# G4-F commercial mock product journey — Lead implementation, phase A

Status: **SOURCE IMPLEMENTED / LOCAL H5 NAVIGATION NOT YET VERIFIED / OWNER UX NOT PASSED**

## Entry and structure

Separate review-only uni-app routes:
`/pages/product/orders` → `/pages/product/detail` → `/pages/product/quotation`.
The first two provide compact synthetic business context; the quotation page mounts the **actual** `QuotationActionWorkspace` and retains its catalog, repair-part and composition logic. The prior `/pages/quotation/index` QA scenario hub and tests remain unmodified. The product entry has no scenario tabs, proxy badges or test controls.

Run via `pnpm run dev:uni-h5-g4f-review`; likely uni-H5 hash route `http://127.0.0.1:5175/#/pages/product/orders` (must be confirmed on the local toolchain, not yet verified in this source-only commit).

## Safety

The isolated `review-app-g4f/main.ts` identifies product routes and injects a synthetic session and dev Mock read adapter with `https://mock-review.invalid` as the configured base. Business `TechnicianApiCommandPort` methods and both `QuotationOrderCommandPort` methods are explicitly deny-only with attempt counters. The quotation workspace receives a dev-only `productReviewOnly` prop to hide and guard official submit/confirmation. Production pages and default production composition do not pass that prop. **No real login, real customer or live API writes.**

## Lead-known gaps before any technical PASS

1. This is a **first code slice**, not the finished UX: list/detail are minimal synthetic navigation contexts; refine/reuse the real product presentation after an actual H5 run. Quotation is the production Action content.
2. Verify true uni-H5 route navigation and back across all three pages (older harness had a `rootRef.value is null` issue); no static navigation substitutes or hidden error suppression.
3. Verify that the expected synthetic work order is readable in the detail screen, catalog selections are functional and same-work-order quotation draft can be restored. Current review storage is in-memory; hard page refresh persistence is **not yet claimed**.
4. Confirm zero external network calls, including unexpected/mock read fallthrough; prevent requests instead of assuming `.invalid` hostname is sufficient for a final Gate.
5. Add scoped Playwright coverage at 375×667 and 390×844, screenshots and user-flow evidence, plus verify/MP/App builds. Dev/test mocked session is not Beta or Production validation.

No merge and no G4-G.
