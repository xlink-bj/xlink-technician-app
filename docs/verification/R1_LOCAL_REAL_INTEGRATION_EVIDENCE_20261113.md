# 本地真实集成实证对账（2026-11-13）

本表补正早期台账，区分固定 R1 源码、合成 Mock、隔离 Java、合成存储和 Production。历史对象及一次性回执已消费，不因后续验证重放，也不把后来的成功改写旧失败。

| 能力 | 已有实际证据 | 仍未覆盖 |
| --- | --- | --- |
| 普通正式 Order 创建 | 11月7日正常H5，startWorkflow/order与basic/order/upsert各1次，返回type1 Order；同会话、新登录及冷回读通过。正常报价器源命令/编排文件在历史13561f6c与dd73逐字一致 | 客户确认、签署、生产写入、全目录/折扣/SKU；不能称type0报价创建通过 |
| Survey create＋显式Process | 11月7日隔离真实Java与正常H5封存；创建、明确完成及真实placeOrder后继有回执 | 生产59字段全配置、任意脚本/节点、真实签署；不能泛称所有Survey完成未验 |
| type0 bizSelect已有记录编辑 | 11月13日全新独立C fixture：正常H5→真实Java provider→一次编辑保存→完整ACK→权威回读，ID/Label一致；旧A/B、节点、provider、定义保全 | Production provider/技师实际节点授权、所有bizSelect类型。A/B原不完整审计字段导致的未确认结果保留，不重放 |
| Java上传token | 11月13日共享隔离Java普通登录，真实upToken响应、隔离签名校验，无callback；单独API窗口和后续正常App窗口各1次新token，两个窗口分开计账 | 真实Qiniu、真实Java multipart上传；运行中的multipart路径为LOCAL_DISABLED |
| 实际App图片队列接真实token | 正常App原createUniUploadPort与私有队列；原token/key进入127.0.0.1:5461合成存储，1张全新PNG真实落盘/HTTP回读哈希一致；上传后仅取消，正常重进保持原两图，0表单保存，0意外网络/页面错误 | 工单/节点/记录仍为明确合成来源，未证明真实Java节点的媒体归属或保存；下载HTTPS为测试façade，非真实TLS/CDN |
| 当前节点及首次签约入口条件 | [正常App只读条件核验](R1_NORMAL_SIGNING_READONLY_ELIGIBILITY_20261113.md)模块与H5组装，mayDispatch始终false | 本轮真实Java资格读、完整签署资料、后台签署权限及全部签署/消息/PDF命令 |
| 独立type0 creatQuotation | 固定R1源码、当前运行字节码及24项前端禁发测试已核对；当前正式port无实时创建适配，普通工单主链不依赖此命令 | 工具箱报价器type0/entry=quote的当前角色菜单叶子、专门授权适配及正常App真实创建；不以裸Java脚本冒充App集成 |

## 历史来源和版本

`.review/normal-quotation-order-20261107/FINAL_REPORT.md` 封存正式Order6394054458844070688、总价2160、独立子Workflow394420588273515699。更早natural-demo回执保存Order6113751323737014666，同样为type1；名称中的quotation不改变实际接口。执行源清单记录基线 `13561f6cffeee2d98b6b51f9c49a1cc39983e604` 加清单中所列工作区文件，不能只拿HEAD当完整执行树。`quotation-order-commands.ts` 与 `order-submission.ts` 在该Git基线和dd73的字节均相同。当前CI/新测试属于后续版本，旧实证不自动推广为全域LIVE_PASS。

Survey来源为 `.review/normal-survey-quotation-20261107/FINAL_REPORT.md` 及其SOURCE_FREEZE/FINAL_RESULT；它和首次图片Survey保存是不同切片。后者[历史报告](SURVEY_FIRST_MEDIA_CREATE_20261111.md)明确记载56次真实Java响应＋2次合成token响应及2次loopback上传，不构成真实Java token或Qiniu上传通过。

11月13日C记录来源 `.review/bizselect-provider-real-20261113/C_FINAL_RESULT.json`、`H5_PROXY_LEDGER.json`，使用独立隔离数据库/服务；不与共享18080的已消费Survey、预约和Order保存预算混算。

## 图片窗口的精确层级

`.review/java-image-upload-real-20261113/RESULT.json`：真实Java token1次、合成存储写1次、业务命令0。随后 `.review/java-token-ui-upload-real-20261113/RESULT.json`：新窗口、新PNG、新对象3914924511530142383.png，真实Java登录/token各1次、合成存储写1次，原token未经改写，正常App上传后取消与重进通过。新窗口未重放前一个对象3068098961517727585.png。

两个窗口都独立比较Mongo原始BSON摘要，仅正常登录的account变化，其他业务集合不变；共享Java/Mongo/Redis PID及guard/config/class哈希不变，没有重启共享服务。5461及自有H5编译进程结束后关闭。未把token、cookie、OTP、私有窗口凭据写入证据；生成H5测试bundle明确在私密扫描范围之外，未提交。

## 独立报价的后续边界

R1 placeOrders.vue6907–6959的type0新建使用data=JSON.stringify(params)，不带已有_id/workflowId，也不先startWorkflow。当前App的A-stage Mock预设quoteId与tryMockCommand不能直接当作实时port；正式通用transport仍在发送前拒绝creatQuotation。

实际Java顺序为生成新身份/审计→订金/产品快照→SequenceService.next→Ext前置Groovy→隔离PDF分支→保存Order。SequenceService可能先变更Redis序号及SequenceConfig，故失败不保证无副作用。当前共享隔离Ext脚本在有workflowId时回填Workflow/Node；原R1报价入口无该字段，但必须检查未来真实payload，不能删除脚本或绕过校验。LocalIntegrationMode只跳过已审PDF/云上传分支，不是任意脚本的沙箱。

该独立工具箱分支是否属于当前技师可见菜单仍需只读补证；它不是普通工单placeOrder的必经步骤，不重复已通过的type1创建来填它。若后续执行，先由产品写者接专门的默认关闭/精确隔离创建能力，再用全新合成上下文一次创建、ACK、正常App权威回读和独立Mongo/Redis/文件差分；结果不明不自动重发。

以上全部本地隔离结果不代表Production/Beta授权或验收。Issue #201 HOLD，生产业务写入、上传、签署、通知、PDF和Workflow保护不变；原生与商业视觉另行验收。
