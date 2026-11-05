# R1 真实数据模型与 DEV Mock 等价清单（v1.0）

> 2026-11-05 Owner 决策；适用 `xlink-bj/xlink-technician-app` 当前技术工程师主流程。此文档是**建立 1:1 协议/模型 Mock 的执行清单**，不是 Production 原始数据导出、真实写入许可或已完成的 R1 全业务验收。

## 0. 权威来源与判定口径

- R1 前端固定源码：[`xlink-app@6c0a97b`](https://github.com/xlink-bj/xlink-app/tree/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d)；后端固定源码：[`xlink-cloud-backend@5fc008d`](https://github.com/xlink-bj/xlink-cloud-backend/tree/5fc008d32e771205260f120621c1c4fc62d0824e)。**后端原样复用，不以新 App 假设反推旧接口。**
- 已核实的技术工程师 Production 只读证据：[四个可报价上下文](G4F_SELECTABLE_CATALOG_PROD_READ_20261105.md)、[首个上下文及已有 Order](G4F_SELECTABLE_CATALOG_PROD_READ_20261104.md)、[Material SPU 价格快照](G4F_ORDER_MATERIAL_PRICE_SNAPSHOT_PROD_READ_20261105.md)、[Package 价格快照](G4F_ORDER_PACKAGE_PRICE_SNAPSHOT_PROD_READ_20261105.md)、[Procedure/Measure 价格快照](G4F_ORDER_PROVIDER_PRICE_SNAPSHOT_PROD_READ_20261105.md)、[Order/Contract 精确关联](R1_ORDER_CONTRACT_READ_RECONCILIATION_20261104.md)、[R1 领域/价格溯源](G4F_R1_DOMAIN_REVERSE_ENGINEERING.md)、[动态表单/勘查](G4E_SURVEY_DOMAIN_TRUTH.md)。
- `SOURCE`：固定源码可证；`PROD_READ`：仅指定正常技术工程师、角色可见工单及本次有界读取可证；`DEV_MOCK`：合成协议验证；`UNKNOWN`：不能凭猜测补值。验收需在同一业务上下文中分别记录 `SOURCE / PROD_READ / MOCK_PASS / LIVE_NOT_RUN`，不可互相替代。
- “1:1 Mock”指**字段身份、请求/响应 envelope、过滤/分页、关联、动态规则、价格投影、状态变化与失败语义**相等；Mock 数据内容可以是脱敏合成值。不得将真实客户、价格、token、角色原始 ID 或完整 Order/Contract 响应提交到仓库。

## 1. SKU 的当前业务决策（替代旧版全局 SKU 阻断假设）

1. 后端 `Material.spuid` 与 R1 `getMaterialSKU`/选规分支确实存在：**模型设计过 SKU**，不能说后端从未有这个字段。
2. 当前正常技术工程师的**全部 121 条角色可见工单**中，找到四种具有效 `place_order` 的 `serviceType/sourceType` 上下文，四类目录全部完成有界读取：前三种各有套餐/工序/材料/机措 `27/66/89/4`，第四种 `1/0/14/0`。前三种各 93 个上下文内 SPU、第四种 15 个 SPU 的有效 SKU 读取都为 **0**；不能据此推断全平台/其他角色零 SKU。
3. 当前角色的已有正式 Order 首页面共观察到 **40 个不同 Material SPU ID、0 个数据库 SKU ID**；若干 `skuCode` 是业务组合编码，**不等于数据库 SKU `_id`**。另在一个角色可见历史 type-1 Order 中找到一条顶层 Material 行：其仅有的 SPU 候选来自 Order 行 `_id` fallback，与当前同工单目录的一条 ID 相等，但没有显式 SPU/reference 字段，所以身份与价格均保持 `UNKNOWN`。该候选 ID 的活动 SKU 查询为空，只代表这一条不确定关联。已有 Order 扫描包含三行分页边界，不能称为完整订单普查。
4. Owner 确认该账号在原 R1 已能正常选择产品并报价。**本阶段复刻的主路径是“套餐/工序/材料 SPU/机措 + R1 有效价格”，SKU 不是这些已观察业务上下文的报价前置条件**。无活动 SKU 不得自动阻断合法的普通材料报价，也不得虚构 SKU/价格；若将来真的出现必须选销售规格的产品，则独立校验其选规与 SKU 价格，未证实前保持待确认。
5. R1 前端 SKU 映射/显示的静态可疑代码只能归类为 `DORMANT_OR_UNVERIFIED`：可能是设计遗留，**不宣称生产运行缺陷**。无需为当前业务再次普查其他角色、租户或历史 SKU；不删除后端的预留字段。

## 2. 后台数据取得清单（以主技术员 `ServiceAppointment` 路线为准）

以下 `F` 为 Mock fixture 域编号。表中每一项均需保存**请求形状和脱敏响应形状**；行数/业务值不等于字段证明。方法沿用 R1 的 form-urlencoded POST / 登录会话约定，具体路由后缀以固定源码为准。

| 编号 / 对象 | R1 读取入口 / 读取条件 | 必须保留的最小字段、关联键及状态 | 证据与待补项 |
| --- | --- | --- | --- |
| F01 登录、用户、角色、菜单 | `index/phoneLogin.do`，`function/queryTreeByRoleId` 等已获准读取；不通过切角色扩权 | `sessionRef`（运行时保密）、`user._id`、`currentRole._id`、`tenantId`、可见功能；`roleVersion` 可不存在；会话身份更换失效缓存 | `SOURCE` + 角色只读；不可把 Mock 登录当真实认证；`function/changeRole` 非纯读，禁调 |
| F02 工单列表 | `basic/serviceAppointment/query`；主列表另有 SANode 视角，不与另一 `WorkOrder` 页面混用 | `ServiceAppointment._id`、可见状态/任务、当前角色可见性、分页 `page/rows/total` | `SOURCE` + `PROD_READ` 121 行；完整只对当前角色快照成立 |
| F03 工单详情 / 当前 Workflow | `basic/serviceAppointment/queryById/{列表内_id}`，需有合法角色列表来源 | `_id`、`serviceType`、`exts.sourceType`（含缺失/空值区别）、`workflowId`、`currentNode`、运行节点 `_id`、`formDefinitionId`、`handlerIds`、节点 `type/category/state`；工单/节点同源 | `SOURCE` + 有界只读；前端 handler 的 `userId/roleId/orgId+roleId` 不等于服务器授权 |
| F04 动态表单定义 | 当前节点的 FormDef/Ext、`biz/extField/query` 或对应 FormDef 字段路径 | `formDefId/extId/colName`、ExtField `name/nameDisp/type/required/multiple/valueOption/frontEndConfig/showList/state`；条件可见、必填、级联关系 | `SOURCE`；具体活动节点字段以配置为准，禁止用历史字段列表充当生产活动 schema |
| F05 字典与字段选项 | `i/code/selectCode.do`、`i/code/selectMultistageCode` 和已证据 provider | Code ID/值/标签、父子层级、排序/禁用状态、ExtField 字段关联、选项来源/过滤参数 | `SOURCE` + 部分 `PROD_READ`；缺少选项不代表枚举为空 |
| F06 普通 FormData | 已授权 `biz/extForm/query/{formDefId}` 或节点已带记录；按明确 Data ID 读取 | `_id`、`formDefId`、`sid`、`smodule`、`workflowId`、`nodeId`、`state`、`exts`/值、保存回执；只读取属于当前节点的记录 | `SOURCE`，写入仅 `DEV_MOCK`；`saveOnly` 不能伪造 Workflow Complete |
| F07 `forms/repeat` 记录 | `biz/extForm/query/{formDefId}` 按 `is:workflowId|string#and`、`ne:state|integer#and=-1`、`createTime desc`、`page/rows` | 每条 `_id`、`workflowId`、`formDefId`、`state`；`forms` 的节点 `exts.formList[]` 与 `repeat` 的独立记录集合不能混作一表 | `SOURCE` + `DEV_MOCK`；缺内嵌列表为 UNKNOWN，不等于 0 条；见 [forms/repeat 台账](R1_FOUR_PHASE_FUNCTIONAL_LEDGER.md) |
| F08 通用媒体值 | 动态字段的文件/图片 provider、队列及最终 FormData | 本地任务 ID 与远端引用分离；FormData 中的列表对象 `url/name/extname`（适配后的 R1 wire），缺图/排队/失败/上传成功 | `SOURCE` + `DEV_MOCK`；上传队列属于**所有动态表单**，Survey 只是其中一种；真实上传未获准 |
| F09 勘查 `Survey`（区别于巡检） | `Survey` 对应有效 repeat/typed FormData、ExtField；旧活动性不能按“勘察”名称猜测 | `sid`、Survey ID、部位/测量/漏水原因/图像、`serviceGoods`、状态、可能的 `orderId/contractId`；FormData 与 typed Survey 要一致 | 历史 61 字段合成种子在 `contracts/beta/survey/historical.json`；**非当前活动生产定义**，详见 [领域说明](G4E_SURVEY_DOMAIN_TRUTH.md) |
| F10 Order 动态字段 | `biz/extField/query`：`colName=order`、激活、`showList=4`；按 `frontEndConfig.showType=placeOrder/submitOrder`、服务/客户类型计算 | 字段 `name/type/required/valueOption/frontEndConfig`，条件 `showField/showValue`、`dispensableField/dispensableValue`，输出 `Order.exts` | `SOURCE` + `PROD_READ`：租户 32 字段；另有一个当前工单上下文有效字段摘要（4 `placeOrder`、5 `submitOrder`）及其 Code/Cascade 选项结构计数。其他上下文、原始字段身份/值与写入映射仍 UNKNOWN；见[有效字段只读证据](G4F_EFFECTIVE_ORDER_EXTFIELD_PROD_READ_20261105.md)和[映射规则](G4F_ORDER_EXTFIELD_MAPPING_CONTRACT.md) |
| F11 套餐 Package 列表 | `biz/projPackage/queryWithRank`，激活 + `serviceType/sourceType` + `order,_id`；后端注入 `form=mini` | `_id/name/type/agelimit/price/minimumPrice/unit/exts`、部位适用性；必须保存 R1 mini 最终显示价、非基础数据库价 | `SOURCE` + 四上下文目录 `PROD_READ`；另有一个精确当前套餐与正式 Order 价格快照一致（1/1），无价格版本/新鲜度证明；见[套餐价格对照](G4F_ORDER_PACKAGE_PRICE_SNAPSHOT_PROD_READ_20261105.md) |
| F12 套餐详情与组件 | `biz/projPackage/findById/{已列出套餐_id}` | 套餐与子 `procedure/material/measure` 的精确 ID、`layer/order/number/coefficient/coefficientUnit`、材料 `spec`、组件 `exts.price`；**一个有效材料层选一个** | `SOURCE` + 全部已列套餐详情 `PROD_READ`；包内材料不等同独立直购 SKU；一条历史套餐已逐层匹配当前详情，另一条套餐 ID 不在其当前筛选目录，保留未知 |
| F13 工序 Procedure | `biz/procedure/queryWithRank`，与当前工单相同 scope | `_id/name/content/unit/guideUnitPrice/minimumGuideTotalPrice/exts.repairProcedure`、数量 | `SOURCE` + `PROD_READ`：一个有界上下文读到 66 条；一条直选工序与唯一当前 provider 匹配且历史单价相等。另一个交叉样本有 1 工序行 + 2 机措行，3/3 均匹配且相等；保存金额关系及 Procedure 最低起算价规则有效。只证明这些样本，不证明价格历史新鲜度；子类字典 `repairProcedure` 不等于维修部位 |
| F14 材料 Material SPU | `basic/material/queryWithRank`，相同 scope；材料类目 `type1/type2` 取决于 serviceType | `_id/code/name/type/spec/specUnit/materialUnit/price/servicePrice/exts`、数量；区分 mini 返回 `price` 与原始服务价 | `SOURCE` + `PROD_READ`；**正常无 SKU 材料选择可继续**，缺价格仍不可提交；另有一条历史直接 Material 行因只含行 ID fallback 而未接受为 SPU |
| F15 机措 Measure | `biz/measure/queryWithRank`，相同 scope | `_id/name/content/unit/guideUnitPrice` 与有效数量/金额；不可当作 Procedure | `SOURCE` + `PROD_READ`：一个 exact WorkOrder 上下文读到 4 条；两条直选 Measure 行通过唯一 ID/金额关系核验，并与当前 `guideUnitPrice` 相等。只证明所读样本，不证明历史价新鲜度或 Order 写入 |
| F16 产品选项/销售属性 | `biz/extField/query(colName=material)` + 精确 Code 字典 | 销售字段 ID、键/值及适用产品；仅当 R1 实际要求选规时启用 | 当前四上下文均读到 1 个属性、66 个选项；不代表存在活动 SKU |
| F17 SKU（非当前主路径必需） | `basic/material/query`，`spuid` 或 `in:spuid|array#and` + `state=1`，与目录 `queryWithRank` 不同价投影 | SKU `_id`、`spuid`、`exts` 销售属性和自身 `price`；无真实 SKU 则返回**空列表**，不得复制 SPU 生成伪 SKU | 四个当前 Place Order 上下文中已查询的有效 SKU 为 0；历史直接 Material 候选的 fallback ID 查询也为空，但该 ID 尚未确认为 SPU。仅限这些上下文/ID；历史静态选规代码 `DORMANT_OR_UNVERIFIED` |
| F18 已有报价/正式 Order 列表 | `basic/order/query`，仅角色列表派生 `serviceAppointmentId`，明确 `type=0/1`；有界分页，无 ACL 绕过参数 | `Order._id/type/serviceAppointmentId/serviceAppointmentNum/contractId/state/exts`；多 Order/工单，`type=0` 与 `type=1` **不是同一次写入的别名** | `SOURCE`；`PROD_READ` 每个被选 WorkOrder 最多首 3 条 type-1；direct Material 候选仍因仅行 ID fallback 保持 unknown；另有一只读 WorkOrder 的 2 条 type-1 Order 含 1 Procedure + 2 Measure 直选行；type=0/后续 Order 页 `NOT_RUN`，不读任意 Order ID |
| F19 Order 详情与报价快照 | R1 编辑使用 `basic/order/queryById`，新 App 必须先有角色列表/Order 列表来源并独立守卫 | `Order.bjProducts` **JSON 字符串**，解析 `orderList[]` 维修组、四类 `{totalAmount,data[]}`、`addItems/deleteItems`、`otherItemsAmount/preferentialAmount`；每行快照 `amount/totalAmount/number`，另有顶层 `originPrice/totalPrice/discount` | `SOURCE` + 部分 `PROD_READ`；Material 候选身份仍 unknown；Procedure/Measure 3 条来源可证快照均匹配唯一当前 provider 且等价。历史金额不可由目录价覆盖；`queryById` 服务端独立授权不足，Production 通用直查仍关闭 |
| F20 合同 Contract（只读） | 主技术员 `basic/contract/query.do`，`serviceAppointmentId` + `(state=1 OR exts.contractStatus=-2)`，`createTime desc`；安全读取省略 `_all`，固定小页 | `Contract._id/serviceAppointmentId/orderId/state/exts.contractStatus`、可证明的时间字段；若 Order 有 `contractId` 必须再精确相等 | `SOURCE` + **一个**技术工程师 WorkOrder/Order/Contract 只读关联样本 `PROD_READ`；一般 Production Contract UI 通路仍关闭 |
| F21 签约资格与状态 | 最新工单节点/handler + 确认的正式 Order + 精确关联的 Contract | 已核验、待确认、权限拒绝、状态未知；签约链接/二维码、PDF、短信、状态同步均**不属于纯只读状态** | `SOURCE` + `DEV_MOCK`；签约写和用户触达 `NOT_RUN` / 禁用 |

## 3. 关键关联模型（不能退化为独立无关的 Mock 列表）

| 源实体 | 必须成立的身份关系 / 基数 | 反例 |
| --- | --- | --- |
| `Session → ServiceAppointment → WorkflowNode` | 列表和详情属于当前 user/role；当前节点的 runtime ID、workflowId、FormDef ID 三者各有含义 | 用任意工单 ID、旧角色缓存或节点显示名生成可提交动作 |
| `ServiceAppointment → Survey/FormData` | `sid` / `workflowId` / FormDef 及记录 ID 精确关联；Survey 是独立 typed 领域 | 把 `InspectionAppointment` 巡检数据当 Survey 勘查 |
| `ServiceAppointment 1:N Order` | `Order.serviceAppointmentId` 精确匹配；同工单允许多份报价/正式订单 | 每个工单只允许一个 Order，或把本地草稿当服务器 Order |
| `Order 1:N repair-part groups` | `bjProducts.orderList[]` 是组，组内四类独立目录与快照金额 | 一个维修部位新建一个虚构 Order，或把包内组件拆成独立选购 |
| `Package → component` | 组件引用/层/系数/选定材料都来自套餐详情 | 按列表下标推断材料层、把 `skuCode` 当 SKU `_id` |
| `Material SPU → optional SKU` | `SKU.spuid = Material._id`，仅在有真实活动 SKU 且需选规时采用 | 无 SKU 时制造一条虚拟 SKU；无 SKU 一律禁止普通材料报价 |
| `Order → Contract` | `Contract.orderId=Order._id` 且 `serviceAppointmentId` 一致；非空 `Order.contractId` 也需相等 | 仅按同一工单把其他 Order 的合同标成“已签” |

**动态模型重点**：业务表单先按 `Ext/FormDef → ExtField → Code/provider → FormData` 解析；预约可定制 UX，普通字段走通用 Runtime，所有动态表单共享媒体队列。展示配置不等于 FormData schema，FormData 保存也不等于 Workflow 完成。

## 4. 必须 1:1 复现的请求/命令与状态时序

| 流程 | R1 协议/顺序（DEV Mock 必须同型） | 不可猜测或偷换 |
| --- | --- | --- |
| 预约/单记录 | 按 FormDef 保存 `biz/extForm/upsert/{id}`，参数 `dataStr=JSON.stringify({…,sid,smodule,workflowId,nodeId})`；单独 `workflow/process` 携 `sid/smodule/workflowNodeId/nodeFormDefId/nodeFormDataId` | `saveOnly` 不 Process；`need=0` 已选择 `datetime` 保留，从未选择则省略；隐藏字段不参加当前可见必填/确认 |
| `forms` 专用节点 | FormData upsert → `workflowNode/updateExts/{runtimeNodeId}` 更新**完整** `formList` → 如用户明确完成再独立 Process；删除遵循已证据的 EXTS/soft-delete 顺序 | 每一步有回执；失败或结果不明不能自动重放；只有回读完整才标完成 |
| `repeat` 专用节点 | 以准确 `workflowId` 查询记录 → 每条独立保存/删除 → `workflow/process` 使用**已保存的 FormData ID 集合** | 缺页/缺 ID/跨节点/重复 ACK 均禁止“完成”；不合并成普通单记录 |
| 报价计算 | 用四类目录的 `mini` 有效价与 R1 规则；套餐材料加价+最低价，工序指导价+最低金额，材料无 SKU 用材料价，机措指导价；组内/顶层独立舍入 | 任何缺价不得默认 0；历史 Order 价格使用快照；优惠券/折扣/加减项未证实不填假 0 以宣称全量支持 |
| 生成报价 `Order.type=0` | `basic/order/creatQuotation`，body `data=JSON.stringify(order)`；创建**真实持久**报价，还可能产生 PDF/确认副作用 | 与本地草稿或 type=1 Order 不能混同；DEV Mock 不触发外部 PDF/消息 |
| 正式下单 `Order.type=1` | R1 新订单可能先 `workflow/startWorkflow/order/...`，后 `basic/order/upsert`，body `order=JSON.stringify(order)`；后台还可能写订单/工单聚合、PDF/消息 | 两步骤不原子；每步回执/结果不明必须阻断盲重试；Production/Beta 禁写 |
| 合同核验 | 仅 type=1 Order 及其精确合同关联，经固定范围只读查询并做身份/状态重核 | 空小页、权限失败、状态未知均是“待确认”；不得自动发起签约/短信/PDF/二维码/同步 |

## 5. Mock 数据包：最少具备这些实体和场景

| 包 | 至少包含 | 通过标准 |
| --- | --- | --- |
| `M01-auth-workflow` | 同一技术工程师角色、可见/不可见工单、两个以上节点状态、正常/缺失 `roleVersion`、节点 handler 变化 | 切换身份与过期异步响应清理；不能把列表可见当写权限 |
| `M02-dynamic-forms` | 普通 FormDef、`forms`、`repeat`；Code/三级级联；日期 `need=1/0`；多表单关联；通用媒体成功/失败 | 新建、修改、删除、保存、Process、刷新、断网/结果不明、冲突、重新进入；状态精确回读 |
| `M03-survey` | 源于历史 61 字段族的**合成** Survey、测量/漏水原因/媒体与缺项；独立巡检反例 | 不把历史 schema 冒充当前 Production，不把媒体仅实现成 Survey 特例 |
| `M04-catalog-pricing` | 至少一个 `serviceType/sourceType` 有效上下文、四类产品、有层的套餐/包内材料、价格/最低价/系数/保修；主路径 SKU 返回空 | 无 SKU 的普通材料能选择并按 R1 合法计价；缺有效价、错误服务上下文、跨商品混选时阻断；严格验证价格取自 mini 投影 |
| `M05-order-snapshot` | 同工单多个 `type=1` Order、可选 `type=0` 报价；一 Order 多维修组；快照价不同于当前目录价；部分订单缺页/明细失效 | `bjProducts` 正反序列化，类型/总额/组身份与快照回读；本地草稿绝不冒充正式 Order |
| `M06-contract-read` | 正式 Order A 无合同、B 有匹配合同、C 外工单/外订单合同；状态待定/签署/异常；空页/失败 | 只展示匹配 B 的已核验元数据；A/C/缺页均待确认，不调用副作用端点 |
| `M07-recovery-conflict` | 快/慢响应交错、超时但服务端已保存、后端返回形状缺失、角色/节点变更、重启/旧草稿 | durable receipt、只读回读、拒绝自动重发；无“绿色假完成” |
| `M08-scale` | **合成**目录量级参照四个已观察上下文（前三个 `27/66/89/4`，第四个 `1/0/14/0`），分页与套餐组合 | 同源过滤、分页和总数一致；这不是要求复制 186 条生产商品名称/价格 |

每个包必须同时提供：(a) R1 原始 wire 请求/响应的**合成样例**，(b) 新 App 标准化投影，(c) ID 引用完整性校验，(d) 状态机/失败注入，(e) 用例到 Playwright/Vitest 的映射。建议统一稳定的合成 ID 命名如 `sa_mock_01 / ord_mock_01 / pkg_mock_01`，但**字段名和 wire 编码不能重新发明**。

## 6. 当前缺口与验收顺序（防止 Mock 假等价）

| 优先级 | 必须解决的问题 | 当前证据/退出门槛 |
| --- | --- | --- |
| P0 | 当前工单的 `serviceType/sourceType`（包括值为空/缺省时的请求属性存在性），正确目录过滤与价源 | Source 证明 backend 依赖 `sourceType` 参数是否存在；未证实不能默默省略。Mock 跑参数契约负例 |
| P0 | 有效 Order `ExtField`/Code/provider（尤其 `showType`、`serviceType`、`personType`、条件必填） | 两个当前上下文均读到相同的 4/5 个分阶段字段、1 个 Code + 1 个 Cascade provider（[有效字段只读记录](G4F_EFFECTIVE_ORDER_EXTFIELD_PROD_READ_20261105.md)）；其余上下文、字段值/身份与 UI/serializer 映射未闭合；未支持控件标记 BLOCKED |
| P0 | SPU 无 SKU 的正常选择、四类价格与历史 Order 快照的差异 | 当前角色四个服务上下文的已读活动 SKU 筛选均未返回活动行；受限历史样本已比较 Material 1 行、Package 1 行及 Procedure/Measure 4 行，均等于对应当前目录价，但 Package 另有一条历史记录在当前目录缺失而保持 unknown（[Material/Package](G4F_ORDER_MATERIAL_PRICE_SNAPSHOT_PROD_READ_20261105.md)、[Procedure/Measure](G4F_ORDER_PROVIDER_PRICE_SNAPSHOT_PROD_READ_20261105.md)）；这些不是全量或价格新鲜度结论，禁止“无 SKU → 报价失败”及猜价 |
| P0 | 订单的类型、维修组、包内材料/层/系数、Order↔工单↔合同身份 | One Order/Contract 精确生产只读样本已通过；其他状态只在 DEV Mock；不得靠 `skuCode` 建 SKU 外键 |
| P1 | FormData/Workflow 的真实服务端保存回读与失败补偿；媒体上传 | DEV Mock 成功不等于 Beta/Production 写入；依 #201 单独批准后才可实测 |
| P1 | 报价优惠券、折扣、加减项、PDF、客户确认、正式下单副作用 | 源码有条件支路；若当前实务未用，应明确 `NOT_IN_CURRENT_SCOPE`，不能假装已等价 |
| P1 | Contract 真实状态投影与签约资格 | 当前只有一条精确匹配的只读样本；全面签约/短信/PDF/QR 仍禁用 |

**交付 Gate：**（1）每项 F01–F21 标记 `SOURCE_MAPPED`、`PROD_READ_SCOPED`、`MOCK_PASS`、`UNKNOWN/BLOCKED/NOT_RUN`；（2）所有活动 R1 字段/API 均有确定的映射或显式阻断；（3）430×932 **真实 App H5 Playwright** 验证 M01–M07 成功、失败、刷新、冲突；（4）`pnpm verify:full`、H5/MP/App 构建及 exact-SHA GitHub CI；（5）**只有在上述模拟通过后**，逐个端点启用本来获准的真实只读集成，仍逐项记录 live evidence。`#201` Production/Beta 业务写入 HOLD 不受影响，未授权时不创建 Order/Contract/报价，不做上传、短信、PDF 或签约。

## 7. 不需要重复调查的历史材料

- [功能台账](R1_FOUR_PHASE_FUNCTIONAL_LEDGER.md)；[六阶段源码矩阵](M1_I1_R1_SIX_STAGE_PARITY_LEDGER.md)；[机器可读的历史源码索引](R1_SIX_STAGE_SOURCE_PARITY_MANIFEST.json)。这些保留其各自时间点的证据状态；本清单是**当前执行入口**，不批量重写过去的验收结论。
- [报价领域与字段流](G4F_R1_DOMAIN_REVERSE_ENGINEERING.md)、[价格/Order 类型](M1_I3_R1_QUOTE_ORDER_STAGE_CONTRACT.md)、[Order 动态字段](G4F_ORDER_EXTFIELD_MAPPING_CONTRACT.md)、[合同主路线](M1_I6_CANONICAL_TECHNICIAN_CONTRACT_QUERY.md)、[正式 Order/合同真实只读回读](R1_ORDER_CONTRACT_READ_RECONCILIATION_20261104.md)。
