# G0-B Historical Asset Triage — Inventory Candidate

> **Status: SNAPSHOT / Proposal only** · 2026-10-30 · main@17ba7211040df887be28665564414cb037b6acef
>
> **本文件不授权删除、移动、停用 CI、重设 Golden 或关闭 PR。** G0-B 必须逐项验证消费者、唯一信息和精确历史 SHA，再单独审阅。

## 1. 初始数量（Git 树，不是 obsolete 数）

| 范围 | 文件数 | 初步处理策略 |
| --- | ---: | --- |
| docs/architecture/ | 5 | 保留长期权威，给旧阶段标识加上下文 |
| docs/design-system/ | 23 | Owner 当前标准与阶段方案分层；Golden 不改 |
| docs/discovery/ | 11 | 作为 R1/平台参考依据保留 |
| docs/engineering/ | 36 | 从候选/阶段交付中识别当前通用规范 |
| docs/ux/ | 24 | 已签收视觉规范与历史试稿分层 |
| docs/verification/ | 102 | **默认 EVIDENCE**，保留 exact-head/设备/租户语境 |
| docs/quotation/ | 1 | 作为报价视觉历史与规范参照 |
| docs/LEGACY_REFERENCE.md | 1 | 继续指明 legacy 只读边界 |
| .github/workflows/ | 47 | 按触发器/PR/现行主干消费者做单独审计 |
| tests/ | 224 | 不等同历史负担；先按真实覆盖范围分类 |
| scripts/ | 57 | 按 package script、CI、手工验证调用图分类 |
| 根级 Playwright 配置 | 10 | 调查重叠使用者后再考虑统一 |

## 2. 优先核对的历史状态冲突

- [Target Architecture](../architecture/TARGET_ARCHITECTURE.md)顶部仍保留 rebuild/g4d-action-workspace 和早期实现 SHA；其原则有权威性，**当时的 implemented/future 标签没有当前权威**。
- [Action Workspace Architecture](../architecture/ACTION_WORKSPACE_ARCHITECTURE.md)同样保留 G4-D 阶段说明。
- [M1-I8 Architecture Baseline](../architecture/M1_I8_FRONTEND_ARCHITECTURE_BASELINE.md)明确是工程候选；应作为历史快照。
- [DS07 Global UI Engineering](../design-system/DS07_GLOBAL_UI_ENGINEERING.md)含旧 stacked PR 先决条件，与 2026-10-29 的 [AGENTS mainline policy](../../AGENTS.md)不同。
- [EQ10 Quality Review](EQ10_QUALITY_FINAL_REVIEW.md)属于旧栈的 Draft 候选验收，不是当前主干自动准入。
- [CUI02 Reconciliation](CUI02_MAINLINE_RECONCILIATION_20261029.md)保护当前 CSS ownership 与历史 #227 不得直接合并的判断，必须保留可追溯性。

## 3. G0-B 需产出的客观清单

- **文档清单**：文件、主题、Owner、当前引用、精确证据/可替代文档、建议状态、迁移/删除风险。
- **CI 清单**：47 条 workflow 各自触发器、脚本、是否 required/自动/手动、main 消费者、最后成功记录、能否与 core gate 合并。
- **配置清单**：Playwright/Vite/Vitest 入口和调用者；不依据名称猜测过时。
- **代码遗留清单**：DEV QA、Mock Review、历史 review-app 的 Release 可达性与构建产物调查。
- **实施分组**：无风险索引补充、可保留的历史归档、需要 Owner 判定的删除，分别提交可回滚 PR。

## 4. 暂定保护名单

AGENTS.md、Target/Action Workspace/Local Draft Architecture、Mock/Production Read-only 和真实 R1 契约、商业 UI Owner/Golden、当前 main 核心验证、任何唯一历史验证证据，以及仍被 open PR 引用的资产，未经进一步取证不得移动/删除。

**推荐下一步**：优先做“目录/文档的状态标记与索引”，再执行 CI 依赖图和 Release QA 产物审计；对可删项另列精确候选列表请 Owner 批准。

