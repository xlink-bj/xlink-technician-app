# G4-F commercial mock product journey — Lead implementation, phase A

Status: **LOCAL H5 PRODUCT FLOW VERIFIED / OWNER UX NOT PASSED**

## Entry and structure

Separate review-only uni-app routes:
`/pages/product/orders` → `/pages/product/detail` → `/pages/product/quotation`.
The first two provide compact synthetic business context; the quotation page mounts the **actual** `QuotationActionWorkspace` and retains its catalog, repair-part and composition logic. The prior `/pages/quotation/index` QA scenario hub and tests remain unmodified. The product entry has no scenario tabs, proxy badges or test controls.

Run via `pnpm run dev:uni-h5-g4f-review`; verified entry URL:
`http://127.0.0.1:5175/#/pages/product/orders`.

## Local runtime evidence — 2026-10-09

Source/runtime tested at PR #56 HEAD `39badb59f936202d5d94d1b1dd57121c0f77db06`. Playwright ran the actual uni-app H5 review entry in Chromium at **375×667** and **390×844**. The two end-to-end cases exercised:

`orders → detail → quotation → repair part/description/quantity → package detail (read-only) → material + procedure + measure selection → workbench → detail → orders → same work order/quotation re-entry → hard refresh/local-draft restore`.

Result: **2/2 passed**. Local draft was observed as saved, survived same-app back/re-entry, and was restored after a hard refresh with the explicit `已恢复本地报价分组草稿。` state. This proves only the synthetic review browser-storage path; abrupt app termination during a pending debounce/write and native device restart recovery were not tested.

The test intercepted and rejected non-local requests while recording attempts; **0 non-local HTTP requests were attempted**, **0 uncaught page errors**, **0 `console.error` messages**, and the review counters remained `{ dispatches: 0, workflowStarts: 0, reviewBlockedCommandCalls: 0 }`. The official submit/confirmation controls were absent. No real API, login, customer data, quotation/order mutation, or workflow command was used.

Screenshots are local, uncommitted evidence under `.review/g4f-commercial-mock-ux/generated/`. The successful final run produced **14 PNGs**, seven journey states at each viewport: orders, detail, empty workbench, catalog, selected items, same-app re-entry, and hard-refresh restore. Two earlier intermediate `05-selected-item-*` captures were retained, so **16 PNGs are currently present**; no review artifacts were deleted. These are synthetic H5 product-review screenshots, not authenticated, native MP/App, or Owner UX approval evidence.

Reproduce with:

```sh
pnpm exec playwright test --config playwright.uni-h5-g4f-review.config.ts tests/h5-review/g4f-quotation-product-journey.spec.ts
```

### Regression and build results

- `VITE_XLINK_ENVIRONMENT=dev pnpm run verify`: **PASS**, 57 test files / 615 unit tests; boundary checks and typecheck passed.
- Focused synthetic ExtField H5 (`g4f-quotation-synthetic-fields.spec.ts`): **3/3 PASS**.
- Focused Phase 1B H5 (`g4f-quotation-phase1b.spec.ts`): **6/7 PASS**. Its remaining package-detail case expects target copy `屋面檐口修复`; the current target renders the selected repair part `屋面`.
- Broad G4-F H5 (`pnpm exec playwright test --config playwright.uni-h5-g4f-review.config.ts`): **20/25 PASS**. Five existing assertions are inconsistent with current product copy/presentation: four expect old group/repair-description labels in the catalog target (now rendered as the selected repair part), and one expects literal `图片未提供` despite the current catalog card rendering its illustrative image treatment. No new product journey test failed.
- `pnpm run build:uni-h5-g4f-review`, `pnpm run build:mp-weixin`, and `pnpm run build:app`: **PASS**.
- `git diff --check`: checked after evidence update.

These five broad-suite failures are reported rather than suppressed or silently rewritten in this local acceptance pass. They are stale assertions to triage with the Lead; the passing end-to-end flow does not make the broad suite green.

## Safety

The isolated `review-app-g4f/main.ts` identifies product routes and injects a synthetic session and a new **strict allowlist-only** `product-read-transport.ts` wired directly into the existing Technician and Catalog mapping adapters. Unknown read shapes return an authorization/unsupported error **without any HTTP fallback**. The build's `https://mock-review.invalid` target is still configured but never used by product-review reads. Business `TechnicianApiCommandPort` methods and both `QuotationOrderCommandPort` methods are explicitly deny-only with attempt counters. The quotation workspace receives a dev-only `productReviewOnly` prop to hide and guard official submit/confirmation. Production pages and default production composition do not pass that prop. **No real login, real customer or live API writes.**

## Remaining validation / product gates

1. **Owner commercial UX review remains pending.** Runtime flow evidence does not establish visual/product acceptance. Orders/detail are synthetic contexts; quotation mounts the production `QuotationActionWorkspace` against isolated review dependencies.
2. Native MP/App runtime, device permissions, device restart durability, authenticated Beta/Production data, real catalog reads, and business save/submit remain untested and unauthorized in this slice.
3. The demo preview has no Order submit/confirmation and does not calculate or show a monetary total; its quote remains a local draft with amount status `待核验` / `暂不可计算`.
4. No assertion here proves behavior for arbitrary routes/providers; the preview adapter remains allowlist-only and fails closed.

No merge and no G4-G.
