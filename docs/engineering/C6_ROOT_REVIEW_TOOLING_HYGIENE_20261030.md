# C6 — Root Review & Tooling Hygiene

> **Status: IMPLEMENTATION / PR verification pending** · 2026-10-30 · Base: `main@3d0bb4152bb7696db70458753fdbfc7adc52e1ff`
> **Scope:** 目录归属、构建输入路径、开发 Review 检查命令和引用。无商用页面/样式/接口/数据库修改。

## 处理结论

| 类别 | 原状态 | 此次处理 | 依据 |
| --- | --- | --- | --- |
| `__review/`（15 个源码/素材） | 根部 Review-only harness | 迁入 `tools/review/harness/` | 活跃的 H5 测试和 G4-E 构建继续引用，不能删除素材 |
| `review-app/`（8 个文件、2 条链接） | 根部 Uni Gallery | 迁入 `tools/review/uni-gallery/` | Uni H5 和微信 Review 构建仍消费 |
| `review-app-g4f/`（12 个文件） | 根部报价 Demo | 迁入 `tools/review/quotation-demo/` | G4-F 产品 Review 测试仍消费 |
| `.review/g4e-product-gate/README.md` | 根部跟踪的历史证据 | 迁入 `docs/verification/`，`.review/` 改为忽略生成物 | 证据保留、路径退出源码根部 |
| `scripts/`（原 58 个跟踪文件） | 业务、质量与 Review 命令混杂 | 7 个 Review 专属脚本迁入 `tools/review/{checks,dev}/`；保留 51 个被业务、测试、CI 或手工调试消费的脚本 | 不以“缺少字面引用”推断无用 |
| `.review-input` | 不存在 | 由 Review MP 构建按需创建 ignored 软链接 | Uni MP 编译器需要浅层输入路径；正式商用 MP 不使用 |

**实际移除的是根部的旧路径及迁移后冗余副本，而不是仍有消费者的测试资产。** 迁移与删除按文件身份可回溯至此 PR，未清理包含独有提交/未验收证据的 Git 分支，也未批量关闭 Issue。

## 完整性和回归门槛

1. 更新 `package.json`、Vite / TS / Playwright 配置、测试导入、Review 工具脚本和相关 GitHub Actions 路径引用。
2. `check:review-root-hygiene` 阻止四类旧 Review 路径再次作为 Git 跟踪文件进入根部，检查忽略生成物和旧命令引用；加入 `verify`。
3. 三套 Review Vite 服务使用各自的 optimizer `cacheDir`、三套 Playwright Review 使用不同 `outputDir`，防止并行本地验证交叉清理 trace 或触发 `504 Outdated Optimize Dep`。
4. H5 Review、Uni H5、G4-F Review、微信 Review 使用新路径构建；Release H5 / MP / App 使用原有 `src/` 入口、C1 发行边界和验收门禁。
5. 要求 `verify:full`（包含 TypeScript、边界、Mock/Production 安全和全量测试）、H5 / MP / App 的正式构建及 CI exact-HEAD 绿灯。UI Golden 不随目录搬迁更新。

## 暂时保留 / 后续另案评估

- `scripts/` 其余 51 个跟踪文件：大部分承担业务契约、Mock、Beta 只读、发布检查、类型声明、生成器或工作流任务；若要继续缩减，必须逐项证明没有活跃/人工消费者、且不是唯一取证入口。
- 历史审计 `docs/governance/G0B_TOOLING_INVENTORY_20261030.json` 仍固定于旧 `main@17ba721`，不伪造其历史统计。
- 根部的 Vite / Playwright 多套配置是 CLI、package scripts、CI 默认或显式入口，本轮只更新必要路径，不因外观零散而盲目删改。

## 验收记录

- 开发工作区：`engineering/c6-root-hygiene-20261030`（独立短期 PR 分支）。
- 本地 `verify:full`：含新增根目录检查，**170 files、1532 tests PASS**。
- 正式 H5、微信小程序、App 构建全部 PASS；C1 发行 QA 边界、MP Bootstrap 与 WXSS 守卫 PASS。
- 独立 Vite H5 Review、两套 Uni H5 Review、微信 Review 构建全部 PASS。
- Playwright Chromium v1243（Chrome for Testing 153.0.8010.12）已从 Google 官方 Chrome for Testing 存储桶下载、归档校验并在本地运行成功；默认 Playwright CDN 在当前环境返回 HTML（非 ZIP），不应将其误判为安装完成。
- 真实浏览器：Uni H5 Gallery **9/9 PASS**；迁移后的历史报价主 App Mock 页面 **3/3 PASS**；原生 Vite H5 Gallery 的 **4 项 PASS**。
- 两组 Review-only 的既有问题由**同版本浏览器、同个 exact `main@3d0bb41` 独立只读工作区复现**：① G4-F 390px 及底栏几何相关的两项断言失败；② G4-E `survey-overview` 的 Mock Action Workspace 未加载。两者在迁移分支也失败，属于 `BASELINE FAIL`，**不能记为新增回归或 GREEN**。完整的 G4-F 26 项首次执行为 23 PASS/3 FAIL，精准复跑后 Phase 1F 恢复 PASS；剩下的 2 项在原始 main 上同样 FAIL。
- 跨服务并发运行曾引发 Vite 共用缓存 `504 Outdated Optimize Dep` 和 Playwright 共享 trace 目录竞争；已通过专用 `cacheDir`、`outputDir` 隔离，后续只将独立复验作为对照证据。
- 远端 exact-HEAD CI、Owner 主干合并门禁需要在本 PR 创建后复核。
