# Survey 59 行：Special Mock 字段行与值键校验（2026-11-09）

基线：`c71138508fafc84081cf9fc6581d2b3f5a8e9bda`。本片补通用 Special Mock 字段投影与提交校验，不改变真实写授权、后台、UI/UX 或生产采集范围。

## 具体实现

- 原字段编辑器把 FormDef 行数和值键数量都限制为 50，59 行会投影为空；重复 valueKey 也无法选择。现在保留至多 200 个不同 fieldId 的字段行，与现有 `projectR1PresetStorage` 元数据边界一致。实际输入/输出仍最多 50 个业务键，不能把字段页规模当作写权限。
- 只允许规则和本地类型/provider 已知、且当前恰好一行可见的重复键组。每行身份、required、readonly、选项和条件各自保留，不合并或靠顺序选第一行。未知条件/配置、未解析选项、重叠可见行、当前只读行和 presentation-only 兄弟继续阻断。
- 静态 showList/mobileDetailHidden 排除会让运行时状态评估提前返回，因此重复组额外检查原始行配置与条件语法，不能把被隐藏的未知配置视为已验证。
- 完整输入先统一评估，生成规范化字段后再核对每行可见/可填状态和 required。数字转换、字符串 trim 若改变有效行或权限，拒绝本次提交。必填文字规范化为空也拒绝。
- 修补已有 50 键草稿新增第 51 键未被拦截的边界；50 键更新与删除仍可用。重复 fieldId、超过 200 行、未上传媒体/无效 file wire 和隐藏输入继续拒绝。
- 当前手机排除与 presentation-only 标志传入共享运行时，不能转换成普通可编辑字段。

## 验证层级

新增 `tests/engineering/survey-59-mock-fields.test.ts` 共 35 个用例，覆盖：
- 59 行合成定义、重复键唯一条件行、正反行序、当前行必填与 0 值；
- 未知配置/条件/provider、重叠/只读/展示行、静态排除与 rate 多选反例；
- 归一化后 readonly/required/type/file 条件切换、字符串 trim、空格必填；
- 200 行及 50 值键边界、file 原始 wire；
- 实际验证器 → `r1SpecialFormUpsert` → JSON 合成持久化夹具 → `formData` 回读，核对根部/EXTS、零值和未知原文保留；
- 仓库已留存 59 行结构经实际 mapper 后，两个 length、两个 width 的行身份保留，按已知条件选择；part provider 仍未解析，所以整份捕获定义提交依然拒绝。

云端审查环境没有完整仓库依赖。本轮使用 Node 24 的 TypeScript 去类型能力，直接执行实际源码及同一测试函数体，断言适配器保留严格标量比较、对象按枚举内容比较。结果：**基线 21 PASS / 14 FAIL，候选 35 PASS / 0 FAIL**。独立审查发现并复现的隐藏未知规则和归一化权限切换问题均补测试修复。

这是源码执行回归，不是 Vitest、TypeScript typecheck、真实 App H5 或真实后台测试。完整工程、H5 及精确新 SHA CI 待在完整开发环境执行，不能沿用基线 CI 冒充本片通过。

## 保持的边界

- 捕获 59 行不等于当前有效写授权。未知 calculateConfig、真实 provider、当前节点 fill/readonly 和真实全量保存仍未补证。
- 常规真实 forms/repeat 的标量/50 行/授权守卫未放宽；本地队列定义加载及批量保存的原边界也未改。本片仅为通用 Mock 校验器和字段编辑器补能力，未将完整捕获表单接入默认可写业务入口。
- 合成持久化夹具不执行 HTTP、Java/Mongo、上传、Workflow Process 或外部副作用；真实持久化需另行获准的本地链路验证。
- 不读取或改动 Mac 原有未提交 QA；不重试被拒的生产采集，不改 Production/Beta HOLD，不部署或发版。

## 完整 Cloud 工程与重复 file 调用方收口

本地验证基线仍为 `c71138508fafc84081cf9fc6581d2b3f5a8e9bda`，不连接真实后台。原四文件候选首次实际 Vitest 35/35；组合203/203，`verify:full` 269文件3743项、typecheck、H5构建通过。Stage2B正常App1项、普通file队列3项、Survey59只读4项通过；未启专用开关4项明确SKIP，不算执行通过。

后续在实际 Special Mock controller 复现 forms/repeat × 正反行序共4个失败：字段校验正确选择有效file行，但上传来源循环仍检查隐藏file兄弟，保存错误拒绝。改为使用同一规范化字段投影的唯一有效file行；上传仍须完整user/workOrder/node/FormDef/FormData/fieldId/valueKey作用域及uploaded状态。隐藏失败任务仍阻止保存，必须主动重试/移除，不过滤隐藏任务绕过。

编辑保留附件必须由精确原记录及其EXTS优先条件，证明旧/新唯一有效file行fieldId相同；切换条件不能凭共享valueKey转移旧附件权限。新有效行有独立合法上传时可替换。原始记录/未知字段仍由既有完整wire保留；未知规则、只读与重叠不开放。

相邻两项前端缺陷也已复现：编辑清空optional重复键时，隐藏兄弟错误阻断（controller2红）；面板先find首行导致隐藏首行遮蔽有效行，及附件仅按URL匹配任务（实际SFC方法4红）。清空现在按值键去重并要求唯一有效optional行；输入/清空选择supported行；移除在discard前核有效file行，按fieldId/valueKey/URL定位任务。相同URL的隐藏兄弟或另一值键不能被误删。

新增 `duplicate-file-fixture.ts` 只有显式合成safe/follow_up两个条件、重复file与textarea行，**不是生产59配置**。仅现有SpecialMedia开关与新的默认关闭duplicate开关同时启用才返回；正反行序分别可验。专用Playwright配置在5321环回运行真实App、全拦截外部请求，默认扫描必须SKIP。既有Mock上传为内存/本地合成结果，不执行真实文件上传。没有扩展生产权限、50实际值键/200字段行、Workflow、后台或UI设计。

新增controller测试覆盖有效行创建/精确回读/同分支编辑/跨分支拒绝与新上传、隐藏来源/伪造URL/错记录和7种scope冲突、未知/重叠/只读、隐藏失败队列重试及账号失效；SFC方法测试不冒称浏览器测试。正常430×932 H5覆盖标量输入与草稿刷新、上传队列刷新恢复、确认移除、创建保存、已有记录编辑和清空后回读。最终实际计数、命令、退出码及独立审查见本轮交付 `verification.json`；首次轻量Node报告仍按原时点保留。

完整59字段页面可编辑保存、真实provider/缺失条件/calculateConfig/节点写权、Java/Mongo、生产/Beta、日期及并发仍NOT_RUN。没有修复或宣称后台事务/CAS已成立。当前H5专用用例保存在仓库，尚未新增CI workflow步骤，精确新SHA CI本轮未触发；不以旧CI替代。未提交/推送/部署。
