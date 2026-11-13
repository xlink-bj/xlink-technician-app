# 工单资料：隔离 Java/Mongo 只读链路预检

状态：**最新 main 已完成对象单角色源码贯通及合成验证；真实 Java/Mongo 链路仍 NOT_RUN，等待 Mac 线的真实窗口证据。两种证据不得互相替代。**

初检基线：`72c2022731af90ec4d34708e760aef19f0985263`；更正复核基线：远端 main `2b0064a36ea4c33756fdf787c993811dac84a72f`，2026-11-13 UTC。初检角色缺口只适用于旧 72c，不能当作当前 main 缺陷。本轮无冲突整合已发布提交，作者新增修改仅本文档，不改 App、API adapter、共享角色运行时或后台源码，暂不推送。

## 1. 可用证据与云环境初检记录

- [历史真实集成台账](R1_LOCAL_REAL_INTEGRATION_EVIDENCE_20261113.md)及[三模型验收](R1_CONFIGURED_MODEL_REAL_INTEGRATION_20261113.md)记录 Mac 既有隔离 Java/Mongo/Redis、LocalAuthorityServer、guard 与虚构对象；它们不是本云环境的运行实例。
- 初检时可见仓库材料未找到本次新增 `colName=serviceAppointment` 配置读取、对象资料 adapter、页面行及前后数据库快照的同窗真实链路账本。Mac 私有 `.review` 原始材料当前不可达，不能断言其从未做过，也不能把历史普通表单 ExtField 读取算作本功能实证。
- 初检时本云环境无 Java/Mongo/Redis 业务进程，监听端口仅平台 1040；Docker 守护进程存在，但容器和镜像列表均为空。没有重复启动服务或批跑。
- 工作区无后台 WAR/JAR、后台持久 checkout、隔离启动器、已核 guard、Mongo/Redis 数据卷或虚构身份 seed。Java 为 21.0.12.1；未发现 Maven、mongod 可执行文件，未核实与历史隔离 composition 的兼容性。
- 环境状态报告无 secrets、runtime variables 或 outbound identities；外网可用不等于隔离后台已具备。本轮没有读取或使用生产登录，未启动原后台生产配置，未请求生产业务 API。
- Docker 可以成为后续隔离载体，但单独启动一个空 Mongo，或自行写 Java 返回合成 JSON，都不能证明原后台 API→Mongo→App 链路，故未制造这种替代性通过。

## 2. 旧 72c 基线已执行的契约验证

运行 `VITE_XLINK_ENVIRONMENT=test vitest run`，限定以下四文件，**4 文件、148 用例全部通过**：

- `tests/engineering/work-order-information.test.ts`：73 项，对象 adapter 的 root/exts、字段身份、字典、脱敏、完整配置及回退、身份撤销和对象隔离。
- `tests/engineering/work-order-information-fixture.test.ts`：30 项，固定对象/路径/方法/完整有界 body，含 29 个负向请求。
- `tests/engineering/role-field-visibility.test.ts`：26 项，共享单角色 context 的 include/exclude、缺失/伪造 context、全角色列表无效及撤销边界；**这组旧基线测试没有包含对象资料正向角色贯通证明**。
- `tests/g4f/p0-contract-fixtures.test.ts`：19 项既有 P0 边界，仍为合成证据。

`work-order-information.config.ts` 专用 H5 **1/1 通过**：正常 App 页面运行，HTTP 登录、角色菜单、业务与配置响应均由 Playwright 合成拦截。覆盖配置新增/改名/排序、root/exts、脱敏、有效全隐藏与失败回退区别、area/map、迟到 A 响应不能污染 B、待接单不发配置请求；保存/上传/Process 等业务写请求为 0。其账本仍明确 `realBackend: NOT_RUN`，没有 Java/Mongo 通过声明。

日志保存在忽略目录 `.review/work-order-information-20261113/` 的 `isolation-read-contract.log`、`isolation-read-synthetic-h5.log`；没有提交生成 bundle、凭据或原始数据。

## 3. 旧基线观察、最新实现与本地复验

**仅旧 72c 的观察**：当时对象 adapter 省略非空 roleIds，projection 未传可信角色 context，所以 4/5 保守隐藏。03c4ec 将它写为“当前缺口”有基线时效问题；该判断不再代表最新 main，下面以实际 2b0064a diff 更正。

**最新 2b0064a 已实现**：对象 mapper 只放行共享已验证的 root showType 4/5 角色子集；projection 接受可信 roleContext，覆盖原包 token 并将角色行设为只读，调用 evaluateVisibility 第三个参数。technician-api 在既有 DEV、身份、实时 tenant、当前单角色、列表对象资格及读取代次均有效时发行 context，新列表/详情读取或身份变化主动撤销。composition 提供实时 tenant；页面订阅撤销并再次过滤可见行。缺失、伪造、复制或撤销 context 仍隐藏，不使用 user.roleIds 并集。详见已发布的[对象单角色贯通记录](WORK_ORDER_INFORMATION_SELECTED_ROLE_20261113.md)。本轮没有改这些实现。

**最新源码的本地针对性复验**：五个文件 178/178 通过，命令仍使用 CI 的 VITE_XLINK_ENVIRONMENT=test：对象资料 88、对象角色 15、严格 matcher 30、共享角色 26、P0 契约 19。两个专用 H5 配置顺序运行，普通资料 1/1、对象角色 5/5 均 exit 0；后者覆盖包含/排除四象限、全角色并集无效、伪造/畸形规则、迟到 A、新 B、注销后其他角色及缺 currentRole。vue-tsc exit 0。

以上 H5 运行正常 App，但所有 HTTP 为合成拦截；这已是对象资料自身的正反角色验证，不再仅是普通表单验证，仍不等于真实 Java/Mongo 或线上授权通过。最新日志为 isolation-read-latest-role-contract.log、work-order-information-latest-preflight-h5.log、work-order-information-role-latest-preflight-h5.log、isolation-read-latest-typecheck.log，均位于前述忽略目录。

**仍缺的真实证据**：Mac 线正按协调尝试真实隔离验证，本云不重复启动后台。其运行是否完成及真实 API/配置/Mongo/前端同窗账本，须由 Mac 线提供后独立核对；不能以尝试中或本次合成通过计作真实通过。

## 4. 补齐环境后必须执行的真实窗口

| 场景 | 真实 Java/Mongo 与正常 App 所需断言 | 本轮状态 |
| --- | --- | --- |
| 正常隔离身份 | 全新虚构租户、用户、当前角色与可见工单；普通登录与角色菜单来源可追踪，认证上下文变化单独计账 | NOT_RUN |
| 元数据变更 | 隔离数据库 seed 中新增、改名、隐藏、排序普通字段；真实固定配置请求及 API 返回须与 Mongo 配置匹配，页面按返回字段 ID 展示 | NOT_RUN |
| root/exts 同名 | 两个不同 fieldId、同 name、不同 preset 的合法字段同时存在，根/扩展值不互相覆盖，未知字段不全量展开 | 合成已过；真实 NOT_RUN |
| 当前单角色 4/5 | include/exclude 的匹配与不匹配均实测；用户拥有两个角色但只按当前单角色判断；名单/context 缺失隐藏 | 最新对象源码及合成正反验证已过；真实 NOT_RUN，待 Mac 线证据 |
| 身份变化 | 切角色/换 session/退出及迟到配置使旧 context 失效；重新授权/列表刷新前不得复用旧字段或数据 | 合成已过；真实 NOT_RUN |
| 手机与接单 | 已接单仅渲染受支持脱敏；待接单不读资料配置；未知格式不输出原值，不触发真实拨号 | 合成已过；真实 NOT_RUN |
| 全隐藏与失败 | 合法完整配置全隐藏必须为空；网络/不完整配置回退仅限已验证展示；401/403 不降级成成功 | 合成已过；真实 NOT_RUN |
| 隔离与副作用 | API 账本零业务写；Mongo、Redis、文件前后审计；认证或读取版本计数另记，不以 Mongo 不变声称完全无状态 | NOT_RUN |

最小环境输入为：固定后台 `5fc008d32e771205260f120621c1c4fc62d0824e` 对应的可复现隔离 WAR/启动器与 guard 源码或可核指纹、纯本地配置、兼容 Java/Mongo/Redis 版本、可审的全新虚构身份和数据 seed。没有这些输入时，不能安全地拿生产配置启动后台，也不能用自制 HTTP façade 替代真实授权链。

执行时只允许固定登录/菜单、角色内工单列表/对应详情、`colName=serviceAppointment` 的有界配置及必要有界 Code 读取；具体 allowlist 必须按实际隔离 composition 核实。未知请求和所有业务保存、Workflow、上传、签署、通知、PDF 继续拒绝；不重放历史已消费对象。配置变化仅发生在全新隔离 seed，绝不写生产。

Production/Beta 新资料读取仍关闭。当前用户生产有效配置、线上权限与独立 Contacts 读取均不由本文件证明。

## 5. 后续 Mac 独立隔离验收回报（非本云亲读原件）

本节是上文云端预检/复核之后的状态更新：Mac 线现已回报完成下述有限真实窗口，不能继续把该窗口写为“尚未执行”；上文 NOT_RUN、等待或尝试中的描述仅保留为当时检查点。本云没有这些本机原始文件，以下全部明确归属为 Mac 线经协调回报，未伪称亲读或独立复核原件。

Mac 回报的精确 App 源码为 `2b0064a36ea4c33756fdf787c993811dac84a72f`，使用独立 Java/Mongo/Redis 与虚构身份、数据，执行正常登录后读取真实 ExtField API：返回 7 条配置，H5 资料展示 6 行。该窗口验证 root/EXTS 同 name、0/false 原值展示、当前单角色 showType 4 显示而 5 隐藏，以及电话只显示 `139****9901` 脱敏值；业务保存 0、外部请求 0。

范围限制必须保留：不属本窗口范围的 biz/action 旁路请求被隔离代理拒绝，未到达 Java。故上述成功只归属于资料读取/展示窗口，不表示整张工单的全部请求成功，也不把被拒绝请求计作 Java API 通过。

Mac 回报数据库前后审计计数 34→34，业务、metadata、node、workflow 无变化，仅虚构账号登录审计变化；旧数据 A/B/C 保全，独立服务已停止。这些都是 Mac 回报状态；本条不扩写为 Redis 或文件全部无变化的独立结论，本云未重放历史保存或重复启动后台。

原始证据定位（Mac 本机，未复制或提交到本云仓库）：

- `.review/work-order-information-real-20261113/REPORT.md`
- `.review/work-order-information-real-20261113/h5-result.json`
- `.review/bizselect-provider-real-20261113/information-read/FINAL_RESULT.json`

当前生产用户有效 API、线上权限仍未验证，Production/Beta 新资料读取仍关闭。该 Mac 虚构数据窗口不替代生产验收，也不证明所有角色切换、配置失败或安全回退场景均已在真实后台执行。
