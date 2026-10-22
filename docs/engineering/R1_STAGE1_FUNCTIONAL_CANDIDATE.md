# R1 多表单 Stage 1 — 离线功能候选与验收边界

**Status: OFFLINE FUNCTIONAL CANDIDATE. NOT LIVE-INTEGRATED, NOT ACCEPTED, NOT RELEASED.**

本变更以 `xlink-app` 固定证据 `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`
中 `business/subpackages/serviceAppointment/serviceAppointment.vue` 的
`saveNodeExts` / `process` / `doProcess` 行为为参照。只在新 App 仓库实现，不修改 R1。

## 闭环范围及证据

| 功能 | R1 规则 | 本候选实现 |
| --- | --- | --- |
| forms 已有记录 | `node.exts.formList`，状态/表单定义身份保留 | 受限列表；缺失不伪装为 0 |
| forms 新增选择 | `code/query`，parentId=`nodeDef.addFormCodeId`，取 `exts.formDefId` | Read Adapter + DEV 合成草稿选项 |
| forms 保存 | `biz/extForm/upsert/{formDefId}`，再 `workflowNode/updateExts/{runtimeId}` 完整 JSON Exts；活动节点条件性 `workflow/process`，双 ID 为空 | 注入式离线编排与不可自动重放收据 |
| forms 删除 | 原 FormData 状态 -1，Exts `formList` 相应状态 -1 | 独立两步事务；不隐式推进 |
| forms 完成 | 至少一条已保存服务端 FormData，Process 传表单定义，FormData ID 留空 | 显式完成意图；仅接收服务端 IDs |
| repeat 列表 | 按确切 `workflowId` 读取 `biz/extForm/query/{formDefId}`、state != -1 | 显式 DEV Mock 读取；缺失即未知，拒绝不完整分页 |
| repeat 保存/删除 | 逐条 upsert；remove/{formDefId} + formDataId | 分离的收据保护事务 |
| repeat 批量完成 | 每条先保存，然后 Process 使用逗号连接服务端 FormData IDs | 按服务端 ACK 收集，拒绝本地 ID/重复 ID |
| 字段编辑 | 表单定义决定可编辑字段；未知/只读/媒体不猜测 | DEV 合成本机草稿编辑（新增及已保存记录的本机编辑意图） |

## 2026-10-22 源码二次核对：真实联调前 P0

固定 R1 源 `serviceAppointment.vue@6c0a97b` 再确认：

1. **一般 FormData 读取**：`6987–7017` 用 `biz/extForm/query/{formDefId}` 按 `is:_id|string#and` 查询并展平 `exts`；只有特定施工验收表单定义 `3285058246984486156` 例外使用 `findByIdWithWorkflow`。本 PR 已加入精确 ID / 唯一结果校验；不采用 R1 某些施工验收情形的 `notFilterBelongTo` 权限绕行。
2. **forms 删除存在时序差异**：`10347–10375` 原 UI 先发节点 `updateExts` 后发 FormData 状态 -1，且 `saveNodeExts` 在活动状态 `state==0` 可继续调用 `process`。本候选目前采用防重放的 FormData → Exts 两步，**不得以离线成功认定删除等价**；需首试点验证服务端一致性/并发后明确顺序与推进策略。
3. **repeat 勘察特定副作用**：`7313–7328`、`7409–7419` 指定勘察表单保存可触发 `createSurveyPDFUrl` 和 `surveyToolUpsert`。这些不是纯表单保存；未验证其幂等/权限/副作用前，本候选不自动调用。不能用真实勘察记录试写。
4. **真实执行身份**：`7213–7236` 区分子流程的 `currentNode._id/workflowId` 和主节点的 `activeTab.detail.name._id/workflowId`；`7645–7659` 重复完成使用 `subNode._id` 及其 `formDataList`。需要 #199 明确运行节点和子节点对应关系，禁止父子身份猜测。
5. **真实字段行为**：`6879–6969` 的字典、级联、Groovy 求值、媒体/多选，及 `7069–7145` 的“保存/提交”与必填验证，尚未获得试点真实字段矩阵。现有本机字段编辑不是完整 R1 表单编辑能力，复杂字段应明确不支持。

## 2026-10-22 Production 只读契约核验与离线修复

Issue [#199 只读取证](https://github.com/xlink-bj/xlink-technician-app/issues/199#issuecomment-6335747195)
已在既有受限角色范围内核对 R1 源码、只读数据库和 Production API 的工单、节点、流程、表单记录身份关联。
样本是**已完成的勘察类 repeat**，只证明读取关系；不能充当安全写入试点。

新 App 只读适配器据此修正两个契约差异：

1. `workflow/queryNode/{runId}` 的响应 `data` 为节点数组；
   `workflow/queryByParentWorkflowNodeId/{parentNodeId}` 的 `data` 为子 Workflow 数组，
   由其中的 `workflowNodeList` 展开节点。适配器保留既有测试封装的兼容路径，
   检查运行/父节点身份冲突，缺少必要的子节点集合则明确失败。
2. `biz/extForm/query/{formDefId}` 返回的普通 FormData 记录可以不含 `formDefId`；
   其定义身份取自**已限定的请求 URL**，如响应另有定义标识则必须一致。
   单条详情仍要求准确 FormData ID、唯一命中与受限分页，不扩大读取权限。

以上是**合成契约回归的代码修复**，不是对 Production 的再次请求或现场验收；
勘察 PDF、副作用、真实保存顺序、复杂字段及真机 UX 均未据此宣告完成。

### 2026-10-22 子流程真实读取复验：仍需再次验证

后续 [#199 复验](https://github.com/xlink-bj/xlink-technician-app/issues/199#issuecomment-6336995328)
证实主流程、repeat 列表、FormData 详情均可只读返回，但子流程因父节点语义混淆而 **FAIL / P0**：

- 子 `Workflow.parentFlowNodeId` 是外层 `subflows` 运行节点 ID；须按请求的父节点校验。
- 子 `WorkflowNode.parentWorkflowNodeId` 是**子流程内部前置节点** ID，不是外层 `subflows` 节点；映射时保留该值，且不再强制等于外层父节点。
- 对子节点所属 child run ID 仍做身份冲突校验；对子节点同时出现的内部前置节点别名也拒绝冲突。

已增加仅含合成 ID 的“两子节点、第二节点指向内部第一节点”回归测试。
此处是针对真实证据的**离线修复**，未在新提交上复验 Production；
`CHILD_WORKFLOW=AWAITING_RECHECK`、`MP_REAL_DATA=NOT_REACHABLE`，
**Stage 1 真实读取验收仍为 FAIL**。真正开放小程序生产只读多表单入口须单独设计和批准。

## 关键安全约束

1. **无真实业务写入。** `executeR1Stage1FunctionalCandidate` 需要外部注入网关，未连接真实页面或 API 组合根。它用于合成 Gateway 离线测试。用户点击只能产生本机草稿，不会调用后端。
2. 真实命令传输在既有 `VITE_XLINK_ENABLE_REAL_WRITES` 之外还需要独立 `VITE_XLINK_ENABLE_R1_SPECIAL_WRITES=true`。Production Read-Only 仍然绝对拦截。R1 特殊 Exts/Remove 路由必须显式标记；Exts 使用 JSON。
3. 每一步实际尝试之前，持久化 `may_have_dispatched`；网络错误、ACK 异常、授权变化或本机持久化失败会停机。即使已完成，收据在服务端权威读取确认之前也不自动清除。
4. FormData 字段原值、Exts 全量对象只在单次调用中临时使用，**不会**进入防重放收据、埋点或列表投影。
5. 对表单定义、表单现值、repeat 记录及新增选项的主动 UI 读取，限制在真实 DEV Mock 数据模式和 `mock-` 合成工单内。注入一个 `TechnicianApiReadPort` 本身不产生读取许可。

## 外部验收门槛（尚未完成）

- #199 的内网 R1 首个试点接口证据：具体请求编码、HTTP 回执、角色/组织可见性、保存后再读、重复提交语义。不能用合成数据代替。
- 真正接线前须取得 Owner 对测试环境业务写入的**单独、明确授权**；本候选不包含该授权。
- 微信开发者工具中的对应机型真机交互、失败/重试/离线、六阶段截图与 UI 验收。此执行环境未运行微信开发者工具；不声称设备 PASS。
- GitHub 远程 CI 及 Lead 审核；Draft PR 绝不自行 merge，也不部署到生产。

## 读者判断

通过本地 TypeScript、单测和 H5/MP/App 构建，只能证明**代码候选的离线质量**；不能证明真实 R1 多表单功能已联调验收。Stage 1 只有在 #199 权威证据、经授权的受控接口联调与小程序实机结果均完备后，才可升级为 LIVE VERIFIED。
