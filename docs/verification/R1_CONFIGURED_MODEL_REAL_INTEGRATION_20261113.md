# 配置表单与三模型真实集成验收

2026-11-13。业务代码与测试验收基线：`6e21141030779f774f6c1c9526ffb85018b1aa15`。本报告只记录已执行的有限能力，不把样本保存通过升级成全域 R1/Mock 等价、生产写入或商业视觉签收。

## 1. 实现与职责

后端 FormDef/ExtField 仍决定字段、顺序、选项和校验；没有把动态表单改成固定字段页面。普通 reader/Panel/controller 复用身份、当前配置、完整原文、保存回执、权威回读和结果不确定保护。`forms/repeat` 是节点来源，与存储模型及体验组件分别判断。

- `3901ac7688136dedd8035d89aa7891a4763ae3a9`：配置驱动的已有记录编辑，13 路径；独立的 type=0 Map / Survey DTO 存储策略，复用正常页面和共享控件。
- `c8374537c2174df4cc815b9dfb89d5d1afbde0e3`：8 路径增量，只有 3 个产品文件；Map 增加来源绑定的单选与本地日期时间。六字段专有预约和 typed Survey 边界保留，没有新增第二个保存器或 Order 保存策略。
- `6e21141030779f774f6c1c9526ffb85018b1aa15`：仅修复一个 Stage 2B 测试的时序。原测试点击保存即刷新，打断事务后正确留下不确定保护；现在等待保存完成及无待核对回执，再执行原有全部刷新、值和零外连断言。没有改变产品、超时、重试或权限。

代码说明见[已有记录编辑](R1_CONFIGURED_RECORD_EDIT_20261113.md)、[Map 单选和日期时间](R1_MAP_CHOICE_DATETIME_EDIT_20261113.md)。[首次新增草稿与生命周期](R1_NORMAL_FORM_DRAFT_RECOVERY_20261112.md)是已保留的独立成果，不代替本次三模型验收。

## 2. 三类真实业务接口

以下均为已有隔离 Java、Mongo、Redis 和虚构技师/工单，使用真实 App H5 的正常登录、列表、详情与 Workspace，视口 **430×932**。API 原包转发，无服务端响应伪造、源记录注入、角色/schema 改造或生产请求。

| 业务模型 | 真实保存接口与职责 | 本次实际证据 | 验收范围 |
| --- | --- | --- | --- |
| Survey 预置 DTO | `POST biz/extForm/upsert/{surveyDefId}`；类型与 collection 确认后进入 typed 策略 | N05 一次同 ID 备注更新；面积保持 12.5；正确 ACK、权威原文与 Mongo 回读；创建时间 `.624` 保留；另一次正常只读重进 | 保存业务结果独立核实。原 driver 在保存后因自身 HMR WebSocket origin 判断报错退出，原失败保留，不能称整份脚本全绿；N05 未重放 |
| appointment 动态 Map | `POST biz/extForm/upsert/{appointmentDefId}`；当前真实三字段配置走共享配置能力 | N03 零写入资格预检后，一次同 ID 保存；正确 ACK、权威 raw 回读、真实 completed receipt、返回重进、独立 Mongo、新浏览器双写关闭且无 grant 的只读重进均通过 | 只改备注业务值，原 need/datetime 不变；实际 Code 仅返回“需要上门”。未伪造六字段或其他选项，没有 Process/确认预约/上传 |
| Order 预置 DTO | `POST basic/order/upsert`；独立领域、目录、价格快照及完整 Order/EXTS 替换协议 | 用户明确授权后，一次现存 type=1→1 同 ID 更新；正确 ACK、正常 App 权威回读/completed receipt、Hub 重进、Mongo及副作用审计、新浏览器只读重进通过 | 只改维修范围描述；总额 2160、明细身份、数量和历史金额不变。PDF/上传/客户通知由既有本地模式禁用，**不算业务通过**；没有创建 Order 或推进 Workflow |

这是三种业务模型/目标的保存接口证据：前两种使用同一 extForm 路由家族的不同定义与存储协议，不能虚称三个不同路由家族，也不能用“三次 HTTP”替代三模型覆盖。真实只读另覆盖工单列表/详情、Ext、ExtField、Code、精确 FormData/raw、Order 列表/详情及目录等不同接口。

## 3. 请求覆盖与持久化

| 成功窗口 | 真实 HTTP | 登录/角色 | 业务读取 | 业务写入 | 不同业务读取端点 |
| --- | ---: | ---: | ---: | ---: | ---: |
| N03 资格预检、保存及新浏览器只读 | 94 | 6 | 87 | 1 | 9 |
| 最终授权 Order 保存及新浏览器只读 | 106 | 3 | 102 | 1 | 10 |

重复列表、精确查询和分页不重复计为不同端点。更早的 8 类接口/17 次只读资格核验与 N05 窗口保留各自时间、版本、统计，不混加为本轮新通过次数。

N03 的 9 个读取端点：`basic/serviceAppointment/query`、对应已列出工单的 `queryById/{id}`、`biz/action/query`、`code/query`、`biz/ext/queryById`、`biz/extField/query`、`i/code/selectCode`、`biz/extForm/query/{appointmentDefId}`、`biz/extForm/findByIdWithWorkflow`。

Order 的 10 个读取端点：工单列表/对应详情、`biz/action/query`、`code/query`、`i/code/selectMultistageCode`、`i/code/selectCode`、`basic/order/query`、`basic/order/queryById`、`biz/procedure/queryWithRank`、`basic/material/queryWithRank`。只有正常列表已发现并精确核对的隔离订单可读取/编辑；这不扩大 Production `queryById` 权限。当前上下文实际读取 155 条工序、87 条材料，按返回总数分页，不沿用历史目录数量。

此前真实 Order ExtField 返回 0，与独立 Mongo 一致。它是扩展字段配置状态，不代表固定 Order DTO、历史价格或正常编辑器缺失，未为此制造配置。真实价格显示读取保存快照的 `amount/totalAmount`，不靠目录单价乘数量猜历史金额。

## 4. 运行隔离与已知差分

实际 Java PID 的启动命令确认加载 Mac `LocalNetworkGuard`，仅允许连接本地 Mongo/Redis并禁止子进程；它**没有目录写入隔离**。实际 WAR/class、配置及运行日志单独核对，没有套用 Cloud `IsolatedGuard` 的文件系统结论。未重启共享三服务，只关闭自有编译器/浏览器。

该运行实例是基于固定 `5fc008d32e771205260f120621c1c4fc62d0824e` 的**既有隔离测试 composition**，不是原样生产后端。现有 `LocalIntegrationMode` 只有在本地配置 `local.externalIntegrations.disabled=true`、精确隔离 Mongo URI/库名和当前 `LocalNetworkGuard` 同时匹配时启用。与固定源码相比，隔离 `OrderServiceImpl` 另有 JSON 库兼容替换、`isAgain` 合同分支禁用，以及 upsert/报价生成中的 PDF/上传/通知禁用分支；本轮没有新增或修改这些后端内容。

实际生效位置为 PID 15955 的 `LocalAuthorityServer` 所加载隔离 WAR；业务 upsert 的 `OrderServiceImpl:443` 新日志、当前 class 的 `javap` 调用/条件和配置交叉核对。证据指纹：

| 对象 | 源码 SHA-256 | 实际运行文件 SHA-256 |
| --- | --- | --- |
| `LocalNetworkGuard` | `be1ec18e21deb029d36c9aac689ab73cc498b48c9b731dd66b7a9daf2d3ddec5` | agent JAR `dcd15b0216648ace3e28558334b3cb7d3c43b0d60aebdaf195dce46814641b54` |
| `LocalIntegrationMode` | `3ecce961e34d38c78af4f9643d06cb01eeb397ac0e04a82857c3e1030c897d7b` | class `6c2311c141f9fee6d4cf69f51c04c8f7cb370641357858f6fdeb8cdbc9a9014b` |
| 隔离 `OrderServiceImpl` | `04f671042be66d4ce932985ee2d97085d5feb5073cfd058598d8d0ba877807b7` | class `8bf722246965b1d7872a83f36cef3806e2301961dec8e18676d8ca485d975b63` |

本轮核对了该文件相对固定源码的差分、实际 class/agent/配置及有效分支，没有重新执行全后端可复现构建。不能将其扩大为原始完整生产后端或外部集成验收。Cloud 复审基于协调方直接核验事实与源码审计，没有独立重跑这些原始 Mac 窗口。

Order 原请求 `isCreateBjdPDF='1'` 和完整 EXTS 保留，`isAgain` 原本不存在。新的运行日志明确记录该次订单选择 `LOCAL_DISABLED` 分支，不生成 PDF、不云上传、不通知客户。不能只看浏览器禁止外连或 ACK 就判断副作用完成。

独立快照包含 Order、工单金额/支付、Workflow/Node、Document、Contract、Contacts、Message、SLA/Item/Def、SLAUpdateCode、配置及日志；另核实际 WAR template/runtime-storage 文件。最终 Order 窗口只有该 Order 改变，无新增/删除对象。工单与其余集合、文件均不变；相关条件集合为空，未覆盖其有数据分支。只读重进后的快照与保存后完全相同。

必须保留的 R1 审计限制：

- N03 Map：原 `createDateTime` BSON Date `.251` 经已观察的查询投影和整 Map 替换成为秒级 String；原 String `createTime`、业务 datetime 及其他业务值保持。非 preset 字段按既有规则镜像到 EXTS；原未知 EXTS 保留，新增两条服务端审计日志。`bsonLossless=false`。
- Survey：N05 创建时间 `.624` 保留，仅证明该次对象/槽位；原文、精确身份和权限验证仍必要，不推广为任意 typed 字段无损。
- Order：正常 typed 查询/替换将创建时间 `.296` 截至秒；Java 重建 updateTime，原来缺省的 `paidAmount/payIds/refundMoney` 按已有 getter 默认值落为 `0/[]/0`。这不是支付/退款行为，也不是 BSON 全无损。其他原业务槽位、完整 EXTS、产品/价格/数量均独立比对。

前端没有猜测隐藏毫秒/时区、修改后台历史或删旗标求通过。首次 Order 预检的 provider 配置/测试响应字段断言错误，都在代理发往上游前被拒绝；独立快照证明 0 次业务写入，原错误、拟发送包和不确定 UI 证据保留。最终成功窗口使用仓库既有 exact-scope 正常报价读取配置，原 `_version` 保留，不绕过版本或保存保护。N05、N03、最终 Order 的上游预算均已消费，不重放。

R1 Order 精读本身会增加 Redis 版本计数；本次正常 App 最后精读得到的 `_version` 原样随请求发送，不把“业务 Mongo 未变化”解释为完全无状态读取，也不声明跨设备原子 CAS。

## 5. 自动化与 CI

独立本地：`verify:full` **325 文件 / 6,023 测试**，类型、架构、依赖与质量门禁通过；另 **11** 个独立反例探针通过。新增真实 App 合成 HTTP H5 **2/2**、旧六字段专有预约 H5 **2/2**，零跳过、重试和 flaky；Stage 2B 修复后原场景 **1/1**。新两条 H5 直接本地执行，未声称已新增其 CI 命令。

代码基线 exact SHA `6e21141030779f774f6c1c9526ffb85018b1aa15` 的 [Validate](https://github.com/xlink-bj/xlink-technician-app/actions/runs/43356724214) 和 [Validate Main H5 UX](https://github.com/xlink-bj/xlink-technician-app/actions/runs/43356724187) 均成功。push 适用三组 H5 job 通过，其他事件专用 job 的 skipped 不计 PASS。`c8374537` 原 Stage 2B 失败不改写为通过；本次文档提交的 exact SHA/CI 在最终交付另报。

## 6. 真正剩余项目

1. 更广 FormDef 的条件、provider、复杂字段/媒体及未知配置，仍按各自已支持范围显式处理；当前已有记录控制子集不等于全域字段验收。
2. 本次均为 save-only。真实新增 FormData、完整 updateExts、Process、媒体上传/恢复及未知保存结果协调，不能从这些保存样本推导为通过；保留既有 Mock/合成回归的独立结论。
3. 真实 Quote→Order 创建、Order 其他业务状态，以及有数据的 Document/合同/联系人/消息/SLA 条件支路未验证；PDF、上传、通知、签署仍是独立门禁。
4. 已有记录持久草稿/媒体归属恢复、跨运行时原子 CAS 和所有 R1/Mock 数据全量等价，未由本轮补齐。已完成的首次新增草稿生命周期不重复开发。
5. Production/Beta 业务写入、原生验收、部署不在本轮；Issue #201 HOLD 不变。`CODE_PASS`、截图及本地真实保存不等于 `COMMERCIAL_UI_ACCEPTED`。

## 7. 本地审查证据

原始数据、凭据、截图、trace、数据库与构建产物不提交。Owner 本地入口：`.review/configured-model-final-acceptance-20261113/ACCEPTANCE_MATRIX.md`；其引用各窗口正式报告、实际接口账本、ACK/receipt、Mongo/文件差分及前后截图。此前 72 文件 stash 原样保留。
