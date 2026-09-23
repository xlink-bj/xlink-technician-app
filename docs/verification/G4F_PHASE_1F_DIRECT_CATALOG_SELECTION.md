# G4-F Phase 1F — Direct Catalog Selection Bridge

## Scope

Phase 1F adds an explicit local-composition bridge for directly selectable
`Procedure`, `Material`, and `Measure` catalog rows in the currently targeted
repair-part group. It does not add a quotation persistence API or change the
Phase 1E read contracts.

## Selection boundary

- Opening a catalog and reading its rows remains passive.
- The Action Workspace accepts a selection only for an executable
  `place_order` quotation action and only when the requested ID belongs to the
  currently open, successfully loaded catalog category.
- The selected group must exist, remain editable, and have a repair-part path.
- The direct-selection allowlist is explicit: Procedure, Material, and
  Measure. Future catalog kinds do not inherit selection capability.
- The draft projection retains only catalog ID, display name, optional unit,
  and local quantity. Provider price, cost, minimum-price, and other commercial
  metadata are not copied into the composition model.
- `Package` remains read-only: package detail and observed material layers can
  be browsed, but package rows cannot be inserted as ordinary selections.
- Mock and Real use the same normalized catalog read and local-selection path.
  Real catalog reads do not dispatch a business mutation.

## Explicitly out of scope

No package composition, SPU/SKU selection, price calculation, totals,
discount/coupon, quote save/submit/confirm/conversion, customer action,
Workflow Complete, or G4-G behavior is introduced. The local grouped draft is
not a backend quotation and must not be represented as one.

## Regression coverage

- Catalog Browser returns selection candidates only from the currently open,
  successfully loaded category and exact row identity.
- Action Workspace permits direct Procedure/Material/Measure selection and
  rejects Package and IDs absent from the current result.
- Composition projects only ID/name/unit into local selections; commercial
  fields on a provider row do not enter the draft.
- H5 browser smoke proves passive browsing, explicit direct selection into the
  opened repair-part group, Package read-only behavior, and no external network
  requests.

## Verification

Executed locally:

- `pnpm run verify` — PASS; boundary, UI governance, Phase 1A/1F boundary
  checks, typecheck, and 379 unit tests (37 files).
- `pnpm run test:uni-h5-g4f-phase1b-review` — PASS; 4 browser tests, including
  explicit Procedure/Material/Measure selection and Package read-only behavior.
- `pnpm run test:uni-h5-review` — PASS; 4 tests.
- `pnpm run test:design-system-review` — PASS; 4 tests.
- `pnpm run test:h5-review` — PASS; 32 tests, including G4-E regression.
- `pnpm run build:uni-h5-g4f-review` — PASS.
- `pnpm run build:mp-weixin-review` — PASS.
- `pnpm run build:mp-weixin` — PASS.
- `pnpm run build:app` — PASS.
- `git diff --check` — PASS.

The browser tests use deterministic Mock review data and block non-local
network requests. No Beta/Production access or business mutation was run.
