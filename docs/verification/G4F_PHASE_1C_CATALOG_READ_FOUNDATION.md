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

Catalog list reads require a non-empty service type, preventing an accidental
unscoped request. `sourceType` is omitted only when the caller has no value in
the active work-order context. Tenant/organization identity is not guessed or
added to the request; authenticated backend context remains authoritative.

Package detail requires the requested identity to match the returned package,
requires all three child-list properties, and rejects disagreement between a
child's reference identity and its embedded provider object. A child without an
embedded object remains explicitly unresolved (`item: null`) rather than being
silently joined to another item.

## Normalized read model

The port exposes item identity/name, observed unit/specification, service-type
and source-type lists, description/content, package `repairPart`, and order
fields, plus individually named commercial fields present in the source-backed
contract. Package child rows preserve the observed `number`, `coefficient`,
`coefficientUnit`, and embedded-reference structure; `number` is not rebranded
as a calculated quantity. These values are read-only provider data: this adapter
does not calculate totals, choose minimum prices, establish freshness, or
represent a quote snapshot. No version/revision/freshness token is synthesized.

Package detail preserves procedure/material/measure child grouping and their
reference/embedded-item relationship. It does not flatten the data into
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
