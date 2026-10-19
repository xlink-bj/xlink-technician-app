# R1 A03 — Single FormData upsert encoder and Workflow separation

Parent: [R1-P1 #179](https://github.com/xlink-bj/xlink-technician-app/pull/179) at `1082a24d27c0e09e3c5faaec8fca38e140cc0f60`. Draft/unmerged.

## Source truth
Original R1 `xlink-app@6c0a97b/business/subpackages/serviceAppointment/serviceAppointment.vue`:
- `:7114–7184` has two distinct actions: `saveOnly` skips completion-only required validations, `saveForm` evaluates visible required fields. It includes extensions and node context in persisted `formData`.
- `:7208–7240` stamps `sid,smodule,workflowId,nodeId`; `:7400–7455` invokes `biz/extForm/upsert/{formDefId}` with JSON `dataStr`. Optional `need=1` calendar effect is separate. `:7528–7622` dispatches `workflow/process` only after appropriate saved FormData is available.
- The R1 branch **does not visibly delete datetime when need=0**. Do not silently treat New App's stricter value filtering as server wire parity.

## Engineering change
Original adapter implemented two separate payload composers in `submitAppointment`: required path through `saveDynamicForm`, deferred path using its own `mapSubmitValues`. This creates a maintenance risk: new fields or media mapping might drift between branches.

Now `saveDynamicFormWithSafety` is **the single implementation** of `biz/extForm/upsert` for save-only, required submission and deferred submission. It uses the same `mapDynamicValues` + `sid/smodule/nodeId` + optional workflow/form id + `state=1` envelope. Public `saveDynamicForm` calls it with no workflow effect. `submitAppointment` performs the same write, then and only then calls separate `completeWorkflowNode`.

**Preserved fail closed**: deferred `visitIntent='visit_deferred'` sets `safety='deferred_appointment_datetime_encoding_unknown'`; uni command transport refuses real dispatch until the backend encoding is source/tenant verified, even when real-write flag is toggled. Other normal forms do not receive that marker. No change to scope/role authorization, APIs, Mock fixture authority, UI or Golden.

## Tests and handoff
Behavioral tests prove: exact identical save payload, saved record ID captured for Workflow Process, save-only never calls Workflow, null fields omitted consistently, deferred branch passes the transport safety marker and does not complete on denial, any save failure cannot run Workflow. Existing appointment/Survey, R1 six-stage H5 Mock and 12 Goldens, `pnpm verify:critical` + `verify:full` and three platform builds must remain PASS.

Open gates: `need=0` date/time wire semantics, optional calendar device effects, authentic Workflow save→Complete→reread permission and idempotency remain special authorized environment work; static R1 source contract is NOT production-run parity.
