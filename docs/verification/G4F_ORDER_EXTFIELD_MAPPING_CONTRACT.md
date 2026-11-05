# G4-F Order ExtField Effective Mapping Contract

**Status:** `PURE_MAPPING_ONLY / R1_VALIDATION_PHASES_SOURCE_MAPPED / TENANT_SHAPE_CAPTURED / ONE_CONTEXT_EFFECTIVE_SHAPE_AND_PROVIDER_COUNTS_CAPTURED / NOT_CONNECTED`

This document specifies the source-backed, fail-closed plan mapper implemented for Issue #51. The mapper consumes synthetic ExtField-shaped rows and explicit stage/service/person/value context. It is not a Production adapter, a live quotation schema, a UI, or an Order serializer.

## Evidence and scope

The sanitized tenant-wide Production shape capture is recorded in [G4F_ACTIVE_ORDER_EXTFIELD_SCHEMA_SHAPE.md](./G4F_ACTIVE_ORDER_EXTFIELD_SCHEMA_SHAPE.md): 32/32 enabled `order` mobile-detail rows were returned by one bounded query. The effective stage shape for one verified current work-order context and its referenced Code/Cascade provider counts are recorded in [G4F_EFFECTIVE_ORDER_EXTFIELD_PROD_READ_20261105.md](./G4F_EFFECTIVE_ORDER_EXTFIELD_PROD_READ_20261105.md). That read found 4 `placeOrder` rows and 5 `submitOrder` rows after source-matched context filtering; raw field/provider identities and option contents were discarded. This is one context only, not a global schema or an Order write/runtime validation.

R1 source is pinned to `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`; backend source is pinned to `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`. Relevant R1 locations in `business/subpackages/order/placeOrders.vue`:

- `getFields()` stage and context filters: lines 3618–3672.
- conditional rendering: lines 31–38 and 4447–4459.
- selection-entry validation (`onSelectionOpen()`): lines 4419–4450.
- final `placeOrder(type)` requiredness / dispensable validation: lines 3835–3860.
- area control and value capture: lines 241–254, 2185–2210, 5320–5345.
- button action behavior: lines 255–270 and 2215–2229.
- `Order.exts` write projection, including file URL conversion: lines 4200–4285.

## Effective applicability truth table

| Input / rule | Plan result | Evidence boundary |
| --- | --- | --- |
| `colName` is `order`, `state` is enabled, and `showList` includes mobile-detail code `4` | Candidate for stage mapping | Mirrors the R1 query/render surface. Missing or malformed metadata blocks; a different collection/surface or disabled row is filtered. |
| `frontEndConfig.showType === 'placeOrder'` | Candidate only for `placeOrder` | Exact stage match. |
| `frontEndConfig.showType === 'submitOrder'` | Candidate only for `submitOrder` | Exact stage match. |
| Missing or other `showType` | Filtered from both stages | Never inferred from field name/label. |
| Configured `serviceType` | Applies to both stages | Requires explicit context. A verified array encoding is compared by exact membership. Missing context blocks instead of broadening. A scalar string restriction is blocked because R1 `.indexOf()` substring semantics do not establish its intended encoding. |
| Configured `personType` | Applies only to `submitOrder` | Requires explicit context and same-typed safe scalar equality. No implicit R1 default (`'0'`) is injected by this mapper. |
| `showField/showValue` absent | Unconditional visibility for rendering / selection entry | Source metadata has no condition pair. Final `placeOrder()` requiredness is evaluated separately and does not use this visibility rule. |
| `showField/showValue` matched with same-typed string/number/boolean | Runtime `equals` expression may be represented | Expression is finite and strict-equality-safe for the supplied pair. A nonmatch filters the row from rendering / selection entry, but does not remove its final-submit obligation. |
| Conditional dependency missing, malformed pair, object/array operand, or cross-type coercion | Rendering / selection mapping is blocked | R1 uses loose `==`; the mapper does not guess coercion. Final requiredness still ignores `showField`, while unresolved `dispensableField` blocks that final rule. |
| `required` exactly represented by `'1'`, `1`, or `true` | Required | These encodings preserve R1 `required == '1'` truth for supported primitives. |
| `required` represented by `'0'`, `0`, or `false` | Optional | Other encodings remain unknown and block an ordinary candidate. |
| `dispensableField/dispensableValue` matched safely | No effect on visible schema/catalog-entry requiredness; final-submit requiredness becomes optional | R1's explicit dispensable bypass exists only in final `placeOrder(type)` validation. Unresolved/coercive conditions block the final rule, not the selection-entry mapping. |

## R1 validation phases are intentionally distinct

The source establishes two different gates, so the mapper exposes both rather than using visibility as a proxy for final validation:

1. **Render / selection-entry gate.** R1 renders conditional fields only when `showField/showValue` matches (lines 31–38, 4447–4459). Before opening product selection, `onSelectionOpen()` checks each visible required field while considering conditional visibility (lines 4419–4450). It does **not** inspect `dispensableField/dispensableValue`. A safely evaluated hidden field is therefore `filtered` from the current fields and does not block entry to the catalog; a visible required field remains required even when its dispensable condition happens to match. An unresolved/coercive visibility rule remains blocked in this plan; it is never guessed to be hidden.
2. **Final Order `placeOrder()` gate.** R1 selects the active `placeOrderFields` or `submitOrderFields` partition and checks each required row at lines 3835–3860 without checking `showField` visibility. Here—and only here—a matching `dispensableField/dispensableValue` condition bypasses the requiredness check. Therefore a hidden required row remains a final-submit obligation unless dispensable matches, while a visible required row remains an entry-to-catalog obligation regardless of dispensable.

`OrderExtFieldPlanRow.disposition`, its `FormFieldSchema.required`, and `requiredBlockerRowIds` describe visible fields / catalog-entry requirements. The schema's required flag comes from the declared ExtField `required` value; `dispensable` is not evaluated in this phase. Each row additionally has a `finalSubmit` rule (`required`, `optional`, `blocked`, or `not_applicable`), with `finalSubmitRequiredRowIds` and `finalSubmitBlockedRowIds` diagnostics. The separate final rule rechecks active collection/surface, stage, service type, submit-stage person type, declared requiredness, and the explicit dispensable exception; it deliberately does **not** consult `showField`. Unknown requiredness or unresolved/coercive dispensability blocks the final rule only. A `required` schema flag or final rule records an obligation only; it does not claim the current value is present, validate its control-specific shape, or prove that an Order can be submitted.

This is source-derived and synthetic-test-covered phase parity only. It is not connected to UI, a submit command, or a serializer, and does not resolve the concrete effective field set for any work order.

Caller context must be authoritative and explicitly supplied. This mapper itself does not look up or infer work-order stage, service type, person type, or field values.

## Row identity, schema projection, and value preservation

`rowId` is the stable ExtField definition identity; `valueKey` is the `Order.exts` business key. Multiple distinct rows may share one value key and remain separate in `rows`/`FormFieldSchema.fieldId`. Duplicate row identities block. If rows in the same effective stage/context share one value key but declare conflicting control types—including a special control without a generic schema—the conflicting rows block rather than silently selecting one interpretation.

The mapper exports:

- `createOrderExtFieldEffectivePlan(rows, context)`: returns per-row `eligible` / `filtered` / `blocked`, mapping evidence (`SOURCE_VERIFIED`, `RUNTIME_INFERRED`, `BLOCKED`), ordinary `FormFieldSchema` candidates, a separate final-submit requiredness rule, provider/special-control diagnostics, and `liveRuntimeReady: false`.
- `classifyOrderAreaPath(value)` and `orderAreaPathFromPickerValues(value)`: typed blank/partial/complete/invalid three-code path helpers; they only retain supplied code/value entries and never fetch a dictionary or fabricate a missing code.
- `restoreOrderExtFieldValues(existingExts, plan)`: separates values mapped to current ordinary candidates from opaque unmapped/filtered/blocked values in in-memory read/edit state.
- `projectEligibleOrderExtFieldValues(plan, values)`: a pure synthetic projection of eligible keys only. It is not called by a command or serializer. Unknown old keys remain outside this projection.

No persistence, network, workflow, or UI side effect exists in this module.

## Control and provider boundaries

| Control family | Plan behavior | Why it is not live-ready |
| --- | --- | --- |
| Ordinary recognized Dynamic Form types | Candidate `FormFieldSchema` only after applicability, requiredness, config, and capability checks; marked `RUNTIME_INFERRED` | No quotation UI or `Order.exts` writer is connected. Numeric normalization/value-shape parity remains unverified. |
| `select` / `radio` / `checkbox` / `cascade` | A missing provider blocks. One effective context now has bounded Code/Cascade provider reads, summarized without values; those summaries do not activate Runtime mapping. Checkbox candidate semantics retain `multiple: true`; without a reviewed value/label and serialization mapping, no scalar fallback occurs. | Provider counts/tree depth are known for one context only. Option values, labels, row identities, full cross-context scope, UI mapping, and Order serialization remain unverified. |
| `bizSelect`, arbitrary `requestUrl`, `evaluate`, or unknown config keys | Blocked | No arbitrary endpoint, script, expression, or dynamic command is executed. |
| `area` | Separate blocked `area` capability with a three-code path contract; one current `submitOrder` context includes an `area` row | R1 is a Province/City/County selector and stores a selected code path. Exact current field identity/value and its platform interaction remain unpersisted; it is not promoted to generic `FormFieldSchema` support. |
| `button` | Separate `button` special action, `BLOCKED`; never a value schema. The one current `placeOrder` context includes a `button` row. | R1 can navigate to a mini program or dispatch a configured action. The active action config was discarded; it cannot execute until its intent is identified and allowlisted. Its association with requiredness is also not retained. |
| `file` / `image` | Separate blocked media capability; required rows are required blockers | Generic type recognition does not prove Order upload, restore, or `Order.exts` URI semantics. R1 converts file arrays to comma-separated URLs on write. |
| `gap` | Presentation-only row; never submitted as a field | R1 gap markup is not generalized to arbitrary HTML in this plan. |
| `switch` | Blocked pending value/default parity | R1 uses active/inactive values `'1'`/`'0'` and applies a submit-time default; current Runtime uses booleans. No silent conversion is inferred. |

`requiredBlockerRowIds`, `finalSubmitRequiredRowIds`, and `finalSubmitBlockedRowIds` are diagnostics only. The first belongs to field rendering/catalog entry; the latter two report final R1 requiredness obligations independently of visibility. No UI, submit command, or completion gate consumes these diagnostics yet.

## Synthetic regression coverage

`tests/g4f/order-extfield-effective-plan.test.ts` uses synthetic rows and values only. It covers exact stage isolation, service/person applicability and missing context, unknown stages, row identity versus shared value keys, duplicate/conflicting identities, hidden required rows filtered from selection entry but retained as final-submit obligations, visible required rows, `submitOrder` partitioning, matching dispensable remaining required at selection entry while waiving final requiredness, unresolved/coercive dispensable remaining required at entry while blocking the final rule, equality/coercion behavior, typed area path handling, button non-execution/non-projection, required media blocking, unsupported/missing/unfetched providers, and opaque legacy `Order.exts` preservation with projection exclusion.

The tests do not import or parse captured Production rows. The bounded live endpoint evidence is separately summarized in [G4F_EFFECTIVE_ORDER_EXTFIELD_PROD_READ_20261105.md](./G4F_EFFECTIVE_ORDER_EXTFIELD_PROD_READ_20261105.md); no raw Production row or provider payload is persisted.

## Remaining UNKNOWNs and gate

1. Field identities/configuration and effective form details for other active work-order contexts; the current persisted evidence is aggregate-only and omits actual service/person values.
2. Provider option values/labels, field-to-option mapping, and source scoping across other contexts; the current read retained counts/tree depth only.
3. `area` code-path completeness rules and live UI/API round-trip parity.
4. The observed `button` row's exact intent/configuration and which explicitly allowlisted business action, if any, it should represent.
5. Order-specific media upload, restore, and persisted `Order.exts` value shape.
6. Actual prior Order `exts` values and edit/round-trip behavior; preserving unknown keys here is only a pure in-memory invariant.
7. Numeric and remaining generic control value parity at a real UI/serializer boundary.

Therefore: tenant schema shape is captured; one context has a sanitized effective stage/type/provider summary; the two R1 validation phases are represented in a source-backed pure plan with synthetic regressions; no live quotation Runtime, UI mapping, or serializer is ready or connected. Any broader production read needs an explicit bounded scope; any Order write remains a separate authorization gate.

## Verification and safety

Issue #51 remains disconnected from the live quotation Runtime. The single bounded Production context/option read is summarized in [G4F_EFFECTIVE_ORDER_EXTFIELD_PROD_READ_20261105.md](./G4F_EFFECTIVE_ORDER_EXTFIELD_PROD_READ_20261105.md). No role changes, Order/customer/Mongo reads, uploads, quotation mutations, or Workflow commands were performed in that run. Production/Beta writes remain prohibited; existing quotation composition, price, workflow, and write boundaries are unchanged.
