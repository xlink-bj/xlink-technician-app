# 工单、预约、Survey、Order：有证据的Mock协议对照

基线为已发布 `df7b755c0ca56ac941a48627753049b20c554639`。本轮不访问生产，不复制个人资料，不修改后台、Mac媒体资产、共享字段控件或真实写入能力。仅修明确的Mock精确查询差异，不扩成全域模型重建。

## 对照及边界

| 当前消费模型 | 证据与当前Mock | 本轮结果 |
| --- | --- | --- |
| 工单 ServiceAppointment | 归档角色列表/详情关联及固定R1主入口；既有分类Mock用合成104/105/202，默认视觉状态另有明确标记。分页、角色范围、节点/run关联已有回归 | 未发现本轮需再改的确定差异，不把合成状态分布或菜单当生产权限 |
| 预约 appointment Map | 真实本地窗口证明Map存储与完整原文；当前Mock三字段是有限合成配置，不是完整生产配置。当前精确reader实际发送rows=2及工作流/工单/节点过滤 | 原Mock只按ID返回，固定rows=20，忽略其他已知条件；修复精确分支 |
| Survey DTO | 固定后台与历史Beta结构、typed属性及已归档有限真实保存；当前生产repeat捕获不能仅因名字认作Survey，历史61行也不等于当前生产模型 | 同一Mock精确查询缺口已修；不改字段类型、root/EXTS值、媒体或当前schema声明 |
| 正式/报价 Order | 归档有界type1/合同关联及9字段有效子集；Mock已有type区分、工单关联和bjProducts JSON字符串wire | 未发现本轮需改的确定差异。保留unsupported行、快照价格及独立权限，不制造SKU或重算历史金额 |

来源：现有 [F01–F21库存](R1_REAL_DATA_MODEL_MOCK_EQUIVALENCE_INVENTORY.md)、[生产投影说明](../../contracts/production/technician-role-readonly-20261105/README.md)、[真实本地对账](R1_LOCAL_REAL_INTEGRATION_EVIDENCE_20261113.md)。生产投影均为脱敏合成关系，不是原始业务响应；跨捕获ID不join，字段缺项不补造。

## 精确差异与最小修复

固定后台 `xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e` 的 `ExtFormServiceImpl.java:76–117` 按定义选Map/预置collection，最终调用findByPage；`EMongoTemplate.java:468–489,605–641,803–831` 处理请求条件后计数、分页。Survey还存在来源类型/节点等额外分支，本次不声称全部服务器授权模拟。

当前 `r1-scoped-form-read.ts:90–110` 精确读取发送 `_id + sid + nodeId + workflowId + ne:state`、page1/rows2，要求返回分页一致。原Mock预约与Survey分支忽略后三类引用、state和page，固定rows20，既可掩盖错误关联，也使正常reader拒绝合法记录。

只将两个 `is:_id|string#and` 精确分支接入已有 `queryMockR1FormRows`，复用Repeat的已知条件/分页子集。按定义挑选候选及Mock ownership边界不变；无精确ID的旧分支、预约旧id别名、写入、表单字段和完整原值均不改。未知条件继续明确拒绝，不开放任意过滤器或当作服务器ACL。

## 验证

- 新增22项：完整FlipInfo页形状及不改原文；sid/node/workflow交集、state排除、空后页和total；无效页长、page、_all、未知条件拒绝；实际scoped forms reader发现及独立选取。全内存合成执行，无HTTP/Java/Mongo。
- 原实现的首批20项均RED。接线后发现4个断言未列helper既有size/dataCount/pages，已改为显式检查完整分页字段，未删除断言或放宽实现。
- 新增与已有Repeat、四模型、Mock保存/Process及scoped reader回归合计6文件/79项通过；类型、架构边界及机器映射结构检查通过。新测试挂到F06/F07/F09，liveParity及未知项不升级。
- 按机器映射去重执行50文件/690项通过，使用与CI一致的 `VITE_XLINK_ENVIRONMENT=test` 及现有Vitest程序。首轮未提供该环境时目录5项按unknown环境关闭，已作为运行准备错误纠正，不改目录实现或守卫。没有调用会触发依赖重装的pnpm启动器。
- 测试编译内存中恢复两个旧Mock返回分支，新增22项全部失败；磁盘产品源码未回退，确认回归能检测原差异。
- 正常App合成H5 3/3通过：430×932预约草稿恢复，以及375/390保存表单→本机Workflow→既有商业Mock旅程。仅本机devserver网络，真实签署/生产写入均未执行。Stage2D的独立保存等待修正另行提交，不混称本次协议修复。
- 本轮没有新增真实保存、生产权限、完整字段配置或四模型端到端通过声明。日志在 `.review/non-media-closeout-20261114/`；H5/精确CI按各自实际运行独立报告。
