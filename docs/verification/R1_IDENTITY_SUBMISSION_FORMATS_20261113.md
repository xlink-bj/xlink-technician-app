# 普通表单 phone / IDNumber：明确提交与 saveOnly 的格式边界

Status: EVIDENCE / bounded implementation
Base: `ea499b1015517ce8e8da848c5a3c491eb8618e28`
Reviewed at: 2026-11-13
Scope: 普通表单的当前可编辑提交值；无生产请求、真实保存、数据修复或权限扩张。

## 固定 R1 调用语义

固定 [serviceAppointment.vue](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/serviceAppointment/serviceAppointment.vue) 的 `checkMobile` / `checkIDNumber`，以及 `saveForm` 已实际读取。此次文件读取的行号分别为 5862–5878、7114–7185（其他固定文件副本可能有不同换行/行号，方法名为定位锚点）：

- `saveFormConfirm` 区分提交与保存表单；`saveForm('saveOnly')` 跳过位于 `type != 'saveOnly'` 内的必填、phone 和 IDNumber 格式检查，也不因此执行普通 Process。
- 正常提交对 truthy phone 调 `checkMobile`，对 truthy IDNumber 调 `checkIDNumber`。规则不是登录/拨号校验。R1 RegExp.test 对标量进行字符串比较，不修改原值。
- 独立 [extForm.vue](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/extForm/extForm.vue) 的 `saveFormData` 1793–1839 在可见且未 mpDetailHide 的范围检查非空 phone；这个独立页的保存检查不能自动推广成工单 saveOnly。未据此宣称新 App 已重建该独立页全部语义。

IDNumber 采用固定 R1 原正则：历史 15/18 字符形状、末位 X/x；**不是校验码算法或身份核验**。保留原规则对月/日零值、非真实日历日、`[0|1|2]` 字符集合等历史边界，不增加地区码、生日真实性或校验位限制。合成测试使用虚构区域前缀 99，不表示真实证件或真实人。

## 新 App 调用链与最小修复

- Generic：`GenericDynamicFormActionContent` → Workspace `saveDynamicForm`（保留 save-only）/ `completeDynamicForm`（明确完成）→ [normalizeDynamicForm](../../src/features/work-orders/dynamic-form-action.ts)。此前两者只调用通用 trim/必填/类型处理，没有 phone / IDNumber 格式检查。本批仅完成路径使用 `intent:'complete'`，canSubmit 采用同一完整校验，直接调用命令同样无法绕过。
- 正常 forms：[R1NodeFormsReadPanel](../../src/features/work-orders/R1NodeFormsReadPanel.vue) → provider → [r1-forms-actions](../../src/app/r1-forms-actions.ts)。已有编辑 `saveAndComplete` 在 fresh read、原文/权限及已有 normalizer 后检查当前 draft，失败发生在任何 upsert/EXTS/Process 之前；`saveOnly` 和不携编辑值的独立 `complete` 保留既有语义，不扫描历史记录强加新校验。
- 共享 [action-identity-validation](../../src/features/work-orders/action-identity-validation.ts) 仅处理当前参与提交的 phone/IDNumber：可支持、可见、可编辑、存在且 truthy。workflow readonly 同样排除。完整能力、必填、来源与写资格仍由既有 runtime/controller 执行；它不能授予权限。比较不 trim、不赋值；零/false 的 R1 truthy 边界不被新增检查改变，但其他既有类型/必填验证仍适用。
- phone 复用既有 [isR1MobilePhone](../../src/shared/form/r1-mobile-phone.ts)；IDNumber 用新增 [isR1IdNumber](../../src/shared/form/r1-id-number.ts)。仅为 R1 的 RegExp.test 标量比较转换 number，不改 editor/draft 对象；不把任意对象当字符串。Generic 输入事件保留未完成 phone/IDNumber 字符串，避免边输入边 trim 把非法值变合法；通用 normalizeFieldValue 和现有 save-only 输出归一化未全局更改。
- 专用预约：深入检查 [appointment replacement](../../src/features/work-orders/appointment-replacement-values.ts) 后，确认任意 `contact` 等额外键已拒绝。不能用不成立的扩展 fixture 声称已有可提交联系方式缺口；本批不放开六键协议、不修改预约专用保存器。回归保持其拒绝未知键。
- [v6 已有编辑](../../src/app/r1-configured-record-edit.ts) 原有 phone 检查保持独立；它是此前隔离 save-only 能力的较严边界，不由本批推广或移除。IDNumber 的 v6 save-only 不因工单完整提交规则而新增检查。更多类型化路由继续按现有授权与 codec 限制。

## 验证

- [action-identity-submission.test.ts](../../tests/engineering/action-identity-submission.test.ts)：纠正专用预约 fixture 前提后，修改前 5 RED / 6 PASS，明确暴露非法格式及提交前 trim 接受；修复后另补输入字面、标量 truthy 和 ID 原正则边界，共 14 PASS。未把初次错误预约 fixture 的拒绝归类为产品缺陷。
- [eq07-command-state-consistency.test.ts](../../tests/engineering/eq07-command-state-consistency.test.ts)：新增两类字段 save-only 成功、明确完成零命令、纠正后一次完成，以及历史只读通过；18 PASS。首次新增 fixture 漏 purpose/definitionId 被入口正确拒绝，补齐真实契约后通过，未改入口守卫。
- [r1-normal-forms-existing-actions.test.ts](../../tests/engineering/r1-normal-forms-existing-actions.test.ts)：新增两类字段“保存并完成”非法值零命令、同值 save-only、合法字符串正常 upsert→EXTS→Process；45 PASS。均为合成 transport，不访问 Java 或数据库。
- 以上加 scalar-subset、复杂字段闭环和原生控件，首轮 6 文件 / 137 PASS；最终补充检查与 H5 结果在交付注明，集合有重叠不累加当独立覆盖率。

本地真实 App H5 使用专用 [identity-submission.config.ts](../../config/playwright/identity-submission.config.ts) 和 [identity-submission.spec.ts](../../tests/h5-main-mock/identity-submission.spec.ts)，430×932，正常登录/列表/工单/Workspace，业务请求严格合成拦截。最终 2/2 PASS，12.6 秒，非法明确提交零命令、相同值 save-only 保留；没有 Process、外连或页面错误。首轮误断言 Panel 会透传格式文案，而现有 Panel 统一显示保存未完成/待核实；调整为实际 UI 文案并保留零命令、fresh reread 和正常 save-only 断言后全组通过，未修改 Panel、增加重试或放宽超时。结果与截图在忽略的 `test-results/identity-submission/`，不作为生产、设备或商业视觉验收。

## 后续角色证据（独立范围）

协调方随后提供 Production **库级 active 元数据摘要**：ServiceAppointment 74 行（25 preset、49 扩展），showType 1/3/4/5 为 64/1/5/4；含 4 的 showList 共 26 行：datetime3/select5/file2/text11/textarea1/area1/map1/cascade1/phone1。角色 4/5 共 9 行的 roleIds 均为非空字符串数组，解析后 frontEndConfig 无 showField/showValue；calculateConfig 解析后均为空。Contacts 13 行 showList 均不含 4，没有角色 4/5。

这是协调方本地只读摘要，本执行者未读生产库、未持有原始行。不能称当前登录用户 Customize 后 API 全量返回、用户可填写或写授权。它将角色能力从“旧样本未命中”推进为“库级真实命中，需绑定可信当前角色并保持缺失/畸形上下文拒绝”；具体共享实现和当前角色撤销验证另批记录。area/map 由本地资料只读线核证，本批不据类型名新增控件。
