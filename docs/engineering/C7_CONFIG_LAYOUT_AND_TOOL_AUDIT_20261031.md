# C7 — Configuration Layout & Script Consumer Audit

> **Status:** local acceptance passed; exact-head GitHub CI and main merge pending.
> **Base:** C6 main `c1a573da` (2026-10-31).
> No business behavior, API contract, visual Golden, Production/Beta writes
> or runtime release semantics are changed by this reorganization.

## Scope and layout

The root previously contained **18** tool configuration files:
10 Playwright, 6 Vite (including the canonical uni-app Vite entry), and
2 Vitest. The C7 source configuration is now grouped under:

- `config/playwright/` — credential-free main H5, review, quotation and
  visual-baseline runners. Each scenario keeps its own test selection, port,
  artifact directory, timeouts and no-business-write environment.
- `config/vite/` — official app and isolated Review bundles. The uni-app
  plugin continues to use its usual repo-root discovery entry.
- `config/vitest/` — normal unit tests and focused C3 coverage.
- `config/paths.ts` — a single source alias contract and absolute repository
  paths independent of config location.

Only **three minimal root shims** remain: `vite.config.ts`,
`vitest.config.ts`, `playwright.config.ts`. These preserve conventional
third-party IDE/toolchain discovery without retaining implementation clutter.
The app's quick-login redaction, Review write fences, and platform build
targets have not been relaxed.

All package scripts, existing GitHub workflow calls/path filters, Review
boundary checks and configuration imports are updated to the new locations.
Playwright `testDir`, output paths and `webServer.cwd` now resolve against
the explicit repository root (by default, webServer would instead run in the
relocated config directory).

`pnpm check:config-layout` prevents future specialized config files being
added at root and checks referenced package/CI config paths exist.

## Script triage

51 tracked `scripts/` files were checked against package scripts, workflows,
source imports, tests and current/archival documentation. All but one
executable had a non-document consumer. The one standalone generator,
`generate-survey-capabilities.mjs`, regenerates two canonical tracked contract
artifacts and is intentionally retained. Seven standalone `*.d.ts`/`*.d.mts`
files are companion declarations, not unused executable scripts. Blindly
removing them would destroy type coverage or contract reproducibility.

Review-only scripts were already migrated to `tools/review/` in C6. No
additional script is classified as **proved obsolete** in this C7 audit; no
release gate has been silently deleted. See `scripts/README.md`.

## Verification ledger (2026-10-31, local C7 worktree)

- `pnpm check:config-layout` — **PASS**; no specialized config at root,
  conventional entrypoints valid, and package/CI config references resolvable.
- `CI=true VITE_XLINK_ENVIRONMENT=test pnpm verify:full` — **PASS**, including
  typecheck, quality/boundary checks, **170 suites / 1532 tests**. The initial
  run detected one old source-parity manifest path, corrected to the relocated
  config; the full command then passed on rerun.
- Official `build:h5`, `build:mp-weixin`, `build:app` — **all PASS**.
- Review `build:h5-review`, `build:uni-h5-review`,
  `build:uni-h5-g4f-review`, `build:mp-weixin-review` — **all PASS**.
- Playwright config load `--list` — **10/10 configs PASS**.
- Real Chromium Playwright — **16/16 PASS**: Design System H5 Review 4/4,
  Uni H5 Review 9/9, main H5 Mock quotation UX 3/3. Chromium was provisioned
  in the worktree's ignored `.cache/` for this isolated test environment.
- `git diff --check` — **PASS**.
- GitHub Actions on the exact PR HEAD and `main` after merge — **pending**;
  record the exact HEAD in the GitHub PR and merge report.

Historical screenshots and existing commercial layout assertions must not
be rebaselined as part of this file-layout change.
