# CUI-01: 商业页面几何与 CSS 级联治理 | 2026-10-28

## 验收依据

Q01 已获 Owner 认可；Q03 四个类别 Tab 的文字曾上浮、蓝色指示线却在底部。根因不是缺少 UI 规范文档，而是普通按钮的原生样式、重复 CSS 级联和缺少真实布局断言共同作用。

Apple/微信/Ant 的通用可落地原则：先确定点击热区，再建立水平与垂直布局约束，最后放置选中指示线；信息层级与业务数据来源不得为了视觉漂亮而伪造。

## 本轮确认的扫描结果（治理前）

| 文件 | 规模 | 重复选择器（同名再定义） |
|---|---:|---:|
| QuotationActionContent.styles.css | 118,851 B / 921 个 CSS 类选择器规则 | 217 |
| Q01CommercialBaseline.css | 14,898 B | 14 |
| Q03CommercialBaseline.css | 9,737 B | 0 |
| src/pages/index/index.vue (首页和登录) | 26,916 B | 3（其中包含上下文/媒体状态） |
| src/shared/ui/ActionWorkspaceShell.vue | 18,210 B | 4（其中包含调查/报价状态差异） |
| src/shared/ui/design-system.scss | 26,709 B | 5（不全是失效重复，含响应与状态规则） |

**“重复选择器”是风险线索，不等于这些规则均无效。** 不允许按数量批量删除有业务/状态依赖的规则，也不能把合法媒体查询、加载态等当作冗余。

## 本批处理

1. 业务目录工作台真实 Vue 模板未引用的 35 条 CSS 规则，涵盖早期 CSS-art 形状、缩略图附属文字、废弃的工具栏、旧金额占位样式，已删除。移除属于清洁旧码，未删除真实目录字段、选品动作或 SKU 边界。
2. Q01 视觉基准文件中重复出现的 14 个目标选择器合并。保留每组最终属性值及未覆盖属性，不增加新的覆盖层。后续以 Q01 真实运行截图/数量/价格回归判定视觉等价。
3. 新增 `scripts/ci/commercial-css-ownership.mjs` + 专门 Workflow：最终归属文件不允许重复选择器；已确认无 DOM 所有者的目录装饰 CSS 不得悄悄回归。
4. 新增 375×667 单尺寸真实 H5 操作员几何测试：**首页 → 工单列表 → 工单详情 → Q01 → Q03**；检查触控区域、可视范围、四 Tab 文字重心与 44px 热区，记录四段真实截图及测量 JSON。
5. 当前共用 `AppButton` 已有 `display:flex; align-items:center; justify-content:center`，不再为“统一规范”而强行重写它；登录、首页、详情均保持既有获准外观。发现实际失败后再对其**组件归属层**修正。

## 下阶段（不混入本批）

- `QuotationActionContent.styles.css` 仍有多代 G4/S2/Q01/Q03 级联（初始重复选择器 217 个）。本批只处理可证明无 DOM 所有者的规则，未来按**组件/状态拆分**为独立样式 Owner 并逐批做 screenshot pixel-diff，不一次性清空。
- 历史 DS02A Golden 仍需 Owner 逐场景审查；绝不直接 `--update-snapshots`。
- 真机/小程序开发者工具的 native 视觉验证不等同于容器 H5，只在确实需要 Mac/微信环境时交由 Codex 协助。

## Gate

验收必须同时有：`CODE_PASS`、`Q01_H5_BROWSER_PASS`、`Q03_H5_BROWSER_PASS`、`CUI01_GEOMETRY_PASS`、`CUI01_CASCADE_PASS`，并复核 Owner 已认可页面的真实截图。任何未通过的门禁不得宣称工程完成。保持单尺寸 375×667；Mock/Real 同业务界面；无生产/测试环境业务写入；无合并/部署。
