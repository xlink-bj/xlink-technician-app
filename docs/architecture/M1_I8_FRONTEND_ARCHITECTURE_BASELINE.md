# M1-I8｜前端架构基线（工程候选，非 Owner 冻结）

**审计基线**：`xlink-bj/xlink-technician-app@df9021cd3f10dbf22fff7fa94b0602c013fb9a33`（I6/I7 工程候选）；业务依据 `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`。当前 I8 属工程准备阶段，不意味着产品体验已签收、真机/真实签约已通过。

## 1. 已确认的执行模型

```text
WorkOrder Detail（信息与当前动作）
  → Workflow Runtime（节点与执行资格）
  → Current Action Projection（当前动作及所属者）
  → Action Workspace（独立整页执行/草稿/状态）
  → Action Content
       ├─ Appointment（领域专用预约交互）
       ├─ Dynamic Form（有限配置的标准字段）
       │     └─ Survey（普通动态字段 + 渗漏原因/照片等固定体验）
       ├─ Quotation（分组/目录/规格/套餐的领域编辑器）
       └─ Signing（当前仅正式 Order→合同元数据只读/DEV 意图审查）
  → Typed Ports → Auth/Read/Command/Upload/Platform Adapters → 已有后台
```

本节是针对当下源代码的**工程快照**：长期目标以 `docs/architecture/TARGET_ARCHITECTURE.md` 为准；其中仍将 Quotation/Contract 标作“future”的历史段落，不能代替现在分支上已存在的报价组件及签约前只读功能。R1 是**业务功能、API 和副作用的唯一参照**，不是需要复制的前端框架。当前项目不新增后台接口或后台授权机制。

## 2. 四条 UI/Runtime 边界

| 关注点 | 当前代码/规范 | 工程约束 |
| --- | --- | --- |
| 信息与动作 | `src/pages/work-orders/detail.vue`；`src/pages/work-orders/action-workspace.vue` | 详情呈现工单上下文与可用动作；实际编辑/提交在完整 Action Workspace，不把可写逻辑混入信息 Tab |
| 有限动态表单 | `GenericDynamicFormActionContent.vue`、`src/features/work-orders/dynamic-form-action.ts` | 标准文本、数字、单/多选、层级等交给受限 Form Runtime；字段可见性、必填和保存由 Runtime 驱动 |
| 特殊领域体验 | `SurveyActionContent.vue`、`SurveyLeakageCauseExperience.vue`、`QuotationActionWorkspace.vue` | 预约直观时间选择、勘察渗漏原因/媒体、报价维修分组/套餐/SKU 等复杂交互使用专用领域组件，**不**强塞进动态表单 |
| Shell 与设计系统 | `docs/design-system/ACTION_WORKSPACE_UX_STANDARD.md`；`src/shared/ui/*` | Workspace 统一页面框架、草稿反馈、常驻底部 Action Bar、安全区；字段/特定体验不能重复拥有提交动作 |

架构约束引用：`docs/architecture/ACTION_WORKSPACE_ARCHITECTURE.md`、`LOCAL_DRAFT_AND_WEAK_NETWORK_ARCHITECTURE.md`、`docs/design-system/ACTION_WORKSPACE_UX_STANDARD.md`。共同 TypeScript 业务代码目标为 H5 开发验证 + MP-WEIXIN、Android/iOS 编译；原生真机属于另一个验收层。

## 3. 状态、数据与权限所有权

1. **Session/Role**：`src/app/composition.ts` 注入带当前账号/角色上下文的端口；工作空间异步回调需复查身份与工单可见列表。角色切换、登出和工单撤权后丢弃旧视图。
2. **业务草稿**：本机报价草稿有自己的标识/版本/恢复逻辑，不是后台正式 `Order.type=1`。动态表单的本地草稿、“保存表单”、Workflow Complete 与业务提交须分离；任何本地演示进度不更新真实 Workflow。
3. **正式订单只读**：`quotation-order-api.ts` 和 `signing-review-read-store.ts` 使用受当前 WorkOrder 限制的两次 Order 列表/身份核验，不能把传入 URL 或 `queryById` 的返回直接当签约权限。
4. **合同元数据只读**：`listR1ContractsForSigningReview` 默认拒绝，只有 DEV + H5 E2E + Mock data 的特定合成 WorkOrder 可演示；读取只投影脱敏元数据。R1 技术员主 `serviceAppointment.vue:9215–9229` 使用 `serviceAppointmentId`，与固定后台 `ContractServiceImpl.query` 及模型源码一致（**SOURCE_VERIFIED**）；历史 WorkOrder 页的 `workOrderId` 属另一页面。`_all=1` 会被后台解释为获取全部，因此正式 Order/Contract 有界只读改为省略 `_all`，`page=1, rows=3`；真实租户读取仍默认阻断、NOT_RUN。
5. **签约角色资格**：主 R1 页的 `isHandler` 源自当前 `WorkflowNode.handlerIds` 与用户/角色/组织角色组合，不能从工单可见性推导。真实签约前置审查的 `currentNodeHandlerVerified` 在当前 App 未取得独立可信节点证据时明确为 `false`。
6. **命令绝对隔离**：`uni-api-command-transport.ts` 对签名命令、合同变更/签名 URL 做独立硬拦截，通用写开关无权解除；`r1-signing-command-intents.ts` 提供条件审查，但 `mayDispatch=false`。`r1-signing-command-readback.ts` 严格区分“请求已受理”与“真实签署成功”。
7. **环境与设备**：现有 Production 只读范围与 mock ownership 由 Infrastructure 层控制；H5 合成验证不会成为生产或 Beta 操作授权。MP/App 构建成功不能称实际设备通过。

## 4. 导航、失败、重试与回滚

- `src/pages/work-orders/action-workspace.vue` 在实际描述符加载与 Vue 更新后同步页头，角色/工单/节点与加载版本变化时拒绝旧页响应；修复有主 App H5 现场证据。
- 编辑器可恢复草稿，但操作提交、短信、签章、合同取消均不能自动重试。失败/未知与受理中不能由前端推断成成功。
- I7 候选保留已核对的 main 与交叉 PR 祖先历史；从正式主干集成必须有新的 exact-HEAD CI、明确审批与可回滚提交，禁止 force-push 或未经授权 merge。

## 5. 当前冻结边界

**工程基线可候选冻结**：模块分层、标准/定制表单边界、Action 与 Info 分离、共享 UI、身份撤权、只读/命令隔离、错误/草稿/回读原则。**未冻结**：Owner 报价四屏 V2 与视觉细节、真实 SKU/金额与报价提交、签约角色/合同接口等价及实签副作用、微信/Android/iOS 实机交互。

完成本文件与自动守卫，仅提供 **I8 DoD #2 的审阅依据**；未经 Owner 决策不能把 I8 标记 ACCEPTED。最新可执行核查：`pnpm run check:m1-i8-baseline`，完整检验：`pnpm verify`。
