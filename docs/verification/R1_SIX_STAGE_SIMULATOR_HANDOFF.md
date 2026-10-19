# R1 六阶段源码核对与模拟器交接基线

**状态：R1 原始源码路径已固定，部分业务契约和本地 Mock 已验证；真实 R1 业务等价性尚未验收。**
本文件面向 Lead、Owner 和后续本地 Codex。不是“六阶段全部实现完成”的证明。

## 审计版本与证据边界

- 原始技术员 App：[`xlink-bj/xlink-app@6c0a97b`](https://github.com/xlink-bj/xlink-app/tree/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d)，真实读取其登录、主 ServiceAppointment、详情和 `placeOrders.vue` 源码。
- 旧服务端：[`xlink-bj/xlink-cloud-backend@5fc008d`](https://github.com/xlink-bj/xlink-cloud-backend/tree/5fc008d32e771205260f120621c1c4fc62d0824e)；相关 Survey、Goods/权限、Order 和 Contract 源码证据另见原有独立审计。
- 新 App：从 [EQ-06A #178](https://github.com/xlink-bj/xlink-technician-app/pull/178) HEAD `2c3fa331c31fb48e1a6f7e1f6b0b9b6f949b25e3` 派生。
- 机器清单：[`R1_SIX_STAGE_SOURCE_PARITY_MANIFEST.json`](R1_SIX_STAGE_SOURCE_PARITY_MANIFEST.json)，每阶段给出原始文件的 Git Blob SHA/行号、当前前端文件、实际测试、仍缺的事实。
- `scripts/check-r1-six-stage-parity.mjs` 只核实固定证据/文件/测试/验收状态，不从网络下载私有 R1 仓库；**源 Blob 是此次独立 GitHub 检索所得的固定记录，不是 CI 每次重新访问 R1 的证明**。
- 任何旧文档 `PASS` 不可覆盖此处的 `NOT_VERIFIED`，更不能用 CI test count 推算业务等价。

## 六阶段：源行为、当前实现和待完成验证

| 阶段 | R1 原始业务事实 | 新 App 可用工程实现 | 本地集成仍需核对 |
| --- | --- | --- | --- |
| ① 登录与角色 | `loginAuth.vue:324–349` 登录前协议同意；`phoneLogin.do` 的 method/phone/code/tenantId；`:438–454` 按 roleIds 加载菜单 | 短信码登录及 L01 格式预检、Session/角色模型、隔离 Mock 入口 | **用户协议同意阻断与密码登录模式尚未证明等价**；真实角色树、token 生命周期、错误/退出 |
| ② 工单列表及详情 | 主技术员导航是 ServiceAppointment；普通 `query` / SANode `querySAWorkflowNode`；详情 `queryById/{id}` 返回 workflow/node | 列表、搜索、详情、当前节点、权限及 Order 只读有界守卫 | 不同角色/租户的真实列表、节点 Handler、接单、手机号中间号，不能借用其他 WorkOrder 包 |
| ③ 预约 | 当前工作流表单驱动“是否需要上门/日期/备注”及保存/Workflow Complete | 动态表单引擎、`need=1/0` 分支、持久草稿、Mock Workflow | **`need=0` 时 datetime wire 语义未知**；保存与工作流完成必须分离，真实回读/撤销 |
| ④ 现场勘察 | ServiceAppointment 当前流程；Ext/ExtField/FormData、后端 Survey 为独立业务实体 | Survey 领域组件、动态字段、渗漏原因、维修部位、媒体合同 | **Survey ≠ InspectionAppointment**；真实 ExtField、摄像/水印/上传/弱网与节点完成回读 |
| ⑤ 报价与订单 | `placeOrders.vue:4204–4253` type0/type1 分支；`:6913–6959` `creatQuotation` 用 data；`:4320–4345` `upsert` 用 order | 目录/套餐/组、R1 纯金额规则、type1 编码与严格提交门禁 | **报价 type0 ≠ 正式 Order type1**；SKU 销售属性/有效价格、折扣与优惠、真实订单存取均未验收 |
| ⑥ 合同与签署 | 主 ServiceAppointment `contract/query.do` 用 serviceAppointmentId；线下签 `.do` 带 type1，电子签不是同一调用 | 正式 Order 有界预读、合同只读隔离、Signing UI 与命令意图拒绝执行 | **合同生成、短信、PDF、签署人 ACL、正式签署回读均未验证**；Mock signed 只代表展示 |

以上属于**源证据与代码核对**，对照可复核，但真实账号和设备/后端运行时行为在特殊环境完成之前一律 NOT_VERIFIED。

## 交给本地 Codex 的执行约束

本地 Codex 的首轮职责应限于：**本地检出已确认的候选提交 → 构建 → 模拟器打开 → 逐个体验 → 记录事实和最小缺陷任务**。

1. 检出 PR 对应的 exact HEAD（不要直接把 Draft 分支混入 `main`），使用仓库的 `.nvmrc` 与 `pnpm-lock.yaml`，执行 `pnpm install --frozen-lockfile`。
2. **先运行无凭据合成验收**：`pnpm verify:quick`、`pnpm verify:critical`、`pnpm verify:full`，然后执行
   `pnpm exec playwright test --config playwright.main-h5-mock.config.ts tests/h5-main-mock/m1-i7-six-stage-integration.spec.ts`。
   该浏览器测试会阻断非本地网络；通过只说明 H5 Mock 链路。
3. **微信模拟器**：`pnpm dev:mp-weixin`，在微信开发者工具中打开 uni-app 生成的开发目录（通常 `unpackage/dist/dev/mp-weixin`；以本机实际产物为准）。这是编译与本地交互检验，不等于真实微信环境/生产后台验收。
4. **App**：`pnpm build:app` 仅验证 uni-app App 目标构建。若需要 Android/iOS 安装、相机、文件系统与签约 WebView，须本机相应 IDE/模拟器及许可；仅有 Bundle 不声称是真机或安装包。
5. 默认坚持 `VITE_XLINK_ENABLE_REAL_WRITES=false`，Mock 与真实环境严格分开；**不要将本机真实账号、手机号、短信验证码、密钥、客户资料复制到 Issue、PR、截图或日志**。
6. 按清单的 `simulatorGoal` 逐阶段记录结果。若 UI 与 R1 不同，先判断是**业务流程/字段契约差异**，还是独立待升级的 UX；禁止凭页面截图猜测后台 Workflow。
7. 每个问题创建独立 GitHub Issue，使用模板 [`r1-simulator-parity.md`](../../.github/ISSUE_TEMPLATE/r1-simulator-parity.md)，写清 **原始 R1 源文件行号、实际 App 路径、步骤、结果、业务影响、最小修复建议**。同一问题不要提交包含多模块的巨型 PR。

## 明确留给 Codex 的真实环境工作（当前未授权执行）

- 使用**已授权的两个不同角色或测试租户**，在现有登录会话下做有限、脱敏的 **只读权限/ServiceAppointment/Order 对照**；不探测任意 ID，不越权，不用生产写接口。
- 获取 R1 允许访问的真实 SPU/SKU/价格和套餐样本，并比对新 App 目录、`sourceType`、业务计算和服务端回读。样本不足时输出 `BLOCKED_NO_ELIGIBLE_DATA`，绝不杜撰 SKU。
- 对 `creatQuotation`、`upsert`、签约、流程完成、上传等副作用只建立预检差异；**没有独立明确的 Owner/Beta 写入批准，不进行真实写入或客户通知**。
- 收集模拟器/真机交互发现的问题与业务升级 Issue，让 Lead 在 GitHub 上进行优先级、架构及版本决策。

## 完成定义

**本轮通过**：R1 源文件/Blob 固定、六阶段测试映射和业务缺口明确，所有合成测试／三端构建／已有 Golden 无回归，适合进入本地模拟器体验。

**本轮不通过且未声称完成**：真实业务等价、源 SKU/价格、后台权限、真实短信/合同/工作流、微信真机/Android/iOS 体验，以及主干合并。
