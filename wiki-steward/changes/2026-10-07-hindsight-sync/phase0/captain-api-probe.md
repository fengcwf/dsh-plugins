# 队长直测 —— Hindsight API 面（Phase 0 硬事实）

> 执行者：灵犀（队长）｜时间：2026-10-07 17:12-17:20 +08:00
> 目的：在侦察卡回报前先钉住「需求 1（记忆 → raw → wiki）」的**数据源可行性**——
> 这是全部需求的技术地基，不可靠则后面三条全空。
> 方法：curl 实打本地 API，**每条标 HTTP 码与响应片段**。无鉴权 header 测试（明文中无密钥）。

## 环境事实（实测）
- API：`http://127.0.0.1:8888`（`~/.hindsight/coding-agent.json` 里 `apiUrl`，`serverMode: self-hosted`）
- `GET /health` → 200 `{"status":"healthy","database":"connected",...}` 【实测】
- banks（2 个，实测 `GET /v1/default/banks`）：
  - `coding-agent::dsh-plugins` — fact_count 219，last_write 2026-10-07T09:06:38Z
  - `coding-agent::公共` — fact_count 103，last_write 2026-10-07T09:06:57Z
- 进程面（ps）：`hindsight-api`(python, 8888)、`postgres`(5432)、
  `node dist/deepen.js --repo /opt/workdata/dsh-plugins --gitlog-limit 300 --harness dsh`
  —— 前两者属 **clsh 用户**（非 root）→ **外部自托管服务，不是 dsh 宿主拉起的**

## 关键端点实测表

| 端点 | 方法 | 结果 | 用途 |
|------|------|------|------|
| `/v1/default/banks/{bank}/knowledge-base/export` | GET | **200**，JSON `{files:[{path,content}]}` | ⭐ **整库 markdown 导出**＝同步数据源首选 |
| `/v1/default/banks/{bank}/knowledge-base/tree` | GET | **200** `{roots:[{id,kind,name,mental_model_id,...}]}` | 页清单/层级 |
| `/v1/default/banks/{bank}/knowledge-base/pages/{id}` | GET | **200** 单页 JSON（含 content） | 单页拉取 |
| `/v1/default/banks/{bank}/knowledge-base/pages` | GET | **405** Method Not Allowed | ⚠️ 列表不能用 GET（openapi 只声明 POST=创建） |
| `/v1/default/banks/{bank}/knowledge-base/search` | GET | openapi 声明（q 必填, limit） | 检索页 |
| `/v1/default/banks/{bank}/memories/list` | GET | **200** `{items,total,limit,offset}`，**total=334** | ⭐ 原始记忆条目（分页可遍历） |
| `/v1/default/banks/{bank}/documents?limit=N` | GET | **200** `{items:[{id,text_length,memory_unit_count,...}]}` | 文档（会话）级 |
| `/v1/default/banks/{bank}/llm-requests/stats` | GET | **200** `{buckets:[{time,statuses,total,tokens:{...}}]}` | ⭐ 状态分析：LLM 用量/token |
| `/v1/default/banks/{bank}/operations?limit=N` | GET | **200** `{total,operations:[{task_type,status,created_at,...}]}` | ⭐ 状态分析：后台任务进度 |
| `/v1/default/banks/{bank}/health/llm` | GET | **405** | ⚠️ 非 GET，需另探（openapi 待查方法） |

**鉴权**：全部实测请求**未带任何 header 即 200** → 本地监听无鉴权面。
（openapi 里这些端点有可选 `authorization` header 参数，但自托管模式未启用。）

## 导出产物实测（关键证据）
`knowledge-base/export` 返回 **7 个文件**（dsh-plugins bank）：
```
index.md                              4258 chars
kp-68633ae9de2746ce8a52204670072c3c.md  919   ← Component map
kp-0687509b5b914252854c3faa25dff2d5.md  958   ← Conventions and patterns
kp-083bfd017f504180b94799e92ec38aa7.md  950   ← Core concepts
kp-083bfd017f504180b94799e92ec38aa7.log.md 128
kp-b92ca9a4fd4d4bd9acc0eeb2050bb791.md 1049   ← Initiatives
kp-b2a63b795b054d658ef0e0437a9934d8.md  953   ← Key decisions
```
- 单页内容**自带 frontmatter**（`id` / `type: "knowledge-page"` / `title` / `description` / `tags` / `timestamp`）【实测，见 `kb-export-sample.json`】
- ⚠️ **现状：5 个知识页内容都是骨架（"No content yet." 级，919-1049 chars 且多为 description 复述）**
  → 说明知识页**尚未被填充**（这与我会话开头 hindsight_search 返回 "No content yet." 一致）
  → **重要推论**：同步「知识页」当前价值低；真正有料的是 **334 条原始记忆（memories/list）**
- 公共 bank 导出仅 `index.md`(91 chars) —— 该 bank 有 103 facts 但零知识页

原始记忆样例（实测 `memories/list?limit=3`）：
```json
{"id":"15cc803f-...","text":"尚未定的遗留项（agent 列出待用户指定）：...",
 "context":"conversation between the user and you (the coding agent): ...",
 "date":"2026-10-07T09:11:22.219000+00:00","fact_type":"world",
 "document_id":"conversation:session-16f70d15-...","entities":"user, knowledge:..."}
```
→ 记忆条目带 `date`（可做**同步日历**的时间轴数据源）、`document_id`（来源会话）、`fact_type`。

## 对四条需求的可行性判定（队长初判，待侦察卡复核）

| 需求 | 判定 | 依据 |
|------|------|------|
| U1 记忆 → raw → wiki | 🟢 **可行**（数据源已实测） | export 端点 200 + 内容自带 frontmatter；memories/list 334 条可分页 |
| U2 手动同步 + 日历 + 时间调整 | 🟢 **可行** | memories 有 `date` 字段可做日历时间轴；定时机制插件已有 `lib/ingest-schedule.js` 现成范式可复用 |
| U3 状态分析 | 🟡 **部分可行** | `llm-requests/stats` + `operations` + bank fact_count 可组状态面板；但 `health/llm` 是 405，需另找方法 |
| U3 启停按钮 | 🔴 **高度受限**（待侦察卡定论） | 见下「启停面硬约束」 |

## 启停面硬约束（队长实测 + 推断，⚠️ 这是本波最大风险点）
1. **Hindsight 不在 profile `cordis.patch.yml` 里**：
   实测 `grep -in hindsight /root/.dsh/profiles/web/cordis.patch.yml` → **零命中**。
   注册面在 `package.json` 的 `dsh.profile.bundles` 数组（第 38 行）+ `dependencies`（第 7 行）。
   → 该包自带 `cordis.patch.yml`（`dsh.bundle.patch`）被追加进 bundle 列表。
2. **`patchReload: "live"`**（package.json:43）→ 改 profile 配置会**热重载**，
   但 LEARNINGS LRN-033 记载：「web profile 的 cordis.patch.yml 热重载是无条件的，
   结构性变更会拆掉活树工具面」→ ⚠️ **动 profile 配置有撞塌活工具面的历史事故**。
3. **daemon 不是 dsh 拉起的**：hindsight-api / postgres 属 clsh 用户进程，
   杀掉后 dsh 不会自动拉起 → **「启停按钮」真停 daemon = 不可逆风险**（需用户确认，且重启手段不在 dsh 面）。
4. **推论**：「启停按钮」最现实的语义是 **启停「wiki-steward 侧的同步行为」**（插件自治），
   而非启停 Hindsight 插件本身或 daemon。真停插件需改 profile（热重载有风险）；
   真停 daemon 需 clsh 用户权限外部操作。**这一条必须回用户面拍板。**

## 误操作留痕（自查，ERRORS [2026-10-01] 回执纪律）
- 17:07 我误执行 `phase0-scan.py --help`，脚本把 `--help` 当 project_dir，
  在工作区根建了 `--help/changes/20261007-phase0/phase0-data.json`（551B，内容为空扫描）。
- 已查证内容（project_dir="--help"、file_count 0）后 `rm -rf -- '--help'` 删除；
  `git status --short | grep -i help` 零命中佐证已清理。

---

## 追加：侦察卡 A 回报后的队长复核（2026-10-07 17:22+）

### 复核 1：知识页 body 真空 —— 我亲自复验，确认
`GET .../knowledge-base/pages/kp-68633ae9de2746ce8a52204670072c3c` 实测：
```
keys: ['id','name','type','description','tags','timestamp','body','markdown']
body:     len=0        ← 真空
markdown: len=936      ← 全是 frontmatter + description 骨架
```
**结论：侦察卡「body 全空」属实。** 注意区分：`markdown` 字段非空（936）容易误判为"有内容"，
但那只是 frontmatter 回填，**正文 body 是 0**。同步逻辑必须以 `body` 判定，不能用 `markdown` 长度。

### 复核 2：hindsight 自带 diagnose/sync_status 工具就在我工具面上 —— 直接调了
（侦察卡 A 发现 #7 说插件注册了 8 个工具含 diagnose/sync_status；我核实确实在我的工具面里，遂直接调用）

`hindsight_diagnose` 实测返回：
```json
{"bank_id":"coding-agent::dsh-plugins","harness":"dsh","workspace":"/opt/workdata/dsh-plugins",
 "config":{"path":"/root/.hindsight/coding-agent.json","exists":true,
           "api_url":"http://127.0.0.1:8888","api_token_configured":false,"disabled":false},
 "credential":{"api_token_in_use":false,"api_token_matches_config":true},
 "environment":{"config_override":false,"hooks_disabled":false,"log_level":null,
                "diagnostics_file":"/root/.hindsight/coding-agents-logs/diag.jsonl",...}}
```
→ **`disabled: false` 是官方诊断面自己暴露的开关状态位**。
  ⭐ 这给「状态分析面板」提供了**官方口径数据源**，不必自造（呼应侦察卡 A #7「勿自造」）。

`hindsight_sync_status` 实测返回：
```json
{"bank":"coding-agent::dsh-plugins","gitlogPresent":true,
 "gitDiffDocs":0,"gitDiffTarget":155,     ← 有 155 个 git commit 待播种，当前 0
 "chatDocs":4,"pagesCount":5,
 "surveyBaseline":null,"surveyDocs":0,"surveyCommitsBehind":null,
 "activeOps":3,"synced":false}            ← 整体未同步
```
→ 🔴 **这是本波迄今最重要的一个信号**：`synced:false` + `gitDiffTarget:155` + `surveyBaseline:null`
  说明**记忆库本身尚未完成播种**（git 历史侧 0/155，survey 未建基线）。
  知识页空不是 bug，是**上游还没喂饱**的自然结果。

### 复核 3：后台任务状态分布（实测 `/operations?limit=30`）
```
total: 20
status: completed 15 / processing 2 / failed 2 / pending 1
task_type: refresh_mental_model 8 / batch_retain 5 / retain 5 / consolidation 2
```
- 存在 `failed`(2) 与 `processing`(2) 并存 → 与侦察卡所述 reflect 300s 墙钟超时一致
- ⚠️ `retain`(15 条 completed/processing) 说明**会话记忆是在正常入库的**（memories total=334 可印证）
  → 即：「原始记忆有料」与「知识页空壳」并存 —— 二者是**两条独立成熟度**的数据源

### 对我此前给用户的启停三档（A/B/C）的修正
侦察卡给出更细的 L1-L4，且**推翻我一个说法**：
- 我原说「改 profile cordis.patch.yml」→ ❌ 不准确。profile patch 里**根本没有 hindsight 行**
  （grep 零命中，我与侦察卡结论一致）。真实注册面是 `package.json` 的 `dsh.profile.bundles` 数组。
- 我原说「daemon 属 clsh 用户进程」→ 🟡 不完整。侦察卡实测 8888 由 **docker-proxy** 持有，
  daemon 是**容器 `hindsight`**（属 clsh 用户），不在 dsh 生命周期内，查不到 cron/systemd 拉起者。
- **我的 A/B/C 与 L1-L4 的对应**：我的 A≈L1（停同步行为，可行）、我的 B≈L2（改配置，需重启）、
  我的 C≈L3（停容器，需 docker 权限且不可逆）。
- 新增一档：**L2 的配置开关已由 `hindsight_diagnose` 实测证实存在且当前 `disabled:false`**，
  但官方文档明写「config not watched」→ 改了需重启 agent 生效。
