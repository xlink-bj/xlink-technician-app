# M1-I1｜R1 六阶段功能/接口等价性账本 v1.0

**控制任务** [#91](https://github.com/xlink-bj/xlink-technician-app/issues/91)（I1/8）、[#33](https://github.com/xlink-bj/xlink-technician-app/issues/33)（M1 总控）。  
**R1 业务真值** `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`；`business` 技术员路线源码。**旧后台不修改**，仅用于解释已经存在的 R1 API 行为。  
**新 App 基线** `xlink-bj/xlink-technician-app@f4f3f31a963cf53444b129fc460a19ed3d6dbf4c`（[Draft #90](https://github.com/xlink-bj/xlink-technician-app/pull/90)）；I1 账本开发分支以上述 SHA 为父提交。  
**检查边界**：静态源码对照 + 新 App 既有验证文档 + pinned GitHub ancestry；**本轮没有生产/Beta API 读取、合同/报价业务写入或真机运行**。此表不等于已全量恢复 R1 的生产业务表现。

## 判定口径

- `IMPLEMENTED_UNVERIFIED`：相关新 App 功能代码存在，但未逐场景证明与 R1 等价。**不能写成 PASS**。
- `SOURCE_MAPPED`：R1 的原始端点、参数或副作用已在 pinned source 找到，新 App 的实现仍可能需要补齐。
- `MOCK_ONLY`：只有隔离的 DEV 合成页面/自动化；未接真实 R1 Order/Contract 状态。
- `PARTIAL`：有明确可复用实现和具体仍缺失/阻断环节；后续确认所有字段、错误分支和身份控制。
- `BLOCKED_ENV`：在现有业务授权/设备环境下不应声称完成；按 #29、#64 单独治理。
- `NOT_YET_EVIDENCED`：缺足够源对照或真实行为证据，**不预设后台要修改**。

## 01 登录与身份（R1 `business/subpackages/login/loginAuth.vue`）

| R1 场景及源定位 | 新 App 现存实现 | 对照状态 | 新用户可见后果、I1 后续证据 |
| --- | --- | --- | --- |
| L01 手机号/验证码/密码模式，六位验证码及密码检查 `:301–323` | `src/features/session/login.ts`; `src/pages/index/index.vue` | IMPLEMENTED_UNVERIFIED | 检查 R1 不同登录方式的表单校验、错误、忙碌和重入，不能将无认证 H5 启动算真实登录 |
| L02 必须勾选隐私/用户协议才可提交 `:324–327` | `src/features/session/login.ts` / 登录页面 | NOT_YET_EVIDENCED | 若遗漏会改变 R1 登录准入体验；逐状态核对 |
| L03 `index/phoneLogin.do`：`method,phone,code,tenantId`，响应 token/currentRole/user 持久化 `:329–350` | `src/features/session/login-flow.ts`、`src/adapters/api/technician-api.ts`、Session Store | IMPLEMENTED_UNVERIFIED | 对照 token、账号/角色及身份重建；`tenantId` 只使用既有账户/R1 合法上下文，不自行扩充权限 |
| L04 R1 登录后 `function/changeRole` 载入角色菜单 `:431–451`；可选 pushClientId `:353–358` | `src/adapters/api/technician-api.ts:1263–1286` 有角色树/变更边界；新 App 现有 Production 限制仍生效 | PARTIAL | 菜单行为、权限和登录副作用逐项核验；生产角色切换仍不能因“R1 做了”便在未经批准环境调用 |

## 02 工单列表、接单和详情

| R1 场景及源定位 | 新 App 现存实现 | 对照状态 | 用户可见后果、I1 后续证据 |
| --- | --- | --- | --- |
| W01 R1 `business/subpackages2/workOrder/workOrders.vue:690–705`：`basic/workOrder/query.do` 及状态、排序、日期筛选 | `src/pages/work-orders/work-orders.vue`、`src/features/work-orders/list.ts`；`src/adapters/api/technician-api.ts:1395` 实际读取 `basic/serviceAppointment/query` | **SOURCE_MAPPED / DOMAIN_DIVERGENCE_TO_RESOLVE** | R1 同时存在 WorkOrder 与 ServiceAppointment 表面，**两者不可直接视为同一个 API**；须按当前技术员默认入口的真实路由/角色验证列表语义与状态映射。禁止在新 App 擅自替换后台路径 |
| W02 R1 `workOrders.vue:793,875` 查询 `basic/workOrder/queryWorkflowNode.do` 和 `querySAWorkflowNode.do` | `src/features/work-orders/list-actions.ts`、`detail-workflow.ts`、`src/adapters/api/technician-api.ts` | IMPLEMENTED_UNVERIFIED | 状态/节点/当前操作者必须由 R1 工作流事实决定，不可仅凭标签显示接单按钮 |
| W03 R1 `workOrders.vue:1046–1070`：`workflow/process` 传 `sid,smodule=workOrder,workflowNodeId` 及 `currentOrgId` 或 `handlerId` | `src/features/work-orders/list-actions.ts` 生成 accept action；`src/features/work-orders/action-workspace.ts` | PARTIAL | 不同承接类型与工作流节点的操作有效性需核对；现有生产写入限制不变 |
| W04 R1 `workOrders.vue:1180–1196`：`basic/winnerlook/getMiddleNumberBySid` 后平台拨号 | `src/pages/work-orders/detail.vue`; G4-D 联系/预约合同记录 `docs/verification/G4D_ACCEPT_CONTACT_APPOINTMENT_EVIDENCE.md` | IMPLEMENTED_UNVERIFIED | 直接/中间号、拒绝授权/拨号失败、设备电话能力分别复核 |
| W05 R1 `business/subpackages/serviceAppointment/serviceAppointment.vue:6183–6199`：`basic/serviceAppointment/queryById/{id}` 加载工单及工作流 | `src/adapters/api/technician-api.ts:1447`；`src/pages/work-orders/detail.vue` | SOURCE_MAPPED / IMPLEMENTED_UNVERIFIED | 当前工单详情、可见任务及离开/重新进入需要已获准的 readback 证据 |

## 03 预约与标准表单

| R1 场景及源定位 | 新 App 现存实现 | 对照状态 | 用户可见后果、I1 后续证据 |
| --- | --- | --- | --- |
| A01 R1 `serviceAppointment.vue` 的接单→联系→预约动态表单/节点处理；源审计 `docs/verification/G4D_ACCEPT_CONTACT_APPOINTMENT_EVIDENCE.md` | `src/features/work-orders/appointment-form-runtime.ts`、`appointment-validation.ts`、`action-workspace.ts` | PARTIAL | 基于真实 Workflow Node 和 FormDef 进入标准表单，不按固定工单状态猜动作 |
| A02 R1 预约 `need` 的值分支与 `datetime` 适用性（参照 G4-D 源合同） | `src/features/work-orders/appointment-form-runtime.ts:35–100` | IMPLEMENTED_UNVERIFIED | 必选/不需上门时对时间字段显示/保存行为需同案例验证；当前实现存在显式适用性规则 |
| A03 R1 预约 form 写入及 `workflow/process` 节点完成（G4-D 源审计），`serviceAppointment.vue:7583–7618` 显示 `nodeFormDataId` / 节点身份区分 | `src/pages/work-orders/action-time.vue`、`action-workspace.vue`；Form Runtime | PARTIAL / BLOCKED_ENV | “本地填写成功”与“已成功预约并流转”不能混为一谈；真实写入只在授权环境验证 |
| A04 预约返回、重新进入及表单状态恢复：R1 主页面 `serviceAppointment.vue` 按当前节点刷新 | `src/features/work-orders/action-workspace.ts`、本地表单/状态存储 | IMPLEMENTED_UNVERIFIED | 需补充软键盘、后退、重进及角色切换导致草稿泄漏的负例 |

## 04 上门勘察与有限动态表单

| R1 场景及源定位 | 新 App 现存实现 | 对照状态 | 用户可见后果、I1 后续证据 |
| --- | --- | --- | --- |
| S01 R1 `business/subpackages2/survey/index.vue` 作为专用勘察工具入口；工单现场处理在 `serviceAppointment.vue` 当前节点表单 | `src/features/work-orders/components/SurveyActionContent.vue`；`GenericDynamicFormActionContent.vue` | PARTIAL | R1 工具和服务工单勘察并非自动同一工作流，先核对活跃 route/node；普通字段使用动态表单，特殊交互固定开发 |
| S02 R1 勘察动态字段、值规则、原因及图片证据（`serviceAppointment.vue`；G4-E 源审计） | `src/features/work-orders/components/SurveyLeakageCauseExperience.vue`、`src/adapters/api/survey-form-codec.ts` | IMPLEMENTED_UNVERIFIED | 字段隐藏/必填/多选、渗漏原因回填及同工单跨次打开一致性需用相同 R1 样本验证 |
| S03 R1 勘察媒体、相机、上传、文件引用与回填（G4-E `SURVEY_MEDIA_* / CLOSURE_READINESS`） | `src/features/work-orders/survey-media.ts`；Survey Action | PARTIAL / BLOCKED_ENV | 原生相机/水印/弱网/上传/重启恢复仍未真机或完整实环境验证；仅代码契约就绪不算能力验收 |
| S04 R1 `serviceAppointment.vue:7583–7618` 表单数据身份与 `workflow/process` 关联 | `src/features/work-orders/action-workspace.ts` | PARTIAL / BLOCKED_ENV | 保存、完成及再次读取必须区分；不能在 Mock UI 自动伪造工作流完成 |

## 05 报价、套餐与 Order

| R1 场景及源定位 | 新 App 现存实现 | 对照状态 | 用户可见后果、I1 后续证据 |
| --- | --- | --- | --- |
| Q01 R1 `business/subpackages/order/placeOrders.vue:5624–5635`：`basic/material/queryWithRank`、`serviceType`、`sourceType`、状态/排序 | `src/adapters/api/quotation-catalog-api.ts:268–291`；`src/features/work-orders/quotation/catalog-browser-store.ts` | PARTIAL | 对照 **参数有无/来源**：R1 发 `sourceType` 属性，新 App 缺值时可能省略；不把二者默认为等价（详见 G4F R1 domain audit）→ I2 |
| Q02 R1 `placeOrders.vue:6191–6198`：材料 SPU 下 SKU 用 `basic/material/query`，`_all=1,is:state=1,spuid` | `src/app/quotation-sku-identity-evidence.ts`、`sku-identity-review.ts`、`src/adapters/api/mock/material-sku.ts` | PARTIAL / MOCK_ONLY | 真实 SPU→SKU/属性/字典 option 来源未完成 R1 逐参数对照；没有授权读前不能把 Mock 价格/库存认定为真实 |
| Q03 R1 `placeOrders.vue:6407–6412`：`biz/projPackage/findById/{id}`，套餐材料按 numeric layer 排序；`:6523–6590` 同层仅选一项，`layer=0` 基层处理剂 SKU 编码排除 | `src/adapters/api/quotation-catalog-api.ts`、`package-configuration.ts`、`catalog-browser-store.ts` | PARTIAL；**numeric layer 等价代码 PASS**（#90） | 数值 1 与字符串“1”现在正确归同层；套餐数量、自动保留原已选材料、SKU Code 拼接及价格仍归 I2/I3 |
| Q04 R1 `placeOrders.vue:4308–4338`：`basic/order/upsert`，`order:JSON.stringify(params)`、`exts.serviceType/sourceType/isCreateBjdPDF='1'`；真实生成报价单可能触发副作用 | `src/adapters/api/quotation-order-commands.ts`、`src/features/work-orders/quotation/order-encoder.ts`、`order-submission.ts` | SOURCE_MAPPED / **BUSINESS_E2E_BLOCKED** | 本地草稿不是 Order；type=1 创建、价格/折扣和 PDF/流程 readback 需要独立 Beta 授权/测试 → I3 |
| Q05 R1 `placeOrders.vue:3572–... ` 读取原订单详情用于编辑，及既有 `basic/order/queryById` | `src/adapters/api/quotation-order-api.ts`；`order-reconstruction.ts` | PARTIAL | 支持同 ID 更新/多部位/错误 readback 是待验证行为；不把直接 getById 对象用于正式 Signing |
| Q06 R1 真实目录四类选品、套餐配置、数量、确认返回当前维修组 | `src/features/work-orders/quotation/QuotationActionContent.vue`、`QuotationActionWorkspace.vue`；另有单独 four-surface HTML 设计候选 | PARTIAL / UX_OWNER_NOT_ACCEPTED | 当前实际 Vue 报价界面已被 Owner 判定需重做（#41）。I4 视觉通过后 I5 才能正式替换，不以 Mock 的 H5 PASS 当体验通过 |

## 06 合同/电子签约

| R1 场景及源定位 | 新 App 现存实现 | 对照状态 | 用户可见后果、I1 后续证据 |
| --- | --- | --- | --- |
| C01 R1 `business/subpackages/serviceAppointment/serviceAppointment.vue:608–933` 的 Order/Contract 入口、合同类型与状态及当前 handler 控制 | `src/pages/work-orders/signing-mock-review.vue`、`src/app/signing-mock-review.ts` | MOCK_ONLY | 独立 synthetic 2 Orders/1 Contract/多维修部位可切换；不等于真实签约对象/权限/Workflow |
| C02 R1 `serviceAppointment.vue:9757–9772` 线下签：重复点击保护、确认、`signature/applyForElectronicSignature.do` body `orderId_thread,type=1` | 同上，真实调用未接通，按钮禁用 | SOURCE_MAPPED / NOT_IMPLEMENTED | 真实签约命令仍禁止运行；必须按 R1 角色与 Order 归属、确认语义实现 |
| C03 R1 `serviceAppointment.vue:9775–9800` 电子签：120s 保护、确认合同文本、`signature/applyForElectronicSignature` body `orderId_thread`，R1 提示短信发送并刷新订单 | 同上；`src/adapters/api/quotation-order-api.ts` 有 **默认不接入**的只读 seam | SOURCE_MAPPED / NOT_IMPLEMENTED | R1 已有命令有真实副作用；不能以 UI “已发送”冒充测试成功。区分回执、失败、取消与重试 → I6 |
| C04 R1 `serviceAppointment.vue:638–933` 合同标签、签署进度和签约 URL/回执控制 | `src/app/signing-mock-review.ts` 有概念性 pending/signed/error/expired，仅 DEV fixture | MOCK_ONLY / BUSINESS_E2E_BLOCKED | 缺真实 Contract readback/状态/文件预览/审批；须以 R1 对应端点/业务状态为准，不能用 demo 枚举代替服务端状态 |

## Gap-to-iteration 映射与验证要求

| 优先级 | 问题 | 下一责任轮 | 最小 Done / 证据 |
| --- | --- | --- | --- |
| P0-DOMAIN | W01 `workOrder` vs `serviceAppointment` 双列表语义及 R1 实际技术员入口/角色 | **I1 补充核验 + I7 回归** | 当前 route+role 的源码证明、真实新 App 对应路径，标注哪些列表对等；禁止假设相同 |
| P0-FUNCTION | L01–L04/W02–W05/A01–A04/S01–S04 剩余表单、流程和异常分支 | **I1 锁定差异清单 + I7 端到端** | 源码路径/请求字段/回执/异常清单逐项有测试映射；授权写入未知列 NOT_RUN |
| P0-FUNCTION | Q01–Q03，SPU/SKU 及四类目录的请求/属性与配置状态 | **I2 [#92](https://github.com/xlink-bj/xlink-technician-app/issues/92)** | R1 所有相关参数/Option Provider/允许值 + 本地交互测试；旧后台不动 |
| P0-FUNCTION | Q04–Q05 数量/计算/Order.type=1、编辑与 readback | **I3 [#93](https://github.com/xlink-bj/xlink-technician-app/issues/93)** | 纯计算/编码黄金样例与提交失败/重复场景；Beta 真实写入独立 Gate |
| P1-UX | Q06 可视目录/套餐配置→工作台返回的产品体验 | **I4 #94 → I5 #95** | 先由 Owner 明确验收视觉，再实施 Vue 主组件 |
| P0-FUNCTION | C01–C04 正式签约角色、合同状态/操作 | **I6 [#96](https://github.com/xlink-bj/xlink-technician-app/issues/96)** | R1 只读与副作用接口完整矩阵、新 App 签约 workspace 及 Mock/H5；实签另 Gate |
| RELEASE | #29 Beta 业务写入，#64 MP/Android/iOS 真实设备与相机/安全区 | **I7/#29/#64 独立准入** | 实环境证据才可称 PASS；I1/I2/I3 静态证明不能代替 |

**重要：**上述 `NOT_IMPLEMENTED` 表示在被检查的新 App 主线中没有可核查的正式 UI/API 链路，**不主张**在整个历史分支宇宙中绝无相关实验性代码。

## I1 集成基线与安全操作路径

1. `main = c57fb3cc876c8ca3fb133d74dcf4833f8f755b32`，仅合并了 CI 基础；`#38 = cfe5e0a1847c2a0c14dfc0b94a9b51f6680c83f0`，`#90 = f4f3f31a963cf53444b129fc460a19ed3d6dbf4c`。**所有相关应用 PR 仍 OPEN/DRAFT**。
2. 2026-10-12 GitHub Compare：`#38...#90` ahead 93 / behind 0；`#84...#90` ahead 37 / behind 0；`main...#90` `diverged: ahead 340 / behind 1`。这是 commit 差异，不是交付轮次。
3. **I1 不尝试将 PR #90 强推到 main、也不擅自 merge/rebase**。阶段性冻结审计基线 `#90`，每次 feature PR 基于已明确锁定的验收候选，同时保留从 main 合并回滚路径。I7 之前需将 main-only CI 内容与候选进行差异审计，准备单一完整候选、重新构建验证、人工批准后合并。
4. 回滚策略：在任何主干合并前保存 exact main SHA、受控候选 HEAD、PR 列表/CI 证据；先确认生产配置仍禁止业务写入，独立测试 H5/MP/App；若需要回退应通过 Review 的 revert PR 而非 force-push 或覆盖历史。
5. **历史可复核 baseline**：[Validate #38195055146](https://github.com/xlink-bj/xlink-technician-app/actions/runs/38195055146)（82 suites/794 tests、MP/App build）与 [Main H5 #38195055016](https://github.com/xlink-bj/xlink-technician-app/actions/runs/38195055016)（2 boot +15 DEV quote/sign +25 G4F）PASS，**不能计作 I1 本次代码/接口 E2E**。

## 本轮验收与更新规则

- I1 DoD：六阶段每条 R1 场景均有路径、新 App 路径、证据状态和影响；有可审计的 PR ancestry 与不擅自合并的策略；P0/P1/发布 Gate 转交清晰；本文件通过 Draft PR 与精确 HEAD CI 验证，Lead 接受 **审计基线**（不是正式业务等价交付）。
- I1 标为 `ACCEPTED` 只代表**差异账本/集成评估完成**。表内 `PARTIAL/MOCK_ONLY/BLOCKED_ENV` 不会神奇变为功能 PASS，必须由 I2–I8 消除、经 Owner 单独批准或明确归档。
- 每次迭代结束：`状态`、`四项验收`、`本轮精确 PR HEAD+CI`、`剩余高风险差异`、`Owner gate`、`累计已接受轮次/8`；不把提交数/测试数量当作完成率。
