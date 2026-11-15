# 正常 Mock 表单入口与局部布局纠偏（2026-11-15）

范围：正常详情入口诊断、预约选时首屏操作、材料规格返回按钮。沿用现有运行时、Mock 数据、共享控件和商业样式；不接新协议，不修改字体基础样式。基于 `41121e7a6c230beccc67a961fb0a21b52ed63371`。

## 根因与处理

| 项目 | 核实结果 | 本批处理 |
| --- | --- | --- |
| 26019 预约入口禁用 | 已有 `selectActionWorkspaceLoadTarget` 明确允许 DEV H5 E2E 的精确 019 预约/勘查节点读取及本地草稿预览；详情页却只放行 survey 阶段。节点、FormDef、角色配置均已存在，不是缺测试数据。 | 详情复用加载器的现有资格判断，同时匹配当前阶段/intent、forms 来源和 DEV H5 gate。正常列表→详情→开始预约可进入原有工作台。Runtime 的 `disabled_read_only` 不变；确认预约仍禁用。 |
| 19017 勘查入口禁用 | 当前角色能看到该 active forms 节点，FormDef 已给出；但通用 forms 执行需要专用 R1 协议。普通 Mock reader 未接此样例，019 预览白名单及 020/021 专用 Mock controller 均不包含它。 | 保护正常，未补造处理人、改节点类型或强开按钮。详情保持禁用，直接工作台 URL 仍阻断；这是尚未接入的能力，不是测试数据缺字段。 |
| 选时页底部按钮出首屏 | H5 导航栏占 44px。预约填写/确认已使用 Shell 的 `h5-navigation-fit`，选时页漏传该属性，仍占完整 `100vh`。 | 选时页复用现有属性；未改 CSS 基础层，MP/App 的高度规则不变。 |
| 规格页返回文字换行 | 顶部窄槽和底部定宽按钮装不下两处完整“返回材料目录”，导致换行。 | 复用原 AppButton，显示“‹ 材料”与“返回目录”，两处可访问名称仍为“返回材料目录”，返回行为不变。 |

## R1 和权限证据

- [R1/Mock 清单](R1_REAL_DATA_MODEL_MOCK_EQUIVALENCE_INVENTORY.md) 第 4 节区分单记录、forms 的完整 EXTS/formList、repeat 的 FormData ID 集合；不能把只读入口变成普通单记录提交。
- [历史例外清单](../discovery/LEGACY_EXCEPTION_INVENTORY.md) LE-016、LE-017、LE-020、LE-033 说明角色/处理人、运行节点与 FormDef 身份及完成条件。它仅是协议证据，不代替本次运行时按钮检查。
- `src/runtimes/workflow/detail-projection.ts` 对真实 forms/repeat 来源继续投影 `disabled_read_only`；`src/shared/types/r1-node-contract.ts` 的专用协议保护未修改。
- `src/features/work-orders/action-workspace-load-target.ts` 的精确 019 + DEV H5 读取预览规则未扩大。外工单、外节点、无角色、错误 intent、非白名单 forms 等仍拒绝。
- `src/app/r1-node-forms-read.ts` 的普通 reader 不会因 Mock UI 放行而启用；Production/Beta 写入、上传、签署与 #201 HOLD 不变。
- 本机历史 AGENTS 所列 R1 源目录当前不存在，本轮对照仓库已固定的协议证据与实际执行器/回归，不宣称重新核验了 R1 在线环境。

## 验证与交付

- 类型检查、UI governance、5 个目标 Vitest 文件共 79 用例通过。
- 实际 H5 初轮 7 条目标用例通过：375/390/430 正常 26019 草稿入口与选时首屏、19017/09077/外角色拒绝、三宽规格页单行文字及双返回操作。
- 最后调整后，430 正常入口、拒绝路径及三宽规格页共 5 条再验通过。预约返回修改、刷新恢复本地内容通过；完成按钮保持禁用，未派发业务 HTTP 请求。
- 复用现有取样脚本的 4 条实际 App 工作流通过，生成 53 张统一 **430×932 逻辑视口**主审阅图（含不同详情、预约、勘查、报价、Mock Quote/Order 回读、正常商业只读签约页）。主审阅路径为 `.review/新版统一查看-20261115/430x932/`。
- 较窄视口作为响应式技术检查；同目录上层既有截图及用户文件保留，不作为新的主审阅图。截图及详细哈希/按钮清单留在本机，未提交或外传。
- 未运行无关全量回归或原生验收；未重写批准的 Golden。截图生成和定向测试通过不等于商业视觉签收。字体一致性专项另行串行整合。
- 剩余：19017 普通 Mock forms 读写/完成通道未实现；本批未扩为新协议实现，也未解除任何真实 API 安全保护。

精确提交 SHA、CI 链接及最终截图清单见本次交付；GitHub Actions 与本地工作并行，不将运行中记为通过。
