# G4-F UI Spec v1.0 — 首个维修部位信息 → 选择产品

状态：OWNER_VISUAL_PASS (2026-10-09)。本页视觉已得到 Owner 确认，仅授权此单页工程实现；运行态尚未验收。
批准原图：xlink_g4f_repair_part_step_hifi.png (780×1688，相当于 390×844 CSS px @2x)。
可编辑版：xlink_g4f_repair_part_step_hifi.html。
完整包：xlink-g4f-repair-part-step-design-handoff-v1.zip（通过 ChatGPT 交付给 Owner；**尚未进入 GitHub 工作区**，请将 ZIP 放入本地 .review 供 Codex 查看。没有原图不得声称像素级对照成功）。
本文件保留工程交接重点，ZIP 中还含更详细的 G4F_REPAIR_PART_STEP_UI_SPEC_V1.md。示意工单号、部位路径、描述“好的”、工程量 30 均非生产默认值。

## A. 业务流和定位

- 入口：工单详情 → Workflow Current Action「报价」 → Quotation Action Workspace。没有订单时点击直接进入工作台，不先显示订单概览。
- 第一页“0维修部位”已独立验收。本页为**已创建第一个维修部位组、尚无任何已选商品**的编辑状态。
- Owner 确认四步：**①选择防水维修部位 → ②填写维修部位描述 → ③填写工程总量 → ④点击「选择产品」进入已有商品目录**。
- 此时只能有一个本地维修部位组、0选品项，不存在已生成的正式订单。待业务授权提交成功才创建 Order.type=1；签约由 Workflow Runtime 控制。
- 保持 0 组状态、多个部位组、已有选品、编辑既有订单、草稿恢复异常、Loading/Error 等其他运行态不变；不准因本设计改变服务端 Order 语义。

## B. 共用 App Shell：硬性约束

统一复用 src/shared/ui/ActionWorkspaceShell.vue。预约、勘察、报价的**当前工单摘要**和公共 Draft Status、scroll 容器、底部固定 Action Bar + safe area 必须来自同一 Shell。**不得**新增报价专有工单摘要/导航栏/第二个 Footer，也不得照抄设计图的模拟 iOS 状态栏。公共头尺寸以生产代码中的已有 Shell 为准，设计比对只考核下面报价业务内容。

## C. 页面区块与具体视觉规范，基准 390×844 CSS px

| UI 区域 | 尺寸、字体、色彩、层次 | 内容与规则 |
|---|---|---|
| 页背景 | 冷白/极淡蓝；基准图用 #FAFDFF → #F2F7FF → #F4F7FD 渐变 | 仅内容区 scoped 样式，禁改全局主题 |
| 本机草稿状态条 | 浅蓝 #EAF3FF，边框 #DEEBFF，文字 #55719E，字号约 11–12px，圆角 10px，外间距 8px | “当前为本机报价草稿；校验并提交后才会创建正式订单。” 避免和公共草稿提示重复 |
| 区块标题行 | 左“维修部位报价”，约 19px / 字重 800；右蓝色 pill“已添加1个部位” 11px，软蓝背景；上下间距 ~10px | 1 来自实际组数量 |
| 维修部位信息白卡 | 白 #FFF，描边 1px #EDF1F7，圆角 17px，阴影 0 8px 28px rgba(33,69,131,.067)，水平 padding 13–15px | 页面唯一主卡，不是四个重复“添加”区 |
| 白卡标题 | 01 编号 32×32px 浅蓝；“维修部位信息” 14px/750，副文案“设置当前部位，下一步选择产品”11px；右侧“移除部位”次要蓝色文字 | 删除需沿用已有确认和保存规则 |
| ①防水维修部位 | 必填标签 12px / 750；Selector 高 ≥44px (视觉约44–51)，背景 #F9FBFE，边框 #DAE6F6，圆角 11px | 必须用真实 AppCascadeSelector / repairPartOptions。屋面/有保护平屋面为示例，不得写死 |
| ②维修部位描述 | 必填标签 12px / 750；textarea 可见高约54px，背景 #F9FBFE，边框 #DFE7F2，圆角 11px；正文约14px | 写入 group.partDescription；“好的”是示例，不默认 |
| ③工程总量 | 必填标签 12px / 750；Digit input ≥44px；文本约18px/800；下方提示 11px #8498B4 | 写入 group.maintainAreaNum；示例30不是默认；真实单位未核验不得擅自标平方米等 |
| ④选择产品区 | 主卡内浅蓝渐变 #F4F9FF→#E9F3FF，边框 #E0ECFF，圆角14px；pad 10–14px | 标题“选择产品”、p​​ill“尚未选择”、说明“下一步选择套餐、工序、材料或机措” |
| 主 CTA | 蓝色梯度 #2588FF→#0863ED，白字约15px/800，44px以上触控高度(视觉45px)，圆角12px，轻阴影 | “＋选择产品”，打开本组原有目录，不保存订单也不提交 |
| 公共底部 Bar | 沿用 Shell，不另实现；左“本机报价草稿 / 0个项目 · 1个部位 · 金额待核验”，右“提交订单”禁用 | 不能展示假 ¥0/示例总价；Production 继续禁止提交 |

整体深蓝正文 #122849/#102447，主蓝 #1673EC/#2377F6，辅助文字 #7890B0/#8396B1；页面左右内容边距约15px、字段竖距约10px、选品区上距约11px。中文字体优先保持项目当前平台字体及设计 token，视觉基准为 PingFang SC/Noto Sans CJK SC。

注意：**批准的本页图没有三步“报价流程”卡**。可编辑 HTML 中 .process 为 display:none（为了页面高度）。三步图属于上一页，第二页不需要硬塞。当前页也不准出现套餐价格、已选商品图片或订单详情。

## D. 现有代码对应

- src/features/work-orders/quotation/QuotationActionContent.vue：已经具备 groups、group context、AppCascadeSelector、textarea、digit input 和 openCatalog(groupId, 'package')。重组首组/0商品的视觉，**不要重写独立业务逻辑**。
- src/features/work-orders/quotation/composition-store.ts：已有 createGroup / updateGroupContext，保留 groupId、repairParts、partDescription、maintainAreaNum 及本机草稿隔离。
- src/features/work-orders/quotation/QuotationActionWorkspace.vue：继续向公共 Shell 传递真实客户/编号/生命周期；金额未知继续待核验，Submit 继续权限封闭。
- 现有 onRepairPartChange、onGroupDescriptionInput、onGroupQuantityInput、openCatalog、return-to-group 的数据和事件语义必须保留。

## E. 交互约束

- 创建首组后展开该组可编辑内容；默认空字段，不自动写入设计图示例值。选择部位路径、填写描述及总量后，点击唯一“选择产品”入口。
- 从该入口调用现有 openCatalog(group.groupId, 'package')；进入商品目录后可切换“套餐、工序、材料、机措”，返回应保留路径、描述、工程总量、groupId 和滚动定位。
- 三项字段在视觉图中标注必填，UI层应提供缺失/非法值就地反馈；**必须核对 R1 与现有前端契约再实施真正的入口禁用规则**。如需求与当前验真规则冲突，先在 #41 报告，不得私自更改服务端业务约束。
- 当前 UI 曾发生 input 失焦导致按钮上移/点击落空的真实缺陷，需加入回归；输入法及 320px 宽度下不能遮盖 CTA 或底部。
- 当前组本机草稿失败、角色/会话权限、repairPartOptions unavailable、生产只读及提交权限均保持真实状态；没有授权不执行任何 Production/Beta 业务写入。
- 第二页不承载新增订单列表、已选内容清单、方案配置/金额计算；下一页才是现有商品目录。

## F. Codex 实施与验收

**只允许单页 Phase C1 视觉实现**，继续现有 Draft PR #42；保持其他已验收 UI、公共 Shell、目录/套餐页面和后端代码不变；不要合并。

必须交付：
1. 基于真实 uni-app Action Workspace 的 390×844 H5 全页截图，和批准 PNG **内容区**并排；明确所有颜色、层次、留白、字体、字段及 CTA 的差异，不可只报 CODE_PASS。
2. 320×844 H5 截图，无横向溢出、输入法/安全区遮挡；实际 0 项/1 组/待核验/正式提交禁用。
3. H5 Playwright 回归“第一页添加首组→填写三个字段→选择产品→进入四类目录→返回原部位→数据和焦点/滚动不丢”；测试空值/错误/草稿恢复/角色隔离和禁用提交。
4. pnpm run verify、H5/MP/App build、git diff --check、GitHub Actions exact HEAD 通过；MP DevTools 或 Native 若不可运行写 BLOCKED_ENV，绝不可假称真机 UX PASS。

交付状态只能写 READY_FOR_OWNER_REPAIR_PART_STEP_VISUAL_REVIEW；Owner 明确验收后才标记 OWNER_VISUAL_PASS。PR #42 仍 Draft/Open。