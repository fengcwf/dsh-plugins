---
title: 数据面收口尾项执行报告（旧落点归档 + 过渡容忍清单摘除）
date: 2026-10-07
tags: [wiki-steward, data-closeout, hindsight-sync, dsh-root-lint]
status: active
source: t2 / attempt e446ab02-f0f8-4a90-8ddc-ac3075c32e41
related: [wiki-steward/changes/2026-10-07-hindsight-sync/]
---

# 数据面收口尾项执行报告

- **任务**：t2 — 数据面收口尾项：旧落点归档 + 过渡容忍清单摘除
- **执行人**：mechanic（attempt 1，`e446ab02-f0f8-4a90-8ddc-ac3075c32e41`）
- **执行时间**：2026-10-07 23:21:05 → 23:23（+08:00）
- **结论**：4 步动作全部完成；零新增告警；旧落点未重现（无 NEEDS_HUMAN）

---

## 0. 动手前事实复核（基线取证）

### 0.1 新落点活跃 / 旧落点停写

```console
$ ls -la ~/.dsh/plugins/wiki-steward/data/
-rw-r--r-- 1 root root 345272 Oct  7 23:04 kb-alerts.md
drwxr-xr-x 3 root root   4096 Oct  7 23:20 kb-index

$ ls -la ~/.dsh/plugins/wiki-steward/data/kb-index/
drwxr-xr-x 2 root root 4096 Sep 27 23:34 queue
-rw-r--r-- 1 root root  438 Oct  7 23:20 schedule-ledger.json

$ wc -l ~/.dsh/kb-alerts.md ~/.dsh/plugins/wiki-steward/data/kb-alerts.md
    76 /root/.dsh/kb-alerts.md
  1956 /root/.dsh/plugins/wiki-steward/data/kb-alerts.md

$ tail -2 ~/.dsh/plugins/wiki-steward/data/kb-alerts.md   # 新落点尾条 = 当日
- **2026-10-07T15:04:11.002Z** `summary` committed=1 flushedTurns=3 flushes=1 flushFailures=0 redacted=0 swallowed=0 (redacted:0)

$ tail -2 ~/.dsh/kb-alerts.md                             # 旧落点尾条 = 10-01
- **2026-10-01T07:52:58.999Z** `summary` committed=1 flushedTurns=0 flushes=0 flushFailures=0 redacted=0 swallowed=0 (redacted:0)
- **2026-10-01T08:01:59.002Z** `summary` committed=1 flushedTurns=3 flushes=1 flushFailures=0 redacted=0 swallowed=0 (redacted:0)
```

旧落点 mtime（全部停在 10-01 及更早，距执行时点已 6 天）：

```console
$ stat -c '%n %y' ~/.dsh/kb-alerts.md ~/.dsh/kb-index/schedule-ledger.json \
    ~/.dsh/kb-index/active.db-shm ~/.dsh/kb-index/active.db-wal ~/.dsh/kb-index/queue
/root/.dsh/kb-alerts.md                     2026-10-01 16:01:59.002768081 +0800
/root/.dsh/kb-index/schedule-ledger.json    2026-10-01 16:37:59.018586863 +0800
/root/.dsh/kb-index/active.db-shm           2026-09-30 01:24:35.189030171 +0800
/root/.dsh/kb-index/active.db-wal           2026-09-28 17:39:31.007397174 +0800
/root/.dsh/kb-index/queue                   2026-09-30 10:03:58.407057744 +0800
```

### 0.2 关键约束复核：旧账本独有历史（禁止裸删）

除队长给的 `2026-09-30T02:10:58` 标记外，另做了**逐条时间戳全量比对**（76 条 vs 新账本）：

```console
$ echo -n "旧标记条数: "; grep -c '2026-09-30T02:10:58' ~/.dsh/kb-alerts.md
旧标记条数: 1
$ echo -n "新标记条数: "; grep -c '2026-09-30T02:10:58' ~/.dsh/plugins/wiki-steward/data/kb-alerts.md
新标记条数: 0

$ grep -oE '\[?20[0-9]{2}-[0-9]{2}-[0-9]{2}[T ][0-9:]{8}' ~/.dsh/kb-alerts.md | sort -u > /tmp/old_ts.txt
$ wc -l /tmp/old_ts.txt
76 /tmp/old_ts.txt
$ while read ts; do grep -qF "$ts" ~/.dsh/plugins/wiki-steward/data/kb-alerts.md && echo "DUP: $ts"; done < /tmp/old_ts.txt
（无输出 —— 0 重复）
```

**判定：旧账本 76 条时间戳在新账本全部 0 命中 = 独有历史，必须归档不可删。** 本任务全程只 `mv`，零 `rm`。

---

## 1. 步骤 1 — 旧落点归档 `~/.dsh/_archive-20261007/`

### 1.1 归档前内容指纹

```console
$ md5sum ~/.dsh/kb-alerts.md; wc -l ~/.dsh/kb-alerts.md
27a82f84503faa6c38a3eefdd48850d1  /root/.dsh/kb-alerts.md
76 /root/.dsh/kb-alerts.md
```

### 1.2 执行命令（含防覆盖护栏）

```bash
mkdir -p ~/.dsh/_archive-20261007/
for src in kb-alerts.md kb-index; do
  dst="$HOME/.dsh/_archive-20261007/$src"
  [ -e "$dst" ] && { echo "ABORT: 目标已存在 $dst"; exit 9; }   # 绝不覆盖已有归档
  [ -e "$HOME/.dsh/$src" ] || { echo "ABORT: 源不存在 $HOME/.dsh/$src"; exit 8; }
  mv -n -v "$HOME/.dsh/$src" "$dst"
done
```

### 1.3 输出原文

```console
$ bash 归档脚本
=== mkdir ===
drwxr-xr-x  2 root root 4096 Oct  7 23:21 .          # 归档目录初始为空 = 无覆盖风险

=== mv 逐项 ===
已重命名 '/root/.dsh/kb-alerts.md' -> '/root/.dsh/_archive-20261007/kb-alerts.md'
mv kb-alerts.md -> rc=0
已重命名 '/root/.dsh/kb-index' -> '/root/.dsh/_archive-20261007/kb-index'
mv kb-index -> rc=0
```

### 1.4 归档后校验：内容逐字节完好

```console
$ ls -laR ~/.dsh/_archive-20261007/
/root/.dsh/_archive-20261007/:
-rw-r--r-- 1 root root 9880 Oct  1 16:01 kb-alerts.md
drwxr-xr-x 3 root root 4096 Oct  1 16:37 kb-index

/root/.dsh/_archive-20261007/kb-index:
-rw-r--r-- 1 root root 32768 Sep 30 01:24 active.db-shm
-rw-r--r-- 1 root root     0 Sep 28 17:39 active.db-wal
drwxr-xr-x 2 root root 4096 Sep 30 10:03 queue
-rw-r--r-- 1 root root   426 Oct  1 16:37 schedule-ledger.json

/root/.dsh/_archive-20261007/kb-index/queue:            # 空目录，结构同构保留
（无文件）

$ md5sum ~/.dsh/_archive-20261007/kb-alerts.md; wc -l ~/.dsh/_archive-20261007/kb-alerts.md
27a82f84503faa6c38a3eefdd48850d1  /root/.dsh/_archive-20261007/kb-alerts.md   # = 归档前指纹
76 /root/.dsh/_archive-20261007/kb-alerts.md                                   # = 归档前 76 行

$ ls -la ~/.dsh/kb-alerts.md ~/.dsh/kb-index
ls: cannot access '/root/.dsh/kb-alerts.md': No such file or directory
ls: cannot access '/root/.dsh/kb-index': No such file or directory
```

### 1.5 归档路径清单

| # | 归档前（旧落点） | 归档后 | 大小 | mtime |
|---|---|---|---|---|
| 1 | `~/.dsh/kb-alerts.md` | `~/.dsh/_archive-20261007/kb-alerts.md` | 9880 B / 76 行 | 2026-10-01 16:01 |
| 2 | `~/.dsh/kb-index/schedule-ledger.json` | `~/.dsh/_archive-20261007/kb-index/schedule-ledger.json` | 426 B | 2026-10-01 16:37 |
| 3 | `~/.dsh/kb-index/active.db-shm` | `~/.dsh/_archive-20261007/kb-index/active.db-shm` | 32768 B | 2026-09-30 01:24 |
| 4 | `~/.dsh/kb-index/active.db-wal` | `~/.dsh/_archive-20261007/kb-index/active.db-wal` | 0 B | 2026-09-28 17:39 |
| 5 | `~/.dsh/kb-index/queue/`（空目录） | `~/.dsh/_archive-20261007/kb-index/queue/` | — | 2026-09-30 10:03 |

> 归档方式 = **`kb-index/` 整目录一次 mv**（同构子路径自然保留），`kb-alerts.md` 单文件 mv；全程零 `rm`、零覆盖。

### 1.6 停手条件监控：旧落点未重现

mv 后间隔复检 3 次（23:21:40 / 23:22:46 / 23:23:31）：

```console
$ ls -la ~/.dsh/kb-alerts.md ~/.dsh/kb-index
ls: cannot access '/root/.dsh/kb-alerts.md': No such file or directory
ls: cannot access '/root/.dsh/kb-index': No such file or directory

$ ls -A ~/.dsh/ | grep -E '^kb-(index|alerts)'
无残留
```

**判定：无进程重建旧落点 = 无需 NEEDS_HUMAN，可继续摘清单。**

---

## 2. 步骤 2 — `~/.dsh/AGENTS.md` 过渡容忍行摘除

### 改动前（原文）

```
过渡期容忍（重启数据面收口生效后从清单移除）：`kb-index/` `kb-alerts.md` `login-gate/` `dsh-usage/`
```

### 改动后（原文）

```
过渡期容忍（重启数据面收口生效后从清单移除）：`login-gate/` `dsh-usage/`
```

**摘除 `kb-index/`、`kb-alerts.md`；保留 `login-gate/`、`dsh-usage/`（归 login-gate 管）。**

### 附带必改项：`已知豁免（白名单）` 行（超出字面合同，理由见 §5）

改动前：

```
... `update-gate.sh` `_archive-20260930/`
```

改动后：

```
... `update-gate.sh` `_archive-20260930/` `_archive-20261007/`
```

**理由**：步骤 1 新建的 `~/.dsh/_archive-20261007/` 是根级新条目，不入白名单则 lint 必产出**新增告警**，直接违反验收第 4 步「零新增告警」。沿用 `_archive-20260930/` 先例，且 AGENTS.md 目录归属表本就规定「临时 / 证据产物 → `_` 前缀目录」。

改后关键行实测：

```console
$ grep -n '过渡期容忍（重启\|_archive-2026' ~/.dsh/AGENTS.md
28:`.agent-presets/` ... `update-gate.sh` `_archive-20260930/` `_archive-20261007/`
30:过渡期容忍（重启数据面收口生效后从清单移除）：`login-gate/` `dsh-usage/`
```

---

## 3. 步骤 3 — `/root/bin/dsh-root-lint.sh` LEGACY 数组摘除

### 改动前（原文，第 25–26 行）

```bash
# ── 过渡期容忍（数据面收口重启生效后移除；dsh-usage=已卸载插件孤儿数据，待处置）──
LEGACY=( kb-index kb-alerts.md login-gate dsh-usage )
```

### 改动后（原文，第 25–27 行）

```bash
# ── 过渡期容忍（数据面收口重启生效后移除；dsh-usage=已卸载插件孤儿数据，待处置）──
# 2026-10-07 数据面收口尾项：kb-index/、kb-alerts.md 旧落点已归档 _archive-20261007/，自 LEGACY 摘除
LEGACY=( login-gate dsh-usage )
```

### 附带必改项：ALLOW 白名单（第 22 行）

改动前：`  _archive-20260930`
改动后：`  _archive-20260930 _archive-20261007`

改后实测 + 语法检查：

```console
$ grep -n 'LEGACY=\|_archive-2026' /root/bin/dsh-root-lint.sh
22:  _archive-20260930 _archive-20261007
26:# 2026-10-07 数据面收口尾项：kb-index/、kb-alerts.md 旧落点已归档 _archive-20261007/，自 LEGACY 摘除
27:LEGACY=( login-gate dsh-usage )

$ bash -n /root/bin/dsh-root-lint.sh && echo "syntax OK"
syntax OK
```

---

## 4. 步骤 4 — root-lint 验证

### 4.1 改动前基线（23:22:05，归档已完成、两处清单未改）

```console
$ bash /root/bin/dsh-root-lint.sh
ALERT 白名单外条目 ~/.dsh/_archive-20261007（…）
NOTE  过渡期容忍: dsh-usage（数据面收口重启生效后移出清单）
ALERT 白名单外条目 ~/.dsh/.dshw-size.json（…）
ALERT 白名单外条目 ~/.dsh/.dshw-turn.json（…）
ALERT 白名单外条目 ~/.dsh/.dshw-usage.json（…）
ALERT 白名单外条目 ~/.dsh/.dshw-usage.json.before-recharge-fix.bak（…）
NOTE  过渡期容忍: login-gate（数据面收口重启生效后移出清单）
ALERT 白名单外条目 ~/.dsh/start-dsh.sh.bak-20261006（…）
ALERT 白名单外条目 ~/.dsh/whale-audio（…）
ALERT 白名单外条目 ~/.dsh/whale-bubble-imgs（…）
ALERT 白名单外条目 ~/.dsh/whale-roles（…）
ALERT 白名单外条目 ~/.dsh/.workbuddy-auth.json（…）
ALERT 白名单外条目 ~/.dsh/.workbuddy-catalog.json（…）
ALERT 白名单外条目 ~/.dsh/.workbuddy-host-heartbeat.json（…）
ALERT 白名单外条目 ~/.dsh/.workbuddy-probe.json（…）
---- 巡检完成：白名单外 13 个 / 过渡期容忍 2 个 ----
rc=1
```

> 该 13 项里有 12 项是**本任务之前就存在的告警**（见 4.3 证据），只有 `_archive-20261007` 是步骤 1 新建目录带来的。
> 若把时点推回本任务开始前（23:21，目录尚未创建），基线即为 **白名单外 12 个 / 过渡期容忍 2 个**（kb-index、kb-alerts.md 在 LEGACY 中故为 NOTE）。

### 4.2 改动后（23:22:46，全部 4 步完成）

```console
$ bash /root/bin/dsh-root-lint.sh
NOTE  过渡期容忍: dsh-usage（数据面收口重启生效后移出清单）
ALERT 白名单外条目 ~/.dsh/.dshw-size.json（按 AGENTS.md 目录归属表归位；产物→工作区、脚本→/root/bin、状态→插件 data/）
ALERT 白名单外条目 ~/.dsh/.dshw-turn.json（按 AGENTS.md 目录归属表归位；产物→工作区、脚本→/root/bin、状态→插件 data/）
ALERT 白名单外条目 ~/.dsh/.dshw-usage.json（按 AGENTS.md 目录归属表归位；产物→工作区、脚本→/root/bin、状态→插件 data/）
ALERT 白名单外条目 ~/.dsh/.dshw-usage.json.before-recharge-fix.bak（按 AGENTS.md 目录归属表归位；产物→工作区、脚本→/root/bin、状态→插件 data/）
NOTE  过渡期容忍: login-gate（数据面收口重启生效后移出清单）
ALERT 白名单外条目 ~/.dsh/start-dsh.sh.bak-20261006（按 AGENTS.md 目录归属表归位；产物→工作区、脚本→/root/bin、状态→插件 data/）
ALERT 白名单外条目 ~/.dsh/whale-audio（按 AGENTS.md 目录归属表归位；产物→工作区、脚本→/root/bin、状态→插件 data/）
ALERT 白名单外条目 ~/.dsh/whale-bubble-imgs（按 AGENTS.md 目录归属表归位；产物→工作区、脚本→/root/bin、状态→插件 data/）
ALERT 白名单外条目 ~/.dsh/whale-roles（按 AGENTS.md 目录归属表归位；产物→工作区、脚本→/root/bin、状态→插件 data/）
ALERT 白名单外条目 ~/.dsh/.workbuddy-auth.json（按 AGENTS.md 目录归属表归位；产物→工作区、脚本→/root/bin、状态→插件 data/）
ALERT 白名单外条目 ~/.dsh/.workbuddy-catalog.json（按 AGENTS.md 目录归属表归位；产物→工作区、脚本→/root/bin、状态→插件 data/）
ALERT 白名单外条目 ~/.dsh/.workbuddy-host-heartbeat.json（按 AGENTS.md 目录归属表归位；产物→工作区、脚本→/root/bin、状态→插件 data/）
ALERT 白名单外条目 ~/.dsh/.workbuddy-probe.json（按 AGENTS.md 目录归属表归位；产物→工作区、脚本→/root/bin、状态→插件 data/）
---- 巡检完成：白名单外 12 个 / 过渡期容忍 2 个 ----
rc=1
```

### 4.3 对照判定：零新增告警

| 项 | 任务前基线（23:21 前） | 执行后（23:22:46） | 差 |
|---|---|---|---|
| 白名单外（ALERT） | 12 | 12 | **0** |
| 过渡期容忍（NOTE） | 4（kb-index / kb-alerts.md / login-gate / dsh-usage） | 2（login-gate / dsh-usage） | −2（按合同摘除） |
| 本任务引入的新增告警 | — | — | **0** |

12 项 ALERT 逐条为先例存在的告警（**非本任务产生**），告警账本有 21:45:01 / 22:45:01 两轮 cron 记录，均早于本任务首个动作 23:21:05：

```console
$ grep -n 'dsh-root-lint' ~/.dsh/plugins/wiki-steward/data/kb-alerts.md | grep '2026-10-07 2[12]:45:01'
1935:- [2026-10-07 21:45:01] dsh-root-lint: 白名单外条目 ~/.dsh/start-dsh.sh.bak-20261006（…）
1936:- [2026-10-07 21:45:01] dsh-root-lint: 白名单外条目 ~/.dsh/whale-audio（…）
1937:- [2026-10-07 21:45:01] dsh-root-lint: 白名单外条目 ~/.dsh/whale-bubble-imgs（…）
1938:- [2026-10-07 21:45:01] dsh-root-lint: 白名单外条目 ~/.dsh/whale-roles（…）
1939:- [2026-10-07 21:45:01] dsh-root-lint: 白名单外条目 ~/.dsh/.workbuddy-auth.json（…）
1940:- [2026-10-07 21:45:01] dsh-root-lint: 白名单外条目 ~/.dsh/.workbuddy-catalog.json（…）
1941:- [2026-10-07 21:45:01] dsh-root-lint: 白名单外条目 ~/.dsh/.workbuddy-host-heartbeat.json（…）
1942:- [2026-10-07 21:45:01] dsh-root-lint: 白名单外条目 ~/.dsh/.workbuddy-probe.json（…）
1944:- [2026-10-07 22:45:01] dsh-root-lint: 白名单外条目 ~/.dsh/.dshw-size.json（…）
1945:- [2026-10-07 22:45:01] dsh-root-lint: 白名单外条目 ~/.dsh/.dshw-turn.json（…）
1946:- [2026-10-07 22:45:01] dsh-root-lint: 白名单外条目 ~/.dsh/.dshw-usage.json（…）
1947:- [2026-10-07 22:45:01] dsh-root-lint: 白名单外条目 ~/.dsh/.dshw-usage.json.before-recharge-fix.bak（…）
```

文件 mtime 亦佐证为既有产物（早于本任务）：

```console
$ stat -c '%y %n' ~/.dsh/.dshw-size.json ~/.dsh/start-dsh.sh.bak-20261006 ~/.dsh/whale-audio ~/.dsh/.workbuddy-probe.json
2026-10-06 12:15:06.504794828 +0800 /root/.dsh/.dshw-size.json
2026-10-06 00:58:45.832514569 +0800 /root/.dsh/start-dsh.sh.bak-20261006
2026-09-30 18:59:28.482447462 +0800 /root/.dsh/whale-audio
2026-10-05 23:54:45.633584941 +0800 /root/.dsh/.workbuddy-probe.json
```

### 4.4 ⚠️ 验收偏差说明（须队长知悉）

合同验收原文为「零新增告警（**或仅剩 login-gate/dsh-usage 既有项**）」。

- 「零新增告警」：**已满足**（12 → 12，本任务净增 0；`_archive-20261007` 经白名单补录后不告警）。
- 「仅剩 login-gate/dsh-usage 既有项」：**未满足**——lint 另有 12 条**先例存在的**白名单外告警，属合同未预期的**既有状况**，且全部落在本任务 inScope 之外（`whale-*` / `.dshw-*` / `.workbuddy-*` / `start-dsh.sh.bak-20261006`，均为其他运行时产物，非 kb 旧落点）。
- 因此 `rc=1` 是**先例条件导致**，非本任务改动引入；本任务 4 步动作本身全部成功。
- **处置**：不在本任务内扩scope 处理（安全边界只授权 mv 归档 kb 旧落点，不授权处置上述产物），提请队长另行裁定归属。

---

## 5. 安全边界核对

| 边界 | 状态 | 证据 |
|---|---|---|
| 只 mv 归档，不删任何文件 | ✅ | 全程零 `rm`；`md5 27a82f84503faa6c38a3eefdd48850d1`、76 行归档前后一致 |
| 不覆盖已有归档 | ✅ | 归档目录创建时为空（1.3 输出）；mv 前置 `[ -e "$dst" ] && ABORT` 护栏 |
| 不动 `login-gate/`、`dsh-usage/` | ✅ | `ls -ld` 确认两目录仍在根级且未被 mv；二者保留在 LEGACY |
| 不改 wiki-steward 插件代码 | ✅ | 仅改 `~/.dsh/AGENTS.md` 与 `/root/bin/dsh-root-lint.sh`；monorepo `git status` 中 `wiki-steward/` 仅有既有 `changes/` 文档，无 `lib/`、`web/` 改动 |
| 不重启任何服务 | ✅ | 未执行任何 `start-dsh.sh` / pkill / systemctl |
| 旧落点重现即停手报 NEEDS_HUMAN | ✅ 未触发 | 3 次间隔复检（23:21:40 / 23:22:46 / 23:23:31）均「无残留」 |

### 改动文件清单（全部）

1. `~/.dsh/kb-alerts.md` → `~/.dsh/_archive-20261007/kb-alerts.md`（mv）
2. `~/.dsh/kb-index/` → `~/.dsh/_archive-20261007/kb-index/`（mv）
3. `~/.dsh/AGENTS.md`（编辑：过渡容忍行摘 2 项 + 白名单行补 `_archive-20261007/`）
4. `/root/bin/dsh-root-lint.sh`（编辑：LEGACY 摘 2 项 + ALLOW 补 `_archive-20261007` + 注释 1 行）
5. 本报告文件

### 产出文件路径

- `wiki-steward/changes/2026-10-07-hindsight-sync/reports/data-closeout-report.md`（本文件）
- 归档：`~/.dsh/_archive-20261007/kb-alerts.md`、`~/.dsh/_archive-20261007/kb-index/{schedule-ledger.json,active.db-shm,active.db-wal,queue/}`
