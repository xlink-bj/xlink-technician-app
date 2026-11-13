# 原生 numeric 键盘：输入中间态与 H5 CI 修复

Status: bounded implementation / synthetic H5 verification
Date: 2026-11-13
Published regression: `ea499b1015517ce8e8da848c5a3c491eb8618e28`

[失败工作流](https://github.com/xlink-bj/xlink-technician-app/actions/runs/43438853917) 的 Stage 2B 与 Switch/Rate 创建最先暴露两种测试假设：Playwright 不能向原生 `input[type=number]` fill `-`，numeric 控件的可访问角色为 spinbutton。后续补跑发现 Order 的 `fill('invalid')`、mixed/create-plan/Repeat 的 textbox 定位同源失配。本批保留原生 number/digit 键盘以及全部零值、权限漂移、ACK、保存和回读检查，不恢复 text 控件。

## 真实产品缺口与修复

真实键盘 `press('-')` 在 Chromium 留下 `value:''` 与 `validity.badInput:true`。修复前 Stage 2B 的可选 digit 字段使保存仍可用，不能只删掉原非法输入断言。数字未完成不等于用户清空字段，也不能用虚构的 `'-'`、NaN 或哨兵值写入业务数据。

[H5 输入交付](../../src/shared/ui/h5-input-delivery.ts) 在 uni 原生监听器之后读取 badInput；未完成时不发布业务值，只向 [AppInput](../../src/shared/ui/AppInput.vue) 的 [临时输入状态作用域](../../src/shared/ui/form-input-validity.ts) 报告无效。恢复合法数字或真正清空后恢复有效，输入解绑/卸载移除标记。既有字符串交付、IME、外部模型同步与 MP/App 事件路径保留。状态不进入 schema、持久化草稿、API 或权限。

四个使用 R1FormFieldControl 的宿主消费该状态：

- [正常表单](../../src/features/work-orders/R1NodeFormsReadPanel.vue)：validDraft 和保存/保存并完成已有守卫。
- [隔离动态表单](../../src/features/work-orders/R1DevMockDynamicFormTransactionPanel.vue)：表单有效性和携字段 action 的执行守卫。
- [本地字段草稿](../../src/features/work-orders/R1LocalFormFieldEditor.vue)：保存草稿按钮和 handler。
- [Order 扩展资料](../../src/features/work-orders/quotation/OrderExtFieldEditor.vue)：selection 校验、ready 事件、异步队列和媒体回调共同维持门禁，旧回调不能盖过新 badInput。

校验仅为当前 UI 输入中间态，未扩大控制器、workflow 或真实写授权。先前已合法排队的 Order 本地草稿写入仍按原语义完成。

## 回归语义

[Stage 2B](../../tests/h5-main-mock/stage2b-r1-primitive-fields.spec.ts) 改用真实键盘，断言 badInput、保存拒绝、`-1` 恢复、小数保存和回读；保留 unsafe integer 拒绝及 phone/ID 前导零。保存后先等待编辑器清空再重载，避免“保存记录”原有空闲文案在事务开始前即满足。

[Switch/Rate](../../tests/h5-main-mock/switch-rate-create.spec.ts) 五种场景都断言原生 `-`、强制点击零写入、恢复 `0`，其错误 ACK/权限漂移原断言保留。[Order](../../tests/h5-main-mock/order-fields-flow.spec.ts) 实际是 digit；用原生可输入但现有 decimal 规则拒绝的 `1e2` 保留错误提示检查，再检查中间态门禁与恢复。uni-button 使用其实际 aria-disabled 契约，不把自定义标签上的 toBeDisabled 当有效禁用证明。

[输入交付单测](../../tests/engineering/app-input-delivery.test.ts) 新增“badInput 不变成空业务值/合法负数和清空恢复/解绑释放”以及真实 AppInput 的作用域卸载检查。实际 SFC 测试加载器仅补接真实 composable，未替换为总有效桩。

## 验证范围

当前工作树含独立待审 phone/ID 与 role 修改；完整 Vitest 为 346 文件 / 6434 PASS（`VITE_XLINK_ENVIRONMENT=test node_modules/.bin/vitest run`，exit 0）。这不是精确 numeric 提交与最新远端对象资料批次整合后的 CI 通过声明。最后的 numeric handler 守卫收口后，AppInput/动态宿主/正常宿主 71 项再验通过；typecheck、boundary、ownership、module dependencies、自检、UI governance、M1 I8、config layout 与 diff whitespace 检查通过。

H5 使用仓库实际 App、工作流原始 opt-in 配置与原超时/重试设置；本机仅通过忽略的 wrapper 指定 `/usr/bin/chromium` 与独立报告路径。按上述失败工作流两个 job 从失败步骤起逐组执行；最终组数和退出码见本批交付。所有业务请求均为协议形状的合成拦截，不执行旧真实记录保存、生产/供应商网络、Qiniu 上传、短信、签约或付款；未执行原生设备或商业视觉验收。

最终 H5：22 组 / 99 PASS，各最终命令 exit 0。初轮 Stage 2B 在重载前等待不充分、Order 的旧 fill 假设分别失败，修正后各完整重跑通过。一次合并发现用例的调用缺 Stage 2B 开关而跳过 1 项，不计通过；随后带两项开关单独重跑该组 1/1 PASS，16.8 秒。Order 最终 1/1 PASS，37.4 秒。没有通过增加 retry、修改超时或删除保存/回读断言转绿。

| 工作流步骤（从失败点开始） | 最终 PASS |
|---|---:|
| Verify Stage 2B optional typed primitives on source-shaped Mock FormDef | 1 |
| Verify Stage 2C R1 checkbox/cascade arrays on the real App | 1 |
| Verify real GenericDynamicFormActionContent scalar preview and write fence at 430 | 1 |
| Verify offline drafts, persistent media recovery and temporal records at 430 | 10 |
| Verify three-level cascade record roundtrip | 1 |
| Verify special business-record Provider transactions | 2 |
| Verify Stage A generic R1 file queue and stale-editor H5 acceptance | 3 |
| Verify default Mock quotation fields, cross-tab drafts and Quote to Order readback at 430 | 1 |
| Verify M08 synthetic catalog pagination and package quotation at 430 | 1 |
| Verify synchronous AppInput delivery and H5 native boundaries | 9 |
| Verify rapid search delivery on button and keyboard entry | 6 |
| Verify normal quotation rapid input delivery and draft encoding at 430 | 7 |
| Verify R2 Work Order classifications within R1 role scope at 375 and 430 | 4 |
| Verify R1 Mock repeat query readback and record lifecycle at 430 | 2 |
| Verify normal App Survey 59 conditions and read-only media at 430 | 6 |
| Verify ordinary configured Switch and Rate first creation | 5 |
| Verify ordinary input refusal and picker lifecycle atomicity | 7 |
| Verify ordinary complete-path Cascade first creation | 7 |
| Verify ordinary mixed Switch Rate and Code choice first creation | 8 |
| Verify ordinary configured per-field first creation and owned uploads | 7 |
| Verify normal main Repeat Workspace completion and guards | 3 |
| Verify normal Survey cause readonly experience in its Workspace | 7 |

## 后续补漏：Generic 页面祖先与其他 binder 消费者

独审指出首批四个 scope 只覆盖 R1FormFieldControl 的宿主，未覆盖另一 numeric AppInput 消费者 GenericDynamicFormActionContent。实际祖先 [action-workspace 页面](../../src/pages/work-orders/action-workspace.vue) 当时直接绑定 `workspace.saveDynamicForm`，完成仅依据业务值。既有 scalar QA 的 R1 forms 节点被执行围栏禁用，不能以其 PASS 推导其他可执行 Generic 路径安全。

本批在该真实页面祖先接入同一临时 scope，保存/完成/Shell/确认框的 UI 资格与 handler 都检查有效性，DEV journey 继续及预约确认入口也沿同一门禁。scope 不进入 store/schema/API；原权限与 R1 forms/repeat 专用多记录围栏不变。角色提交 `9bd07929a4826547193b9cda0acf7ad4517c23b8` 保持原样，本批追加提交。

源码搜索 `AppInput` 的 input-type/inputType 后仅两类 numeric 消费者：R1FormFieldControl 与 Generic；前者四宿主保留原接入，后者由页面覆盖。扩查共享 binder：AppTextarea、AppSearchBar 没有 numeric 类型；QuotationTextField 有独立原生 numeric 控件且未接此合同。故 binder 仅在调用方提供 onValidityChange 时保留 UI 中间态；未接合同的消费者恢复原有空字符串交付，避免首批无条件 suppress 改变其既有数量语义。本批不宣称其获得新的有效性 scope；原报价数量/编码回归仍需通过。

新增 [浏览器 fixture](../../tests/h5-main-mock/fixtures/generic-numeric-workspace-harness.ts) 挂载真实页面、Shell、FormActions、Generic、AppInput 与实际 Workspace 控制器。独立 Pinia、合成 session、规范化 legacy Generic read/command/storage 端口是明确的测试初始条件；不改真实 App 路由的数据、不创建权限 grant、不把真实 R1 sourceNodeType=forms/repeat 改为可执行，不称其为生产 API 闭环。最初 fixture 漏 displayName 被现有选择器正确拒绝；补齐契约后才取得产品 RED。

[现有 input-delivery H5 套件](../../tests/h5-main-mock/input-delivery.spec.ts) 新增 number/digit 两例，真实键盘操作：初值 12 → 实际保存 → 全选替换为 '-' → DOM badInput=true；修复前两例均在“完成按钮必须 aria-disabled=true”失败，实际 false。修复后保存/完成均禁用且强制点击不增加任何 command；修正 14 可保存；另检查明确清空再 '-' 零命令，修正 15 后保存并打开确认框，再次负号输入立即撤回确认资格、强制确认零命令；取消后修正 16 再保存及完成。ledger 精确为 save12/save14/save15/save16/complete，无 NaN、伪造负号值、外连或页面错误。两例首轮 GREEN 2/2，12.5 秒；已加入原 CI 执行的 input-delivery 文件，最终整组结果见本批交付。

后续批次最终验证（含确认框与数字字面量回退）：input-delivery 11/11 PASS（38.4 秒），正常报价输入 7/7 PASS（46.8 秒），旧 R1 scalar 只读围栏与 Stage 2B 合计 2/2 PASS（24.3 秒）；各命令 exit 0。最终完整 Vitest 347 文件 / 6470 PASS，exit 0（其中本地 346 文件 / 6440 项，另有对象线原样 matcher 测试 30 项）；typecheck、boundary/module 负例自检、ownership、M1 I8、UI governance、源文件大小审计、链接及 whitespace 检查通过。静态绑定断言同步为“UI 有效性且原执行权限”；实际页面 SFC 加载器接真实 composable。移除已不反映接线的注释后，原先错误依赖注释文本的 Shell 测试改查实际 submitWorkspace 与预约分支调用；不提高大小阈值或隐藏源码。所有前述原生设备、生产和商业视觉边界继续有效。

额外数字字面量回退：number 的 1.5、digit 的 1e2 可被浏览器接受但被现有 R1 normalizer 拒绝。补接前两例实际 UI 分别仍为 1.5/1e2，与旧模型 12 不一致；仅 numeric AppInput 接入已有 reconcile-on-commit 后立即恢复接受值，不改 phone/ID。既有存活父 scope 的输入卸载测试及新增嵌套 scope 测试分别证明标记清理与业务局部隔离；子组件整体卸载后不再读取已停止的 computed 当作当前 UI 状态。

按主线程后续要求，[configured-record-edit](../../tests/h5-main-mock/configured-record-edit.spec.ts) 复用对象线 `963a2c8` 的 isWorkOrderInformationRead：严格匹配才返回合成 503；其原 FormDef 查询另外核对完整六参数、重复键、页码 1–4 及 URL，避免其他信息请求落入宽泛分支。H5 9/9 PASS（约 1.2 分钟），所有旧编辑/ACK/回读/权限断言保留。该 matcher 与其 30 项反例测试从 origin/main@0f16b0feea84b3ef055c5b5eac947750dd383ca1 原样临时读取作本地验证，不混入此提交、不修改对象线文件；集成依赖对象线 `963a2c8`。本地产品源码尚未同步对象资料批次，九例不宣称覆盖整合后的新增信息读取；该整合结果须由主线程后续 CI 确认。
