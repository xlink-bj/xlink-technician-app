# 工单资料只读当前角色贯通（2026-11-13）

基线 `main@72c2022731af90ec4d34708e760aef19f0985263`。这是首批 [资料薄适配层](WORK_ORDER_INFORMATION_READ_ADAPTER_20261113.md) 的有限增量，复用 [共享当前角色能力](R1_SELECTED_ROLE_FIELD_VISIBILITY_20261113.md)。交付为源码与 DEV 隔离合成 H5 验证；不代表当前 Production 用户有效配置、业务读取授权或真实保存验收。Production/Beta 新资料配置入口仍关闭。

## 契约与证据

固定 R1 [`common.js:2488–2676`](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/resources/js/common.js#L2488) 的旧 `frontEndConfig.showField` 分支优先；无旧分支时，root showType=4 表示 `roleIds` 包含当前选定角色，5 表示不包含。角色条件本身不依赖 showField/showFieldPreset。固定 [`serviceAppointment.vue:6022`](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/serviceAppointment/serviceAppointment.vue#L6022) 从 `currentRole._id` 取当前切换角色，不能以用户全部角色、handlerIds 或业务值替代。

父任务提供的 Production 库级脱敏摘要：ServiceAppointment 74 条 active 元数据中 showType=4 五条、5 四条，九条 roleIds 均为非空字符串数组且无旧 showField/showValue。它不是登录用户经 Customize 后的有效 API 配置。本任务没有访问 Production、取得原始业务值或重放已消费记录。

支持范围为已有共享 mapper 验证通过的 root 4/5 子集：非空、去重、长度有界且每项为合法字符串的 roleIds；缺失、空、重复、非数组或畸形项全部拒绝。旧 frontEndConfig.showField/showValue/showType 与 root 角色规则混合时继续拒绝，不猜测旧分支组合语义。未知规则不变可编辑。

## 输入输出和职责

- [`work-order-information.ts`](../../src/adapters/api/read-models/work-order-information.ts)：固定 tenant/colName/激活/preset/完整单页/字段身份校验保留；只让共享 mapper 已识别的 root 角色规则通过，不再要求角色规则有 showFieldPreset。不同 fieldId 同 name 保留为独立行。值条件仍按 showFieldPreset 精确选择 root 或 EXTS，值仍按 preset 选择，角色规则不冒充字段值条件。
- `projectWorkOrderInformation(record, fields, includePhone, roleContext?)` 的第四参数只能由可信 reader 提供。角色行覆盖为 readOnly，并覆盖元数据中任何携带的 token；无可信 context 不输出角色行。不会将 context 注入原始后端 JSON。电话状态门槛、脱敏、area/map 形状限制、有效空列表不回退等边界全部保留。
- [`composition.ts`](../../src/app/composition.ts)：新增 `getReadTenantId` 从 App 实时 runtime config 取得 tenant；身份源仍来自 authSession 当前 session/current role，不取用户角色并集。
- [`technician-api.ts`](../../src/adapters/api/technician-api.ts)：仅在既有真实 DEV、角色列表授权、工单 ID/tenant 与有界配置验证后签发 context。绑定 sessionRef/userId/当前 roleId/可用 roleVersion fingerprint、当前 tenant、工单 ID、当前列表与详情读代次。缺实时 tenant 源不签发可用角色 context，保留旧非角色 reader 调用兼容性；tenant 撤销或变化时，进行中的读取以 authorization_denied 失败。
- [`selected-role-visibility.ts`](../../src/shared/form/selected-role-visibility.ts)：原 WeakMap 身份保持；复制/序列化 token 不可用。增加显式 revoke 和只观察撤销的订阅，不能从订阅获得角色。已撤销 token 永不恢复。新列表/详情读取和 reader 观察到身份变化时主动撤销；每次 evaluate 仍重检实时来源。token 只留在内存，没有配置缓存或持久化。
- [`detail.vue`](../../src/pages/work-orders/detail.vue)：只读行渲染再次验证角色 context；session 改变参与响应式失效，既有 session watcher/详情 store 仍在切换、注销或路由新读时清空旧详情。页面订阅显式撤销通知使已缓存行立即重算；资料替换和卸载清理订阅。此处只重检角色规则，避免拿空记录错误重算已在 adapter 中执行的 root/EXTS 值条件。

这不是节点写授权：没有增加编辑控件、保存入口、Contacts 读取、生产请求白名单或任何业务写命令。读取的失败不扩大授权，也不以旧详情覆盖新代次结果。

## 红绿与回归证据

初始新增 mapper/projection 14 项：5 FAIL / 9 PASS。失败为可证明的有限角色行被提前过滤；修复后 14 PASS。增加失效通知及 API 生命周期覆盖后，三个针对性文件合计 **129 PASS**：

- [`work-order-information-role.test.ts`](../../tests/engineering/work-order-information-role.test.ts)：15 项，包含/排除四象限、缺/空/畸形名单、旧配置混合、伪造/复制 token、重名不同 ID、root/EXTS、手机遮罩、撤销与取消订阅。
- [`work-order-information.test.ts`](../../tests/engineering/work-order-information.test.ts)：88 项，含已存在 73 项边界；增加真实 API adapter 的角色四象限、缺 live tenant、注销/角色/tenant/缺 tenant/同对象新读/另一对象新读/列表新读失效、读取启动即通知、异步旧 A 拒绝且新 B context 有效、in-flight tenant 变化。
- [`role-field-visibility.test.ts`](../../tests/engineering/role-field-visibility.test.ts)：26 项，既有共享能力不回退。

最终 **349 文件 / 6573 项全量单测 PASS**，退出码 0；vue-tsc 退出码 0。边界、所有权、模块依赖自检、config layout、M1 基线、UI governance、review hygiene、质量 census 八项退出码均 0；`git diff --check` 通过。

[`work-order-information-role.spec.ts`](../../tests/h5-main-mock/work-order-information-role.spec.ts) 使用 [专用配置](../../config/playwright/work-order-information-role.config.ts)，运行真实 App 登录→列表→详情客户 tab，430×932、请求全部拦截，**5 PASS**：四个角色包含/排除组合，以及畸形/旧混合规则、迟到 A 与新 B、注销后其他当前角色、缺 currentRole。用户角色数组始终同时含 r/other，防止并集误授权。可见用例保留不同 fieldId 同 name 的 root/EXTS 行及遮罩电话；外网、未知请求、页面错误、业务写入均为零。原有资料页 H5 **1 PASS**，精确条件、area/map、回退与 A/B 切换不回退。H5 和截图是合成隔离证据，不等于生产或新的商业视觉验收。

```sh
VITE_XLINK_ENVIRONMENT=test ./node_modules/.bin/vitest run
./node_modules/.bin/vue-tsc --noEmit
VITE_XLINK_ENVIRONMENT=test VITE_XLINK_R1_MP_UX_FIXTURES=false XLINK_REPEAT_APPOINTMENT_CHROMIUM=/usr/bin/chromium ./node_modules/.bin/playwright test --config config/playwright/work-order-information-role.config.ts
```

本环境原有 H5 config 没有 executablePath override，使用忽略目录 `.review/information-original.config.ts` 仅继承原 config 并指定 `/usr/bin/chromium` 跑原 1 项，没有更改原测试或普通预约/Survey fixture。CI 使用标准已安装浏览器；workflow 增加专用角色资料五项和 artifact 路径。

首次全量命令未指定 CI 使用的 `VITE_XLINK_ENVIRONMENT=test`，得到 7 个旧 Mock 测试失败（另 6566 PASS）；按 CI 环境完整重跑 6573 PASS。首次原 H5 因默认浏览器未安装而未启动；指定现有 system Chromium 后 1 PASS。保留这些环境失败记录，不把未运行当通过。

本地日志：`.review/information-role-final-unit.log`、`information-role-all-unit-test-env.log`、`information-role-types-final.log`、`information-role-checks.log`、`information-role-h5-final.log`、`information-role-original-h5-system.log`；截图/trace/请求账本见忽略目录 `test-results/work-order-information-role/`。

## 未执行与限制

未 push，本批等待独立审查和协调发布；没有本批远端 CI 结论。未执行 Production 用户有效配置读取或业务写入、MP/App 原生运行、真实 Qiniu/短信/签约/付款验收。当前库级结构命中不能证明每个账号可读，也不据此开启任何写权限。runtime tenant 是 App 配置源；本次真实页面测试覆盖角色/注销/迟到结果，tenant 动态变化由 adapter 合成工程测试证明，未声称浏览器中存在租户切换 UI。
