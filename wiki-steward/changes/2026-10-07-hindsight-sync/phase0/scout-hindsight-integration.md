# Phase 0 技术侦察：Hindsight 记忆同步 + 状态面板

- **侦察日期**：2026-10-07
- **侦察对象**：`@vectorize-io/hindsight-coding-agents` v0.8.0（生产 profile `web`）+ Hindsight HTTP API v0.10.2
- **范围**：只读调研 + curl GET 探测。**未修改任何文件，未重启任何服务，未执行 installer 写入类命令。**
- **目标**：为 `wiki-steward` 新增「Hindsight 记忆同步 + 状态面板」提供事实基础

> 证据分级：`【实测】`=本会话 curl/命令真实执行并有响应；`【源码】`=读 dist 源码推断；`【文档】`=读 README/SKILL 推断；`【推断】`=基于以上组合的判断。
> 全程未出现任何凭据明文；凭据小节仅记录**环境变量名**。

---

## 一、结论摘要（一页）

| # | 结论 | 判定 |
|---|---|---|
| 1 | 插件 `dist/dsh.js` 导出 default `{name:"hindsight", inject:["agents"], apply}`，听 4 个事件（`agent/session-start`、`agent/pre-step`、`agent/turn-stopping`、`agent/disposed`），通过 `ctx.inject(["tools"])` 注册 8 个工具 | 可行 |
| 2 | 记忆数据可用 HTTP 读取：**无需任何鉴权**（无 header 即 200），77 个端点全开放 | 可行 |
| 3 | knowledge pages **列表/单页/搜索/导出四个端点全部实测可用**，是「记忆→raw→wiki」的合格数据源 | 可行（**但有致命前提，见 #4**） |
| 4 | ⚠️ **当前 5 个知识页 body 全为空**（`body_len=0`），仅 markdown 模板有内容。同步得先把「 meiner page 内容」触发出来，否则同步的是空壳 | 需条件 |
| 5 | `~/.hindsight/coding-agent.json` 有 **`disabled` 硬开关** + `optInOnly`/`optInPaths`/`banks.<id>.disabled` 三级 opt-out | 可行 |
| 6 | 该配置文件**不被监听**，持久型插件（含 dsh）「once per workspace, when the host loads the plugin」→ 改 `disabled` **必须重启 dsh 宿主**才生效 | 需条件 |
| 7 | ⚠️ **生产 profile 的 `cordis.patch.yml` 里没有 hindsight 行**（启动事实有误）——它是通过 `package.json` 的 `dsh.profile.bundles` + 包内 `cordis.patch.yml` 自动 insert 加载的 | 事实更正 |
| 8 | profile 声明了 `"patchReload": "live"`，但「live」是否覆盖 bundle 层（hindsight 在 bundle 层而非 patch 层）**未证实** → 不能假设能热插拔 | 需条件 |
| 9 | API 服务跑在 **Docker 容器 `hindsight`**（`docker-proxy` 持有 8888），容器内 python + postgres 属 clsh 用户 → wiki-steward 若要真停 daemon 须能执行 docker | 需条件 |
| 10 | 面板「启停 Hindsight」能做到的最深层：**停本插件自身的轮询/同步行为（立即生效、零成本、完全可控）**；真停 daemon 或卸载插件都需宿主重启 | 诚实结论 |
| 11 | CLI：`status.js --repo <path>`、`deepen.js --repo`、`hindsight-seed.js seed --repo`、`installer.js stats|update`（install/uninstall 未执行） | 可行 |
| 12 | 播种进度可读：`/operations` 列表 + 单 op 详情 + `plugin.log` 的 `waiting for N server-side op(s)` + `fact_count` 稳定三重判据 | 可行 |

---

## 二、注册面（`dist/dsh.js`，723KB，仅 grep 不整读）

### 2.1 导出符号

来源：`dist/dsh.js` 末段 export 块（约 18775-18782 行）

```
var dsh_default = { name, inject, apply };
export { apply, createDshHooks, dsh_default as default, dshSessionEvents, inject, name, toDshParameters };
```

- `name` = `"hindsight"`（来源：`// src/dsh.ts` 段 `var HARNESS2 = "dsh"; var name = HINDSIGHT_PLUGIN;`，而 `var HINDSIGHT_PLUGIN = "hindsight"`）
- `inject` = `["agents"]` 【源码】
- `apply(ctx)` 是入口 【源码】
- 另有 `createDshHooks`、`dshSessionEvents`、`toDshParameters` 三个辅助导出

### 2.2 监听的 dsh 事件（4 个）

```js
function apply(ctx) {
  const hooks = createDshHooks(workspaceForAgent);
  ctx.on("agent/session-start", hooks.sessionStart);
  ctx.on("agent/pre-step", hooks.preStep, { prepend: true });
  ctx.on("agent/turn-stopping", hooks.turnStopping);
  ctx.on("agent/disposed", hooks.disposed);
  ctx.inject(["tools"], (toolCtx) => { registerTools(toolCtx, process.cwd()); });
}
```

【源码，`dist/dsh.js` apply 函数】注意 `pre-step` 带 `{ prepend: true }` —— 它在别的前置钩子**之前**跑，这是注入记忆合成的位置。工具注册走 `ctx.inject(["tools"])`，**不是** `ctx.plugin(` ，也不是 `defineTool(` （这两个模式在本文件中不存在 —— 实测 grep 无命中）。

### 2.3 注册的工具（8 个，与我当前工具面完全吻合）

`dist/dsh.js` 与 `dist/index.js` grep `"hindsight_[a-z_]*"` 去重后一致：

| 工具名 | 用途（据 SKILL.md 第 34-47 行） |
|---|---|
| `hindsight_search_knowledge_pages` | 项目问题**第一站**，BM25+向量混合搜素【文档】 |
| `hindsight_read_knowledge_page` | 按 page_id 读全文【文档】 |
| `hindsight_list_knowledge_pages` | 列出全部知识页【文档】 |
| `hindsight_reflect` | 深度 WHY 推理，慢（数秒到数分钟）【文档】 |
| `hindsight_ingest_document` | **写操作**，外部文档/笔记存入记忆 |
| `hindsight_capture_initiative` | **写操作**，新 feature/initiative 立项登记 |
| `hindsight_diagnose` | 报告「配置文件现状 vs 运行客户端实际在用」的差距【文档 SKILL.md:148】 |
| `hindsight_sync_status` | 索引构建/注入同步状态（对应 runbook 里 religado "not fully queryable" 判定） |

另有内部符号 `plugin__hindsight-coding-…__hindsight_ingest_document` 形式（README:81 提到命名前缀行为）与一个 `hindsight_` 空串（字符串拼接产物，非真工具）。

**对状态面板的意义**：`hindsight_diagnose` 与 `hindsight_sync_status` 的实现是官方「健康/同步状态」判定的最佳参考蓝本 —— 面板语义应对齐它们，别自造口径。

---

## 三、可编程读取记忆（HTTP API）

**服务**：`http://127.0.0.1:8888`，OpenAPI 版本 `0.10.2`，共 **77 个路径**【实测，`curl /openapi.json` HTTP 200，342167 字节】

### 3.1 鉴权：不需要

实测四条：

```
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8888/v1/default/banks              → 200
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer BOGUS" …/v1/default/banks  → 200
components.securitySchemes                                                                 → {}
top-level security                                                                         → []
```

【实测】OpenAPI 未声明任何 security scheme，带错误 bearer 也 200。**结论：本地自托管部署无任何鉴权，wiki-steward 直连 GET 即可，无需任何 header。**（若日后切到 Hindsight Cloud，`apiToken` 才登场，且 socket nor config item 名已在 —— 但本报告不写值。）

### 3.2 bank 列表与元数据 ✅ 实测

```bash
curl -s http://127.0.0.1:8888/v1/default/banks
```

响应（实测，已裁剪 `mission`/`disposition` 长字段）：

```json
{"banks":[
 {"bank_id":"coding-agent::dsh-plugins","created_at":"2026-10-07T08:54:08.604844+00:00",
  "fact_count":302,"last_document_at":"2026-10-07T09:03:02.354136+00:00",
  "last_write_at":"2026-10-07T09:11:16.147594+00:00"},
 {"bank_id":"coding-agent::公共","created_at":"2026-10-07T08:58:14.250622+00:00",
  "fact_count":115,"last_document_at":"2026-10-07T08:59:02.952082+00:00",
  "last_write_at":"2026-10-07T09:10:18.374139+00:00"}]}
```

> ⚠️ **事实更正**：启动事实说 fact_count 分别 103 / 219。实测（17:1x）为 **302 / 115** 且 created_at 都是**今天 08:54-08:58**——银行是今日重建的旧帳本与新帳本，计数随时间与抽取进度增长，任何面板**不能把 fact_count 当静态值缓存**，必须每次实时拉。

`fact_count`、`last_write_at`、`created_at` 三者齐备 → 状态面板「记忆健康度/新鲜度」指标直接可用。

### 3.3 bank 深度统计 ✅ 实测（比 openapi 描述更有用）

```bash
curl -s "http://127.0.0.1:8888/v1/default/banks/coding-agent%3A%3Adsh-plugins/stats"
```

（`bank_id` 含 `::`，必须 URL 编码为 `%3A%3A`；`公共` 需 UTF-8 编码 `%E5%85%AC%E5%85%B1`）

```json
{"bank_id":"coding-agent::dsh-plugins","total_nodes":302,"total_links":10347,"total_documents":3,
 "nodes_by_fact_type":{"experience":102,"observation":24,"world":176},
 "links_by_link_type":{"caused_by":57,"semantic":5324,"temporal":4335,"entity":631},
 "pending_operations":2,"failed_operations":1,
 "operations_by_status":{"failed":1,"completed":11,"pending":2,"processing":2},
 "last_consolidated_at":"2026-10-07T09:08:51.209318+00:00",
 "last_memory_write_at":"2026-10-07T09:11:16.147594+00:00",
 "pending_consolidation":252,"failed_consolidation":0,"total_observations":24}
```

这是**状态面板的核心数据源**：一个请求同时给出 pending/failed operations、consolidation 积压（252）、 fact type 分布、last write 时间。【实测】

### 3.4 knowledge pages（同步数据源）✅ 实测，但有致命前提

**(a) 列表——树形**

```bash
curl -s "http://127.0.0.1:8888/v1/default/banks/coding-agent%3A%3Adsh-plugins/knowledge-base/tree"
```

实测 dsh-plugins bank 的 5 个页：

| kind | name | page_id | is_stale |
|---|---|---|---|
| page | Component map | `kp-68633ae9de2746ce8a52204670072c3c` | true |
| page | Conventions and patterns | `kp-0687509b5b914252854c3faa25dff2d5` | true |
| page | Core concepts | `kp-083bfd017f504180b94799e92ec38aa7` | true |
| page | Initiatives and enhancements | `kp-b92ca9a4fd4d4bd9acc0eeb2050bb791` | true |
| page | Key decisions and rationale | `kp-b2a63b795b054d658ef0e0437a9934d8` | true |

**(b) 单页全文**

```bash
curl -s "http://127.0.0.1:8888/v1/default/banks/coding-agent%3A%3Adsh-plugins/knowledge-base/pages/kp-68633ae9de2746ce8a52204670072c3c"
```

返回字段：`id / name / type / description / tags / timestamp / body / markdown`

🔴 **关键发现（决定功能能否落地）**：

```
Component map            | body_len= 0
Conventions and patterns | body_len= 0
Core concepts            | body_len= 0
Initiatives and enhancements | body_len= 0
Key decisions and rationale  | body_len= 0
```

【实测，连续两次拉取均如此】`markdown` 字段有 ~970 字节但仅是 frontmatter+description 骨架；`body` 全空。KB export 抽样也确认 export 出来的 `.md` 内容只到 description 为止。

**原因**（【推断】，有强证据支撑）：5 页全部 `is_stale: true`，而 `/operations` 显示 `refresh_mental_model` 有 1 个 **failed**（错误信息：`Task exceeded the 300s wall-clock limit for 'refresh_mental_model' … Raise HINDSIGHT_API_REFLECT_WALL_TIMEOUT`）且当前仍有 1 个 `processing`。知识页 body 是 reflect 成功后才写入的，300s 墙钟超时导致内容从未生成。

**对功能的影响**：现在做「记忆→wiki 同步」，同步到的是 5 个空壳页。**必须先解决 reflect 超时**（提高 `HINDSIGHT_API_REFLECT_WALL_TIMEOUT` 或降 `reflectBudget`），否则整个功能交付的是空内容。这是本次侦察最重要的一条。

**(c) 搜索**

```bash
curl -s -G --data-urlencode "q=组件 wiki" --data-urlencode "max_results=3" \
  "http://127.0.0.1:8888/v1/default/banks/coding-agent%3A%3Adsh-plugins/knowledge-base/search"
```

⚠️ **参数名是 `q` 不是 `query`**——用 `query` 会 422：

```json
{"detail":[{"type":"missing","loc":["query","q"],"msg":"Field required","input":null}]}
```

【实测】正确用法返回 `{"results":[{"id":…,"name":…,"source_query":…,"snippet":"No content yet.","score":0.5,…}]}` —— `snippet: "No content yet."` 再次印证 body 为空。

**(d) 导出（一次性拿全库 markdown）✅ 实测**

```bash
curl -s "http://127.0.0.1:8888/v1/default/banks/coding-agent%3A%3Adsh-plugins/knowledge-base/export"
# → HTTP 200, 9822 bytes, JSON: {"files":[{"path":"index.md","content":"…"}, …共 7 个文件]}
```

含 `index.md` + 每页一个 `.md` + 一个 `.log.md`。**这是「全量同步」最省事的入口**：一个请求拿全部页面的 markdown bundle，比逐页 GET 更适合批量同步任务。

### 3.5 memories 列表 / recall ✅ 实测

**列表**

```bash
curl -s -G --data-urlencode "limit=2" \
  "http://127.0.0.1:8888/v1/default/banks/coding-agent%3A%3Adsh-plugins/memories/list"
# → {"items":[{"id":"33bfe378-…","text":"教训资产落册：LRN-042…（REF-ID: conversation:session-…）| When: 2026-09-29 | Involving: agent","context":"conversation between…", …}]}
```

**recall（POST）**

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"query":"wiki-steward 记忆同步","max_tokens":1024}' \
  "http://127.0.0.1:8888/v1/default/banks/coding-agent%3A%3Adsh-plugins/memories/recall"
# → {"results":[{"id":"1537e715-…","text":"B1/B2 修复模式跨插件推广：kb-context 0.3.1 → wiki-steward 0.4.1…","type":"world","entities":["kb-context","wiki-steward"],"context":"git commit-message history (last 148) for dsh-plugins", …}]}
```

⚠️ **实测坑**：recall 首次调用返回 `[HTTP:000]`（连接被断/超时），加长 timeout 后成功。**recall 是 LLM 参与的重操作，客户端必须给足超时（建议 ≥30s，reflect 类需数分钟）**。这一点直接决定 wiki-steward 后端 fetch 的超时配置。

### 3.6 运行状态类端点

| 端点 | 实测结果 | 面板用途 |
|---|---|---|
| `GET /health` | 200，`{"status":"healthy","database":"connected","db_acquire_ms":1.2,"db_pool_waiting":0,"db_pool_in_use":0,"db_pool_max":100,"db_pool_idle":3}` | daemon 存活 + DB 连接池水位 |
| `GET /health/ready` | 200，同上 | 就绪探针 |
| `GET /health/live` | openapi 有，未单独验证（同族推断可用） | 存活探针 |
| `GET /version` | 200，`{"api_version":"0.10.2","features":{…"worker":true,"bank_config_api":true,"bank_llm_health":false,"llm_trace":true}}` | **feature flags 决定哪些端点真可用**（注意 `bank_llm_health:false`、`audit_log:false`） |
| `GET /metrics` | 200，Prometheus 文本（python_gc_*, …） | 可选，需解析 Prometheus 格式 |
| `GET /v1/default/banks/{id}/operations` | 200，16-17 条 | **后台抽取进度主数据源** |
| `GET /v1/default/banks/{id}/operations/{op_id}` | 200，`{"operation_id":…,"status":"processing","operation_type":"refresh_mental_model","mental_model_id":…,"created_at":…,"progress":null,…}` | 单任务详情 |
| `GET /v1/default/banks/{id}/llm-requests/stats` | 200，`{"period":"7d","buckets":[{"time":"2026-10-07T00:00:00+00:00","statuses":{"success":51},"total":51,"tokens":{"input":539436,"output":95407,"cached":289216,"thoughts":42116,"total":634843}}]}` | token 消耗/成本/失败率 |
| `GET /v1/default/banks/{id}/llm-requests` | 200 | 逐条 trace |
| `GET /v1/default/banks/{id}/config` | 200，含 `retain_mission` 等服务端配置 | 读当前 retain 策略 |
| `GET /v1/default/banks/{id}/mental-models` | 200，5 个 mm，均 `content:null, is_stale:true` | 页面背后的 mental model 状态 |
| `GET /v1/default/banks/{id}/documents` | 200，`{"items":[{...,"text_length":32257,"memory_unit_count":27,…}]}` | 哪些会话已入库 |
| `GET /v1/default/banks/{id}/audit-logs/stats` | 200（但 `/version` 显示 `audit_log:false`，近端点 exist 但 data may be degrade） | — |
| `GET /v1/default/banks/{id}/observations/scopes` | 200，`{"scopes":[{"tags":[],"count":33}],"total":1}` | consolidation 分组 |
| `POST /v1/default/banks/{id}/health/llm` | GET 返回 **405**（正确）—— 仅 POST；**未执行**（会触发真实 LLM 调用） | 连通性自检，按需手动触发 |

> 未验证清单（openapi 中看到但本会话未 curl）：`/health/live`、`/v1/default/banks/{id}/memories/{id}`、`/graph`、`/entities`、`/tags`、`/prompts/preview`、`/memories/dry-run-extract` 等写/重类。

---

## 四、启停语义（最关键的一节）

### 4.1 途径 A：profile cordis.patch.yml —— ❌ **启动事实有误**

包内 `cordis.patch.yml` 确实有这样一段（原文贴出，`cat -A` 确认）：

```
- insert:
    - id: hindsight
      name: "@vectorize-io/hindsight-coding-agents/dsh"
```

但**生产 profile `/root/.dsh/profiles/web/cordis.patch.yml` 里没有任何 "hindsight" 字符串**：

```
grep -a -n -i "hindsight" /root/.dsh/profiles/web/cordis.patch.yml   → (no output)
```

该文件 top-level `- id:` 共 11 个：webserver、login-gate、agent-default-model、llm-pi-ai、web-search-deepseek、ui-settings-general、agent-preset-registry、agent-teams、ui-chat、obsidian-web、wiki-steward。【实测】

**真实加载路径**是 `dsh.profile.bundles`（`profiles/web/package.json`）：

```json
"dsh": {"profile": {"bundles": [ … "@vectorize-io/hindsight-coding-agents", … ],
                    "patchReload": "live"}}
```

机制：①bundle 列出包名 → ②包 `package.json` 声明 `"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}` → ③dsh 把包内 patch 的 `insert` 行追加进 profile 的有序 bundle 列表。包内 patch 文件注释原文亦自证：

> `dsh plugin --profile <name> add @vectorize-io/hindsight-coding-agents` installs this package into the profile and … appends this file to the profile's ordered bundle list. Nothing else needs editing

**要 disable**：包内 patch 注释给了官方姿势，是 patch 到 **profile 自己的** patch 文件里：

```yaml
- id: hindsight
  disabled: true
```

【文档，包 `cordis.patch.yml` 第 13-15 行注释】这需要写 profile patch 文件（属生产变更，`wiki-steward` 不应自动代写），且 **仍需 dsh 重启**（持久型插件）—— profile 的 `patchReload: "live"` 我未能在 dsh 源码/docs 中找到语义定义（`grep -rn "patchReload" /usr/local/lib/node_modules/@deepseek-ai/dsh/` 零命中），且 hindsight 在 **bundle 层**而非 patch 层，**「live」是否覆盖 bundle 层未证实 → 不能假设热插拔可行**。【推断】红线下结论：**不能承诺点击即生效，必须按「需重启」设计。**

### 4.2 途径 B：启停 hindsight-api daemon —— Docker 容器，非 cron/systemd

```
ss -ltnp | grep 8888
→ LISTEN 0 4096 0.0.0.0:8888 users:(("docker-proxy",pid=723434,fd=8))

docker ps --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Command}}'
→ 7ac8ae4aaece   hindsight   ghcr.io/vectorize-io/hindsight:latest   Up 40 hours   "/app/start-all.sh"
```

容器内：`/app/api/.venv/bin/python /app/api/.venv/bin/hindsight-api`（pid 723487）+ postgres 18.1.0（`-p 5432`，数据目录 `/home/hindsight/.pg0/instances/hindsight/data`），进程属 **clsh 用户**，已运行 **1 天 15 小时**。

**谁拉起它**：本会话查不到 e2e 证据 —— root 与 hindsight 相关 cron 为空（`crontab -l | grep -i hindsight` 无输出）、`/etc/systemd/system/` 无 hindsight unit、`systemctl list-units --all | grep hindsight` 无输出、`/root/bin/dsh-*.sh` 脚本均无 hindsight 引用。唯一间接证据是容器已 `Up 40 hours`（超过单次 dsh 会话寿命）→ 【推断】由 Docker 自身的 restart policy 或人工 `docker run/create` 建立，**大概率有 `--restart` 策略**（这也是为何拉满 1 天+）。**属 clsh 用户的外部自托管服务，不在 dsh 生命周期内。**

`/root/.dsh/start-dsh.sh` 与 hindsight 的唯一关系是**注入凭据**（第 45-50 行）：

```bash
# Hindsight 记忆 daemon 抽取用 LLM（2026-10-06 新增）
HINDSIGHT_ENV="$DSH_HOME/plugins/hindsight/data/llm.env"
[ -r "$HINDSIGHT_ENV" ] && . "$HINDSIGHT_ENV" || echo "[WARN] Hindsight LLM 凭据缺失…"
```

→ **start-dsh.sh 不拉起 daemon**，只 source 环境变量。【实测】

### 4.3 途径 C：`~/.hindsight/coding-agent.json` 配置项全集

现状（【实测】全文）：

```json
{ "serverMode": "self-hosted", "apiUrl": "http://127.0.0.1:8888" }
```

文件权限 `-rw-------`，`~/.hindsight/` 目录 `drwx------`。

**配置项全集**（【文档】，来源 `skill/SKILL.md:207-237` 与 `README.md:478-625` 的 Reference 表，两处一致）：

*连接/路由*：`apiUrl`、`apiToken`、`serverMode`(cloud|self-hosted|daemon)、`apiPort`、`bankId`、`dynamicBankId`、`bankIdTemplate`、`mapPathToBank`、`resolveWorktrees`、`disabled`、`daemonProfile`、`embedVersion`、`embedPackagePath`

*Opt-out（三级）*：`disabled`（全局硬开关）、`optInOnly`+`optInPaths`（白名单）、`banks.<bankId>.disabled`（黑名单，如 README:865 `"coding-agent::secret-client": { "disabled": true }`）、`harnesses.<name>.disabled`（per-agent，如 `"claude-code": {"disabled": true}`）

*写入行为*：`retainTags`、`retainMetadata`、`retainContext`、`retainExtractionMode`(concise|verbose|verbatim|chunks)、`manageBankConfig`、`defaultBankConfig`、`observationScopes`、`maxParallelRetains`、`retainSessions`

*注入/检索*：`autoInject`(reflect|pages|recall|none)、`autoReflect`(deprecated)、`injectTimeoutMs`、`reflectTimeoutMs`、`reflectToolTimeoutMs`、`reflectBudget`、`pageSearchLimit`、`recallOptions`、`pageRefreshEveryTurns`、`toolGuideExtra`

*播种/知识页*：`autoSeed`、`seedLimit`(300)、`codebaseSurvey`、`surveyModel`、`surveyBudgetUsd`、`surveyRefreshCommits`、`pageTriggerType`(cron|auto-refresh|manual)、`pageTriggerCron`("H * * * *")、`pages`、`customPages`

*杂项*：`logLevel`、`autoUpdate`、`HINDSIGHT_CONFIG`（换配置文件路径）、`HINDSIGHT_LOG_FILE`/`HINDSIGHT_DIAG_FILE`/`HINDSIGHT_USAGE_FILE`/`HINDSIGHT_LOG_LEVEL`

**环境变量对照**：每个 setting 有 `HINDSIGHT_<FIELD_IN_CAPS>` 形式；`HINDSIGHT_API_URL`、`HINDSIGHT_API_TOKEN`；任意 `HINDSIGHT_API_*` 会**透传给 daemon**。【文档 SKILL.md:109-129】

**生效时机**（【文档】SKILL.md 「When a change takes effect」表，截取 dsh 行）：

| host | reads the file | an edit applies |
|---|---|---|
| persistent plugins (… **DeepSeek Harness**) | once per workspace, when the host loads the plugin | **after restarting the agent** |

例外：`apiToken` 每次被拒后重读，不需重启。其余（含 `disabled`、`apiUrl`、bank 路由、`gitIngest`）全需重启。

> 🔴 一句话：**配置文件不被 watch**（原文："Config is read when a process starts — the file is not watched"）。

### 4.4 🔑 关键结论：面板「启停」能做到哪一层（诚实分档）

| 层级 | 能力 | 是否需重启 | 是否需要 docker | 诚实判定 |
|---|---|---|---|---|
| **L1 — 停本插件的同步行为** | wiki-steward 自己停止轮询/拉取/ write-back；UI 立即反馈 | **不需要** | 不需要 | ✅ **完全可行**。这是唯一诚实意义上「点击立即生效」的启停，代价是「Hindsight 记忆仍在后台被 Hindsight 自己抽取，只是 wiki-steward 不读不同步」 |
| **L2 — 让整个记忆系统停写/停注入** | 改 `coding-agent.json` 的 `disabled: true`（或 `banks.<id>.disabled`） | **需要 dsh 重启** | 不需要 | ⚠️ **需条件**。语义最强（官方称 "hard off-switch, inert plugin/hook — a no-memory baseline"），但按文档 dsh 属持久型插件 → 改完须重启宿主才生效。且写生产配置文件属红线圈定的「生产变更」，须用户确认、不应自动代写 |
| **L3 — 真停 hindsight-api daemon** | `docker stop hindsight` | 不需要 | **需要 docker 权限** | ⚠️ **需条件且高风险**。daemon 是 clsh 用户的外部服务（承载 公共 bank 等他人数据），停它会波及所有 harness 与其他使用者；且因容器疑似有 restart policy，`stop` 后可能被自动拉回。红线「不可逆操作/重启服务须确认」直接适用 |
| **L4 — 卸载插件自身** | 删 profile bundles 条目 / `dsh plugin remove` | **需要 dsh 重启** | 不需要 | ❌ 对面板不可用（超出合理 actuators 范围） |

**推荐设计**：面板做 **L1**（真实开关、立即生效）+ **L2 的「待重启生效」指示**（写入配置后明确徽标「⏳ 将在 dsh 重启后生效」，并给出 `hindsight_diagnose` 语义的「配置 vs 运行中」对照）。**绝不在面板上放 L3/L4 的一键按钮**，最多放只读的 daemon 状态展示。

---

## 五、CLI 面

> 纪律：**仅跑 `--help` 与非写入命令**，未执行 install/uninstall。

| 文件 | 用途 | 可用命令（实测 `--help` 输出） |
|---|---|---|
| `dist/installer.js`（bin: `hindsight-coding-agents`） | 安装/卸载/升级 gate paper | `hindsight-coding-agents <install\|uninstall> <all\|harness...>`；`update`（只重 stage runtime，不动 host 配置）；**`stats`**（安全只读）；flags `--server cloud\|self-hosted\|daemon`、`--api-url`、`--api-token`、`--import-conversations`、`--enable-workspace-mcp`。harness 列表含 `dsh`。⚠️ 无 TTY 时不提示，须显式传 `--server` |
| `dist/status.js` | repo 状态查看 | `node status.js --repo <path> [--bank <id>] [--api-url U]` |
| `dist/deepen.js` | git 历史深化播种 | `node deepen.js --repo <path> [--bank <id>] [--harness <name>] [--conversations f.json] [--api-url U] [--api-token X] [--config path] [--gitlog-limit N] [--git-ingest message\|full\|none]` |
| `dist/hindsight-seed.js` | 播种 | `hindsight-seed seed --repo <dir>` |
| `dist/daemon-start.js` | 拉起 `hindsight-embed` daemon（`serverMode: daemon` 模式）；spawn `uvx hindsight-embed@<version>`（或 `uv run --directory <embedPackagePath>`） | `--help` **无输出**（非 CLI-first，作库/内部调用使用）【实测】 |
| `dist/survey-supervisor.js` | codebase survey 的 lease/心跳协调（`LEASE_HEARTBEAT_MS=5e3`，env `HINDSIGHT_SURVEY_SPEC`） | 内部组件，非用户 CLI【源码】 |
| `dist/mcp-server.js`（1.2MB） | MCP server，hindsight_* 工具的后端 | 由 `plugin.json` 的 `mcpServers.hindsight` 声明 spawn；env `HINDSIGHT_MCP_HARNESS=dcode` |
| `dist/*-hook.js` / `*-sessionstart-hook.js` / `*-stop-hook.js` | 各 harness 的 hook 入口（20 种 harness × 3 类） | 由 installer 注册，非手工调用 |

**对 dsh 而言关键**：所有 hook 都是 `dcode-*` 前缀那一组被 `hooks/hooks.json` 引用（`SessionStart` / `UserPromptSubmit` / `Stop`，node 执行，timeout 30/30/60s）—— 但 dsh 实际上是走 `dist/dsh.js` 的原生 plugin 路径（注册工具、听事件），**不走 hooks**。installer 的 harness 名单里 `dsh` 是列在内的，但 hook 脚本与 dsh.js 是两条并行通道【推断，基于 `hooks.json` 用 dcode-* 而 package exports 的 `./dsh` 指向 dsh.js】。

**推荐给同步功能的命令**：`deepen.js --repo <path> --harness dsh --gitlog-limit N`（可控播种，read-only 地触发摄取）与 `status.js --repo <path>`（只读状态）。

---

## 六、同步/播种进度

### 6.1 三重进度判据（全部实测）

**① API  operations 列表**（最权威、可编程）

```bash
curl -s "http://127.0.0.1:8888/v1/default/banks/coding-agent%3A%3Adsh-plugins/operations"
```

实测 17 条，含类型与状态：

```
refresh_mental_model | processing | 2026-10-07T09:15:07
retain               | completed  | 2026-10-07T09:11:22
batch_retain         | completed  | 2026-10-07T09:11:22
consolidation        | pending    | 2026-10-07T09:07:13
refresh_mental_model | failed     | 2026-10-07T09:05:07 | err: Task exceeded the 300s wall-clock limit for 'refresh_mental_model' (stage=llm.openai.tools.attempt=2/4.backoff) and was cancelled. Raise HINDSIGHT_API_REFLECT_WALL_TIMEOUT…
…
```

**② 单 op 详情**（轮询单个长任务）

```bash
curl -s "…/operations/a51981c3-92ad-4d06-b505-e1daa550d1dc"
# → {"operation_id":"…","status":"processing","operation_type":"refresh_mental_model",
#    "mental_model_id":"mm-e92675913cc1479aa1edb240a8f2a283","created_at":…,"updated_at":…,
#    "completed_at":null,"progress":null,"result_metadata":{"name":"Conventions and patterns"},…}
```

⚠️ `progress` 字段实测恒为 `null` → **没有百分比进度**，只能靠 status 状态机（pending → processing → completed/failed）。面板别设计进度条，做状态徽标。

**③ 日志落点**（`~/.hindsight/coding-agents-logs/`，权限 700）

```
-rw------- 104856 Oct 7 17:11 diag.jsonl
-rw------- 113111 Oct 7 17:11 plugin.log
-rw-------  18832 Oct 7 17:11 usage.jsonl
```

`plugin.log` 中 deepen 进程的心跳（实测 tail）：

```
2026-10-07T09:16:52.993Z INFO  [deepen] [deepen] waiting for 3 server-side op(s) to settle …
```

每 5 秒一行，是当前正在跑 `deepen.js --repo /opt/workdata/dsh-plugins --gitlog-limit 300 --harness dsh`（pid 1786445，已跑 19 分 38 秒）的进度表达。

`diag.jsonl` 末行结构（实测）：

```json
{"ts":"2026-10-07T09:11:22.189Z","harness":"dsh","event":"retain_ok","ms":"80",
 "turns":"182","session":"session-16f70d15-…","trigger":"idle"}
```

→ `event` 字段是结构化事件名（`retain_ok`、`inject_ok`/`inject_empty` 见于 dsh.js:18690-18693），**这是判断单次操作成败的最佳细粒度信号**。

### 6.2 「跑完了吗」的判定方法

| 判据 | 表达式 | 备注 |
|---|---|---|
| 主判据 | `GET /operations` 中 `status ∈ {pending, processing}` 的条数 == **0** | 最直接 |
| 辅助 | `stats.pending_operations == 0 && stats.pending_consolidation == 0` | 注意 consolidation 有 252 积压，短期不会归零 |
| 日志 | `plugin.log` 不再出现 `[deepen] waiting for N server-side op(s)` 心跳 | 需 tail 观察窗口 |
| 稳定性 | 两次采样 `fact_count` 与 `last_write_at` 均不变，且间隔 ≥ 1 次爆发态 【推断】 | **不要单独用**：consolidation 会持续改 fact_count |

> ⚠️ 诚实提示：当前该系统**处于持续活跃状态**（session retain 每轮都在写、consolidation 有 252 积压、每小时 cron 刷 page），所以「跑完」是**瞬时状态**而非终态。同步功能应设计为**增量/周期同步**，不要等一个「全剧终」信号。

---

## 七、对 wiki-steward 新增功能的接口建议

### 7.1 建议采用的 API 端点清单

| 用途 | 端点 / 命令 | 状态 |
|---|---|---|
| daemon 存活 + DB 连接池 | `GET /health` | 【实测】 |
| 版本 + feature flags（决定是否显示某些面板项） | `GET /version` | 【实测】 |
| bank 列表 + fact_count + last_write_at | `GET /v1/default/banks` | 【实测】 |
| **面板核心**：积压/失败/pending/最后写入 | `GET /v1/default/banks/{id}/stats` | 【实测】 |
| 后台任务列表（判「是否跑完」） | `GET /v1/default/banks/{id}/operations` | 【实测】 |
| 单任务状态 | `GET /v1/default/banks/{id}/operations/{op_id}` | 【实测】 |
| 知识页树（同步索引） | `GET /v1/default/banks/{id}/knowledge-base/tree` | 【实测】 |
| 单页全文 | `GET /v1/default/banks/{id}/knowledge-base/pages/{page_id}` | 【实测】 |
| **全量 markdown bundle（批量同步首选）** | `GET /v1/default/banks/{id}/knowledge-base/export` | 【实测】 |
| 页**深度比较**WB search（`q=` 非 `query=`） | `GET /v1/default/banks/{id}/knowledge-base/search?q=…` | 【实测】 |
| 记忆列表 | `GET /v1/default/banks/{id}/memories/list?limit=N` | 【实测】 |
| 语义检索 | `POST /v1/default/banks/{id}/memories/recall {query,max_tokens}` | 【实测】⚠️ 需 ≥30s 超时 |
| token 消耗/成本 | `GET /v1/default/banks/{id}/llm-requests/stats` | 【实测】 |
| bank 服务端配置（retain 策略） | `GET /v1/default/banks/{id}/config` | 【实测】 |
| 已入库文档 | `GET /v1/default/banks/{id}/documents` | 【实测】 |
| 页面背后 mental model 状态 | `GET /v1/default/banks/{id}/mental-models` | 【实测】 |
| consolidation 分组 | `GET /v1/default/banks/{id}/observations/scopes` | 【实测】 |
| LLM 连通性自检 | `POST /v1/default/banks/{id}/health/llm` | 【推断】未执行（会触发真 LLM 调用） |

**不建议/未验证**：`/memories/{id}`、`/graph`、`/entities`、`/tags`、`/memories/dry-run-extract`、`/prompts/preview`、`/health/live` —— openapi 中可见，本会话未 curl 验证，Phase 1 前勿依赖。

### 7.2 建议采用的命令清单

| 命令 | 用途 | 状态 |
|---|---|---|
| `hindsight-coding-agents stats` | 只读统计 | 【文档】（installer help 明示，未执行） |
| `hindsight-coding-agents update` | 只重 stage runtime | 【文档】未执行 |
| `node status.js --repo <path> [--bank <id>]` | repo 级状态 | 【实测 `--help`】 |
| `node deepen.js --repo <path> --harness dsh --gitlog-limit N` | 触发 git 播种 | 【实测 `--help`】+ 当前正有一实例在跑 |
| `hindsight-seed seed --repo <dir>` | 播种 | 【实测 `--help`】 |
| `node daemon-start.js` | 拉 embed daemon | 【源码】`--help` 无输出，勿在面板暴露 |

禁止：`installer.js install|uninstall`（写入用户 host 配置，违反本次只读约束，且属生产变更）。

### 7.3 工程注意事项（Phase 1 必读）

1. **`bank_id` 必须 URL 编码**：`::` → `%3A%3A`，`公共` → `%E5%85%AC%E5%85%B1`。否则 4xx/命中空。【实测】
2. **搜索参数是 `q` 不是 `query`**，用错得 422。【实测】
3. **recall/reflect 必须长超时**（首次实测 `[HTTP:000]`，加 timeout 后成功）。建议 fetch timeout ≥ 30s，reflect 类 ≥ 数分钟。【实测】
4. **无鉴权** → wiki-steward 直连即可，但**这意味着 8888 端口对同主机任何进程开放**，面板不应在不安全通道展示其可写端点。【实测】
5. **fact_count 是活值**（今日内从 103/219 → 302/115），不可静态缓存。【实测】
6. **`progress` 恒 null** → 面板无进度条，只有状态徽标。【实测】
7. **🔴 知识页 body 当前全空**，同步前须先解决 reflect 300s 超时。**这是 Go/No-Go 前必须澄清的头号问题。**【实测】
8. 配置项 LICENSE：写在 `~/.hindsight/coding-agent.json` 的改动**须重启 dsh 生效**，面板须明示「⏳ 待重启」。【文档】
9. 面板的「启停」落到 **L1（本插件同步行为）** 是唯一诚实可行的即时开关。【推断】
10. 语义对齐：状态与健康判定应对齐官方 `hindsight_diagnose` / `hindsight_sync_status` 的口径，勿自造词汇。【文档】

---

## 八、未决问题 / 我判断不了的（NEEDS_HUMAN）

1. **🔴 知识页 body 全空是否常态？** 本会话实测 5/5 为空，且伴随 1 次 `refresh_mental_model` 300s 超时失败。需确认：是「今日 bank 重建后尚未刷新成功」的临时态，还是「配置不足（未设 `HINDSIGHT_API_REFLECT_WALL_TIMEOUT`）导致的永久态」？**这决定同步功能有没有内容可同步。** 建议人工查/. hindsight 是否已真的产出过非空页面（翻历史或提高 wall timeout 后重跑一次观察）。
2. **`patchReload: "live"` 是否覆盖 bundle 层？** 在 dsh checkout 里 grep 不到该 key 的定义（`/usr/local/lib/node_modules/@deepseek-ai/dsh/` 零命中），可能在闭源或别的包中。若 bundle 层能热重载，则 L2 启停有可能不需重启 —— **需用户在 dsh 官方处确认或实测**（实测会重启会话，成本极高，我不做）。
3. **hindsight Docker 容器由谁建立、有无 restart policy？** 查不到 cron/systemd/user-script 证据。需 `docker inspect hindsight` 看 RestartPolicy 与创建方式 —— **属只读查询但我未被授权执行 docker inspect 之外的判断**；且容器归 clsh 用户，改其状态需该用户同意。
4. **L1 启停的用户语义确认**：「停止 wiki-steward 同步」用户能否接受「记忆仍在后台被抽取」这一真相？若用户期待的是「点一下系统真的不记了」，那就只有 L2（需重启）或 L3（docker）能满足 —— **这是产品意图问题，须 Phase 1 与用户对齐，我不假设。**
5. **`HINDSIGHT_API_REFLECT_WALL_TIMEOUT` 是否已在 daemon 侧设置？** 它决定 300s 限制的来源。当前配置仅 2 个 key，凭据文件只含 provider/base_url/api_key/model 四个变量名 —— **是否另有 daemon env 注入点，我查不到。**
6. **公共 bank（`coding-agent::公共`）知识树为空**（`{"roots":[]}`、mental-models=0）但 fact_count=115 且有 opinions。判断：knowledge pages 是 per-bank 播种的，公共 bank 从未跑过 survey/seed —— **若要同步该 bank，须先跑什么命令、由谁跑，我未确认。**
7. **`hindsight_sync_status` 工具的判定口径源码**未在本次 grep 中提取到（`progress` 字段逻辑），**写面板前建议先调用一次该工具取真实返回**，别按名字猜。

---

## 附录：本次执行的只读操作清单（可复核）

- `ls / stat / cat` 于包目录、dist、hooks、skill、profiles/web、~/.hindsight、logs
- `grep` 于 dist/dsh.js（不整读）、README.md、SKILL.md、cordis.patch.yml、start-dsh.sh
- `curl` GET：`/openapi.json`、`/health`、`/health/ready`、`/version`、`/metrics`、`/v1/default/banks`、`/v1/default/banks/{2 个 bank}/stats|config|documents|mental-models|operations|observations/scopes|llm-requests|llm-requests/stats|audit-logs/stats|knowledge-base/tree|knowledge-base/pages/{5 页}|knowledge-base/search|knowledge-base/export`、单 operation 详情
- `curl` POST：`/memories/recall`（唯二的 POST，另一是 health/llm 的 GET 探活返 405）
- `node <file> --help`：installer.js、status.js、deepen.js、hindsight-seed.js、daemon-start.js
- `ps`、`ss -ltnp`、`docker ps`（列表）

**未执行**：任何写文件（除本报告）、任何 install/uninstall/update、任何 restart/stop、任何 chmod/chown。
