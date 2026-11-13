# 工单资料 Production/Beta 与 Contacts：最小安全接入条件

结论：**本轮不打开任何通道。** 资料源码/合成验证、Mac 回报的有限隔离窗口与生产授权是三个不同层次。后端授权、部署目标及当前有效配置未齐，不能因新增字段、showList、角色条件或配置返回成功自动启用。

调查基线：App `22008371ab69ec100d4a72926a6b1609a6b5659b`；固定后端 `5fc008d32e771205260f120621c1c4fc62d0824e`；R1 `6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d`。下面是固定源码分析，不冒充已部署 WAR 的权限实测。本轮没有访问生产业务记录、读取生产凭据、调用生产 API 或启动另一套后台；共享角色线文件未修改。

## 1. 确切接口与授权边界

`/wm/` 映射 mini controller；`/wmz/` 是另一 servlet/controller 组合，不能将两者的租户行为互相套用。[web.xml](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/webapp/WEB-INF/web.xml#L146)

| 路由（App 固定使用 POST） | 固定源码证据 | 不能据此认定的权限 |
| --- | --- | --- |
| `/wm/basic/serviceAppointment/query` | [controller 35–57](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/basic/ServiceAppointmentController.java#L35) 注入账号 tenant；也接受关闭 belongTo/org 过滤的请求参数。App 禁止这些绕过参数 | 有租户条件不等于任意本租户对象都可读；允许的数据范围还依赖实际 role/dataAuth/org/sourceType |
| `/wm/basic/serviceAppointment/querySAWorkflowNode` | [service 462–477](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/basic/ServiceAppointmentServiceImpl.java#L462) 按账号 tenant 找定义，再委托工作流列表 | [WorkflowServiceImpl 119–181](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/workflow/WorkflowServiceImpl.java#L119) 的待办 handler 匹配使用用户 role/org/本人/组织角色，已办按 handleUserId；这与字段 showType 4/5 的当前单角色条件不是同一个授权概念 |
| `/wm/basic/serviceAppointment/queryById/{id}` | [controller 62–74](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/basic/ServiceAppointmentController.java#L62) 的 `type=query` 设置跳过权限标志；App Production/真实 DEV 不发送它。[service 286–321](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/basic/ServiceAppointmentServiceImpl.java#L286) 先查可见性，最后 findById；其中权限查询异常被 catch | 不能只凭成功样本证明错误租户、无权限、权限查询异常均 fail-closed。需后台对实际部署版本给拒绝证据；不得在生产用猜 ID 探测 |
| `/wm/biz/extField/query` | [mini controller 35–39](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/biz/ExtFieldController.java#L35) 覆盖 tenant；[service 36–71](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/biz/ExtFieldServiceImpl.java#L36) 的 Customize 按用户/组织/全部角色查排序、宽度，并追加未命中字段 | Customize 不是字段 ACL。ExtField 被列入 [分页 org/owner 过滤例外](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/osg/framework/mongodb/EMongoTemplate.java#L951)；showList/operationType/前端隐藏也不能证明服务器已授权字段值 |
| `/wmz/biz/extField/query` | [miniz controller 31–35](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/moduleminiz/biz/ExtFieldController.java#L31) 的显式 tenant 注入被注释 | 不能依赖 mini 结论；底层默认过滤与具体主体要另证。不能自动切换 namespace 或把客户端 tenant 参数当服务端授权 |
| `/wm/basic/contacts/query` | [controller 40–47](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/basic/ContactsController.java#L40) 注入账号 tenant；service 调用分页。[EMongoTemplate 835–870](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/osg/framework/mongodb/EMongoTemplate.java#L835) 按账号类型、有效 permissionRole.dataAuth、org/owner 等条件过滤 | 不等于继承工单权限，也不等于任何技师都有 CRM Contacts 权限。有效 permissionRole 与 App 当前角色的绑定必须补证 |
| `/wm/basic/contacts/queryById` | [controller 82–85](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/basic/ContactsController.java#L82) 调用 [service 94–98](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/service/basic/ContactsServiceImpl.java#L94) 的直接 findById；[模板 290–308](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/osg/framework/mongodb/EMongoTemplate.java#L290) 未走分页过滤 | 本链未建立独立记录级 tenant/role/关联授权。给 body 加 tenantId 或前端拿到结果后再隐藏，都不能替代后台校验；当前保持禁用 |
| `/wm/basic/contacts/query2` | [controller 56–78](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/fsgo/modulemini/basic/ContactsController.java#L56) 是已签约客户查询，读取请求 roleId 并按 Contract 条件后过滤 | 不是通用 Contacts 详情授权入口，不复用为工单关联客户读取 |

以上不宣称线上已可越权；实际部署及上层策略未实测，也不能将源码中的缺少校验认定为当前已获授权。showType 4/5 是显示条件；若某隐藏字段属于读取权限，后台必须投影/拒绝，不能靠 UI 隐藏替代。工单详情返回完整对象与客户端仅渲染少数字段，也是不同边界。

固定参数继续为 `colName=serviceAppointment`、active、order asc、page=1、size=200，无 `_all` 或 notFilter 参数。[FlipPageInfo 151](https://github.com/xlink-bj/xlink-cloud-backend/blob/5fc008d32e771205260f120621c1c4fc62d0824e/src/main/java/com/osg/framework/util/FlipPageInfo.java#L151) 支持 size（优先于 rows）；App 仍要求完整计数单页，超过 200 或不完整则不扩页猜测。该形状不是授权凭证。

## 2. 现有前端护栏及 Beta 判定

- `technician-api.ts` 新资料 caller 只在真实 DEV 读取；Production、非 DEV、未列入当前身份列表的对象不能据配置打开。实时 tenant、session/user/当前单角色、对象及读取代次绑定 context；复制 token、全部角色并集、在途旧响应不能取得权限。App tenant 是实时配置源，不能独立充当服务器认证 tenant 断言。
- `production-read-only.ts` 的传输保护识别 `environment=prod` 或已知 canonical host；`environment.ts` 也拒绝 canonical host 搭配非 prod。资料固定请求和 Contacts 均不在 Production 白名单。已有 material ExtField 白名单是另一精确 body 和独立目录授权，不能把整个 extField 路由放开。
- 环境枚举只有 dev/test/staging/prod；“Beta”不是独立枚举。staging 加任意非 canonical host 并不自动进入 Production 传输保护。新资料 caller 在 staging 仍关闭，但这不证明整个 Beta 业务面都受生产护栏保护；必须由部署方给精确环境、host、context path、认证及 namespace 映射，逐一证明无误标/别名/回退。
- 不新增自动开关，不增加业务写路径，不放开 function/changeRole。Production 中它是持久角色选择操作，既有禁止规则保留；不能把读菜单当作后台有效角色已经被改写。
- 配置失败仅可保留已被独立许可的固定展示；若缺此许可，应显示不可用。401/403 不降级成成功，完整有效配置全隐藏必须保持空。原值电话、原始 JSON、未知条件/类型、未授权媒体链接均不可据回退扩展展示。

## 3. Contacts 最小条件及当前不适用范围

现有客户资料来自 ServiceAppointment 的 name/address/phone，不是 Contacts 主数据。contactIds 是引用数组，Contacts.userId 另有含义；不得把 UserId 当 ContactId，不能用同名/同电话猜关联，也不能把首个引用默认解释为主客户。R1 后台创建时的同租户手机号匹配不是 App 获得重建关联的授权。

[R1 Contacts 独立列表入口](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/contact/contacts.vue#L100) 使用记录 ID 打开 [详情](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/contact/contact.vue#L35)：信息页固定六行，动态扩展字段在带保存的编辑弹层；其配置查询没有 showList=4 条件。这不能成为新 App 原样展示电话号码或任意扩展字段的许可。

父任务给出的生产库级摘要是 ServiceAppointment 74 active、26 条含移动详情，含重名及九条角色条件；Contacts 13 active 均无 showList=4。它不是当前用户有效 API。故当前 Contacts **配置驱动的移动详情不适用**，不为测试制造生产配置；不能推导为“没有客户数据”，也不能退回全量原 JSON。固定基础资料若另有业务需求，仍需单独许可字段及服务器对象授权。

未来最小只读入口必须同时具备：真实获准工单中的明确 ContactId；后台核验同 tenant、关联及独立 Contacts 读取权限；受支持且已获准的字段投影；单角色/身份变化失效；手机号脱敏。0 个引用显示无关联；多个引用在主次语义未证前不擅取第一条。可优先评估现有 Contacts.query 的单 ID、有界请求，但只有后台证明它的有效角色过滤和关联策略后才能采用；不能以此文档发起线上查询。若没有安全既有接口，需后台提供受约束的关联读取能力，而不是 App 绕过 queryById 的权限缺口。

## 4. 可独立完成与必须补证的收口表

| 项目/责任方 | 可独立隔离验证 | 必须补齐的放行依据 |
| --- | --- | --- |
| 后端/部署方：目标与主体 | 两租户、同 ID/错误 ID、过期 session、当前角色与服务器有效 permissionRole 不一致、缺角色或空 org；所有失败均不返回对象 | 实际部署 SHA/WAR、精确 host/path/namespace、服务器 tenant/有效角色来源及拒绝证据；不要求 App 取得生产客户原值 |
| 后端：工单与字段授权 | 权限查询异常、未分配对象、跨租户、伪造绕过参数、隐藏字段读权限、电话隐号 | 服务端对这些分支 fail-closed 的策略和回归；成功样本、菜单可见或 Customize 排序均不足 |
| 后端/Owner：当前有效 schema | 完整 0/74/200/201 边界、重名 fieldId/preset、4/5、旧混合条件、未知类型、有效全隐藏与配置失败 | 经授权后台人员产出的当前租户/当前角色脱敏结构及有效顺序；数据库 active 摘要不能替代。仍不自动开启通道 |
| 后端/产品：Contacts | 全新虚构真实关联、同名同电话但不同对象、空/多引用、同租户不可见联系人、跨租户、已失效记录 | 独立读取政策、主次语义及已获准字段；queryById 或 query2 不因引用存在自动获准 |
| App：保持关闭与撤销 | 发送前拒绝、无 Contacts 自动读取、缺 context/tenant、切角色/注销/新代次、脱敏/回退 | 本轮完成或复用合成契约；真正开启前只做固定最小对象白名单，显式授权并独审，不改变共享角色语义 |
| 隔离环境持有线 | 全新虚构对象读窗口的 API→配置→UI、Mongo/Redis/文件差分与请求预算 | 既有 Mac 回报仅证明其有限 7→6 窗口；权限负例、Contacts 或所有回退分支不补记为已过，不重放旧 A/B/C 保存 |

后端证据可由受权方在隔离数据中复现，并给实际部署与策略一致性说明；需要当前有效生产元数据时，由受权方提供脱敏结构，不在本任务使用未授权登录或读取生产业务记录。仅配置改变永远不是上线批准。

## 5. 本轮可审改动与验证

仅新增本文件与 `tests/engineering/work-order-information-release-boundary.test.ts`，不修改运行时、权限策略、角色线、Contacts API 或任何开关。新测试用注入 executor，绝不触达真实 host：12 项 Contacts 在 prod 或 canonical-host 误标 dev 下发送前拒绝，1 项明确引用形状不触发 Contacts 查询，2 项 staging/test 不读取新资料配置。既有工单配置 Production 变异拒绝、角色/租户/分页、Production 材料只读许可等由对应既有套件回归，避免重复共享线实现。

本轮新文件 15/15 通过；与既有对象资料、对象角色、严格 matcher、Production 只读套件共同运行，5 文件/192 项通过，类型检查最终 exit 0。初次类型检查发现新测试角色回调误用了普通 string，已改为既有 opaque RoleId，未修改运行时。日志为忽略目录 .review/work-order-information-20261113/ 下 release-boundary-contract.log、release-boundary-new-tests.log、release-boundary-typecheck.log。本轮未启动后台或重跑已消费 Mac 窗口，未把原有真实回报升级为这些权限负例已过。

所有结果仅属客户端合成契约，不构成后端授权或 Production/Beta 开通依据。文档、测试改动先审，暂不推送。
