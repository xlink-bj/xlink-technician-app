# 工单资料新增读取：H5 拦截夹具覆盖矩阵（2026-11-13）

基线：`0f16b0feea84b3ef055c5b5eac947750dd383ca1`。本轮仅修改测试夹具，不修改应用代码、工作流定义、共享 numeric 文件或已审 matcher。暂不推送。

## 分类与范围

在 `tests/**/*.spec.ts` 及 `tests/support` 中查找调用 ServiceAppointment 详情的 HTTP route 拦截器，再核对对应 Playwright 配置的真实 DEV/Production 环境。共识别 36 个入口：27 个补齐、4 个已有严格 fallback、5 个明确例外。非 HTTP 的内存 API 单元夹具和仅用自有 Mock ID 的离线页面不启动该真实 DEV 读取，不扩大其网络允许范围。

| HTTP 夹具 | 本轮处理 | 批跑 step |
| --- | --- | --- |
| `tests/h5-main-mock/configured-file-create.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 22, 23, 24 |
| `tests/h5-main-mock/configured-record-edit.spec.ts` | 受影响、共享 numeric 入口；本轮不改。既有 handler 返回其他对象表单配置，adapter 拒绝并回退；9 用例通过但不代表严格请求覆盖，待共享线补同一 matcher | 8 |
| `tests/h5-main-mock/existing-image-upload.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 13 |
| `tests/h5-main-mock/forms-cascade-create.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 29 |
| `tests/h5-main-mock/forms-choice-create.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 25 |
| `tests/h5-main-mock/forms-mixed-create.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 30 |
| `tests/h5-main-mock/forms-scalar-subset.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 4 |
| `tests/h5-main-mock/generic-map-edit.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 5 |
| `tests/h5-main-mock/map-bizselect-scalar-edit.spec.ts` | 新增已审 matcher；精确读取返回 HTTP 200 + success:false；保留零 console error 断言 | 10 |
| `tests/h5-main-mock/map-choice-datetime-edit.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 9 |
| `tests/h5-main-mock/map-conditional-cascade-edit.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 9 |
| `tests/h5-main-mock/map-default-controls-edit.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 9 |
| `tests/h5-main-mock/map-remaining-scalars-edit.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 9 |
| `tests/h5-main-mock/normal-appointment-experience.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 7 |
| `tests/h5-main-mock/normal-r1-file-upload.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 14 |
| `tests/h5-main-mock/normal-r1-image-recovery.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 15 |
| `tests/h5-main-mock/normal-signing-eligibility.spec.ts` | 新增已审 matcher；精确读取返回 HTTP 200 + success:false；保留零 console error 断言 | 11 |
| `tests/h5-main-mock/normal-survey-cause-read.spec.ts` | HTTP route 委托支持夹具 execute；新增已审 matcher；HTTP 200 + success:false；保留零 console error 断言 | 33 |
| `tests/h5-main-mock/ordinary-create-draft.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 26 |
| `tests/h5-main-mock/ordinary-create-plan.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 31 |
| `tests/h5-main-mock/ordinary-ui-atomicity.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 28 |
| `tests/h5-main-mock/repeat-appointment-edit.spec.ts` | 已有已审 matcher；本轮不改 | 6 |
| `tests/h5-main-mock/retained-attachment-edit.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 12 |
| `tests/h5-main-mock/survey-59-read.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 56 |
| `tests/h5-main-mock/survey-conditional-create.spec.ts` | 已有已审 matcher；本轮不改 | 18 |
| `tests/h5-main-mock/survey-first-media-save.spec.ts` | 已有已审 matcher；本轮不改 | 19 |
| `tests/h5-main-mock/survey-part-create.spec.ts` | 已有已审 matcher；本轮不改 | 17 |
| `tests/h5-main-mock/survey-regions-is-read.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 20 |
| `tests/h5-main-mock/switch-rate-create.spec.ts` | 新增已审 matcher；精确读取返回合成 503 | 27 |
| `tests/h5-main-mock/work-order-authority-revocation.spec.ts` | Production 守卫；保持拒绝新配置读取，不加 matcher | 3 |
| `tests/h5-main-mock/work-order-detail-load-lifecycle.spec.ts` | Production 守卫；保持拒绝新配置读取，不加 matcher | 16 |
| `tests/h5-main-mock/work-order-information.spec.ts` | 专用成功、改名/排序、root/exts、全隐藏测试；保持其自有响应并单独运行 | 专用 metadata config（另跑） |
| `tests/h5-main-mock/work-order-refresh-navigation.spec.ts` | Production 守卫；保持拒绝新配置读取，不加 matcher | 21 |
| `tests/support/normal-form-draft-fixture.ts` | 新增已审 matcher；精确读取返回合成 503 | 34, 35, 36, 37 |
| `tests/support/normal-repeat-workspace-fixture.ts` | 新增已审 matcher；精确读取返回合成 503 | 32 |
| `tests/support/normal-workspace-fixture.ts` | 新增已审 matcher；精确读取返回合成 503 | 38 |

`normal-survey-cause-read-fixture.ts` 同时由 H5 route 的 execute 委托调用，因此在其 H5 调用方处理固定请求，不修改共用支持夹具。另两个含详情路径的支持文件 `r1-existing-record-edit-fixture.ts`、`normal-appointment-experience-fixture.ts` 仅由内存 transport 单元测试使用，没有 H5 调用方；完整单元组已通过。导入依赖扫描包含这种间接 HTTP 入口，不能只依据详情路径所在文件是否有 page.route 判定。

新增分支在业务夹具计数器前执行：固定资料读取不能被计作 FormDefinition 的分页/权限漂移请求。完整 raw form 参数由已审 matcher 校验（同源、固定 POST 路径、无 query、恰好六个参数、值固定、无重复参数）。不匹配的请求继续进入原路由判断；原 unexpected/abort、保存次数、保存 payload、回读、权限撤销和隔离断言原样保留。没有为所有 extField 请求统一放行，也没有给字段配置伪造成功数据。三组严格检查 console errors 的夹具使用既有 R1 业务失败 envelope（HTTP 200、success:false），使只读 transport 明确失败并回退，不用过滤 503 console error 或降低零错误断言。其他新增夹具使用 HTTP 503。

## H5 工作流入口

核对 `.github/workflows/validate-main-h5.yml` 的全部七个 job：

| 分组 | 本地复验范围 |
| --- | --- |
| `scoped-existing-media-h5` | 按原 step env/命令顺序执行 15 个 Playwright step；任一步失败仍继续后续以发现全部遗漏 |
| `scoped-create-lifecycle-h5` | 按原 step env/命令顺序执行 18 个 Playwright step；任一步失败仍继续后续以发现全部遗漏 |
| `draft-lifecycle-h5` | 按原 step env/命令顺序执行 6 个 Playwright step；任一步失败仍继续后续以发现全部遗漏 |
| `stage1b-mock-h5` | 按原 step env/命令顺序执行 17 个 Playwright step；任一步失败仍继续后续以发现全部遗漏 |
| `scoped-form-integrations-h5` | 仅为 existing-media/create-lifecycle 两组状态聚合，无独立浏览器用例；不会把其失败/跳过算通过 |
| `r1-main-repeat-ui` | nightly/manual/L3 分组，普通 main push 跳过；本轮不冒充执行 |
| `h5-ux` | nightly/manual/L3 全域分组，普通 main push 跳过；本轮不冒充执行 |

运行使用已安装工作区 Playwright 与 Chromium，HTTP/WS 仍由原合成 route guards 拦截，不接触生产业务或凭据。原 workflow 中的 numeric 失败只记录，不修改其用例或控件。step 编号按上表四个分组顺序对应 workflow Playwright 步骤；完整 56 步配置及源文件依赖映射保留在忽略的 `ci-h5-plan.json` 和 `fixture-sweep-matrix.json`。

## 结果

这是按协调要求提前交付的检查点，不是全套通过声明。记录时间 15:21:14 UTC；56 个步骤已完成 38 个，进程仍在持续产出，未中断。

| 分组 | 已完成步骤 | 用例通过 | 用例失败 | 跳过 |
| --- | --- | --- | --- | --- |
| `scoped-existing-media-h5` | 15/15 | 88 | 8 | 0 |
| `scoped-create-lifecycle-h5` | 18/18 | 56 | 23 | 0 |
| `draft-lifecycle-h5` | 5/6 | 28 | 0 | 0 |
| `stage1b-mock-h5` | 0/17 | 0 | 0 | 0 |

existing-media 首轮 8 个失败来自 bizselect（5）/signing（3）的 HTTP 503 console error；已将这两条新分支修正为 success:false，原断言未变，原配置复验已排队，当前不能算通过。曾尝试端口 5369 隔离复验，bizselect 被现有固定 5189 的本地读权限守卫拒绝，属于无效业务复验，未计入结果。复验使用原配置，等 5189 释放后运行。

create-lifecycle 的 23 个失败均停在已有 number 控件的 textbox 定位：`switch-rate-create.spec.ts:61`（5）、`forms-mixed-create.spec.ts:57`（8）、`ordinary-create-plan.spec.ts:55`（7）、`normal-repeat-workspace.spec.ts:19`（3）；各快照实际为 spinbutton。本线仅加固定请求 matcher，不修改数字定位或控件。原 Repeat appointment 三模式（step 6）通过；不同于这里的 Repeat Workspace。间接 HTTP 委托入口 normal-survey-cause-read 的 7 模式全部通过。

完整单元 346 文件/6474 用例、类型检查、架构边界、模块依赖及 ownership 检查通过。专用 work-order-information H5 1 用例通过，包含成功/有效全隐藏/对象切换路径。当前提交尚未推送，没有对应远端 CI。

专用 `work-order-information.config.ts` 单独运行，确保元数据成功与有效全隐藏路径没有被 fallback matcher 覆盖。既有严格 matcher 的 30 个单元回归（1 正向、29 负向，覆盖写方法、恶意对象、错误路径/origin、缺失/额外/重复参数、超限分页及 JSON body）保持原样并随完整单元测试通过。逐文件校验删除新增两行后与基线字节一致，原业务断言无变化。

已实际查看本轮 430×932 截图 `all-configured-fields-hidden-430x932.png` 与 `area-map-readonly-430x932.png`：有效全隐藏仅显示暂无可展示资料；成功区域/地图行分别显示已验证字典中文及合成地址，未显示坐标。截图为合成夹具，不是生产实证。

所有日志与逐步结果保留在忽略的 `.review/work-order-information-20261113/h5-sweep/`。

## 最终批跑结果（保留以上检查点）

本轮基于 `0f16b0f` 加 `525f75b` 完成 56/56 个工作流 Playwright 步骤，原两组配置的 8 项 console error 修复复验全部通过（bizselect 5/5、signing 3/3，两个命令均 exit 0）。合并原复验结果后共 251 通过、25 个数字输入失败、0 跳过，不能表述为全绿。

| 分组 | 完成步骤 | 最终通过 | 最终失败 |
| --- | --- | --- | --- |
| scoped-existing-media-h5 | 15/15 | 96 | 0 |
| scoped-create-lifecycle-h5 | 18/18 | 56 | 23 |
| draft-lifecycle-h5 | 6/6 | 33 | 0 |
| stage1b-mock-h5 | 17/17 | 66 | 2 |

25 项数字失败为：switch-rate-create（5）、forms-mixed-create（8）、ordinary-create-plan（7）、normal-repeat-workspace（3）的 textbox/spinbutton 定位差异，以及 stage2b-r1-primitive-fields 的 number 输入拒绝 fill('-')（1）、order-fields-flow 的 number 输入拒绝 fill('invalid')（1）。留给共享线修复后联合复验，本线未更改数字控件或这些断言。最后 Survey 59 六项全部通过。

主 sweep session 82211 与复验 session 18011 均已退出，原 PID 18441、33751 已不存在；主驱动器 exit 0 是继续记录失败后的正常退出，六个仍失败的 Playwright 命令均 exit 1，不代表全套通过。首轮日志、复验日志及 final-results.json 均保留于前述忽略目录。

本轮没有运行 nightly/manual/L3 的 r1-main-repeat-ui、h5-ux；scoped-form-integrations-h5 仅聚合状态，没有独立浏览器用例。configured-record-edit 的严格 matcher 仍待共享线接入，其 9 项通过不算严格请求覆盖；此处记录的是本轮基线状态，不能替代共享修复后的联合结果。Production/Beta 新资料读取仍关闭，Contacts 与角色条件的后续完成不由本轮测试夹具升级证明。
