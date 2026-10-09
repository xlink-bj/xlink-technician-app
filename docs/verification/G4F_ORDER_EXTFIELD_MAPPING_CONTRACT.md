# G4-F Order ExtField Effective Mapping Contract

**Status:** `PURE_MAPPING_ONLY / TENANT_SHAPE_CAPTURED / EFFECTIVE_FORM_UNKNOWN / NOT_CONNECTED`

This document specifies the source-backed, fail-closed plan mapper implemented for Issue #51. The mapper consumes synthetic ExtField-shaped rows and explicit stage/service/person/value context. It is not a Production adapter, a live quotation schema, a UI, or an Order serializer.

## Evidence and scope

The sanitized, one-page Production shape capture is recorded in [G4F_ACTIVE_ORDER_EXTFIELD_SCHEMA_SHAPE.md](./G4F_ACTIVE_ORDER_EXTFIELD_SCHEMA_SHAPE.md): 32/32 tenant-scoped enabled `order` mobile-detail rows were returned by the previously authorized single query. The current stage counts are 9 `placeOrder`, 10 `submitOrder`, and 13 unknown; the shape projection classified 26 generic type-level controls, 3 presentation gaps, and 3 unsupported special controls. This is tenant-wide field-definition evidence only—not the effective schema for a ServiceAppointment, workflow node, service type, or person type. No further Production/Beta request was made for Issue #51.

R1 source is pinned to `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`; backend source is pinned to `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`. Relevant R1 locations in `business/subpackages/order/placeOrders.vue`:

- `getFields()` stage and context filters: lines 3618–3672.
- conditional rendering: lines 31–38 and 4447–4459.
- `required` / dispensable validation: lines 3835–3860.
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
| `showField/showValue` absent | Unconditional visibility | Source metadata has no condition pair. |
| `showField/showValue` matched with same-typed string/number/boolean | Runtime `equals` expression may be represented | Expression is finite and strict-equality-safe for the supplied pair. A nonmatching condition is filtered as currently hidden. |
| Conditional dependency missing, malformed pair, object/array operand, or cross-type coercion | Blocked | R1 uses loose `==`; the mapper does not guess coercion. This is a safety subset, not a claim of full R1 parity. |
| `required` exactly represented by `'1'`, `1`, or `true` | Required | These encodings preserve R1 `required == '1'` truth for supported primitives. |
| `required` represented by `'0'`, `0`, or `false` | Optional | Other encodings remain unknown and block an ordinary candidate. |
| `dispensableField/dispensableValue` matched safely | Requiredness becomes optional for this evaluated plan | Mirrors R1 validation bypass. Unresolved or coercive conditions block; a nonmatch preserves the original requiredness. |

Caller context must be authoritative and explicitly supplied. This mapper itself does not look up or infer work-order stage, service type, person type, or field values.

## Row identity, schema projection, and value preservation

`rowId` is the stable ExtField definition identity; `valueKey` is the `Order.exts` business key. Multiple distinct rows may share one value key and remain separate in `rows`/`FormFieldSchema.fieldId`. Duplicate row identities block. If rows in the same effective stage/context share one value key but declare conflicting control types—including a special control without a generic schema—the conflicting rows block rather than silently selecting one interpretation.

The mapper exports:

- `createOrderExtFieldEffectivePlan(rows, context)`: returns per-row `eligible` / `filtered` / `blocked`, mapping evidence (`SOURCE_VERIFIED`, `RUNTIME_INFERRED`, `BLOCKED`), ordinary `FormFieldSchema` candidates, provider/special-control diagnostics, and `liveRuntimeReady: false`.
- `classifyOrderAreaPath(value)` and `orderAreaPathFromPickerValues(value)`: typed blank/partial/complete/invalid three-code path helpers; they only retain supplied code/value entries and never fetch a dictionary or fabricate a missing code.
- `restoreOrderExtFieldValues(existingExts, plan)`: separates values mapped to current ordinary candidates from opaque unmapped/filtered/blocked values in in-memory read/edit state.
- `projectEligibleOrderExtFieldValues(plan, values)`: a pure synthetic projection of eligible keys only. It is not called by a command or serializer. Unknown old keys remain outside this projection.

No persistence, network, workflow, or UI side effect exists in this module.

## Control and provider boundaries

| Control family | Plan behavior | Why it is not live-ready |
| --- | --- | --- |
| Ordinary recognized Dynamic Form types | Candidate `FormFieldSchema` only after applicability, requiredness, config, and capability checks; marked `RUNTIME_INFERRED` | No quotation UI or `Order.exts` writer is connected. Numeric normalization/value-shape parity remains unverified. |
| `select` / `radio` / `checkbox` / `cascade` | A missing provider blocks. A configured finite code/cascade provider is diagnosed as `configured_not_fetched` and the row remains blocked in this slice. Checkbox candidate semantics retain `multiple: true`; with no verified provider, no schema is emitted and no scalar fallback occurs. | The capture proves provider metadata is configured, not option values, provider scope, or the correct source. No provider request is made. |
| `bizSelect`, arbitrary `requestUrl`, `evaluate`, or unknown config keys | Blocked | No arbitrary endpoint, script, expression, or dynamic command is executed. |
| `area` | Separate blocked `area` capability with a three-code path contract | R1 is a Province/City/County selector. Dictionary source, current applicability, and platform interaction are not verified; it is not promoted to generic `FormFieldSchema` support. |
| `button` | Separate `button` special action, `BLOCKED`; `requiredness=not_applicable`; never a field schema | R1 can navigate or invoke `commonEvent`. Configuration cannot execute an action or become a value. |
| `file` / `image` | Separate blocked media capability; required rows are required blockers | Generic type recognition does not prove Order upload, restore, or `Order.exts` URI semantics. R1 converts file arrays to comma-separated URLs on write. |
| `gap` | Presentation-only row; never submitted as a field | R1 gap markup is not generalized to arbitrary HTML in this plan. |
| `switch` | Blocked pending value/default parity | R1 uses active/inactive values `'1'`/`'0'` and applies a submit-time default; current Runtime uses booleans. No silent conversion is inferred. |

`requiredBlockerRowIds` is diagnostic only. Any blocked applicable row remains visible in `blockedRowIds`; no UI or completion gate consumes these diagnostics yet.

## Synthetic regression coverage

`tests/g4f/order-extfield-effective-plan.test.ts` uses synthetic rows and values only. It covers exact stage isolation, service/person applicability and missing context, unknown stages, row identity versus shared value keys, duplicate/conflicting identities, hidden versus unsupported conditional expressions, dispensability, equality/coercion behavior, typed area path handling, button non-execution/non-projection, required media blocking, unsupported/missing/unfetched providers, and opaque legacy `Order.exts` preservation with projection exclusion.

The tests do not import or parse the captured Production rows and do not exercise a live endpoint. The tenant shape document remains the only persisted Production schema evidence.

## Remaining UNKNOWNs and gate

1. Exact effective rows for any concrete active work order and `placeOrder`/`submitOrder` context, including service/person values.
2. Provider option contents, identity, and source scoping for all code/cascade definitions.
3. `area` dictionary source, code-path completeness rules, and actual stage applicability.
4. Whether the observed `button` row is applicable and which explicitly allowlisted business action, if any, it should represent.
5. Order-specific media upload, restore, and persisted `Order.exts` value shape.
6. Actual prior Order `exts` values and edit/round-trip behavior; preserving unknown keys here is only a pure in-memory invariant.
7. Numeric and remaining generic control value parity at a real UI/serializer boundary.

Therefore: tenant schema shape is captured; the effective form is still `UNKNOWN`; the mapper is a source-backed pure plan only; no live quotation Runtime, UI, provider, or serializer is ready or connected. Any later live/schema/provider read and any Order write requires its own explicit authorization and gate.

## Verification and safety

Issue #51 verification is synthetic/local only. Production/Beta login, API calls, Mongo access, role changes, customer Order reads, option-provider requests, uploads, quotation mutations, and workflow commands are outside scope and were not performed. Existing quotation composition, price, workflow, and write boundaries are unchanged.
