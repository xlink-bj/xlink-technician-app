# R1 套餐基础价来源与 Mock 报价转订单（2026-11-16）

本批核对固定 R1 源码并扩展真实 App DEV Mock 回归，不新增价格 fixture，不访问生产接口，不改变 #201 HOLD。适用普通 `pricingMethod=0` 套餐；不是全部套餐变体或真实生产写入验收。

## 套餐基础价的真实来源

R1 前端固定提交 `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`，后端固定提交 `5fc008d32e771205260f120621c1c4fc62d0824e`，与[权威清单](R1_REAL_DATA_MODEL_MOCK_EQUIVALENCE_INVENTORY.md)一致。以下为只读源码证据，路径相对各自 R1 仓库。

| 环节 | 证据 | 已确认的行为 |
| --- | --- | --- |
| 当前可选套餐 | 前端 `business/subpackages/order/placeOrders.vue:5500–5525` | `biz/projPackage/queryWithRank` 携带激活条件、`serviceType/sourceType` 和排序；前端保存返回的 `price` 为初始 `amount`，同时保存 `minimumPrice` |
| mini 投影入口 | 后端 `src/main/java/com/fsgo/modulemini/biz/ProjPackageController.java:49–53` | 服务端设置 `form=mini`，调用 `GoodsService.queryWithRank` |
| 身份与有效价 | 后端 `src/main/java/com/fsgo/service/biz/GoodsServiceImpl.java:382–416,449–456` | 由当前用户组织推导运营中心，限定租户与目录上下文；按套餐 ID、运营中心 orgId、tenantId、`approveState=1`、`state=1` 查 `ProjPackagePriceBody`，命中时将 `guideUnitPrice`、`minimumGuideTotalPrice` 投影为套餐 `price`、`minimumPrice` |
| 无价格表命中 | 同上 `449–456` | 不执行价格覆盖，保留套餐实体原字段。因此不能宣称所有返回价必然来自价格表，也不能绕过列表自行拼装或补零 |
| 套餐详情 | 后端 `src/main/java/com/fsgo/service/project/ProjPackageServiceImpl.java:104` 起；前端 `placeOrders.vue:6407` 起 | 读取套餐及组件、材料层和加价等配置。详情不是 ranked mini 有效价投影入口；R1 前端更新组件列表，不用详情根价格替换已选列表价 |

当前 App 的 `hydration.ts` 保留同一上下文列表 item，核对详情套餐 ID 后补组件；`pricing.ts` 使用该 item 的 `price`。已增加回归：详情没有价格仍按列表价计价；列表缺价而详情有基础价也必须阻断。未改 R1 接口、身份过滤或价格计算规则。

普通套餐单位金额为列表有效基础价加所选包内材料的正加价；数量及最低起算价继续按既有 R1 舍入规则执行。包内材料加价、独立材料 SPU 售价、历史 Order 快照是不同输入。历史订单不能按当前目录重定价。[既有生产只读对照](G4F_ORDER_PACKAGE_PRICE_SNAPSHOT_PROD_READ_20261105.md)仅有有限精确样本，本批没有新增线上价格或新鲜度证明。

## 合法 Mock 闭环与缺价保护

- 默认小型套餐 fixture 的列表/详情缺少有效基础价，本批保持原样。真实 H5 选择每个材料层后，计价必须返回 `pricing.package_price_missing`、没有可提交 payload；刷新后继续阻断，不生成报价/订单。
- 成功场景复用既有显式 opt-in [M08 合成目录](M08_CATALOG_SCALE_MOCK_20261108.md)，不新增或抄录真实价格。套餐 027：基础价 126，改配后加价 15，数量 2，套餐 282；加独立工序 75、材料 108、机措 8，总计 473。此前首选组合总计 459，改配后为 473。以上全部为已有测试合成值。
- 真实 App 连续旅程进入报价，跨页选择四类末页产品、改配套餐、修改数量、刷新恢复，保存 type=0 报价；填写订单阶段动态字段并恢复后，确认转为 type=1 正式 Order。
- 核对返回的报价/Order 使用不同 ID、同一工单关联、完整 `bjProducts` 快照和 473 金额；订单资料锁定，重启页面不再次创建。
- 注入的是“本地 Order 已持久化但回执丢失”，不会向页面注入成功。页面先保持结果未知、隐藏重复提交入口，刷新后仍未知；用户只读核对精确返回记录后才显示已回读。跨刷新记录实际 Order 存储写入数始终为 1。
- 回归发现并修复：冷恢复的未知结果在核对成功后，未同步订单字段阶段，导致订单备注不显示。现在仅在控制器读取状态为 `quote_created` / `succeeded` 时切到订单资料阶段；成功订单保持只读，不确定状态不被转换为成功。

## 验证与证据

执行记录保存在忽略目录 `test-results/套餐报价订单闭环-20261116/`。本地真实 App 为雨虹主题 H5、Chrome、430×932；生成目录在同仓库 `unpackage/`，未覆盖 MP 产物，也未操作微信开发者工具。

| 检查 | 实际结果 | 耗时与范围 |
| --- | --- | --- |
| 聚焦 Vitest | 80/80 PASS | 1.27 秒；列表/详情价格来源、目录、写保护与恢复字段阶段 |
| `pnpm run verify:full` | PASS；367 文件、6710 测试 | 最终 Vitest 30.20 秒，包含类型、边界、映射、品牌及工程检查 |
| 默认真实 H5 | 2/2 PASS，0 SKIP | 46.2 秒（含启动）；动态字段/媒体/跨页冲突/普通报价转单已有回归，以及默认套餐缺价与刷新保护 |
| M08 真实 H5 | 2/2 PASS，0 SKIP | 94.9 秒（含启动）；普通套餐正常转单、回执丢失与刷新后只读恢复 |
| 本地截图 | 12 张 430×932 | `.review/套餐报价订单闭环-20261116/index.html`，正常 5 张、未知结果 6 张、缺价 1 张；均为实际 H5，不是 MP 或真机截图 |

截图检查覆盖套餐金额/数量、确认操作、未知状态、订单字段只读和缺价禁用；无横向溢出。未做视觉重设计。既有底栏重复信息等商业视觉优化由独立评审处理，本批不据此宣称视觉验收通过。

新增缺价用例已接入既有 Main H5 CI 默认报价字段步骤；M08 原步骤扩展为正常转单与回执丢失恢复两例。GitHub CI 为提交后的独立门禁，执行中、跳过均不算通过。

## 未扩大结论

本批完成普通套餐的价格来源证据与上述有限 Mock Quote→Order 路径。M08 仍为 PARTIAL：小目录上下文的独立 App UI、所有套餐组合及 `pricingMethod=1` 不由这些用例证明。Production/Beta 的创建、更新、Workflow、合同、上传、消息、PDF、签署仍关闭；Mock 订单成功不代表真实持久化、合同关联或签约成功。真机键盘、安全区继续待验，商业视觉仍由 Owner 单独审核。
