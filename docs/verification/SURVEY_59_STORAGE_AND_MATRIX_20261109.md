# Survey 59 行：preset 分槽与条件读取验证（2026-11-09）

本片基线 `b3a5ce7de39dbc40f2ebe60a55554ff181cb8744`。范围为既有前端保存协议修补及正常 App 的隔离合成读取集成，不是全量 59 字段写入或真实后台验收；不涉及 UI/UX 改版、type=0 报价或后台治理。

## 来源和证据等级

- **SOURCE**：R1 `xlink-app@6c0a97b26bcbcaee81ac4e1dfd627c6e8e70e29d` 的 `business/subpackages/serviceAppointment/serviceAppointment.vue:7179–7183`，普通保存将 `preset=0` 的字段复制到 `formData.exts`，保留根部业务值。历史 `saveOnly` 分支跳过该循环且仍可能 Process；当前显式保存/完成分离不声称与该历史行为逐字等价。
- **SOURCE**：`xlink-cloud-backend@5fc008d32e771205260f120621c1c4fc62d0824e` 的 `src/main/java/com/fsgo/entity/basic/Survey.java:13–48` 及 `ExtFormServiceImpl.java:158–180,263–268`。Survey 是有固定属性的 typed 实体；已有 ID 路径重新构造后保存，旧对象仅供 changeLog，不是通用 patch merge。`tests/fixtures/survey-typed-root-properties.json` 仅保存固定源码属性名及其 SHA-256，不能代表完整 Java/Mongo 反序列化模型。
- **仓库留存只读参考**：`tests/fixtures/survey-59-read-reference.json`，sourceSha `58cf4ed84067000cb712204778b9def6cc1ccf26cb547c835483457bc08f78b3`；59 行、56 业务键，40 手机行，22 手机附件行。另有 `current-formdef-two-pages.json` 的 repeat 59 行观察，其用途 UNKNOWN，不能据本片将两次采集身份或 Survey 用途合并。
- **合成验证**：字段配置来自上述参考；账号、节点、值、附件引用及 provider 名空间是明确虚构的本地测试数据。没有新增生产读取，没有真实 Java/Mongo 保存。

## 已复现和修复的前端缺口

原 mapper 丢弃 `preset`，特殊表单 wire 不生成新增非 preset 的 EXTS 槽。修复前两条反例分别得到非 preset 行数 0（预期 23）、`isMoldRemoved=0` 的 EXTS 缺失。不能依赖 Mock 的通用 JSON 保留行为证明 typed 后台会保存未知根属性。

现在仅解析明确的 `0/false` 与 `1/true`；未知不推断。纯函数 `projectR1PresetStorage` 将本次实际提交且明确 `preset=false` 的业务值复制到 EXTS，仍保留 R1 根部副本。保留完整原文的未知/隐藏字段，不从压平显示值重建原文；不修改原输入对象。重复业务键仍按 fieldId 保留行身份。没有授权、I/O 或流程推进逻辑。

元数据通过既有 forms/repeat actions、Stage1 意图及通用 Survey Workspace/wire 传递。普通 forms 在第二次 EXTS 写前、Repeat 在回读确认前核对存储元数据未漂移，漂移保留未决锁。现有字段/actor/scope/已有记录保护、ACK 锁和 Process 分离不变；通用 Survey 的已有 ID 替换仍拒绝，调用方直接注入 `values.exts` 仍拒绝。

typed 验证是严格限定的 **源码属性名 DTO 模拟 → 实际 wire → 实际只读 codec/mapper**：23 个 extension 键、根部 drawing/infrared、0/false、未知原文与隐藏值均有断言。它不证明真实 Java 序列化、日期精度、并发覆盖或生产权限已验收。

## 条件与正常 App 读取

19 项矩阵测试覆盖 13 条已捕获部位路径 × 28 条完整条件，另测未知、前缀、额外层级、倒序路径。length/width 具有不同 fieldId 的双行，不合并。perimeter 的已捕获 `showValue=[]` 永不匹配，不补造部位；before/afterMoldRemoval 的 `showList=[]` 不进入手机详情。gap0/height/gap1 的部分条件保持显式未核实，不猜匹配值。

正常 App H5 使用登录 → 列表 → 详情 → 现有只读表单入口，430×932，真实前端与 read adapter，全 API 拦截。字段分页 50+9；逐路径核对每个业务键的行数、附件 PNG 摘要、不显示/加载 URL。只用显式 `qa-survey-59-*` provider 测试别名与空树协议边界，不代表真实 provider 为空或已解析。静态排除的 province/isMoldRemoved 不发 provider 请求；适用的 part provider 失败会使整体读取失败，显式重读后恢复。错租户记录拒绝；冷刷新后按正常登录流程重新读取。

专用 `XLINK_H5_SURVEY_59=true` 执行两项；默认扫描两项 SKIP。CI 增加同命令专步及 `test-results/survey-59-read/` 归档，原步骤不改。该 CI 接线本轮尚未远端运行。

## 尚未开放或证明

- 既有 50 字段、唯一业务键及标量写模型守卫保持；完整 59 行含重复键与附件，不因 preset 修补就全部可写。正常 H5 本片验证读取；保存分槽及回读为协议/动作级合成验证，不冒充正常页面全量保存。
- 三条部分条件、calculateConfig 内容、Survey provider 别名到真实选项、当前节点 fill/readonly 写权仍未知；operationType=1 不赋予写权。不借用 Order parts 数据。
- 日期/BSON 精度、真实 typed 替换保存、并发版本及完整后继流程 NOT_RUN。整份 EXTS 更新与重建 typed 实体的历史覆盖风险继承并记录，未确认生产发生丢失，不改后台。
- Production/Beta 写入、上传、Workflow、签约/PDF/消息及部署均未运行，liveParity 不升级。

## 实际验证与证据

本地证据根 `.review/survey-59-storage-20261109/`，不属于用户外链。原始红例 `red-corrected.log` 两条失败保留；早期测试准备错误（Node JSON 导入、错误端口、STATUS fixture、刷新未重登录）及实现过程的类型/声明顺序失败分别留存，不混称原产品缺陷。

最终命令与结果由同批交付 `summary.json` 记录。H5 `h5-final.log` 为 2 PASS / exit 0，合成 API 请求分别 114/57 次；默认 `default-skip.log` 为 2 SKIP / exit 0。两项 H5 写请求、未知/外部请求、页面异常均为 0。定向 `targeted-final.log` 为 451 PASS，另 `onsite-final.log` 为 37 PASS。`pnpm build:h5` 及发布 QA 边界通过。

一次未显式指定 `VITE_XLINK_ENVIRONMENT=test` 的全量/单跑出现 7 个既有报价 Mock 失败，原因是未知环境关闭 Mock；保留 `full-final.log` 和 `quotation-isolated.log`。按 `.github/workflows/validate.yml` 的 CI 环境执行后，该两文件 25/25 通过，没有改断言或超时。最终 `VITE_XLINK_ENVIRONMENT=test pnpm verify:full` 为 267 文件、3618 测试全通过，含 typecheck 与 quality，exit 0。补丁哈希见交付摘要，不沿用此前 SHA 的 CI。
