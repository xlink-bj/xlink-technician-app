# 雨虹 v2：构建入口与协作接口

## 授权输入与范围

以 Owner 提供的「雨虹服务-独立设计系统-研发包-v2.0.zip」为输入；仅提交研发必需的 tokens、生成器及其校验，不提交设计 ZIP、PDF、私密资料或本地截图。原包 SHA-256：`702053e94c620934d7a3e92a9db49aab464010493f8fdf3e9716a5c87de37665`。

`src/brands/yuhong/{tokens.json,theme.css,_theme.scss,contrast.tsv,build.mjs,test.mjs}` 保持交付包内容一致。每个变量带 P12–P19 或补充实现来源。主操作评审色 #C8202B，链接与焦点 #175DA6，各自可调；字段和按钮禁用背景分开。Figma MCP 配额已用尽；本轮不能宣称已核对 Figma。

## 稳定共享接口

- 构建标识：`VITE_XLINK_BRAND=xlink|yuhong`，缺省 `xlink`；其他值直接报错。没有运行时切换。
- 样式别名：`@brand-ui` → `src/brands/<brand>`，仅官方 App 构建选择；旧审阅入口默认修链。
- `src/App.vue` 只引入 `@brand-ui/index.scss`。修链入口导入原有设计系统，雨虹入口独立装配，不导入修链 CSS。
- 雨虹完整权威变量：`--yh-*`，见 `tokens.json` 和生成物。六个公开别名：`--yh-action-primary`、`--yh-link`、`--yh-focus-ring`、`--yh-border-control`、`--yh-border-subtle`、`--yh-page-inset-mobile`。
- 共享 Vue 控件使用现有 `--app-*`，雨虹的 `_semantic-bridge.scss` 明确绑定全部现有基础角色。此绑定只提供产品值，不改变业务逻辑。
- 原生 page、H5 根及 body 挂载弹层从当前构建入口继承变量；无需业务判断品牌。独立宿主可使用 `.yh-service` 根。不同产品不会在一个 App 构建中混装。
- 迁移的共享页面和组件可在自身 `<style lang="scss">` 中导入 `@brand-ui/<component>.scss`；原有样式移入修链文件，雨虹文件独立实现。不得先加载旧页面样式再叠加雨虹覆盖。

## 文件边界

本地负责：`config/vite/brand-profile.ts`、`config/vite/app.config.ts`、`config/paths.ts`、`src/App.vue`、两品牌的入口、雨虹权威 token 与基础绑定/控件、工单详情及其 TaskFocus/ArchiveCards、详情测试。

云端报价负责：报价专有组件与样式、两品牌 `quotation*.scss`、报价定向测试。暂不修改本地所有的入口/token/详情文件；如需公共变量，先使用现有 `--yh-*` 或中性 `--app-*`，记录缺口。不将雨虹品牌判断写进共享报价业务代码。

共享中性类名和原有事件保持不变。跨组件重用不等于共用产品样式值。增量迁移时移除该区域已被替代的声明，保留仍有效的布局和权限样式；修链编译 CSS 与实际截图必须回归。

## 命令

```sh
# 真实 App、本地合成数据，禁止真实写入
VITE_XLINK_BRAND=yuhong pnpm run dev:h5:mock
# 修链保持默认；也可显式选择
VITE_XLINK_BRAND=xlink pnpm run dev:h5:mock

pnpm run check:brand-theme
pnpm exec vitest run tests/engineering/brand-foundation.test.ts
VITE_XLINK_BRAND=yuhong pnpm exec playwright test --config config/playwright/brand-h5.config.ts
VITE_XLINK_BRAND=xlink pnpm exec playwright test --config config/playwright/brand-h5.config.ts
# 本机 Chromium 未安装时为上述 Playwright 命令增加 PW_CHANNEL=chrome

VITE_XLINK_BRAND=yuhong pnpm run build:h5
VITE_XLINK_BRAND=yuhong pnpm run build:mp-weixin
VITE_XLINK_BRAND=yuhong pnpm run build:app
```

## 当前验收层级

这是最小共享基础交付，供报价与详情并行接入。基础有 46 组颜色对比、4 项包测试、构建选择及双向样式隔离测试；不代表全 App 已完成雨虹视觉迁移，亦不代表 Owner 视觉签收或原生验收。页面专有 CSS、品牌文案、控件与弹层仍需逐项迁移和实际截图验证。

业务数据及权限未改变；Production/Beta 写入、上传、签约、PDF 与 Workflow 命令仍关闭。
