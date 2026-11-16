# ADR — 设备作业作为 Action Content

Status: ACTIVE — H5 DEV Mock 首条内容切片已实现；真实设备、后台保存与真机闭环未实施
Decision authority: Owner IoT 架构决策；[AGENTS.md](../../AGENTS.md) 的授权与 main-only 规则不变
Reviewed at: 2026-11-16
Code baseline: `main@d6f5badf2ff100463f61c81613db7bac29702cb2`（本次新 App 源码核对，不是设备验收）
Scope: 试压、全景采集的职责、可靠性及平台边界；H5 DEV Mock 内容实现不授予生产访问、业务写入、上传、真实设备控制、签署或发布权限。
Related: [Target Architecture](TARGET_ARCHITECTURE.md)、[Action Workspace](ACTION_WORKSPACE_ARCHITECTURE.md)、[Local Draft](LOCAL_DRAFT_AND_WEAK_NETWORK_ARCHITECTURE.md)。本 ADR 补充设备特有决策，不替代这三份权威规范，也不改写历史实现快照。

## 1. 决定及理由

沿用 **Business Truth → Workflow Runtime → Current Action Projection → Action Workspace（Load / Draft / Recover / Submit / Navigate）→ Action Content → Semantic Ports & Adapters → Multi-Platform Delivery**。可维护的 Mermaid 源码图在 [Target Architecture §3](TARGET_ARCHITECTURE.md#3-current-logical-architecture)，图表示职责/装配关系，不表示所有分支已经存在。

设备作业是 Action Content 的一个分支，与预约专用体验、动态表单和报价领域内容并列。试压、全景采集分别保持小而聚焦的专用内容，复用工作流权限、任务身份、草稿恢复、媒体上传和业务提交边界。保留现有有界 controller，不另建全局“设备作业层”、设备平台、插件市场或通用 IoT 引擎，也不先创建空目录和全型号抽象。

- **试压内容**负责作业过程、采样/结果完整性和已核实的测量判定；协议编解码与传输分离，BLE 连接、订阅、收发及平台权限由适配器承担。页面只消费语义状态和结果，不解析 BLE 字节。协议模块的具体文件名待第一条纵向实现确定，本 ADR 不虚构已存在的 port/type。
- **全景内容**负责拍摄/拼接/文件就绪等语义过程；Android/iOS 厂商 SDK 以薄适配进入现有 ports/adapters。SDK 对象、原生路径和厂商错误码不泄漏到 Workflow 或页面。SDK 就绪或系统权限获准不等于业务授权；未实现/未知状态必须明确失败，不能返回假成功。
- **品牌主题**继续归 `src/brands/` 及现有 UI 组织。设备协议/型号选择不能由品牌样式、页面文案或主题决定。
- **扩展顺序**先完成一个压力设备和一个相机各自的纵向闭环，再按真实型号差异扩展。首发设备型号、固件、相机 SDK 及操作系统均待确认；App-first 不等于 Android-first。

## 2. 源码现状与目标差额

以下表格保留 ADR 制定时上述 exact SHA 的静态核对；本轮新增切片见第 7 节，复用入口存在不等于真实设备能力已经可用。

| 职责 | 现有源码依据 | 设备接入的目标/缺口 |
| --- | --- | --- |
| 工作流资格、当前动作 | [workflow/policy.ts](../../src/runtimes/workflow/policy.ts)、[detail-workflow.ts](../../src/features/work-orders/detail-workflow.ts) | `construction` 命令仍返回 `policy_unverified`；不得为演示开放。真实任务、节点、角色/handler 资格和结果契约仍须确认 |
| Action 身份/草稿 | [action/types.ts](../../src/runtimes/action/types.ts)、[draft-repository.ts](../../src/runtimes/action/draft-repository.ts)、[normal drafts](../../src/app/r1-normal-form-drafts.ts) | 复用 user/workOrder/workflowNode/action/content 身份及角色来源；现有 `construction → composite` 映射仅是内容分类，不代表执行资格或设备内容已实现 |
| Workspace 与内容 | [action-workspace.vue](../../src/pages/work-orders/action-workspace.vue)、[normal-form-action-page.ts](../../src/features/work-orders/normal-form-action-page.ts)、[R1FormActionContentHost.vue](../../src/features/work-orders/R1FormActionContentHost.vue)、[NormalAppointmentEditExperience.vue](../../src/features/work-orders/components/NormalAppointmentEditExperience.vue) | 保持正常 Reader/Provider/Host 主链与专用体验边界；新增设备内容不能让表单或 Shell 变成设备控制器 |
| 语义能力/装配 | [platform ports](../../src/shared/ports/platform.ts)、[platform-adapters.ts](../../src/adapters/platform/platform-adapters.ts)、[bootstrap.ts](../../src/app/bootstrap.ts)、[composition.ts](../../src/app/composition.ts) | 已有媒体采集、文件选择、定位等能力；当前没有压力协议/BLE 或厂商全景 SDK 集成。设备专用语义 port 按纵向切片新增，继续显式装配 |
| 媒体/本地文件 | [media-upload-queue.ts](../../src/runtimes/media/media-upload-queue.ts)、[Uni durable store](../../src/adapters/storage/uni-durable-media-store.ts)、[browser durable store](../../src/adapters/storage/browser-durable-media-store.ts) | 复用 `MediaUploadQueuePort` / `DurableMediaStorePort`。当前默认按 `window`/`indexedDB` 特征选择存储；App 原生文件必须显式按平台装配并验证，不能把环境探测或临时路径视为持久性证明 |
| 保存/回读 | [action-workspace-command-boundary.ts](../../src/features/work-orders/action-workspace-command-boundary.ts)、[r1-configured-record-edit.ts](../../src/app/r1-configured-record-edit.ts)、[r1-normal-form-media.ts](../../src/app/r1-normal-form-media.ts) | 已有有界调用链的 mutation receipt、完整 ACK/回读和媒体 finalization；新设备结果仍须单独核实业务存储身份、命令、回执及副作用，不能照搬表单接口 |

`finalizeAfterSave` 当前只检查队列任务为 `uploaded` 且存在 `uploadedRef`，不自行验证业务 ACK。业务调用方确认权威结果后才能调用它；本次不把该 helper 描述成设备证据已安全落库的保证。现有普通表单媒体支持也不等于全景原图/拼接结果及压力数据已满足所需文件类型、容量或恢复要求。

## 3. 完成、合格、完整与保存分别确认

以下是新设备内容必须表达的独立事实，不是拟新增的统一状态枚举，也不是只能单向推进的六步状态机。

| 事实 | 证明内容 | 不能替代的事实 |
| --- | --- | --- |
| 设备作业完成 | 该次测量/拍摄操作已结束，错误/中断可区分 | 测量合格、结果完整或工作流完成 |
| 测量合格 | 已核实的业务规则与设备测量结果一致；不适用时明确不适用 | “结束”不能自动变为“合格”；阈值未确认不能猜测 |
| 数据完整 | 所需采样、单位/时间、结果元数据或全景文件完整，可关联同一作业 | 仅收到一个完成回调/图片路径不够 |
| 本地落盘 | 文件及必要元数据持久化，可重新打开并校验 | 临时缓存路径、内存对象不证明跨进程恢复 |
| 上传成功 | 远端对象上传结果及引用已确认 | **上传成功不是业务保存成功** |
| 业务服务端确认 | 权威业务 ACK 关联正确任务、结果/证据，满足已核实契约；按契约核实权威回读 | HTTP 成功、SDK success、上传 URL、前端提示均不能代替 |

设备结果保存也不自动完成 Workflow 节点。需要推进节点时，必须有单独核实的流程命令与授权，下一动作由权威回读推导。

恢复与清理遵循现有 [Local Draft](LOCAL_DRAFT_AND_WEAK_NETWORK_ARCHITECTURE.md)，设备增加以下约束：

1. 从采集开始绑定当前账号/角色、工单、工作流节点及内容身份；恢复、上传、提交前重查当前授权及任务归属，隔离旧账号/旧任务证据，不按相机名称、蓝牙地址或旧表单标题匹配业务任务。租户等范围沿用真实会话契约，不能因旧 `ActionIdentity` 字段有限而省略核验。
2. 业务提交前保留可恢复的文件和结果元数据；取得权威业务 ACK 前不得因为上传成功、退出页面、重连或重新登录而自动删除证据。ACK 缺失、超时、冲突或回读不符合约定时保留不确定状态，先查询/对账，不盲目再次提交。
3. **重连不可自动重放加压、复位或启动命令。** 只恢复可验证的连接/读取状态；重新执行需明确用户意图、当前权限和设备状态确认。重连不是重新授权。
4. ACK 已确认后的清理/刷新失败单列为待处理，不把已确认业务保存改成失败并诱导重发。实际保留期限、存储不足及清理规则需在首条闭环中验证；本次不承诺已有统一设备证据存储服务。

## 4. 平台边界与验证门槛

| 平台 | 已决定的目标范围 | 仍需证明 |
| --- | --- | --- |
| App（Android / iOS） | 完整设备流程优先；共享业务语义，SDK/传输/文件差异止于 adapters | 首发 OS 待选；厂商 SDK 授权与版本、包集成、权限拒绝/恢复、断连、后台/杀进程、文件持久化和真实设备闭环 |
| MP-WEIXIN | 可行的 BLE 能力按型号/固件/OS 逐项验证；不预设与 App 等价 | 扫描/连接/通知/重连及系统限制的实测矩阵；未验证能力显式不可用，全景 SDK 不因 App 可用而自动可用 |
| H5 | 开发 Mock、历史与结果查看 | 语义等价、故障/恢复用例；不承诺浏览器直接控制硬件，不把 Mock 或浏览器文件存储当原生验收 |

[package.json](../../package.json) 有 `build:app`，只证明工程提供编译入口；即使编译成功也不证明原生包、SDK、签名交付或真机可用。[原生能力矩阵](../discovery/NATIVE_PLATFORM_CAPABILITY_MATRIX.md) 的历史占位状态不是当前设备通过证明。本 ADR 不开启原生执行窗口，仍遵守 AGENTS.md 的阶段限制。

第一条压力/相机闭环实施前分别确认：真实任务入口与授权、选定硬件/固件/OS、协议/SDK 来源、结果字段及任务关联、业务保存与 ACK/回读契约。实现后分别记录成功和失败证据：拒绝权限、断连、重复/迟到回调、缺数据、落盘失败、重启/换账号恢复、上传失败、上传完成但业务未确认，以及 ACK 后清理失败。协议合成向量、Mock、编译、真机、业务保存各自报告；任何一个 PASS 不替代其余门槛。

## 5. 旧系统证据与研究覆盖

只读参考：[xlink-bj/yuhong-app-rn-reference@47c6674fa55135b56aaf8f6c52e9c441fe8683bb](https://github.com/xlink-bj/yuhong-app-rn-reference/tree/47c6674fa55135b56aaf8f6c52e9c441fe8683bb)。[README](https://github.com/xlink-bj/yuhong-app-rn-reference/blob/47c6674fa55135b56aaf8f6c52e9c441fe8683bb/README.md) 与 [SDK_MISSING](https://github.com/xlink-bj/yuhong-app-rn-reference/blob/47c6674fa55135b56aaf8f6c52e9c441fe8683bb/SDK_MISSING.md) 明确它是脱敏静态研究副本，缺有效配置、资源和厂商 SDK，不是完整可构建交付。本次只复核相关入口，沿用前序研究交接，不重新展开全库研究。

| 研究结论/边界 | 正式文档如何承接 | 尚未覆盖的验证 |
| --- | --- | --- |
| 根目录为 RN 0.68.1 设备壳；`sources/saafweb` 为 PC Vue2、`saaf-base` 为 Java 平台、`saaf-css` 为 Java 管业业务、`app-h5` 为移动 Vue2 | 本节保留来源定位；旧业务/设备实现只支持职责分析，不替代新 App 业务契约权威 | 不从多包目录推导可运行系统或新后台接口 |
| 压力协议四个确认分支为 `SECOND`、`FOURTH`、`X300`、`SJ`；`BlePlus` 是操作模式，不是第五个已确认型号 | [RfService.tsx](https://github.com/xlink-bj/yuhong-app-rn-reference/blob/47c6674fa55135b56aaf8f6c52e9c441fe8683bb/src/appCommon/tool/RfService.tsx) 支持协议与传输拆分决定；[BleService.tsx](https://github.com/xlink-bj/yuhong-app-rn-reference/blob/47c6674fa55135b56aaf8f6c52e9c441fe8683bb/src/appCommon/tool/BleService.tsx) 为旧传输入口 | 分支名不等于完整商品型号清单；19 条协议回放是前序研究的合成源码向量，**不是真机证据**；本次未重跑 |
| 小红屋 `HZCameraSDK/Hozo` 与屋联 `SmartPanoramaX/PanoramaCameraSDK` 两条路径 | [拍摄协调入口](https://github.com/xlink-bj/yuhong-app-rn-reference/blob/47c6674fa55135b56aaf8f6c52e9c441fe8683bb/src/fang/page/camera/xhwTaking.tsx)、[Android 桥](https://github.com/xlink-bj/yuhong-app-rn-reference/tree/47c6674fa55135b56aaf8f6c52e9c441fe8683bb/android/app/src/main/java/com/fangCamera)、[iOS 桥](https://github.com/xlink-bj/yuhong-app-rn-reference/tree/47c6674fa55135b56aaf8f6c52e9c441fe8683bb/ios/fangCamera) 支持薄适配决定 | 型号、固件、SDK 版本及许可/再分发授权仍待确认；缺失清单中 Android SmartPanoramaX 使用“微联”名称，不能仅凭命名推断硬件身份 |
| 前序研究确认 Android 屋联部分连接/销毁 TODO 返回成功 | 本 ADR 要求真实能力状态和显式失败，不继承假成功 | 有回调或桥方法不证明设备已连接/资源已销毁，须逐平台验证 |
| 旧 `orderId/cardId` 与旧保存链路可能关联 PDF、短信、积分 | 保持业务身份/命令归 adapter、Workflow 权限归 runtime；不得直接映射新 `serviceAppointmentId` | 新任务/结果关系、保存字段、ACK 与副作用仍待契约确认，不复制或调用未核实接口 |
| 工作流/Workspace、草稿隔离、弱网、媒体、平台隔离 | 已有 Target Architecture、Action Workspace、Local Draft 为权威；本次仅补设备特有语义与上述 gap | 既有表单/媒体证据不自动覆盖设备闭环 |

此表说明关键研究结论已被哪份 Git 文档承接，不宣称所有原始研究资料已入库或可删除。本任务不操作用户 Mac 文件，不删除原始 ZIP、独有证据或未入库资料；不复制凭据、SDK 二进制及未核实接口到应用仓库。

## 6. 影响与后续实施边界

收益是复用既有业务执行骨架，同时把协议、传输、SDK 和品牌变化限制在其责任范围。代价是首条纵向闭环必须补齐设备结果契约、持久化和逐平台适配证据，不能仅靠一页演示宣称集成完成。

H5 DEV Mock 只实现本地操作与结果恢复，不迁移真实设备或业务保存。后续每个能力切片须独立可审查/回滚，未验证时保持现有入口阻断与显式不支持。撤回某型号/SDK 集成不能清除未确认的证据或回放业务/设备命令。若目标设计需要改变，应修订本 ADR 与总架构，而非另立并行规范。

## 7. H5 DEV Mock 首批实施与使用

本批源码为 [设备 Action Content](../../src/features/work-orders/device-action/device-action.ts)、[语义 port](../../src/shared/ports/device-action.ts)、[DEV 模拟 adapter](../../src/adapters/device/dev-mock-device.ts) 和 [独立页面](../../src/pages/work-orders/device-action-mock.vue)。它以固定 DEV Mock 工单 `mock-work-order-002`、独立模拟任务 `mock-device-action-node-002`、登录用户与角色生成 Action Draft 身份。该工单既有当前工作流节点是 `placeOrder`；模拟任务不冒充正式施工节点，`construction` 的 `policy_unverified` 维持原样。页面访问受 `VITE_XLINK_H5_MOCK_E2E` 与 Mock data 模式限定，正式业务入口不展示该模拟操作。页面路由仅在 `XLINK_DEV_QA` 编译条件下注册，并通过现有发布路由检查排除。

运行 `pnpm run dev:h5:mock`，从 `/#/pages/index/index?devReview=1` 进入已登录 DEV Mock H5 的 QA 控制台，开启“完整数据”，点击“设备作业 · 固定 Mock 任务”。选择试压或全景、连接、开始，观察过程与结果；作业中可取消或模拟断连。断连后只可重新连接，必须再次手动开始。保存本机结果后重新打开相同任务可恢复；账号、角色或任务身份不匹配时不恢复。试压显示合成 MPa 采样，合格判定保持待核实；全景只展示模拟拼接预览，没有真实原图或可上传文件。页面分别呈现结束、数据完整、本机保存、上传和业务确认，不把模拟完成当成工单完成。

本批验证区分构建与体验：发布 H5 编译通过且 DEV 路由被排除；XLink 与雨虹两个主题的真实 DEV Mock H5 均在 430×932 完成入口、断连/取消、结果保存恢复与身份撤销测试，375×667 无横向溢出。截图保存在 `.review/device-action/{xlink,yuhong}/430x932/`，不作为真机或商业视觉验收。

首批不使用 BLE、厂商 SDK、浏览器相机、支付、签署或生产网络，也没有真实结果上传、业务 ACK、阈值和工作流推进。App/MP 的设备操作仍显式不支持；本地编译与 H5 Mock 操作不能替代真机、文件持久性或后端契约验收。
