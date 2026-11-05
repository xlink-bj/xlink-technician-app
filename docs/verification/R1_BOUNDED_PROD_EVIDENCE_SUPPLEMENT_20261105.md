# R1 有界生产只读补证 — 2026-11-05

范围：本原会话 / Codex Local / 单一 main；应用基线 `e914d97e815514cfc4858d7a22dbc80f5d997839`。本轮只有审计输出、脱敏契约、测试和文档改动，无 App 行为、权限或部署变更。

## 1. 来源和判定

- R1 前端参考固定为 `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`，后端参考为 `xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`。本次确认本机参考 HEAD 与之相等；未修改参考仓库。**没有独立验证线上部署服务的构建 SHA**。
- 来源为正常预配置技师在 Production 的登录、当前角色列表及其派生请求。session/凭据仅内存使用，未切角色，未复制本机凭据；每条路径先零网络预检。
- 使用既有 `verify-g4f-prod-read.mjs` 的 active-order-fields-only 路径和 `verify-r1-order-contract-read.mjs` 的 execute 路径。请求 allowlist、角色、类型和分页边界未扩大。
- `SOURCE` 证明字段/状态/提交参数的代码规则；`PROD_READ` 只证明所读范围的返回及关联；`DEV_MOCK` 证明模拟流程。三者不能相互替代。正常读取不证明写权限、状态提交、失败补偿或真实 Quote→Order 因果转换。

## 2. 实际请求与失败

| 独立捕获 | 登录 | Role-tree | 工单页（rows=3） | 详情请求 | Order 字段 | Code / Cascade | type=1 首页 | Contract 首页 | 结果 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 目标第 4 报价上下文发现 | 1 | 23 | 23 | 69 | 0 | 0 / 0 | 0 | 0 | 68 个详情投影成功，第 69 个失败即停止；未取得目标上下文 |
| 独立首个已证实上下文补采 | 1 | 7 | 7 | 21 | 1 | 1 / 1 | 0 | 0 | 成功，字段及精确 provider 完成有界读取 |
| 原授权首个 Order/Contract 样本 | 1 | 1 | 1 | 0 | 0 | 0 / 0 | 1 | 1 | 成功，精确关联 |
| **合计** | **3** | **31** | **31** | **90** | **1** | **1 / 1** | **1** | **1** | **160 次 API 请求；含 3 次正常登录，157 次业务只读请求** |

- 详情共 89 次成功投影、1 次失败。各捕获可能重叠，**89 不是唯一工单数**。23/7/1 个工单页也不可相加为角色全量库存。
- 首次失败未保存状态码或原始响应，无法区分网络、服务端或映射原因，不能宣称“权限拒绝”或生产缺陷。未重试失败详情或自动续页。第二次是独立首个已证实上下文任务，不是重放第 69 个请求。
- 全部捕获意外越界尝试 0、业务变更 0；商品/SKU 查询 0，未重复 SKU 普查。所有实际业务查询均未携 `_all/notFilterOrgId/notFilterTenantId`。
- 可检查的脱敏捕获及各路由计数在[契约目录](../../contracts/production/technician-role-readonly-20261105/README.md)。零网络预检不计为线上读取。

## 3. 本轮取得什么

### 节点 / FormDef / Survey

第一捕获的 68 个成功详情包含 542 个合成节点关系、204 个 FormDef 引用，涉及 4 个不同合成 FormDef 身份；其中 91 个节点生命周期为 active，3 个 active 节点带 FormDef 引用。**active 不等于当前可操作，更不等于服务器允许提交**。

只有一个带 FormDef 的 repeat 节点同时被客户端当前任务投影选中（捕获内 `work-order-036 / node-282 / form-definition-003`）；其 `formPurpose` 为 UNKNOWN。没有观察到明确 `formPurpose=survey` 的节点；这不是“生产没有 Survey”的结论。没有使用节点名称“勘察”或历史非活动 61 字段补齐身份。

当前 Production 通用 `getFormDefinition` 的旧请求带 `_all`，而生产读白名单没有当前节点 `extId` 字段请求的批准形状。本轮该项 **BLOCKED / NOT_RUN**，不是一次服务器拒绝实测。没有调用 Beta 捕获器或读取 FormData 私人字段值。

`UNKNOWN` 生命周期包含此次投影未保留的 closed/其他类型；`OTHER_OR_UNRESOLVED` 合并未识别/未保留 nodeType。它们不能用来宣称后台缺字段或计算完整历史状态分布。

### Order 字段与 provider

一当前合法报价上下文返回 **32/32** 激活移动配置（单页 size=50）；当前有 4 placeOrder、5 submitOrder 字段。9 个活动机器键均安全保留：

| 阶段 | 机器键 | 类型 | required 原始属性 | provider / 边界 |
| --- | --- | --- | --- | --- |
| placeOrder | repairParts | cascade | string `1` | 精确 Cascade 已读 |
| placeOrder | partDescription | text | string `1` | 无 provider |
| placeOrder | maintainAreaNum | digit | string `1` | 无 provider |
| placeOrder | button | button | 未声明 | 动作仍阻断 |
| submitOrder | personType | radio | string `1` | 精确 Code 已读 |
| submitOrder | clientname | text | string `1` | personType 条件 |
| submitOrder | telphone | phone | string `1` | personType 条件；保留源拼写 |
| submitOrder | projectArea | area | string `1` | 全国区域 provider 未读 |
| submitOrder | projectAddress | text | string `1` | 无 provider |

- 租户 32 配置中保留 29 个安全 ASCII 机器键及 6 个精确通用白名单标签；其他键/标签合成替代，并有逐字段标记。原始字段 ID 和业务值未保存。
- Code 1 个 provider、2 个选项；Cascade 1 个 provider、15 节点 / 12 叶 / 最大深度 2。字段→provider→选项及条件引用使用同次捕获稳定映射，保留树层级、原始标量种类和选择上下文适用结果。**不是全租户所有 provider 已读取**。
- 活动 button 的已保留配置形状有 showType/block/type/plain；另有 4 个配置键未保留。不能说后台“没有动作配置”。未保存目的地、payload 或任意脚本，无法证明可执行动作；允许动作集合仍为空，禁止执行。
- [9 字段 wire 样例](../../contracts/production/technician-role-readonly-20261105/effective-order-wire.json)明确是从 32 字段页导出的**有效子集**，不是原始完整响应。partDescription/clientname/maintainAreaNum 各另有 1 个未保留配置键，完整规则尚不能认定等价；样例以 configurationReviewRequired 明确标记，不能因普通控件可分类就自动启用。现有真实 runtime 分类测试：placeOrder 3 个普通控件可映射、button 阻断；submitOrder 4 个普通控件可映射、area 阻断。
- 当前有限子集的 string/array 规则可生成合成值；未证明任意原始数值强制转换、substring 语义或其他上下文等价。默认 personType 来自 R1 源规则，不是实际客户输入观察。

### Order / Contract

本次样本 type=1 首页返回 1 条、报告总数 1；只证明所选样本，不是当前角色所有订单普查。type=0、后续 Order 页和通用 queryById 没有执行。

合同仅一次 `basic/contract/query.do`，严格保持 `serviceAppointmentId + (state=1 OR exts.contractStatus=-2), page=1, rows=3, createTime desc`。返回 1 条，WorkOrder、Order ID、Order.contractId 与 Contract ID 精确匹配，无冲突；观察到 `state=1 / contractStatus=10 / signedDate 存在`。未保存日期值、文件、签名或二维码；完整性仍为 BOUNDED_UNVERIFIED，不推断其他状态。

**本次 Order 内容投影为 3 行全部 unsupported、0 行 captured price。** 这不是当前价格已核实；旧报告中其他时点/样本的支持或快照比较不能移作本次结论。保留关联状态，内容/金额未知继续待确认。原始不支持行的字段形状未留存，Cloud 尚不能凭本包修复该样本解析。

## 固定源码中的状态/提交规则（不等于 live 实测）

| 规则域 | 已有固定源码证据 | 本轮服务器实测边界 |
| --- | --- | --- |
| Order 字段 | R1 `business_jishi/subpackages/order/placeOrders.vue` 的 getFields/personType/showType 过滤；参见[字段映射](G4F_ORDER_EXTFIELD_MAPPING_CONTRACT.md) | 实读一当前上下文配置和精确选项；没有保存或验证客户输入 |
| 当前 Survey | 后端 ExtFormServiceImpl 对明确 survey colName 做 typed 转换；[领域说明](G4E_SURVEY_DOMAIN_TRUTH.md) | 未读当前 FormDef 字段，不能由 repeat/名称/历史 Beta 推断 Survey |
| 普通 / forms / repeat 提交 | [协议台账](R1_FOUR_PHASE_FUNCTIONAL_LEDGER.md)：普通 upsert 与 Process 分离；forms 为 FormData→完整 EXTS→独立 Process；repeat 使用保存返回的 FormData IDs | 只读节点引用；本轮 FormData 保存、EXTS 更新、Process、补偿均 NOT_RUN |
| 报价 / Order | [阶段契约](M1_I3_R1_QUOTE_ORDER_STAGE_CONTRACT.md)：type=0 报价与 type=1 正式订单不同，R1 workflow-start / upsert 顺序及非原子回执需分开 | 只读已有 type=1 样本；未创建报价、Order、Workflow，不证明因果转换或真实失败恢复 |
| Contract / 签约 | [主技术员合同主路线](M1_I6_CANONICAL_TECHNICIAN_CONTRACT_QUERY.md)：精确 Order/Contract/工单关系及固定读取过滤 | 一个正向关联/状态样本；签约资格、跨角色隔离与写权限未经实测 |

现有菜单、handler、客户端 execution 只能解释 UI 候选行为。本轮没有负向权限试探、切角色或通过任意 ID 测授权，不能把正常读取成功升级为服务器提交权限验证。

## 4. F01–F21 覆盖统计

逐项、机器可检验的分类见[coverage-f01-f21.json](../../contracts/production/technician-role-readonly-20261105/coverage-f01-f21.json)，每项含来源链接、Mock 状态、生产观察和限制。

- **21/21**：有固定源码映射入口；并非 21 个实现/提交规则全部完备。
- **15/21**：有既有或本轮生产有界响应观察：F01/F02/F03/F05/F10–F20。包含 F17 空 SKU 页，**不能称 15 个完整生产字段模型已收齐**。
- **6/21**：未取得当前生产字段模型/记录/资格证明：F04、F06、F07、F08、F09、F21。F04/09 有节点引用线索，F21 有只读状态线索，均不替代完整模型/权限证据。
- **0** 次生产业务写权限、提交或失败补偿测试；Role/菜单/handler 只作客户端范围证据，无负向跨角色、跨租户或任意 ID 探测。
- 既有历史 Beta、源码和合成 Mock 分别标注；未将历史 Survey 61 字段升级为当前生产定义。

## 5. 可安全移交 Cloud 的边界

可以：凭仓库契约、固定源码链接及合成关联图维护 7 个普通 Order 控件、精确 Code/Cascade 对应、只读 Order/Contract 关联与失败关闭测试；无需本机绝对路径、原始身份或凭据。既有媒体/事务 Mock 的 Source + Mock 证明仍有效，但没有增加 live 权限。

不可：自动把这些合成标签和 ID 接入商业生产页面；把 repairParts/partDescription/maintainAreaNum 与现有维修组的关系未经核对直接重复收集；认定当前 repeat 就是 Survey；执行 button；生成全国区域/街道数据；填补 3 条未知 Order 行价格；宣称真实报价创建 Order、签约资格、保存/补偿或字段全部齐备。

后续需要的具体边界/证据：

1. 单独批准当前合法 node→FormDef 的有界 `extId` 字段读取形状（无 `_all`，带页限和配对身份检查）；当前未执行。Survey 先确认语义，禁止按名称猜。
2. 如需 type=0 或更多 Order 页，先明确新的类型/页边界；Contract 不扩页。当前第一次失败详情也不自动重放。
3. 按原允许首页范围另行补不支持 Order 行的**无值字段形状**可改善模型；本轮未再次读取，不能说属于权限已拒绝。
4. 活动按钮的完整安全配置/目的地允许集及区域 provider 仍需证据；不能由“字段可读”推断动作可用。

跨捕获合成 ID 不可直接 join。审计哈希表示捕获时文件内容，应用基线不等于审计工具已提交版本；本提交引入的审计代码与记录哈希已逐一比对相等。后续工具演进应查本证据引入提交，不修改旧捕获的来源哈希。线上服务部署版本未知。

## 6. 验证与提交

- 脱敏、引用一致性、错误/截断、synthetic-only 标记、完整 21 域分类及真实 runtime 7/9 分类测试通过；`pnpm run verify:full`：207 文件 / 1811 测试通过（含类型/边界/治理）；变更只涉及审计/契约，无本地 UI/原生构建验收声明。
- 本轮未改变 App UI/业务运行代码；未专门重跑本地视觉/原生验收，不将 NOT_RUN 算通过。
- 精确 SHA、GitHub Validate / Main H5 实际执行及跳过在 #207 交付评论记录。
- Production/Beta 业务写入、上传、Workflow、签约、PDF/消息/同步和部署继续禁止；#201 HOLD 不变。未启动 Cloud、第二开发线或原生工具。
