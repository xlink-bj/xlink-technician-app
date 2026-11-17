# 雨虹 v2：构建入口与协作接口

## 授权输入与范围

以 Owner 提供的「雨虹服务-独立设计系统-研发包-v2.0.zip」为输入；仅提交研发必需的 tokens、生成器及其校验，不提交设计 ZIP、PDF、私密资料或本地截图。原包 SHA-256：`702053e94c620934d7a3e92a9db49aab464010493f8fdf3e9716a5c87de37665`。

`src/brands/yuhong/{tokens.json,theme.css,_theme.scss,contrast.tsv,test.mjs}` 保持交付包内容一致。生成器仅增加平台根适配输出 `_root-tokens.scss`，保留 CSS 别名关系，供 Sass 内联而不发出外部 CSS 请求。每个变量带 P12–P19 或补充实现来源。主操作评审色 #C8202B，链接与焦点 #175DA6，各自可调；字段和按钮禁用背景分开。Figma MCP 配额已用尽；本轮不能宣称已核对 Figma。

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

## 更正后的视觉来源（2026-11-15）

Owner 已明确替换包内旧 PDF。旧 PDF 不再作为验收依据；替代件为「雨虹工匠端-视觉规范与工单示意(1).pdf」，SHA-256 `dec6701de4bf50fed323c681b1c2bef59a1855e70207793777481cfa02f6828d`。已实际渲染并查看全部 3 页；它引用原 PPT 第 12–19 页，并非 19 页 PPT 本身。PDF 留在本机授权下载目录，不提交仓库。

三页明确值与 tokens 一致：主操作/按下/禁用、蓝色链接与焦点、反馈色、20/18/16/14 排版、16 px 边距、4/8 px 控件/卡片圆角。第 2 页合同、质保为结构示意，不能推导新增 API、合同资格、质保适用性或文件权限。实际详情仅显示状态待确认；成功零条才可显示暂无。

已选概念稿提供视觉方向，不是像素精确规范；具体颜色、字体、尺寸与语义角色以项目已确认的 tokens 和设计系统为准。分隔线角色不能替代控件边框角色；禁用与只读须分别表达，不能因外观相近而混同。现有页面的打磨与取证见 [UI 交付流程的范围限定小节](UI_DELIVERY_WORKFLOW.md#existing-page-polish)。

## 详情迁移的样式归属

`detail.vue`、`WorkOrderTaskFocus.vue`、`WorkOrderArchiveCards.vue` 的页面/组件样式各自仅导入 `@brand-ui/detail.scss`、`task-focus.scss`、`detail-archives.scss`。两种产品不叠加页面皮肤；共用原有模板、读取模型、事件与权限判断。修链原规则移至自身目录，只清除确定被后续同选择器覆盖的 `.summary-card` padding 和 `.summary-action` min-height。没有按重复数量删除其他有效规则。

雨虹独立实现客户摘要、任务左侧细条、唯一 CTA、双条跟进时间轴及独立档案；表单/媒体/报价等非详情区域仍按各批次迁移，当前不宣称全 App 已完成。现有共享 Skeleton/Feedback 尚有自身旧款样式，后续组件迁移需统一；本次未覆盖它们来伪装完成。

## 本批验证与后续门禁

- `pnpm verify:full`：360 文件、6691 项通过，含类型、架构、UI 所有权、质量检查；迁移后的所有权检查继续计入两品牌外置样式，未隐藏债务或提高冻结上限。
- 权威包：46 组对比度、4 项 Node 校验通过；现有修链基础编译 CSS 与旧入口逐字相同。雨虹实际 App 中变更主操作基础值不影响链接色，测试后恢复原值。
- 实际 App H5：两品牌各 2 项定向测试；覆盖角色工单入口、未读取、成功 0/1/多条、缺页、读取失败/拒绝、加载、全部跟进、客户资料、正式订单及返回。另有原档案卡与 375/390/430 时间轴 4 项回归。主审阅均 430×932、合成数据、禁止外部请求。
- 本机截图在 `.review/品牌详情-v2/<brand>/430x932/`，报告在 `test-results/brand-h5/` 和 `test-results/雨虹设计系统-v2/`，不提交截图。
- 编译检查与原生运行必须分开：本批 H5/MP/App 构建检查不代表微信 DevTools 或设备的键盘/安全区验收。原生运行尚未执行；全 App 迁移及原生验收由后续批次继续，Owner 商业视觉仍待审。
- 云端报价局部文件未修改；报价协作可直接消费 `c224627cf49561e9837f7274f1ed688ace349485` 的共享接口，后续详情提交只延续该接口。


## 列表增量（2026-11-15）

列表和搜索/骨架/空态/反馈现已按同一 `@brand-ui` 边界迁移，详见 [列表增量记录](../verification/YUHONG_LIST_V2_20261115.md)。修链原完整基础规则逐字保留，入口仅增加独立的装饰图标角色；雨虹提供自身颜色绑定。列表加载条条件链修复与原生工作台 SFC 命名导入缺陷分开提交。此前“原生未执行”是基础切片当时的状态；后续真实列表及预约复核以增量记录和本机原生证据为准，仍不能宣称完整原生验收。
