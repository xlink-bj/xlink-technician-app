# M1 S2 — Survey 勘查商用 UI 设计计划 & 通用表单 UX 规范 v0.1

> **历史计划 / 已被设计冻结规范 v1 取代。** 用户已认可 S01 主表单与 S02–S05 局部交互设计，明确“现场照片和现场测量应直接在主表单填写，无需另开弹层”。**实施权威：[`DYNAMIC_FORM_COMMERCIAL_UI_UX_STANDARD_V1.md`](./DYNAMIC_FORM_COMMERCIAL_UI_UX_STANDARD_V1.md)**。下文原“6 张设计稿”和状态规划仅为早期设计探索，不应再驱动新增页面或强制照片弹层。

**状态：DESIGN PROPOSAL / 待 Owner 评审；未授权实施。** 2026-10-14

## 0. 主计划位置与本轮交付门禁

| M1 阶段 | 状态 |
|---|---|
| #1 工程基础 | SOURCE CODE LOCK；生产活动表单 / API 等价性仍待 #124 补证 |
| **#2 商业 UX/UI** | **本轮：Survey / 通用表单设计计划和交互规范；此前 #126 / #127 的微调式视觉修订不通过商业验收** |
| #3 微信 DevTools / App 平台 QA | 未开始 |
| #4 真实接口与写入 | 未开始，所有真实业务写禁止 |

**执行顺序：** R1 源码+实际视觉基线 → 6 张设计稿（真实任务流） → 设计评审 → 落地通用框架 + Survey 受控增强 → 同场景 H5 Sheet → 真机 → 实数据校准。

> 这份规范不是“照搬 R1 UI”或对 Taste Skill 的抽象引用。明确区分：已看到的 R1 **源代码交互证据**、已有新 App **源模型与 H5 Mock**，以及尚未取得的 **R1 运行截图/当前生产活动 FormDef**。没有后两者时，不宣称像素级 R1 对照验收。

## 1. 已证实的业务与表单边界

- **Survey / 勘查** 是 typed `Survey` 业务实体；**InspectionAppointment / 巡检** 是另一个实体。R1 `inspectionAppointment.vue` 是历史混合页面，因此只能抽取其成熟移动控件/交互证据，不能拷贝它的 Inspection/SOP/工作流规则到 Survey。
- Survey 的字段定义经 `Ext → ExtField → FormData` 交付。历史、非活动、脱敏 Beta `contracts/beta/survey/historical.json` 有 **61 条行级字段**，其中 `showList` 含移动详情代码 `4` 的 **45 条**；这不是活动生产表单，也不是 45 项必填或同屏可见。
- 45 条移动详情候选行里含大量照片/媒体 `file`、有条件的面积/尺寸 `digit`、维修部位 `cascade`、渗漏原因选择与 `data`、`radio`、`gap`、备注 `text`、推荐服务商品 `bizSelect`。重复 `valueKey` 是事实：`fieldId` 唯一标识行，`valueKey` 可以重复。所有可见性/必填/支持能力必须遵循 Runtime，不能直接按字段名称硬编码分组、合并或删除。
- 特殊：`surveyDrawing` 测绘图在新 App 仍为 `DEFERRED`；`serviceGoods` 推荐产品和生产真实媒体水印/上传链路未完全验收。**不可设计成真实可执行按钮**。
- 新 App 使用全页 `ActionWorkspaceShell`；保存本地草稿、业务 `保存表单` 和工作流 `完成勘查` 是 **三个不同动作**；后两者并不因新视觉设计获得真实 Production 写授权。

## 2. R1 已确认的成熟 UI/UX 模式（源码，而非臆测的截图）

证据版本：`xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`，`business_jishi/subpackages2/inspectionAppointment/inspectionAppointment.vue` 与 `business_jishi/app.css`。

| R1 交互基线（源码确认） | 新 App 设计决策 |
|---|---|
| `van-cell-group` + `van-field`：字段标签/值、必填标识、只读样式及右侧对齐；长表单字段一律有秩序 | **继承信息结构**，使用已有 `AppField`/`AppInput`/`AppTextarea`，不要把所有字段做成独立大卡 |
| `van-cell` 点开 `select`/多级 `cascade`，微信小程序与 App 使用各自选择器 | **保留点击选择、结果回填和路径层级**；选择可用底部抽屉/聚焦页，保留有类型的值路径 |
| `van-radio-group`/`van-checkbox-group`，大点击区域及明确状态 | 用小选项组的共享控件；**大量选项不能铺满长表单**，改用聚焦选择界面 |
| `van-uploader`：字段标签、已选/上限、缩略图、照片网格、添加/删除 | 采用相同的任务可见性 + 当前新 App 更严格的上传队列与失败状态；**未上传成功的图片不得伪装成已上传** |
| `title`/ `gap`：专用全宽标题和浅灰分隔行，不能与普通表单字段混淆 | 通用 `SectionRenderer`：遵循 field row 的呈现顺序，对 `gap` 采用语义分节，禁止生成无意义的“分隔槽”文案 |
| 渗漏原因：底部 `van-popup`，左分组右多选、返回表单 | Survey 专用的 `LeakageCauseExperience`，继承聚焦、分组、多选体验，不把提供者规则下沉到通用表单 |
| 编辑：高度约 90% 的底部 `van-popup` + 顶部“提交”，且历史保存/提交流程耦合 | **不照搬**。新 App 单独全页编辑、底部安全区固定动作、`保存表单`/`完成勘查` 分离、明确失败与恢复 |

**R1 视觉核验缺口：** 已审阅源代码及项目 `G4E_R1_MOBILE_UX_BASELINE.md`，**尚未有当前运行中的 R1 勘查界面多状态截图**。真实视觉对比作为设计评审的输入门禁；不可宣称已做到 R1 高保真或可直接复刻。若不能以既有获批环境只读获取截图，需要用户提供 R1 现有截图；不得为视觉任务扩大生产权限。

## 3. 推荐首批设计数量：6 张代表性高保真移动界面

这 6 张是**设计与审查帧，不等于 6 条路由/页面**。产品目标：**一个主表单工作台 + 3 类聚焦操作（部位、媒体、原因） + 输入阶段 + 完成确认**，由动态字段及 Runtime 组合，不将历史 45 条字段强拆成固定六步。

| 设计帧 | 设计内容及主要决策 | 应与 R1 比较的基线 | 性质 |
|---|---|---|---|
| **S01 勘查工作台** | 标题与工单上下文；轻量草稿状态、单一当前任务提示；可扫描分节与固定底部 `保存表单 / 完成勘查`。不重复嵌套多层“DEV”卡片 | R1 form shell、`van-cell-group` 密度 | **必须** |
| **S02 维修部位选择** | 级联父子层级、当前路径、返回/确定、空/不可用；选中后回填表单，触发字段显隐但不丢弃安全草稿 | R1 `cascade` / picker | **必须 / Survey controlled** |
| **S03 尺寸及条件字段** | 勾选维修部位后的面积、长度等字段；单位、数字键盘、字段依赖显隐、只读/错误态，长内容不重复头部 | R1 `van-field`、条件显示、必填 | **必须 / generic fields** |
| **S04 现场媒体采集** | 大面全景/渗漏部位等后台字段归属清晰；有业务标签、计数、缩略图、继续添加、处理中/失败/恢复；图片预览与来源提示 | R1 `van-uploader` | **必须 / shared media pattern** |
| **S05 渗漏原因选择** | 聚焦式底部弹层：左分组右多选、已选数、完成选择；错误/只读有清晰说明；同 `Survey` 当前部位绑定 | R1 `van-tree-select` / 两栏树 | **必须 / Survey experience** |
| **S06 检查与完成** | 只展示有效值与未完成项的归类提示、定位到待处理字段；明确区分本地草稿/业务保存/工作流完成；真实写被禁止时绝不出现成功假象 | R1 `saveFormConfirm` 及必填确认，但拆解保存与完成 | **必须 / Workspace** |

**状态稿作为上述 6 张的变体，不单独虚构新页面：** 初始/已填/依赖变化、加载/选项失败、必填错误、只读、弱网草稿、媒体排队/完成/可重试/不可确定、保存中/已保存/保存失败、完成不可用/确认。每种状态需在测试矩阵中有可重演 fixture。

## 4. 通用动态表单 UX 规范 v0.1（建议冻结后作为多业务 Action 的共享合同）

### 4.1 页面职责

```text
ActionWorkspaceShell                         # 通用外壳：页面导航、工单摘要、草稿状态和固定动作栏
  DynamicFormActionContent                   # 通用正文：字段有效状态、排序、表单分节和状态说明
    SectionRenderer [title / gap / order]    # 仅按可证明的行级元数据呈现分节
      FieldRenderer(fieldId, valueKey, type) # fieldId 唯一；valueKey 用于数据取值，允许重复
        AppField + AppInput/Textarea/...
        Selector/Choice/Cascade/Media Pattern
    DomainExperienceSlot                     # 仅经证实的业务特殊交互：维修部位、渗漏原因、预约时间
  Fixed Action Bar                           # Workspace 级：保存表单（弱）/完成勘查（主）
```

原则：
1. **文案与信息结构**：页面只突出当前业务任务和下一步。短说明在字段需要时展示，绝不把 Mock/数据合约/调试日志做成主界面内容；测试数据来源必须诚实显示，但收归显式 DEV 审查层。
2. **布局**：单列移动优先；长表单按真实的 `title/gap` 或已证实的后端分组分节，分节标题是正文组织，不是可点击输入项。支持锚点导航是 **候选项**，只有验证分节稳定后启用。不得强制把动态内容切成固定多步向导。
3. **字段语法**：统一 `label/required/optional/hint/value/error/readOnly`。输入只用证实的标准 type；所有 field 的状态和验证由 Runtime 决定。选项必须来自允许的 provider；缺失 provider 不得伪造。
4. **控件矩阵**：

   | 类型 | 通用控件 / 视觉行为 |
   |---|---|
   | `text, phone, IDNumber, number, digit` | 单行文字/数字输入；数字单位仅 schema 支持时显示 |
   | `textarea` 与已定义的 `memo` 类字段 | 多行正文，清晰标签、字数/长度仅依据证实约束 |
   | `select, datetime, date, time, area` | 完整一行可点击选择结果，焦点抽屉/页面，保持原有值类型 |
   | `radio, checkbox, switch, rate` | 易触达的选择组，禁用和选中清晰 |
   | `cascade` | 级联选择，存储完整值路径；Survey 部位有受控专属表现 |
   | `image, file` | 媒体行：标签/上限/预览/状态/添加与恢复，由同一 Media Runtime 驱动 |
   | `title, gap` | **仅呈现**的分节标题、分隔；不得生成表单值 |
   | `bizSelect` 或其他无已证实 provider/type | 显式受限/不可用或业务专门组件；不得让设计暗示可以保存 |
5. **表单状态**：隐藏字段不渲染、不参加有效值校验；只读展示而不可编辑；必填标志及错误贴近字段；表单因加载中/不可用/权限改变必须保留已录入的安全草稿边界。
6. **草稿与命令**：`已自动保存` ≠ `保存表单` ≠ `完成勘查`；Workspace 拥有动作栏与安全区，Action Content 不造第二套保存机制，FormData 上传与 workflow 处理不绑定在图片选择上。
7. **媒体真实性**：只在 Media Port 确认远端引用后标记为已上传；显示处理中、失败可重试及结果不确定状态，不盲目自动重试、不用本地临时图像冒充成功。
8. **跨端**：以 390×844 和 375×667 审查同一截图 ID；按钮、长选项和表单输入不可被底部 Action Bar、键盘或安全区遮挡。MP/App 不支持的控件进入显式限制，不让 H5 模拟成功掩盖平台差异。
9. **例外规则**：预约的 3 字段专门 UX 保持原样；任何只有 1 个业务消费者的“漂亮小组件”先留在 `DomainExperience`，经第二个核实的业务消费者再提升为共享 Pattern，不污染通用表单。
10. **不承诺生产等价**：当前 Source-modeled DEV FormDef 与真实当前角色活动 Survey 表单/API 仍有缺口；这不会阻塞设计，但阻塞实数据签收及业务命令开放。

### 4.2 设计/研发验收矩阵

| Gate | 必须交付 | 判定 |
|---|---|---|
| **D0 R1 基线** | R1 代码证据 + 原系统代表性运行截图（编辑、选择、媒体、提交）及新 App 已认可预约参考 | 缺真实视觉则标 `R1_VISUAL_PENDING`，不假装完成 |
| **D1 方案评审** | 6 张高保真设计帧；点击路径及正常/错误/只读变体；新旧关键帧对照；通用控件边界标记 | `DESIGN_APPROVED` 必须为人眼判断，不等于画出线框 |
| **D2 工程实现** | 真实主 App 组件改造，共享表单规则验证，Survey 控件例外不侵入通用 Runtime | CI/typecheck/单测与业务安全全通过 |
| **D3 H5 复拍** | 相同尺寸/状态截图 Sheet + DOM 交互 + 首屏可见主操作、长中文、滚动与安全区复查 | `SCREENSHOT_PASS` 和 `COMMERCIAL_VISUAL_REVIEW` 分开 |
| **D4 跨端** | 微信 DevTools/实机实际勘查 FormDef、相机/图片/权限/键盘/底部动作栏 | S3 独立 Gate；无权限不进行 Production 业务读写 |

## 5. 明确不做

- 不把 45 个历史移动字段固定画成 45 个硬编码控件或 5 页固定步骤。
- 不将 InspectionAppointment 巡检 SOP 混入 Survey 勘查。
- 不把 R1 `surveyTool`、定位水印、真实 `serviceGoods` 业务能力设计成已上线可点击功能。
- 不把内部 R1 技术审核、mock-stage-advance、接口身份标识直接放在给技术员看的商用屏上。
- 不重画已经认可的 Login / WorkOrder / Appointment；不因设计计划更改生产权限。

## 6. 待 Owner 决策

- **认可首轮 6 张代表性设计帧吗？** 若认可：先出 S01 主表单 + S02 维修部位选择 2 张做真正的视觉质量校准，再批量完成 S03–S06。
- R1 视觉：用**用户已有的 R1 勘查截图**或经单独明确授权的只读环境截图作为视觉证据；源码基线当前已完成，但运行视觉尚未验证。
- 是否接受“通用动态表单结构 + Survey 受控体验”的复用边界，保持预约现有优秀的专门体验？

## 来源清单（commit-pinned）

- R1 代码：`xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` `business_jishi/subpackages2/inspectionAppointment/inspectionAppointment.vue`；`business_jishi/app.css`。
- S2 新 App 项目：`docs/verification/G4E_R1_MOBILE_UX_BASELINE.md`；`G4E_SURVEY_DOMAIN_TRUTH.md`；`G4E_SURVEY_MEDIA_CONTRACT.md`；`docs/discovery/DYNAMIC_FORM_CAPABILITY_MATRIX.md`；`docs/design-system/ACTION_WORKSPACE_UX_STANDARD.md`；`docs/architecture/ACTION_WORKSPACE_ARCHITECTURE.md`；`contracts/beta/survey/historical.json`。
- 当前项目已验收基线：Appointment 新设计/新 App `ActionWorkspaceShell`、共享 Dynamic Form Runtime 的字段契约；并非当前生产 Survey UI 的像素级证据。
