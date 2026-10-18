# EQ-03 — Unified Developer Verification Entry Points & Honest Quality Metrics

**Stack:** EQ-01 [#169](https://github.com/xlink-bj/xlink-technician-app/pull/169) → EQ-02 [#170](https://github.com/xlink-bj/xlink-technician-app/pull/170) → EQ-03 Draft. No app functionality, asset, backend, persisted draft or API write is changed.

## Two canonical commands for the next Codex feature

| Local command | When | Contract |
| --- | --- | --- |
| `pnpm verify:quick` | After each small coding iteration | Existing boundary/UI/I8/typecheck and six baseline commercial guard suites PLUS EQ-01 Mock route ownership and EQ-02 direct draft normalization guards |
| `pnpm verify:full` | Before asking Lead for review | Existing complete `pnpm verify` (no skipped test or weakened assertions) followed by `pnpm check:quality` |
| `pnpm check:quality` | Before a new large feature module | Deterministic LOC / test-static-census, flags a **new unreviewed >800-line source file**; historical known oversized files explicitly grandfathered |

These commands **do not replace** visual/real browser integration. Owner-approved Gallery and main App H5 Golden, H5 Mock E2E, MP-Weixin/App builds remain compulsory before merge. The existing root `Validate` and `Validate Main H5 UX` workflows are unchanged during this Draft stage; this phase adds a separate read-only gate to validate the proposed canonical developer commands before any main CI migration.

## Honest source quality metrics

EQ-01 measured **222 source files / ~42,836 lines**, **140 test files**, **67 source-reading/string-contract test files**, ~**780 source-string assertions**. This is a static code census, **not** a statement of branch coverage, correctness, user testing or mutation coverage.

EQ-02 moved ~1,290 lines of CSS out of `QuotationActionContent.vue`; a source-only `.vue/.ts` counter would falsely report those lines as eliminated. The EQ-03 census therefore counts `.css/.scss` separately and also reports **total application source + styles**, preserving comparability. Tests verify the count equation and refuse mislabeling.

## Risk and policy

- The over-800-line quality guard **grandfathers only the exact existing assessed files**, including `QuotationActionContent.vue`, `action-workspace.ts`, `technician-api.ts`, the historic region dictionary and other previously existing pages. It does not declare them acceptable indefinitely; further EQ modularization is required.
- New giant files require a deliberate architectural review rather than automatic acceptance. No threshold is silently raised.
- A high number of tests is not proof of test effectiveness; real behavior unit tests and E2E must grow while source-string tests can be retired only when equivalent coverage exists.
- No test fixture or command may perform Production read/write in CI. No Golden auto-promotion or PR merge/release is authorized.
- This is **first-pass local workflow simplification**, not removal of the many historical phase-specific CI workflows; consolidation of redundant GitHub Actions should be reviewed separately after app ancestry and release gates are resolved.

## Required acceptance

- [ ] New `pnpm verify:quick` PASS from clean checkout.
- [ ] New `pnpm verify:full` PASS and check:no-new-hotspot.
- [ ] H5/MP-Weixin/native App bundles and exact approved 3+9 Golden unchanged.
- [ ] New quality metrics including CSS/SCSS uploaded as CI artifact.
- [ ] No changes to business source, contracts, API permissions or baseline PNGs.
