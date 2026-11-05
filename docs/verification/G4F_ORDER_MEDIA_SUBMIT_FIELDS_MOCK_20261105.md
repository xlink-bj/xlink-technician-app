# Order 媒体与 submitOrder 字段编辑（2026-11-05）

本原会话 / Codex Local，唯一 canonical main，基线 `29e27873ce8131e8516c7a2f15582b696612dc9f`。本包不扩大真实读取或写入权限。

## R1 证据和实现边界

只读参考 `/Users/yesun/Code/xlink-app/business_jishi/subpackages/order/placeOrders.vue`，固定来源见[字段映射契约](G4F_ORDER_EXTFIELD_MAPPING_CONTRACT.md)。未修改参考仓库。

- 3650–3685、3736 附近：placeOrder 与 submitOrder 独立选择字段，后者按 personType 过滤。R1 默认客户类型代码为 `'0'`；本 Mock 用精确 Code provider 提供“客户”选项，由用户明确选择，未给未知租户注入默认值。
- 3966–3990：Order file 写前去掉图片处理 query 参数。
- 4230–4240、4268–4284：file 数组投影为逗号分隔的 URL 字符串；完整配置字段按 `value || value === 0` 投影。
- 5124–5153：转单弹层把已保存字符串分割回 `{url}[]`。这里复用确定的 URL-list 语义，未复制历史 helper 的不完整分支。

### Order 专属媒体（限定 DEV Mock：COMPLETE）

- 普通报价和提交阶段的动态 `file` 字段复用共享持久队列、平台 picker、Blob/原生 durable store、失败重试与最终清理。
- 身份：当前 synthetic 技师、精确工单、quotation runtime node、动态 rowId/valueKey；不伪造 FormDef/FormData ID，不混入普通表单或 Repeat 任务。
- Order 独立 codec：`{url}[] ↔ HTTPS URL,URL`，不改变通用 FormData 的 `{url,name,extname}[]`。拒绝本地 URI、含凭据/逗号/空项、重复 URL、超界或结构不符的数据。
- 队列未完成、上传失败、结果不明、任意未确认 URL，以及其他编辑页尚未合并到当前版本的已上传任务，均阻止提交。只有队列 `uploaded` 或精确已保存记录回读能确认远端引用。
- 添加、手动重试、移除确认/取消、失败回读、本机恢复；正式订单逐字段回读成功且回执持久后才清理本机任务。清理后再次刷新仍从 Order URL 数据恢复。
- 当前提供附件清单与状态；未增加图片裁剪、专用媒体工具或远程预览/下载请求。

### submitOrder 独立编辑（限定支持 schema：COMPLETE）

- 报价保存并回读后，常规入口切换为“下单资料”，使用相同动态 Editor、Code/Cascade、条件、personType、必填规则与 revision 草稿。
- 当前有限 Mock 的提交专用字段在报价阶段未填写；后续编辑不覆盖已保存 type=0 报价快照，type=1 payload 合并独立提交字段。
- 首次正式请求前将最终 Order.exts 固定到 durable receipt；Workflow/Order 请求派发后禁止继续改动该快照。报价、转换和待核对回读共用跨标签页 scoped lock；附件选择/重试/删除使用同一把锁，避免与正式请求交错。
- 丢失 ACK 后重启保持待核对；只读核对使用冻结的字段，而非重新拼接可变草稿，不自动启动 Workflow 或重发 upsert。
- 恢复入口在报价草稿仍为 idle/loading 时禁止新建/继续，避免正式订单先读到而本机草稿后读到时错误进入新建模式。测试等待真实 aria 可用状态，不 force click。
- 未知 personType/provider、配置不明、外部按钮、特殊工具、跨身份、旧 revision 都不绕过。

## 验证

- `pnpm run verify:full`：205 文件 / 1803 测试 PASS，含类型、边界和治理检查；H5/MP/App 构建全部 PASS。
- 375/390/430 正常报价转单与 430 媒体/独立字段/ACK 恢复集中用例：4 PASS；430 forms/repeat/正常转单/新路径另跑 4 PASS（分组有重复，不相加宣称独立总数）。
- 首次默认全量曾在既有 390 合同只读场景点击后停在 idle 超时；独立 `--repeat-each=2` 在 375/390 共 4 PASS，未改合同逻辑。保留原失败日志 `.review/order-next-main-h5.log` 与独立复现结果 `.review/order-next-contract-repro.log`，最终稳定源码全量结果另列，不能把失败尝试算作 PASS。
- 新单测：Order URL codec、队列与 FormData 身份隔离、未知 URL/未上传阻断、冻结/角色变更、独立提交快照及 ACK 丢失后的精确回读。
- 430×932 实际 App：选品前校验→报价附件失败→刷新→同任务重试→字段并发冲突→保存报价→客户类型/动态必填→下单附件取消删除/确认删除→刷新验证删除→重新添加→再次刷新→正式订单 ACK 丢失→重启只读核对→队列清理→再次刷新从 Order 恢复。
- 恢复时序修复后的新旅程 `--repeat-each=2`：2 PASS / 0 FAIL（54.7 秒）。
- 最终默认真实 App 全量 H5：67 PASS / 26 SKIP / 0 FAIL（5.9 分钟）。26 为独立 fixture 未启用，不记 PASS；本轮修改的报价转单 fixture 在三尺寸另跑，完整 fixture 集成由精确 SHA CI 记录。
- 同批普通 430×932 报价成功转单、forms/repeat CRUD 回归已执行。
- 实际截图本机路径 `test-results/main-h5-mock/evidence/order-media-failed-restored-430x932.png`、`order-submit-fields-restored-430x932.png`、`order-outcome-unknown-430x932.png`、`order-fields-order-readback-430x932.png`，不上传真实数据，不宣称 Owner 商业视觉签收。

## 明确剩余

- 真实 tenant 的全部 submitOrder schema、personType 枚举及 provider：未全量验收。本包不是任意租户所有配置通过。
- 跨阶段共用同一 valueKey 的报价修改/重报价业务、任意外部按钮和专用媒体工具：未扩大支持；不得把不可识别动作当完成。
- 全国区域 provider/街道副作用继续阻断；未重复 SKU 调查。
- Production/Beta 报价、Order、上传、Workflow、签约、PDF/消息和部署继续禁止，#201 HOLD 不变。Mock PASS 不等于真实写入通过。

最终 SHA、精确 CI 及对应 job 的执行/跳过状态记录在 #207 交付评论。
