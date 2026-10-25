# 阶段 A｜Mock 功能与协议基础工程收口

**决定：`A_OFFLINE_FUNCTIONAL_ACCEPTED`（有界工程验收）**  
**审查日期：2026-10-25** · **Owner：Ye** · **工程审查：ChatGPT Lead**  
**代码基准：** Draft [PR #217](https://github.com/xlink-bj/xlink-technician-app/pull/217)
@`d822bb77670df66b60368b2c3090a191dd063d53`。

本文件是阶段 A 的**验收边界及证据账本**，不是 Release/merge 签收。
阶段 A 要求技术员在**真实 Main App 的 Mock 模式**下完成有源码证据的
业务操作、状态回读和错误恢复，并且让**未知/尚未授权**的能力明确阻断；
不把本机成功、H5 截图或 R1-shape 测试包装成 R1 服务端写入等价已证实。

## 1. 交付范围的完整性

| 能力 | 正向 Mock 闭环 | 阻断/恢复边界 | 工程判定 |
| --- | --- | --- | --- |
| 登录/角色、首页、工单列表、详情 | Main App 的 Mock actor / current-role / WorkOrder 路由可驱动后续场景 | 非当前用户/角色、错误工单上下文不能继承提交能力 | **PASS（工程基线）** |
| 预约 → 勘察 → 报价 | `MOCK-019` 保存预约、按确切 FormData 读回后进入勘察，再保存勘察并进入报价；详情页投影本机阶段状态 | 空记录、错误 FormData/node/WorkOrder、失效角色、读回失败阻止前进；不是服务端 Workflow 完成 | **PASS（离线）** |
| 动态字段 | R1 `switch: "1"/"0"`、checkbox 数组、展示字段、维修部位和条件字段按已知规则处理 | 未知 provider、复杂 `button`/媒体/特殊控件、隐藏/无效字段明确不可操作，不臆造提交值 | **SUPPORTED PASS / UNKNOWN BLOCKED** |
| `forms` 单节点多表单 | `MOCK-020` 新增、编辑、完整 EXTS、软删除、Process 完成、重启读回 | 原记录范围、复用 ID、未保存/已删记录、未知 ACK、并发与角色变更保护 | **P0 PASS** |
| `repeat` 重复表单 | `MOCK-021` 独立新增/编辑/删除、workflow-run 限定列表、批量有效 ID 完成、重启读回 | 空/错范围/重复/已删 ID、未闭合列表、未知 ACK 禁止错误 Process 与重放 | **P0 PASS** |
| 报价/SKU/正式 Order | `MOCK-019` 已知价格的普通 Material + Procedure → 计算 ¥107 → 双确认 **本机合成** `type=1` Order → `queryById` + 重启核对 | SKU 生效价格无法证明则不生成价格/Order；Mock 收据/重复操作阻断；真实正式提交禁用 | **P0 PASS（已证实正向样例）** |
| Contract / 签约 | 已有 Order↔Contract 身份关系的 **只读 Mock 评审**，可从工单/报价链导航 | 真实签署、PDF/SMS、生成/发送合同及未知 `button` 副作用明确不可执行，不显示伪成功 | **NEGATIVE GATE PASS；写入不在 A** |
| 异常与重启 | 完成态本机存储、只读核对、撤销/暂停继续、重复点按与收据保存 | lost ACK / partial dispatch 保留 durable fence；禁止自动重试；无授权生产网络调用 | **P1-R PASS** |
| 操作 UX / 证据 | Main H5 019/020/021 交互/截屏；Mac 375×667 原生模拟器关键节点、完成和重启 | 原生裁切及应用组件 WXSS 不兼容告警已修复；未实施多机型视觉适配 | **P1-U/P1-E PASS** |

**说明：**这里的“完整”指**约定范围的已证实正向动作 + 明确的负向边界**
均有用户可理解的结果及自动化证据。它不表示 R1 全部
ExtField/流程类型、当前租户有效 SKU 价格和签署行为都已知。
对不具备协议或授权依据的功能，**正确阻断就是阶段 A 的验收要求**。

## 2. 两项 P0 与三项 P1 的可复核证据

| 工作包 | 已落实的实际行为 | 代码级回归 |
| --- | --- | --- |
| **P0-1** `forms/repeat` | 确切 `FormData upsert → updateExts/process` 或 repeat 批处理；独立新读回、可恢复 receipt、页面交互与重启 | `tests/engineering/a-mock-special-forms-repeat-protocol.test.ts`; `a-stage-main-app-special-controller.test.ts`; `r1-stage1-functional-flow.test.ts` |
| **P0-2** 合成报价/订单 | 已知价普通材料/工序、真实报价编码器、合成 child Workflow + Order、重复提交保护与精确 ID 查询 | `tests/g4f/mock-journey-order-protocol.test.ts`; `tests/engineering/a-stage-main-app-quote-order.test.ts` |
| **P1-R** 失败恢复 | 双击防重、超时/ACK 丢失 durable fence、actor 变更拒绝、读回只读恢复、不确定结果不自动解锁 | 上述 controller + protocol suites；`tests/engineering/r1-stage1-no-beta-shadow.test.ts` |
| **P1-U** 可操作界面 | Main App 019/020/021 点击、完成、刷新/重启；375×667 原生裁切修复、组件 WXSS 告警消除 | `tests/h5-main-mock/a-stage-p1-acceptance.spec.ts`; 原生证据下方链接 |
| **P1-E** 状态/协议证据链 | 页面点击 → 源码形态命令 → scoped durable Mock → 独立读回 → named test | [P1 trace matrix](./A_STAGE_P1_ACCEPTANCE_EVIDENCE.md)；[R1 three-pillar source matrix](./R1_THREE_PILLAR_CONTRACT_MATRIX.md) |

源代码语义来源固定为
`xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`。
生产只读佐证使用已经获批的 [#199 脱敏记录](https://github.com/xlink-bj/xlink-technician-app/issues/199#issuecomment-6370200739)，
**本轮没有扩大只读范围，也没有重采业务数据**。

## 3. 精确验收证据及可重放命令

- **基准提交 `d822bb7` 的 CI：**
  [Validate](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40191966481)、
  [Main H5 UX](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40191966540)、
  [DS02A H5](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40191966438)、
  [M1 S2 Focus](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40191966511)
  均为 **SUCCESS**；只将实际执行成功的工作流计为 PASS，条件跳过不计。
- **Mac 原生：** [375×667、DEV Mock、MOCK-020/021 完成和重启、
  WXSS 正常的 `MP_DEVICE_PASS`](https://github.com/xlink-bj/xlink-technician-app/pull/217#issuecomment-6398597783)，
  [Lead 已审查接受](https://github.com/xlink-bj/xlink-technician-app/pull/217#issuecomment-6398758924)。
  先前 `MOCK-019` ¥107 本机重启/订单提示同样在 Mac 走通。
- **2026-10-25 独立验收复核（同一基准代码）：**
  `VITE_XLINK_ENVIRONMENT=test` 下 **155/155 test files、
  1,456/1,456 tests PASS**；TypeScript、架构边界、EQ10 ownership、
  UI governance、M1-I8 baseline、critical manifest PASS；H5、MP-WEIXIN、
  App 的 Test build PASS。无代码重构，以减少刚通过的原生 UI 回归风险。
  直接在无 `VITE_XLINK_ENVIRONMENT=test` 的运行环境执行全量测试时，
  有 5 个 Mock Fixture 断言失败（Mock 默认禁用）；这是**运行配置
  不符合 Test 模式**，并非证据被忽略。复核使用项目规定的环境变量，
  且所有用例实际通过。

```sh
VITE_XLINK_ENVIRONMENT=test pnpm exec vitest run
pnpm run typecheck
node scripts/check-boundaries.mjs
node scripts/check-eq10-ownership.mjs
node scripts/check-ui-governance.mjs
node scripts/check-m1-i8-baseline.mjs
CI=1 VITE_XLINK_ENVIRONMENT=test pnpm run build:h5
CI=1 VITE_XLINK_ENVIRONMENT=test pnpm run build:mp-weixin
CI=1 VITE_XLINK_ENVIRONMENT=test pnpm run build:app
```

本次隔离执行环境的 `pnpm 11` 默认禁止部分依赖安装脚本，
所以实际验证使用已锁定的 `./node_modules/.bin/` 工具入口；
这不代表 CI 失败或变更依赖版本。仓库 package manager 仍是
`pnpm@10.31.0`；标准复核应在版本一致的 CI/Mac 运行。

## 4. 精确退出条件与后续阶段边界

**A 工程退出判定：`A_OFFLINE_FUNCTIONAL_ACCEPTED`。**
两个 P0、三个 P1、Mock 正/负行为、故障恢复、CI 与单尺寸原生
模拟器均具备证据；阶段 A 作为下一步 UX/UI 的功能基石可冻结。
此前单个文档的 `PENDING_CI`、`NEEDS_MAC_DEVTOOLS` 状态只是历史快照，
以本验收记录及上述精确源码/运行记录为准。

**不构成此退出条件的待办：**

1. **UI/UX 下一阶段：** Owner 的商业化视觉判断、任务层级/字体/易用性
   精修。保留已经认可的登录/工单/预约基础，优先完善勘察、报价、签约。
2. **B Production 只读：** 仅在既有批准的角色、对象、接口和限界下开展
   App 页面真实数据读取；不存在“Mock 自动等于生产协议”的推断。
3. **C 独立 Beta 写入：** 需要新的测试实例、Actor/WorkOrder/Node、
   操作清单、回读/回滚授权；真实 Workflow/Order/Contract 写入全部 HOLD。
4. **后续设备：** 390×844 原生、实体手机及更广泛适配已按 Owner 决定
   延期，不反向取消 375×667 的 Stage A 技术验收。

**禁止推导：** `A_OFFLINE_FUNCTIONAL_ACCEPTED` ≠
`WRITE_VERIFIED` ≠ `COMMERCIAL_UI_ACCEPTED` ≠
`RELEASE_READY`；PR #217 继续 Draft/OPEN，无合并、部署或
Production/Beta 业务写入授权。
