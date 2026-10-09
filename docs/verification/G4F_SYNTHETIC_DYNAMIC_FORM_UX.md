# G4-F Synthetic Order ExtField UX Review

Status: `MOCK_PRODUCT_REVIEW` · `H5_VISUAL_PROXY`

## Scope

The `dynamic-fields` scenario mounts the existing Quotation Action Workspace and its real first repair-part step. The review-only panel applies `createOrderExtFieldEffectivePlan()` and the shared Dynamic Form Runtime to a fixed, synthetic Order ExtField fixture. It does not fetch a live schema or options.

The panel is provided through a review-app slot. The production workspace does not import the review panel or its localStorage adapter. The panel additionally requires a development build, the explicit `dynamic-fields` scenario, a valid `place_order` descriptor, and the isolated storage port.

## Review

Start the real uni H5 review application:

```sh
pnpm run dev:uni-h5-g4f-review
```

Open `http://127.0.0.1:5175/?scenario=dynamic-fields` at a mobile viewport (Playwright: 390 × 844, device scale factor 1).

The scenario demonstrates:

1. Ordinary editable text, textarea, and digit fields in the current quotation workspace.
2. Conditional visibility using the accepted mapper; changing the condition hides a row without deleting its value. Two disjoint rows share one synthetic `valueKey` and preserve the same value.
3. Catalog-entry validation and final-submit requiredness as separate phases. A required field with a matching `dispensable` condition remains required before entering the catalog but is shown as optional for the final-submit phase. A hidden conditional required field remains in final-submit diagnostics.
4. Stage, service-type, and person-type applicability examples.
5. Explicitly blocked area, button, required media, and provider-backed select/cascade capabilities. They do not render as fake inputs and do not invoke providers, location, media, or business commands.
6. A versioned, local-only draft that restores after returning from the catalog and after H5 reload. A malformed record is left untouched and locks editing.

## Draft and business boundary

The synthetic draft uses its own versioned keyspace and identity dimensions: user, work order, workflow node, action intent, scenario, and fixture version. Unknown tuple-encoded keys remain opaque and are preserved when supported fields change; malformed records are never overwritten. This draft is not stored in or migrated into `QuotationDraft` V3.

The scenario suppresses both the workspace submit affordances and confirmation UI. Its injected quotation command port fails closed and counts any attempted call. Browser tests assert that Order dispatch, Workflow start, and blocked command-port calls remain zero. No production/Beta API, real schema, customer data, real media, order command, or workflow command is used.

## Evidence and verification

Playwright coverage is in `tests/h5-review/g4f-quotation-synthetic-fields.spec.ts`; pure mapping and draft-scope regressions are in `tests/g4f/synthetic-order-extfield-review.test.ts`.

Generated screenshots are written to `.review/g4f-synthetic-dynamic-form/` and are local review artifacts, not authenticated or device evidence.

```sh
pnpm exec vitest run tests/g4f/synthetic-order-extfield-review.test.ts
pnpm run test:uni-h5-g4f-review
```

## Limitations

- The fixture is synthetic and does not claim to represent an active Production Order schema or a particular work order's effective fields.
- Provider options, province/city/county selection, button actions, media persistence, Order.exts serialization, official quotation submission, and workflow completion remain outside this review.
- H5 evidence is not MP/App device evidence and does not establish business or production readiness.
