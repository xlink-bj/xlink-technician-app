# 跟进记录内的已完成表单只读切片

> **2026-11-09 后续验收更新：本文末尾的真实入口 NOT_RUN 是首次尝试的历史状态。** 随后 `959d5104afd422938a8b0a2d216ff8b7736a2ba0` 接入同一角色实际已有的“全部”菜单，正常 App 已完成“全部 → 已完成工单 → 跟进记录两条表单 → 整页冷刷新”真实本地只读验收。详见 [全部范围及正式证据](R2_AUTHORIZED_ALL_SCOPE_20261108.md)与 [最新收口索引](R1_FRONTEND_INTEGRATION_CLOSEOUT_20261109.md)。原首轮不可达记录保留，不冒称当时已经通过。
>
> `d12b30fbdff81f54e66ac5dcc9259ef910676841` 后续另补已核 Survey 附件数量/类型的只读投影；不是打开、下载、上传或历史编辑。本文较早的“附件不支持”也须按这一区分阅读；未知 file/data 和历史 schema 快照边界仍未解除。

2026-11-08。Owner 已明确新版历史表单位于现有「跟进记录」，不新增页签或独立历史入口。本切片保留原日志，在同一页签内展示来源明确的已完成表单记录项；不把它冒充 Action 日志，不沿用旧 R1 的编辑式查看。

## 已核源码合同

只读旧 R1 `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`，`business/subpackages/serviceAppointment/serviceAppointment.vue`：6198–6237 保留满足 userChoose 角色、handlerIds 用户或 viewableRoleIds 角色的历史节点；1067–1114 查看 forms 引用；10193–10224 旧查看进入编辑式 getFormData；8621–8632 日志点击仅处理 type4 施工日志。历史编辑耦合不是新写权限。索引1建单节点通用查看例外不在本切片推断。

本机既有 Java 源码只读：`ActionServiceImpl.java`44–71 的 type1/type2 分别使用 Note/TenantLog 主键作为 typeId，144–196 的其余类型各用本类实体主键。聚合响应不提供通用的节点/FormDef/FormData 身份。`WorkflowServiceImpl.java`295–300 的 Process 日志仅保存工单 sid、标题和文本；`ExtFormServiceImpl.java` 的表单日志亦不会让 Action 响应自动拥有 FormData 引用。未发 HTTP/DB 请求、未改 Java。

因此不按 activity.id、标题、时间或顺序匹配表单，不扩展 WorkOrderActivity 为未经核实的可点击目标。

## 新能力及边界

- 独立历史只读 factory/reader，每个页面拥有自己的 generation/lease，旧页面卸载不能清除新页面；接口不暴露 action snapshot、完整编辑原文、draft、receipt、完成核验或 command。
- 仅既有显式 DEV loopback 本地真实只读模式启用，两个写开关均 false；Production/Beta/Mock/写授权模式继续关闭。现有共享 evaluateNodeVisibility、normal form reader 和写 action guard 不变。
- 先要求当前 session 角色列表来源，必要时通过正常 listWorkOrders 有界重建；不得用路由、日志或任意 ID 取得权限。
- fresh 工单详情请求 body={}，不用 R1 type=query 可见性绕过。核 tenant/SA/workflow/node 关联及已完成 state10；工作流允许0或10。node 必须真实 forms，权限须有上述明确成员关系；不因 handleUserId 或文字「完成」赋权。
- 完整 formList 有界、去重、验证所有引用/别名及状态。只读 active 引用，删除引用不取值；每条引用使用自身 FormDef，兼容同节点多定义，不强行套用 node 默认定义。
- 点看前重新核权限/完整节点绑定，读取当前有效定义/完整字段页与受限选项 provider；复用 scoped reader 精确读取并复核 FormData tenant/sid/node/run/definition/ID/state，再复核 fresh 详情和完整引用，才展示。
- 已有共享只读字段投影显示标量及已支持选择值。附件/未知规则明确不支持，不触发下载、上传或写入；当前定义不等于历史版本快照，不能宣称还原历史 schema。
- 身份切换、失权、切单、卸载、迟到响应、引用漂移、字段缺页或归属矛盾均隐藏旧值并拒绝。默认/Production/Mock 无 reader 时保留原跟进空态，不出现空白页。

稳定性绑定只包含 Workflow 状态及完整目标节点，不比较整份 SA，因而不把 SA 查询版本漂移当业务变化。既存联合只读证据里3005五个节点各16/17次原文完全相同、无节点_version；3006正常新入口双读尚待实际验证。没有凭猜测剔除节点_version或其它未知字段；若真实读出现漂移先拒绝并调查。

## 验证和交接

聚焦5文件173项通过（新增reader45、真实SFC组件14，保留普通reader56/已有写action39/普通表单组件19）；typecheck通过。架构边界、模块依赖及工程ownership检查通过。初次类型错误原件留本地，没有 skip/xfail。最终联合树全量、MP/App构建、正常App H5及真实角色菜单可达性由协调后的稳定树单独验收，本条不沿用早前绿灯。

本切片源码冻结后尚未运行浏览器、API或数据库操作；真实本机闭环五条 forms 写预算保持耗尽，不重放，不修改后台配置/权限来凑通过。若真实菜单不能自然列出完成单，报告可达性限制，不注入工单 ID 或扩展守卫。商业视觉最终仍由 Owner 审核真实截图。

## 历史条目样式小修与本机验收（2026-11-08）

首版173项及9文件冻结保留，视觉小修仅改历史组件样式与按钮外层对齐容器，不改脚本、reader、权限或入口。实际编译 CSS 显示页面 `.activity-*` 规则带页面 `data-v` 选择器，而历史子组件内部不匹配；修前标题为默认400字重/黑色16px、标题行block、徽标透明，已有正常日志仍为既定时间线样式。组件内显式拥有时间线图标/标题/徽标样式，复用既有tokens，不借父页面样式泄漏；共享按钮保留至少44px触点。

复用已批准只读launcher恢复唯一H5 compiler/proxy，不操作Java/Mongo/Redis。430/375×932真实App、浏览器内全部合成API回应再次6/6通过：两条记录与冷刷新、字段失败显式恢复、错归属拒绝、引用漂移拒绝、失效会话隐藏数据。自动断言标题/徽标/图标计算样式、44px触点和无横向溢出，保留同尺寸修前/后原始截图。所有合成API未转发后台，不能证明实际角色有访问权限；商业视觉未签收。

收到独立1701对象前态及登录ready后，真实本机只读尝试共8个API：正常登录、真实角色解析、正常列表、冷刷新authority及列表重建。实际角色范围是 `type=SANode&orderState=todo`，冷列表完整12/12项均无3006；未直接请求3006详情或FormData，未修改菜单或过滤。历史真实入口及两记录冷回读保持NOT_RUN，不能以合成6/6替代。浏览器关闭，只读服务保留，所有旧业务写预算不动。独立after-Mongo由后台lane核验；源码/index本lane未提交。
