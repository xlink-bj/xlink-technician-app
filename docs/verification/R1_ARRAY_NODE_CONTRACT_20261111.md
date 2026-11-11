# R1 Checkbox / multiple Select / Cascade：正常节点契约盘点

验证基线：`34102c11429d233ac9230e15f765c2098ca70cc1`，2026-11-11。本片仅测试与说明，不新增控件、写权限或表单业务 profile。下列合成字段和选项不是生产配置。旧 Stage2C、Radio、canonical part/height 的通过历史不计成本片新成果。

## 固定来源

- legacy `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` 的 [extForm.vue](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/extForm/extForm.vue)：201–225 Select、227起 Cascade、345–371 Checkbox；1693–1703区分 Cascade 与普通 Code provider。1808–1819只对列出的file/area/scan/addItem类型或`extField.multiple`检查空数组，不是所有Checkbox/Cascade的通用必填数组规则。2344–2350保留普通change事件值；Cascade完成事件另见2547–2556，保存选项路径。Select的2467–2484/2520–2534是单值action-sheet路径，不能当作multiple Select执行证据。2330–2336另有 `frontEndConfig.multiple` 的 Cascade formatter；不能仅据布尔值推定其多路径 wire。消费原文 Git blob `627d8cead86f03494e0269d6fd9014c7c60e266f`，SHA256 `f7d83565353b3c9ed6f3da2b7359d10a271ba633f6132c629dbf2862ec588cd8`。
- backend `5fc008d32e771205260f120621c1c4fc62d0824e`：[ExtField.java](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/entity/biz/ExtField.java)15–35/51声明 type/valueOption/preset/multiple/EXTS；不是授权证明。[ExtFormServiceImpl.java](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/biz/ExtFormServiceImpl.java)123–132只转顶层Date、263–268经Survey DTO、321全Map保存；未知 typed root 不能按UI类型推定持久化。
- 仓库保留 `contracts/synthetic/r1-current-formdef-59-structure.json`（SHA256 `d5bf5e3ada674ab67e16966e1b7776f35cc2183d7a7b401c517e50ffc7e4773c`）是脱敏合成结构，非生产定义。此具体文件有2个单Select、1个单路径Cascade，**没有 Checkbox 或 multiple Select**，缺失 provider 内容不能填造。其他 legacy 类型分支存在不等于原59均有或已验。

## 分层矩阵

| 类型 | R1 / runtime / UI | 正常 source-backed 读取 | 正常 create/edit | 真后台状态 |
| --- | --- | --- | --- | --- |
| Checkbox | Checkbox group事件为数组；runtime接受标量元素数组，local patch拒绝重复；既有多选控件可表达 | 本片真实 normal reader 绑定精确 Code 请求、tenant/字段/definition；顺序原样，root和EXTS可读；标量读显示仍缺形状提示 | repeat save的普通schema及直接调用的forms edit helper均拒绝数组类型；已测read/save流程0命令，不含complete或edit-provider验证 | 本片未运行Java/Mongo；Stage2C Mock不代替 |
| Select multiple | runtime按multiple选择数组契约，单Select仍标量；普通local编辑还有显式multiple限制 | 精确Code provider；数组显示标签不授予写权；标量也会显示标签，修订新增characterization已在本轮项目执行通过 | repeat的multiple拒绝，直接forms edit helper的multiple拒绝；没有通用正常数组create/edit放行 | 未验通用源配置持久化或clear |
| Cascade single path | 独立树provider；runtime拒绝兄弟拼接但允许祖先前缀；当前selector两层/递归叶布局的输出不能建立通用存储终点规则 | 正常reader逐父级解释标签，祖先前缀也显示标签；到叶要求尚未由通用R1合同确定 | 本片合成非part字段的普通save仍拒绝；已有part窄契约不泛化成本片 | 本片未运行；历史part实证仅限其自身 |
| Cascade multiple | legacy有单独formatter分支；其精确多路径表示尚未由本片核全 | 普通primitive数组读到不等于多路径语义已验 | 普通save在数组schema处拒绝，未据此证明独立的层级校验 | UNKNOWN / NOT_RUN |

核心实现位置：`r1-scoped-field-options.ts`33–114绑定/解析provider；`r1-record-read-fields.ts`24–49显示；`r1-repeat-form.ts`40–63及99–125普通写schema；`r1-forms-edit-values.ts`12–25仅scalar编辑。测试直接导入真实normal reader/action provider、read projection、repeat/edit helper及runtime；scoped options由reader间接调用。`r1-local-form-fields.ts`26–38/84–115和Vue selector仅作源码复核，不是本测试直接执行或节点写授权证据。

## 原候选已执行证据与修订范围

原32例遍历合成改名字段，覆盖两个preset、Code/Cascade分流、有序路径、root/EXTS冲突保全、missing/null/empty、未知metadata、grant下数组save拒绝、multiple Cascade save关闭、错provider/tenant、迟到角色撤销及fresh metadata/clear撤销旧lease。hidden/readonly/未知条件仅检查已不支持数组字段的projection，没有调用save，不能证明这些写guard分别起效。forms edit只直接调用helper，未运行edit-provider事务。

本次修订对save用例增加精确schema错误、v1 grant、实际handler、成功fresh reader调用及provider/record重读断言；不再接受任意throw作为schema拒绝证据。重复、错误形状和31元素输入均在更早的数组schema处拒绝，不是独立duplicate/length校验证明。新增1例multiple Select标量读显示characterization直接走normal reader，记录runtime拒绝标量而display仍给标签的差异；不是认可该形状。修订后33个用例已在canonical项目定向执行通过；这是独立实跑结果，不由原32 PASS转记。

零upsert/updateExts/Process/upload/token仅限定已测read/save调用及对应命令观察口。测试没有调用`complete()`；grant包含complete不代表已验证它的拒绝，实际complete路径也独立于save的数组normalization。两条旧RED在预期失败断言后未执行其零命令断言，不额外将这一步记为通过。旧Stage2C断言没有拷作新成果。

有效Code回执严格只有codeId/eleid/options；请求绑定tenant。首轮新fixture错误加tenant回执、错误构造create-only v1 grant，导致14 FAIL/10 PASS；修正测试fixture后24 PASS。扩展批次曾错误用旧snapshot重取actions，fresh read后返回null，3 FAIL/29 PASS；改为同一page actions按真实lease续期后再验。原失败日志保留，不冒充产品修复RED。

选填undefined/null/[]在当前低层submission中省略，required均拒绝；这是本runtime行为，不宣称固定legacy对所有数组类型都有同一规则，也不是服务端删除/清空证据。normal read私有original仍区分own slot与absence。mapper偏好EXTS时保留冲突root，不能拿display values作ACK或原文完整性证明。normal数组save schema尚关闭，所以没有array edit清除、保存ACK或后验成功的声明。

## 已确认形状差异与待定Cascade合同

原隔离探针实跑2 FAIL、24 skipped，日志与探针原文保持不变。两条失败的证据强度不同：

1. Code已核时，Checkbox存储标量`'a'`仍显示已核标签，缺数组形状未核实提示。
2. Cascade祖先前缀`['north']`仍显示祖先标签，runtime也允许此前缀。行为已确认，但旧探针要求“选项未核实”的期望属于待定终点合同，不能直接判作通用R1或生产缺陷。当前UI输出叶路径不等于所有已存值必须到叶。

独立纯函数复核另确认multiple Select同Checkbox的标量形状差异；修订中的新增normal-reader characterization已在本轮项目实跑通过。实际形状提示问题定位于`r1-record-read-fields.ts:24–49`，本片不改formatter。Cascade仅记录非叶显示/合同边界，不添加叶限制或宣称runtime修复任务。原两条RED、初轮fixture失败及扩展lease失败历史全部保留，不混入通过数。这些证据**不是正常数组写权限漏洞**，也不开放数组writer。

重复与顺序也应分层：reader不排序/去重原值；lower runtime不单独保证唯一性，源码中的local/special validator另有各自的重复/30元素规则，不是本片save用例独立验证的guard。copy未由新增模块执行；stale lease只覆盖列出的clear/metadata情形。不能借任一层局部通过推定完整normal写协议。

## 本片边界与下一步

原候选focused与相关回归结果保持历史。reviewer最初在独立目录只做TS语法/33用例登记、补丁复现及8项纯函数检查，不能当33 PASS。本轮Cloud已在canonical的34102c1＋另片冻结read-compat11组合树精确应用两文件delta：修订模块实际33 PASS，直接相关组合4文件170 PASS（含本模块），typecheck、boundary、dependency及diff均exit0。未改产品源码，read-compat11逐字保全；不重跑全量、H5或构建。没有新正常浏览器执行、真实登录、seed、provider外查、上传或业务请求。

正常数组写入尚缺明确的源配置schema与operation授权、原文槽/typed codec、路径终点与duplicate策略、选填清除的持久语义、fresh字段与provider固定、array ACK语义比较与不确定恢复等一体契约。继续私有复核，不能将“拒绝测试通过”写成已集成，更不代表full59、原生、生产或BSON无损/CAS。


原候选冻结实跑（修订前）：新增模块32 PASS；首组实际7文件193 PASS，另组三份forms回归157 PASS，合计两条命令10个不同文件350项（其中新增32，其余318为既有回归），均exit0。首组命令有一个不存在的旧文件过滤参数，未把它计入执行文件数；第二组使用实际文件名补齐。typecheck25.31秒、boundary、dependency及diff检查均exit0。旧两条RED原样保留，其中Cascade按上文限定为待定合同探针，不计通过。以上历史结果不覆盖本次修订；未运行新H5、全量或构建，不用此前5033/125冒充本片执行。


修订首轮项目执行为2 FAIL/168 PASS：加强断言误要求Cascade映射层显式保留multiple:false，而固定form.ts:229/290仅在true时输出multiple属性。仅测试纠正为raw必须false且mapped确实没有multiple属性，true时仍必须显式true；未放宽fresh load、错误来源、权限或命令断言。首轮原日志保留。此修订版33/170是当前结果，不与修订前32/350或旧RED叠加，亦不证明complete()、服务端clear、duplicate/size深层guard或通用Cascade到叶要求。
