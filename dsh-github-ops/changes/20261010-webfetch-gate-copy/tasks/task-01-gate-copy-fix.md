# Task 01 — Phase 8 R2：web_fetch 门禁驳回文案去硬编码 + ask 分支在 never 审批下的诚实化

## 角色与职责

你 = **coder（TDD 实现者）**。按 RED→GREEN 垂直切片执行，不跳测试先写实现。
禁止自行 push / tag / `gh release` / 改 `~/.dsh` 任何文件。

## 合同（Objective）

修复 `dsh-github-ops` web_fetch 门禁的**驳回文案硬编码实时观测结论**问题：`lib/enforce.js`
的 `gateWebFetch()` 拒绝理由里写死了「匿名限额 60/h 且本机代理出口已耗尽」——这是一句
**会随时间过期的观测陈述**，实测（2026-10-10 09:47）已失真：

| 证据 | 值 |
|---|---|
| `gh api rate_limit` | `limit:5000, remaining:5000, used:0`（匿名墙没撞） |
| 匿名 `curl raw.githubusercontent.com/.../README.md` | HTTP 200（代理 `http://192.168.0.41:7890` 活着） |
| 报告主体 | **另一台会话的模型**因看到这句误判「GitHub 出口挂了 / 与 2FA 有关」 |

真实问题只有一个，且是**结构性**的：`web_fetch`（`@deepseek-ai/dsh-web-fetch-http`）
provider 注释原文 "Requests carry no browser cookies or ambient credentials"、
`parseFetchUrl` 拒绝 URL 带 `username/password`、`dsh-tool-web` 的工具 schema 只有
`url` 一个入参（无 `headers`）——**物理上带不了 token**。所以门禁本身是正确设计，
坏的只是它用过期观测数据解释自己。

## 范围（inScope）

只允许改这些文件（workspace = `/opt/workdata/dsh-plugins`）：

- `dsh-github-ops/lib/enforce.js` — `gateWebFetch()` 的 reason 文案
- `dsh-github-ops/test/enforce.test.mjs` — 契约随文案调整（见验收 2）
- `dsh-github-ops/test/index-mount.test.mjs` — 仅在需要时
- `dsh-github-ops/CHANGELOG.md` — 新增 `## 0.3.1` 条目
- `dsh-github-ops/package.json` — `version` 0.3.0 → 0.3.1
- `dsh-github-ops/README.zh.md` — 同步 web_fetch 门禁行描述
- 仓库根 `README.md` — 版本表 `dsh-github-ops` 行同步到 0.3.1
- 仓库根 `CHANGELOG.md` — 追加 0.3.1 条目

## 明确禁止（outOfScope）

- ❌ **不要改门禁语义**：`API_HOSTS` 清单、deny/ask/off 三态、`host.endsWith('.githubusercontent.com')`
  一律不动（constitution C-3：四层语义零回归）。这是**文案修复**，不是功能变更。
- ❌ 不要动 `lib/index.js` 的门禁接线（`tools/pre-execute`）。
- ❌ 不要把 `raw.githubusercontent.com` 从清单移除（那是 P-1 越权，constitution 里 P-1 是
  「删除或覆盖 constitution.md 约束条款」；且弱化 token 强制的方案已被用户否决）。
- ❌ 不要改 `~/.dsh/` 下任何文件（constitution P-9：服务存活期禁写生产
  `profiles/web/cordis.patch.yml`，LRN-033；也不许动 `~/.dsh/plugins/`）。
- ❌ 不要 `git commit` / `git tag` / `git push` / `gh release create`（发版第五步由用户逐次确认）。
- ❌ 不要引入任何新依赖。

## 文案要求（新 reason 必须同时满足）

1. **陈述结构性约束，不陈述实时观测**：说明 web_fetch 无法携带 GitHub token（这是设计事实），
   **但不写**「60/h 已耗尽」「本机代理出口已耗尽」这类会过期的量化观测。
2. **保留指路**：`gh api <path>` / `gh api repos/OWNER/REPO/contents/PATH` /
   `github_repo_*` 工具 / `curl` 带 `Authorization: Bearer $(gh auth token)` 头。
3. **token 零明文**：新文案里绝不出现 `ghp_` / `github_pat_` / 任何真实 token 值（P-5）。
4. **保留 host 插值**：`${host}` 必须仍是动态注入的（便于定位是哪个主机被拦）。
5. 中文表述，风格与原文案一致（指路明确、不训话）。

参考方向（不是定稿，你可微调措辞，但五条硬要求都要满足）：

> `web_fetch 无法携带 GitHub token（$web-fetch-http provider 结构性匿名、无 headers 入参），抓 GitHub API/原始文件必然走匿名限额。请改用带认证的通道：github_repo_* 工具，或 bash 里 gh api <path> / gh api repos/OWNER/REPO/contents/PATH。（确实需要 HTTP 抓取时可临时用 bash 的 curl 并带 Authorization: Bearer $(gh auth token) 头。）`

## 验收标准（Acceptance）

1. `cd /opt/workdata/dsh-plugins/dsh-github-ops && node --test` **全绿**（含 load 真 import 冒烟）；
   基线是 112/112，不得回退。
2. `test/enforce.test.mjs` 覆盖**新契约**：deny reason
   a. 含 `${host}` 实际注入值；
   b. **不含**数字限额断言 `60`、**不含**「耗尽」字样；
   c. 含指路关键词（`gh api`、`github_repo_`、`Authorization`）。
   用**正反例自证**：坏源（写`60/h 耗尽`）必命中、好源（新文案）不误伤。
3. `node --test` 里 `index-mount.test.mjs` 层② 的 deny/ask/off 三态仍全绿（语义零回归）。
4. 四处版本对齐：`package.json` = `CHANGELOG.md` 首条 = 根 `README.md` 版本表 = `0.3.1`；
   `bash /opt/workdata/dsh-plugins/scripts/check-release.sh dsh-github-ops` **PASS**。
5. `git -C /opt/workdata/dsh-plugins status --short` 只含上列 inScope 文件（无越界写）。

## 已知上下文（不必重新调研）

- 生产 `profiles/web/cordis.patch.yml` **没有** github-ops 配置行；`--dump-config` 里的
  `webFetchPolicy: deny` 来自**包内自带** `cordis.patch.yml`。这是「其他会话」撞门的直接原因。
- `webFetchPolicy: ask` 在本机**等于 deny**：`@deepseek-ai/dsh-user-approval` 的 `decide()`
  里 `if (this.effectivePolicy(session) === 'never') return 'rejected'`，而本会话
  approval policy 已是 `never`（`DSH_PERMISSION_MODE=danger-full-access` → `--dump-config`
  显示 `policy: 'never'`）。这条**不是本卡范围**（P-9 禁改生产 patch），仅案记。
- 报错逐字出自 `lib/enforce.js:36-41`；安装位与本 checkout 的 `enforce.js` 逐字节相同。

## 交付物

- 代码 + 测试改动（inScope 清单）
- 报告落 `changes/20261010-webfetch-gate-copy/task-01-report.md`：改了什么、为什么、
  `node --test` 实际输出行数、`check-release.sh` 输出、正反例自证结果

## 卡点回报

若任一验收无法满足 → 在 task-01-report.md 写 `NEEDS_CONTEXT: <具体卡点>` + `SPLIT 建议`，
不要停摆等待。禁止 `ask_user_question`（运行时会拒绝）。
