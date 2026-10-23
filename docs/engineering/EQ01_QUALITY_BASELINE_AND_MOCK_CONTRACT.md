# EQ-01 — Quality Baseline and Mock Scenario Contract

**Review scope:** strictly stacked Draft on [#168](https://github.com/xlink-bj/xlink-technician-app/pull/168) at `878214e30f101c6e045eef5be4b466484f22e189`. **No main merge or Production/Beta calls.**

## Why EQ before adding more features

New App is well structured at its seams: typed API/command ports, Workflow Runtime → Action Workspace → bounded Action Content, schema-supported dynamic forms, scoped local drafts, and fail-closed unsupported operations. However, `QuotationActionContent.vue` (~2,973 lines), `action-workspace.ts` (~2,187 lines) and synthetic routing/fixture modules were rapidly accumulating responsibilities. Hundreds of tests still assert literal source strings. No coverage provider/threshold or mutation-score baseline is configured.

**Goals (measured, not presumed):** reduce files/lines required to add a reliable Mock scenario, shorten trustworthy feedback latency, keep exact source/contract safety and baseline screenshots green, and prevent scope/fixture drift. Test quantity alone is NOT coverage or runtime parity.

## EQ-01 implementation — first large tranche

1. Extract all `isMockOwnedRead` and `isMockOwnedCommand` route policy to **`mock/ownership.ts`**, with **unchanged matching rules** and stable legacy `@adapters/api/mock` exports. This makes the critical "synthetic IDs NEVER hit real endpoints when Mock is OFF" rule independently testable rather than hidden among mutable fixtures and workflow action code.
2. Introduce typed **`mock/scenario-registry.ts`** for all 9 existing functional scenario identities, states and their `synthetic-only` write/network ownership. Both quotation and survey Action Workspace route initialization now consume the registry, rather than duplicating identity declarations. Legacy fixtures and wire protocol remain unchanged; this is **phase-one registry adoption**, NOT a wholesale Mock migration.
3. Add **`tests/engineering/eq01-mock-scenarios.test.ts`**: completeness/unique identities, route ownership for each case, forged Order/Contract protection, malformed references and **Mock OFF with intercepted real network count exactly zero**.
4. Add reproducible `scripts/eq01-quality-census.mjs` reporting source hotspots, tests by category, source-string test prevalence and file sizes. Output generated in `.review/eq01/` as CI evidence, **never committed**, no files containing PII or environment secrets. Static test case count is explicitly NOT test coverage, and LOC is a maintenance signal, not a quality score.
5. Dedicated Draft read-only CI runs `pnpm verify`, existing H5/MP/App bundle builds and actual approved Gallery+business Golden and controlled main-H5 QA. **No Golden promotion, no backend writes, no bypass of regular tests.**

## Current taxonomy and acceptance standard

| Test layer | Authority | Regression trigger |
| --- | --- | --- |
| Static architecture / no-production-fallback contract | Tooling, source ownership and route policy | Every PR (quick lane) |
| Pure Domain & Workflow / Dynamic Form / draft state | Vitest isolated state-machine operations | Relevant domain and integration candidate |
| Adapter ↔ port transport | Vitest real adapter + synthetic intercepted `uni.request` | Any API, auth, media or Mock refactor |
| Component behavior | Mount/workspace state, computed props, emitted intent (planned EQ-02) | Shared UI and domain action edits |
| Real H5 navigated App journeys | Playwright with all off-origin requests blocked, no actual tenant | Integration/review lanes |
| Approved 320/375/390 screenshots | Deterministic Chromium and CJK fonts; no `--update-snapshots` | UI/visual change |
| Real role/tenant / device E2E | Explicit separately authorized local Codex and hardware | **NOT ESTABLISHED** by CI |

## Engineering policy: incremental, not a rewrite

- EQ-01 is intentionally **behavior-preserving** and migration-incremental. Do not turn limited dynamic forms into unrestricted low-code, move price authority to UI, or implement an unsafe generic Mock fallback.
- Existing Mock DATA/OFF/EMPTY UX continues as before, including normal DEV legacy fallback; **auth-only isolated mode blocks external business calls**. The registry is not real authorization.
- EQ-02 follow-up: separate stateful Mock response mutations from route ownership, standardize factory Reset/response builders; add reusable component-behavior tests and cover currently static-only guards.
- EQ-03 follow-up: slice 2,973-line quotation Action Content and 2,187-line Action Workspace by business coordination, state and UX, with no change to accepted Q01/detail visuals. Should be staged behind green EQ-01.
- EQ-04 follow-up: converge normal PR test lanes and evidence dashboard while respecting existing Owner approval and main release gates.

## Exit criteria

- [ ] Exact-HEAD `pnpm verify` and 3 builds PASS.
- [ ] Mock route/registry tests PASS, preserve all historical C11 focused safety tests.
- [ ] Same-HEAD browser H5 + accepted 3 Gallery and 9 business screenshots PASS.
- [ ] Quality census artifact uploaded, test/static ratios explicitly presented as baseline.
- [ ] Diff no Production writes, no API/business behavior, no Golden changes.
- [ ] Release and real tenant/SKU/signing proof remain separate HOLDs.
