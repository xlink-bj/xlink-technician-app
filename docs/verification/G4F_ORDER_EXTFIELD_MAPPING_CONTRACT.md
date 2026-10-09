# G4-F Order ExtField Mapping Contract (Proposal Only)

**Status:** `DESIGN_TEST_ONLY / ACTIVE_SCHEMA_UNKNOWN / NOT_CONNECTED`

This document defines a bounded mapping proposal for a future `placeOrder` / `submitOrder` Order ExtField adapter. It does not add a schema reader, runtime adapter, UI integration, or Order serializer. The fixture at `tests/fixtures/g4f-order-extfield-contract.json` is synthetic and is not evidence of an active tenant configuration.

## Evidence boundary

The proposal is based on the checked-in R1 source revision `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` and backend revision `5fc008d32e771205260f120621c1c4fc62d0824e`, as summarized in `G4F_P0_CONTRACT_RESOLUTION.md`. R1 selects enabled `colName=order` rows for mobile-detail `showList=4`, separates `frontEndConfig.showType=placeOrder` and `submitOrder`, applies service-type filtering to both and person-type filtering to `submitOrder`, uses `showField/showValue` and `dispensableField/dispensableValue`, and stores values under `Order.exts` keys. This is source evidence for R1 behavior only. The current active tenant's rows, option providers, and backend pre-script remain unknown.

No Production/Beta login, API call, Mongo access, schema capture, or business mutation was performed for this contract.

## Proposed typed projection

The eventual adapter should keep field-row identity separate from the `Order.exts` value key and should preserve the raw business contract only where it can be represented safely:

```ts
type OrderActionStage = 'placeOrder' | 'submitOrder'

interface OrderExtFieldProjection {
  readonly fieldId: string        // stable ExtField row identity
  readonly valueKey: string       // ExtField.name / Order.exts key
  readonly stage: OrderActionStage
  readonly schema: FormFieldSchema // finite shared Dynamic Form Runtime schema
  readonly applicable: 'verified' | 'not_applicable' | 'unsupported'
  readonly visibility: 'unconditional' | 'mapped' | 'unsupported'
  readonly dispensability: 'unconditional' | 'mapped' | 'unsupported'
  readonly provider: OptionProviderDescriptor | null
  readonly capability: 'supported' | 'unsupported'
  readonly unsupportedReason?: string
}
```

This is a contract sketch, not a checked-in production type or mapper. `FormFieldSchema.fieldId` must remain distinct from `valueKey`; repeated ExtField names may represent different row/stage/configuration instances and must not be collapsed by name alone.

## Mapping rules and fail-closed behavior

| Raw metadata | Proposed interpretation | Unknown or unsupported case |
| --- | --- | --- |
| `colName`, `state`, `showList` | Candidate rows must be `order`, enabled, and include mobile-detail code `4`. | Malformed applicability metadata is not silently treated as applicable. |
| `frontEndConfig.showType` | Stage discriminator: exactly `placeOrder` or `submitOrder`; it is not a visibility operator. | Missing/other stage is excluded from these two stages or diagnosed; never guessed from labels. |
| `serviceType`, `personType` | Apply only from verified Work Order/Order context. R1 applies service type to both stages and person type to submit stage. | Missing context does not broaden the candidate set. |
| `required` | Map only after the active wire representation is validated. Required visible unsupported fields block readiness. | Unknown flag encoding is a diagnostic, not optional-by-default. |
| `showField` / `showValue` | May map to a finite Dynamic Form visibility expression only when operand types and equality semantics are proven compatible. | R1 uses JavaScript loose equality; coercive pairs cannot be silently rewritten to strict Runtime equality. Mark unsupported until a typed compatibility rule is accepted. |
| `dispensableField` / `dispensableValue` | Resolve with the same typed-condition discipline, then provide the Runtime's caller-resolved required override. | Unknown/malformed expression blocks the affected required field; do not infer from labels. |
| `type=code` / `type=cascade`, `valueOption` | Reuse an existing finite option-provider kind only when the named provider is verified and its normalized value shape is known. | Missing/unknown provider makes a required field unsupported. No fabricated options. |
| `bizSelect.requestUrl`, `evaluate`, scripts, arbitrary `frontEndConfig` | Treat as untrusted configuration, not executable instructions. | No arbitrary URL fetch, expression execution, server script, formula, or generic text fallback. Required unsupported fields block. |
| Existing `Order.exts` | Restore ordinary values by `valueKey`; preserve unknown keys in read/edit state. | Do not erase values because a field is hidden, not loaded, or unsupported. Do not serialize unsupported fields to a live command. |

The shared Dynamic Form Runtime is the only proposed renderer/validator for ordinary supported controls. Quotation composition, package layers, direct Material SPU/SKU, and specialized selectors remain in their dedicated domain experience.

## Synthetic contract fixtures and tests

`tests/fixtures/g4f-order-extfield-contract.json` uses only synthetic keys and values. It includes both stages, a repeated business `name` with distinct row identities, service/person applicability metadata, conditional visibility and dispensability metadata, code/cascade provider references, an untrusted `bizSelect` route, an untrusted formula, and an unknown prior `Order.exts` key.

The tests assert the fixture remains explicitly non-live, preserves the named metadata, and that a synthetic supported ordinary field can use the existing finite `normalizeSubmission()` contract while an unknown prior `exts` key remains preserved by the *proposed overlay invariant*. The test is not an active-schema mapper or Order serializer test. No production behavior is claimed.

## Gate before implementation

Before connecting this proposal, a separately authorized read must establish the active tenant `order` ExtField shape and providers. A later implementation must add adapter-level tests for exact stage/context filtering, row identity vs. value key, supported/unsupported visibility and dispensability, option-provider resolution, `Order.exts` restore/preservation, and serialization exclusion for unsupported fields. Until then, active-schema support and quotation readiness remain `UNKNOWN`; no live UI/command wiring is authorized by this proposal.
