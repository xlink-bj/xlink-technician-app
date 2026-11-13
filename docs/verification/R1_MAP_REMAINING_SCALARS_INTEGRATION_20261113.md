# type0 Map 已有编辑：其余已证简单字段

2026-11-13。接续 [条件与 cascade](R1_MAP_CONDITION_CASCADE_INTEGRATION_20261113.md)。上一批精确提交 `3ff367f0627c752195d515c038e4995521e18b11` 的 [Validate](https://github.com/xlink-bj/xlink-technician-app/actions/runs/43374992724) 与 [H5](https://github.com/xlink-bj/xlink-technician-app/actions/runs/43374992699) 均成功；本批在其 CI 期间本地开发，保持该 SHA 冻结至结果确认，再独立提交。

## 接线及边界

仍使用现有 normal reader、私有 source/storage 租约、动态 field runtime、共享控件及完整原文同 ID upsert。没有重建表单引擎、复制 R1 组件或新增真实写入环境。

| 字段 | 本批行为 | 保留边界 |
| --- | --- | --- |
| phone | 从固定 R1 `extForm.vue:2694` 核实 `^1[3456789]\d{9}$`；抽取等价的共享纯格式判断，normal controller 在 runtime 字符串归一化前校验 | 不降为任意 text，不自动去国家码或转数字；调用方保留自己的必填/trim 语义。登录预检沿用原先 trim、手机号、验证码顺序，未修改登录界面或认证协议 |
| IDNumber | 仅接已有字符串 codec，保留前导 0 和 X | 拒绝数值输入，尤其不把不安全大整数 stringify 成编号；不新增未证实的 18 位或校验位规则 |
| date/time | 复用真实 AppDateTimeField 和既有 local-calendar codec；date 为 `YYYY-MM-DD`，time 为 `HH:mm`，可选空串按字面保存 | 不做 UTC/Date.parse 转换，不猜 epoch；不宣称兼容 R1 所有 locale 日期输出；不顺带放开 typed Date DTO 属性 |
| 单值 select | 复用当前 scoped Code/inline options 的成员与完整源身份检查 | 不放开 multiple、业务记录 provider 或任意 url/params；provider/readonly/身份变化撤销旧编辑器 |

source 策略只对 **type0 Map** 增加以上字段，typed Survey 等既有策略不扩大。后台 FormDef 决定字段名、类型、顺序和选项，不按样例业务键硬编码。原文中的 opaque EXTS、审计规则、只读值和其他记录保持现有保全要求；保存前 uncertain、正确 ACK/权威回读后 completed、重启不重放不变。

## 验证

- 协调方独立 `r1-map-remaining-scalars-independent.test.ts`：旧代码 6 PASS / 19 capability RED；实现后 **25 PASS**。包含五类同 ID 保存、无效手机号/日期/时间、数值 ID 拒绝、单值 select 非法值、provider/readonly/身份换代、date/time 字面空串、五种 typed 策略不扩大。
- 本地完整 `verify:full`：**333 文件 / 6152 用例 PASS**，类型、架构、依赖及质量检查通过；登录预检/consent 与条件/已有编辑针对性 109 PASS（与完整回归重叠，不叠加统计）。
- 真实 App H5 **430×932**：Map 套件 **23 PASS**（原 17 条＋新增 6 条），另已有配置编辑 **9 PASS**。合计 32 条核心路径；全部业务请求严格合成拦截，拒绝外部请求。
- 新六条路径：phone/ID/select 同 ID 保存；非法 phone 禁止保存；provider 换代零 upsert；丢响应冷启动保留 uncertain；date/time 通过实际 picker 选择；可选清空后 root/EXTS 均为 `''`，正常返回工单重读；取消后重进保留原内容。
- 首轮 H5 四绿两红是测试定位问题：单 date/time 控件不是 datetime 的 `__picker` 子节点；清空点击其文本被真实 button 命中层拦截。改为实际单 picker 与 AppButton 根节点后，原成功、失败、字面空串和回读断言全部保留，23 条全组通过；没有强制点击、注入 Vue 状态、提高超时或增加重试。原失败 trace/截图保留在 `.review/map-remaining-scalars-red-h5-20261113/`。
- H5、MP-WEIXIN、App 三端仅编译检查；未启动微信开发者工具、原生运行时、模拟器或设备。exact-SHA CI 在本批最终交付单列，不用上游绿色结果替代新代码验证。

本地证据：`.review/map-remaining-scalars-verify-full-20261113.log`、`.review/map-scalars-{h5,mp,app}-build-20261113.log`、`test-results/map-choice-datetime-edit/`、`test-results/configured-record-edit/`。已查看实际 App 身份文本、日期/时间空选与底部行动截图；截图和 trace 为本地忽略产物，不视作商业视觉签收。

## 未完成范围

本批不是全 extForm 1:1 完成。可编辑 switch/rate、更多条件/同键行、多路径级联、BizSelect 真实业务 provider、未知 frontEndConfig、更多 typed DTO 与媒体/Workflow/Order/合同真实副作用仍按独立证据和权限门推进。Production/Beta 业务写入、上传、签约、消息及 PDF 继续关闭，#201 HOLD 不变；已消费的 N03/N05/Order/旧 A 保存没有重放。本批没有真实 Java 保存、合并、部署或原生验收。
