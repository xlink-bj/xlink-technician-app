# R2 普通 All 授权撤销与晚响应：正常 App H5 回归

## 测试树与证据层级

基线 `main@c71138508fafc84081cf9fc6581d2b3f5a8e9bda`，叠加已冻结、未提交的 Survey/duplicate-file 12 文件（完整 patch SHA-256 `43099a17bdb7910deec261ed4c8e3cabbc9586f2d632dbadd6d0f5c2240da8af`）。这12文件逐项哈希保全，本片不修改它们，只新增本说明、一个 spec 和一个 Playwright config。

SOURCE：`R2_AUTHORIZED_ALL_SCOPE_20261108.md`；`tests/engineering/work-order-authorized-all-scope.test.ts` 的33项；`src/adapters/api/technician-api.ts` 的 fresh菜单解析、`bindListQuery`、listReadVersion及listed-ID门禁；`src/features/work-orders/list.ts` 的clearList/loadVersion、失败清空及page-one retry；正常 `work-orders.vue` 的标签/搜索/分页入口。前述文档中真实会话/后台只读证据属于既有历史，不是本轮重新验证。

本轮实际运行 canonical App、正常快捷登录→主页→列表/详情，没有注入store、session或ACK。API由Playwright浏览器路由全合成拦截。`VITE_XLINK_ENVIRONMENT=prod` 仅选择现有只读安全分支；API地址严格为 `http://127.0.0.1:5323/xlink/wm`，不是生产地址。菜单使用 `function/queryTreeByRoleId`，不调用changeRole。合成登录凭据是固定零值，不读取真实凭据。外部HTTP/WebSocket与未知API均失败关闭；真实业务写、上传、Workflow、部署均未执行。

## 十个独立场景

1. fresh角色同时有todo菜单及精确裸普通叶菜单：正常“全部”只发普通query，完整固定page/rows/createTime desc/state=1；不传orderState=all或tenant/归属旁路。
2. 第二页前撤掉裸普通菜单：旧列表清空，不请求todo第二页；用户点击重试从todo第一页开始。
3. 第二页前将普通菜单改为带status的受约束协议：同样拒绝拼页，从第一页明确恢复。
4–7. 分页或菜单响应各有成功/503失败两种迟到：先通过正常标签和搜索取得新结果，再释放旧响应。新结果、分类、搜索保持；点击新结果仍能正常读取精确ID详情，证明新listed-ID未被旧请求撤销。旧菜单迟到不会产生旧普通第二页请求。
8. 正常浏览器返回主页→退出登录→再次正常登录：释放旧分页后，不污染新会话列表。
9. 正常访问已列出的详情、返回列表后菜单撤销，再通过浏览器前进旧详情：显示权限失败，不重发旧ID详情请求，不显示旧详情内容。
10. 先正常加载第二页并访问第21条，返回后通过正常标签重建第一页，再挂起旧第二页、切换分类/搜索，再释放旧页；浏览器前进曾访问的第21条仍被拒绝，无新增该ID详情请求，证明旧页成功不能重新授予旧ID。

列表与详情同时检查body和URL query，不仅检查body；菜单固定POST与精确roleId query，详情body/query均空。延迟由测试等待真实请求到达的gate控制，无sleep/force或内部handler调用。释放后等待response.finished与渲染帧；时序事件表示网络完成及渲染检查点，不冒称应用内部“消费完成”信号。

## 执行及工件

- `PATH=/workspace/.cloud-tools/node_modules/.bin:$PATH VITE_XLINK_ENVIRONMENT=test pnpm exec vitest run tests/engineering/work-order-authorized-all-scope.test.ts`：33项实际Vitest。
- `PATH=/workspace/.cloud-tools/node_modules/.bin:$PATH PLAYWRIGHT_BROWSERS_PATH=$PWD/.review/browsers XLINK_H5_AUTHORITY_REVOCATION=true pnpm exec playwright test --config config/playwright/work-order-authority-revocation.config.ts`：专用430×932实际H5。
- 默认发现：同一Playwright命令改为 `--config config/playwright/main-h5-mock.config.ts tests/h5-main-mock/work-order-authority-revocation.spec.ts` 且不提供专用开关，必须SKIP，不能混入默认Mock运行。
- `VITE_XLINK_ENVIRONMENT=test pnpm typecheck`、`pnpm check:boundaries`、`pnpm check:config-layout`、`git diff --check`。

精确最终计数、退出码、每例请求及时间戳见独立本地工件 `.review/work-order-authority-20261110/` 中summary/manifest、日志和patch。实际截图/trace位于 `test-results/work-order-authority-revocation/`。探索8项、9项与最终10项运行分开保留；第10项首次脚本误以为返回会把40条缩至20条，实际页面保留分页，已改为正常标签重建第一页，原前置条件失败日志保留，不相加当独立场景数。独立审查指出的query参数及旧ID复活两项测试证据缺口已补专门断言/场景，不是已复现的应用缺陷。

## 范围限制

没有发现需要修改应用业务源码的缺陷。Mock/全拦截H5 PASS不证明真实R1后台撤权、数据权限或并发行为。没有运行真实Java/Mongo或生产/Beta；没有角色切换UI入口，因此role-switch NOT_RUN，正常logout已覆盖。未重跑不受影响的3795项全套或构建；不能把旧12文件通过记录当本片新证明。本片未新增CI workflow步骤、未dispatch CI，也未stage/commit/push/PR/公开上传；既有发布拒绝保持有效。截图和trace仅保存在本机，不公开上传。
