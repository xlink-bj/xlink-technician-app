# M1 I7 — Reconciled integration Draft gate (no release)

**Date:** 2026-10-12. This document records an **independent, unmerged integration candidate**; it does not approve a PR merge, any Production/Beta write, or a new I7 acceptance.

## Exact source evidence and merge construction

| Input | Immutable commit | Meaning |
| --- | --- | --- |
| #104 I2 code and corrected v3 role-provenance parity audit | `f948d837d0d9e9422df774c1eaec43592a98f5fc` | Latest I2 Draft head, no real R1 SKU parity |
| #109 I7 browser and reproducible plan | `f511be635e7280a9c063b70e8205f96cec3792ca` | Full DEV Mock six-stage candidate, 850/850 and 2+19+26 PASS |
| Reconciliation merge | `460a8c126da7088cc578aff4aaea357517c6fa7d` | Exact parents, in order: #109 then #104, **not a merge to main** |
| Reconciled source tree | `3d7f09a9f47d9f15b2bbf2505970a916449be6be` | Exactly **same Git tree** as #109; no changed source or docs at merge commit |
| Shared I2 parity audit blob | `a5aa71bede16ea9a4090d6cc7ce28c4176b3fffc` | Byte-identical in #104, #105 and #109 before reconciliation |
| Separately authorized I2 local probe #106 | `a950b2205acb1581ac2a17181773f331642ab59a` | **Explicitly excluded**, still separate Draft; no unwitnessed Production calls imported |

GitHub's original #104→#105 compare returns `diverged / ahead 3 / behind 1` because #105 branched before #104's final **documentation-only** commit. The content was already identical in both branches. This merge commit explicitly records both ancestries without changing the #109 tree; no cherry-pick is needed. **Original PRs #104/#105/#109 remain unchanged and their historical divergence continues; only this new integration candidate is reconciled.**

Verified GitHub compare **#104 → reconciliation**: `ahead 14 / behind 0`; **#109 → reconciliation**: `ahead 2 / behind 0`, **0 changed files**.

## Automated review Gate

The **new Draft integration branch** `lead/m1-i7-reconciled-integration-candidate` contains this manifest, `scripts/check-m1-i7-reconciliation.mjs`, and `.github/workflows/m1-i7-integration-gate.yml`. Its workflow uses a full-history `actions/checkout@v4` with **persisted credentials disabled** to assert all of the following:

1. Merge object has *exactly two parents* (#109 then #104).
2. Merge tree equals #109 tree; the #104 parity audit blob equals #109's.
3. Both PR source tips are ancestors of candidate `HEAD`.
4. #106's locally authorized Production evidence collector is **not** an ancestor.
5. Content changes **after** #109 are **only** this CI script, workflow and manifest. This remains a strictly bounded documentation/test-only integration PR, not a forked application release.

A separate normal **Validate** and **Main H5 UX** CI must also pass on the **final integration branch HEAD**; the gate script itself cannot prove rendering, native device execution or true R1 parity.

## Reproducibility

From a clean checkout of the integration candidate, with full Git history:

```bash
git fetch --unshallow 2>/dev/null || true
node scripts/check-m1-i7-reconciliation.mjs
pnpm install --frozen-lockfile
pnpm verify
pnpm test:main-h5-boot
pnpm test:main-h5-mock
pnpm test:uni-h5-g4f-review
pnpm build:mp-weixin
pnpm build:app
```

The script emits only non-sensitive structural results. It does not fetch Production data or mutate a branch.

## What is NOT approved

- **No merge to main** and no merge/close of #103–#109. Protected main and all base branches remain unchanged.
- **I2** still lacks authorized active SPU/SKU runtime observation. Codex read-only DB discovery found 29 active material ExtFields but **0 eligible active role-visible SPU/SKU**, so the Production SKU API has not been exercised; no unbounded field sweep is allowed.
- **I3** source R1 `placeOrders.vue.quote()` sends `type:0`; new app candidate produces `type:1`. Their stage/route parity, real SKU price and Order persistence remain unverified.
- **I4/I5** final four-screen UX and binding require Owner sign-off. **I6** real Contract, signer roles, QR, PDF, SMS and signing commands are not authorized or implemented.
- **I7** real login / permission integration, WeChat/Android/iOS device validation, and production-side end-to-end service lifecycle are not proven by Mock CI.

**Rollback:** as long as this candidate is Draft, simply abandon the integration branch/PR; main is untouched. For any future approved release, rollback requires a separately authorized revert-by-PR and fresh smoke checks, preserving all historical v1/v2 and role-scoped v3 drafts.

**Status:** I7 integration ancestry **reconciled (candidate only)**. Formal I7 DoD `0/4`; M1 formal `1/8 ACCEPTED`, unchanged. No business writes.
