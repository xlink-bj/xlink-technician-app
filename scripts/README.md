# Engineering Scripts

This directory contains **operational checks and repeatable contract tools**,
not application runtime code. A high number of individually named checks is
intentional when each protects an existing contract or CI gate.

- `check-*.mjs`, `verify-*.mjs`, and `eq01-quality-census.mjs`: guards
  invoked from `package.json`, GitHub Actions, or other checks.
- `inspect-*.mjs`, `capture-*.mjs`, `generate-*.mjs`, `audit-*.mjs`:
  explicit/manual contract discovery, safe read tools, or repeatable generators.
  They are not automatically executed during an app release.
- `lib/` and `*.d.ts`/`*.d.mts`: imported helpers and typing companions
  for JavaScript tooling. Do not delete declaration files merely because
  they are not launched directly.
- `ci/`: shared CI-only checks.
- Review-specific checks and dev launchers are in `tools/review/`, not here.

M1 architecture inventory: `check-module-dependencies.mjs` scans TypeScript
and Vue script imports without contacting R1/Production. Run
`pnpm audit:modules` to read the current summary, and
`pnpm check:module-dependencies` for the fast/complete CI no-growth guard.
Explicit `--refresh-baseline` and `--write-graph` regenerate reviewed
historical snapshots; they must never be used to silence a new violation
without a documented architecture decision. See
`docs/engineering/M1_MODULE_DEPENDENCY_AUDIT_20261031.md`.

The 2026-10-31 C7 audit checked all 51 tracked scripts: every executable
apart from `generate-survey-capabilities.mjs` had a direct non-document
reference; the generator is retained because it regenerates the canonical
`contracts/beta/survey/capabilities.json` and survey capability matrix.
Typing companions are consumed implicitly by their sibling ESM modules.

Only remove a script after checking its package/CI/test/import consumers **and**
whether it is needed to regenerate a tracked contract or historical evidence.
Do not interpret an archival document's snapshot list as proof of an active
dependency, nor silence a release gate by deleting its checker.
