# Verification commands and static census

| Command | Purpose |
| --- | --- |
| `pnpm verify:quick` | Focused boundary, ownership, type and business regression checks |
| `pnpm verify` | Current checks, type checking and the complete unit suite |
| `pnpm verify:full` | Compatibility alias for `pnpm verify` |
| `pnpm audit:quality` | Optional source/style/test census; no size or test-count gate |

Current `Validate` also builds H5, MP-Weixin and App. `Validate Main H5 UX`
executes the real H5 Mock flows. Build success is separate from device execution
and Owner visual acceptance.

The former 800-line source limit and file exceptions, minimum source/test/style
counts, and I8 snapshot checks were retired by Owner decision on 2026-11-15.
Runtime authorization, command/write fences, financial calculations, drafts,
media recovery and brand isolation remain covered by their existing tests.

The census counts CSS/SCSS separately and includes it in total application LOC.
It is a static inventory, not behavior or branch coverage. Historical EQ-01
measurements (222 source files, about 42,836 source lines, 140 test files) remain
historical observations, not targets or current acceptance criteria.
