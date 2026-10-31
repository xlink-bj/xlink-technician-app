# M2 — Module Boundary Repair & Business Rule Ownership

> **Status:** M2-A **MERGED** via [PR #258](https://github.com/xlink-bj/xlink-technician-app/pull/258) at `main@05d099cdd83deda4b810490bf7202bd62d1864bc`; M2-B candidate pending exact-head CI and Owner merge approval.
> **M2-A base:** `main@f488393432e2348d146553e4df68d9822b15b70e` (merged M1).
> **M2-B base:** `main@05d099cdd83deda4b810490bf7202bd62d1864bc`.
> **Scope:** Contract-preserving boundary repair, one semantic rule deduplication, and business ownership ratchet.
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

## 3. M2-B — confirmed rule duplication and ownership closure

Full call-chain review covered Appointment, generic Dynamic Action, controlled Survey leakage-cause, Workflow projections, quotation pricing, type=1 encoding, Mock/Real contract adapters and regression fixtures.

| Rule / responsibility | Canonical owner | Consumer and M2 disposition |
| --- | --- | --- |
| Form field schema projection / mobile surface | `features/work-orders/action-form-schema.ts` | Appointment and Dynamic Action reuse the same metadata projection; no second schema evaluator. |
| Visibility, applicability, normalization | `runtimes/dynamic-form/` | Appointment-specific visit branch and Survey-specific two-row selector remain **domain policies**, not a duplicated generic Runtime. |
| Workflow node readonly field membership | `features/work-orders/action-form-schema.ts::isWorkflowFieldReadOnly` | **Confirmed duplicate: four equivalent String-coercing membership predicates → one helper**. Three generic call sites and the controlled Survey call site now share it. Same field-ID behavior, no API/DTO/UI change. |
| Workflow action eligibility | `runtimes/workflow/` | `features/work-orders/detail-workflow.ts` adds display projection only; no duplicate eligibility decision. |
| Pricing math, discounts, money rounding | `features/work-orders/quotation/pricing.ts` | Quotation Engine computes once per stage; `order-encoder.ts` re-invokes the same canonical function before type=1 wire encoding as a **deliberate tamper/integrity fence**. Never eliminate it as “duplicate calculation.” |
| Quotation SKU count | `features/work-orders/quotation/model.ts` | Domain quantity aggregation, not a second price engine. |
| Mock suggestion / R1 real quotation catalog | DEV-only `app/mock-journey-quote-suggestion.ts` / `adapters/api/quotation-catalog-api.ts` | Synthetic suggestion remains DEV-only. No invented real catalog identity or Production business write. |
| FormData save-only / Workflow complete wires | `adapters/api/action-command-wires.ts` | Distinct command encoders; UI and Runtime never dispatch raw paths or implicitly finish Workflow. |

**Regression ratchet:** `scripts/check-eq10-ownership.mjs` now rejects a repeat of the known inline `workflowReadOnlyFieldIds?.some(...)` decision under WorkOrder features and rejects removal of the canonical helper. Its negative self-test injects a duplicate and proves the guard fails. This is **static scope protection**, not proof that all possible semantic duplication is mathematically impossible. Existing EQ08 checks retain the pricing and Workflow owner boundaries.

**Behavioral fixtures:** `tests/engineering/m2-semantic-rule-ownership.test.ts` covers missing/empty/matching/mismatching IDs, the legacy string-coercion edge, generic visible/read-only rendering, individual edit rejection, normalized wire values, controlled Survey read-only and hidden-row exclusion. `tests/engineering/eq08-action-architecture.test.ts`, `tests/engineering/r1-appointment-conditional-runtime.test.ts`, `tests/g4e/survey-leakage-cause.test.ts`, `tests/g4ux/workflow-projection.test.ts` and `tests/g4f/quotation-engine.test.ts` cover adjacent behavior, including intentional anti-forgery re-evaluation.

This closes the **identified M1/M2 cross-module and repeated-rule violations** without touching R1 transport, persisted value shapes, Production/Beta authorization, pricing formula, UI or CSS. It does **not** claim all future features or all pre-existing type-only SCCs have been eliminated; those need separate evidence and Owner scope.

## 4. Verification and integration gate

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
- M2-A [PR #258](https://github.com/xlink-bj/xlink-technician-app/pull/258): exact-head CI passed, Owner approved, merged to `05d099cd`.
- M2-B six targeted suites: **93 / 93 PASS**.
- M2-B `node scripts/check-eq10-ownership.mjs --self-test`: **PASS**, 8/8 injected regressions rejected.
- M2-B `check:module-dependencies --self-test`: **PASS**, 288 modules / 1,009 edges, 0 runtime SCCs, 0 current policy violations. The extra edge vs M2-A is Survey → shared policy owner.
- M2-B `CI=true VITE_XLINK_ENVIRONMENT=test pnpm verify:full`: **PASS**, typecheck, guards, 172 suites / 1,538 tests, quality census.
- M2-B `CI=true pnpm build:h5`: **PASS**, release QA pages excluded.
- M2-B `CI=true pnpm build:mp-weixin`: **PASS**, release QA pages excluded, MP bootstrap and emitted WXSS guards.
- M2-B `CI=true pnpm build:app`: **PASS**, source/release QA guards and App compilation. Native packaged installation and physical-device screenshots were **not** claimed.
- M2-B exact-head GitHub PR CI and Owner merge authorization remain the integration gates.
- M2-B merge requires exact-head GitHub PR CI and explicit Owner authorization; M2-A approval is not an automatic authorization to merge later implementation.

The historical M1 dependency snapshot and M2-A graph numbers above are fixed evidence; M2-B's live static counts are recorded separately under its own verification gate. Static graphs cannot prove semantic behavior. Keep Production read-only and Mock protocol parity throughout.
