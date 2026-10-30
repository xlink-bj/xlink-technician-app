# XLink 工匠 App — 文档导航

> **Status: DRAFT / proposed ACTIVE index** · 2026-10-30 · 基线 main@17ba7211040df887be28665564414cb037b6acef
> **Owner:** ChatGPT Lead (maintainer); Product Owner approval required before treating this Draft as current policy.
> **Scope:** Architecture/documentation only. No business, backend, production, CI or release authorization changes.
>
> **本 PR 在 Draft 阶段时，下列新建规范均为候选，只有经 Owner 审核并合入 main 后才能成为 ACTIVE。** 本页是文档入口，不是另一套架构决策。**当前实施事实看代码和 CI，架构决策看现有权威规范，历史验收看对应 exact-HEAD 证据。**

## 先读这六份

| 场景 | 当前入口 | 属性 |
| --- | --- | --- |
| 协作、安全与主干规则 | [AGENTS.md](../AGENTS.md) | **ACTIVE — 操作约束** |
| 长期架构与依赖原则 | [Target Architecture](architecture/TARGET_ARCHITECTURE.md) | **ACTIVE — 目标决策**（原有阶段标识可能过时） |
| 今天的真实代码与能力边界 | [Implementation Baseline](architecture/IMPLEMENTATION_BASELINE_20261030.md) | **SNAPSHOT — 本次主干事实** |
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

## 大量历史文档如何理解

| 目录 | 主要内容 | 默认检索策略 |
| --- | --- | --- |
| docs/discovery/ | R1、能力与平台的调查证据 | **REFERENCE**；按业务范围复核 |
| docs/verification/ | 单阶段或精确提交的验证和差异结论 | **EVIDENCE**；不能把旧 PASS 当当前 PASS |
| docs/engineering/ | 工程闭环、历史专项方案与当前规范混合 | 仅本索引列为 ACTIVE 的文件默认具有当前操作权威 |
| docs/design-system/ / docs/ux/ | 已签收标准、阶段方案及视觉证据混合 | 按 Owner 接受状态和当前 Golden 判断 |
| docs/quotation/ | 报价专项视觉证据 | **REFERENCE**；不得绕过真实业务/视觉 gate |

**状态含义与归档方法**见 [Documentation Governance](engineering/DOCUMENTATION_GOVERNANCE.md)。[G0-B 全量静态盘点与治理队列](engineering/G0B_HISTORICAL_ASSET_TRIAGE_20261030.md)汇总 203 份文档、47 条 Workflow、57 个 scripts 文件、18 份根级工具配置。逐文件证据见 [文档清单](governance/G0B_DOCUMENT_INVENTORY_20261030.json)、[CI 清单](governance/G0B_CI_WORKFLOW_INVENTORY_20261030.json)、[工具配置清单](governance/G0B_TOOLING_INVENTORY_20261030.json)。**这些都是 DRAFT 分类建议，不是 ACTIVE 授权，更不代表可以删除。**

## 更新顺序

1. 核对最新 main 的 exact SHA、受影响的文件及当前测试。
2. 若改变设计原则：先修订目标架构/专题 ADR，再修改实现。
3. 若只改变实现：更新实现基线的日期和 SHA，不反向把历史版本写成当前事实。
4. PR 给出变更边界、风险、测试和 Owner gate；未经批准不得 merge/deploy。

