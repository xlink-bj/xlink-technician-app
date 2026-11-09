# Survey 历史记录 EXTS 完整性收口（2026-11-09）

## 范围与缺口

基于 `61a712f3439cfd643cca2aa9bb9e4d7adf5d7a17`。活动表单的 [EXTS 校验](SURVEY_READ_EXTS_INTEGRITY_20261109.md) 已在 `3b9fb41` 交付；已完成表单的历史读取入口尚未调用相同校验。

真实 reader 的合成响应复现：已支持的手机 Survey 字段在 EXTS 中为对象或嵌套数组时，mapper 丢弃该值并展示旧根部副本。新增测试在修复前得到 **5 FAIL / 79 PASS**，失败响应实际含旧值，而非服务请求失败。

## 修复

- 导出并复用现有 `assertSurveyReadExtsValues`，不复制另一套字段规则。
- 历史 reader 在精确选中记录后，通过私有 `originalFor(selected)` 检查权威原文，再返回展示投影。
- 失败沿用原历史租约撤销流程；旧 target 不可继续请求，必须显式重新发现和读取。
- null、空串、false、0、空数组及平坦标量数组保留 EXTS 优先级；未知 audit JSON、未支持字段、展示字段和非手机字段不扩修。
- 未增加编辑、上传或后台写权限，不修改 UI 布局。

## 验证与证据边界

- 本机定向 **174 PASS**；独立复核 **234 PASS**（范围有重叠，不相加）。
- 本机 `pnpm verify:full`：**273 文件 / 3695 PASS**；最终类型检查通过。工作树为 `d12b30fb` 加原有 22 项 QA 及本切片，并将本次所需活动 reader 对齐到远端版本；这不是整个最新 main 的本机验收。
- 原 22 项未提交 QA 文件逐项 SHA-256 未变，未纳入提交。
- 新增正常 App 430×932 历史 Survey H5 用例：先显示正常记录，坏 EXTS 后清空历史项/旧值，再显式重读恢复；全部 API 拦截为合成数据，断言零写入、零意外请求、零页面异常。
- 本机 H5 未进入用例：Playwright Chromium 缺失，现有 Chrome 隔离启动 SIGABRT；随后一次审批启动遇到执行通道断连。因此本机浏览器为 **NOT_RUN**，不计 PASS。正常主干 CI 中既有 Survey 专步将自动运行新增第四项；最终以新提交精确 SHA 的 CI 结果为准。
- 原始本地日志保存在 `.review/historical-survey-exts-20261109/`，不提交生成证据。本报告不声称执行过真实 Java/Mongo、生产读写、完整 59 行保存、真实媒体或原生设备验收。
