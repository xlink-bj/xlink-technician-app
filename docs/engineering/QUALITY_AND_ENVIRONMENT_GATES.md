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

日常开发复用固定项目目录与既有测试，按新增或修改功能补充受影响用例；不逐次新建隔离工程、接口白名单或审核流程。开发环境的数据库、存储和外部集成边界在配置中保持明确，边界发生实际变化时再核实。Mock、开发联调与生产证据分别记录，不相互冒充。

## 2. 当前标准命令

| 目的 | 命令 | 说明 |
| --- | --- | --- |
| 局部开发反馈 | `pnpm exec vitest run <受影响的测试文件>`；按改动运行 `pnpm run typecheck` 或对应 `check:*` | 先测实际受影响行为，不必每次跑整套 |
| 较广的本地回归 | `pnpm run verify:quick` | 固定关键样本、边界、类型检查；不能替代全量测试 |
| 主干完整工程验证 | `VITE_XLINK_ENVIRONMENT=test pnpm run verify` | 现行 17 个串行步骤：静态检查、类型与全部 Vitest；`verify:full` 只是其兼容别名 |
| 可选规模盘点 | `pnpm run audit:quality` | 独立 census，不在 `verify` / `verify:full` 内，也不是覆盖率或尺寸门禁 |
| 架构与业务 owner | pnpm run check:boundaries、pnpm run check:engineering-ownership | 禁止直接平台/API Wire/价目越界 |
| 关键业务负例 | pnpm run check:critical / pnpm run verify:critical | 检查 manifest 和执行对应 suites |
| 共享 UI 与商业 CSS | pnpm run check:ui-governance | 包含可静态约束的样式所有权 |
| 主 App H5 Mock | pnpm run test:main-h5-mock | 网络隔离的真实主 App 操作 |
| H5 基础启动 | pnpm run test:main-h5-boot | 检查生产级入口启动，不代表登录成功 |
| H5 正式构建 | pnpm run build:h5 | C1-FIX 后包含 QA 路由与 JS 产物缺席校验 |
| 微信构建 | pnpm run build:mp-weixin | 包含 WXSS 检查；不代表真机 |
| App 构建 | pnpm run build:app | 不代表双平台实体运行 |

检查命令以当前提交的 package.json 为准。局部测试之后按影响选择真实 H5 Mock、三端构建或视觉检查；主干 push 的完整门禁由 [Validate](../../.github/workflows/validate.yml) 与 [Validate Main H5 UX](../../.github/workflows/validate-main-h5.yml) 执行。`verify` 本身不构建三端，也不启动浏览器。

发布构建脚本会拒绝继承 `XLINK_DEV_QA` 编译标记；H5/MP 还检查当前 `scripts/check-c1-release-qa-pages.mjs` 所列 DEV-only 路由不进入发布产物。QA 路由清单以该脚本和 `src/pages.json` 为准，不以旧阶段的页面数为准。全量本机测试使用 `VITE_XLINK_ENVIRONMENT=test`；现行 Validate 的完整 checkout 用于仍依赖历史提交的检查。局部行为测试不要求每次拉取全历史；若完整验证因浅历史失败，应先核明缺失的 Git 证据，不把它解释为业务回归。

## 3. CI 层次与真实含义

- **L1 / 开发回路**：受影响单测、类型、静态边界，必要时本机/云 H5 UI；工具不应承诺从 GitHub PR 获得即时 HMR。
- **主干 CI / main push、手动**：Validate/verify 运行 pnpm verify + MP/App build；Validate Main H5 UX/h5-ux 运行 H5 build、入口、主 App Mock 与历史回归。
- **独立专项**：DS02A 视觉 Golden、报价 CSS 归属与平台特有能力按影响触发。旧 Draft 分支专项 workflow 与历史阶段报告不构成当前 main push 门禁。
- **Release/Owner**：同视口商业 UI 接受、微信开发者工具/物理设备、Android/iOS、Beta 真实写入分别记录。不能用 CI green 替代这些 Gate。

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

只改 docs/、README 的提交也要按当前 workflow 记录 exact-head CI 结果；现行 main push 仍会触发完整验证。文档局部审阅不必为了提交前反馈先重复运行所有构建和浏览器测试。没有商业 UI 变化时，视觉/真机记录 NOT_RUN。报告和日志输出到 `test-results/`，`.review/` 仅保留需要查看的系统截图，不承载运行脚本、数据库或构建工程。

