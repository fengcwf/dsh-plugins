# 侦察：wiki-steward 设置页排版现状 + 运行逻辑图素材

- 任务：t18（wiki-steward-hindsight-wave / scout，attempt 1）
- 日期：2026-10-09
- 纪律：**只读侦察**——未改任何代码/配置/测试；唯一产出为本报告
- 需求原文：「优化插件设置页的功能排版、归类相关功能，展示 wiki/raw/Hindsight 运行逻辑图」
- 证据基线：monorepo `/opt/workdata/dsh-plugins/wiki-steward/`（安装位 `~/.dsh/profiles/web/node_modules/wiki-steward` v0.8.0）

## 结论速览

设置节 = **单个 `settings.section` 注册、单块平铺**：标题 → 引言 → Hindsight 面板（最上）→ 历史按钮 → 手动动作 → 12 张 rowCard → 保存。
三类问题：**① 同一键两处写 + 陈旧显示（P0）**；**② 六个语义域无分组标题平铺（P1）**；**③ 无运行逻辑展示位（P3）**。
注册面被测试钉死为**只允许一个 `settings.section`**（`test/client-face.test.mjs:256`），分组必须做成**节内 block**，不能拆多节。
逻辑图最小可行形 = **零依赖纯文本步骤链**（4 泳道 × 若干步骤，`createElement` + 现有 `--dsw-alias-*` token CSS）；mermaid 与手绘 SVG 均不划算。

---

## 1. 当前设置节控件清单与分组

### 1.1 注册面【读码确认】

`lib/client.js:554-559` —— `slots.inject('settings.section', { name:'settings.section', id:'wiki-steward', order:30, label:()=>'wiki-steward' }, WikiStewardSettingsSection)`。
**全插件只注册这一个面**（`test/client-face.test.mjs:256` `assert.deepEqual(injected, ['settings.section'])`）。

### 1.2 渲染序（逐行，`WikiStewardSettingsSection` 返回树）

| # | 节点 | file:line | 语义 |
|---|---|---|---|
| 1 | `h3.wiki-steward-settings-title`「wiki-steward · 设置」 | `lib/client.js:368` | 标题 |
| 2 | `p.wiki-steward-settings-intro` 引言 | `:369` | **实现细节文案**（见 §2-P2①） |
| 3 | `WikiStewardHindsightMount` | `:372` | **Hindsight 六控件面板**（挂 `view:'hindsight'`，`web/dist/panel.js`） |
| 4 | `WikiStewardHistoryEntry` | `:373` | 「查看历史记录」按钮 → `ui.Modal` 弹层挂 `view:'log'` 日志视图（`:441-462`） |
| 5 | `WikiStewardManualActions` | `:374-379` | 「扫描增量」「触发蒸馏」两按钮（`:404-432`） |
| 6 | `div.wiki-steward-settings-rows` | `:380` | **12 张 rowCard 平铺**（可改 10 + 只读 2，`:348-366`） |
| 7 | `ui.Button`「保存」/ 只读提示 | `:381-390` | 全局单保存（草稿 POST `api/wiki-steward/settings`，`:319`） |
| 8 | `state.notice` 成/错提示 | `:391-393` | 保存回执 |

### 1.3 12 张 rowCard 清单（数组顺序即渲染顺序，即 API `editable` 返回顺序）

| # | 键路径 | kind | 标签语义 | 归属域 |
|---|---|---|---|---|
| 1 | `capture.enabled` | boolean | 捕获开关（turn-stopping 双轨落盘） | 会话捕获 |
| 2 | `capture.bufferRounds` | number | 缓冲轮数（每 N 轮强制 flush） | 会话捕获 |
| 3 | `queue.maxRetries` | number | 队列重试上限 | 写队列 |
| 4 | `queue.ttlDays` | number | 队列条目 TTL（天） | 写队列 |
| 5 | `secrets.enabled` | boolean | 脱敏开关（落盘/注入前哨兵中和） | 安全 |
| 6 | `ingest.schedule.enabled` | boolean | 定时蒸馏开关 | Ingest 定时 |
| 7 | `ingest.schedule.time` | time | 定时蒸馏执行时间（HH:MM，note 讲双源 cron） | Ingest 定时 |
| 8 | `hindsight.enabled` | boolean | **L1 记忆同步开关** | Hindsight ⚠️ |
| 9 | `hindsight.sync.schedule.enabled` | boolean | Hindsight 定时同步开关 | Hindsight |
| 10 | `hindsight.sync.schedule.time` | time | Hindsight 定时同步时间（HH:MM） | Hindsight ⚠️ |
| — | `vaultRoot` | string | vault 根路径（只读） | 部署信息 |
| — | `write.readOnly` | boolean | 写侧只读（INV-7，只读） | 部署信息 |

字段定义 `lib/client.js:69-84`（`EDITABLE_FIELDS` / `READONLY_FIELDS`）；控件形制 `SettingsRow` `:154-213`（Switch/Input number/Input time/textarea/只读文本）。

### 1.4 Hindsight 面板六控件（`web/src/components/HindsightSyncPanel.vue`）

①状态徽标条（`:38-49`）②「立即同步」+「刷新状态」（`:52-62`）③同步日历按日计数条（`:65-79`）④HH:MM 同步时间 + 「保存同步时间」（`:83-102`）⑤L1 启停 Switch（`:106-119`）⑥L2 只读徽标（`:122-127`）。

---

## 2. 排版问题清单（按严重度）

### P0 —— 同一键两处写 + 陈旧显示（功能正确性）

| 控件 | 入口 A（Hindsight 面板，位置最上） | 入口 B（下方 rows） | 证据 |
|---|---|---|---|
| `hindsight.enabled`（L1） | Switch → `api.toggleHindsight()` → `POST hindsight/toggle`，写后 `loadHindsight()` 自刷新 | rowCard Switch → 草稿 → 点底部「保存」 | `HindsightSyncPanel.vue:104-118`；`App.vue:69-81`；`lib/client.js:77` |
| `hindsight.sync.schedule.time` | 时间框 + 「保存同步时间」 → `api.saveSettings({hindsight:{sync:{schedule:{time:v}}}})` | rowCard time 输入 → 同一 POST `/settings` | `HindsightSyncPanel.vue:83-102`；**`App.vue:91`**；`lib/client.js:79` |

**陈旧根因**：设置节的 config 只在**挂载时 GET 一次**（`lib/client.js:278-296`，`useEffect(..., [])`），保存后只更新本地 `state.data`（`:331`）——**从不重新拉取**。用户在顶部 Hindsight 面板改完时间，下方 rowCard 仍显示旧值；反向在 rows 改完点保存，Hindsight 面板也只在自己动作后 `loadHindsight()` 才刷新（`App.vue:93`）。同屏两个值 + 后写覆盖先写。

> 附带：`hindsight.sync.schedule.enabled` 只在 rows（面板无对应控件）——即「Hindsight 定时」一个语义被拆在两个控件组里。

### P1 —— 结构（可用性）

1. **12 张 rowCard 无任何分组标题**，跨 6 个域（会话捕获/写队列/安全/Ingest 定时/Hindsight/部署信息）平铺，全靠 label 长文案区分（`lib/client.js:348-366,380`；`SETTINGS_CSS` 只有 rowCard 平级样式 `:115-116`）。
2. **主次颠倒**：Hindsight 是专业子系统面板，却排在标题/引言正下方（`:372`），把 12 行通用配置与**保存按钮压到页尾**（`:380-390`）。
3. **三种性质混同一层**：配置（rows）/ 动作（扫描+蒸馏 `:374`）/ 历史入口（`:373`）平级排布；「历史记录」是 ingest 日志语义，却夹在 Hindsight 面板与手动动作之间。

### P2 —— 信息噪音

1. **引言是实现细节**：「可改项即时热生效（写路径=官方路由面 api/wiki-steward/settings → configEditor 持久化缝）」（`:369`）——对使用者无价值，占首屏。
2. **只读项与可改项同列表**：`vaultRoot`/`write.readOnly` 排在 10 个可改项之后（`:358-366`），语义不同却同层。
3. **双源提示重复**：`ingest.schedule.time` 的 note 讲「系统 cron 仍在 00:25，flock 防重入」（`:76`），Hindsight 面板标题下又讲一遍链路（`HindsightSyncPanel.vue:33-35`）。

### P3 —— 扩展性

- **无运行逻辑展示位**：当前节内无任何能承载「capture→raw→wiki→hindsight」链路的位置，需新增块。

### 结构约束（重排必须遵守，否则红测）

| 约束 | 证据 |
|---|---|
| 只能注册**一个** `settings.section`（分组必须是节内 block） | `test/client-face.test.mjs:256-257` |
| `wiki-steward-settings-intro` / `wiki-steward-settings-rows` 两个 className 必须存在 | `test/client-face.test.mjs:888-889` |
| 设置节渲染树必须含 `WikiStewardHindsightMount` 与 `WikiStewardManualActions` | `test/client-face.test.mjs:399,435,625-626` |
| `EDITABLE_FIELDS` 与服务端 `EDITABLE_PATHS` **同集同序**（改顺序=双侧同步+改两处测试） | `test/hindsight-routes.test.mjs:121-131` |
| API `data.editable` 返回顺序有精确断言（10 键列表） | `test/ingest-routes.test.mjs:251` |
| 历史缝 `view:'log'`、Hindsight 缝 `view:'hindsight'` 零回退 | `test/client-face.test.mjs:429-459` |
| 构建面：`web/` 改动须 `vite build --config web/vite.config.js` 重建 `web/dist`（构建物入库，LRN-045 防假绿） | `package.json` scripts.build；`web/vite.config.js:20` `outDir:'dist'` |

---

## 3. dsh 设置页规范 / 先例（可复用形制提炼）

| 先例 | 形制 | 证据 |
|---|---|---|
| **kb-context（最贴近，同族 Task F2）** | **字段级 `group` 元数据 → 渲染时插 `h4` 分组标题**：字段数组每项带 `group:'触发条件'/'注入预算'/'检索超时'/'作用域'/'触发日志'/'只读展示'`，渲染循环里 `if (field.group && field.group !== lastGroup)` 插 `h4.kb-context-settings-group` | `kb-context/lib/client.js:47,52,57,61,65,69,74,80,86,90,94`（字段）；`:455-457`（插标题）；`:511,513`（CSS：13px/600/primary + 相邻 row 去上边框） |
| **dsh-rtk-kit（分块最清晰）** | **页头 + 多 `section.rtk-block`**：`div.rtk-kit > div.rtk-page-head(h1.title + span.crumb) > versionBlock / gainBlock / healthBlock`；每块 `titleRow(title, meta)` = `span.rtk-block-title`(14px/600) + 右对齐 `span.rtk-meta`(12px/secondary)；块间 `border-bottom`，`last-child` 去线 | `dsh-rtk-kit/lib/client.js:264-269`（返回树）；`:58-59`（titleRow）；`:120,136,160`（三块组件）；`:37`（`.rtk-block`/`.rtk-block-title`/`.rtk-meta` CSS） |
| **dsh-github-ops（加载/错误形）** | `div.gho-root > SettingsSection`；**加载 skeleton（`.gho-skeleton-line`）+ 错误卡（title/hint 两级文案）**，数据到位后 `parts.cards.renderSettingsView(model)` 卡片渲染 | `dsh-github-ops/lib/client.ui.js:35-76,105-107`（skeleton `:73-75`、error card `:67-70`） |
| **obsidian-web（老路线，已弃）** | 走 `sidebar.panellist` + `main` 槽 iframe，**不注册 settings.section** | `obsidian-web/lib/client.js:77-89`；wiki-steward 已弃该路线并写明（`wiki-steward/lib/client.js:17-18`） |

**注册 order 现状（导航排序观察）**【读码确认】：`order` 三处撞号——wiki-steward `:557` = 30、`dsh-github-ops/lib/client.js:58` = 30、`kb-context/lib/client.js:577` = 30；login-gate = 31（`dsh-login-gate/lib/client.js:586`）、rtk-kit = 40（`dsh-rtk-kit/lib/client.js:281`）。同号时设置菜单先后取决于壳的稳定排序，属既有隐患（不改也能用，改需跨插件协调 → 归 NEEDS_HUMAN）。

**提炼的可复用形制**：**kb-context 的 `group` 字段元数据 + `h4` 分组标题**（最小改动、与现有 `SettingsRow`/字段数组同构）；块视觉参考 rtk-kit（页头 crumb + 块标题行 + 分隔线）；加载/错误面参考 github-ops。

---

## 4. 建议分组结构（重排方案素材，非实施）

单个 `settings.section`（约束见 §2 表首行）内，按 **kb-context `group` 形制**渲染：

| 组序 | 组标题（建议） | 成员 | 说明 |
|---|---|---|---|
| 1 | 会话捕获 | `capture.enabled`、`capture.bufferRounds` | 「捕获→raw」开关与缓冲 |
| 2 | 写入队列与安全 | `queue.maxRetries`、`queue.ttlDays`、`secrets.enabled` | 写失败重试 + 落盘脱敏 |
| 3 | Ingest / 蒸馏 | （动作）「扫描增量」「触发蒸馏」+（入口）「查看历史记录」+ `ingest.schedule.enabled`、`ingest.schedule.time` | **动作/入口/定时收进同组**（现状三者散排，`client.js:373-379`） |
| 4 | Hindsight 记忆同步 | 完整 `HindsightSyncPanel`（六控件）+ `hindsight.sync.schedule.enabled` | 面板与它唯一的独立字段同组；**`hindsight.enabled` / `hindsight.sync.schedule.time` 建议从 rows 摘除或降只读镜像**（消 P0 双源） |
| 5 | 运行逻辑图 | （新增）wiki/raw/Hindsight 链路图 | 见 §7 |
| 6 | 部署信息（只读） | `vaultRoot`、`write.readOnly` | 只读与可改分层 |

顺序建议：**标题 → 引言（改写为面向用户的链路一句话）→ 组 5 逻辑图（放最上供总览，或放组 3 之后；二选一需裁定）→ 组 1-4 → 组 6 → 保存**。

**实施成本提示**（只读结论，不代实施）：
- 只加 `group` 元数据 + 渲染插 `h4`：**不动数组顺序** → `EDITABLE_PATHS↔EDITABLE_FIELDS 同序`（`hindsight-routes.test.mjs:121-131`）与 `data.editable` 顺序断言（`ingest-routes.test.mjs:251`）**不受影响**，成本最低。
- 若**重排数组顺序**：需同步 `lib/settings-write.js` 的 `EDITABLE_PATHS` + 改 2 处测试 + 保留 2 个 className 断言（`client-face.test.mjs:888-889`）。
- 摘除/降级 `hindsight.enabled`、`hindsight.sync.schedule.time` 两个 rowCard：**必须同时改 `settings-write.js EDITABLE_PATHS` 与两处测试**（属契约变更，非纯排版）。

---

## 5. 运行逻辑图素材（真实数据流节点，全部实证）

### 5.1 泳道 A：会话捕获 → raw/

| 节点 | 真实落点 | 证据 |
|---|---|---|
| 触发 | `ctx.on` 公开事件缝（`session/event` + `agent/turn-stopping`） | `lib/index.js:6`（T9 裁定注释）、`:55`（turn-stopping 收口进缓冲） |
| 缓冲 | 每 `capture.bufferRounds`（缺省 3）轮强制 flush | `lib/index.js:56-57`；`cordis.patch.yml:11-13` |
| 双轨①（通用） | `<vaultRoot>/raw/04-session_logs/<标题> - YYYY-MM-DD-HH-MM.md`（create=writeAtomic，同名在场即追加） | `lib/buffer.js:8,34` |
| 双轨②（clsh 变更） | `<vaultRoot>/raw/projects/<项目>/changes/<变更>/conversation.md`（追加） | `lib/buffer.js:9,36,227` |
| 写失败幂等队列 | `<data>/kb-index/queue/`；dedupKey=`sha256(sessionKey+'\n'+turn).slice(0,32)`、`.processing` lease 10min、TTL 7d、MAX_RETRIES=3 | `lib/queue.js:19-21`；磁盘实证 `data/kb-index/queue/` |
| 补跑账本 | `<data>/kb-index/schedule-ledger.json`（磁盘在位） | `lib/queue.js:17,394`；`lib/index.js:462-469` |
| 告警账本 | `<data>/kb-alerts.md`（追加式 + `secrets.redact`，连续失败阈值 2） | `lib/alert.js:1,4,18`；`lib/index.js:469`；磁盘 443KB |
| 定时器 | `cordis-plugin-timer` **软取得**（`inject` 不含 timer） | `lib/index.js:8,528-549` |

### 5.2 泳道 B：raw/ → wiki/（增量编译）

| 节点 | 真实落点 | 证据 |
|---|---|---|
| 扫描增量 | `python3 /opt/Workspace/scripts/obsidian/ingest-pipeline.py scan --summary`（脚本在位，8.4KB） | `lib/ingest-trigger.js:17,71-73`；`lib/ingest-routes.js:7,247` |
| 扫描范围 | `SCAN_DIRS` 含 `06-hindsight`（2026-10-08 加） | `/opt/Workspace/scripts/obsidian/ingest-pipeline.py:32-39` |
| sha256 三态标记 | `kb_mark`（body=frontmatter 闭合 `---` 后内容；**与 pipeline 69-71 同源 INV-13**；乐观并发 + 原子写 + 写后未动段校验） | `lib/mark.js:1-2,22`；注册 `lib/index.js:180` |
| 蒸馏（LLM） | `dsh-cron.sh wiki-ingest /root/bin/tasks/21-wiki-ingest.md` → `dsh --profile headless`（cron `25 0 * * *`） | `lib/ingest-trigger.js:4,18,21`；`crontab -l` |
| 通道不可用文案 | 缺 `dsh-cron.sh` 或 `21-wiki-ingest.md` → 如实提示走夜间任务/手动 skill | `lib/ingest-trigger.js:22` |
| wiki 写侧 | `wiki_write` / `wiki_delete` / `wiki_rename`（wiki/ 域 + `.trash`；**默认 readOnly:true**、覆盖缺省拒、改名=多文件事务） | `lib/crud.js:1-9`；注册 `lib/index.js:222,258,295` |
| wiki 校验 | `kb_validate`（六规则 frontmatter/index/naming/placement/structure/evidence，只读零写盘） | `lib/validate.js:1-10`；注册 `lib/index.js:135` |
| 落点 | `<vaultRoot>/wiki/`（`INDEX.md` + concepts/diagrams/entities/projects/reference/solutions/sources/specs/syntheses/topics…） | 磁盘实证 `ls wiki/` |

### 5.3 泳道 C：Hindsight 记忆 → raw/06-hindsight/ → wiki/

| 节点 | 真实落点 | 证据 |
|---|---|---|
| 记忆源 | `hindsight.apiUrl = http://127.0.0.1:8888`、`banks: []` | `cordis.patch.yml:26-29` |
| 机械转录 | `raw/06-hindsight/<bank-slug>-<bankHash8>-<YYYY-MM>.md`（稳定 ID 命名禁日期前缀；纯机械不 LLM） | `lib/hindsight-sync.js:1,5,172,250-251`；磁盘 4 文件在位 |
| 同步日志 | `<data>/hindsight-sync-log.jsonl`（日历数据源） | `lib/hindsight-sync.js:171`；磁盘 2.5KB |
| 手动同步 | `POST api/wiki-steward/hindsight/sync`（detached 单飞） | `App.vue:56-67`；`lib/hindsight-routes.js` |
| L1 门禁 | `hindsight.enabled=false` → 不 arm 不跑（热改开=过点补跑） | `test/hindsight-schedule.test.mjs:193,208`；`cordis.patch.yml:27` |
| 定时同步 | `hindsight.sync.schedule{enabled,time}` 缺省 `false/'03:25'`，与蒸馏 00:25 错峰 | `cordis.patch.yml:30-33`；`lib/client.js:78-79` |
| 进入 wiki | 转录产物落在 `raw/06-hindsight/` → 由泳道 B（scan `SCAN_DIRS` → 蒸馏）接手 | `ingest-pipeline.py:39` |

### 5.4 泳道 D：运维面（定时/告警/只读）

- 系统 crontab LLM 块 → `/root/bin/dsh-cron.sh`（flock 每任务名一把锁、日志尾行 exit code、失败追加 kb-alerts.md）→ `dsh --profile headless`；`crontab -l` + `/root/bin/dsh-cron.sh`（前序 t17 已逐行核）
- 插件自管 timer 到点 spawn **同一 wrapper**（与 crontab 共用同一把 flock）：`lib/ingest-schedule.js:3-9`
- 手动动作：`POST api/wiki-steward/ingest/{scan,distill}`（`lib/client.js:48-49`）

---

## 6. 逻辑图载体评估（零构建 React 前提下）

| 载体 | 成本 | 依赖/约束 | 判定 |
|---|---|---|---|
| **A. 纯文本步骤链**（`ol`/`div` 步骤 + `→` 分隔 + 现有 `--dsw-alias-*` token 着色） | **低**：约 60-100 行 `createElement` + 6-8 条 CSS；零构建、零依赖、零测试新形态（presence 断言即可） | 与现有 `SETTINGS_CSS`（`lib/client.js:111-131`）同源，暗色自动适配 | **推荐（最小可行）** |
| **B. 手绘 SVG**（节点矩形 + 线条 + 文本） | **中高**：坐标手工布局约 250-400 行；改一个节点要改坐标；无先例（全 workspace `lib/*.js` grep `createElement('svg'` **零命中**） | 零依赖但无障碍差（无 `title`/`aria` 还需补）、窄屏溢出风险 | 备选（视觉更好，维护贵） |
| **C. mermaid 渲染** | **高**：宿主与 workspace `find` **mermaid 零命中**（需引入 ~1MB+ 第三方）；`lib/client.js` 零构建无法 import，只能进 `web/` 经 vite 打包 → **必须重建 `web/dist`**（`package.json scripts.build`，LRN-045 src↔dist 恒等校验）+ 走发版五步 | 违反 AGENTS.md「UI 依赖口径：**默认不引第三方 UI 库**」；引入新依赖面 | **不推荐**（除非用户明确要图渲染） |

**补充**：`web/` 已有 Vue 面（`web/dist/panel.js` 115KB 构建物入库），若决定放 `web/` 而非 `lib/`，成本落 C 档（要重建 dist）；放 `lib/client.js` 则零构建但只有 A/B 可选。

---

## 7. 逻辑图最小可行形（建议）

**A 案：四泳道纯文本步骤链**（`lib/client.js` 内新增一个 `WikiStewardFlowBlock` 组件，渲染为 4 个 `div` 泳道，每泳道 3-5 个步骤，步骤间 `→`，每步挂 `title` 属性给出真实路径）：

```
① 捕获    turn-stopping → 每3轮 flush → raw/04-session_logs/ 或 raw/projects/*/changes/*/conversation.md
                └ 失败 → 队列(kb-index/queue) → 重试3次 → kb-alerts.md
② 编译    ingest-pipeline.py scan → kb_mark(sha256三态) → dsh-cron wiki-ingest(00:25) → wiki/
③ Hindsight  记忆(127.0.0.1:8888) → raw/06-hindsight/<bank>-<hash8>-<YYYY-MM>.md → 进入②
④ 运维    crontab / 插件timer(共用flock) → dsh-cron.sh → headless；kb_validate 六规则把关
```

- 放置：新组「运行逻辑图」（§4 组 5），或置于引言下方作总览。
- 每节点文案**必须带真实落点**（§5 已给全量 file:line 与磁盘路径），不编。
- 若用户后续要求图形化 → 第二阶段评估 B（`web/` 内 SVG）或 C（mermaid），均需重建 dist + 发版。

---

## 8. NEEDS_HUMAN 未决项

1. **双源控件处置**：`hindsight.enabled`、`hindsight.sync.schedule.time` 是「rows 摘除」「降为只读镜像」「保留双写但加刷新」三选一——**摘除=契约变更**（改 `settings-write.js EDITABLE_PATHS` + `hindsight-routes.test.mjs:121` + `ingest-routes.test.mjs:251`），超出纯排版，需队长裁定范围。
2. **保存粒度**：维持全局单按钮（`client.js:381`）还是分组各自保存——后者改状态机与测试面。
3. **逻辑图内容边界**：是否画出 vault 外部（crontab / `dsh-cron.sh` / headless 任务文件）与 Hindsight API 地址 `127.0.0.1:8888`——图会把宿主运维细节暴露到设置页。
4. **逻辑图位置**：放首屏总览（引言下）还是放 Ingest 组之后（首屏仍留给配置）。
5. **载体选型**：A 纯文本（推荐）/ B 手绘 SVG / C mermaid（需引入第三方 + 重建 dist + 发版五步）——C 档需用户明确同意破「默认不引第三方 UI 库」。
6. **导航 order 撞号**：wiki-steward/github-ops/kb-context 三者 `order:30`——是否跨插件协调错开（改面超出本插件范围）。

---

## 附：证据索引

| 结论 | 证据 |
|---|---|
| 唯一注册 `settings.section` | `wiki-steward/lib/client.js:554-559`；`test/client-face.test.mjs:256-257` |
| 渲染序 8 步 | `lib/client.js:367-394` |
| 12 张 rowCard 字段 | `lib/client.js:69-84`；渲染 `:348-366,380` |
| Hindsight 六控件 | `web/src/components/HindsightSyncPanel.vue:31-128` |
| P0 双源 | `lib/client.js:77,79` ↔ `App.vue:91,69-81`；单次加载 `lib/client.js:278-296` |
| kb-context group 形制 | `kb-context/lib/client.js:47-94,455-457,511,513` |
| rtk-kit 分块形制 | `dsh-rtk-kit/lib/client.js:264-269,58-59,37` |
| github-ops skeleton/错误卡 | `dsh-github-ops/lib/client.ui.js:67-75,105-107` |
| obsidian-web 老路线 | `obsidian-web/lib/client.js:77-89` |
| 测试约束四条 | `test/client-face.test.mjs:256,399,435,625,888,889`；`test/hindsight-routes.test.mjs:121-131`；`test/ingest-routes.test.mjs:251` |
| 构建面 | `package.json` `scripts.build`；`web/vite.config.js:20` |
| pipeline 脚本 | `/opt/Workspace/scripts/obsidian/ingest-pipeline.py:32-39,69-71`（磁盘在位） |
| cron 链 | `crontab -l` LLM 块；`/root/bin/dsh-cron.sh`（t17 已逐行核） |
| 数据落点磁盘实证 | `ls ~/.dsh/plugins/wiki-steward/data/`、`ls /mnt/unraid_data/Obsidian/raw/06-hindsight/`、`ls wiki/` |
