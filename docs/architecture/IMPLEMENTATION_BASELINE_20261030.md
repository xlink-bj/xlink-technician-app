# Implementation Baseline — main@17ba7211

> **Status: DRAFT SNAPSHOT / Code-grounded** · 2026-10-30
> **Owner:** ChatGPT Lead (maintainer); Product Owner approval required before treating this Draft as current policy.
> **Scope:** Architecture/documentation only. No business, backend, production, CI or release authorization changes.
>
> 仓库 xlink-bj/xlink-technician-app，审查主干 17ba7211040df887be28665564414cb037b6acef。本文件描述**已经在代码中出现的结构**，不是功能已验收或可写 Beta 的声明。长期边界以 [Target Architecture](TARGET_ARCHITECTURE.md) 为准；运行/协作约束以 [AGENTS.md](../../AGENTS.md) 为准。

**后续变更索引（不回写旧快照）：**[C1-FIX #238](https://github.com/xlink-bj/xlink-technician-app/pull/238) 已于 2026-10-30 合入 `main@57cde73`，发布产物不再注册四个 DEV QA 页面；第 5 节关于 QA 路由的描述仅对应本文件固定的 `17ba721`。后续 C2 架构改动按 [#241](https://github.com/xlink-bj/xlink-technician-app/issues/241) 独立审查，不能把尚未合并的实现写成当前事实。

## 1. 一套业务代码，多端编译

- Vue 3、TypeScript、uni-app、Pinia；pnpm + Vite、Vitest、Playwright。
- 主交付目标为 MP-WEIXIN、Android、iOS；H5 用作真实主 App 的开发/浏览器回归环境。
- 直接复用既有 R1 后端 API；R1 是业务逻辑、角色、Workflow、字段、金额和副作用的**唯一参照**，但不是新版前端架构模板。
- 对未知业务字段、Node 类型、金额、权限、签约/上传副作用采用 fail-closed。

## 2. 目录和责任（当前，不是重排计划）

~~~text
src/
  main.ts, App.vue, pages.json, manifest.json   框架入口和路由
  app/                 装配、配置、Mock 场景编排
  pages/               页面容器与路由级交互
  features/
    session/            登录与用户协议
    home/               首页、数据源切换/开发诊断
    work-orders/        列表、详情、Action Workspace
      components/       通用表单/勘察领域内容
      quotation/        报价、目录/SKU、套餐、Order、样式 owners
      signing/          签约前只读与命令预检
  runtimes/
    workflow/           节点、身份、Action Projection
    action/             通用草稿仓库/身份
    dynamic-form/       字段、可见性、校验、归一化
    media/              本机媒体队列与状态
  shared/               ports、types、state、config、ui
  adapters/             api、mock、auth、platform、storage、upload
  test-support/         辅助测试数据
~~~

按当前 Git 树：896 个文件；src 289、tests 224、docs 203、scripts 57、.github/workflows 47。src/features/work-orders 92 个，其中 quotation 47 个。数量不等于缺陷数。

主要依赖链：

~~~text
Page / Vue Presentation
  -> Feature Use Case / Pinia Store
  -> Workflow / Action / Dynamic-Form Runtime
  -> Semantic Typed Port
  -> R1 API / Mock / Storage / Platform Adapter
~~~

- [Composition Root](../../src/app/composition.ts)提供各类 Port 工厂，[Bootstrap](../../src/app/bootstrap.ts)向 Pinia Store 注入具体依赖。
- [Work Order Detail](../../src/pages/work-orders/detail.vue)是信息/当前动作入口；[Action Workspace](../../src/pages/work-orders/action-workspace.vue)是完整编辑与执行页面。
- [Workflow Projection](../../src/runtimes/workflow/detail-projection.ts)确定动作可见/可执行资格；页面不应由中文标签或数组位置推断。
- [Quotation Engine](../../src/features/work-orders/quotation/engine.ts)集中校验、价格和 Order 编码顺序；真实订单提交是独立边界。

## 3. 已实施和未证明的业务层次

| 能力 | 已有代码/离线验证路径 | 尚未获得的权威证据 |
| --- | --- | --- |
| 登录、工单、角色读取 | Session + scoped WorkOrder Read + H5 Mock | 真实多角色与设备交互的完整验收 |
| Workflow / 动态表单 | Runtime、FormData 映射、P0/P1 合成场景 | 未知 Node/Provider 的 Live 业务语义 |
| 预约、勘察 | Workspace、专用控件、本机草稿、媒体安全策略 | 真实写入、照片/权限/弱网全设备闭环 |
| 报价、SKU、套餐、Order | 领域编辑器、目录和价格规则、合成 type=1 Order 与受限正式 Order 读取 | 当前租户有效价格、正式创建/修改及权威回读 |
| 合同与签约 | Order/Contract 受限只读、签约命令意图审查 | 签署、PDF、短信、合同状态变化、handler 授权和异步回执 |
| Android/iOS/微信 | 多端编译与 H5 行为自动测试 | 真机安装、摄像头、网络、安全区与原生一致性 |

历史 A-stage Mock 工程退出证明的是**特定合成路径**，不等价于全量 Live R1 行为。参见 [No-Beta Path](../engineering/NO_BETA_ENGINEERING_PARITY_PATH.md)。

## 4. 环境、身份与命令边界

- DEV Mock 与真实业务使用同一语义 Runtime/Port，合成 ID 的归属由 [Mock Ownership](../../src/adapters/api/mock/ownership.ts)识别，缺失 fixture 时不能 fallback 到真实网络。
- [Production Read Only Policy](../../src/shared/config/production-read-only.ts)对环境与真实主机双重识别，按允许的路由/参数进行有界读取。
- [Read Transport](../../src/adapters/api/uni-api-read-transport.ts)针对 Order、子 Workflow 与 Repeat FormData 做身份/作用域复核。
- [Command Transport](../../src/adapters/api/uni-api-command-transport.ts)阻断 Production 业务命令、未授权签约和报价副作用；通用写开关不等于特定业务授权。
- 草稿状态、实际业务状态和服务器已提交状态不同；异步超时/回执不确定时不得乐观宣告成功。

## 5. 主要复杂度集中点（待治理，不自动代表错误）

- [action-workspace.ts](../../src/features/work-orders/action-workspace.ts)约 2,356 行：承载跨动作协调。
- [QuotationActionContent.vue](../../src/features/work-orders/quotation/QuotationActionContent.vue)约 1,698 行：业务编辑和较多 UI 状态。
- [detail.vue](../../src/pages/work-orders/detail.vue)约 1,117 行：详情组合视图。
- [technician-api.ts](../../src/adapters/api/technician-api.ts)约 2,096 行：多个读模型映射集中。
- [Mock router.ts](../../src/adapters/api/mock/router.ts)约 968 行：合成场景/协议路由。
- pages.json 注册 DEV QA 和 Mock Review 路由；已有 DEV 保护，但仍需对正式发布产物做独立可达性/资源审计。
- 文档与 CI 专项资产数量较多；只有经过触发器/依赖/历史证据审核才能收敛。

**治理顺序**：权威文档/QA 包审计 → 保留 public facade 的 Action 子模块拆解 → API/Mock 内部分层 → CI/配置收敛。不可为目录整齐进行未验证的大搬迁。

## 6. 验证现状（与本次评审分开）

该 HEAD 的 [Validate](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40884013124) 与 [Validate Main H5 UX](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40884013114) 于 2026-10-29 通过；main push 下 quick job 依条件跳过，属于配置预期。本次文档评审没有重新执行本地测试、未执行 Production/Beta 写入或真机操作。具体 gate 以 [Quality & Environment Gates](../engineering/QUALITY_AND_ENVIRONMENT_GATES.md) 为准。

