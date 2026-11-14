# 签约条件只读：新虚构 fixture 与隔离执行准备

基线 `00bcb43d06264837b48f0565d0729f2a4e20a9dd`。本批只准备数据模板、离线校验和执行步骤，没有启动服务、连接数据库、登录生产或执行签署。不是新的后台seed工具、运行时授权或合同读取开关；不触媒体执行资产。

## 两组模板及本地绑定

`tests/support/signing-read-isolated-fixture.ts` 的纯函数按每次新 `synthetic-signing-*` namespace 分配八个互不重复的业务 ID：两组各一个 ServiceAppointment、Workflow、WorkflowNode、Order。正例匹配当前用户；反例分配给另一合成用户。两组同租户同组织，普通列表有效角色为 dataAuth=2，来源类型为 4；使用普通数据权限列表，不能用只含待办的 SANode 列表把反例过滤掉后宣称处理人校验通过。

| 对象 | 协议形状与关联 |
| --- | --- |
| ServiceAppointment | state=1，status=203，serviceType=11，exts.sourceType=4，workflowId 指向对应 Workflow；不设置 scheduleFlag，无电话地址 |
| Workflow | state=0，formDataId 指向本组工单；defId 是明确未核实的本地元数据绑定占位 |
| WorkflowNode | state=0，workflowId、workflowFormDataId、workflowFormColName 精确关联；唯一 placeOrder；正例 handler 为当前用户，反例为另一用户 |
| Order | type=1、state=1、processState=0，serviceAppointmentId 精确关联；完整 EXTS 无 isAgain，空 orderList，无金额、签署人、PDF或合同 |

模板始终标为 `offline-prepared-not-seeded`、`localBindingsVerified=false`，不会仅因离线测试通过而变成可seed产物。执行线须先只读确认既有隔离账号/用户、有效角色、活跃组织、sourceTypes、active ServiceAppointment Ext/WorkflowDef，绑定真实的 placeOrder nodeDef 快照及 defId；全部生成的 principal/元数据 ID 不是已存在身份的声明。反例的另一用户也必须在该隔离租户实际存在。绑定后逐一重写 tenant/org/belongTo/handler/defId 和八个业务引用，并在新库中确认 ID 全部不存在，保留旧 A/B/C。

只借用已授权生产只读材料的字段名、类型、preset/EXTS及引用结构，不复制生产 ID、个人资料、会话或业务记录。来源、权限、provider或关联缺失先视作准备不足，修正新fixture后再验；不为通过测试篡改已有权限或伪造生产配置。

## 离线校验及合同边界

`tests/engineering/signing-read-isolated-fixture.test.ts` 使用真实角色列表 Adapter、Order只读 Adapter和签约 Store，全部响应由内存executor提供。覆盖两组正常读取、合同默认拒绝、namespace分离，以及错误Order/Workflow引用的准备失败；无真实HTTP或数据库操作。运行：`./node_modules/.bin/vitest run tests/engineering/signing-read-isolated-fixture.test.ts`。

本窗口 Contract 预算为0，fixture不含合同。即使程序调用 loadContracts，真实默认只读端口仍在发送前拒绝；正例仅处理人已核对，综合签约条件仍 blocked。`mayDispatch`、`backendPermissionProven`、`actualBusinessOutcomeKnown` 均为 false。不得注入假合同成功响应、复用历史 localSigningReadScope ID，或把普通工单可见当合同权限。

后续如确需完整合同核验，另审绑定新工单/Order/当前身份的精确DEV只读范围；R1主入口为 `basic/contract/query.do`，serviceAppointmentId 条件与 `state=1 OR exts.contractStatus=-2`，App有界第一页3条，不复制 `_all=1`。现有本地合同实验仍固定历史tuple，不能用模板自动替换或放开任意ID。本批不更改该限制。

## 窗口空闲后的最小执行

1. 媒体窗口释放资源后，由环境持有线确认实际WAR/class/guard、隔离库和精确代理配置；本批没有预订、探测或启动任何Mac端口。
2. 在隔离数据准备阶段完成上述绑定和全新ID缺席检查，再建立业务/元数据/Workflow/旧数据、Redis和文件基线。正常登录Account审计单列，不称数据库零写。
3. 正常隔离登录→普通工单列表→本组详情→当前节点Workspace→正式Order→签约只读页→核对操作条件。正例显示处理信息已核对，反例保持未确认；两者合同/签署均关闭。
4. 使用实际normal App/H5原包转发；记录完整路由、方法、精确body、请求预算及Java响应。先以本批离线方案核对所需读取，再冻结本窗口白名单；旁路被代理拒绝不计Java通过，不运行中扩大范围。
5. 保存两组实际截图及前后差分，业务保存/Process/上传/签署/短信/PDF/合同写为0，Contract读为0。结果不明不重发；关闭仅本窗口自有进程，保留所有证据及旧保存基线。

真实Java端到端仍待独立窗口执行。本批离线成功不证明新账号可正常登录、元数据已部署、数据库权限或生产等价。后台历史问题沿用统一台账，不作为当前前端收口的前置修复要求。
