# 验证与收口入口

日常只需先看下面六个入口。这里保留可复用的协议依据、当前验收和未解决问题，不再逐轮堆放实施日报。证据中的 PASS 只适用于注明的版本、环境和范围，不能外推为生产或原生端通过。

## 日常入口

| 要回答的问题 | 文档 |
| --- | --- |
| R1 数据模型是什么，后台与测试数据还有哪些问题？ | [模型与统一问题台账](R1_REAL_DATA_MODEL_MOCK_EQUIVALENCE_INVENTORY.md) |
| 哪些真实路径已经验证，哪些仍未完成？ | [本地真实集成对账](R1_LOCAL_REAL_INTEGRATION_EVIDENCE_20261113.md) |
| 动态 Map、Survey / Order DTO 的编辑保存怎样验证？ | [三模型真实集成](R1_CONFIGURED_MODEL_REAL_INTEGRATION_20261113.md)、[有限动态修正](R1_CONFIGURED_EDIT_BOUNDED_DYNAMIC_CORRECTION_20261113.md) |
| 工单资料与 Action Workspace 是否兼容共存？ | [真实隔离共存](FINITE_INFORMATION_WORKSPACE_REAL_COEXIST_20261114.md)、[HTTP 生命周期](WORK_ORDER_INFORMATION_HTTP_LIFECYCLE_20261114.md) |
| Contacts、工单权限还缺什么证据？ | [Contacts 隔离权限](CONTACTS_ISOLATED_READ_AUTHORIZATION_20261113.md)、[工单隔离权限](WORK_ORDER_ISOLATED_READ_AUTHORIZATION_20261113.md) |
| 签约只读检查到哪里？ | [处理人身份](SIGNING_HANDLER_WORKFLOW_IDENTITY_20261114.md)、[隔离 fixture 计划](SIGNING_READ_ISOLATED_FIXTURE_PLAN_20261114.md) |

架构设计看 [docs/architecture](../architecture/)，开发规则看 [AGENTS.md](../../AGENTS.md)。本目录不是第二套架构或实时任务系统。后台缺陷、本地配置差异、测试数据缺失须分开；先按生产只读结构和 R1 补齐本地数据再复验，不把本地失败直接归为生产问题。

## 过程报告归并后的必要结论

| 归并主题 | 保留的结论与边界 | 后续依据 |
| --- | --- | --- |
| 早期 G3/G4 列表、详情、预约和 UI 阶段 | 历史源码/Mock/特定 Beta 窗口曾分别验证过，不能用旧 PASS 宣称当前全链通过；旧候选分支及当时 PENDING 不再作为当前计划。原生、Owner 视觉和发布仍是独立验收。 | 当前真实集成对账、架构与产品标准；原始结果由固定 Git 历史追溯。 |
| 报价、材料/SPU/SKU、价格与 Order | 必须区分报价 type0、订单 type1；数据来源、菜单/角色权限和价格快照不能由 Mock 推断。SKU 是当前四个已核生产上下文的未验证/休眠选项，不阻断普通 SPU 报价。历史 Beta 包详情失败不泛化为生产故障。 | 统一台账、保留的报价领域/ExtField 契约与生产只读快照。 |
| 通用表单逐字段、首建和已有记录编辑 | 有限字段能力与后台协议适配复用；Survey/Order 保存 DTO 与动态 Map 路径不能相互替代。逐字段合成测试不等于任意后台配置或业务写入通过。预约 radio/datetime 等实际范围以三模型报告为准。 | 三模型真实集成、字段能力审计、配置编辑修正和表单兼容限制。 |
| 图片、附件、草稿及中断恢复 | 首建图片、已有附件保留/移除、上传 token、loopback 合成存储各是独立证据；不能合成为真实 Qiniu 或已有记录上传保存回读已通过。旧记录、回执及一次性窗口不重放。弱网恢复只证明同浏览器 profile 的页面重启/本地草稿和 IndexedDB 文件恢复，不证明冷离线启动、存储清除/OS 驱逐或原生行为；网络恢复不自动补发命令，未知 ACK 不可清空后重试。 | 当前真实集成对账、首次媒体报告、上传对象 key 契约及现有媒体隔离任务。 |
| 输入、搜索、导航、刷新和角色切换 | 历史逐轮 H5 报告不是现版本回归结果。身份变化、迟到响应、字段权限与只读显示仍要守住；以当前测试和精确 commit 的 CI 为准，不迁移旧测试数。 | 当前 HTTP 生命周期、角色字段与工作区协议。 |
| 签约 | Order/Contract/Workflow 身份和当前处理人需独立核实。只读资格、合成 H5 或默认禁发测试都不授权签署、短信、PDF，也不证明真实签署成功。 | 保留的签约调用链/只读边界与最新隔离计划。 |
| 旧集成候选与机器门禁 | 少量历史 JSON、路径或正文仍被自动化消费，保留不作为当前状态。不得为了清理文档降低断言或删除测试。 | 历史 manifest 与其消费者，现行开发规则仍由 AGENTS.md 决定。 |

### 媒体与恢复：仍需使用的历史证据

以下原文移出活动目录，但不是作废证据。与当前媒体闭环逐项对照：

| 固定历史原文 | 已证明的范围 | 不能据此宣称 |
| --- | --- | --- |
| [动态图片 v4 首建](https://github.com/xlink-bj/xlink-technician-app/blob/df7b755c0ca56ac941a48627753049b20c554639/docs/verification/CONFIGURED_DYNAMIC_FILE_CREATE_20261111.md) | 首片配置驱动图片 `dynamic-file-first/create`、精确 grant 和既有上传队列复用；历史文中的数量/准入限制仅代表当时版本，当前有限动态修正另见上方入口。 | 不是已有记录编辑、append、Process 或任意配置真实 Java 保存通过；旧 grant 不扩大权限。 |
| [附件只读解码与普通列标记兼容](https://github.com/xlink-bj/xlink-technician-app/blob/df7b755c0ca56ac941a48627753049b20c554639/docs/verification/CONFIGURED_FILE_READ_COMPAT_20261111.md) | `customizeFlag` 普通标记与控件能力分离；write flag 关闭、无 grant 时仍可走合格附件只读解码；保持完整源元数据的合成重放有明确边界。 | 不授予编辑或上传，不证明真实保存、冷 HTTP 回读及已有记录媒体整链通过。 |
| [弱网与 IndexedDB 恢复 H5](https://github.com/xlink-bj/xlink-technician-app/blob/df7b755c0ca56ac941a48627753049b20c554639/docs/verification/R1_OFFLINE_WEAK_NETWORK_ACCEPTANCE.md) | 同 profile 页面重启的本地草稿、IndexedDB 文件恢复、显式重试；重新联网不自动提交，未知回执不清除后重复发送。 | 不证明冷离线 PWA、清除存储/OS 驱逐、原生文件、真实外部上传或所有表单能力通过。 |

已有记录“上传 → 保存 → 权威回读”仍须以当前全新隔离窗口的独立结果为准。上述三个历史切片及已消费记录不得拼接或重放来补齐这一结论。

## 历史材料与恢复

本次把重复的逐轮过程记录从活动目录移除，必要结论归入上表，仍在使用的证据链接改指向固定历史版本。没有重写历史报告中的失败、未运行或权限限制；没有新增生产授权。统一问题台账、当前未解证据、机器 manifest、应用代码与 CI 保护均保持。

清理基线：`df7b755c0ca56ac941a48627753049b20c554639`。该提交下的 [完整 verification 历史目录](https://github.com/xlink-bj/xlink-technician-app/tree/df7b755c0ca56ac941a48627753049b20c554639/docs/verification) 可查所有原文。需要提取任意历史报告，可执行以下只读命令，无需 reset 或覆盖工作树：

```sh
git show df7b755c0ca56ac941a48627753049b20c554639:docs/verification/<原文件名>.md
```

`docs/governance/*_20261030.json` 是当日资产清单，不是现行文件存在性保证，保持原样。之后的新验证应优先更新上述已有入口；仅独立、可复用的协议或尚未解决证据才新增专门文件，任务过程和重复执行日志不再累加为顶层报告。
