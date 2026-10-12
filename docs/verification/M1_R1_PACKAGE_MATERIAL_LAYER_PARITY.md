# M1 — R1 套餐材料层级等价性：真实前端修复

**Owner 约束：**R1 是唯一业务逻辑参考；新 App 仅重构前端，后台能力/接口保持不变。  
**R1 源码固定版本：**`xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`，`business/subpackages/order/placeOrders.vue`。  
**新 App 基线：**Draft [#88](https://github.com/xlink-bj/xlink-technician-app/pull/88) `638251df7271940001a210028f70838215a731bd`。

## 源码对照 — 真实业务差异

| 环节 | R1 唯一业务参考 | 原新 App | 本轮变化 |
| --- | --- | --- | --- |
| 套餐材料层级读取 | `openPackage` 对 `materialList` 按 `a.exts.layer - b.exts.layer` 数值排序（6412） | 直接保持接口数组原顺序 | 数值层级按 R1 升序展示；非数值旧 DEV fixture 保持相对原序、不声称 R1 语义 |
| 分层候选材料 | R1 对 `Number(m.exts.layer)` 分组，自动保留此前选中项（6523–6536） | `number:1` 与 `string:1` 是两组，导致重复施工层配置 | `1`、`"1"`、`"01"` 合并为同一道，`0` 与 `"0"` 同理 |
| 选择校验 | R1 一道材料层只选一个，`packagesConfirm` 每个层级必须有被选项（6552–6570） | 两种 JSON 类型视为不同施工层，需要重复选择或误判通过 | 每个实际数值层级精确选择一项，未知 bodyId/Material reference 被拒绝、不自动挑选 |
| 配置保存 | R1 将用户实际选定的材料 body 保留，再进行组合编码（6571–6591） | 原逻辑可能使用组内首行 layer 类型回写已选行 | 配置存用户所选 row 的**原始 layer 类型和值、组件 ID 和引用 ID**，不用组内首行替换 |
| 本机草稿恢复 | R1 同一数值施工层只能有一个最终选择 | schema-v3 对相同数字的 string/number 类型视为不同层级 | schema-v3 恢复时拒绝 `1` 与 `"01"` 双选，避免错误可提交状态 |

**刻意不变：**不生成套餐 SKU 编号，不改变材料 SPU/SKU 类型和 rawLayer 的其它来源审计；不实现价格、库存、官方 Order.type=1 订单生成、签约；不新增 API，不访问 Beta/Production，不改后台；不把 Phase A 四屏概念当作产品 Owner 已批准的正式报价视觉改造。

## 核验

- `src/features/work-orders/quotation/package-configuration.ts`：标准化仅用于 *UI 选择分层*，保存原始 provider 行的 layer；合法 ID、每层唯一、未选择拦截。
- `src/features/work-orders/quotation/catalog-browser-store.ts`：真实 Quotation Action 使用的 Catalog Browser 按 R1 层级聚合和升序呈现。
- `src/features/work-orders/quotation/validation.ts`：草稿解码与报价提交前组件校验一致。
- `tests/g4f/r1-package-layer-equivalence.test.ts`：排序、数值/字符串等价、原始身份、无法选空层/重复层、零层、无自动选材及无商业字段污染。
- 原有 `tests/g4f/quotation-composition.test.ts` 和 `quotation-catalog-browser.test.ts` 更新以检查实际 R1 语义。
- CI 必须在同一个 GitHub commit HEAD 跑完 TypeScript、全部单测、MP/App 打包和主 App 375/390 H5 演示（仅 DEV Mock）；如失败同 PR 修复。

**验收范围：**`R1_PACKAGE_LAYER_FUNCTION_PARITY_CODE_PENDING_CI / FRONTEND_ONLY / OWNER_VISUAL_GATE_#41_PENDING / NO_BACKEND_CHANGE / NO_BUSINESS_WRITE / DRAFT_NO_MERGE`.
