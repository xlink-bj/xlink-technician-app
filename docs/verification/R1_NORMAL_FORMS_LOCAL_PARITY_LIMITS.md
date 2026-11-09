# 普通 forms 正常页面集成：范围、证据与继承风险

> **2026-11-09 范围更新：本文保留首条创建 create-only 批次的实现与风险证据，不代表当前正常 forms 仅能创建第一条。** 后续 `cc362b8da5206648834d9b43ff31de1a2cfa2d05` 增加单一定义、活动节点、明确授权范围下的追加、同 ID 编辑和显式完成；随后另有隔离本地样本执行回执。见 [已有记录切片](R1_FORMS_EXISTING_RECORD_NEXT_SLICE_20261108.md)与 [最新收口索引](R1_FRONTEND_INTEGRATION_CLOSEOUT_20261109.md)。
>
> 原首条创建测试、权限边界及继承风险原样保留。后续通过不等于泛化写授权、完整 59 字段、后台事务治理或 Production/Beta 验收；保存与完成分离的显式意图不变。

记录日期：2026-11-08。本文用于本轮前端功能复刻、集成及 bug fix；不作为后台改造、生产写入或全流程验收证明。正常 App 合成 HTTP Mock 的实际结果见末节；生产与真实后台写入不在本轮验证范围。

## 本轮决策

Owner 明确要求复刻已有 R1 功能，已发现的历史/后台缺陷正式记录后留待后续处理；UI/UX 不是本轮目标。本轮不再将服务器 CAS、跨客户端原子性或后台缺陷修复作为前端复刻的先决条件。

这个决定允许在已授权的本地合成范围内集成普通 forms 保存协议，继承并记录原协议的风险；不代表已证明不存在风险，也不扩大 Production/Beta、真实业务数据或外部服务授权。既有身份、节点、字段、环境、回执和禁止自动重试保护继续保留。

权威源码入口与证据分类沿用 [R1 数据模型与 Mock 等价清单](R1_REAL_DATA_MODEL_MOCK_EQUIVALENCE_INVENTORY.md)。原 forms/repeat 协议索引见 [四阶段功能台账](R1_FOUR_PHASE_FUNCTIONAL_LEDGER.md)。历史报告仍描述其当时范围，不能当作本轮正常页面的新证据。

## 三类事实分别记录

| 类别 | 已知事实 | 本轮处理及证据边界 |
| --- | --- | --- |
| 已复现前端缺陷 | 正常 forms reader 曾只比较投影后的节点。原始 `exts` 中未知顶层属性、嵌套值或 formList 行元数据发生变化时，显示投影可以保持不变，读取仍被接受。 | 这是本地合成测试已复现的前端完整性检查缺陷，应修复。当前修复方案仅在一次 load 内瞬时保存完整 forms raw EXTS 的严格 JSON 值并比较首尾读取；非 JSON 值拒绝。它不签发写权限、不持久化原文，也不提供 CAS。最终提交与实际验证结果由主任务补记。 |
| 已核实源码协议 | 普通 forms 保存需要 FormData upsert 后更新当前运行节点的完整 EXTS；未知 EXTS 属性及既有记录不能因重建摘要而丢失。保存与 Workflow 完成是不同操作。 | 复用现有 source-backed wire/planner，保持原请求形状。源码协议可证不等于真实环境持久化、权限或生产等价已经验收。 |
| 继承风险，生产影响未证实 | 既有协议分两次提交 upsert 和完整 EXTS，现有编码未携带已证实的服务器版本条件。跨客户端读取旧 EXTS 后相互覆盖、或其中一步成功而另一结果未知，是可能的失效方式。 | 本轮记录并继承，不据此声称生产已发生覆盖、丢数据或存在已复现后台缺陷。CAS/原子追加/幂等事务可后续评估，作为改进建议而非本轮前端集成阻断。 |

读取缺陷的实现与回归入口：

- `src/app/r1-node-forms-read.ts`：`createNormalNodeFormsReader` / `readNode` / `formsExtsJson`；完整 EXTS 用于首尾稳定性检查；`currentFormsExts(snapshot)` 仅对精确当前 snapshot 返回瞬时副本，身份、角色或 lease 失效即拒绝。原文不进入显示 snapshot、持久 receipt 或草稿。
- `tests/engineering/normal-node-forms-read.test.ts`：`ordinary forms full EXTS read consistency`，覆盖稳定值、三种投影外漂移及非 JSON 值拒绝。
- `src/adapters/api/r1-scoped-form-read.ts`：显示记录不包含完整编辑原文；不能因读取成功就允许原记录整文档覆盖。

## 保存合同与明确不做的操作

本轮普通 forms 的最小正常页面集成合同为 **无活动记录节点的首条创建 only**（允许保留既有已删除条目；已有活动记录时不提供新增或编辑入口）：新增记录 → 更新完整 EXTS → 独立回读核实。下列合同是交付约束，是否已通过正常页面实测见末节，不能仅凭本文视为能力已开放。

1. POST `biz/extForm/upsert/{formDefinitionId}`，使用既有 `dataStr` 编码，携带已核验的业务字段和当前工单/运行节点/Workflow 上下文。创建不得带调用方伪造的已有 `_id`。
2. 从可信 ACK 取得唯一服务器 ID；冲突、缺失、畸形身份或显式失败标记不能继续下一步。使用 `planR1FormsUpdateExts` 在新鲜的完整 EXTS 上追加记录引用，保留原有未知属性与记录元数据。
3. upsert ACK 后再次读取当前角色权限、handler、active 节点、完整 EXTS 和字段规则；观测到变化则保留未知锁、停止第二步，不做补偿或重放。随后 POST `workflowNode/updateExts/{runtimeNodeId}`，提交完整 JSON EXTS，不用表单编码替代，也不从显示投影重建整份 EXTS。
4. 分别回读新记录和当前节点，核对服务器 ID、scope、提交值及 EXTS 关联后才显示保存已核实。保存不能被称为节点完成。

本轮新增能力不开放已有记录编辑、删除、完成或 Workflow 推进。原 R1 的“保存并完成”与单独完成协议仍可作为源码参考，不因保存入口接入而自动开放：

- `r1-stage1-functional-flow.ts`：`forms_save` 不带 Process 的计划只有 `form_upsert`、`forms_exts_update`；`processActive=true` 是另一个带 Process 的计划，本轮不授予它。
- `r1-special-workflow-wires.ts`：`r1FormsAfterSaveProcess` 与 `r1FormsFinalizeProcess` 保留不同 form-ID 槽位语义；本轮创建保存不能调用任一完成 wire。
- `r1-forms-exts-plan.ts`：完整 EXTS 保留是原协议要求，不代表该 planner 已具备服务器并发控制。

## 本地授权及结果不明保护

- 仅明确批准的 DEV loopback origin、API 路径和精确 scope 可用；scope 包含租户、用户、当前角色、工单、Workflow run、运行节点和表单定义。不能仅凭 DEV、节点名或 `forms` 类型授予能力。
- 正常角色可见性只够读取；发送前还须核对 handler、active 节点、schema/fill/readOnly 集合、字段条件及选项来源。未知字段能力拒绝，不因本轮继承后台风险而取消前端校验。
- 初始读取和每个后续步骤绑定当前页面的 snapshot lease；离页、身份变更或外部重新读取撤销旧能力。迟到 ACK 不得重新占用其他页面的共享 reader 或续发下一条命令。
- 每次可能分派前先持久化当前步骤的未知状态 receipt；只有独立完整回读通过才记为 verified。ACK 丢失、相互矛盾、失败或独立回读无法核实时保留锁；刷新或重建 controller 不能自动重放 upsert/EXTS，也不能把结果未知显示为保存成功。
- Web Locks、持久 receipt、首尾完整 EXTS 比较及发送前再次读取是客户端保护；不能称为服务端 CAS、全局单写者、两请求原子事务或跨设备并发正确性证明。
- 目前本轮验证仅允许前端 Mock 的合成 HTTP 全拦截。所有业务 API 请求由本地测试白名单响应，未列出的业务请求与外源请求必须阻止；同源业务 URL 也不能直接放行到代理或后台。
- Production/Beta 写入、后台变更、真实客户数据、上传、签约、PDF、消息及外部同步不在本轮范围；#201 HOLD 不因本地 Mock 通过而升级。

## 前一阶段验证记录与未验范围

该阶段测试基线为 main `9f246726c5ebd80d4075d361dd784257a982dfe0` 加本轮未提交 diff（先前 `9d7789c` 的241文件/2866项及第4轮H5证据保留）；先前仅读取修复的 RED/GREEN 证据保留在原目录。当前结果不能追溯归给该 main 的未修改源码。

| 项目 | 本轮实际结果 | 证据级别及边界 |
| --- | --- | --- |
| 投影外 EXTS 漂移 | 修复前 49 PASS / 3 FAIL；当前回归通过 | 合成单元；正常 App H5 也证明漂移拒绝后稳定重读恢复 |
| 最终定向回归 | 4 文件 / 104 PASS，exit 0 | `r1-normal-forms-actions`、`normal-node-forms-read`、`r1-repeat-page-lease`、`r1-repeat-authorization` |
| 完整门禁 | 243 文件 / 2897 PASS，exit 0 | `pnpm verify:full`，包含 typecheck、静态门禁及 quality；无真实后台 |
| 正常 App 普通 forms 创建 | 6 个独立 H5 场景 PASS，exit 0，430×932 | 正常登录/列表/详情/表单读取入口；必填/条件必填/隐藏值、首条创建、旧 EXTS/未知属性保留、精确服务器 ID 回读、新登录刷新回显、显式重读恢复同页草稿 |
| 正常 App 异常保护 | upsert/EXTS ACK 异常、精确记录缺失、值不一致均保锁跨刷新 | 6 场景总计 215 个合成 API 请求、6 upsert、5 EXTS 更新、3823 HTTP 含资源；0 Process/外源意图/未知 API/页面异常。非法选项、非法数值、多余字段、重复点击、跨页面/账号迟到 ACK、字段/handler/EXTS 变化另有单元回归 |
| 后台真实写入、CAS、跨客户端覆盖实际影响 | 本轮 NOT_RUN / 未证实 | 后续独立授权和证据，不以 Mock 推断生产结论 |
| 已有活动记录节点新增/编辑、删除、完成、多类型全量表单、未保存草稿跨刷新、原生/生产全流程 | 本轮 NOT_RUN / 未开放 | 当前 grant 仅首条标量创建，不能沿用本轮结果宣称全量 forms 已完成 |

实际命令：

```sh
VITE_XLINK_ENVIRONMENT=test pnpm exec vitest run tests/engineering/r1-normal-forms-actions.test.ts tests/engineering/normal-node-forms-read.test.ts tests/engineering/r1-repeat-page-lease.test.ts tests/engineering/r1-repeat-authorization.test.ts
VITE_XLINK_ENVIRONMENT=test pnpm verify:full
CLOUD_RUN_ID=05 pnpm exec playwright test --config .review/forms-normal-write-20261108/playwright.config.ts
```

H5 使用已装匹配 Chromium；浏览器全 API 拦截，未知/外源请求 abort，service worker 禁用。该阶段证据在 `.review/forms-normal-write-20261108/`（summary/final-scenarios、命令日志、配置/fixture/spec、截图/trace）。前3轮探索失败保留：第1轮6项均为选择器准备错误；第2轮5 PASS/1 FAIL发现失效 lease 的可点击显示；第3轮5 PASS/1 FAIL保留修复前重读恢复预期；第4轮6 PASS；安全整合新 main 后第5轮同6场景再次 PASS，独立场景总数仍为6。不同轮次不是新增独立场景。原类型检查失败也保留，最终 typecheck/full 均通过。

后续可评估服务器条件更新、原子追加或幂等事务，降低历史两步协议风险；这些建议不改变本轮按原 R1 语义完成前端功能集成的决定。任何后续扩大能力都应更新范围和证据，不能沿用本轮创建-only结果。

## 实现入口与本轮发现的适配缺陷

- `src/app/r1-forms-authorization.ts`：独立 forms/create-only 部署 grant 与正常 provider；按服务端真实 source type 分流，原 Repeat provider 保持独立。精确字段集合不等于字段规则授权，每次读取均重新验证字段规则。
- `src/app/r1-forms-actions.ts`：复用现有 upsert wire、完整 EXTS planner 和 JSON command；upsert 前、EXTS 前、回读时校验当前身份/节点/字段。Web Locks 防重复点击，持久锁与分步 receipt 保护结果未知，无自动重放。
- `src/app/bootstrap.ts`：仅 import 和 provider 构造调用两处替换；没有替换 Mac QA provider 或整文件。
- `tests/engineering/r1-normal-forms-actions.test.ts`：创建/完整 EXTS 保全、异常 ACK、独立回读失败、并发点击、迟到 ACK、字段/handler/EXTS 变化及 scope/权限负测。
- 首轮适配的 pre-dispatch 失败恢复曾保留失效 lease 的“未锁定”显示；真实 H5 复现旧按钮仍可点击但零写请求。已在 forms provider 的 locked() 中加入 lease 检查，要求用户显式重新读取；同页草稿保留，重新取得权限后才允许再次保存。它不恢复跨刷新未保存草稿。
- 静态复审指出中间读取只比字段ID不能发现同ID规则收紧；已增加按中间/最终 definition 再次校验草稿，并用同ID字段转只读的回归证明第二步不分派。没有把该候选写成已发生的生产问题。

## 独立审查补修：ACK 归属冲突的第二步前拒绝

观察事实：本地合成红测中，upsert 返回所选 FormData 容器的 `_id` 合法但 tenant/node/run/definition 等归属明确矛盾时，原 `savedIdentity` 仍接受 ID，随后发出 EXTS 更新；最终回读拒绝过晚。36 项红测失败、42 项通过，证明的是前端检查时序缺陷，不证明生产曾发生错误挂载或丢数据。

契约来源：`r1-scoped-form-read.ts` 的持久归属校验（tenantId/sid/nodeId/workflowId/state 及定义别名），`read-models/form.ts` 的 ID、定义和 Workflow run 别名（含 nested workflow），以及 `r1-special-workflow-wires.ts` 的固定 smodule/state 保存语义。没有发起真实后台请求，也未修改后台。

修补：保留现有 `data ?? entity ?? root` 容器选择，只验证所选 FormData 容器内实际出现的 `_id/id/dataId`、tenantId、sid、nodeId、workflowId/workflowRunId/runId、definitionId/extId/formDefId/formDefinitionId、smodule/state；缺省可选归属不强制新增。nested workflow 的三个 run 别名若实际出现也须一致，nested Workflow._id 不当作 FormData ID。未选的 sibling entity 和外层业务元数据不跨容器合并。容器兼容正测仅证明前端行为，不作为生产响应曾同时返回多个容器的样本证据；未证实的原始 wire 别名不猜测加入。

校验发生在 upsert 可能分派标记之后、任何中间读取和 EXTS 更新之前。明确冲突即保留持久 uncertain/receipt，EXTS 请求数为0；不补偿、不自动重放。旧的两步非原子与跨客户端竞争风险继续继承，此修补不宣称治理后台。

最终补修结果（同 main `9f246726c5ebd80d4075d361dd784257a982dfe0` + 更新后的未提交 diff）：55 项新增 ACK 归属回归及1项新增 Repeat wrapper 回归（另校正原 preflight 用例），动作测试共88项；4文件定向160 PASS / exit0；完整门禁243文件2953 PASS / exit0；正常 App H5 7个独立场景 PASS / exit0。此前6场景和2897项结果保留为前一阶段历史，不能当作本次修补的结果。

本次7场景合计241次合成API请求、7次upsert、5次EXTS更新、4505次含资源HTTP请求；Process、外源意图、未知接口、页面异常均为0。新增归属矛盾场景的EXTS请求为0且刷新后仍锁定。

新证据保存在 `.review/forms-ack-ownership-20261108/`：red/targeted-final/verify-full/h5日志、7场景逐请求结果、配置/fixture/spec、截图/trace及修补diff。正常授权、节点、字段、lease、已有记录保护、禁止编辑/完成及Production/Beta边界未扩大。后续建议仍是评估原子追加/条件更新/幂等事务，并单独取得真实响应和生产影响证据；不作为本轮前端复刻先决条件。

测试准确性补强：preflight失败stub现与真实reader一样先清current；断言旧action锁定且不能再次提交、读前失败零写请求、显式重读取得新action后原草稿才能保存。另新增经过`createNormalNodeFormActionProvider`的Repeat委托保存回归，只发原Repeat upsert、不更新EXTS，验证wrapper没有改走Forms协议。两项仅补强测试，未为迎合旧stub修改产品。最终160项定向与2953项完整结果包含这两项调整；正常App7项浏览器结果沿用同一产品修补版，未重复计算场景。

补修实际命令：

```sh
VITE_XLINK_ENVIRONMENT=test pnpm exec vitest run tests/engineering/r1-normal-forms-actions.test.ts tests/engineering/normal-node-forms-read.test.ts tests/engineering/r1-repeat-page-lease.test.ts tests/engineering/r1-repeat-authorization.test.ts
VITE_XLINK_ENVIRONMENT=test pnpm verify:full
CLOUD_RUN_ID=01 pnpm exec playwright test --config .review/forms-ack-ownership-20261108/playwright.config.ts
```
