# R1 / DEV Mock 全域映射收口台账（2026-11-05）

本台账把现有实现集中到一个可执行入口，不取代生产原始模型或业务验收。基线为 `6885f9c43ca29432a4195195916ff0bf1c8dc026`；固定 R1 前后端来源沿用[权威清单](R1_REAL_DATA_MODEL_MOCK_EQUIVALENCE_INVENTORY.md)。历史验收文件保留其原时间点，不批量升级为通过。

## 唯一入口

[contracts/r1-mock-mapping.json](../../contracts/r1-mock-mapping.json)逐项连接 F01–F21 的来源文档、实际行为测试与尚未解决的限制；M01–M08 指向数据域和真实 App Playwright 用例。此前散落的表单、Workflow、目录计价、Order 与合同测试不另写一套实现。

- `pnpm check:r1-mock-mapping`：校验 21 域、8 场景、来源/测试路径、生产 HOLD 和缺口记录的一致性。索引合法 **不是测试通过**。
- `pnpm verify:r1-mock-mapping`：执行去重后的关联 Vitest 测试，逐项检查实际 suite 与 assertion 结果；缺失或跳过不计 PASS。生成忽略的 `.review/r1-mock-mapping/result.json` 和 `vitest.json`；浏览器在该报告中保持 NOT_RUN。
- `pnpm verify:full`：完整工程检查与测试；映射完整性负例也纳入常规 Vitest，防止删除域、丢失浏览器场景或自行升级 live gate。
- `pnpm test:main-h5-mock`：默认真实 App 全量 H5。opt-in 表单/深级联/媒体等场景由 main 的 stage1b-mock-h5 CI 分别开启并运行；默认跳过不能算通过。

## 数据域的映射边界

| 数据域 | 已映射的行为 | 尚不能宣称 |
| --- | --- | --- |
| F01–F03 | 登录会话、角色作用域、工单、节点及冲突身份 | 客户端菜单/handler 证明真实提交权限 |
| F04–F09 | 普通/特殊/Repeat schema、provider、FormData、共享媒体、typed Survey、分步事务与恢复 | 当前生产 FormDef/Survey 字段已全取；历史 Survey 就是当前定义；生产上传/Process 已通过 |
| F10 | 字段身份、showType/serviceType/personType、条件、Code/Cascade、Order.exts wire 与草稿回读 | 当前 9 字段的所有额外配置完整等价；任意按钮可执行；全国区域已取得 |
| F11–F17 | 四类目录、套餐组件层、数量/系数、最低价、无 SKU SPU 路径、可选 SKU 身份 | 目录价覆盖历史快照；空 SKU 说明全平台无 SKU；虚构商品/规格价格 |
| F18–F19 | type=0/type=1 区分、Order/工单身份、维修组、历史快照与非原子回执 | 真实报价创建 Order 已验证；本次 3 条未知 Order 明细金额已确认 |
| F20–F21 | 正式 Order 与合同精确关联、状态未知/冲突/禁止副作用 | 生产合同完整状态或签约权限已验收 |

所有 21 域均有可执行合成测试入口；这是**已支持范围**的覆盖，不是全量 R1 业务等价率。完整的原始 wire 样例和负例分布于映射所列测试中；当前生产的额外配置缺失仍须补证，不用合成数据填成“真实”。

## M08 规模补充与明确缺口

新增 `r1-catalog-scale-mapping.test.ts` 使用合成 ID/标签/价格，以已有角色观察到的两组量级 `27/66/89/4` 与 `1/0/14/0` 驱动真实目录读取适配器。逐页验证 rows=20、过滤、total、唯一身份、末页及空页，不产生任何生产请求。

这不是把全部大目录接入默认 App Mock router：默认 router 仍是小型交互 fixture。**M08 保持 PARTIAL**，大规模 App UI、套餐组合遍历及全套上下文等价未由该单元测试证明。不得把这个剩余项标为完成。

## 整体退出条件与后续动作

本次完成全域索引、执行工具、漂移/虚假升级防护和有限规模适配器测试。整体“R1 与 Mock 全量等价”仍为 **PARTIAL**，以下条目不能以文档收口代替实现/证据：

1. 当前合法 node→FormDef 的有界 extId 字段读取及真实 schema/provider，需先确定符合现行读白名单的请求形状；本包不扩大权限。
2. 三个普通 Order 字段的未留存额外配置、button 的安全动作及 area 的完整 provider；仍按现有能力明确阻断。
3. 本次 3 条 unsupported Order 行的无值形状，以及 type=0/历史快照更多结构证据；不猜价，不扩合同读取。
4. M08 大规模数据接入真实 App 的分页和套餐组合验收；当前仅适配器规模通过。
5. 各域完整合成 wire/标准化输出与真实当前模型逐项比对；只有取得缺失证据才升级对应 live/model gate。

真实业务写入、上传、Workflow、签约、PDF/消息继续 #201 HOLD。生产/Beta 的保存回读和服务端权限实测属于独立门禁，不是可用 Mock 去替代的缺口。本轮没有 UI 变更、原生工具、部署或新开发线。

精确测试数量、H5 实际运行/跳过、提交 SHA 与 CI 结果在 #207 交付记录中记载，不把尚未执行的项目预写成 PASS。

## 当前 FormDef 读取的新增授权及实际停止结果

Owner 随后明确批准：当前技师角色可见工单、已核对当前节点派生 extId，`biz/extField/query` 激活条件、排序、page=1/rows=50，无 `_all`；身份不符/缺页/失败立即停止。该授权只落实到审计工具的 `--current-node-formdef-only` 路径；不改变 App 的 Production API 白名单，不读取 FormData 或字典选项，不允许任意 extId、扩页、重试或写入。

已完成零网络预检、边界负例及一次实际采集：[停止回执](../../contracts/production/technician-role-readonly-20261105/current-formdef-attempt.json)。共 62 请求（1 登录、12 role tree、12 工单页、36 详情、1 字段页），越界/业务变更 0。在第 36 个详情找到同运行实例、active 且精确匹配当前任务的 FormDef 引用，字段页未通过完整合法页校验，以 `INCOMPLETE_OR_INVALID_PAGE` 停止，未扩页或重试。

本次没有保留原始响应及失败细分元数据，不能分辨总数/字段 envelope/行形状的具体原因，也不能断言权限、后端缺陷或实际字段数量。没有取得可提交的完整 schema，F04/F09 不升级为完整模型通过。第 1 条的“需要批准”已由本次授权解决，新的退出条件是查清返回页形状并取得完整、安全的有界定义；仍不得绕过页限填造数据。

本地全量 210 测试文件 / 1817 测试通过；默认 H5 67 PASS / 26 SKIP。`78290cb9` 的两项 main CI 均 SUCCESS；当前读取工具后续提交精确 CI 另见 #207，不移用前一提交结果。
