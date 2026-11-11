# 动态表单 Radio 单值合同（2026-11-11）

R1 `xlink-app` 固定提交 `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` 的 `business/subpackages/extForm/extForm.vue:316–342` 使用单值 `van-radio-group`。后端固定提交 `5fc008d32e771205260f120621c1c4fc62d0824e` 的 `ExtField.java:33` 将 `multiple` 注释限定为 select/cascade。radio 不因错误 `multiple=true` 配置获得多选语义。

共享 `values.ts` 在字段值校验中拒绝任何 radio 数组（包括 `[]` 和单元素数组），不隐式解包；对 `radio + multiple=true` 保守报 validation 错误。提交层在适用性、展示型字段和可见性判定后、缺值跳过前检查该合同，避免选填空数组或错误配置缺值被忽略。

- 隐藏且未请求保留的字段继续排除；`preserveHiddenValues=true` 时，参与提交的隐藏值必须合法。
- 不适用于当前界面及展示型字段继续排除。只读的正常已存单值继续保留，缺值不触发必填；只读不允许非法数组参与提交，也不解除编辑限制。
- 正常单值保持原类型；Select/BizSelect 多选和 Checkbox 数组规则不变。选项来源、必填、Workflow 只读以及 forms/repeat 受限能力边界不扩大。

新增 `tests/engineering/dynamic-radio-scalar-contract.test.ts`：49 例覆盖真实导入的 `normalizeFieldValue`、`normalizeSubmission`、`normalizeDynamicForm`，并对照现有受限 forms/repeat 值校验。修复前 21 例失败，修复后 49 例通过；受影响回归 23 文件 / 466 例通过（包含新增 49 例），类型、架构边界、依赖检查通过。

这些是纯合同与本地静态检查结果，不是 provider/授权/UI 可达性、实际保存或生产写入证明。原有多项数组错配尚无证据构成真实写入漏洞；选填 `[]` 曾被省略也不等于数组已写入。此次未启动服务、运行 HTTP/H5/原生验收或执行业务写入；未提交或推送，等待独立审查后整合。Issue #201 的 Production/Beta 写入保护不变。
