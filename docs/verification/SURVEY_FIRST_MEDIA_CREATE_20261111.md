# 受限 Survey 首次图片 saveOnly（2026-11-11 验证）

本片在 main `cf4a0d925fe0769ff71ec516cb0482dac1111dc0` 集成，随后基线前进至仅包含8项搜索测试修复的 `a0ed23978d5c8adb5cb9fce9ac8974efc4aa6e99`；在其上继续验证原14文件及独立审核的DTO四文件修订。五个既有源码基准逐字吻合，保留已发布的通用图片、条件Survey、预约和历史能力。本说明区分本轮Cloud组合验证与Mac已完成的隔离真实证据；它们都不代表生产或七牛链。Production/Beta、真实Qiniu、签约和Process保持关闭。

## 窄能力与来源

仅 repeat、明确 Ext.type='1'/colName='survey'、精确租户/定义/字段/current lease，初始及保存前完整 scoped 记录均空。仅首次 saveOnly；已有记录、edit/append/delete/complete/save_finish 一律关闭。独立 grant version3/profile='survey-media-first'/operations=['create']，旧v1/v2语义保持，不能借generic/type0凭据。

只支持**新建的完整合成两字段配置**：infraredImageList 为 root/preset1/required='0'/max4，images1 为 EXTS/preset0/required='1'/显式合成max10。两者 static showType1、相同移动端showList、无provider、calculateConfig显式空、明确raw状态/操作权限、DTO启用/只读规则和空EXTS规则。原59的images1 frontEndConfig实际为{}，没有捕获max；这里的10仅是本片新合成安全上限，受既有wire cap约束，绝不是已恢复的原images1配置或已证该业务分支默认值。原calculateConfig/权限UNKNOWN不会补空获权；原{}和缺失calculateConfig测试均拒绝。

测绘图 surveyDrawing 需要专用工具，不允许普通图片替代。两字段仅相册选择；相机水印后处理不在本片。当前首次命令只认证两个非空成功上传列表的组合：红外字段元数据仍为选填，但 optional absent/null/[] 的 typed 持久化策略未获证，三种输入分别拒绝，不宣称保存了空数组或等价回读。这是候选能力限制，未修改原业务字段必填规则。

R1固定serviceAppointment来源中18张规则具有精确旧FormDef条件，并排除两种root图片；不推广为所有type1后端规则。本片只有images1 max10，因此不能声称真实集成已覆盖18临界或整59表单。

## 信任、交错和回执

reader仅从完整raw Ext+字段配置及对应快照签发私有WeakMap proof；snapshot标志、克隆对象、readonly投影及generic proof不是授权。frontEndConfig使用已有strict decoder，重复JSON键直接拒绝。观察到schema/actor/grant/proof失配后，旧lease/provider永久撤销，恢复字节或重新读取不复活旧provider。

本次动作自己的fresh read有reader私有、精确generation的pending renewal。canCreate/projectFields/validateDraft/media.ready在合法pending期只观察状态，不将reader暂时清current误判为失权。外部reader换代、actor/grant变化、旧proof失效仍永久拒绝。正式测试保留延迟读取红例及grant-loss/external-read对照。

复用generic严格图片URL、真实picker、持久queue及取消/重试/本地清理。typed session具有独立实例epoch和来源授权；只接受该实例enqueue后实际process/retry成功、当前fieldId/lease归属的精确回执。缓存uploaded标志、任意URL、跨实例/字段、重复key、迟到/取消/不明结果不能获得保存资格。

保留R1现有wire：preset0值在请求同时有root和EXTS副本；typed Survey构造会丢弃未知root。合成测试模拟此SOURCE行为，另有下述独立真实Java证据，二者分开计账。写ACK和fresh原件则必须是typed canonical root infraredImageList/EXTS images1；双写残留、错槽、ID/租户/关联不一致均拒绝。失去ACK或回读失败保留uncertain，禁止自动重放。保存成功与Workflow完成始终分开。

## 验证层级

- 单元：真实normal reader、共享真实持久queue、私有proof及synthetic command/read transport；不等于Java写入。
- H5：430×932真实App正常登录/工单/repeat/picker/queue/保存与重新进入，所有业务和上传响应由Playwright完全拦截。无route.fetch，不到达外部provider/Qiniu。成功和ACK冲突分别截图。
- 独审：原14及DTO4已分别独审；DTO修订独立21例和69动作例共90检查通过。此为所审字节的窄结论，不自动扩展到完整产品。
- 真实协议：Mac在全新隔离Java/Mongo/Redis与合成loopback存储中已完成下述首次保存和冷读；该次写入预算已消费，本Cloud组合不重放。
- 商业视觉、原59整表、生产写入、原生验收均未签收；不公开提交、不push、不部署。

## V1 实际 HTTP 发现及独立修订

全新隔离V1的真实Java读取中，ExtField响应省略enabled/readOnly，因固定ExtField extends DataEntity不声明它们；不是状态或可编辑授权被后端否定。V1原候选在0上传/0写入下fail-closed。修订仅允许这两个已证DTO字段缺失；显式值仍分别严格要求数字1和0，null/boolean/string/矛盾值拒绝。正向state1、operationType1、type1/survey、精确raw字段、node fill/readonly、私有proof/current lease、独立create-only grant保持不变，不以缺字段本身推定授权。实际DTO形状红绿测试与显式矛盾负测单独验证，原14文件包及V1日志不改。该修订已独审通过，并已用于下述真实隔离首次保存。原V1的0上传/0写入失败仍保留。


## 已封存的 Mac 真实窄链

最终正式报告状态为首次图片保存及冷读通过，同时保留首个导航harness未完成。正常App产生58次浏览器API：56次真实Java响应、2次合成token响应；另有2次实际loopback multipart上传（每张为有效78字节PNG），仅1次Java upsert，其他业务命令、Process均0。正常登录3次，同返回ID的typed root infraredImageList及EXTS images1准确保存，root images1副本不存在。

首个create driver在成功ACK、权威回读和已保存UI都验证后，返回列表再进入的harness等待按钮超时，因此该合并driver不记完整PASS；未重复上传或保存。另起正常登录的只读重入、同库全服务冷重启及冷登录回读分别通过，仍是同一记录。16→17对象仅新增一条Survey，旧15份rawBSON除Account外保持；停服重启17份rawBSON完全一致。首次登录为Account补默认/角色/归属/审计元数据，后续登录仅updateTime，不将所有Account变化简写为时间戳。

来源为正式FINAL_REPORT.json（SHA256 `69a5be1d1262641fdd61b5aa3dd4469be254ba24880b6bd1ced1b77ad8f69b9f`）及CREATE_BSON_AUDIT/RESTART_BSON_AUDIT/COLD_LOGIN_BSON_AUDIT。图片字节存储是合成provider；Java认证、typed metadata persistence、读取及Mongo审计为真实本地执行。它不是原始完整后台构建/生产认证，也不证明BSON/CAS普遍无损、原59完整配置、已有编辑、append、complete、空值等价、原生或真实七牛。

## Cloud 当前组合验证

本轮只在上述main基线合成运行，未重放Mac真实业务。独立H5配置默认使用随Playwright安装的Chromium，可显式指定本地可执行文件；独立编译、JSON和trace输出互不覆盖。CI仅增加两例的专步与专用归档，旧步骤、权限、条件、并发和预算不变。实际组合结果随冻结交付日志记录，不能预写为远端CI通过。


Cloud在上述媒体候选最终源码上实际完成：12文件680项定向单测；一次verify:full，297文件4921项全量单测及typecheck/工程门禁/质量检查；正常App合成H5共22项（本片2、generic媒体9、conditional3、navigation2、appointment3、part3），全部通过且0skip；H5/MP-WEIXIN/App三个release-profile构建全部通过。测试PNG完整像素解码为4×4、78字节，与正式真实报告图片SHA一致。相同工作区中已发布的8项测试修复逐字保全，媒体产品代码与已审14+DTO4字节一致。

媒体候选与本专用CI步骤仍私有未提交；没有本媒体候选精确SHA的远端CI结果，也未新增真实业务、原生或真实七牛验证。430×932已保存只读展示截图仅用于本地检查，不代表商业视觉验收。
