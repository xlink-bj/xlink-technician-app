# Survey正常读取：禁止损坏EXTS回落旧根值（2026-11-09）

基线 `f9c5b07823ca6c2d8299be712595bf06b91d11b3`。本片只修复正常Survey读取中的有损投影；不改preset分槽、面积规则、后台、写权限或完整59行写模型。

## 已确认事实

固定R1源码 [xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d 的 serviceAppointment.vue:7014–7017](https://github.com/xlink-bj/xlink-app/blob/6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d/business/subpackages/serviceAppointment/serviceAppointment.vue#L7014)将每个EXTS键覆盖到根部用于回显，不根据preset跳过。当前通用 `read-models/form.ts:formValues` 会先映射EXTS，无法表示的对象值被丢弃，再读取同名根值。这会把“明确存在但不支持的有效值”误投影成旧根值。

本片两个独立合成红例，不代表已发生生产故障：

- 实际normal reader：radio字段根answer='yes'、exts.answer={broken:true}，读取原来成功而非拒绝。`red.log` 为1 FAIL/75 SKIP/exit1。
- 正常App、登录→列表→详情→只读表单：使用已保存59行参考和明确合成账号/节点/provider。根part=['1','130']、exts.part={broken:true}时，页面原显示“读取1条记录”，有损投影仍允许根part控制字段。`h5-red.log` 为1 FAIL/exit1，原截图/trace保留本地。另一次内存调用实际mapper/投影明确得到squareMeter=18.75、unavailable=false。

本轮仅使用仓库留存资料和隔离合成API；没有新生产/Beta访问。先前生产补查的E11/ps拒绝未重试。

## 最小修补

正常reader取得具有归属证明的精确原文后、发布snapshot前，核对手机详情中已支持的Survey标量/选择字段：显式EXTS值若不能按现有显示模型无损表示，就拒绝整次读取，不让通用mapper的根部回落成为可见数据。有上述支持字段时，EXTS容器须为对象；null/缺失保持原空容器语义。若全部字段静态排除/未支持，则不新增容器校验。

0、false、null、空串、空数组、标量数组、未知历史标量编码均保留；仅缺失该EXTS键才允许使用真实根值。未知audit对象不冻结。静态排除字段、未知条件/不支持控件保持既有不展示/不可用边界，不将本片扩大为其值合同。已知附件继续由原只读codec校验，不改上传或附件存储规则。

load开始即撤销旧current；失败不能继续认可旧snapshot。用户显式重新读取、且记录原文修复并通过全部身份/分页/provider等检查后，才发布新snapshot。无自动重试、保存、Process或业务请求。

此修补局限于正常Survey reader的已支持手机字段，不是通用mapper所有消费者或所有条件依赖的完整验证。未知配置及不支持字段不因此升级。没有连接真实后台，不能声称生产影响或生产修复已验证。

独立只读reviewer已核实际函数并放行当前59范围。它另用人工schema实证：如果一个静态排除/未知规则/特殊类型的controller仍控制另一个支持字段，旧root条件仍可能经通用mapper传播；本片没有全局重写该模型。当前59的可见条件源part为已覆盖mobile cascade；isMoldRemoved及其两个目标均静态排除，没有该可达组合。此限制正式保留，不称所有schema已修。

## 验证范围

`normal-node-forms-read.test.ts`新增损坏对象/混合数组拒绝、合法空值、缺失值、audit、静态排除/未知条件/特殊控件及旧snapshot撤销/显式恢复测试。正常App新增第三个只读H5场景，检查错误时0记录/0平方字段，恢复后精确回显18.75，写入及外部请求为0。

专用Survey59配置现执行3项；同文件既有全局opt-in默认扫描跳过机制保持，现有CI专步自动发现第三项，无workflow改动。实际命令、结果、原红例和最终hash见同批交付summary/MANIFEST；证据根 `.review/survey-read-shadow-20261109/`，不是用户外链。

完整59行正常页面计算编辑/保存、真实Java/Mongo、真实provider/缺失三条件/calculateConfig仍未验证。既有写权限、已有记录、50字段/唯一键/标量守卫保持，不冒称全量勘察完成。

本片最终实际结果：4文件220项定向PASS；`VITE_XLINK_ENVIRONMENT=test pnpm verify:full`为268文件3696测试PASS，含typecheck/quality，exit0；正常App H5专用3项PASS，默认扫描3项SKIP；H5构建及发布QA边界PASS。三条H5都断言写入、未知/外部请求、页面异常为0；请求计数及命令详见交付summary。独立审查为源码/实际函数内存验证，未冒称审查者独立跑完整套件。
