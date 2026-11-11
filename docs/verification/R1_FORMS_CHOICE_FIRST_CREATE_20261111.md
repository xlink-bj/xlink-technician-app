# 普通 type0 多选首次新建

基线 `ee80d40cd07f654812951c64c703b4d2840709db`。本候选私有；仅正常 forms 节点、非特殊集合、零记录首次创建。任意字段名由完整 Ext/ExtField 决定，Checkbox 与显式多选 Select 使用同一 Code/值合同；不添加业务名 profile，不代表原59配置、typed既有记录或生产验收。

## 固定来源和本地合同

- 固定 backend `5fc008d32e771205260f120621c1c4fc62d0824e` 的 ExtField.java15–41声明 type/valueOption/preset/multiple/required、条件与 operationType。multiple 是 boolean，Checkbox 不要求 Java 的 multiple=true；Select 必须明确 true 才走本片数组分支。
- 同版本 ExtFormController.java44–52从 dataStr 解 Map，以登录 Account tenant 覆盖租户。ExtFormServiceImpl.java在特殊 survey/inspectionAppointment 分支之后203–241处理严格字符串 type=0 的新 Map，321–323保存并返回整 Map。该源码支持 JSON List 的 Map 表示；不单独证明业务授权、CAS、BSON无损或脚本无副作用。
- 固定 legacy `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` 的 extForm.vue345–371以 checkbox-group 发数组，1844–1852把整份 formData 作为 dataStr。201–225及其 action-sheet 路径的 Select UI 不能拿来冒称 legacy 多选交互验收。本次多选 Select 使用本仓库现有共享多选控件/runtime，Map存储合同和严格Code读绑定分别验证。
- 现有 `r1-field-storage.ts` 保留 root，preset=false另复制到EXTS；本片不改它。既有 `r1-special-workflow-wires.ts` 的字符串数组上限30、元素256和字段50作为本客户端安全边界；不称后台容量上限。

## 来源、授权与边界

reader复用一次既有Ext和完整字段读取，无新增HTTP。独立WeakMap来源证明只在同租户、严格Ext.type字符串0、完整字段collection身份一致、非survey/inspectionAppointment/serviceAppointment时签发。proof绑定当前snapshot/schema/node/records、actor与listed-ID；复制无效，观察到失效后旧proof不能恢复，fresh正常load才可恢复。它只是读事实，不是写grant，也不复用媒体专属route。

首片只接受既有 v1 forms精确 create-only grant：完整fieldIds与node fillable集合一致、时效、tenant/user/role/order/run/node/definition及reader lease全部保留。v2、repeat grant、媒体/预约grant不作为本能力。只支持最多50行的完整已知schema；无未知行过滤，无readonly伪装，未知控件/provider/Cascade/file混排保持拒绝。普通旧scalar、大表单、媒体、typed及预约路径保持原合同。

raw preset为0/1、required为字符串0/1、multiple为boolean、operationType精确1；Java默认customizeFlag0/1仅列标记。空frontEndConfig允许缺失/null/空串/空对象；未知工具配置、计算、router及非空roleIds语义未核，拒绝而不忽略。readonly别名矛盾拒绝。只读/条件/未知规则及选项仍经真实mapper/runtime，scalar混排沿用既有规范化。

## 数组与新建草稿

只接受精确Code选项中的非空有界字符串ID，最多30；不得trim、去重、猜标签或将数值/boolean当ID。空白/control/超长、未知ID、重复、混合、嵌套/对象/null及own undefined均拒绝。可选真正缺失或[]按现有runtime省略，不发[]/null；required缺失/[]拒绝。全部省略且无其他有效字段也拒绝。草稿数组在提交前克隆/冻结，保存期间原调用者修改不会改wire。

新建选择值变更仅在这个已支持schema/零记录draft分支移除变为隐藏的字段；writer仍独立拒绝手工夹带隐藏值，不清理既有记录。旧scalar-only条件问题不是本片全局修复。UI多选控件按provider选项顺序输出；直接传入的合法数组保持其顺序，ACK/readback必须同序。

## 保存与后验

保留 upsert → fresh read → 完整 workflowNode/updateExts → exact query readback 两阶段协议。第一次ACK必须带完整声明字段槽和scope值；原始root/EXTS逐字段比较，包括可选省略。最终依reader私有原文核slot/镜像及完整EXTS key集合，不能用mapper优先EXTS掩盖冲突root。数组按字符串内容及顺序比较，不用对象引用比较。完整formList与未知node EXTS保留，最终ID和数量精确；full EXTS替换仍无跨客户端CAS。

多击、迟到身份/列表/配置变化、失ACK、矛盾ACK或后验失败锁定不自动重发。首次成功后不能借本凭据edit/append/complete/save-and-complete；Process/upload/delete等未开放。真实后台可能执行自身配置脚本，本片只跑合成拦截，不宣称后台无副作用。

## 验证记录

初始正常reader/provider RED为1 FAIL：授权已取得但两数组行不支持。首次实现后的失败是合成transport误读updateExts的jsonBody，已修fixture并保留日志。首轮H5四例均因将UniApp generic选项当role=button定位而失败，0业务命令；改为实际共享多选元素定位后原断言保留。

候选最终执行结果见随包精确命令与日志。先前51新专测、10文件554定向、正常choice4/图片1/配置媒体4/预约3 H5通过；之后仅收窄新route的roleIds/计算/router未知行为并增加对应负例，再在最终冻结树运行一次完整验证和三端构建。不将旧执行冒充新树结果。该早期阶段普通真实Java/Mongo数组保存尚未执行；后续窄真实链见文末。clear、typed array writer、跨客户端CAS、原生和生产继续未验。本片未提交、推送或改CI；专用H5配置为forms-choice-create.config.ts，opt-in为XLINK_H5_FORMS_CHOICE_CREATE=true，输出test-results/forms-choice-create/。


最终封包前另补两组真实RED：旧action在观察角色/列表撤销后恢复会复活（2 FAIL）；已成功创建的scope在后续合成列表变空时可再次创建（1 FAIL）。新增sticky action撤销（自身受控fresh read的临时换代另行处理）及本create-only receipt持久消费，均不Process节点、不改媒体或旧scalar锁语义。对应新专测最终57 PASS；最终冻结源码verify:full为302文件5192 PASS、exit0，包含typecheck/门禁/quality，三端release build均exit0。最终H5为choice4＋普通图片1＋配置媒体4＋预约3＝12 PASS/0 skip。较早10文件554定向、54/56阶段结果及5189全量保留为历史，不与最终计数累加。

首个无VITE_XLINK_ENVIRONMENT=test的全量实际7 FAIL/5182 PASS，原因是既有quotation Mock门禁关闭；按CI精确test环境单独核两个失败文件25 PASS，未改报价源码或断言。纠正环境后的较早源码全量5189 PASS，随后因上述真实授权/receipt修复失效，才在最终冻结树重新完整验证5192并重建。所有原失败保留；不将构建/单测等同真实Java/Mongo。本段仅在检查后填结果，产品/config/test字节未再变化。


后续协调新增的raw→wire条件反例已在当前helper做私有纯draft探针：trim控制值和空串省略后exists(false)重现两例均实际FAIL。writer仍拒绝不一致值，不代表draft更新原子安全。因此初版NOT RELEASED；该包及日志不改写。随后按协调指令只修本choice-create的稳定性，未接入或重造Mac的scalar helper，见下节。初版通过的5192/12H5不覆盖这两例。探针配置merge保留了基础include，实际只有2例执行失败，其他302文件/5249例仅发现后跳过，不能计PASS。


## 当前 choice-create 稳定性修订

先在同一实际reader/provider、normalizer和draft updater补回归：trim导致required依赖重现、空串省略改变raw映射exists(true)、以及pure schema的exists(false)，共3 FAIL；不完整required草稿对照1 PASS。修复仅在本helper收集已验证条件的controller字段，用现有Runtime normalizeSubmission的同一codec/省略规则投影controller wire值（仅临时关闭required以允许未填完整草稿），再比较完整schema的visible/readOnly/required/capability。raw与wire状态不同或隐藏清理本身改变状态，一律在构造新草稿前抛错；原对象及数组不改。没有放宽writer、替换normalizer、清除已有记录或给所有forms接统一scalar callback。

当前普通mapper的showType2/$exist仅产生exists(true)，不产生false，因此exists(false)是实际pure normalizer/updater seam的明确复制schema测试，不作为reader授权或实际UI来源证明。另有真实raw showType2的empty-controller回归和正常页面用例，覆盖可达的反向状态变化。当前修订模块61 PASS，相关6文件360 PASS，typecheck、boundary、dependency、config、diff均exit0；正常App H5扩为6 PASS/0 skip，新增trim/empty两例通过原页面事件，拒绝更新后多选状态保留，合法保存wire仍为原memo=on。所有请求仍合成拦截，0外网/未知API/上传/Process。

初版302文件5192 PASS、12 H5及三构建仅属于稳定性修订前的源码；本次按协调要求只补定向/typecheck/gates/受影响H5，未再全量或构建。提供初版→本版四路径delta及相对ee80完整十路径patch。初版Library版本和失败历史保留；这是当时十片修订的待审状态；后续B2/安全修订独审和普通多选真实链见下文。尚未公开提交。

## 最新组合验证（文档收口）

B2 corrected19 和 Switch/Rate8 已分别独审为 RELEASE_PRIVATE_CANDIDATE；UI11 也已独审为 RELEASE_PRIVATE_CANDIDATE。这是私有工程候选审查，不是公开发布、商业视觉或真实后台全域验收。旧十片/原19阻断、raw→wire反例、pending撤权和B2选择域失败及其修订记录均保留，后续结论不倒写早期运行。

最终组合37路径在文档收口前执行 `VITE_XLINK_ENVIRONMENT=test VITE_XLINK_ENABLE_REAL_WRITES=false pnpm run verify:full`：307文件／5397单测PASS、exit0、85.51秒，含typecheck及现有边界、依赖、质量门禁；微信和App构建分别exit0（10.72秒、7.04秒）。本次仅修改五份结果文档，32个非文档路径与该验证树逐字相同，不另跑测试。此前5379全量和三构建属于26路径前身，不冒充最终37运行。UI11原280定向、40H5及H5 release build，与CI等价7例均保留原计数、不重复累加。

本次最终全量的首个命令误把构建专用`release`环境带入单测，Mock环境成为unknown并正确关闭；两份既有报价文件7FAIL／5390PASS，exit1、90.09秒，质量检查尚未执行。保留原失败，只改命令环境为仓库CI的`test`后完整通过，不改源码或断言。此失败与更早源码的quotation环境失败分别留档，不混算。

当前源码未发布，远端CI尚未验证此37组合。全59、typed既有编辑、append/complete、生产、Qiniu和原生运行仍未证明。六字段UI11原子性/生命周期、一次真实保存及无grant冷读已有独立证据；原冻结create driver仍exit1/NOT_PASS，不能写整脚本全绿，见最终补证。另两条普通首建链不作为替代证据。

## 独立普通多选真实链（与UI11分开）

已核验的隔离报告SHA256：`fc10721937f40324d439e8b511fab2c4950ee15b46fbb39337523f430a33a65c`。它验证的是此前精确released24、普通非特殊集合、Ext.type严格字符串0的三字段合成配置，不是本UI11六字段验收或生产配置。正常App、真实同租户Code provider和固定Java/Mongo共87次HTTP（14preflight＋54warm＋19cold）、3次登录、21次Code读；仅一次upsert及一次完整updateExts，Process/upload/delete/外部请求0，无失败写重放。

Checkbox最终`[A1,B2]`保存在root；显式多选Select最终`[A1,C3]`保存在root及EXTS，可选字段真正缺失。实际控件按provider顺序发值；直接合法数组的顺序合同不因此改变。ACK、query和BSON核对一致；23个raw对象在同库重启、登录前全部字节一致；无grant且写开关关闭的新登录冷读成功，之后仅Account.updateTime变化。wholeNodeByte明确NOT_PASS：固定Node DTO去掉两份冗余顶层fill/readOnly并补默认值，权威nodeDef权限、完整业务EXTS和保留零值通过。不能说整个节点原字节保全，不扩展后台修复或CAS保证。

## Final six-field real evidence

The independently verified sanitized report SHA256 is `40ff13348802b3a95a494b9920ab301eb4d0cf9b734b7f06c2cad18dc06ee122`. On the exact earlier successful24 plus UI11 (35 source paths), UI11 atomicity/lifecycle, one real save and separate no-grant/write-off cold read are verified. **The original frozen create driver remains exit1/NOT_PASS; this is not a whole-script green claim.**

Actual normal controls showed native input and both authoritative props equal`on`, with the original DOM/date handles and other date/memo values retained. Date/Time Done→hide and Date Done→Back observed the old close callback cancelled;0pageerror. Exact cursor/selection remains unverified. The zero-write UI probe made25 JavaHTTP; the save run27 and independent cold observer16, total68 realHTTP/3logins. Exactly1upsert+1complete updateExts,0Process/upload/external/duplicate business requests; no save replay.

Authoritative query and independent BSON verify the same saved record: visitDate`2028-02-29`, mode`off`, memo retained; visitTime/visitAt/followupAt strictly absent from both root andEXTS. Objects20→22; all22 raw hashes exact across full owned-service restart before login; cold21 unchanged, onlyAccount.updateTime changed. Initial login also materialized known backend defaults. wholeNodeByte remains NOT_PASS because fixedNodeDTO removes redundant top-level permission copies/adds defaults; authoritative nodeDef permissions, full businessEXTS and retained zero preserved. Metadata Date precision/timezone losslessness and CAS are not claimed.

After successful save/ACK/query/BSON audits, the frozen create script expected a hidden followup row to display“未保存”. Existing readonly projection skips hidden rows, so this text oracle timed out (exit1); source/assertion/original failure remain unchanged. A separate cold-only observer passed the correct hidden-row-absent expectation without another write. This does not relabel the original driver PASS or silently delete its assertion. All owned boots exited normally and ports closed; earlier source/data/evidence retained. Reusable scenario-oracle alignment remains a test follow-up. No production/native/full59/commercial acceptance or original complete backend build is implied.
