# Action Workspace Pattern

## Purpose

The Work Order Detail page is business context. The Workflow Runtime identifies
the semantic Current Action. An Action Workspace is the dedicated, reusable
execution surface for completing that action.

```text
Work Order Detail
  → Workflow Runtime Current Action
  → Appointment Workspace
  → single-datetime selection
  → confirmation
  → Action Content command
  → dedicated success state
  → authoritative reread
```

The first Action Content is the Appointment dynamic form. Its production flow
is split into a dedicated workspace, a friendly datetime selection page, an
explicit confirmation page, and a bounded success state. Appointment stores
one verified datetime value (`YYYY-MM-DD HH:mm`); quick time choices are only
presentation shortcuts and do not imply duration, availability, or capacity.

## Boundaries

- Workflow Runtime owns node visibility, Current Action selection, domain
  policy, and the enabled/disabled execution decision.
- Action Runtime owns Action identity, content kind, lifecycle, draft status,
  and the reusable workspace contract.
- The Workspace shell owns compact Work Order context, loading, generic draft
  feedback, persistent action placement, failures, safe-area/footer geometry,
  and native page navigation support. Action sub-pages use replace semantics
  when available to avoid stack growth. It does not know Appointment fields.
- Action Content consumes normalized read data and Dynamic Form Runtime state.
  Appointment-specific presentation roles use verified field keys (`need`,
  `datetime`, `note`); field order and generic field shape do not assign roles.
- The Action flow uses bounded native transitions: time selection is pushed,
  confirmation replaces it, edit returns to the existing workspace, and final
  success returns to Detail/List with a clean navigation reset.
  It does not call endpoints or platform storage APIs.
- Adapters own backend wire fields and Mock/Real transport selection. Vue does
  not branch on Mock scenario IDs or backend endpoint/status fields.

Only an enabled Action can open an executable Workspace. A semantic domain
policy decision is not itself a permission to execute a business mutation.

## Workspace structure

The reusable Workspace is structurally divided into scrollable business content
and a persistent action area:

```text
Native Page Header
Action Workspace Shell
  ├── compact business context
  ├── scrollable Action Content
  ├── Shell-owned status / feedback
  └── persistent Action Bar
```

The following are architecture invariants for all editable Actions:

1. Draft/autosave feedback is owned by the Shell and rendered exactly once.
2. The primary Action Bar is persistent and independent of Action Content height.
3. Action Content scrolls; the Action Bar remains outside the scroll container.
4. Safe-area and footer geometry are Shell responsibilities, not Action Content responsibilities.
5. Long supported Action Content must remain usable without moving the primary CTA into the content flow.
6. Action Content does not implement its own storage/autosave presentation.

These invariants apply to Appointment now and to future Inspection, Quotation,
Contract, Construction, Acceptance, and other supported Action Content types.

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

## Visual system

Action Workspace follows the App-wide living UI system in
`docs/ux/APP_UI_DESIGN_SYSTEM.md`.

The Workspace must therefore reuse the shared visual grammar for:

- page/surface background;
- card/surface treatment;
- typography hierarchy;
- primary/secondary/text actions;
- input, textarea, selector, and choice states;
- draft/status/error/success presentation;
- persistent Action Bar;
- shared icons.

Appointment is the first source surface for Design System v0.1, not a separate
visual system. Later Actions should reuse existing tokens/primitives/patterns
before introducing new ones.

## Mock/Real parity and platform scope

Mock data and Real API reads follow the same Adapter → Runtime → Workspace
path. Mock provides direct development entries for fresh, retryable, and
terminal Appointment Workspace states; validation, draft restore, time
selection, confirmation, success, and post-success refresh warnings are
reachable through the same semantic path without source edits. Synthetic IDs
are owned by Mock transport and are blocked from Real transport.

The implementation uses standard uni-app page navigation, Vue components,
typed ports, semantic storage, and platform-safe shared UI primitives, so the
shell is shared by MP-WEIXIN, iOS App, and Android App. It does not depend on
Web-only lifecycle or overlay APIs.

## Deferred

Quotation, contract, media/signature, composite Actions, Progress, Calendar,
Reject, reschedule/cancel, reminders, relay/private phone, on-site/inspection,
and G4-E remain deferred. No general offline queue is introduced.
