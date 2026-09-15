# G4-UX Real Read-Path Integration Verification

Status: COMPLETE for the approved non-production Beta read-only journey;
structural items not observable through the Mini Program simulator are marked
DEFERRED rather than inferred from customer data.

Branch: `rebuild/g4-ux-production-baseline`

Verified HEAD: `da7053e3895a87efa38f62c0e303d62f29dbd638`

The Product Owner owns UX acceptance. This document records engineering and
read-path evidence only. No real customer data, credentials, cookies, tokens,
tenant values, phone numbers, addresses, or work-order IDs are recorded.

## ENVIRONMENT — PASS

- Target: approved non-production Beta configuration from local environment.
- Journey target: MP-WEIXIN simulator.
- Only read/session paths were in scope; production was not used.
- No appointment, workflow, follow-up, quotation, construction, acceptance,
  contact, or other business mutation was initiated.

## MOCK_OFF — PASS

- Home source indicator changed to `Real API` using the existing Mock Runtime
  control.
- The Mock scenario controls disappeared when the source was OFF.
- The live list returned backend-shaped data rather than local synthetic rows.
- Synthetic IDs remain locally owned and are blocked from backend fallthrough by
  the transport; this is covered by deterministic tests.
- The DevTools Network panel exposed only sanitized endpoint suffixes and HTTP
  status; no request values, response values, cookies, or headers were copied.

## LOGIN_SESSION — PASS

- Real Quick Login callback completed in the approved Beta environment;
  `phoneLogin.do` returned HTTP 200 in the Network panel.
- Authenticated Home rendered.
- Login and session bootstrap remained outside the Mock Runtime.

## HOME — PASS

- Authenticated Home rendered after the real session was established.
- The source indicator showed `Real API` after Mock was disabled.
- Home source switching did not alter the authentication/session store.

## LIST — PASS / DEFERRED SUBCHECKS

The real list read completed and rendered normalized `DATA` through the same
Adapter used by Mock data.

| Check | Result | Sanitized evidence |
| --- | --- | --- |
| SANode / ordinary path | PASS | `changeRole` returned HTTP 200. The Network panel observed successful `query` and `querySAWorkflowNode` reads across the real list/search journey; the Adapter selects the path from the resolved role scope rather than page state. |
| Pagination envelope | PASS | Adapter consumes the bounded `data.items.records` page shape and emits a normalized page; no raw counts or records persisted. |
| WorkOrderId source | PASS | List mapping reads `id` / `_id`; SANode rows are unwrapped from `node.data` before the same summary mapper runs. |
| displayNumber | PASS | Normalized from `orderNum`. |
| customerName | PASS | Optional normalized `name`; absent values are omitted. |
| district / address | PASS | Optional normalized location fields; absent values are omitted. |
| STATUS dictionary | PASS | Raw status is resolved through `code/query` with `valueOption=STATUS`; UI received the normalized task label. |
| repairParts cascade | DEFERRED | Adapter support exists for `exts.leakagesite_copy` plus `i/code/selectMultistageCode.do`; a suitable live row was not isolated for safe structural capture. |
| distance | PASS | Normalized from numeric/string `exts.distance` into display text. |
| community order count | DEFERRED | Adapter supports `exts.communityOrdersTotal`; the current read journey did not require or safely capture a representative value. |
| contact eligibility | PASS | Contact presentation was visible where supported and remained disabled when direct dialing was unavailable; no phone call was triggered. |
| search query | PASS | A non-sensitive no-match term produced a successful `querySAWorkflowNode` HTTP 200 read and the intentional empty-result state; clearing the term restored list DATA through a successful list read. |

## DETAIL — PASS / DEFERRED SUBCHECKS

The first live list entry was opened and the detail page completed its read-only
loading state.

| Check | Result | Sanitized evidence |
| --- | --- | --- |
| queryById → Adapter → WorkOrderDetail | PASS | `basic/serviceAppointment/queryById/<id>` with `type=query` is the accepted Adapter path; detail UI rendered successfully from a live list entry. |
| List → Detail ID consistency | PASS | Navigation from a live list entry completed without an ID mapping error. |
| displayNumber / customer / address | PASS | Detail uses the same bounded field mappers as List; normalized summary rendered. |
| STATUS label consistency | PASS | Detail performs the same `STATUS` dictionary lookup path and rendered a semantic task label. |
| service-part resolution | DEFERRED | No representative live cascade value was captured; no fallback or synthetic repair-part mapping was added. |
| workflowRunId | PASS | Detail adapter reads the verified run identity candidates into the typed detail model when present. |
| workflowNode shape | PASS | Raw nodes were normalized before the page; no raw `nodeDef`, numeric state, or handler composite reached Vue. |
| activity read | PASS | Read-only `biz/action/query.do` activity data rendered in the Follow-up tab; the Network panel showed `query.do` HTTP 200. |
| contact presentation | PASS | Contact availability/disabled presentation was inspected; execution was not invoked. |

## STATUS_DICTIONARY — PASS

- Real list/detail status labels were resolved through the Adapter's `code/query`
  lookup rather than a Vue or real-data-only label map.
- No new production numeric status mapping was introduced.
- Synthetic visual status codes remain confined to the existing Mock raw
  response → STATUS lookup → Adapter path.

## REPAIR_PARTS — DEFERRED

The read Adapter has a bounded cascade path and does not fabricate the previous
synthetic repair-part mapping. A live row with a safe, representative cascade
value was not captured during this checkpoint, so no production-shape claim is
made.

## CONTACT_PRESENTATION — PASS

- Contact state was presented as read-only capability state.
- Unavailable direct dialing stayed disabled.
- No real telephone call or contact mutation was performed.

## WORKFLOW_READ — PASS / DEFERRED SUBCHECKS

- A real detail response produced a Current Task through the existing Workflow
  Runtime projection.
- The displayed action remained `disabled_read_only`.
- Category/lifecycle/visibility normalization, including conservative
  zero/one/ambiguous selection, remains covered by deterministic semantic tests
  and synthetic scenarios.
- The simulator exposed successful read status but not a safe raw workflow
  envelope for persistence; no real values were saved and no policy was
  loosened to force a task to appear.

## ACTIVITY_READ — PASS

- Read-only activity/follow-up content rendered on the live detail page.
- No follow-up write was attempted.

## MOCK_REAL_PARITY — PASS / DEFERRED SUBCHECK

- Both sources use the same transport boundary, API Adapter, semantic model,
  Runtime projection, and Vue rendering path.
- No real-data-only Vue branch, fallback status map, or raw DTO leakage was
  added.
- No Mock fixture change was required by the observed journey.
- A raw-envelope parity comparison is DEFERRED because raw response values are
  not safe to persist; no real customer payload was copied into the repository.

## MISMATCH_HANDLING

- RAW SHAPE DIFFERENCE: none identified.
- NULLABILITY DIFFERENCE: none identified in the rendered journey.
- DICTIONARY DIFFERENCE: none identified; unresolved cascade evidence remains
  deferred.
- ADAPTER BUG: none identified.
- PRODUCT SEMANTIC GAP: some optional cascade/count evidence remains deferred
  without changing the UI.
- BACKEND CAPABILITY NOT YET VERIFIED: live raw workflow visibility detail and
  representative repair-part cascade shape remain deferred.

## VERIFICATION — PASS

- `pnpm run check:boundaries`
- `pnpm run typecheck`
- `pnpm test` — 15 files / 133 tests
- `pnpm run build:mp-weixin`
- `pnpm run build:app`

No Adapter or Mock fix was required during the real-read checkpoint, so no
integration-fix commit was created.
