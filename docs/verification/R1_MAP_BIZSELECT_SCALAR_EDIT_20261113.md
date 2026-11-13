# type0 Map 已有记录 bizSelect 单值与 Label 协议贯通

本批基于 `8759ec0422c3cd8e752efa50c1c6a8f56ea9482a`，仅补齐已有配置记录的一种有来源业务选择。字段名、顺序和条件仍由 Ext/ExtField 决定；不新增固定业务表单、报价规则、生产授权或第二条写入通路。

## 源码与能力边界

R1 权威固定于 [`xlink-app@6c0a97b`](https://github.com/xlink-bj/xlink-app/tree/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d)。`business/subpackages/extForm/extForm.vue:2492–2503` 读取配置的 URL/params，按 label/value 键映射选项；2910–2913 的普通点击写入 scalar ID 和根级 `${field}Label`。通用 `saveFormData` 序列化完整表单。独立的 submit 路径对非预置字段复制值至 EXTS，不构成 Label 也应镜像至 EXTS 的证明。typed Survey 的列表语义、其他选择入口和 Order 价格语义不能混用。

当前仅支持 `Ext.type=0`、已获准的已有记录编辑及精确 `projPackage` 绑定：`biz/projPackage/query.do`，`label=name`，`value=_id`，配置 `_all=1`，以及已验证的可选字面 `in:serviceType|array#and` 过滤。请求由固定适配器构造并添加当前租户和激活条件，不执行任意配置 URL，不替换成报价的 `queryWithRank`。选项响应须完整、唯一、同租户、激活且字符串 ID 可验证；不筛掉坏行后假装成功。

历史 `multiple=true` 元数据不覆盖此入口已证明的单次点击 scalar 协议。适配投影为单选，原始元数据仍保留在来源指纹中，不改造成数组保存。未知清空、类型化模型、计算规则、任意参数/脚本继续拒绝。

三个已观察配置的 `calculateConfig` 均是 JSON 字符串 `{}`，含零规则；不能按非空字符串误报存在计算。只有空壳允许，非空/损坏/数组/布尔/数字配置拒绝。R1 此入口只消费 url/params/label/value；顶层 errorMsg/sortField/sortOrder 仅接受有界字面字符串，不变成请求参数、本地排序或可执行错误处理。

## 编辑与保全

- 共用正常 reader、当前身份/节点/字段授权、现有原文 serializer、同 ID 保存及回读回执；字段和选项变化使旧能力失效。
- 改选后 Label 仅由同一读取代际的已验证选项派生，禁止调用方提供任意 Label。普通单值字段保持原有 root/EXTS 槽位；Label 只写已证明的根槽位。
- 显式选择新项再选回原项，仍应按 R1 更新该项 Label；完全没有操作的字段在保存其他字段时保留历史 Label。选择意图只存在于本次记录编辑周期，不形成新草稿/持久队列。
- 选择事件按当前待提交草稿判断可见性和只读状态；验证成功后值与意图一起提交至编辑器。事件拒绝由 Panel 捕获，保持原值，不泄漏 Vue 错误或触发命令。
- 即使选择字段只读，其派生 Label 与真实可写字段重名也须写前拒绝，不能等错误写入后再靠回读发现。保留其他字段、未知原文及同节点兄弟记录。
- 保存不等于 Workflow 完成。回执丢失后，冷启动只读核对保留不确定锁，不自动重放；身份变更不得沿用旧编辑内容/能力。

## 验证口径

本地 `verify:full`：341 文件、6336 测试通过，包括原先未提交且本批保留的20项独立媒体测试；本批提交集合对应340文件、6316测试，不能把未提交20项计入 CI 承诺。独立 bizSelect/controller 验收为66项（含本批52项模块测试）。三端构建 H5/MP-WEIXIN/App 通过，仅构建，无原生启动。

实际 App H5 固定430×932，所有 API 使用明确合成夹具并拒绝额外网络。业务选择5条 CI 场景覆盖正常保存、取消、保存前选项失效、显式选回原项及条件从隐藏变可见后的往返选择；同时断言页面错误与 Vue 控制台错误为空。独立相同控件反例及生命周期用例另保留本地证据：一次保存丢失 ACK 后冷启动不重放、注销/新会话后旧 Workspace 拒绝接管并经页面返回详情恢复、未操作字段历史 Label 保留。

最终本地 H5 共55条通过：本批 CI5、独立原反例4、独立条件往返1、生命周期3、已有图片上传8、保留附件6、既有选择/条件/级联/其他标量/默认控件28。均无跳过或重试；这些用例验证合成协议和实际 App，不是 Java/Qiniu 或生产写入验收。

原 readonly Label 重名、原项重选和条件重选三个反例的失败日志及修复后结果均保留在本地 `.review/bizselect-independent-acceptance-20261113/`。其中一次测试自身误定位到多个按钮、一次误认为注销后直接出现快捷登录卡片，已修正测试流程并保留原始失败；旧会话工作台的隔离拒绝须按页面实际返回详情后重进，不能跳过保护。

此处 `SOURCE` 与 `DEV_MOCK/H5` 通过，不等于生产 provider、真实当前 actor/role/node 绑定或 Java 持久化通过。生产三个配置仅有元数据形状证据；Production 读取白名单仍拒绝本批新请求形状，Production/Beta 写入、上传、PDF、消息、签约和 Workflow 副作用继续关闭，Issue #201 HOLD。原生与商业视觉签收均未执行。
