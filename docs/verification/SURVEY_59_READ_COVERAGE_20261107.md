# Survey 59 字段：结构覆盖与第一批只读回显

## 证据范围

本次使用已保存的第二次有界生产只读结构捕获及其本地 Java 回读，不发新的生产请求。便携测试输入是 `tests/fixtures/survey-59-read-reference.json`：仅保留安全字段元数据，字段 ID 全部为合成值，provider 为未解析别名，无客户数据、账号、会话或写权限。

- 59 个字段行，56 个不同业务键；province、length、width 各有重复行，不能按键去重。
- showList 含移动详情 `4` 的有 40 行，其中 12 行必填。其余 19 行不应直接混入手机详情。
- 控件：file 24、text 10、digit 9、gap 5、phone 2、select 2，以及 aLink、area、datetime、cascade、radio、data、textarea 各 1。
- 31 行带条件，28 行条件结构完整，3 行部分内容未保留（gap0、height、gap1）。全部 calculateConfig 的实际内容、当前节点有效写权限仍未知。
- 23 行 preset=0。typed Survey 的扩展字段必须区分 exts 与实体顶层；把全部值平铺到顶层会丢失非实体属性。已有 ID 的 typed 更新是整对象替换，不是 patch。
- 后续读取的 Order 11/4 parts 树不能直接绑定到 Survey 的 cascade-provider 别名；条件中的路径 `['6']` 也不在该树中。未知选项不能补造。

以上是 SOURCE / 保存的 PROD_READ 结构事实，不是完整生产 UI 或生产可写等价证明。参考 fixture 的安全 frontEndConfig 子集不代表完整配置；未知内容在 evidence 侧车中保留未知状态。

## 第一批实现

复用现有表单 mapper、移动适用规则和条件运行时，为正常表单的已保存记录增加纯读取投影：

1. 仅显示适用当前手机详情、且满足该条记录条件的行。
2. squareMeter 与 planeArea 按完整 part 路径分别显示，不做前缀匹配；记录身份条件使用已核验记录元数据，不接受 values 中伪造的 `_id`。
3. 未知条件只显示说明，不泄露其值；缺少 file/data 读取 codec 时明确显示暂不支持，不误称“未保存”。不加载图片、链接或 HTML。
4. 级联标签只沿实际 options 的唯一父子路径解释；没有已核实选项时显示原始编码及“选项未核实”，不借用其他业务字典。
5. 仅静态排除的手机字段跳过 provider 读取；条件字段仍读取 provider，失败仍拒绝本次完整读取。

这不是编辑授权。原身份/租户/节点/记录关联校验、默认关闭的本地能力、生产写守卫、50 字段保存上限和所有固定 QA 范围均不变。59 行仍不能通过正常保存验证。

## 后续批次与前置

| 批次 | 可复用能力 / 工作 | 尚缺的证据或边界 |
| --- | --- | --- |
| A，只读展示 | 本次投影、真实普通页面回归、59 行 mapper/SFC 离线回归 | 实际普通页面已有记录仅两个标量字段，不称完整 59 字段实机通过 |
| B，provider / 权限 | 现有 Code/Cascade provider 及 runtime 节点 fill/readonly 判定 | 必须建立 Survey 自身 provider 身份、完整选项及有效节点权限，不能用 operationType=1 推断可写 |
| C，typed 数据保存 | 复用现有通用 FormData / Survey codec，测试 preset 顶层与 exts、重复行和隐藏值 | 完整替换的元数据保全、日期类型/精度、并发版本仍需逐项合同；不把小 schema 成功推广到 59 行 |
| D，媒体与特殊控件 | 复用已有通用媒体队列及受控 Survey 能力，先纯模拟失败/恢复 | 实际上传、surveyTool、leakageCause data 等须独立证据与明确本地边界，不启用生产上传 |
| E，自然页面完整验收 | 新独立合成样本，正常页面保存→回读→显式完成 | B–D 证据不足时保持不可写；不得覆盖旧两字段工单或把未知配置填空来凑通过 |

完整本地 H5 是当前优先级；真机、生产写入、客户签约及支付不在本批范围。
