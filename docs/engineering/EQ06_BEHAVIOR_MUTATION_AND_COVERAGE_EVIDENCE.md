# EQ-06 — Executed Behavior Contracts and Test Sensitivity Evidence

**Parent:** [EQ-05B #175](https://github.com/xlink-bj/xlink-technician-app/pull/175), exact `b80c3dc7f83a4eaa17306227206010652cca0d94`. Draft only, no main merge or live API.

## Why this phase matters

The project has over 1,000 green Vitest checks, but the code audit found many source-string/static structure guards. EQ06 supplements—not deletes—these with **actual executed Vue interactions, domain validation branches and test sensitivity probes**. A green test count is not executed source coverage, and a source-string contract alone cannot demonstrate a valid user workflow.

### Actual Vue/uni H5 behavior

New `tests/h5-main-mock/eq06-real-q01-component-behavior.spec.ts` opens the real App at 375 and 390 px using a completely synthetic DEV login and intercepts **all outbound network before navigation**. Interacts through real rendered Q01: blank Repair Parts/Description/Quantity must show errors; correcting Description/Quantity clears only those specific errors; missing Parts still blocks navigation; choosing an authorized Roof path allows Catalog; adding ordinary Material updates the correct repair group; actual Order Submit stays absent. Browser exceptions and external network attempts fail the suite. Existing Gallery 3 / business Golden 9 remain immutable.

The same browser samples Chromium V8 **executed JavaScript byte ranges** for the local dev origin and attaches a JSON artifact. It does **NOT** provide TypeScript statement, line or branch coverage, nor a production-bundle percentage, and is never reported as such.

### Executable domain truth

New `eq06-critical-domain-branches.test.ts` runs actual quote domain functions to exercise: required Repair Parts/Description/positive Quantity, standalone Material/Procedure/Measure insufficiency, both direct kinds permitting a locally valid composition, local SKU prohibition on official Order, numeric-equivalent Package layer identity and wrong-intent synthetic command outcome. Zero network or mock source scanning.

### Mutation sensitivity

New `scripts/eq06-mutation-probes.mjs` deliberately changes **two** critical predicates in the ephemeral GitHub Actions working tree: (1) omit invalid Quote Quantity rejection, and (2) permit Package in the direct-selection kind allowlist. Their corresponding real behavior suites **must fail**; script restores original file bytes in `finally`, verifies restoration and writes a small evidence report. If either test suite accepts its broken mutant, CI FAILS. This is **2-target mutation sensitivity**, NOT comprehensive mutation coverage and NOT permitted to modify tracked GitHub source.

## Known limitation / next dependency

Unit **line/branch coverage** is still unmeasured: Vitest v2.1.9 is present but `@vitest/coverage-v8` is not declared in `package.json`. We will not mislabel V8 JS byte sampling as source coverage or introduce an unpinned on-the-fly package installation. The follow-up coverage-provider job requires adding the matching provider and updating/freeze-testing `pnpm-lock.yaml` in a local Codex checkout. Proposed thresholds should be established from a measured baseline of critical domain/runtime/adapter modules, not invented in advance. Full app/M1 R1 integration is still separate HOLD.

## Acceptance

- All critical domain tests + old QQ/Mock P0 tests PASS, both targeted mutants **DETECTED**, source returned unchanged.
- Full `pnpm verify:full` and 3 builds PASS at exact Draft HEAD.
- Real App browser Q01 interaction 375/390 PASS + 3 Gallery / 9 Golden no pixel changes and existing signing H5 safety E2E.
- No changes to `src`, dependency manifest/lock, backend, APIs, price, contract, production identity or Golden baselines.
