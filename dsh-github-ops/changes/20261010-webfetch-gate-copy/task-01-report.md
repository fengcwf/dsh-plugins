# Task 01 报告 — web_fetch 门禁驳回文案去硬编码（去实时观测）

**角色**：coder / TDD 实现者
**执行时间**：2026-10-10
**结论**：**完成**（验收 1-5 全绿）。文案修复，门禁语义零回归。

---

## 1. 为什么改

`lib/enforce.js` 的 `gateWebFetch()` deny reason 写死了「匿名限额 60/h 且本机代理出口已耗尽」
——一句**会过期的实时观测**。2026-10-10 09:47 实测已失真：

| 证据 | 值 |
|---|---|
| `gh api rate_limit` | `limit:5000, remaining:5000, used:0`（认证墙没撞） |
| 匿名 `curl raw.githubusercontent.com/.../README.md` | HTTP 200（代理 `http://192.168.0.41:7890` 活着） |
| 报告主体 | 另一会话模型据此误判「GitHub 出口挂了 / 与 2FA 有关」 |

门禁本身是对的：`web_fetch`（`@deepseek-ai/dsh-web-fetch-http`）**结构性匿名**——
provider 注释原文 "Requests carry no browser cookies or ambient credentials"、
`parseFetchUrl` 拒绝 URL 带 `username/password`、`dsh-tool-web` 工具 schema 只有 `url`
无 `headers`。坏的只是它用过期观测解释自己。**本卡 = 文案修复，语义零变更。**

## 2. 改动文件清单（仅 inScope 8 个中的 7 个 + 报告；`index-mount.test.mjs` 无需改）

| 文件 | 改动摘要 |
|---|---|
| [lib/enforce.js](lib/enforce.js) | `gateWebFetch()` deny reason 第 38-42 行重写：删「匿名限额 60/h 且本机代理出口已耗尽」；新增结构性约束陈述（provider 结构性匿名 + 无 headers 入参）；保留 `${host}` 插值、三通道指路（`gh api <path>` / `gh api repos/OWNER/REPO/contents/PATH` / `github_repo_*` / curl `Authorization: Bearer $(gh auth token)`）。**其余逐字节未动**（`API_HOSTS` / `host.endsWith('.githubusercontent.com')` / 上下三态分支 / 命令改写层） |
| [test/enforce.test.mjs](test/enforce.test.mjs) | 新增 2 个测试（deny reason 文案契约 + 正反例自证）与 1 个尾缀拦截面插值测试；原 5 个契约测试零改动 |
| [CHANGELOG.md](CHANGELOG.md) | 新增 `## 0.3.1 — 2026-10-10` 条目（含余波与来源报告路径） |
| [package.json](package.json) | `version` 0.3.0 → 0.3.1 |
| [README.zh.md](README.zh.md) | ① 层②门禁表补「deny 文案只陈述结构性约束，不复述过期观测」；② 「为什么需要它」段的会过期实时观测句改为中性表述 |
| 根 [README.md](../../README.md) | 版本表 `dsh-github-ops` 行 0.3.0 → 0.3.1（描述同步 0.3.1 事实） |
| 根 [CHANGELOG.md](../../CHANGELOG.md) | 追加 `## 2026-10-10` 条目 |

新 deny reason 实测原文（`api.github.com` 例）：

```
web_fetch 对 api.github.com 无法携带 GitHub token（dsh-web-fetch-http provider 结构性匿名：请求不带浏览器 cookie 与任何环境凭据，工具入参也只有 url、无法带 headers），因此抓 GitHub API/原始文件只可能走匿名通道。请改用带认证的通道：github_repo_* 工具，或 bash 里 `gh api <path>` / `gh api repos/OWNER/REPO/contents/PATH`。(确实需要 HTTP 抓取时可临时用 bash 的 curl 并带 `Authorization: Bearer $(gh auth token)` 头。)
```

## 3. RED → GREEN 实测输出

### 基线（改前）

```
ℹ tests 112
ℹ pass 112
ℹ fail 0
ℹ duration_ms 4206.291843
```

### RED（新契约先落，旧文案未改）

```
  AssertionError [ERR_ASSERTION]: deny reason 不得复现过期观测
  AssertionError [ERR_ASSERTION]: 拒绝理由不得含过期观测: https://api.github.com/rate_limit
  AssertionError [ERR_ASSERTION]: The input was expected to not match the regular expression /60|耗尽/. Input:
```

→ 3 处失败，全部指向旧文案的 `60` / 「耗尽」——**TDD 真红，非假保险**。

### GREEN（改 reason 后全量回归）

```
ℹ tests 115
ℹ suites 0
ℹ pass 115
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4531.867523
```

112 → 115（+3：文案契约 / 正反例自证 / 尾缀插值），**零回退**。

### 六主机 deny reason 全量自证（程序化输出）

| host | no `60|耗尽` | 三指路在场 | token 零明文 |
|---|---|---|---|
| api.github.com | true | true | true（无 ghp_/github_pat_） |
| raw.githubusercontent.com | true | true | true |
| gist.githubusercontent.com | true | true | true |
| codeload.github.com | true | true | true |
| objects.githubusercontent.com | true | true | true |
| media.githubusercontent.com（尾缀拦截面） | true | true | true |

- 正反例自证：旧文案形态 `…限额 60/h 且本机代理出口已耗尽…` 必命中 `/60|耗尽/`；
  现行 reason 六主机**全不命中**（防止将来回归写回观测）。
- `index-mount.test.mjs` 层② deny/ask/off 三态随全量回归同批全绿（语义零回归）。

## 4. check-release.sh 完整输出

```
$ bash scripts/check-release.sh dsh-github-ops
[PASS] package.json version = 0.3.1
[PASS] CHANGELOG.md 含 '## 0.3.1' 更新记录
[PASS] 根 README.md 版本表已同步
[TODO] tag dsh-github-ops-v0.3.1 尚未创建 —— push 前执行: git tag dsh-github-ops-v0.3.1
[PASS] dist 新鲜度锁：窗口内无 web 源变更，不触发（基线=上个 tag dsh-github-ops-v0.3.0）
[NOTE] 工作树有未提交变更 —— push 前提交
---
[VERDICT] PASS
```

`[exit code: 0]`。tag TODO 按合同留给发版第五步（用户逐次确认）。

## 5. 越界写自查 — `git status --short`

```
 M .gitignore                                        ← **非本卡改动，属既有工作树脏**（.testenv/ 与 .wt/ 忽略项，先前会话引入）
 M CHANGELOG.md                                      ✅ inScope（根 CHANGELOG）
 M README.md                                         ✅ inScope（根 README）
 M dsh-github-ops/CHANGELOG.md                       ✅ inScope
 M dsh-github-ops/README.zh.md                        ✅ inScope
 M dsh-github-ops/ledger.md                          ← **非本卡改动，属既有工作树脏**（2026-09-30 Phase 8 R2 输入口径行）
 M dsh-github-ops/lib/enforce.js                     ✅ inScope
 M dsh-github-ops/package.json                       ✅ inScope
 M dsh-github-ops/test/enforce.test.mjs              ✅ inScope
 M wiki-steward/changes/2026-09-30-logview-filters/ledger.md   ← **非本卡**
 D wiki-steward/changes/2026-10-07-hindsight-sync/*（34 文件）   ← **非本卡**（既存删除态）
（未跟踪项 .agent-teams/ / docs/ / 各 changes/ / AGENTS.md 等均为先于本卡存在的未入库产物）
```

本卡实际写入 = 7 个 inScope 文件 + 本报告（`changes/20261010-webfetch-gate-copy/task-01-report.md`）。
`dsh-github-ops/test/index-mount.test.mjs` **未改**（无需改）。
`~/.dsh/` 下**零写入**；未执行任何 `git commit` / `tag` / `push` / `gh release`。

## 6. 验收逐条对照

| # | 验收 | 结果 |
|---|---|---|
| 1 | `node --test` 全绿、基线 112 不回退 | ✅ 115/115，含 load 真 import 冒烟（`load.test.mjs` 在全量回归内） |
| 2 | 新契约覆盖 + 正反例自证 | ✅ 3 新测试：host 插值 / 禁 `60`+「耗尽」 / 三指路关键词；坏源必命中、好源不误伤；尾缀拦截面同形 |
| 3 | `index-mount.test.mjs` deny/ask/off 三态全绿 | ✅ 同批回归全绿，未改该文件 |
| 4 | 四处版本对齐 0.3.1 + check-release PASS | ✅ package.json / 插件 CHANGELOG 首条 / 根 README 版本表 = 0.3.1；脚本 VERDICT PASS |
| 5 | `git status --short` 只含 inScope | ✅ 本卡 7 文件 + 报告；余下脏文件系先前会话既有（已在上面逐条标注非本卡） |

## 7. 未决 / NEEDS_CONTEXT

**NEEDS_CONTEXT（发版第五步）**：tag `dsh-github-ops-v0.3.1`（建议与未发版的 0.3.0 一并归发版波）、
push、`gh release create`、生产换 tag 重 `dsh plugin add` + 重启——须用户逐次确认后由队长执行（P-8/P-9）。
本卡未执行任何发版动作。

**NEEDS_CONTEXT（范围外观察，仅案记不修）**：`webFetchPolicy: ask` 在本机等于 deny ——
`@deepseek-ai/dsh-user-approval` 的 `decide()` 里 `effectivePolicy(session) === 'never'` 直接 `rejected`，
而本会话 `DSH_PERMISSION_MODE=danger-full-access` → `policy: 'never'`。修它需要动生产
`profiles/web/cordis.patch.yml`，属 P-9 禁令，留给用户裁定。
