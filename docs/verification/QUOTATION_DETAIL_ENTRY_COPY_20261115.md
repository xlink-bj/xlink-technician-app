# 报价详情入口文案与 26018 订单读取诊断（2026-11-15）

## 最小改动

详情 `place_order` 任务入口从“去下单”改为“查看报价与订单”。只修改 `detail-workflow.ts` 的展示映射；真实提交订单、报价生成、Production 只读专用文案均未修改。仍由原 Workflow 投影决定任务、可用性及权限，原 `action=place_order&entry=orders` 路由不变。

实际落地为正常 `QuotationOrderHub`“订单管理”。当前 26018 首屏提供“重新读取”和“＋ 新建报价草稿”，并不是直接正式下单。文案修正不表示订单读取或写入能力新增。

## 读取失败的准确原因

模式：既有 DEV Mock DATA、正常工单列表/详情、26018（`mock-work-order-018-quotation-foundation`），非 `q00Preview`，无注入订单或草稿。

1. 正常 `QuotationOrderReadAdapter.listTypeOneOrdersForWorkOrder` 发出 R1 既有有界形状：`POST basic/order/query`，`page=1`、`rows=3`、`sortField=createTime`、`sortOrder=desc`、精确 `is:serviceAppointmentId|string#and`、`is:type|integer#and=1`，无 `_all`。
2. `mock/ownership.ts` 将此合成工单的 Order 查询认定为本地拥有，防止请求落到真实后台。
3. `mock/router.ts` 未配置 018 的该订单列表响应。当前配置只提供 019 的已持久 Mock 协议记录与独立 04009 的有界合成 Order；018 的 `__mock/quotation/action-content` 返回 `quotation:null`，仅说明报价编辑器初始输入，不证明正式 Order 列表为空。
4. `tryMockRead` 返回 `null`，`uni-api-read-transport.ts` 随即抛出 `server_terminal / Synthetic mock read is disabled`，不会调用真实网络。Order 适配器和 browse store 保留失败/未知状态，正常 Hub 显示“暂无法读取已有订单”。

因此是当前合成场景缺少订单列表 provider/数据证据，不是本机网络或环境配置失效，也不是正式 Order 数量为零。现有 `qsign-readonly-closure`、`ds07c4b-quote-signing` 回归原本就要求 018 保留未核实状态。

没有将 `null` 改为空数组、借用其他工单 Order 或新增假正式订单。若要将本场景改为订单读取成功，仍需明确其订单初始数据及来源；单凭“空报价编辑器”不能安全决定正式订单状态。本次没有扩展该业务假设，未变更 Mock router、真实 API 形状或安全开关。

## 针对性验证

- 类型检查、UI governance 通过。
- Mock 场景、展示映射、订单读适配器及 browse handoff 共 71 项单测通过。新增用例复现 DEV Mock DATA 下 018 精确请求未配置、失败不变空页、真实网络未调用。
- 实际 App H5：375/390 的未核实 Order 与伪造签约身份保护通过；补充断言新入口文案及原路由参数。
- 430×932 的既有 DETAIL 视觉测试检查标题/客户/按钮对齐、触控尺寸、白色任务卡及长按钮文案。
- 更新后的详情与落地首屏另存 `.review/新版统一查看-20261115/430x932/Action-CTA-<提交短 SHA>/`。旧 `Action-a91a1faf` 图片保留；截图仅本地交付，不代表 Owner 商业视觉签收。

未执行真实业务写入、生产访问、上传、签署、原生 WeChat 或整轮无关回归。精确提交 CI 状态在本地截图核实记录及交付消息单独计账，运行中不得计为通过。
