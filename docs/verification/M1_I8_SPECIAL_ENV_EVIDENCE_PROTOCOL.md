# M1-I8｜Codex 特殊环境取证清单（仅需要本机/真机时执行）

Lead 直接承担编码、PR/CI、接口模型与验收裁决。Codex 只补当前 GitHub 工程无法访问的环境证据。**在 GitHub 留下任务不是实际执行 Codex 本机操作；未经真实运行不能填 PASS。**

## E1｜现有租户与 R1 Contract 查询行为（READ ONLY）

1. 在当前已授权角色/登录态下，选择**已有且允许查看**的工单及其单个 type=1 Order；记录匿名 WorkOrder/Order 关系摘要，不复制客户电话、身份证、签名链接、URL 或合同正文。
2. 对照已有 R1 客户端实际请求字段 `is:workOrderId|string#and`，在不改变旧后台、不遍历全租户、不查询 PDF/QR 的前提下，记录有界结果的*条数与关联字段是否匹配*；如原接口不可执行，只标记 `NOT_RUN`，不得尝试改字段探测生产未知接口。
3. 如需要对照 `serviceAppointmentId`，只能在已获明确授权的既有只读观察/日志或本地代码中进行；不能擅自发第二个新的生产查询或扩大范围。结论写 `OBSERVED_READ`/ `SOURCE_ONLY`/ `UNRESOLVED`，不得因查询为空断言合同不存在。
4. 记录时间、环境类别、当前角色是否可见、输入和结果的匿名结构、错误类别、源 SHA 与证据文件路径；不上传 Token/Session/PII。

## E2｜真实 SKU/价格（READ ONLY）

仅在当前角色实际可见合法 active SPU/SKU 时，对照 R1 `basic/material/query` 与 Code 字典按固定数量审计；没有可用商品则明确 `BLOCKED_ENV`，不能在正式租户创建测试 SKU 或填充虚构价格。

## E3｜MP / Android / iOS（物理设备）

每个平台按“构建 SHA / 系统与机型 / 登录角色 / 页面与操作 / 实际结果 PASS/FAIL/NOT_RUN / 匿名截图位置”记录：六阶段可达性、下拉/键盘/返回、Action Bar 与安全区、勘察相机/媒体权限、弱网与重入；**不得点击签约、取消合同、短信重发、PDF 生成或工作流提交**。

完成的证据应追加到 I7 #97、I8 #98 与对应 I2/I6 Issue，交由 Lead 复核；只有 Owner 单独批准 Beta 写入 Gate 后，才可另行规划合法沙箱的业务命令实测。
