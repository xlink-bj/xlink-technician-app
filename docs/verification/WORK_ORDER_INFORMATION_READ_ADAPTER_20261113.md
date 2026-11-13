# 工单资料薄只读适配层（2026-11-13）

基线：`main@48038f309388642390e2a0cd5c7dc43d55a1a4bd`。
交付状态：**SOURCE + synthetic normal-App H5 verified；当前 Production 生效配置未核实，Production 新入口维持关闭。**
本记录不把历史固定源码或 Mock 当作当前生产有效配置证据。

## 范围与证据

- 固定 R1 [`business/subpackages/serviceAppointment/serviceAppointments.vue:1734`](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/serviceAppointment/serviceAppointments.vue#L1734)：`biz/extField/query`、`colName=serviceAppointment`、激活状态、`order asc`、字典配置。原 `_all=1` **未复制**；新 reader 用单页 `page=1,size=200`，必须计数完整，否则回退。
- 同版本 [`serviceAppointment.vue:6879`](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/serviceAppointment/serviceAppointment.vue#L6879)：普通表单 ExtField 的移动详情 `showList=4`、`mpDetailHide`。这是复用的元数据协议，不证明旧工单详情已动态展示 ServiceAppointment 字段。
- 固定后台 [`ExtField.java:16–42`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/entity/biz/ExtField.java#L16)：`colName`、`name/nameDisp`、`preset=0/1`、`showList`、`showFieldPreset`、`roleIds`；`operationType=editable/readonly/creatable` 是编辑模式，不是读取授权。本片对已知编辑模式只读展示，未知模式和非空/异常 roleIds 保守省略。
- 同后台 [`ExtFieldController.query:34`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/biz/ExtFieldController.java#L34)：按当前账号覆盖 tenantId。
- 同后台 [`ExtFieldServiceImpl.query:36–72`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/biz/ExtFieldServiceImpl.java#L36)：用户/组织/角色 Customize 调整返回顺序；reader 保留响应顺序，不重新按 order 排序破坏个性化结果。
- 既有新 App `read-models/work-order.ts`：客户姓名/地址/联系字段来自 ServiceAppointment；原详情角色列表来源、返回身份校验、DEV 租户校验与作用域撤销仍适用。

## 后续库级补证（父任务转述，非本会话独立执行）

父任务补充当前生产库 active 元数据：ServiceAppointment 74 字段（25 preset、49 扩展），有 showType=4 的 5 条、showType=5 的 4 条（均为非空字符串 roleIds 数组、无旧 showField），phone/sourceType/channel/foreignOrderNum 等 name 重复；Contacts 13 字段，showList 均不含 4。这证明当前库中的结构复杂性，**不是当前登录用户经过 Customize 后的有效 API 结果**，也不证明字段可读。未获取/保存字段原始配置或业务值。

实现按字段 ID 保留重名行，绝不按 name 合并；相同 name 的 root/exts 值和条件各按 preset/showFieldPreset 寻址；无明确角色上下文的 4/5 规则省略；Contacts 配置被固定 ServiceAppointment reader 拒绝并安全回退。库级 Contacts 缺移动详情配置不成为虚构 App 客户详情的理由。父任务另证实 R1 4 为角色包含、5 为角色不包含；本片不修改共享角色运行时，未取得可消费的当前角色读上下文时，两者都继续隐藏。当前角色必须是 currentRole._id，不能使用用户全部 roleIds 并集。当前有效 API 配置仍待证实。

进一步由父任务转述：74 条中 showList4 共 26，类型 datetime3/select5/file2/text11/textarea1/area1/map1/cascade1/phone1；11 条 active 字段有 mpDetailHide（不全属于 showList4），36 条 active type0 Customize，calculateConfig 均解析为空。这些仍是库级证据。Customize 仅重排/宽度并追加未命中字段，不是 ACL；miniz 控制器 tenant 注入被注释，不能从 API 成功推断租户/字段授权。本片仅在已有角色列表/身份/租户守卫的真实 DEV 路径启动新读取；未知环境、Beta、Production 均保留旧资料。后续按下面直接源码补证增加 area/map 薄只读支持；未知结构不携带原值。

## area/map 直接源码补证与最小只读支持

本会话独立读取固定 R1 `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` 的 [`business/subpackages/extForm/extForm.vue`](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/extForm/extForm.vue)：494–504 行以省/市/区字典拼 area 中文；2615–2630 行 `areaConfirm` 把 adcode 数组写入选定字段，并另写 root province/city/district。712–728 行 map 使用 `formData[extField.name]` 字符串；1535–1542 行另写 `gpsPoint` 经纬度对象。后台 [`ServiceAppointment.java:38–52`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/entity/basic/ServiceAppointment.java#L38) 独立定义 area List<String>、address String、gpsPoint GpsPoint。

新增 `reference/area-region-dictionary.ts` 仅从同固定版本 [`business/resources/js/area.js`](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/resources/js/area.js) 提取 35 个省级、612 个市级静态标签；不复制组件或业务模块代码。区县复用原 `area-county-dictionary.ts`：3390 项与固定 R1 county_list 的规范化 FNV32 校验均为 d4fcd88a（仅数据一致性检查，不是权限证据）。没有为该显示增加网络调用。

area 只接受完整三级六码路径（字符串或有限整数）、各级字典命中及层级前缀一致；用 R1 同样的三级标签拼接，不回填旁边 province/city/district、不输出未知码。空数组保留为空值；缺失仍为未保存。跨层级、未知、嵌套/字符串化数组或对象只显示不可展示说明。map 只允许选定字段内的字符串地址，作为普通 text 展示；不读取 gpsPoint、不从其他地址字段推导、不增加定位/打开地图/保存动作。电话遮罩边界先于 area/map 转换，修改 phone 字段类型也不能输出明文电话。

补充 API 与 H5 反例：**非空有效配置全部隐藏**时仍返回 `informationFields: []`，页面不显示固定资料；只有配置失败/不完整时属性缺失，才走原有回退。这与完整空配置同属有效空展示。

## 实现与安全回退

`work-order-information.ts` 只迭代已验证的字段配置，不遍历业务 JSON。复用既有 `formDefinition` 元数据解码、Runtime 可见性和 mobile-detail 适用性、完整 Code 字典 reader，以及既有 `r1ReadFieldDisplayValue` 只读格式化函数。内部 mapper 使用本地标签复用解码器，不创建真实 FormDefinition/表单实例，也不添加写路径。

- 固定请求及其 body 均冻结，调用方不能改写对象名、方法或预算；配置单次只读、无重试或扩页。每个详情最多解析 4 种去重的 Code 字典，每种沿用已有最多 10 页/500 项的 reader，因此新增读取绝对上限为 1 配置 + 40 Code 请求；超预算选项保留明确未核实展示，字典缓存仅在该详情调用内存活。仅 tenant/colName/激活/字段 ID/preset/完整计数均成立的配置可进入投影；重复身份或不完整响应回退。
- preset 精确选择 root 或 exts；同名键不互相覆盖，保留 0/false/null/空串。条件也按 showFieldPreset 精确取值；规则不完整不展示该字段。
- 已支持普通标量/选择类型只读展示；未知类型、对象值、异常 EXTS 容器显示不可展示说明，不输出原对象。area/map 仅按上节的已核实形状转换；Code 解析失败继续明确标记“选项未核实”，不把码当已验证标签。
- 缺少 showList、隐藏配置、角色规则不明确、未知前端规则/provider 配置、未知 operationType 或条件不完整时省略相应字段。已知编辑模式不产生编辑/保存能力。
- 已配置但完整空列表表示无可展示资料；配置缺失/失败表示继续已验证的固定资料。认证失败/撤销不降级为成功回退。
- 手机只输出脱敏值，接单状态未通过时省略。页面原有 active accept 节点阻断保留，并在该状态下跳过新配置读取。
- 元数据和选定值仅随当前详情存活，不建立跨对象/用户缓存。已有页面 loadVersion 与角色作用域守卫继续丢弃过期响应。
- 概览、联系操作、流程、跟进和订单等专用区域保持原有体验；本片仅替换客户信息 tab 内的通用资料行。该 tab 是 ServiceAppointment 资料，**不是独立 Contacts 主数据**。
- 不改写/删除隐藏字段，不保存配置或业务值，不重放预约/勘察/订单保存。

## 待核实与明确关闭项

1. **当前 Production 生效配置**：需要在当前登录租户/技师角色下，对 `colName=serviceAppointment` 的有界只读返回确认 total/page/size/完整性、preset、showList、实际类型、条件组合、roleIds、operationType、extId 和 Customize 生效顺序。只需脱敏结构证据；不需要客户原值或凭据。本片不执行生产登录/调查，不改变 Production ExtField 白名单，`getWorkOrderDetail` 在 Production 跳过新读取并保留原资料。后续开启需明确允许的有界请求和作用域防护，不能把本次 H5 PASS 当作开启依据。
2. 角色条件/非空 roleIds、showType=2 的自值语义、特殊 provider、媒体、脚本以及 numeric group 的用户可见分组语义未证明；保守不扩展。group 元数据不据数字猜标题，服务端顺序仍保留。
3. Contacts：现有 contactIds 只证明联系引用，不证明当前可安全读取 Contacts 主数据的完整关联、API 和权限。本片无 Contacts 请求，也不按姓名/电话猜关联。
4. 原生 MP/App 和 Owner 商业视觉验收未执行；本任务使用 H5，不启动原生设备。R2 无新视觉设计诉求/无凭据，本次仅检查现有实际 App 的匹配视口前后截图，不声称新的 R2 Live 验收。

## 验证与复现

最终结果：类型检查 PASS；10 个相关单元测试文件、424 项 PASS（其中新增专用 73 项）；新资料 H5 1 项 PASS；既有详情 A/B 生命周期 H5 2 项 PASS（迟到 success / session-invalid）；架构边界、依赖自检/无增长、所有权、UI、配置布局和 review hygiene 全部 PASS。未执行全量 verify、远端 CI、生产读取或原生运行。

使用已安装工作区可执行文件，避免本环境 pnpm 包管理器版本自启动安装到只读 home。

```sh
./node_modules/.bin/vue-tsc --noEmit
./node_modules/.bin/vitest run tests/engineering/work-order-information.test.ts tests/engineering/work-order-detail-load-lifecycle.test.ts tests/engineering/real-dev-work-order-detail-scope.test.ts tests/g4c/work-order-detail.test.ts tests/g4f/production-read-only.test.ts tests/g4f/m1-i7-work-order-read-scope.test.ts tests/engineering/r1-historical-forms-timeline.test.ts tests/engineering/r1-historical-forms-read.test.ts tests/engineering/r1-forms-original-read.test.ts tests/engineering/r1-configured-file-read-compat.test.ts
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright ./node_modules/.bin/playwright test --config config/playwright/work-order-information.config.ts
node scripts/check-boundaries.mjs
node scripts/check-module-dependencies.mjs --check --self-test
node scripts/check-eq10-ownership.mjs
node scripts/check-ui-governance.mjs
node config/check-layout.mjs
node tools/review/checks/check-review-root-hygiene.mjs
```

专用负例覆盖恶意 colName 替换、201 行超限、固定请求变异以及 Production 传输的 GET/PUT/DELETE、写路由、任意对象、扩页和 _all；全部在实际 HTTP 之前拒绝。Production 合法形状的新配置请求同样维持关闭。

H5 使用真实 uni-app 入口/正常组合、合成登录、全部 HTTP/WS 拦截，430×932。覆盖缺配置回退、新增/改名/响应排序、root/exts、隐藏/未知类型/角色省略、手机号脱敏、area/map root/exts 只读转换、非空全隐藏配置、空配置、503 回退、A 配置延迟返回后 B 不串数据、未接单阻断且不读配置。检查账本无业务保存/上传/流程命令。DEV 原有 function/changeRole 仅拦截返回合成菜单，未发送真实角色变更。

截图位于忽略的 `test-results/work-order-information/attachments/work-order-information-nor-f63b3-d-isolated-object-switching/`：
`before-verified-fallback-430x932.png`、`after-configured-430x932.png`、`B-after-late-A-430x932.png`、`area-map-readonly-430x932.png`、`all-configured-fields-hidden-430x932.png`。已实际查看：卡片、标签、边距、密度和层级沿用现有详情，脱敏正常，无横向溢出；不是商业视觉签收。
