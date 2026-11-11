# 普通列标记兼容与独立附件只读解码

基线 `34102c11429d233ac9230e15f765c2098ca70cc1`；本片私有，不包含另行冻结的数组契约两文件，不发布、不调用真实业务。

## 源事实与反例

固定 backend `5fc008d32e771205260f120621c1c4fc62d0824e` 的 [ExtField.java](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/entity/biz/ExtField.java#L41)声明 `int customizeFlag = 1`，注释为自定义列标识；257–262为普通整数getter/setter。该源码没有将它解释成组件、工具、provider或写授权。只读全Java源检索仅发现这三处；固定 legacy `extForm.vue` 中无该名称，不外推为全legacy仓库不存在。

mapper把该结构标记投影为布尔presentation。此前 configured schema将true一律当定制控件拒绝，使正常Java默认五字段全部无法创建。本次只支持原始数值0/1（以及历史真正缺失）与映射false/true一致；不宣称后台int取值范围只有0/1。own undefined/null、字符串、boolean、其他整数/对象或raw/mapped矛盾仍拒绝。`frontEndConfig`未知键、componentType、url/params、surveyTool真实工具配置仍不因此放开。

两个独立Mac反例包提供的是纯合成业务的真实Java元数据与离线只读重放。最初正常App12真实响应、0token/0upload/0业务，仅证明入口被阻断；离线counterexample测试PASS表示成功复现拒绝，不是功能验收。Cloud完整保留fields/ext：默认customizeFlag1、空collectionName getter、import标记及所有字段ID均未删除，包装为 `tests/fixtures/synthetic-java-configured-file-metadata.json`。其中既有记录是明确合成值，不冒称真实保存或冷HTTP回读。

Cloud新基线4 RED覆盖默认标记和writes-off/no grant、old v3、old v4冷读。旧reader有效、private original仍有两数组，但mapper丢失任意EXTS file数组；旧v4还会触发无source拒绝。新专测覆盖真正reader→record projection，不只比较raw original。

## 最小修复与权限分离

共享完整schema增加只读验证模式：保留全部元数据、类型、provider/条件、preset、readonly与50行上限；读取不要求存在可写字段或fillable grant。写模式仍精确要求可写集合/fill权限，首次create、grant版本、receipt队列与存储策略不变。既有forms两阶段协议、v3、预约及历史路径未改。

readonly模式单独从当前已核Ext/ExtField解析存储与codec，完全不依赖写flag或grant。私有写source只在原有writeMedia+v4条件签发；只读snapshot不能取得currentSurveyMediaSource或create/edit/append/complete能力。未知typed root/工具/provider没有被推断为可写或可解码。

raw slots继续逐槽核对，Map镜像必须一致，typed未知root副本拒绝；严格HTTPS/文件wire/max、null和畸形数组仍拒绝。真实absence不构造[]；合法已有空数组保留为空值。若配置不支持解码，显示保持unavailable，不借mapper丢失值声称未保存。

新增WeakMap显示证据只在正常reader完成原文槽验证后绑定definition、record、schema/value seal及当前actor/listed-ID/lease。它只供显示，不被任何写grant/command消费；复制record/definition、metadata或node修改、角色变化和外部reload均撤销。证据支持任意已核file字段的附件数量及原文真正缺失，不靠Survey固定字段名，也不全局将undefined改为空。

`r1-record-read-fields`仅添加这个file显示分支；Checkbox/Cascade原显示函数及其已封存RED不在本片修复。

## 实跑与限制

新增compat专测36项，相关10文件654项、typecheck、boundary/dependency/config gates均exit0。此前4 RED、首次core GREEN与所有命令日志保留。已有configured unit新增两个默认标记创建正例和fresh标记变化拒绝，使用真实共享reader/queue/actions但synthetic传输。

正常App H5保留真实picker/uni multipart创建路径，在所有字段增加Java默认列标记。新增独立只读config分别以writes关闭/no grant和old v4 grant运行：普通登录/列表/节点读取两张任意EXTS图片，真实缺失spareAttachment、memo及width=0正常显示；重入正常页面再读，保存/编辑/选图按钮不存在，token/upload/upsert为0。所有API/存储响应均synthetic拦截，外网fail closed。实际终态及计数随私有最终报告记录；不把首轮和最终轮重复相加。

不重复完整5033或三构建：本次由精确源码、直接读写/legacy/表单回归、typecheck及正常App H5覆盖改动分支。没有后台、Groovy、CI、Mac环境或真实数据变更。新v4真实Java/Mongo创建/冷HTTP仍待Mac后续一次独立实验；full59、原生、生产、七牛、BSON无损及CAS未声明通过。独立审查与后续发布仍另行协调。

最终冻结树H5终态：无grant只读1、旧v4 grant只读1、配置创建4、旧v3首图2、普通上传1、队列恢复8，共17 PASS、0 skip，六条命令均exit0。首次轮与最终轮不累加。所有产品/测试/config字节在最终执行前冻结；本段仅后补终态说明。


## 独审后显示门禁修订（当前13路径）

先前11包的独立审查发现三处真实绕过：Map旧shape fallback、仅返回null而未永久撤销的显示证据、panel独立shape预览。Cloud实际RED为reader/projection5 FAIL/1 PASS及SFC panel1 FAIL，原包与日志不覆盖、不删除。

当前移除无证据Map fallback；观察到current=false、seal变化或回调异常后，record证据永久撤销。reader还使用共享的附件snapshot epoch，API isCurrent观察到无效也会永久撤销该epoch，恢复角色/listed-ID/原字节不复活旧对象，只有新load生成新对象可恢复。record/definition复制不继承证据。真实reader数据已经深冻结；可变value恢复攻击另用明确的合成记录直接测试实际证据模块，不谎称已修改冻结的真实record。

panel新增独立hunk，预览与文字使用同一份重新核验的projection unavailable门禁；不再单凭array shape显示。旧normal Map与v3 codec只有在真实reader已验证其route/codec的字段集合上绑定显示证据，完整原schema仍保留并封印；不会对未核或readonly未知工具字段制造已核absence。legacy null和历史额外键保留各自只读/不支持状态，不借此开放v4 null或编辑。

本轮最终47项compat、6项实际SFC panel检查通过；直接相关12文件692 PASS，typecheck/boundary/dependency/config/diff均exit0。最小正常App H5：无grant只读1、旧grant只读1、配置创建4、旧v3首图2、normal Map上传回读1，共9 PASS/0 skip；合法预览没有被全局关闭。没有full/build/真实业务重放。中间2 FAIL来自测试尝试修改真实reader已冻结values；另1 FAIL来自旧Map codec测试错误使用repeat而非forms，补全测试的forms/formList后通过，均留原始日志，未放宽产品路径。

本次比11包增加的两路径为R1NodeFormsReadPanel.vue与其panel lifecycle专测。另片修订后的数组两文件逐hash保全；Checkbox/Cascade formatter未改。新v4真实Java/Mongo仍NOT_RUN，等待独审后Mac一次实验；当前未发布。
