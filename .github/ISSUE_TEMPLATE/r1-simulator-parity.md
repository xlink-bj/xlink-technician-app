---
name: "R1 Simulator Parity / 本地模拟器业务差异"
about: "对比固定 R1 源码与新 App 模拟器行为，记录一个可复现的独立差异"
title: "[R1 Parity] <阶段> — <具体业务差异>"
labels: []
assignees: []
---

## 阶段 / 环境（必须）

- 阶段：Login / Work Orders / Appointment / Survey / Quotation / Signing
- 新 App Draft PR 与 exact commit：
- 平台：H5 / 微信开发者工具 / Android 模拟器 / iOS 模拟器 / 真机
- 环境：**Synthetic DEV Mock** / 特别授权的只读测试（写明是否授权；默认仅 Synthetic）
- 是否执行了任何真实 API：否 / 有（仅允许事先授权的只读请求）
- 真实业务写入：**禁止，除非另有单独审批和独立 Issue**

## R1 预期业务真值

- R1 仓库与 pinned SHA：
- R1 文件 / 行号 / 路由 / 字段或状态：
- 预期输入、业务动作和权威读回：
- 若 R1 来源未覆盖：标记 **SOURCE_NOT_VERIFIED**，不能自行推定

## 新 App 的可复现步骤

1.
2.
3.

- 实际 App 页面与组件路径：
- 实际行为：
- 预期行为：
- 已知是否为 Mock-only / UI-only：
- 当前 Role、WorkOrder、WorkflowNode、Order 等**只写合成别名/已脱敏标识**：

## 分类与影响

- 类别：**业务契约 / 权限 / 数据映射 / 状态流转 / 报价计算 / SKU / 媒体 / UX / 设备 / 性能 / 测试架构**
- 严重度：P0 阻断集成 / P1 核心操作受损 / P2 体验与优化
- 影响的步骤：
- 是否可能导致真实订单/签约/客户通知副作用：
- 是否涉及不支持的 R1 可选字段、折扣、SKU 或动态表单类型：

## 最小工程行动

- 建议修复的模块或 Port：
- 先补的行为回归测试：
- 是否必须等待本地授权 R1 API 样本：是 / 否
- 可接受的验收证据：Unit / Playwright H5 / Golden / MP 模拟器 / App 模拟器 / 已授权的真实只读结果
- 与已有 Issue/PR 的关系：

**隐私要求：**不得附上真实客户姓名、手机号、地址、合同、账号令牌、验证码、SDK 密钥或未脱敏的业务响应。签约/订单/流程提交均不得在此 Issue 内自行授权执行。
