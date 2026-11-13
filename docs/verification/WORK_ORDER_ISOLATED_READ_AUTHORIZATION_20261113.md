# 工单读取权限：隔离真实 Java 验证（2026-11-13）

本记录补充[工单资料放行条件](WORK_ORDER_INFORMATION_PRODUCTION_CONTACTS_READINESS_20261113.md)，不覆盖该文档的其他待验项，也不改变[Contacts 已确认限制](CONTACTS_ISOLATED_READ_AUTHORIZATION_20261113.md)。仅记录后端隔离实测，无产品功能、后台协议或放行开关变更。

## 范围
本次仅独立合成数据库 xlink_bizprovider_20261113、正常 OTP 登录的现有合成 dataAuth=2 角色。新增四组 ServiceAppointment/Workflow/WorkflowNode，共12对象。未访问生产、未修改共享服务或产品/后端代码。未重放历史 A/B/C。不得推广为全部角色或生产环境已验证。

执行时前端仓库基线为 `b5d2162289b42fb6f809d6dd2229ccd727021ebe`，本轮不是 H5 界面测试。

## 接口和参数
全部 POST `/xlink/wm/basic/serviceAppointment/`：
- `query`：`page=1&rows=1&is:_id|string#and=<exact SID>`。
- `querySAWorkflowNode`：同上，综合待办/已办节点对应工单列表；与详情内部检查对应的是底层 `queryWorkflowNodeDistinct` 路径，不是下行的 todo 查询。
- `queryWorkflowNode`：`page=1&rows=1&orderState=todo&is:workflowFormDataId|string#and=<exact SID>`；独立记录，不能替代上一接口。
- `queryById/<exact SID>`：空 body，无 type 参数。

禁用 type=query、notFilterOrgId、notFilterBelongTo。固定代理对全部四组 ID 一视同仁转发到真实 Java，不模拟或过滤响应。正常登录1次、业务读取16次，全部上游HTTP200；业务拒绝看status/message而非HTTP码。

## 结果
| 合成工单情形 | 普通query total | querySAWorkflowNode total | queryWorkflowNode total | 空body详情 |
|---|---:|---:|---:|---|
| 同组织、未分配当前用户 |1|0|0|status1，有数据|
| 同租户异组织、未分配当前用户 |0|0|0|status0，您无权访问|
| 跨租户、未分配当前用户 |0|0|0|status0，您无权访问|
| 同租户异组织、节点分配当前用户 |0|1|0|status1，有数据|

因此未分配不等于无权：普通数据权限可允许；普通列表不可见也不等于详情应拒绝：workflow distinct路径可允许。双路径均不允许和跨租户负例在此上下文明确拒绝。原始queryWorkflowNode与综合querySAWorkflowNode语义/过滤不同，已保留差异，不把前者0当后者0。

## 部署证据与限制
实际加载 session-authority-v4-20261107/exploded-war。VERSIONS.json给出三个部署class与本地源码的精确SHA256，*-JAVAP.txt保留部署反汇编。queryById反汇编确认先queryWorkflowNodeDistinct，total0再query，二者均0返回无权；两个catch异常后可能继续读实体。这次无故障注入，不能声称已验证异常分支安全。当前源码仅用于解释，实际结果以加载class和API_LEDGER为准，不能声称源码与部署完全同版本。

部署 class SHA-256（仅标识本次实际运行产物）：

- `com/fsgo/service/basic/ServiceAppointmentServiceImpl.class`: `2ae1985ff55f2377961fa0e1c908bc48d5cfbb298f63dd6ed5051964a0abcdce`。
- `com/fsgo/service/workflow/WorkflowServiceImpl.class`: `37ec164a8e2d29dba3341c2a09b35ebd5973014d63b5c87a3b834982626eb0fa`。
- `com/fsgo/modulemini/basic/ServiceAppointmentController.class`: `e83bc44e1822afae4d33faf552309f161b67e1002b25ef10951acdaad1c13732`。

未测：权限查询抛异常后的行为、其他 dataAuth 角色、无组织工单上下文、过期会话、跨租户但已分配的组合，以及生产实际版本/策略。源码/字节码中存在异常后继续执行的风险，不代表本次已经复现，也不能因正常分支通过而宣布异常分支安全。不得用 `type=query` 绕过缺口。

## 审计和清理
插入新fixture后53对象，读取后仍53；无新增/删除，仅正常登录Account上下文变化。所有业务、元数据、Contacts和历史A/B/C保持不变。自有proxy5399/Java22580/Redis20579/Mongo31571全部退出且端口释放，supervisor ALL_OWNED_CHILDREN_EXITED_NO_FORCE。共享15937/15947/15955保持原进程。

原始证据位于忽略目录 `.review/bizselect-provider-real-20261113/sa-permission/`：FINAL_RESULT.json、API_LEDGER.json、每case的原始JSON、AUDIT.json、fixture.json、VERSIONS.json和部署JAVAP；上级目录sa-ready/sa-after BSON快照。代理仅结构/路由限制，拒绝离线测试已通过，无生产请求、保存、Process、上传、消息。

登录输入、Cookie、凭据、原始数据库快照不提交仓库。本记录只保留脱敏合成结果；生产未访问，后台缺陷或放行政策仍由后台/部署负责人核实处理。
