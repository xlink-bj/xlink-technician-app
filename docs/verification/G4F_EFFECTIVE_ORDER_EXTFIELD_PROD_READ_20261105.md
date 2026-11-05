# G4-F Effective Order ExtField Production Read — 2026-11-05

Status: `TWO_CONTEXT_EFFECTIVE_SHAPE_AND_PROVIDER_COUNTS_READ`.
Evidence class: authenticated, role-visible Production work-order context; configuration and option-provider shape only.

## Scope

Two separate bounded reads resolved the first and second distinct current `place_order` contexts in the technician's role-visible work orders. The first scan read 9 work-order pages (27 list rows) and 27 corresponding details; the second read 25 pages (75 list rows) and 75 corresponding details. These are per-run read counts and overlap from scanning the role list from its first page. The report retains only each context's ordinal, current action class, context-presence flags, and aggregate field/provider counts. Service/person values, work-order identity, field keys/labels, option IDs/values/labels, and response bodies were not persisted.

For each selected WorkOrder, the run revalidated that the current action was `place_order`, then made exactly one tenant-scoped `biz/extField/query` (`colName=order`, active, mobile detail, `page=1,size=50`) and read only providers referenced by that context's effective fields: one Code provider and one multistage Code provider. Each ExtField page returned 32/32 rows. No catalog, SKU, Order, Contract, FormData, customer, media, Workflow, or MongoDB read was part of either run.

R1 uses `placeOrder` and `submitOrder` partitions after service-type filtering; `submitOrder` also defaults an absent customer type to `'0'`. Both sanitized projections report a service type was present and that `submitOrder` used this R1 default. They do not retain the actual values.

## Result

| R1 stage | Effective rows | Required rows | Control type counts |
| --- | ---: | ---: | --- |
| `placeOrder` | 4 | 3 | cascade 1, text 1, digit 1, button 1 |
| `submitOrder` | 5 | 5 | radio 1, text 2, phone 1, area 1 |

| Effective provider | Provider count | Sanitized shape |
| --- | ---: | --- |
| Code options | 1 | 2 options; option values and labels discarded |
| Multistage Code | 1 | 15 nodes, 12 leaves, maximum depth 2; values and labels discarded |

Both distinct contexts produced the same aggregate effective shape and provider counts. This covers two verified work-order/service contexts, not every current context or a global schema. It does not prove that field identities, labels, option values, or serialization are identical. The audit did not retain row-to-requiredness associations, so it does not claim whether the `button` row is one of the required rows.

## Control implications from pinned R1 source

- `area` is a Province/City/County picker. R1 stores the selected code path in the field and also updates province/city/district values. It needs an explicit App mapping and parity tests; it must not silently become a generic text input.
- `button` is an action, not a value field. R1 may navigate to a mini program or dispatch a configured common action. The active row's action configuration was deliberately not retained, so the App must keep it blocked until an allowlisted action can be identified.
- Ordinary `text`, `digit`, `phone`, `radio`, `cascade` and option-provider structures are now evidenced in two contexts, but no live Order editor or serializer is connected. Provider counts do not validate label/value mapping, required-field UX, persistence, or R1 Order write behavior.

## Safety and reproducibility

Each audit run uses the normal preconfigured technician login in memory. It does not switch roles, persist credentials/session data, retry an ambiguous read, or make business writes. Its network allowlist admits only role-visible WorkOrder discovery/detail reads, one exact ExtField page for the selected context, and the exact Code/Cascade providers referenced by those effective fields. Unexpected reads and all mutations remain blocked. The default invocation is zero-network unless `--authorize-bounded-prod-read` is explicitly supplied.

Local implementation and synthetic tests are in `scripts/verify-g4f-prod-read.mjs`, `scripts/lib/g4f-order-extfield-shape.mjs`, and `tests/g4f/active-order-extfield-inspection.test.ts`. R1 source is pinned to `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`; the read contract and stage filtering are described in [G4F Order ExtField Effective Mapping Contract](./G4F_ORDER_EXTFIELD_MAPPING_CONTRACT.md).

No raw Production payload, customer identifier, provider option value/label, or secret was written to the repository. This is a read-only evidence capture. It does not enable Production/Beta quotation writes, Order creation, Workflow completion, upload, customer contact, or signing. Issue #201 remains `HOLD`.
