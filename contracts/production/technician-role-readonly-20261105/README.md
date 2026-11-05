# 有界生产只读证据 / 合成关联投影

这些文件不是原始生产响应、完整生产模型、凭据包或真实 API fixture。

- `context4.json`：目标第 4 个报价上下文的发现尝试。69 次详情请求，68 次成功，第 69 次失败即停止、未重试；未取得该上下文字段。保留成功详情中的合成节点关系。
- `context1.json`：独立的首个已证实上下文补证。21 个合法详情、32 条 Order 配置、当前 9 有效字段及精确 1 Code / 1 Cascade 映射。不是重放此前失败详情。
- `effective-order-wire.json`：从上述脱敏配置生成的 **9 字段有效子集**协议样例；原租户字段页是 32 条。不是原始完整响应。`syntheticOnly/notForProductionRequests` 必须保持为 true。
- `order-contract.json`：原授权边界内 type=1 首页、合同固定过滤首页的重新核验。合成图只表示本捕获中被实际核对的身份关联；不是金额、完整状态库存或真实转换提交证明。
- `coverage-f01-f21.json`：21 域逐项分类。15 域有既有或本轮生产有界响应观察（含空 SKU 页）；另 6 域未取得当前字段模型/记录/资格实测。**15/21 不表示 15 个完整模型已收齐**。

## 隐私和身份

机器键只保留受限非数字 ASCII 配置键；通用标签仅精确白名单保留。当前活动 9 字段机器键均保留，其他未知标签使用“配置字段/选项/节点”合成名。生产业务 ID、服务/客户类型业务值、选项字面及标签、按钮目的地/payload、客户字段值、价格、凭据/session 均未保存。

同一次捕获使用稳定合成映射保留 WorkOrder→node→workflow/FormDef、field→provider→option 和条件引用。**跨捕获合成 ID 不可直接 join**；相同序号不是相同生产身份，不能拿它调用真实接口。原始身份和值已丢弃，不能据此逐字复核生产选项/标签，不能验证所有隐式数值转换/substring 条件。

`UNKNOWN` 生命周期包含投影未保留的 closed/其他状态；`OTHER_OR_UNRESOLVED` 合并未保留/未识别 nodeType，不能推断后台未提供该字段。Survey 只认明确语义证据，不能按名称、repeat 类型或历史 61 字段认定。

## Cloud 可以继续的工作

无需本机路径/凭据，可用固定仓库来源、类型/条件描述、合成响应和 existing runtime 编写 fixture/分类/关联/异常测试。当前有效子集可验证 7 个普通控件的类型/provider 分类；partDescription/clientname/maintainAreaNum 各有 1 个未保留额外配置键，完整规则等价仍待审查，不能自动启用。button 和无区域 provider 的 area 必须继续阻断。非活动字段 provider 缺席是未读取，不是空枚举。

这些数据**不会自动接入 App**，不能把合成审计标签直接作为商业界面设计。真实部位字段与当前分组模型的整合、全量 tenant schema、实际标签、按钮动作/目的地、全国区域/街道仍有独立证据门槛。

## 明确阻断和授权边界

- Production `biz/extField/query` 按当前 node 的 `extId` 读取字段，目前不在现有允许路径；本轮不复制 Beta `_all`，字段读取为 NOT_RUN，而非服务器已拒绝。
- type=0 Order、Order 后续页、任意 Order ID、Contract 扩页/扩状态发现没有在本轮执行。通用 `Order.queryById` 仍关闭。
- 所有业务写入、上传、Workflow、签约/PDF/消息/同步、部署和 Cloud 生产请求均未授权。正常读取成功不证明写权限、失败补偿或因果转换。

固定源：`xlink-bj/xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`、`xlink-bj/xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e`。这只是参考源码版本；部署中的服务版本未独立验证。每份捕获附审计代码 SHA-256，完整范围/请求统计见本轮补证报告。
