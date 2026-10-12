# M1-I2 — SKU local edit/remove: verified source and parity delta (2026-10-12)

**Only business source:** `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` `business/subpackages/order/placeOrders.vue`.
**New App:** `xlink-bj/xlink-technician-app` Draft #104 stacked on #103. Source inspection and synthetic tests do **not** establish live R1 business E2E, authorized prices, or official Order payload parity.

## Source-backed behavior and exact remaining gaps

| Behavior | Pinned R1 evidence | Current New App local behavior | Acceptance caveat |
| --- | --- | --- | --- |
| SKU selected attributes / identity | `placeOrders.vue:2965–3036` renders per SKU attribute codes and a stepper; `:6251–6265` uses `sku.exts[key]` to match | 3-way SPU+Code+SKU read preview, then record only the verified `skuId` + attribute codes + integer count; attribute maps compared independent of insertion order | **UNVERIFIED live:** R1 `getMaterialSKU` maps raw `item.exts` to `{ commonName, attributeValues:{} }` at `:6191–6234`, then matcher reads properties not preserved by that transform. No assumed workaround or fabricated fields. |
| Quantity editing / removing | `placeOrders.vue:3009–3036` uses `van-stepper` with `integer`, `:min="0"`; `:6267–6275` sets SKU count from `e.detail` (or zero), then SPU `number` to the sum | Only **positive 1..9999** SKU choices are persisted in local v4; workbench offers per-SKU remove. Removing one SKU recomputes parent count, removing last also removes the parent SPU (no zero-quantity ghost line) | This is **explicit local UX equivalence approximation, not exact R1 transient zero-count state**. `50 SKUs` / `9999 each` limits are defensive local caps, not proven R1 limits. |
| Multi-group identity | R1 scoped Order grouping needs route/data inspection; no live sample confirmed | Same Material SPU can appear in separate repair groups with distinct SKU quantities; removing in A does not mutate B | Only deterministic local-store equivalence is tested. |
| Role switching | No role key in New App `ActionDraftIdentity`: `src/runtimes/action/types.ts` contains user/workOrder/workflowNode/intent/contentKind/optional contentIdentity | Current `ActionDraft` is isolated by user, workOrder, workflowNode, **not by role** | **BLOCKED for same-user cross-role acceptance:** bind role transitions to active readable scope and test stale-cache clearing before declaring valid recovery; do not invent a backend ACL. |
| Package SKU | R1 `placeOrders.vue:6306–6352` projects Package SKU without original `spuid` and exact attribute fields | Local Package model remains separate from material SKU local-intent path | Runtime payload equivalence unresolved. |
| Official quotation | R1 emits prices and other commercial data not supported by verified New App SKU catalog contract | `validateQuotationDraft` adds `material.sku_local_only`; Order.type=1 encoder denies SKU path | **Fail closed**: no fake price, official Order, PDF, contract, workflow completion, or Production/Beta write. |

## Additional Lead direct fix: in-memory cross-role / async read guard

- `src/features/work-orders/action-workspace.ts` now snapshots authenticated `sessionRef + userId + currentRole.id + roleVersion` at action load start, rejects pending Work Order / form / quotation recovery results if this identity changes, and invalidates the cached action rather than returning the previous role's descriptor from `ensureLoaded`.
- `tests/g4d/action-workspace.test.ts` covers same-user roleVersion cache invalidation and same-user role ID transition mid-read. No fake backend authorization or migration was introduced.
- **Residual critical gate:** historical v2/v3/v4 local drafts still have no recorded role provenance; this memory/session guard **does not prove role-safe persisted-draft re-entry after app restart or newly authorized role load**. Do not misrepresent this as complete cross-role isolation. R1 live role entitlement + old-draft migration/recovery choice must be demonstrated before I2 acceptance. No automatic deletion/migration of old local drafts.

## Implementation in Draft #104

- `model.ts`: same-key/value identity check; `removeLocalQuotationMaterialSkuChoice` only touches an exact SKU in one material SPU of one repair group; final SKU removes that material.
- `composition-store.ts`: idempotent save for attribute-order changes, scoped removal, quantity-input synchronization, dirty local-draft persistence.
- `QuotationActionContent.vue`: visible per-SKU remove action on the **actual** quotation workbench; last choice explicitly labeled “移除材料及规格”; read/edit capability guard retained.
- `tests/g4f/r1-material-sku-local-draft.test.ts`: matching order, changed/duplicate combinations, single-SKU removal in A with B preserved, final-line cleanup, local repository flush/reopen, `material.sku_local_only` readiness block.
- Validate, H5/MP/App checks must be attached for the **final HEAD** before acceptance. MP/App bundles are not native runtime verification.

## Next evidence to finish I2 (not to expand I3)

1. Codex local: pinned R1 actual route/returned `exts` evidence (or clearly `NOT_RUN`), same-user role change and draft readback, genuine Vue H5 SKU select/edit/remove/reentry screenshots and assertions at 375/390 px, error/unavailable states.
2. Lead: inspect precise-head CI/diff and browser evidence; fix any failure and write a PASS / NEEDS FIX / BLOCKED decision.
3. Do **not** mark I2 4/4 or start I3 until I2 #92 DoD is met; retain #29 Beta and #64 device Gate separately.

**Eight-iteration tracker:** I1 ACCEPTED, I2 IN_PROGRESS 1/4; overall M1 1/8 ACCEPTED (12.5%). The additional GitHub PR is a batch within **I2**, not a ninth iteration.
