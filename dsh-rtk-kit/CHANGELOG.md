# Changelog — dsh-rtk-kit

## 0.3.0 — 2026-09-29

设置页增强（三功能）+ ⚠️ 重大修复：

- **⚠️ 修复：自动改写接线从未生效** —— 旧版 `ctx.effect` 为拆除器形，在 cordis **工厂语义**（body 当场执行、返回函数才是拆除器）下 apply 时 resolve 改写缝被当场还原（`shell.resolve` 未包壳），即 0.1.0-0.2.1 的自动改写实际未挂载。本版改工厂形 `ctx.effect(() => () => …)` 并加回归锁（integration 测试对旧形必红）。**升级后自动改写从无到有生效**（恢复设计意图；不想要可 `enabled:false`）。
- 新增：dsh 设置页「RTK Kit」独立菜单（`settings.section`），一页三区块：
  - **RTK 版本检查**：点击回显版本 + 二进制路径（缺失给安装提示）；
  - **节省统计**：指标卡（总命令数/输入/输出/节省量/节省率）+ 日|周|月|全部周期切换，进页自动拉取，全局口径 `rtk gain -a -f json`（**0 LLM token**，设置页 HTTP 承载）；
  - **功能健康检查**：七项零污染检查（二进制可执行/版本可解析/rewrite 缝生效/守卫矩阵/fail-open/统计源可用/压缩生效〔只读 history.db〕），逐项绿勾红叉 + 失败原因 + 重试。
- 新增：`/api/rtk-kit` 数据路由（GET version / GET gain / POST health；`requestRejection` 登录鉴权 401/403；`{data}/{error}` 信封四码族；异步 execFile 5s 超时如实回显 + 重试按钮）。
- 变更：`rtk_doctor` 瘦身 —— gain 统计输出**默认关闭**（新配置 `doctorGain` 可回开；每次省 350-420 token 进上下文），统计唯一入口 = 设置页面板。
- 安全：argv 白名单（`--version`/`gain`/`rewrite`/`config`）；`gain --reset` 与 `rtk run` 零暴露；禁止拼接用户输入进 argv。
- 文档：README 新增「设置页 RTK Kit」章节 + 安全红线 + `enabled` 口径修正（自动改写开关）；awareness 文案同步（统计指向设置页面板，语义冻结零变化）。
- 测试：88/88（新增 doctor 单测 / integration 形〔假 ctx 真 apply + 真 handler〕/ client-face / awareness，共 5 新文件 80 用例）+ `.testenv` boot 冒烟四关全绿 + 真浏览器功能探针三态。

## 0.2.1 — 2026-09-29
- 兼容面（行为零变更）：`peerDependencies`（`@deepseek-ai/dsh-tools`/`dsh-llm`）与 `dsh.plugin.json` engines 上界 `<0.2.0-0` → `<0.3.0-0`，放行 dsh 0.2.x（含 0.2.0-rc.1）。背景：0.2.0-rc.1 版本门禁拒载实测（`docs/test-env-upgrade-020-2026-09-29.md` §2）。

## 0.2.0 — 2026-09-23
- 迁入 `fengcwf/dsh-plugins` monorepo；分发形态改为**版本钉装的 git 快照安装**（弃用 link:）。
- 行为与 0.1.0 相同（bash 命令 rtk 改写 resolve 缝 + session-start awareness + rtk_doctor）。

## 0.1.0 — 2026-09-23
- 首版：`lib/rewrite.js` 纯改写决策（`rtk rewrite` 缝、fail-open、元字符/凭据防护、排除清单）、3 级会话 awareness 注入、`rtk_doctor` 诊断工具。
