# C2-A — DEV Mock commercial review capability boundary

Status: implementation candidate, Owner review required. Base: `main@57cde73a25bcd964715804745f355bc1dbb0ee56`. Issue: #241.

## Intent and exact dependency change

The DEV-only `MockCommercialFlowLinks.vue` component previously imported app-level Mock journey, SKU/signing URLs and local review progress/commands directly. This caused **four `@app/` import statements from the quotation feature** to reference orchestration owned by the application root.

Now `src/features/work-orders/quotation/mock-commercial-review-port.ts` owns the typed presentation contract. The already-DEV-only `src/pages/dev/qa-console.vue` composes the real synthetic Mock functions and passes the capability to the component as a required prop. The port has no default implementation; a missing capability does not silently fall back to a privileged app-global service.

| Before | After |
| --- | --- |
| Feature imports `@app/mock-journey` | QA page composes journey authorization, feature calls `review.canReview` |
| Feature imports Mock SKU/signing review URLs | QA page passes URL callbacks through typed port |
| Feature imports Mock review ledger functions | QA page passes read/confirm/pause/resume/revoke callbacks |

The original authorization predicate (journey must be `quotation` and SKU Mock read must be permitted), synthetic progress, checkpoint ordering, and user/role/work-order scoping are preserved without modifications to the underlying app implementations. Commercial page layouts, CSS, R1 API contracts, data models, pricing, Workflow and production requests are unchanged.

## Proof / boundaries

- Required new port prop wired by the **only source consumer**, `pages/dev/qa-console.vue`.
- No `@app/` implementation import remains in `MockCommercialFlowLinks.vue`; the remaining C2 back references in other features are separate slices.
- Static regression test protects this dependency direction and the DEV QA composition authorization.
- Existing isolated Mock browser journeys, C1 H5/MP release exclusion, TypeScript and governance gates remain required.
- Local evidence: targeted Mock journey tests **21/21 PASS**, the added dependency test **2/2 PASS**, `verify:quick` **306/306 PASS**, H5/MP/APP release builds **PASS**, and `verify:full` with the canonical test profile and full Git history **1472/1472 PASS**.
- The prior six baseline failures were diagnosed as two missing execution prerequisites (test environment profile and full Git history); no code fix was needed. The unaffected `main@17ba721` passed **1470/1470** under the canonical prerequisites and issue #239 is closed with evidence.

No Production/Beta reads/writes, real signing, Golden changes, deployment or main merge is authorized by this slice.
