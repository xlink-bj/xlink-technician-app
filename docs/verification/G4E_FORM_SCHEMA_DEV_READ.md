# G4-E Form Schema — Development Read Snapshot

Status: development read evidence only; not a production schema registry.  
Repository: `xlink-bj/xlink-technician-app`  
Branch: `rebuild/g4e-onsite-inspection`

## Purpose

This record establishes how the Technician application obtains the real
dynamic-form shape. It is a shape-only snapshot from a read-only development
database check on 2026-09-17. It contains no form values, customer data,
tenant/session/token material, media references, or raw response payloads.

The exact active form for a Beta/Production technician must still be confirmed
through an authenticated read using the same Adapter path. This development
observation is evidence for field normalization and capability decisions, not
a license to infer production behavior.

## Read method

The production path is:

```text
authenticated session
  -> ApiReadTransport
  -> POST biz/extField/query
  -> Technician API Adapter
  -> FormDefinitionRead
  -> Dynamic Form Runtime
```

Field definitions are read with the R1-verified request shape:

```text
extId: <FormDefinitionId>
sortField: order
sortOrder: asc
is:state|integer#and: 1
_all: 1
```

When existing form data is needed, the read remains definition-scoped and
exact-record scoped:

```text
POST biz/extForm/query/<FormDefinitionId>
sortField: createTime
sortOrder: desc
is:_id|string#and: <FormDataId>
```

The local shape-only inspector is:

```text
pnpm run inspect:form-schema
```

It requires runtime-only environment variables
`XLINK_SCHEMA_API_BASE_URL`, `XLINK_SCHEMA_SESSION_REF`, and
`XLINK_SCHEMA_FORM_DEFINITION_ID`; `XLINK_SCHEMA_FORM_DATA_ID` is optional.
The inspector prints field names/types and value shapes only. It never writes a
response file or prints raw form values, cookies, tokens, or customer data.

## Development observation

The read-only development check found an active `InspectionForm` candidate
with 15 field rows. The numeric form identity is intentionally not persisted
in this document; it remains an opaque runtime input.

| Field key | Type | Required | Multiple | Option/provider | Conditional metadata |
| --- | --- | ---: | ---: | --- | --- |
| `part` | `cascade` | yes | no | `parts` | none; always visible |
| `village` | `text` | yes | no | — | `showType=3`, source `part`, preset source |
| `length` | `digit` | yes | no | — | `showType=3`, source `part`, preset source |
| `width` | `digit` | yes | no | — | `showType=3`, source `part`, preset source |
| `planeArea` | `digit` | yes | no | — | `showType=3`, source `part`, preset source |
| `inspectionSOP` | `request` | no | no | custom config | custom widget metadata |
| `inspectionContent` | `select` | no | yes | no verified provider in this read | multi-value |
| `requirement` | `text` | no | no | — | none |
| `isQualified` | `select` | no | no | `qualified` | none |
| `reason` | `text` | no | no | — | `showType=3`, source `isQualified`, preset source |
| `otherReason` | `text` | no | no | — | none |
| `serviceGoods` | `bizSelect` | yes | yes | `projPackage` | custom config |
| `suggest` | `text` | yes | no | — | none |
| `surveyDrawing` | `file` | yes | no | — | `showType=3`, source `part`, preset source |
| `reformDate` | `date` | no | no | — | none |

The observed data records expose business-field keys at the record root, with
an `exts` object also present. Observed value shapes include scalar strings,
arrays and nested inspection-related arrays. Values themselves are excluded
from this record.

## Engineering decisions

- `FormDefinitionRead.id` is always the requested form identity for field-row
  responses; a field row `_id` is never treated as the form identity.
- The Adapter now carries `multiple` so a multi-value `select`/`bizSelect`
  cannot be rendered through scalar `AppChoiceGroup` semantics.
- `record.exts.showValue` is part of the verified visibility evidence. The
  Adapter normalizes it without exposing `frontEndConfig` or `nodeDef` to Vue.
- `showType=1` remains unconditionally visible unless an explicit legacy
  `frontEndConfig.showField` expression exists. `showType=3` remains a bounded
  value condition and does not use array position.
- Unsupported `request`, custom, cascade and multi-value controls remain
  explicit capability boundaries until a correct Action Content control and
  provider contract are verified.
- The inspection workspace now resolves the observed 15-row shape through the
  normal Mock read/Adapter/Runtime path. The former four-field fixture remains
  available as a low-level synthetic regression fixture, but is not the
  default simulator form. Unsupported fields are intentionally blocked rather
  than silently presented as executable controls.

## Authority and remaining unknowns

- R1 is the authority for endpoint/request and legacy dynamic-form semantics.
- The development read is evidence of one development form family only.
- R2 remains presentation/IA reference only.
- Beta/Production active form membership, complete option providers, custom
  widget contracts, server validation, and media persistence remain UNKNOWN.
- No write command, upload, or production endpoint was executed for this
  snapshot.
