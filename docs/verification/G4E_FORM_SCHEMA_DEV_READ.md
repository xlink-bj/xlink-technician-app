# G4-E Form Schema — Current Beta Contract Observation

Status: current Beta read evidence; not a Production schema registry.
Repository: `xlink-bj/xlink-technician-app`  
Branch: `rebuild/g4e-onsite-inspection`

## Purpose

This record establishes how the Technician application obtains the real
dynamic-form shape. The machine-readable contract is committed at
`contracts/beta/inspection/current.json`. It is a sanitized, deterministic
snapshot from an authenticated read-only Beta observation on 2026-09-17. It
contains no form values, customer data, tenant/session/token material, media
references, or raw response payloads.

Dev and Beta are the same development environment for this slice. Therefore
the active runtime observation is the current Beta contract authority for
development. Production parity remains UNKNOWN and is not asserted here.

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

The repeatable read-only contract inspector is:

```text
pnpm run inspect:inspection-contract
```

It requires runtime-only `XLINK_SCHEMA_API_BASE_URL` and
`XLINK_SCHEMA_SESSION_REF`. A deterministic work-order read can be selected
with `XLINK_SCHEMA_WORK_ORDER_ID` (or `--work-order`) and an ambiguous active
node can be selected with `XLINK_SCHEMA_INSPECTION_NODE_ID` (or `--node`). The
inspector discovers the active node and its `formDefinitionId`; it never uses a
historical ID, page title, field name, or Mock fixture as a fallback.

The inspector performs only authenticated POST reads. It can write a
sanitized candidate only when `XLINK_SCHEMA_OUTPUT_FILE` or `--output` is
explicitly supplied. It never prints or persists raw form values, cookies,
tokens, tenant identifiers, customer data, or media references.

The committed snapshot can be checked without Beta credentials:

```text
pnpm run check:inspection-contract
```

In a controlled authenticated Beta environment, append `--live` (or set
`XLINK_SCHEMA_CHECK_LIVE=true`) to capture the current sanitized contract and
compare its deterministic fingerprint with the committed snapshot. CI does
not require Beta credentials.

## Local Beta login and capture

The repository now includes the same R1 login flow used by the existing
business tooling. It posts `method`, `phone`, `code`, and `tenantId` to
`index/phoneLogin.do`; the returned opaque `data.token` is held in memory and
sent as `Cookie: JSESSIONID=...` for subsequent read-only requests. The CLI
only permits the Beta host and never prints or persists the session value.

Provide credentials through the shell environment, not through a committed
file or chat message:

```text
XLINK_BETA_PHONE=<Beta account>
XLINK_BETA_CODE=<Beta test code>
pnpm run inspect:inspection-contract:beta -- --work-order=<optional-safe-id>
```

Password login is also supported with `XLINK_BETA_LOGIN_METHOD=password` and
`XLINK_BETA_PASSWORD`. `--phone`, `--code`, `--password`, `--tenant`,
`--base-url`, `--work-order`, `--node`, and `--output` are available for a
controlled invocation. The command performs login and contract discovery in
one process, so the Session never needs to be copied into
`XLINK_SCHEMA_SESSION_REF`.

## Development observation

The current Beta observation found an active Inspection form family with 15
field rows. The numeric form identity is intentionally not persisted; the
snapshot uses a deterministic opaque alias and preserves relationships only.

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
- The verified R1 code provider (`i/code/selectCode.do`) and multistage
  provider (`i/code/selectMultistageCode.do`) now resolve `qualified` and
  `parts` through the Adapter before the form reaches Runtime. Cascade paths
  retain their hierarchy, and option-bearing checkbox/multi-value select
  fields use array-valued controls rather than scalar choices.
- `request`, business-record `bizSelect` without a verified record provider,
  and multi-value fields without an option source remain explicit capability
  boundaries. They are not rendered as ordinary text inputs and still block
  completion until their provider/control contract is verified.
- The inspection workspace now resolves the observed 15-row shape through the
  normal Mock read/Adapter/Runtime path. The former four-field fixture remains
  available as a low-level synthetic regression fixture, but is not the
  default simulator form. Unsupported fields are intentionally blocked rather
  than silently presented as executable controls.

## Authority and remaining unknowns

- R1 is the authority for endpoint/request and legacy dynamic-form semantics.
- The current Beta read is evidence of one active form family only.
- R2 remains presentation/IA reference only.
- Production active-form membership/parity, complete business-record and
  custom-widget providers, server validation, and media persistence remain
  UNKNOWN.
- No write command, upload, or production endpoint was executed for this
  snapshot.

## Mock source of truth

The default observed Inspection Mock is mechanically derived from
`contracts/beta/inspection/current.json` by
`src/adapters/api/mock/inspection-contract.ts`. The Adapter still receives
backend-shaped field rows and provider responses, so the runtime path remains:

```text
sanitized Beta snapshot
  -> generated Mock raw response
  -> existing Adapter
  -> Dynamic Form Runtime
  -> Action Workspace
```

`parts` and `qualified` are VERIFIED provider families in this snapshot.
`projPackage`, `inspectionSOP`, and the provider for the multi-value
`inspectionContent` field remain explicitly UNKNOWN; they have no fabricated
options and continue to block completion when required by the Runtime.
