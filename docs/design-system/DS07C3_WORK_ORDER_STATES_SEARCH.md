# DS-07.C3 — Major Batch: Work-Order Search & UX State Ownership

Status: **engineering migration candidate**, not a new UI design or product visual signoff. Based on DS-07.C2 Draft. Do not merge to main or promote historical Golden without Owner visual review.

## Scope: two real business pages, four reusable components, one H5 Gallery

Business pages: `src/pages/work-orders/work-orders.vue` and `src/pages/work-orders/detail.vue`.

| Shared component | Actual migrated states / duties | Boundaries |
|---|---|---|
| `AppSearchBar` | Work Order List search input, search button, disabled and keyboard-confirm | Only emits `update:modelValue` and `search`; parent still owns data, query and search request |
| `AppFeedbackState` | List retryable/terminal failures, no-results search; Detail retryable/terminal failure and pre-accept blocked view | Caller supplies title, description, optional action and exact appearance; no automatic retry or Workflow interpretation |
| `AppWorkOrderSkeleton` | List three-card loading; Detail summary/task/tabs loading with native pulse | Parent controls timing, loading flags and read scopes; CSS is visual-only |
| `AppWorkOrderEmptyState` | Zero-work-order illustrated empty state with Refresh action | Parent decides whether list is empty; component emits action without fetching data |

The authored states retain source copy, CTA labels and original event dispatch: `submitSearch`, `retry`, `clearSearch`, `refresh`. No changes to role reads, contact, acceptance, order, quotation, API or Workflow.

### What changed — and what did NOT

- Removed locally embedded markup for search, loading skeletons, four feedback states, and list's illustrated empty state. Native uni-app input and buttons remain.
- Moved visual material, geometry, illustration, animation styles into shared Vue components. Business pages no longer have competing `.search-band`, `.skeleton-*`, `.empty-state-card`, `.state-icon-error` or `.state-icon--retry` definitions.
- Preserved original loading layout variants, source messages, native button handlers and existing production read-only gates.
- Kept the unique Work Order List inline refresh bar, authentication guard and page-specific card layout local. Kept Work Order Detail quotation-read retry styling local because it is a separate business action and is not yet covered by a generalized shared quote action bar.
- No new visual palette and no new business data sources.

## Frozen measured debt

| Page | Before (DS-07.C2) | After DS-07.C3 | Change |
|---|---|---|---|
| Work Order List: hardcoded CSS hex | 60 | **21** | -39 |
| Work Order List: font-size literals | 20 | **12** | -8 |
| Work Order List: radius literals | 32 | **7** | -25 |
| Work Order Detail: hardcoded CSS hex | 80 | **65** | -15 |
| Work Order Detail: font-size literals | 30 | **29** | -1 |
| Work Order Detail: radius literals | 13 | **7** | -6 |

This is **ownership migration**: those legitimate materials are in reusable components rather than independent page skins; simply moving declarations does not alone prove more attractive UI.

## Gate & practical acceptance

1. **Validate & governance**: debt values enforced; old selector reintroduction blocked; source events preserved; TypeScript/Workflow safety unchanged.
2. **Real H5 Gallery**: deterministic fixture `__review/work-order-state-matrix.vue` at 320, 375, 390, showing actual shared components, click counters, disabled search, error/empty and both skeleton shapes. No external network.
3. **Real Work Order List**: DS02A historical 320/375/390 **list** screenshot must match unchanged Golden, since no style redesign was authorized. Search and state transitions must still work in DEV Mock.
4. **Real Detail**: H5 current-task/quotation Focus regression (from DS-06) remains working; old DS02A Detail and Q01 screenshots were already stale before DS-07 and must not be silently updated.
5. **MP**: Review build is a compilation smoke, not physical-device signoff; obtain device UX calibration separately before launch.

**Engineering acceptance != commercial visual acceptance.** Do not merge stacked PRs before explicit approval of their ancestry and product visual gates.

## Next batch

Continue with reusability of operational page patterns across **appointment, inspection, quotation, and signing**, referencing each real implementation's existing interfaces. Prioritize removing component overrides and sharing behavior-neutral presentation, not cosmetic CSS layering.
