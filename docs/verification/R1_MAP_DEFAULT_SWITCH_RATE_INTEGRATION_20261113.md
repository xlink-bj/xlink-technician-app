# type0 Map 已有编辑：默认 switch / rate

2026-11-13。接续 [五类简单字段](R1_MAP_REMAINING_SCALARS_INTEGRATION_20261113.md)。其精确 SHA `25209a8950177cc226c31f90656e35b2e6e9385c` 的 [Validate](https://github.com/xlink-bj/xlink-technician-app/actions/runs/43377324257) 与 [H5](https://github.com/xlink-bj/xlink-technician-app/actions/runs/43377324238) 均成功。本批在其 CI 期间本地开发，确认上一批结果后再发布。

## 源码与最小接线

- 固定 R1 `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` 的 `business/subpackages/extForm/extForm.vue:148–172`：switch 明确使用 `active-value="1" / inactive-value="0"`；约 375–394 行 rate 不指定自定义量程。随项目固定的 `business/wxcomponents/vant/rate/index.js` 中 count 默认 5，allowHalf 默认 Boolean false。
- 复用 shared runtime、AppChoiceGroup（是/否）和 AppRatingField；仅 type0 Map 已有记录增加默认控件资格，不扩大 typed Survey/其他 DTO，不创建新引擎或页面。
- 原始值必须先校验：switch 只接受字符串 `'1'/'0'`，required `'0'` 是有效值；rate 只接受 number 类型的安全整数 1–5。共享 normalizer 的 bool/string 兼容能力不能替代此来源策略。
- 可选 rate 明确清空写入字面 `''`，同步经核实的 root/EXTS。required 空值拒绝；不新增 switch 清空操作。原本未选择或空串的 optional switch 可随其他字段原样保留，不凭空生成 false、0 或新的 EXTS 副本。
- 从既有普通创建计划提取纯 literal 判断，原创建路径的空值分支、条件和权限语义不变。已有编辑和创建的 raw 默认配置检查共同使用原先的 9 键列表：count/allowHalf/half/step/activeValue/inactiveValue/max/min/options。
- 真实 ExtField 将前端参数放在 `frontEndConfig` 字符串；它仍由各自策略独立解码/白名单校验。顶层与 JSON 中的半星、自定义值/范围/步长都不会被当成默认控件。placeholder 是此前已核实的唯一编辑层 JSON 展示键。
- readonly 值不得改写，hidden optional rate 不得趁清空兜底修改。新 reader/source 证据、整份原文、同 ID、正确 ACK、权威回读和 persistent uncertain 保护不变；没有 Process。

## 验证

| 层级 | 实际结果 |
| --- | --- |
| 独立 controller | 29 PASS；本机旧消费者实际 5 PASS / 24 capability RED（包括此前已支持的只读保全正例），不是将未运行的拒绝断言当绿 |
| 补充边界 | 23 PASS：optional switch 原有空串/缺省不造默认；raw 与 frontEndConfig 各 9 键反例；ACK 将字符串 switch 转 bool 或数字评分转 string 时保留 uncertain、不重放；hidden rate 清空拒绝 |
| 创建周边 | 既有 switch/rate create 85 PASS；旧的“writable switch 尚不支持”特征测试按已实现能力更新，未知 readonly 类型拒绝仍保留，默认字面/配置/类型化边界由独立测试覆盖 |
| 完整本地门禁 | **335 文件 / 6204 用例 PASS**；类型、架构、依赖、质量 PASS |
| 真实 App H5 | 430×932，Map 套件 **28 PASS**，另已有配置编辑 **9 PASS**；合计 37 条核心路径。新增 5 条覆盖取消重进后保存、默认字面类型、评分清空及正常回读、只读双槽保全、配置漂移零写、required 空评分阻断 |
| 三端编译 | H5 / MP-WEIXIN / App 仅编译通过；未启动微信开发者工具、原生运行时、模拟器或设备 |

H5 从正常登录、列表、工单 CTA 进入实际 App 工作区，全部 HTTP 严格合成拦截，外部请求拒绝。评分通过真实星级按钮点击，断言 5 颗 active、仅第 5 星 aria-pressed；只读字段按现有 Panel 呈现不可编辑提示。取消没有发命令；保存和清空核实完整 payload、ACK、原文回读及其他记录不变。没有使用静态 HTML、替代 UI 或注入 Vue 状态。

本地忽略证据：`.review/map-default-controls-verify-full-20261113.log`、`.review/map-default-controls-{h5,mp,app}-build-20261113.log`、`test-results/map-choice-datetime-edit/`、`test-results/configured-record-edit/`。已检查默认控件、空评分及底部行动实际截图；不把 `CODE_PASS` 当商业视觉签收。最终 exact-SHA CI 在交付单列，不借用上一批结果。

## 剩余边界

这使已有 Map 默认表单可复用 text/textarea/number/digit、phone/IDNumber、date/time/datetime、radio/单 select/checkbox/单路径 cascade、switch/rate；仍不是所有 ExtField 配置均已支持。已有媒体引用的保留/移除、BizSelect 可信业务 provider、更多条件/同键行/展示字段、更多 typed DTO 及真实业务副作用继续按证据推进，不轻放未知配置。

Production/Beta 写入、上传、签约、消息及 PDF 保持关闭，#201 HOLD 不变；没有重放已消费的 N03/N05/Order/旧 A 保存。媒体仅进入下一批协议调查，本批没有真实上传、真实 Java 保存、远端文件删除、合并或部署。
