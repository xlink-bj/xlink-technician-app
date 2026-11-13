# 正常 App 签约前只读条件核验（2026-11-13）

本批基于 `dd73eb13af81dedac7f64a64e1a7ebf31a08cba7`，将既有正式 Order 只读、独立合同范围与新读取的当前节点处理人事实接到正常页面。仅判断 R1 首次签约入口的已读条件，不执行签署、短信、PDF、取消、再次签约或 Workflow。

## 来源与范围

固定 R1 `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` 的 serviceAppointment 页面：首次按钮要求 `processState=0`、`exts.isAgain!=1`；处理人按 userId、roleId、orgId+roleId 匹配。实际进入签约后还读取动态必填项、签署人类型及其他资料，本批没有把入口条件当作完整签署资格或后端权限。

正常 Order 读取必须来自当前角色可见工单及有界正式 Order 列表；不得通过任意路由 ID 直查冒充关联。合同读取保留原有独立范围/显式动作，Production 路由白名单不变。节点按钮只触发当前角色/工单下的新详情读取，不使用详情页旧缓存作为处理人证明；Production 禁用此新增核验动作。

## 身份及字段事实

- R1 可能不返回 roleVersion。只读缓存使用既有 `sessionAuthorizationFingerprint`：完整 session/user/current-role 加实际版本，缺版本显式为 null；不制造版本，也不改共享严格 versioned helper。有效版本改变或移除、角色/会话变化、登出和角色工单列表丢失均撤销旧事实。
- 完整返回的 EXTS 缺少 isAgain，按 R1 `!=1` 表达为明确 absent；不写入虚构 isAgain=0。EXTS 未读/非法仍未知，非法 isAgain 不经 Number(null/false/blank/array) 变为0。仅已核实的非负安全整数/十进制数字串可以投影为 present。
- handler 读取绑定当前 Order/工单、会话和读取代次。切换 Order、重新配置或登出后的迟到 handler/合同响应不得覆盖新页面。
- SessionSnapshot 没有已核实组织身份，不能仅凭用户对象上的额外 orgId 借得组织角色匹配。
- 组装结果的 `mayDispatch`、`backendPermissionProven`、`actualBusinessOutcomeKnown` 始终 false；页面仍保持签署入口关闭。有界空合同页不证明全局无合同，读取失败或缺项均不展示业务成功。

## 验证

正常 App 430×932 H5 三条：无版本真实形状的合成登录与正常导航、外处理人拒绝、节点响应等待期间正常 Back/登出/更换会话角色及旧 Workspace 拒绝接管后的页面恢复。另保留既有375/390宽度五条报价草稿→正式Order→签约只读回归。全部合成 HTTP，零签署/合同写入/上传/消息/Process；不是本轮真实 Java 签约资格读取。

模块定向266项，包括23项能力用例和17项独立回归；全量6381项（344文件），其中原未提交媒体独立20项保留而不随本批提交，提交集合对应6361项/343文件。H5、MP-WEIXIN、App 均仅构建检查，未启动原生工具。CI 新增三场景和独立产物归档，旧测试、条件、分组与聚合门禁保留。

已有真实隔离结果与本批未知边界见[本地真实集成实证对账](R1_LOCAL_REAL_INTEGRATION_EVIDENCE_20261113.md)。不能将未执行的真实签署描述为完成，也不能因本批只读就否认已封存的正式 Order 创建、Survey create/Process 或其他隔离写入。

实际 App 截图及失败/修复记录本地保留；CODE_PASS 不等于 COMMERCIAL_UI_ACCEPTED。Production/Beta 写入、上传、PDF、客户通知、签约及 Workflow 副作用继续保持关闭，Issue #201 HOLD。
