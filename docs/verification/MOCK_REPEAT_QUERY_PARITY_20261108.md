# F07 合成 FormData 查询协议补齐（2026-11-08）

基线 `xlink-technician-app@a7904b1de090f379df340cbe1cb2ddb0817dff65`。本批修正当前 DEV Mock 合成 FormDef 的读取投影及现有special panel完整读取集成，不改业务写命令、权限、历史跟进、价格、页面样式或后台。参照既有 [F01–F21 清单](R1_REAL_DATA_MODEL_MOCK_EQUIVALENCE_INVENTORY.md) 和 [当前证据覆盖层](../../contracts/r1-mock-current-evidence.json)，不新增生产请求或升级 liveParity。

## 来源与观察事实

- 固定 R1 前端 [`xlink-app@6c0a97b` serviceAppointment.vue:10287–10300](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/serviceAppointment/serviceAppointment.vue#L10287)：`getFormList` 请求 `biz/extForm/query/{formDefId}`，按 `is:workflowId|string#and`、`ne:state|integer#and=-1` 和 `createTime desc` 读取 repeat。精确编辑读取为同文件6987–7017。
- 固定后台 [`ExtFormController.java:32–39`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/biz/ExtFormController.java#L32) 的留存原文以 `FlipPageInfo(request)` 承接查询并注入当前账号 tenant；留存原文副本在既有 `.review/forms-next-protocol-20261108/source/ExtFormController.java`，SHA-256 `1448148ec1df5d2d67164a2328e0ace88b5f0f2ff7f49332649bc829aa010a3f`。此源码证明分页查询入口，不证明本轮真实服务器 ACL/持久化。
- 当前真实 adapter `technician-api.ts:listRepeatFormReferences` 和 `r1-scoped-form-read.ts:page` 已发送有限页、过滤及精确ID；后者要求响应页号和行上限与请求相符。
- 修复前 router 的合成 FormDef 分支固定返回 `page=1/rows=20` 与完整数组，未应用请求的分页/过滤交集。真实 adapter 请求 `rows=1` 得到两条种子后报 oversized page；精确ID加错误 workflow 仍返回该行；`rows=2` 回显20；错误 sid/node、未知过滤及非法页界未被拒绝。以上是本地合成协议红测，不是生产缺陷。

## 最小实现与边界

`mock/r1-form-query.ts` 对已知 `_id/workflowId/sid/nodeId` 等值过滤和删除排除取交集，再排序、计算 total、分页。回显请求 page/rows 与 size，pages=ceil(total/size)、dataCount=当前页长度。过滤后计数、切页前计算 total，符合已核 FlipInfo 语义。选定响应在 router 模拟延迟前立即脱离共享存储，调用方或后续写入不应改写已开始的读取。只接受已支持的有限数值分页、createTime排序和已知过滤；未知查询失败关闭，不回落网络。这是保守 Mock 子集：后台 FlipPageInfo 对非数字有默认化，另支持 size 输入别名及 `_all`；通用 Mongo 查询还有更多谓词及 OR，本批不模拟也不宣称完整等价。R1 的 workflowId 过滤不赋予新增 sid/node 权限；这里仅执行调用方明确传入的已知字段交集。router 仅增加一个 import，并把原合成 FormDef 返回语句替换为该查询器。

保留既有候选记录和删除读边界：repeat 列表仍只含原来允许的有效行；普通 forms 的已删除精确ID回读规则不变。这只是保留当前 Mock 兼容边界：固定后台 ExtFormServiceImpl.java:327–349 的 Repeat remove 为soft-delete，普通query没有无条件删除排除；因此不将Mock隐藏已删repeat精确读、却允许已删forms精确读称为后台删除等价。原始业务值、未知 exts 和历史元数据不改。种子缺失的 tenant/sid/node/createTime 不补造；显式归属过滤不能用不存在的字段自动匹配。对已保留 createTime 排序，显式desc沿用R1请求；省略sortOrder按固定后台EMongoTemplate:521–522的默认asc，已补反例。缺时间行稳定保留原相对顺序并置后；后台未追加 `_id` tie-breaker，默认repeat及新保存Mock行均缺createTime，所以这只是合成fallback，不声称已经证明真实时间顺序。

现有 `a-stage-dynamic-form-mock-ui.ts:scopedForms` 原来直调 `tryMockRead` 只取data，没传page/rows、没查total；分页修复后2条历史+19条新增会在第19次保存后落盘但回执待核对，已有21条集合也会漏末行。实际controller红测已复现，随后将该读取移入controller：每页20、最多100条，逐页检查actor/scope、页号/行界、过滤后total稳定、重复ID、已出现的归属/定义矛盾，完整后才返回集合，所有load/回读/完成均复用它。达100条时新增在upsert前拒绝，避免写出自身无法完整读取的第101条。坏页、重复/短页/错误页号、错误归属、超过上限及读取中身份变化均不得发完成命令。

该有界集合校验不是后台跨页事务快照/CAS，也不修复历史并发风险。100条是现有消费者读取上限；Mock Process既有单批最多50个自有ID的限制不变，本轮完成正例为19个自有ID，2条历史只读行未伪装为自有。未证明100条皆可完成。

本批不新增普通 forms/repeat 的正常写授权，不把历史只读种子变成可编辑记录。未将真实租户、未读provider、59字段用途或SKU填齐。后台历史并发/替换风险仍沿用已有正式记录，不在本轮治理。

## 验证与证据分级

1. 初始6项协议全红；独立复核再补3红（FlipInfo元数据/共享引用污染），后续消费者审查补5红（省略排序方向及21条controller边界），均保留。另以第101条新增红例证明应在写前阻止。最终协议12项、controller41项，连同原协议/scoped reader/当前Mock组合的共98项，全部通过（exit 0）。
2. 首个协议用例经真实 `TechnicianApiReadAdapter → Mock router`；special panel的正常App浏览器旅程则经其真实controller直接调用`tryMockRead`，**不经过该API adapter**。两类证据分别成立，不互相替代，也不声称HTTP真实联调。
3. 正常App 430×932的2项：历史行只读、新行保存/刷新精确读回/删除及旧记录保全；连续19次正常按钮保存得到21条，刷新仍完整，明确完成后进入正常摘要并保持刷新结果。controller单测独立核实Process携带全部19个自有ID、完成后21条仍可完整读取。浏览器外部请求/页面异常均0，无store/ACK注入。
4. 探索失败均保留：误找受保护历史行的编辑入口；点取消按钮内部文字被父按钮拦截；跨页完成后误断言编辑面板仍存在。最后一项按既有`stage1b-r1-forms-after-save.spec.ts`及真实detail行为更正为完成摘要、面板卸载。未改页面、加sleep/force/超时，也未削弱保存/刷新/完整集合断言。
5. 首轮未设置`VITE_XLINK_ENVIRONMENT`的完整检查7项旧报价失败，按仓库CI明确的test环境执行后通过；类型检查的新测试可选端口问题也已修。旧绿灯保留历史时点，不充当新增消费者修复的最终结果。

实际命令（沿用现有Node22/pnpm10.31.0与Chromium）：

```sh
VITE_XLINK_ENVIRONMENT=test VITE_XLINK_ENABLE_REAL_WRITES=false pnpm exec vitest run tests/engineering/mock-repeat-query-parity.test.ts tests/engineering/a-stage-main-app-special-controller.test.ts tests/engineering/a-mock-special-forms-repeat-protocol.test.ts tests/engineering/mock-current-api-parity.test.ts tests/engineering/r1-scoped-form-read.test.ts
VITE_XLINK_ENVIRONMENT=test VITE_XLINK_ENABLE_REAL_WRITES=false pnpm verify:full
VITE_XLINK_R1_MP_UX_FIXTURES=true VITE_XLINK_R1_STAGE2B_FIELDS=true PLAYWRIGHT_BROWSERS_PATH=$PWD/.review/browsers pnpm exec playwright test --config config/playwright/mock-repeat-query.config.ts
```

本轮证据目录 `.review/mock-repeat-query-20261108/`；最终浏览器产物 `test-results/mock-repeat-query/`。最终定向98项、full为261文件3367项、专步H5两项均通过（exit均0）。新增stage1b专步显式启用两个已有合成flags，使用独立配置，失败正常传播，原15分钟时限不变；基线a7904b1的stage1b实际8分46秒，本批专步本地42.7秒，不将其当远端性能保证。原always归档只追加`test-results/mock-repeat-query/`，包含results.json与attachments/trace。结构校验确认删除新专步及该路径后与基线YAML完全一致。默认真实main-h5-mock配置无flags时本spec两项明确SKIP（0 PASS），专步必须实际执行；PASS/SKIP分别记录。CI运行仍NOT_RUN，未commit/push/dispatch。

真实后台、生产/Beta、真实上传/消息/签署、真实Process及生产等价均NOT_RUN；仅执行既有合成Mock保存/Process。F07 liveParity仍NOT_VERIFIED，#201 HOLD不变。
