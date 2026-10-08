# Phase 0 三卡侦察 —— 队长合并裁定（2026-10-07）

三张只读侦察卡全部回报：
- A `scout-hindsight-integration.md`（535 行）Hindsight 集成面
- B `scout-wiki-steward-web.md`（766 行）wiki-steward web/面板契约
- C `scout-vault-ingest.md` vault ingest 链路

## 🔴 两个「比需求本身更优先」的阻塞（三卡共识，队长已复验）

### 阻塞 1：蒸馏通道已断 8 天 —— 链路建了也走不通
**队长实测**（`tail /root/.dsh/logs/cron/wiki-ingest-2026100{3,5,6,7}.log`）：
```
=== [2026-10-07 00:25:00] START name=wiki-ingest ===
=== [2026-10-07 00:25:01] SKIP 另一实例在跑（flock 未取到锁）===   exit 3
dsh: MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"
exit code: 1
```
连续 4 份日志同一形态 → **确认断裂，非偶发**。
含义：就算把记忆完美落进 raw/，**编译成 wiki 这一段根本跑不起来**。
→ 「记忆 → raw → wiki」这条链目前是**断的**，先做同步功能 = 半成品。

### 阻塞 2：同步源端成熟度两极，选错就是产垃圾
| 数据源 | 实测状态 | 可同步性 |
|--------|---------|---------|
| knowledge pages | **5 页 body 全 0**，mental model `content=null`+`is_stale`，survey 未建基线 | ❌ 现在同步 = 空壳 |
| memories / facts | **334~354 条有正文**（world 195 / experience 119 / observation 37） | ✅ 有料 |

队长复验（A 卡 + 我亲自 GET）：`body: len=0` 而 `markdown: len=936`
→ ⚠️ **易误判陷阱**：markdown 非空只是 frontmatter 骨架，判据必须用 `body`。
`hindsight_sync_status` 实测 `synced:false` / `gitDiffDocs:0` / `gitDiffTarget:155` / `surveyBaseline:null`
→ 知识页空是**上游未播种**的自然结果，不是 bug。

## 📌 历史先例：这条链上一个同构方案失败了，教训必须继承（C 卡发现 5）
`raw/05-holographic/`（Hermes 全息记忆 → raw）是**高度同构先例**：
- 正面：vault AGENTS.md:171 授权、27 文件全部 `skip`（已收敛，证明路径跑得通）
- 🔴 反面：**2026-09-27 停用归档**，因在 `wiki/entities/` 制造 **1091 个垃圾文件**
- 教训原文：「fact ≠ entity」「Python 脚本不能替代 LLM 语义理解 — 绕过 ingest 用脚本"编译"必然产生垃圾」「双向同步容易形成环路」
→ **本方案硬约束**：单向、只搬素材不代编译、空 body/低 proof_count 一律门禁。

## 队长裁定（Ruling 记入 ledger）

**R-4 同步对象 = memories/facts，不是 knowledge pages。**
理由：pages 空壳（实测）；facts 354 条有正文。且「同步空壳」正是 1091 垃圾事故的同类。
代价判断错：若 pages 日后被播种成熟，可再加一路（不影响 facts 路）。

**R-5 粒度 = 聚合，不是一条一文件。**
354 条不能一条一 md —— 那是 1091 垃圾事故的同款形态。
按 bank + 时间/主题聚合成**有限个素材文件**落 raw。

**R-6 落点 = `raw/06-hindsight/`，稳定 ID 命名，禁用日期前缀。**
- 依据：C 卡实测 SCAN_DIRS 是硬编码白名单（`ingest-pipeline.py:32-40`，7 项），
  **新目录不加进去永远扫不到** → 这是唯一必改代码点（且在 monorepo 外）
- 禁用日期前缀：否则每夜同步生成新文件 → 每夜编译新页 → wiki 重复页线性爆炸
- 易变字段（timestamp/is_stale）**只进 frontmatter**，进 body 会导致每夜 re_ingest

**R-7 「agent 只写 wiki/ 与 raw/projects/」判定：不算违反，前提是自动化管道写入。**
C 卡给了三条依据（vault AGENTS.md:161/183 定位 raw 为「数据入口」「（自动）」；
:170-171 路由表**自身**已授权 `04-session_logs`/`05-holographic` 两个非 projects 落点）。
四个附加条件：①脚本/cron 执行非会话手 write ②更新 vault AGENTS.md 目录树+路由表
③只落 raw/ 绝不直写 wiki/ ④工作区 AGENTS.md 补「自动化管道例外」条款。
→ ②④ 涉两处 AGENTS.md 修改 = **红线项，需用户确认**。

**R-8 设置页落地路径 = 方案 A（扩现有 settings.section，零构建 React，不碰 dist）。**
- B 卡实测：dsh 设置页里**没有页签组**，只有 1 个 `settings.section`（`lib/client.js:516-528`）
- 所谓三个「页签」是 Vue 面板内部 section，且**两个在生产路径根本不挂载**（`:471` 硬传 `view:'log'`）
- 自造 `settings.plugins.tab` 是**历史否决方案**（`client.js:24` 注释 + `client-face.test.mjs:253` 显式禁令断言）
- 选 A 的代价：复杂 UI（日历/图表）用 React 手写更累；选 C（Vue）则必须重建 dist 且 dist 已入库
  → **B 卡 Q6 标为产品裁定，归用户**（IL-9：停条件归用户）

## 必红测试清单（B 卡实测，基线 415/415 我已复跑确认全绿）
新增顶层 Config 键 / 白名单 / 新 UI 会红：
1. `load.test.mjs:29` Config 顶层键集 `deepEqual` → 加 `hindsight` 键必红
   （有现成修订模板：`load.test.mjs:39-42` 当年 `ingest` 键就是这么加的，注释留了理由）
2. `settings-write.test.mjs:13` EDITABLE_PATHS **7 叶子精确列表** → 必红
3. `ingest-routes.test.mjs:249` GET settings 回显 editable 同列表 → 必红
4. `client-face.test.mjs:761` + `web-panel.test.mjs:239` 零硬编码色值/零暗色分支 → 新 UI 引 hex 必红
5. `dist-browser-load.test.mjs:62/80/100` dist 零 Node 全局残留 → `process.*`/`Buffer.*` 必红
6. 🔴 **假绿陷阱**（B 卡 #6）：漏 build 时 dist 三锁**仍绿**、`ingest-routes.test.mjs:362` 真 dist 字节比对**仍绿**，
   功能却零生效。→ 验收必须含**发布物面**（呼应 LEARNINGS LRN-045）

## Config 面硬约束（B 卡 #7）
- 嵌套默认值**必须 `.prefault({})`**（zod v4 实测 `.default({})` 短路不填内层）
- 可热改项走**恰好 4 处**：Config 定义 + EDITABLE_PATHS + cordis.patch.yml + `client.js EDITABLE_FIELDS`
- 🔴 **双侧不同步 = UI 显示但保存 400 not_editable，且目前无测试钉住两侧一致** = 静默缺陷源

## 队长复验记录（不盲信侦察卡）
| 侦察卡结论 | 队长复验 | 结果 |
|-----------|---------|------|
| A: 知识页 body 空 | 亲 GET 单页 | ✅ 属实（body=0，markdown=936 是骨架，易误判） |
| A: profile patch 无 hindsight 行 | 我此前 grep 已确认 | ✅ 属实（**推翻我第 1 轮给用户的说法**） |
| A: daemon 是 Docker 容器 | 未复验（无 docker 权限） | 🟡 采信（ss/docker ps 为其实测） |
| A: fact_count 302/115 非 219/103 | 未复验 | 🟡 采信（bank 今日重建过=活值，不可缓存） |
| B: 415/415 全绿 | **亲跑 `node --test`** | ✅ 属实（415 pass / 0 fail） |
| B: 仅 1 个 settings.section | 亲读 `client.js:516-528` | ✅ 属实（`slots.inject('settings.section')` 单个） |
| B: view 硬传 'log' | 亲读 `client.js:471` | ✅ 属实 |
| C: 蒸馏通道断 8 天 | **亲 tail 4 份日志** | ✅ 属实（MISSING_CREDENTIAL + flock SKIP） |
| C: SCAN_DIRS 白名单 | 未复验（文件在 monorepo 外） | 🟡 采信（:32-40 行号为其实测） |
| C: 05-holographic 1091 垃圾事故 | 未复验 | 🟡 采信（有归档 MANIFEST 为证） |
