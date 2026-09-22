# G4-F Phase 1C — Quotation Catalog Read Foundation

## Scope and status

This slice adds a read-only `QuotationCatalogReadPort` for the R1 provider path:

- package list and package detail;
- procedure list;
- material list;
- measure list.

The adapter uses the previously evidenced R1 routes and request filters. It is
available from the application composition root, but is not connected to the
Phase 1B quotation screen or draft store. The Phase 1B `lines[]` model remains
local and unchanged. No price calculation, quote persistence, customer action,
or workflow mutation was added.

## Read contract implemented

| Read | Method / route | Request contract |
| --- | --- | --- |
| Packages | `POST biz/projPackage/queryWithRank` | `_all=1`, enabled state, service type, optional observed source type, `order,_id` ascending |
| Package detail | `POST biz/projPackage/findById/{packageId}` | Exact package identity in the route |
| Procedures | `POST biz/procedure/queryWithRank` | Same ranked provider context filters |
| Materials | `POST basic/material/queryWithRank` | Same ranked provider context filters |
| Measures | `POST biz/measure/queryWithRank` | Same ranked provider context filters |

Catalog scope is mapped at the Work Order API boundary into
`WorkOrderDetail.quotationCatalogContext`:

- `ServiceAppointment.serviceType` → `catalog.serviceType`;
- `ServiceAppointment.exts.sourceType` → `catalog.sourceType`.

The catalog port consumes this normalized context instead of asking a UI to
reconstruct it from labels or other display state. If `serviceType` is absent,
the adapter omits the context and rejects an unscoped catalog request.
`sourceType` is omitted only when it is absent from the active Work Order's
`exts`. Tenant/organization identity is not guessed or added to the request;
authenticated backend context remains authoritative.

Package detail requires the requested identity to match the returned package,
requires all three child-list properties, and rejects disagreement between a
child's reference identity and its embedded provider object. A child without an
embedded object remains explicitly unresolved (`item: null`) rather than being
silently joined to another item.

## Normalized read model

The port uses kind-discriminated package, procedure, material, and measure
models. Package rows retain `type` and `agelimit` (normalized as `ageLimit`);
material rows retain `code`, `materialUnit`, `specUnit`, and numeric `type`.
Common identity/name, observed unit/specification, service/source applicability,
description/content, and individually named source-backed commercial fields
remain available without collapsing type-specific semantics. Package child
rows preserve the observed `number`, `coefficient`, `coefficientUnit`, and
embedded-reference structure; material-body `exts.layer` is retained when
present and remains optional. The adapter never assigns a layer from array
position. `number` is not rebranded as a calculated quantity. These values are
read-only provider data: this adapter does not calculate totals, choose minimum
prices, establish freshness, or represent a quote snapshot. No
version/revision/freshness token is synthesized.

Package detail preserves procedure/material/measure child grouping and their
kind-specific reference/embedded-item relationship. Measure-facing Mock copy
uses the R1 product term “机措”. It does not flatten the data into
quotation lines or persist the response.

## Mock and Real transport boundary

The same R1 route and Adapter mapping path is used in both modes. In Mock mode,
the routes return bounded synthetic provider rows; Mock EMPTY returns empty
lists. Synthetic package IDs and synthetic service-type filters are marked as
Mock-owned, so when Mock is disabled they fail closed instead of reaching the
backend. Non-synthetic catalog reads use the normal authenticated read
transport when Mock is disabled.

The implementation did not contact Beta or Production. A Real catalog read is
only an available read path; no live call is claimed by this document.

## Explicitly outside this slice

- Wiring catalog results into quotation composition or Phase 1B `lines[]`.
- R1 `orderList[]` / repair-part-group composition model.
- SKU lookup (`basic/material/query`) and SPU → SKU selection; this is a
  different, currently inactive selection flow.
- Price calculations, price freshness, quote snapshots, or quote totals.
- Quote create/update/send/confirm/convert, Workflow Complete, and all other
  business writes.
- Resolving package-specific Beta HTTP 500 causes or recapturing current Beta
  provider schemas.

The source-backed field and endpoint observations remain bounded by the
existing sanitized evidence in `G4F_ACTIVE_CONTRACT_VERIFICATION.md` and
`G4F_PACKAGE_DETAIL_DIAGNOSTIC.md`; they are not a claim that every provider
variant has identical optional fields.

The child names and body fields (`procedureId` / `procedure`, `materialId` /
`material`, `measureId` / `measure`, `number`, `coefficient`, and
`coefficientUnit`) also match the checked-in backend entity definitions at the
previously inspected backend revision `5fc008d32e771205260f120621c1c4fc62d0824e`.
Source review does not turn unobserved Beta variants into verified live
records.
