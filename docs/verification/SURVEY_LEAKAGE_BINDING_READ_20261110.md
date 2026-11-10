# Survey leakageCause 双行绑定与保存值只读展示

测试基线为 `main@c71138508fafc84081cf9fc6581d2b3f5a8e9bda` 加已审原20文件。本片保留其中19文件逐字不变，仅经协调允许在共享 `src/app/r1-node-forms-read.ts` 增加窄原文校验调用；旧root-slot guard SHA256 `4152a9271f5a8b0456dba333d13ac2f972c7e15d50d45313aedaf7f70a74c2b8` 和原包不回写。独立guard delta随交付保存。

## 已证问题和修补

- `surveyLeakageCauseExperienceFor` 原只查两个业务键/type/multiple；7个实际源码红例证明缺失、空白、相同、旁路冲突fieldId与unsupportedReason、多选trigger仍可得到业务override。现在两行各自字段键唯一、fieldId为非空无首尾空白字符串且在全表各出现一次，trigger为非多选select，data为multiple=true的data，且两行无unsupportedReason。无关length/width重复业务键不受阻。绑定失败仅不提供业务override，原generic fallback及全表身份门禁保留。
- 正常已保存投影原显示交互trigger“未保存”，data缺少受控显示。2个投影红例证明此缺口。现在只在绑定确证时去掉interaction-only trigger；data仍独立按自身手机surface、条件及已有读取权限显示，不由trigger的可见性推导。
- 59行参考第57行trigger包含part=['4']，第58行data不包含。测试逐行检查，part4时data不展示/不获得写权。metadata仍59行、56键、40手机行；只读展示不再计交互trigger。
- 已保存IDs复用既有persistedIds语义，但新增只读校验要求每个原ID与其规范化结果逐项相同，拒绝首尾空白/空ID/重复/非字符串。picker和写入路径原有trim行为不改。未知ID仅显示“未解析（ID）”，不猜标签、不拉provider、不打开picker。真正缺失显示“未保存”；null和空数组显示“空值”；非法可表示值显示格式错误，绝不静默清洗。

## 有损mapper边界与获批窄guard

`read-models/form.ts` 丢弃对象/混合数组，normal reader原件在私有originals，历史结果不带raw。因此只看record.values不能区分“真缺失”与“已丢值”。先给出反例与最小文件范围并暂停扩展，获协调批准后才新增共享guard调用；mapper/ports和原19文件不改。

新原文校验仅针对确证双行的data：沿本行surface和自己的条件求值，EXTS own-key优先，否则root own-key；缺省/null/空列表和合法ID列表保留，非法对象/混合数组/重复或空白ID拒绝。条件中的记录身份沿既有actionFormConditionValues签发，不使用EXTS伪造的_id。原件校验发生在reader发布读取结果之前，使用保留的无损原文，不依赖mapper后的投影；不能宣称物理上改造了mapper调用时序。两条实际投影入口均为normal/historical reader，原文不合法不会发布可显示结果。单独调用formData再投影不构成权威缺失证明。

原始data槽6个红例已保留。现有snapshot/lease失败撤销与显式读取恢复由正常/历史App H5证明；并非后端写入或生产撤权证明。隐藏data不因trigger可见被读出，unknown/unsupported字段不获得此override。normal create/edit的50字段/unique/scalar/grant仍独立拒绝该数组双行。G4E trigger不持久化与M2 readonly单一所有者回归保留。

## 验证与限制

新增engineering专测覆盖绑定身份、59行57/58、各自条件/surface/readonly、缺失/null/空/合法/未知/非法IDs、EXTS优先、raw损坏和普通写入拒绝；相关projection期望及synthetic helper只更新交互trigger的只读行计数，不修改原59 JSON或填造provider。

现有Survey59 H5新增normal/historical两例，正常登录/详情入口经真实reader读取，全API浏览器合成拦截：缺失/null/空数组/未知IDs、合法EXTS覆盖异常root、part4隐藏、对象/混合/重复/空白ID失败、旧内容撤销与显式恢复；upsert/process/upload/updateExts及leakageCause provider请求均0。原4例继续覆盖13条完整路径/既有失败恢复。

首轮H5为5PASS/1FAIL：脚本在“data行消失”时过早修改下一次合成响应，前次历史读取尚忙，触发正确lease撤销。修正为等待实际record请求出现及正常按钮完成/失败状态，再改变下一次fixture；原FAIL保留，不改应用/超时/断言、不加sleep或force。首个IDs测试曾误用Vitest each展开数组，改为对象包裹后验证真实数组，原脚本失败单独归档。

完整命令、最终测试数/退出码、请求计数、完整8文件候选/逐文件hash、原19保全与guard独立delta见本片私有文本交付包。内部只读预检未见P1/P2，不替代指定本地复审人的最终放行；交包时该指定复审尚未发生。

这里只读合成测试，不连接本地另一执行者服务、Java/Mongo或Production/Beta，不执行上传/业务写/Workflow/脚本/部署。完整59写入、真实provider/缺失条件/calculateConfig及生产影响仍未验。数组引用/浅冻结问题仅记录未治理，不扩大数组写入或修改grant/wire。不stage/commit/push/PR/dispatch或公开上传；旧三包版本保留，私有新包无截图/trace。MP/App/native及新SHA CI未运行。
