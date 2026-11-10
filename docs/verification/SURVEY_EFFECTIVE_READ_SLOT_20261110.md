# Survey 已支持字段的只读有效值槽完整性

基线 `main@c71138508fafc84081cf9fc6581d2b3f5a8e9bda`，测试树保留前两片未提交的12个Survey/duplicate-file文件和3个R2授权H5文件；本片不修改它们，不提交或公开发布。

## 观察事实与来源

`src/adapters/api/read-models/form.ts` 的 `formValues/formFieldValue` 先投影EXTS，再投影尚未赋值的root键；对象/对象数组等不支持值会被丢为undefined。合法EXTS自有业务值优先，合法root只在该EXTS键缺失时作为有效来源。旧共享 `assertSurveyReadExtsValues` 只检查EXTS自有键，且EXTS缺省直接返回，导致root.memo对象被正常/历史reader接受后显示“未保存”。这是仓库合成复现，不是生产丢数据发现。

实际Vitest红例：正常与历史reader两文件202项中6FAIL/196PASS；59行元数据测试63项中25FAIL/38PASS。失败包括无EXTS及空EXTS的root对象、坏读未撤销快照，以及memo/part对象与不可表示数组/非有限数字。原日志保留。

## 最小修补

唯一应用修改为 `src/app/r1-node-forms-read.ts` 的共享guard及注释。Survey目的与原supported类型/mobile适用/presentation/unsupported过滤原样保留。对每个已支持字段：EXTS有own key则只校验EXTS；否则有root own key才检查root；两者都缺失允许。null、字符串、布尔、有限数字及原允许的primitive数组保持。EXTS合法值覆盖异常root副本，不为隐藏坏副本新增拒绝；显式不可表示EXTS仍失败，不能丢弃后回落root。

非null的畸形EXTS容器仍失败；缺省/null父EXTS保持原容器语义并检查有效root。无适用支持字段时仍提前返回，不扩容器检查范围。数组中null仍遵循原契约拒绝，没有新增类型支持。未知audit JSON、静态排除字段、presentation与媒体/未支持控件继续按原规则处理。

正常reader在发布snapshot前、历史reader在发布历史结果前共用此guard；失败撤销旧快照/lease，修复数据后须显式load或重新discover/read恢复。没有修改mapper、provider/权限读取、writer、grant、50字段/unique/scalar写限制、EXTS更新协议、Workflow或后台。

## 验证与工件

新增/追加测试分别覆盖实际正常reader、历史reader、59行已保存结构的memo/part、合法missing/0/false/空串/null/primitive数组、EXTS优先、对象/混合对象数组、未知字段过滤、失效与显式恢复，并断言upsert/process/upload/updateExts为0。

- 定向：`VITE_XLINK_ENVIRONMENT=test pnpm exec vitest run tests/engineering/normal-node-forms-read.test.ts tests/engineering/r1-historical-forms-read.test.ts tests/engineering/survey-effective-read-slot.test.ts tests/engineering/survey-59-read-projection.test.ts tests/engineering/survey-readonly-media.test.ts`。
- 工程：`VITE_XLINK_ENVIRONMENT=test pnpm verify:full`。
- 兼容H5：`XLINK_H5_SURVEY_59=true PLAYWRIGHT_BROWSERS_PATH=$PWD/.review/browsers pnpm exec playwright test --config config/playwright/survey-59-read.config.ts`。现有正常/历史只读与EXTS失败恢复四项，**不是新增root场景的H5证明**；新增root反例在真实reader Vitest与实际mapper投影中验证。

所有命令使用既有Node22/pnpm10 PATH。最终真实计数、退出码、独立审查、完整增量patch/逐文件hash见 `.review/survey-effective-slot-20261110/` 的交付summary/manifest。R2前片10项H5仍是前片结果，不能冒称本片重新验证。

本片不执行真实Production/Beta/Java/Mongo/上传/业务写/脚本/Workflow；完整59字段页面编辑保存、真实provider/缺失条件/calculateConfig、后台并发及生产影响均未验证。后端历史问题不治理，不新增CI/dispatch、stage/commit/push/PR或部署。私有Library仅用于内部文本补丁交审，不含截图或trace，不构成公开发布许可。
