# dsh-github-ops —— GitHub token 强制层 + 仓库管理工具集（DeepSeek Harness 插件）

> 一句话：GitHub 相关命令**默认强制走 token 模式**（curl 自动注入 `Bearer $(gh auth token)`、`git clone https` 自动改走 `gh repo clone`、web_fetch 匿名抓 API 被门禁）+ **11 个仓库管理工具**（gh 后端，含 `github_api` 万能入口）。
> 零构建纯 ESM JS；测试 `node --test`（15/15 通过）。

## 为什么需要它

GitHub 匿名 API 限额仅 **60/h**（实测本机代理出口已耗尽），认证后 **5000/h**。但 dsh 的现实约束是：
`GH_TOKEN`/`GITHUB_TOKEN` 环境变量会被子进程凭据擦除（`/KEY|PASSWORD|SECRET|TOKEN/i`），
`web_fetch` 硬性匿名、不带凭据——所以"默认带 token"必须由插件在**两条存活路径**上强制执行：
① `gh` CLI（hosts.yml 免配置认证）；② `$(gh auth token)` 命令替换（**token 值不落入命令字符串** → 不进日志/rtk recall/会话记录）。

## 三层职责

| 层 | 机制 | 行为 |
|---|---|---|
| ① 命令强制层 | `ctx.shell.resolve()` 缝（模型驱动调用） | `curl`/`wget` 打 `api.github.com`/`*.githubusercontent.com` → 注入 `Authorization: Bearer $(gh auth token)` 头；`git clone https://github.com/o/r` → `gh repo clone o/r`；已认证/`gh`/复杂形式一律放行（fail-open） |
| ② web_fetch 门禁 | `tools/pre-execute`（allow/ask/deny） | 抓 API/原始文件主机 → **deny** 并指路 `github_repo_*`/`gh api`（可配 `ask` 交用户审批、`off` 关闭） |
| ③ 仓库管理工具 | `defineTool` 注册（≈2k token schema） | 11 个工具全走 `gh`，输出经 `--jq` 投影裁剪；危险操作双重门禁 |

## 工具集（11 个）

| 工具 | 用途 | 安全边界 |
|---|---|---|
| `github_auth_status` | 认证状态 + 剩余额度（403/429 时先跑它） | 只读 |
| `github_repo_list` | 列仓库（紧凑一行一个） | 只读 |
| `github_repo_search` | 搜索仓库（认证搜索配额 30/min） | 只读 |
| `github_repo_info` | 仓库详情（可见性/默认分支/⭐/topics…） | 只读 |
| `github_repo_clone` | `gh repo clone`（凭据由 gh 托管，argv 无 token） | 本地写 |
| `github_repo_create` | 建库（默认 private） | 加法操作 |
| `github_repo_fork` | fork（可选顺带 clone） | 加法操作 |
| `github_repo_edit` | 改描述/topics/可见性 | 改可见性需 `confirm=OWNER/REPO` |
| `github_repo_archive` | 归档 | 需 `confirm=OWNER/REPO` |
| `github_repo_delete` | **删除仓库** | 双门禁：`allowDelete=true`（部署开关，默认关）+ `confirm=OWNER/REPO` |
| `github_api` | **万能后端**：`gh api` 参数化入口（REST+GraphQL、`jq` 投影、`--paginate` 自动翻页） | 非 GET 需 `confirm="yes"` |

## 安装

```bash
# 前置：gh 已登录（gh auth status）——本机 fengcwf 已就绪
dsh plugin --profile web add /root/.dsh/plugins/dsh-github-ops
# 重启 dsh web 生效（本机用 /root/.dsh/start-dsh.sh）
```

## 配置（cordis.patch.yml → config）

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `ghBin` | `gh` | gh CLI 路径 |
| `enforceCommands` | `true` | 命令强制层开关 |
| `webFetchPolicy` | `deny` | `deny`（强制 token 模式）/`ask`/`off` |
| `registerRepoTools` | `true` | 是否注册 11 个工具 |
| `allowDelete` | `false` | `github_repo_delete` 部署级总开关 |
| `awareness` | `true` | 会话启动注入 GitHub 访问约定 |
| `ghTimeoutMs` | `60000` | 单条 gh 命令超时 |

## 设计来源（社区吸收）

- **github/github-mcp-server**：工具命名与**描述内嵌选型指导**、`--jq`/`fields` 投影裁剪（点名最贵字段）、read-only 与写操作边界、`github_api` 万能入口的哲学（一个参数化入口替代工具 schema 爆炸）
- **gh CLI**：token 免配置（hosts.yml/keyring）、`--jq`/`--template` CLI 侧裁剪、`gh api` 覆盖 REST+GraphQL、`--paginate`/`--slurp` 自动翻页
- **PivotStackIntelligence/dsh-github**（97★）：仓库管理操作面清单、危险写操作显式确认、**无任意 shell 透传**、exit code 显式标注
- **DeepTrial/dsh-bash-rtk**：`resolve()` 改写缝、fail-open、`stdin == null` 守卫
- **fast-bash（pre-tool-hook）**：改写只做安全子集、不确定整体放行（后续可加 `git push --force` → `--force-with-lease` 建议）

**相对 GitHub MCP server 的取舍**：11 个工具 ≈ **2k token** schema vs MCP 默认 45 工具 ≈ **12.8k token/请求**（实测）；需要 MCP 全家桶（issue/PR/Actions 深度操作）时仍可另挂 `dsh-mcp-client`，两者不冲突。

## 验证

```bash
npm run check   # node --check × 3 + node --test（15 测试：门禁矩阵/注入矩阵/clone 改写/双重门禁/jq 裁剪）
```

设计与社区对比全文见 `../11-社区插件调研与设计决策.md`；token/代理机制研究见 `/opt/workdata/公共/dsh-research/09-GitHub调研token与代理默认方案-报告.md`。
