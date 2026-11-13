# type0 Map 已有记录 checkbox 协议贯通

2026-11-13。接续 [已有编辑过度限制纠偏](R1_CONFIGURED_EDIT_BOUNDED_DYNAMIC_CORRECTION_20261113.md)。本批范围是正常工单入口的已有记录编辑，不是新建流程、类型化 DTO 数组或全域动态表单验收。

## 依据及实际行为

R1 固定前端 `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` 的 `business/subpackages/extForm/extForm.vue`：约 345 行按 checkbox-group 渲染；`onChange` 约 2344 行将 `e.detail` 直接赋给字段；`saveFormData` 约 1794–1849 行只校验展示字段，再序列化完整 formData。因此 checkbox 数组顺序和显式 `[]` 不能被编码器擅自改写成目录排序或省略。

- 仅 type0 Map source 策略增加 checkbox；复用正常 scoped Code/inline options、共享 runtime、完整原文读取及既有 preset/root/EXTS 存储策略。无独立引擎、无新后台协议。
- controller 接受经源选项校验的字符串数组，最多 30 项、每项最多 256 字符；顺序保留。重复成员拒绝复用新 App 已有的本地安全规则，**不是已经证实的 R1 服务端约束**。
- 可选 checkbox 清空时写入显式 `[]`，同步原有/已验证的 root/EXTS 槽位；必填 `[]` 仍拒绝。原本只有 preset root 的记录不会凭空新增 EXTS 副本。
- 空数组编码仅限已有记录、唯一且明确 `type=checkbox / required=false` 的存储行。无 metadata、其他类型、必填、重复键或新建路径不能凭数组形状取得该能力。
- 共享多选控件增加可选保序模式，R1 checkbox 接入该模式；其他调用默认行为不变。验证“先选远程、再选现场”提交 `['remote','onsite']`，不按目录顺序重排。
- existing-edit 的字段投影直接复用 `actionFormSchemaFor/evaluateFieldState`；写入资格仍来自私有 reader/storage/grant，不再被首次创建的 scalar 白名单误拦。未知配置、条件、未证明的类型化模型和媒体写入仍关闭。
- 继续保存完整同 ID 原文；opaque EXTS、只读字段、其他记录及 audit 规则不变。保存前持久化 uncertain，ACK 与权威回读均核实后才 completed；不自动重放。

## 验证

| 层级 | 结果与范围 |
| --- | --- |
| 本地 checkbox controller | `r1-map-checkbox-edit.test.ts` 20 PASS：Code/inline、multiple 缺省/false/true、次序、可选清空、preset 槽位、30/31 上限、必填/未知/重复/错误类型零命令、provider/readonly/actor 换代、丢响应跨 provider 不重放、空数组 serializer 条件 |
| 独立 controller 用例 | `r1-map-checkbox-independent.test.ts` 11 PASS：协调方独立用例纳入正常回归，覆盖 scalar 对照、preset/root/EXTS/opaque/sibling、清空、必填、非法成员、fresh 副本冲突及权限/选项/身份变化。旧代码为 1 PASS / 10 capability RED，不把未执行的后续断言算通过 |
| 配置编辑周边 | checkbox、独立、已有配置编辑、预算和 radio/datetime 共 108 PASS；集合不与完整回归重复相加 |
| 完整本地回归 | `verify:full` 328 文件 / 6066 用例 PASS，类型、架构、依赖与质量检查 PASS。之后补充 preset 和 30/31 三项测试，最终针对性 108 PASS；完整 exact-SHA CI 另报 |
| 实际 App H5 | 430×932，`map-choice-datetime-edit.config.ts` 7 PASS：radio/datetime 原有成功/撤权，checkbox 保序、可选清空、必填空选禁用、provider 换代零命令、丢响应冷启动后不重放 |

H5 全部业务 HTTP 严格合成拦截，外部请求拒绝。没有访问真实 Java 做保存，没有消费额外 N03/N05/Order/旧 A 授权；Production/Beta 业务写入及 Issue #201 HOLD 不变。已保存数据不等于 Workflow 完成；没有 Process、上传、签约、PDF、消息或部署。

首轮 H5 六条通过，丢响应后的用例错误地在刷新已失去内存登录身份时寻找旧 Workspace 返回按钮，最终超时；实际页显示“需要登录”。原失败 trace/截图保留，改为通过正常登录→列表→详情 CTA 重建权限来源后，七条全通过。未提高超时、增加重试或削弱不确定回执断言。

## 本地证据和剩余范围

- `.review/map-checkbox-edit-verify-full-20261113.log`：本地完整回归。
- `.review/map-checkbox-edit-red-h5-20261113/`：第一次 H5 六绿一红的原始证据。
- `test-results/map-choice-datetime-edit/results.json`、`attachments/`：最终七条 H5、HTTP 台账、真实 App 截图和 trace。
- 430×932 截图已检查选择区、日期控件及空选状态；未做 UI 重设计。Owner 商业视觉 gate 仍独立，截图生成不等于视觉签收。
- 下一批继续条件显示及单路径 cascade：复用现有 runtime/provider，完整候选值评估；隐藏不默认清空，依赖不明不默认隐藏。未验证前仍明确拒绝，不能将本批 checkbox PASS 当作这些能力已完成。
