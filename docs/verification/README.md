# 验证记录导航

这里包含不同日期、版本和范围的证据。以文件标明的源码、实际执行窗口及限制为准；历史候选的 HOLD、计数和未合并状态不代表当前 main。合成测试、真实隔离联调与生产只读不能互相代替。

## 当前入口

- [R1 模型、Mock等价与统一问题台账](R1_REAL_DATA_MODEL_MOCK_EQUIVALENCE_INVENTORY.md)：生产只读结构来源、当前证据范围及“历史及现有问题记录”。
- [真实本地集成对账](R1_LOCAL_REAL_INTEGRATION_EVIDENCE_20261113.md)：已消费窗口、上传证据层级及尚未覆盖项目。
- [配置表单与三模型真实集成](R1_CONFIGURED_MODEL_REAL_INTEGRATION_20261113.md)：预约Map、Survey和Order的有限真实保存、回读及保全。
- [有限动态资料与Workspace共存](FINITE_INFORMATION_WORKSPACE_REAL_COEXIST_20261114.md)：最新资料与普通Workspace的真实只读窗口。
- [工单资料HTTP生命周期](WORK_ORDER_INFORMATION_HTTP_LIFECYCLE_20261114.md)：配置/字典错误、身份换代及迟到响应的客户端合成回归。
- [签约处理人工作流身份](SIGNING_HANDLER_WORKFLOW_IDENTITY_20261114.md)：缺失实例身份时的保守拒绝、合成回归和真实待验边界。

Production/Beta业务写入、签署、上传、短信及PDF等仍遵循各自现行护栏，不因文档整理放行。本导航不新增验收或取代Owner视觉、原生及发布验收。

## 仍被门禁引用的历史正文

以下三份保留正文，仅加历史提示；对应Workflow、JSON manifest和脚本均保留：

- [DS07C8 main preflight](DS07C8_MAIN_INTEGRATION_PREFLIGHT.md)
- [M1 I7 reconciled candidate](M1_I7_RECONCILED_CANDIDATE.md)
- [M1 unified main candidate](M1_UNIFIED_MAIN_INTEGRATION_CANDIDATE.md)

## 恢复已移除的历史快照

本轮只移除没有现行源码、脚本或Workflow引用的四份过时说明：`G4_INTEGRATION_READINESS.md`、`M1_I7_INTEGRATION_CANDIDATE.md`、`G4UX_BETA_READ_PLAN.md`、`G4F_REVIEW_READINESS_UX.md`。历史JSON清单继续保留原路径作为当时的盘点记录，不能当作现行运行依赖。

完整内容可从固定提交 `00bcb43d06264837b48f0565d0729f2a4e20a9dd` 读取，无需改动工作树。例如：

```sh
git show 00bcb43d06264837b48f0565d0729f2a4e20a9dd:docs/verification/G4_INTEGRATION_READINESS.md
```

将命令最后的文件名替换为上述另三份即可。所有JSON、脚本、现行证据及统一问题台账均未因本轮清理删除；不以旧文档恢复操作覆盖当前代码或测试。
