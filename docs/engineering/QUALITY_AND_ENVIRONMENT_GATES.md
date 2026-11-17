# Quality & Environment Gates — Current Mainline

> **Status: ACTIVE** · 2026-11-16 · 以 [AGENTS.md](../../AGENTS.md)、当前 `package.json` 与现行 workflow 为执行依据。本文件不授予任何新的 Production/Beta 业务权限。
> **Owner:** ChatGPT Lead (maintainer); Product Owner approved 2026-10-30.
> **Scope:** 当前开发与验证入口；历史阶段报告只记录当时证据，不定义今日门禁。

## 1. 三类开发/验证环境，证据不跨级

| 环境 | 当前入口 | 能证明 | 不能证明 |
| --- | --- | --- | --- |
| 本地前后端开发 | `pnpm dev:h5`；本地后台、独立开发数据库/Redis及本地存储 | 实际执行范围内的前后端行为、保存及回读 | 生产权限、生产数据或上线可用性 |
| 纯前端 Mock | `pnpm dev:h5:mock`；自动回归用 `pnpm test:main-h5-mock` | R1-shaped 合成数据下的已支持行为及异常语义 | 真实后台权限、副作用、持久提交 |
| 生产只读 | `pnpm dev:h5:prod-readonly` | 授权角色/范围内观察到的真实数据协议 | 任何业务写入、上传、消息、签署或流程推进 |

配置入口、端口及 dotenv 继承规则以 [README](../../README.md#development-environments) 为准。Beta 是显式选择的远程目标，不是默认本地开发环境，也不新增一套日常工作流程。选择环境不授予业务操作权限；生产/Beta 写入和外部上传仍须单独授权。前端只读开关不能代替服务端/账号权限证明。

真实写入验收若将来获单独授权，需先确定隔离目标、临时 actor/role 与列明的 WorkOrder/node、允许的命令及独立读回、清理和回滚办法；只在该范围内执行。Mock 保存与生产只读均不能证明真实写入。这一边界沿用[当时的授权决策证据](../verification/HISTORICAL_NO_BETA_ENGINEERING_PARITY_PATH_20261024.md)，不复用其中旧阶段的执行命令。

日常开发复用固定项目目录与既有测试，按新增或修改功能补充受影响用例；不逐次新建隔离工程、接口白名单或审核流程。开发环境的数据库、存储和外部集成边界在配置中保持明确，边界发生实际变化时再核实。Mock、开发联调与生产证据分别记录，不相互冒充。

H5 默认业务集合、专用合成 HTTP/fixture/品牌配置、触发条件与未接 CI 的具体缺口，见 [H5 business test lanes](H5_BUSINESS_TEST_LANES.md)。默认报告不再把缺少专项环境的用例计作运行后跳过；专项仍由各自配置与 CI job 执行。

## 2. 当前标准命令

| 目的 | 命令 | 说明 |
| --- | --- | --- |
| 局部开发反馈 | `pnpm exec vitest run <受影响的测试文件>`；按改动运行 `pnpm run typecheck` 或对应 `check:*` | 先测实际受影响行为，不必每次跑整套 |
| 较广的本地回归 | `pnpm run verify:quick` | 固定 22 个关键单测文件、边界与类型检查；不能替代全量测试，也不运行 H5 |
| 主干完整工程验证 | `VITE_XLINK_ENVIRONMENT=test pnpm run verify` | 静态检查、类型与全部 Vitest；`verify:full` 只是其兼容别名 |
| 可选规模盘点 | `pnpm run audit:quality` | 独立 census，不在 `verify` / `verify:full` 内，也不是覆盖率或尺寸门禁 |
| 架构与业务 owner | pnpm run check:boundaries、pnpm run check:engineering-ownership | 禁止直接平台/API Wire/价目越界 |
| 关键业务负例 | pnpm run check:critical / pnpm run verify:critical | 检查 manifest 和执行对应 suites |
| 共享 UI 与商业 CSS | pnpm run check:ui-governance | 包含可静态约束的样式所有权 |
| 主 App H5 Mock | pnpm run test:main-h5-mock | 网络隔离的真实主 App 操作 |
| 主 App H5 局部冒烟 | `pnpm run test:main-h5-smoke` | 现有 430 视口业务/媒体/双品牌场景、430 搜索和 430/默认 390 输入用例；用于开发反馈，完整 H5 验收仍看现行 CI 或手动运行 |
| H5 基础启动 | pnpm run test:main-h5-boot | 检查生产级入口启动，不代表登录成功 |
| H5 正式构建 | pnpm run build:h5 | C1-FIX 后包含 QA 路由与 JS 产物缺席校验 |
| 微信构建 | pnpm run build:mp-weixin | 包含 WXSS 检查；不代表真机 |
| App 构建 | pnpm run build:app | 不代表双平台实体运行 |

检查命令以当前提交的 package.json 为准。局部测试之后按影响选择真实 H5 Mock、三端构建或视觉检查；主干 push 运行 [Validate](../../.github/workflows/validate.yml) 与独立命名的 [Validate Main H5 Smoke](../../.github/workflows/validate-main-h5-smoke.yml)。`verify` 本身不构建三端，也不启动浏览器。

历史 G4F Phase1A/1B 的源码字符串自证已退役；报价的目录桥接、身份、草稿、金额和只读边界由现行行为测试、`check:critical` 与受影响 H5 流程验证。旧阶段报告中的命令记录不再是当前入口。

表单保存/流程推进的 20 用例步骤使用两个 Playwright worker；[此前成功基线](https://github.com/xlink-bj/xlink-technician-app/actions/runs/43854995902) 用时 203 秒，[同集合并行运行](https://github.com/xlink-bj/xlink-technician-app/actions/runs/43862851020) 用时 119 秒。离线草稿/媒体 10 用例步骤在对应 CI 中由 124 秒降至 97 秒；这只证明局部步骤收益，完整 H5 的耗时与结果仍以该次完整 run 为准。

发布构建脚本会拒绝继承 `XLINK_DEV_QA` 编译标记；H5/MP 还检查当前 `scripts/check-c1-release-qa-pages.mjs` 所列 DEV-only 路由不进入发布产物。QA 路由清单以该脚本和 `src/pages.json` 为准，不以旧阶段的页面数为准。全量本机测试使用 `VITE_XLINK_ENVIRONMENT=test`；现行 Validate 的完整 checkout 用于仍依赖历史提交的检查。局部行为测试不要求每次拉取全历史；若完整验证因浅历史失败，应先核明缺失的 Git 证据，不把它解释为业务回归。

## 3. CI 层次与真实含义

- **L1 / 开发回路**：受影响单测、类型、静态边界，必要时本机/云 H5 UI；工具不应承诺从 GitHub PR 获得即时 HMR。
- **每次 main push**：Validate 运行 `verify` 与三端构建；Validate Main H5 Smoke 运行现有 16 条真实 App Mock 用例，覆盖 Save/Process 与报价回读、输入/搜索 DOM、媒体恢复及双品牌。两个 workflow 的实际结果分别记录；快检通过不代表完整 H5 矩阵通过。
- **完整 H5**：[Validate Main H5 UX](../../.github/workflows/validate-main-h5.yml) 每日 19:15 UTC 定时运行，也可在 GitHub Actions 手动运行（`gh workflow run validate-main-h5.yml --ref main`）；既有标记 PR 入口继续可用。它保留表单保存/流程、草稿、角色媒体、创建与其他专项的既定用例和失败汇总。需显式本地合成写入授权的问卷、业务选择器用例分别在专项配置中运行；不带该授权的泛用 Mock 不冒充其通过。普通 main push 不会取消完整验收。
- **何时补跑完整 H5**：权限/角色及租户数据隔离、报价/订单金额或签署、草稿异步与弱网、媒体、共享平台或跨端关键流程，以及改变 H5 测试选择或运行语义的 workflow、Playwright 配置、测试设施、共享 fixture、构建/运行环境发生变化时，改动负责人在对应 main SHA 上手动运行并核对 run 的 `head_sha`。纯测试路径等价迁移须核对测试内容、选择集合及受影响验证；仅因 workflow 中的路径文字变化，不机械重跑完整 H5。完整失败未修复时，相关范围不得报告验收完成；快检绿不替代完整结果，也不借用旧 SHA 的 PASS。
- **每日失败归责**：日常项目协调 owner 检查定时完整 H5 run 的终态，指派最近相关改动负责人排查、修复并重跑；未修复前相关范围保持 FAIL/NOT_ACCEPTED。普通 main push 不因此暂停。
- **独立专项**：DS02A 视觉 Golden、报价 CSS 归属与平台特有能力按影响触发。仅绑定旧草稿分支和固定历史提交的专项 workflow 已移除；历史报告保留其当时的证据，不构成当前 main push 门禁。
- **Release/Owner**：同视口商业 UI 接受、已授权的微信开发者工具/物理设备验证、Android/iOS、Beta 真实写入分别记录。不能用 CI green 替代这些 Gate。

**历史 CI 示例（2026-10-29，非当前验收）：**[Validate](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40884013124) 和 [Main H5 UX](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40884013114) 于 2026-10-29 成功；quick 在 main push 依条件跳过属于预期。每次提交核对自己的 exact HEAD CI；不用历史通过替代当前结果。

## 4. 增量开发与交接

本地和云端都在各自固定 checkout 的 `main` 开发，协调文件避免冲突；不为日常任务创建分支、worktree或源码副本。沿用 AGENTS.md：针对性测试 → 涉及 UI/流程时正常 App H5 → 直接提交/推送 main → 核精确 SHA CI。全量 CI 不阻塞每个小编辑；已通过且未受影响的专项不重复执行。

每个有意义的交付简要记录：

1. **Baseline/HEAD**：基于哪个 main，最终验收的 exact HEAD。
2. **Scope**：修改哪些 owner；哪些模块、API、环境明确未修改。
3. **Gate**：逐项 PASS/FAIL/SKIP/NOT_RUN，含链接与失败归因；不能把历史 PASS 移作当前 PASS。
4. **Safety**：Production/Beta 的读/写/上传/流程推进实际发生次数或明确 NOT_RUN。
5. **UX**：如有商业 UI 变化，提供实际 App 同视口前后和 Owner 明确接受；不自动更新 Golden。
6. **Next authority**：发布、真实 Beta 写入或原生验收等另需授权的事项分别列出；普通 main 提交不重复请求审批。

## 5. 文档-only 的门禁

只改 docs/、README 的提交也按当前 main push workflow 记录 exact-head CI 结果；文档局部审阅不必为了提交前反馈先重复运行所有构建和浏览器测试。工作流、配置、测试数据或执行规范即使是文档形式，也按实际影响核对应跑的验证。没有商业 UI 变化时，视觉/真机记录 NOT_RUN。报告和日志输出到 `test-results/`，`.review/` 仅保留需要查看的系统截图，不承载运行脚本、数据库或构建工程。

## 6. 阶段遗留的当前处置（2026-11-17）

本节记录入口和命名的处置范围；历史报告仍按原提交阅读，不因文件改名而改写当时的证据。现行命令只有上表和当前 `package.json`、workflow 定义权威。`verify:quick` 是固定 22 文件的开发反馈，`verify` 是完整工程检查，`verify:full` 是兼容别名；不另建阶段专用验证框架。

| 处置 | 当前路径与理由 |
| --- | --- |
| 已退役的 CI 入口 | 删除 24 个只绑定固定旧草稿分支/祖先的 workflow：`eq02/05/05b/06/07/08/09`、`closure-c2/c3`、`ds07c4a/c4b/c5/c8/c9/c10/c11`、`r1-a06a/appointment/f2/f3/f4/login`、`m1-i7/m1-unified`。它们没有 main push、定时或手动入口；保留 `validate.yml`、`validate-main-h5-smoke.yml`、`validate-main-h5.yml` 和 10 个可按需运行的视觉/专项 workflow。 |
| 已退役的自证 | 删除仅供旧 M1 候选 workflow 使用的 `scripts/check-m1-i7-reconciliation.mjs`、`scripts/check-m1-unified-main-candidate.mjs` 与对应的 `tests/g4f/m1-unified-main-candidate.test.ts`；不删除现行行为/边界测试。 |
| 已迁移的业务代码 | DEV Mock 表单与报价控制器、端口、面板及对应 H5/工程测试改为 `dev-mock-*` 路径；隔离的 R1 特殊表单命令、Pilot 组合/对账/网关改为 `src/app/r1-special-form-*`，同步符号和直接测试路径。仅命名与导入迁移；协议、收据键、角色判断、写入开关不变。`scripts/check-engineering-ownership.mjs`、`scripts/check-mp-wxss.mjs`、`scripts/quality-census.mjs` 同样只改入口名。 |
| 保留的实际行为守卫 | `check:critical`、`check:engineering-ownership`、`check:module-dependencies`、`check:r1-mock-mapping` 及现有单测继续保护金额、授权、草稿、异步状态与 Mock 隔离。测试文件更名不删除或放松断言。 |
| 已迁移：来源读取与隔离测试 | `tests/engineering/r1-forms-add-options-read-contract.test.ts`、`r1-form-data-detail-read-contract.test.ts`、`r1-workflow-form-data-read-contract.test.ts`、`dev-mock-forms-repeat-read-fixtures.test.ts`、`r1-special-form-isolated-pilot-shadow.test.ts`。分别覆盖来源选项、精确回读、Workflow/FormData 身份、DEV Mock 读、隔离 Pilot 的无 Beta 实写负例；同步 `verify:quick` 和 R1 映射路径。 |
| 已迁移：行为测试 | `tests/engineering/mock-scenario-routing.test.ts`、`mock-command-state-isolation.test.ts`、`mock-read-fault-scenarios.test.ts` 属 Mock；`action-draft-identity-helpers.test.ts`、`action-command-revision-consistency.test.ts` 属草稿/异步；`quotation-current-action-catalog-bridge.test.ts` 属报价；`form-runtime-command-owner-boundary.test.ts` 属架构；`quality-census-accounting.test.ts` 属质量盘点。同步 `verify:quick`、关键行为清单和 Validate 路径；断言保持原样。 |
| 已按业务归组：测试目录 | 原 G4 的 143 个测试和 3 个支持文件按真实能力迁入 `tests/auth/`、`work-order-list/`、`work-order-detail/`、`action-workspace/`、`appointments/`、`survey/`、`media/`、`api-contracts/`、`catalog-pricing/`、`catalog-sku/`、`quotation/`、`orders/`、`signing/`、`read-boundaries/`、`app-integration/`。保留测试正文与断言；同步单测选择、关键清单、R1 映射、现行 workflow 和 Review 检查消费者。跨页面体验放集成目录，生产只读与跨域权限边界单独归组，不用历史阶段作为工程所有权。 |
| 测试定位与截图配置 | 两个 DEV Mock 面板的 13 个测试定位标识统一为 `dev-mock-*`，现行消费者同步；可选截图输出使用 `XLINK_REVIEW_SCREENSHOTS`，不改变默认测试行为。`docs/governance/` 的固定快照与 `docs/verification/` 的历史验收保留原始语境，不改写为当前状态。 |


### Review 工具与历史快照

问卷与报价隔离 Review 保留 Mock/禁写边界，入口按业务命名：`check:survey-review-harness`、`test:quotation-review`、`check:quotation-synthetic-extfield-review`。只读报价探针为 `verify:quotation-prod-read`、`inspect:quotation-active-order-extfield`，改名不赋予生产访问权限。

旧 Survey closure 是固定分支/SHA 的状态自证，不是当前业务检查：停止其 package 命令、checker 与 4 项快照断言；原 JSON 原字节归档于 `docs/verification/archive/survey-closure-readiness-legacy.json`。真实 Survey 合同、可见性、媒介和提交边界测试继续运行。生产采样回执中的历史脚本路径和哈希原样保留，不要求其路径永远存在于当前代码树。
