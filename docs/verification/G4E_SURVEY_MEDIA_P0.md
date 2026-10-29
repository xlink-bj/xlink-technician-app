# G4-E Survey Media P0 — Shared Durable Media Queue

状态：**基础设施实现完成，跨端设备验证与真实上传保持 PARTIAL/DEFERRED**。  
分支：`rebuild/g4e-onsite-inspection`  
Issue：`#21`

## 目标与边界

本轮建立的是平台级媒体基础设施，不是 Survey 专属上传队列，也不代表已经
允许 Beta/Production 上传或业务写入。Survey 的 `{url,name,extname}` 只由
`survey-form-codec.ts` 负责 wire mapping；Generic Dynamic Form Runtime 只认识
中性的 `MediaValueRef`。

机器合同：`contracts/beta/survey/media-p0-contract.json`。  
校验命令：`pnpm run check:survey-media-p0`。

## R1 / Backend source trace

- R1 `inspectionAppointment.vue` 的普通媒体路径先读取
  `back/super/file/upToken.do`，再上传 Qiniu；相机分支调用
  `biz/image/uploadAddLogo.do`。
- Backend `BackFileController` 负责 upToken，`ImageController`/`ImageServiceImpl`
  负责相机图片处理。`waterImage` 会按服务端当前时间生成水印，并依据
  `latitude/longitude` 做反向地理编码；新 App 不伪造地址、时间或水印结果。
- R1 发现的离线位置上报列表是位置上报队列，不是媒体队列。本轮没有把它升级
  成“R1 已有离线媒体队列”的证据。

## 通用运行时结构

```text
LocalMedia
  -> DurableMediaStorePort
  -> MediaQueueRepository + MediaUploadQueuePort
  -> UploadPort
  -> source_uploaded checkpoint
  -> MediaPostUploadProcessorPort（相机远端水印策略）
  -> confirmed UploadedMediaRef
  -> form/business codec
```

任务身份至少包含：`userId`、`workOrderId`、`workflowNodeId`、
`formDefinitionId`、`formDataId`、`fieldId`、`valueKey`、`localAssetId`。
任务状态为：

`queued → preprocessing → ready_to_upload → uploading → uploaded`，以及
`failed_retryable / failed_terminal` 两类失败终态。

本地资产和队列元数据分开存储。MP 使用 `uni.saveFile` 及保存文件元数据，App
复用同一 Port；两端的真实重启恢复仍需要设备 smoke，因此合同标为 PARTIAL。

## Form / retry safety

- 持久化本地媒体成功前不会启动上传。
- 没有确认远端上传引用，就不会把远端媒体对象写入 FormData。
- 必填媒体的 queued/preprocessing/ready/uploading/失败状态会阻断保存/完成路径。
- 同一任务 single-flight；已有 `uploading` 记录被视为含糊状态，转为
  `failed_retryable`，必须用户显式重试，避免重复提交。
- 成功保存表单后才 best-effort 清理已确认上传任务；清理失败不会把表单业务
  保存改判为失败。
- `serviceGoods/projPackage` 继续 `DEFERRED / NON-BLOCKING`，不以媒体能力为由
  重新启用。

## Photo evidence status

相册/文件选择路径当前可走 Mock/统一 UploadPort；相机路径只在具备真实定位和
`MediaPostUploadProcessorPort` 时才允许 remote location-watermark policy，不使用 `0,0`、假地址、
本地时间冒充服务端时间。`surveyDrawing` 是专用工具，当前明确延期为 DEFERRED / NON-BLOCKING，
不允许回退到普通媒体选择器或上传路径；
`infraredImageList` 保持独立字段且为 PARTIAL。

相机任务在 Qiniu 源上传前必须通过 `MediaPostUploadProcessorPort.preflight`。Real
坐标合同未解决时直接 fail-closed：不请求 token、不上传源图、不生成
`sourceUploadedRef`，但保留本地 durable media；Mock 路径通过同一 preflight 后继续。

## Verification and deferred items

已覆盖：队列持久化前置、恢复列表、任务身份隔离、单飞、retryable 保留、含糊
upload 不自动重传、显式 finalize/discard、location 缺失 fail-closed、Mock/Real
共用 UploadPort 边界。

仍未宣称：真实 Beta/Production/Qiniu 上传、`uploadAddLogo` 真实水印、设备重启
实测、服务端幂等性、离线位置上报集成、Survey drawing 工具、G4-F。
