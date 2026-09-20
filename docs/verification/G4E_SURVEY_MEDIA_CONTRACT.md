# G4-E Survey Media Contract

状态：在线媒体基础能力，Mock/测试路径；真实 Beta/Production 上传未执行。

## 证据边界

本合同只描述已确认的 Survey（勘查）媒体字段，不把 R2 视觉稿或
InspectionAppointment（巡检）字段当作勘查业务字典。机器来源是经过脱敏的
历史 Beta Survey ExtField 合同：
`contracts/beta/survey/historical.json`。R1 行为参考和 Backend Java typed
`Survey` 持久化共同决定媒体形状；没有活动工单、账号、电话、地址、会话或
token 写入本合同。

机器校验：`pnpm run check:survey-media`。

## 当前合同

- Survey 媒体字段：24 个，全部来自 `showList` 包含 MP 详情 code `4` 的历史
  Survey 行。
- 必填媒体：`surveyDrawing`、`images1`、`images2`。
- Backend 持久化形状：`List<Map>`，每个媒体对象至少有 `url`；R1 证据使用
  `name` 作为对象 key、`extname` 作为扩展名。
- 新 App 规范化形状：中性的 `MediaValueRef[]`，对象字段为
  `{ url, objectKey?, fileName?, extension? }`；仅由 Survey codec 负责映射为
  R1 wire 形状。本地路径、token、上传状态和
  平台句柄不会进入 FormData。
- `ExtField.multiple=false` 不被解释为标量；Survey 媒体仍按列表对象处理。
- 已证据数量上限：`surveyDrawing=1`、`infraredImageList=4`。
- 普通照片的单字段上限、Survey 全局照片聚合上限：`UNKNOWN`，当前不猜测
  R1 默认值或把它升级成业务规则。

## 字段专属能力

### `surveyDrawing`

R1 明确存在 `surveyTool` 专用测绘入口，并且 Backend 对 `Survey.surveyDrawing`
有 typed persistence。普通相册照片不能冒充测绘工具结果，因此新 Runtime 将
该字段标记为 `UNKNOWN_SPECIAL_TOOL` 并阻断普通 picker/upload。测绘工具协议、
绘制结果格式以及额外 `measurementData` 关系仍未被本轮实现。

### 普通 Survey 照片与除霉前后照片

R1 证明拍照/相册共享上传管线，Backend 证明 `images1`–`images20` 及除霉字段
进入 Survey 的媒体对象列表。当前在线基础实现允许经过统一 `MediaFilePickerPort`
和 `UploadPort` 的 Mock/库选择路径，上传、表单保存、workflow completion 是
三个独立阶段。相机水印依赖真实定位和 `uploadAddLogo`，尚未在新 App 打通，
所以能力状态是 `PARTIAL`，不能声称相机闭环完成。

### `infraredImageList`

R1/Backend 证明它是独立媒体列表，历史合同证明最大 4 项。设备导入/红外来源
语义尚未证明；当前只保留受控选择路径和数量前置校验，仍为 `PARTIAL`。

## 状态与安全边界

媒体状态至少区分：`picking`、`uploading`、`uploaded`、
`failed_retryable`、`failed_terminal`。上传失败不会写入半成品表单值；不会自动
重试含糊的上传或业务写入。必填媒体只有在 Runtime 可见、能力受支持且已有
结构化上传引用后才允许保存/完成；保存表单和完成 workflow 不会被媒体上传
隐式触发。

真实上传仍受现有 `VITE_XLINK_ENABLE_REAL_WRITES=true` 安全闸门保护，默认不
访问真实 token/provider。R1 的 token 请求使用文件名；Qiniu provider 返回 key
时，新适配器从 token/配置的下载基址构造引用，否则保守失败。真实下载基址必须
由运行时配置提供，不能在业务 Vue 中硬编码。

离线媒体队列、重启恢复、后台上传、全局聚合上限、真实相机定位水印、测绘工具
协议和 Server 幂等性均明确 DEFERRED/UNKNOWN。
