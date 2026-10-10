# Task 02 报告 — deny reason 哨兵从字面枚举升级为结构性规则

- **卡**：Task 02（finding F-1 修复），变更 `20261010-webfetch-gate-copy`
- **执行者**：coder / TDD 实现者（通用 subagent 行承载）
- **日期**：2026-10-10
- **结论**：✅ 完成。`node --test` 115 → **120/120** 全绿；三个 mutation 探针（新数字 `5000/h` / 旧数字 `60/h` / 状态词 `本机代理出口已耗尽`）**逐一必红**（分别 5 / 5 / 4 测试失败），还原回全绿；`check-release.sh` `[VERDICT] PASS`（version 仍 0.3.1，未 bump）；工作树零污染（探针全程在 `/tmp/`，md5 前后对照）。

---

## 1. finding F-1 的理解

Task 01 reviewer 的 finding（medium）：`test/enforce.test.mjs:6` 的哨兵是**字面枚举**，不是结构性规则：

```js
const STALE_OBSERVATION = /60|耗尽/
```

队长已实测复现盲区：把 reason 改成「…只可能走匿名通道（**当前匿名限额 5000/h**）」——一个"看起来就是今天真值"的新数字——`node --test` **仍然 115/115 全绿**，哨兵咬不住。

**根因**：字面枚举只保护它*认识*的字。它有两个方向的漏洞：

1. **数字可换**：60/h → 5000/h → 任何新配额都不命中。
2. **词可换**：「耗尽」→「限流 / 不可用 / 波动 / 超时 / 故障」全都不命中（F-1 说的「漏网类」）。

更根本的是：这类回归**必然反复发生**，因为写 reason 的人总想"给模型多一点有用信息"，而配额数字和出口状态是手边最容易拿到、看起来最具体的素材。所以只有把判据从"这几个字"改成"**这类东西**"才能结构性堵住——否则 Task 03、Task 04 还会再换一个写法绕过去。

**本次只修哨兵，不动 reason**：`lib/enforce.js` 现行文案我逐字读过（上文 read 输出，37–42 行），确认它是干净的结构性表述——只陈述"web_fetch 无法携带 GitHub token"（provider 注释 + 工具入参只有 url 无 headers），**零数字、零状态断言**。改它属于 Scope Creep，不碰。

---

## 2. 设计方案：三族结构性规则

判据从"哪个字不能说"改为"**禁止任何运行时才知道、随时间过期的观测混进 reason**"，拆成三个正交语义族：

| 族 | 管辖形态 | 正则源 |
|---|---|---|
| **A 定量断言** | 数字 + 量纲组合：多少 / 每小时 / 多少次 / 百分比 | `\d+\s*/\s*h\b` \| `\d+\s*次` \| `\d+\s*个` \| `\d+\s*%` \| `\d+\s*(?:hours?\|minutes?\|seconds?)\b` |
| **B 配额语境裸数字** | 配额词与裸数字同子句相邻（两个方向都管：额度在前 / 数字在前） | `(?:限额\|配额\|额度\|上限\|频率\|速率)[^。；\n\d;]{0,6}\d` \| `\d[^。；\n\d;]{0,6}(?:限额\|配额\|…\|频率\|速率)` |
| **C 实时状态断言** | 观测/时间标记（当前/现在/实测/本机/最新/截至…）与「基础设施或配额主体」同现；或状态词（耗尽/限流/不可用/波动/故障/超时/…英文）与基础设施或配额主体**双向相邻**（前后两方向） | `(?:当前\|…\|最新)[^。；\n]{0,10}(?:出口\|…\|quota\|rate ?limit\|egress\|proxy\|耗尽\|…)` \| `(?:出口\|…)[^。；\n]{0,8}(?:耗尽\|…)` \| `(?:耗尽\|…)[^。；\n]{0,8}(?:出口\|…)` |

合成哨兵 = 三族并集（旧名 `STALE_OBSERVATION` 保留，语义已换代）；另暴露 `familiesHitting(text)` 报告**哪些族**咬住，供结构性互证用。

### 为什么这是"结构性"而不是"更长的枚举"

1. **在语义类层面定义，不在词表层面**。同一族里没枚举过的新词会被自动咬住：A 族不关心是 `5000/h` 还是 `4128/h`；B 族不关心文字方向是"配额 5000"还是"5000 配额"；C 族咬的是「**观测标记/状态词** + **基础设施/配额主体**共现」这个**关系**，所以「本机代理出口已**耗尽**」里"耗尽"换任何词（限流/波动/不可用）都照样红。
2. **三族正交**，可证明互不冗余（测试 `哨兵三族结构性互证`）：
   - `本机代理出口已耗尽` → **只有 C 命中**（证明 C 不是 A/B 的装饰，是独立管辖类）；
   - `已用配额 4200` → **只有 B 命中**（证明 B 不是 A 的子集——A 管单位，B 管无单位语境）；
   - `匿名限额 5000/h` → **A+B 双命中**（带单位配额数字两族共管，纵深冗余）。
3. **假阳性为零**：结构性文案（"工具入参只有 url、带不了 headers"、"只认带认证的调用方式"这种永不过期的判据）不命中任何族——测试用六主机实测 reason + 两个**同义改写变体**双证（否则哨兵只是个换了写法的禁字表，仍会被新写法穿过）。
4. **同现窗口 + 子句边界**（`[^。；\n]{0,8}`）而不是全句匹配：避免"整个 reason 里有配额词也有数字就整体误伤"，同时保证同子句的定量配对被咬住。

---

## 3. 改动 diff 摘要

只改两个文件（`lib/enforce.js` / `package.json` 未动，见 §5）：

**`test/enforce.test.mjs`**（+20 行净增，5 个新测试，原有 10 个测试全部保留原语义）：

- 哨兵区替换为三族常量 + `FAMILIES` + `familiesHitting()` + 合成 `STALE_OBSERVATION`（保留旧名，注释交代 F-1 教训与升级理由）。
- `deny reason 文案契约（C-4）`：负向断言从单条 `doesNotMatch(stale)` 改为**逐族** `doesNotMatch`（A / B / C 各自独立把门，一条过了不代表全过）。
- `deny reason 正反例自证（C-4）`：反例断言从「stale 命中」改为「`familiesHitting(stale).length > 0`」（证明是族在管，不靠运气）；正例从六主机含一条重复的 gist 清理为 `API_HOST_URLS`（六台，补上 `media.githubusercontent.com`，与验收标准第 3 条对齐）；新增两个结构性改写同义变体不误伤断言。
- **新增 5 个测试**：
  1. `哨兵 A/B 族负例：新配额数字 5000/h 与旧配额数字 60/h 逐个必命中`（队长实测的盲区形态排在最前）
  2. `哨兵 C 族负例：出口/代理状态词与观测标记逐个必命中`（强制 `hits.includes('C-live-state')`，防 C 族被 A/B 借刀）
  3. `哨兵泛化反例：同类回归写法逐个被咬住`（实时速率 50 次/s、已用配额 4200、匿名额度 4800/h、成功率 99% —— 均非已知旧形态）
  4. `哨兵三族结构性互证：各管各的类、互不冗余`（`deepEqual(familiesHitting(x), [...])` 精确到族）
  5. `现行 deny reason 零数字`（结构性文案最强护栏：reason 禁任何数字，序数写中文即可）

**`CHANGELOG.md`**：在 `## 0.3.1` 条目内**追加一行**本次加固（版本号不变，仍是 0.3.1），注明旧哨兵→新哨兵、盲区实测、115→120、reason 零改动、来源报告路径。

**未改**：`lib/enforce.js`（Task 01 已留下的结构性文案，本卡明确不动）、`package.json`、`lib/index.js`、`API_HOSTS`、三态、`rewriteGithubCommand`、`targetsGithubApi`、README / README.zh.md / 根 CHANGELOG。

---

## 4. RED → GREEN 证据

### 4.1 baseline（Task 01 终点态，未动 reason）

```
$ cd /opt/workdata/dsh-plugins/dsh-github-ops && node --test
ℹ tests 115
ℹ pass 115
ℹ fail 0
```

### 4.2 mutation 探针（核心验收）

探针副本 `/tmp/task02-probe/`（`cp -r lib test cordis.patch.yml package.json CHANGELOG.md` + `ln -s node_modules`，避开 `ERR_MODULE_NOT_FOUND: zod` 与 `ENOENT: cordis.patch.yml` 环境性 fail）。副本 baseline 先自证 120/120 全绿，再逐个注入。

**Mutant 1 — 新数字 `5000/h`（队长实测旧哨兵全绿的那个形态）**

```
$ python3 - <<'PY'   # '因此抓 GitHub API/原始文件只可能走匿名通道。' +
                     # → '因此抓 GitHub API/原始文件只可能走匿名通道（当前匿名限额 5000/h）。' +
$ node --test
ℹ tests 120
ℹ pass 115
ℹ fail 5
✖ failing tests:
✖ deny reason 文案契约（C-4）：结构性约束 + host 插值 + 指路 + 零实时可变量
✖ deny reason 正反例自证（C-4）：旧形态必命中、六主机好源不误伤
✖ 哨兵三族结构性互证：各管各的类、互不冗余（不是一条大枚举）
✖ 现行 deny reason 零数字：结构性文案不含任何数字量纲
✖ deny reason 对子域主机 same-shape 插值（.githubusercontent.com 尾缀拦截面）
```

**Mutant 2 — 旧数字 `60/h`（Task 01 已知形态，回归保护）**

```
$ python3 - <<'PY'   # …只可能走匿名通道（当前匿名限额 5000/h）。
                     # → …只可能走匿名通道（匿名限额 60/h）。
$ node --test
ℹ tests 120
ℹ pass 115
ℹ fail 5
✖ failing tests:
✖ deny reason 文案契约（C-4）：结构性约束 + host 插值 + 指路 + 零实时可变量
✖ deny reason 正反例自证（C-4）：旧形态必命中、六主机好源不误伤
✖ 哨兵三族结构性互证：各管各的类、互不冗余（不是一条大枚举）
✖ 现行 deny reason 零数字：结构性文案不含任何数字量纲
✖ deny reason 对子域主机 same-shape 插值（.githubusercontent.com 尾缀拦截面）
```

**Mutant 3 — 状态词 `本机代理出口已耗尽`**

```
$ python3 - <<'PY'   # …只可能走匿名通道（匿名限额 60/h）。
                     # → …只可能走匿名通道，本机代理出口已耗尽。
$ node --test
ℹ tests 120
ℹ pass 116
ℹ fail 4
✖ failing tests:
✖ deny reason 文案契约（C-4）：结构性约束 + host 插值 + 指路 + 零实时可变量
✖ deny reason 正反例自证（C-4）：旧形态必命中、六主机好源不误伤
✖ 哨兵三族结构性互证：各管各的类、互不冗余（不是一条大枚举）
✖ deny reason 对子域主机 same-shape 插值（.githubusercontent.com 尾缀拦截面）
```

> 三形态失败数不同（5/5/4）因为 mutant 3 不含数字，所以「零数字」测试不触发——符合族分工预期，正是结构性（不是一刀切）的证据。

**还原**

```
$ cp /opt/workdata/dsh-plugins/dsh-github-ops/lib/enforce.js lib/enforce.js
$ md5sum lib/enforce.js
04ed634a11064e2cd3beab61bedc013b  lib/enforce.js
$ node --test
ℹ tests 120
ℹ pass 120
ℹ fail 0
```

### 4.3 工作树 `node --test` 尾部汇总（最终态）

```
$ cd /opt/workdata/dsh-plugins/dsh-github-ops && node --test
ℹ tests 120
ℹ suites 0
ℹ pass 120
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4115.866021
```

（115 → 120：净 +5，含 `test/load.test.mjs` 真 `import('../lib/index.js')` 冒烟与 `index-mount.test.mjs` deny/ask/off 三态零回归。）

---

## 5. 反面证据：md5 前后对照 + 工作树零污染

baseline（动手前）与结束态对照：

```
$ md5sum -c /tmp/task02-baseline.md5
lib/enforce.js: OK            ← 本卡未改（预期）
test/enforce.test.mjs: FAILED ← 本卡唯一改动
CHANGELOG.md: FAILED          ← 本卡 inScope 追加一行
package.json: OK              ← 本卡未改（预期）
md5sum: WARNING: 2 computed checksums did NOT match
```

`lib/enforce.js` 与 `package.json` 的 md5 与动手前**逐字节一致**——探针全程只在 `/tmp/task02-probe/`，工作树零污染。

⚠️ **一个必须说明的现象**：`git status --short` 里 `lib/enforce.js` 与 `package.json` 显示 `M`，但**这不是本卡改的**。`git diff lib/enforce.js` 内容确认那是 **Task 01** 留下的 reason 文案替换（`60/h 且本机代理出口已耗尽` → 结构性表述），本卡 md5 前后 OK 可证。Task 01 未 commit，故仍留在 dirty 列表。根 `README.md` 已不在 dirty 列表（并发会话已 commit），符合预期；但根 `CHANGELOG.md` 与 `.gitignore` 仍是 `M`（属并发会话的 commit 范围，**我没有动它们**，也未去动）。

---

## 6. `check-release.sh` 输出

```
$ cd /opt/workdata/dsh-plugins && bash scripts/check-release.sh dsh-github-ops
[PASS] package.json version = 0.3.1
[PASS] CHANGELOG.md 含 '## 0.3.1' 更新记录
[PASS] 根 README.md 版本表已同步
[TODO] tag dsh-github-ops-v0.3.1 尚未创建 —— push 前执行: git tag dsh-github-ops-v0.3.1
[PASS] dist 新鲜度锁：窗口内无 web 源变更，不触发（基线=上个 tag dsh-github-ops-v0.3.0）
[NOTE] 工作树有未提交变更 —— push 前提交
---
[VERDICT] PASS
```

version 仍报 **0.3.1**（未 bump，符合"同一轮修复内的测试加固"口径）；tag TODO 是发版第五步的前置项，按铁律第 4 条**未执行**（git commit/tag/push/gh release 一律留给用户逐次确认）。

---

## 7. `git status --short` 输出

（插件目录内，`-- lib test CHANGELOG.md package.json` 限定）

```
 M CHANGELOG.md
 M lib/enforce.js
 M package.json
 M test/enforce.test.mjs
```

- `test/enforce.test.mjs`、`CHANGELOG.md` = 本卡 inScope（预期在此）。
- `lib/enforce.js`、`package.json` = Task 01 遗留未 commit（**非本卡改动**，md5 已证）。若已有并发会话 commit 过这两项，它们在 dirty 列表里消失属正常。
- 根 `README.md` 已不在 dirty 列表（并发会话 commit 过）；根 `CHANGELOG.md`、`.gitignore` 仍是 `M`，属并发会话范围，本卡未触碰。

---

## 8. 验收标准逐条对照

| # | 标准 | 结果 |
|---|---|---|
| 1 | `node --test` 全绿（118+，含 load 冒烟） | ✅ **120/120**（115 → 120，净 +5；含 `load.test.mjs` 真 import 冒烟） |
| 2 | mutation 探针三形态逐一必红 + 还原回绿 + 工作树零改动（md5 对照） | ✅ 5 / 5 / 4 失败；还原 120/120；`lib/enforce.js` md5 前后 OK |
| 3 | 现行 reason 六主机全部不命中哨兵 | ✅ `api.github.com` / `raw.` / `gist.` / `codeload.` / `objects.` / `media.` 六台逐台 `doesNotMatch` + `familiesHitting == []` 双证 |
| 4 | `check-release.sh` `[VERDICT] PASS`，version 仍 0.3.1 | ✅ PASS，0.3.1 |
| 5 | `git status --short` 只含 inScope 文件 | ✅ 插件内 4 个 M 中 2 个属本卡、2 个为 Task 01 遗留（已说明，未动）；根 README 已由并发会话 commit 移出 |

---

## 9. NEEDS_CONTEXT

无 blocker。两点记录性说明（不影响交付）：

1. `lib/enforce.js` 与 `package.json` 的 dirty 状态是 **Task 01 遗留未 commit**，不是本卡改动（md5 前后一致，diff 内容也确认是 Task 01 的 reason 替换）。**本卡未执行任何 git 写操作**（无 commit/tag/push/gh release），按铁律发版第五步留用户逐次确认。
2. 哨兵的 B 族用「配额词」作锚点（限额/配额/额度/上限/频率/速率 + `quota`/`rate limit`）。若未来出现一个**不带任何配额词、也不带单位**的裸数字混进 reason，B 族咬不住——但这正是新增测试`现行 deny reason 零数字`（reason 禁任何数字）兜底的那类：结构性文案不需要数字，序数写中文即可。该口径是刻意从严，若队长认为过严可再议。
3. `test/enforce.test.mjs` 中 A 族的 `\d+\s*个` 会命中「工具入参也只有 url、无法带 headers」吗？——不会，正则要求**前面有数字**（`\d+\s*个` 需数字打头），现行 reason 无数字，实测 120/120 已证。
