# M1 I7 — Reproducible six-stage integration candidate (NO MERGE)

**State:** PREPARATORY, NOT I7 ACCEPTED. Candidate branch `lead/m1-i7-six-stage-integration-gate`, stacked on [Draft #108](https://github.com/xlink-bj/xlink-technician-app/pull/108) head `93934c0449504ae511721d6ec4468fd6fe1b5ff4`. Owner/Lead have not approved merge. M1 still **1/8 accepted**.

## 1. What is actually integrated in the candidate

| Phase | Runtime path exercised by H5 | Authoritative status / security boundary |
| --- | --- | --- |
| Login | Real App home in DEV with synthetic authenticated local session | **NOT** Production authentication parity; real quick-login path remains separately gated |
| Work Order | Real App normal WorkOrder list → detail, MOCK-018 and MOCK-019 | Isolated synthetic role-visible fixtures, **NOT** real tenant authorization proof |
| Appointment | Actual Action Workspace editable synthetic appointment note | Test-only local state; no workflow Complete or backend write |
| Survey | Actual dynamic-form Survey with captured field `squareMeter` and optional repair part selection | Test-only local state; no Survey submit, upload or workflow transition |
| Quotation | Actual quotation Vue with upstream Appointment/Survey context, reload and different WorkOrder isolation | Local quotation draft **not** type-1 Order; no price authority or official payload dispatch |
| Signing | Separate clearly labeled synthetic type-1 multi-Order Signing review, unlisted WorkOrder denied, Contract preview and signing buttons disabled | Does **not** imply real Contract, signing role, PDF access, QR, SMS, legal status or business write |

New Playwright `tests/h5-main-mock/m1-i7-six-stage-integration.spec.ts` runs the contiguous navigation at **375×667** and **390×844** through the real main App; checks re-entry, cross-workorder scope, forged signing route, no submit, and an aborting browser interceptor that fails on **attempted** external HTTP traffic. Existing `tests/h5-main-mock/main-app-quotation.spec.ts` separately covers SKU full selection and two Orders/Contract Mock status. I6 `signing-review-workspace.test.ts` verifies stale role/session in a mocked scoped read port. No live R1 signer scope is claimed.

## 2. Dependency / commit integration map — never blindly merge the stack

| PR | Role / source | Exact head inspected 2026-10-12 | Parent/base relation |
| --- | --- | --- | --- |
| [#103](https://github.com/xlink-bj/xlink-technician-app/pull/103) | Earlier G4-F implementation stack | `edec0e4fac1bb68fc727109240551c51b493d1e9` | Existing Draft chain |
| [#104](https://github.com/xlink-bj/xlink-technician-app/pull/104) | I2 SKU, role-safe local quotation | `f948d837d0d9e9422df774c1eaec43592a98f5fc` | Stacked on #103 |
| [#105](https://github.com/xlink-bj/xlink-technician-app/pull/105) | I3 source-based pricing/Order type-stage contract | `d366f9bf56203a2e18a6aa54a8685c83125b8ea8` | Branched from #104's prior **`3060e5c`**, not latest #104 doc-only tip. Reconcile before integration. |
| [#106](https://github.com/xlink-bj/xlink-technician-app/pull/106) | **Separate Codex tool lane**: bounded R1 SKU shape evidence | `a950b2205acb1581ac2a17181773f331642ab59a` | Off #104's later tip. **NOT in the candidate stack.** Add only after independent review; never assume its live API calls were exercised |
| [#107](https://github.com/xlink-bj/xlink-technician-app/pull/107) | I3 offline source-driven pricing goldens | `683bb63b2a6f44bbb83afa3ea27f58ea01fcdecd` | Stacked on #105 |
| [#108](https://github.com/xlink-bj/xlink-technician-app/pull/108) | I6 **read-only** scoped Order→Signing boundary | `93934c0449504ae511721d6ec4468fd6fe1b5ff4` | Stacked on #107 |
| [I7 candidate](https://github.com/xlink-bj/xlink-technician-app/pulls) | Main App six-stage browser cross-workorder gate and this manifest | `lead/m1-i7-six-stage-integration-gate` | Stacked on #108. HEAD must be recorded only **after** final CI |

This table is an **ancestry proposal and observed base/HEAD metadata**. It does not claim protected main is synchronized or that every pair is conflict-free. Check GitHub `compare` and current main immediately before any authorized integration.

## 3. Reproducible acceptance commands and expected evidence

No local Production credentials are required. Clone this candidate branch using the repo's normal Node/pnpm pin and run from repository root:

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm test:main-h5-boot
pnpm test:main-h5-mock
pnpm test:uni-h5-g4f-review
pnpm run build:mp-weixin
pnpm run build:app
```

Record the **exact HEAD**, operating mode, two GitHub CI workflow URLs and results, the number of main App browser tests, JS/page errors, zero external-intent evidence, and MP/App build logs. The existing Validate workflow already includes MP/App builds; do not conflate build with native device testing.

**Device truth table (not a build substitute):**

| Target | CI build | Actual device run |
| --- | --- | --- |
| H5 Chromium 375/390 | Covered by `test:main-h5-mock` | Browser E2E when workflow SUCCESS |
| WeChat Mini Program | `build:mp-weixin` | **NOT_RUN** until independently witnessed |
| Android | `build:app` | **NOT_RUN** until a real Android build/install/login path is witnessed |
| iOS | `build:app` | **NOT_RUN** until a real iOS build/install/login path is witnessed |

## 4. Conflict / main safety / rollback Gate

1. **Freeze** the final I7 HEAD plus PR #103–#108 exact ancestor tips. Compare proposed candidate against protected `main` with a read-only GitHub compare. If PR #105's former #104 base or the parallel #106 modifies same documents, explicitly reconcile on a new integration Draft branch; do not silently discard either side. No blanket merge of all Draft PRs.
2. Rebuild the single candidate using a fresh checked-out clean tree and `pnpm install --frozen-lockfile`; run all listed validation, trace the six-phase synthetic identity, and verify **no external attempted requests or enabled business writes**.
3. Any merge order or squash plan requires Lead + Owner gate: I2 real SKU, I3 type0/type1 Order and price authority, I4 UX visual approval, I5 production UI, I6 actual Contract signer role, and #29 Beta write permission. The current candidate does **not** satisfy those conditions; keep main unchanged.
4. **Rollback while Draft:** close or discard only the candidate branch/PR after retaining logs; protected main is untouched. No DB migration/backfill, no backend/R1 patch and no Production business write has been introduced.
5. **Rollback after a future authorized release (not now):** first disable the corresponding frontend entry/feature gate; if incompatible, revert the exact authorized merge commit(s) by approved PR with before/after smoke, preserving preexisting server orders and Local Draft versions. NEVER delete v1/v2 historical quotation drafts or reset role-scoped v3 keys to simulate rollback.

## 5. Known gaps and stop conditions

- [I2 #92](https://github.com/xlink-bj/xlink-technician-app/issues/92#issuecomment-6121233128): Codex read-only database preflight found **29 active material ExtFields**, **0 eligible active role-visible SPU/SKU** in the current tenant; production SKU API read and R1 UI parity **NOT_RUN**, no actual API login/read. A complete 29-field read is not possible via #106's bounded 12-field first page. **No further Production discovery without separate exact Owner approval**.
- [I3 #93](https://github.com/xlink-bj/xlink-technician-app/issues/93): pinned R1 `placeOrders.vue.quote()` uses `type:0`; new candidate type=1 Order stage and authoritative SKU price not verified. Goldens are **offline** only.
- [I4 #94](https://github.com/xlink-bj/xlink-technician-app/issues/94)/[I5 #95](https://github.com/xlink-bj/xlink-technician-app/issues/95): final four-screen UX and formal frontend binding gated on Owner visual sign-off.
- [I6 #96](https://github.com/xlink-bj/xlink-technician-app/issues/96): scope-safe Order read code exists, **no live signing UI/Contract authority**; independent Mock signing only.
- [#64](https://github.com/xlink-bj/xlink-technician-app/issues/64): WeChat/Android/iOS device testing not automatically satisfied by CI.
- Signing/Contract, PDF, QR, SMS, settlement, order creation, workflow completion and media-upload writes remain **PROHIBITED** without per-operation authorization.

**State:** I7 is `IN_PROGRESS` for the *integration candidate*, **NOT ACCEPTED**, and formal 4-item DoD cannot be closed while I4–I6 remain gated. M1 accepted iterations remain **1/8**. No ninth iteration created.
