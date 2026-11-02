# Stage 2B — R1 FormDef primitive field parity (planned)

**Decision baseline:** `main@5b0c37373e46268e98ec651c9807575395f2235c` (Stage 2A). 2026-11-02.
**State:** `SCOPE_DEFINED / NOT_IMPLEMENTED`. This document does not authorize real business writes or native device acceptance.

## Closed engineering evidence to carry forward

- Stage 1B: synthetic 020 `forms` Save → full EXTS → Process and 021 `repeat` scoped CRUD/finalize with durable receipts and authoritative Mock readback.
- Stage 2A: reads the source-shaped `biz/extField/query` definition and validates/submits `textarea`, `text`, `radio` with exact option keys; persisted fields are independently compared on readback. The required `image` field is an R1 **presentation-only reference**, not a required media upload.
- `main@5b0c373`: [Validate](https://github.com/xlink-bj/xlink-technician-app/actions/runs/41474902859) and [Validate Main H5 UX](https://github.com/xlink-bj/xlink-technician-app/actions/runs/41474903145) passed. This is `OFFLINE_FUNCTIONAL`, not `LIVE_WRITE_VERIFIED` or native `DEVICE_VERIFIED`.

## Immediate acceptance debt (separate from business scope)

1. The 019 H5 regression previously assumed clicking `quotation-hub-start-new` returned to the old Order readback card. Current source `QuotationOrderHub.chooseNewOrder()` intentionally **resumes a hydrated local draft**, or **opens the new-draft choice screen** when appropriate. Preserve both behaviors and independently verify the original Order still exists exactly once after navigation; never interpret either UI state as another Order write. This is a test assertion repair, not a new quotation feature.
2. 019/020/021 synthetic H5 behavior may pass while native 430×932 interaction, keyboard overlap and actual WeChat rendering remain unverified for the Stage 2A additions. Keep the device/Owner visual gate separately labelled `NOT_RUN` until Mac evidence exists.
3. Real R1 `forms/repeat` arbitrary-node classification, Beta writes and transaction compensation remain tracked by [#201](https://github.com/xlink-bj/xlink-technician-app/issues/201). Stage 2A did not complete that issue's `WRITE_VERIFIED` criteria.

## Stage 2B bounded implementation scope

Expand the **same** DEV Mock FormDef-controlled editor and existing transaction/readback coordinator, without new backend endpoints or new commercial UI shell:

| Field family | Required work | Fail-closed rule |
| --- | --- | --- |
| `phone`, `IDNumber` | Preserve strings and leading zeros; source-controlled required/readonly rules | No numeric coercion, fabricated format or unsupported value key |
| `number`, `digit` | Bounded finite integer/decimal parsing and UI input, exact persisted type verification | No NaN, overflow, unproven units or silent rounding |
| `switch` | Preserve R1 wire `"1"` / `"0"`, including reload and receipt recovery | No implicit boolean rewrite or inferred default |
| `select` (inline verified options only) | Render/display source labels; persist source option values | Unverified `valueOption`/CodeService providers remain unsupported |
| Conditional visibility/read-only | Derive from the existing dynamic-form evaluator for the active mobile surface | No hidden value in new upserts; malformed dependencies block the affected submission |

The first slice may deliver the scalar families and inline `select` together; conditional dependencies are a separate slice if the source-shape fixtures prove they cannot be safely combined. Prefer one coherent vertical test fixture over artificial breadth.

**Explicitly deferred:** `checkbox`/`cascade` arrays and their wire codec; `bizSelect`, `area` and source option providers without verified scope; `file` upload permissions/media references; `image` reference URL rendering without an approved image-host/auth policy; dynamic AddFormCode/multiple-definition selection; optional-field **deletion semantics** (the current Mock upsert merges prior values, so attempting to clear an existing value remains blocked); arbitrary real-node `forms/repeat` writes; contract/signing/Production/Beta mutations.

## Acceptance / definition of done

1. Each supported field is projected from a freshly read, identity-checked FormDef. Tests include required, optional, invalid choice/type, malformed field identities, visibility, read-only, empty and excessive values. Never turn a presentation reference into an upload.
2. 020 and 021: create, edit, restart/reload, Save→Process, receipt recovery and mismatched **non-summary** field readback operate on the full validated field set; lost ACK never causes replay.
3. Run `verify:full`, H5 browser golden paths at **430×932**, MP-WEIXIN and App builds, and the exact-HEAD `Validate` + `Validate Main H5 UX` CI. Avoid adding extra expensive H5 checks on the ordinary PR/main fast lane unless their risk justifies it.
4. Commercial Mock and Real pages must share their interface; diagnostic provenance stays outside the primary business surface. A single native 430×932 WeChat pass is a **separate final gate**, delegated to local Codex only when Mac/WeChat access is actually required.
5. Preserve the existing main-only development policy, current R1 API semantics, and no Production/Beta business writes. `OFFLINE_FUNCTIONAL` never implies `LIVE_VERIFIED`, `DEVICE_VERIFIED`, or release approval.

## Exit from Stage 2B / next decision

Report exact supported field types, known unsupported fields, test and CI run IDs, and remaining schema-dependent needs. Decide **after evidence** whether the next work is array-valued fields/multiple FormDefs, a bounded live read parity check, or final commercial/native UX acceptance; do not implicitly include all three in Stage 2B.
