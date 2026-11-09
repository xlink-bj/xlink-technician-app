# 普通 forms 已有记录：本地前端对等集成与继承风险

> **2026-11-09 发布/验收状态更新：本文所述实现候选已提交，不再处于“未提交/推送”。** 十九文件受限实现进入 `cc362b8da5206648834d9b43ff31de1a2cfa2d05`。之后在隔离本地真实后台对一个精确样本完成追加、编辑、显式完成与双记录回读；另一轮 `959d5104` 正常历史入口验收补齐整页冷读。详见 [最新收口索引中的精确 CI、两轮证据及原件复核限度](R1_FRONTEND_INTEGRATION_CLOSEOUT_20261109.md)。
>
> 以下正文是该实现批次的源码/Mock 交付记录，原 NOT_RUN 不改写成那一轮已执行。异构定义、任意已完成节点编辑、全 59 字段、生产写入、全生命周期仍未因此验收；R1 日期精度及非原子风险继续正式保留。

日期：2026-11-08。New App 初始基线：`becd4624176a793c95385fd5d0c123ea5203d61f`；四项独立审查修补后的最终组合验收基线：`6b4f8fe61c88d581e0f7632fef40b3c07f61be5f`（先fast-forward到e27d07e保留M08 12路径，再fast-forward到6b4f8fe保留预约3路径）。本轮按已核R1协议，在显式DEV loopback scope下接入同一定义、活动节点、标量字段的正常App追加、精确原文编辑及显式完成。全部写入验证仅使用合成Mock/全拦截API；不接真实后台，不改overview、bootstrap、detail、报价或后台。面板保留becd462计数同步。未提交/推送。

## 证据来源与级别

- R1 前端固定版本：[`xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`](https://github.com/xlink-bj/xlink-app/tree/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d)，文件 [`business/subpackages/serviceAppointment/serviceAppointment.vue`](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/serviceAppointment/serviceAppointment.vue)。本轮实际读取固定 SHA 原文，不仅转引旧台账。
- R1 后台固定版本：`xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`。只读核对 `src/main/java/com/fsgo/modulemini/WorkflowController.java`、`WorkflowNodeController.java`、`biz/ExtFormController.java` 及 `service/biz/ExtFormServiceImpl.java`、`service/workflow/WorkflowServiceImpl.java`、`WorkflowNodeServiceImpl.java`。未运行 Java、数据库或任何业务请求，未验证当前生产路由绑定/ACL。
- 来源版本与项目既有 `R1_SIX_STAGE_SOURCE_PARITY_MANIFEST.json` 一致。旧 forms/repeat 固定 Mock 证据见 `R1_FOUR_PHASE_FUNCTIONAL_LEDGER.md`；上一批正常入口首条创建见 `R1_NORMAL_FORMS_LOCAL_PARITY_LIMITS.md`。这些历史范围不因本轮评估扩大。
- 已有 Production 只读 repeat / 用途 UNKNOWN 的 FormDef 字段回执不能证明当前 forms 的追加、编辑、完成或真实写权限。本轮没有读取生产。
- 下文区分：固定源码事实、受限源码片段执行、真实 New App 合成 Mock 协议、当前正常入口能力、尚未运行的真实后台能力与本轮正常App浏览器证据。Mock 状态10不是实际引擎后继证明。

## 四项 R1 已有行为

| 能力 | 固定前端入口/读取/触发 | payload 与顺序 | 权限、成功与失败边界 |
| --- | --- | --- | --- |
| 已有活动记录后再新增 | forms tab L1067–1074、添加按钮 L2565–2578 没有空列表条件；`addForm` L10156–10176 用 `nodeDef.addFormCodeId` 请求 `code/query`，parentId+state=1；`addFormsSelect` L10178–10184 取 code.exts.formDefId/title；`viewAddForm` L10193–10234 读字段并切换所选定义。 | 新数据无原 `_id`；L7209–7237 取工单sid/smodule与主运行节点nodeId/workflowId；L7400–7452 upsert后进入saveNodeExts；L10237–10273 全量JSON EXTS追加未见ID。允许多个记录，也可能多个FormDef，不能只用节点当前定义重建全部历史。 | `addFormBtn` 初值true，L6421–6434 按hideNodeId对应节点state10隐藏；按钮本身不等于写授权。现有列表是否有数据不阻止R1追加。EXTS成功后是否Process见下文历史语义。 |
| 已有记录编辑 | 行按钮 L1104–1107 调viewAddForm(form.formDefId,title,_id,form)；L10193–10234 按已有ID进入getFormData；L6990–7030 按定义URL+精确_id查询，载入整条记录并将exts展平供编辑。 | 保留原_id，保存仍是upsert同ID→完整EXTS；L7209 `params=this.formData` 是整份表单，不是UI投影补丁。L7180–7191 非preset字段在普通提交时写回exts。后台动态表单编辑按原ID读取oldData，最终mongo.save整份data。 | L2944–2982 存在活动可见节点提交分支，以及forms/currentForm.state!=-1的fallback；不能只看一个v-if断言统一权限。L7118起必填受readonly与showType条件约束，phone/ID格式另验。特殊施工验收有notFilterBelongTo/findByIdWithWorkflow及额外合并/PDF逻辑，本轮不继承绕行或外部副作用。 |
| 保存并完成 | 活动/可见节点按钮L2944–2960调saveFormConfirm；L7069–7110可出现“提交/保存表单”确认，提交调用saveForm。 | upsert→完整EXTS→process；L10260–10265 活动state0的EXTS成功回调调用process(savedId)；L7584–7615 forms普通process路径清空nodeFormDefId和nodeFormDataId，runtimeNode/sid/smodule仍明确。 | process L7528–7565先处理confirmMessage，取消直接return，此时前两步可能已保存。L7619后仅成功回调刷新详情；不能凭Process ACK声称引擎状态或后继已核实。 |
| 单独完成 | L2599–2620：forms/repeat、formList.length>0、节点state0，点击process('complate')；方法L7566–7583再次检查非空。 | 仅workflow/process；nodeFormDefId为节点定义，nodeFormDataId为空；不是Repeat批量逗号ID协议。 | 成功回调L7621–7624将本地节点state设10并getSAData；这只是旧UI行为。列表length未过滤deleted条目，不能据此证明有有效记录。正常App未来应按明确授权的active集合及新鲜详情回读核验，不自动开放。 |

共用身份/字段证据：R1 L6224–6238 基于handler/user或viewableRole展示；L6336–6347另算user/role/org+role handler。查看可见性不等于服务器写权限。该组件实际使用formFieldIdsReadOnly，未找到formFieldIdsFill的统一写授权检查；当前New App的显式scope/fill/readOnly保护不能从旧按钮直接推导或移除。字段显示由showList、mpDetailHide、frontEndConfig/showType及字典/级联配置参与，不能把所有动态类型统称可编辑。

后台源码补证：

- [`ExtFormController L42–52`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/biz/ExtFormController.java#L42) 解析dataStr、从当前Account注入tenantId，然后调用upsert；定义ID来自路径。
- [`ExtFormServiceImpl L141–225、L282–326`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/biz/ExtFormServiceImpl.java#L141) 区分新建/已有_id、动态/特定业务类型；编辑不是局部patch，保留部分创建元数据后最终mongo.save(data,colName)。前后脚本、日志及特定Survey分支存在，不能把generic保存等同全部表单无副作用。
- [`WorkflowNodeController L25–28`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/WorkflowNodeController.java#L25) 接收@RequestBody Map；[`WorkflowNodeServiceImpl L27–34`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/workflow/WorkflowNodeServiceImpl.java#L27) 整体setExts并save，无本方法内版本条件。不能从这两个方法推断完整ACL。
- [`WorkflowController L42–52`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/WorkflowController.java#L42) 从当前Account取tenant/user再调用processWorkflow；[`WorkflowServiceImpl L295–327`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/workflow/WorkflowServiceImpl.java#L295) 委托com.osg.workflow.WorkflowEngineService，记录日志/SLA，成功返回ReturnStatus(true)。该依赖的引擎状态和后继未在本轮执行/核验；nodeFormDefId在此service未转交引擎，不代表前端可以改已核wire。

## 必须正式记录的差异与风险

1. **R1 saveOnly在forms活动节点仍可能Process：源码事实+片段执行已证。** L7452无条件调用saveNodeExts(res.data)，未传saveOnly；L10262只按state0判断Process。L7121附近的“saveOnly不处理工作流”注释不能覆盖真实调用链。受限源码方法执行4项PASS确认active调用Process、inactive仅刷新。当前正常App明确保存不Process是已经接受的范围，不应据此自动新增推进权限；本批将“保存/保存并完成”作为不同显式意图，完成必须再确认；这是有意保留安全边界的前端差异，不宣称与历史隐式Process逐字一致。另外saveOnly跳过L7179–7191非preset副本同步循环，不能把所有路径统一说成会同步EXTS。未证明生产实际触发影响。
2. **R1编辑EXTS替换赋值无效：源码片段执行已复现。** L10248–10253 的map回调只给局部item重新赋值，未替换数组元素；已有ID的标题等摘要可仍旧。当前planner按ID合并并保留未知metadata，与这段旧实现不同；这是前端历史差异记录，不改后台，也不称生产丢数据。
3. **当前候选forms编辑原文归属校验不足：独立RED已复现，本批已修。** `r1-special-workflow-wires.ts` L126–139仅repeat检查原workflowId；forms的workflowId/workflowRunId/runId/formDefinitionId冲突未一概拒绝，最终spread可改写run或留下矛盾别名。直接wire及Stage1 existing edit各4项，共8项RED。修补前正常App编辑未开放，不是当时已开放create-only漏洞。实际修补：所有sourceNodeType的已有原文都在任何分派前核对实际出现的已知run/definition别名，缺省继续兼容；不要凭借未来grant绕过此校验。
4. **编辑wire顶层与exts重复值不一致：独立RED已复现，本批已修。** `r1SpecialFormUpsert`末尾spread只覆盖顶层字段，可能保留exts旧值；`read-models/form.ts` L371–395优先exts，回显旧值。两个直接wire/真实read mapper RED证明该差距。Mock `r1-special-protocol.ts` L94–101会把字段自动并入exts，因此Mock编辑绿不能证明真实wire正确。本批修补仅同步原EXTS已存在的同名业务值，并继续对显式清空同时删除两处，未知字段不变。R1非saveOnly提交时L7180–7183可为非preset字段创建此前不存在的EXTS副本；当前mapper未保留足以证明全部preset语义的元数据，所以缺原EXTS键时不盲加副本，已有wire回归证明保持缺省。这是明确的存储形状范围，不代表全部动态字段wire等价。
5. **继承的两步非原子/跨客户端覆盖窗口：源码可见，实际生产影响未证。** 完整EXTS read→replace无本方法内CAS，upsert和EXTS是两请求；后续可评估原子追加/幂等事务，但不作为本轮前端复刻先决条件。客户端receipt、Web Locks和重读不应称为服务端治理。
6. **编辑值与元数据边界未全证。** 全原文JSON并不保证BSON Date/所有特殊字段保真；字段只读/隐藏/清空语义不能复用create normalizer直接省略字段。R1保存跳过必填、forms全deleted仍length>0、个别按钮权限条件等应作为独立范围决策，不把历史宽松条件当新默认授权。

## 实施前差距与优先顺序（保留评估时点）

| 优先级 | 可做的最小下一步 | 现有实现与缺口 | 预计需协调的文件 |
| --- | --- | --- | --- |
| 1 | 同一已授权FormDef、已有active记录后追加一条，保持saveOnly | planner和Stage1/Mock已有append。正常provider/actions分别要求0→1；需改为保留旧active ID集合并增加唯一新ID，完整EXTS/旧记录回读，继续关闭edit/process。面板当前只在空记录时显示创建，不能仅删除一个length判断。 | 独立forms authorization/actions、协议回归；共享R1面板/overview接线需父任务协调，本轮不改。 |
| 2 | 可信原文驱动的同ID标量编辑 | 先修上面两项已复现wire差距。reader目前返回投影values，无完整原文编辑凭证；需绑定record/Ext/sid/node/run/actor/lease、字段规则及双处值保全。 | special wire及新的私有read credential/编辑验证器、forms动作；面板/入口另协调。 |
| 3 | 单独完成（显式授权+用户确认） | finalize encoder已有def非空/data空；正常grant仅create、complete拒绝。需完整active引用集合、确认取消语义、权限重核、Process未知锁、最新Workflow/后继回读。不能拿单HTTP ACK替代。 | forms grant/action及独立Workflow readback；共享确认入口另协调。 |
| 4 | 保存并完成（在保存/单独完成都已验证后组合） | Stage1已有3步计划和双空槽。R1隐式saveOnly差异应显式记录/决策；不把保存按钮自动升级成Process。 | 组合意图/分步回执与取消恢复，入口协调。 |
| 后续 | code选项驱动的异构FormDef forms列表 | R1支持code.exts.formDefId；当前scoped reader拒绝混合FormDef引用，需逐定义独立读取/授权和完整列表，不能过滤其他记录制造空列表。 | forms options/reader/复合snapshot及入口，不能仅改当前nodeDef来冒充权限。 |

上表记录实施前差距。本批完成的受限适配见下节；异构定义、已完成节点编辑等仍未接通。全程没有调用真实Process或编辑真实数据。

## 本批实际集成范围与安全合同

- `r1-forms-authorization.ts`保留version 1首条create-only。version 2必须显式声明精确tenant/user/role/workOrder/run/node/definition、有效期、可写fieldId、operations和可编辑recordIds。默认关闭、仅DEV `http://127.0.0.1:5189`，Production/Beta禁写；handler、可见性、运行状态、完整字段/只读集合仍在每次读取后核验。
- `r1-scoped-form-read.ts`只为discover后`select`发出的精确ID读取签发内存原文来源；ACK、URL、展示投影或JSON复制不能签发。`r1-node-forms-read.ts`仅向同一当前snapshot提供完整原文深拷贝；不进入UI snapshot/localStorage。账号、角色、session、页离开、重新读取均撤销旧lease。
- 普通forms同一定义追加保留所有旧active/deleted条目和未知EXTS；编辑必须显式recordId授权、当前完整列表中存在、精确原文归属一致。字段patch不能覆盖元数据，省略字段原样保留；条件/必填/只读/隐藏字段与选项依据真实schema校验。只读/隐藏原值不变；支持的optional清空要求证明顶层和EXTS均存在键，并删除两处。不支持类型/混合定义拒绝。schema同fieldId被改成归属别名，normalizer和wire两层均拒绝。
- `r1-forms-actions.ts`仍按upsert→fresh actor/schema/fullEXTS重查→完整updateExts→完整引用/精确ID/值回读。编辑发送整份可信原文，真实wire测试不由Mock合并补齐。保存ID及返回的显式归属矛盾在第二次写之前拒绝。编辑回读还检查原文未知/隐藏值与明确清空，仅允许服务端更新时间/用户元数据变化；不声称BSON Date等全类型保真。
- 每scope持久Web Locks/receipt跨离页、账号变化和刷新保留。读前失败可以显式重读恢复同页草稿；一旦写请求可能发出，未知/失败/冲突ACK、EXTS变化或精确回读不一致均保持未决锁，禁止自动重试。客户端锁不能代替跨客户端CAS。
- 保存按钮**不Process**；保存并完成需显式operation与二次确认，按forms双空槽位调用Process。单独完成需有效active记录，只Process，定义非空、数据ID为空。运行节点/sid/smodule不变，不使用Repeat逗号ID协议。取消确认不发写请求。
- 完成ACK后通过独立`confirmFormsCompletion`读同一身份/工单/run/真实forms节点，要求节点state10；Workflow允许0或10。FormData仍state1，不改成10。ACK成功但节点未变、读取失败、归属/身份变化均保锁；成功后消费读lease和持久锁。确认的是当前节点闭合，不证明Survey后继或真实引擎全流程。
- `R1NodeFormsReadPanel.vue`只增加必要追加、编辑、取消和显式完成交互；保留becd462计数事件、读取开始清确认、保存期间禁读、scope切换和迟到响应隔离。Repeat继续由原provider与原协议处理，新增port能力为optional，未声明时保留原界面行为。未改样式、overview、bootstrap、detail、报价、Mac文件。

## 继承行为、已修前端缺陷与后续事项

- 已修前端缺陷：归属别名冲突被spread洗掉、已有EXTS同名值过期、身份别名作为业务patch，以及旧R1数组map未替换引用摘要的问题。节点EXTS按ID更新引用摘要（ID/定义/标题/state），保留原有未知行字段；不宣称把整份FormData业务副本重建进formList。New App显示与编辑依据精确ID回读的FormData，历史行中其他重复业务副本的全量同步另待合同验证。Mock `optionalClears`已只接受与顶层提交值一致的已有EXTS键更新，新增篡改负测仍拒绝额外/未知值；没有为测试退回错误wire。
- 有意差异：历史活动forms saveOnly仍自动Process且跳过非preset副本循环；本批保存与显式确认完成分离，校验必要字段与原文保全。历史全deleted列表也可按length完成，本批只接受有效active集合。上述不宣称逐字行为等价。
- 后台继承风险：全EXTS整文档替换和多请求非原子窗口仍存在；前端重读只能检测可观察漂移，不能关闭随后发生的并发覆盖。后续可考虑条件更新/幂等/事务；不是本轮先决条件，也未实现后台治理，未证实生产丢数据。
- pinned [`WorkflowEngineServiceImpl.java L315–491`](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/osg/workflow/WorkflowEngineServiceImpl.java#L315) 的独立源码审查证明active检查、节点设10、末节点Workflow设10；`doWorkflowNodeAction`为false时可提前返回，而外层Process仍返回success。故HTTP ACK不足以证明完成。本轮只在合成响应中验证该负例，不执行真实引擎。
- 后续前端切片：R1节点内code选择不同FormDef、异构历史列表、部分已完成节点编辑、更多动态类型与缺省非preset副本合同。本批仅单一定义/活动节点/已证明标量存储形状，不称全部R1 forms、59字段或完整生命周期完成。

## 本轮证据与未验范围

- `r1-forms-edit-wire.test.ts`：55项wire/真实read mapper回归，包含原EXTS无键的缺省边界；`r1-forms-existing-record-protocol.test.ts`：18项真实synthetic Mock/router/Stage1协议。原10项归属+wire/readmapper红测已保留并转绿，Mock合同旧编辑失败日志也保留。不是浏览器或真实后台证据。
- `r1-forms-edit-values.test.ts`28项；`r1-forms-business-identity-fields.test.ts`18项；`r1-normal-forms-existing-actions.test.ts`27项；`r1-forms-original-read.test.ts`36项；`r1-forms-existing-panel.test.ts`7项。均为合成、无业务网络，最终总数与命令见交付摘要。
- pinned `saveNodeExts`片段观察4项通过，仅执行已检查函数，ajax白名单内存stub/Process spy；不运行旧App或真实引擎。独立10红测原件放在忽略的review目录，不以skip/xfail伪装主套件通过。
- 正常App H5使用真实登录/列表/详情/普通表单入口、全拦截合成API、430×932。首轮7过3失败：父页面移除完成面板导致提示等待不成立、取消按钮内层定位被按钮本体遮挡、缺ID故障误伤旧记录导致更早阻断；原件保留，修正仅测试脚本，最终运行结果单列。所有未知API/外部请求fail closed，记录逐场景请求/写入/Process/异常计数，不能拿Mock状态10声称真实引擎后继。
- 真实后台/Java/Mongo、Production/Beta、客户数据、脚本副作用、上传/PDF/消息/签约/支付、真实Workflow后继、跨客户端并发、原生设备：NOT_RUN。未部署、上传、提交或推送。

完整来源快照/manifest、红绿日志和协议证据留`.review/forms-next-protocol-20261108/`；正常入口H5脚本、日志、trace/截图和逐场景计数留`.review/forms-existing-normal-20261108/`及该配置指定的node_modules缓存目录。均为当前执行器本地证据，不是用户外链。最终交付附精确命令/退出码/补丁摘要，不沿用先前CI结论。

最终验证（2026-11-08，本地main `becd462` + 本批未提交diff）：11文件355项定向通过；`VITE_XLINK_ENVIRONMENT=test pnpm verify:full`通过（251文件3154项，含typecheck与全部门禁）；正常App全拦截H5最终12/12通过、0 skip，430×932。434个合成API请求，外部意图/未知API/页面异常均0。控制台保留框架初始hydration warning及故意500响应错误，不属于页面异常。追加草稿显式重读恢复缺陷经历H5红→绿，新增7项面板回归保留计数/scope兼容证据。

失败原件单列保留：首轮H5 7过3脚本失败；追加草稿产品红测1失败；未设置测试环境的完整检查7个报价Mock失败及单跑复现（补环境后25/25通过）；随后一次完整检查在新增测试品牌ID类型处退出2，修正后最终完整检查退出0。未删除、跳过或降低断言。

## 独立审查后的四项前端修补（2026-11-08）

1. **完成确认原先只验证节点state10，未验证记录关联：合成红测已复现。** 现在从reader私有精确原文捕获预期有效ID和定义内业务值；Process后读同工单/run/节点终态，要求原有效关联仍在，使用原有scoped reader精确回读所有有效FormData，校验tenant/sid/node/run/定义、有效state1和预期业务值，再读一次终态关联防止读取期间关系漂移。只有全部通过才消费lease并标记completed；缺关联/错ID/失效/归属矛盾/值不匹配/读失败均保持uncertain，不自动重发Process。未知节点或记录审计元数据允许变化，不要求引擎永不改变全部未知字段；不证明真实后继或后台事务/CAS。
2. **编辑标题被节点默认标题覆盖：动作红测已复现。** pinned R1 L10237–10252沿用原FormData标题；已有项map局部赋值不替换原slot。编辑EXTS计划现在不提交formTitle键，保留原列表标题的存在/缺省/未知元数据，完整wire保留原FormData标题；两处历史标题原本不一致时分别保留，不用默认标题洗掉差异。默认标题仅用于新增。新增非默认/冲突/缺省标题的动作与真实wire＋严格Mock协议回归。
3. **连续显式重读失败导致草稿恢复身份丢失：面板红测已复现。** 组件私有pendingEditor只记待恢复ID，失败继续保留；成功且最新snapshot重新授权、未锁定才恢复。取消/换scope/离页清除；成功但撤权则丢弃pending，后续授权不会复活旧草稿。保留becd462计数事件、busy禁读和迟到响应保护；不增加持久草稿或跨刷新承诺。
4. **读模型50条、planner100条的前置容量不一致：动作红测已复现。** 首次upsert前以完整formList总数检查追加容量，50条时拒绝，含全部deleted；不删除历史或过滤deleted凑数。49→50允许；已有ID编辑不消耗新slot。未扩大reader或通用planner上限。

四项修补均只触及本轮前端候选；没有同步M08、修改后台或发真实Process。旧冻结补丁哈希73bf81074ce793e72ff178a0aba8126e0a40c1d9646b7aa1986c3438a587f26b及其Library文件保留，新候选另行交付。红/绿/本轮H5原件留`.review/forms-post-review-20261108/`，标题回归另留原protocol review目录。最终实际验证数在新候选交付回执单列，不沿用旧绿灯。

### 额外发现：H5快速连续输入与立即重读（尚未修复）

本轮最终组合H5的一次失败原件显示：同一输入先填19.25、约22ms后填27.75、约14ms后点击重读，连续失败恢复后得到19.25，而非27.75。`@dcloudio/uni-h5@3.0.0-5010520260709002`的`useValueSync`对input触发节流100ms，当前`src/shared/ui/AppInput.vue` blur只更新focused、不同步detail.value；源码支持“第二次值仍待派发时控件被重读卸载”的解释，尚未实施共享组件修法并验证。此额外功能问题已报父任务协调，未归入四项已关闭修补，不把它当后台历史风险或UI/UX优化。

连续失败恢复场景现一次填入同一目标27.75，再执行两次失败和一次成功读取，恢复后仍严格断言27.75；未加sleep、延长超时或降低值断言。该调整使测试聚焦已提交草稿的恢复，不声称解决高速输入节流窗口。原27过1失败的trace/截图/日志与修正前脚本保留，单独列为已发现未修事项。

四项修补最终组合验证（main `6b4f8fe61c88d581e0f7632fef40b3c07f61be5f` + 本批diff）：11文件394项定向通过；`VITE_XLINK_ENVIRONMENT=test pnpm verify:full`通过（254文件3223项，exit0）；430×932正常App全拦截H5 28/28、0 skip、exit0，含两种完成路径各6类关联/记录异常、非默认原标题、追加/编辑连续失败恢复、49→50与50→51零写容量边界。额外高速连续输入的旧失败单列未修，不以此28项覆盖或消除。M08和预约共15个上游路径保留，无未提交改写；无提交、推送、部署或真实业务请求。

## 终态业务值的有损映射漏口修补（2026-11-08）

独立审查确认：原完成核验使用`formData().values`显示映射，若EXTS业务键被改成不可表示对象，mapper丢弃后回落同名顶层旧值，可能错误接受完成。新增反例已复现，不是生产数据事故证明。现仅对本批定义内已支持业务键，以reader私有精确原文和终态精确`originalFor(select)`原文比较；分别保留顶层与EXTS槽位的存在性、类型和值，不使用有损显示投影。

本批标量存储形状允许字符串、有限数、布尔及已存在的null；拒绝已知业务键的对象、数组、undefined或非有限数，且拒绝已知业务槽位新增/删除/搬移，即使显示回落后的值相同。正常顶层单存、EXTS单存、同值双存、历史不同值双存与optional缺省/null不变均有正例。未知audit/元数据键仍可变化，不比较整份未知原文、不要求引擎冻结全部metadata。

原类型/存在性专项25项为10失败/15通过（另50项筛选），修后reader全75项通过；旧关联/删除/标量漂移拒绝与unknown audit允许保持。所有反例仅合成，Process未知锁与不自动重发语义不变。此小修仅应用reader、对应测试及本文档，不改显示mapper、字段范围、后台或AppInput。新候选证据留`.review/forms-raw-terminal-20261108/`；旧候选3f863966…015d保留，新候选另行交付，最终组合执行结果单列。

有损映射漏口修补的最终组合验证（main仍6b4f8fe）：11文件419项定向通过；`VITE_XLINK_ENVIRONMENT=test pnpm verify:full`通过（254文件3248项、exit0）；正常App全拦截H5 34/34、0 skip、exit0。新增6个真实前端＋合成API场景覆盖两种完成路径的对象EXTS、业务键删除、顶层/EXTS槽位搬移；全部保持uncertain且不重发Process，原正常完成/关联异常/unknown audit允许等回归保留。AppInput高速输入仍为独立lane的发现未修，不计入本次已关闭问题。未提交/推送，M08/预约上游路径不变。
