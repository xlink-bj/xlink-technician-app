# CI Fast Lane · Mock-first Mainline (2026-10-30)

## Objective
Typical small PR: target **1–2 minutes** for the mandatory L1 check (goal, not verified until measured). All safety-critical behavior stays tested. This PR only edits CI workflows and governance guidance: no test assertions, business code, UI, API, secrets, or Production/Beta writes.

## L1 — ordinary PR
`Validate / quick` always runs: boundary/ownership/critical/UI governance/baseline checks; TypeScript; fixed authorization, Production-read-only, order-identity, reconstruction, signing-read, Action Workspace tests; and **all modified `tests/**/*.test.ts` Vitest files**, derived from exact PR base commit via Git diff. Full Vitest and MP-WEIXIN/APP builds are not run on every PR.

## L2 — scoped business and visual gates
QSign runs on signing or high-risk quotation command/reconstruction/composition and UI changes. Q01/Q03/B2X2/DS02A/S2 visual workflows trigger on UI surfaces and selected catalog state, **not** every new pure `.ts` helper under `src/features/work-orders/**`. Existing screenshot Goldens remain immutable. A path-skipped workflow is **not evidence of PASS**.

## L3 — full integration and release evidence
`Validate / verify` remains on **every main push** and `workflow_dispatch`: full `pnpm verify` (including all Vitest tests, architecture and safety checks) plus MP-WEIXIN and APP builds. Full `Validate Main H5 UX` still contains the unchanged R1 and actual Main H5 browser tests but runs only nightly (19:15 UTC, 03:15 Beijing) or manually. Ordinary PR/main events preserve the workflow and job names but conditionally skip expensive jobs. A manual run must target the exact SHA under review.

## Risk exceptions: manually run full checks **before merge**
Explicitly execute full Main H5 UX plus relevant QSign/visual workflows for authorization, price, order submission/edit, signing, R1 wire/Production contract or production-write-policy changes, or major Workflow Runtime behavior changes. Require actual PASS on the exact HEAD, not skip/in_progress. Small pure code refactors without these risk classes can use L1 plus changed tests, with nightly main full check.

## Required-check governance
GitHub App cannot access branch protection (403). Rulesets list [] is not proof required-check settings are absent. Pilot PR must demonstrate that check contexts resolve and no Required Check remains indefinitely Pending. Never silently disable any fail-closed test. Measure actual L1 runtime before claiming target achieved; roll back promptly if failures or missing tests show regression. All CI changes remain unmerged pending Owner review.
