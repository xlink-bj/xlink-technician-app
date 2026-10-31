# M3-P0-C — 报价 / 正式订单 / 签约前只读候选状态一致性

日期：2026-10-31。独立基线：`main@789c4c58bcf37aba844a7a43a96c81fcd0030538`。与 Draft PR #260、#261 无依赖，未合并。

## 已证实的缺口

- R1 固定源码与脱敏只读调查：`basic/order/query` 可返回 `type=1, state=-1` 的取消订单，而签约候选的 `clearOrderFieldQuery` 只保留 `state=0/1`（`docs/engineering/R1_THREE_PILLAR_CONTRACT_MATRIX.md`）。
- 签约命令意图评审原本已经拒绝取消、未知生命周期订单；但正式订单 Q00、工单详情的签约入口，以及两层只读核验此前仅校验 `type=1 + 精确 ID + 工单归属`，未覆盖生命周期。
- 这不等于实际发生了签署或权限绕过：真实签署、短信、PDF、合同生产读取仍然被禁用。缺口是 **把非候选订单送入 C01「签约进度」预检** 的用户认知与读取状态一致性。

## 收口策略

1. 单一策略 `src/shared/signing-order-read-policy.ts`：`type=1` 且 `state=0/1` 才是 **签约前只读候选**；已取消、状态缺失和未识别状态全部 fail closed。此规则不代表签署权限。
2. Q00 正式订单卡与工单详情保持历史订单可见，但取消/未知订单不提供签约跳转，并以业务用语解释原因；视觉样本与另有意义的本机草稿不冒充当前正式候选。
3. `signing-review-read-workspace` 在首次有界列表以及二次精确 scoped read 后分别校验状态，拒绝异步变更或伪造状态升级。
4. 适配器在二次 `basic/order/query` 返回时再次校验生命周期；绝不退回权限未核实的 `queryById`；签约命令预检也复用同一状态策略。
5. 不修改现有合同状态语义、R1 API 协议、订单编辑/定价、WorkOrder 权限、生产环境只读白名单或已批准的登录/工单/预约商业视觉。

## 验证

| Gate | 结果 |
| --- | --- |
| `CI=true VITE_XLINK_ENVIRONMENT=test pnpm verify:full` | **PASS：173 suites / 1543 tests**；0 runtime SCC、0 当前策略违规 |
| H5 / MP-WEIXIN / App Release build（`CI=true`） | **PASS / PASS / PASS**；QA 发布隔离有效 |
| Mock 实际主 App 430×932：Q00 → 正式订单 → C01 合同只读 → 返回 | **PASS**，无外部请求、JS 异常、签署/短信/PDF 写入 |
| 既有 QSign 375×667 / 390×844 以及伪造 Order 负向回归 | **6/6 PASS**（含新 430 用例） |
| 取消、未知、非候选订单三层校验 | 单元测试 PASS；合成有效订单夹具补全明确 `state=1` |
| S2 商业 UI 375×667 / 390×844 | **2/2 PASS**；50 张真实主 App 截图、2 张 Sheet 及索引完整性检查 PASS；不替代 Owner 商业视觉验收 |

## 不宣称已完成

- 合同生产读取、签约、重签、短信、PDF、支付、Order/Workflow 写入一律 **NOT AUTHORIZED**。
- 微信开发者工具 / 真机原生交互 **未在本轮执行**。Mock 只证明契约一致性，不代替 Beta 写入集成。
- `CODE_PASS` 不自动等于 `COMMERCIAL_UI_ACCEPTED`。视觉截图仅保留在 `.review/` 或 `test-results/` 本地，不上传真实客户信息。

下一步需 Owner 审核 PR；若批准合并，逐条核对精确 HEAD、先后集成到 `main`，以最终 main SHA 的完整 CI 作为 M3-P0 收口依据。
