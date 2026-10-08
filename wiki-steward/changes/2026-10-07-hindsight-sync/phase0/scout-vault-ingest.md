# Phase 0 侦察报告：Hindsight 记忆 → raw/ → Ingest → wiki/ 链路可行性

> 侦察类型：**只读**（无 vault 写入、无服务重启）
> 侦察时间：2026-10-07 17:10–17:25 (Asia/Shanghai)
> vault 根：`/mnt/unraid_data/Obsidian`（NAS CIFS，命令均带 timeout）
> 标注约定：【实测】=命令真实跑过并见输出；【读码确认】=读到源码/文档原文；【推断】=由证据推导，未直接验证

---

## 结论摘要（先给答案）

**链路机械上可行，但当前有两个硬阻塞必须先解决，否则现在上线等于产垃圾。**

### 落点建议（推荐方案）

| 项 | 建议 | 依据 |
|---|---|---|
| **raw 落点** | 新建 `raw/06-hindsight/`（一级目录，编号 `06-`） | 完全对齐 `raw/05-holographic/` 先例——同为「外部记忆系统自动同步进 raw」【读码确认：vault AGENTS.md:66,171】 |
| **是否需改代码** | **是**，须把 `06-hindsight` 加进 `ingest-pipeline.py` 的 `SCAN_DIRS` 白名单 | 扫描面是**硬编码白名单**，不在此列的目录永远扫不到【读码确认：ingest-pipeline.py:32-40】 |
| **文件命名** | **稳定 ID 命名，禁止日期前缀**：`<bank-slug>-<page-slug>.md` | 日期前缀=每次同步新文件→每夜编译新页→wiki 重复页爆炸（见 §3.3 幂等分析） |
| **frontmatter** | 六字段 + `hindsight_id` / `hindsight_bank` / `sha256`；**易变字段只进 frontmatter，绝不能进 body** | body 是 sha256 哈希口径，body 含时间戳=每夜 re_ingest【读码确认：ingest-pipeline.py:104-113】 |
| **wiki 落点** | 由 LLM 蒸馏时按既有「目录归属规则」判定（见 §3.4 讨论）；**不在同步脚本里预定** | 脚本预定 = 复刻 holographic-sync 的失败模式（见 §风险 R-2） |

### 两个硬阻塞（必须先解）

1. **🔴 源内容是空的。** 当前 `coding-agent::dsh-plugins` bank 的 5 个知识页**全部 `body=""`**（导出文件 body 区写 "No content yet."），5 个 mental model `content=null`、`is_stale=true`。现在同步 = 往 raw 落 5 个空壳文件 → 编译出 5 个空 wiki 页。【实测，见 §3.1】
2. **🔴 蒸馏通道已断 8 天。** `wiki-ingest` cron 自 2026-09-30 起**每天失败**，`MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"`；10-06/10-07 更是连启动都被 flock 跳过。raw 落了也编译不出来。【实测，见 §4.2】

### 一个必须规避的历史失败模式

`raw/05-holographic/` 的生产者 `holographic-sync.py` 已于 **2026-09-27 停用归档**，原因是它把 facts 无脑导出成 entity 文件，在 `wiki/entities/` 制造了 **1091 个垃圾文件**。教训原文：「**Python 脚本不能替代 LLM 语义理解 — 绕过 ingest 用脚本"编译"必然产生垃圾**」。【读码确认：`obsidian-operations/references/holographic-memory-architecture.md`「核心教训」段】

→ 本方案必须严格只做「Hindsight → raw 素材搬运」，**蒸馏一律交 LLM**，与 05-holographic 的失败做法划清界限。

---

## 1. Ingest 流水线

### 1.1 子命令清单

【读码确认】`/opt/Workspace/scripts/obsidian/ingest-pipeline.py`，共 259 行：

| 子命令 | 参数 | 行为 | 代码位置 |
|---|---|---|---|
| `scan` | `--summary` / `--needs-ingest` / `--source <子目录>` | 扫描 raw 白名单目录，输出三态清单 | :131-159 |
| `migrate` | `--dry-run` | 给**无 sha256** 的文件补写 `sha256:` 到 frontmatter（**会写 raw 文件**） | :162-212 |
| `pipeline` | 无 | `migrate` + `scan` 串联（先补标记再扫描） | :215-224 |
| (无) | — | 打印 help | :254-255 |

⚠️ **没有 `distill` 子命令**。wiki-steward 面板的「扫描增量」按钮只调 `scan --summary`；「蒸馏」是另一条缝，spawn `dsh-cron.sh wiki-ingest`（LLM 面）。
【读码确认：`~/.dsh/plugins/wiki-steward/lib/ingest-trigger.js:17,73`（`PIPELINE_SCRIPT` / `argv = [pythonBin, pipelineScript, 'scan', '--summary']`）、`:125-138`（`distill()` 走 spawn dsh-cron.sh）】

文件头注释明确设计原则（:10-11）：「**纯机械，不做语义理解，不写 wiki/。实际编译由 LLM agent 按 llm-wiki skill 执行。**」

### 1.2 扫描范围 —— 硬编码白名单（关键）

【读码确认：ingest-pipeline.py:32-40】

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

- 只有 **7 个**目录在扫描面内。
- `projects` 有**二次过滤**（:94-95）：`if subdir == "projects" and "fix-notes" not in Path(fpath).parts: continue` —— 只收 `*/fix-notes/` 下的文件。
- 逐文件过滤（:87-90）：只收 `.md`；跳过 `.` 开头文件。
- 递归 `os.walk` 整个子目录树（:85）。

**→ 关键结论：新增 `raw/` 一级目录若不加进 `SCAN_DIRS`，永远不会被扫到。** 这是本方案唯一的必改代码点。

### 1.3 增量判定 —— sha256 三态

【读码确认：ingest-pipeline.py:104-113】

```python
fm, body = parse_frontmatter(content)
stored_hash = fm.get("sha256", "").strip()
current_hash = compute_sha256(body)

if not stored_hash:
    status = "ingest"      # 从未处理
elif stored_hash == current_hash:
    status = "skip"        # 已编译，内容未变
else:
    status = "re_ingest"   # 内容变更
```

| frontmatter | 状态 | 含义 |
|---|---|---|
| 无 `sha256` | `ingest` | 从未处理 |
| `sha256` 匹配 | `skip` | 已编译，内容未变 |
| `sha256` 不匹配 | `re_ingest` | 内容变更，**改写既有 wiki 页**（不另起新页） |

**body 口径**（:45-72）：
- `parse_frontmatter`：首行须为 `---`，找下一个 `---` 行作为闭合；`body = "\n".join(lines[end_idx+1:])` —— 即**闭合 `---` 之后全部内容**。
- `compute_sha256(body) = hashlib.sha256(body.encode("utf-8")).hexdigest()`
- frontmatter 解析是**宽松正则** `^(\w[\w-]*):\s*(.*)$`（:62），只认 `key: value` 形，不支持嵌套/列表块（list 形式的 tags 会被忽略，但无所谓——scan 只读 `sha256`）。

**与 kb-mark 同源口径**：`~/.dsh/plugins/wiki-steward/lib/mark.js:22-24` 注释确认 INV-13 同源——body = 闭合 `---` 之后内容，universal-newlines 归一（`\r\n|\r`→`\n`）后 UTF-8 字节哈希，与 Python 侧逐字节同值。
→ **同步脚本若要自写 sha256，必须按此公式，且必须先做 newline 归一**，否则与 `migrate` 补写的值不等，导致永久 `re_ingest`。

**⚠️ `re_ingest` 语义**（wiki-ingest skill「关键 Pitfall」第 2 条）：「`re_ingest` 是更新不是新增 — 内容变更时改写既有 wiki 页（保持 wikilink/INDEX 稳定），不要另起新页」。这是稳定命名方案的机制基础。

### 1.4 外部导入先例

**有，且高度同构：`raw/05-holographic/`**（Hermes Holographic Memory → raw）。

【读码确认】vault `AGENTS.md:66`（目录树）、`:171`（分类路由表）：

```
| Holographic Memory | `raw/05-holographic/` | holographic-sync.py 自动写入 |
```

【实测】`raw/05-holographic/` 现存 27 个 .md，frontmatter 形（读 `2026-05-15 clsh-project v2.md`：）

```yaml
---
title: "2026-05-15 clsh-project v2"
date: 2026-09-22
tags: [holographic]
sha256: 5230fdd7a8415074bec21f53529a14e9d4ac7f6e96698a15b078f914f7c2a84e
source: holographic-memory
fact_id: 2635
trust: 0.5
---
```

命名带空格/中文/冒号/括号（如 `Git代理踩坑(GnuTLS)_ git fetch_clone 通过 192.md`）——**与「kebab-case」规范不符但被容忍**，因为：
- ingest-pipeline 只按 `.md` + 非 `.` 开头过滤（:87-90），无命名校验；
- `kb_validate` 对 raw 目录**不报 naming/placement**。

【实测】`kb_validate({target:"raw/05-holographic", rules:["frontmatter","naming","placement"]})` → `verdict: "pass"`，27 个文件全部 `findings: []`。

⚠️ **但该先例以失败收场**：`holographic-sync.py` 已于 2026-09-27 停用归档【读码确认：`/opt/Workspace/backup/2026-09-27-停用脚本/MANIFEST.md`「scripts/obsidian/holographic-sync.py | 无活跃调度」】。原因见 §风险 R-2。

---

## 2. vault 结构

### 2.1 raw/ 一级子目录统计

【实测】命令（vault CIFS，逐目录加 timeout）：

```bash
cd /mnt/unraid_data/Obsidian/raw && for d in */ ; do
  n=$(timeout 60 find "$d" -type f | wc -l)
  nm=$(timeout 60 find "$d" -type f -name '*.md' | wc -l)
  mt=$(timeout 60 find "$d" -type f -printf '%T@ %TY-%Tm-%Td %TH:%TM\n' | sort -rn | head -1 | awk '{print $2,$3}')
  echo "$d | files=$n md=$nm | newest=$mt"
done
```

| 目录 | 文件数 | .md 数 | 最近修改 | 在 SCAN_DIRS? | 编号 |
|---|---|---|---|---|---|
| `01-articles/` | 37 | 37 | 2026-08-12 00:28 | ✅ | 编号 |
| `02-papers/` | 4 | 4 | 2026-06-07 06:03 | ✅ | 编号 |
| `03-transcripts/` | 0 | 0 | — | ✅ | 编号 |
| `04-session_logs/` | 292 | 292 | 2026-10-06 01:21 | ✅ | 编号 |
| `05-holographic/` | 27 | 27 | 2026-09-22 00:05 | ✅ | 编号 |
| `05-kanban/` | 251 | 251 | 2026-09-22 00:11 | ✅ | 编号 |
| `projects/` | 578 | 549 | 2026-10-06 00:49 | ✅（仅 fix-notes） | 非编号 |
| `archive/` | 172 | 171 | 2026-05-06 14:37 | ❌ | 非编号 |
| `articles/` | 19 | 7 | 2026-06-06 22:04 | ❌ | 非编号 |
| `images/` | 0 | 0 | — | ❌ | 非编号 |
| `lessons/` | 10 | 10 | 2026-06-02 10:12 | ❌ | 非编号 |
| `materials/` | 3 | 1 | 2026-06-06 15:45 | ❌ | 非编号 |
| `observer/` | 18 | 18 | 2026-05-06 03:31 | ❌ | 非编号 |
| `staging/` | 2 | 1 | 2026-05-07 00:01 | ❌ | 非编号 |
| `templates/` | 1 | 1 | 2026-05-19 00:22 | ❌ | 非编号 |

（另有隐藏 `raw/.git`，raw/ 为独立 git 仓库；见 §3.5）

### 2.2 SCHEMA.md 与 wiki/INDEX.md

**⚠️ `SCHEMA.md` 不存在。**【实测】
```
ls: cannot access '/mnt/unraid_data/Obsidian/SCHEMA.md': No such file or directory
```
已于 **2026-09-24 退役**（两版全文归档在 `wiki/reference/wiki-schema-archive.md`）。
【读码确认】vault `AGENTS.md:83`：`（SCHEMA.md 已退役 2026-09-24；全文归档 wiki/reference/wiki-schema-archive.md，规则并入 wiki-ingest skill）`；`:157` 同。
**规则唯一源 = `wiki-ingest` skill「写入规范」章节。**

#### frontmatter 六字段【读码确认：wiki-ingest SKILL.md「Frontmatter 必填字段」】

```yaml
---
title: "文档标题"          # 必填，不超过50字
date: 2026-04-16           # 必填，创建日期 YYYY-MM-DD
tags: [tag1, tag2]         # 必填，至少1个标签
status: draft              # 必填，draft | active | archived
source: "来源说明"         # 必填，原始素材路径或外部链接
related: []                # 必填，关联文档 wikilink，可为空 []
---
```
`wiki/solutions/` 页**额外必填** `reusability: cross-project | project-specific | one-time`。

#### 结构四段【读码确认：wiki-ingest SKILL.md「标准结构」】

```
## 概述   → 2-3 句话，说明 what/why
## 关键点 → 3-7 条，每条带粗体标题
## 关联   → 必须使用 [[wikilink]] 语法，每条附一句说明
## 来源   → 标注素材出处，便于溯源
```
顺序固定。

#### 文件命名规范（Q13）【读码确认：wiki-ingest SKILL.md「文件命名规范」】

| 类型 | 文件名格式 | 示例 |
|---|---|---|
| 概念 | `概念名称.md` | `梯度计费.md` |
| 实体 | `实体名称.md` | `1号厂房.md` |
| 主题 | `主题名称.md` | `月度运营报告.md` |
| 原始素材 | `YYYY-MM-DD-简短描述.md` | `2026-05-03-新客户需求.md` |
| 报告 | `YYYY-MM-DD-HH-MM-标题.md` | `2026-05-05-23-30-调研.md` |
| Session 产物 | `标题 - YYYY-MM-DD-HH-MM.md` | `运维操作记录 - 2026-05-05-14-30.md` |

禁止：`\ / : * ? " < > |`、纯英文/纯符号文件名、超 50 字。
（注：vault AGENTS.md:101-107 是三行简版，与 skill 一致但少「概念/实体/主题」三行——以 skill 为准。）

#### 目录归属规则【读码确认：wiki-ingest SKILL.md「目录归属规则」表】

| 内容类型 | 目标目录 |
|---|---|
| 概念、定义、方法论 | `wiki/concepts/` |
| 人、项目、设备、地点 | `wiki/entities/` |
| 源摘要（session 产物） | `wiki/sources/` |
| 分析报告、综合分析、观察记录 | `wiki/syntheses/` |
| 架构图、流程图 | `wiki/diagrams/` |
| 参考文档（ERRORS、LEARNINGS、工具清单） | `wiki/reference/` |
| 修复记录（raw/projects/*/fix-notes/） | `wiki/solutions/`（`reusability` 必填） |
| 项目概述 | `wiki/projects/<project>/overview.md` |

> **2026-09-26 路由更新（裁决 A=丙）**：clsh 项目文档唯一事实源=**工作区项目目录**，不再编入 `wiki/projects/<project>/`（wiki/projects 层停止增长）。

#### wiki/INDEX.md【实测：head -80】

- frontmatter：`title: Wiki 索引 / date: 2026-05-07 / tags: [索引, MOC] / status: 完成`（注意：此页 status 用了 `完成`，本身**不合规**于 `draft|active|archived` 枚举——存量问题，非本报告范围）
- 头部自述：`最后更新：2026-09-26 | 总页面：168（md，排除 .git）`
- 结构：按目录分组的 `- [[<path>|<显示名>]] — 一行摘要` 列表（reference/、syntheses/、sources/ …）
- **raw/ 路径不在 INDEX.md 中**（INDEX 只登记 wiki 页）

### 2.3 wiki/ 一级子目录清单

【实测：`ls -la /mnt/unraid_data/Obsidian/wiki/`】

```
concepts/  diagrams/  entities/  projects/  reference/
solutions/ sources/   specs/     syntheses/ topics/
INDEX.md   hot.md     hermes-cli-reference.md
lint-report.md  log.md   .health-score.json  .git/
```

⚠️ **vault AGENTS.md 提到的 `wiki/memory/` 实际不存在**【实测：`ls: cannot access '.../wiki/memory': No such file or directory`】。
（AGENTS.md:80 目录树与 :124 都写了 `wiki/memory/ ← Holographic Memory 同步的有价值 fact`——是**规划态未落地**，且不在 wiki-ingest skill 的目录归属表里。见 §未决问题 Q-3。）

---

## 3. 落点判定

### 3.1 🔴 源端实况：当前知识页内容为空

【实测】`GET /v1/default/banks` → 2 个 bank：

| bank_id | fact_count | 备注 |
|---|---|---|
| `coding-agent::dsh-plugins` | 334 | 5 个知识页 |
| `coding-agent::公共` | 119 | **知识库为空**（`tree` → `{"roots":[]}`，`export` 仅 1 个 91 字符的 index.md） |

【实测】`GET .../coding-agent::dsh-plugins/knowledge-base/tree` → 5 个根页，**全部 `is_stale=true`**：

```
page | Component map                 | kp-68633ae9de2746ce8a52204670072c3c
page | Conventions and patterns      | kp-0687509b5b914252854c3faa25dff2d5
page | Core concepts                 | kp-083bfd017f504180b94799e92ec38aa7
page | Initiatives and enhancements  | kp-b92ca9a4fd4d4bd9acc0eeb2050bb791
page | Key decisions and rationale   | kp-b2a63b795b054d658ef0e0437a9934d8
```

【实测】`GET .../knowledge-base/export` → 7 个文件，剥离 frontmatter 后 **body 字符数**：

```
index.md                              | body chars= 4210
kp-68633ae9...md                      | body chars= 0
kp-0687509b...md                      | body chars= 0
kp-083bfd0...md                       | body chars= 0
kp-083bfd0....log.md                  | body chars= 73
kp-b92ca9a4...md                      | body chars= 0
kp-b2a63b79...md                      | body chars= 0
```

【实测】单页详情 `GET .../knowledge-base/pages/kp-b2a63b795b054d658ef0e0437a9934d8`：
```json
{"id":"kp-b2a63...","name":"Key decisions and rationale", ..., "body":"",
 "markdown":"---\n...frontmatter...\n---\n\nNo content yet.\n"}
```
【实测】`GET .../mental-models` → 5 项全部 `"content": null, "is_stale": true`。
【实测】`GET .../stats` → `pending_consolidation: 267`、`failed_operations: 1`、`total_observations: 37`。

> **判定：知识页尚未被 LLM 填充内容（页面是框架，等待 refresh/consolidation）。现在同步只落空壳。**
> 同步脚本**必须**加门禁：`body.strip()` 非空才落文件。

**补充：源数据其实在 memories 里，不在 knowledge pages。**
【实测】`GET .../memories/list?limit=1` → `total=354`，单条字段含 `text`（记忆正文）、`fact_type`（world/experience/observation）、`entities`、`tags`、`date`、`document_id`、`proof_count`。
【实测】`GET .../documents` → 5 个源文档：`conversation:session-*` ×4 + `gitlog:dsh-plugins`。
（bank stats `nodes_by_fact_type`: world 195 / experience 119 / observation 37）

→ **若目标是「把记忆内容同步落 raw」，真正有内容的是 `/memories/list`（354 条 facts），不是 knowledge-base（5 个空页）。** 见 §未决问题 Q-1。

### 3.2 具体落点建议

#### 目录

**`raw/06-hindsight/`**（新建一级目录）

选 `06-` 的理由：
- 编号 = **ingest 扫描面**的约定（`01-`~`05-` 全部在 SCAN_DIRS；非编号目录 `archive/articles/images/lessons/materials/observer/staging/templates` **全部不在**）【读码确认：ingest-pipeline.py:32-40；§2.1 实测表】
- 与 `05-holographic`（外部记忆系统自动同步）**同类同构**【读码确认：vault AGENTS.md:66,171】
- 编号不连续/重复无碍：现存 `05-holographic` 与 `05-kanban` 共用前缀 `05` 【实测：§2.1】

#### 文件命名 —— 稳定 ID（关键，防重复页）

```
raw/06-hindsight/<bank-slug>-<page-slug>.md
```

示例：
```
dsh-plugins-component-map.md
dsh-plugins-conventions-and-patterns.md
dsh-plugins-core-concepts.md
dsh-plugins-initiatives-and-enhancements.md
dsh-plugins-key-decisions-and-rationale.md
```

- `bank-slug` = bank_id 去掉 `coding-agent::` 前缀并 slug 化（`公共` → 中文保留或 `gonggong`）
- `page-slug` = 页面 name 的 kebab-case

⚠️ **禁用日期前缀**（`2026-10-07-Key-decisions.md`）。理由见 §3.3。

#### frontmatter 模板

```yaml
---
title: "Key decisions and rationale"
date: 2026-10-07
tags: [hindsight, knowledge:decision, dsh-plugins]
status: draft
source: "hindsight://coding-agent::dsh-plugins/kp-b2a63b795b054d658ef0e0437a9934d8"
related: []
hindsight_id: "kp-b2a63b795b054d658ef0e0437a9934d8"
hindsight_bank: "coding-agent::dsh-plugins"
hindsight_timestamp: "2026-10-07T08:54:10.023337+00:00"
hindsight_stale: true
sha256: <body hash，INV-13 口径>
---

<正文：Hindsight 页面 body 原样>
```

要点：
1. **六字段齐全**（ingest 编译产物 wiki 页需要；raw 侧不强制但对齐无害）
2. `sha256` 由同步脚本按 INV-13 口径自算（body 在闭合 `---` 后，universal-newlines 归一时 UTF-8 字节哈希）【读码确认：ingest-pipeline.py:70-72；mark.js:22-24】
3. **`hindsight_timestamp` / `hindsight_stale` 等易变字段只进 frontmatter**——进 body 会导致每夜 re_ingest
4. 不写 `sha256` 也行（→ `ingest`），但**首次后每夜都会重新编译**，无法区分「值变了」和「没标记」

#### 是否符合 SCHEMA / 扫描范围

| 检查项 | 结果 |
|---|---|
| ingest 扫描范围 | ❌ **现在不符合**——须把 `06-hindsight` 加进 `SCAN_DIRS`（唯一必改点） |
| frontmatter 六字段 | ✅ 模板已含 |
| 文件命名 | ✅ kebab-case，无禁字符；但 raw 侧命名**无机械校验**（kb_validate 对 raw pass） |
| 目录归属 | ✅ raw 侧无归属规则限制 |

### 3.3 幂等 / 去重分析

**场景 A：稳定命名 + body 不变 → 安全**
- 同步重写同一文件，body 相同 → `sha256` 匹配 → `skip` → 不重复编译，wiki 无新页。✅

**场景 B：稳定命名 + body 变更 → 受控更新**
- `sha256` 不匹配 → `re_ingest` → wiki-ingest skill 规定「**改写既有 wiki 页，不另起新页**」→ wiki 页数不变。✅

**场景 C：日期命名 → 🔴 重复页爆炸**
- 每夜同步生成新文件名（日期不同）→ 每个都是无 `sha256` 的新文件 → `ingest` → 每夜编译 N 个**新** wiki 页 → wiki 页线性膨胀，且必须逐页登记 INDEX.md。
- **这正是必须禁用日期前缀的原因。**

**场景 D：不写 sha256 → 🔴 每夜全量重编译**
- 稳定文件名但无标记 → 永远 `ingest` → 每夜重编 N 页（内容相同）→ token 浪费 + wiki 页 churn 风险。

**⚠️ 与「raw 只增不改」的张力**：稳定命名意味着同步要**重写**已存在的文件，字面上违反「素材一旦写入不修改」（wiki-ingest SKILL.md:19）。
**裁决**：`re_ingest` 机制本身就是为「内容变更 → 更新既有页」设计的（skill「关键 Pitfall」第 2 条）；「只增不改」的实质是**禁止破坏历史/删除**，不是禁止受控更新。但这是**规则解释，需用户确认**（§未决问题 Q-2）。
**保守替代**：文件名加内容版本号 `dsh-plugins-key-decisions-and-rationale.v3.md`，旧版保留 → 完全不违反只增不改，但会累积文件且每版都触发一次编译。**不推荐**。

### 3.4 wiki 落点（蒸馏产物归哪个目录）

**不由同步脚本决定**，由 wiki-ingest 的 LLM 按「目录归属规则」判定。预判：

| Hindsight 页 | 预判 wiki 落点 | 依据 |
|---|---|---|
| Core concepts | `wiki/concepts/<概念名>.md` | 概念、定义 → concepts |
| Conventions and patterns | `wiki/concepts/…` 或 `wiki/reference/…` | 方法论→concepts；参考→reference（**有歧义**） |
| Component map | `wiki/entities/…` | 组件/模块≈实体（**有歧义**，也可能 concepts） |
| Key decisions and rationale | `wiki/concepts/…` 或 `wiki/syntheses/…` | **有歧义** |
| Initiatives and enhancements | `wiki/projects/…`（**但 wiki/projects 已停止增长**） | 🔴 与裁决 A=丙 冲突 |

**🔴 冲突点**：`Initiatives and enhancements`（在飞的功能/倡议）最自然的落点是 `wiki/projects/<project>/`，但 2026-09-26 裁决 A=丙 已令 wiki/projects 层**停止增长**，且 clsh 项目文档唯一事实源=工作区项目目录。→ 见 §未决问题 Q-3。

### 3.5 副作用面（新增 raw/ 一级目录会不会破坏什么）

| 受影响面 | 会不会破坏 | 证据 |
|---|---|---|
| **ingest 扫描** | 不会破坏；但**不主动加入就不会被扫到** | SCAN_DIRS 白名单【读码确认：:32-40】 |
| **wiki-lint `check_expected_dirs`** | ❌ 不会。期望目录清单**不含** `05-holographic`/`05-kanban`，只含 `raw/01-02-03-04-articles-papers-transcripts-session_logs/staging/archive` | 【读码确认：wiki-lint.py:606-630】 |
| **wiki-lint `check_config_dir_references`** | ⚠️ **会，但可控**。扫 `AGENTS.md` 中所有 `raw/...` 路径，不存在则报「引用了 X (已不存在)」。**若往 AGENTS.md 写 `raw/06-hindsight/` 而目录未建 → 报错** | 【读码确认：wiki-lint.py:389-450，`CONFIG_FILES = ["AGENTS.md"]`（:43）】 |
| **wiki-lint `check_script_paths`** | ❌ 不会。`SCAN_DIRS` 是字符串列表字面量，不匹配 `os.path.join(VAULT_PATH, ...)` 正则；改它不产生新断言 | 【读码确认：wiki-lint.py:456-515】 |
| **wiki/INDEX.md** | ❌ 不会。INDEX 只登记 wiki 页，raw 路径不入 INDEX | 【实测：§2.2】 |
| **kb-context 检索索引** | ✅ **自动受益**。`scope.indexAll = [wiki, raw]` → 新 raw 文件自动进 FTS5 索引，可被 `wiki_search` 命中（**无需改配置**） | 【读码确认：`~/.dsh/plugins/kb-context/cordis.patch.yml:26-28`；`index-db.js:338-346`（`filterIndexable` 按 indexAll 根前缀过滤）】 |
| **raw git 自动同步** | ✅ 自动受益。每日 01:00 `obsidian-git-sync.sh` 对 raw 仓库 `git add -A` + commit + push | 【读码确认：`/opt/Workspace/scripts/cron/obsidian-git-sync.sh`；实测 `git -C raw log --oneline -3` → `eab18c3 auto-sync: 2026-09-22 01:00:33 (183 files)`】 |
| **AGENTS.md 路由约定** | ⚠️ 需同步更新（见 §风险 R-1 判定） | — |

### 3.6 编号 vs 非编号目录分工

【推断 + 读码确认交叉验证】

- **编号目录 `01-`~`05-` = ingest 扫描面**（7 个 SCAN_DIRS 中 6 个是编号）。语义 = 「按素材类型分流的、需要蒸馏的数据入口」。
- **非编号目录**：
  - `projects/` = **特例**，在扫描面内但二次过滤只收 `fix-notes/`（2026-09-26 裁决 A=丙 的产物）
  - `archive/`（旧文件归档）、`staging/`（旧编译暂存，**已停用待清理**）、`articles/`、`images/`、`lessons/`、`materials/`、`observer/`（Observer 巡检日志）、`templates/` = **不在扫描面**，语义为「旁路/归档/资产/模板」
  - vault AGENTS.md:118-120 明确：`observer/` 巡检日志（已从 wiki/syntheses/ 迁移）、`staging/` 旧编译脚本暂存区（已停用，待清理）、`archive/` 旧脚本/低质量文件归档

> **→ 编号 ≠ 机械判据，`SCAN_DIRS` 成员资格才是。** `projects` 是非编号却在扫描面；若将来加 `06-xxx` 而不加白名单，同样扫不到。
> **→ 但编号是强约定**：所有编号目录都在扫描面，所有非编号目录（除 projects 特例）都不在。**建议保留编号，降低认知负担。**

---

## 4. wiki-ingest skill 与 cron

### 4.1 触发链

【实测：`crontab -l`】
```
#21 Wiki Ingest（00:25，核心蒸馏链必保）
25 0 * * * /root/bin/dsh-cron.sh wiki-ingest /root/bin/tasks/21-wiki-ingest.md
#22 Wiki 健康度 Lint（周日 00:35）
35 0 * * 0 /root/bin/dsh-cron.sh wiki-lint /root/bin/tasks/22-wiki-lint.md
```

**管道**（`dsh-cron.sh` → headless dsh）：

1. `dsh-cron.sh wiki-ingest /root/bin/tasks/21-wiki-ingest.md`
   【读码确认：`/root/bin/dsh-cron.sh` 头部注释】行为：`dsh --profile headless "<task-file 内容>"`；日志 `~/.dsh/logs/cron/wiki-ingest-YYYYMMDD.log`；`flock` 防重入（同名在跑→exit 3）；失败写告警账本 `~/.dsh/plugins/wiki-steward/data/kb-alerts.md`（**由 21-wiki-ingest 开场读取汇总后清空**）。
2. headless agent 加载 `wiki-ingest` skill，按 21-wiki-ingest.md 执行：
   - 开场：读 `kb-alerts.md` 汇总进报告后清空【读码确认：21-wiki-ingest.md:5】
   - Step1 `pipeline` + `scan --summary`【:11-12】
   - Step2 逐条编译 `ingest`/`re_ingest`（`skip` 不碰）【:14】
   - Step3 更新 `wiki/INDEX.md`【:15】
   - Step4 再 `pipeline` + `scan --summary`，确认归零【:18-19】
   - 无待编译素材 → 直接输出「无待编译素材」结束，不产空页【:22】

**LLM 面在哪执行**：在 `dsh --profile headless` 派生的 headless agent 会话里（即 LLM 调用发生在 cron 派起的 dsh 进程内），不是由 python 脚本调用 LLM。ingest-pipeline.py 只做机械扫描/标记【读码确认：ingest-pipeline.py:10-11】。

**另有插件内定时通道**：`~/.dsh/plugins/wiki-steward/lib/ingest-schedule.js` 插件自管 timer，缺省 `00:25`（与 cron 同点），到点 spawn `dsh-cron.sh wiki-ingest` 同一通道，`flock` 兜底【读码确认：ingest-schedule.js:1-10,21】。

**产出 wiki 页归哪个目录**：由 wiki-ingest skill「目录归属规则」表判定（§2.2 已摘录）。脚本不预定落点。

### 4.2 🔴 当前蒸馏通道已断（实测）

【实测】`tail -2 /root/.dsh/logs/cron/wiki-ingest-*.log`，2026-09-30 ~ 2026-10-07 **连续 8 天全部失败**：

```
dsh: MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official";
     store DEEPSEEK_API_KEY through the credentials service (the web Models page writes it),
     or export DEEPSEEK_API_KEY in the launching environment
exit code: 1
```

10-06 / 10-07 额外记录（同一日志文件内两行）：
```
=== [2026-10-07 00:25:00] START name=wiki-ingest task=/root/bin/tasks/21-wiki-ingest.md ===
=== [2026-10-07 00:25:01] SKIP name=wiki-ingest 另一实例在跑（flock 未取到锁）===
exit code: 3
```

> **判定：即便 raw 落点全部就绪，蒸馏也不会发生。** 这是本链路当前最大的现实阻塞，**优先级高于任何落点设计**。

### 4.3 现有积压（实测）

【实测】`python3 ingest-pipeline.py scan --summary`（整库）：
```
📊 Ingest Pipeline Scan
   扫描目录: 01-articles, 02-papers, 03-transcripts, 04-session_logs, 05-holographic, 05-kanban, projects
   总文件数: 628
   已编译:   141
   待编译:   487
```

【实测】逐 `--source` 拆分：

| source | 总文件 | 待编译 |
|---|---|---|
| `01-articles` | 37 | **0** ✅ |
| `02-papers` | 4 | **0** ✅ |
| `03-transcripts` | 0 | 0 |
| `04-session_logs` | 292 | **292**（100%！全部 re_ingest） |
| `05-holographic` | 27 | **0** ✅ ← 先例目录，已全部编译完毕 |
| `05-kanban` | 251 | **178** |
| `projects`（fix-notes） | 17 | **17** |

> **注意**：`04-session_logs` 292 个文件 100% 待编译（状态全为 🔄 `re_ingest`，即已有 sha256 但不匹配）——**疑似存量 sha256 口径漂移**，与 2026-06-06「脚本丢失/口径迁移」踩坑同族（`compiled: true` 旧标记迁移遗留）。**非本报告范围，但说明扫描面已严重积压**，新增源会进一步加重。
> `05-holographic` 27 个全部 `skip` —— 说明「外部记忆 → raw → 编译」这条路径**跑通过且已收敛**，是先例有效性的正面证据。

---

## 5. wiki-lint（22-wiki-lint.md）

### 5.1 做什么

【读码确认：`/root/bin/tasks/22-wiki-lint.md`】
- 频率：**每周日 00:35**（`35 0 * * 0`）
- 所需 skill：`obsidian-operations`
- 对 `/mnt/unraid_data/Obsidian/wiki/` 执行健康度 lint，**只报告不修改**
- 命令：`python3 /opt/Workspace/scripts/obsidian/wiki-lint.py`
- 检查项：
  1. `INDEX.md` 与实际页面一致性（孤儿页 / 失效条目 / 漏登记）
  2. `[[wikilink]]` 断链与循环引用（A→B→A）
  3. frontmatter 六字段缺失（`solutions/` 页含 `reusability`）
  4. 文件命名违规（非 kebab-case、非法字符、超 50 字）
  5. 目录归属错误（放错层、wiki 根级违规新页）
- 输出：按严重度分组（断链/孤儿页 > 缺字段 > 命名/归属），末尾一行 `PASS / N 处待修`

### 5.2 与 21-wiki-ingest 的关系

| 维度 | 21-wiki-ingest | 22-wiki-lint |
|---|---|---|
| 频率 | **每日** 00:25 | **每周日** 00:35 |
| 性质 | **生产者**（写 wiki/、写 INDEX.md、改 raw 的 sha256） | **消费者/监督者**（只读，只报告） |
| 对象 | `raw/` → `wiki/` | `wiki/`（+ `raw/projects` + `raw/observer` 因 INDEX 引用） |
| LLM 面 | 需要（LLM 做语义编译） | 需要 LLM 读报告给修复建议清单（脚本本身机械） |
| skill | `wiki-ingest` | `obsidian-operations` |
| 时序 | 先 | 后（周日 lint 会看到本周 6 次 ingest 的产物） |

**关系**：lint 是 ingest 的**质量回检环**。ingest 产出的漏登记 INDEX / 断链 / 命名违规 / 放错层，由周日 lint 兜出来。**对本方案的含义**：Hindsight 同步若产出不合规范的 wiki 页，最快要等下一个周日 00:35 才被发现——所以同步脚本侧必须自带门禁（body 非空、frontmatter 六字段），不能依赖 lint 事后兜。

【读码确认：wiki-lint.py:66-80】扫描范围：
```python
扫描范围：wiki/ 全目录 + raw/projects/ + raw/observer/（INDEX.md 引用的 raw 路径）
for raw_sub in ['raw/projects', 'raw/observer']:
```
→ **`raw/06-hindsight/` 不在 lint 扫描面**（除非将来被 INDEX.md 引用）。新增目录不会引入新的 lint 断言。

【读码确认：wiki-lint.py:224-225, 300-302, 320-321】raw/ 下文件在 lint 中被三处显式豁免：
- `check_islands`：跳过 `raw/`（原始素材不要求反向链接）
- `check_missing_frontmatter`：跳过 `raw/`（原始素材不要求 frontmatter）
- `check_dirty_files`：跳过 `raw/`

---

## 风险与冲突

### R-1 🔴 AGENTS.md「agent 只写 wiki/ 与 raw/projects/，不写其他 raw/ 区」—— Hindsight 同步落 raw 新目录算不算违反？

**规则原文**（两处）：

**A. 工作区 AGENTS.md:11**（本工作区生效）
```
- agent 只写 `wiki/` 与（clsh 项目）`raw/projects/`，不写其他 `raw/` 区
```

**B. vault AGENTS.md**（vault 侧），相关原文：
- :19「wiki/ = vault 内由 AI 编译维护的结构化知识子区：raw/（只增不改）→ Ingest 蒸馏 → wiki/ → 注回 agent 上下文；**人不直接写 wiki/，AI 不直接写业务参考区**」
- :116「**raw/04-session_logs/**: 会话同步脚本自动写入（Hermes wiki-sync；DSH 会话产物按命名规范落盘）」
- :161「`raw/` 存放所有原始素材，**是知识库的数据入口**（只增不改）」
- :170-171（分类路由表）「Session 日志 | `raw/04-session_logs/` | **wiki-sync 自动写入**」「Holographic Memory | `raw/05-holographic/` | **holographic-sync.py 自动写入**」
- :183「✅ 新素材放入对应子目录（**自动**）」

**判定：不算违反 —— 但前提是「由自动化管道（脚本/cron）写入」，不是「agent 在会话中随手手写」。**

**依据（三条）：**

1. **规则主语是「agent 手写」，不是「数据入口」。** vault AGENTS.md:161 明确定位 raw/ 是「知识库的数据入口」，:183 写明新素材入子目录的方式是「（自动）」。规则 A 的语境是**阻止 agent 在会话中把产物随手塞进 raw 旁路区**（绕过蒸馏、绕过命名规范），而**不是**禁止「外部系统 → raw」的自动化导入。

2. **同一份 AGENTS.md（vault 版）自身就把两个非 raw/projects/ 的 raw 子目录列为「自动写入」落点**——`04-session_logs/`（wiki-sync 自动）、`05-holographic/`（holographic-sync.py 自动）。这两个目录**都不在规则 A 的白名单里**（规则 A 只许 `wiki/` + `raw/projects/`），却在 vault AGENTS.md 分类路由表里被正式授权。**规则 A 与 vault AGENTS.md 分类路由表本身就存在不一致**，而不一致的部分恰恰由「自动化管道」这一性质调和。

3. **Hindsight 同步在本方案中的定位 = 05-holographic 的同类**：外部记忆系统 → 自动同步脚本 → raw 素材 → LLM 蒸馏。这是**已被既有约定承认的类别**（vault AGENTS.md:171 那一行就是为此类写的）。

**⚠️ 但这个判定有附加条件，不满足就真违反：**

| 条件 | 说明 |
|---|---|
| ① 必须由**脚本/cron**执行，不是 agent 在会话里 `write` | 否则就是规则 A 字面禁止的行为 |
| ② 必须**更新 vault AGENTS.md 的目录树与分类路由表** | 否则违反 wiki-lint `check_config_dir_references`（AGENTS.md 引用不存在的 raw 路径会报错，见 §3.5）与「先查后写」惯例 |
| ③ 必须**只落 raw/，绝不直接写 wiki/** | 直接写 wiki = 绕过 LLM 蒸馏 = 复刻 R-2 的失败 |
| ④ 规则 A（工作区 AGENTS.md）也需同步补一条例外 | 规则 A 是本工作区生效的硬规则，不改会让后续执行者处于「按哪个 AGENTS.md」的歧义 |

**保守路径（若用户不认可上述判定）**：改用 `raw/projects/<项目>/fix-notes/`——但**语义错误**（fix-notes 是 clsh 修复记录，编译去向是 `wiki/solutions/`），且会把 Hindsight 知识页错误地编成「跨项目可复利方案」。**不推荐**。

### R-2 🔴 复刻 holographic-sync 的污染失败（最高风险）

【读码确认：`~/.dsh/plugins/wiki-steward/../../.agents/skills/obsidian-operations/references/holographic-memory-architecture.md`「旧 holographic-sync.py 的污染问题」段】

```
后果：wiki/entities/ 有 1104 个文件，1091 个是垃圾；entities 表 1663 个 entity，1584 个是 session 日志标题
核心教训：
- fact ≠ entity — 不是每条 fact 都应该导出为 entity 文件
- Python 脚本不能替代 LLM 语义理解 — 绕过 ingest 用脚本"编译"必然产生垃圾
- 双向同步容易形成环路 — obsidian2holo 把 wiki 灌回 DB，holo2obsidian 又导出回 wiki
```

**对应到本方案的三条硬约束：**
1. **单向**：只做 Hindsight → raw → wiki，**绝不反向**（wiki → Hindsight）。反向会形成环路污染。
2. **不代编译**：同步脚本只搬素材，**不生成 wiki 页**。wiki 页由 cron #21 的 LLM 产出。
3. **质量门禁**：Hindsight 侧带 `trust` / `proof_count` / `fact_type`，同步时过滤（如 `proof_count >= 2`、跳过 `state` 已 invalidated 的记忆）；**空 body 一律不落**（当前 5 个页全是空的，见 §3.1）。

### R-3 🟡 存量 sha256 口径漂移未清（会放大问题）

【实测】`04-session_logs` 292/292 全部 `re_ingest`（已有 sha256 但全不匹配）。这不是「内容真的每天变」，而是**标记值与实际 body 哈希系统性不一致**。
**对本方案**：若同步脚本自算 sha256 时口径与 `ingest-pipeline.py` 有毫厘之差（如未做 universal-newlines 归一），会重演同款漂移 → **每夜全量重编译**。
**缓解**：sha256 务必按 INV-13 口径（body 在闭合 `---` 后 + `\r\n|\r`→`\n` + UTF-8 字节哈希），或用 `kb_mark` / `migrate` 已有的实现，不自造公式。
（**非本变更范围**，但需在方案中记录为前置依赖。）

### R-4 🟡 蒸馏 cron 已断 8 天（阻塞，非设计问题）

见 §4.2。`MISSING_CREDENTIAL: deepseek-official`。**不修这个，整条链路不通。**

### R-5 🟡 新增源会加重已积压的扫描面

现有 487 待编译（04-session_logs 292 + 05-kanban 178 + projects 17）。cron #21 单夜能处理多少无明确上限记录（历史 doc 提到「每次最多 5 个文件」——【读码确认：`obsidian-operations/references/ingest-pipeline-architecture.md`「Ingest Cron（2026-06-06 创建）」表：`上限 | 每次最多 5 个文件`】，但那是 2026-06-06 的旧 Hermes cron 配置，当前 21-wiki-ingest.md **无上限条款**）。
**含意**：若单夜只处理少量，487 存量 + 新增 Hindsight 项会长期排队。

### R-6 🟢 raw/ 是 git 仓库，自动同步会带走新目录

每日 01:00 `obsidian-git-sync.sh` 对 raw 做 `git add -A` + commit + push【读码确认】。新目录自动入库，**无额外动作**，但也就意味着**落错的素材会被自动提交并推送**，回滚成本变高。
**缓解**：同步脚本落盘前做 dry-run 校验。

### R-7 🟢 wiki/memory/ 是规划态（AGENTS.md 与实况不一致）

vault AGENTS.md:80,124 写了 `wiki/memory/ ← Holographic Memory 同步的有价值 fact`，但**该目录实际不存在**【实测】，且不在 wiki-ingest skill 的目录归属表中。**不要照 AGENTS.md 那一行的字面去建 wiki/memory/**——会造出一个 skill 不认的孤儿目录。

---

## 未决问题

| # | 问题 | 为何需要裁决 |
|---|---|---|
| **Q-1** | **同步对象到底是 knowledge pages 还是 memories？** 当前 5 个 knowledge page **body 全空**（`body: ""`、"No content yet."、`is_stale: true`），而 `memories/list` 有 **354 条**带 `text` 正文的 facts（world 195 / experience 119 / observation 37）。「记忆内容」若指 facts，落点设计完全不同（354 条 vs 5 页；facts 需要过滤与聚合，不能一条一文件——会重演 1091 垃圾文件）。 | 决定同步脚本的核心形态与粒度 |
| **Q-2** | **稳定命名 + 内容变更时重写 raw 文件，是否接受？** 字面上与「raw 只增不改」（wiki-ingest SKILL.md:19）冲突，但符合 `re_ingest` 机制的设计语义（「改写既有 wiki 页，不另起新页」）。替代方案（文件名带版本号、只增不删）会累积文件且每版触发编译。 | 规则解释需用户确认（铁律 3：不假设意图） |
| **Q-3** | **蒸馏产物 wiki 落点**：`Initiatives and enhancements` 最自然落点是 `wiki/projects/<project>/`，但 2026-09-26 裁决 A=丙 已令 wiki/projects **停止增长**（clsh 项目文档唯一事实源=工作区项目目录）。Hindsight 的「在飞倡议」页该落哪？另外 `Component map` / `Conventions and patterns` 在 concepts / entities / reference 之间也有歧义。 | 影响 wiki-ingest 编译时的归属判定，需要明确规则或逐页裁定 |
| **Q-4** | **bank 覆盖范围**：现有 2 个 bank（`coding-agent::dsh-plugins` 334 facts / `coding-agent::公共` 119 facts，后者知识库为空）。是只同步 dsh-plugins，还是全部 bank？`公共` bank 目前无知识页可同步。 | 决定 `bank-slug` 命名空间与目录是否再分层 |
| **Q-5** | **`SCAN_DIRS` 改动由谁落地、如何验证？** 改 `/opt/Workspace/scripts/obsidian/ingest-pipeline.py:32-40` 是 monorepo 外文件（`/opt/Workspace`）。改后需 `scan --source 06-hindsight --summary` 验证。是否纳入本变更范围？ | 跨工作区改动，需明确归属与验收 |
| **Q-6** | **AGENTS.md 两处不一致如何处置？** 工作区 AGENTS.md:11「只写 wiki/ 与 raw/projects/」vs vault AGENTS.md:170-171 授权 `04-session_logs`/`05-holographic` 自动写入。建议两边都补上 `06-hindsight`（vault 版补目录树+路由表；工作区版补「自动化管道例外」）。改 AGENTS.md 需用户确认（两边都是红线项）。 | 涉及两个 AGENTS.md 修改，均需用户确认 |
| **Q-7** | **蒸馏通道断裂（MISSING_CREDENTIAL）是否在本变更内修复？** 连续 8 天失败，是整条链路的现实阻塞。若不修，链路建了也不通。 | 决定本变更的完成判据 |

---

## 附：本次侦察执行过的命令（可复现）

```bash
# Ingest 流水线
sed -n '1,260p' /opt/Workspace/scripts/obsidian/ingest-pipeline.py
python3 /opt/Workspace/scripts/obsidian/ingest-pipeline.py scan --summary
python3 /opt/Workspace/scripts/obsidian/ingest-pipeline.py scan --source <dir> --summary   # 逐目录

# vault 结构
ls -la /mnt/unraid_data/Obsidian/ /mnt/unraid_data/Obsidian/raw/ /mnt/unraid_data/Obsidian/wiki/
cd /mnt/unraid_data/Obsidian/raw && for d in */ ; do ... find | wc -l ... done
ls /mnt/unraid_data/Obsidian/SCHEMA.md          # → No such file（已退役）
grep -n "raw" /mnt/unraid_data/Obsidian/AGENTS.md
sed -n '55,258p' /mnt/unraid_data/Obsidian/AGENTS.md
sed -n '1,80p' /mnt/unraid_data/Obsidian/wiki/INDEX.md

# 先例
cat "/mnt/unraid_data/Obsidian/raw/05-holographic/2026-05-15 clsh-project v2.md"
cat /root/.agents/skills/obsidian-operations/references/holographic-memory-architecture.md
cat /root/.agents/skills/obsidian-operations/references/ingest-pipeline-architecture.md
cat /opt/Workspace/backup/2026-09-27-停用脚本/MANIFEST.md

# cron / skill
cat /root/bin/tasks/21-wiki-ingest.md ; cat /root/bin/tasks/22-wiki-lint.md
crontab -l
cat /root/bin/dsh-cron.sh
grep -n "PIPELINE_SCRIPT\|scan\|distill" /root/.dsh/plugins/wiki-steward/lib/ingest-trigger.js
sed -n '1,60p' /root/.dsh/plugins/wiki-steward/lib/ingest-schedule.js
for d in 20260930 ... 20261007; do tail -2 /root/.dsh/logs/cron/wiki-ingest-$d.log; done

# wiki-lint
sed -n '389,450p' /opt/Workspace/scripts/obsidian/wiki-lint.py     # check_config_dir_references
sed -n '606,660p' /opt/Workspace/scripts/obsidian/wiki-lint.py     # check_expected_dirs

# 机械校验（只读）
kb_validate({target:"raw/05-holographic", rules:["frontmatter","naming","placement"]})  # → pass

# Hindsight（只读 GET / 幂等探测）
curl -s http://127.0.0.1:8888/health
curl -s http://127.0.0.1:8888/v1/default/banks
curl -s http://127.0.0.1:8888/v1/default/banks/coding-agent::dsh-plugins/knowledge-base/tree
curl -s http://127.0.0.1:8888/v1/default/banks/coding-agent::dsh-plugins/knowledge-base/export
curl -s http://127.0.0.1:8888/v1/default/banks/coding-agent::dsh-plugins/knowledge-base/pages/kp-b2a63...
curl -s http://127.0.0.1:8888/v1/default/banks/coding-agent::dsh-plugins/mental-models
curl -s http://127.0.0.1:8888/v1/default/banks/coding-agent::dsh-plugins/stats
curl -s "http://127.0.0.1:8888/v1/default/banks/coding-agent::dsh-plugins/memories/list?limit=1"
curl -s http://127.0.0.1:8888/v1/default/banks/coding-agent::dsh-plugins/documents
cat /root/.hindsight/coding-agent.json
```

**未执行**（只读约束 / 超时）：`POST /memories/recall`（实测 30s 超时，`HTTP=000`——该端点会触发 LLM reflect，非幂等快调用，侦察期避开）。
