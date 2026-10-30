# Review-only tooling

本目录包含独立的开发验证环境，**不属于商用 App 的路由或发布入口**。原先散落在仓库根部的 `__review/`、`review-app/`、`review-app-g4f/` 已统一迁入这里。

| 子目录 | 用途 |
| --- | --- |
| `harness/` | Vite H5 Review / G4-E 调查、设计系统和历史交互验证素材 |
| `uni-gallery/` | Uni H5 / 微信小程序 Review-only UI；复用 `harness/` 和商用设计系统样式 |
| `quotation-demo/` | G4-F 报价、SKU 与订单独立示范环境 |
| `checks/` | 仅针对 Review 环境的隔离、协议和根目录整理守卫 |
| `dev/` | 本地 Mock/微信开发辅助启动脚本 |
| `prepare-mp-input.mjs` | 生成临时微信编译入口软链接（不会纳入 Git） |

仍通过根目录的 `package.json` 命令访问，避免切换开发者使用方式：

```sh
pnpm run build:h5-review
pnpm run build:uni-h5-review
pnpm run build:uni-h5-g4f-review
pnpm run build:mp-weixin-review
pnpm run check:g4e-review-harness
pnpm run check:review-root-hygiene
```

微信小程序编译器对输入目录的相对层级有限制，因此 `build:mp-weixin-review` 会在仓库根目录生成一个 **ignored** 的 `.review-input` 链接，指向 `tools/review/uni-gallery`。这是编译适配路径，不是被重新引入的正式根目录源码。`.review/` 同样只承载临时取证和报告。不可把上述路径加入商用 `src/pages.json`、Production 构建或权限上下文。

`scripts/` 中保留的业务协议审计、质量守卫、CI、生成器和类型声明属于其他消费者；只有在证明可删除且不损害历史证据后再分批治理。

## 本地 Chromium 下载失败时

若 Playwright 默认 CDN 误返回 HTML 或空归档，先从已安装的 Playwright 获取匹配的 Chromium revision。可使用 Google 官方 [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/) 存储桶获取对应版本的 `chrome-headless-shell-linux64.zip`，校验 ZIP 完整性后解压到 Playwright 对应 revision 的缓存目录。**必须使用与当前 Playwright 匹配的版本；不可把浏览器压缩包、二进制或本地缓存提交到仓库。** 本轮 exact 版本和浏览器验收情况见 [C6 治理记录](../../docs/engineering/C6_ROOT_REVIEW_TOOLING_HYGIENE_20261030.md)。
