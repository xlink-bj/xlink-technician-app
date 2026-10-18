# DS-07.C6 — Full Stacked-Chain Integration Readiness Gate

**State: ENGINEERING REVIEW / Draft / NO MERGE OR RELEASE.**
**Pinned approved Golden-only parent:** [#162](https://github.com/xlink-bj/xlink-technician-app/pull/162), exact `7bc728d096fc09af800420976dc9e17e0d8af8b2`.
This PR deliberately changes only this document and its dedicated read-only CI workflow; it does not alter application source.

## Verified topology

| Sequence | PR | Target |
| --- | --- | --- |
| Foundational inherited candidate | [#132](https://github.com/xlink-bj/xlink-technician-app/pull/132) | lead/m1-s2-quotation-task-first-ux |
| Transaction design stack | [#146](https://github.com/xlink-bj/xlink-technician-app/pull/146) → [#147](https://github.com/xlink-bj/xlink-technician-app/pull/147) → [#148](https://github.com/xlink-bj/xlink-technician-app/pull/148) → [#149](https://github.com/xlink-bj/xlink-technician-app/pull/149) → [#150](https://github.com/xlink-bj/xlink-technician-app/pull/150) → [#151](https://github.com/xlink-bj/xlink-technician-app/pull/151) | Successive Draft branch |
| DS-07 Design System | [#152](https://github.com/xlink-bj/xlink-technician-app/pull/152) → [#153](https://github.com/xlink-bj/xlink-technician-app/pull/153) → [#154](https://github.com/xlink-bj/xlink-technician-app/pull/154) → [#155](https://github.com/xlink-bj/xlink-technician-app/pull/155) → [#156](https://github.com/xlink-bj/xlink-technician-app/pull/156) → [#158](https://github.com/xlink-bj/xlink-technician-app/pull/158) → [#159](https://github.com/xlink-bj/xlink-technician-app/pull/159) → [#160](https://github.com/xlink-bj/xlink-technician-app/pull/160) → [#162](https://github.com/xlink-bj/xlink-technician-app/pull/162) | Successive Draft branch |
| Full chain engineering audit | **C6** | stacked on #162 |

At review initiation the exact #162 HEAD compared to `main` was **ahead 912 commits / behind 0**; comparison is informational, **not** merge authorization or an assessment that all 912 commits are ready. This is a deep M1/DS stack, not a safe "merge only #162" operation.

## C6 read-only CI

`.github/workflows/ds07c6-full-integration.yml` verifies the pinned parent SHA, Draft head, and **exactly two changed files** under C6. Two independent test jobs run against the same exact commit:

**A — Unit, platform and engineering governance:** `pnpm verify` (boundaries, UI governance, M1 I8 baseline, G4F checks, typecheck, complete vitest), followed by real uni-app `build:h5`, `build:mp-weixin` and `build:app`. The test-only environment is scoped to the verify step; app bundles must not inherit the test fixture environment.

**B — Real H5 integration and snapshot security:** deterministic Chromium + Noto CJK; unchanged `pnpm test:ds02a:gallery` and `pnpm test:ds02a:business` against 15 committed Goldens. Exact hashes of 6 Owner-approved Detail+Q01 images are enforced. Then real main H5 Appointment → Survey → Quote MOCK-019 plus Quotation and blocked Signing screens, and signing synthetic pending/signed/failure/expiry checks at 320/375/390. The tests block *attempted* external requests. Snapshot updates are prohibited.

GitHub runner credentials persist **false**, repository workflow token is read-only. `VITE_XLINK_ENABLE_REAL_WRITES=false` for both jobs. None of this grants backend, Production, R1 signing, SAP, SMS, upload, payment or workflow write authority.

## Gate outcomes

- **PASS** means only: this exact stacked Draft commit satisfied the listed static/unit/build/real-H5 contracts. It is not production signoff or permission to merge.
- **FAIL** means: pin exact failed test/build, distinguish **existing main/inherited** versus **C6-introduced**, and keep HOLD; never relax scripts, masks, threshold or snapshots.
- **UNVERIFIED** remains: real backend-confirmed signed Contract success, MP-Weixin device, iOS/Android runtime, live R1 role/authorization on Production, and whole 912-commit lineage acceptance.

## Merge and release decision (later, explicit)

1. Resolve or consciously defer unresolved upstream Draft and contract gates, including source provenance from #132.
2. Confirm each PR's intended base, direct dependencies, final CI checks and real source diff; avoid unreviewed squash of the entire stack.
3. Decide whether to create a *separate* unified main candidate behind an explicit release/merge review, or merge strictly in dependency order with rollback anchors. The separate existing M1 main candidate process should be respected; do not infer its readiness.
4. Get **explicit human merge approval** before any mutation to `main` or release deployment.

This document intentionally records pending decisions rather than presenting a synthetic signed-state screenshot as production business truth.
