# Tester 报告 — Task 01 独立验证（web_fetch 门禁驳回文案去硬编码）

**角色**：tester（真实验证者，只读 + bash 验证，零写入工作树）
**验证时间**：2026-10-10 10:10-10:21（Asia/Shanghai）
**被验对象**：`dsh-github-ops` 0.3.1，`lib/enforce.js` `gateWebFetch()` deny reason 文案修复
**coder 自述**：`changes/20261010-webfetch-gate-copy/task-01-report.md`（结论"完成，验收 1-5 全绿"）

> 立场：**不采信 coder 任何结论，每条自己跑。**本报告所有输出均为本人独立执行所得。

---

## V1 — 测试真绿

### 命令

```bash
cd /opt/workdata/dsh-plugins/dsh-github-ops && node --test
```

### 输出（关键尾部）

```
ℹ tests 115
ℹ suites 0
ℹ pass 115
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4286.738263
[exit code: 0]
```

`load.test.mjs` 在列且通过（TAP reporter 定位行号取证）：

```bash
$ node --test --test-reporter=tap 2>&1 > /tmp/gatecheck-tap.txt
$ grep -n '插件入口可加载' /tmp/gatecheck-tap.txt
500:# Subtest: 插件入口可加载：依赖解析 + 导出契约完整
501:ok 84 - 插件入口可加载：依赖解析 + 导出契约完整
```

单独跑该文件也绿（证明确为真 `import('../lib/index.js')` 冒烟，非共享 fixture 假绿）：

```
$ node --test test/load.test.mjs
✔ 插件入口可加载：依赖解析 + 导出契约完整 (129.710041ms)
ℹ tests 1 / pass 1 / fail 0
```

三个新测试在全量 115 内（TAP 行号 + 名称取证）：

```
# Subtest: deny reason 文案契约（C-4）：结构性约束 + host 插值 + 指路 + 零过期观测
# Subtest: deny reason 正反例自证（C-4）：坏源必命中、好源不误伤
# Subtest: deny reason 对子域主机 same-shape 插值（.githubusercontent.com 尾缀拦截面）
```

**PASS** — tests 115 / pass 115 / fail 0，load 真 import 冒烟 ok 84 在列；112 → 115 未回退。

---

## V2 — 回归判定器真咬（mutation 探针，防假保险）

### 命令

```bash
mkdir -p /tmp/gatecheck && cd /tmp/gatecheck
cp -r .../dsh-github-ops/lib .../dsh-github-ops/test . && cp .../package.json .
cp .../cordis.patch.yml .        # ← 副本必须补：index-mount.test.mjs 读它
ln -s .../dsh-github-ops/node_modules node_modules   # ← 副本必须补：缺则 ERR_MODULE_NOT_FOUND zod
```

副本基线校验（md5 相同后才算有效探针）：

```
04ed634a11064e2cd3beab61bedc013b  /tmp/gatecheck/lib/enforce.js
04ed634a11064e2cd3beab61bedc013b  /opt/workdata/dsh-plugins/dsh-github-ops/lib/enforce.js
```

> 过程实录：初版副本 78 tests / 5 fail —— 全部为 `ERR_MODULE_NOT_FOUND: zod` 与
> `ENOENT: cordis.patch.yml`，即副本环境缺陷而非真回归。补齐 node_modules 与
> cordis.patch.yml 后回到 115/115/0 的干净基线，mutation 探针才具备证明力。

### RED（把 reason 改回含「60」的坏形态）

```python
# 注入：`web_fetch 对 ${host} 无法携带 GitHub token（匿名限额 60/h 且本机代理出口已耗尽）：`
```

```
$ node --test
✖ deny reason 文案契约（C-4）：结构性约束 + host 插值 + 指路 + 零过期观测 (3.812288ms)
✖ deny reason 正反例自证（C-4）：坏源必命中、好源不误伤 (1.722719ms)
✖ deny reason 对子域主机 same-shape 插值（.githubusercontent.com 尾缀拦截面） (2.115781ms)
ℹ tests 115 / pass 112 / fail 3
```

断言逐字命中（非笼统 fail）：

```
AssertionError [ERR_ASSERTION]: deny reason 不得复现过期观测
AssertionError [ERR_ASSERTION]: 拒绝理由不得含过期观测: https://api.github.com/rate_limit
AssertionError: The input was expected to not match the regular expression /60|耗尽/. Input:
'web_fetch 对 media.githubusercontent.com 无法携带 GitHub token（匿名限额 60/h 且本机代理出口已耗尽）：...'
```

### GREEN（还原后）

```
$ cp .../lib/enforce.js lib/enforce.js && node --test
ℹ tests 115 / pass 115 / fail 0
```

**PASS** — 坏形态必红（精确咬住 `/60|耗尽/`，3/3 新测试全挂），还原必绿。**新测试是真保险，不是摆饰。**
工作树文件零改动（md5 复校一致）；探针全程只在 `/tmp/gatecheck/`。

---

## V3 — 六主机文案程序化自证

### 命令

```bash
node /tmp/gatecheck-v3-sixhosts.mjs     # 一次性脚本，直读工作树 lib/enforce.js
```

脚本自身**不 import coder 的任何测试**，直接调 `gateWebFetch()`，逐主机断言 7 项：
`deny` / `!60|耗尽` / `gh api` / `github_repo_` / `Authorization` / reason 含实际注入 host / 无 `ghp_|github_pat_`。

### 输出（关键投影）

```json
"perHost": [
  { "host": "api.github.com",                  "pass": true },
  { "host": "raw.githubusercontent.com",      "pass": true },
  { "host": "gist.githubusercontent.com",     "pass": true },
  { "host": "codeload.github.com",            "pass": true },
  { "host": "objects.githubusercontent.com",  "pass": true },
  { "host": "media.githubusercontent.com",    "pass": true }
],
"detectorBitesStaleCopy": true,   // 旧文案必被 /60|耗尽/ 咬住（反向对照）
"allowCasesIntact": true,         // github.com / nodejs.org / 'not a url' / example.com 仍 allow
"apiHostsSweepIntact": true,      // 六主机拦截面未缩小
"currentEscapes": true,
"overallPass": true
```

六主机 reason 实测首尾两例（余四主机同形，仅 host 插值不同）：

```
web_fetch 对 api.github.com 无法携带 GitHub token（dsh-web-fetch-http provider 结构性匿名：
请求不带浏览器 cookie 与任何环境凭据，工具入参也只有 url、无法带 headers），因此抓 GitHub
API/原始文件只可能走匿名通道。请改用带认证的通道：github_repo_* 工具，或 bash 里
`gh api <path>` / `gh api repos/OWNER/REPO/contents/PATH`。(确实需要 HTTP 抓取时可临时用
bash 的 curl 并带 `Authorization: Bearer $(gh auth token)` 头。)
```

**PASS** — 6/6 主机 deny + 零过期观测 + 三通道指路 + host 动态注入 + token 零明文；
旧文案反向必中，普通网页放行语义未受损。

---

## V4 — 语义零回归（constitution C-3）

### 命令

```bash
cd /opt/workdata/dsh-plugins && git diff dsh-github-ops/lib/enforce.js
```

### 输出（diff 全文）

```diff
@@ -35,9 +35,11 @@ export function gateWebFetch(url) {
     return {
       action: 'deny',
       reason:
-        `web_fetch 对 ${host} 只能匿名访问（无法携带 GitHub token，匿名限额 60/h 且本机代理出口已耗尽）。` +
+        `web_fetch 对 ${host} 无法携带 GitHub token（dsh-web-fetch-http provider 结构性匿名：` +
+        '请求不带浏览器 cookie 与任何环境凭据，工具入参也只有 url、无法带 headers），' +
+        '因此抓 GitHub API/原始文件只可能走匿名通道。' +
         '请改用带认证的通道：github_repo_* 工具，或 bash 里 `gh api <path>` / `gh api repos/OWNER/REPO/contents/PATH`。' +
-        '(确实需要匿名抓取时可临时用 bash 的 curl 并带 `Authorization: Bearer $(gh auth token)` 头。)',
+        '(确实需要 HTTP 抓取时可临时用 bash 的 curl 并带 `Authorization: Bearer $(gh auth token)` 头。)',
     }
   }
   return { action: 'allow' }
 }
```

### 逐行核对结论

hunk 头 `@@ -35,9 +35,11 @@` 声明上下文起于第 35 行，上下文行（无 ± 前缀）**逐字节未动**：

| 语义项 | 状态 | 证据 |
|---|---|---|
| `API_HOSTS` 清单 | **未变** | 位于第 10-16 行，diff hunk 起始于 35 行，完全不在改区内；diff 的 ± 行中 grep `API_HOSTS` 零命中 |
| deny/ask/off 三态 | **未变** | enforce.js 本无三态分支（三态在 index.js），本函数只产 deny/allow，两分支原样在场 |
| `host.endsWith('.githubusercontent.com')` | **未变** | 上下文行 `if (API_HOSTS.includes(host) \|\| host.endsWith('.githubusercontent.com')) {` 无 ± 前缀 |
| `${host}` 插值 | **未变且仍动态** | 变更行仍是 `` `web_fetch 对 ${host} 无法携带…` ``（反引号模板串），V3 六主机实测各自注入实际 host |
| `action: 'deny'` / `return { action: 'allow' }` | **未变** | 两行均为无 ± 前缀的上下文行 |
| `rewriteGithubCommand` / `targetsGithubApi` | **未变** | 位于第 49 行之后，diff 无任何后续 hunk；V1 全量回归内 6 个相关测试（curl 注入 / wget / git clone / gh 放行 / targetsGithubApi 等）全绿 |

### index.js 门禁接线

```bash
$ git diff --stat dsh-github-ops/lib/index.js
（无输出）
```

```bash
$ grep -n 'gateWebFetch\|webFetchPolicy\|pre-execute' lib/index.js
36:  webFetchPolicy: z.enum(['deny', 'ask', 'off']).default('deny'),
87:  // ── ② web_fetch 门禁（pre-execute 只有 allow/ask/deny 三种决策，正好够用）──
88:  if (config.enabled && config.webFetchPolicy !== 'off') {
92:        const gate = gateWebFetch(String(url ?? ''))
94:          return config.webFetchPolicy === 'deny'
```

**PASS** — 唯一改动是 reason 字符串文案；所有语义行逐字节未动，index.js 接线零 diff。
`index-mount.test.mjs` 亦未改（`git diff --stat` 无输出），其层② deny/ask/off 三态测试随全量回归同批绿。

---

## V5 — 越界写

### 本卡造成的脏（7 个 inScope 文件，mtime 09:59:46-10:02:59，即本卡执行窗口内）

```
2026-10-10 09:59:46  dsh-github-ops/test/enforce.test.mjs
2026-10-10 10:00:32  dsh-github-ops/lib/enforce.js
2026-10-10 10:01:24  dsh-github-ops/package.json
2026-10-10 10:02:06  dsh-github-ops/README.zh.md
2026-10-10 10:02:20  dsh-github-ops/CHANGELOG.md
2026-10-10 10:02:28  README.md（根）
2026-10-10 10:02:59  CHANGELOG.md（根）
```

与合同 inScope 清单**逐条吻合**（合同允许 8 个，实际改 7 个；`test/index-mount.test.mjs` 未改，与报告自述一致且经 `git diff --stat` 证实）。

### 先于本卡存在的既存脏（mtime 2026-10-09 14:06:46，早于 HEAD 提交 09-34 之后的 14:06，非本卡窗口）

```
2026-10-09 14:06:46  .gitignore
2026-10-09 14:06:46  dsh-github-ops/ledger.md
2026-10-09 14:06:46  wiki-steward/changes/2026-09-30-logview-filters/ledger.md
```

以及 `wiki-steward/changes/2026-10-07-hindsight-sync/*` 整批 34 文件删除态（目录已不在盘上，与派单前告知的"已知先存脏"一致）。

### 未跟踪项（`??`）

大量 `changes/` `docs/` `.agent-teams/` 等未入库产物（含本卡 `dsh-github-ops/changes/20261010-webfetch-gate-copy/`），
均属先前会话与本卡的文档产物，**不是代码越界写**。

### 生产位检查

```bash
$ find /root/.dsh/plugins/dsh-github-ops -newermt '-3 hours' -type f | grep -v node_modules | wc -l
0
$ find /root/.dsh/plugins/dsh-github-ops -type f | xargs stat -c '%y %n' | sort | tail -5
2026-09-30 17:13:18  /root/.dsh/plugins/dsh-github-ops/ledger.md
2026-09-30 00:22:33  ...（全部 09-23 / 09-30 时间戳）
```

`~/.dsh/plugins/dsh-github-ops/` 3 小时内零写入；最晚 mtime 是 09-30，即生产安装位未被本卡触碰
（它仍停留在旧版 0.3.0 快照，符合"改动只经发版链路流入生产"的裁定）。
3 小时内 `/root/.dsh` 下的其他变动（`dsh-clsh-search` 整批 lib 文件、`plugins/.git` refs、
`profiles/web/` 的 pnpm 日志）均为**今天 10:06 的 `git fetch` / 插件市场活动**，非 coder 写生产代码：
`profiles/web/cordis.patch.yml` mtime 08:59:44（早于本卡 09:59 启动），且其中 grep `github-ops` 零命中。

**PASS** — 本卡只写 7 个 inScope 文件 + 报告；既有脏文件全部有 mtime 证据归因于先前会话；
生产位（`~/.dsh/plugins/`、`profiles/web/`）零写入。`git commit` / `tag` / `push` / `gh release` 均未执行。

---

## V6 — 版本四处对齐为 0.3.1

### 命令与输出

```bash
$ grep -m1 '"version"' dsh-github-ops/package.json
  "version": "0.3.1",

$ grep -m1 '^## ' dsh-github-ops/CHANGELOG.md
## 0.3.1 — 2026-10-10

$ grep -n 'dsh-github-ops' README.md | head -3
9:| [dsh-github-ops](dsh-github-ops/) | 0.3.1 | GitHub 集成：… 0.3.1=修复 web_fetch 门禁 deny 文案的过期观测硬编码… |

$ head -8 CHANGELOG.md | grep -n '2026\|dsh-github-ops'
5:## 2026-10-10
6:- `dsh-github-ops` **0.3.1（文案修复，语义零回归）**：web_fetch 门禁 `gateWebFetch()` 的 deny reason 原硬编码「匿名限额 60/h 且本机代理出口已耗尽」… 测试 112 → 115/115 …
```

四处全部为 0.3.1：`package.json` version / 插件 `CHANGELOG.md` 首条 / 根 `README.md` 版本表第 9 行 / 根 `CHANGELOG.md` 首条 2026-10-10 条目。

**PASS**

---

## V7 — check-release

### 命令

```bash
cd /opt/workdata/dsh-plugins && bash scripts/check-release.sh dsh-github-ops
```

### 输出

```
[PASS] package.json version = 0.3.1
[PASS] CHANGELOG.md 含 '## 0.3.1' 更新记录
[PASS] 根 README.md 版本表已同步
[TODO] tag dsh-github-ops-v0.3.1 尚未创建 —— push 前执行: git tag dsh-github-ops-v0.3.1
[PASS] dist 新鲜度锁：窗口内无 web 源变更，不触发（基线=上个 tag dsh-github-ops-v0.3.0）
[NOTE] 工作树有未提交变更 —— push 前提交
---
[VERDICT] PASS
[exit code: 0]
```

`[VERDICT] PASS`。tag TODO 与"工作树未提交" NOTE 属预期项（发版第五步留用户逐次确认），不算失败。

**PASS**

---

## 汇总表

| # | 验证项 | 结论 | 一句话证据 |
|---|---|---|---|
| V1 | 测试真绿 | **PASS** | `node --test` → tests 115 / pass 115 / fail 0；load 真 import 冒烟 ok 84 在列且单跑也绿 |
| V2 | 判定器真咬 | **PASS** | /tmp 副本注入「60/h 耗尽」坏形态 → 3 个新测试精确红（`/60\|耗尽/` 断言原文命中），还原回 115/115 |
| V3 | 六主机自证 | **PASS** | 独立脚本 6/6 主机 deny + 无过期观测 + 三指路 + host 插值 + token 零明文；普通网页仍 allow |
| V4 | 语义零回归 | **PASS** | diff 仅 reason 4 行文案；`API_HOSTS`/`endsWith`/`${host}`/deny-allow 分支/命令改写层逐字节未动；index.js diff 空 |
| V5 | 越界写 | **PASS** | 本卡 7 个 inScope 文件（mtime 09:59-10:02）；3 个先存脏有 10-09 mtime 证据；`~/.dsh/plugins/dsh-github-ops` 3h 内 0 写入 |
| V6 | 版本四对齐 | **PASS** | package.json / 插件 CHANGELOG 首条 / 根 README 第 9 行 / 根 CHANGELOG 首条 = 0.3.1 |
| V7 | check-release | **PASS** | `[VERDICT] PASS`，exit 0；仅 tag TODO 与未提交 NOTE（均为预期项） |

## verdict: **PASS**

coder 的自述**逐条被独立复现，无一项造假或夸大**：
"文案修复、门禁语义零回归、测试 112→115 全绿、四处版本对齐、check-release PASS、零越界写"——
七项验证全部由本人亲手跑出相同结果。

补充确认（超出 V1-V7 但影响判定）：V2 的 mutation 探针证明新测试**真能咬**（不是走过场的假保险）——
这是最容易被"测试全绿"表象掩盖的风险点，已排除。

## NEEDS_CONTEXT

无阻塞项。以下为**范围外观察**（仅案记，非本卡 FAIL）：

1. **发版第五步未执行**（非本卡范围）：tag `dsh-github-ops-v0.3.1` 与 0.3.0 尚未创建，push /
   `gh release create` / 生产换 tag 重装均待用户逐次确认。生产安装位
   `~/.dsh/plugins/dsh-github-ops/` 仍为旧版 0.3.0 快照（mtime 09-30）——即**修复尚未到达
   其他会话可见的运行时**，那句误导文案在安装位仍然活着。这是修复落地前必须补的一环。
2. **`webFetchPolicy: ask` 在本机等于 deny**（coder 报告已案记，本人从 index.js:94 的
   `webFetchPolicy === 'deny' ? … : …` 结构确认其存在，未改动也无权改动）：
   修它需动生产 `profiles/web/cordis.patch.yml`，属 P-9 禁令，留给用户裁定。

## 边界遵守自证

- 工作树零写入：所有探针与脚本均在 `/tmp/`（`/tmp/gatecheck/`、`/tmp/gatecheck-v3-sixhosts.mjs`、
  `/tmp/gatecheck-tap.txt`、`/tmp/gatecheck-v1-full.tap`）；报告落点属任务指定交付物。
- 未执行任何 `git commit` / `tag` / `push` / `gh release`。
- 未修任何东西——包括 mutation 探针注入的坏形态，也在 /tmp 副本内还原，未触碰工作树。
