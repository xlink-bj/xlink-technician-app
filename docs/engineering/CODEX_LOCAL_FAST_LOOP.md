# Codex / ChatGPT Local Fast Loop — XLink Technician App

**Current mainline guidance · 2026-10-29.** This file salvages the durable operating guidance from historical Draft PR #210, while replacing its 2026-10-23 Stage 1 test counts and stacked-PR assumptions. Historical counts and failures remain evidence in [Issue #209](https://github.com/xlink-bj/xlink-technician-app/issues/209), **not current acceptance status**.

Read first: [AGENTS.md](../../AGENTS.md), [EQ03 test lanes](./EQ03_TEST_LANES_AND_METRICS.md), [cloud / visual verification](./CLOUD_EXECUTION_AND_VISUAL_VERIFICATION_20261026.md), and [commercial visual contract](../design-system/DS02A_H5_VISUAL_CONTRACT.md). If a document disagrees with live source, a newer approved Lead decision or a signed Golden, stop and resolve the conflict.

## 1. First 60 seconds — exact evidence boundary

1. Read the Issue, approved change scope, affected platform and required acceptance gate. Determine whether the task needs source/contract evidence, main-App H5, MP-WEIXIN native UX, real device, or specifically authorized Production **read-only** evidence.
2. Record the exact workspace before edits: `git status --short`, `git branch --show-current`, `git rev-parse HEAD`. Never discard another worktree's changes or assume local checkout equals GitHub main.
3. Select one existing test lane, the real application route, fixture ID and viewport. Verify *environment key names*, not secret values; confirm expected network and business-write fences.
4. Run the narrowest useful test. Capture SHA, command, PASS/FAIL/SKIP, screenshot/trace where relevant, and evidence that no forbidden request or write was attempted.
5. Escalate to full checks and native device review only when the task's gate requires it; never convert a failing test into PASS by rewriting a selector or mocking away the behavior.

**No Production/Beta business writes, uploads, workflow transitions, payment/contract commands, login bypass or secrets in CI.** Production Auth + Mock business, DEV synthetic Mock, and explicitly authorized Production Readonly are three distinct modes; never switch automatically to make a test pass.

## 2. Choose the correct lane

| Question | Fast evidence | Cannot establish |
| --- | --- | --- |
| Models, API mapping, roles, FormDefinition / Workflow identities | Focused contract / adapter tests; approved bounded Production read only if explicitly necessary | Actual mobile UX or write permission |
| Login → Home → List → Detail → Action Workspace | **True uni-app main H5** in DEV synthetic Mock + Playwright | MP native or physical device acceptance |
| Quotation, SKU, signing, dynamic form / repeat state | Focused main-App test, then full H5 Mock and appropriate targeted contract gates | Real production write path |
| Spacing, hit targets, commercial UI | Actual App screenshot at matched 320/375/390 and accepted DS02A Golden; inspect real rendered DOM | Owner commercial visual approval |
| WeChat routing, WXSS, lifecycle, input, safe area | `build:mp-weixin`, native DevTools simulator and relevant device | Equivalent H5 or production business behavior |
| Final engineering ready-to-integrate gate | `verify:full`, browser gate, platform build and current GitHub Actions on exact HEAD | Unrun tests, skipped cases or pending Owner acceptance |

**Commercial UI invariant:** Mock and Real share the same user-facing components and information architecture at matching business states. DEV controls and synthetic provenance remain in the isolated QA surface, not on customer-facing pages. No unapproved Golden refresh, layout redesign or generic visual replacement.

## 3. Reuse the existing commands

From the repository root, after confirming the active runtime:

```bash
pnpm run verify:quick
pnpm run verify:full
pnpm run test:main-h5-boot
pnpm run test:main-h5-mock
pnpm run test:r1-main-repeat-ui
pnpm run build:h5
pnpm run build:mp-weixin
pnpm run build:app
```

Focused H5 regression uses the **existing** `playwright.main-h5-mock.config.ts` and a real test path under `tests/h5-main-mock/`, rather than a second runner or a standalone imitation application. This lane uses local synthetic fixtures and must deny unexpected external business traffic.

The opt-in MOCK-021 repeat main-App case needs `VITE_XLINK_R1_MP_UX_FIXTURES=true`; when not enabled, report SKIP separately. A targeted PASS does not prove the full `test:main-h5-mock` suite, an MP build does not prove device UX, and old PR screenshots do not rebaseline current visuals.

## 4. Verification, ownership and handoff

- ChatGPT / Codex may do local/static tests, real H5 browser verification and GitHub CI where available. Use Mac + WeChat DevTools when the platform itself is the subject; use physical device evidence for field-worker ergonomics.
- On a dirty or occupied checkout, stop before reset/clean/checkout. Use an approved isolated worktree if available. Do not overwrite any local development edits.
- For browser QA, capture actual App screen, viewport, scenario/state and failure diagnostics; exclude user PII, session tokens, phones and credentials. Network error count and unintended business intents are acceptance criteria.
- For CSS debt, modify the **current main** component owners, preserve import order and accepted Q01/Q03 final baselines, and obey `scripts/ci/commercial-css-ownership.mjs` no-growth caps. The current legacy repeated-selector budget includes responsive overrides: it is **not** a list of dead rules to delete.
- For any integration, record exact main/head SHA, all required GitHub CI checks, test coverage and skips, visual approval status, and a rollback path. No auto-merge or deploy is implied by a green unit test.

## 5. Historical evidence boundaries

- [#210](https://github.com/xlink-bj/xlink-technician-app/pull/210) defined the original local fast-loop protocol; its `28 pass / 6 fail / 1 skip` figures are pinned to **2026-10-23 Stage 1** and are not current main.
- [#211](https://github.com/xlink-bj/xlink-technician-app/pull/211) diagnosed and fixed a then-current H5 Mock baseline on its old stack. Its workflow, signing copy and fixture expectations are not transplanted into current main without a new complete regression run.
- [#234](https://github.com/xlink-bj/xlink-technician-app/pull/234) merged the accepted commercial UI ancestry with signed DS02A Golden; [#235](https://github.com/xlink-bj/xlink-technician-app/pull/235) added the mainline CSS no-growth guard.
