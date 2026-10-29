# XLink 云端执行分工与商业视觉证据协议（2026-10-26）

**状态：基于真实运行记录的工程实践；不构成商业 UI Owner 验收或发布许可。**

> **B2-X2 更新：**商业页面不再有 `体验数据` 等研发出处信息；Mock 与 Real UI 同构，独立 QA 为 `/pages/dev/qa-console`。见 [B2-X2 商业 UI 规范](../ux/B2X2_COMMERCIAL_UI_PARITY_20261026.md)。下方旧 B2-X run/截图均为历史证据，不能代表 B2-X2 最新 HEAD。

适用范围：新 Technician App（uni-app H5 / MP-WEIXIN / APP）、DEV Mock 的商业展示与研发验收分层。上位约束仍为 `AGENTS.md`、[AI Engineering Loop](../architecture/AI_ENGINEERING_LOOP.md)、[DS02A Visual Contract](../design-system/DS02A_H5_VISUAL_CONTRACT.md) 和相应 Program Control / Issue；本文不扩大生产、Beta 写入权限。

## 1. 按运行时能力分工，而不是按工具偏好分工

| 执行位置 | 优先承担 | 可以出具的证据 | 不应替代 |
| --- | --- | --- | --- |
| ChatGPT 临时 Linux 工作区 | 阅读合同与源码、局部实现、文档、Git diff、静态检查、typecheck、单测、构建及可用的真实 H5 浏览器验收 | 精确 diff、测试日志、可复现命令、实际 Playwright 运行和本地 PNG；浏览器无法启动时回退 Actions | Mac 原生 MP 结果；Owner 视觉验收 |
| GitHub Actions 固定版本 runner | 完整 CI、依赖与 Chromium 安装、真实 uni-app H5 Playwright、两种屏宽截图、expected/actual/diff、可下载 Artifact | 带 commit SHA、run/job ID、测试结论、PNG/trace 的独立证据 | 微信开发者工具原生 MP 验收；Owner 美学与信息层次判断 |
| Mac + 微信开发者工具 | MP-WEIXIN 实际编译与模拟器交互、平台差异、页面状态变化、控制台警告 | 精确 HEAD、工具/模式、分辨率、逐场景结果、脱敏截图 | H5 Chromium 视觉回归；未经授权的真实业务写入 |
| Beta/测试环境（具有独立授权后） | 实际可写业务接口集成与回读、权限和并发/失败恢复 | 可核对的请求/响应、读写结果与业务审计 | 当前只读 Production；纯 Mock 的协议等价证明 |

**决策规则：**同一任务先在当前容器做低成本诊断并尝试真实 H5 浏览器验收；本地浏览器不稳定时使用 Actions lane；只在需要平台原生能力时使用 Mac；绝不因 H5 PASS 推断 MP PASS。

### Linux 容器 Chromium：已验证可用的 Headless Shell 备用通路

2026-10-26 最初在本次 Linux 工作区检查：Node.js 和仓库 Playwright CLI 可用，但系统 PATH 和 Playwright 缓存中没有可用浏览器，Playwright 默认 CDN 下载得到 0 字节/非 ZIP 内容。后续已用官方 Chrome for Testing 下载源补齐 **Chrome Headless Shell 153.0.8010.12**，并按仓库 Playwright 1.63 的浏览器查找路径接入。普通 Chrome 完整版曾 SIGSEGV，不作为本环境的通过证据；Headless Shell 则已真实启动。

当权限、系统依赖和下载网络允许时，可按 [Playwright CI 官方指南](https://playwright.dev/docs/ci) 安装：

```bash
pnpm exec playwright install --with-deps chromium
```

若默认下载源不可用，可在确认官方版本与仓库 Playwright 匹配后，使用 [Chrome for Testing 官方可用版本清单](https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json) 找到 `chrome-headless-shell` Linux ZIP；解压到临时目录，设置 `PLAYWRIGHT_BROWSERS_PATH` 指向相应 Playwright 浏览器缓存，并安装/解包 Noto CJK 字体供浏览器渲染。安装后**必须实际启动 Chromium、运行真实 App Playwright 测试并核对 PNG**；版本和平台路径不能随意拼凑。此次临时安装只证明当前工作区，容器重建后可能需要重新准备。

**B2-X2 本次容器验证（同日）：** `CI=true ./node_modules/.bin/uni build -p h5` 已通过；`CI=true` 跳过沙箱内 CLI 更新检查导致的 `uv_interface_addresses`，并避免无关网络遥测。已使用 Headless Shell + Noto CJK 实际通过商业 QA 隔离 3/3、Mock 业务闭环 2/2、S2 Focus 2/2，以及完整 S2 375/390 页面走查；**这些是当前临时工作树的本地预检，不等于远端 CI 对新 HEAD 的通过，也不等于 MP-WEIXIN 原生通过**。DS02A Golden 当前仍旧版，保留差异供 Owner 视觉判断。

## 2. 已验证的三段式反馈回路

1. **L1：容器快速迭代 + H5 浏览器预检。**先看当前 Issue、确切 commit、脏工作树、`AGENTS.md` 和商业 UX/QA 技能约束；修改源代码/测试；执行静态检查、单测、构建，以及实际可启动的 Headless Shell Playwright 截图；局部 PASS 不覆盖没执行的平台门禁。
2. **L2：Draft PR 自动真实 H5。**在受控 `dev + Mock` 中执行 Playwright；锁定 PR 的精确 HEAD，保留两个屏宽（如 375×667、390×844），默认商业展示与**独立 QA 控制台**分别取证；仅允许本机服务，外部请求失败关闭。失败即上传截图、trace 和错误上下文用于定位。旧 `devReview=1` URL 会跳转到 QA 路由。
3. **L3：Mac 原生复核 + Owner 决策。**微信开发者工具以同一 HEAD 复核工作流、持久化及 Console/WXSS；由 Owner 判断真实场景下的字级、信息密度、操作优先级和视觉一致性。视觉审美并不随 CODE/H5/MP 自动变成通过。

旧 `devReview=1/0` 已收敛为隔离的 DEV QA 路由，不再控制商业页面上的研发提示。Mock 与 Real 在相同业务状态下使用一致的业务文案与视觉组件；Mock 出处、模拟场景、调试操作均仅在 QA Console 展示。业务事实（如报价尚为草稿、尚未正式提交）仍应准确表达；不得将合成数据伪装成已付款或已签约记录。业务适配器、网络与授权边界独立于 UI QA 隔离规则。

## 3. 2026-10-26 PR #221 的实测证据（不可跨 HEAD 挪用）

以下记录全部锚定 [Draft PR #221](https://github.com/xlink-bj/xlink-technician-app/pull/221) 的 GitHub commit `b5d9844a6790ee071f84b98c03b8de198098eb5f`，不是后继改动的验收结果。

| Gate | 结果 | 证据与解释 |
| --- | --- | --- |
| B2X Commercial QA Isolation | **PASS，3/3** | [run 40312964928](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40312964928)，真实 Chromium；[artifact 12645129266](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40312964928/artifacts/12645129266) 已核对包含 `commercial-home-375/390.png`、`commercial-c01-375/390.png`、`dev-qa-home.png`，不是仅有 results JSON |
| Validate | **SUCCESS** | [run 40312965087](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40312965087) |
| M1 S2 Focus Screenshot | **SUCCESS** | [run 40312964965](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40312964965) |
| Validate Main H5 UX | **FAIL** | [run 40312965023](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40312965023)：375/390 的 Mock 闭环测试仍断言旧文案“请先填写”，现有屏幕文案为“填写信息并保存后，即可继续下一步”。测试断言待修并重跑；**闭环后续步骤未被此次运行证明** |
| DS02A H5 Visual Contract | **FAIL，详情页 320/375/390** | [run 40312965029](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40312965029)：实际/预期/diff PNG 已查看。旧候选 Golden 带 `#MOCK-018`；当前商业界面显示 `#018`，并增加低强调 `体验数据 · 未提交后台`，导致卡片下移。属于与本 Slice 直接相关的预期视觉差异，**但并未据此获得 Owner 视觉认可** |
| DS01 Commercial Foundation Review | **CANCELLED** | [run 40312964914](https://github.com/xlink-bj/xlink-technician-app/actions/runs/40312964914)；不得记为通过或据此推断原因 |
| Mac 微信开发者工具 B2-X | **NOT RUN** | 旧 [PR #219](https://github.com/xlink-bj/xlink-technician-app/pull/219) 在 `39e6d7e` 有限于 375×667 DEV Mock 的 `MP_DEVICE_PASS`，**不能迁移给 B2-X** |
| Owner 商业化视觉 | **PENDING** | 尚未授权将 DS02A 现有 PNG 候选基线替换或将其标记为 GOLDEN |

### 截图怎样才算“可用于看商业 UI”

- 下载后至少有**独立 PNG 图片文件**，而非只有 Playwright `results.json`。Artifact 的 `artifact_id`、截图文件名、run ID、SHA 同时记入 PR 或验收记录；不必把图片提交进业务源码。
- 匹配 **同一真实 App 构建、同一 Mock 业务场景、同一 viewport/字体条件**；商业默认与 `devReview=1` 不得混为一张截图评审。
- 结构测试验证按钮/状态/安全边界，截图验证视觉结果，人工判断是否满足商业标准；三者互补。
- 如果 `toHaveScreenshot` 报红，先看 expected/actual/diff，分类为：非预期退化、**业务/文案变更引起的有意差异**、环境噪声；第二类也不能自动更新 Golden。
- 脱敏并禁外网：只用合成 Mock、禁止正式凭据、支付/签约真实操作及 Production/Beta 业务写入。当前 B2-X Artifact 保留 **14 天**（以 `.github/workflows/b2x-presentation-isolation.yml` 为准）；重要决定应另存文字和可复现步骤。

## 4. 提交前及发布前的硬门禁

报告应分别列出而非折叠成“全部通过”：

1. `CODE_PASS`：类型/单测/build/安全约束；不能替代浏览器。
2. `H5_BROWSER_PASS`：当前 HEAD 的 Playwright 功能行为、跨屏幕尺寸、截图/外网防护；整套测试有红项时标记 `PARTIAL/FAIL`。
3. `MP_DEVICE_PASS`：当前 HEAD 的 Mac 微信开发者工具实际结果及其限制。
4. `COMMERCIAL_UI_ACCEPTED`：Owner 对文字、组件、页面层级、全流程观感和 Golden 的独立结论。
5. `BETA_WRITE_INTEGRATION_PASS`：仅在存在明确可写测试环境且获授权后使用，目前不可宣称。

**未解决任一要求的门禁不得合并、部署或写入生产。** 推送文档/测试小改后，所有之前的 PASS 都仍是**旧 SHA** 证据；新 HEAD 需要相关 workflow 重跑。

## 5. 后续执行清单

- 消除 Main H5 对旧商业文案的脆弱断言，以业务状态为断言对象，并在新 HEAD 上完整复跑两种屏宽的 Mock 闭环；不能只靠源码检查宣布 PASS。
- 将本次详情页三种宽度的 expected/actual/diff 与对应场景作为 Owner 视觉决策材料；**不执行 `--update-snapshots`**，等 Owner 批准后另开有证据的 Golden 更新提交。
- Mac 微信开发者工具在 B2-X 最终精确 HEAD 上单独复核默认商业 UI、显式 DEV 进入/退出、本机状态保留和禁写；此前 PR #219 的历史验收仅作为参考。
- 界面批量治理继续基于 Design System + 场景/组件矩阵推进，不接受逐页孤立地覆盖 CSS 作为长期修复方式。
