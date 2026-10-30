# Code Organization Standard — XLink Technician App

> **Status: DRAFT / proposed ACTIVE standard** · 2026-10-30
> **Owner:** ChatGPT Lead (maintainer); Product Owner approval required before treating this Draft as current policy.
> **Scope:** Architecture/documentation only. No business, backend, production, CI or release authorization changes.
>
> 依据 [Target Architecture](../architecture/TARGET_ARCHITECTURE.md)、[Action Workspace Architecture](../architecture/ACTION_WORKSPACE_ARCHITECTURE.md)、[当前实现快照](../architecture/IMPLEMENTATION_BASELINE_20261030.md)。这是后续**增量修改**的组织准则，不要求立即重排所有现有文件。

## 1. 一个 owner 负责一类语义

| 目录 | 可承担 | 不应承担 |
| --- | --- | --- |
| src/pages | 路由参数、页面组合、可见性、用户意图转发 | 业务价格计算、R1 wire 编码、直接网络调用、独立业务事务 |
| src/features | 按业务能力组织用例、Pinia store、ViewModel、Action Content | raw uni.request、硬编码 R1 Endpoint、跨模块直接操作内部私有 store |
| src/runtimes | Workflow/表单/Action/媒体的纯或可复用执行语义 | 具体商家 SKU 价格、租户 API 地址、直接平台 SDK |
| src/shared/ports | 语义输入/输出、操作状态、能力契约 | 具体 Adapter 实现、Vue 页面 |
| src/adapters | R1 DTO/Wire、网络、Mock、登录、持久化、原生能力 | 页面排版、商业 UI 判断、未经证据的业务默认值 |
| src/shared/ui | 多业务可复用基础视觉组件、设计 token、Shell | 单个工单/报价领域的价格、权限、流程判定 |
| src/app | Bootstrap、Dependency Composition、运行模式选择 | 不可维护的全局隐式业务状态 |

依赖方向：页面和业务层消费语义 Port，Adapter 实现 Port；平台 API 仅在 Adapter 边界。仓库的 check:boundaries 与 check:engineering-ownership 是**已有最低自动守卫**，不能替代架构 Review。

## 2. 新增业务能力的推荐流程

1. 从 R1 证据定义 Action 身份、当前角色/节点的可见/可操作资格、成功/失败/未知状态。
2. 优先复用 Action Workspace 的草稿键、修改生命周期、导航、错误反馈及权威回读，不另建平行状态机。
3. 选择 Action Content：标准字段交给 Dynamic Form Runtime；勘察媒体、报价/SKU/套餐、合同等复杂体验使用领域组件。
4. 定义或复用 Typed Port，再由 Adapter 实现 R1 协议与同等 Mock 路径；未知写入能力显式阻断。
5. 创建独立的 domain/adapter/Mock/真实主 App H5 和跨平台相关测试；根据 Owner 视觉范围补充截图。
6. 保持业务页面与测试辅助界面隔离。DEV QA Console 必须有明确构建与可达性边界。

不直接创建“大而全”的 Dynamic Form 插件市场，不修改 R1 既有后端，只引入有业务依据的具体 Action 类型。

## 3. Pinia 与异步状态

- 全局 Session/Role 只保留必要身份和安全上下文；Server-derived state 属于业务 feature。
- 每个业务状态有一个可辨认的 owner。报价金额与编码由 Quotation Engine 负责，Workflow 节点资格由 Workflow Runtime 决定，不能在多个页面复制同一推导。
- 每次异步响应/提交前后必须检查用户、角色版本、WorkOrder、节点身份；角色变化或撤权后旧请求不能污染新页面。
- 区分 stored draft、effective business state、submitted state。保存本地草稿或表单不等于 Workflow Complete。
- 网络不确定回执不能自动重试会产生副作用的业务命令；后续必须按协议重新读取/对账。

## 4. 拆解大模块时的变更准则

- 保留稳定公共导入路径和 facade，先抽取内部纯逻辑/控制器，避免一轮同时更改页面、业务协议、存储和视觉。
- 一次 PR 优先覆盖一个 coherent capability slice；提供旧/新行为一致的证据，不以 LOC 降低或重复 CSS 数量作为成功证明。
- 对报价优先沿用 QuotationShared/Groups/Editor/Catalog/PackageConfiguration 五个 owner 和既有导入/级联顺序；Golden 仅由单独视觉审批更新。
- 后续施工、验收、售后能力可在 features/work-orders 内形成独立子能力；是否移动既有路径，应等测试和依赖映射完整后决定。

## 5. 命名与文档映射

- 业务概念沿用 WorkOrder / WorkflowNode / Action / FormData / Quotation / Order / Contract，不把 UI 文案当领域枚举。
- Port 命名为语义能力，Adapter 命名为具体 R1/uni/Mock 实现；测试文件使用被测行为与拒绝场景命名。
- 每次新增“一个正确的业务规则”必须能定位到一个代码 owner、一条 R1/Owner 证据和至少一种自动验证。
- 任何新例外写明源头、适用范围、过期/复查条件，不在 UI 散落魔法字符串。

