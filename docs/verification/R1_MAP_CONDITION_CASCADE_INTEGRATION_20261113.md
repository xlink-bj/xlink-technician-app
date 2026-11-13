# type0 Map 已有编辑：条件与单路径级联

2026-11-13。接续 [checkbox 已有编辑](R1_MAP_EXISTING_CHECKBOX_INTEGRATION_20261113.md)。继续既有 reader → shared runtime/control → controller → 完整原文 codec，不新增引擎、业务写入环境或页面架构。

## 1. 条件读取槽位不是字段写入 preset

固定 R1 `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`：

- `business/resources/js/common.js:2488–2675` 的 `showType`：root 元数据 `showType='3'` 时，`showFieldPreset=1` 从 `formData[showField]` 读取；缺省或 0 从 `formData.exts[showField]` 读取。它与依赖字段自身的 preset **不是同一个事实**。非 preset 依赖可在 root/EXTS 有一致副本，并由条件选择读取 root。
- `business/subpackages/extForm/extForm.vue:1794–1849`：只验证展示字段，然后整份序列化 formData；隐藏不自动等于删除。约 2010 行的另一提交分支不能套用到所有已有记录更新。
- 当前共享 runtime 可解释更多条件，但不是所有条件都与上述 R1 分支等价。例如 runtime `exists` 检查属性存在性，R1 `$exist`/showType=2 还考虑真值和空数组，本批不把二者混同。

本批仅开放 **type0 Map、root 字段元数据、showType=3、单个已声明依赖、非空字符串 equals** 子集。依赖是已支持的 text/textarea/radio/checkbox，原值须可明确解释；不猜数字/字符串宽松转换，不静默 trim 改变条件意义。`frontEndConfig` 条件、`$exist`、角色条件、嵌套路径、同键多行和其他表达式仍明确拒绝。

source 策略保存每条条件的 `fieldId / dependencyFieldId / valueKey / slot`，由正常 reader 私有租约持有并封存。controller 从指定原始槽位检查 own-property 和值：缺槽、未知选项或 root/EXTS 副本冲突不能默认变为隐藏。复制或伪造 storage 描述符不能成为 reader 证据。fresh read 即使展示投影相同，只要条件槽位变化也会撤销旧编辑器。

## 2. 保存与交互

- 用完整候选值（含未修改的只读依赖）调用现有 `evaluateFieldState/normalizeSubmission`；只读依赖参加条件判断不获得写权限。
- 隐藏必填不误拦，重新显示后重新验证；隐藏原值及 opaque EXTS 保留。显式篡改隐藏值在 dispatch 前拒绝，这是新 App 的受控编辑保护，不冒充 R1 服务端规则。
- 可选 checkbox 的 `[]` 和空字符串兜底只作用于当前有效可见字段；隐藏 checkbox 即使初值就是 `[]` 也不能被兜底逻辑误清空或改变。
- R1 `extForm.vue:2549–2550` 的 cascade 完成事件将有序父→子路径写入字段。复用正常 scoped tree provider、共享 CascadeSelector 与路径 normalizer，支持三级及以上单路径；保留树/租户/父子关系、5000 节点和 20 层读取预算。
- 拒绝跨分支、倒序、未知节点及旧 provider 代次。UI 选择叶子；低层 runtime 仍保留合法前缀合同，未声称后台强制叶子。多路径级联尚未开放。
- 取消编辑不保存；未证实的级联显式清空 `[]`/空字符串拒绝，不能把取消、缺省和清空当成同一业务事件。
- 仍为一次同 ID 全原文 upsert；来源、权限、字段、其他记录、正确 ACK 和权威回读均核验。dispatch 前 uncertain、双击去重及重启不重放保持原语义。没有 Process。

## 3. 验证与证据口径

- 独立条件用例 13 条：原 fixture 把控制值只放 root，却省略 `showFieldPreset`。按真实 R1 应读取 EXTS，不能据此证明可见。canonical 用例显式补 `showFieldPreset=1`，保留说明及 `.review/cloud-finite-dynamic-contracts-20261113/map-existing-visibility-controller.test.ts` 原件，不静默改写独立证据。
- 独立 cascade 11 条保留原合同；独立槽位矩阵 12 条包含 4 个槽位正例、只读依赖正/负例、缺槽和冲突反例及 scalar 对照。不能靠拒绝所有表单让负例变绿。
- 本地专项 `r1-map-condition-cascade-edit.test.ts` 22 条：root/EXTS、非 preset 读 root、私有绑定伪造、槽位换代、缺依赖、未知值、隐藏可选数组、合法路径前缀、未知清空和多路径拒绝。
- 最终本地 `verify:full` 为 **332 文件 / 6127 PASS**，包含 12 条独立槽位矩阵；类型、架构、依赖与质量门禁通过。exact-SHA CI 以最终交付结果为准，不借用上游 SHA 的通过状态。
- 真实 App H5 430×932：Map 17 条（此前 7 条选择/日期与新增 10 条条件/级联）覆盖正常工单 CTA、隐藏/显示和编辑内容回填、非 preset 条件读 root、隐藏 checkbox/空数组保全、三级选择、取消重进、provider 换代、丢响应冷启动禁止重放。另回归已有配置编辑 9 条。
- 所有 H5 业务请求严格合成拦截，拒绝外部请求。真实 Java/Production/Beta 保存均 NOT_RUN，之前 N03/N05/Order/旧 A 的已消费授权没有重放。Mock PASS 不替代真实权限、持久化、Workflow 或商业视觉验收。

本地忽略证据：`.review/map-condition-cascade-final-verify-full-20261113.log`、`test-results/map-choice-datetime-edit/`、`test-results/configured-record-edit/`。HTTP 台账、trace、真实 App 截图随 Playwright 保存；截图不提交仓库，Owner 视觉 gate 继续独立。

## 4. 仍未完成

本批不宣称通用 extForm 所有配置已支持。其他条件运算、动态同键行、非 Survey 类型化 DTO、phone/IDNumber/date/time/select 的已有编辑接线、媒体真实副作用、create/updateExts/Process、真实 Order 创建/签约仍按各自合同和安全门推进。Production/Beta 业务写入、上传、签约、消息及 PDF 保持关闭，Issue #201 HOLD 不变。
