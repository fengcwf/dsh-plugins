# dsh-rtk-kit —— RTK（Rust Token Killer）× DeepSeek Harness 集成插件

> 一句话：bash 命令**自动改写走 `rtk` 压缩输出**（fail-open，不改变任何执行语义）+ 会话启动注入"输出已压缩"契约 + `rtk_doctor` 诊断工具 + 设置页「RTK Kit」统计/健康面板（零 LLM token）。
> 零构建纯 ESM JS；测试 `node --test` 全绿（含 load 冒烟 + integration 形 + client-face + awareness 语义冻结回归）。

## 它做什么

| 能力 | 说明 |
|---|---|
| 自动改写 | 模型驱动的 shell 命令在 `resolve()` 缝交给 `rtk rewrite` 改写（`git status` → `rtk git status`），输出压缩 60–90% |
| 递归防护 | 已含 `rtk` 前缀 / `RTK_DISABLED=1` / 含凭据替换（`$(gh auth token)` 等）的命令永不改写 |
| 保守模式 | 管道/重定向/命令替换/分号链不改写（它们的输出会被下游消费）；`&&`/`||` 链照改（`rtk rewrite` 链式感知） |
| hook 安全 | 带 `stdin` 的 shell 调用（hook-runner 等宿主内部用途）永不改写——否则 hook 的 JSON stdout 会被压缩破坏 |
| fail-open | rtk 缺失 → 恒等放行；`rtk rewrite` 超时/异常/无输出 → 原样放行；绝不阻塞命令执行 |
| awareness | 会话启动注入输出契约（default/high/full 三档），随插件装卸，不污染 `AGENTS.md`；文案零统计数字（统计只走设置页面板） |
| `rtk_doctor` | 模型可查 rtk 可用性/版本/配置；gain 统计段默认关（`doctorGain` 可回开，仍受工具参数门控），完整统计看设置页面板（吸收 pharaohnie/dsh-rtk-tools 的 doctor 思想） |
| 设置页「RTK Kit」 | `settings.section` 独立菜单项，一页三区块（RTK 版本 / 节省统计 / 功能健康）；统计进页自动拉取、健康手动点按钮，全程零 LLM token |

## 安装

```bash
# 1. rtk 本体（本插件不打包二进制；缺失时自动退化为恒等）
brew install rtk   # 或 curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh

# 2. 挂载插件（web profile；会写入 profile 的插件表）
dsh plugin --profile web add /root/.dsh/plugins/dsh-rtk-kit
# 3. 重启 dsh web 生效（本机用 /root/.dsh/start-dsh.sh）
```

自定义配置：编辑 `cordis.patch.yml`（`dsh.bundle.patch` 随包分发，`insert` 行即插件入口）。

## 配置（cordis.patch.yml → config）

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 自动改写开关（仅门控 bash 改写缝；rtk_doctor 工具/awareness/设置页面板不受此门控） |
| `rtkBin` | `rtk` | rtk 可执行文件。缺省 `rtk`：PATH 解析失败后按 `~/.local/bin/rtk` → `/usr/local/bin/rtk` → `/opt/homebrew/bin/rtk` 兜底发现（命中即停，0.4.0 起）；显式配置（如 `/opt/rtk`）原样使用、不兜底不覆盖，且该路径缺失时设置页不出「重新安装」按钮（改手动安装提示） |
| `rewriteTimeoutMs` | `400` | `rtk rewrite` 超时；超时 = 原样放行（fail-open，留 debug 留痕）。0.4.x 默认 150ms 在生产宿主内存规模下 p95 已占 81% 余量过薄（实测 p95=121ms），0.4.1 起代码默认提至 400ms。⚠️ **配置显式值优先**：`cordis.patch.yml` 里显式写了 `150` 的部署仍是 150（本仓库配置键面冻结不改），要吃到新默认需删掉显式键或在 profile 覆盖层调大 |
| `conservative` | `true` | 保守模式（见上表）；想激进省 token 可 `false` |
| `exclude` | `[]` | 永不改写的命令前缀黑名单（对应 rtk 的 `exclude_commands` 语义） |
| `awareness` | `default` | `default`/`high`/`full`/`off`（推荐 `high`：带逃生舱说明） |
| `registerDoctorTool` | `true` | 是否注册 `rtk_doctor` |
| `doctorGain` | `false` | `rtk_doctor` 是否输出 gain 统计段（缺省 false=只出轻诊断三行，省 350-420 token/次）；true 时仍受工具参数 `gain!==false` 门控——完整统计唯一入口=设置页面板 |

## 设置页「RTK Kit」

> 入口 = dsh 设置页 `settings.section` 独立菜单项「RTK Kit」，一页三区块（RTK 版本 / 节省统计 / 功能健康）；
> 数据面 = 插件内 HTTP 路由 `/api/rtk-kit/*`（version / gain / health），每路由 handler 第一行鉴权（未登录/越权回 401/403，不进业务面）。

| 区块 | 功能 | 触发方式 |
|---|---|---|
| RTK 版本 | rtk 二进制可用性 / 版本 / 安装提示（rtk 缺失时降级显示安装提示） | 手动点按钮 |
| 节省统计 | 指标卡（总命令数 / 输入 / 输出 / 节省量 / 节省率）+ 日 / 周 / 月 / 全周期切换，全局口径（数据源 `rtk gain -a -f json`，不直读 history.db 内部 schema） | **进设置页自动拉取**（轻查询，恰一次） |
| 功能健康 | 八项检查逐项绿勾红叉 + 失败原因：二进制可执行 / 版本可解析 / rewrite 能力可用 / **自动改写缝已挂载** / 守卫矩阵健全 / fail-open 链路 / 统计源可用 / 压缩生效 | **手动点按钮**（版本检查随健康手动） |

- **零 token**：统计与健康只经设置页 HTTP + 浏览器回显承载，0 LLM token 消耗——不新增会话内统计工具、不做统计注入；**完整统计唯一入口 = 设置页面板**（`rtk_doctor` 的 gain 统计段默认关，见配置表 `doctorGain`）。
- **异步 + 5 秒超时**：三动作异步执行；超时/失败如实回显 + 重试按钮，不阻塞 dsh 宿主。
- **健康检查零污染**：压缩生效检查只读既有历史统计，**不跑 rtk 样本命令**（样本执行会写统计库、污染口径）。
- **健康项语义（0.4.1 起）**：「rewrite 能力可用」只证 rtk 二进制能改写（不证生产缝已挂载）；「自动改写缝已挂载」读**进程内包壳命中计数**（与日志「包壳首次命中」同源）——`>0` = 缝已挂载并被真实调用，`=0` 如实红（不给误导绿灯）。
- **改写缝抗重载 + 装载留痕**：包壳挂载在 `shell.resolve` 的**原型级**（宿主 executor 重载/配置 reconcile 重挂产生的新实例天然继承），teardown 身份校验还原（不误伤后挂）。日志锚 `[rtk-kit]` 三条可检索留痕：`apply 装载完成` / `rewrite-seam 包壳已安装` / `rewrite-seam 包壳首次命中`——无「装载完成」=没装；有装载无「包壳已安装」=包壳未挂；有挂载无「首次命中」=装了没被调用或被覆盖。真机生效判据：会话内跑 `git status --short` 后 `sqlite3 /root/.local/share/rtk/history.db "select count(*) from commands;"` 数值 +1。
- **缺缝行为**：设置页数据面走 `webServer`/`connection` 软依赖接线；该面缺席（未注册）时跳过并留痕，插件其余功能不受影响。
- **rtk 缺失降级**：版本区块显示安装提示、健康检查对应项红叉；bash 改写缝保持 fail-open 恒等放行。

## 安全红线

设置页/路由/工具共用同一红线（无例外）：

- **argv 白名单** = `--version` / `gain` / `rewrite` / `config`，其余 rtk 子命令一律拒；固定 argv 形执行，**不把用户输入拼进 argv**。
- **零 `gain --reset`**：破坏性清零永不暴露。
- **零 `rtk run`**：`sh -c` 透传会绕过沙箱，永久封禁。
- 命令改写侧另有三重守卫：含凭据替换（`$(gh auth token)` 等）不改写、已带 `rtk` 前缀不改写、带 `stdin` 的宿主内部调用不改写。

## 逃生舱（模型侧）

- `rtk recall <hash>` —— 截断结果自带的恢复提示，照抄取回全量
- `rtk proxy <cmd>` —— 无过滤重跑（仍计统计）
- `RTK_DISABLED=1 <cmd>` —— 单条命令旁路

## 设计来源（社区吸收）

- **rtk-ai/rtk**：`rtk rewrite` 单一事实源（链式感知）、awareness 三档、recall 约定、"绝不让模型怀疑输出"的提示原则
- **DeepTrial/dsh-bash-rtk**（12★）：executor `resolve()` 改写缝、三重守卫、rtk 缺失恒等回退、不打包二进制
- **pharaohnie/dsh-rtk-tools**（2★）：`rtk_doctor` 诊断工具；**永不暴露 `rtk run`**（`sh -c` 透传会绕过沙箱）
- **RTK 官方 hooks 协议**：exit-code 四态（0=改写/1=透传/2=阻断/3=审批）——本插件兼容其现实：实测 0.49.0 `rtk rewrite` 对支持的命令统一返回 **rc=3 + 改写结果**（与文档"exits 0"不符），故判定**只认非空 stdout**；`git rebase` 等交互式命令 rtk 自己拒绝改写（rc=1）

**相对社区项目的改进**：① 路由交给 `rtk rewrite` 而非手写白名单（白名单必然滞后于 rtk 版本）；② `stdin == null` 守卫区分模型调用与宿主内部调用；③ awareness 随插件装卸；④ 修掉 rc=3 判定坑。

## 行为修复说明

- v0.3.x 起修复自动改写接线从未生效的问题（旧版 resolve 改写缝未挂载）。

## 验证

```bash
npm run check   # node --check（lib 全模块）+ node --test 全套（守卫矩阵 / rc=3 判定 / 防递归 / 组合决策 / doctor 瘦身 / 设置页接线 / client-face / awareness 语义冻结）
```

设计与社区对比全文见 `../11-社区插件调研与设计决策.md`。
