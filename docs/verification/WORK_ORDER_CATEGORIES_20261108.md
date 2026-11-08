# 工单列表五分类集成（2026-11-08）

## 设计与接口依据

用户确认 `xlink-bj/xlink-business-web-poc` 即本次 R2 参考，要求保留「待接单、待联系、待上门、待跟进、全部」，不是待办/已办二选一。本片只恢复这项已有设计，不扩展布局、角色菜单或后台能力。

参考固定于 R2 `06b885ed22477e79d50bc6f3a0ce0c96fbc1a185`：

- `web/lib/work-order-filters.ts`：五分类顺序、名称与默认全部。
- `web/lib/sa-list-display-map.ts`：分类对应原 R1 状态码。
- `web/components/list/ListControls.tsx`：搜索下方的横向分类栏。
- `docs/14-v0.2.1-list-mapping.md`：23 状态码的业务分组说明。

| 分类 | R1 status |
| --- | --- |
| 待接单 | 101,102,103 |
| 待联系 | 104 |
| 待上门 | 105,202 |
| 待跟进 | 200,201,203,204,205,206,207,300,301,302,401,402,403,407,501,502,999 |
| 全部 | 不增加分类 status 条件 |

R1 角色菜单来源仍沿原 `function/changeRole`、`tabDisplay=1` 的 serviceAppointments 菜单协议。旧 R1 `business/resources/js/common.js` 的 3339–3365 行与 `serviceAppointments.vue` 的 1524–1537、1563–1566 行分别提供角色菜单和查询依据。后台 `WorkflowServiceImpl.java:142–181` 的 todo/done/综合条件以及租户、WorkflowDef 条件不变。

## 实现与权限边界

- 原始状态码只在 adapter 内。页面/store 仅传语义 category。
- 分类状态与角色原 status 求交；空交集返回空结果，不发更宽的列表请求。
- 保留原角色 endpoint、orderState、status、分页和搜索协议。全部不等于全租户，也不会把 todo 强行改为 all。
- 仍沿当前已有的首个获准角色列表 scope；本片不是角色菜单切换器。若当前角色 scope 只有 todo，已完成工单是否可自然发现仍须当前真实菜单和服务端过滤证据，不能由五标签推断。
- 保留当前 session/role 的列表 ID 来源及详情授权限制。分类切换从第 1 页开始、清旧行；迟到请求不能覆盖新分类。换身份清分类、搜索及列表。
- 搜索与详情返回保留当前分类。失败显示真实失败，重试使用同分类。
- 不照搬 POC 的云失败 Mock fallback、未知状态归入待跟进、固定 orderState=all 或失败计数显示 0。本片不制造分类计数，页面只显示真实已加载条数。

## Mock 与验证范围

默认 Mock 角色的虚构 `mock-ready/mock-open` 条件改为合成综合范围，业务查询仍走真实 adapter。列表先按 status/search 过滤再分页，包括无筛选「全部」的 page/rows；修正原无搜索提前返回导致的重复分页。

另一个 Mock 对齐切片提供显式 DEV 开关 `VITE_XLINK_R1_CATEGORY_FIXTURES=true` 的 104/105/202 正向合成条目及一致详情标识。不借这三个只读样本伪造节点类型、权限、FormDef 或业务写入。其协议、默认关闭、环境隔离与 wire 错误测试另见 `mock-current-api-parity.test.ts`。

验证入口：

- `tests/engineering/work-order-categories.test.ts`：状态映射、角色交集、空交集、endpoint、非法值、迟到响应、身份变更、失败重试和分页。
- `tests/engineering/work-order-category-page-lifecycle.test.ts`：直接编译实际页面脚本，验证接单预检/确认迟到、分类/身份/卸载失效、旧行移除和详情返回搜索保留。
- `tests/g4ux/home-list-production.test.ts`：旧“禁止 tabs”决定按用户本次授权替换为真实分类栏检查；无虚构计数、额外排序等限制保留。
- `tests/h5-main-mock/work-order-categories.spec.ts`：正常 App、375/430 两宽五标签、正向分类、未知状态、搜索和详情返回。禁外部网络，无真实账号/后台/生产请求。
- `config/playwright/work-order-categories.config.ts`：同 canonical 源码，独立生成输出与 5174 端口，不占 5188/5189；CI 专步与 `test-results/work-order-categories/` 归档。

本片没有生产数据读取或业务写入，不证明真实后端分类结果、已完成工单自然发现、原生设备运行或商业视觉验收。R2 使用固定源码作为本次业务设计依据，未追加线上登录或保存客户截图。实际 App 截图仅使用合成数据；五标签不挤压既有卡片及搜索控件。

## 验证记录

- 首轮定向 37/37；初版默认 Mock H5 2/2。
- 正向分类扩展至 375/430：4/4 H5，通过五分类与搜索/详情返回。
- 联合定向 62/62（含 Mock 对齐 16 项），通过。
- 首轮门禁发现新增字面字号超过样式债务限额，已改用共享 token，样式门禁通过；未放宽基线。
- 第二轮全量 3480/3481，唯一失败是旧 no-tabs 产品断言。按本次明确设计决定更新后，该测试 9/9 通过；原失败日志保留，没有删除权限或计数断言。
- 独立审查发现两项 P2：分类切换后旧接单预检迟到会重新弹确认、换身份后输入框保留旧搜索。实际页面脚本先复现 4 FAIL/1 PASS，再补分类/身份/卸载令牌和搜索草稿同步，扩展回归 8/8 PASS；另一次初修误判 Vue 立即 watcher 的空 previous 数组，由详情返回保留搜索测试发现后修正，原失败保留。
- 独立复审确认两项关闭，6 文件 100/100，未发现新增阻断。
- a7fe454 基线、历史跟进冻结后的当前联合工作树 `VITE_XLINK_ENVIRONMENT=test pnpm run verify` 通过：270 文件、3496 测试；修补后 MP-WEIXIN 与 App 编译及现有产物检查再次通过，未启动原生设备。
- 与新增 CI 步骤同参数的最终专用 H5 4/4，通过；已目检 375/430 合成截图，分类栏无裁切，原搜索和卡片仍保留。产物仅作为功能/布局证据，不等于商业视觉签字。
- 以上保留当时工作树证据；历史跟进切片已单独冻结并经审查，最终提交树仍需精确 SHA CI，不将本片结果等同所有切片最终验收。
