# 侦察：dsh 自动化任务插件（schedule bundle）能否取代现有 cron 链路

- 任务：t17（wiki-steward-hindsight-wave / scout，attempt 1）
- 日期：2026-10-09
- 纪律：**只读侦察**——未改任何配置、未重启、未建任务；唯一产出为本报告
- 证据基线：宿主 `/usr/local/lib/node_modules/@deepseek-ai/dsh/`，`dsh --version` = **0.2.0-rc.2**
  （bundle 文件 mtime 2026-10-02 23:46 = rc.1→rc.2 升级点；0.5.0 波报告基线是 **rc.1**，故「版本可能已演进」成立）
- 复核对象：`wiki-steward/changes/2026-09-29-settings-ingest-controls/automation-task-report.md`（下称「0.5.0 报告」）

## 结论速览

**0.5.0 的否决仍然成立（7 条理由里 6 条原样存活、1 条部分松动）**：schedule 服务在 rc.2 仍是
「把提醒消息投进原会话的会话内投递器」，**不是 headless 批处理执行器**；缺「每次运行新建会话 / 执行结果回执 /
暂停开关 / 跨进程防重入锁」四项硬能力。**不建议取代** cron + `dsh-cron.sh` + `dsh --profile headless` 链。
唯一实质变化是到期消息 framing 从「当作不可信提醒呈现、非新指令」改成「这是来自用户的定时消息」——
这只让「会话内提醒」用途更顺，不改变执行体绑死原会话的硬约束。

---

## 1. bundle 真身与能力面

### 1.1 落位与版本【读码确认】

| 项 | 事实 | 证据 |
|---|---|---|
| 安装位 | 不在 web profile `node_modules`，而在**宿主 CLI 自带依赖**里 | `/root/.dsh/profiles/web/node_modules/@deepseek-ai/` 下只有 `cosmokit`/`schemastery`；真身 `/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-experimental-schedule-bundle/` |
| 版本 | `0.2.0-rc.2`（bundle / `dsh-schedule` / `dsh-client-ui-schedule` 三者同版本，宿主同版本） | 三处 `package.json` `version` 字段 |
| profile 声明 | 只进 `dsh.profile.bundles` 列表，**不在 profile dependencies** | `/root/.dsh/profiles/web/package.json:37`；其 `dependencies` 对象无此包 |
| 官方分组注册 | `OPTIONAL_BUNDLES` 数组含此包 → 随发行版携带、插件管理页「官方」分组提供、默认禁用 | `dsh-app-boot/lib/index.js:552-556`；`dsh-plugin-manager/lib/index.js:1470` `const optional = OPTIONAL_BUNDLES.includes(name)` |
| 生效面 | web profile 已挂载（三行 insert，无 `config:` 块 = 全默认值） | `dsh --profile web --dump-config` 输出 `# == @deepseek-ai/dsh-experimental-schedule-bundle` 段 `- id: time-context` / `- id: schedule` / `- id: ui-schedule` |
| 配置键 | 只有 `deliveryHistoryDays`(30) / `deliveryHistoryRecords`(200)，**dump-config 不显示**（无 config 块即无行） | `dsh-schedule/lib/types/index.d.ts:19,24,29`；`dsh --profile web --dump-config \| grep deliveryHistory` 零命中 |

> ⚠️ 易混点：web `cordis.patch.yml:1673` 与 `:1678` 的 `ingest.schedule.enabled` / `hindsight.sync.schedule.enabled`
> 属 `- id: wiki-steward` 插件块（块起始 `:1658`），是**wiki-steward 自己的配置键**，与原生 schedule 服务无关。

### 1.2 任务定义格式【读码确认】

六种选择器（`dsh-schedule/README.zh.md`「使用此包」选择器表；域实现在 `lib/types/domain.js`）：
`after_seconds` / `at` / `every_seconds`(≥60s) / `daily` / `weekly` / `cron`（五字段 Vixie + 显式 IANA 时区，
最小间隔 1 分钟；`L`/`W`/`#`/名称/宏/秒字段全拒 —— README.zh.md:158）。
三种创建入口：Agent 工具（`schedule_create/list/update/delete`）、Web UI（页面「新建」= 打开一个新会话让模型建，
页面本身无表单，`dsh-client-ui-schedule/README.zh.md:28,96`）、插件服务 API（`ctx.schedule.create(sessionId, request, signal)`，
`lib/types/index.d.ts:68`）。

### 1.3 触发方式与执行体【读码确认】

- 定时 = 单宿主进程内 timer，到点扫描 `status === "active"` 的任务（`lib/index.js:1567`）。
- 投递 = `lib/index.js:1576` `await this.ctx.sessionController.resolveAgent(task.sessionId)` →
  `:1596` `resolved.agent.followup(message)` → `:1597` `if (!await this.ctx.sessions.flush(...)) throw`。
- **不是 shell、不是 headless、不是每次新建会话**：`static inject = ["agents","sessions","tools","storageDomain","sessionController","sessionPersistence"]`（`lib/index.js:2588-2595`）；
  全文件 2910 行 **grep `spawn|child_process|execSync|bash|headless` 零命中**。
- README.zh.md:26 明文：「**Schedule 无法在 headless 或仅 SDK 的组合中单独挂载**：投递需要 Host 的 Web Session controller 和 Session 持久化后端」。
- README.zh.md:157 明文：「**不支持暂停、执行状态、原会话以外的投递或每次运行新建会话**」。

### 1.4 日志 / 失败重试 / 可观测【读码确认】

- 回执只到收件箱：README.zh.md:65「回执……**确认收件箱投递，不表示模型执行**」；:161「**已保存的记录不证明模型执行结果**」。
- 无自动重试：README.zh.md:71「投递调度准入失败会记录日志而**不自动重试**」；:153「没有自动重试定时器」。
- 非恰好一次：README.zh.md:154「入队与任务写入不具有原子性……崩溃恢复不保证恰好投递一次。关闭宿主也会……重复投递」。
- 宿主必须运行：README.zh.md:153。
- **无 exit code、无 kb-alerts 告警缝**——schedule 的失败只进宿主日志，不进告警账本。

---

## 2. 与 `dsh-cron.sh` + headless 机制逐项对比

现状链【读码确认】：`crontab -l`（LLM 型块）→ `/root/bin/dsh-cron.sh <name> <task-file>` →
`dsh --profile headless "<task 全文>"`，每次全新进程/全新会话。

| 维度 | 现状 cron + dsh-cron.sh + headless | 原生 schedule（rc.2） | 判定 |
|---|---|---|---|
| 执行体 | 独立进程跑任务文件全文，会话干净、退出即销毁 | 消息投进**绑定原会话**由其 Agent 消化（`index.js:1576/1596`） | cron 占优 |
| 可靠性 | crontab 系统级守护；dsh 侧失败由 rc 透出 | 宿主必须在线；无自动重试（README:153）；非恰好一次、关宿主重复投递（README:154） | cron 占优 |
| 防重入 | **每任务名一把 flock**，抢不到锁 exit 3 + 告警（`dsh-cron.sh:73-78`） | 单宿主 timer + 进程内 FIFO；**`grep flock\|lockfile\|Mutex` 零命中**（`index.js` 2910 行） | cron 占优；跨源无共享锁 |
| 可观测 | 日志 `~/.dsh/logs/cron/<name>-YYYYMMDD.log` + 尾行 exit code（`dsh-cron.sh:95-98`） | deliveryHistory 只证投递回执、不证执行（README:65,161） | cron 占优 |
| 失败告警 | exit≠0 追加 `~/.dsh/plugins/wiki-steward/data/kb-alerts.md`（脱敏后，`dsh-cron.sh:56-58,100`） | 只写宿主日志，**无告警账本缝** | cron 占优 |
| 凭据/模型继承 | `dsh --profile headless`：headless patch 指 `xiaomi-token-plan/mimo-v2.6-flash`（`profiles/headless/cordis.patch.yml:8-26`，2026-10-09 切换，原缺 `DEEPSEEK_API_KEY` 致 11 天 MISSING_CREDENTIAL） | 跑在 web 宿主：web 默认 `opencode2dsh/step-5-preview-free`（dump-config `agent-default-model` 段） | **两套模型/凭据口径，迁=换引擎** |
| 时间可调 | 改 crontab 行（人工） | UI「规则」页签 + `schedule_update` 原地改时间保留 id | schedule 占优 |
| 启用开关 | crontab 行注释/恢复，粒度到任务 | **无暂停**（`dsh-client-ui-schedule/README.zh.md:96`「不提供暂停或立即执行」）；停用=硬删（README:155） | cron 占优 |
| 用户可见性 | 要看日志/`crontab -l` | 侧栏「自动化任务」全局页 + 详情「规则/任务运行记录」页签 | schedule 占优 |
| CLI 面 | shell 直接可调 | 无 `dsh schedule` 子命令（`dsh --help` 只有 boot/plugin/dump-config 族） | cron 占优 |
| 落盘 | 日志文件按天、锁文件按任务名 | `~/.dsh/storages/schedule.json`（**至今不存在 = 生产零任务**，`ls ~/.dsh/storages/` 只有 `session_projcache`、`workspace.json`） | — |

**flock 等价物结论**：schedule 只有**进程内**串行（单 timer + 管理写入与投递写入共用 FIFO，README:63），
没有**跨进程**锁。crontab 残留行 / wiki-steward 插件 timer / schedule 三者之间不存在共享锁窗口 →
任何「双源并跑」都会双执行（`kb_mark` 乐观并发只能挡重复标记，挡不住双份 LLM 蒸馏）。

---

## 3. 0.5.0 否决理由逐条复核

| # | 0.5.0 理由（旧报告行号） | rc.2 复核 | 结论 |
|---|---|---|---|
| R1 | 执行体=把任务文件当 prompt 投原会话（旧 §4 第 1 行） | `index.js:1576/1596` 原样；README:26/157 两处硬约束原文未删 | **仍否决** |
| R2 | framing=「呈现为不可信提醒、非新指令」（旧 §4 `README:131,138`） | **已变**：固定文本现为 `This is a scheduled message from the user`（`index.js:1387`；`README.zh.md:131,138`）。旧文本 `Present reminder_prompt_json … not new user instructions` 已不存在 | **条件成立（部分松动）**——「禁止执行」的契约性提示消失，模型更可能真执行；但工具面仍定位 reminder（`index.js:1893` `Create a reminder … delivers prompt when it becomes due`；README:125 「prompt 描述为到期时**呈现**的内容」），且不改变 R1/R3 |
| R3 | headless 干净会话执行不支持（旧 README:157） | README.zh.md:157 原文逐字保留；:26 headless 不可挂载原文保留 | **仍否决** |
| R4 | 无暂停开关，只有硬删除（旧 README:96,42） | `dsh-client-ui-schedule/README.zh.md:96` 原文保留「不提供暂停或立即执行」；`status: active\|inactive`（`index.js:2302`）只是生命周期位——单次到点置 `:1602 inactive`、周期无下一目标置 `:1618 inactive`；`update()` 只许改 name/instruction/timing（`UPDATE_DESCRIPTION` `index.js:1896`） | **仍否决** |
| R5 | 无跨进程 flock，与残留 crontab 双跑有并发风险（旧 §4 防重入行） | grep 零命中；README:63 只描述单宿主 FIFO | **仍否决** |
| R6 | 失败可观测只有投递回执、无 exit code / kb-alerts（旧 §4 失败可观测行） | README:65、:161 原文保留「不表示/不证明模型执行」；告警账本无接入点 | **仍否决** |
| R7 | 可靠性不优于 crontab（无重试、不保证恰好一次）（旧 §4 可靠性行） | README:153、:154 原文保留 | **仍否决** |
| R8 | 「重评门槛：需补齐新建会话/headless 执行体/暂停开关/执行回执至少前三」（旧 §5 末） | rc.1→rc.2 的变化集中在 deliveryHistory 回执结构、FIFO compare-and-set 更新、时钟回拨重核、同会话周期任务合并批次（README:63-71），**全是投递/管理面增强，四项门槛一项未补** | **门槛未达，否决延续** |

**复核结论：R1/R3/R4/R5/R6/R7/R8 = 仍否决；R2 = 条件成立（framing 中性化，仅利好「会话内提醒」用途）；无一条「已可取代」。**

---

## 4. 若迁移：三类任务各放哪【读码确认 + 推断】

| 执行对象 | 建议落点 | 理由 |
|---|---|---|
| **wiki-ingest（LLM 蒸馏）** | **留在 cron + `dsh-cron.sh` + headless**（或由 wiki-steward `ingest.schedule` timer 触发同一 wrapper——这已是现状） | 长任务需干净上下文 + flock + exit code + kb-alerts 四件套全要；迁 schedule 会：混进绑定会话上下文持续膨胀、换 web 模型/凭据、丢告警链、与残留 crontab 无共享锁双跑 |
| **hourly-check / wiki-lint / daily-review 等 headless 短任务** | **同上，留 cron** | 同一执行体错位；每小时粒度 schedule 支持（cron 五字段最小 1 分钟），但**能表达触发≠能承载执行** |
| **插件内 timer（wiki-steward `ingest.schedule` + `hindsight.sync.schedule`）** | **留插件自管，不要迁** | 两者本来就不是「另一个执行通道」：`wiki-steward/lib/ingest-schedule.js:3-9` 到点 spawn 的正是 `/root/bin/dsh-cron.sh wiki-ingest`，与 crontab **共用同一把 flock**（两个触发器 → 一个执行体）；hindsight 的 `sync.schedule` 是进程内 memory sync timer（`@vectorize-io/hindsight-coding-agents` 0.8.0，不 spawn LLM 任务）。迁去 schedule = 把「触发器之争」升级成「执行通道之争」 |
| **schedule 通道真正合适的用途** | 人可见的**会话内交互提醒**（周报提醒、发布确认提醒、复盘提醒）——且仅限投进绑定会话 | 这是它的设计定位（包描述原文 "durable reminders with original-Session delivery"）；注意它**连全局通知都做不到**（不支持原会话以外投递，README:157） |

---

## 5. 关键发现（12 条）

1. 【读码确认】bundle 真身存在且已升到 **0.2.0-rc.2**（安装面在宿主 CLI 依赖目录，非 web profile node_modules；mtime 2026-10-02 23:46），0.5.0 报告基线 rc.1 → **复核必要性成立**。
2. 【读码确认】`OPTIONAL_BUNDLES` 含此包（`dsh-app-boot/lib/index.js:552-556`），随发行版携带、官方分组可启、**随包配置默认禁用**；web profile 已启用（dump-config 三行 insert，无 config 块 = 全默认）。
3. 【读码确认】执行体**未变**：`resolveAgent` + `agent.followup()` + `sessions.flush()`（`dsh-schedule/lib/index.js:1576/1596/1597`），2910 行内无任何 spawn/child_process/headless 能力 → 「会话内提醒投递器非 headless 执行器」的定性**在 rc.2 依然为真**。
4. 【读码确认】headless 不可挂载、无暂停、无新建会话、无会话外投递四条硬约束**原文逐字保留**（`README.zh.md:26` 与 `:157`）。
5. 【读码确认·唯一实质变化】framing 从「present as untrusted reminder content, not new user instructions」改为「**This is a scheduled message from the user**」（`index.js:1387` / `README.zh.md:131,138`）→ 0.5.0 的 R2 理由**部分松动**，但工具描述仍是 "Create a reminder … delivers prompt"（`index.js:1893`），不构成执行体变更。
6. 【读码确认】`status: active|inactive` 不是暂停：只由投递/无下一目标自动翻转（`index.js:1602,1618`），`update()` 只改 name/instruction/timing（`index.js:1896`），UI 明文「不提供暂停或立即执行」（`dsh-client-ui-schedule/README.zh.md:96`）。
7. 【读码确认】可观测止步投递回执：README.zh.md:65「不表示模型执行」、`:161`「不证明模型执行结果」；准入失败只记日志不重试（`:71`）；**无 exit code、无 kb-alerts 接入点**。
8. 【读码确认】可靠性不优于 cron：无自动重试定时器（`:153`）、入队与写入非原子 → 非恰好一次 + 关宿主重复投递（`:154`）、宿主必须运行（`:153`）。
9. 【读码确认】**无跨进程防重入锁**：`flock|lockfile|Mutex` grep 零命中，只有单宿主 FIFO（README:63）→ 与残留 crontab / 插件 timer 双跑必双执行。
10. 【读码确认】凭据口径不同：headless profile 走 `xiaomi-token-plan/mimo-v2.6-flash`（`profiles/headless/cordis.patch.yml:8-26`），web 宿主走 `opencode2dsh/step-5-preview-free`（dump-config `agent-default-model`）→ 迁移=**换模型+换凭据+换成本**，且正好撞上 2026-10-09 刚修完的 MISSING_CREDENTIAL 事故面。
11. 【读码确认】dump-config 可见面只有 bundle 层三行，无任务清单、无 deliveryHistory 配置（grep 零命中）；**`~/.dsh/storages/schedule.json` 至今不存在 = 生产零任务**；CLI 仍无 `dsh schedule` 子命令。
12. 【读码确认】wiki-steward `ingest.schedule` 已经是「spawn `dsh-cron.sh`」而非独立通道（`lib/ingest-schedule.js:3-9`、`lib/index.js:73,567-568`），与 crontab 共用同一把 flock → 现有插件 timer 与 cron 是**同通道双触发器**，架构自洽，没有被 schedule 取代的空缺。

---

## 6. NEEDS_HUMAN 未决项

1. **framing 变更的实测**：rc.2 的中性 framing 是否真的让模型在绑定会话里**执行**任务（而非只复述提醒）——需在 web UI 建一条测试任务并观察执行，属运行时写操作，超出本次只读纪律，需人工批准窗口。
2. **上游后续**：本机只见发行包（`0.2.0-rc.2`），无法确认 `deepseek-ai/deepseek-harness` HEAD 是否已补「新建会话/执行回执/暂停」；如需跟踪该门槛，需人工订阅上游。
3. **双跑切换窗口**：任何真迁移都必须「先停 crontab 行 → 再启 schedule 任务」硬切换（无共享锁），回滚=重建任务且历史已删——属生产变更，须人工空档确认；本次不涉及。
4. **告警链补偿方案**：若未来某任务真的迁过去，kb-alerts 告警面需要另行设计（schedule 无 exit code 可读），需人工裁定口径。

---

## 7. 一句话总判

**不该取代**——rc.2 的 schedule 仍是原会话提醒投递器，缺 headless 执行体、执行回执、暂停开关、跨进程锁四项硬能力（0.5.0 否决理由 7 条里 6 条原样存活），cron + `dsh-cron.sh` + headless 链维持现状，schedule 只适合承担人可见的会话内交互提醒。

---

## 附：证据索引

| 结论 | 证据 |
|---|---|
| 宿主/bundle 版本 0.2.0-rc.2 | `dsh --version`；`dsh-experimental-schedule-bundle/package.json`、`dsh-schedule/package.json` |
| OPTIONAL_BUNDLES 注册 | `dsh-app-boot/lib/index.js:552-556`；`dsh-plugin-manager/lib/index.js:1470` |
| web profile 启用 | `dsh --profile web --dump-config` 的 `# == @deepseek-ai/dsh-experimental-schedule-bundle` 段；`profiles/web/package.json:37` |
| 执行体=原会话 followup | `dsh-schedule/lib/index.js:1576,1596,1597`；inject `:2588-2595` |
| framing 新文本 | `dsh-schedule/lib/index.js:1387`；`README.zh.md:131,138`；`README.md:131,138` |
| headless 不可挂载 | `dsh-schedule/README.zh.md:26` |
| 不支持暂停/新建会话/会话外投递 | `dsh-schedule/README.zh.md:157`；`dsh-client-ui-schedule/README.zh.md:96` |
| status 非暂停 | `dsh-schedule/lib/index.js:1602,1618,2302,1896` |
| 只证投递不证执行 | `dsh-schedule/README.zh.md:65,161` |
| 无重试/非恰好一次 | `dsh-schedule/README.zh.md:153,154,71` |
| 无跨进程锁 | `grep flock\|lockfile\|Mutex dsh-schedule/lib/index.js` 零命中（2910 行）；README:63 FIFO |
| 两套模型/凭据 | `profiles/headless/cordis.patch.yml:8-26`；`dsh --profile web --dump-config` `agent-default-model` 段 |
| 生产零任务 | `ls /root/.dsh/storages/` 无 `schedule.json` |
| 无 CLI 子命令 | `dsh --help`（只 boot / plugin / dump-config 族） |
| 现状 wrapper=flock+exit+告警 | `/root/bin/dsh-cron.sh:56-58,73-78,95-100`；`crontab -l` LLM 型块 |
| 插件 timer 复用同一 wrapper | `wiki-steward/lib/ingest-schedule.js:3-9`；`wiki-steward/lib/index.js:73,567-568` |
| 0.5.0 否决报告 | `wiki-steward/changes/2026-09-29-settings-ingest-controls/automation-task-report.md` |
