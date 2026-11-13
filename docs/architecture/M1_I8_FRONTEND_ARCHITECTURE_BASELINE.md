# M1-I8｜前端架构基线（工程候选，非 Owner 冻结）

Status: SNAPSHOT（显式修订）
Reviewed at: 2026-11-13
Code baseline: `main@bd22b42d8e970c885bc6237b89c1c8ddd1e1ff6d`
Decision authority: Owner 决策、[AGENTS.md](../../AGENTS.md)、[Target Architecture](TARGET_ARCHITECTURE.md)
Scope: 当前前端结构及验证边界；不改变后台协议、生产授权或产品验收。

原 I6/I7 审计基线 `df9021cd3f10dbf22fff7fa94b0602c013fb9a33` 及 [I8 验收清单](../verification/M1_I8_ACCEPTANCE_MANIFEST.json)保留其历史范围；本次源码核对不重写历史 CI 或验收结论。R1 固定业务参照仍为 `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`。

## 1. 执行模型：数据适配与体验选择相互独立

```text
WorkOrder Detail → Workflow Runtime → Current Action → Action Workspace
  → Action Content（通用字段 / 专用体验 / 领域编辑器）
  → Application controller → Typed Ports → Adapters → 既有 R1 后台
```

| 维度 | 责任与当前例子 | 不可推导的能力 |
| --- | --- | --- |
| 数据适配策略 | 普通 type0 Map；精确 type1/survey 的预置 DTO + 扩展字段；Order 独立领域协议 | 预置对象不能自动当任意 Map；节点 `forms/repeat` 也不是存储类型 |
| 视图选择 | 通用 Panel/共享字段；预约专用时间体验；Survey 渗漏原因/媒体体验；报价领域编辑器 | 专用体验不要求固定 DTO，通用字段不要求 Map |

预约可以是 **动态 Map + 专用时间体验**；当前三字段预约也能走已证明的配置编辑子集，不伪造六字段。Survey 是 **预置 DTO + 可扩展字段**，可以复用共享字段并组合专用体验，不再作为 Dynamic Form 的子模型描述。Order 的目录、金额、产品快照、保存与签约前只读有独立领域处理。

正常入口是 [action-workspace.vue](../../src/pages/work-orders/action-workspace.vue) → [normal-form-action-page.ts](../../src/features/work-orders/normal-form-action-page.ts) → [R1FormActionContentHost.vue](../../src/features/work-orders/R1FormActionContentHost.vue) → [R1NodeFormsActionContent.vue](../../src/features/work-orders/R1NodeFormsActionContent.vue)。同页保留的 `GenericDynamicFormActionContent` / `SurveyLeakageCauseExperience` 是其他已有路径，不能代表正常 Reader/Provider 主链。[QuotationActionWorkspace.vue](../../src/features/work-orders/quotation/QuotationActionWorkspace.vue) 已存在，签约前只读也已存在；二者不能再统称 future。

## 2. 职责与源码入口

| 关注点 | 当前所有者 | 边界 |
| --- | --- | --- |
| 信息与动作 | [detail.vue](../../src/pages/work-orders/detail.vue)、[action-workspace.vue](../../src/pages/work-orders/action-workspace.vue) | 详情提供上下文；Workspace 组织执行，不在信息 Tab 推断写权限 |
| Workflow / 权限 | [workflow policy](../../src/runtimes/workflow/policy.ts)、[normal reader](../../src/app/r1-node-forms-read.ts)、[配置编辑 controller](../../src/app/r1-configured-record-edit.ts) | 会话/角色列表、当前节点、handler、grant、reader lease 各自核验；可见性、控件支持和服务器授权不能互相替代 |
| 共享字段语义 | [action-form-schema.ts](../../src/features/work-orders/action-form-schema.ts)、[repeat projection](../../src/features/work-orders/r1-repeat-form.ts)、`src/runtimes/dynamic-form/`、`src/shared/ui/` | 解释已支持类型、选项、可见/必填/只读及校验；保留有限动态机制，未知配置显式拒绝，不新造低代码引擎 |
| 存储 codec | [reader-issued storage 策略](../../src/app/r1-record-edit-source.ts)、[Map root/EXTS](../../src/adapters/api/r1-field-storage.ts)、[Survey codec](../../src/adapters/api/survey-form-codec.ts)、[typed 原文保全](../../src/adapters/api/r1-typed-survey-preservation.ts) | 从可信完整原文应用已验证补丁；不授予编辑资格，不由显示值重建整份 DTO |
| 本地草稿 | [normal drafts](../../src/app/r1-normal-form-drafts.ts)、[草稿专题](LOCAL_DRAFT_AND_WEAK_NETWORK_ARCHITECTURE.md) | 身份、内容版本、恢复及存储；首次新增草稿已验证不代表所有已有编辑和媒体跨重启恢复已完成 |
| 保存与回读 | [配置编辑 controller](../../src/app/r1-configured-record-edit.ts)、[R1 wire adapter](../../src/adapters/api/r1-special-workflow-wires.ts) | fresh read → 完整原文/配置复查 → 持久 uncertain fence → 同 ID upsert → 完整 ACK → 权威回读 → completed；未知结果不重放 |
| Order | [order-submission.ts](../../src/features/work-orders/quotation/order-submission.ts)、[quotation-order-api.ts](../../src/adapters/api/quotation-order-api.ts) | 独立产品/价格快照及 Order 协议；不接入 Survey 保存策略，历史价格不被当前目录价覆盖 |

Shell 统一页头、草稿反馈、底部 Action Bar 与安全区，参见 [Action Workspace](ACTION_WORKSPACE_ARCHITECTURE.md) 和 [UX Standard](../design-system/ACTION_WORKSPACE_UX_STANDARD.md)。实现仍由多个有界 controller 组成，不宣称全部动作已统一成一个万能执行器。

## 3. 当前 v6 编辑是隔离验证能力

[src/app/r1-configured-record-edit.ts](../../src/app/r1-configured-record-edit.ts) 的入口要求 `version===6`、`synthetic===true`、非空 `recordIds`，并绑定 tenant/user/role/workOrder/run/node/FormDef/field IDs。节点必须为有明确来源的 **active repeat**；当前记录集合、完整原文、存储来源、schema 及 reader 私有代次均须一致。依赖 [r1RepeatActionsEnabled](../../src/app/r1-repeat-actions.ts) 的 DEV loopback、非 Mock、双写开关及同源 API 限制。它不是全生产编辑开通。

当前已有编辑字段预算最多 200，记录最多 50，缺页/重复身份/未知配置仍拒绝。已支持条件限于 type0 Map 的 root 元数据 showType=3、单已声明依赖、非空字符串 equals；级联为单路径，尚未核实的显式清空仍拒绝，见[条件/级联证据](../verification/R1_MAP_CONDITION_CASCADE_INTEGRATION_20261113.md)。Map 的已证实 choice、日期时间、条件/级联、checkbox、其他 scalar、默认 switch/rate、精确 bizSelect 与附件能力各有有界实现及对应证据；不能用某类型控件存在推导所有 provider、条件、清空或媒体路径已验收。初始 text/number 子集报告是历史，不是今天的完整支持清单，见[有限动态纠偏](../verification/R1_CONFIGURED_EDIT_BOUNDED_DYNAMIC_CORRECTION_20261113.md)、[Map scalar](../verification/R1_MAP_REMAINING_SCALARS_INTEGRATION_20261113.md)、[switch/rate](../verification/R1_MAP_DEFAULT_SWITCH_RATE_INTEGRATION_20261113.md)、[bizSelect](../verification/R1_MAP_BIZSELECT_SCALAR_EDIT_20261113.md)。

此 controller 仅已有记录 save-only，不创建或删除记录、不 Process、不 save-and-complete；附件引用保留/删除及上传仅按当前记录会话和回执证明启用，见[当前 controller](../../src/app/r1-configured-record-edit.ts) 与[媒体会话](../../src/app/r1-normal-form-media.ts)。独立 create/complete/预约能力不能借此扩大权限。保存前撤权、配置漂移或原文变化拒绝；丢响应、错误 ACK/回读会保留持久不确定状态。它不提供服务器 CAS 或跨运行时原子事务。

## 4. R1 存储及日期兼容

- **Map**：在可信完整原文上保留 root，明确 `preset=false` 的已修改字段按 R1 规则同时镜像 EXTS；未知/隐藏原值保留，冲突或不完整来源不能静默覆盖。读投影不决定可写槽位。
- **Survey DTO**：明确类型/collection 后才用 typed 策略，保留完整原文、继承字段、数组和未知扩展；按 reader 证明的槽位写补丁。未知 typed root、无法保全的显式 null、不安全整数和 root/EXTS 冲突拒绝。其他预置 DTO 需单独适配证明。
- **日期**：业务 datetime 使用共享本地日历规则，未完成的日期/时间选择不能提交，不猜时区、epoch 或丢失毫秒。Map 分开保留 raw 与 query wire，仅允许已观察的继承审计 Date→秒级字符串兼容；不将此例外扩大到业务日期或其他字段，也不宣称 BSON 无损。Survey 精确 raw 日期与 ACK/回读比较另有规则，不能套用 Map 转换。

[三模型实证](../verification/R1_CONFIGURED_MODEL_REAL_INTEGRATION_20261113.md)记录：预约 N03 的创建审计 Date `.251` 经 R1 查询/整 Map 替换成为秒级 String；Survey N05 创建时间 `.624` 保留；Order 创建时间 `.296` 截至秒且已有 getter 默认值落盘。这些是各样本的兼容限制，不能泛称所有 typed 对象无损，也不能推测后台丢失的精度。

## 5. 扩展工作量边界

| 变更 | 所需工作 | 不可省略 |
| --- | --- | --- |
| 已支持字段的新配置 | 当前 FormDef/ExtField/provider、顺序及已支持规则可直接复用投影和控件 | 仍需真实来源、完整分页、权限、槽位和 ACK/回读验证；未知配置不能当作无配置 |
| 新字段类型或新行为 | 补 adapter 解析、能力声明、runtime 校验、共享控件、存储编码及必要平台能力 | 条件/隐藏值、清空、草稿、媒体归属、错误回执和负例；不是只加 Vue 控件 |
| 新预置 DTO | 核实类型/collection、完整原文、字段槽位、继承/null/日期语义和保存/回读协议 | 专用 preservation/codec 及有界 controller 接入证明；不能通过强转 Map 自动开放 |
| 新领域体验 | 组合共享字段、Shell/草稿及专用内容，保留领域协议和状态机 | 独立核实领域命令与副作用；Order/签约等不归通用表单自动承接 |

## 6. 已验证与未验证

[三模型实证](../verification/R1_CONFIGURED_MODEL_REAL_INTEGRATION_20261113.md)分别证明预约 Map、Survey DTO、已有正式 Order 各一次隔离 Java 正常 App 保存；预算均已消费，不重放。Survey 保存结果与后续只读重进已核实，但原 driver 的 HMR 检查失败保留，不称整份脚本全绿。[实证对账](../verification/R1_LOCAL_REAL_INTEGRATION_EVIDENCE_20261113.md)另保留历史隔离 Survey create/显式 Process、type1 Order 创建等独立成果，不能因本次 save-only 抹去，也不能拼成完整连续签约闭环。

[签约前只读核验](../verification/R1_NORMAL_SIGNING_READONLY_ELIGIBILITY_20261113.md)已在正常页面组装当前节点/handler、正式 Order 与独立合同范围；Production 禁用新增资格核验动作。`mayDispatch`、`backendPermissionProven`、`actualBusinessOutcomeKnown` 始终 false；入口条件不是完整签署权限。短信、签名 URL、合同变更等命令仍独立阻断。

Production 只读，Issue #201 HOLD 不变。真实 Qiniu、真实签署、短信、付款与完整签约链路未通过；真实 Java token + 合成存储不能称 Qiniu 上传通过。H5/MP/App 构建不等于原生真机通过，`CODE_PASS` 不等于 `COMMERCIAL_UI_ACCEPTED`。本文件不授予部署或发布授权。

当前工程候选原则包括模块分层、数据/体验分离、有限字段能力、共享 UI、身份撤权、草稿/保存/Workflow 分离及回读/不确定保护。I8 未经 Owner 决策不得标记 ACCEPTED。静态核查：`pnpm run check:m1-i8-baseline`（仍检查其历史 manifest）；完整工程核查：`pnpm verify`，均不能替代真实业务验收。
