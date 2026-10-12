# M1 I4 — Owner 四屏视觉验收包：当前真实 App vs V2 方案

**交付状态**：READY FOR OWNER VISUAL REVIEW 的**证据准备阶段**，非 Owner 签收。I4 不因 CI PASS 自动 ACCEPTED。仅使用离线合成工单/目录数据；不包含客户数据、真实价格、授权 SKU、合同或写入。

**唯一业务源码依据**：`xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`，`business/subpackages/order/placeOrders.vue`（可核实 SKU/套餐/维修组处理）；**R1 产品截图**：#41 Owner 先前在对话展示，但并未作为可检索文件附在本 PR，因此 **R1_SCREENSHOT_UNAVAILABLE**，不能声称像素级 R1 对比。

## 1. 阅读顺序：三类证据，不能混淆

| 来源 | 入口 | 真实性 / 用途 |
| --- | --- | --- |
| **A：当前真实主 App 的运行 H5** | 本 PR 的 `tests/h5-main-mock/m1-i4-real-app-owner-four-surface.spec.ts`；CI 的 `main-h5-mock-qa-<run-id>` Playwright PNG attachments，390×844 与 375×667 两组 | **真 Vue/uni-app 路由、真组件和本机合成业务数据**。作为 Phase B 的 Before（实际实现基线），不是设计稿，更不是 Production 业务数据。 |
| **B：既有高保真四屏 V2 提案** | `__review/concepts/m1-quotation-four-surface.html` + `tests/h5-main-mock/m1-quotation-ux-prototype.spec.ts`，同一 CI 的八张 `owner-ux-v2-01..04-375/390` PNG | 设计用独立 HTML，交互/选材数量均为**合成示意**，**不是** uni-app 当前正式报价工作台。 #41 历史提案早已存在，本次复用而非重新造图。 |
| **C：R1 源码可观察的操作规则** | 固定 SHA 的 `placeOrders.vue`，以及 #41 Owner 文字需求 | 可支持维修部位→目录→套餐层/数量→回写维修组的**操作心智**；不能支持未找到的真实 R1 截图、价格真实性或合同创建语义。 |

对比用户提供的 R1 视觉需要真正的原图；如取不到，截图比对记为 **NOT_RUN**，不以设计原型冒充真实 R1。

## 2. 四屏同案例：Owner 要评的差异

**固定 UX 合成案例**：工单 `MOCK-019` 结构的屋面局部渗漏；在当前 main App 演示用 `报价草稿` synthetic 入口创建屋面组 `I4同案例：屋面局部渗漏维修`，先加入示例材料，再选套餐，确认 2/2 层并返回。设计 V2 使用对应的屋面组 + 套餐/材料层合成描述，不代表两份 Catalog 的项目 ID、材料层和价格等价。

| 屏幕 | 当前 App 实测截图 | 对应 V2 设计截图 | KEEP / IMPROVE / DROP 评审判断（**设计建议，非 R1 事实**） |
| --- | --- | --- | --- |
| **01 报价工作台** | `I4-REAL-01-workbench-group-selected-390` | `owner-ux-v2-01-workbench-390` | **KEEP** 工单/维修组精确归属、材料与套餐摘要；**IMPROVE** 首屏以当前维修部位、已选服务和单一明确 CTA 为主，减少字段列表密度；**DROP** 将空表单字段作为首页唯一视觉中心 |
| **02 目录** | `I4-REAL-02-catalog-390` | `owner-ux-v2-02-visual-catalog-390` | **KEEP** Package/Procedure/Material/Measure 四类别及搜索；**IMPROVE** 一列式商品身份卡、配图仅在真实来源可提供时展示；**DROP** 假定价格和多轴深层导航 |
| **03 套餐配置** | `I4-REAL-03-package-configured-390` | `owner-ux-v2-03-configure-390` | **KEEP** Package→Procedure/Material 真实层级、当前组、数量和每层确切选择；**IMPROVE** 展示配置进度、显式不可选/未验证和下一步；**DROP** 自动选择“默认 SKU”、虚构全部材料必选或价格 |
| **04 返回工作台** | `I4-REAL-04-return-to-group-390` | `owner-ux-v2-04-return-390` | **KEEP** 回到原维修组、其他组不受影响、修改/删除；**IMPROVE** 明确“本机草稿更新”和一键返回更改；**DROP** 将本机草稿保存当成正式报价/订单提交成功 |

**补充状态**：`I4-REAL-00-initial-empty-375/390` 展示现有 App 的新建空状态；`I4-REAL-05-reloaded-order-blocked-375/390` 展示硬刷新后草稿恢复、提交被阻断，目录不支持的分类与错误示例可参照现有 G4-F H5 `catalog-empty/catalog-error` 测试。真正 Production 空数据/后端错误和 R1 视觉差异 **NOT_RUN**。

## 3. Owner 四项视觉选择

需统一批准或提出具体修改：
1. **Workbench**：是否采用顶部当前工单/部位卡，局部项目摘要 + 一个主 CTA？字段编辑应逐步显露，非全部隐藏。
2. **Catalog**：是否接受四类横向标签、单列商品卡、目录不完整时明确的禁用态？材料、机措真实图片/单价只能接入已有权威字段。
3. **Configuration**：是否接受独立详情阶段、按原 R1 真实层序列配置与 44px 数量控件？哪些层必选须由实际返回判断，V2 样例的“必选”并非业务规则。
4. **Return**：是否接受仅本机更新的成功状态、原部位明确定位和“修改配置/继续选择”？固定底栏、金额未知时不展示虚构合计。

**范围裁决**：#41 已明确 Product UX 尚不通过。未取得 Owner 的本次四项审阅结果前，**不得启动 I5 大范围生产 Vue UI 重构**；可做不改变产品外观的测试/结构准备。

## 4. R1 业务源码与订单身份风险（单列）

- R1 `placeOrders.vue` 的产品选择、套餐材料层、SKU 匹配属于**代码可核对事实**；视觉层级改善是本提案的**独立 UX 判断**。
- 该固定 R1 页面 `quote()` 存在显式 `type:0` 报价写入，而新 App 的候选编码是 `type:1`。此前 #41 文档采用了“报价 Action 直接生成 type=1”的 Owner 业务描述；**本包不调和或重写两者**。I3 #93 仍需明确操作阶段/真实路由后方可做正式 Order 等价证明。
- 本机套餐层选择可回到维修组并持久化，不说明当前租户具备授权 SKU。Codex 已核查仅 29 个 active ExtFields、0 个当前角色可用 active SPU/SKU；I2 #92 仍 3/4。
- 正式 Order ID 才可进入真实签约，但合同权限、PDF、QR、短信均需 I6 独立验证，不能从设计样例推断。

## 5. 可复现验收与停止点

执行 `pnpm test:main-h5-mock` 时同时收集真实主 App 6×2 screenshots 和 V2 原型 4×2 screenshots，两套结果**分开命名**，全部附在 CI 的 `main-h5-mock-qa-<run-id>` Artifact（包含截图、trace 和 redacted JSON）；查看时优先按 390px 的 01→04 顺序，窄屏 375px 补验。

对所有证据记录 exact PR HEAD / GitHub CI / 浏览器宽高，检查无 JS/Console 错误、无外网请求尝试、无业务提交；截图仅承诺 synthetic-fixture 渲染及交互路径，**不冒充现场真实 UI/价格/订单**。

**I4 门槛**：四屏同宽证据经 CI PASS 后可将 #94 的**技术视觉证据项**单独验收，但“R1 实图对照、Owner 视觉批准、冻结交互规范”不可自动勾选。I5 实现仍待 Owner。
