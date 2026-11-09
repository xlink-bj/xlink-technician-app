# R1 前端集成：已完成切片、证据与剩余边界

核验日期：2026-11-09。本文当前对齐已进入主干的代码基线 [`bd5c349885880850d17f26ac93156ae24c31b098`](https://github.com/xlink-bj/xlink-technician-app/commit/bd5c349885880850d17f26ac93156ae24c31b098)，包含 Survey preset 分槽与条件读取受限批次；此前 `d12b30fb` 的独立运行继续按原 SHA 保留。文档更新不等于新的功能实现或业务测试，后续代码变动须重新核验对应 SHA。

## 1. 使用方式与当前结论

本文是现状索引，不替换原始阶段报告。旧文档里的“未提交”“仅 Mock”“NOT_RUN”须结合其记录时点阅读；后续确有证据覆盖的切片在下表更新，未覆盖部分继续保留。不要把历史报告整篇改写为成功，也不要用一个新 CI 结果替换过去失败的原件。

已交付的受限前端修复、真实本地普通 forms 样本及历史只读闭环有各自证据。**这不是全 R1 等价、全部 59 字段、真实上传、type=0 报价或签约完成的声明。** 现有后台/R1 的历史限制正式记录、后续处理，不把新后台治理列为本轮前端复刻的先决条件。新增权限、生产写入及外部副作用并未因此开放。

## 2. 精确代码基线的自动化结果

### 当前 Survey 受限批次：bd5c3498

以下已按精确 `head_sha=bd5c349885880850d17f26ac93156ae24c31b098` 独立核对 GitHub API、job 和日志：

- [Validate 42544315329](https://github.com/xlink-bj/xlink-technician-app/actions/runs/42544315329)：success，267 个测试文件 / 3618 项通过，MP-WEIXIN 与 App 构建通过；quick 条件跳过。
- [Main H5 42544315341](https://github.com/xlink-bj/xlink-technician-app/actions/runs/42544315341)：success。stage1b-mock-h5 的 17 组共 64 项通过，包含专用 Survey 59 只读步骤 2 项 / 20.8 秒；证据归档成功。r1-main-repeat-ui 与 h5-ux 本次条件跳过，不记为本 SHA 已执行。

本批没有新的完整手动三任务验收或真实 Java 写入；不能把下面旧 SHA 的完整手动结果迁移到本 SHA。[Survey 专项报告](SURVEY_59_STORAGE_AND_MATRIX_20261109.md)里“CI 接线尚未远端运行”保留的是候选阶段时点，已由上述精确运行补齐。

### 先前基线的独立运行：d12b30fb

以下历史结果按 `head_sha=d12b30fbdff81f54e66ac5dcc9259ef910676841` 核对并原样保留：

| 运行 | 触发方式 | 已核结果 | 解读边界 |
| --- | --- | --- | --- |
| [Validate 42496785800](https://github.com/xlink-bj/xlink-technician-app/actions/runs/42496785800) | push | completed / success | 代码门禁的通过不等于真实业务写入通过 |
| [Main H5 42496785707](https://github.com/xlink-bj/xlink-technician-app/actions/runs/42496785707) | push | completed / success | 条件任务不得一概记成已执行 |
| [完整手动 H5 42497857908](https://github.com/xlink-bj/xlink-technician-app/actions/runs/42497857908) | workflow_dispatch | stage1b-mock-h5、r1-main-repeat-ui、h5-ux 三项均 success | 三项实际执行；仍是各自定义的测试环境/范围，不是生产写入 |
| [夜间 H5 42532159844](https://github.com/xlink-bj/xlink-technician-app/actions/runs/42532159844) | schedule | r1-main-repeat-ui、h5-ux success；stage1b-mock-h5 skipped | 此次跳过项不计 PASS；它在上述完整手动运行中通过 |

这些是代码基线的现有运行，不是本次文档候选的新测试。文档提交后的检查另按其精确 SHA 记录，不重复冒算。

## 3. 已交付范围与证据层级

| 切片 | 当前可确认状态 | 来源与不得推广的边界 |
| --- | --- | --- |
| 普通 forms 已有记录追加、精确同 ID 编辑、保存/显式完成分离 | 正常入口受限实现已进入 [`cc362b8da5206648834d9b43ff31de1a2cfa2d05`](https://github.com/xlink-bj/xlink-technician-app/commit/cc362b8da5206648834d9b43ff31de1a2cfa2d05)；不再是“未实现/未提交” | [实现及源码合同](R1_FORMS_EXISTING_RECORD_NEXT_SLICE_20261108.md)。活动节点、单一定义、明确 scope 和已证明标量存储形状；不等于任意节点/定义/动态类型均可写 |
| 真实本地 forms 追加→编辑→显式完成→双记录读回 | 2026-11-08 的隔离 Java/Mongo 执行回执报告通过，五条业务写请求预算已使用，不重放 | 下节列原件索引及其复核限度。该样本不是云端 Mock，也不是生产验收；原 R1 编辑丢创建时间毫秒的问题仍保留 |
| R2 五类列表与正常“全部”授权范围 | 五类已接入；显式全部使用 fresh 角色实际返回的普通菜单，其他四类保留首菜单限制 | [分类说明](WORK_ORDER_CATEGORIES_20261108.md)、[全部范围修复](R2_AUTHORIZED_ALL_SCOPE_20261108.md)。不凭分类名称推导节点状态或写权限 |
| 已完成工单的跟进记录→两条历史表单→整页冷刷新 | 后续独立的真实本地只读 H5 轮次通过，修复在 [`959d5104afd422938a8b0a2d216ff8b7736a2ba0`](https://github.com/xlink-bj/xlink-technician-app/commit/959d5104afd422938a8b0a2d216ff8b7736a2ba0) | [正式验收记录及哈希](R2_AUTHORIZED_ALL_SCOPE_20261108.md)。正常登录一次、40 次 API、零业务命令；1701 个对象中仅正常登录账号更新时间变化。它补齐冷刷新证据，不与上一轮写入测试合称一次执行 |
| 当前 App Mock 的列表/关联/失败语义与 Repeat 分页 | 已有确定差异修复与受限自动化回归 | [当前接口对齐](MOCK_CURRENT_APP_PARITY_20261108.md)、[Repeat 查询](MOCK_REPEAT_QUERY_PARITY_20261108.md)。只证明支持切片，未提升任何 liveParity 为全等价 |
| 快速输入、预约恢复、报价输入、媒体中断回执恢复 | 相应修复已在该基线内；完整手动 H5 及各专项说明提供回归证据 | [AppInput](APP_INPUT_DELIVERY_REGRESSION_20261108.md)、[AppTextarea](APP_TEXTAREA_DELIVERY_REGRESSION_20261108.md)、[SearchBar](APP_SEARCH_DELIVERY_REGRESSION_20261108.md)、[报价输入](QUOTATION_INPUT_DELIVERY_20261108.md)、[媒体回执](MEDIA_INTERRUPTED_RECEIPT_RECOVERY_20261108.md)。不能用 Mock/程序化 IME 证明真机或真实上传 |
| Survey 已保存附件元数据 | `d12b30fb` 增加已核字段/存储槽位的只读数量与类型展示；普通与历史 reader 均有回归 | [精确提交](https://github.com/xlink-bj/xlink-technician-app/commit/d12b30fbdff81f54e66ac5dcc9259ef910676841)。不展示对象键/签名 URL，不打开、下载、上传附件；不是通用 file/data 或新编辑权限 |
| Survey preset 分槽与条件读取 | `bd5c3498` 修复明确 preset=0 的提交值没有复制到 EXTS 的前端缺口；补 13 条路径 × 28 条完整条件矩阵及正常 App 隔离只读 H5 | [专项源码、验证及限制](SURVEY_59_STORAGE_AND_MATRIX_20261109.md)。分槽保存为协议/动作级合成验证，正常页面只测读取；不是 59 行页面全量保存或真实 typed Java 验收 |

### 真实本地 forms 写闭环的原件索引

这是 2026-11-08 执行负责人已交付回执的索引。**本次文档核对没有重新连接 Mac、读取原件、重算其哈希或重跑业务写入**；下列哈希按原交付值保留，不标为本次新验算。原件不上传到仓库，也不把对话摘要当技术原件。

- 后台独立报告：`xlink-local-dev/reports/normal-forms-followon-20261108/COMPLETE_FINAL_RESULT.json`；交付 SHA-256：`8c60cdc87436e58369cf1e02a8304bf9b002769d7585f5c5a99867e3421332bb`。
- 后台后验：同目录 `after-complete-mongo.json`；交付 SHA-256：`031425734f385d103d22a32c74a11cedc9c867d982267b3c54bc6693efa7eb7d`。
- 前端原件：`.review/forms-existing-local-20261108/FINAL_REPORT.md`、`stage-result.json`、`complete-02/results.json`。没有在本索引补造这些文件的哈希。
- 当时前端基线为 `27a6b73ede13989acc774c6376c5cb837cec2ed8`。追加和编辑分别为一次 upsert 加一次完整 EXTS 更新；最后一次显式 Process。运行节点/Workflow 回读均为完成，双记录及其它业务/配置保留，最终 1701 个对象；script/SLA/alert/message 计数为零。
- 已观察继承差异：编辑使创建时间从 Date 变为字符串并丢失 695ms，已记录后续处理。不能称全类型无损、服务端 CAS 或全量后继验收。本轮完成后没有新会话整页冷读；冷读由上表 `959d5104` 后续独立轮次补齐。

## 4. 59 字段：现有证据与未验部分

两次结构材料不能混用。[当前证据 overlay](../../contracts/r1-mock-current-evidence.json) 中用途 UNKNOWN、缺字段键的旧捕获，应保留其原始范围；[Survey 59 字段说明](SURVEY_59_READ_COVERAGE_20261107.md) 则记录后续第二次结构捕获及本地 Java 回读，不能继续把旧缺项当作后者的现状。

已保存事实：59 行、56 个不同业务键，重复行不能按键去重；40 行适用手机详情、其中 12 行必填。按根部 `showType=3` 统计为 31 行，其中 28 行条件结构完整，gap0/height/gap1 三行部分条件未保留。另有 before/afterMoldRemoval 的 frontEndConfig 条件，但其 `showList=[]` 不进入手机详情；不能把 31 当成所有来源的条件总数。perimeter 的条件值是已知空数组，不是缺失配置，不补造部位。已核 Survey 附件键共 24 个、手机适用 22 行，`d12b30fb` 已提供受限只读投影，不应再笼统写成所有 file 均不支持。

**bd5c3498 已补的范围：** mapper 保留明确 preset 元数据，现有 forms/repeat、Stage1 与 Survey Workspace/wire 为本次实际提交且明确 preset=0 的值生成 R1 EXTS 副本，保留根部副本、未知原文和隐藏值；23 个已知 extension 键已有合成回归，存储元数据漂移仍拒绝后续确认。13 条已捕获路径 × 28 条完整条件已有矩阵断言。正常 App H5 在全 API 拦截下读取 50+9 行，验证条件、只读附件、provider 失败与错租户拒绝、显式恢复和冷刷新，共 2 项通过。

这不再是“所有分槽/条件测试都待做”。但 typed 保存证明仍是源码属性名 DTO 模拟→真实 wire→只读 codec/mapper，H5 的 provider 是明确合成别名，不代表真实 provider 为空或已解析。详见 [受限批次报告](SURVEY_59_STORAGE_AND_MATRIX_20261109.md)。

尚未证明：三条部分条件、全部 calculateConfig 内容、Survey 自身 provider 的身份/完整选项、当前有效写权限、所有特殊控件与真实 typed 完整替换的元数据/日期精度保全，以及完整 59 行正常保存。现有 50 字段、唯一业务键和标量写模型守卫均未放宽，通用 Survey 已有 ID 替换仍拒绝；不能借 Order 的 parts 树或填空配置凑通过。真实上传、Java/Mongo 保存、并发版本和完整后继仍 NOT_RUN。

后续只对上述剩余缺项继续核已有固定 R1/后台源码及已保存配置，为证据充分的部分补前端/Mock 回归，不重复把已完成分槽修复列为待办，也不预设需要改后台。确实缺少的配置、真实持久化响应或获准样本单列待证；未知规则维持显式拒绝。专项继续产生的新证据按独立文档/精确提交追加，不改写旧捕获。

## 5. type=0 报价：既有边界存档，非本轮执行主线

本轮继续完善的范围是勘查完整字段与文档现状。以下仅保留已有 type=0 合同及未验边界，不安排新增报价接线、写入或副作用执行。

依据 [R1 报价与正式单分阶段合同](M1_I3_R1_QUOTE_ORDER_STAGE_CONTRACT.md)，固定前端为 `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`，后台为 `xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`：

- `placeOrders.vue` 的 `type==='0' → quote()` 使用 `basic/order/creatQuotation`，携带 `type:0` 及 `exts.isCreateBjdPDF='1'`；后台会分配 ID、执行租户/表单脚本、可能生成 PDF 并保存 Order。**不是纯计算或未提交预览。**
- type=1 正式单使用不同 Workflow/upsert 序列。订单确认、短信/通知、优惠券等也不是只读附属步骤，不能与 type=0 合并成一个可随意重放的接口。
- 新 App 的 type=0、确认/触达等路径仍有独立 transport fence。固定源码可用于不分派请求的协议/拒绝测试；普通真实写开关不能解除该 fence。
- 剩余不是“type0/type1 含义未分清”，而是正常 App type=0 独立业务接线、当前租户脚本/价格/权威回读及有副作用执行尚未验收。此边界暂存，不在本轮扩展；真实 PDF/消息等不能假装成隔离本地普通保存。

旧合同中关于 SKU、主干 PR 和阶段总进度的历史结论不覆盖现行 [F01–F21 清单](R1_REAL_DATA_MODEL_MOCK_EQUIVALENCE_INVENTORY.md)及 `AGENTS.md`。四个已读目录上下文无活动 SKU，不构成普通材料 SPU 报价的统一前置阻断。

## 6. 收口责任与不扩大的边界

- 已有后端/R1 的非原子多请求、EXTS 替换窗口、日期精度等问题留正式风险记录；不因此提出未经批准的后台改造或声称已治理。
- 真实上传、完整 Survey、type=0 实际执行、Order 确认/签约、原生设备及商业视觉是独立范围，未验不等于已经证明后台故障。生产仍只读，未部署。
- 本地环境曾完成启停/重启、保全和稳定性检查；交接应继续明示前台宿主存活、冷 Redis 登录准备及 Sequence UNKNOWN，不能称永久常驻或所有冷态自动恢复。
- 原始失败、忽略的本地证据、原 22 项 QA 与既有 stash 不由本次文档清理。该文档仅更新解释及证据链接，不提交这些本地文件，不修改产品代码、权限、后台或测试断言。
