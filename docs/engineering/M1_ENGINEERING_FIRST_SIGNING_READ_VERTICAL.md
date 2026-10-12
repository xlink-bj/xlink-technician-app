# M1 Engineering-first — official Order → Signing read-side vertical slice

**Owner decision (2026-10-12):** 工程功能、数据契约和集成优先；四屏 V2 外观/布局/视觉审核移至第二阶段，不再阻挡工程能力实现。原始 8 个 Issue 的验收标准不降标；整体 1/8 正式验收与工程代码就绪分别报告。

## 第一阶段本 PR 交付（可运行代码，不是概念稿）

从已有 Production 只读工单列表 → 工单详情「报价记录」 → 用户明确选中的 **正式 Order.type=1** → 独立只读「签约前订单核验」页。和开发用 `signing-mock-review` **完全分离**：

1. `bootstrap` 装配 Pinia `signingReviewReadStore`，依赖当前 user/session/role/version，以及**当前会话已加载的角色可见工单列表**、同一工单已成功加载的详情。前置条件不足时直接 BLOCKED。
2. 主 App 工单详情只在既有 Production-read-only 报价记录中显示 `签约前核验 · 只读` 链接；不显示在本机报价草稿或合成签约数据中。导航同时携带 WorkOrder/Order ID（不携带个人资料、合同或价格）。
3. 页面二次核验：首个有界最多 3 条 `type:1` 订单列表必须包含目标精确 ID，再通过现有 scoped read adapter 二次读取并校验 WorkOrder/Order 与 session 权限指纹，才显示**脱敏订单摘要**。即使取得正式 Order 也始终 `contractReadAuthorized=false, signingAuthorized=false`。
4. 同用户切换角色、角色版本改变、注销、工单授权撤销或多订单请求竞态后旧摘要必须立即失效；旧异步响应不得复活。错误和异常输出脱敏。退出页面清空临时状态。
5. 合同内容、PDF、电子/线下签名 QR、短信、工作流 Complete、任何订单/签署业务写接口**不调用**；页面两个对应按钮始终禁用。未知的真正签约权限/状态不可通过 UI 推测。
6. 新增 Pinia 真实 Store 10 个自动化用例及主 App 375/390 浏览器伪造路由阻断，合并现有原协调器 10 条安全测试、原应用 H5、MP/App 构建。**CI 构建成功不等于真机验证**。

## 尚未关闭的业务 Gate

- I2：当前授权 Production 租户没有可用的真实活跃 SPU/SKU，不能虚构 SKU 等价。
- I3：固定 R1 的 `quote()` 是 `type:0` 报价接口，而新 App 当前 `type:1` 是候选订单编码；未取得真实阶段/价格契约不能触发订单创建。
- I6：真实合同生成、签约方、合同状态、电子签署 QR/短信/PDF 的完整 API 与副作用仍未认证；该页仅是工程 read-side 交接，绝不是签约功能已上线。
- I4/I5 第二阶段：Owner 确认的 V2 四屏设计等正式视觉提升；#111 图集保留，但不阻塞当前工程。
- #29 Beta 写入、#64 微信/iOS/Android 真机独立 Gate 依然有效；源码、后台、生产数据没有修改。

**验收计量：** 本 PR 为明确的**工程垂直切片**。通过 exact HEAD CI 可记 `ENGINEERING_CODE_PASS`，不能自动标记 I6 4/4 或 M1 2/8。所有 PR 继续 Draft，不合并 main，不授权写入。
