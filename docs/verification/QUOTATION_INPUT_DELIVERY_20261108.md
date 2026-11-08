# 正常报价输入最后值交付回归

基线：`b7c7907a24f79bc0e6a34313ca87a1c1ecf866b3`。本批只完善正常报价既有五处输入，不处理目录搜索、SKU 输入、遗留独立路径、后台或 UI/UX 优化。

## 已确认缺陷与来源

`Q01EntryScreen.vue` 的部位描述/工程量、`QuotationActionContent.vue` 的分组描述/工程量和已选项目数量，原来直接消费 uni 公开 `input`。H5 原生 input 已变化但 uni 尚未交付最后事件时，立即切换页面会保存旧业务值。composition store 的 flush/version 只能保存已经进入 store 的内容，不能读取控件待派发尾值。

正常 App 原版浏览器证据：既有普通材料 `mock-catalog-material-ordinary-1`，通过真实目录加入，不构造 SKU；行数量快速 `1→12`，实际输入间隔 26.2ms，立即正常返回再重入，DOM 与持久草稿均恢复为 1，预期 12（1 FAIL，exit 1）。其他四处分别恢复 first/1，预期 last synthetic description/12（4 FAIL，exit 1）。红例截图、trace、输入时间和本机草稿均保留；不是生产数据丢失的证明。

## 最小改动和保持的行为

无样式 `QuotationTextField.vue` 复用已验证的 `bindH5InputDelivery`，在 uni 原生归一化监听之后同步交付；成功绑定后忽略延迟公开事件。保留原 handler 的 `{detail:{value}}` 形状、digit、disabled、maxlength、类名、ARIA、testid；不新增 autoHeight、清空规则或数值转换。Q01 原无限长度明确传数值 `:maxlength="-1"`，避免新封装 Number prop 的 Vue 警告。MP/App 经原预处理后仍走原始事件。

`input-delivery-epoch.ts` 根据真实 Workspace descriptor、草稿初始化/恢复和订单编辑状态生成实例代次。不同记录即使复用 group/selection ID，旧 DOM 和延迟事件也不能交付到新记录。原实例的 owner callback 同步检查当前代次及可编辑状态，覆盖 Vue 下一渲染前的间隙。普通 dirty/saving/saved_local/save_failed 变化不换代，key 不含输入值或 draftVersion，不会每键重建或丢焦点。

工程量仍只是分组文本快照，不实时联动已有行数量。SPU 数量仍由原 `setQuantityText` 校验；0、空、负数、指数或非法文本保留错误与最后合法数量。SKU 选择行仍禁止直接修改合计。未修改 composition store、目录/SPU/SKU 协议、价格、金额舍入或编码算法。

## 证据与计算范围

初始正常 App 五处红例修复后 5/5 通过（exit 0）。当前四文件 122 项定向通过，包含 23 项新交付回归、既有 composition/empty-workbench/engine 测试。最终同一基线正常 App H5 7/7 通过（exit 0，无 skip），包含小数/0/空/负数及程序化 IME 事件序列的最终值刷新恢复。`VITE_XLINK_ENVIRONMENT=test pnpm verify:full`：257 文件、3306 项测试全部通过，typecheck、边界、配置和质量检查通过，exit 0。

完整报价沿用既有规则：无套餐分组必须同时有工序与材料。只有一项材料时不能宣称完整报价已可编码。实际金额验证通过正常目录再加入既有工序 seal（68.40），保持数量 1：材料 quantity=12、单价 38.60、材料小计 463.20，分组/订单总额 531.60；材料 12.5 时材料小计 482.50、合计 550.90。纯编码诊断使用实际 UI 持久草稿、真实 mapper/engine/encoder 和既有合成目录行，不修改 store、不调用提交 handler、不伪造 ACK；它不是服务端保存证明。

最终 `final-scenarios.json` 的五处快速双输入间隔依次为：Q01 描述 16.1ms、Q01 工程量 19.1ms、分组描述 29.6ms、分组工程量 32.4ms、SPU 行数量 14.2ms；全部小于原 100ms 窗口，无人为 sleep。此前另一轮 15.0 / 27.5 / 40.0 / 32.4 / 16.5ms 只属于 `seven-pass-first`，不作为本轮时序证明。

3500 条 GET 是最后明确退出码轮次（`final-h5-exit.json`、`final-h5-explicit-exit.log`）的七场景 trace 记录计数，包含 9 条本机 Vite WebSocket 握手，不是 3500 次业务 API 调用。该轮原始结果/trace 已保存在 `.review/quotation-input-delivery-b7c7907/pre-ci-final-explicit-exit/`，避免后续 CI 接线验证覆盖。`seven-pass-first` 也恰为 3500 条 GET，两个轮次独立保存，不混合计数。最终退出码轮次的非环回记录、外部/未知意图和页面异常为 0，真实业务 HTTP 写入为 0。新 CI 接线轮次的实际计数单独见接线交付摘要。

IME 是正常 App 控件上的程序化 composition/input 事件序列验证，不是操作系统输入法或原生设备验收。编码证据是正常页面持久草稿加真实 mapper/engine/encoder 的纯诊断，不是正式订单服务端保存。

## 自动 CI 接线

`stage1b-mock-h5` 新增独立步骤执行 `pnpm exec playwright test --config config/playwright/quotation-input-delivery.config.ts`。步骤明确设置 `VITE_XLINK_ENVIRONMENT=test`、`VITE_XLINK_R1_MP_UX_FIXTURES=false`；后者覆盖该 job 的通用 R1 fixture flag，保持正常报价样本与本地验收一致。隔离配置使用 127.0.0.1:5319、独立生成物/缓存、DEV synthetic Mock 和关闭真实写入的 server 环境。

命令失败直接传播，没有 continue-on-error 或忽略退出码。既有 `if: always()` 归档新增 `test-results/quotation-input-delivery/`，覆盖实际 `results.json` 与 `attachments/` 下 trace/截图。其他步骤、搜索/媒体/共享输入接线、归档路径、权限、触发条件和超时保持原样。接线本地验证与 workflow YAML/结构检查结果单列，不将其说成已推送的 GitHub CI。 本地按相同命令及上述 flags 验证七场景全部通过，退出码 0（46.7s）；测试收集确认7项，PyYAML解析及移除新增点后的旧结构完全等价检查通过。未安装 actionlint，也未将解析检查说成 GitHub 服务端验证。


本地证据目录：`.review/quotation-input-delivery-b7c7907/`；可重复正常 App 测试：`tests/h5-main-mock/quotation-input-delivery.spec.ts`，独立配置：`config/playwright/quotation-input-delivery.config.ts`（127.0.0.1:5319，独立生成物/缓存）。真实网络业务请求全部失败关闭；合成数据只保存在浏览器上下文。

## 测试准备问题与继承限制

测试准备问题均保留原始结果，未计作产品红例：初次等待 Q01 不渲染的分组保存徽标后中止（退出 130）；扩展脚本曾引用未定义的 row、诊断 port 的 pageSize=1 不符合既有20条分页合同；另一次误收起已展开编辑区导致 1 FAIL/6 PASS；首轮完整检查将 roleId 放错 ActionIdentity 参数而退出 2。只按既有控件可见性、分页和函数签名修正测试，未改业务规则、放宽断言或延长超时，随后完整验证通过。

原版 red-row trace 已有 empty SSR-container hydration 警告（三处记录）。测试保留完整警告，只将这一已证实基线警告单列，其他警告/页面异常不放行。

本批不验证生产/Beta、真实 Java/Mongo、正式报价/订单写入、真实上传或 Workflow。暂不声称完整输入法/浏览器/原生设备矩阵通过；共享交付机制之外的历史风险、后台并发/事务与服务端金额问题不在本批治理。未保存的无效数量文本不等于可跨刷新恢复的合法草稿值。


## 额外手动验收的 legacy 滚动定位修正

`1825b4a` 的 push 两项 CI 成功，但额外手动 `42472359058` 的结果保留为失败：repeat/stage1b 两 job 成功，h5-ux 的 Login 4项通过、正常 App Mock 91通过/27跳过，最后 legacy 为25通过/1失败。失败来自 `g4f-quotation-ux-b0.spec.ts` 的 golden path：套餐数量设2、折叠/展开分组、移除工序后再次进入目录时，helper 调用 `scrollIntoViewIfNeeded` 后便要求完整按钮在底栏上方。legacy 共用本批修改的报价组件，尚未证实本批输入改动导致布局回归；封装无额外 DOM 包装/样式，不能据此声称完全无关。

同 SHA 本地自然采样2通过/1失败，失败后三帧均越界1.421875px。真实 inner `rect=[top44,bottom621.875]`、`clientHeight=578`、`scrollHeight=1577`、`scrollTop=538`，按钮 `top575.296875/bottom623.296875`，底边命中底栏；仍有461px可滚空间。相同流程点的受控几何回放明确校验该状态后，仅标准居中滚动至 `scrollTop=804`，inner/footer尺寸不变，按钮变为 `top309.296875/bottom357.296875`，整钮位于安全区且中心及四条边缘命中自身，普通click成功进入目录。该诊断仍保留原居中前的false断言，退出1，不替换原CI红例，也不把回放当作CI原trace内容。

最小修正仅改变 `openGroupCatalog` 的测试滚动前置为标准 `scrollIntoView({block:'center',inline:'nearest',behavior:'auto'})`，保留原严格 `button.bottom <= footer.top`、enabled检查和普通click；没有容差、sleep、force click或超时放宽。底栏实际是flex sibling，不是CSS fixed；没有修改产品布局、底栏、报价控件、计价或业务协议。原manual失败及其截图/trace日志继续保留；后续修复验证和新SHA手动验收结果分别记录。

最终 `auto` 写法本地验证：同CI配置的完整legacy 26/26通过（退出0），失败golden path有界重复3/3通过（退出0），typecheck和边界检查均退出0。首次尝试的instant虽有浏览器通过证据，但旧DOM类型不支持，故改为当前auto后重新验证；没有用旧通过替代最终结果。新提交和新最终SHA的完整手动验收尚待独立复核与主干窗口，原manual失败不变。
