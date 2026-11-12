# Normal Mock H5 search readiness

This test-only candidate is based on main `dc814e4d06449c87ac0e4655fbc63d2f26ecb3c6`. It changes no application source, fixture, permission, workflow, timeout or business assertion.

## Confirmed failure and entry correction

The earlier scheduled broad Mock run executed 95 cases: 76 passed and 19 failed, with 135 existing opt-in cases skipped. Failures in nine specs stopped at normal list-to-detail entry. One unchanged quotation entry was reproduced separately. A controlled actual-App contrast showed that searching the display alias `MOCK-018` returns no results, whereas searching the synthetic fixture's actual `orderNum` `26018` returns the expected customer and permits detail navigation after search completion. During refresh the retained cards are intentionally non-navigable. The relevant list, Mock search and representative test sources were identical across the pre-quotation, quotation and concurrency-fix commits; this is not evidence of a quotation product regression.

The existing `searchMockWorkOrder` helper now also accepts an explicit actual order number and customer. It submits through the visible search control, waits for the search button to become available, the refresh indicator to disappear and the unique settled result count, then verifies the customer, displayed number and navigable card semantics. Callers retain their normal card click and subsequent detail/business assertions. Legacy 020/021 helper calls retain their existing actual-number mapping. No forced click, fixed sleep, backend query alias, injected state or new grant is used by the repaired entries.

Only the nine affected spec entry sequences are migrated. Their original 597 `expect(...)` call expressions remain in the same order with identical arguments. Display aliases remain where they intentionally identify test titles or forged-link negative cases; they are not used as server search numbers.

## Validation

The separate support DOM contract suite runs with:

```sh
pnpm exec playwright test --config config/playwright/mock-search-support.config.ts
```

Its six cases passed: no result, wrong customer, wrong displayed number and pending refresh all reject without a card click; a valid settled result permits one normal click; a display alias rejects before search submission. This is a test-helper contract harness, not an application/provider acceptance substitute.

The final normal-App targeted run passed all 41 cases across the nine affected specs, with zero skips, in 350.41 seconds. The one subsequent broad run passed all 95 executed cases in 674.31 seconds, with zero failures or retries. Its 135 pre-existing opt-in skips match the old schedule by file and full test title; no skip was added. All test/support/config hashes were unchanged during this run. Typecheck, architecture boundaries, module dependency checks and configuration layout checks passed.

The broad command retained the existing schedule environment and opt-in boundaries:

```sh
VITE_XLINK_ENABLE_REAL_WRITES=false pnpm run test:main-h5-mock
```

## Boundaries

All business responses remain credential-free synthetic Mock data. Existing external-request, page-error, read-only, signing, identity and draft assertions remain enabled. This work does not establish production, real backend persistence, native, visual acceptance or new quotation authority. The original scheduled failure and its cancellation history remain separate from later push CI and this local repair. No full unit suite, release build, real business operation or remote workflow dispatch is part of this test-only validation.
