# Changelog — dsh-rtk-kit

## 0.4.1 — 2026-10-08

⚠️ **修复：自动改写缝在生产从未挂载**（0.4.0 装上、重启后仍无效果——会话内命令输出不走 rtk 压缩，`history.db` 零增长，而显式 `rtk <cmd>` 正常写库）。

- 根因（A2）：宿主在插件包壳**之后**会 dispose + 重挂 shell 执行器（`Fiber.restart()` / 配置热载 `root.update()` / profile reconcile），新实例**不继承实例级** `ctx.shell.resolve` 覆写 → 缝不存活。0.4.0 的"自动改写自此生效"因此在本机未兑现。
- 修法：挂载面升级为**原型级**（`lib/rewrite-seam.js`：包壳挂 `resolve` 属主=类原型，重载后的新实例沿原型链天然继承）+ teardown 身份校验（只还原仍是自己的包壳，不误伤后挂者）+ 幂等重挂（不叠娃）；**决策体逐字保留**（stdin 跳过/惰性自愈翻转/守卫矩阵/`isSafeRewrite`/fail-open 恒等放行），生产行为零差异。
- 观测：`[rtk-kit]` 三锚留痕 —— `apply 装载完成` / `rewrite-seam 包壳已安装（level=prototype）` / `rewrite-seam 包壳首次命中`（可按"有装载无包壳""有挂载无命中"直接分诊）；超时/异常补 debug 留痕。
- 健康面：八项——原「rewrite 缝生效」改名「rewrite 能力 available」（只证二进制能力，不作缝判据），**新增「自动改写缝已挂载」**（读进程内真实命中计数，与首命中留痕同源）。
- 默认值：`rewriteTimeoutMs` 代码默认 150 → 400ms（实测 p95=121ms，原预算余量过薄易静默 fail-open）。⚠️ 随包 `cordis.patch.yml` 仍显式写 `150`（配置显式值优先），想用 400ms 预算需在 profile 覆盖层调大或删除该显式键。
- 质量：node --test 223/223（216+7）；新增 7 条红态实证 7/7 红→绿；审查变异测试 2/2 被捕获（原型级→实例级转红、去身份校验转红）。真机判据：会话内 `git status --short` → `history.db` `commands` 计数 +1。
- 文档：活跃代码/测试面的「七项」口径全部同步为八项（`lib/{doctor,doctor-routes,client}.js`、`test/{doctor,integration,client-face}.test.mjs`）；**历史文档（0.4.0 及以前条目、changes/ 归档、ledger）保留"七项"原样**——那是当时事实，不改写记录。

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
## 0.4.2 — 2026-10-09

观测出口修复 + 判据/边界成文（功能面声明见末条）：

- **修复：三锚留痕补 console 出口** —— 三锚（`apply 装载完成` / `rewrite-seam 包壳已安装（level=prototype）` / `rewrite-seam 包壳首次命中`）此前只走 `ctx.logger.info`，而宿主 web profile 下 **info 级无出口**（cordis 内建 buffer exporter 无 levels 判 silence；app-boot diagnostics 只收 warn/error 且随 diagnostics.fiber dispose 释放；dsh-web.log 实测 0 条 info）→ 「grep 三锚零命中」不可用作「缝未挂载」判据（前两轮误诊根因）。现三锚除 logger.info 外**同文走 console**（stdout/stderr 被 start-dsh.sh 收进 dsh-web.log，与 login-gate 同出口），console 写失败静默不炸装载/包壳热路径。
- **新增测试（227/227，226+1）**：① console 恒抛（EPIPE）时 apply 不抛、缝照挂、resolve 照改写（含"恒抛 sink 确被触达"计数断言，防空转假绿）；② console 必写 + 首命中后不刷洪水；③ hitCount 作为 history.db +1 判据的进程内同源物；④ 命中链把「工具注册了」与「缝挂了」拆成两个独立断言（防再被 apply 跑过误导）。
- **文档（判据与边界，用户可凭）**：history.db +1 只在「rtk rewrite 成功且 rtk 真执行」时成立——conservative 拦下的命令（管道/重定向/命令替换/分号链）不改写也不 +1 但**缝在工作**，复验须用无管道简单命令；自动改写缝只覆盖走 `ctx.shell.resolve` 的工具（tool-bash 一系），带 persistent-shell 的 preset 走 `ctx.terminals` 旁路，不经此缝（产品层边界，非缺陷）。
- **校正**：`cordis.patch.yml` 的 conservative 注释与 lib `UNSAFE_METACHAR` 事实对齐（`&&` 链照改；`||` 含竖杠同被保守拦下——`a || b` 的 b 分支输出被压缩会改语义）；字节锁基线随本变更重钉（f5f738e2…）。
- ⚠️ **功能声明**：0.4.0/0.4.1 的自动改写功能**实际一直在工作**（0.4.1 原型级挂载在生产真机实测生效：`git status --short` → `rtk git status --short` 持续写库）；本变更修的是**可观测性与判据成文**，前两轮"未生效"为观测误判 + 复验命令不当，非挂载缺陷。
