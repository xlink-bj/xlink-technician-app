# Action Workspace Pattern

## Purpose

The Work Order Detail page is business context. The Workflow Runtime identifies
the semantic Current Action. An Action Workspace is the dedicated, reusable
execution surface for completing that action.

```text
Work Order Detail
  → Workflow Runtime Current Action
  → Appointment Workspace
  → time selection
  → confirmation
  → Action Content command
  → dedicated success state
  → authoritative reread
```

The first Action Content is the Appointment dynamic form. Its production flow
is split into a dedicated workspace, a friendly datetime selection page, an
explicit confirmation page, and a bounded success state. The time choices are
presentation controls for the verified datetime field; they do not claim
backend availability.

## Boundaries

- Workflow Runtime owns node visibility, Current Action selection, domain
  policy, and the enabled/disabled execution decision.
- Action Runtime owns Action identity, content kind, lifecycle, draft status,
  and the reusable workspace contract.
- The Workspace shell owns compact Work Order context, loading, draft feedback,
  sticky action placement, failures, and native page navigation support. It does
  not know Appointment fields.
- Action Content consumes normalized read data and Dynamic Form Runtime state.
  It does not call endpoints or platform storage APIs.
- Adapters own backend wire fields and Mock/Real transport selection. Vue does
  not branch on Mock scenario IDs or backend endpoint/status fields.

Only an enabled Action can open an executable Workspace. A semantic domain
policy decision is not itself a permission to execute a business mutation.

## Lifecycle and weak network

The common lifecycle is:

```text
available → in_progress → draft_local → submitting → succeeded
                                      ↘ failed_retryable / failed_terminal
```

Validation keeps the Workspace editable. Retryable and terminal submit errors
keep the current input and do not reread as if the business action succeeded.
Local draft save is independent from business submission: offline editing can
save locally, but no network cannot produce a fake business success. Once the
business command returns success, the business result is terminal success and
the submit affordance stays disabled. Draft finalization and authoritative
refresh are tracked separately; either may remain pending without turning the
business result into a submit failure or inviting resubmission.

## Draft identity, autosave, and restore

Drafts use the versioned semantic identity:

```text
UserId + WorkOrderId + WorkflowNodeRuntimeId + Action intent + content kind
       + content/form identity when available
```

The identity is encoded by the Action Runtime into the typed `StoragePort`
draft namespace. Appointment edits are debounced before local persistence.
Reopening the same action restores only a compatible unfinished record. A
different user, work order, workflow node, action, content identity, or draft
version cannot consume it. Successful submission best-effort finalizes the
unfinished record and then attempts the authoritative read; cleanup and refresh
warnings remain separate from the already-successful business result.

## Mock/Real parity and platform scope

Mock data and Real API reads follow the same Adapter → Runtime → Workspace
path. Mock provides direct development entries for fresh, retryable, and
terminal Appointment Workspace states; validation, draft restore, time
selection, confirmation, success, and post-success refresh warnings are
reachable through the same semantic path without source edits. Synthetic IDs
are owned by Mock transport and are blocked from Real transport.

The implementation uses standard uni-app page navigation, Vue components,
typed ports, and semantic storage, so the shell is shared by MP-WEIXIN, iOS
App, and Android App. It does not depend on Web-only lifecycle or overlay APIs.

## Deferred

Quotation, contract, media/signature, composite Actions, Progress, Calendar,
Reject, reschedule/cancel, reminders, relay/private phone, on-site/inspection,
and G4-E remain deferred. No general offline queue is introduced.
