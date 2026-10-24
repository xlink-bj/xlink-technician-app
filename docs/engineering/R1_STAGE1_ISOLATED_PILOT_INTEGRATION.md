# R1 Stage 1 — isolated Pilot wiring and authoritative readback

Status: **OFFLINE CODE VERIFIED / LIVE PILOT NOT AUTHORIZED / STAGE 1 HOLD** (2026-10-24).
This note documents a candidate integration boundary, **not** an instruction
to turn on write flags or use Production. The source of business truth remains
the fixed R1 client and the #199 evidence.

## What the integration actually does

1. `createIsolatedR1Stage1Pilot` assembles existing uni read/command
   transports **only** for `staging`, an exact separately approved HTTPS
   Beta API URL, both `VITE_XLINK_ENABLE_REAL_WRITES=true` and
   `VITE_XLINK_ENABLE_R1_SPECIAL_WRITES=true`, a complete authenticated
   session/roleVersion, and a supplied Owner authorization predicate. Merely
   setting build flags is insufficient.
2. The authorized actor scope must be
   `JSON.stringify([sessionRef,userId,roleId,roleVersion])`. The WorkOrder
   must be role-listed; the scoped forms/repeat runtime node, run, definition
   and any child subflow parent must pass a fresh read **before each command**.
3. Source-aligned FormData upsert, EXTS JSON, repeat remove and Workflow
   Process travel through the already-audited command gateway. No alternate
   generic save, implicit button, signature, PDF, Order edit or retry route.
4. A successful multi-command ACK is **not** reported as a verified business
   transition. A second read must prove the exact node/run/definition,
   lifecycle, all affected FormData IDs and full raw values. For forms
   save/delete, normalized node references and independently read raw EXTS
   must match. For repeat remove/save, a complete workflow-scoped query is
   mandatory. Incomplete pages, stale roles, unknown states, missing fields,
   contradictions and transport failures retain the durable replay fence.
5. A fully verified result closes that fence. A partially dispatched or
   uncertain receipt remains for manual reconciliation. The new service
   intentionally never replays uncertain commands.

## Exact readback requests (isolated Beta only)

| Purpose | R1 source route | Safety condition |
| --- | --- | --- |
| Full FormData by exact server ID | `POST biz/extForm/query/{formDefId}` | Single row, at most two queried, all actor/WorkOrder/node/run identities match |
| Forms EXTS | `POST basic/serviceAppointment/queryById/{sid}` | No `type=query` bypass; WorkOrder and runtime node match; full `exts.formList` |
| Repeat list | `POST biz/extForm/query/{formDefId}` | Exact workflow run, non-deleted rows, <=20 and a proven complete page |
| Workflow completion | Fresh role-scoped `getWorkOrderDetail` | Exact runtime identity + `lifecycle=closed` + independently fetched FormData; never ACK alone |

Raw response content is transient. Persisted receipts hold **identities and
step state only**, never FormData values or customer records. The reader stays
in an Adapter; the coordinator owns the authorization and transaction
lifecycle. `createApplication` does **not** instantiate this pilot; there is
no automatic pilot route or Production write path.

## Readback status vs real business meaning

| Status | Meaning / next step |
| --- | --- |
| `not_authorized` | Environment/Owner/role/list condition missing; do not send |
| `manual_reconciliation` | Transaction failed/partly sent/unknown; inspect server manually, do not retry |
| `awaiting_readback` | ACK may be present, but independent proof is missing; keep receipt and recheck after evidence |
| `verified` | Exact source readback passed and persistent replay fence was safely released |

This facade is presently a **test-assembled Beta candidate**, not a live user
interface. The existing dynamic-form Mock progression is separate from this
source-backed Pilot; visual/functional Mock success must not be represented as
a real write.

## Remaining non-code acceptance inputs

- Owner must designate **one isolated writable Beta** URL, test actor and role,
  explicitly bounded WorkOrder, verified `forms/repeat` runtime node and
  FormDefinition/run IDs, and which commands may be tested. Establish cleanup
  and rollback before sending any commands. The prior Production permission
  covers login/limited reads only.
- Codex may assist strictly with local intranet reachability and WeChat
  DevTools/device evidence; ChatGPT owns the implementation, tests and review.
- After scoped Beta success, prove fresh query/receipt and navigation feedback
  on an actual Mini Program. Then handle the separate R1 `button` semantic
  decision, Order list discrepancy, and Order/SKU/Contract signing or PDF
  permission gates. No commercial mutation is enabled by this slice.
- Keep [PR #217](https://github.com/xlink-bj/xlink-technician-app/pull/217)
  Draft. No `main` merge, staging write, Production access, or deployment is
  implied by this documentation.

## Synthetic regressions

- `r1-stage1-scoped-gateway.test.ts`
- `r1-stage1-pilot-reconciliation.test.ts`
- `r1-pilot-authoritative-readback.test.ts`
- `r1-stage1-pilot-composition.test.ts`

The scenarios cover unapproved/Production targets, role drift, missing raw
evidence, Process completion, repeat pagination, exact-ID conflicts and
replay-fence release. Tests use injected memory storage and transports, **not**
live R1 requests.
