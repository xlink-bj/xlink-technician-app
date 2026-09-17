# G4-E On-site Inspection / Inspection Form Evidence

Status: Phase 0 evidence checkpoint only  
Repository: `xlink-bj/xlink-technician-app`  
Branch: `rebuild/g4e-onsite-inspection`  
Baseline: `0a46d8482b878b2d04f08894da54f5b77fb56214`  
Issue: `#21`

This document is a static/source evidence record. It does not implement
Inspection, add pages or commands, change Workflow Runtime behavior, add form
capabilities, implement upload/media persistence, or execute a live mutation.

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

Decision: **Phase 0 evidence is ready for review, but G4-E implementation must
remain gated on the UNKNOWNs above.**

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

