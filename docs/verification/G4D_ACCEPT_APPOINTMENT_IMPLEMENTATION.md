# G4-D Accept Order → Contact → Appointment

This document records the implementation slice after the accepted G4-D0 evidence checkpoint. It contains no production payloads, customer data, phone numbers, addresses, session values, or tokens.

## Scope delivered

- Added a typed command port for accept precheck, accept, appointment-form read, and appointment submit.
- Kept raw endpoint paths and the known appointment form-definition wire ID inside Adapter/infrastructure code.
- Reused the existing Workflow Runtime for node visibility, accept eligibility, current-task selection, and semantic action policy.
- Added the List pre-accept projection: one actor-eligible active `accept` node exposes `接单`; Detail navigation and direct contact remain unavailable until acceptance.
- Added explicit confirmation UI when the R1-shaped `selfExamination` response is non-empty.
- Added dynamic appointment form rendering from normalized definition fields and values. The observed semantic field shapes are `need`, `datetime`, and `note`; the UI does not hard-code backend form IDs.
- Closed the Dynamic Form Runtime bridge for the appointment slice: normalized appointment fields are mapped to Runtime schemas, effective visibility/read-only/required state is Runtime-derived, declared options are Runtime-validated, and submission values are Runtime-normalized before the command Adapter receives them.
- On command success, List and Detail state are invalidated and reread. Failed commands leave the existing read state intact; the UI never guesses the resulting status or workflow node.
- Mock and real reads/commands use the same Adapter and semantic feature path. Synthetic work-order commands are locally owned and cannot fall through to real transport.
- Mock and Real command responses share one transport normalization path. HTTP 200 `success: false` is a normalized failure, session markers become `session_invalid`, and malformed envelopes become `server_terminal`; backend messages are not presented by Vue.
- Real workflow/process and appointment-form upsert writes are blocked unless `VITE_XLINK_ENABLE_REAL_WRITES=true`. Read-only self-examination remains available in Real mode; Mock commands remain executable in Mock mode.

## Workflow and actor rules

Accept eligibility requires an active normalized `accept` node and verified actor visibility evidence. Current support includes the authenticated user and current role from `SessionSnapshot`. Complete role-set and organization-role membership support remains conservative/deferred because SessionSnapshot does not provide a verified complete set.

Detail current-task selection remains exactly-one visible, active, supported, and policy-allowed candidate. Array order, task label, status label, title, and button position are not selection inputs. Runtime-owned execution is `enabled` only for the explicitly authorized `set_appointment` slice; all other current-task intents remain `disabled_read_only`. Vue gates the action from this projection field rather than from its own action-intent exception.

## Appointment mapping

The Adapter recognizes the verified R1 appointment form definition internally and emits only the semantic `appointment` purpose. Form definition fields and existing form values are normalized into the typed read model. When no `formDataId` is present, the read returns the definition with empty values and does not query form data. When an ID is present, only that exact record is accepted and mismatches fail conservatively. Submit maps normalized values to the Adapter-owned form save command, obtains the saved form-data ID, then processes the current workflow node. Before submit, required fields, normalized option values, and read-only edits are checked locally; no date/time business-window rule is invented. `applyTimeStr` and calendar/reminder behavior remain read/display evidence only; no calendar write was added.

The appointment slice is intentionally bounded to the currently evidenced scalar
field values. If a future appointment definition introduces a normalized value
shape outside the current command port, the Dynamic Form Runtime returns an
explicit unsupported-capability result rather than silently sending it.

## Mock scenarios

The six Detail scenarios remain raw backend-shaped fixtures and pass through the same Adapter + Runtime path:

| Scenario | Normalized result | Expected Detail composition |
| --- | --- | --- |
| 001 | one visible active forms node; `interact_with_form` | Current Task `勘察`; read-only CTA `处理表单` |
| 002 | one visible active place-order node; `place_order` | Current Task `下单`; read-only CTA `去下单` |
| 003 | one visible active subworkflow node; `open_subworkflow` | Current Task `派工`; read-only CTA `查看子流程` |
| 004 | completed node plus active role-mismatched node | no Current Task |
| 005 | active node without visibility evidence | no Current Task |
| 006 | unknown node type/lifecycle | no Current Task |

The pre-accept list fixture uses an active actor-eligible accept node. Mock acceptance removes that accept node, changes the synthetic status through the existing STATUS lookup path, makes the row Detail-accessible, and exposes the appointment node in Detail. Mock appointment submission closes that appointment node and rereads Detail.

Additional direct-detail Mock harness entries cover direct accept, retryable and terminal accept-process failures, and retryable and terminal appointment failures. The existing accepted appointment scenario covers the required-field-empty state, successful submit, and post-success reread. These are raw backend-shaped fixtures routed through the same Mock transport normalization, Adapter, feature store, and Runtime projection path; no Vue scenario branch was added. Synthetic IDs are recognized as Mock-owned and are rejected before any Real request when Mock is off.

## Functional correction evidence

- R1 business failure semantics: HTTP success is not treated as command success by itself. `success: false` prevents success-side invalidation/reread and preserves a normalized error category.
- Form-data isolation: absent IDs never trigger an unscoped `getFormData`; returned form data must contain exactly the requested ID and the expected definition.
- Dynamic validation: required values must be usable, option values must be in the normalized option set, and read-only fields cannot be changed through the Detail store.
- Execution boundary: Runtime is the only source of the `enabled` decision. Only appointment execution is enabled in this G4-D slice.
- Real-write safety: the default is blocked for workflow/process and appointment-form upsert. No live business mutation was run against Beta or Production.

## Explicitly deferred

- Reject/refuse flow.
- Reschedule, cancel, reminders, SMS, and calendar integration.
- Middle-number/relay phone fallback and any new Contact API.
- Onsite/inspection completion and G4-E.
- Progress rail ordering and position semantics.
- Follow-up real read-model expansion.
- Service-part tenant cascade expansion beyond the accepted read path.

## Verification

The implementation verification commands are:

```text
pnpm run check:boundaries
pnpm run typecheck
pnpm test
pnpm run build:mp-weixin
pnpm run build:app
```

No production or Beta write was executed. Reject/refuse, reschedule/cancel, relay-phone fallback, calendar integration, and G4-E remain deferred/not started.
