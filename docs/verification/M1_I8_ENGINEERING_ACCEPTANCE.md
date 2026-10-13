# M1-I8｜六阶段验收证据与遗留 Gate 包（工程审查稿）

**口径**：当前代码证据来自 `xlink-bj/xlink-technician-app@af9a872a9575a2a4ba3885fdc500d71c78ab4b55`，即 I6 直接研发候选 PR #112 的已验证 HEAD；本 I8 分支必须重新用它自己的 HEAD 跑 CI。R1 依据固定于 `xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`。该报告不会以 CI 绿色、构建通过或 DEV Mock 冒充实际六阶段业务验收。

## 1. M1 六阶段对照（继承 I1 原场景编号）

| 阶段 | I1/R1 追踪编号 | 新 App 核心实现与已知事实 | 当前保留的业务差异 |
| --- | --- | --- | --- |
| 01 登录 | L01–L04 | `src/pages/index/index.vue`、`login-flow.ts`，DEV 合成身份可贯通 H5 | 真实租户的验证码/协议、角色树、身份变化与错误回执未做完整 R1 等价证明 |
| 02 工单 | W00/W02–W05 | `work-orders.vue`、`detail.vue`、WorkOrder Role-scoped reads；I1 证据表明主导航是 ServiceAppointment | 活跃角色列表、节点/接单、外呼授权和历史差异路径仍需真实范围证据 |
| 03 预约 | A01–A04 | Action Workspace 预约表单/时间选择，H5 验证返回/标题切换 | 预约表单的正式保存和 Workflow Complete 未经独立 Beta 写准入 |
| 04 勘察 | S01–S04 | Runtime 标准字段 + Survey 专用渗漏原因/媒体组件，H5 合成路径 | 真实表单节点、照片上传/相机/水印、弱网与平台权限未实机闭环 |
| 05 报价 | Q01–Q06 | 目录/SPU/SKU、分组/套餐/本机草稿、正式 Order 只读候选，源码与 CI 已覆盖部分 | 活跃 SKU 的真实属性/价格、Order 创建/编辑/金额和报价四屏 Owner 视觉仍未验 |
| 06 签约 | C01–C04 | 正式 type-1 Order 有界核验、DEV 合成 Contract 状态、五类 R1 命令前置审查与回读模型 | R1 Contract 查询字段差异、实际 signer/合同角色、签署/短信/PDF 的真实结果尚无授权验证；通用命令传输层对它们硬阻断 |

*功能状态*：`PARTIAL_CODE`、`ENGINEERING_TESTED` 均不代表 `BUSINESS_E2E_PASS`。详见 `M1_I8_ACCEPTANCE_MANIFEST.json` 的机器可核对字段，以及 `M1_I1_R1_SIX_STAGE_PARITY_LEDGER.md` 的原始编号与 R1 源定位。

## 2. 精确运行证据与证据等级

| 维度 | 已取得的 **工程证据** | 未覆盖的真实状态 |
| --- | --- | --- |
| 主候选提交 | PR #112，`af9a872a9575a2a4ba3885fdc500d71c78ab4b55`（OPEN/DRAFT，未合并） | 本 I8 Draft PR 单独 CI 需跑自己的 HEAD |
| TypeScript/单测/架构检查 | Validate #38353839683：95 suites，962/962 PASS | 真实租户/权限/业务数据未覆盖 |
| H5 | Main H5 #38353839578：2 启动、23 真主 App DEV Mock、26 legacy G4-F PASS；其中包含 375/390 签约审查、预约/勘察标题回归 | 此为浏览器隔离 Mock，非生产签约演练 |
| 微信小程序 | 同一 Validate 的 MP-WEIXIN **编译通过** | MP DevTools/真机运行 **NOT_RUN** |
| Android/iOS | 同一 Validate 的 App **构建通过** | 实体安装/相机/上传/安全区/返回与网络 **NOT_RUN** |
| 真实业务 | 无新的生产/Beta 业务写入；后台未改动 | SMS、签章、合同生成/取消、真实报价提交均 **NOT_RUN** |

原始 CI 地址：
- https://github.com/xlink-bj/xlink-technician-app/actions/runs/38353839683
- https://github.com/xlink-bj/xlink-technician-app/actions/runs/38353839578

该表是源基线快照而非未来运行声明；I8 自身提交会改变 HEAD，**必须更新/追加其单独 CI**，不能沿用父提交的绿色状态替代验收。

## 3. 独立阻塞 Gate（不合并成一个“未完成”）

| Gate | 负责人/环境 | 可核验完成条件 | 当前 |
| --- | --- | --- | --- |
| G-R1-ROLE | Codex 本地/指定已授权环境 | 当前角色、工单、订单及 Contract 对象范围的有界只读对照，脱敏记录，不能切角色或新增账号权限 | **BLOCKED_APPROVAL** |
| G-I2-SKU | Codex 已授权租户 | 存在当前角色可见的 active SPU/SKU 之后，有限查询匹配 exts/Code/选规，不能造价格 | **BLOCKED_ENV** |
| G-I3-ORDER | Lead + Owner Beta 授权 | 真实金额、Order.type=1 构造/读取/失败回滚与是否启动 PDF/工作流均按 R1 证实 | **BLOCKED_ENV** |
| G-I6-CONTRACT | Lead 源审 + Codex 有界只读 | 确认 R1 的 `is:workOrderId` 与后台存储 `serviceAppointmentId` 真实等价关系，保留原接口 | **UNRESOLVED_SOURCE** |
| G-I6-SIGN | Owner 单独审批 | 既有后台 signer ACL、电子/线下签约、消息、异步回执/状态变更严格复核 | **BLOCKED_APPROVAL** |
| G-MP | Codex 微信设备 | DevTools 与实体手机运行、节点/媒体/网络/权限/页面安全区按场景记录 PASS/FAIL | **NOT_RUN** |
| G-APP | Codex Android/iOS | 双平台真实安装、摄像头与上传、恢复/路由、弱网表现，分设备型号记证据 | **NOT_RUN** |
| G-UX | Owner | I4 报价四屏、I5 真实 Vue 实现和 I8 整体视觉/体验显式接受或拒绝 | **DEFERRED_OWNER** |
| G-RELEASE | Lead/Owner | 所有关键 Gate 或明确风险签收，单一候选 main-ancestry、可回滚 PR，独立发布许可 | **BLOCKED_APPROVAL** |

所有 Gate 的机器化副本在 `M1_I8_ACCEPTANCE_MANIFEST.json`；代码测试不得擅自将它们变为 PASS。任何真实签约/PDF/短信/业务写入都不属于自动化“Read-only verification”。

## 4. 集成与复现基线

- 原始工作区的技术栈为 Vue 3 + uni-app + TypeScript，主要共享 Runtime/typed Ports；I7 经双父提交收敛了早期 I2/I3 与 main 历史；这不等于已授权合并主干。
- I6 最新工程源码分支 `lead/m1-engineering-first-signing-read-integration`，I8 验收包分支 `lead/m1-i8-engineering-acceptance-baseline` 单独基于其已验 HEAD。
- 安全复现（无生产凭据、无真实业务操作）：`pnpm install --frozen-lockfile` → `pnpm run check:m1-i8-baseline` → `pnpm verify` → `pnpm test:main-h5-boot`、`pnpm test:main-h5-mock`、`pnpm test:uni-h5-g4f-review` → `pnpm build:mp-weixin`、`pnpm build:app`。
- 不进行 merge/force-push、后端调整或真实业务写入；回滚通过保留受控 HEAD 与新 Revert PR，而非在生产环境试错。

## 5. 验收决策——尚未签署

**I1** 为审计基线已接受；**I2/I3** 离线部分 3/4；**I6** 2/4、**I7** 1/4；**I8** 仍 **0/4**，M1 正式 **1/8**。I4/I5 视觉第二阶段，未获得 Owner 终验。此次交付可以被视作“**I8 验收材料准备/自动检测工程已完成**”，不能视作 I8 本身、M1 整体或正式 Beta/Production Ready。

Owner 最终决定字段：`I8 UX/Architecture: PENDING`；`Beta business writes: NOT_APPROVED`；`Device release: NOT_RUN`；`Main merge: NOT_APPROVED`。
