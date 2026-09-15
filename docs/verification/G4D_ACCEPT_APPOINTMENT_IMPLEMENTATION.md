# G4-D Accept Order → Contact → Appointment

This document records the implementation slice after the accepted G4-D0 evidence checkpoint. It contains no production payloads, customer data, phone numbers, addresses, session values, or tokens.

## Scope delivered

- Added a typed command port for accept precheck, accept, appointment-form read, and appointment submit.
- Kept raw endpoint paths and the known appointment form-definition wire ID inside Adapter/infrastructure code.
- Reused the existing Workflow Runtime for node visibility, accept eligibility, current-task selection, and semantic action policy.
- Added the List pre-accept projection: one actor-eligible active `accept` node exposes `接单`; Detail navigation and direct contact remain unavailable until acceptance.
- Added explicit confirmation UI when the R1-shaped `selfExamination` response is non-empty.
- Added dynamic appointment form rendering from normalized definition fields and values. The observed semantic field shapes are `need`, `datetime`, and `note`; the UI does not hard-code backend form IDs.
- On command success, List and Detail state are invalidated and reread. The UI never guesses the resulting status or workflow node.
- Mock and real reads/commands use the same Adapter and semantic feature path. Synthetic work-order commands are locally owned and cannot fall through to real transport.

## Workflow and actor rules

Accept eligibility requires an active normalized `accept` node and verified actor visibility evidence. Current support includes the authenticated user and current role from `SessionSnapshot`. Complete role-set and organization-role membership support remains conservative/deferred because SessionSnapshot does not provide a verified complete set.

Detail current-task selection remains exactly-one visible, active, supported, and policy-allowed candidate. Array order, task label, status label, title, and button position are not selection inputs. The projection continues to report `execution: disabled_read_only`; command adapters are present for the authorized implementation slice, while no live Beta or production mutation was executed during verification.

## Appointment mapping

The Adapter recognizes the verified R1 appointment form definition internally and emits only the semantic `appointment` purpose. Form definition fields and existing form values are normalized into the typed read model. Submit maps normalized values to the Adapter-owned form save command, obtains the saved form-data ID, then processes the current workflow node. `applyTimeStr` and calendar/reminder behavior remain read/display evidence only; no appointment-time mutation or calendar write was added.

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

No production or Beta write was executed. No appointment implementation beyond this bounded slice was started, and G4-E remains not started.
