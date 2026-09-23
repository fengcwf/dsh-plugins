# dsh-rtk-kit —— RTK（Rust Token Killer）× DeepSeek Harness 集成插件

> 一句话：bash 命令**自动改写走 `rtk` 压缩输出**（fail-open，不改变任何执行语义）+ 会话启动注入"输出已压缩"契约 + `rtk_doctor` 诊断工具。
> 零构建纯 ESM JS；测试 `node --test`（8/8 通过）。

## 它做什么

| 能力 | 说明 |
|---|---|
| 自动改写 | 模型驱动的 shell 命令在 `resolve()` 缝交给 `rtk rewrite` 改写（`git status` → `rtk git status`），输出压缩 60–90% |
| 递归防护 | 已含 `rtk` 前缀 / `RTK_DISABLED=1` / 含凭据替换（`$(gh auth token)` 等）的命令永不改写 |
| 保守模式 | 管道/重定向/命令替换/分号链不改写（它们的输出会被下游消费）；`&&`/`||` 链照改（`rtk rewrite` 链式感知） |
| hook 安全 | 带 `stdin` 的 shell 调用（hook-runner 等宿主内部用途）永不改写——否则 hook 的 JSON stdout 会被压缩破坏 |
| fail-open | rtk 缺失 → 恒等放行；`rtk rewrite` 超时/异常/无输出 → 原样放行；绝不阻塞命令执行 |
| awareness | 会话启动注入输出契约（default/high/full 三档），随插件装卸，不污染 `AGENTS.md` |
| `rtk_doctor` | 模型可查 rtk 可用性/版本/收益（吸收 pharaohnie/dsh-rtk-tools 的 doctor 思想） |

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
| `enabled` | `true` | 总开关 |
| `rtkBin` | `rtk` | rtk 可执行文件 |
| `rewriteTimeoutMs` | `150` | `rtk rewrite` 超时；超时 = 原样放行 |
| `conservative` | `true` | 保守模式（见上表）；想激进省 token 可 `false` |
| `exclude` | `[]` | 永不改写的命令前缀黑名单（对应 rtk 的 `exclude_commands` 语义） |
| `awareness` | `default` | `default`/`high`/`full`/`off`（推荐 `high`：带逃生舱说明） |
| `registerDoctorTool` | `true` | 是否注册 `rtk_doctor` |

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

## 验证

```bash
npm run check   # node --check × 3 + node --test（8 测试：守卫矩阵/rc=3 判定/防递归/组合决策）
```

设计与社区对比全文见 `../11-社区插件调研与设计决策.md`。
