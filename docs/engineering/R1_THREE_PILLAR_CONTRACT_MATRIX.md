# R1 三大契约对齐：Workflow / 动态表单 / Order–SKU–Contract

状态：**SOURCE_VERIFIED / SYNTHETIC_TEST；LIVE_SCHEMA_INCOMPLETE；不是生产验收**。

## 权威来源与边界

- R1 前端源码：`xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`：
  - `business/subpackages/serviceAppointment/serviceAppointment.vue` 约 2564–2724、3014–3730、6522–6605、6877–6952、8665–8700、9215–9229 行。
  - `business/subpackages/order/placeOrders.vue` 约 3498–3650、6090–6390 行。
- R1 后端冻结快照及先前接口调查：见 [`R1_FRONTEND_MODEL_CONTRACT_ALIGNMENT.md`](./R1_FRONTEND_MODEL_CONTRACT_ALIGNMENT.md) 和 [Issue #199](https://github.com/xlink-bj/xlink-technician-app/issues/199)。
- 本次代码测试使用人工生成的结构化数据；未从生产读取新业务数据、未用真实用户提交、未扩大生产只读白名单。`SOURCE_VERIFIED` 表示源码交叉验证，**不等于**已验证当前租户 API 的所有真实载荷。

## A. Workflow 子节点类型与 Action 分类

| R1 节点 `nodeDef.nodeType` | 前端 `WorkflowNodeCategory` | 能否从运行节点确认 | 行为边界 |
| --- | --- | --- | --- |
| `forms` | `forms` | 只在运行节点带有明确 `nodeDef` 时 | 表单动作，仍需表单定义与节点身份 |
| `repeat` | `repeat` | 同上 | 重复记录，数据读取及写操作另行鉴权 |
| `subflows`、`subflow`、`subworkflow` | `subworkflow` | 同上 | 仅明确子流程入口可发起子流程读取 |
| `placeOrder` | `placeOrder` | 同上 | 不因分类自动授予报价/订单写入权限 |
| `user`、`accept`、`allot`、`dispatch` | 分别同名 | 同上 | 人员/分配动作须经过各自命令门禁 |
| `system`、`sentinel` | 分别同名 | 同上 | 不等于用户可操作业务节点 |
| 缺失、未知 | `unsupported` | **未证实** | 不做推断，不允许据此启用表单/订单动作 |

**关键结构区别**：`workflow/queryByParentWorkflowNodeId/{outerNodeId}` 返回的是 `Workflow[]`，每个子 Workflow 的 `_id` 是子运行 ID、`parentFlowNodeId` 指向外层 `subflows` 节点、`workflowNodeList[]` 中的 `parentWorkflowNodeId` 是**子流程内部前驱**。三种 ID 不能互相替代。

R1 历史渲染在 `getSubWorkflow` 中先读取 `workflowDef/queryById/{defId}` 的 `def.nodes`，再把 `workflow/queryNode/{runId}` 的运行节点**依索引**覆盖定义列表，并给没有 `nodeDef` 的未运行节点包一层 `nodeDef`。这解释旧页面为何有时能显示定义节点，但数组位置并非可靠 runtime-node/definition-node 身份证明。新 App 不按位置补造分类：读到运行节点 `nodeDef` 才标记 `nodeTypeEvidence=runtime_node_def`；缺失则 `unresolved/unsupported`。此前 Issue #199 已记录的 12 条真实子节点缺失类型**仍未解除**。

## B. R1 ExtField 动态表单矩阵

| `type` | R1 原始控件与值形态 | 新 App 当前处理 | 判定 |
| --- | --- | --- | --- |
| `text`、`textarea` | 文本输入，字符串 | 通用文本/多行；保留业务 `valueKey` | 对齐 |
| `phone`、`IDNumber` | `van-field` 数字键盘；值保留文本 | 文本值、不转数字（避免丢前导零） | 对齐值结构；键盘 UX 待设备验证 |
| `number`、`digit` | 数字/小数 | `number` 安全整数、`digit` 有限小数 | 受约束，不推断单位 |
| `switch` | `van-switch` `active-value="1"` / `inactive-value="0"` | 接纳并保留字符串 `"1"/"0"`；Mock 旧布尔仍兼容 | R1 wire 修正；真实写回未验证 |
| `date`、`time`、`datetime` | 日期/时间选择器 | 字符串；不假定时区或时间戳 | 值结构可用，格式待真值核对 |
| `select`、`radio` | 单项，`valueOption`/Code 字典或源 options | 需证实 option provider；标识符不当 label 保存 | 有条件 |
| `checkbox` | `van-checkbox-group`，数组 | 必须是数组；不接受 scalar | R1 值结构修正 |
| `cascade` | 级联层级选择，路径型数组 | 证实层级 options 后可用；不臆造行政区规则 | 有条件 |
| `bizSelect` | 业务实体选择器，常初始化 `[]` | 不复用 Code 字典；未验证 provider 时阻断 | **部分未解** |
| `rate` | 数值选择 | 可保留数值；范围仍需字段证据 | 有条件 |
| `file` | 真实附件上传，可能含媒体数组 | 有独立媒体/身份/上传状态控制 | 必须经过既有上传权限门禁 |
| `image` | **`frontEndConfig.list` 的只读参考图片** | 映射 `presentationOnly`；不转为上传按钮，不把原始外部 URL 投送 UI | **值语义已修正**；源图片渲染待接入 |
| `title`、`gap` | 标题、留白；无 FormData 业务值 | `PRESENTATION_ONLY`，不校验 required、不提交 | 对齐 |
| `area` | 省/市/区数组 | 保留 `UNSUPPORTED`，绝不当数字字段 | 待区域码字典及数组语义证据 |
| `button`、`scan`、`addItem`、`pushItem`、`bgImage`、`sort`、`evaluate`、`dialog`、`data` | 特殊交互、复杂嵌套值、计算和控制 | `UNSUPPORTED`，不得借通用编辑器启用 | 待专项契约 |

字段独立身份：ExtField `_id/id/fieldId` 是**字段行 ID**，`name` 才是 FormData `valueKey`；同一个 `valueKey` 可以由两行复用，不能按 key 去重。`showList` 取 `"4"` 才适用于 R1 移动详情，`frontEndConfig.mpDetailHide=true` 另行隐藏；畸形的 `showList` 或配置不能清洗成“看似有权限”的可编辑字段。`required/readOnly/visibility` 应在当前作用域求有效态，**隐藏字段不应泄漏到提交**。为了兼容既有本地非 R1 fixtures，未提供 `showList` 的合成字段继续由各自运行时处理，这不代表 R1 源字段缺少该标记时可显示。

目前 `image` 的参考 URL 只属于源 UI 展示能力，并没有验证 App 的域名白名单/图片授权，所以当前通用表单仅呈现该字段的标题占位，不加载参考图、也不提供上传按钮；这不能描述为全视觉等价。后续需设计明确的授权图片投影与实体设备展示验收。

## C. Order / SPU / SKU / Contract 语义矩阵

| 概念 | R1 来源和判定身份 | 本次硬边界 | 尚未证明的部分 |
| --- | --- | --- | --- |
| WorkOrder–Order | `serviceAppointmentId` 是 Order 归属；`_id/id` 是 Order 身份，`type=1` 是正式单，非工单 | 精确身份一致、类型一致、有限列表、重复行拒绝 | 生产列表只读内容及完成态语义 |
| Order 生命周期 | `state`、`processState` 是有符号的状态码；历史生产样本实际存在 `state=-1` 和 `processState=-1/-2` | 在列表及精确详情投影保留负数，缺失/非法值仍不制造状态；签约、替换编辑只在其自身明确准入状态下进行 | 状态码完整字典与合法转移仍未证明 |
| 订单列表来源 | R1 技师页面用 `basic/order/clearOrderFieldQuery`，`_all=1`，订单状态筛选；新 App 当前用 `basic/order/query` 限制 `type=1`、WorkOrder、最多 3 行 | **两条接口不宣称同义**；新接口是 scoped review，不是 R1 视觉订单全量复刻 | 这两路响应、分页、取消/变更单关系 |
| `bjProducts.orderList[]` | 订单按 `repairParts` 分组，子项 `projPackages/procedures/materials/measures` | 显示投影保留类别，不能把未知内容算已验证；嵌套/行级 SPU 与 SKU 身份冲突即拒绝 | 全量商业价格和规格保存/读回 |
| SPU | 材料目录 `_id`，候选销售属性 `exts[fieldName]`；SKU 通过 `spuid` 关联 | 不能把 SPU 视作 SKU；只允许已定义选项进入选择器 | 活跃租户当前销售属性完整性 |
| SKU | `basic/material/query` 的 SKU `_id`、`spuid`；属性选项来自 `biz/extField/query` + `i/code/selectCode.do` | 双别名互相矛盾即拒绝；跨 SPU、非 active、重复 SKU、缺失必选属性都阻断；价格与库存不暴露 | 真正下单数量/库存/价格校验 |
| Contract | R1 技师页面 `basic/contract/query.do` 按 `serviceAppointmentId`，`state=1` **OR** `exts.contractStatus=-2` | 当前测试通路仍限定为人工合成，必须先确认同工单 `type=1` Order；显式违反查询条件拒绝；不可读 PDF 或签名 | 生产读授权、文件权限、签约结果/命令 |

`basic/order/queryById` 返回的是详情读模型，不等于 `clearOrderFieldQuery` 的聚合列表。R1 `getOrderById` 对 `bjProducts` JSON 进行解析；新 App 的有限 `OrderBrowse` 仅作为只读结构摘要，不能代表完整编辑/结算快照，也不能授权改价、取消、发送合同。

## 已有真实只读证据复用（无需重复访问 Production）

这一节与上面固定 R1 源码及人工合成测试**不同证据等级**。只引用已提交的脱敏历史报告，不重新取客户数据、真实 ID、字段值或合同内容；历史快照不自动代表 2026-10-24 的最新租户配置。

| 证据来源 | 已得到的真实结构 | 可用的结论与限制 |
| --- | --- | --- |
| [2026-10-09 Production Order ExtField capture](../verification/G4F_ACTIVE_ORDER_EXTFIELD_SCHEMA_SHAPE.md) | 同账号租户 `colName=order`、移动详情的**完整当页 32/32 行**；`placeOrder=9`、`submitOrder=10`、其他/未识别=13；字段型 26 generic、3 gap、3 unsupported（2 area、1 button）；7 行需选项 provider | 证明这一租户在该时点的 Order *定义结构*；不是某个工单生效的表单，也未读取 Code/级联选项，更不能推广到普通 Workflow FormDefinition |
| [2026-09-22 Beta Order/Workflow read](../verification/G4F_R1_RUNTIME_FOLLOWUP.md) | 当时 Beta 一个 `placeOrder` Workflow 定义、1 个 type-1 Order 的工单归属与 `bjProducts.orderList[]` 结构；Beta `order` 定义查询 55 行，移动详情有效 34 行（9/11/14） | Beta 不等于当前 Production；34 与 32 的差异既可能是环境也可能是时间/租户条件，**不能据此断言系统 schema 漂移**；但可重用 `repairParts` 等字段类型的 R1 语义样本 |
| [2026-10-08 Production Order snapshot](../verification/G4F_PHASE_1J_BETA_CLOSURE_HARDENING.md) | 已授权关系内的 38 个活跃工单、54 个 type-1 Orders；54/54 `bjProducts` 可解析；`state=-1` **17** 行、`processState=-1` **4** 行和 `-2` **1** 行；33 个 Order 的套餐行有 `skuCode`/`spuCode` 标记 | 证明负状态码和复杂 SKU 标记是真实语义，不允许当“未提供”或认为可编辑；不证明当前账号能对这些 Order 读全量、更不授权变更 |
| [2026-10 Production bounded App Order smoke](../verification/G4F_PHASE_1K_PROD_READ_INTEGRATION.md) | 3 个角色工单、3 次逐单 `basic/order/query` 有限查询，3 个正式 Order 身份一致、3 组/21 项结构识别；没有识别出的 SKU/SPU ID | 证明这条**有界接口**可用于工单只读摘要，不证明 R1 `clearOrderFieldQuery`、`queryById` 与之完全同义 |
| [2026-10-22 role-scoped child reads](https://github.com/xlink-bj/xlink-technician-app/issues/199#issuecomment-6342521732) | 5 个授权父节点，子节点数为 2/2/2/2/4，共 12 个运行节点；全部缺少 `sourceNodeType` | 运行身份读取通过，但 12 个动作类型仍未知，不能按数组位置补造 `repeat/forms` |

**剩余最小证据缺口**：① 在原有 5 个外层节点的同一权限范围内，能否以被授权的定义 ID/运行节点 ID 将 12 条 child runtime 精确对应到 `nodeDef`，或明确该读取被门禁拦截；② 同一角色已知具体业务动作下的 *effective* ExtField/Code/provider（不是重查租户 32 行）；③ 对同一 list-derived WorkOrder，`clearOrderFieldQuery` 与 `basic/order/query` 是否为相同过滤与分页语义。后两项可能涉及目前未准入的 Production 路由，**没有新授权就应记录 `BLOCKED_SCOPE`，不得自行加白名单或试探 API**。

## 证据等级与验收结论

| Gate | 当前结果 |
| --- | --- |
| R1 代码路径/数据语义对照 | `SOURCE_VERIFIED`：上述固定提交和函数行号 |
| 三类适配器、动态表单、SPU/SKU、Contract 构造性与反例测试 | `SYNTHETIC_TEST`：参见 `tests/engineering/r1-three-pillar-contract-matrix.test.ts`；PR 需附精确 CI / 本地执行结果 |
| 当前租户全部子流程节点类型 | `NOT_VERIFIED`：现有 12 条缺少 `nodeDef`；不推断动作 |
| 动态表单真实字段全集、Code 字典、复杂 `area/bizSelect` | `PARTIAL`：源码确认，仍需权限内脱敏字段形状样本 |
| Order–SKU–Contract 全量语义与写入读回 | `NOT_VERIFIED`：真实生产写入/签约不在本次授权内 |
| 小程序实体设备 UX / Stage 1 | `FAIL`：本次代码契约不替代设备验收 |

**仅需 Codex 辅助的剩余本地/内网取证**（在既有授权范围内，不扩大）：在已核实的工单/子流程读取路径记录 12 个子节点 `nodeDef` 与 definition identity 的**字段存在性、类型、节点数与 ID 匹配方式**；同一有限作用域记录 `biz/extField/query` 的 `type/showList/frontEndConfig` 结构和已开放的 Order 查询**字段形状差异**。仅提交汇总计数和脱敏字段名，绝不提交客户内容、真实 ID、URL、手机号/合同原文；若需要未获准的新接口则直接 `BLOCKED` 等待授权。

**发布决定：HOLD。** 可复核为前端契约治理补强，不可称真实生产三链路贯通；所有 Draft PR 未合并、未部署。
