# G4-E On-site Inspection / Inspection Form Evidence

Status: Beta contract discovery + Mock fidelity hardening — awaiting review
Repository: `xlink-bj/xlink-technician-app`  
Branch: `rebuild/g4e-onsite-inspection`  
Baseline before this hardening pass: `21df8a0714a379b99849012029c4ed3fe4366ec8`
Issue: `#21`

This document combines the accepted Phase 0/1 evidence with the bounded Phase
2 implementation record below. It does not claim an arrival/start-inspection
workflow, a complete production inspection schema, durable offline media, or
any live mutation.

## Evidence boundary and authority

| Source | Revision used | Authority in this checkpoint |
| --- | --- | --- |
| R1 `xlink-business-jishi-3.0` | `6ada6b5375324bfcd09ca7c569b96a4ff328173f` | Workflow semantics, API/form wire behavior, permissions, writes, media and outcomes. |
| R2 `xlink-business-3.0` | `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185` | UX/IA reference only; never used as business-dictionary or authorization evidence. |
| New App | `0a46d8482b878b2d04f08894da54f5b77fb56214` | Target architecture and currently accepted reusable boundaries. |

The R1 and R2 worktrees were read-only during this scan. This document uses
sanitized identifiers and omits customer, tenant, phone, address, session and
token values.

## 1. Executive conclusion

R1 provides strong evidence for the following bounded facts:

- The Legacy inspection detail reads a service-appointment record together
  with workflow and runtime nodes through
  `subpackages2/inspectionAppointment/inspectionAppointment.vue:getSAData`
  (`5055-5069`).
- Runtime form fields are read from `biz/extField/query` and form data is read
  from `biz/extForm/query/{formDefId}` in
  `inspectionAppointment.vue:getFields` (`5542-5649`) and
  `getFormData` (`5656-5688`).
- Saving a dynamic form and completing a workflow node are separate backend
  calls in the Legacy flow: `biz/extForm/upsert/{formDefId}`
  (`5881-5886`) is followed by `workflow/process` (`6099-6126`) for the
  relevant non-save-only path.
- The strongest static candidate for an inspection form is form definition
  `3807435364983262382`, because the source applies inspection-specific photo
  limits and survey/inspection handling to it (`inspectionAppointment.vue:
  6971-6991`, `5890-5899`, `9431-9442`). This proves historical behavior at
  that call site, not that this is the complete active V1 form set.

The following remain UNKNOWN and block implementation claims:

- whether `上门`/arrival and `开始勘察` are separate workflow mutations or
  merely labels around the inspection action;
- the active production workflow node/form membership and complete field
  schema for Inspection;
- exact server validation, authorization, idempotency and retry semantics for
  inspection writes;
- whether required inspection media must be recoverable while offline and,
  if so, the durable local-media contract;
- the authoritative post-submit workflow/status/next-action result.

Decision: **Phase 0/1 evidence is accepted. Phase 2 is limited to the existing
verified inspection-node boundary and leaves the UNKNOWNs below outside the
implementation.**

## 1A. Current Beta contract and Mock source of truth

The previously captured Beta form observation is committed as a sanitized
structural snapshot at:

```text
contracts/beta/inspection/current.json
```

The snapshot is authoritative for this development Beta form family only. It
contains a deterministic opaque form alias, field identity aliases, structural
metadata, provider contracts and value shapes. It contains no raw work-order,
form-data, customer, tenant, session, token or media values.

The repeatable read-only discovery command is:

```text
pnpm run inspect:inspection-contract -- --work-order=<safe-id>
```

It requires an explicit work-order identity and, when necessary, an explicit
workflow-node identity. It accepts only an active `repeat` Inspection node
with an explicit form definition; a generic `forms` node is not sufficient.
It then reads `biz/extField/query`, an exact existing FormData record when the
node exposes one, and only the evidenced provider endpoints. It never falls
back to list order, display labels, the Appointment/Rating form families, a
historical Inspection form ID, or Mock data. The local integrity/drift check
is:

```text
pnpm run check:inspection-contract
```

When a local Beta account is available, the repository can establish the
read Session itself using the R1-compatible phone login flow:

```text
pnpm run inspect:inspection-contract:beta
```

The command reuses the App quick-login configuration from the existing local
`.env.local`, including its non-production guard and `999999` default code.
No per-run phone or verification-code injection is used; no credential or
Session value is persisted.

The helper posts the verified `method`/`phone`/`code`/`tenantId` shape to
`index/phoneLogin.do`, keeps `data.token` in memory, and sends it as
`Cookie: JSESSIONID` for the subsequent read-only calls. It only permits the
Beta host. Password mode is available through
`XLINK_BETA_LOGIN_METHOD=password` and `XLINK_BETA_PASSWORD`. Credentials are
runtime inputs only and are not written to the repository.

The default observed Inspection Mock is generated from that snapshot by
`src/adapters/api/mock/inspection-contract.ts` and then passes through the
existing raw-response Adapter and Dynamic Form Runtime. There is no second
hand-authored 15-field Inspection schema.

Current provider status in the committed snapshot:

| Provider | Status | Disposition |
| --- | --- | --- |
| `parts` | VERIFIED | R1 multistage cascade response retained. |
| `qualified` | VERIFIED | R1 batch code response retained. |
| `projPackage` | UNKNOWN | No options fabricated; completion remains guarded. |
| `inspectionSOP` | UNKNOWN | Custom record contract not fabricated. |
| `inspectionContent` | UNKNOWN | Multi-value provider not fabricated. |

The local Beta login path was exercised successfully from `.env.local` on
2026-09-17 without temporary phone or verification-code injection. The
authenticated read-only session completed 20 sanitized work-order list/detail
reads. The bounded scan found five historical completed `repeat` Inspection
nodes but zero active `repeat` Inspection nodes with a form definition. The
result is therefore `NO_ACTIVE_BETA_INSPECTION_WORK_ORDER`: no current live
Inspection contract was captured in this pass. The inspector does not select
an arbitrary first work order, so the committed snapshot remains the previous
sanitized development observation and was not silently replaced by a
historical form. No live write, upload, phone call or production request was
made.

The Beta wrapper enforces the same read-only boundary before network access:
login, service-appointment detail/workflow reads, field definitions, exact
form data, and evidenced provider reads are allowlisted. Workflow process,
form writes, accept/order, upload/media, and unknown routes are blocked.
Provider verification is structural (`VERIFIED`, `PARTIAL`, or `UNKNOWN`),
not inferred from HTTP 200. In particular, `inspectionSOP` uses a dedicated
shape sanitizer and `inspectionContent` remains `UNKNOWN` until a real option
provider is evidenced.

## 2. R1 business sequence

### Verified source sequence

R1's current inspection page has this observable sequence:

```text
service-appointment read
  -> workflow/runtime-node read
  -> select a visible runtime node
  -> read field definition
  -> optionally read exact form data
  -> save form data
  -> optionally process/complete the workflow node
  -> reread workflow/detail state
```

The detail read and node filtering are in
`subpackages2/inspectionAppointment/inspectionAppointment.vue:getSAData`
(`5055-5142`). Field/data reads are in `viewForm`, `getFields`, and
`getFormData` (`5505-5537`, `5542-5688`). Form persistence is in `saveForm`
(`5730-5925`), and workflow completion is in `process` (`6009-6126`).

R1's list page performs an accept transition with `workflow/process` in
`subpackages2/inspectionAppointment/inspectionAppointments.vue:acceptClick`
(`1297-1335`). The list-to-detail navigation passes the work-order identity
to the detail route (`187-210`). This is evidence that acceptance is a
workflow command, not evidence of the later inspection sequence.

### Arrival and start-inspection decision

No active, named `arrive`, `到达现场`, `开始勘察`, `inspection start`, or
equivalent endpoint/action was identified in the scanned R1 inspection and
service-appointment sources. R1's `docs/modernization/API_CHARACTERIZATION.md`
also explicitly records that inspection-flow endpoints have no accepted spec
and were not exercised (`90-96`).

This is **not** evidence that such a mutation does not exist. It means the
source scan cannot distinguish these alternatives safely:

1. arrival is a distinct workflow transition;
2. start inspection is a distinct workflow transition;
3. inspection form entry itself is the next user action;
4. a child workflow/subworkflow creates the inspection action.

The implementation gate must obtain a targeted, read-only workflow fixture and
business-owner confirmation of the runtime node/action sequence before adding
any new intent or command.

### Appointment boundary

The currently accepted G4-D appointment implementation has already isolated the
known appointment form as a dynamic-form action and keeps real writes disabled
by default (`docs/verification/G4D_ACCEPT_APPOINTMENT_IMPLEMENTATION.md:5-17,
25-32`). This checkpoint therefore treats Appointment completion as a
precondition candidate, not as proof of Inspection eligibility.

## 3. Workflow eligibility

### R1 evidence

R1 filters runtime nodes before showing them in the inspection detail:

- virtual node, deleted node and `accept`/`allot`/`dispatch` node types are
  excluded (`inspectionAppointment.vue:5068-5084`);
- a Legacy source-index-1 node is force-included (`5086-5089`);
- `nodeDef.userChoose` is matched against the current role set, `handlerIds`
  against the current user, and `nodeDef.viewableRoleIds` against the current
  role (`5091-5108`).

The source-index exception is a Legacy compatibility behavior only. It is not
portable semantic identity or safe V1 visibility evidence; the new App's
Workflow Runtime deliberately does not use array position.

R1's command bar confirms that node type, node state and form identity affect
which form/add/complete actions are offered:
`subpackages/serviceAppointment/components/TechnicianWorkflowCommandBar.vue`
(`28-76`, `77-143`, `145-179`, `180-231`). In particular, forms/repeat nodes
are only offered completion when their form list is non-empty and node state is
active (`109-143`). This is useful policy evidence, but does not establish the
full Appointment-to-Inspection precondition chain.

### New App mapping

The current Adapter already normalizes node category and lifecycle without
exposing `nodeDef` or raw state:
`src/adapters/api/technician-api.ts:501-536`. It normalizes handler and role
visibility evidence at `538-616`, and produces typed node reads at `618-652`.
The shared port defines stable node identities and optional run/parent/form
identities at `src/shared/ports/api.ts:145-160`.

The existing Runtime conservatively requires active, supported, non-system
nodes and verified actor visibility (`src/runtimes/workflow/policy.ts:57-71`).
Its action policy is Runtime-owned (`83-145`), and current-task selection is
exactly-one candidate with no array-order or label tie-break
(`src/runtimes/workflow/detail-projection.ts:73-119`).

For G4-E, the minimum eligibility rule should remain:

```text
verified visible actor
AND active supported inspection node
AND all evidenced predecessor conditions satisfied
AND form/content capability supported
```

The “predecessor conditions” and “inspection node” mapping are not yet
verified. Full role-set and organization-role membership also remain
conservative in the current SessionSnapshot, as recorded by
`docs/verification/G4D_ACCEPT_APPOINTMENT_IMPLEMENTATION.md:19-23`.

### Reopen/edit and inactive behavior

R1 can read a node's existing form data and open the form in edit mode when a
`formDataId` exists (`inspectionAppointment.vue:viewForm`, `5505-5537`). This
proves a read/edit UI path existed. It does not prove that a completed
inspection may be reopened, that an old revision is editable, or that the
backend will authorize the write. Those are UNKNOWN until a controlled
read-only fixture and a separately authorized write-contract review exist.

The new App must continue to reject unknown, inactive, system, sentinel,
unsupported and non-handler nodes through Workflow Runtime policy, not through
display labels or status text.

## 4. Identity model

The target Inspection identity graph is:

```text
WorkOrderId
  -> WorkflowDefinitionId / WorkflowRunId
      -> WorkflowNodeRuntimeId
          -> FormDefinitionId
              -> FormDataId (optional for a new form, exact for an existing one)
```

For child workflows, retain the parent runtime-node relationship and the child
definition/run pair. Do not replace these with route names, display labels or
array positions.

### Evidence mapping

| Semantic identity | R1 evidence | New App boundary |
| --- | --- | --- |
| `WorkOrderId` | Detail request `id` in `getSAData` (`inspectionAppointment.vue:5055-5059`) and `sid` in process params (`6009-6073`). | `WorkOrderId` in `src/shared/ports/api.ts:201-205`; Action identity in `src/runtimes/action/types.ts:39-60`. |
| `WorkflowRunId` | `workflowId`/subworkflow runtime values are used when saving and refreshing (`inspectionAppointment.vue:5858-5874`, `6110-6115`, `8675-8723`). | `WorkflowNodeRead.runId` and `FormDataRead.workflowRunId` (`src/shared/ports/api.ts:145-184`). |
| `WorkflowNodeRuntimeId` | Runtime node `_id` is sent as `workflowNodeId` / `nodeId` (`inspectionAppointment.vue:5858-5860`, `6059-6085`). | `WorkflowNodeRead.id` (`src/shared/ports/api.ts:145-149`) and typed projection node ID (`src/runtimes/workflow/detail-projection.ts:18-25`). |
| `WorkflowDefinitionId` | Workflow definition is carried by the workflow response and node definition context; exact parent/child uniqueness is not proven (`inspectionAppointment.vue:5065`, `6110-6115`). | `WorkflowDefinitionRead.id` and optional node `definitionId` (`src/shared/ports/api.ts:141-160`). |
| `FormDefinitionId` | `node.nodeDef.formDefId` drives field/data reads and upsert path (`inspectionAppointment.vue:5518-5527`, `5656-5663`, `5881-5885`). | `FormDefinitionRead.id`, never a field-row `_id` (`src/shared/ports/api.ts:162-175`; `src/adapters/api/technician-api.ts:686-712`). |
| `FormDataId` | Existing node/form data ID is passed to exact form-data read; saved ID is returned to follow-up handling (`inspectionAppointment.vue:5522-5527`, `5890-5899`, `6067-6072`). | `FormDataRead.id` and `getFormData({ definitionId, dataId? })` (`src/shared/ports/api.ts:179-221`). |

The G4-D lesson is retained: a field-row `_id` is not form-definition
identity. The Adapter uses the requested form-definition ID for field-array
responses (`src/adapters/api/technician-api.ts:686-708`).

## 5. Inspection Form evidence

### Strongest candidate, with a confidence limit

`3807435364983262382` is the strongest static inspection-form candidate:

- inspection-specific maximum photo handling is gated on it
  (`inspectionAppointment.vue:6967-6991`);
- repeat-form save invokes inspection/survey follow-up handling for it
  (`5887-5899`);
- the measurement tool persists data with type `InspectionForm`
  (`9424-9442`); and
- inspection-specific cleanup is gated on the same form ID (`9444-9452`).

The source does not contain a committed response fixture enumerating the
current field rows for this form. Therefore this ID is **a historical candidate,
not an accepted complete active-form registry entry**. The appointment form
`2522989775781119510` and survey/quotation form `7971040108398070730` must not
be conflated with the Inspection form; their separate fixed-ID behavior is
recorded in `docs/discovery/DYNAMIC_FORM_CAPABILITY_MATRIX.md:105-113`.

### Field evidence actually observed

R1 reads field rows with `extId=formDefId`, display-list filtering, parsed
`frontEndConfig`, `valueOption`, and type-specific behavior
(`inspectionAppointment.vue:getFields`, `5542-5616`). The source supports or
references these inspection-related structures:

- ordinary dynamic field rows whose final names/types/options come from the
  backend (`5542-5561`);
- `file`, `area`, `scan`, `addItem`, `bizSelect`, `data`, `sort`, `pushItem`,
  `evaluate` and `canvas` historical field/widget branches (`5573-5616`);
- nested `inspectionSOPData` with required `isQualified` and required
  inspection image when an item is qualified (`saveForm`, `5831-5849`);
- survey/measurement output associated with a saved form-data ID
  (`9424-9442`).

The following requested attributes are not fully recoverable from static
source alone and must be collected from a sanitized R1 form-definition read
fixture before implementation: complete backend field names, labels/purpose,
all types, nullability/defaults, option values, conditional expressions,
repeat/group schema, cascade dependencies, and every media relation.

## 6. Dynamic Form capability matrix

The current Dynamic Form Runtime is the data/rule engine, not the final
Inspection presentation. Its normalized type set and field-state contract are
defined in `src/runtimes/dynamic-form/types.ts:6-115`; type/provider
classification is in `capabilities.ts:7-61`; normalized values and submission
validation are in `values.ts:13-171`.

| R1 evidence | Current Runtime | G4-E disposition | Evidence / reason |
| --- | --- | --- | --- |
| `text`, `textarea`, `phone`, `IDNumber`, `number`, `digit`, `date`, `time`, `datetime` | **SUPPORTED** generic normalization and validation | Reuse unchanged if active form only uses these types | `DYNAMIC_FORM_CAPABILITY_MATRIX.md:46`; `types.ts:6-25`; `values.ts:58-76`. |
| `select`, `bizSelect`, `radio`, `checkbox`, `switch`, `rate` | **SUPPORTED / CONDITIONAL**; choice types need a verified provider or inline options | Reuse provider/runtime; collect actual option sources and nullable behavior | `capabilities.ts:39-61`; `values.ts:47-55,85-119`; R1 provider setup `inspectionAppointment.vue:5595-5605`. |
| `cascade` | **PARTIAL**; normalized provider/value shape exists, but active inspection cascade and dependency graph are unknown | Extend only after field fixture proves the dependency shape | `capabilities.ts:43-47`; R1 `valueOption` handling `5595-5605`; matrix `DYNAMIC_FORM_CAPABILITY_MATRIX.md:42-44`. |
| `file` / `image` | **PARTIAL**; Runtime accepts normalized media references, not binary/upload mechanics | Reuse scalar semantics; requires Platform/API Media Adapter and upload contract | `types.ts:92-99`; `values.ts:95-110`; `PLATFORM_CAPABILITY_MATRIX.md:41-44`; R1 upload `inspectionAppointment.vue:9207-9346`. |
| `area` | **PARTIAL / guarded**; generic area normalization explicitly returns unsupported, while a named survey rule exists | Do not generalize; use a reviewed declarative rule only if active inspection evidence selects it | `values.ts:78-83`; `types.ts:117-122`; R1 measurement rule `editableFieldWriteContract.js:4-43`. |
| `scan`, `addItem`, `pushItem`, `sort`, `evaluate`, `dialog`, `data`, `canvas`, `bgImage` and other custom widgets | **MISSING generic support** | Treat each as an explicit inspection-specific capability decision; unsupported must fail explicitly | R1 branches `inspectionAppointment.vue:5573-5616`; current disposition `DYNAMIC_FORM_CAPABILITY_MATRIX.md:47,105-113`. |
| `inspectionSOPData` checklist/media structure | **MISSING as a named semantic content model** | Inspection Action Content may own the presentation after evidence, while Dynamic Form Runtime remains the field/rule engine | R1 required behavior `inspectionAppointment.vue:5831-5849`; current App ports have only generic `FormFieldRead` (`src/shared/ports/api.ts:168-175`). |
| Conditional visibility / required / read-only | **SUPPORTED bounded runtime semantics** | Reuse; apply effective-state rules and do not copy Legacy predicates into Vue | `types.ts:32-90`; `values.ts:128-171`; `DYNAMIC_FORM_CAPABILITY_MATRIX.md:43-45,67-93`. |

This matrix deliberately does not claim that the complete inspection schema is
generic or that all historical widgets belong in G4-E. The final field matrix
must be produced from an actual sanitized definition read.

## Phase 2 — Minimal Implementation

Phase 2 implements only an already verified, active, visible, supported form
node. It does not add an arrival or start-inspection transition. The bounded
path is:

```text
Adapter-normalized workflow node
  -> existing Workflow Runtime current-task projection
  -> Action Workspace
  -> existing Dynamic Form Runtime
  -> explicit form save
  -> existing UploadPort online media boundary
  -> separate workflow/process completion
  -> authoritative detail reread
```

### Implementation boundary

- The Adapter carries an opaque `formDefinitionId` only when the backend-shaped
  node supplies one. A bare forms node remains read-only; the page does not
  infer inspection capability from a title, status, route or array position.
- `interact_with_form` uses the generic `DynamicFormRead` command boundary. A
  missing `formDataId` reads the definition and returns empty values. An
  existing ID is read through the exact definition-scoped query and must match
  the requested data ID, definition ID and expected workflow run when present.
- Field rendering and submission validation reuse the Dynamic Form Runtime.
  Supported generic text, textarea, option and image/file references are
  rendered from normalized metadata only when their effective runtime state is
  visible and supported. Unsupported fields with effective visibility are
  surfaced as an unavailable capability and block completion; hidden fields are
  omitted without a misleading warning. Checkbox/cascade fields remain
  explicitly unsupported in this Action Content because no correct multi-value
  presentation path exists here; they are never rendered through scalar
  choices.
- The explicit `保存表单` operation and workflow completion are separate. The
  completion action is enabled only after normalized validation, required media
  upload, a valid form-data identity, and a successful explicit form save.
  `completeDynamicForm()` never saves implicitly; any later field or successful
  media change returns the form to `not_saved`.
- Conditional visibility metadata supported by the existing Runtime is
  normalized by the Adapter into the shared field read model. Unsupported or
  malformed conditional metadata is marked explicitly unsupported rather than
  silently discarded. The page receives neither `nodeDef` nor raw
  `frontEndConfig`.

### Draft, media and retry behavior

- Action drafts continue through the existing user/work-order/node/action/
  content-scoped Draft Repository. Only JSON field values are persisted; local
  media paths and binary content are not written to drafts.
- Media uses the existing token/provider `UploadPort`. MP/App platform file
  selection stays in the platform adapter; Mock returns a synthetic uploaded
  reference and Real remains behind the existing real-write safety boundary.
  G4-E is online-first and does not promise offline media recovery or a media
  queue. Picker and upload calls are gated by the same effective field state;
  hidden, read-only, unsupported and wrong-type media fields have no picker or
  upload side effect.
- Save and completion use single-flight guards. There is no blind automatic
  mutation retry. If completion is ambiguous, the workspace rereads the
  authoritative detail before a later manual retry becomes eligible. A
  successful business mutation remains successful even if local draft cleanup
  or the follow-up reread is pending; the UI cannot invite duplicate
  submission.

### Mock verification boundary

The sanitized synthetic inspection fixture uses the same raw node, form
definition, form-data, UploadPort, save command and workflow completion path as
the real adapter. Synthetic IDs are handled locally by the Mock router and are
rejected before Real transport fallback. Login/session behavior remains real;
only bounded business reads, Mock commands and Mock upload results are local.

### UNKNOWNs intentionally outside Phase 2

- U1 arrival/start-inspection semantics remain UNKNOWN and are not implemented.
- U2 fixed inspection business fields remain UNKNOWN; the synthetic fixture is
  visual/functional test data, not a production schema claim.
- U3 server-side idempotency remains UNKNOWN; client single-flight and reread
  protection are the only Phase 2 guarantees.
- U4 durable offline media remains unsupported by design. JSON draft recovery
  does not restore unuploaded media after app restart.

Phase 2 therefore adds no new workflow intent, no new backend API, no legacy
networking abstraction, and no G4-F scope.

## 7. Existing FormData semantics

### R1 read behavior

For a known form definition and data ID, R1 calls:

```text
POST biz/extForm/query/{formDefId}
sortField=createTime
sortOrder=desc
is:_id|string#and={formDataId}
```

This is visible in `inspectionAppointment.vue:getFormData` (`5656-5663`). The
Legacy callback consumes `res.data[0]` and flattens `exts` into the view model
(`5664-5683`). That proves the wire filter and read shape, but does **not** prove
that exactly one record is guaranteed by the backend or that history is absent.

For repeat forms, R1 separately queries the form list by form definition,
workflow ID and non-deleted state, newest first
(`inspectionAppointment.vue:getFormList`, `8675-8723`). This supports a
multi-record/repeat interpretation for the candidate inspection form, but the
allowed cardinality and completion rule still require a G4-E fixture.

### New App safety boundary

The current typed read port distinguishes definition ID, optional data ID,
workflow run ID and normalized values (`src/shared/ports/api.ts:162-221`). The
G4-D implementation already established the safe rule that absent `formDataId`
does not trigger an unscoped data query, and an existing record must match the
requested identity and expected definition
(`docs/verification/G4D_ACCEPT_APPOINTMENT_IMPLEMENTATION.md:25-32`).

G4-E must reuse that exact-record discipline. It must not use the first field
row's `_id`, field position, label or a stale work-order-only cache as form
identity.

### Create, update, reopen, history

R1's `saveForm` selects the form-definition/node/run parameters for main,
subflow and repeat paths (`inspectionAppointment.vue:5851-5874`) and sends one
`biz/extForm/upsert/{nodeFormDefId}` request (`5881-5886`). The source does not
establish a complete create-versus-update or revision/history contract, nor
does it prove backend authorization for reopening a closed record. These are
UNKNOWN. The new implementation must keep form-data identity scoped by
work-order, workflow-node and form identity through the typed read/application
boundary.

## 8. Write / completion contract

### Observed R1 operations

| Operation | Endpoint / evidence | Confidence |
| --- | --- | --- |
| Save form data | `biz/extForm/upsert/{nodeFormDefId}`, body includes `dataStr: JSON.stringify(params)`; `inspectionAppointment.vue:5825-5886`. | HIGH historical source evidence; current active inspection contract UNKNOWN. |
| Complete workflow node | `workflow/process`, with `workflowNodeId`, `nodeFormDefId`, `nodeFormDataId`, `smodule`, `sid`; `inspectionAppointment.vue:6046-6099`. | HIGH historical source evidence; exact response/authorization UNKNOWN. |
| Repeat/subworkflow follow-up | `getFormList`, `getSubWorkflow` or detail reread after process; `inspectionAppointment.vue:6106-6125`, `8675-8723`. | MEDIUM; active current sequence UNKNOWN. |
| Survey/measurement side write | `/measurementData/upsert` with `type: InspectionForm`, `typeId=formDataId` and measurement fields; `inspectionAppointment.vue:9424-9442`. | HIGH historical source evidence; whether required for the selected V1 form UNKNOWN. |
| Media upload | token read `back/super/file/upToken.do`, then Qiniu upload; `inspectionAppointment.vue:9207-9246`. | HIGH historical source evidence; not smoked and not an App contract. |

The Legacy source clearly separates form upsert from workflow processing in
the non-save-only flow (`inspectionAppointment.vue:5881-5925`, `6009-6126`).
Therefore G4-E must model “form data persisted” and “workflow node completed”
as distinct business outcomes even if the UX presents them as one final action.

### Unverified safety semantics

No live write was executed. Static R1 evidence does not establish:

- server validation and authorization failure envelopes;
- duplicate submission/idempotency behavior;
- whether HTTP 200 with `success:false` is possible for these endpoints and
  its exact domain category;
- retryable versus terminal classification;
- whether a process call after a successful upsert is safe to retry;
- the exact wire encoding for partially completed or deferred inspection data.

The current App's command transport already normalizes shared Mock/Real
command responses and blocks real writes by default
(`src/adapters/api/technician-api-commands.ts`; `src/adapters/api/
uni-api-command-transport.ts:59-120`). G4-E must reuse that boundary, not
introduce an inspection-specific command normalization or safety gate.

## 9. Success + authoritative reread

R1 updates the local node state to closed after a successful completion and
refreshes the main detail/workflow or child workflow depending on the node path
(`inspectionAppointment.vue:6099-6125`). Repeat-form save refreshes the active
form view (`5921-5925`). This is evidence that a reread is part of the Legacy
success path.

It does not prove the authoritative result for an active Inspection action:

- whether the current node becomes closed;
- which next node becomes visible/eligible;
- whether the work-order status changes;
- whether a child workflow is created or updated;
- whether List invalidation is required in addition to Detail reread;
- whether the current action changes to a specific label.

Those outcomes must be asserted only after a verified command contract. The
minimum new-App success boundary should be the already accepted Action Runtime
pattern: mark the business mutation result from the command response, then do a
best-effort draft finalization and authoritative reread; a reread warning must
never invite resubmitting an already successful mutation. The reusable
architecture is documented in `docs/architecture/ACTION_WORKSPACE_ARCHITECTURE.md:
51-68,169-185` and the accepted G4-D note at `G4D_ACCEPT_APPOINTMENT_IMPLEMENTATION.md:
14-17`.

## 10. Media requirements

### What R1 actually proves

For the candidate inspection form, R1 enforces:

- a maximum of 18 ordinary inspection photos, excluding survey-drawing and
  infrared-photo fields (`inspectionAppointment.vue:6967-6991`);
- an inspection SOP item with `isQualified` required when the item is marked
  qualified, and an inspection image required for a qualified item
  (`5831-5849`);
- a token request followed by a Qiniu file upload
  (`9207-9246`);
- a camera path that may attach latitude/longitude through
  `/biz/image/uploadAddLogo.do` (`9270-9306`);
- work-order album read/delete operations through `biz/album/album`
  (`9780-9818`); and
- optional survey-tool result persistence through `/measurementData/upsert`
  (`9424-9442`).

### Not established

The scan did not establish that the selected G4-E V1 slice requires video,
signature, handwritten annotation, a specific leak-photo category, or a
specific measurement widget. These are not to be inferred from historical
component branches. Camera/location coupling is observed, but a standalone
inspection location requirement is still UNKNOWN.

For each media field selected later, the evidence gate must record source
(camera/library), upload timing, returned media identity, form/business
association, retry/deletion/replacement behavior and count/size limits. The
R1 upload path is historical source evidence only; the modernization record
explicitly says the upload token pipeline was not smoked
(`docs/modernization/API_CHARACTERIZATION.md:90-96`).

## 11. Weak-network / local media gap

The accepted local-draft architecture separates Stored Draft State, Effective
Business State and Submitted Business State
(`docs/architecture/LOCAL_DRAFT_AND_WEAK_NETWORK_ARCHITECTURE.md:32-69`).
It explicitly forbids credentials, raw envelopes, platform objects and guessed
workflow state in drafts (`142-167`) and explicitly does not imply an offline
command queue (`28-29`).

The current Platform matrix treats file/media selection and upload as adapter
capabilities, with normalized media references crossing into shared code
(`docs/discovery/PLATFORM_CAPABILITY_MATRIX.md:38,43-44,107-110`).

Because R1 requires inspection images for qualified SOP items and historically
uploads them before form completion, the current JSON-like draft is sufficient
only for already-uploaded references. It is **not evidence of recoverable
offline captured media**. If G4-E promises weak-network capture, the smallest
architecture gap is:

```text
scoped durable local media reference/file
  -> upload lifecycle: local | uploading | uploaded | failed
  -> retryable upload adapter
  -> draft stores reference/status, never binary/base64
  -> form submission accepts only an uploaded backend reference
```

This gap is a design recommendation, not an implementation in Phase 0. If the
selected V1 Inspection slice explicitly excludes offline media capture, keep
the existing Draft Repository and record that limitation instead.

## 12. Draft / Multi-Draft reuse

Inspection can use the existing Action Draft identity without a new storage
architecture:

```text
UserId
+ WorkOrderId
+ WorkflowNodeRuntimeId
+ ActionIntent
+ ActionContentKind
+ ContentIdentity/version when required
```

The identity and isolation rules are documented in
`docs/architecture/LOCAL_DRAFT_AND_WEAK_NETWORK_ARCHITECTURE.md:73-118`, and
the current Action Runtime identity types are in
`src/runtimes/action/types.ts:39-66`. This supports independent Appointment
and Inspection drafts across multiple work orders and nodes.

The shared `dynamic_form` content kind is the default recommendation for a
normal Inspection form. Do not invent a dedicated `inspection` kind yet. A
dedicated semantic content kind would be justified only if verified SOP
groups, repeat records, measurement/media workflows cannot be represented as
an Action Content implementation over the existing Dynamic Form Runtime.

The existing Draft Repository's user/work-order/node/action/content scoping,
canonical key codec and legacy-safe cleanup are reusable
(`src/runtimes/action/draft-repository.ts:141-265`). Inspection must never use
R1's legacy `temporaryForm` as its storage identity: R1 stores transient
temporary form state with a work-order-derived value and restores it by legacy
conditions (`inspectionAppointment.vue:9966-9988`), which is insufficient for
multi-draft/node isolation.

## 13. Action Workspace reuse matrix

| G4-D capability | G4-E decision | Evidence / boundary |
| --- | --- | --- |
| `ActionWorkspaceShell` | **REUSE UNCHANGED** | Shared shell owns safe area/footer and keeps content above the persistent bar (`ACTION_WORKSPACE_ARCHITECTURE.md:36-49`). |
| Action lifecycle and business-result boundary | **REUSE UNCHANGED** | Action Runtime owns lifecycle, success/error and reread semantics (`ACTION_WORKSPACE_ARCHITECTURE.md:169-185`; `src/features/work-orders/action-workspace.ts:191-231`). |
| Draft / Multi-Draft Repository | **REUSE UNCHANGED** | Typed identity and storage isolation (`LOCAL_DRAFT_AND_WEAK_NETWORK_ARCHITECTURE.md:73-118`). |
| Navigation and persistent Action Bar | **REUSE UNCHANGED** | Full-page workspace and explicit route model (`ACTION_WORKSPACE_ARCHITECTURE.md:51-95`). |
| Confirmation / success patterns | **REUSE WITH EXTENSION** | The business success and reread warning pattern is reusable; inspection’s exact confirmation/complete semantics are UNKNOWN (`ACTION_WORKSPACE_ARCHITECTURE.md:53-68`; R1 `inspectionAppointment.vue:6022-6039`). |
| Dynamic Form Runtime | **REUSE WITH EXTENSION** | Core field/rule engine is reusable; inspection SOP/repeat/media-specific semantics require evidence and possibly a bounded content adapter (`DYNAMIC_FORM_CAPABILITY_MATRIX.md:30-49`). |
| Inspection Action Content | **INSPECTION-SPECIFIC** | SOP checklist, repeat/group presentation and selected media/measurement interactions are not currently modeled as Appointment roles; R1 evidence `inspectionAppointment.vue:5831-5849,9424-9442`. |
| Local media persistence | **GENUINE ARCHITECTURE GAP only if offline capture is in scope** | Current draft stores JSON-like state and platform matrix exposes only normalized media references (`LOCAL_DRAFT_AND_WEAK_NETWORK_ARCHITECTURE.md:142-167`; `PLATFORM_CAPABILITY_MATRIX.md:38,43-44`). |
| Exact inspection command contract | **GENUINE EVIDENCE GAP** | R1 records no accepted inspection API spec and no live write evidence (`API_CHARACTERIZATION.md:88-96`). |

No Action Workspace redesign is proposed by this checkpoint.

## 14. Mock equivalence plan

Mock fixtures must remain backend-shaped and must use the same path as Real:

```text
raw Mock read/command fixture
  -> Mock transport
  -> API Adapter normalization
  -> Workflow / Dynamic Form Runtime
  -> Action application store
  -> Action Workspace / Inspection Action Content
```

The current App already has a Mock/Real read transport boundary and synthetic
ID isolation (`src/adapters/api/uni-api-read-transport.ts:74-127`,
`src/adapters/api/mock/fixtures.ts`). Inspection fixtures must extend this
existing mechanism rather than branch in Vue rendering.

Minimum deterministic scenarios after the evidence gate:

| # | Raw fixture intent | Expected semantic result |
| --- | --- | --- |
| 1 | Fresh eligible inspection node, no `formDataId`, supported fields | Definition read succeeds; values are empty; Action Workspace opens. |
| 2 | Same node with one exact existing `FormDataId` and partial values | Exact record restores; no other work-order/node record can be used. |
| 3 | Required inspection field/SOP item missing | Dynamic Form Runtime returns validation; no command is sent. |
| 4 | Verified conditional field branch, only if R1 fixture proves one | Stored inactive values may remain in draft; effective validation/submission excludes hidden values. |
| 5 | Local Inspection draft restore | User/work-order/node/action/content identity matches; incompatible draft is ignored. |
| 6 | Retryable submit failure | Business result remains failed-retryable; draft remains recoverable; no success reread is claimed. |
| 7 | Terminal submit failure | Business result is terminal; raw backend message does not reach Vue. |
| 8 | Successful form save + workflow completion + reread | Business success is recorded first; authoritative reread determines the next projection. |
| 9 | Unsupported actual R1 field/widget | Explicit unsupported capability; no silent label/value serialization. |
| 10 | Required media state, if active form proves it | Uploaded reference succeeds; failed/local media remains a typed media failure, never binary in generic draft. |

Each fixture must use synthetic IDs that are rejected before Real transport.
Login/session remains real and no fixture may contain credentials, tokens or
production payloads. Real writes remain blocked by the existing default-off
safety gate. The scenarios are a future implementation/test plan, not code
added in Phase 0.

## 15. UNKNOWN / deferred capabilities

| Unknown | Concrete evidence gap | Required owner/evidence gate |
| --- | --- | --- |
| Arrival / `上门` transition | No active named arrival command found; inspection API spec absent (`API_CHARACTERIZATION.md:88-96`). | R1 workflow owner + sanitized runtime fixture. |
| Separate `开始勘察` action | No active named start-inspection action found. | R1 workflow owner; compare node metadata and process parameters. |
| Active Inspection form registry | `3807435364983262382` is a strong historical candidate, not an active registry proof (`inspectionAppointment.vue:6967-6991`). | Read-only form/node fixture. |
| Complete field schema | Field rows are fetched dynamically; static source cannot enumerate current rows (`inspectionAppointment.vue:5542-5561`). | Sanitized `extField/query` response. |
| Required/options/conditional/repeat semantics | Legacy branches exist, but active precedence and selected field behavior are not proven. | Form fixture plus Dynamic Form Runtime mapping review. |
| Exact form-data cardinality/history | R1 consumes first result of an array and repeat uses a separate list query (`5656-5683`, `8675-8723`). | Backend read contract and representative records. |
| Create/update/reopen authorization | Upsert path is visible, server policy is not (`5881-5886`). | Guarded contract review; no live mutation in this checkpoint. |
| Write failures/idempotency | No inspection write was exercised; no accepted endpoint specification. | Contract fixture or separately authorized sandbox evidence. |
| Post-success state/next action | R1 rereads but does not establish current active next-node result (`6099-6125`). | Controlled command-result fixture and Workflow Runtime review. |
| Media V1 set | Photos/SOP media are evidenced; video/signature/annotation/standalone location are not selected. | Product owner + R1 form/media evidence. |
| Offline media recovery | Required media upload is evidenced, durable local binary recovery is not. | Platform/API owner decision on local-media persistence. |
| Action confirmation/progress shape | R2 presents workflow labels/window, but it is UX-only and not action contract. | Product/UX decision after business sequence is verified. |
| App/MP device media parity | Source branches exist, but device behavior is not exercised (`PLATFORM_CAPABILITY_MATRIX.md:41-44`). | Later platform verification; not a Phase 0 blocker for documenting source facts. |

G4-E implementation, G4-F or later work, and any production/Beta mutation are
explicitly deferred.

## 16. Smallest recommended G4-E implementation slice

Only after the UNKNOWNs that affect the selected slice are accepted, the
smallest safe implementation is:

1. Add a reviewed, typed inspection action mapping at the Adapter/Workflow
   boundary only if the fixture proves a distinct semantic action or node
   category. Reuse existing visibility, lifecycle, exact-one selection and
   Runtime policy.
2. Extend the form read model minimally with the verified inspection form
   metadata and field semantics. Preserve requested FormDefinition identity;
   do not pass `nodeDef`, raw state, raw handler strings or raw form envelopes
   into Vue.
3. Reuse `dynamic_form` Action Content and the existing Action Workspace,
   Draft Repository, lifecycle, persistent bar, post-success boundary and
   navigation. Introduce no second draft or policy engine.
4. Add only the inspection-specific content projection proven by the form
   fixture: SOP/group/repeat behavior, conditional fields and selected media
   states. Unsupported widgets must fail explicitly.
5. If required media must survive weak connectivity, add the smallest separate
   Media Adapter/local-file lifecycle before exposing offline capture; keep
   binary/base64 out of generic Action Draft records.
6. Add raw Mock fixtures and behavioral tests for the same Adapter → Runtime →
   Workspace path. Keep Real writes default-off and keep synthetic IDs out of
   Real transport.
7. Verify the authoritative reread and next Current Action before claiming
   completion. Do not fabricate a status, next node or label from the form
   title.

This recommendation deliberately does not add a page, command, runtime
category, form widget, upload path or media persistence in Phase 0.

## Phase 0 disposition

- Product/runtime behavior changed: **NO**
- G4-E pages/commands added: **NO**
- Workflow Runtime modified: **NO**
- Dynamic Form Runtime modified: **NO**
- Live Beta/Production reads or writes executed: **NO**
- G4-F or later work started: **NO**
- Evidence deliverable: **READY FOR REVIEW**

---

# Phase 1 — Engineering Review / Unknown Resolution

Phase 1 reviews only U1–U4 from the Phase 0 record. It is an investigation and
design decision record; it does not implement G4-E.

## U1 — Arrival / Start Inspection Action Boundary

### Final classification

**UNKNOWN — an independent persisted arrival or start-inspection action is not
established by repository evidence.**

This is not classified as `NOT SUPPORTED`: the absence of a named endpoint in
the scanned client source does not prove that the backend has no such action.

### Evidence

- The active inspection-list accept path calls `workflow/process` with the
  service-appointment ID, runtime node ID and module in
  `subpackages2/inspectionAppointment/inspectionAppointments.vue:1297-1335`.
- The active inspection-detail form path calls `biz/extForm/upsert/{formDefId}`
  in `subpackages2/inspectionAppointment/inspectionAppointment.vue:5825-5886`
  and then calls `workflow/process` in `6009-6126`.
- The only detail status mutation found for visit-related outcomes is
  `basic/inspectionAppointment/upsert.do` in `inspectionAppointment.vue:
  8814-8881`, used for “does not need visit” / “visit not won” reason data.
- Terms such as `上门`, `到场` and `勘察` also occur in labels, calendar copy,
  status filters and comments (`inspectionAppointment.vue:19,5900,5973-5984`;
  `inspectionAppointments.vue:36-183`). These are not persisted-action
  evidence.
- R1's modernization record says the inspection-flow endpoints have no
  accepted spec and were not exercised: `docs/modernization/
  API_CHARACTERIZATION.md:88-96`.

No active call chain was found from an arrival/start-inspection UI control to a
distinct client API and persisted event/state. The R1 `workflow/startWorkflow`
and `workflow/startSubWorkflow` helpers are used for other historical form or
subworkflow paths (`inspectionAppointment.vue:5369,7295-7302`), not proven to
mean “arrive” or “start inspection”.

### Active call/data flow

The evidence-backed inspection-shaped flow is currently:

```text
service-appointment/detail read
  -> workflow/runtime-node material
  -> actor/visibility and node-state filtering
  -> extField/query for the node form definition
  -> exact form-data query when a data identity exists
  -> extForm/upsert
  -> workflow/process when the node is completed
  -> detail/subworkflow reread
```

Concrete R1 symbols are `getSAData` (`5055-5142`), `viewForm` (`5505-5537`),
`getFields` (`5542-5649`), `getFormData` (`5656-5688`), `saveForm`
(`5730-5925`) and `process` (`6009-6126`).

### Engineering implication for G4-E

Do not add `arrive`, `arrived`, `start_inspection`, a new status, or a new
Workflow Runtime category. The minimum implementation may proceed with the
existing `forms`/`repeat` model only after a sanitized fixture proves that
Inspection is represented by one of those nodes and that Appointment
completion is the predecessor.

If R1 later proves an independent action, it must enter as a typed semantic
intent with an Adapter-owned command and Runtime-owned eligibility/execution
policy. It must not be derived from a button label, route name, node title or
status code.

### Remaining uncertainty

The following need R1 workflow-owner evidence or a sanitized read fixture:

- persisted arrival state/event and its identity;
- persisted start-inspection state/event and its identity;
- predecessor and concurrency rules;
- whether the two concepts are separate, combined, or absent in the active
  workflow;
- whether a child workflow is created before the inspection form.

## U2 — Effective Inspection Form Fields

### Final classification

**UNKNOWN for the active effective field set; CONFIRMED for the dynamic schema
envelope.**

The repository proves that the inspection page obtains field rows dynamically;
it does not contain a current sanitized response proving the complete active
field set for the selected onsite workflow.

### Evidence

- R1 `getFields` calls `biz/extField/query` with `extId=formDefId`, active state,
  order and `_all`, filters `showList`/`mpDetailHide`, parses
  `frontEndConfig`, and derives code/cascade providers
  (`inspectionAppointment.vue:5542-5616`).
- R1 renders ordinary fields through type branches and has historical branches
  for `file`, `area`, `scan`, `addItem`, `bizSelect`, `data`, `sort`, `pushItem`,
  `evaluate` and `canvas` (`5573-5616`). A branch being present is not proof
  that it is active in the current production form.
- The special `inspectionSOP` branch renders a repeatable checklist shape with
  disabled content/requirement values, qualification, failure causes and
  images (`inspectionAppointment.vue:3061-3155`).
- `getInspectionSOP` reads active SOP rows by `part` and order, while
  `getInspectionCause` reads active failure/suggestion options
  (`inspectionAppointment.vue:9014-9075`). These are auxiliary reads, not a
  complete FormDefinition response.
- R1 validates `inspectionSOPData.isQualified` and requires an image when an
  item is qualified (`inspectionAppointment.vue:5831-5849`).
- The strongest static form candidate remains
  `3807435364983262382`, based on the candidate-specific photo and
  `InspectionForm` measurement branches (`inspectionAppointment.vue:
  6967-6991,5890-5899,9424-9442`). Its active membership and complete rows are
  not proven.

### Active call/data flow

The historical data flow is:

```text
nodeDef.formDefId
  -> biz/extField/query
  -> active/display field rows + frontEndConfig/provider metadata
  -> optional inspectionSOP / inspectionCause reads
  -> biz/extForm/query/{formDefId}
  -> formData values + exts
  -> field validation/serialization
  -> extForm/upsert/{formDefId}
```

R1's existing data callback takes the first returned record and flattens
`exts` into view values (`inspectionAppointment.vue:5656-5683`). The new App's
accepted typed boundary keeps this distinction explicit: `FormDefinitionRead`,
`FormFieldRead`, `FormDataRead` and their read methods are defined in
`src/shared/ports/api.ts:162-221`; field-array definition identity is the
requested ID in `src/adapters/api/technician-api.ts:686-712`.

The new App has no G4-E frontend-rendered or submitted field set yet. Its
backend-supported generic field contract is the normalized Dynamic Form type
set, not a claim about the active Inspection schema
(`src/runtimes/dynamic-form/types.ts:6-115`).

### Smallest evidence-backed field contract

Until a form-definition fixture is accepted, G4-E may depend only on this
envelope:

1. A node supplies an opaque `FormDefinitionId` through Adapter-owned metadata.
2. The field read returns backend field name, display metadata, type,
   required/read-only metadata, and verified option/visibility configuration.
3. Active/display filtering follows the evidenced R1 inputs, but the modern
   Adapter owns the normalized result and does not expose `nodeDef` or raw
   field rows.
4. Form values are keyed by backend field name; `exts` is normalized by the
   Adapter. Form-definition identity is never a field-row `_id`.
5. Any field type, option provider, conditional expression, SOP group or media
   relation not represented by a reviewed normalized capability is explicitly
   unsupported; it is not silently rendered or submitted.

This is deliberately not a speculative canonical field list. If the accepted
fixture proves a fully dynamic generic form, `dynamic_form` remains sufficient;
if it proves the `inspectionSOPData`/repeat/media structures are required, a
bounded Inspection Action Content projection is needed on top of the Runtime.

### Engineering implication for G4-E

Do not hard-code fields such as `hasLeak`, `requiresRepair`, or a guessed
inspection checklist. Implement only the fields and rules present in the
accepted fixture. Reuse the Dynamic Form Runtime for supported generic fields,
and keep any SOP/repeat/media presentation-specific model outside the generic
Runtime unless its semantics are shown to be generic.

### Remaining uncertainty

The active FormDefinition response must still establish every field's key,
purpose, type, required/read-only/nullability/default, options, conditional
visibility, repeat/group relation and media relation. This is the principal
U2 blocker for a safe implementation.

## U3 — Write Idempotency / Duplicate Submission Semantics

### Final classification

**No idempotency guarantee is evidenced.** The three mutation classes are
separate and each is `client-guarded only / server semantics UNKNOWN`.

### Evidence and active flow

#### Form save

- R1 uses `isRepeatClick('saveForm')` and a local `disabled.saveForm` flag before
  save (`resources/js/common.js:2171-2193`;
  `inspectionAppointment.vue:5730-5736`). This is a time-based UI guard, not a
  request identity or server idempotency key.
- The write is `biz/extForm/upsert/{nodeFormDefId}` with a serialized `dataStr`
  (`inspectionAppointment.vue:5825-5886`). No explicit request ID or
  idempotency key is visible in the payload construction.
- The current App appointment command also performs an upsert followed by
  `workflow/process` and sends no idempotency key
  (`src/adapters/api/technician-api-commands.ts:225-265`).

If `_id`/`FormDataId` is present, the backend may update an existing record;
when it is absent, a retry may create another record. The repository does not
prove either the exact upsert rule or the server's duplicate behavior.

#### Workflow completion

- R1 sets `disabled.process` before `workflow/process` and rereads after the
  callback (`inspectionAppointment.vue:6043-6045,6099-6125`). This prevents
  ordinary double taps in one page instance only.
- Completion carries runtime node, form-definition/data and work-order IDs
  (`inspectionAppointment.vue:6059-6073`). There is no request ID in the
  observed parameter object and no accepted server transition/idempotency
  contract.
- The new App prevents an in-memory resubmission after a known successful
  Appointment command and separates business success from reread/cleanup
  (`src/features/work-orders/action-workspace.ts:659-724`). This is a useful
  application safety boundary, not proof of backend idempotency for Inspection.

An ambiguous timeout or lost response can therefore leave the server
transitioned while the client does not know it. Blindly repeating completion
could either be rejected by a server guard or repeat a side effect; the
outcome is UNKNOWN.

#### Media attachment/upload

- R1 obtains a token and calls `wx.uploadFile` to Qiniu
  (`resources/js/common.js:1120-1170`), then appends the returned URL/key into
  form state (`1156-1291`). The inspection path uses the same upload family
  (`inspectionAppointment.vue:9207-9346`).
- R1 retries a file upload on failure (`common.js:1293-1357`), but no stable
  media-operation identity or deduplication contract is visible. A response
  lost after successful object upload could produce an orphan or duplicate
  attachment on retry.
- The inspection measurement side write uses `/measurementData/upsert` keyed
  by form-data ID but exposes no idempotency contract
  (`inspectionAppointment.vue:9424-9442`).

### Engineering implication for G4-E

The implementation must not advertise automatic safe retry until the backend
contract is verified. The smallest safe application behavior is:

```text
single-flight logical operation
  -> if result is ambiguous, reread exact form/node state
  -> retry only with a proven update/transition identity
  -> never create a second form or attachment by blind replay
```

Form save, workflow completion and media upload need separate operation states.
The existing `OperationSnapshot` taxonomy can represent retryable versus
terminal outcomes (`src/shared/types/operation.ts:1-52`), but it does not create
server-side idempotency.

### Remaining uncertainty

R1 frontend-only evidence cannot establish server duplicate handling. A safe
G4-E write review still needs a non-production contract fixture or backend
owner confirmation for:

- upsert create/update behavior and duplicate record handling;
- workflow transition guards and repeated completion;
- media object/key deduplication, form association and orphan cleanup;
- measurement side-write duplicate behavior;
- server validation/auth failure and ambiguous-response recovery.

## U4 — Offline Media Capability

### Final classification

**PARTIAL INFRASTRUCTURE; offline capture, durable media persistence, deferred
upload and app-restart recovery are NOT SUPPORTED BY CURRENT EVIDENCE.**

### Evidence

#### WeChat Mini Program

R1's active inspection media path requests an upload token and immediately
uploads the selected local path to Qiniu (`resources/js/common.js:1120-1170`,
`inspectionAppointment.vue:9207-9246`). It retries some upload failures and
reports failure to the caller (`common.js:1293-1357`), but no durable local
media record, upload queue, restart recovery or per-item persisted progress is
shown.

The inspection page's `temporaryForm`, `surveyData` and `surveyField` storage
paths are transient form/survey coordination, not a durable local binary/media
store (`inspectionAppointment.vue:9966-9988`, `9424-9452`).

#### iOS / Android App via UniApp

The accepted platform contract provides normalized camera/file-picker results
for MP/App and keeps native mechanics behind adapters
(`docs/discovery/PLATFORM_CAPABILITY_MATRIX.md:42-44,107-110`). The current App
has `MediaCapturePort`, `MediaFilePickerPort` and `UploadPort`, but the upload
adapter is a token/upload bridge that returns an uploaded reference; it is not
a durable local-media repository or deferred-sync queue
(`src/shared/ports/platform.ts:40-47`; `src/shared/ports/upload.ts:1-4`;
`src/adapters/upload/upload-adapter.ts:40-57`).

The current platform adapter normalizes a local reference and capability state
(`src/adapters/platform/platform-adapters.ts:83-122`), but there is no evidence
of a persisted file path surviving an App restart, background upload scheduler,
upload-progress store, or offline replay.

The platform matrix explicitly separates file selection, upload, and retry
state and records V1 as not offline-first
(`docs/discovery/PLATFORM_CAPABILITY_MATRIX.md:43-44,51-52`).

### Active capability flow

The current evidence supports:

```text
MP/App capture or file picker
  -> normalized LocalMedia reference
  -> token/upload adapter
  -> UploadedMediaRef
  -> form value / business save
```

It does not support:

```text
offline capture
  -> durable local file/media registry
  -> app restart restoration
  -> deferred upload after connectivity recovery
  -> reliable form completion after upload reconciliation
```

### Engineering implication for G4-E

If the selected G4-E slice is explicitly online-only, reuse the existing
capture/picker/upload boundaries, preserve a retryable upload state and block
completion until required media has an uploaded backend reference.

If the selected slice promises offline/weak-network capture, the smallest
additional architecture is a separately scoped durable local-media record and
upload lifecycle (`local`, `uploading`, `uploaded`, `failed`) keyed to the
Action/Draft identity. Generic Action Drafts must store references/status only,
never binary or base64. This is a Phase 2 design dependency, not an
implementation in this review.

### Remaining uncertainty

The following require MP and App capability-owner verification before promising
offline media:

- local file lifetime and restart survival on MP, Android and iOS;
- upload-token expiry and retry behavior;
- deterministic media identity/deduplication and delete/replacement semantics;
- upload progress and cancellation behavior;
- whether required SOP images are mandatory in the selected active form;
- whether camera location metadata is required or merely historical coupling.

## Proposed G4-E Minimal Contract

This is the smallest implementation-ready contract that can be stated without
inventing the four unresolved business areas.

* **Entry:** Enter only from a verified active, actor-visible, supported
  inspection node whose predecessor conditions are confirmed. Do not invent an
  arrival or start-inspection command from labels. Runtime remains the
  authority for visibility, lifecycle, eligibility and execution.
* **Read:** Read the Work Order/detail workflow context, then the node's
  FormDefinition by opaque ID. If a FormDataId exists, query that exact record
  and verify record ID, definition ID and workflow identity. If absent, return
  an empty editor state; never query an unscoped form-data collection.
* **Editable form state:** Normalize the backend field rows into the Dynamic
  Form schema. Render and validate only visible/editable supported fields.
  Required, read-only, option and conditional rules are Runtime-owned. SOP,
  repeat/group and custom widgets remain explicit capabilities selected from
  the accepted fixture.
* **Draft/save:** Reuse the user-scoped Multi-Draft identity and Action
  Workspace lifecycle. Draft persistence is local recoverable editor state,
  not business success. Store normalized JSON-like values and media references
  only; never credentials, raw envelopes, guessed workflow state or binary.
* **Media:** Use Platform/API media boundaries. For an online-only slice,
  required media must reach `uploaded` before completion. For offline capture,
  do not claim support until durable local-media persistence and deferred
  upload are separately accepted.
* **Complete:** Keep form data upsert and workflow node completion as separate
  business boundaries. Mark success only from normalized command results, then
  finalize draft state and perform authoritative reread. Never fabricate the
  next node, status or action.
* **Retry/idempotency:** Use single-flight commands and explicit operation
  states. On ambiguous results, reread before retrying. Do not blindly replay a
  create or attachment operation. Backend idempotency remains a required
  contract gate.
* **Offline:** JSON form drafting/recovery can reuse the existing Draft
  Repository. Offline media capture, deferred upload and restart-safe media
  recovery are not promised by the current contract.
* **Non-goals:** No new arrival/start command until proven; no Progress,
  Appointment expansion, contact/calendar work, generic widget family,
  continuous tracking, live business mutation, G4-F or later work.

## Proposed Implementation Boundary

### Likely files/modules to change after Phase 2 acceptance

- `src/shared/ports/api.ts` — only minimal typed inspection identity/field
  metadata proven by the accepted fixture.
- `src/adapters/api/technician-api.ts` and the command/read adapters — only
  verified R1 normalization and exact request envelopes.
- `src/runtimes/workflow/types.ts`, `policy.ts` and/or
  `detail-projection.ts` — only if U1 proves a missing semantic node/action;
  otherwise unchanged.
- `src/runtimes/dynamic-form/*` — only bounded generic capability extensions
  proven by U2; no speculative custom-widget expansion.
- `src/features/work-orders/*` — Action Content/application orchestration,
  reusing the existing Action Workspace rather than adding a parallel flow.
- `src/shared/ports/upload.ts` and platform/upload adapters — only if the
  selected media contract requires the existing normalized upload boundary or
  the separately accepted local-media gap.
- `src/adapters/api/mock/*` and focused semantic tests — raw backend-shaped
  synthetic fixtures through the same Adapter → Runtime → Workspace path.
- Verification/design documentation for the accepted form and command
  contract.

### Must remain unchanged for this slice

- accepted Appointment behavior and its Runtime-owned execution boundary;
- conservative Workflow visibility and exact-one current-task semantics;
- the canonical/legacy-safe Multi-Draft Repository codec and cleanup rules;
- session/login behavior and real-write default-off safety;
- current List/Detail visual shell and unrelated shared UI;
- R1/R2 reference repositories.

### Runtime/API changes required

**NO change is justified by Phase 1 evidence alone.** Existing contracts are
sufficient for generic dynamic-form interpretation, typed action identity,
draft isolation and conservative Workflow policy. They are not sufficient to
claim the active Inspection form schema, an independent arrival/start action,
server idempotency or offline media persistence. Those gaps must be resolved
before implementation rather than hidden behind guessed types or commands.

### Legacy paths to avoid

- Do not port `subpackages2/inspectionAppointment/inspectionAppointment.vue`
  as a page architecture.
- Do not put `common.osg.ajax`, raw `nodeDef`, raw workflow/status codes or
  direct `wx.uploadFile` calls into the new Runtime/page.
- Do not use `temporaryForm`, `surveyData` or `surveyField` as the new
  multi-draft/media identity model.
- Do not use source index, route/menu order, labels or colors as identity,
  eligibility or transition semantics.
- Do not use R2 workflow labels as R1 backend truth.

## Phase 2 Go / No-Go Checklist

Phase 2 implementation is **BLOCKED** at this checkpoint.

| Gate | Required before implementation | Current result |
| --- | --- | --- |
| U1 action boundary | Confirm independent arrival/start action, or explicitly accept a minimum slice that excludes it and proves Inspection entry through an existing node. | **OPEN / BLOCKING** |
| U2 effective form | Provide a sanitized active node/form/field fixture and approve the smallest field/control capability set. | **OPEN / BLOCKING** |
| U3 duplicate safety | Establish form-save, completion and media retry/idempotency behavior, or approve a design that never auto-retries ambiguous writes and rereads before any manual retry. | **OPEN / BLOCKING for full submit** |
| U4 media scope | Decide online-only versus offline media. If required SOP media is in scope, approve upload/reference and recovery semantics; if not, explicitly exclude media from V1. | **OPEN / BLOCKING as a scope decision** |
| Authority | R1 contract accepted; R2 remains UX/IA only; no guessed labels/statuses become backend truth. | **PASS** |
| Safety | No live writes, no production data, real writes default-off, synthetic IDs isolated. | **PASS** |
| Architecture | Existing Workflow/Action/Draft/Form boundaries remain the target; no second policy/draft engine. | **PASS** |

No unresolved UNKNOWN can currently be declared safely outside the smallest
full onsite-inspection slice: U1 and U2 determine what the action and data are;
U3 determines whether submission can be safely retried; U4 determines whether
R1's required inspection images are deliverable in the intended field
conditions. Therefore implementation must not start yet.

## Phase 1 disposition

- Product/runtime behavior changed: **NO**
- G4-E implementation started: **NO**
- Runtime/API contracts added or modified: **NO**
- Live Beta/Production writes executed: **NO**
- New offline subsystem introduced: **NO**
- G4-F or later work started: **NO**
- Phase 2: **BLOCKED pending U1–U4 acceptance**
