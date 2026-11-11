# 配置驱动动态图片表单：首片边界（2026-11-11）

基线为 `a3c6a462bd2fb2c0253a14b1451634a077bab456`。本片私有，未提交或发布；不导入 optional-infrared5。既有两字段真实保存及其失败/冷读证据是历史，不等于下面任意配置已经真实 Java/Mongo 验证。

## 复用与授权

复用 `r1-normal-file-values` 的完整元数据 schema、动态表单 runtime、条件求值、投影和归一化；复用同一个 fieldId 上传会话、持久队列、真实 picker/uni.uploadFile、URL/MIME 与回执校验。没有新建平行表单或上传引擎。`r1-configured-file-storage` 单独定义后台槽与 codec，UI 不以业务名称、图片字段数或固定 FormDef ID 选择能力。

新增明确授权版本 `version:4/profile:"dynamic-file-first"/operations:["create"]`。scope 仍精确绑定 tenant/user/role/workOrder/workflowRun/runtimeNode/formDefinition，fieldIds 与本次真实非 readonly 可写集合、fresh fillable 集合精确相等，数量为1–50，expiry 必须有效。需要已有 DEV loopback 写门和真实 reader 私有 proof；JSON、snapshot 标志、复制的 descriptor/proof 不能代替凭据。v1/v2 语义不变。历史 v3 profile 仍保留原授权范围，但其 normalizer、codec 与队列委托同一个共享引擎，不能因为本片而自动获得新字段。

新 v4 首片支持正常 repeat 容器的一次 first-create/saveOnly；初始及写前完整记录集必须为空。普通 forms 保留原精确 grant、完整 formList 和 upsert→updateExts 两阶段协议，不把单次 upsert 假称已完成 forms 关联，也不把 v4 当作其第二写授权。已有编辑、append、complete、Process 和其他业务命令不因此开放。

保留50元数据行和50提交键的现有边界。全部行先检查唯一 fieldId/valueKey、权限和已知语义；不先过滤 readonly/隐藏/未知行来凑数。行51、未知类型/provider/规则或冲突仍拒绝，不证明 canonical59。

## 存储与空值

固定来源为 backend `5fc008d32e771205260f120621c1c4fc62d0824e`：

- [ExtFormServiceImpl.java](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/biz/ExtFormServiceImpl.java)：首次创建先处理 survey/inspectionAppointment，再判断 type0。因此 type0+这些特殊集合不能作为普通 Map 证明；serviceAppointment 查询脱敏集合也不开放。
- [Survey.java](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/entity/basic/Survey.java)：29–30的 surveyDrawing/infraredImageList 是 List<Map>；20–26是已声明 Double 属性，memo/surveyTime 是 String。它们是后端 ABI 类型，不是 UI 表单定义、成对字段、required 或 max 规则。
- [ExtDataEntity.java](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/osg/entity/ExtDataEntity.java)：exts 为 Map<String,Object>，getter 在 null 时初始化，没有字段名 allowlist。

普通非特殊 type0 的配置键可用于 Map。preset1 保留 root，preset0 沿既有 wire 同时保留 root+EXTS，必须逐槽相等。typed Survey 的未知 root 不能写；任意非声明名的 preset0 键由 EXTS 保存、未知 root 副本应消失。若键本身对应已声明兼容的属性，codec 验证其实际 root/EXTS 双槽。已声明数值/String 根仅按已核类型绑定；后台自动覆盖的身份、联系与来源属性不是普通可写根。

surveyDrawing 的 List<Map> 只证明存储形状。只有普通 file 元数据且无专用工具要求时才使用共享 picker；surveyTool、componentType、自定义工具及未知配置仍在上传前拒绝，不能由名称或 DTO 类型推定工具权限。文件配置仅支持已知 max 与显式关闭的 surveyTool；标量额外前端配置在本首片未核即拒绝。

optional 真缺失或合法 `[]` 归一化为省略，wire 不提交 `[]`；required 不可省略。own undefined、null、畸形对象/混合数组分别拒绝。省略后的 raw ACK/query 必须严格无该键，不把 null、空串或空数组当成等价成功。旧 v3 已知 null 只读契约单独保留，不全局制造 `[]`。存在本会话 hidden/pending/失败/不明/已上传任务时，省略字段不能绕过队列核验。

图片 max 为已配置0–10，默认10来自已核 R1 普通 file uploader 与 wire 上界；max0 不可选图，选填可省略，required+max0 不可保存。超过协议界限不静默放大。PNG/JPEG/WebP、原 File 元数据、严格 HTTPS 回执与签名 URL 原字节规则沿用。未知 fileType、专用媒体、相机水印、历史四键 path 值的新写入不开放。

首次保存比较 private raw original，而不是 EXTS-first 的 display values。冲突副本、丢字段、错槽、身份或 schema/required/max/preset/permission/source 变化均失败；写后失败锁 uncertain、不自动重放。复制 proof、外部换代、角色切换和迟到 picker/ACK 不复活旧会话。

## 字段类型证据清单

| 类型 | 本首片写入范围 | 证据边界 |
| --- | --- | --- |
| file | 默认普通图片，配置/fieldId/存储策略驱动 | 新 H5 覆盖改名、三图/一图、Map/typed EXTS、标量混排和错误 ACK；不是任意文件格式 |
| text/textarea/phone/IDNumber | 复用已有 scalar runtime 校验 | 新 H5覆盖 text；其余不是新路由真实后台验收 |
| number/digit | 有限数值与已有 scalar 校验 | 新 H5覆盖 number；typed 根必须有兼容 Double 声明 |
| date/time/datetime | 复用已有时间值契约 | 额外时间配置未核即拒绝；本片没有新真实 Java 日期验收 |
| radio/select（单值） | 已验证选项/来源，multiple=false | Radio multiple 数组继续拒绝；未修改另线负责的 values.ts |
| select multiple/checkbox/cascade/bizSelect/switch/rate | 不进入本首片 file+scalar schema | runtime/旧独立业务路径的登记不等于本片可写；不借 Radio 数组扩大权限 |
| image | 已有参考图只读展示，不是上传 file | 不把 image 变成普通图片写字段 |
| gap/title | 展示能力与写入分开 | 本首片完整 schema 不跳过它们来虚构已支持整表 |
| area/scan/addItem/button/bgImage/sort/download/map/data/evaluate/pushItem/dialog | legacy 分支存在，未证明本端完整实现 | 不为清单完整而新增控件、provider 或权限 |

## 验证与限制

基线正常 reader/provider/actions 实测 RED：5个目标配置失败、2个拒绝对照通过。第一轮普通 App H5为2 PASS/1 FAIL：memo 采用现有共享多行展示，harness错找input，1次上传/0写；原 trace 与日志保留。改用实际 input/textarea 控件并逐字段核重新读取，未改变产品守卫或超时。

当前正常 App 专测命令：`XLINK_H5_CONFIGURED_FILE_CREATE=true VITE_XLINK_ENVIRONMENT=test VITE_XLINK_R1_MP_UX_FIXTURES=false pnpm exec playwright test --config config/playwright/configured-file-create.config.ts`。所有身份/配置均合成，普通非 Mock App 实际 picker→uni.uploadFile multipart 被隔离截获，核实际文件 part 的78字节 PNG SHA、key、MIME；真实七牛/生产/Java/Mongo调用为0。配置使用独立编译/JSON/trace目录，默认 bundled Chromium；没有依赖私有.review接收端。

后续若接CI，需要独立 opt-in flag与 `test-results/configured-file-create/` 归档；本轮未改workflow或触发远端运行。最终组合计数与构建日志随私有冻结包交付。Mac已有64/26/38探针及69输入×两种DTO/Map投影属于独立零DB证据，故意包含非法输入，不是138次验证通过，更不是Mongo持久化。

不声称 full59、生产配置、原生、已有 typed 编辑、BSON 无损或 CAS。新配置真实 Java/Mongo链仍 NOT_RUN；此前两字段真实保存与其冷读/失败历史保持原样，不替代本片验收。


### 本次冻结树实跑结果

最终定向9文件569项通过；完整 verify:full 日志记录298文件4984项通过，随后 typecheck、工程边界及质量门禁完成。环境恢复后旧 shell session 已不存在，因此未补造该 shell 的退出码，也未重复全套。正常 App 新配置4项及既有兼容22项全部通过、0 skip；首次2通过/1失败的 harness 日志独立保留，不累计为新通过数。H5、微信、App三个 release-profile 构建分别 exit0（11.65/10.42/7.41秒）。所有产品、测试和配置字节在这些检查前冻结；本段仅在检查后补充实测说明。

新四例核实际浏览器 uni.uploadFile multipart 的78字节有效PNG、key及MIME；API与存储响应是合成拦截，不是物理对象存储、真实Java或Mongo。未知typed root在上传前明确拒绝，token/upload/save均0。现有图片恢复、旧typed首图、Survey条件、部位、预约与导航兼容用例均实跑。未经本片独立复审和后续具体发布授权，不将本私有候选称为产品release或远端CI通过。
