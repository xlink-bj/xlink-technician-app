# C1-FIX — DEV QA page exclusion from release bundles

Status: implementation candidate / PR review required. Baseline: `main` at `17ba7211040df887be28665564414cb037b6acef`. Date: 2026-10-30.

## Decision and scope

Four internal QA routes are available in explicit local development profiles only:

- `pages/work-orders/signing-mock-review`
- `pages/work-orders/material-sku-mock-review`
- `pages/work-orders/child-subflow-mock-review`
- `pages/dev/qa-console`

They are grouped in one `XLINK_DEV_QA` conditional block in `src/pages.json`. All other routes, their order, and commercial page implementations remain unchanged. This is build-time route removal, not just a runtime authorization guard. It does not modify Mock/Real data contracts, business commands, quotation behavior, permissions, or commercial UX.

## Profile contract

| Command | QA routes | Boundary |
| --- | --- | --- |
| `pnpm dev:h5` | Present | Explicit `UNI_CUSTOM_CONTEXT={"XLINK_DEV_QA":true}` |
| `pnpm dev:mp-weixin` | Present | Same explicit DEV flag; the Mock UX wrapper inherits it |
| `pnpm build:h5` | Absent | Release-context preflight; emitted JS chunk and entrypoint audit |
| `pnpm build:mp-weixin` | Absent | Release-context preflight; emitted `app.json` and page asset audit |
| `pnpm build:app` | Excluded by compiler condition | Source and release-context checks; native package audit requires HBuilderX |

All three release scripts fail closed when an inherited `UNI_CUSTOM_CONTEXT` contains `XLINK_DEV_QA`. `pnpm check:c1-release-qa-pages` validates source-level release/DEV route tables independently and is part of `verify` and `verify:quick`.

Direct invocations of `uni build` outside the approved package scripts do **not** run the release checks; CI and release operators must use these package scripts. `dev:mp-weixin:prod-readonly` intentionally does not enable QA routes.

## Acceptance evidence (synthetic environment, no production IO)

- Release H5: passes; four QA JS route chunks absent, and QA route absent from compiled entrypoint.
- DEV H5: passes; all four QA route chunks and entrypoint route present.
- Release MP-WEIXIN: passes; eight commercial routes, four QA routes and emitted assets absent; existing bootstrap/WXSS checks pass.
- DEV MP-WEIXIN: passes; 12 routes and all four QA page assets present.
- Release APP frontend compiler: passes. The native APK/IPA packaging step and installation are **not verified** in this container; HBuilderX/device acceptance remains open.
- Negative checks: running release H5/MP assertions against DEV builds correctly fails. Inherited DEV compiler flag causes the release-context check to fail before compilation.
- Typecheck, architectural and UI governance gates: pass.

### Unrelated pre-existing full-test failures

`pnpm run verify:full` cannot be declared green on this machine: Vitest reports **156 passed files / 3 failed files; 1464 passed tests / 6 failed tests**. Running the same suite, with the same environment, in an untouched worktree of `main` (`17ba721`) returns the **same six failures**, including the synthetic quotation Mock failures and closure C1 ancestry test. They are baseline issues, not a regression attributable to this change. The full suite must still be green in the canonical CI gate before merge.

## Remaining gate

1. Review the isolated main-based PR and its GitHub CI outcome; do not merge on the strength of local results alone.
2. Use Mac/HBuilderX and the official WeChat DevTools for the native APP package and installed MP behavior if release packaging evidence is required.
3. Keep production and Beta writes disabled; no live login, request, upload, or deployment is part of C1-FIX.
