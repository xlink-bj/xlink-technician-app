# DEV接单构建中的历史只读

普通接单构建的REAL_WRITES=true与历史原有双false门控不共存，导致接单自动进入详情后无法查看已完成表单。本片只为历史reader增加独立的本机部署分支，不改当前节点reader/writer、命令transport、grant或生产权限。

新分支要求开发DEV布尔true、PROD false/未声明、精确dev环境及原NODE_FORM_READ=true；origin精确http://127.0.0.1:5189，API精确同源/xlink/wm，无auth override；REAL字符串true且SPECIAL字符串false。构建Mock=false之外，还要求实际runtime Mock mode=off（storage data/empty不能豁免），禁止E2E/hybrid模式、forms/repeat actions及grant。登录配置租户须与reader租户精确一致，未知/缺失必要值关闭。可选disabled flags接受缺省/空串/字符串false；PROD布尔true或字符串值关闭。无新增部署开关，继续使用既有显式NODE_FORM_READ读取开关。

原双false历史分支原样使用normalNodeFormsReadEnabled，没有改写input.env为假只读。新增分支不改变该全局函数：同一普通写env的当前节点reader仍关闭。HistoricalFormsReader只暴露enabled/isCurrent/clear/discover/read，不返回写action、原文mutation lease、grant、draft或媒体上传能力。历史界面仍为纯只读投影，typed及媒体的既有读取校验不变。

所有历史session/user/role/version、真实listed-ID、tenant/sid/node/workflow/record、完整binding、fresh前后复核、异步撤权和有界冷all列表保持原代码。开启历史入口不是授权本身；任何一步不能证明关联或当前权限均拒绝。仅局部收窄普通写分支的来源，不全局修改Mock。loopback字面URL是部署门控，不能证明代理上游；真实验收还必须核固定本地Java代理及进程网络隔离。

专项测试先在现有reader复现disabled，再对真实reader执行正负矩阵、冷分页/漂移、伪membership、跨身份/关联、binding变化、晚到撤权/clear/gate变化/runtime Mock切换。既有历史/当前表单与writer回归独立保留。真实H5目标是在单一compiler/env、同一正常登录中接单Process一次、自动详情、立即打开原历史记录；不得以切换环境或私有reader直调替代UI。

不代表生产workflow脚本/分类状态流转、Production写入、商业视觉或原生验收。精确冻结patch和本机Java/Mongo证据保存在本轮私有review目录，最终状态以该证据为准。

独审复核补证：新普通写分支一旦由enabled/isCurrent/read入口或await检查观察到source/deployment gate拒绝，即消费generation、丢弃lease和已读results，包括尚在discover中的ticket。恢复runtime off须重新discover；旧target/result/pending read不能复活。此失效不因复制target或一般isCurrent=false触发，也不改变旧readonly分支或全局Mock配置。原候选与单构建真实证据保留为v1，不作为修订后候选的最终通过凭据。

最后复核：fingerprint自身可能观察到新分支失效并消费代数，discover检查先求当前fingerprint再比较generation，防普通写切有效readonly时在同一次检查漏掉代数变化。对该顺序追加单例RED→GREEN，旧readonly显式重新discover仍可正常读取。

## 最终实际验证（2026-11-10）

v3 候选在全新隔离 Java/Mongo/Redis 实例完成真实 App 430×932 Playwright：同一 compiler、proxy、env 和浏览器 context，一次正常登录，接单 Process 一次成功后自动进入详情并直接打开既有历史表单。正式链 22 次请求/22 次响应，无切换只读构建、reload、重登或重放；另一次独立登录预检 7 次请求、0 业务命令。历史说明及数量 7 正确，当前节点 writer/action/grant 没有新增。

原始 BSON 审计 18→20：仅账户登录元数据及接单节点变化；接单节点 0→10，handleUser 为当前技师，新增匹配父节点、工单、Workflow 和 handler 的后续 forms 节点及一条 tenantLog。其余 16 条原数据逐字节一致，包含历史节点、历史 FormData、工单与 Workflow，历史完整 EXTS 不变。该历史记录在接单前已归档，不能说由接单创建。此为无业务脚本合成流程，工单 status 仍 101、Workflow state 仍 0，不代表生产脚本或分类状态流转已验证。

类型检查及全量 Vitest 287 文件、4326 测试通过；独立 v3 复审通过。当前实例凭据扫描无匹配，新增前端、Java、Redis、Mongo 均正常退出且无强制终止，原 37 文件、旧证据/数据库/服务身份、固定 WAR 和旧详情交接包精确保全。源码逻辑与测试在实证后冻结，仅补充本节文档。实际报告、BSON 审计、同构建证明及截图位于本机私有 `.review/local-accept-history-same-build-v2-http-20261110/`；目录 v2 表示实例版本，实际验证源码为 v3。截图是功能证据，不是 Owner 商业视觉签收。
