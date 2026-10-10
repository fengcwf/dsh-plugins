# 文档一致性 + 流程合规审查（review-docs.md）

**角色**：reviewer（文档一致性 + 流程合规双轴）
**执行**：2026-10-10 12:10（Asia/Shanghai）
**被审对象**：`dsh-github-ops` 0.3.1（web_fetch 门禁 deny 文案去硬编码）

> **执行路径说明（重要）**：本卡原计划派 subagent 执行，**连续两次 run failed**
> （中断一次 + 失败一次）。按铁律 7（不连续撞墙 → 换策略）+ 派发纪律
> （单卡 ≥3 个独立关注点先拆再派），改为：**代码正确性/安全轴派 reviewer 子代理**
> （review-code.md，verdict pass），**文档/流程轴由队长亲自跑**（本文件）——
> D1-D4 全部是只读 bash + grep，属协调者可自干的轻活，不触 IL-3（不写代码）。
> 声明：本文件的 D1-D4 输出**全部由队长亲手跑出**，非转述。

---

## D1 — 版本四处对齐（constitution C-5）

| # | 位置 | 命令 | 实测值 | 结论 |
|---|---|---|---|---|
| a | `dsh-github-ops/package.json` | `grep -m1 '"version"'` | `"version": "0.3.1"` | ✅ |
| b | `dsh-github-ops/CHANGELOG.md` | `grep -m1 '^## '` | `## 0.3.1 — 2026-10-10` | ✅ |
| c | 根 `README.md` 版本表 | `grep -n 'dsh-github-ops'` 第 9 行 | `\| 0.3.1 \|` 且描述含 0.3.1 事实 | ✅ |
| d | 根 `CHANGELOG.md` | `sed -n '1,8p'` | `## 2026-10-10` → `dsh-github-ops` **0.3.1（文案修复，语义零回归）** | ✅ |

**内容一致性核对**（防止"号对齐但说错事"）：
- README 声称「测试 112→115」↔ 插件 CHANGELOG 声称「112 → 115/115」
  ↔ 根 CHANGELOG 声称「`node --test` 112 → **115/115**」
  ↔ **队长实测** `node --test` → `tests 115 / pass 115 / fail 0`。**四处说法与实测一致**。
- 四处对缺陷的描述口径一致（旧文案硬编码实时观测 → 新文案只陈述结构性约束；语义零回归）。

**结论：PASS。**

---

## D2 — 插件 README.zh.md 两处同步

`git diff dsh-github-ops/README.zh.md` 只有两个 hunk，与自述的"两处"吻合：

1. **「为什么需要它」段**：
   - 旧：`GitHub 匿名 API 限额仅 **60/h**（实测本机代理出口已耗尽），认证后 **5000/h**。`
   - 新：`GitHub 匿名 API 的平台限额远低于认证后的 5000/h。`
   - 判定 ✅：删掉了两个会过期的可变量（具体数字 60 + "本机出口已耗尽"状态），
     保留结构性事实（匿名限额低于认证限额）。且**没有**顺手改成"5000/h"这种新数字。
2. **层②门禁表**：追加「deny 文案只陈述结构性约束（web_fetch 无法携带 GitHub token），
   不复述会过期的实时限额观测」——与 `lib/enforce.js` 实际新行为逐字一致。

**残留检查**（队长实测）：
```bash
grep -n "60/h\|耗尽\|只能匿名" dsh-github-ops/README.zh.md
```
`[exit code: 1]` = **零命中**，无残留过期表述。

**结论：PASS。**

---

## D3 — 越界写（本卡造成 vs 先存脏）

### 合同 inScope 8 文件核对

| 文件 | mtime | 是否本卡窗口内（10-10 09:55-10:25） |
|---|---|---|
| `dsh-github-ops/lib/enforce.js` | 10-10 10:00 | ✅ 本卡 |
| `dsh-github-ops/test/enforce.test.mjs` | 10-10 09:59 | ✅ 本卡 |
| `dsh-github-ops/test/index-mount.test.mjs` | 09-29 18:14 | 未改（`git diff --stat` 无输出）✅ 符合自述 |
| `dsh-github-ops/CHANGELOG.md` | 10-10 10:02 | ✅ 本卡 |
| `dsh-github-ops/package.json` | 10-10 10:01 | ✅ 本卡 |
| `dsh-github-ops/README.zh.md` | 10-10 10:02 | ✅ 本卡 |
| 根 `README.md` | 10-10 **11:28** | ⚠️ 见下 F-DOC-1 |
| 根 `CHANGELOG.md` | 10-10 10:02 | ✅ 本卡 |

### 意外发现 — F-DOC-1（并发会话把我们的未发版改动 commit 走了）

`README.md` mtime 是 **11:28**（晚于本卡 10:25 收工），且 `git diff README.md` **当前为空**
——我们的 0.3.1 版本表行**已被并发会话的 commit 收走**：

```
commit 3c7272f（2026-10-10 11:32:02）
  "release: obsidian-web 0.3.1 — 修 0.3.0 引入的大纲被挤到左下"
  README.md                 | 4 ++--
  obsidian-web/CHANGELOG.md | 5 +++++
  obsidian-web/README.md    | 4 ++--
  obsidian-web/package.json | 2 +-
```

`git show HEAD:README.md | grep -c '0.3.1=修复 web_fetch 门禁 deny 文案'` = **1**
（我们那行确实在 HEAD 里）。

**脱节事实**：根 README 现在写着 `dsh-github-ops 0.3.1`，但 `dsh-github-ops` 的
**代码未提交、tag 未创建、release 未发、生产安装位仍是 0.3.0 快照**
（`~/.dsh/plugins/dsh-github-ops/` 6h 内零写入，`--dump-config` 合成值仍来自包内 0.3.0 patch）。

这正是 retrospective 记的教训复现：**并行会话共用 repo 期间，审查必须 commit-scoped**
（"BASE..HEAD 区间混入他人提交，实测 5 commit 中 3 个是别人的"）。本卡正版演。

### 越界判定

- 本卡**自己**写入的 = 合同 inScope 内的 7 个文件 + 3 份报告（task-01/tester/review）。
- 根 `README.md` 的写入内容属 inScope，只是**提交动作被并发会话代为完成**——不是本卡越界写，
  但造成了 F-DOC-1 的版本脱节。
- `.gitignore`（mtime 11:56）与 `wiki-steward/*`、`dsh-github-ops/ledger.md` 的改动
  均**非本卡**（`.gitignore` diff 是 `.testenv/`、`dsh-wechat-clawbot/data/`、`.wt/` 忽略项，
  与其他会话的 obsidian-web 波同源；ledger mtime 10-09 14:06）。

**结论：PASS（本卡无越界写），但 F-DOC-1 记入 findings。**

---

## D4 — 流程红线合规

| 检查 | 命令 | 实测 | 结论 |
|---|---|---|---|
| D4-1 生产安装位零写入 | `find /root/.dsh/plugins/dsh-github-ops -newermt '-6 hours' -type f` | 空 | ✅ P-9 红线未破 |
| D4-2 生产 profile patch 无 github-ops 行 | `grep -c 'github-ops' /root/.dsh/profiles/web/cordis.patch.yml` | `0` | ✅ 未热改生产 patch |
| D4-3 生产 patch mtime | `stat -c '%y'` | 2026-10-10 **11:13:57** | ⚠️ 见 F-DOC-2 |
| D4-4 tag 未提前创建 | `git tag --list 'dsh-github-ops-v0.3.1'` | 空（只有 v0.3.0） | ✅ 发版第五步留用户确认 |
| D4-5 未自行 commit | `git log --oneline -1` | `3c7272f` obsidian-web（他人） | ✅ 本卡未 commit |

### 意外发现 — F-DOC-2（生产 patch 在 11:13 被动过，但与本卡无关）

`/root/.dsh/profiles/web/cordis.patch.yml` mtime = **11:13:57**，在其后 12 分钟的
11:32 出现了 obsidian-web 的 release commit。**P-9 红线是"服务存活期写生产
`profiles/web/cordis.patch.yml`"**——需判定这是否违规。

判定依据：
- `grep -c 'github-ops'` = 0 → 本次写入**没有碰 github-ops 行**；
- 与本卡无关（本卡 10:25 已收工，且本卡全程未写 `/root/.dsh/`）；
- 时间线与 obsidian-web 的 0.3.1 发版吻合（tag/push/gh release 用户已授权，
  发布后通常要同步生产）。**这属于并发会话的生产发布动作，不是本卡违纪**。

但它是**一条待确认事实**：若那是"服务存活期写生产 patch"，则违反 P-9/LRN-033；
若那是"重启前"或"用户空档经确认"的动作，则合规。本卡无权判定，记 NEEDS_HUMAN。

**结论：D4-1/2/4/5 PASS（本卡未破任何红线）；D4-3 派生 F-DOC-2，升级给用户。**

---

## Findings

### F-DOC-1 — medium：根 README 已写 0.3.1，但插件未发版（版本脱节）

- **severity**：medium（不影响代码正确性，但让 README 说了未兑现的话）
- **file**：根 `README.md:9`（已由 3c7272f 提交）
- **problem**：根 README 版本表声称 `dsh-github-ops 0.3.1`，但该插件的代码未 commit、
  tag `dsh-github-ops-v0.3.1` 未创建、release 未发、生产安装位仍是 0.3.0 快照。
  任何人现在按 README 装 `#dsh-github-ops-v0.3.1` 会直接失败（tag 不存在）。
- **requiredFix**：发版第五步补齐（commit → tag v0.3.1 → push → `gh release create`）之前，
  README 那一行属于"预告"。要么尽快发版让它成真，要么把 README 行回退到 0.3.0。
  **建议：尽快发版**——代码已全绿并经双审，README 已预告。
- **备注**：这是并发会话代为提交造成的，不是本卡写错。

### F-DOC-2 — low（待用户确认，非本卡责任）：生产 cordis.patch.yml 11:13 被写

- **severity**：low
- **file**：`/root/.dsh/profiles/web/cordis.patch.yml`（mtime 11:13:57）
- **problem**：P-9 红线禁止服务存活期写该文件（LRN-033 热重载拆活树）。11:13 的写入
  时间线与 obsidian-web 0.3.1 发版吻合（本卡 10:25 已收工，全程未碰 `/root/.dsh/`）。
- **requiredFix**：请用户确认该次写入是否在用户空档/重启窗口内经确认执行。
  若是服务存活期热写，需按 LRN-033 复盘；若是正常发布流程，则无需动作。

---

## verdict: needs_revision

**理由**：本卡的 D1-D4 审核项本身**全部 PASS**（四处版本对齐、README 同步到位、
零过期残留、本卡无越界写、未提前 commit/tag/release）。
但审查过程中查出 **F-DOC-1**：根 README 已宣称 0.3.1 而插件**尚未发版**——
这属于"文档说了未兑现的话"，`needs_revision` 的 requiredFix 明确且单一：
**补齐发版第五步**（或回退 README 行）。

F-DOC-2 不阻断（非本卡责任、待用户确认），仅如实上报。

## NEEDS_HUMAN

1. **发版第五步授权**（P-8/P-9 边界）：是否现在执行
   `git commit`（仅 dsh-github-ops inScope 文件）→ `git tag dsh-github-ops-v0.3.1`
   → `git push` → `gh release create` → 生产换 tag 重装 + 重启？
   注意：根 README/CHANGELOG 已被并发会话提交，**commit 时只需纳入 github-ops 的 7 个文件**，
   避免与 obsidian-web 波交叉。
2. **确认 F-DOC-2**：`/root/.dsh/profiles/web/cordis.patch.yml` 11:13:57 的写入
   是否为你授权的正常发布动作（obsidian-web 0.3.1）？若是服务存活期热写，需按 LRN-033 复盘。
