# Order ExtField supported-control Mock flow — 2026-11-05

Status: `SUPPORTED_CONTROLS_DEV_MOCK_CONNECTED / PRODUCTION_SCHEMA_NOT_CONNECTED / LIVE_WRITES_NOT_RUN`.

> 后续更新：本记录保留 `69831472` 时点的独立字段 fixture 验证。常规 Mock 入口现已移除额外 Order 字段开关，增加有界三级区域及共享媒体回归，见[本轮功能收口](G4F_NORMAL_QUOTATION_FUNCTIONAL_CLOSURE_20261105.md)。本记录的原始测试数量不代表后续 HEAD。

## Capability delivered

The actual main App quotation flow can read synthetic R1-shaped Order ExtFields and their exact Code/Cascade providers, render configured fields through shared controls, retain local values, project Order.exts, save a type-0 quote, and reconcile its fields after conversion to a distinct type-1 Order. This is enabled only by the explicit DEV fixture `VITE_XLINK_ORDER_FIELDS_QA=true` in the existing continuous Mock journey. It does not replace current tenant configuration with a fixed commercial schema.

The fixture contains synthetic field IDs, keys, labels and options. Its control types and relationships reproduce R1 behavior; its contents are not the identities or business values of the two Production contexts previously observed. No Production/Beta transport allowlist or command capability was widened.

## Data and validation path

1. The in-memory authorized Mock actor reads `biz/extField/query` with `colName=order`, active state, mobile-detail surface, `page=1,size=50`, `order asc`, no `_all`. Missing/truncated definitions or duplicate row identities block loading.
2. Only returned provider identities are read. Code uses the R1 `[{ eleid, options }]` envelope; Cascade uses `[{ type, children }]`. The implementation reuses existing `dynamicCodeOptions` and `cascadeCodeOptions` parsers. Unknown business providers cannot become supported by supplying arbitrary Code options.
3. The pure source mapper preserves row identity, stage/service/person applicability, visibility and dispensable rules. A caller may supply resolved Code/Cascade options; absent, unknown or unsupported capabilities remain blocked.
4. Entry to product selection checks currently visible required fields. Final validation independently checks the source-derived final obligations: hiding a required field does not waive it; a matching dispensable condition only waives final requiredness.
5. The Order wire projection traverses the complete configured field set, retains numeric zero and configured hidden values, omits empty strings/false under the R1 presence condition, and blocks unsupported structured/nonfinite values and unverified media. Existing reserved Order metadata cannot be replaced by generic field values in the encoder.
6. The existing Mock quote/Workflow-start/Order protocol and durable receipts remain distinct. Every expected dynamic ext key is now compared against quote and official Order readback; a returned ID and matching total alone cannot establish field persistence.

The reusable quotation engine accepts a scoped field-runtime input and refuses encoding when it is invalid or belongs to another service context. The production quotation writer remains closed. This is not an authorization grant or a replacement for authoritative server validation.

## Drafts and recovery

- Field drafts are separate from product-composition drafts, persistent type-0 quotes, type-1 Orders and Workflow completion.
- Storage is scoped to the synthetic user/role/WorkOrder and checked against service context. No session reference is stored in draft keys or records.
- Local saves check persisted revision under a shared draft lock. H5 uses Web Locks across tabs; native targets serialize within the process. A stale edit fails without overwriting the current draft. Missing H5 lock support fails closed.
- The editor queues local saves, retains current input when a save fails/conflicts, and blocks submission until local state is confirmed. Already queued authorized saves drain when leaving the component. Malformed records remain intact.
- Independent product/field draft feedback is aggregated in the existing Workspace Shell. Failure and saving take precedence over a saved badge; no second passive autosave strip is rendered inside the field editor.
- Reload restores local values. If no local field record exists, configured values can be restored from the exact scoped, identity-checked existing type-0 quote. Unmapped values are not promoted into editable fields.
- Actor changes invalidate the session. Quote creation/conversion checks field-draft freshness before proceeding. Fields are locked after quote dispatch/confirmation, preserving the existing receipt fingerprint rather than silently editing an already-saved quote.

## Verification

- `pnpm run verify:full`: PASS, 204 files / 1,793 tests, including typecheck, boundaries and quality checks on the implemented slice.
- Actual main App H5, 430×932, explicit field fixture: PASS. Covers ordinary Material SPU without SKU, Procedure, missing entry fields, conditional final requiredness, invalid digits, zero, Cascade confirmation, durable field saves, stale second-tab edits, refresh restoration, quote save/readback and type-1 conversion/readback. External browser requests: 0.
- H5 / MP-Weixin / App builds: PASS. Native DevTools/simulator/device execution: NOT RUN under the Owner's Stage B exclusion.
- Baseline main App H5: 64 PASS / 26 fixture-gated SKIP / 0 FAIL. The previously failing 390px priced quote/Order case passed separately; the ordinary no-SKU and SKU-draft 390px cases passed in the baseline run. Final exact-SHA CI is recorded in Issue #207; incomplete or skipped scenarios are not counted as passing.
- Main-push CI now explicitly runs the new 430px field fixture, rather than relying on a skipped test in the default suite.

Local actual-App screenshots (not committed or uploaded):

- `test-results/main-h5-mock/evidence/order-fields-required-error-430x932.png`
- `test-results/main-h5-mock/evidence/order-fields-filled-430x932.png`
- `test-results/main-h5-mock/evidence/order-fields-order-readback-430x932.png`

The screenshots were inspected for horizontal overflow, field alignment, error placement, selector reachability and footer overlap. No matched-scene before/after commercial acceptance is claimed. `COMMERCIAL_UI_ACCEPTED` remains an Owner decision.

## Remaining boundaries

- The active Production `area`, configured business button and Order media semantics remain blocked. This slice does not claim those controls are supported or that the current tenant's complete quotation schema is executable.
- Configured `submitOrder` fields remain subject to their own applicability and final validation; the current supported-control fixture focuses on `placeOrder` data and conversion of its already-confirmed snapshot. It does not implement arbitrary edits of a persisted quote during conversion.
- Live field identities/labels/provider contents, full context coverage, server persistence/authorization, discounts/coupons, documents/messages and signing remain separately unverified or closed. Issue #201 remains HOLD.
