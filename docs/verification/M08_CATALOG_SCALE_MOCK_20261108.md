# M08 真实 App 合成目录规模回归（2026-11-08）

## 基线和边界

应用基线 `becd4624176a793c95385fd5d0c123ea5203d61f`。R1 仍以[权威清单](R1_REAL_DATA_MODEL_MOCK_EQUIVALENCE_INVENTORY.md)的固定前端 `6c0a97b` / 后端 `5fc008d` 为准；仅实现前端 Mock 与回归，不改后台或历史接口，不访问生产/Code。

两组目录量级来自已有角色内观察：套餐/工序/材料/机措为 `27/66/89/4` 与 `1/0/14/0`。生产名称、ID、价格没有复制到新增 fixture。所有产品编号、文案和金额为任意合成值，不能用于真实报价或判断价格新鲜度。

## 接线和执行

- `quotation-catalog-scale.ts` 提供真实 R1 四目录分页、28 份套餐详情和空 SKU；套餐层材料、组件及价格字段遵循现有 adapter/计价规则。
- router 只有在 DEV、dev 环境、正常 Mock 旅程以及显式 `VITE_XLINK_R1_CATALOG_SCALE=true` 同时满足时启用。默认小型 Mock 不变；scope 错误、不完整或额外请求参数不回退为合法规模数据。
- 两套目录所有页、末页/空页、唯一 ID、全部套餐详情、93/15 个合成 SPU 的空 SKU 由真实 adapter 验证。真实 catalog store 在大上下文迟到 page2 到达时已切小上下文，必须保持 `1/0/14/0`，不得混入旧结果。
- 大上下文通过真实 App 连续旅程进入报价，手动跨页加载 27/66/89/4，选择末页产品。套餐 027 数量 2，材料层首选/备选价格导致套餐 268→282；叠加工序 066（75）、材料 089（108）、机措 004（8），合成总价应为 459→473。金额使用既有实际 hydration/计价引擎，套餐数量 1 时则最低价 150。
- H5 场景验证数量编辑、套餐改配、刷新还原及 Mock 报价保存回读；不是正式订单/签约验收，不产生任何外部请求。

执行入口：`VITE_XLINK_R1_CATALOG_SCALE=true pnpm exec playwright test --config config/playwright/catalog-scale.config.ts`。Mac 已装 Chrome 时可显式加 `XLINK_M08_BROWSER_CHANNEL=chrome`；CI 使用安装的 Chromium。

专用配置复用 canonical App，仅在 localhost:5174 使用同仓库独立 `unpackage/m08-catalog-h5` 输出和 `unpackage/m08-vite-cache` 缓存。没有 worktree/源码副本；不会停止或改写既有 5188/5189。忽略其他 lane 的报告 HTML 更新，避免误触页面重载。

## 未扩大的结论及历史问题

M08 仍为 `PARTIAL_SCALE_EQUIVALENCE_NOT_PROVEN`：当前真实 App 只证明大上下文这一条组合旅程，小上下文已到 adapter/store 层，尚未覆盖独立小上下文 App UI、全部套餐材料组合、所有历史角色与价格规则。所有域 liveParity 仍 NOT_VERIFIED，不用 Mock 成功替代生产权限、持久化或外部副作用验证。

已有 SKU helper、价格或后台字段历史问题继续按权威清单记录；本批没有把后台治理作为前端接线前置条件，也没有为了测试改变 R1 计价规则。测试启动/选择器和并发报告 HMR 问题只作为测试环境记录，不归为生产缺陷。最终测试与 exact-SHA CI 状态以本次交付回执为准，跳过不算通过。
