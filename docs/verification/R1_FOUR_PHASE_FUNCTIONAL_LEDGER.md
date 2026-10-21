# F1 — Forms / Repeat Existing Records: functional delivery, not write parity

Parent A06-B Draft #197 exact `345dbe79bfdbe53af4ce75721ab6ef188c25b1ef`. R1 reference `xlink-app@6c0a97b`, backend remains unchanged.

## Shipped behavior (offline; read-only records)
- R1 `forms`: `serviceAppointment.vue:10237–10280` reads `currentNode.exts.formList`; a saved node form includes `_id`, `formDefId`, `formTitle`, `state=1/-1`. On an already authorized WorkOrder detail, the read adapter retains **only** typed reference IDs, optional title and state — not the raw FormData values.
- R1 `repeat`: `serviceAppointment.vue:10284–10324` separately queries `biz/extForm/query/{formDefId}` with an R1 workflowId filter; an optional **already included** `node.formDataList` may be displayed. If the detail has no embedded `formDataList`, it is **not queried** and is **not evidence of zero records**.
- Read mapper `readR1NodeFormList` returns `undefined` if no R1 list evidence; rejects malformed or duplicate record identities; caps displayed entries at 50 and marks truncation. Unknown server status is not labeled as completed.
- The WorkOrder Detail shows `R1NodeFormsOverview` when the **selected, authorized current task** has already-read list evidence. Empty, malformed, deleted, unknown and truncated states are distinct. Only read model and display: **no Add, Delete, UpdateExts, FormData save, Workflow Process, or extra backend read is triggered by this view.**
- Existing A06-A durable write fence and A06-B special-node mutation denial remain unchanged. Normal single-record path and the DEV-only Mock-019 local preview remain independent.
- All UI text and list data are from the authorized WorkOrder detail context; no raw customer fields, phone, FormData values, cookies, or auth headers are persisted in the list projection.

## NOT yet delivered / evidence needed
- **Forms full parity:** create/edit/delete a specific form; preserve list consistency; POST `workflowNode/updateExts/{runtimeNodeId}` JSON `exts.formList` and special blank-data-ID Workflow Process; idempotency/reconciliation after uncertain intermediate writes.
- **Repeat full parity:** explicitly authorized `biz/extForm/query/{formDefId}` filter `is:workflowId|string#and`, bounded paging, child subflow resolution, individual persisted records and multi-record Process joined IDs, cleanup and readback.
- **First pilot real node types, sample shape and effective permissions:** Codex Issue #199, only in already-approved limited read scopes; otherwise NEEDS_SCOPE_APPROVAL. No real business writes.
- **WeChat developer tools and device checks:** pending local environment, independently labeled DEVICE_VERIFIED.

## R1 six-stage functional parity baseline (no false release claims)

| Stage | Already-known New App implementation | What prevents claiming R1 parity | Evidence status |
|---|---|---|---|
| L Login/role | SMS/login/session, role context and dev quick login | R1 password/consent/legal ownership; real device/login acceptance | PARTIAL / source-only |
| W WorkOrder | ServiceAppointment list/detail/current workflow, role display | real role-node eligibility & CRUD parity; forms/repeat cross-node state | PARTIAL / offline |
| A Appointment | time-picker UX and dynamic form, durable save/Process fence | `need=0` authentic encoding; R1 forms/repeat node variants, live writes | PARTIAL / offline |
| S Survey | dynamic fields, conditional display, local drafts/media workflows | multi-form/repeat source parity, actual media writes, real readback | PARTIAL / offline |
| Q Quotation/Order | catalog read, grouping, Quote Editor/Order hub, client safety fences | effective tenant SKU and price, R1 type=1 writes/idempotency; true Order readback | PARTIAL / offline |
| C Contract/sign | contract/Order read, offline signing preview | real signer scope, legal signing/SMS/PDF and write/readback parity | PARTIAL / offline |

No row is `LIVE_PASS`. **Next:** actual forms/repeat record read + write-step atomicity contract, then Q effective-price/Order and C real contract mapping; bounded device tests begin as soon as approval permits.

## Offline acceptance
Focused source-shape/negative cases; exact HEAD TypeScript, test suites, H5/MP/App builds, six-stage H5 Mock, original Gallery and Business Goldens all PASS. PR stays Draft and branch stacked; backend unchanged; no live API/DB request or business mutation.
