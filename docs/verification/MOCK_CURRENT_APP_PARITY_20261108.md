# 本轮 App 接口 / Mock 对齐收口（2026-11-08）

范围：在 `main@1825b4a5` 后的当前集成工作区，对既有证据所覆盖的接口继续实施修复和回归。复用 [F01–F21 权威清单](R1_REAL_DATA_MODEL_MOCK_EQUIVALENCE_INVENTORY.md)、[机器映射](../../contracts/r1-mock-mapping.json)及[当前证据层](../../contracts/r1-mock-current-evidence.json)，不建立另一套声称完整的 Mock 协议。未发 Production/Beta 请求，未写真实业务数据，未重启其他联调服务。

## 已实施的确定差异

| 对象 | 原差异 / 风险 | 本轮实现与验证 |
| --- | --- | --- |
| F02 列表过滤与分页 | 无 search/status 时提前返回完整 fixture，`page/rows` 失效；筛选需先于分页 | 与列表 lane 协作修复 `listResponse`。检查 SANode 与普通列表、全部分页、筛选后分页、搜索交集、末页及空页，保留 `total` 为过滤后总数 |
| F02/F03 分类正例与关联 | 原视觉 fixture 的 `mock-status-*` 不是 R2 分类的原始状态码，不能证明 104/105/202 正例 | 新增默认关闭的 `VITE_XLINK_R1_CATEGORY_FIXTURES=true` 合成包，保留原 12 条 fixture。三条原码字符串与精确工单 / Workflow / 节点身份贯通真实 role-scoped adapter；未知 nodeType、state、handler、FormDef 不补造，因此不提供提交动作或虚构历史 |
| F18/F19 Order 快照类型 | 合同读取场景的 `bjProducts` 返回对象，绕过 R1 JSON 字符串解析边界 | 改为 `JSON.stringify` wire；真实 Order adapter 再解析。保留正式 Order 的 `type=1`、工单关联及 page=1/rows=3，拒绝跨工单、type=0、扩页与 `_all` |
| 读取失败语义 | `success:false` 经过 transport 后可被详情 mapper 用 requestedId 补成 `succeeded` | 对 Mock 与 HTTP-200 响应共用显式失败检查。现有合成 `RETRYABLE` 为可重试，未知服务端失败码为终止失败；不猜身份/ACL 错误含义。不自动重放，下一次明确读取才恢复 |

实现文件：`src/adapters/api/mock/work-order-category-fixtures.ts`、`src/adapters/api/mock/router.ts`、`src/adapters/api/read-response-failure.ts`、`src/adapters/api/uni-api-read-transport.ts`。分类配置转发仅在 `config/playwright/main-h5-mock.config.ts` 的显式 opt-in 白名单中增加一项。

新增 `tests/engineering/mock-current-api-parity.test.ts` 16 项，验证字段类型、关联、分页、未知状态、明确失败、恢复、Mock OFF / empty / 非 DEV 隔离。测试使用本地合成 transport callback 或 Mock router，测试回调不是实际 HTTP 请求。新增测试已连接 F02/F03/F18/F19 的机器映射，不升级任何 liveParity 字段。

## 既有接口域检查与仍未知的边界

| 域 | 本轮采用的证据 / 可回归部分 | 仍未知或独立验收 |
| --- | --- | --- |
| F01 会话与角色 | 固定 R1 源码、已保存角色范围、切换身份缓存回归 | 未探测其他角色或服务器 ACL；Mock 登录不是认证验收 |
| F02–F03 列表与详情 | 列表/详情 envelope、字符串状态、角色筛选、精确工单 / 节点 / run 关联；本轮补上述修复 | R2 分类分组不证明真实当前业务状态分布；显示 handler 不等于写权限 |
| F04 当前 FormDef | 同次采集 59 字段结构及实际 mapper 回归 | 2 未知类型、6 行配置缺项、25 行原键未留存、3 provider 未读、operationType 未留存；用途不能猜成 Survey |
| F05 字典/provider | 已留存 Code/Cascade 形状、过滤与条件 | 未取得的 provider / 全国区域 / 街道，不填假选项 |
| F06–F07 FormData/forms/repeat | 保存与 Process 分离、记录 / 定义 / Workflow 关联、完整 formList、ACK 和失败恢复的现有合成回归 | 真实持久化、读取完整性与提交权限由隔离本地后台验收；本轮 Mock 结果不代替它 |
| F08 媒体 | 共享队列、URL wire、失败 / 移除 / 迟到回执的既有回归 | 未验证真实上传、权限或远端文件；不新增上传 |
| F09 Survey | 历史 61 字段族合成 schema 与通用表单能力 | 不能把历史 Beta schema 当当前 Production 定义 |
| F10 Order 扩展字段 | 已留存普通字段、可见 / 必填条件及 wire 回归 | 3 普通字段额外配置、button 动作、完整 area provider 尚不全；不猜未知按钮行为 |
| F11–F17 目录、组件、SPU / SKU | 四上下文已有读取、mini 价、材料层 / 系数 / 最低价、空 SKU、规模分页的既有回归 | 无 SKU 不制造 SKU；快照价不由现目录价覆盖；样本不证明价格新鲜度或全平台无 SKU。M08 仍 PARTIAL |
| F18–F19 Order | 报价/正式单区分、JSON 快照、维修组、非原子回执；本轮补字符串 wire | type=0 与后续生产 Order 页未读取；3 条既有 unsupported 行不猜金额；通用生产 queryById 仍关闭 |
| F20–F21 合同 / 签约 | 固定范围只读、Order + 工单双关联、状态未知/冲突/空页、迟到响应隔离 | 状态样本不是完整枚举；签约资格、PDF、短信、签约写入仍未验收，#201 HOLD 不变 |

## 实际执行结果

- 新增 Mock 16 项及列表 lane 定向 15 项：31/31 通过。
- `node scripts/check-r1-mock-mapping.mjs --run`：40 个测试文件、398 项通过；21 域仅其已关联的支持切片 PASS。整体仍 `SUPPORTED_UNIT_SLICE_EXECUTED_NOT_FULL_EQUIVALENCE`，浏览器为该命令的 `NOT_RUN`。
- 首轮 `pnpm verify` 已过工程边界、映射及 typecheck；全量单测为 3480/3481，唯一失败是列表 lane 新增分类使 `home-list-production.test.ts:92` 的旧静态断言失效，已交该 lane 修正。不可把这一轮写成全绿。
- 分类真实 H5 由列表 lane 在其独立配置统一验证；此处不启动第二个服务，也不重复宣称未执行的浏览器结果。最终提交与精确 SHA 的完整检查 / H5 / CI 结果由整合交付回执给出。

**结论：本轮补了可确定的 Mock 差异及实际失败误报。未取得的证据逐项保持 UNKNOWN / NOT_VERIFIED；关键链路最终仍以获准的隔离本地真实后台验收为准。**
