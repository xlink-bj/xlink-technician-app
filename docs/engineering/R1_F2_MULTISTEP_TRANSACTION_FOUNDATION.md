# Stage 1B — R1 forms/repeat multi-step transaction foundation

Parent F1 Draft #200 exact 414bac272ccfa14880626515864aa8b3dd921731. Source versions: R1 app 6c0a97b; R1 backend 5fc008d, unchanged.

## R1 source-backed workflow contract
- R1 serviceAppointment.vue:7213–7236: repeat/subflow uses currentNode.workflowId and currentNode._id; normal forms uses activeTab.detail.name.
- R1 serviceAppointment.vue:7399–7457: FormData upsert first; forms calls saveNodeExts(saved), repeat only refreshes the list.
- R1 serviceAppointment.vue:10237–10273: forms saves the FULL current node exts as JSON via workflowNode/updateExts/{node._id}, retaining existing formList, followed by Process only when the workflow node is active.
- R1 serviceAppointment.vue:7566–7618: forms after-save Process clears both node form ID slots; separate forms finalize supplies definition ID and empty data ID.
- R1 serviceAppointment.vue:7642–7666: repeat batch Process uses actual runtime subNode ID and comma-joined saved FormData IDs.

## Implemented — PURE OFFLINE ONLY
1. r1-forms-exts-plan.ts: full-fidelity JSON updateExts planner; validates authoritative exts.formList, saved _ids, duplicate records, preserves unknown sibling keys, appends/replaces/soft-deletes while leaving original snapshot untouched. This is not safe to reconstruct from the redacted WorkOrderDetail form-list summary.
2. r1-multistep-offline-transaction.ts: actor/user/node/form-scoped persisted dispatch/ACK receipt state machine. Forms plan: upsert -> updateExts -> Process. Repeat: N upserts -> batch Process. Marks BEFORE each externally supplied step; stores acknowledged IDs only. Ambiguous response, malformed ACK, storage failure, restart, role switch => hold for manual reconciliation; no automatic replays. H5 requires cross-tab Web Locks. Only injected synthetic executors exercise this module.
3. Tests: exact R1 mutation plan, unknown and duplicated IDs, preservation, per-stage unknown outcome, storage loss, role mismatch, double-run prevention, lack of Web Locks.

## Explicit blockers — this does NOT finish Stage 1B
- The new state-machine is not imported by the real API command adapters or the UI. A06-B still blocks actual forms/repeat special-node business writes. Do not treat a source-only updateExts plan as actual backend authorization.
- WorkOrder multi-form create/edit/delete field editor, addFormCodeId option picker, repeat submitHideNodeId conditions, backend JSON updateExts transport and full readback are NOT implemented.
- Exact first-pilot runtime nodes/formList/tenant permissions require #199 local read-only evidence (within previously approved endpoint scope only); full live write/readback needs separate Owner approval.
- No production/Beta API reads or business writes, no backend changes, no merge or deployment. CI is OFFLINE_FUNCTIONAL evidence only.

Follow-up: Stage 1B Issue #201; project roadmap #198; Codex local evidence #199. Validate with targeted/full tests, H5/MP/App, six-stage Mock and unchanged Goldens.