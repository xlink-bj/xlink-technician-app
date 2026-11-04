# R1 A03 — Single FormData upsert encoder and Workflow separation

Parent: [R1-P1 #179](https://github.com/xlink-bj/xlink-technician-app/pull/179) at `1082a24d27c0e09e3c5faaec8fca38e140cc0f60`. Draft/unmerged.

## Source truth
Original R1 `xlink-app@6c0a97b/business/subpackages/serviceAppointment/serviceAppointment.vue`:
- `:7114–7184` has two distinct actions: `saveOnly` skips completion-only required validations, `saveForm` evaluates visible required fields. It includes extensions and node context in persisted `formData`.
- `:7208–7240` stamps `sid,smodule,workflowId,nodeId`; `:7400–7455` invokes `biz/extForm/upsert/{formDefId}` with JSON `dataStr`. Optional `need=1` calendar effect is separate. `:7528–7622` dispatches `workflow/process` only after appropriate saved FormData is available.
- The R1 branch **does not visibly delete datetime when need=0**. Owner decision on 2026-11-04: preserve a previously selected datetime in the outgoing FormData; omit it when no value exists. This source-backed payload choice does not prove live backend acceptance.

## Engineering change
Original adapter implemented two separate payload composers in `submitAppointment`: required path through `saveDynamicForm`, deferred path using its own `mapSubmitValues`. This creates a maintenance risk: new fields or media mapping might drift between branches.

Now `saveDynamicFormRecord` is **the single implementation** of `biz/extForm/upsert` for save-only, required submission and deferred submission. It uses the same `mapDynamicValues` + `sid/smodule/nodeId` + optional workflow/form id + `state=1` envelope. Public `saveDynamicForm` calls it with no workflow effect. `submitAppointment` performs the same write, then and only then calls separate `completeWorkflowNode`.

**Deferred Appointment behavior**: `need='0'` no longer uses a path-specific transport marker. The shared serializer includes an existing datetime carried by the current form values, while validation and confirmation keep it hidden and optional. Intent must match the selected `need` value. The generic non-Production real-write flag, Production read-only fence, durable receipts and special-node guards are unchanged.

## Tests and handoff
Behavioral tests prove: required and deferred payloads share the encoder, an existing deferred datetime is preserved, an absent datetime stays absent, intent mismatch fails before checkpoint, save-only never calls Workflow, durable receipts remain required, and any save failure cannot run Workflow. Real backend writes and readback remain prohibited/unverified.

Open gates: optional calendar device effects, special forms/repeat Workflow semantics, authentic Workflow save→Complete→reread permission and idempotency remain separate evidence gates; source parity is NOT production-run parity.
