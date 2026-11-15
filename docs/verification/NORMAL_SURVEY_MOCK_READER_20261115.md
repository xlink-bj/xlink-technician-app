# 普通 Survey Mock 只读接线（2026-11-15）

## 结果

既有 DEV Mock 的 19017 样例现可从正常工单列表、详情进入普通表单工作台，使用原 `createNormalNodeFormsReader` 读取已保存 Survey。读取包含 FormDef/ExtField、级联 provider、完整 forms 引用、精确 FormData 查询以及工单/租户/节点/流程归属验证。返回、刷新后重新读取、数值 `0` 和渗漏原因标签均已验证。

范围仅为现有 `VITE_XLINK_R1_MP_UX_FIXTURES` 合成数据配置的普通只读入口。没有扩展 019 预览白名单、接通保存/完成命令、启用生产 API 或增加第四套环境；020/021 的原有 Mock CRUD 协议保持原通道。

## 源证据及判断修正

此前仅确认旧 AGENTS 指定目录失效就将 R1 原始来源视为不可用，调查不充分。实际可只读访问：

- `xlink-app/business_jishi`，仓库提交 `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`。`subpackages2/inspectionAppointment/inspectionAppointment.vue:5540` 按 FormDef 读取 ExtField；同文件 `6059` 起区分 forms/repeat 的 Process 参数。
- `xlink-cloud-backend`，提交 `5fc008d32e771205260f120621c1c4fc62d0824e`。`Ext.java:20` 明确 type=0 动态表、type=1 实体扩展；`ExtFormServiceImpl.java:156` 的 Survey 转换及查询分支确认该领域使用 Survey 实体与 Ext 元数据，而不是页面标题推断。
- 仓库既有 `tests/fixtures/survey-59-read-reference.json`、`tests/support/normal-survey-cause-read-fixture.ts` 已有 type=1/colName=survey 的完整只读输入与正常 reader 验证。新数据复用其中四项字段的原类型、条件及 provider 形状。

19017 和它的 FormDef ID 本来都是合成身份，不可能要求与某一生产 FormDef 同号。正确边界是：使用已证实的 R1 模型构造合法合成元数据，由普通 reader 检验关联；生产当前配置继续需要独立实测。本轮未执行生产登录或元数据请求，也未扩大生产只读白名单；R1 本地源均未修改。

## 最小实现

- `normal-survey-read.ts` 提供 R1 形状的合成 Ext(type=1)/四字段配置、当前节点完整 EXTS/formList、精确 FormData 与级联响应。字段由配置决定，普通 UI 没有固定写死这四项。配置属于独立合成 FormDef，不替换 019 的历史 61 字段镜像。
- 在既有 opt-in Mock 列表中加入该已存在的 19017 工单，保持无此配置时原列表不变。维修部位使用既有脱敏选项 ID，渗漏原因复用原 provider 的记录与分组，不追加全局选项。
- 普通 reader 的离线入口严格要求 DEV、原 H5 E2E 与 R1 fixture 配置、合成租户、不可路由 API 地址、localhost、禁止写入和精确合成用户/角色；同时关闭真实网络 fallback。现有租户/节点/角色列表、FormDef、FormData、完整性及生命周期检查全部复用。
- 019 本地预览优先保持原路径，020/021 仍由原 controller 承载。没有修改云端的工作台、确认页、签约页和导航适配器。
- reader 没有获得可写字段；编辑、新建、上传、Process 与保存按钮未开放。无权限、外节点、外租户、外字段定义、外记录归属仍拒绝；身份和列表资格撤销会失效旧快照。

## 验证

- 类型检查、UI governance；普通 reader、归属验证、读取目标、渗漏原因与现有 Action/Shell 边界共 225 项目标单测通过。
- 定向真实 App 430×932 H5：020 forms、021 repeat、019 报价至 Mock Order、26019 正常详情预览、19017 普通 reader、共享字体六条通过。
- 19017 用例覆盖正常列表入口、普通 reader 回读、保留数值 0、原因 provider 标签、刷新、返回重进、错误节点 URL 阻断；没有业务 HTTP、真实上传或签署。
- 新用例接入现有 Stage 1B/2A CI 命令，避免仅在默认数据配置下跳过而宣称 CI 已覆盖。
- 主审阅图为 `.review/新版统一查看-20261115/430x932/详情-19017-现场勘察节点.png` 与 `03h-勘查-普通Forms只读记录.png`。截图不提交或外传。

剩余：这批没有实现 19017 的新增、编辑、删除、媒体写入或 forms 保存/完成；这些需要对应的既有写入协议与单独授权范围。普通只读接线不表示生产 Survey 当前 FormDef 或生产持久化已验收。Issue #201 HOLD 不变。
