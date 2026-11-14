# 签约只读处理人：工作流实例缺失时保守拒绝

基线：`c8e48138003616093343fb3f21bfd85be2ea24aa`（该提交仍独立待审）。本批不改该提交的资料测试，不触 Mac、媒体资产、生产、签署或合同命令。

## 可复现缺口

`reviewR1ActivePlaceOrderHandler` 原来仅在工单和节点的 runId 都存在时比较二者。真实 `workOrderDetail` mapper 允许缺少一方或双方 runId 的只读投影；合法 handlerIds 仍可得到 verified 可见性。这样的新读取结果会被处理人判断标为 verified，尽管尚未证明节点属于当前工作流实例。这是前端只读“处理信息已核对”的误报，不是签署写入已开放，也不是生产漏洞复现。

新增测试从合成 wire 经实际 mapper → handler 判断 → 首次签约意图：缺少工单 run、缺少节点 run、双方缺少，以及两种空串，共 5 项先失败。完整且匹配的 run 与冲突 run 的原有行为各 1 项通过，合计 RED 5 / PASS 2。

修复仅要求两个 workflow runId 均存在且相等，否则处理人事实为未核验。没有修改通用 mapper，普通只读展示仍可消费不完整数据；没有增加 handler 匹配范围或变更签署 dispatch 门。

## 固定契约与验证

- R1 `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`，`business/subpackages2/workOrder/workOrder.vue:727–750`：首次按钮的 type/processState/isAgain 是界面条件，不是签署授权。
- 后台 `xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`，`ServiceAppointmentServiceImpl.java:314–319`：按工单 formDataId 找 Workflow，再按该 Workflow 的 ID 查询节点。本批直接只读核对固定源码，不声称实际生产部署同版。
- 新增 7 项修复后通过；相关正常资格、独立资格、节点处理人、签约 Store、只读协调和订单边界，共 7 文件 / 105 项通过。
- 正常 App 430×932 合成 H5 3/3 通过：匹配处理人、外部处理人、迟到结果及退出。已查看匹配/不匹配实际截图，处理人提示分别为已核对/未确认，合同及签约操作仍关闭。缺 run 的新负例是 mapper/判断/意图测试，未冒充该负例已在 H5 单独执行。
- 类型、架构边界及 diff 检查通过。日志、RED 与 H5 trace 保留在 `.review/non-media-closeout-20261114/` 及 `test-results/normal-signing-eligibility/`。

## 真实隔离验收仍缺什么

当前正常签约资格窗口仍缺真实 Java 的端到端验收。可用全新虚构工单、正式 Order、Workflow/Node 和合同，正常登录后只读验证三者关联、当前处理人及订单首次签约条件；匹配与外处理人分别核对。缺数据、过期会话及角色切换必须保持未确认。逐项记录真实服务器响应及副作用差分；不重放旧 Order 保存，不调用签署、短信、PDF或合同写入，也不使用生产登录。上述客户端合成结果不证明后台签署权限或生产有效配置。
