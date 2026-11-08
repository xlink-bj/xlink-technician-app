# R2 “全部”与已授权普通工单范围

基线：`cd12c0623aeead112c0e71af87e11d2dadd2c3c3`。本片只补已有前端的列表/历史读取集成，不改五个标签、布局、后台或业务写权限。

## 依据与问题

正常本地登录的 fresh 角色菜单有两个可显示叶入口：先是 `type=SANode&orderState=todo`，再是无 query 的 `/pages/serviceAppointment/serviceAppointments`。原 adapter 总取第一个；页面“全部”还省略 category，因此只看到第一菜单待办，不会使用已授权第二入口。

第二入口的原协议是 `basic/serviceAppointment/query`，`createTime desc`、`state=1`，没有 orderState。后台仍按当前 Account.tenantId、currentUser.sourceTypes、角色 dataAuth 的归属/组织权限限制结果；无 query 不代表全租户访问。一次正常会话下的有界读取返回完整 13/13，包含已完成的本地 forms 工单及两个真实引用。Mongo 后验 1700 精确，唯一正常账号 updateTime 差异。此证据是局部响应/保全通过；诊断脚本末尾误把 Fetch status 属性当函数而中止的记录仍保留，不能标成整脚本 PASS。

旧协议来源：R1 ServiceAppointmentServiceImpl 的 query 数据范围/getDetails、EMongoTemplate 的当前用户/角色数据权限；新 App 继续复用它们，不另写授权引擎。

## 最小实现

- 页面总是明确传递五类 category，包括 `all`。
- 只有显式 `all` 优先使用 **fresh 角色返回、tabDisplay=1、叶节点、精确裸普通路径**；没有此入口时保留首个获准范围，不造入口或 `orderState=all`。
- 省略 category 的旧调用及其他四分类保持首菜单语义；分类仍与原 status 条件取交集。此片不是将五类一并切换到更宽范围。
- 选中的未知/重复 query 键、未知 type、非 SANode 的 orderState 显式拒绝，不丢弃约束后继续查询。
- Production 仍使用只读 `function/queryTreeByRoleId`，不是 changeRole；不发送 tenantId、notFilterBelongTo、notFilterOrgId、type=query 或地理旁路。
- 每次列表重新核角色菜单。分页绑定 category/默认意图、search、pageSize 与菜单协议；菜单漂移不能把普通页与 todo 页拼接。
- 新第一页取得自己的 listed-ID，不继承其他分类/搜索范围的缓存。菜单撤销或最新读取失败撤销旧 listed-ID 及派生权限；旧请求迟到不能重新授予或清掉较新的结果。
- 列表失败清空旧行，从第一页重试；不把失败页追加到旧范围。
- 历史只读 reader 的冷重建明确使用 `category:'all'`，之后仍单独请求正常详情（body为空）与真实节点/记录权限。普通页面导航结果不能替代历史授权证据。
- 普通列表没有真实 workflow-node 证据时，不从标签推导接单能力。真实写、签约、上传和通知边界不变。

## 文件与并行保全

本片涉及 API adapter 的菜单/列表授权小段、list store、历史冷重建一处，以及相应模拟测试。现有详情/布局/bootstrap不纳入。Mac 原22项QA工作保留，adapter中原本的localSyntheticDetailProjection两段不属于本片提交。

## 验证记录

- 变更前：四文件 81 项基线通过。
- 新 scope 专测 33 项、既有角色/store 14 项，共 47/47 通过。
- 联合 `VITE_XLINK_ENVIRONMENT=test pnpm run verify`：全部工程门禁/typecheck通过，272 文件、3566 测试通过。
- 独立审查指出的两种菜单约束静默丢失情况已修复；最后代码复核关闭，没有新增范围扩展。
- 正常 App Mock 分类 H5：375/430 两宽度共4/4通过，覆盖既有五类、搜索、正常详情返回。该套使用原Mock菜单，不能替代新双菜单的真实验收。原默认 Playwright headless 可执行文件缺失导致4例启动前失败，证据保留；使用配置已有的 Chrome channel 在已安装 Chrome 上复验，不安装软件、不改应用断言。
- 新普通范围实际 App “全部 → 已完成工单 → 跟进双记录 → 冷刷新”：PASS。正常登录一次、40次API、0业务命令；正常全部列表13条，沿原详情跟进入口打开两条真实历史记录，DOM note/count与保存值逐项一致；整页冷刷新先恢复authority、不新增登录，再重建授权all来源并精读两记录。blocked/errors均0，无编辑控件，浏览器已关闭。该结果来自正常UI，不复用手工诊断冒称UI通过。
- 独立Mongo后验：1701对象中1700精确，唯一正常账号updateTime变化；全部业务/配置精确，无增删，script/SLA/alert/message为0。后台代码和服务未改。

本地 ignored 证据：`.review/r2-authorized-all-20261108/`。`SOURCE_FREEZE.json` 固定六个代码/测试文件；真实诊断响应见 `.review/second-menu-readonly-01/RESULT.json`（SHA256 `afafa3029fbc08dcc6b75d95373a384538e30228b76e84f683fd3fb299e607f6`）。正常UI证据 `.review/history-all-scope-h5-20261108/actual-01/results.json` SHA256 `f6bfaa765612087ceabd598f47ef61b5eb7910fe485713da015b4b73ca8b0c00`。独立后台结果 `reports/history-all-scope-h5-20261108/FINAL_RESULT.json` SHA256 `508ccc117caf966d062c13fe6ef121ae37082fac5330c2229370e7f2c28bd45b`；后验快照 SHA256 `491ddbdbf72a99de17fa3b0e76abb89bc3f7f208c58c0e7ff91f36323c414243`。原失败、原QA及历史报告不清理。精确提交/CI状态另行记录，不把尚未运行的门禁计作通过。
