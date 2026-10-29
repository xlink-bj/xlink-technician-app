# M1 / DS-07.C8 — Main Integration Preflight (Review Only)

**State:** `ENGINEERING_PREFLIGHT`; **MAIN MERGE HOLD / PRODUCTION HOLD**. This is **not** a replacement for the earlier [M1 main Draft #116](https://github.com/xlink-bj/xlink-technician-app/pull/116), and deliberately does not create a second unreviewed PR targeted directly at `main`.

## Exact source and branch relationship, 2026-10-18

GitHub comparison and exact branch status were independently checked. Protected `main` remains `c57fb3cc876c8ca3fb133d74dcf4833f8f755b32` and is an ancestor (zero commits behind) of the reviewed DS-07.C7 implementation `fbadc26ab20ba5da327b26eb9094460157b306c5`.

| Segment | Reviewed source | Git commits since parent | Distinction |
|---|---|---:|---|
| Existing M1 main candidate | [#116](https://github.com/xlink-bj/xlink-technician-app/pull/116), `05316a47` | 488 | Previously CODE_PASS, **not merged**, M1 engineering-only |
| M1-S2 productization | [#132](https://github.com/xlink-bj/xlink-technician-app/pull/132), `27fb98a1` | 249 | Includes quotation/order UI and source-level contract changes requiring independent review |
| DS-03–DS-07/C7 | [#146](https://github.com/xlink-bj/xlink-technician-app/pull/146) through [#164](https://github.com/xlink-bj/xlink-technician-app/pull/164), `fbadc26a` | 184 | Commercial presentation, reusable UI, Golden baselines and test/source ownership |

**Total:** 921 commits ahead / zero behind `main`. This is Git ancestry, **not** 921 approved features. The continuous design PR chain is machine-pinned in `DS07C8_MAIN_INTEGRATION_MANIFEST.json`. Current #164 is **not** simply six Golden files; isolated snapshot-only [#162](https://github.com/xlink-bj/xlink-technician-app/pull/162) sits deep in the chain.

## What is proven at the latest inherited C7 HEAD

- [C7 exact-HEAD run](https://github.com/xlink-bj/xlink-technician-app/actions/runs/39107075118): `pnpm verify` **1053/1053**, actual H5 **39/39**, H5 / MP-Weixin / App bundles PASS.
- User explicitly approved only the **new Detail and Q01 visual Golden** in #162; 6 PNG hashes are pinned and the screenshot checks pass.
- Old [#116](https://github.com/xlink-bj/xlink-technician-app/pull/116) is an **ancestor** of the new branch. The separate #106 Production SKU probe and #111 owner visual proof commits are **not ancestors**, so their independent outcomes must not be inherited or implied.
- Tests are isolated DEV Mock; real backend-signed Contract, true price/Order side effects, physical devices and tenant ACL remain unverified.
- Previously reported formal M1 status is **1/8**, I7 **1/4**, I8 **0/4**; no source in this review authorizes upgrading formal acceptance.

## New C8 read-only ancestry and release-risk gate

`.github/workflows/ds07c8-main-preflight.yml` checks out full Git history with **no persisted credentials** and **contents:read**. It:
1. Pins `main` SHA and all ancestor commits, asserts the **488 + 249 + 184 = 921** source lineage with no branch divergence; refuses to proceed if `main` moves.
2. Checks all 17 design-stack PR head SHAs are ordered ancestors. Refuses the explicitly excluded #106 and #111 commits.
3. Verifies C8 adds **only four review files** (workflow, manifest, document, audit script), no business code or Golden change.
4. Computes **full Git file inventory** for `main → C7`, separately for each segment, categorizes source/test/workflow/docs and attaches a JSON audit. Unlike GitHub API compare's first 300-file response, the CI inventory uses local full Git history.
5. Keeps all backend, Production, real signing, device and merge gates NOT APPROVED / NOT VERIFIED.

**Interpretation:** PASS proves lineage, review scope and reproducible diff inventory only. It **does not** prove the hundreds of modified files are semantically safe. Full-stack test success is necessary, not sufficient for a main merge.

## Decision gates before a main-targeted combined candidate

| Gate | State | Required evidence |
|---|---|---|
| Source provenance, ancestor chain, excluded PRs | **C8 CI PENDING** | Full-history check plus cumulative file inventory |
| App CI and approved 320/375/390 H5 visuals | **ENGINEERING PASS on #164** | Existing exact-head runs retained; source changes after C7 disallowed |
| Whole 921-commit source and contract delta approval | **HOLD** | Explicit review/acceptance of M1-S2 API, auth, Order/quote, Contract and workflow boundary changes |
| Production account role/tenant, source SKU and pricing, real official Order/Contract | **NOT VERIFIED** | Separate authorized read-side proof; no unauthorized business writes |
| MP and mobile real devices | **NOT VERIFIED** | Device-based permission, keyboard/scroll/media parity evidence |
| Legal contract signed-success state | **NOT VERIFIED** | Authorized real Contract outcome, signer ACL and readback |
| Approval to merge or deploy | **NOT APPROVED** | Explicit owner directive after prior gates |

**Recommended integration strategy:** preserve [#116](https://github.com/xlink-bj/xlink-technician-app/pull/116) as a historical independent main-target Draft, keep all staged feature/design PRs Draft, and work through source-diff review and business/UX acceptance before creating a new main-target release candidate. Do not merge the 921-commit descendant in a single blind action, rewrite history, bypass outstanding approvals or trigger Beta/Production writes.

**Rollback model:** currently zero main mutations. Closing the C8 review branch or Draft PR reverts no production code and leaves all underlying evidence intact.
