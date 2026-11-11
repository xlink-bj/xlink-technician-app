# Survey regions / IS：只读选项合同与合成回归（2026-11-11）

本片仅推进两个已补证的 Code 引用，不访问 Production，不恢复未知的原 59 行配置，不开放 typed 既有编辑、追加或任何业务命令。固定 R1 `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`、Java `xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`，入口为 [等价清单](R1_REAL_DATA_MODEL_MOCK_EQUIVALENCE_INVENTORY.md)。

## 已留存合同与未知

| 字段 | 已留存类型 / provider | 存储 | 原手机规则 | 本片边界 |
| --- | --- | --- | --- | --- |
| province | Select → `regions`，Code，非 Cascade | preset=1，Survey 根 String | showList=['5']，手机详情排除 | 原规则仍排除；另建明确的合成手机可见字段验证机制 |
| isMoldRemoved | Radio → `IS`，Code | preset=0，EXTS；Survey 无此固定根属性 | showList=[]，手机详情排除 | 合成值在 EXTS，未借根部旧值冒充 |

绑定来自已获准留存的 59 行 V5 补证（SHA `7ef8b00d6b37410c066a4b4a0e4b262fa0bfec46df3b2afb83ebbbe15f1730ae`）。那次没有 Code 请求：生产选项内容、当前页面和有效写权仍 UNKNOWN。原 area 是独立 area 控件，本片不改为 regions Cascade，也不额外验证层级或 parts。

R1 `common.js:2857–2865` 按字段 type/valueOption 产生 Code 或 Cascade 别名；`525–567` 为 Code 查询，`617–635` 为标签辅助。旧 Code helper 使用字面 tenant，而 Cascade helper 使用登录 tenant；这里只记录源码事实，不据此推断生产租户或扩大跨租户权限。当前 normal reader 仍使用身份核实后的当前 tenant、原字段 ID/Ext/type/valueOption 绑定，拒绝错 provider/eleid/tenant 响应。

Java `CodeServiceImpl.selectCodeNew:36–162` 接受 `jsonPara=[{codeId,eleid}]`、tenantId，按 tenant/type/state=1 查询 Code，按 type/order 排序，输出带 options 映射的 JSON 文本。本片使用 `i/code/selectCode.do`，不误用 multistage 接口。options 键是字符串，结果不带逐行租户身份；租户隔离由精确请求、固定 Java 查询及新库跨租户对照行共同验证，不能从裸 options 反推全局目录。CodeType 也有合成种子，但这个 Code 路由实际查询 Code，不宣称它验证了 CodeType 层级。

## 单选已有值展示修补

基线把 Radio 的 EXTS 数组 ['1','0'] 显示成两个正常互斥标签；独立红例已保存。最小改动仅在 `r1-record-read-fields.ts` 的 read display：Radio 的所有数组（不因 multiple=true 变为多选）和非多选 Select 的数组显式标为选项未核实。单元素、空数组和非法数组不伪装成“未保存”或合法空标量。

R1 `serviceAppointment.vue:3254–3295` 的 Radio 始终绑定单值 van-radio-group，没有 multiple 切换；Select 的实际单选入口见 `3120–3144,8163–8171`。共享运行时 `values.ts` 将 select/radio 作为 optionScalarTypes，同时保留显式 multiple 的数组路径。此片保留 Select multiple=true、Checkbox、已有数值/布尔标量兼容、null/空字符串与未保存区分；不修改条件、重复行身份、媒体、writer 或后台协议。

## 验证合同与证据等级

- 工程测试执行真实 normal reader/provider 与 read projection，覆盖两个来源、原静态手机排除、错误 provider/eleid/tenant、无效标签、未知值、EXTS 原值完整性、单选和真正多选边界；写 provider 始终不可用。
- 独立 opt-in H5 配置为430×932，显式隔离 attachments、JSON、HTML 报告路径。真实 App 正常导航，全 API 拦截验证合同及失败恢复；不把这层当真实 Java。
- 真实 Java/Mongo 回归使用全新隔离实例，正常 OTP 登录和真实 App 读取。合成目录和值不代表生产选项；原规则排除与合成手机可见两套定义明确分开。跨租户相同代码放置不同标签，未知代码与错误数组必须可见地未核实。所有既有编辑、追加、完成与保存控件不可用，业务命令预算0。

实际命令、最终结果、源码补丁及原始 BSON 保全以本片本地最终报告/manifest 为准。此文档的测试安排本身不等于完成验收；Production、typed edit、native、CI、视觉签收均未因此通过。


## 已完成的 Mac 作者与独立验证（与 Cloud 合并验证分开）

最终报告取代早期 REVIEW_PENDING / 测试计划状态。精确原五路径作者候选完成 20 项新工程测试、4522 全量测试、typecheck/边界/依赖及六项 opt-in 正常 App H5；独立审查执行 122 项矩阵、264 项相关回归和 typecheck，已放行该受限代码片。以上不是本次 Cloud 重跑结果。

Mac 已消费的隔离真实固定 Java 只读联调为 58 响应、三次正常登录、零业务命令：合成手机可见、原规则排除、重启后新登录读取三个阶段分别 21/16/21 响应。当前租户的 regions/IS 标签与原 EXTS 值正确，未知值和非法 Radio 数组保持未核实；原手机排除用例不发 provider 请求。相同代码的外租户对照没有替换自己的标签。四十个对象在完整服务重启前后 raw BSON 全部一致。

首次登录会物化 Account 默认值、角色、归属与审计元数据，不能把首次差异概括为时间戳；后续登录仅 updateTime。已有业务值及其他对象保全。该租户对照不等于后台授权认证；错误 provider/tenant 响应拒绝来自工程和拦截 H5，未向真实 Java 发越权查询。本次不重放这些联调。

## 当前 Cloud 合并验证

基线为 `61df38305030e25347e51619e62ab30382e11e7b` 上已冻结的 Survey 条件 16 与导航 7 私有文件。仅按增量加入六行 displayValue 判断，逐字保留当前正常图片 import/对象数组投影；未覆盖 Mac 旧 helper 全文件。H5 使用项目已安装的默认 Chromium，保留显式 `XLINK_CODE_READ_CHROMIUM` 覆盖；独立编译、JSON、HTML、附件路径不变。未修改 CI、writer、reader、mapper、权限或 backend。

基线实际工程红测为 17 PASS / 3 FAIL，保留原始日志。修后新单测 20 PASS，相关 Survey/Code/媒体/选择回归为 12 文件共 581 PASS（已含这 20，不重复相加）。独立正常 file codec→FormData→记录投影检查另为 4 PASS，覆盖严格图片数组、空数组、null 与带历史 path 元数据的拒改展示。

本次冻结五文件后仅执行一次 `VITE_XLINK_ENVIRONMENT=test VITE_XLINK_ENABLE_REAL_WRITES=false pnpm run verify:full`：295 文件 / 4824 PASS，含 typecheck、边界、依赖、质量及项目门禁。六项正常 App regions/IS H5 全部实际执行，0 skip/retry：labels、excluded、wrong-provider、foreign-tenant、unknown、wrong-shape；共 114 拦截请求、零业务命令/外部请求/page error。错 provider/tenant 失败后通过显式重读恢复。另运行既有只读 59 行媒体展示兼容一例，覆盖 13 个已留存 part 路径，确认不加载媒体、不引入 provider 选项或写入；这是结构合成回归，不是完整 59 行真实支持。

本轮总 H5 7 PASS、0 SKIP，Cloud 未启动 Java/Mongo、未读写真实 API/七牛、未复跑已消费 Mac 业务。未重复三端构建；此前三端结果属于 Survey/导航冻结树，不算本片新增六行后的构建证明。原 23 个候选中，除协调者随后明确授权的导航专测 test-only 修正外，其余 22 个（含 CI/doc 和全部产品源）逐字保全。该专测原 fixture 缺少 totalCount，旧追加对照未实际发 page2，原结论不能算证明。现补 totalCount，并明确断言 page2 API、loading、isAppending 和未完成 promise，再释放响应核旧卡片及新行保全；五项专测及 typecheck 通过。此修正发生在本片 4824 全量通过之后，按协调要求不重复全量或业务/H5，仅附独立测试 delta 和准确 before/after。当前基线/远端未变，index 空，无提交或推送。所有源码/测试/配置在最终 full 前冻结，仅本说明之后填入观察结果。新 H5 后续接线需设置 `XLINK_H5_SURVEY_REGIONS_IS_READ=true`，运行 `config/playwright/survey-regions-is-read.config.ts` 并归档 `test-results/survey-regions-is-read/`，本轮仅建议，不修改已冻结 workflow。
