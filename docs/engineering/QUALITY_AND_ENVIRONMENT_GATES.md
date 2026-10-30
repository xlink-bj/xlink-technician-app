# Quality & Environment Gates — Current Mainline

> **Status: DRAFT / proposed ACTIVE standard** · 2026-10-30 · 以 [AGENTS.md](../../AGENTS.md)、package.json 与当前 workflow 为执行依据。本文件不授予任何新的 Production/Beta 业务权限。
> **Owner:** ChatGPT Lead (maintainer); Product Owner approval required before treating this Draft as current policy.
> **Scope:** Architecture/documentation only. No business, backend, production, CI or release authorization changes.

## 1. 证据不能跨级替代

| Lane | 允许的证据 | 能证明 | 不能证明 |
| --- | --- | --- | --- |
| **A — Offline Mock** | R1-shaped fixture、状态机、命令/重读模拟、真正主 App H5 浏览器操作 | 在合成数据下的已支持行为及异常语义 | 真实后台权限、副作用、持久提交 |
| **B — Production read-only** | 预先授权的有界 Login/WorkOrder/Workflow/Form/Order/Contract 读取 | 指定角色/范围内已经观察到的数据协议 | 任何业务写入、上传、消息、流程推进 |
| **C — Authorized Beta/test write** | Owner 对 actor、工单、节点、命令、回读、恢复的单独授权 | 明确范围内的真实服务端写入结果 | 未授权业务/租户/命令的泛化结论 |

C 当前仍 **HOLD**，没有获准的可写隔离 R1-backed fixture。Production/Beta 业务写入保持 0；Mock 缺失不能回落真实网络。A 的“工程通过”也不等于商业视觉/真机/Release 接受。

## 2. 当前标准命令

| 目的 | 命令 | 说明 |
| --- | --- | --- |
| 最快跨层静态/关键回归 | pnpm run verify:quick | 适合频繁开发反馈 |
| 全量静态、测试与质量计数 | pnpm run verify:full | verify + 质量 census，不代表视觉/真机 |
| 架构与业务 owner | pnpm run check:boundaries、pnpm run check:engineering-ownership | 禁止直接平台/API Wire/价目越界 |
| 关键业务负例 | pnpm run check:critical / pnpm run verify:critical | 检查 manifest 和执行对应 suites |
| 共享 UI 与商业 CSS | pnpm run check:ui-governance | 包含可静态约束的样式所有权 |
| 主 App H5 Mock | pnpm run test:main-h5-mock | 网络隔离的真实主 App 操作 |
| H5 基础启动 | pnpm run test:main-h5-boot | 检查生产级入口启动，不代表登录成功 |
| H5 正式构建 | pnpm run build:h5 | C1-FIX 后包含 QA 路由与 JS 产物缺席校验 |
| 微信构建 | pnpm run build:mp-weixin | 包含 WXSS 检查；不代表真机 |
| App 构建 | pnpm run build:app | 不代表双平台实体运行 |

检查命令以本 PR 对应的 package.json 为准；若有版本/参数变更，更新此表和实际 CI。关键 CI：[Validate](../../.github/workflows/validate.yml)、[Validate Main H5 UX](../../.github/workflows/validate-main-h5.yml)。

**2026-10-30 实测补记：**C1-FIX [#238](https://github.com/xlink-bj/xlink-technician-app/pull/238) 合并后，H5/MP/APP 发布脚本会拒绝继承 `XLINK_DEV_QA` 编译标记；H5/MP 还检查最终发布产物中四个 QA 页面缺席。仅运行裸 `uni build` 不等于通过这些发布边界检查。全量本机验证应使用与 `.github/workflows/validate.yml` 相同的测试前提：`VITE_XLINK_ENVIRONMENT=test` 和完整 Git 历史（`fetch-depth: 0`）；否则可能出现 Mock reader 被关闭或祖先提交不可见的假失败。[#239](https://github.com/xlink-bj/xlink-technician-app/issues/239) 已通过原始主干 1470/1470 和 C2-A 1472/1472 的对照验证收口。

## 3. CI 层次与真实含义

- **L1 / 开发回路**：受影响单测、类型、静态边界，必要时本机/云 H5 UI；工具不应承诺从 GitHub PR 获得即时 HMR。
- **L2 / Draft PR**：Validate/quick 对架构、关键回归及 MP 编译做轻量检查；Validate Main H5 UX/r1-main-repeat-ui 运行合成跨页面验证。
- **L3 / Ready PR、main push、手动**：Validate/verify 运行 pnpm verify + MP/App build；Validate Main H5 UX/h5-ux 运行 H5 build、入口、主 App Mock 与历史回归。
- **独立专项**：DS02A 视觉 Golden、报价 CSS 归属与平台特有能力按影响触发。历史的 47 个 workflow 不意味着 47 个都属于每次主干必跑门禁。
- **Release/Owner**：同视口商业 UI 接受、微信开发者工具/物理设备、Android/iOS、Beta 真实写入分别记录。不能用 CI green 替代这些 Gate。

当前 main 的 [Validate](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40884013124) 和 [Main H5 UX](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40884013114) 于 2026-10-29 成功；quick 在 main push 依条件跳过属于预期。本次文档治理 PR 必须重新使用其自己的 exact HEAD 验证。

## 4. PR 验收证据最小格式

每个 PR 明示：

1. **Baseline/HEAD**：基于哪个 main，最终验收的 exact HEAD。
2. **Scope**：修改哪些 owner；哪些模块、API、环境明确未修改。
3. **Gate**：逐项 PASS/FAIL/SKIP/NOT_RUN，含链接与失败归因；不能把历史 PASS 移作当前 PASS。
4. **Safety**：Production/Beta 的读/写/上传/流程推进实际发生次数或明确 NOT_RUN。
5. **UX**：如有商业 UI 变化，提供实际 App 同视口前后和 Owner 明确接受；不自动更新 Golden。
6. **Next authority**：需 Owner 批准的 merge、发布、真实 Beta 写入或原生验收分别列出。

## 5. 文档-only 的门禁

只改 docs/、README 的 PR 仍应通过其适用的 GitHub CI；不因为它“不改业务”就跳过 exact-head 验证。没有变动商业 UI 的情况下，视觉/真机应诚实记录 NOT_RUN（无 UI 变更，不作为新的验收证据）。不得自行 merge、deploy 或写入真实业务。

