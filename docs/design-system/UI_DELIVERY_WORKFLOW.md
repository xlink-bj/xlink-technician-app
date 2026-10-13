# UI Delivery Workflow v1

Status: mandatory delivery workflow for mobile Action Workspace UX/UI changes.

This workflow operationalizes the Design System contract. It does not replace
business requirements, Runtime state, backend contracts, or Product Owner
review.

## 1. Authority order

Use this order when designing or reviewing mobile UI:

1. current business/domain truth;
2. R1 production mobile UX as the baseline for proven control behavior;
3. Action Workspace Design System and shared UI contracts;
4. true uni-app H5 Review + Playwright for high-frequency automated review;
5. MP-WEIXIN Review App for platform-fidelity calibration;
6. real MP/App device smoke for release/platform validation.

The raw H5 harness is a fast semantic/state harness only. It is not visual
authority.

## 2. Reuse before invention

Before creating UI, classify the required interaction:

- existing `SHARED_PRIMITIVE` -> reuse it;
- existing `SHARED_PATTERN` -> reuse the pattern without importing business
  semantics into shared UI;
- domain-specific behavior -> keep it as `BUSINESS_EXPERIENCE`;
- new reusable-looking interaction -> start locally as a pattern/experience,
  then promote only after evidence.

Promotion rule:

```text
BUSINESS_EXPERIENCE / local pattern
  -> second verified consumer
  -> compare interaction contract
  -> SHARED_PATTERN
  -> extract SHARED_PRIMITIVE only when the shared API is proven
```

Do not generalize a component because it "might be useful later".

## 3. Action Workspace invariant

Workspace-level actions belong in the persistent bottom Action Bar.

Field-local actions stay inside their field or controlled experience.

The following concepts are always distinct:

- local draft autosave;
- explicit business Save;
- workflow Complete / Submit.

Do not place a second business Save button inside scrollable form content.

## 4. Delivery loop

Every UI slice follows this loop:

```text
business contract / R1 evidence
  -> reuse or classify component/pattern
  -> implement with shared tokens/primitives
  -> deterministic Gallery / scenario coverage
  -> true uni-app H5 + Playwright
  -> Product review
  -> MP calibration only when triggered
  -> real-device smoke for release/platform-sensitive behavior
```

A business page should not become the first place where a reusable shared
control state is visually reviewed.

## 5. Required evidence

For a new or materially changed shared primitive/pattern:

- Design System classification is explicit;
- canonical deterministic fixture exists;
- Gallery renders the real shared component/pattern;
- Playwright covers the important state boundary;
- true uni-app H5 screenshot evidence can be generated;
- MP calibration is performed when the trigger matrix requires it.

For business-only composition using unchanged shared controls, business-level
H5 scenarios are normally enough.

## 6. MP calibration trigger matrix

| Change | true uni H5 | MP calibration |
| --- | --- | --- |
| Business page composition / copy | Required | Usually no |
| Shared primitive behavior or layout | Required | Required |
| Design tokens: type, spacing, radius, control sizing | Required | Required |
| Input / textarea / selector native-sensitive behavior | Required | Required |
| Bottom sheet / popup / safe-area / Action Bar | Required | Required |
| Shared pattern presentation | Required | Required when platform-sensitive |
| Runtime/data-only logic | Functional tests | No UI trigger by itself |
| Release candidate | Required | Required for affected surfaces |
| Product Owner explicit request | Required | Required |

MP and H5 do not need pixel identity. Calibration is about hierarchy, density,
control dimensions, wrapping, safe-area behavior, and interaction grammar.

## 7. Review outcomes

Use these cross-platform classifications only:

- `MATCH`
- `ACCEPTABLE_PLATFORM_DIFFERENCE`
- `MATERIAL_DIVERGENCE`
- `NOT_TESTED`

A `MATERIAL_DIVERGENCE` blocks visual acceptance until the cause is
classified as shared UI, platform-only, or an intentional product decision.

## 8. Automated governance

Run:

```bash
pnpm run check:ui-governance
```

The checker protects a small set of high-value invariants:

- Design System workflow/spec files exist;
- production pages do not expose review routes;
- dynamic form content does not own Workspace-level Save UI;
- the shared saved state cannot dispatch duplicate Save;
- shared textarea keeps the multiline/auto-height contract;
- canonical Gallery covers the governed shared controls;
- normal `pnpm run verify` includes this governance check.

The checker is intentionally conservative. It should enforce stable rules, not
encode temporary business-page markup.

## 9. Pull request / agent checklist

Before declaring UI work ready for review:

1. identify reused primitive/pattern or justify a new one;
2. confirm no business semantics leaked into shared UI;
3. update Gallery fixture/state if shared UI changed;
4. run `pnpm run verify`;
5. run relevant H5 Playwright review;
6. perform MP calibration if the trigger matrix requires it;
7. record any accepted platform difference;
8. do not claim device validation from H5 or DevTools evidence.

## 10. Current calibrated baseline

The Design System v0.2 cross-platform calibration established:

- Foundations / typography: `MATCH`;
- Actions: `MATCH`;
- Input / Textarea: `ACCEPTABLE_PLATFORM_DIFFERENCE`;
- Selection: `MATCH`;
- Action Workspace Footer: `ACCEPTABLE_PLATFORM_DIFFERENCE`;
- material divergence: none.

This baseline may be revised only with new reviewed evidence.
