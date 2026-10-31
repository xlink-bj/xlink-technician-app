# Tool Configuration Ownership

Only three conventional discovery entrypoints stay at the repository root:
`vite.config.ts` (uni-app), `vitest.config.ts` (unit tests), and
`playwright.config.ts` (the default isolated H5 Review). Each is a thin
re-export; no duplicated runtime settings are maintained there.

| Directory | Owner | Invocation |
| --- | --- | --- |
| `config/vite/` | Official uni-app build, separate DEV Review Vite servers | Default root shim or explicit `vite --config config/vite/…` |
| `config/vitest/` | Node unit tests and C3 coverage pilot | Default root shim or explicit `vitest --config config/vitest/…` |
| `config/playwright/` | Credential-free H5 Mock, browser/visual Review scenarios | Default root shim or explicit `playwright test --config config/playwright/…` |
| `config/paths.ts` | Absolute repository paths and canonical source aliases | Imported by the three tool families |

When adding a scenario, prefer extending an existing config or inheriting a
reviewed base. Do not add another root `*.config.ts`. All nested Playwright
configs must resolve `testDir`, artifacts and `webServer.cwd` relative to
the actual repository root; the tool otherwise defaults to the config folder.

`pnpm check:config-layout` guards the layout and all currently referenced
package/CI config files. Browser visual baselines and production business
read/write fences remain unchanged.
