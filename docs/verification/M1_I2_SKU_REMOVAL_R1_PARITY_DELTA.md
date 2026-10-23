# M1-I2 — SKU local edit/remove: verified source and parity delta (2026-10-12)

**Only business source:** `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` `business/subpackages/order/placeOrders.vue`.
**New App:** `xlink-bj/xlink-technician-app` Draft #104 stacked on #103. Source inspection and synthetic tests do **not** establish live R1 business E2E, authorized prices, or official Order payload parity.

## Source-backed behavior and exact remaining gaps

| Behavior | Pinned R1 evidence | Current New App local behavior | Acceptance caveat |
| --- | --- | --- | --- |
| SKU selected attributes / identity | `placeOrders.vue:2965–3036` renders per SKU attribute codes and a stepper; `:6251–6265` uses `sku.exts[key]` to match | 3-way SPU+Code+SKU read preview, then record only the verified `skuId` + attribute codes + integer count; attribute maps compared independent of insertion order | **UNVERIFIED live:** R1 `getMaterialSKU` maps raw `item.exts` to `{ commonName, attributeValues:{} }` at `:6191–6234`, then matcher reads properties not preserved by that transform. No assumed workaround or fabricated fields. |
| Quantity editing / removing | `placeOrders.vue:3009–3036` uses `van-stepper` with `integer`, `:min="0"`; `:6267–6275` sets SKU count from `e.detail` (or zero), then SPU `number` to the sum | Only **positive 1..9999** SKU choices are persisted in local v4; workbench offers per-SKU remove. Removing one SKU recomputes parent count, removing last also removes the parent SPU (no zero-quantity ghost line) | This is **explicit local UX equivalence approximation, not exact R1 transient zero-count state**. `50 SKUs` / `9999 each` limits are defensive local caps, not proven R1 limits. |
| Multi-group identity | R1 scoped Order grouping needs route/data inspection; no live sample confirmed | Same Material SPU can appear in separate repair groups with distinct SKU quantities; removing in A does not mutate B | Only deterministic local-store equivalence is tested. |
| Role switching | R1 pinned page does not establish a role-scoped local draft ownership contract | **Implemented:** v3 quotation ActionDraft key binds user+role+workOrder+node; runtime sessionRef/roleVersion invalidates in-memory context; previous v1/v2 no-role drafts remain preserved, never auto-restored under a new role; explicit start-new choice required | **CODE PASS**, verified by 831 unit tests and 2+17+26 H5 CI at `3060e5c`. **Live authorized R1 role/SKU entitlement unverified**; no backend ACL is claimed. |
| Package SKU | R1 `placeOrders.vue:6306–6352` projects Package SKU without original `spuid` and exact attribute fields | Local Package model remains separate from material SKU local-intent path | Runtime payload equivalence unresolved. |
| Official quotation | R1 emits prices and other commercial data not supported by verified New App SKU catalog contract | `validateQuotationDraft` adds `material.sku_local_only`; Order.type=1 encoder denies SKU path | **Fail closed**: no fake price, official Order, PDF, contract, workflow completion, or Production/Beta write. |

## Additional Lead direct fix: runtime guard + persistent role provenance (v3)

- `src/features/work-orders/action-workspace.ts` now snapshots authenticated `sessionRef + userId + currentRole.id + roleVersion` at action load start, rejects pending Work Order / form / quotation recovery results if this identity changes, and invalidates the cached action rather than returning the previous role's descriptor from `ensureLoaded`.
- `tests/g4d/action-workspace.test.ts` covers same-user roleVersion cache invalidation and same-user role ID transition mid-read. No fake backend authorization or migration was introduced.
- **Now fixed locally:** `ActionDraftIdentity.roleId` uses a new `action-workspace:3` role-aware storage namespace for quotation; role A/B cannot read or list one another's scoped draft. Unscoped historical v1/v2 records have no role provenance and are not implicitly adopted by the active role. The UI requires deliberate creation of a role-scoped fresh draft while preserving the old bytes; no automatic migration/deletion.
- **Residual I2 Gate:** live R1 authorized SKU `exts`, Code dictionary and SPU/SKU matching behavior remains `NOT_RUN` (and backend permission guarantees are not inferred from front-end storage keys). Physical device/Beta/Owner Gates separate.

## Implementation in Draft #104

- `model.ts`: same-key/value identity check; `removeLocalQuotationMaterialSkuChoice` only touches an exact SKU in one material SPU of one repair group; final SKU removes that material.
- `composition-store.ts`: idempotent save for attribute-order changes, scoped removal, quantity-input synchronization, dirty local-draft persistence.
- `QuotationActionContent.vue`: visible per-SKU remove action on the **actual** quotation workbench; last choice explicitly labeled “移除材料及规格”; read/edit capability guard retained.
- `tests/g4f/r1-material-sku-local-draft.test.ts`: matching order, changed/duplicate combinations, single-SKU removal in A with B preserved, final-line cleanup, local repository flush/reopen, `material.sku_local_only` readiness block.
- Final #104 exact HEAD `3060e5cb47ff9698bbb34eb5e5a33315646afc1e`: [Validate #38220863602](https://github.com/xlink-bj/xlink-technician-app/actions/runs/38220863602) **86 suites / 831 tests PASS + MP/App builds**; [H5 #38220863703](https://github.com/xlink-bj/xlink-technician-app/actions/runs/38220863703) **2 boot + 17 main App + 26 legacy PASS**. MP/App bundles do not establish native device execution.

## Remaining I2 acceptance Gate (not a claim of live equivalence)

1. **Only outstanding I2 DoD #2:** Codex local authorized read-only R1 `basic/material/query`, `biz/extField/query` and `i/code/selectCode.do` samples + matcher behavior; redact real IDs/prices, indicate true `PASS / BLOCKED / NOT_RUN`. The pinned R1 `getMaterialSKU` projection drops `sku.exts` attributes that `skuMatch` later reads; synthetic local success does not resolve that contradiction.
2. Lead: evaluate live route/source discrepancy before accepting I2, with no Product/Beta write or backend assumptions.
3. I3 **read-only preflight** is separately stacked in [Draft #105](https://github.com/xlink-bj/xlink-technician-app/pull/105); this does not start I3, approve any type-1 Order command, or consume another iteration.

**Tracker:** I1 ACCEPTED, I2 **IN_REVIEW 3/4**, M1 **1/8 accepted (12.5%)**; Draft #104 remains unmerged. #29 Beta, #41 Owner UX and #64 device gates remain independent.
