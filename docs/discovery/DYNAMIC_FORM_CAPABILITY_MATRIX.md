# Technician Dynamic Form Capability Matrix

## Evidence boundary

This G1-C matrix consumes G1-B findings `LE-019` through `LE-026` and does not
rescan R1 from zero. It uses committed static evidence only:

| Source | Commit | Evidence used |
| --- | --- | --- |
| R1 | `6ada6b5375324bfcd09ca7c569b96a4ff328173f` | `workOrderFormReadContract.js`, `editableFieldWriteContract.js`, `resources/js/common.js`, Technician form/workflow pages, and inspection renderers. |
| R2 | `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185` | Survey/form raw sources and code-label lookup evidence. |
| R3 | `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` | Committed historical form/API specs only. |
| New repository | `a748f4847135995fa114dd15eead3be70df75a7e` | Accepted G1-B merge baseline. |

No XLink API, production, form-write, upload, or business mutation call was
made. R1, R2, and R3 remain read-only. Sensitive tenant/customer/role values
are not reproduced.

## G1-C summary

- Form capabilities/widgets evaluated: **12**
- Remaining `UNKNOWN` capability decisions: **6**
- Fixed-form exceptions retained behind explicit handling: **5**
- Confirmed form DROP candidates: **0**; G1-B global menu DROP candidates `LE-005` and `LE-006` are outside the form runtime.
- `BLOCKS_G2`: **0**

The UNKNOWN count is the number of unique unresolved questions in the register
below; multiple fields/widgets can depend on the same question.

The V1 runtime is bounded. It is not a general-purpose low-code platform and
must fail explicitly for unsupported field types, option providers, or custom
widgets.

## Capability matrix

| ID / G1-B link | Field/widget capability | Legacy representation | Option/value source | Visibility behavior | Required/read-only behavior | Serialization behavior | Fixed-ID dependency | V1 requirement | Target boundary | Disposition | Confidence / unresolved question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DF-001 / LE-018 | Field-definition and form-data reads | `biz/extField/query`; `biz/extForm/query/{formDefId}` | `extId`, `formDefId`, field definitions | Schema controls field availability; form data is joined by form/data ID. | Field metadata is carried in the field definition; exact precedence is defined below. | Preserve backend field names and data IDs; adapter owns request paths. | Form ID is required; `3285058246984486156` uses `/biz/extForm/findByIdWithWorkflow`. | Required for all dynamic inspection/order forms. | API Adapter + Form Runtime | Normalize paths; retain special read path behind adapter. | HIGH observed / active V1 form families still need confirmation. **UNKNOWN** |
| DF-002 / LE-019 | Ownership-filter exception | `notFilterBelongTo='1'` for `3285058246984486156` and `3721799436069914536` | No option source | Not a visibility rule; changes which records are readable. | Does not relax field state. | Preserve only as an explicit adapter policy with audit reason. | Two fixed form IDs. | Required only if these forms are active in V1. | API Adapter | Keep as named compatibility exception pending proof; do not generalize. | HIGH observed / LOW intent. **UNKNOWN** |
| DF-003 / LE-020 | Fixed form/node action behavior | Form IDs `2522989775781119510`, `7971040108398070730`; node types `forms`, `repeat`, `subflows`, `placeOrder` | Node/form metadata | Node state/type controls whether form completion/add/repeat actions appear. | Workflow/node state can make a form read-only or complete-only. | Form submit carries node/form identity; action is a Workflow Runtime command. | Fixed IDs and node types. | Preserve appointment/inspection/quotation actions only where active evidence confirms them. | Workflow Runtime + Form Runtime | Retain behind explicit form-action policy; no ID-driven screen branching. | HIGH observed / active V1 set is **UNKNOWN** |
| DF-004 / LE-023 | `workType` option provider | Field name exactly `workType` | Provider `workTypes` | Visibility consumes the normalized value. | Normal field state rules apply. | Serialize selected code/value expected by backend; provider label never replaces value. | Field-name special case, no form ID required. | Required for contract/signing forms using `workType`. | Form Runtime + API Adapter | Retain as a named provider mapping. | HIGH |
| DF-005 / LE-021, LE-023 | `valueOption`, code, and cascade providers | `valueOption`; `frontEndConfig`; `codecfg_`; `cascadeCode_` | `cascade` uses `cascadeCode_<valueOption>`; other code-backed fields use `codecfg_<valueOption>`; inline list is local fallback. | Option resolution must complete before dependent visibility evaluates. | Unknown/missing provider is an explicit unsupported state, not an empty successful choice. | Serialize code/value, not display label or provider key. | `valueOption` and field type. | Required for select/cascade/bizSelect/radio/checkbox in V1. | Form Runtime + API Adapter | Normalize provider precedence in one runtime service. | HIGH observed / precedence **UNKNOWN** |
| DF-006 / LE-022 | Conditional visibility | `showField`, `showValue`, `showFieldPreset`, `exts.showValue`, `$exist` | Depends on another normalized field. | Supports scalar, dotted/nested, arrays, choice arrays, cascade values, and existence tests. | Hidden fields are not user-required and are excluded from interactive validation. | Hidden values are preserved only if the backend contract requires them; otherwise omitted by serializer policy. | None; schema config drives it. | Required for conditional inspection/quotation fields. | Dynamic Form Runtime | Implement bounded evaluator with deterministic precedence. | HIGH behavior / exact backend expectations **UNKNOWN** |
| DF-007 / LE-022 | Visibility evaluation precedence | Legacy compatibility branches in `common.js` | Current form model, then `exts` fallback where declared | Proposed deterministic order: normalize field path → evaluate `$exist` → evaluate dotted/scalar/array/cascade match → apply preset/ext fallback → visible/hidden. | Visibility gates required/read-only validation. | Do not serialize evaluator internals. | None. | Required; no implicit branch order. | Dynamic Form Runtime | Adopt explicit order below; unsupported expression fails explicitly. | MEDIUM target decision / verify with representative forms. **UNKNOWN** |
| DF-008 / LE-024, LE-026 | Required/read-only state precedence | `required`, `frontEndConfig`, node/workflow state, fixed-form policy | No option source. | Hidden means not interactively required. | See the explicit precedence table below. Workflow/node read-only is never weakened by schema/runtime settings. | Read-only values may be submitted unchanged when editing existing data; new required values must validate before submit. | Fixed-form override only when named and active. | Required for safe form editing and display. | Dynamic Form Runtime + Workflow Runtime | Centralize monotonic read-only and explicit required override rules. | MEDIUM target decision / exact Legacy precedence **UNKNOWN** |
| DF-009 / LE-024, LE-026 | V1 generic field/widget subset | Observed `text`, `textarea`, `phone`, `IDNumber`, `number`, `digit`, `date`, `time`, `datetime`, `select`, `bizSelect`, `cascade`, `radio`, `checkbox`, `switch`, `rate`, `file`, `image`, `area` | Provider-dependent for choice/media fields. | Generic fields use the visibility evaluator. | Schema plus target precedence applies. | Normalize text/phone trimming; integer/decimal validation; preserve code arrays and media references. | No fixed ID for generic support. | **Yes:** these are the bounded V1 generic subset evidenced in Technician inspection/detail paths. | Form Runtime | Implement only this subset; unsupported types fail explicitly. | HIGH inventory / final per-form usage **UNKNOWN** |
| DF-010 / LE-026 | Fixed/custom widgets and actions | `title`, `gap`, `button`, `scan`, `addItem`, `pushItem`, `sort`, `evaluate`, `dialog`, `data`, `canvas`, `bgImage`, custom HTML/config | `frontEndConfig` and action-specific providers | Usually rendered as fixed controls or action blocks, not ordinary fields. | Often controlled by node/form state and platform availability. | May invoke workflow, scan, media, or local UI commands rather than form serialization. | Often field type and `frontEndConfig`; some are platform-specific. | Generic V1 runtime does **not** promise all custom widgets; only explicitly selected slices may retain them. | Form Runtime + Platform/Workflow Adapters | Treat as fixed exceptions; reject unsupported custom widgets explicitly. | HIGH observed / V1 inclusion **UNKNOWN** |
| DF-011 / LE-024 | Input normalization, validation, and submit serialization | `text/phone` trim; `number` digits; `digit` decimal; `dataStr` form upsert | Field type and schema metadata. | Validate only visible/editable fields, with explicit handling for existing read-only values. | Required/read-only precedence applies before validation. | Runtime value → field-name keyed payload → `dataStr: JSON.stringify(params)` for `biz/extForm/upsert/{formDefId}`. | Form ID and backend write path. | Required for form writes, but write envelope remains G4 verification. | Form Runtime + API Adapter | Keep validation/runtime model separate from backend serializer. | HIGH local behavior / backend write schema **UNKNOWN** |
| DF-012 / LE-025 | Survey window measurement rule | Form `7971040108398070730`, `part[0]='3'`, field names `length`/`width` | Derived area is `length × width`, rounded to two decimals; zero yields `0`, incomplete input yields empty. | R1 `resources/technician/editableFieldWriteContract.js:4,14-43`; R2 survey evidence corroborates measurement domain, not exact trigger. | Preserve area semantics for the active survey path without making the ID/index a general rule. | Store normalized numeric area in the named backend field; validate numeric inputs before deriving. | Fixed form ID, part value, and field names. | Required only for the survey window path; otherwise unsupported rule is ignored. | Form Runtime + declarative rule registry | Convert to a declarative rule with explicit active-form scope. | HIGH behavior / active V1 scope **UNKNOWN** |

## Option-provider normalization

The target provider precedence is explicit and deterministic:

| Precedence | Condition | Provider / result | If unavailable |
| ---: | --- | --- | --- |
| 1 | Field name is `workType` | `workTypes` | Explicit unsupported-provider error; do not fall through to a generic code table. |
| 2 | Field type is `cascade` and `valueOption` is present | `cascadeCode_<valueOption>` | Mark field unsupported and retain raw value only for read-only display. |
| 3 | A code-backed `valueOption` is present for select/bizSelect/radio/checkbox | `codecfg_<valueOption>` | Explicit lookup error; no label guessing. |
| 4 | `frontEndConfig.list` or equivalent inline options are declared | Local schema options | Use only when the schema explicitly owns the options. |
| 5 | None of the above | No provider | Render as unsupported or read-only according to policy; never silently submit labels. |

The API Adapter normalizes provider envelopes and code values. The Dynamic
Form Runtime owns provider selection, caching scope, and field value shape.
The UI does not know `codecfg_` or `cascadeCode_` implementation keys.

## Explicit field-state precedence

This is the single V1 precedence table. It is a target contract derived from
the observed Legacy inputs; it is not a claim that every Legacy screen applied
the same order.

| Priority | State/input | Rule | Effect |
| ---: | --- | --- | --- |
| 1 | Unsupported schema/widget or unresolved option provider | Fail explicitly with a capability error. | No editable control and no silent submission. |
| 2 | Conditional visibility | Evaluate visibility before required/read-only validation. | Hidden fields are not interactively required and are omitted unless preservation policy says otherwise. |
| 3 | Workflow/node read-only | Completed, closed, non-handler, or node policy can force read-only. | Highest authority; cannot be weakened by form metadata or runtime overrides. |
| 4 | Active fixed-form override | Apply only for a named, reviewed form/node exception. | May make a field read-only or required; never applies by numeric ID alone without an active registry entry. |
| 5 | Schema `readOnly` | Backend field metadata says the field is read-only. | Field is display-only. |
| 6 | Runtime read-only override | Runtime may add restriction from local state. | Monotonic: can only make a field more restricted. |
| 7 | Required source | `fixed-form override ?? runtime required override ?? schema required`. | Determines requiredness only if visible and editable. |
| 8 | Validation and serialization | Validate normalized editable values, then serialize. | Read-only existing values may round-trip; hidden/unsupported values follow explicit preservation policy. |

Effective rules:

```text
visible = evaluateVisibility(schema, formData)
readOnly = workflowReadOnly OR fixedFormReadOnly OR schemaReadOnly OR runtimeReadOnly
required = visible AND NOT readOnly AND (fixedRequired ?? runtimeRequired ?? schemaRequired)
```

Any future exception must enter the registry with an owner, evidence path,
and expiry/review condition. It must not be added as an inline component check.

## Serialization and validation boundary

| Stage | Responsibility | Contract decision |
| --- | --- | --- |
| Input model | Platform controls provide raw values and media references. | Platform adapters convert MP/App control events into a common input event. |
| Normalized runtime value | Form Runtime applies field-type normalization. | Trim `text`/`phone`; validate integer `number`; validate decimal `digit`; preserve code arrays/cascade paths and media references. |
| Validation | Form Runtime evaluates visibility, effective required/read-only state, and field validators. | Unsupported type/provider and invalid editable value fail explicitly. |
| Submission model | Form Runtime maps values to backend field names and identity fields. | No display labels, provider keys, or UI-only state are serialized. |
| Backend payload | API Adapter selects endpoint/path and envelope. | Existing Legacy evidence uses `biz/extForm/upsert/{formDefId}` with `dataStr`; exact write schema remains a G4 verification item. |

## Fixed exceptions retained and DROP candidates

Five fixed-form exceptions remain explicit:

1. `3285058246984486156` alternate read path and ownership behavior.
2. `3721799436069914536` ownership-filter exception.
3. `2522989775781119510` appointment form action/calendar coupling.
4. `7971040108398070730` survey/quotation action and measurement rule.
5. Fixed custom widgets/actions such as `scan`, `canvas`, `addItem`, and `pushItem` when a reviewed V1 slice requires them.

No new form DROP candidate is confirmed by this matrix. The G1-B global
menu-route candidates `LE-005` and `LE-006` remain DROP candidates and are not
part of Dynamic Form Runtime scope.

## Remaining UNKNOWN register

| ID | Unknown | Why static evidence is insufficient | Owner gate |
| --- | --- | --- | --- |
| U-DF-01 | Which fixed form IDs are active in Technician V1. | Static call sites show behavior but not current product/configuration membership. | G4 form-slice selection |
| U-DF-02 | Whether ownership bypass is still required for the two fixed forms. | `notFilterBelongTo` is observed but its backend/business rationale is not. | G3 API Adapter contract / G4 guarded read |
| U-DF-03 | Exact option-provider precedence when multiple config sources coexist. | Legacy helpers initialize code/cascade options, but no accepted matrix of conflicting sources exists. | G3 Dynamic Form Runtime contract |
| U-DF-04 | Full Legacy read-only/required precedence across workflow, schema, and fixed forms. | Static branches are distributed across renderers and save paths. | G3 runtime contract and G4 form fixtures |
| U-DF-05 | Final V1 inclusion of custom widgets/actions and platform-backed controls. | The source exposes many historical types beyond the core field subset. | G1-D platform matrix and G4 slice selection |
| U-DF-06 | Exact backend write envelope and validation/idempotency semantics. | No form write was executed by policy; A2 read evidence does not prove writes. | G4 guarded form-write verification |

## G2 Architecture Input

- Dynamic Form Runtime owns a bounded schema interpreter, option-provider selection, visibility evaluation, state precedence, field validation, and normalized values.
- API Adapter owns form read-path variants, ownership flags, code/cascade envelope normalization, form/node identity mapping, and `dataStr` serialization.
- Fixed form IDs are registry entries with evidence and owner gates, not inline component switches. Tenant, customer, and role literals are never encoded in the form runtime.
- Generic V1 support is limited to the evidenced field subset; custom widgets require explicit slice approval and unsupported behavior fails explicitly.
- Platform-independent form semantics stop at input events and media references; MP/App camera, upload, calendar, and permission work remains in Platform Adapters.
- `BLOCKS_G2 = 0`; the six UNKNOWNs affect G3/G4 implementation and verification, not the choice of Vue 3 / uni-app, adapter, or bounded Dynamic Form Runtime boundaries.
