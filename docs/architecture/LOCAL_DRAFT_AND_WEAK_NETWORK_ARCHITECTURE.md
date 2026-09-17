# Local Draft & Weak-Network Architecture

Status: Required target architecture for field-service Actions  
Program: New Technician / Field Service App  
Branch: `rebuild/g4d-action-workspace`

## 1. Why this capability is mandatory

The Technician App is used in field-service environments where connectivity is unreliable by default rather than exceptional: basements, underground spaces, stairwells, equipment rooms, construction sites, residential buildings with poor indoor coverage, and temporary network loss during travel.

For this product, local draft persistence is therefore a **core field-service reliability capability**, not Appointment-specific convenience UI.

The permanent product requirement is:

> A technician may have multiple unfinished Actions across different Work Orders and different Action Content types. Losing network connectivity must not cause already-entered recoverable work to be lost.

The architecture must support concurrent local drafts such as:

```text
Work Order A / Appointment / Form A      -> Draft A
Work Order B / Inspection / Form B      -> Draft B
Work Order C / Quotation / Quote Editor -> Draft C
Work Order D / Contract / Contract X    -> Draft D
```

These drafts must coexist without overwriting one another.

This requirement does **not** mean that business commands are automatically queued and replayed offline.

---

## 2. Core distinctions

Three states must remain separate:

```text
Stored Draft State
!= Effective Business State
!= Submitted Business State
```

### Stored Draft State

Represents the technician's recoverable editing work.

It may contain values that are currently inactive because the user switched a conditional branch. Preserving these values can prevent accidental data loss when the user switches back.

### Effective Business State

Represents which parts of the stored editing state currently apply to the active business branch.

Inactive conditional values:

- are not active UI controls;
- do not participate in effective validation;
- do not appear in confirmation;
- do not become effective submission values.

### Submitted Business State

Represents only the verified command payload and backend result for the current action.

A local draft being saved successfully never proves that a backend business mutation succeeded.

Permanent invariant:

```text
Local draft saved != Business action succeeded
```

---

## 3. Multi-draft identity model

Every unfinished Action has a stable semantic identity.

The draft key is derived from that identity, conceptually:

```text
ActionDraftIdentity =
  UserId
  + WorkOrderId
  + WorkflowNodeRuntimeId
  + ActionIntent
  + ActionContentKind
  + ContentIdentity/version when required
```

This identity must prevent draft leakage:

- between users;
- between Work Orders;
- between workflow-node runtime instances;
- between different Action intents;
- between different content runtimes;
- between incompatible form/content definitions.

A visible title, field label, customer name, form name, or array index is never a valid draft identity.

### One latest unfinished draft per Action Identity

The default model is:

```text
Different Action Identities -> multiple independent drafts
Same Action Identity        -> one latest unfinished draft
```

The system is not a document-version-history product. Repeated edits to the same unfinished Action update the latest recoverable draft rather than creating an unbounded sequence of versions.

---

## 4. Action Content independence

Draft capability belongs to Action Runtime / Workspace architecture, not to Appointment.

Different Action Content runtimes may serialize different semantic editor state:

```text
dynamic_form    -> normalized field values + compatible editor state
quotation       -> quote lines / quantities / pricing editor state
contract        -> contract editor state / selected template references
media_signature -> local media/signature references and metadata
composite       -> content-runtime-owned structured state
```

Each content runtime owns the semantic shape required to restore its editor. Action Runtime owns the generic draft lifecycle, identity, persistence orchestration, recovery policy, and status.

A future content runtime must not implement a separate ad-hoc local-storage mechanism when the shared Action Draft architecture is applicable.

---

## 5. Draft record

A draft record is versionable and contains recoverable semantic editor state only.

Conceptually:

```text
ActionDraftRecord<TContentState> {
  version
  identity
  updatedAt
  status: unfinished | completed
  contentState
}
```

A draft must not persist:

- authentication credentials;
- session cookies/tokens;
- raw API envelopes;
- backend transport/request objects;
- platform SDK objects;
- guessed workflow state.

The content payload must remain serializable and compatible with the content runtime's restore contract.

---

## 6. Draft Store and Draft Registry

### 6.1 Draft Store

The Draft Store persists full draft records by semantic draft key.

Current key-value storage is compatible with multiple independent records because each Action Identity resolves to a different key.

The required model is therefore not one global `currentDraft`; it is an identity-keyed collection of independent draft records.

### 6.2 Draft Registry / Index

A field-service App also needs a way to know which unfinished drafts exist without opening every possible Action.

The implementation includes a lightweight **Draft Registry** derived from the
actual identity-keyed draft records.

The Registry stores metadata only, conceptually:

```text
DraftRegistryEntry {
  identity
  updatedAt
  contentKind
  workOrderId
  status
}
```

It must not duplicate full form/editor contents.

In the current V1 implementation, the registry is not a second persisted
index. It enumerates typed draft keys for the current user, reads the matching
records through the shared Draft Repository, and derives the metadata snapshot
from those records. Malformed records are counted and ignored conservatively.

The Registry enables future capabilities such as:

- count unfinished local drafts;
- locate drafts for a Work Order;
- identify stale/incompatible drafts;
- cleanup completed/expired records safely;
- show a future "unfinished local work" surface if product evidence justifies it;
- support storage-pressure diagnostics.

The Registry is an architectural requirement, but this document does not require a new user-facing Draft Center in G4-D.

---

## 7. Storage boundary

All persistence goes through typed storage ports/adapters.

Feature and Action Content code must not directly depend on:

- `uni.setStorage` / `uni.getStorage`;
- `wx.*` storage;
- `plus.*` storage;
- browser localStorage;
- platform-specific database APIs.

The storage adapter owns platform mechanics. Action Runtime owns semantic draft keys and lifecycle.

Storage must support multiple records, not a single mutable slot.

---

## 8. Autosave and latest-revision safety

Editable Actions use debounced local autosave.

Expected flow:

```text
user edit
  -> in-memory editing state updates immediately
  -> draft revision increments
  -> draft becomes dirty
  -> debounce
  -> persist latest snapshot for that Action Identity
  -> saved_local
```

Autosave latency must never delay business-state reactivity.

The persistence implementation must protect against stale asynchronous writes overwriting a newer revision.

Required invariant:

> For one Action Identity, an older write may never replace the latest editing revision.

Forced flush points should exist where leaving the current editing step could otherwise occur before debounce completes, including workspace exit, transition to confirmation, and business submit where applicable.

The next page in the same active Action session must use current in-memory state. It must not reload an older persisted draft and overwrite newer editing state.

---

## 9. Restore behavior

When opening a new Action Workspace session:

1. read current authoritative Work Order / Workflow state;
2. derive the current semantic Action Identity;
3. locate the exact matching local draft;
4. validate draft compatibility/version;
5. restore semantic editor state only when compatible;
6. leave incompatible/stale records isolated for safe cleanup rather than applying them to the wrong Action.

A draft from a previous workflow node must never be applied to a newly active node merely because both display the same title.

Restore is Action-identity scoped, not "last draft wins" globally.

---

## 10. Weak-network submission behavior

Weak network may produce this sequence:

```text
edit content
  -> local draft saved
  -> user submits
  -> network/backend submission fails
  -> business operation remains unsuccessful
  -> local recoverable draft remains
```

The user must be able to reopen the same Action and recover the unfinished content when the semantic Action is still valid.

A retryable submit failure must not delete the draft merely because a submit was attempted.

### No automatic offline command replay in V1

The App does not automatically perform:

```text
failed business mutation
  -> enqueue command
  -> network restored
  -> background auto-submit
```

A generic offline command queue is intentionally not part of V1 because business commands may depend on:

- current workflow node;
- current authorization/handler;
- backend idempotency guarantees;
- ordering between Actions;
- current server data;
- conflicts created while the device was offline.

If a queued mutation engine is introduced later, it requires a separate program-level architecture and business decision.

Local draft recovery is required now; automatic business-command replay is not implied by it.

---

## 11. Media and large local content

Field-service Actions may later contain photos, files, signatures, audio, or other large content.

The generic draft JSON record should not blindly embed large binary payloads.

The target rule is:

```text
Draft semantic state
  -> references local persisted media assets
  -> media storage/upload lifecycle handled by dedicated capability
```

A local media reference may be part of a draft only when its lifecycle is stable enough to survive page exit/restart on the supported platform.

Temporary picker paths that are not durable must not be represented as safely recoverable drafts.

Media persistence and upload retry require explicit capability work when the corresponding Action Content is implemented.

---

## 12. Completion and cleanup

Before terminal business success, recoverable draft state remains protected.

After verified business mutation success:

1. business success becomes terminal;
2. draft finalization/cleanup is best effort;
3. cleanup failure does not turn business success into failure;
4. a completed tombstone or equivalent safe mechanism may be used to prevent an unfinished record from being restored after success;
5. Registry metadata is updated/removed consistently with the finalized record.

Draft cleanup and authoritative backend reread remain independent post-success concerns.

---

## 13. Retention and storage pressure

Multiple drafts require explicit lifecycle governance.

The architecture must support a bounded retention/cleanup policy, but no arbitrary retention period or maximum draft count is fixed by this document without product/platform evidence.

Future policy may consider:

- completed drafts;
- drafts whose workflow identity is no longer valid;
- incompatible schema/content versions;
- age since last update;
- local storage pressure;
- user/session ownership.

The system must never silently report "saved locally" after a storage write failure.

Eviction/cleanup must be conservative for unfinished field-service work.

---

## 14. User/session isolation and privacy

Drafts are user-scoped.

On session/user change, another user must not receive or restore drafts owned by the previous user.

The App must not expose cross-user draft metadata in UI or restore flows.

Logout behavior and long-term on-device retention should preserve this isolation even if physical storage records remain until later cleanup.

Sensitive content should follow the same data-minimization principle as the rest of the App; only data required for reliable restoration should be persisted.

---

## 15. Current implementation vs required target

At the current G4-D stage:

- semantic Action Draft identity is implemented;
- identity-keyed key-value storage can hold multiple independent draft records;
- the shared Action Draft Repository and record-derived Registry metadata
  snapshot are implemented;
- non-production Home diagnostics can inspect, seed, and clear known Mock draft
  records for the current user without exposing draft contents;
- Appointment is the first real Action Content consumer;
- local autosave/restore and terminal cleanup semantics exist for the current Action;
- a generic automatic offline business-command queue does not exist and is not authorized.

Still target/future implementation as additional slices require it:

- multiple production Action Content runtimes using the same Draft contract;
- storage-pressure/retention governance;
- durable local media persistence for media-heavy Actions;
- any user-facing multi-draft management surface, only if product evidence requires it.

The architecture is intentionally ahead of individual business slices so Inspection, Quotation, Contract, and other future Actions do not each invent incompatible local recovery behavior.

---

## 16. Verification requirements for future Action Content

Every new editable Action Content implementation must verify at minimum:

1. its draft identity cannot collide with another Action;
2. two different Work Orders can hold drafts concurrently;
3. two different Action Content identities can hold drafts concurrently;
4. saving one draft does not overwrite another;
5. reopening the exact Action restores only its own draft;
6. retryable submit failure retains recoverable local state;
7. successful business completion prevents unfinished-draft restoration;
8. stale/incompatible drafts are not applied silently;
9. latest-revision protection prevents old async writes from overwriting new state;
10. Mock and Real use the same draft semantics;
11. no local draft state is mistaken for backend success.

When conditional fields exist, also verify:

```text
Stored Draft State
!= Effective Business State
!= Submission State
```

Inactive values may remain recoverable locally while being excluded from active validation, confirmation, and business submission.

---

## 17. Architecture invariants

These rules are permanent review gates:

1. Multiple unfinished Action drafts may coexist on one device.
2. Draft identity is semantic and user/work-order/workflow/action/content scoped.
3. One Action Identity owns one latest unfinished draft, not unbounded local versions.
4. Draft capability is shared Action infrastructure, not feature-local storage code.
5. Different Action Content runtimes may serialize different content state behind the same generic lifecycle contract.
6. Stored draft state, effective business state, and submitted business state remain distinct.
7. Draft save success never implies backend business success.
8. Retryable business-submit failure preserves recoverable unfinished work.
9. No generic offline mutation replay is implied by local draft support.
10. Draft restoration never crosses semantic Action Identity boundaries.
11. Latest-revision persistence must be protected from stale async writes.
12. Large media uses durable local references/capabilities rather than uncontrolled binary embedding in generic draft records.
13. Draft Registry metadata must not duplicate full content.
14. Cleanup/retention is conservative and must not silently discard active field-service work.
15. Platform storage details remain behind typed adapters/ports.
