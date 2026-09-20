# G4-E Survey Camera Photo Location + Remote Watermark Contract

本文件记录当前已核验的 R1 / Backend 行为和新 App 的安全实现边界。它不是实时生产
payload，也不授权真实 Beta/Production 写入。

## R1 flow

R1 相机路径是两阶段远端处理：

```text
本地照片
  -> back/super/file/upToken.do
  -> Qiniu 原图上传
  -> biz/image/uploadAddLogo.do
  -> 服务端生成新的带水印 Qiniu 对象
  -> Survey FormData
```

相册路径不经过 `uploadAddLogo`：本地照片上传 Qiniu 后直接进入 FormData。水印是
POST-upload 行为，不是本地或上传前的 `MediaPreprocessorPort` 行为。

## Backend flow and request

R1 调用 `biz/image/uploadAddLogo.do`，参数为：

- `qiniuImagePath`
- `address`
- `latitude`
- `longitude`

Backend 会下载源 Qiniu 对象、添加雨虹 Logo、反向地理编码、加入服务端当前时间和
地址，生成新的 UUID/file key，再上传处理后的对象，返回新的字段引用。

调用者传入的 `address` 不是最终水印地址权威；设备时间也不是最终时间权威。

## Coordinate conflict

R1 `common.osg.location()` 请求 `gcj02`，但 Backend 的反向地理编码实现先执行
`gps84_To_Gcj02`，说明其输入实现上按 GPS/WGS84 处理。当前结论是：

```text
COORDINATE_CONTRACT = CONFLICT_UNRESOLVED
```

新 App 不静默选择坐标系、不做自动转换、不声称真实 `uploadAddLogo` 已可用。当前
Uni location driver 继续如实返回 `gcj02`，坐标系显式随 evidence 传递。

## Source object vs final object

相机队列严格区分：

- `sourceUploadedRef`：原始 Qiniu 对象，表示源上传已完成；
- `uploadedRef`：最终业务媒体，只有远端水印处理成功后才存在。

源引用不会进入 Survey FormData。最终 URL 指向处理后的新对象，但 R1 证据显示
`name` / `extname` 仍来自原始上传 key；codec 因此保留中性引用中的原始 object key、
文件名和扩展名，同时仅替换最终 URL。

## Queue state model

```text
queued -> ready_to_upload -> uploading -> uploaded
                                  \-> source_uploaded -> postprocessing -> uploaded
```

源上传成功后，队列先持久化 `source_uploaded` checkpoint，再调用
`MediaPostUploadProcessorPort`。App 重启可以从 checkpoint 继续，不能重复上传源图。

在相机任务进入源上传前，队列先调用后处理器的 `preflight` 能力检查。Real
坐标合同未解决时，preflight 直接失败；不会请求上传 token、上传 Qiniu 源图或
生成 `sourceUploadedRef`，本地 durable 资产保留。Mock preflight 通过后继续同一条
队列路径。

`postprocessing` 中断时，`uploadAddLogo` 结果可能已经写入 Backend。由于该接口
每次生成新 UUID，且没有已验证的幂等键或 reconciliation API，运行时会进入
`ambiguous_postprocess`，禁止自动或通用重试。只有 processor 明确证明请求未 dispatch
时，才允许安全 retry，并从 `source_uploaded` 继续，不重复源上传。

## Current implementation status

- Generic `MediaPostUploadProcessorPort`：已建立。
- Deterministic Mock processor：已启用，走同一通用 queue。
- Camera location evidence：必须是实际 LocationPort 结果；拒绝伪造地址/坐标。
- Survey camera final ref：仅最终 processor 输出可进入 FormData。
- Album：无水印、无必需定位，原有直接上传路径保持不变。
- `surveyDrawing`：继续 `DEFERRED / NON-BLOCKING`，不进入 camera policy，不回退普通媒体。
- LBS check-in：不实现；它是独立 business command/process event。

## Why real adapter remains disabled

真实 `uploadAddLogo` adapter 被坐标契约冲突和缺少幂等/reconciliation 证据阻断。当前
Real path 只返回明确的 `coordinate_contract_conflict`，不会访问真实水印接口，也不会
进行 Beta/Production 媒体写入。合同机器检查见：
`pnpm run check:survey-camera-watermark`。
