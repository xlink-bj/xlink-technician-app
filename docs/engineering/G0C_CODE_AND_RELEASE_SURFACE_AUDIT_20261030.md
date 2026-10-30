# G0-C Source Architecture & Release Surface Audit — 2026-10-30

> **Status: DRAFT SNAPSHOT / action proposals only**
> **Source:** `main@17ba7211040df887be28665564414cb037b6acef` · Owner: ChatGPT Lead / Product Owner approval for code and CI changes
> **Scope:** Full static textual review of the current main source and tests; no business code, test, CI, route, Golden, Production/Beta or release modifications.
> **Machine evidence:** [G0-C Source Dependency Snapshot](../governance/G0C_SOURCE_DEPENDENCY_SNAPSHOT_20261030.json)

## Executive conclusion

**Current architecture has recognizable module boundaries and useful automated guards, but feature-to-app back references, large multi-responsibility files and release-only QA packaging remain the highest-value next治理对象。** Retain the single-main development model. The safe approach is narrow, reversible refactoring behind stable facades, not moving directories or deleting Mock/QA code by name.

**2026-10-30 事后状态（不改写审计当日的 `17ba721` 事实）：**C1 的发布 QA 打包缺口已经由 [PR #238](https://github.com/xlink-bj/xlink-technician-app/pull/238) 在 `main@57cde73` 修复，H5/MP 正式构建的四个路由及其页面资源均通过缺席校验；APP 原生安装包仍由 [#240](https://github.com/xlink-bj/xlink-technician-app/issues/240) 独立验收。C2 feature→app 依赖治理在 [#241](https://github.com/xlink-bj/xlink-technician-app/issues/241) 分阶段推进，C2-A [PR #242](https://github.com/xlink-bj/xlink-technician-app/pull/242) 不属于本次旧主干快照。下文 C1 发现与 12 路由数字仅表示修复前审计证据。

## 1. Source and test census

| Static object | Count | Interpretation |
| --- | ---: | --- |
| `src/` all files | **289** | 288 readable text + 1 PNG asset |
| TS/Vue modules | **270** | 206 TS + 64 Vue |
| Resolved local source import edges | **912** | Parsed static TS/Vue aliases and relative imports |
| Local missing dependency targets | **0** | Two contract JSON imports + one PNG import resolved against Git tree outside TS/Vue graph |
| `tests/` all files | **224** | 209 text/fixture files + 15 approved PNG snapshots |
| TS test files | **202** | 144 directly import at least one source module; remainder may be browser/route/fixture tests |
| Explicit Vitest specs in `verify:quick` | **22** | Quick is intentionally not the entire test suite |
| uni-app pages in `src/pages.json` | **12** | 8 commercial/legal pages + 4 QA/Mock pages |

Static import reachability is **not** code coverage: Vue pages are normally instantiated by the router, Playwright exercises routes without importing page components, and build inclusion/tree shaking is not represented here. No local H5/MP/APP build was executed for this audit.

## 2. Priority findings / specific evidence

### P1 — Main route table contains four DEV QA / Mock pages

> **C1 follow-up completed:** [Production-profile Release Artifact Verification](../verification/C1_RELEASE_ARTIFACT_AUDIT_20261030.md) proves these pages **are present** in emitted H5 and MP bundles, while the inspected compiled DEV-only authorization paths are constant-false/blocked. Interactive browser/device tests remain SKIP. The source-only uncertainty below is preserved as its original G0-C audit context.

`src/pages.json` unconditionally registers:

- `pages/dev/qa-console`
- `pages/work-orders/signing-mock-review`
- `pages/work-orders/material-sku-mock-review`
- `pages/work-orders/child-subflow-mock-review`

Their components include authorization gates; for example QA Console checks `import.meta.env.DEV && isBusinessMockDeveloperModeAvailable()`. The Mock readers additionally enforce synthetic identity and bounded fixtures. **This is not a finding that real Production commands are exposed.**

However, UI/permission guards alone do not prove the pages and developer fixture code are absent from release artifacts. Today `check:b2x2-parity` **requires** QA Console's presence in `pages.json`, while `check:ui-governance` blocks design-gallery routes, not these four explicit DEV pages. `src/app/bootstrap.ts` also statically references QA draft seeds/diagnostic helpers. This is an **artifact-boundary evidence gap**, not authorization to delete QA routes or weaken business Mock parity.

**Next gate:** build real production-profile H5 and MP-WEIXIN (and APP when environment permits), inspect emitted route tables, chunks, DEV control strings and reachable UI; verify actual denied-path behavior in release. Then decide with Owner whether accepted release policy is hidden-but-guarded or compile-excluded. If changing routes, update Mock test harness and check scripts in the same reviewed slice.

### P1 — Feature-to-application dependency inversion

Static graph finds **11 local imports from `src/features/**` into `src/app/**`**, across six feature files (exact edges in JSON):

- `R1NodeFormsOverview.vue`, `r1-local-form-drafts.ts` → `app/business-mock`
- `R1SpecialMockTransactionPanel.vue`, `AStageMockQuoteOrderPanel.vue` → `app/composition` and mock controllers
- `MockJourneyContextPanel.vue`, `MockCommercialFlowLinks.vue` → Mock/review orchestration

These are mostly intentional development and business-parity seams; they are **architectural coupling, not evidence of incorrect behavior**. The existing `check:boundaries` catches raw platform APIs, legacy imports and some inward adapter dependencies, but does not forbid feature → app.

**Next slice:** define narrow mock-preview/context capability inputs owned by feature/port, inject at the page/composition root, migrate one coherent test-backed usage at a time. Keep current Mock/Real commercial UI and synthetic write-blocks identical. Do not blanket-ban feature→app until existing uses are migrated and protected.

### P1 — Oversized modules with many consumers

| Existing file | Approx. lines | Static source importers | Preferred evolution |
| --- | ---: | ---: | --- |
| `features/work-orders/action-workspace.ts` | **2,356** | 15 | Extract pure selectors/transitions/command coordination by capability; keep public facade stable |
| `adapters/api/technician-api.ts` | **2,096** | 9 | Extract read/DTO mapping/wire handling behind exact R1 Adapter facade |
| `features/work-orders/quotation/QuotationActionContent.vue` | **1,698** | 1 | Extract approved visual subcomponents by existing Quotation owner boundaries, preserve screenshots |
| `pages/index/index.vue` | **1,236** | Route root | Separate page composition from business projections without redesigning accepted Home |
| `pages/work-orders/detail.vue` | **1,117** | Route root | Split status-specific presentation after matching current action-state tests and Golden |

The 3,395-line `adapters/api/reference/area-county-dictionary.ts` is primarily reference data and should **not** be classified as a complex controller merely by LOC. Existing CSS ownership/Golden no-growth rules remain protected: duplicate selector count alone is not removal proof.

### P2 — Three reciprocal module pairs, type-only in one direction

The graph detects three two-file reciprocal references:

1. `adapters/api/technician-api.ts` ↔ `adapters/api/r1-node-form-list.ts`
2. `adapters/api/technician-api-commands.ts` ↔ `adapters/api/action-command-wires.ts`
3. `features/work-orders/action-workspace.ts` ↔ `features/work-orders/action-workspace-read-model.ts`

In each pair, one direction is an `import type`; thus **do not describe these as proven runtime cycles**. Optional low-risk improvement: move shared type declarations to stable type/port modules when touching the corresponding capability.

## 3. Test and platform verification implications

- `verify:quick` lists **22 selected Vitest test files**, plus architecture, critical behavior, UI and typecheck guards. It passed on the G0-B Draft head, but **does not replace `verify:full`**.
- `verify:full` calls full `verify` and `check:quality`; MP-WEIXIN/APP compilation and matched-viewport commercial visual acceptance remain distinct gates.
- 15 approved DS02A PNG snapshots are baseline evidence; preserve all.
- Mock scenario code can be an ordinary business UI dependency. Do **not** clean up by matching “mock” filenames.
- Production business reads remain bounded; write-capable Beta remains HOLD unless independently authorized.

## 4. Recommended G0-C implementation queue

| Slice | Change class | Dependencies and acceptance |
| --- | --- | --- |
| **C1 Release QA artifact proof** | Diagnostic first | Isolated `build:h5` / `build:mp-weixin`; inspect output + actual denied routes; determine policy before code change |
| **C2 Feature/app seam** | Small code refactor | One feature at a time; preserve API/Mock parity, typecheck, full tests and production read-only |
| **C3 Action Workspace internals** | Focused modularization | Stable imports, equal state transitions, role/version/uncertain-command tests |
| **C4 API adapter internals** | Focused modularization | Exact R1 wire/role-scope evidence, full contract tests |
| **C5 Quotation and heavy page composition** | Commercial UI refactor | Approved Golden, iPhone 14 Pro matched viewport, H5/MP screenshot Owner gate |
| **C6 CI & historical cleanup** | Separate governed PR | Required checks / consumers / rollback proof from G0-B; never inferred from filenames |

**Gate:** C1 diagnostic may begin without business changes. Any C2–C6 implementation or deletion should be independently reviewable against latest `main`, with exact behavior and visual evidence. PR #237 stays docs-only and Draft; merging or deploying requires separate Owner approval.
