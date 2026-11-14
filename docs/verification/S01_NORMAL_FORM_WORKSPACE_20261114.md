# S01 普通动态表单与工作台入口收口（2026-11-14）

本批把已存在的普通 R1 FormDef/记录控制器接入共享商业呈现，修复详情页挂载编辑器的问题；不新增保存协议、字段能力或真实写权限。保留 main 上 `a5a64cc8` 的报价输入修复。

## 实际行为

- 工单详情保留信息、任务入口和历史记录。当前表单的读取、填写和保存只在 Action Workspace 中出现。
- 普通 `interact_with_form` 的 enabled / disabled_read_only 节点可使用既有 normal reader；enabled `set_appointment` 保留原预约加载分流。普通预约的专有新建流程及完整六字段 Repeat 改约资格没有放宽。
- `AppWorkOrderSummary` 统一预约、勘查、报价及订单管理的摘要。仅呈现真实客户、可选工单编号和地址，不推断“勘查中/报价中”，不使用内部 ID 补造工单号。
- 普通非预约表单沿用 FormDef 顺序和行身份。仅相邻的数值行并排；显式分组不会越过隐藏行或把后续同名组移动到前面。数值、备注及媒体仍为原共享控件。
- 保存、保存并完成及完成确认移入 Shell ActionBar。原 controller 仍决定权限、校验和协议顺序。页脚回调绑定当次身份、节点、工单、reader 和快照；身份变化或保存结果不明后旧回调不能提交。
- 本机草稿、后台保存和 Workflow 完成保持独立。无完成授权时按钮禁用，不显示虚假完成结果。
- Vitest 不再读取项目根私有 `.env.local`，默认使用离线 test 环境；专门的运行环境安全用例仍显式设置环境。

## 本地验证

| 验证 | 结果 |
| --- | --- |
| 标准 `pnpm run verify`（边界、治理、映射索引、类型与完整 Vitest） | 357 文件、6,669 项通过 |
| S01 普通真实 H5 | 4 项通过：430×932、390×844、375×667；保存结果不明后刷新、重新登录、重新读取仍不可重放 |
| 草稿身份与不确定结果专项 | 9 项通过：用户/角色变化、失败回读、完整浏览器重启、提交前栅栏失败、清理失败 |
| Q01 与既有预约补充回归 | 3 项通过：统一摘要断言、部位取消/确认、暂不上门保留既有 datetime |
| normal-action-workspace | 5 项通过：保存、草稿返回恢复、身份撤销、排队存储、存储失败 |
| normal-appointment-experience | 2 项通过：六字段专有改约、取消/确认/返回检查、同 ID 保存、重进与权限撤销 |
| normal-r1-file-upload | 1 项通过：真实选图、浏览器 multipart、既有本机接收器、保存及 HTTPS 引用回读；无远端上传 |
| dev-mock-dynamic-form-workspace | 5 项通过：Special/Repeat 入口、草稿队列、存储失败、清理失败、冷刷新保护 |
| S2 真实 App review sheet | 3 项通过；375×667 / 390×844 共 50 帧、2 张总览；另含 430×932 媒体状态 |
| `pnpm run check:s2-ux-sheet` | 通过 |
| H5 / MP-WEIXIN / App 构建 | 均通过；未启动微信工具或原生模拟器 |

Q01 旧视觉断言已对齐 Owner 的共享摘要要求，其余报价控件断言与 Golden 保留。S2 用例按当前必填报价资料选择“否”并等待本机保存，再进入目录；工单搜索复用现有辅助等待最新、唯一且可点击的结果，避免点击刷新中的旧卡片。没有更改业务校验来适配测试。

新增 S01 回归已加入 `Validate Main H5 UX` 的 draft-lifecycle job。GitHub CI 必须核验本报告所属提交的精确 SHA；本地通过不代替远端结果。

## 正常本机入口与前后截图

实际 `pnpm dev:h5` → 现有本机代理 → 共享 Java。通过普通验证码登录、角色工单列表、详情任务按钮进入表单，没有测试页面、伪造 HTTP 响应或直达表单路由。

前后使用同一合成工单 `6290198286949567038`、Repeat 节点 `7196044319260887733`：1 条既存记录、2 个已配置字段。仅查看，不做业务保存/上传/Workflow；业务集合差分为空。普通登录仅更新账户 updateTime；短时本机合成 OTP 使用 NX/180 秒，并精确清理本次值。

本地证据（不入 Git）：

- `test-results/s01/normal-before.json`、`normal-after.json`：普通入口与本机集合审计。
- `.review/S01-真实App/before-r1-configured-fields.png` → `after-r1-configured-fields.png`：同记录，从细小左右表格改为清晰标签/值、长文左对齐及可见页脚。
- `.review/S01-真实App/after-r1-current-detail.png`：详情仅保留任务入口。
- `.review/S01-真实App/after-mock-empty.png`、`after-mock-filled.png`、`after-mock-uncertain.png`：实际 App 的合成协议交互状态，包含直接数值填写与失败保护。
- `.review/m1-s2/generated/`：两宽度真实 App 截图与总览；报告在 `test-results/s2-ux-review/`。
- `test-results/s01/`：本轮测试及构建日志。登录辅助与凭据均未提交。

## 验收边界

S01 原始批准图片目前未取得。本轮依据已批准规范和实际 App 前后对照检查字体、留白、字段顺序、长文、地址换行及页脚可达；不能声称完成原图像素对照或 `COMMERCIAL_UI_ACCEPTED`。商业视觉仍由 Owner 审核。

本地合成与 DEV Mock 通过不代表生产持久化或授权通过。Production/Beta 业务写入、上传、签约、PDF、消息和 Workflow 命令保持 Issue #201 HOLD。未发布、未部署。
