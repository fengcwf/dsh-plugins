# 0.8.1 报告：sha256 frontmatter 引号归一（t22，R-27②）

- **日期**：2026-10-09（hindsight-sync 波次）
- **任务**：t22（kind=implementation，attempt 1）
- **症状**（ingest 首跑诊断 R-27②）：`raw/06-hindsight/` 4 文件恒报 re_ingest（假阳性）——frontmatter `sha256` 值带引号，ingest 脚本 parse 出的 stored 永远≠实算 body sha256。

## 一、双责任面说明（比 R-27 更准的责任判定）

| 责任 | 面 | 缺陷 | 修复 |
|---|---|---|---|
| **主责** | `ingest-pipeline.py` `parse_frontmatter`（全 vault frontmatter 通用面） | 只 split 行、**不去引号** → 任何带引号的标量值（YAML 标面形式）parse 后保留引号字节 → stored≠实算 → 恒报 re_ingest | 标量值成对单/双引号 strip（仅 frontmatter 标量域）——恰 1 处语义 diff |
| **次责** | `lib/hindsight-sync.js:125`（hindsight 产物写面） | `sha256: ${yq(sha256)}` 给**纯 hex** 值加引号——无必要且违 `mark.js:15-16`「key: value 形」既定口径 | sha256 模板改裸值（`sha256: ${sha256}`）；title/date/tags/latest_timestamp 等真需引号的保持 `yq()` |
| 存量 | `raw/06-hindsight/` 4 文件（dsh-plugins×2、公共×2） | 旧产物沿用引号形 | migration：字节手术去引号（自愈例外，见下） |

引擎读写自洽说明：`readExistingHash` 正则 `^sha256:\s*"?([0-9a-f]{64})"?` 两边容引号（迁移前后都能读），缺陷不在引擎自读，而在脚本面 + 标面形式。

## 二、diff 原文

**① 主责：`ingest-pipeline.py` `parse_frontmatter`（恰 1 处语义 diff）**——改前备份 `ingest-pipeline.py.bak-20261009`（md5 留证：改前 `f30c04a06d08686785e7d03d6f461015` → 改后 `4baa76f74671d03c92f6dbb35f3ef56f`；t10 先例）：

```diff
     fm = {}
     for line in lines[1:end_idx]:
         m = re.match(r"^(\w[\w-]*):\s*(.*)$", line)
         if m:
-            fm[m.group(1)] = m.group(2).strip()
+            val = m.group(2).strip()
+            # 0.8.1（t22，R-27② 主责面）：frontmatter 标量值去成对引号（单/双）——引号是 YAML 标面形式，
+            # 语义值不含引号；不去引号 → stored sha256 带引号永远≠实算 → 恒报 re_ingest（06-hindsight 假阳性）
+            if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
+                val = val[1:-1]
+            fm[m.group(1)] = val
```

**② 次责：`lib/hindsight-sync.js` 引擎裸值**：

```diff
-    `sha256: ${yq(sha256)}`,
+    `sha256: ${sha256}`, // 裸值（0.8.1 t22，R-27② 次责面）：纯 hex 无需引号——与 mark.js「key: value 形」既定口径一致
```

（`title`/`date`/`tags`/`latest_timestamp` 等真需引号的保持 `yq()` 零改动。）

**③ 测试随改**（`test/hindsight-sync.test.mjs` ③：sha256 断言引号形→裸值形，2 处）：`/^sha256: [0-9a-f]{64}$/m` + 提取正则去引号组——锁「纯 hex 不加引号」。

**④ migration（INV-1 例外：同步产物自愈）**：`raw/06-hindsight/` 4 文件 frontmatter `sha256` 行去值引号——**每文件恰 2 字节手术（一对引号），其余字节零动**（mark.js 字节手术纪律）；事前说明已写入 `changes/2026-10-07-hindsight-sync/ledger.md`（R-27② 例外申报条目）。改后逐文件校验 **stored == 实算 body sha256**（INV-13 同源：frontmatter 闭合 `---` 后内容 universal-newlines 归一）：

```
coding-agent--dsh-plugins-ad942f05-2026-09.md: stored=c97158724fb55ced… actual=c97158724fb55ced… match=True
coding-agent--dsh-plugins-ad942f05-2026-10.md: stored=09a2042a9a38707a… actual=09a2042a9a38707a… match=True
coding-agent-a3906a67-2026-09.md: stored=f15c834ee68aa572… actual=f15c834ee68aa572… match=True
coding-agent-a3906a67-2026-10.md: stored=a8c85f6f24247eca… actual=a8c85f6f24247eca… match=True
```

## 三、scan 前后对比原文（re_ingest 4 → 0）

**修前**（`python3 ingest-pipeline.py scan --summary | grep -n '06-hindsight'`）：

```
2:   扫描目录: 01-articles, 02-papers, 03-transcripts, 04-session_logs, 05-holographic, 05-kanban, 06-hindsight, projects
488:   🔄 [06-hindsight] coding-agent--dsh-plugins-ad942f05-2026-09.md (2026-10-09 03:25)
489:   🔄 [06-hindsight] coding-agent--dsh-plugins-ad942f05-2026-10.md (2026-10-09 03:25)
490:   🔄 [06-hindsight] coding-agent-a3906a67-2026-09.md (2026-10-09 01:04)
491:   🔄 [06-hindsight] coding-agent-a3906a67-2026-10.md (2026-10-09 01:04)
```

**修后**（同命令）：

```
2:   扫描目录: 01-articles, 02-papers, 03-transcripts, 04-session_logs, 05-holographic, 05-kanban, 06-hindsight, projects
```

06-hindsight「待编译」中 re_ingest 项 **4 → 0**（仅剩扫描面登记行；假阳性根除）。

## 四、验证链原文

**② node 直调引擎幂等**（mkdtemp 落盘→读回 frontmatter sha→与 bodyHash 比对）：

```json
{"action":"created","shaLine":"9ae6382d730ec46fa94d76c8a6687c85c6a8519ab34ca202b68b1a1256a5a623","quoted":false,"hashMatch":true}
```

（`quoted:false`——新产物 sha256 裸值；`hashMatch:true`——stored==mark.bodyHash(body) INV-13 同源一致。）

**③ 全量 `node --test`**（基线 463+ 零回退）：

```
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5216.965349
```

全量口径：**tests 466 / pass 466 / fail 0**（463+3 他轮新增，本波 2 处断言随改零回退）。

## 五、changedPaths 与越界申报

- `/opt/Workspace/scripts/obsidian/ingest-pipeline.py`（主责：parse_frontmatter 去引号，恰 1 处语义 diff）
- `/opt/Workspace/scripts/obsidian/ingest-pipeline.py.bak-20261009`（改前备份，md5 留证）
- `wiki-steward/lib/hindsight-sync.js`（次责：sha256 裸值）
- `wiki-steward/test/hindsight-sync.test.mjs`（sha256 断言引号形→裸值形 2 处）
- `/mnt/unraid_data/Obsidian/raw/06-hindsight/` 4 文件（migration：sha256 行去引号，各恰 2 字节手术）
- `wiki-steward/changes/2026-10-07-hindsight-sync/reports/081-sha-frontmatter-fix-report.md`（本报告）
- `wiki-steward/changes/2026-10-07-hindsight-sync/ledger.md`（INV-1 例外事前说明，合同正文要求——不在 In scope 清单，此处报备）

**越界申报：无。** `package.json`/`CHANGELOG.md`/`README.md`/`docs/` 零触碰；`raw/` 其他目录零触碰；无发版动作。
