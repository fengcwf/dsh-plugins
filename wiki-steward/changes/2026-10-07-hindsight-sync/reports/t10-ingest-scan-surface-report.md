---
title: t10 ingest-pipeline 扫描面适配 + raw 落点目录就绪
date: 2026-10-08
tags: [wiki-steward, hindsight-sync, ingest-pipeline, scan-dirs, u1]
status: active
source: t10 / attempt cb2e7989-40a9-44f2-a6bb-05ed57b1f863
related: [wiki-steward/changes/2026-10-07-hindsight-sync/]
---

# t10 — ingest-pipeline 扫描面适配（SCAN_DIRS+06-hindsight）+ raw 落点就绪

- **任务**：t10（派单标题 t11 ingest-pipeline 扫描面适配）
- **执行人**：mechanic，attempt 1，`cb2e7989-40a9-44f2-a6bb-05ed57b1f863`
- **执行时间**：2026-10-08 17:22 → 17:26（+08:00）
- **结论**：全部验收项通过 —— 备份已建、diff 恰 1 行新增、scan 含 `06-hindsight` 且 exit 0、raw 目录已建且无 `.md`、wiki-lint 输出与基线**逐行完全一致（零新增报错）**

---

## 0. 前置事实复核

```console
$ ls -la /opt/Workspace/scripts/obsidian/ingest-pipeline.py
-rw------- 1 root root 8266 Sep 27 01:05 /opt/Workspace/scripts/obsidian/ingest-pipeline.py

$ cd /opt/Workspace && git status --porcelain -- scripts/obsidian/ingest-pipeline.py
?? scripts/obsidian/ingest-pipeline.py          # 确认 untracked，不可 git 回滚 → 必须文件级备份

$ ls -d /mnt/unraid_data/Obsidian/raw/06-*
ls: cannot access '/mnt/unraid_data/Obsidian/raw/06-*': No such file or directory   # 建前不存在
```

改前 `SCAN_DIRS` 原文（第 31–40 行）：

```python
# 扫描的子目录（排除非知识源）
SCAN_DIRS = [
    "01-articles",
    "02-papers",
    "03-transcripts",
    "04-session_logs",
    "05-holographic",
    "05-kanban",
    "projects",  # 2026-09-26：只收 */fix-notes/ 修复记录（裁决 A=丙；项目文档存量冻结只读）
]
```

---

## 1. 改前备份（验收项 1）

### 命令

```bash
S=/opt/Workspace/scripts/obsidian/ingest-pipeline.py
B="$S.bak-20261008"
[ -e "$B" ] && { echo "ABORT 备份已存在"; exit 9; }   # 防覆盖护栏
cp -p "$S" "$B"
```

### 输出原文

```console
=== 改前 md5 ===
5330e15bb9323b7d23c8a9bdc6099658  /opt/Workspace/scripts/obsidian/ingest-pipeline.py
=== 备份（防覆盖） ===
cp rc=0
-rw------- 1 root root 8266 Sep 27 01:05 /opt/Workspace/scripts/obsidian/ingest-pipeline.py.bak-20261008
=== 备份 md5 ===
5330e15bb9323b7d23c8a9bdc6099658  /opt/Workspace/scripts/obsidian/ingest-pipeline.py.bak-20261008
=== md5 一致校验 ===
MD5_MATCH_OK
=== git 状态复核（untracked） ===
?? scripts/obsidian/ingest-pipeline.py
```

| 文件 | 大小 | mtime | md5 |
|---|---|---|---|
| `ingest-pipeline.py.bak-20261008`（备份，改前原样） | 8266 B | 2026-09-27 01:05 | `5330e15bb9323b7d23c8a9bdc6099658` |
| `ingest-pipeline.py`（改后） | 8382 B | 2026-10-08 17:24 | `f30c04a06d08686785e7d03d6f461015` |

> 备份用 `cp -p` 保留原 mtime/权限（`-rw-------`），确保备份即「改前原样」。

---

## 2. 白名单改动（验收项 2：恰 1 处新增）

### diff 原文（备份 vs 改后）

```console
$ diff -u ingest-pipeline.py.bak-20261008 ingest-pipeline.py
--- /opt/Workspace/scripts/obsidian/ingest-pipeline.py.bak-20261008	2026-09-27 01:05:05.054856308 +0800
+++ /opt/Workspace/scripts/obsidian/ingest-pipeline.py	2026-10-08 17:24:41.378961352 +0800
@@ -36,6 +36,7 @@
     "04-session_logs",
     "05-holographic",
     "05-kanban",
+    "06-hindsight",  # 2026-10-08：Hindsight 记忆同步产物落点（U1 链路，空目录也须在扫描面）
     "projects",  # 2026-09-26：只收 */fix-notes/ 修复记录（裁决 A=丙；项目文档存量冻结只读）
 ]
```

### 变更行统计

```console
$ diff "$B" "$S" | grep -c '<'   # 删除行
0
$ diff "$B" "$S" | grep -c '^>'   # 新增行
1
```

**判定：`diff` = 恰 1 处白名单新增、0 删除、单 hunk（`@@ -36,6 +36,7 @@`），无其他改动。** 注释行采用与既有 `projects` 条目一致的行内 `# 日期：说明` 风格；插入位置按序号排在 `05-kanban` 之后、`projects` 之前，保持列表数字序。

### 改后 SCAN_DIRS 原文（第 31–41 行）

```python
# 扫描的子目录（排除非知识源）
SCAN_DIRS = [
    "01-articles",
    "02-papers",
    "03-transcripts",
    "04-session_logs",
    "05-holographic",
    "05-kanban",
    "06-hindsight",  # 2026-10-08：Hindsight 记忆同步产物落点（U1 链路，空目录也须在扫描面）
    "projects",  # 2026-09-26：只收 */fix-notes/ 修复记录（裁决 A=丙；项目文档存量冻结只读）
]
```

### 语法自检

```console
$ python3 -m py_compile ingest-pipeline.py
py_compile OK
```

---

## 3. raw 落点目录就绪（验收项 3）

### 命令与输出原文

```console
=== 建前检查 ===
ls: cannot access '/mnt/unraid_data/Obsidian/raw/06-hindsight': No such file or directory
mkdir rc=0
=== 建后 ls -la ===
total 0
drwxrwxrwx 2 root root 0 Oct  8 17:25 .
drwxrwxrwx 2 root root 0 Oct  8 17:25 ..
=== 确认无 .md ===
0
=== raw 顶层 ===
drwxrwxrwx 2 root root 0 Jun  7 06:02 02-papers
drwxrwxrwx 2 root root 0 Oct  8 17:25 06-hindsight
```

**判定：仅 `mkdir`，目录为空，`find 06-hindsight -name '*.md' | wc -l = 0` —— 无任何 `.md`，不会被 ingest 当素材误收。**

---

## 4. 验收 scan（验收项 4）

### 4.1 合同 Verify 命令原文输出

```console
$ python3 /opt/Workspace/scripts/obsidian/ingest-pipeline.py scan --summary 2>&1 | tail -8
   🆕 [projects] 2026-09-28-修复记录-kb-context-b1b2.md (2026-09-28 19:06)
   🆕 [projects] 2026-09-29-修复记录-kb-context-设置面ux.md (2026-09-29 12:12)
   🆕 [projects] 2026-10-06-修复记录-kb-context-触发日志050.md (2026-10-06 00:49)
   🆕 [projects] 2026-09-29-b2-effect-fix.md (2026-09-29 18:32)
   🆕 [projects] 2026-10-04-rtk-selfheal-reinstall.md (2026-10-04 18:08)
   🆕 [projects] 2026-09-29-github-ops-settings-fixes.md (2026-09-29 23:56)
   🆕 [projects] 2026-09-29-设置面与认证优化-修复记录.md (2026-09-29 22:56)
   🆕 [projects] 2026-10-01-修复记录-dsh-clsh-search-v0.1.0.md (2026-10-01 15:49)
rc=0
```

> ⚠️ **`tail -8` 截断说明（须知悉）**：`06-hindsight` 出现在**完整输出的第 2 行**（`扫描目录:` 行），而 `tail -8` 只保留末 8 行 —— 被 491 条「待编译文件」明细占满，故该截断视图看不到 `06-hindsight`。这是**输出截断所致，不是白名单未生效**。完整输出与专门取证见 4.2 / 4.3。建议验收改用 `| head -3` 或 `| grep -n 06-hindsight` 才能稳定命中。

### 4.2 完整输出头部（`06-hindsight` 在面的直接证据）

```console
$ python3 ingest-pipeline.py scan --summary 2>&1 | head -3
📊 Ingest Pipeline Scan
   扫描目录: 01-articles, 02-papers, 03-transcripts, 04-session_logs, 05-holographic, 05-kanban, 06-hindsight, projects
   总文件数: 632

$ python3 ingest-pipeline.py scan --summary 2>&1 | grep -c '06-hindsight'
1
```

**判定：`扫描目录:` 行已含 `06-hindsight`，且列表从改前 7 项增至 8 项。**

改前基线对照（同命令）：

```console
   扫描目录: 01-articles, 02-papers, 03-transcripts, 04-session_logs, 05-holographic, 05-kanban, projects
   总文件数: 632
```

### 4.3 空目录直扫（0 文件也在面）

```console
$ python3 ingest-pipeline.py scan --summary --source 06-hindsight
📊 Ingest Pipeline Scan
   扫描目录: 06-hindsight
   总文件数: 0
   已编译:   0
   待编译:   0

✅ 无待编译文件
source rc=0
```

**判定：空目录 = 0 文件，目录本身仍在扫描面，exit 0。**

### 4.4 exit 0 与总数不变

```console
$ python3 ingest-pipeline.py scan --summary 2>&1 | tail -8 ; echo "verify rc=${PIPESTATUS[0]}"
verify rc=0
   总文件数: 632        # 与改前基线一致（空目录不引入文件，无副作用）
```

---

## 5. wiki-lint 不破（验收项 5）

### 命令

```bash
python3 wiki-lint.py check > /tmp/wikilint-baseline.txt   # 改前基线
python3 wiki-lint.py check > /tmp/wikilint-after.txt      # 改后
diff /tmp/wikilint-baseline.txt /tmp/wikilint-after.txt
```

### 输出原文

```console
=== 基线 wiki-lint check ===
rc=0
   …（46 行）
📊 健康度: 88/100
   孤岛页: 0
   断链:   86
   无FM:   11
   脏文件: 0
   INDEX:  1

=== 改后 wiki-lint check ===
rc=0
=== 与基线逐行 diff ===
IDENTICAL（零差异）
=== 新增报错行（> 应为 0） ===
0
```

**判定：改后输出与基线逐行完全一致，新增报错行 = 0，两次 `rc=0`。**

### 方向性佐证（`check_config_dir_references` 读 AGENTS.md，本步未动 AGENTS.md）

```console
$ grep -n 'CONFIG_FILES' wiki-lint.py
43:CONFIG_FILES = ["AGENTS.md"]
```

- 本任务 In scope 不含 `AGENTS.md`，实际也未改动（`changedPaths` 见 §7），故该项零影响 —— 实测与基线逐行相同即为佐证。
- `check_expected_dirs` 的 `expected_dirs` 清单中不含 `raw/06-hindsight`，因此**新增目录不会改变该检查的 ok/fail 计数**（实测输出一致）。

### 已知副作用（工具自身行为，非本步改动面）

`wiki-lint.py check` 每次运行会自行重写 `/mnt/unraid_data/Obsidian/wiki/lint-report.md`（mtime 更新为 17:25）。这是 lint 工具的固有输出行为，基线运行同样会写；其**内容指标与基线逐行一致**，不在本任务改动面内，也未被本任务编辑。

---

## 6. 验收项逐条核对

| # | 验收项 | 状态 | 证据 |
|---|---|---|---|
| 1 | 改前 `cp … .bak-20261008` 同目录 + md5 记录进报告 | ✅ passed | 备份建于同目录、`cp -p` 保留 mtime；改前/备份 md5 同为 `5330e15bb9323b7d23c8a9bdc6099658`，`MD5_MATCH_OK`；已记入 §1 表 |
| 2 | 改后 diff 与备份比对 = 恰 1 处白名单新增（加 `"06-hindsight"`，注释风格与既有条目一致） | ✅ passed | `diff -u` 单 hunk `@@ -36,6 +36,7 @@`，新增行 1 / 删除行 0；行内 `# 2026-10-08：…` 风格对齐 `projects` 条目 |
| 3 | 验收 scan 输出含 `06-hindsight` 目录项（空目录 0 文件也须在面）；exit 0 | ✅ passed | 完整输出第 2 行 `扫描目录: … 05-kanban, 06-hindsight, projects`（grep 计数 1）；`--source 06-hindsight` 直扫显示 `扫描目录: 06-hindsight`/`总文件数: 0`/exit 0；`scan --summary` exit 0（`verify rc=0`）。⚠️ 合同 Verify 的 `\| tail -8` 因 491 条待编译明细截断看不到该行，见 §4.1 说明 |
| 4 | `mkdir /mnt/unraid_data/Obsidian/raw/06-hindsight/`（只建目录、不落 `.md`，`ls -la` 佐证） | ✅ passed | `mkdir rc=0`；`ls -la` 显示空目录仅 `.` `..`；`find -name '*.md' \| wc -l = 0` |
| 5 | wiki-lint 相关检查零新增报错（`check_config_dir_references` 方向实测佐证） | ✅ passed | 改前/改后两次 `wiki-lint.py check` 输出 **IDENTICAL**，新增行计数 0，两次 rc=0；`CONFIG_FILES=["AGENTS.md"]` 且本步未改 AGENTS.md |
| 6 | 报告落盘：备份 md5、改前改后 diff 原文、scan --summary 输出原文、mkdir/ls 佐证 | ✅ passed | 本文件 §1 md5 表、§2 diff 原文、§4 scan 原文、§3 mkdir/ls 原文 |

---

## 7. 改动文件清单

| 路径 | 操作 | 说明 |
|---|---|---|
| `/opt/Workspace/scripts/obsidian/ingest-pipeline.py` | 编辑（+1 行） | `SCAN_DIRS` 新增 `"06-hindsight"`（untracked，已备份） |
| `/opt/Workspace/scripts/obsidian/ingest-pipeline.py.bak-20261008` | 新建（备份） | 改前原样，md5 `5330e15bb9323b7d23c8a9bdc6099658` |
| `/mnt/unraid_data/Obsidian/raw/06-hindsight/` | 新建（仅目录） | 空目录，无 `.md` |
| `wiki-steward/changes/2026-10-07-hindsight-sync/reports/t10-ingest-scan-surface-report.md` | 新建 | 本报告 |

**未改动**：`AGENTS.md`、`wiki-lint.py`、`raw/` 下任何 `.md`、任何 wiki 页面；未重启任何服务。

### 回滚方式

```bash
cp -p /opt/Workspace/scripts/obsidian/ingest-pipeline.py.bak-20261008 \
      /opt/Workspace/scripts/obsidian/ingest-pipeline.py
rmdir /mnt/unraid_data/Obsidian/raw/06-hindsight     # 空目录可直接 rmdir
```

### 产出文件路径

- `wiki-steward/changes/2026-10-07-hindsight-sync/reports/t10-ingest-scan-surface-report.md`（本文件）
- 备份：`/opt/Workspace/scripts/obsidian/ingest-pipeline.py.bak-20261008`
- 落点目录：`/mnt/unraid_data/Obsidian/raw/06-hindsight/`
