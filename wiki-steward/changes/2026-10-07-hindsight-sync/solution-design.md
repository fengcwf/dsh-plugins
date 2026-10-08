# 方案设计（Phase 2）— wiki-steward × Hindsight 记忆同步优化波

> 2026-10-08 队长起草。依据：phase0/ 三份侦察报告 + captain-api-probe.md（实测面）+ captain-recon-consolidation.md（R-4~R-8 裁定）。
> 用户原始需求 U1-U4 见 tasks.md。**本文=方案定形，Phase 3 任务卡从本文展开。**

## 0. 一句话方案

wiki-steward 新增 **Hindsight 同步面**：把 Hindsight 的**原始记忆（memories/facts）**机械转录为聚合素材文件落 `raw/06-hindsight/`（稳定 ID 命名 + sha256 标记），经既有 Ingest 蒸馏链进 wiki；设置节扩 UI 承载手动同步/日历/时间调整/状态分析/启停（L1）。

## 1. 需求 → 方案映射

| 需求 | 方案落点 | 裁定 |
|------|---------|------|
| U1 wiki×Hindsight 搭配（记忆→raw→wiki） | 新模块 `lib/hindsight-sync.js` 机械转录引擎 + `raw/06-hindsight/` 落点 | R-4 同步对象=memories 非 pages（pages body 实测全 0）；R-5 聚合非一条一文件（05-holographic 1091 垃圾事故教训）；R-6 落点 raw/06-hindsight/ 稳定 ID 命名 |
| U2 手动同步 + 日历 + 时间调整 | 设置节「Hindsight 同步」区：同步按钮 + 日期计数条（日历面）+ HH:MM 时间输入 | R-8 方案 A（扩 settings.section 零构建 React，不碰 dist 新组件面） |
| U3 状态分析 + 启停按钮 | 状态面板对齐官方口径（`hindsight_diagnose`/`hindsight_sync_status` 返回形）+ 启停 L1 开关 | L1 停同步行为（插件自治，立即生效）；L2 仅写配置位+「待重启」徽标；L3 不做 |
| U4 功能发散 | 见 §7 | — |

## 2. 数据流（U1 核心）

```
Hindsight API (127.0.0.1:8888, 零鉴权——实测)
  │ GET /v1/default/banks/{bank}/memories/list?limit&offset   (354 条 facts, 实测)
  │ GET /v1/default/banks  (bank 清单 + fact_count 活值)
  ▼
lib/hindsight-sync.js（机械转录，绝不 LLM 语义编译——宪法红线）
  │ 聚合规则（R-5）：bank + 时间窗（默认按月）→ 一个素材文件
  │ 过滤门禁：text 空/低质跳过留痕（防 05-holographic 式垃圾）
  │ 脱敏：落盘前过 lib/secrets.js（宪法红线：vault 侧写必过脱敏）
  ▼
raw/06-hindsight/<bank-slug>-<YYYY-MM>.md   （稳定 ID 命名，禁日期前缀文件名——防每夜新文件→wiki 重复页爆炸）
  │ frontmatter: title/date/tags/source: hindsight/fact_count/sha256/…
  │ ⚠️ 易变字段（timestamp/is_stale）只进 frontmatter，绝不进 body（否则每夜 re_ingest）
  ▼
既有 Ingest 链：ingest-pipeline.py scan（sha256 三态）→ dsh-cron wiki-ingest 蒸馏 → wiki/
```

**幂等性**：同 bank 同月重复同步 = 同一文件重写（内容变→sha256 变→re_ingest；不变→skip）。这与「raw 只增不改」（INV-1）的关系：**该文件是同步产物非人工素材**，re_ingest 机制语义=改写既有素材触发重编译（wiki-ingest skill Pitfall 2 口径：改写既有页不另起新页）。**此例外需写进 vault AGENTS.md 同步条目注记**（开放项①）。

## 3. 同步引擎契约（lib/hindsight-sync.js）

- **API 客户端**：fetch 直连 `apiUrl`（默认 http://127.0.0.1:8888，Config 可配）；**超时 ≥30s**（侦察 A 卡实测 recall 首调 HTTP:000，客户端 fetch 必须 ≥30s）；`bank_id` 含 `::` 必须 URL 编码（实测坑）
- **触发面**：①手动（UI 按钮→POST 端点）②定时（复用 `lib/ingest-schedule.js` 现成调度器形，Config `hindsight.sync.schedule{enabled,time}`）
- **同步日志**：落 `~/.dsh/plugins/wiki-steward/data/hindsight-sync-log.jsonl`（每次同步一行：时间/bank/条数/写入文件/跳过数/sha256 前后值）——「同步日历查看」的数据源
- **失败语义**：fail-open + 告警进 kb-alerts.md（INV-15 禁静默）；队列幂等复用 `lib/queue.js`

## 4. UI 面（R-8 方案 A：扩 settings.section，零构建 React）

在 `lib/client.js` 的 `WikiStewardSettingsSection` 内扩一个「Hindsight 同步」折叠区：

| 控件 | 语义 | 数据源 |
|------|------|--------|
| 状态条 | 记忆库健康：bank 数/fact_count/activeOps/synced 徽标 | `hindsight_sync_status` 口径（勿自造——侦察 A 卡#7） |
| 「立即同步」按钮 | POST /api/wiki-steward/hindsight/sync | 同步引擎 |
| 同步日历 | 按日计数条（同步日志 dateKey 聚合，非全尺寸日历网格——手绘 React 成本可控） | sync-log.jsonl |
| 同步时间 HH:MM 输入 | Config `hindsight.sync.schedule.time` 热改 | settings 四处同步面 |
| 启停开关（L1） | `hindsight.sync.enabled` 热改，立即生效 | Config |
| L2「记忆插件启停」区 | 读 `~/.hindsight/coding-agent.json` 的 `disabled` 状态展示 + 「写配置待重启」按钮 + ⏳徽标 | 侦察 A 卡 L1-L4 分档 |

**关键 UI 约束**（侦察 B 卡实测钉住，违者测试必红）：零硬编码色值（用 dsh token）、不引第三方 UI 库（纯展示自绘）、客户端 fetch 走文档相对 `api/wiki-steward/...`、dist 必须重建入库。

## 5. Config / API 契约

```js
// Config 顶层新增（⚠️ 4 处同步 + load.test.mjs 断言修订——ingest 键先例 :39-42）
hindsight: z.object({
  enabled: z.boolean().default(false),        // L1 启停（同步行为）
  apiUrl: z.string().default('http://127.0.0.1:8888'),
  banks: z.array(z.string()).default([]),     // 空=全部 bank（R-4 现阶段只 dsh-plugins 有料）
  sync: z.object({
    schedule: z.object({
      enabled: z.boolean().default(false),
      time: z.string().regex(HHMM).default('03:25'),  // 00:25 wiki-ingest 之后错峰
    }).prefault({}),
  }).prefault({}),
}).prefault({})  // ⚠️ 嵌套必须 .prefault——zod v4 .default({}) 短路实测坑
```

API（单 prefix `/api/wiki-steward` 内部分发，鉴权缝同款）：
- `GET  /api/wiki-steward/hindsight/status` — 状态分析（diagnose+sync_status 口径聚合）
- `POST /api/wiki-steward/hindsight/sync` — 手动同步（detached 不阻塞请求，回执含 started/note）
- `GET  /api/wiki-steward/hindsight/sync-log?since&until` — 同步日历数据源
- `POST /api/wiki-steward/hindsight/toggle` — L1 启停写面（走 settings 四处同步同一机制）

**测试必红清单**（侦察 B 卡，逐条应对）：`load.test.mjs:29` Config 键集（修订断言+注释理由）｜`settings-write.test.mjs:13` EDITABLE_PATHS（扩白名单）｜`ingest-routes.test.mjs:249`（同上）｜色值/暗色分支×2（自绘守 token）｜`dist-browser-load` Node 残留（禁 process/Buffer）｜**发布物面**（LRN-045：dist 重建 + 字面断言）。
**补一个新测试**：EDITABLE_PATHS ↔ client.js EDITABLE_FIELDS 双侧一致性（侦察 B 卡指出目前无测试钉住=静默缺陷源，顺手补上）。

## 6. 明确不做（out of scope）

- **不做 LLM 语义编译**（宪法红线；蒸馏归 wiki-ingest 任务）
- **不动 knowledge pages 同步**（body 实测全 0；上游播种成熟后可再加一路）
- **不停 daemon（L3）/不卸载（L4）**（不可逆+波及 clsh 用户他人数据）
- **不修 04-session_logs 292 项积压**（口径漂移属另一波，仅在 U4 登记）
- **不做双向同步**（05-holographic 教训：双向易成环路）

## 7. U4 功能发散（建议清单，供用户勾选）

1. **同步健康巡检**：同步 N 天未跑/失败连续 → kb-alerts.md 告警（复用 alert.js watch 形）
2. **recall 体验面**：面板加「搜我的记忆」检索框（/memories/recall，注意 ≥30s 超时）
3. **fact 质量门禁可视化**：同步前预览（dry-run：本次将写 N 条/跳过 M 条）
4. **04-session_logs 292 项 re_ingest 口径漂移修复**（独立波）
5. **告警账本噪声治理**：12 条白名单外既有告警处置（R-13 待用户 3 选 1）
6. **hourly-check/wiki-ingest 凭据修复**（待用户 ①/② + key——B-1 阻塞）

## 8. 开放项（须用户拍板，红线/范围外）

| # | 事项 | 为何须用户 |
|---|------|-----------|
| ① | vault AGENTS.md 补 `raw/06-hindsight/` 目录树+路由表+「同步产物可重写」注记 | 人写区文件修改=红线 |
| ② | 工作区 AGENTS.md 补「自动化管道例外」条款（R-7 条件④） | 本文件修改须经用户确认 |
| ③ | `ingest-pipeline.py` SCAN_DIRS 加 `06-hindsight`（monorepo 外脚本） | 范围外产物，需确认授权 |
| ④ | 凭据 ①credentials service / ②cron env 注入 + DEEPSEek_API_KEY | 安全敏感，须授权 |
| ⑤ | L2 写 `~/.hindsight/coding-agent.json` 是否授权 | 改非本插件配置 |
| ⑥ | 12 条告警 3 选 1 | 归位/入白名单/维持 |
