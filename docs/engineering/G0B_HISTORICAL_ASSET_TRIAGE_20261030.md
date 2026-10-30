# G0-B Historical Asset Triage — Full Static Inventory

> **Status: DRAFT SNAPSHOT / Proposal only** · reviewed 2026-10-30 · source: `main@17ba7211040df887be28665564414cb037b6acef`
> **Owner:** ChatGPT Lead (maintainer); Product Owner approval required before treating any proposed ACTIVE status as policy.
> **Scope:** Read-only static inventory of documents, GitHub Actions and tooling. No code, CI, test, Golden, release, production or Beta modifications.

**结论：先固化事实与分类，随后按消费者证据分批治理。** 本 G0-B 不授权删除、移动、停用 CI、重设 Golden、关闭 PR 或合并部署。文件名带 FINAL、PASS、BASELINE 不构成现在仍 ACTIVE 的证据。

## 1. 已完成的审计边界

| 对象 | 全量静态审计数量 | 产物/结果 |
| --- | ---: | --- |
| `docs/` | **203 文件** | [逐文件状态建议（JSON）](../governance/G0B_DOCUMENT_INVENTORY_20261030.json) |
| `.github/workflows/` | **47 YAML** | [触发器、Branch Guard、Job 清单（JSON）](../governance/G0B_CI_WORKFLOW_INVENTORY_20261030.json) |
| `scripts/` | **57 文件** | [工具调用线索（JSON）](../governance/G0B_TOOLING_INVENTORY_20261030.json) |
| `package.json` | **62 npm scripts** | 已记录名称与执行命令 |
| 根级 Playwright/Vite/Vitest | **18 配置文件** | 已记录静态引用及隐式发现提醒 |
| 文档相对 Markdown 链接 | **54 个可解析的站内链接，0 个失效** | 仅验证当前 Git 文件树中的静态相对目标 |
| 历史 tests/ | **224 文件（Git 树计数）** | 本轮未逐个审计覆盖关系，保留至 G0-C |

本轮文档链接图有 **171 份文件没有来自其他 `docs/` Markdown 的站内入链**。这不是“未使用”结论：CI、代码、GitHub PR/Issue、外部链接及人工使用均不在此入链统计之内。

## 2. 文档状态初分（不是批准后的 ACTIVE/OBSOLETE）

| 暂定状态 | 件数 | 处理含义 |
| --- | ---: | --- |
| **ACTIVE_CANDIDATE** | 15 | 长期规范、已签收视觉标准或当前契约候选；逐份检查阶段性叙述 |
| **REVIEW_REQUIRED** | 11 | 权威重叠或依赖待核对；优先由 Owner/Lead 决策 |
| **SNAPSHOT** | 64 | 阶段方案、当时的工程状态；默认保留 |
| **REFERENCE** | 11 | R1 调查、平台/历史设计依据；默认保留 |
| **EVIDENCE** | 102 | 特定 PR、Commit、环境或设备的验收证据；不可冒充当前 PASS |
| **OBSOLETE** | **0** | 本轮没有经消费者与唯一证据核查的可删除项目 |

建议优先 Review：`TARGET_ARCHITECTURE` 中旧阶段状态、`DS07_GLOBAL_UI_ENGINEERING` 中 stacked-PR 流程、`CUI02_MAINLINE_RECONCILIATION` 的 CSS ownership、`B2X2_COMMERCIAL_UI_PARITY` 的 Mock/Real 商业 UI 等价要求。分类明细和标题见 JSON；状态不是自动变更文件权限的工具。

## 3. Workflow 全量核对结果

| 静态事实 | 数量 | 风险提示 |
| --- | ---: | --- |
| 工作流总计 | 47 | 逐条包含触发器、Job 与静态 Branch Guard |
| PR 使用 `paths` 缩小触发面 | 43 | 共 **284 个路径模式**；带 glob 的文件消费者需下一轮追踪 |
| 不设 `paths` 的通用主干门禁 | 2 | `validate.yml`、`validate-main-h5.yml`：**保护，不改** |
| 不设 `paths` 且具有历史 Branch Guard | 2 | `ds07c6-full-integration.yml`、`ds07c7-verify.yml`：G0-C 复核无关 PR 上的 SKIPPED 噪声 |
| 具 `workflow_dispatch` | 12 | 手动调用价值必须单独核实 |
| 路径过滤中可明确定位的缺失文件 | 0 | **不是**对动态 glob、第三方 action、脚本运行的完整依赖证明 |

另有 **33 条**工作流文本含至少一个精确分支 Guard 字面值。不能仅凭 Guard 存在就判定废弃。**Required Check、最近成功记录、Branch Protection、PR 引用与对应业务 Golden 消费者均未由本轮静态扫描证明**；在 JSON 中明确标 `NOT_VERIFIED`。

## 4. 脚本和配置不是“可删清单”

- `scripts/` 57 个文件，`package.json` 62 条命令；静态全路径扫描发现 **17 个脚本没有显式完整路径引用**。
- 其中可能是相对 `import`、被其他脚本间接调用、人工入口、类型声明或开发工具默认发现；17 **绝非孤儿证明**。
- 18 个根级工具配置中，`playwright.config.ts`、`vite.config.ts`、`vitest.config.ts` 等默认入口可能没有字面路径引用。
- 当前主干的商业 Mock UI、Production 只读、动态表单、流程状态与可写 Beta 隔离是硬边界；不得通过清理测试/fixtures 改变它们。

## 5. G0-C 执行顺序与门槛

1. **文档权威收口（低风险）**：Owner Review 15 ACTIVE_CANDIDATE + 11 REVIEW_REQUIRED；仅对获批的 ACTIVE 规范补头部状态/替代关系，保持 102 EVIDENCE 不变。
2. **CI 依赖审计（中风险）**：先核对上述两条 DS07 历史分支工作流的 PR/Required Check/手工用途、最近有效运行、Golden/测试引用；提供“保留 vs 触发器收窄 vs 归档”的精确证据与可回滚改动，再申请单独批准。
3. **代码与 Release QA 消费链（中风险）**：补齐 224 个 tests、57 个 scripts 的静态/运行依赖图，以及 DEV QA/Review-only UI 的生产构建可达性。不能因为 Mock 语境就改商业界面。
4. **真正清理（高风险）**：只有 `OBSOLETE` 候选能证明无活跃消费者、无唯一证据且 Owner 批准后，才在独立小 PR 移除；每项提供恢复办法和 exact HEAD 验证。

**本次交付只产生机器可读索引与本文结论；无文件移除、无 CI 修改、无业务行为变化。**
