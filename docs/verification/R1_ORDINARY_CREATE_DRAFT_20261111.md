# 普通 scalar 首次新建的条件草稿接线

基线 `ee80d40cd07f654812951c64c703b4d2840709db` 加另片冻结的 choice-create 十路径。本片私有，仅普通非特殊 type0、零记录、v1 create-only、1–50全可填scalar配置；不把纯函数通过当成真实页面或后台验收。没有新backend、Groovy、生产写入或公开提交。

## 已审纯函数与适用边界

`r1-ordinary-create-draft.ts` 原封导入已审版本，48项原专项实际在本项目执行；独审51用例/26955断言是独立作者证据，不重复计为本项目运行。该函数只更新本地draft，不签发type0、tenant或字段授权。它使用现有Runtime判定raw、controller wire和stable-wire三份上下文的完整capability/visibility/readonly/required，歧义或条件重现原子拒绝，不覆盖editable input的原值。

适用门与choice-create互斥。provider使用reader已有`currentFormsCreateRoute`的真实当前对象/WeakMap资格，确认严格Ext.type字符串0和非特殊collection；不是从purpose缺失猜generic，也不是file-only或>50编辑route。没有新增HTTP。精确tenant/user/session/role/order/run/node/definition、完整fieldIds/fillable、grant时效、初始和当前schema、reader generation及scope均复核。无Code/valueOption、media、数组、readonly、typed、appointment、已有记录或v2编辑/追加上下文进入该scalar回调。不适用时保留旧逻辑，不据此开放其未支持能力。

## 页面与拒绝

actions port增加可选`updateCreateDraft`，只有已选择的provider实例提供。panel正常setValue优先调用；一旦该回调抛错，保原draft并显示已有失败消息，不catch后fallback旧updater。每次调用复核current lease、create grant、身份/schema、records0、未选edit ID、无media。source变化/路由/actor/unmount使旧回调无效；新正常load才能签发新上下文。reload沿原行为保留同scope的用户draft，但重建能力，不能把原值继续当旧授权。原初始零记录scalar UI无独立取消按钮，本片不虚构取消入口；既有edit/media取消行为不改。

六字段合成配置为visitDate/date、visitTime/time、visitAt/datetime、mode/text（preset0）、followupAt/datetime（required，showType3/showField mode/showValue精确on/showFieldPreset0）、memo。正常on→选followupAt→off会清理新建own key，其他日期、时间、备注保留；off→on必填重新出现但不复活旧值，未填保存拒绝。已有记录隐藏字段不清理，normalizer/writer/完整root/EXTS协议不变，未处理的hidden own key仍由原guard拒绝。

trim使条件重新出现、空字符串省略改变presence条件等情况，均由已选helper原子拒绝。当前raw mapper将showType2映射为exists(true)，不是false；exists(false)的独立pure schema检查不冒充reader写授权。正常H5的empty case用实际raw showType2，既有equals(on)下的安全空值隐藏仍按正常语义允许。

## 同轮修复 pending 授权复活

独审发现choice v1在自身fresh read的current空窗内，把已观察到的grant/开关撤销也豁免。真实reader/provider/actions暂停`basic/serviceAppointment/queryById/s`的第1次或第3次读取，撤销→canCreate观察false→恢复→放行；旧代码仍两写。修订先独立核grant/开关、actor/tenant、schema及节点权限，观察外部失效即永久撤销；仅自身reader暂空且外部权限不变才可等待renewal。该保护同时用于新scalar callback，不扩大写权限。

项目RED为choice/scalar两模式8 FAIL/8对照PASS；修后16 PASS。无撤销control正常upsert+updateExts两写；首次upsert前撤销0写，upsert后撤销只保留一次upsert并uncertain，恢复后不重放。role对照拒绝正确。pending listed变体没有独立false观测点，本片不把它写为已复现bug。该security delta与hidden wiring delta分别交付，原choice v1失败包不改。

## 验证与未验项

未接线实际panel/provider有效RED为2 FAIL（首次time fixture误用带秒格式的失败另存，改为已证HH:mm后才确认真正RED）。接线初轮111 PASS；扩展轮曾误把原reload保留draft当成应清空，按实际既有load协议纠正测试，未改变reload实现。新六字段H5首轮2 PASS/1 FAIL：equals(on)下empty是稳定的合法隐藏，测试误期待拒绝；改为明确的raw showType2 presence反例后原拒绝断言保留，3 PASS。

H5使用真实正常页面、共享日期/时间picker的可见Done操作与真实provider，API均合成拦截、业务Mock关闭，零外网/未知请求。成功场景保留普通forms upsert→fresh read→updateExts→exact read的两阶段协议，实际两写；不虚报零业务命令。Process、上传、delete、edit/append/complete未开放。UI与wire结果、精确最终组合运行和失败历史随私有报告记录；源码冻结后一次完整verify/typecheck/门禁与三端构建，不重复Mac真实链。

此前阶段真实Java/Mongo六字段保存、冷重启和BSON未执行；后续UI修复、真实保存/冷读证据及保留的create脚本失败见下文。full59、脚本副作用泛化、原生与生产未证明。作者纯helper通过不等于接线审查；原候选经后续B2选择域修订才获得私有独审结论。新H5独立config为ordinary-create-draft.config.ts，opt-in为XLINK_H5_ORDINARY_CREATE_DRAFT=true；本片不改CI。


最终组合冻结实跑：11文件469项定向；完整verify:full为305文件5280 PASS/exit0（含typecheck、边界、依赖及quality），H5六字段3＋choice6＋普通图片1＋配置媒体4＋预约3＋既有generic Map编辑6＝23 PASS/0 skip；H5/微信/App三端release build均exit0。provider唯一旧choice重叠处另含pending security修复，旧choice其他9路径逐hash保全。原48专项、未接线2RED、pending8RED/8control及H5首轮失败均分别保留，不把skipped或重复执行累加。该轮公开main及index未动；当时待审状态已由后续B2独审取代，见最新记录。

## 最新组合验证（文档收口）

B2 corrected19 和 Switch/Rate8 已分别独审为 RELEASE_PRIVATE_CANDIDATE；UI11 也已独审为 RELEASE_PRIVATE_CANDIDATE。这是私有工程候选审查，不是公开发布、商业视觉或真实后台全域验收。旧十片/原19阻断、raw→wire反例、pending撤权和B2选择域失败及其修订记录均保留，后续结论不倒写早期运行。

最终组合37路径在文档收口前执行 `VITE_XLINK_ENVIRONMENT=test VITE_XLINK_ENABLE_REAL_WRITES=false pnpm run verify:full`：307文件／5397单测PASS、exit0、85.51秒，含typecheck及现有边界、依赖、质量门禁；微信和App构建分别exit0（10.72秒、7.04秒）。本次仅修改五份结果文档，32个非文档路径与该验证树逐字相同，不另跑测试。此前5379全量和三构建属于26路径前身，不冒充最终37运行。UI11原280定向、40H5及H5 release build，与CI等价7例均保留原计数、不重复累加。

本次最终全量的首个命令误把构建专用`release`环境带入单测，Mock环境成为unknown并正确关闭；两份既有报价文件7FAIL／5390PASS，exit1、90.09秒，质量检查尚未执行。保留原失败，只改命令环境为仓库CI的`test`后完整通过，不改源码或断言。此失败与更早源码的quotation环境失败分别留档，不混算。

当前源码未发布，远端CI尚未验证此37组合。全59、typed既有编辑、append/complete、生产、Qiniu和原生运行仍未证明。六字段UI11原子性/生命周期、一次真实保存及无grant冷读已有独立证据；原冻结create driver仍exit1/NOT_PASS，不能写整脚本全绿，见最终补证。另两条普通首建链不作为替代证据。

## 六字段真实UI状态

Mac正常App真实Java11HTTP／1次登录曾实际走过on→填写followupAt→off清理→on重现required空；随后拒绝`' on '`时native input仍显示被拒内容，而AppInput和字段control的只读props均为`'on'`。0保存／0命令／0上传，因此不是保存或冷读通过。首轮另有picker null.remove；后续零写诊断pageerror0但恢复初态断言错误而超时，亦不计整轮PASS。

UI11现在修复受控native值协调和锁定Uni H5 picker生命周期，Cloud真实控件合成H5及独审已通过。Mac已将UI11应用到其独立成功24形成35，134定向及门禁通过；六字段正常真实再验已完成UI11、一次真实保存及独立冷读取证；原冻结create driver因写后hidden-row文本oracle超时仍NOT_PASS，见最终补证。拒绝后精确光标/选区未验证。未放宽helper拒绝或writer隐藏值门禁。

## Final six-field real evidence

The independently verified sanitized report SHA256 is `40ff13348802b3a95a494b9920ab301eb4d0cf9b734b7f06c2cad18dc06ee122`. On the exact earlier successful24 plus UI11 (35 source paths), UI11 atomicity/lifecycle, one real save and separate no-grant/write-off cold read are verified. **The original frozen create driver remains exit1/NOT_PASS; this is not a whole-script green claim.**

Actual normal controls showed native input and both authoritative props equal`on`, with the original DOM/date handles and other date/memo values retained. Date/Time Done→hide and Date Done→Back observed the old close callback cancelled;0pageerror. Exact cursor/selection remains unverified. The zero-write UI probe made25 JavaHTTP; the save run27 and independent cold observer16, total68 realHTTP/3logins. Exactly1upsert+1complete updateExts,0Process/upload/external/duplicate business requests; no save replay.

Authoritative query and independent BSON verify the same saved record: visitDate`2028-02-29`, mode`off`, memo retained; visitTime/visitAt/followupAt strictly absent from both root andEXTS. Objects20→22; all22 raw hashes exact across full owned-service restart before login; cold21 unchanged, onlyAccount.updateTime changed. Initial login also materialized known backend defaults. wholeNodeByte remains NOT_PASS because fixedNodeDTO removes redundant top-level permission copies/adds defaults; authoritative nodeDef permissions, full businessEXTS and retained zero preserved. Metadata Date precision/timezone losslessness and CAS are not claimed.

After successful save/ACK/query/BSON audits, the frozen create script expected a hidden followup row to display“未保存”. Existing readonly projection skips hidden rows, so this text oracle timed out (exit1); source/assertion/original failure remain unchanged. A separate cold-only observer passed the correct hidden-row-absent expectation without another write. This does not relabel the original driver PASS or silently delete its assertion. All owned boots exited normally and ports closed; earlier source/data/evidence retained. Reusable scenario-oracle alignment remains a test follow-up. No production/native/full59/commercial acceptance or original complete backend build is implied.
