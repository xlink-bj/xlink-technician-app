# Contacts 读取权限：隔离实测与后台历史限制（2026-11-13）

## 结论与适用范围

本次在独立、全虚构数据的真实 Java/Mongo 环境中确认两处后台读取限制，作为历史问题记录，不在前端任务中修改后台：

1. `Contacts.queryById` 对不同组织、不同租户的目标 ID 均返回实体，不能作为独立客户资料的安全读取通道。
2. `Contacts.query` 在正常组织权限下过滤异组织记录，但本次正常登录的无组织用户仍可读取同租户异组织记录。因此不能将列表接口无条件视为安全替代方案。

**以上不是生产漏洞复现。** 未访问生产，未核实生产部署版本或上层策略；仅覆盖下述隔离版本及两种 `dataAuth=2` 身份，不代表所有角色。当前 App 没有新增 Contacts 自动查询，Production/Beta 开关、权限及业务写入边界不变。与[当前放行条件](WORK_ORDER_INFORMATION_PRODUCTION_CONTACTS_READINESS_20261113.md)一起阅读；该文档中的待验矩阵不能整体改记为通过。

## 环境、版本及证据精度

- 后台：既有 `session-authority-v4-20261107/exploded-war`，独立 Mongo/Redis/Java 与严格读取代理；网络 guard 拒绝公网，未修改共享开发库或后台代码。
- 前端工作树：实测时 `2b0064a36ea4c33756fdf787c993811dac84a72f`。本次是后台真实接口验证，不是新增 Contacts UI 的端到端验收。
- 部署 `ContactsServiceImpl.class` SHA-256：`d84ad2e20431ec965d6892c10226d20a969e09c8da984858209619a47bd7d4df`。
- 部署 `modulemini/basic/ContactsController.class` SHA-256：`da071a41ddb78542f4722774506f016029a95773adf56756152e017894abbd08`。
- 已反汇编确认部署服务的 `queryById` 直接调用 `mongoTemplate.findById`；不宣称整个源码树与部署包完全一致。
- 代理将全部精确测试 ID（含负例）转发至 Java，无响应 mock；首轮代理拒绝数为 0，结果不是由代理代替后台过滤。

## 真实关联及精确请求

真实工单详情 `POST /xlink/wm/basic/serviceAppointment/queryById/<syntheticWorkOrderId>` 返回 `data.serviceAppointment.contactIds`，命中同范围虚构 Contacts 的 `_id`。它是数组，不是单一 `contactsId`，也不证明首个引用是主客户或已获独立读取权限。

详情读取：`POST /xlink/wm/basic/contacts/queryById`，表单参数 `id=<exactSyntheticId>`。

有界列表读取：`POST /xlink/wm/basic/contacts/query`，补例表单参数：

```text
page=1
rows=1
_withFields=_id,tenantId,orgId,name
is:_id|string#and=<exactSyntheticId>
```

`query` 不验证工单与客户的关联。引用必须来自实际获准工单，且服务器对象权限需独立成立；不能以引用存在替代授权，不能按同名/同电话猜关联。

## 预期与实际

安全验收预期：无权读取的对象不得返回实体；不存在记录应表现为可处理的无结果/错误。

| 身份与目标 | `queryById` 实际 | `query` 实际 |
| --- | --- | --- |
| 组织绑定的 dataAuth=2，同组织 | HTTP 200，返回目标 | total=1 |
| 同一身份，同租户异组织 | HTTP 200，返回异组织目标 | total=0 |
| 同一身份，异租户 | HTTP 200，返回异租户目标 | total=0 |
| 同一身份，不存在 ID | Java HTTP 500，非 JSON 错误 | total=0 |
| 新无组织 dataAuth=2 身份，同租户异组织 | 补例未重复调用 | total=1，不满足组织隔离预期 |
| 新无组织身份，异租户 | 补例未重复调用 | total=0 |

无组织补例采用新的虚构账号、用户和角色，经正常登录取得会话。输入用户 `orgIds=[]`，登录返回用户 `orgIds=[null]`；登录后持久 Account 无 `permissionOrgIds`，部署 Account getter 在字段为 null 时初始化空 ArrayList。**没有直接读取 Java 会话内存**，不能把这些证据写成“已检查运行内存权限列表”。实际异组织返回是独立观测事实。源码 `EMongoTemplate` 对 dataAuth=2/3 仅在组织列表非空时追加组织过滤，与观测相符。

正向投影保留了四个选定字段的实际值，但 Contacts DTO 序列化仍输出默认 `state=1`、0、空数组/对象。这些默认值不是未投影业务值泄露，也不能用于证明数据库实际状态。需要验真的字段必须明确投影；本轮未测试失效记录的状态过滤。

## 保全、清理与未验证项

- 首轮数据库 38→38 个对象，仅正常登录的合成 Account 审计变化；补例 41→41，仅两次正常登录的合成 Account 变化。登录的认证状态写入不等于“数据库零写入”。
- 业务记录、配置、工作流及旧 A/B/C 保存基线均未变；无业务 API 写入、保存重放、upsertContact、上传、通知或签署。
- 自有代理/Java/Redis/Mongo 已退出；5399/22580/20579/31571 端口释放。原共享三个服务 PID 未变。产品代码未修改。
- 未验证：生产有效身份/部署、全部角色策略、过期会话、空/多引用的业务主次、失效客户、客户端新 Contacts 展示路径。没有因本次结果开放任何接口或展示字段。

原始证据保留在忽略目录 `.review/bizselect-provider-real-20261113/contacts-read/` 与 `contacts-projection/`：`FINAL_RESULT.json`、`API_LEDGER.json`、逐例响应、`SOURCE_HASHES.json`、部署反汇编及前后快照。凭据、Cookie、登录输入和数据库原始快照不纳入仓库。本文件只记录脱敏合成结果。

后续由后台负责人核实目标部署并处理跨范围详情读取及无组织的 fail-closed 行为；前端保持现有限制，不能靠 UI 隐藏、客户端猜权限或绕过接口补救服务端授权。
