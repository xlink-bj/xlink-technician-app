# XLink 工匠 App — 文档导航

> **Status: ACTIVE documentation index (effective on main merge)** · Owner approved 2026-10-30 · 历史盘点基线 main@17ba7211040df887be28665564414cb037b6acef
> **Owner:** ChatGPT Lead (maintainer); Product Owner approved the documentation authority model and three standards on 2026-10-30.
> **Scope:** Architecture/documentation only. No business, backend, production, CI or release authorization changes.
>
> **本索引及三份新规范经 Owner 审核批准，在合入 main 时正式生效。** 本页是文档入口，不是另一套架构决策。**当前实施事实看代码和 CI，架构决策看现有权威规范，历史验收看对应 exact-HEAD 证据。**
>
> **主干更新提示（2026-10-30）：**本索引中的 G0-A/B/C 和 C1 审计数字均固定在旧 `main@17ba721`，不是最新主干状态。C1-FIX 已通过 [PR #238](https://github.com/xlink-bj/xlink-technician-app/pull/238) 合入 `57cde73`；四个内部 QA 页面已从 H5/MP 发布包排除。C2-A [PR #242](https://github.com/xlink-bj/xlink-technician-app/pull/242) 随后合入 `main@ded94abc`，减少四条 DEV Mock 反向依赖，但同样不属于本历史快照。原生 APP 最终打包/真机验证仍在 [#240](https://github.com/xlink-bj/xlink-technician-app/issues/240)。

## 先读这六份

| 场景 | 当前入口 | 属性 |
| --- | --- | --- |
| 协作、安全与主干规则 | [AGENTS.md](../AGENTS.md) | **ACTIVE — 操作约束** |
| 长期架构与依赖原则 | [Target Architecture](architecture/TARGET_ARCHITECTURE.md) | **ACTIVE — 目标决策**（原有阶段标识可能过时） |
| 2026-10-30 旧主干的实现快照 | [Implementation Baseline](architecture/IMPLEMENTATION_BASELINE_20261030.md) | **SNAPSHOT — 固定于 `17ba721`** |
| 新增或拆分模块 | [Code Organization Standard](engineering/CODE_ORGANIZATION_STANDARD.md) | **ACTIVE — 开发约定** |
| 测试、环境和发布证据 | [Quality & Environment Gates](engineering/QUALITY_AND_ENVIRONMENT_GATES.md) | **ACTIVE — 证据规范** |
| 文档状态、归档与更新 | [Documentation Governance](engineering/DOCUMENTATION_GOVERNANCE.md) | **ACTIVE — 文档约定** |

## 专题权威文件（保留，按需阅读）

- [Action Workspace Architecture](architecture/ACTION_WORKSPACE_ARCHITECTURE.md)：动作身份、Shell、草稿/提交职责的长期设计依据；其中最早的 G4-D 阶段叙述是历史上下文。
- [Local Draft and Weak Network](architecture/LOCAL_DRAFT_AND_WEAK_NETWORK_ARCHITECTURE.md)：草稿作用域、最新修订保护、弱网语义和不可自动重放。
- [UI Delivery Workflow](design-system/UI_DELIVERY_WORKFLOW.md)：商业 UI 的真实 App、同视口截图、Owner 验收与跨端证据。
- [Action Workspace UX Standard](design-system/ACTION_WORKSPACE_UX_STANDARD.md)：Workspace 的交互与布局边界。
- [API Contract Baseline](discovery/API_CONTRACT_BASELINE.md)：R1 既有 API 契约发现；必须与后续 source/live 证据核对。
- [No Writable Beta Path](engineering/NO_BETA_ENGINEERING_PARITY_PATH.md)：A/Mock、B/Production 只读、C/授权 Beta 写入的证据分层。
- [Codex Local Fast Loop](engineering/CODEX_LOCAL_FAST_LOOP.md)：仅在本地 Mac、微信开发者工具、内网等特有能力下的协作。
- [AI Engineering Loop](architecture/AI_ENGINEERING_LOOP.md)：拟议协作模式；不表示已开启无人值守自动执行。
- [C3/C4/G3 Architecture Closure](engineering/C3_C4_G3_ARCHITECTURE_CLOSURE_20261030.md)：Action Workspace 最终有界回读、R1 Adapter 纯映射拆分和 CI 分层运行的职责/验证矩阵；以实施 PR 的精确提交门禁为验收依据。
- [C6 Root Review & Tooling Hygiene](engineering/C6_ROOT_REVIEW_TOOLING_HYGIENE_20261030.md)：根目录 Review-only 资产归并、已清理的旧路径、保留的脚本消费者和验证结果；Review 环境使用说明见 [tools/review/README.md](../tools/review/README.md)。
- [C7 Config Layout & Script Audit](engineering/C7_CONFIG_LAYOUT_AND_TOOL_AUDIT_20261031.md)：Playwright/Vite/Vitest 统一配置目录、保留的 3 个标准入口、脚本逐项消费者审计；当前配置约定见 [config/README.md](../config/README.md)。
- [M1 Module Dependency & Ownership Audit](engineering/M1_MODULE_DEPENDENCY_AUDIT_20261031.md)：C6/C7 后最新主干的 286 模块 / 1005 条静态依赖图、现存类型循环与边界例外、重复业务规则审计，以及 CI 不增长守卫；不授权业务重构。

## 大量历史文档如何理解

| 目录 | 主要内容 | 默认检索策略 |
| --- | --- | --- |
| docs/discovery/ | R1、能力与平台的调查证据 | **REFERENCE**；按业务范围复核 |
| docs/verification/ | 单阶段或精确提交的验证和差异结论 | **EVIDENCE**；不能把旧 PASS 当当前 PASS |
| docs/engineering/ | 工程闭环、历史专项方案与当前规范混合 | 仅本索引列为 ACTIVE 的文件默认具有当前操作权威 |
| docs/design-system/ / docs/ux/ | 已签收标准、阶段方案及视觉证据混合 | 按 Owner 接受状态和当前 Golden 判断 |
| docs/quotation/ | 报价专项视觉证据 | **REFERENCE**；不得绕过真实业务/视觉 gate |

**状态含义与归档方法**见 [Documentation Governance](engineering/DOCUMENTATION_GOVERNANCE.md)。[G0-B 全量静态盘点与治理队列](engineering/G0B_HISTORICAL_ASSET_TRIAGE_20261030.md)汇总 203 份文档、47 条 Workflow、57 个 scripts 文件、18 份根级工具配置。逐文件证据见 [文档清单](governance/G0B_DOCUMENT_INVENTORY_20261030.json)、[CI 清单](governance/G0B_CI_WORKFLOW_INVENTORY_20261030.json)、[工具配置清单](governance/G0B_TOOLING_INVENTORY_20261030.json)。**其中的逐文件状态仍只是分类建议，不是逐份批准的 ACTIVE/OBSOLETE 裁决，更不代表可以删除。**

## G0-C：代码组织与发行边界历史审计（Snapshot）

- [G0-C Source Architecture & Release Surface Audit](engineering/G0C_CODE_AND_RELEASE_SURFACE_AUDIT_20261030.md)：基于 main 的 289 个源码文件、224 个测试文件、依赖图、QA 页面发行边界以及具体的下一步实施队列。
- [逐模块依赖和测试引用快照](governance/G0C_SOURCE_DEPENDENCY_SNAPSHOT_20261030.json)：270 个 TS/Vue 模块、912 条本地导入边及测试直接引用；**静态图不是构建结果或真实覆盖率**。

## C1：发行产物历史诊断与后续修复

- [C1 H5 / 微信小程序发行边界历史诊断](verification/C1_RELEASE_ARTIFACT_AUDIT_20261030.md)：在 `17ba721` 上发现 QA 路由仍被打包；**这是修复前的证据，不是现在的发布状态**。
- [C1 修复 PR #238](https://github.com/xlink-bj/xlink-technician-app/pull/238)：以 DEV 专用编译条件排除 H5/MP QA 路由并加入产物断言；CI 与商用/DEV 隔离回归已通过。APP 原生包仍待 #240。
- [C1 诊断时的产物哈希与路径清单](governance/C1_RELEASE_ARTIFACT_FACTS_20261030.json)：保留原始文件大小、SHA-256 和机器校验结果，**不覆盖**修复前快照。

## 更新顺序

1. 核对最新 main 的 exact SHA、受影响的文件及当前测试。
2. 若改变设计原则：先修订目标架构/专题 ADR，再修改实现。
3. 若只改变实现：更新实现基线的日期和 SHA，不反向把历史版本写成当前事实。
4. PR 给出变更边界、风险、测试和 Owner gate；未经批准不得 merge/deploy。

