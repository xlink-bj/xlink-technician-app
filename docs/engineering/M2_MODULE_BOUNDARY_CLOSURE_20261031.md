# M2 — Module Boundary Repair & Business Rule Ownership

> **Status:** M2-A implementation candidate, pending exact-head PR validation and Owner review.
> **Base:** `main@f488393432e2348d146553e4df68d9822b15b70e` (merged M1).
> **Scope:** Small, contract-preserving boundary repair and semantic-ownership review.
> No Production/Beta write, R1 wire, Quotation pricing, Workflow policy, CSS or accepted commercial UI change.

## 1. Two confirmed M1 violations repaired

| Before | After | Why safe |
| --- | --- | --- |
| `features/home/draft-diagnostics.ts` → WorkOrder private `action-workspace.ts` | `features/home/draft-diagnostics.ts` → `@features/work-orders` (narrow `index.ts`) → pure route implementation | Same `actionWorkspaceRouteFor` function identity and byte-for-byte encoded URL. No WorkOrder store imported by Home. |
| `features/work-orders/components/MockJourneyContextPanel.vue` → `app/mock-journey-context.ts` (type only) | Component and App Mock helpers → neutral `shared/types/mock-journey.ts` DTO | The exact original DTO fields are retained; App exports old type paths for compatibility. No rendering change. |

The M1 approved exceptions are **not overwritten**. A separate
`docs/governance/ACTIVE_MODULE_DEPENDENCY_POLICY.json` now sets the allowed
current violation list to **empty**, so the original two exceptions cannot
silently return. The historical 2026-10-31 M1 snapshot remains immutable.
The new WorkOrder public facade deliberately exports only the pure
`actionWorkspaceRouteFor` function, not a catch-all internal barrel.

Live M2-A graph after the repair: **288 TS/Vue modules / 1,008 static edges,
0 policy violations, 0 runtime SCCs, 3 type-only-involving SCCs**. The two
approved exceptions from M1 have disappeared; there are no new exceptions.

## 2. Duplicate business implementation — semantic decisions

| Capability | Authority and observed consumers | M2 decision |
| --- | --- | --- |
| Workflow visibility, action eligibility | `runtimes/workflow/policy.ts`, `detail-projection.ts` | `features/work-orders/detail-workflow.ts` calls `projectDetailWorkflow` then adds UI labels and tone; **not a second eligibility engine**. Preserve. |
| Quotation amount and rounding | `features/work-orders/quotation/pricing.ts` | `order-encoder.ts` calls `calculateQuotationPricing` again to reject mismatched pricing before official Order type=1 encoding. This is an **intentional integrity check**, not an alternative price formula. Preserve. |
| Quotation SKU counts | `features/work-orders/quotation/model.ts` | `sum(sku.number)` manages an R1 SPU representation count, not quotation money. Preserve. |
| Mock survey → quotation suggestion | `app/mock-journey-quote-suggestion.ts` | Explicitly synthetic, DEV-only mapping. Do not promote it to production catalog / actual cross-domain ID mapping. |
| Dynamic Form visibility, conditional fields | `runtimes/dynamic-form/`, WorkOrder schema projection | **Further behavioral case-by-case audit needed** before removing any projection; an identically named field rule is not proof of duplicate authority. |

The existing `tests/engineering/eq08-action-architecture.test.ts` already
enforces that the WorkOrder state coordinator does not calculate quotation
prices or workflow projections itself. M2 adds direct public facade/DTO
compatibility tests and relies on existing WorkOrder draft/quotation/Workflow
regressions. No business semantic rewrite is justified by this review alone.

## 3. Verification and follow-up gate

Before integration:

- `pnpm check:module-dependencies`: expect **0 policy exceptions**, **0 runtime SCCs**; compare with M1's baseline of two approved boundary exceptions.
- `CI=true VITE_XLINK_ENVIRONMENT=test pnpm verify:full` **PASS**:
  171 suites / 1,534 tests and all existing architecture/quality guards.
- Targeted Work Order route, DEV Mock DTO, local drafts, Workflow and quotation
  regressions **PASS**: 5 suites / 77 tests.
- `CI=true pnpm build:h5` **PASS** (release QA routes absent).
- `CI=true pnpm build:mp-weixin` **PASS** (release QA, MP bootstrap and emitted WXSS).
- `CI=true pnpm build:app` **PASS** (release QA and App compilation).
- Confirm exact route behavior, App and shared display DTO compatibility, no modified CSS or business wire files.
- Exact-head GitHub PR CI, then explicit Owner approval to merge.

**M2-B candidate:** focused Dynamic Form / Quotation Workflow behavioral
equivalence fixtures; if a truly duplicated business rule is proven, move
call sites to the existing owner in a separately reviewable change. Keep
Production read-only and Mock protocol parity throughout.
