# F3 — Multi-form local draft interaction on the WorkOrder Detail

Base: F2 Draft #202 exact 4933dbd11b43f49f58818d0d9051cb8041589b26.

**Functional delivery:** Real WorkOrder Detail's existing source-proven R1 forms/repeat list now supports local draft intents:
- Repeat: add **local** draft with an existing source-proven FormDefinition ID, choose title, persist under session/role/workorder/runtime node isolation.
- Already-returned, non-deleted records: stage title-edit intent or stage deletion; undo any intent. No backend _id is created from local IDs. Malformed/truncated/missing form lists are read-only; no R1 form definition is invented for forms addFormCodeId.
- Local data is persisted through the existing StoragePort draft namespace, can be restored under the same actor/session scope after app restart, and intentionally cleared from in-memory view on role/workorder switch. Key includes WorkOrder, runtime node, source node type and effective authenticated scope.
- Storage read corruption, inaccessible storage, failed writes and stale async response fail closed. No original server form list or records are changed. Each intent prominently says **未同步**; there is no Confirm/Submit/Workflow button.
- The F2 source-only transaction planner is not imported by this UI; the A06-B real Command Port still denies forms/repeat special writes. No backend read/write is triggered by this local interaction.

**Limits:** Title-edit intent is **not** field-value editing. Real FormDefinition fields, R1 addFormCodeId choices, row FormData values, ACLs and media rights must be evidenced and read under approved scope before a field editor or backend writer can be enabled. F3 is an on-device workflow for preparing operations, not complete forms/repeat CRUD. Codex local issue #199 remains pending. We do not claim actual multiple-form R1 parity, server atomicity, device verified or release ready.

**Acceptance:** scoped Store tests for local add/edit/delete/undo, restoration, role separation, malformed data and stale reads; exact-head critical/full Vitest, typecheck, H5/MP-Weixin/App builds, six-stage H5 Mock, unchanged Gallery and Business Goldens. No network business writes, backend changes, main merge or deployment.
