# R1 当前选定角色：有界字段可见性

Status: bounded implementation / synthetic verification
Date: 2026-11-13
Local parent: `d6a3b1ccb5b54b11f7eb157c8304dd436fedb890`
Scope: 根 showType 4/5 的共享表达、可信当前角色读取及只读展示；不开放生产写入。

## 证据与适用范围

固定 [R1 common.js](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/resources/js/common.js) 的 `showType`（2488–2676）由前轮独立核证：旧 frontEndConfig.showField 分支先执行；无该分支时，根 4 为 roleIds 包含 roleId，5 为不包含，均不要求 showField。[工单页](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/serviceAppointment/serviceAppointment.vue) 从 `wx.getStorageSync('currentRole')._id` 读取当前切换角色（协调方定位 6022）；不使用所有角色集合、handlerIds 或组织角色。

以下是协调方提供的生产只读**库级 active 元数据摘要**，本执行者未读生产库、未持有原始行，不把摘要称作当前用户 Customize 过滤后的有效 API 配置：

| 对象/范围 | 已核摘要 | 本批含义 |
|---|---|---|
| ServiceAppointment 全库 active | 74 行：25 preset、49 扩展；showType 1/3/4/5 为 64/1/5/4 | 4/5 有真实库级命中，不能继续称完全无证据 |
| 其中角色 4/5 | 共 9 行；roleIds 均为非空字符串数组；解析后 frontEndConfig 均无 showField/showValue | 本批支持该根角色规则子集；不是写授权 |
| showList 含 4 | 26 行：datetime3/select5/file2/text11/textarea1/area1/map1/cascade1/phone1 | 不据类型名新建 area/map 控件；本地对象资料线另核其语义 |
| calculateConfig | 解析后全部为空 | 不宣称当前命中任意计算规则 |
| Contacts | 13 行，showList 均不含 4，没有角色 4/5 | 不开放客户资料字段 |
| 历史 Survey 脱敏 fixture | productionEquivalent=false，showType 仅 1/3 | 保留其有限证明力，不据此代表生产完整配置 |

## 输入输出合同与拒绝规则

[mapper](../../src/adapters/api/read-models/form.ts) 只把已证根规则归一化为：`visibility:{kind:'role',mode:'include'|'exclude',roleIds:readonly string[]}`。roleIds 必须为 1–200 个互异、非空、无首尾空白/控制字符且长度不超过 256 的字符串；缺失、空名单、标量、混合类型、重复值均拒绝，不做字符串强转。原始 frontEndConfig 畸形或含 showField/showValue/showType 键时拒绝；不通过退回根角色规则绕过旧分支优先级。边界比旧 JS 宽松错误处理更保守，未声称支持所有历史配置组合。

[共享 context](../../src/shared/form/selected-role-visibility.ts) 是只存在于内存的冻结对象，WeakMap 绑定可信 live source；序列化、复制同形对象或放入 FormData 都没有来源资格。它只提供当前选定 roleId，不是写 grant。内部 API：`createSelectedRoleVisibilityContext(read)`，read 返回 `{sessionKey,roleId}` 或 null；公开字段为 `roleVisibilityContext?: SelectedRoleVisibilityContext`，端口与 schema 传递对象本身，不序列化它。

[正常 reader](../../src/app/r1-node-forms-read.ts) 只在已有会话读取成功后签发 context：当前 sessionRef/userId/所选 roleId/roleVersion fingerprint、reader generation、当前用户列表成员资格均须持续相符。角色切换、会话替换、clear、重读换代、工单退出列表后，旧 context 不再返回角色。已观察到的失效永久撤回该 context；新的有效读取签发新 context。单独 helper 不声称发现两个求值之间未观察到的瞬时切换；正常 UI/reader 生命周期和 generation 仍负责缓存清理。

[runtime](../../src/runtimes/dynamic-form/visibility.ts) 对 4/5 分别执行成员/非成员判断。**缺可信角色不会按 5 的“不在名单”显示**；unknown 返回 unsupported、隐藏且只读。根 showField 不参与该已证角色规则。现有 surface、字段 readonly、workflow readonly、provider 和类型支持仍独立生效。

## 展示、提交与权限边界

[action schema](../../src/features/work-orders/action-form-schema.ts) 把 context 送入 evaluateFieldState；record 展示、local field 投影、Generic/预约直接 visibility 调用都沿同一合同。不同 fieldId 同 name 保留为不同展示行，不按 valueKey 去重；各自角色条件独立求值。原有重复键一致性/可写性守卫不变，角色显示不代表重复键可任意写入。

普通创建 plan/draft 显式拒绝 role 表达式；[v6 existing edit](../../src/app/r1-configured-record-edit.ts) 的版本、合成范围、recordIds、active/repeat 与已证字段子集限制保留。回归证明即使角色允许，真实正常 reader 的该 v6 provider 仍不提供新增写能力。专用预约六键、typed DTO、root/EXTS codec、日期规则、媒体来源、保存与权威回读均不变。对象资料 adapter 若消费这一合同，须自己提供可信会话/失效源；仅接入 mapper 或字段 API 不会自动显示角色受限值。

角色与 identity 的交叉链为 `actionIdentityFormatIssue → actionFormSchemaFor(field) → evaluateFieldState(schema)`，context 在 schema 上传递，并非 values 参数。新增正常控制器合成回归覆盖 include/exclude 允许时非法 phone/ID 的明确提交零命令；缺 context 时，完整 normalizer 先拒绝，不能因格式 helper 跳过 unsupported 字段而绕过。该最小 reader fixture 验证共享控制器组合，不代表上述 v6 或生产路由新获写资格。saveOnly/历史只读语义仍见 [identity 边界](R1_IDENTITY_SUBMISSION_FORMATS_20261113.md)。

## 验证与剩余边界

- 初轮实现前角色相关用例 7 RED / 12 PASS，暴露 mapper 全拒绝与 reader 缺可信角色路径；此前记录保留，未把所有历史类型作为需求。
- 本轮四文件 200 PASS：role-field-visibility 26、normal-node-forms-read 121、r1-configured-record-edit 43、r1-form-field-control-input 10。覆盖 4/5 四象限、畸形名单/配置、伪造/序列化 context、角色/会话/clear/重读/列表失效、同名多行及只读不变。
- 交叉补测：正常已有动作 49、identity 函数 14、角色 26，共 89 PASS（与上述有重叠，不累加）。新增四个参数化测试覆盖两类型、两个允许模式及缺 context 的零命令。
- 真实正常 App H5：5/5 PASS，24.1 秒。当前角色 r/other、非法名单、旧条件混合、同浏览器退出再登录另一角色并重新读取配置两次；无编辑入口、业务写命令、外部请求或页面错误。使用 [专用配置](../../config/playwright/role-field-visibility.config.ts) 与 [用例](../../tests/h5-main-mock/role-field-visibility.spec.ts)，本机仅通过已有 Chromium executable override 指定系统浏览器。

生产当前用户有效 API 配置与最终资料展示仍需本地线核对；库级命中不能推导当前用户返回或写授权。不执行真实保存、已消费记录重放、Qiniu 上传、签约、短信或付款，不宣称设备、商业视觉或完整连续签约闭环通过。本批不推送；精确提交与最终检查见交付。

最终完整单测 `VITE_XLINK_ENVIRONMENT=test node_modules/.bin/vitest run`：346 文件 / 6438 PASS，exit 0。角色 H5 命令为 `VITE_XLINK_ENVIRONMENT=test VITE_XLINK_R1_MP_UX_FIXTURES=false XLINK_REPEAT_APPOINTMENT_CHROMIUM=/usr/bin/chromium node_modules/.bin/playwright test --config config/playwright/role-field-visibility.config.ts`，exit 0。`vue-tsc --noEmit`、boundary、module-dependencies（含负例自检）、ownership、config-layout、M1 I8、UI governance、YAML 解析、相对链接与 diff whitespace 检查通过。此前 CI 草稿中 phone/ID 的入口另外保存在忽略证据中，未混入角色提交。
