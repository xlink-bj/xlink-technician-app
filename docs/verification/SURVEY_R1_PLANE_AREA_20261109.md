# R1 指定 Survey 的平面面积规则（2026-11-09）

基线 `10d588971ccff9aa34c41257cc246095023aa364`。本片复刻已确认的前端特例，不执行 calculateConfig，不改后台、报价、布局或写权限。

## 固定来源与证据等级

- **独立 SOURCE 核验**：[xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d 的 serviceAppointment.vue:7929–7947](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/serviceAppointment/serviceAppointment.vue#L7929)。仅 `formDefId == '7971040108398070730'`、`part[0] == '3'`，且变更键为 length/width 时更新 planeArea。先判断两维真值；乘积执行 `toFixed(2)` 后 `parseFloat`。否则任一维为严格数字0则赋0，其余赋空串。读记录、改部位或其他字段不触发。
- **父协调方转述的 Mac 原件核验，非本执行器独立原件读取**：candidate-v5 2026-11-07 21:49Z 中 Survey Ext 与上述硬编码身份相同，active/type=1/colName=survey。该来源不代表当前完整59行的有效写权限已获证明。
- **实际前端红例**：既有 Workspace `setField` 允许 length='2.345'、width=3 后，planeArea 仍为旧6，预期7.04。原始 `.review/survey-plane-area-20261109/red.log` 保留，1 FAIL / exit1。输入由真实 Store 方法处理；API/存储为合成单元依赖，没有业务写入。

## 实现及保留边界

`survey-plane-area.ts` 是显式 Survey/定义身份专用纯函数，不是公式引擎或权限授权。保持原乘法、二进制浮点四舍五入顺序和0/空分支；不做额外十进制修正、取绝对值、钳制或业务规则优化。例如 1.005×1 仍为1，-2.345×3 为-7.04。

R1 digit onChange 保留事件的字符串/数字区别：`0×'' → 0`，`'0'×'' → ''`，`''×0 → 0`，`''×'0' → ''`。通用数字归一化原会提前消除这种区别；现在仅这个已证范围的 length/width 草稿保留已校验的输入类型，并允许未完成空串。派生空面积只有符合该规则当前输入结果时才允许草稿恢复。提交仍走原 numeric/required 归一化，空必填不能据此保存。非法数字、数组型 peer、非有限输出继续拒绝，不把 Number(['3']) 当作合法 digit。

输入类型保留仅按该Survey/定义身份及length/width字段判断，**不以当前part为3为前提**；用户可能稍后切部位。只有自动计算额外检查part[0]=='3'。复审P2实际Pinia红例为：part=['1','130']→width输入'0'→切到['3','310']→清空length；旧候选曾提前将width变为数字0，最终面积0而非空串。最小修补拆开两层条件，原红例现通过；正常面板本来保留原始输入，新增包装器兼容回归也通过。无部位切换自动重算。

实际 Store 另有四条连续事件回归：先向width或length输入字符串'0'/数字0，再将另一维清空，核前次与本次输入类型及派生结果。truthy非数的R1算术结果为NaN；纯规则保留非有限结果供入口拒绝，未把历史R1的非数行为治理为其他公式或伪造有效值。

两个既有输入入口共用该规则：

1. 通用 Workspace：源 fieldId 必须先通过既有条件、readonly、账号/角色和生命周期检查；定义还须与当前 descriptor.contentIdentity 一致。派生目标必须唯一、digit、适用/可见/受支持且可编辑。否则拒绝整次更新，不提交一半输入。输入与派生值同一次进入草稿，其他/隐藏/未知值保留。
2. 正常 forms/repeat 面板：`setValue` 委托 `updateR1FormDraftValue`，保持 busy、当前 reader scope、原 actions、计数同步和保存/完成确认。只在源和目标投影获准时更新本地草稿；不从该函数签发创建/编辑权限。

读取、仅切部位、其他字段变更不自动重算；保留原已保存面积。没有新增异步计算或自动保存/Process，也未重算已持久化历史记录。

完整59行仍有原50字段/唯一键/标量/已有记录等限制。没有为演示改节点类型、provider、fill权限或未知条件，没有将完整表单默认可写。生产/Beta写、Java/Mongo、上传、Workflow、脚本及部署均 NOT_RUN。

## 验证分层

- **纯函数/真实模型**：数值与类型分支、精确身份与part范围、重复fieldId行及条件、输入/派生目标readonly、未知peer、连续输入、本地草稿写失败、重读失败后同scope恢复、换定义后不污染等。
- **真实 SFC、合成依赖**：既有 Vue custom renderer 编译实际 `R1NodeFormsReadPanel.vue`。测试 provider 是明确合成单元依赖，不是生产授权；只核草稿输入/恢复，原级联保存保护仍禁用、保存与完成调用为0。这不是浏览器或正常App端到端写入证明。
- **正常 App H5**：重跑既有 Survey59只读两场景，确认本片未改变13路径条件及附件读取。完整59行正常页面计算编辑/保存仍 NOT_RUN；不以只读H5替代。

最终命令、结果与完整patch/hash见同批交付 `summary.json`、`MANIFEST.json`。证据根 `.review/survey-plane-area-20261109/`；本地路径不属于用户外链。原始红例和过程失败均保留。新单元测试由现有 CI 自动发现，未另改workflow或启动远端回归。

最终实际结果：10文件290项定向通过；`VITE_XLINK_ENVIRONMENT=test pnpm verify:full` 为268文件3675测试通过，含typecheck/quality，exit0；H5构建及发布QA边界通过；正常App只读H5为2 PASS/exit0，合成API请求114/57次，写入、未知/外部请求及页面异常均0。纯规则29项、实际Workspace所在onsite文件64项、实际面板所在conditional文件11项；SFC是合成组件测试，不能算浏览器写入验收。完整59行正常页面计算编辑/保存仍NOT_RUN。
