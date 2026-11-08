# 媒体上传回执存储失败后的页面恢复

## 范围和证据级别

初始基线为 `27a6b73ede13989acc774c6376c5cb837cec2ed8`；最终组合基线无损快进至 `a144ee465670f19f05f4a03f71192a80f998fa37`，保留其 AppTextarea 六文件改动，未修改共享输入。本批只修已有媒体队列与正常 Action Workspace 的接线及状态显示，不改表单业务保存、完成、后台或权限。

实际复现使用正常 App 的 DEV synthetic journey → 预约本机草稿 → 勘察 Workspace → 系统文件选择器，文件为测试内生成的 1×1 PNG。Mock 上传只生成内存合成回执；浏览器仅放行本机 App 静态资源和 Vite WebSocket，合成缩略图在 Playwright 内响应，其余请求失败关闭。没有真实文件上传、生产/Beta/Java/Mongo请求或业务写入。Mock 结果不证明生产等价。

## 已确认的前端缺陷

上传接口返回后，若最终 `uploaded` 元数据写入本机存储失败，持久队列正确保留之前的 `uploading` 检查点。底层 `MediaUploadQueue.processExclusive` 已将重新遇到该状态定义为结果不确定：只持久化 `failed_retryable / ambiguous_upload`，不调用上传端口，也不允许重试。

但 `restoreActionMediaQueue` 原来只把 `postprocessing` 检查点交给上述恢复逻辑，遗漏 `uploading`。正常 App 刷新后一直显示“正在上传…”。另有状态投影和媒体按钮判断只识别 `ambiguous_postprocess`，因此已被底层禁止重试的 `ambiguous_upload` 仍可能显示“上传失败，可点击重试 / 继续处理”。这属于前端恢复和显示缺陷；没有证据表明底层保护已被绕过或发生生产重复上传。

源码证据：

- `src/runtimes/media/media-upload-queue.ts`：`processExclusive` 的 `uploading`、`postprocessing` 分支，及上传前后检查点写入。
- `tests/g4e/media-receipt-safety.test.ts`：`does not replay %s ACK when its following checkpoint write fails`，已有运行时禁止重放证据。
- `src/features/work-orders/action-workspace-media-queue.ts`：`restoreActionMediaQueue`、`resumableActionMediaTasks`。
- `src/features/work-orders/action-workspace-media-projection.ts`：重试能力和状态提示。
- `src/features/work-orders/components/GenericDynamicFormActionContent.vue`：媒体选择及恢复入口。

## 最小修复

恢复时仅将已有 `uploading` 和 `postprocessing` 检查点交给队列的未知结果标记逻辑；没有扩大到自动处理 queued/ready/source/failed 任务。调用前后的当前编辑器 scope 守卫保留，迟到结果不能写入新编辑器。状态投影直接复用实际派发边界的可重试任务筛选，避免两份允许规则漂移。媒体入口同时识别两种结果未知状态，不提供重试或重新选择以掩盖未决结果。

未改底层上传实现、持久队列协议、上传次数、真实业务保存或媒体绑定逻辑。已知失败仍需用户明确重试；结果未知不能自动或盲目重传。

## 红绿验证

- 正常 App 修复前红例：最终上传回执写入一次性抛出 `QuotaExceededError`；刷新后断言“结果待核查”失败，实际“正在上传…”，进程退出 1。
- 定向红例：上传未知状态的重试投影、提示、检查点恢复及恢复后 scope 撤销保护，共 4 项失败；19 项原测试通过。首次测试脚本用了当前 Vitest 不支持的 matcher，已单独保留该错误，并以支持的次数/参数断言重跑确认 4 项行为失败。
- 定向绿例：8 文件 156 项媒体回归通过（退出 0），含 94 项底层回执安全测试。最终组合基线按 `VITE_XLINK_ENVIRONMENT=test pnpm verify:full` 验证：255 文件、3273 测试全通过，typecheck、仓库门禁和 quality 检查通过，退出 0。
- 新增正常 App H5 `tests/h5-main-mock/media-interrupted-receipt.spec.ts`：结果未知刷新恢复和明确失败后的显式重试两项。最终组合树两项全部通过（退出 0）；每项 App 静态资源请求 1156，外部/未知请求和页面异常均为 0，缩略图合成响应分别为 0/2。前者同一任务 attempts=1，连续刷新不重传、不绑定未确认图片、不提供重试；后者同一任务 attempts=2，文件选择器仅一次，刷新保留已上传预览。

完整门禁第一次因新增测试 stub 返回类型不够精确而失败（退出 2），修正测试类型后，未设置 `VITE_XLINK_ENVIRONMENT` 的运行出现既有报价 Mock 7 项失败（未知环境按规则禁用 Mock，退出 1）；保留两次原日志，不修改报价或延长超时。项目此前验证记录要求 `VITE_XLINK_ENVIRONMENT=test pnpm verify:full`，最终组合树按此配置验证。

本地原始证据保存在 `.review/media-recovery-27a6b73/`：`red-results.json`、`red.log`、`red-attachments/`（截图/trace）、`unit-red-corrected.log`、`unit-green.log`、最终 H5 JSON/trace 和 `verify-full.log`。这些是执行器本地证据，不是用户可直接访问的外链；本批不上传证据。

## 继承限制和后续事项

结果未知被保守锁定并保留本地文件，但目前没有面向真实上传服务的权威回执查询/人工核销入口；本批不伪造成功、不删除未决任务，也不实现后台幂等或事务治理。后续可在真实服务契约明确后增加受约束的回执核查，不能直接解锁自动重试。

本批浏览器证据针对勘察图片字段及上述检查点故障；通用附件文件、相机/原生端、真实水印、真实上传服务、所有 IndexedDB 故障、所有离页/账号变化时序没有因此完成浏览器验收。既有 scope/迟到回调与存储故障测试只按各自证据计入，不当作本次新增浏览器覆盖。
