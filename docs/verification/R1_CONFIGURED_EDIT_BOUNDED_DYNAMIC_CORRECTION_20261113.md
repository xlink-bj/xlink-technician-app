# 已有配置记录编辑：有限动态能力纠偏

2026-11-13。接续 [三模型真实集成记录](R1_CONFIGURED_MODEL_REAL_INTEGRATION_20261113.md)，本批修复新增编辑资格层的过度拒绝。它不是全域动态表单验收，也不追加任何真实保存授权。

## 1. 依据与分层

- R1 固定前端 `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` 的 `business/subpackages/extForm/extForm.vue`：按 ExtField 渲染，节点 `formFieldIdsReadOnly` 控制只读；switch 使用 `1/0`；保存整份 `formData` 到 `biz/extForm/upsert/{formDefId}.do`。没有“字段超过一个查询页就整表禁止”的业务规则。
- 后端固定 `xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e` 的 `ExtFormServiceImpl.upsert`：Map 与类型化 DTO 是不同存储策略；已有记录的完整原文不能用 UI 投影重建。本批不改该协议或 Java。
- 当前 normal reader 已完整分页校验最多 200 行 ExtField，每页 50 行；共享本地字段投影和 preset storage 也已有 200 行预算。原新增编辑层和 v6 grant 的 50 行限制与这些既有预算不一致。
- `read-models/form.ts` 已映射 `frontEndConfig.placeholder`；该键仅影响提示文字。未知校验、动作、脚本、条件配置不能因此被忽略。
- 权限由正常角色列表、当前节点、handler、明确 grant、私有 reader lease 决定；控件支持、原文保全和写入权限是不同的判断。只读值不需要拥有可编辑 codec 才能原样保留。

## 2. 实际修改

| 问题 | 修正 | 保留的边界 |
| --- | --- | --- |
| 51 行表单被整表拒绝 | v6 已有配置记录编辑对齐既有 200 行预算，正常读取所有页 | 201 行、缺页、total 漂移、重复字段身份/存储键继续拒绝；记录数量仍最多 50，不与字段预算混淆；旧版 grant 仍 50 字段 |
| 非空 frontEndConfig 一律拒绝 | 仅允许字符串 placeholder，经普通 `projectR1RepeatFields` 传入共享输入控件 | 未知键、错误类型、verify、动作和 mpDetailHide 等尚未纳入此编辑策略的配置继续拒绝；不宣称全部 frontEndConfig 已支持 |
| 只读 switch 阻挡合法 text 编辑 | Map 中节点明确列为只读、共享 runtime 已认识且无其他不支持配置的字段，只保留完整原文，不进入写补丁 | 仍禁止改动只读值；未知类型、条件、presentation-only、未知配置不因此获准；不是所有复杂只读字段均已验证 |
| 已有编辑下游仍限制 50 个补丁键 | 有真实已有记录身份和完整、唯一字段存储键时，编码器支持最多 200 个声明键 | 新增记录和无存储元数据的补丁仍 50；较大补丁缺键、重键、超过预算、身份冲突继续拒绝；编码器本身不授予权限 |

没有新建表单引擎或业务专用页面；没有改变 accepted CSS、订单价格、Workflow、媒体上传或真实写入开关。placeholder 当前通过 normal Repeat 投影交付；不宣称 DEV 本地预览投影等所有入口已同步。

## 3. 本地验证

- 修复前本批集成反例：5 RED、7 PASS；分别暴露分页字段预算、placeholder、只读 switch。后续发现下游补丁预算阻断，修复完整链路。
- `r1-configured-record-edit-limits.test.ts`：15 PASS。包含 51/200 个可写字段**全部实际改变**并序列化、完整分页、201 行/缺页拒绝、旧 grant 限制、新增/无配置补丁预算、未知配置、只读 switch、只读 checkbox 数组保存与篡改零命令、Map root/EXTS 冲突。
- 现有配置编辑及 Map choice/datetime 与新增用例合计 77 PASS。另周边已有预约、Panel、文件生命周期和 wire 回归 169 PASS（集合有重叠，不相加当成独立总数）。身份/字段只读/provider 变化、保存丢响应、错误 ACK、回读丢值、双击和持久不确定保护继续通过。
- 协调方提供的独立 source 反例在最终产品字节上复核 9/9 PASS；保留独立来源，不将其称为独立整树回归。
- 本地 `verify:full`：326 文件 / 6036 用例 PASS，类型、架构、依赖、质量检查 PASS；之后仅新增两项预算/副本反例并补强测试，最终针对性 77 PASS。最终提交的完整 CI 结果另按 exact SHA 核验，不能把上游 SHA 的 CI 算作本提交通过。
- 真实 App H5，430×932：配置编辑 9 PASS，Map radio/datetime 2 PASS；覆盖 normal 登录/列表/工单/表单、取消重进、已保存读取、51 行分页＋只读值保全、未知配置变化零写、丢响应/错误回读后重进仍禁止重放。所有业务请求由 Playwright 严格合成拦截，外部请求被拒绝，Java 与 Production 写入均 NOT_RUN。
- 首轮 H5 的两项新断言错把 uni-app 绘制的 placeholder 当成原生 textarea 属性，失败 trace/截图已保留；改为清空输入后断言用户实际看到的提示层，再全组重跑通过。没有提高超时、增加重试或删除失败路径断言。

GitHub H5 gate 已增加上述两个配置编辑套件，并上传对应结果、trace 与截图。跳过的事件专用 job 不计 PASS。

## 4. 本地证据与截图检查

以下均为合成数据、本地忽略产物，不提交截图：

- `test-results/configured-record-edit/results.json` 和 `attachments/`：最终九条路径、HTTP 台账、viewport 截图与 trace。
- `test-results/map-choice-datetime-edit/results.json` 和 `attachments/`：现有 radio/datetime 两条回归。
- `.review/configured-edit-limits-red-h5-20261113/`：首轮两项 placeholder 断言失败原始证据。
- `.review/configured-edit-limits-verify-full-20261113.log`：本地完整回归。
- `.review/cloud-finite-dynamic-contracts-20261113/`：独立 source 反例与本机复核配置。

检查实际 App 的字段区、placeholder、长表单底部保存/取消与返回按钮：430×932 无横向溢出，底部主按钮与返回区不重叠。只读字段在编辑期仍使用现有不可编辑提示；长表单信息组织和商业视觉精修尚未专项验收。`CODE_PASS` 不等于 `COMMERCIAL_UI_ACCEPTED`。

## 5. 下一批有限动态缺口

1. 按 R1 已证实的普通字段 wire 接入已有编辑层的 checkbox、cascade、单选与其他 scalar 控件；复用既有 provider、runtime、控件注册和 storage codec，不新建引擎。只读保全通过不等于已验证可编辑数组。
2. 条件字段需同时核实显示、必填、隐藏值保留/清除、同键多行及动态权限；禁止只删除 `field.visibility` 拒绝条件就宣称支持。
3. 非 Survey 类型化模型须逐一有 DTO 保全依据，不能把 typed 路由当任意 Map。媒体及业务特殊交互继续走专用适配，与通用字段层分离。
4. 现有三个真实样本及 Order 一次性保存预算均已消费；本批没有重放，也不据合成测试宣称真实保存、Process、PDF、消息或生产写入通过。Issue #201 HOLD 不变。
