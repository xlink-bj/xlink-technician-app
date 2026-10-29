# CUI-02 Mainline Reconciliation — 2026-10-29

## Decision

**PR #227 remains Draft / DO NOT MERGE AS-IS.** Its CSS ownership split is based on the older CUI-01 import order. The Owner-accepted commercial mainline was merged as #234 (`8c79f81815f652850ca7a496fc5478a77435954b`). Main now already imports five dedicated component owners:

1. `QuotationShared.css`
2. `QuotationGroups.css`
3. `QuotationEditor.css`
4. `QuotationCatalog.css`
5. `QuotationPackageConfiguration.css`

The current `scripts/ci/commercial-css-ownership.mjs` already enforces no duplicate selectors within final owner files, a stable import order, and no resurrection of dead catalogue artwork. PR #227 would introduce an *alternative* five-file owner hierarchy and update stale import order. Direct merge risks redefining CSS sources and undoing current Q01 commercial parity.

## Evidence / bounded debt

| Metric | Current signed main | Historical #227 |
| --- | ---: | ---: |
| Legacy quotation stylesheet | 57,799 B | 17,249 characters (old shared owner) |
| Five owner styles plus legacy (without Q01/Q03 final baselines) | **83,700 B** | ~73,258 characters |
| Legacy repeated root selector excess (includes intentional responsive overrides) | **172** | Not equivalent to latest main |
| Exact visual coverage | DS02A W01/W02/Q01 at 320/375/390; Q01/Q03 and native scoped evidence | #227 original 375px parity against its prior CUI-01 base |

The raw repeated-root metric is a *technical debt budget*, **not** a dead-CSS deletion list. Many selectors are live and some repetitions deliberately represent media overrides; removing them by count alone would be unsafe.

## Safe carryover — current PR

- Keep the existing mainline CSS split, original cascade, Q01/Q03 final baselines, and all `src/` files untouched.
- Add a fail-closed **no-growth ceiling** to the existing CI guard at the accepted main values: legacy CSS ≤57,799 B; legacy plus the five owner files ≤83,700 B; excess repeated root definitions ≤172.
- The ceiling can only increase through an explicit reviewed change with rendering evidence, not a silent CSS append. Subsequent ownership cleanup should reduce these numbers in small verified batches.
- Full `verify`, existing CSS guard and no-deployment safety must pass. MP/H5/App pixels are unaffected because this change touches only CI and documentation.

## Remaining #227 scope

The historical 10.4 KB additional reduction is a possible optimization, **not** approved for transplantation without redoing ownership mapping and 320/375/390/393 visual parity on the accepted main. Keep #227 open for traceability pending that targeted decision; do not replace existing CSS owners or refresh signed Golden images.
