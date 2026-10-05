# Changelog — dsh-rtk-kit

## 0.4.0 — 2026-10-04

rtk 自愈（发现兜底 + 设置页一键重装）+ ⚠️ 行为提示：

- **⚠️ 行为提示：自动改写自此真正生效**——凡 rtk 装在官方落点 `$HOME/.local/bin` 而进程 PATH 不含该目录的机器（dsh 服务进程即此态），0.3.0 及以前自动改写是**恒等放行**（接线在（B2），但解析层只按 PATH 找裸名 `rtk`，找不到就静默失能）；0.4.0 发现兜底补上最后一环，**bash 命令输出自此会被 rtk 压缩**。输出解读见会话 awareness 注入（含逃生舱）；不想要可 `enabled:false`。
- 修复：rtk 二进制**发现兜底**（`lib/resolve-bin.js` 解析单源：PATH → `~/.local/bin/rtk` → `/usr/local/bin/rtk` → `/opt/homebrew/bin/rtk`，命中即停）——修「rtk 明明已装却报『安装：brew install rtk / curl …』」误诊（官方 install.sh 恰装 `$HOME/.local/bin`）；显式 `rtkBin` 配置零覆盖不兜底；`rtk_doctor` 如实（「安装」提示只在真缺失出现，找到即报解析绝对路径）。
- 新增：**设置页一键重装（自愈）**——rtk 真缺失/损坏/不可执行时健康面板出故障条+「重新安装」按钮：下载 GitHub Release 官方二进制（60s 超时）→ `checksums.txt` SHA256 校验（**校验失败不落盘**）→ 备份旧版（`rtk.bak.<ts>`）→ 原子落盘 → 自动复检刷新面板；失败态=分类红条（下载/校验/落盘）+「重试」+ 可展开详情；并发单飞（重入 409）；**仅设置页可触发**（会话工具零安装能力，模型永不代装）；仅 Linux x86_64。不执行任何远程脚本（curl|sh 路线否决）。
- 自愈语义钉死：**装后/外部手装不需重启即恢复**（数据面每请求重发现 + rewrite 缝失能态惰性翻转）；显式 `rtkBin` 指非默认落点且缺失时**不出重装按钮**（改手动安装提示，防"装到 ~/.local/bin 满足不了配置位"误导）。
- 数据面：GET version 增 `lastInstall`/`installSupported`/`installTargetMatch`；新增 `POST api/rtk-kit/install`（登录鉴权 401/403；错误码族 DOWNLOAD_FAILED/CHECKSUM_MISMATCH/EXTRACT_FAILED/WRITE_FAILED/VERIFY_FAILED/PLATFORM_UNSUPPORTED + reinstall-in-progress→409）；重装记录落 `~/.dsh/dsh-rtk-kit/install-log.json`（字段白名单零凭据，上限 50 条）。
- 质量链：全套 `node --test` 215/215（新增 install/resolve-bin/client-install 测试族 + seam 级集成用例）；独立验证真机探针（boot 真缺失→一键重装→不重启自愈）+ 整分支终审五轴 + 两轮 fix 闭环（含 F-FINAL-1 种子窗口）。设计/验收/复盘归档 `changes/2026-10-03-rtk-reinstall/`。
- 文档：README 补 `rtkBin` 发现兜底语义；测试红线增补（一切测试禁对生产 `~/.local/bin` 真装）。

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
