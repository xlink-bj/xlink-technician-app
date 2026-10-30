# CI Fast Lane · Mock-first Mainline (2026-10-30)

## Objective
Typical small PR: target **1–2 minutes** for the mandatory L1 check. The CI-only pilot measured **42 seconds** on PR #252; real-code PR samples and p50/p95 measurements are still pending. All safety-critical behavior stays tested. The original Fast Lane PR only edited CI workflows and governance guidance: no test assertions, business code, UI, API, secrets, or Production/Beta writes.

## L1 — ordinary PR
`Validate / quick` always runs: boundary/ownership/critical/UI governance/baseline checks; TypeScript; fixed authorization, Production-read-only, order-identity, reconstruction, signing-read, Action Workspace tests; and **all modified `tests/**/*.test.ts` Vitest files**, derived from exact PR base commit via Git diff. Full Vitest and MP-WEIXIN/APP builds are not run on every PR.

## L2 — scoped business and visual gates
QSign runs on signing or high-risk quotation command/reconstruction/composition and UI changes. Q01/Q03/B2X2/DS02A/S2 visual workflows trigger on UI surfaces and selected catalog state, **not** every new pure `.ts` helper under `src/features/work-orders/**`. Existing screenshot Goldens remain immutable. A path-skipped workflow is **not evidence of PASS**.

## L3 — full integration and release evidence
`Validate / verify` runs on **every main push**, `workflow_dispatch`, and **any PR changing `.github/workflows/**`** (after `quick` succeeds): full `pnpm verify` (including all Vitest tests, architecture and safety checks) plus MP-WEIXIN and APP builds. Full `Validate Main H5 UX` still contains the unchanged R1 and actual Main H5 browser tests but runs only nightly (19:15 UTC, 03:15 Beijing) or manually. Ordinary PR/main events preserve the workflow and job names but conditionally skip expensive jobs. A manual run must target the exact SHA under review. CI workflow migrations automatically escalate to full Verify on the PR's exact head; no manual dispatch is needed for that portion.

## Risk exceptions: manually run full checks **before merge**
Explicitly execute full Main H5 UX plus relevant QSign/visual workflows for authorization, price, order submission/edit, signing, R1 wire/Production contract or production-write-policy changes, or major Workflow Runtime behavior changes. For a high-risk PR, prefix its PR title with `[L3-H5]`: both Main H5 browser jobs then run automatically on PR open/synchronize/title edit. This is an opt-in L3 signal, **not** a license to omit the risk review. Require actual PASS on the exact HEAD, not skip/in_progress. Small pure code refactors without these risk classes retain L1 plus changed tests, with nightly main full check.

## Required-check governance
GitHub App cannot access branch protection (403). Rulesets list [] is not proof required-check settings are absent. PR #252 demonstrated that check contexts resolve without an indefinitely pending Required Check and was Owner-approved and squash-merged into `main@ab1d39c0`. Its `Validate` main-push run 41072925799 succeeded; `Validate Main H5 UX` was intentionally skipped on that push. Never silently disable any fail-closed test. The pilot observed 42 seconds for a CI-only PR; the follow-up real-code latency/changed-test/required-context sample and the next nightly H5 run remain open in [#253](https://github.com/xlink-bj/xlink-technician-app/issues/253). Revert the Fast Lane change if a required check remains pending, a changed test is missed or a security/semantic regression is found.
