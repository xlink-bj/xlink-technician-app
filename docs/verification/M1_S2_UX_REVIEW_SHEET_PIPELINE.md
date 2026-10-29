# M1-S2 UX Review Sheet — 工程化截图审查

**状态：** 工程候选，须以本分支 GitHub Actions 实际生成结果为准。所有截图基于真实 uni-app 主 App 的 **H5 + DEV Mock**，不是 Production、微信真机或独立 UI 原型。

## 触发方式

在该分支本地运行：

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run capture:s2-ux-sheet
pnpm run check:s2-ux-sheet
```

也可以直接执行 GitHub Actions **S2 UX Review Sheet** 的 `workflow_dispatch`，或在修改主 App 页面 / UX 组件 / 截图测试的 Draft PR 中自动运行。无需 Production 凭据。

## 每次固定输出

```text
.review/m1-s2/generated/
  390x844/
    review-sheet.png           # 全景大图，可直接审核
    index.html                 # 本地离线打开，逐屏路径说明
    manifest.json              # 状态名/顺序/出处/commit
    frames/01-work-orders.png  # 原始独立截图
    ...
    frames/12-signing-actual-contract.png
  375x667/
    review-sheet.png
    index.html
    manifest.json
    frames/...                 # 同一套稳定 ID
```

**共 26 张逐屏截图 + 2 张总览 Sheet**。GitHub Actions 上传 `s2-main-app-review-sheets-<run_id>` 文件包，保留 30 天；失败时也上传已完成的截图和浏览器痕迹。

## 场景索引

| 场景 ID | 业务阶段 | 重点 | 审核分类 |
|---|---|---|---|
| 01-work-orders | W 工单 | 现有列表 | 已认可基线，原则上不改 |
| 02-appointment | A 预约 | 新设计 UX | 已认可基线，原则上不改 |
| 03-survey-overview | S 勘察 | 信息层级/动态表单 | 优先审查 |
| 04-survey-filled | S 勘察 | 部位、面积与字段反馈 | 优先审查 |
| 04-survey-media | S 勘察 | 实际媒体采集 UI 与处理状态 | 优先审查 |
| 05-quote-entry | Q 报价 | 首屏 CTA、上下文提示 | 优先审查 |
| 06-quote-catalog | Q 报价 | 普通材料目录，无 SKU | 优先审查 |
| 07-quote-group | Q 报价 | 分组选品、提交安全边界 | 优先审查 |
| 08-signing-empty | C 签约 | 独立正式 Order + 无合同状态 | 优先审查 |
| 09-signing-progress | C 签约 | 签署中与操作可用性 | 优先审查 |
| 10-signing-expired | C 签约 | 滚动至合同过期/禁用操作 | 优先审查 |
| 11-signing-actual-order | C 签约 | 真实主 App 签约只读组件，不是 Mock 场景控制页 | 优先审查 |
| 12-signing-actual-contract | C 签约 | 合同已匹配状态与签约安全边界 | 优先审查 |

**为什么不在本流程强造“真实登录界面”？** 此 DEV Mock 本身采用合成会话直接进入主 App；用户已认可登录界面，不能在合成已登录环境中伪造一个“真实生产登录态”截图。登录基线可在独立的已有未登录 H5 smoke 中补充，但不得合并成未经实际捕获的页面。

## 复审/回归纪律

1. 流程、帧名称、视口规格长期固定；任何页面改动以同一 ID 拍摄 before/after 对比。一次只接受可归因的真实问题，不设计一个“看起来很好”的模拟页面来替代主 App。
2. Sheet 中的 `已认可基线` / `待审核` 只是产品审查状态，**不是**功能验收、Production API parity 或签约/订单合法性。
3. 严格阻断所有非 `http://localhost:5174` 网络意图；浏览器异常、本地资源错误、失败帧、缺失 Frame、拼版失败均导致 CI 失败。
4. 本阶段 UI/UX 修订先在 **勘察 → 报价 → 签约** 的真实组件中实施；已经认可的 **登录、工单、预约** 不随意改动。动态字段遵循冻结的 FormDef，不自行编造正式字段；签署/短信/PDF/Order 业务写入继续禁止。
5. 每批修订由 Owner 在 [S2 #125](https://github.com/xlink-bj/xlink-technician-app/issues/125) 给出具体 Issue/PR、before/after Sheet 链接和测试证据。S3 实际微信开发工具 QA 另外验收。
