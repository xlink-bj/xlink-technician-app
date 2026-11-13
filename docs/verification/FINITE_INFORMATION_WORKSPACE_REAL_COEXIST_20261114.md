# 有限动态资料与正常 Workspace：本地真实增量验证

## 结论

在 `95fc925cfc73a11ab42888b11dab662cb0071e93`，使用独立虚构工单、真实隔离 Java/Mongo 和正常 H5 页面，以下只读路径通过：

正常登录 → 工单列表 → 工单详情资料 → 普通 forms Workspace → 读取当前节点表单 → 返回资料。

本次节点从未保存记录，真实读取结果为“已加载 0 条 / 暂无已保存记录”。这证明新资料展示与正常 Workspace/表单元数据及候选项读取能够共存，不代表再次验证了非空记录保存、流程推进或生产接入。既有预约、Survey、Order 保存证据仍以 `R1_LOCAL_REAL_INTEGRATION_EVIDENCE_20261113.md` 为准，本次没有重放。

## 结果与边界

- App 使用真实隔离 API，Mock 关闭，全部业务写开关关闭；430×932 H5。
- 资料展示保留 root/exts 同名字段、数字 0、布尔 false 和脱敏电话；返回后 5 条可见资料与进入前一致。角色条件行在本窗口未显示，不将本次用例宣称为角色可见性验收。
- 普通 Workspace 通过真实 Java 重新核实工单/工作流/节点，读取 ext、extField 和该虚构字段配置所需的套餐候选项，返回权威空记录列表。
- 所有请求仅经过精确只读代理到隔离 Java；无浏览器响应伪造。
- 最终窗口数据库对象数 62→62，仅自有 Account 登录审计变化；业务对象及旧 A/B/C 保存基线保持不变。正常登录不称为数据库零写。
- 业务保存、上传、Process、生产访问、浏览器外网请求均为 0；页面错误为 0。
- 自有 H5、代理、Java、Redis、Mongo 全部关闭，监听释放；共享 Mongo/Redis/Java 原 PID 15937/15947/15955 保持运行，未修改。

## 实际发现及修复

详情页使用 `AppButton` 却缺少 import，DOM 产生裸 `appbutton`，未得到共享按钮的样式及语义。补齐组件 import 后实际 DOM 为 `uni-button.app-button`，并在正常入口导航中复验。仅改这一行，已独立审查并提交为上述 SHA。

聚焦测试 3 文件、150 项通过，`pnpm run typecheck` 通过。精确 SHA 的完整 CI 单独查询，不以这些定向测试代替完整 CI。

## 保留的前序尝试

1. 原资料窗口使用 5399，而正常表单只读门明确要求 5189；未修改应用安全门，另开使用允许地址的窗口。
2. 首个普通 forms 夹具复制时漏替换工单的 workflowId，应用正确拒绝关联不一致。保留失败，第三组全新虚构 ID 修正关联；未放宽身份校验。
3. 关联修正后，字段配置引用的 `biz/projPackage/query.do` 被原窗口代理拒绝。停止窗口，核对后端 `ProjPackageController.query → GoodsServiceImpl.queryWithRank` 后另立新窗口；该参数分支只有查找与内存映射，不调用保存、上传或消息。
4. 新窗口预先允许唯一套餐查询参数：`_all=1`、当前虚构 tenantId、`is:state|integer#and=1`，不带 sourceType/form，不访问其他 tenant，不使用生产地址。没有运行中扩大白名单。

## 本地证据

- `.review/finite-workspace-coexist-provider-20261114/PLAN.md`
- 同目录 `h5-result.json`、`API_LEDGER.json`、`FINAL_RESULT.json`、`workspace-loaded.png`。
- `.review/finite-workspace-coexist-forms-20261114/focused-tests.log`、`typecheck.log`。
- 前序 `finite-workspace-coexist-*` 目录保留失败及保全记录；最终状态不得覆盖前序失败为成功。

生产授权、Contacts 权限/关联缺陷及实际环境配置仍是独立接入边界，不由本次合成隔离通过推定已解决。
