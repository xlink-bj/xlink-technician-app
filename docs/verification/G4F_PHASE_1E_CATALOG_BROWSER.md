# G4-F Phase 1E — Catalog Browser and Package Detail Read UX

## Scope

Phase 1E connects the existing read-only `QuotationCatalogReadPort` to the
quotation Action Workspace through a separate Catalog Browser Store. The read
context comes only from the adapter-normalized active Work Order:

- `ServiceAppointment.serviceType` → `WorkOrderDetail.quotationCatalogContext.serviceType`;
- `ServiceAppointment.exts.sourceType` → `WorkOrderDetail.quotationCatalogContext.sourceType`.

If the port or required service-type context is unavailable, list requests are
blocked locally. The browser does not construct scope from UI labels.

## Read UX

The browser loads Package, Procedure, Material, and Measure/机措 through their
existing kind-specific read methods. Each category has distinct loading,
empty, retryable-error, terminal-error, and missing-context states. Error copy
is normalized for the UI; raw transport/backend messages are not displayed.

Package detail is requested only for an identity present in the current
successfully loaded package list. The detail view presents the package name,
procedure/material/measure components, and material rows grouped by the exact
observed `exts.layer` value. First-seen layer order is preserved. Numeric and
string layer values remain distinct, missing layer is shown as “层级未提供”,
and no layer is inferred from position. Unresolved embedded component records
remain visibly unresolved.

Commercial fields are not displayed. The detail view does not compute price,
quantity, totals, or package eligibility.

## Composition and safety boundary

The browser is independent from `QuotationDraft.groups[]`. Catalog list rows
and package details have no add/select handler into the grouped draft. The
existing Phase 1D local composition model and draft recovery remain separate;
the next selection/configuration bridge is not part of this phase.

Mock and Real use the same read port and normalized UI state path. The checked
in H5 scenarios use synthetic Mock fixtures only. Real reads were not invoked
as part of this verification. No quote save/submit/send/confirm, conversion,
price calculation, Workflow Complete, or business mutation was added.

## Verification boundary

Unit tests cover all four category dispatches, loading/empty/retryable states,
missing-context blocking, package identity gating, detail reads, layer grouping,
and stale-response isolation. The G4-F H5 Playwright review verifies all four
Mock-backed lists and package detail without changing the local draft. This is
not authenticated Beta evidence or device validation.
