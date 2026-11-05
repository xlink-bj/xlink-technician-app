# 常规报价入口与共享表单功能收口（2026-11-05）

负责人：本原会话 / Codex Local；唯一 checkout、main。基线 `69831472baa0d2106211e1ce28f01c1c097f55d9`。

## 实际交付

- 常规 DEV Mock 工单报价入口默认读取动态 Order ExtField 与 Code/Cascade provider；无需额外 Order 字段 QA 开关。选品前必填与最终提交必填仍分别验证；不自动填默认业务答案。
- 区域在具备完整、明确的三级代码树时复用共享级联选择器；路径必须完整且属于该树，确认才回填。合成树仅覆盖一个有界示例，不冒充全国区域或当前租户 provider。
- 区域草稿保留 R1 `areaConfirm` 的 province/city/district 本机别名，重进恢复；Order.exts 仍仅投影配置字段，不凭空增加字段。
- Special / Repeat 继续复用共享持久媒体队列。新增已上传附件移除确认/取消；异步清理受 busy 与页面版本约束，失败保留原值。显示可读文件名或附件序号，wire 名称保持原协议。
- 两种节点共同验证上传失败→重启→复用同一任务重试→保存→编辑回读→取消移除→确认移除→保存→再次重启回读。
- 正式 Order / 合同只读场景增加 430×932 与刷新后重新核验；伪造 Order 身份拒绝场景保留。

## R1 来源与有限边界

R1 只读来源：`/Users/yesun/Code/xlink-app/business_jishi/subpackages/order/placeOrders.vue`，固定仓库版本见[报价字段映射](G4F_ORDER_EXTFIELD_MAPPING_CONTRACT.md)。

- `areaConfirm`（5338 附近）输出代码数组，并更新 province/city/district；街道查询是另一个能力。没有复制 `getSubdistricts` 的 `_all/notFilterOrgId/notFilterTenantId` 查询，未扩大角色范围。
- button（255 附近）包含 appId/path/extraData 外部小程序行为及其他平台事件。活动配置和允许动作尚不完整，继续显式阻断；不 eval 配置或模拟动作成功。
- Order file（4230、4276 附近）写入逗号分隔的上传 URL；通用 FormData file 是 `{url,name,extname}[]`。二者不能直接共用 serializer。共享队列已被普通表单和 Special/Repeat 使用，但 Order 媒体的队列身份、URL 回填/重进解码尚未闭合，继续 BLOCKED，不能把通用媒体测试算成 Order 媒体通过。
- submitOrder 阶段存在独立 personType/必填规则。现有转换会校验；保存报价后新增需要修改的 submitOrder 专用字段尚无完整编辑流程，不声明任意租户 schema 已支持。

## 旅程状态

| 旅程 | 本轮范围状态 | 限制 |
| --- | --- | --- |
| 常规 Mock 支持字段→选品→type=0 报价→type=1 Order→逐字段回读 | COMPLETE（限定支持的合成 schema） | 不等于真实 tenant schema 或写入通过 |
| 有界三级区域选择与草稿恢复 | COMPLETE（代码路径） | 全国 provider、街道副作用 UNKNOWN/BLOCKED |
| 普通表单 / forms / repeat 的共享媒体与保存恢复 | COMPLETE（已有支持字段及本轮回归范围） | 不含 Order 媒体，不是实时上传验收 |
| 正式 Order→合同只读、重启与身份拒绝 | COMPLETE（Mock/已有有界只读证据） | 新生产状态样本 NOT_RUN；未扩大合同读取范围 |
| 任意 Order 动态配置与真实端到端写入 | PARTIAL / BLOCKED | button、Order 媒体、submitOrder 独立编辑，以及 #201 HOLD |

## 验证与审查

本地最终源码验证：

- `pnpm run verify:full`：204 文件 / 1795 测试 PASS，包括类型、依赖边界及治理检查。
- `pnpm run build:h5`、`build:mp-weixin`、`build:app`：全部 PASS，仅构建，未启动原生工具。
- 默认真实主 App H5：67 PASS / 26 SKIP / 0 FAIL（5.8 分钟）；SKIP 为未启用的独立合成配置，不能算 PASS。
- 独立 forms/repeat CRUD、报价、回执丢失与弱网：20 PASS（包括 375/390/430）；附件名称展示修改后，受影响媒体与合同用例再跑 9 PASS。
- 六组独立字段配置：scalar 1、primitive 1、arrays 1、temporal 2、cascade 1、business 2，共 8 PASS / 0 SKIP / 0 FAIL（全部真实 App，430×932）。
- 最后两个独立表单场景及预约旧 datetime 保留：3 PASS / 0 SKIP / 0 FAIL。默认回归的 26 个跳过场景已在对应独立配置中执行，无需把 SKIP 冒充 PASS。
- 修复记录：最初区域 H5 因原生 button 标签定位未匹配 uni-app 元素而失败，已改成面板内精确可见文本定位；全量中包含确认、取消、恢复及跨标签页冲突完整路径并 PASS。

精确 SHA 和 CI 结果记录在 #207 本轮交付评论，避免在该提交中写入自引用 SHA；未执行项不得记作 PASS。实际截图保留本机 `.review/closure-screenshots/` 及 `test-results/main-h5-mock/evidence/`，不上传生产数据。商业视觉专项后置，`CODE_PASS` 不等于 Owner 商业视觉签收。未启动微信 DevTools、模拟器或设备，未部署，未执行 Production/Beta 业务命令。
