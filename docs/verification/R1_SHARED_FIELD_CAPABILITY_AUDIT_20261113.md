# 共享字段有限能力审计与数字键盘修正

Status: EVIDENCE / bounded audit
Reviewed at: 2026-11-13
Code baseline: `main@48038f309388642390e2a0cd5c7dc43d55a1a4bd`（本批修改前）
Scope（初轮审计）: 现有脱敏配置与固定 R1 的共享字段消费；不读生产、不执行真实保存、不新建字段引擎。角色后续边界见下方跟进。

后续跟进：[当前选定角色有界可见性](R1_SELECTED_ROLE_FIELD_VISIBILITY_20261113.md) 已据协调方补充的库级 active 摘要核证 4/5，并接入可信当前会话与失效源；不开放生产写入。以下初轮样本和测试数字保留为历史记录。

## 1. 证据及“有效”的含义

| 来源 | 实际命中 | 可以证明 | 不能证明 |
| --- | --- | --- | --- |
| [当前 repeat 的 59 行有界捕获](../../contracts/production/technician-role-readonly-20261105/current-formdef-two-pages.json) | file 24、text 10、digit 9、gap 5、phone 2、select 2、UNKNOWN 2、area/datetime/cascade/radio/textarea 各 1 | 同一捕获完整两页 50+9 的字段结构 | purpose UNKNOWN、operationType 未保留可识别值；全部 effectiveInSelectedContext=false 是该投影结果，不证明生产全部不可见/不可填；不能把 59 行称完整当前模型 |
| [第二份 Survey 结构参考](../../tests/fixtures/survey-59-read-reference.json) | showList 含 4 共 40 行：file 22、digit 9、gap 5、cascade/select/data/textarea 各 1；showType=1 共 9、=3 共 31 | 保留的移动详情展示标记、类型及部分配置；支持修复已存在 digit 控件的消费 | `productionEquivalent=false`、`writeAuthorized=false`，不是本轮实时配置；calculateConfig/effectiveWritePermission UNKNOWN，缺省未保留不等于为空 |
| [Order 当前上下文有效 9 行](../../contracts/production/technician-role-readonly-20261105/effective-order-wire.json) | text 3；cascade/radio/phone/digit/button/area 各 1 | 32 行租户配置中的一个上下文有效子集；placeOrder/submitOrder 阶段及服务/客户过滤 | 合成协议投影不是原始完整响应；3 行有未保留配置键；不是通用 extForm 编辑授权，Order 保留独立领域处理 |
| [历史 Survey 61 行](../../contracts/beta/survey/historical.json) | file 24、text 11、digit 9、gap 6、phone/select 各 2，aLink/area/datetime/cascade/radio/data/bizSelect 各 1 | 历史结构、重复键和专用体验参照 | 不能替代活动定义，也不据历史类型数量新建控件 |

本轮没有新生产请求。当前线上完整可编辑配置覆盖率仍 UNKNOWN；上述来源不跨捕获 join 合成 ID。[证据库存](R1_REAL_DATA_MODEL_MOCK_EQUIVALENCE_INVENTORY.md)与[采集限制](../../contracts/production/technician-role-readonly-20261105/README.md)继续适用。

## 2. 展示、输入和存储消费表

固定 R1：[extForm.vue](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/extForm/extForm.vue)、[common.js](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/resources/js/common.js)。此次通过文件读取工具核对固定版本，未将旧前端复制为实现。

| 规则/能力 | R1 / 命中证据 | 新 App 实际消费与边界 | 本批动作 |
| --- | --- | --- | --- |
| 移动详情展示 | extForm 1652–1654：state=1 且 showList 含 4；节点只读名单优先 | [mapper](../../src/adapters/api/read-models/form.ts) → [action schema](../../src/features/work-orders/action-form-schema.ts) → runtime state；不以控件可见推导写权限 | 保持 |
| 数字输入 | extForm 1035–1060：number/digit 按对应原生类型；参考样本移动详情 9 digit | [R1FormFieldControl](../../src/features/work-orders/R1FormFieldControl.vue) 此前未传 AppInput.inputType，number/digit 落为 text；旧 Generic renderer 已传类型 | **仅补正常共享控件的 inputType**；不改变数值 normalizer、字符串事件、权限或 wire |
| phone / IDNumber | R1 phone 输入另有长度 11、保存时手机格式检查；IDNumber 不能按普通数字转换 | 当前 phone/IDNumber 控件保持 text；[通用值处理](../../src/runtimes/dynamic-form/values.ts)仅按字符串 trim，不提供手机格式校验。已核实的[配置记录编辑 controller](../../src/app/r1-configured-record-edit.ts)对 v6 phone 非空值另用 [isR1MobilePhone](../../src/shared/form/r1-mobile-phone.ts) 校验；不能推广为普通表单各入口完整校验等价。共享正常控件没有专门 phone 长度提示，本批不扩展它 | 保持，未宣称所有输入细节等价 |
| textarea / 长度 | 参考样本有 1 移动 textarea，无 min/max/minlength/maxlength 命中；固定 extForm 未发现这些通用配置键的消费 | mapper 解析 root/config 的 min/max/minlength/maxlength，action schema 可保留 presentation；正常 LocalField/repeat/v6 projection 仅传 placeholder，控件固定 maxlength=4000；runtime 不据这些 presentation 实施长度/数值校验。旧 Generic renderer 传 maxlength，不能证明正常宿主已消费 | **记录缺口，不新增推测规则**。4000 不是已证明的 R1 配置合同；尚未声称修复。需字段样例与约束语义补证 |
| 附件 max | 参考样本 surveyDrawing max=1（surveyTool 被省略并有标记）、infraredImageList max=4；历史样本明确 surveyTool=true；extForm 418–420 保留 max=0，2671–2680 有容量检查 | mapper 保留 max；旧 Generic 宿主经 [dynamic-media-policy](../../src/features/work-orders/dynamic-media-policy.ts) 将字段与领域上限取较严值，并用于界面容量及选择检查；正常宿主的[媒体会话](../../src/app/r1-normal-form-media.ts) 与 [file values](../../src/features/work-orders/r1-normal-file-values.ts) 检查合法非负整数及容量，包括 0，仍有十文件协议上限；[来源策略](../../src/app/r1-record-edit-source.ts) 拒绝未证明的工具/配置；surveyDrawing 不是普通默认图片上传就自动开放 | 复核现有回归，无需新媒体实现；max 不能跨类型当文本长度或数值上界 |
| 条件 1/3 | 参考样本 40 移动字段只命中 1/3；R1 common.showType 的 root/EXTS 槽位规则 | [当前配置编辑](../../src/app/r1-configured-record-edit.ts) 仅开放有来源的 Map equals 子集；Survey 历史条件、同键行及其他操作不因此全开 | 保持现有有限条件能力 |
| 角色条件 4/5 | common.js 2488–2675：4 是 roleIds 包含 roleId，5 是不包含；extForm 1802、2796 传 currentRole._id；旧 frontEndConfig.showField 分支有优先级 | 初轮 mapper 拒绝 4/5，初轮样本未命中；后续库级摘要已证实 9 行角色条件，详见跟进文档。不能把用户所有角色、handler 或组织角色当 currentRole._id | 后续仅已证根角色规则与可信当前角色可求值；缺 context、畸形名单及混合旧条件继续拒绝 |
| 特殊类型 | data/gap 在移动参考中命中；area/button 等在其他明确来源命中 | 展示/专用体验/领域处理与可提交 codec 独立；不把 data 当 text、area 当 digit，按钮不自动执行任意动作 | 不新建未证实能力 |

## 3. 字典与 provider 差异

| 来源/类型 | 已证实差异 | 当前约束 |
| --- | --- | --- |
| select/radio/checkbox → Code | extForm 1693–1702 把非 cascade 的 valueOption 绑定 Code；旧源码允许范围比当前新 App 大 | [scoped provider](../../src/adapters/api/r1-scoped-field-options.ts) 精确 tenant/Ext/field/type/provider，selectCode.do 单组 codeId+eleid，options map；不接任意 URL、不把遗漏 provider 当空枚举 |
| cascade → 层级字典 | R1 独立 cascadeCode；当前 Order 保留一个 Code 和一个 Cascade 响应，repeat 59 行捕获只保留 3 个 provider 引用，未读选项 | selectMultistageCode.do，核 type/tenant、节点身份、父子关系、完整树与预算；单路径/多路径有独立合同，不压平成普通单选 |
| bizSelect | 历史 Survey 的 bizSelect 不等同当前 type0 Map 的 projPackage provider | 当前已验证子集限定 type0、projPackage、精确 URL/params/ID-label 来源；不能泛化为所有 typed DTO 或业务字典，见[既有证据](R1_MAP_BIZSELECT_SCALAR_EDIT_20261113.md) |
| Order 阶段配置 | frontEndConfig.showType=placeOrder/submitOrder 是 Order 业务阶段，与 extForm 数字 showType 不同 | [Order 字段映射合同](G4F_ORDER_EXTFIELD_MAPPING_CONTRACT.md)独立；不送入普通数字条件解释器 |

## 4. 最小修改及验证

产品仅 `R1FormFieldControl.vue` 一行，补 `number/digit/text` 的 AppInput 键盘 hint。没有新字段引擎、controller、storage codec 或权限；不改工单详情/客户资料 adapter，不改变 max/长度规则。

- 新实际 SFC 测试：[r1-form-field-control-input.test.ts](../../tests/engineering/r1-form-field-control-input.test.ts)。adapter → repeat projection → 实际控件 template → AppInput 边界，覆盖 number/digit、text/phone/IDNumber 前导零和 disabled。先 3 RED + 3 PASS（数字全落 text），修复后 6 PASS。第一轮自定义 renderer 的 nextSibling 实现错误导致卸载失败，修正测试 harness 后才取得上述产品 RED，不把 harness 错误当产品证据。
- 首轮相关回归 250 PASS：该 SFC、dynamic-form-native-controls、normal-form-media、normal-file-values、configured-file-read-compat、survey-media-actions。包括媒体 max/0、容量限制、来源与未知配置拒绝；是合成/模块结果，不是新真实上传。
- 正常 App H5 430×932 的 configured-record-edit 原 9 场景增加实际 native input type=number 断言；所有业务请求合成拦截，原 ACK/回读、未知结果不重放、配置变化、长表单及只读保护断言保留。最终 9/9 PASS，0 skipped、unexpected、flaky，运行 47.4 秒。实际截图已检查，保存/取消与返回区无重叠，断言无横向溢出；未更改布局或商业视觉验收状态。

最终相关模块回归：11 文件 / **510 PASS**（前述集合有重叠，不叠加）；新增 SFC 10 PASS 包含 showType 4/5 有/无 showField 的四项拒绝反例。`vue-tsc --noEmit`、架构边界、模块依赖及负例自检、ownership、文档相对链接与 `git diff --check` 均通过。H5 实际 App 已由 Playwright 编译并运行；MP-WEIXIN、App 编译通过，MP 发布包 QA/同步注册/WXSS 守卫通过。另复核 Generic 媒体策略与 media-presentation 两文件 10 PASS（独立于上述 510）；没有启动原生工具或设备，截图不等于商业视觉通过。

环境首个 pnpm 调用在自动依赖检查时尝试写 home store，未进入测试；使用现有 `node_modules/.bin/` 执行器完成验证，未安装或更换依赖。H5 结果与截图为忽略产物 `test-results/configured-record-edit/`，不提交生产数据、截图或构建产物。

## 5. 等待补证据的结构

当前有效配置请由已获准的本地线脱敏提供，不用真实记录或私有 ID：

- 字段稳定别名、type、state/showList/operationType/preset/required/multiple，当前节点 fill/readonly；区分“字段存在”“移动可显示”“当前可填”。
- root 与 frontEndConfig 中 min/max/minlength/maxlength 原始类型和值、是否同时存在及冲突优先级；文本计数/数值边界/附件容量各自规则及零/负数/空值意义，不能混用。
- 角色库级结构与会话来源/失效机制已在后续批次核证；仍缺当前登录用户 Customize 过滤后 API 的有效配置明细，不将库级摘要当用户权限。
- provider 类型/稳定别名、请求参数结构、options/tree envelope、是否有动态业务 provider；未保留项显式 UNKNOWN。

本批未访问或写入生产，没有重放旧预约/Survey/Order 保存；不 push，等待协调发布。当前配置扩展、真实业务验证、原生与商业视觉验收仍各有边界。
