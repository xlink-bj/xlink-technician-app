# EQ-06A — Verified Critical-Path Behavioral Suite

Parent: [EQ-05B #177](https://github.com/xlink-bj/xlink-technician-app/pull/177). Draft, no main merge, no Production API or Order writes.

## Why
Many earlier tests assert literal source strings and cannot establish runtime correctness. This phase provides a stable **12-file behavior-suite contract** spanning financial/SKU, Production Order read and tenant guards, Action Workspace/draft/Package provenance, Mock ownership/state reset/failure paths. `pnpm verify:critical` runs the actual existing Vitest behavior tests; `pnpm check:critical` verifies the manifest and expected executable assertions without executing.

This is a curated *behavior regression lane* — it does **NOT** measure line, branch, mutation, or rendered UI coverage. The repository currently has Vitest 2.1.9, but neither the compatible `@vitest/coverage-v8` nor `@vitest/coverage-istanbul` is pinned in `pnpm-lock.yaml`. **Actual measured coverage and thresholds remain HOLD until dependency and lockfile review on local Codex**, rather than claiming a percentage based on test counts. Golden and Playwright are still independent required gates.

## Acceptance
Full canonical verify, critical-lane execution, unchanged Gallery 3 and real App Golden 9, H5/MP/App builds PASS. Only test/tooling/docs/CI added. Does not weaken any old tests or update snapshots.

## Follow-up
EQ-06B: locally authorize lockfile-scoped compatible coverage provider, take real line/branch baseline by critical domain and introduce incremental thresholds; consider sampled mutation testing. Prefer that to speculative global thresholds that encourage gaming metrics.

EQ-07: consolidate legacy CI only after Owner approves merge/release ancestry. Separate from engineering success.
