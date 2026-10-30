# Documentation Governance — XLink Technician App

> **Status: DRAFT / proposed ACTIVE standard** · 2026-10-30 · 目的：压缩权威文档数量，保留业务与工程证据链，而不是追求删除文件个数。
> **Owner:** ChatGPT Lead (maintainer); Product Owner approval required before treating this Draft as current policy.
> **Scope:** Architecture/documentation only. No business, backend, production, CI or release authorization changes.

## 1. 文档身份

| Status | 含义 | 维护方式 |
| --- | --- | --- |
| **DRAFT** | 候选规范/快照，尚未由 Owner 审批合入 main | 不能覆盖当前 ACTIVE 文档 | 
| **ACTIVE** | 当前长期规范/权威索引 | 与行为、目录、工具改动同 PR 更新 |
| **SNAPSHOT** | 绑定 exact commit、时间和范围的事实快照 | 不覆盖旧快照；新基线产生新版本或显式修订 |
| **REFERENCE** | 设计依据、R1 调查或尚有可借鉴的历史方案 | 必须保留原提交、限制和决策状态 |
| **EVIDENCE** | 某个 PR/CI/设备/租户的验收结果 | 不得改写成最新 main 通过 |
| **OBSOLETE** | 有明确替代者、无活跃引用及唯一证据价值 | 经依赖核查/Owner Review 后可删除 |

文件名含 FINAL / BASELINE / PASS / current **不能单独判定 ACTIVE**。每份文件只能有一个明确当前用途，可在内容中引用其他状态的文档。

## 2. 头部最小字段

对新建长期规范和快照，至少标识：

~~~text
Title
Status: ACTIVE | SNAPSHOT | REFERENCE | EVIDENCE | OBSOLETE
Owner / decision authority
Reviewed at: YYYY-MM-DD
Code baseline: main@exact SHA (when code-dependent)
Scope and exclusions
Supersedes / Related (when applicable)
~~~

旧文件无需一轮批量补齐，只对本次选为 ACTIVE 或发生修改的文档补充。任何历史 CI 数字和分支 SHA 必须保持当时语境。

## 3. 权威决策层次

1. **安全/授权**：Owner 当前明确决定、[AGENTS.md](../../AGENTS.md)。
2. **业务等价**：原 R1 后端源码、API 和经授权的真实读取；未知行为不允许由新文档推断。
3. **架构目标**：[Target Architecture](../architecture/TARGET_ARCHITECTURE.md)及独立专题，若目标与实现不同，明确记录 gap。
4. **实现事实**：最新 main 代码、测试和精确 CI。
5. **视觉**：现行 Owner 已签收的 App/Golden 与 UI Delivery Workflow。
6. **历史证据**：其自身 exact SHA/PR/环境，不高于今日的实测状态。

当文件互相矛盾时，先列冲突与来源，不能私下删除一方、也不能把前一阶段的计划变成已完成。

## 4. 新文档写入原则

- **先搜再写**：明确是修订已有 ACTIVE 规范、补充快照，还是新主题；不复制另一篇“总规范”。
- **一主题一 owner**：例如草稿保留在 Local Draft 专题；代码组织放 Code Organization；实际 CI 以 workflow/package.json 为执行真相。
- **明确 DoD 和边界**：写清已实现、未实现、未授权、未验证，避免单纯愿景性描述。
- **可追溯**：至少有对应代码、现有 ADR/权威文件或 PR/CI 链接。
- **长期规范不嵌套旧分支的操作指令**；历史叙述可保留但加 conspicuous 标记。
- 新增重要架构变更时，以 ADR 记录背景、方案、风险、决定、迁移/回滚和验证。

## 5. G0-B 清理程序

1. 从 Git 树创建完整资产列表，标注 owner、最后使用位置、链接/CI 消费者和拟议状态。
2. 保留已签收 UI、已知业务 API 依据、审计证据和 Golden；未证实无依赖一律不能删除。
3. **先补导航索引与替代文档，再移动历史资料**。历史目录的归档路径应尽量保留链接；必要时使用索引/redirect pointer。
4. 对候选 OBSOLETE 单独 PR，列出所有引用和 CI trigger/consumer 验证；获批后才删除。
5. CI workflow 与 snapshot/fixture 的删除独立于普通 Markdown；必须保证相同主干 gate 和验收证据未丢失。

第一轮候选与非破坏性分类见 [G0-B Inventory](G0B_HISTORICAL_ASSET_TRIAGE_20261030.md)。本 G0-A PR 只创建索引/规范与快照，不做历史资产移动或删除。

