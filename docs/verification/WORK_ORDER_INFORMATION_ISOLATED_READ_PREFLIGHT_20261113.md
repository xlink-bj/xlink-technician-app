# 工单资料：隔离 Java/Mongo 只读链路预检

状态：**真实链路 NOT_RUN；环境缺口已核实；合成契约通过不能替代真实链路通过。**

检查基线：`72c2022731af90ec4d34708e760aef19f0985263`，2026-11-13 UTC。本轮不改 App、API adapter、共享角色运行时或后台源码，不推送未经审查改动。

## 1. 可用证据与实际环境

- [历史真实集成台账](R1_LOCAL_REAL_INTEGRATION_EVIDENCE_20261113.md)及[三模型验收](R1_CONFIGURED_MODEL_REAL_INTEGRATION_20261113.md)记录 Mac 既有隔离 Java/Mongo/Redis、LocalAuthorityServer、guard 与虚构对象；它们不是本云环境的运行实例。
- 可见仓库材料没有本次新增 `colName=serviceAppointment` 配置读取、对象资料 adapter、页面行及前后数据库快照的同窗真实链路账本。Mac 私有 `.review` 原始材料当前不可达，不能断言其从未做过，也不能把历史普通表单 ExtField 读取算作本功能实证。
- 当前云环境无 Java/Mongo/Redis 业务进程，监听端口仅平台 1040；Docker 守护进程存在，但容器和镜像列表均为空。没有重复启动服务或批跑。
- 工作区无后台 WAR/JAR、后台持久 checkout、隔离启动器、已核 guard、Mongo/Redis 数据卷或虚构身份 seed。Java 为 21.0.12.1；未发现 Maven、mongod 可执行文件，未核实与历史隔离 composition 的兼容性。
- 环境状态报告无 secrets、runtime variables 或 outbound identities；外网可用不等于隔离后台已具备。本轮没有读取或使用生产登录，未启动原后台生产配置，未请求生产业务 API。
- Docker 可以成为后续隔离载体，但单独启动一个空 Mongo，或自行写 Java 返回合成 JSON，都不能证明原后台 API→Mongo→App 链路，故未制造这种替代性通过。

## 2. 已独立执行的契约验证

运行 `VITE_XLINK_ENVIRONMENT=test vitest run`，限定以下四文件，**4 文件、148 用例全部通过**：

- `tests/engineering/work-order-information.test.ts`：73 项，对象 adapter 的 root/exts、字段身份、字典、脱敏、完整配置及回退、身份撤销和对象隔离。
- `tests/engineering/work-order-information-fixture.test.ts`：30 项，固定对象/路径/方法/完整有界 body，含 29 个负向请求。
- `tests/engineering/role-field-visibility.test.ts`：26 项，共享单角色 context 的 include/exclude、缺失/伪造 context、全角色列表无效及撤销边界；**不是对象资料正向角色授权已接通的证明**。
- `tests/g4f/p0-contract-fixtures.test.ts`：19 项既有 P0 边界，仍为合成证据。

`work-order-information.config.ts` 专用 H5 **1/1 通过**：正常 App 页面运行，HTTP 登录、角色菜单、业务与配置响应均由 Playwright 合成拦截。覆盖配置新增/改名/排序、root/exts、脱敏、有效全隐藏与失败回退区别、area/map、迟到 A 响应不能污染 B、待接单不发配置请求；保存/上传/Process 等业务写请求为 0。其账本仍明确 `realBackend: NOT_RUN`，没有 Java/Mongo 通过声明。

日志保存在忽略目录 `.review/work-order-information-20261113/` 的 `isolation-read-contract.log`、`isolation-read-synthetic-h5.log`；没有提交生成 bundle、凭据或原始数据。

## 3. 对象资料的当前单角色缺口

当前 `src/adapters/api/read-models/work-order-information.ts` 会省略带非空 root/config `roleIds` 的字段，projection 调用 `evaluateVisibility` 时没有传入可信角色 context。因此 showType 4/5 当前保守隐藏；即使当前角色匹配，也不能声称已经正向显示通过。

现有对象单元测试证明：缺少 context 时 4/5 隐藏、不能用用户全部角色并集放行、角色切换会废弃在途配置且需重新取得列表资格。这些是负向安全边界；普通表单 reader 的角色 H5/单元通过不能替代对象资料 reader 的正向链路。

与角色线的最小接点：复用 `SelectedRoleVisibilityContext` 与 `evaluateVisibility` 第三个参数；仅由当前已核 session、当前单角色、当前对象列表资格及 reader generation 发行并持续复核 context。对象 adapter 应只在此 context 和已验证 4/5 元数据都具备时消费角色条件，缺失/伪造/撤销继续隐藏。不得使用 FormData 的 role/currentRole、后端原包中的 context 标记或 user.roleIds 并集。本轮只记录此接点，未修改角色线或对象 adapter，避免并行冲突。

## 4. 补齐环境后必须执行的真实窗口

| 场景 | 真实 Java/Mongo 与正常 App 所需断言 | 本轮状态 |
| --- | --- | --- |
| 正常隔离身份 | 全新虚构租户、用户、当前角色与可见工单；普通登录与角色菜单来源可追踪，认证上下文变化单独计账 | NOT_RUN |
| 元数据变更 | 隔离数据库 seed 中新增、改名、隐藏、排序普通字段；真实固定配置请求及 API 返回须与 Mongo 配置匹配，页面按返回字段 ID 展示 | NOT_RUN |
| root/exts 同名 | 两个不同 fieldId、同 name、不同 preset 的合法字段同时存在，根/扩展值不互相覆盖，未知字段不全量展开 | 合成已过；真实 NOT_RUN |
| 当前单角色 4/5 | include/exclude 的匹配与不匹配均实测；用户拥有两个角色但只按当前单角色判断；名单/context 缺失隐藏 | 对象正向接点待角色线；真实 NOT_RUN |
| 身份变化 | 切角色/换 session/退出及迟到配置使旧 context 失效；重新授权/列表刷新前不得复用旧字段或数据 | 合成已过；真实 NOT_RUN |
| 手机与接单 | 已接单仅渲染受支持脱敏；待接单不读资料配置；未知格式不输出原值，不触发真实拨号 | 合成已过；真实 NOT_RUN |
| 全隐藏与失败 | 合法完整配置全隐藏必须为空；网络/不完整配置回退仅限已验证展示；401/403 不降级成成功 | 合成已过；真实 NOT_RUN |
| 隔离与副作用 | API 账本零业务写；Mongo、Redis、文件前后审计；认证或读取版本计数另记，不以 Mongo 不变声称完全无状态 | NOT_RUN |

最小环境输入为：固定后台 `5fc008d32e771205260f120621c1c4fc62d0824e` 对应的可复现隔离 WAR/启动器与 guard 源码或可核指纹、纯本地配置、兼容 Java/Mongo/Redis 版本、可审的全新虚构身份和数据 seed。没有这些输入时，不能安全地拿生产配置启动后台，也不能用自制 HTTP façade 替代真实授权链。

执行时只允许固定登录/菜单、角色内工单列表/对应详情、`colName=serviceAppointment` 的有界配置及必要有界 Code 读取；具体 allowlist 必须按实际隔离 composition 核实。未知请求和所有业务保存、Workflow、上传、签署、通知、PDF 继续拒绝；不重放历史已消费对象。配置变化仅发生在全新隔离 seed，绝不写生产。

Production/Beta 新资料读取仍关闭。当前用户生产有效配置、线上权限与独立 Contacts 读取均不由本文件证明。
