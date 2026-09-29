# task-f3-report.md — Task F3 手动 ingest + 定时执行控制（完工报告）

> 执行者：fresh 实现者（coder）。工作区 `/opt/workdata/dsh-plugins`；前置 Task F1 已完成（commit c88be4a，基线 350/350）。
> 任务证据面：`changes/2026-09-29-settings-ingest-controls/diagnostic-report.md` §4/§5、`automation-task-report.md`（选项 A 终裁依据）、`tasks.md` Task F3 验收、上波 `changes/2026-09-28-b1b2-service-effect-fix/constitution.md`。
> 状态：**完成**。`node --test` **374/374** 绿（基线 350 零回退 + 新增 24）、`npm run check` **exit 0**、dist 新鲜度锁 **PASS**。

---

## 1. 改动清单（文件:行号）

### 产线代码

| 文件 | 位置 | 改动 |
|---|---|---|
| `lib/ingest-schedule.js`（新，217 行） | `:21-25` | `DEFAULT_SCHEDULE_TIME='00:25'` + `SCHEDULE_TIME_RE`（严格 HH:MM）+ `isValidScheduleTime` |
| | `:36-58` | `occurrenceFor(nowMs, time)` 纯函数：今日（本地时区=与 dsh-cron.sh `date +%Y%m%d` 同口径）HH:MM 目标点 + occurrence key（`YYYYMMDD\|HH:MM`）+ 明日滚日 |
| | `:67-217` | `createIngestScheduler`（选项 A 自管 timer）：armed setTimeout 到点触发 + 60s reconcile 巡检环 + 错过补跑（日志面判据）+ firedKey 去重 + start/stop 生命周期。全注入缝（getCfg/distill/now/runRecordExists/setTimeoutFn/clearTimeoutFn/setIntervalFn/clearIntervalFn/warn） |
| `lib/index.js` | `:34` | import `createIngestScheduler` |
| | `:71-82` | **Config 新键 `ingest.schedule`**（zod）：`enabled: z.boolean().default(false)`、`time: z.string().regex(/^([01]\d\|2[0-3]):([0-5]\d)$/, '时间格式须为 HH:MM').default('00:25')`，`.prefault({})` 双层容忍缺省（旧配置不炸） |
| | `:513-551` | 定时调度装配：trigger 单实例（`:521`，与 web 数据面共用 `opts.web.trigger` 同源）→ `createIngestScheduler`（`:523-535`）→ **effect 软取得**（`:537-544`，cordis:676 代理语义 try/catch）→ `ctx.effect(start/stop, 'wiki-steward: ingest-schedule')`（`:545-548`）；缺 effect 缝=不裸起定时器 + enabled 时留痕（`:549-550`） |
| | `:678` | 子插件 trigger 改用共享实例（`webOpts.trigger ?? ingestTrigger`） |
| `lib/settings-write.js` | `:11-20` | EDITABLE_PATHS 扩 2 叶子：`['ingest','schedule','enabled']`、`['ingest','schedule','time']`（时间格式校验由 Config 真 zod 在合并生效面收口——`applyEditablePatch:100` 既有缝，非新增旁路） |
| `lib/ingest-trigger.js` | `:26` | `dateStamp` 改导出（跑记录判据单一来源，ingest-schedule 引用同源） |
| `lib/client.js` | `:35-36` | `INGEST_SCAN_URL`/`INGEST_DISTILL_URL`（文档相对 `api/wiki-steward/ingest/{scan,distill}`，issue #1707 教训口径） |
| | `:62-63` | EDITABLE_FIELDS（客户端副本，双侧一致纪律）扩 `ingest.schedule.enabled`（boolean）/ `ingest.schedule.time`（time）；双源如实提示文案入 time 字段 note：**「系统 cron 仍在 00:25 触发，flock 防重入；如需单一时间源请运维侧停用该行」** |
| | `:113-119` | `SettingsRow` 新增 `kind:'time'` → `input[type=time]`（既有简单形，样式留 F2） |
| | `:155-200` | `updateAction`（函数形 updater，双按钮并发无陈旧闭包互踩）+ `runAction`（POST 通路 + `{data}/{error}` 反馈如实：`data.note` 原文展示、`{error}` 原文展示、scan 回 `ok/exitCode/summary` 组合） |
| | `:293-298` | 设置节树插 `WikiStewardManualActions`（历史入口之后、rows 之前） |
| | `:308-345` | `WikiStewardManualActions` 展示组件（无钩子，状态由设置节持有——历史入口同纪律）：「扫描增量」「触发蒸馏」两按钮 + 执行中禁用 + 状态文案 |
| `package.json` | `:20` | scripts.check 追加 `node --check lib/ingest-schedule.js`（依赖面/dsh.client.inject 未触——F2 领地） |

### 测试代码

| 文件 | 改动 |
|---|---|
| `test/ingest-schedule.test.mjs`（新，404 行，15 测） | 纯函数 2（时间格式契约/occurrenceFor 跨日跨月）；调度语义 6（disabled 不调度+热启用、到点恰一次+跨日、补跑恰一次、补跑抑制（日志判据）、热改换键/停用/复启用、distill 抛错吞+留痕）；生命周期 1（stop 零残留+幂等+再用）；**真 spawn 形只读验 1**（假 CRON 缝真 bash spawn 写 marker，绝不触发真蒸馏）；index 装配 integration 形 3（effect label 钉住+teardown 零残留、缺 effect 留痕不裸起+缺省零留痕、rawConfig 热改面）；Config 契约 2（缺省/向后兼容、严格校验） |
| `test/settings-write.test.mjs` | 白名单契约改 7 叶子（修订理由内联注释）+ 2 新测（ingest.schedule 深合并/校验、非法时间/开关=invalid） |
| `test/ingest-routes.test.mjs` | editable 清单改 7 叶子（修订理由内联注释）+ 2 新测（POST ingest.schedule 补丁走持久化缝、非法时间 → 400 invalid 且持久化不完成） |
| `test/load.test.mjs` | Config 全键期望面 + `ingest.schedule`（修订理由内联注释）+ 旧配置向后兼容断言；拒绝错误类型 +2 行 |
| `test/client-face.test.mjs` | +5 测：手动两按钮走通路+`{data}` 反馈+执行中禁用、在跑/通道缺 `data.note` 原文、`{error}` 原文、定时控件（time 输入+checkbox+双源文案）、定时字段保存 patch 形 |

---

## 2. TDD 过程（红→绿轨迹）

1. **基线测量**：`node --test` → **350/350** 绿（F1 后基线，与任务简报一致）。
2. **先红**：写 `test/ingest-schedule.test.mjs`（15 测）+ 扩 4 个既有测试文件 → 目标面跑 `node --test` → **63 测 / 49 绿 / 14 红**（新模块 import 整文件红 + 白名单/Config/编辑面/UI 全红）——红点全部指向未实现面，符合先红预期。
3. **绿（后端）**：实现 `lib/ingest-schedule.js` + Config 新键 + index 装配 + 白名单 → 后端面 **56/56**（其间修 3 红：2 处=测试装配假时钟未走到到点时刻（fake clock 语义修正，非断言弱化）；1 处=「校验失败不触达持久化缝」断言与既有架构不符——真 zod 校验在 `edit` 内对合并生效面收口（既有 POST 类型非法测试同款缝语义），改断言为「持久化不完成（change 抛错 edit 中止）」，判据强度不变）。
4. **绿（前端）**：实现 `lib/client.js` 四块 → `test/client-face.test.mjs` **21/21**。
5. **全量集成抓真缺陷**：`node --test` → **374 测 / 373 绿 / 1 红**——既有 **B1 地基锁**（`test/apply-integration.test.mjs:274`，cordis:676 代理语义：未 inject 服务属性访问即抛）抓到新装配代码直访 `ctx.effect` 会**抛穿 apply**（真实宿主语义缺陷，测试假 ctx 看不见）。修复=effect **软取得**（try/catch，与既有 `softService`/`timerService` 同纪律，`lib/index.js:537-544`）→ 复跑 **374/374 全绿**。
6. **全量验证**：`npm run check`（17× `node --check` + `node --test`）→ **exit 0**；`scripts/check-release.sh wiki-steward` → `[VERDICT] PASS`（四对齐 + **dist 新鲜度锁 PASS**：基线=上个 tag wiki-steward-v0.4.1，窗口内唯一 web 源变更 commit=F1 同 commit 带 web/dist；本批零 web/src 变更→锁不触发）。

新增测试计数：`ingest-schedule` 15 + `settings-write` 2 + `ingest-routes` 2 + `client-face` 5 = **24**；350 → **374**，零回退（350 条基线测试全部在场且绿，无删除无 skip）。

---

## 3. 测试命令输出计数

| 命令 | 输出摘要 | 判定 |
|---|---|---|
| `node --test`（基线，F1 后） | `tests 350 / pass 350 / fail 0` | ✅ |
| `node --test`（先红） | 目标面 `tests 63 / pass 49 / fail 14` | 红（如实记录） |
| `node --test`（B1 缺陷暴露轮） | `tests 374 / pass 373 / fail 1`（红点=B1 地基锁，真缺陷） | 红（如实记录） |
| `node --test`（收口） | `tests 374 / suites 0 / pass 374 / fail 0 / cancelled 0 / skipped 0` | ✅ |
| `npm run check` | `node --check` ×17 全过 + `node --test` 374/374；**exit 0** | ✅ |
| `bash scripts/check-release.sh wiki-steward` | version/CHANGELOG/README/tag 四 PASS + **dist 新鲜度锁 PASS**；`[VERDICT] PASS` | ✅ |

---

## 4. 验收逐条证据（tasks.md Task F3）

### 验收①：设置页提供「扫描增量」「触发蒸馏」手动动作（走既有 ingest 动作通路，蒸馏经 headless 任务通道不真跑 LLM 蒸馏）

- UI：`lib/client.js:316-345`（WikiStewardManualActions 两按钮）+ `:293-298`（挂进设置节）+ `:35-36,170-200`（POST `api/wiki-steward/ingest/{scan,distill}`，文档相对）。
- 通路复用：POST → `lib/ingest-routes.js:242-254`（scanPost）/`:255-270`（distillPost）→ `lib/ingest-trigger.js:72-99`（scan 机械面）/`:125-141`（distill=spawn detached `bash /root/bin/dsh-cron.sh wiki-ingest /root/bin/tasks/21-wiki-ingest.md`——按钮绝不做 LLM 蒸馏，蒸馏由 headless 任务执行）。
- 测试：`test/client-face.test.mjs`「手动动作：设置节「扫描增量」「触发蒸馏」两按钮走既有 ingest 通路…」（URL/method/`{data}` 反馈+执行中禁用逐项断言）；「在跑/通道缺 = {data.note} 原文如实」（`ALREADY_RUNNING`/`CHANNEL_UNAVAILABLE` 文案原文匹配）；「{error} 原文展示」。

### 验收②：定时执行可调：执行时间可配置 + 启用/停用开关（机制按诊断报告选定方案=选项 A）

- 机制：`lib/ingest-schedule.js`（选项 A 插件自管 timer，零侵入 dsh-cron 通道/任务文件/系统 crontab；automation-task-report §5 对选项 C 的否决=原生自动化任务是会话内提醒投递器、无暂停开关、丢告警链）。
- 控件：`lib/client.js:62-63`（时间输入+开关入 EDITABLE_FIELDS）+ `:113-119`（`input[type=time]`）；测试「定时控制：时间输入（input[type=time]）+ 启用开关入设置节…」（回显/checked/双源文案断言）。
- 开关语义：`enabled=false` 不调度（零 timer 零 spawn，`test/ingest-schedule.test.mjs`「enabled=false 不调度…」）；到点触发恰一次（「到点触发…」）；错过补跑（「错过补跑…」/「错过补跑抑制…」）。

### 验收③：配置面写入持久化（settings-write 白名单扩项+校验），热生效或注明 restartRequired

- 白名单：`lib/settings-write.js:11-20`（+2 叶子）；客户端副本 `lib/client.js:62-63`（双侧一致）。
- 校验：时间严格 HH:MM / enabled 严格 boolean（Config zod 真校验在合并生效面收口，`test/settings-write.test.mjs`「ingest.schedule 校验…」+ `test/ingest-routes.test.mjs`「POST settings：ingest.schedule 非法时间 → 400 invalid（持久化不完成）」）。
- 持久化：走既有 configEditor 写缝（`createApplyPatch`），`test/ingest-routes.test.mjs`「POST settings：ingest.schedule 补丁走白名单→持久化缝」（写入形断言）。
- **热生效（非 restartRequired）**：见 §5 timer 生效语义；测试「接线：配置热改面——rawConfig 现读（改 time → 下个 reconcile 换键重 arm）」。

### 验收④：配置键入 Config（zod）并保持向后兼容（旧配置不炸）

- `lib/index.js:71-82`；`test/ingest-schedule.test.mjs`「Config 新键 ingest.schedule：缺省 enabled:false + time:"00:25"（旧配置不炸=缺省零行为变化）」（`Config.parse({vaultRoot,capture,queue…})` 无 ingest 键 → 全默认）+「Config ingest.schedule 校验…」（`25:00`/`0:25`/数值形/`enabled:'yes'` 全拒）+ `test/load.test.mjs` 期望面锁定。

### 配套（简报红线/工程纪律）

- **真 spawn 形只读验（绝不触发真蒸馏）**：`test/ingest-schedule.test.mjs`「真 spawn 形：补跑走真 bash spawn（假 CRON 缝写 marker…）」——真 child_process spawn `bash <假cron> wiki-ingest <task>` 端到端（marker 断言 argv 形），假 CRON 缝物理隔离 `/root/bin/dsh-cron.sh`；另 timer 主体测试全走假 clock/假 spawn 注入缝。
- **红线**：只改 `wiki-steward/`；未触 kb-context/obsidian-web/生产配置/**系统 crontab（零写入）**/依赖面/dsh.client.inject（F2 领地）；未做样式对齐（F2 领地）；`web/src` 零变更→`web/dist` 无需重建（dist 新鲜度锁不触发）；`git add` 具名路径；不 push/tag/release。
- **双源如实提示**：文案入 UI（`lib/client.js:63`），测试逐字断言。

---

## 5. timer 生效语义说明（简报点名）

| 语义 | 行为 | 判据/证据 |
|---|---|---|
| 缺省值裁定 | `enabled:false` + `time:'00:25'`。**理由**：enabled 缺省关=升级零行为变化——旧配置无 `ingest` 键 parse 后与升级前行为完全一致（现系统 cron 00:25 仍是唯一触发源，插件 timer 为 opt-in），避免「升级即双源并跑」；time 缺省取现系统 cron 同点 00:25，用户开启即等价迁移现状时间，与 UI 双源提示口径一致 | `lib/index.js:71-82`；`test/ingest-schedule.test.mjs` Config 契约 2 测 |
| 到点触发 | armed **setTimeout 精确到今日 HH:MM**（本地时区）；到点=**无条件 spawn**（cron 同语义，不查跑记录），flock 防重入天然兜底（在跑→`already-running` 如实回报不 spawn） | `lib/ingest-schedule.js:124-141,170-178`；「到点触发…」测 |
| 错过补跑 | 「今日到点未发 + 当日无跑记录」统一判据（跑记录=既有日志面 `~/.dsh/logs/cron/wiki-ingest-YYYYMMDD.log`）→ 补触发恰一次（`meta.catchUp:true`）；**覆盖启动时/热启用/时钟残局三态**（firedKey 去重防同 occurrence 重复；判据读取失败=保守不补跑+留痕） | `lib/ingest-schedule.js:181-196`；「错过补跑…」「错过补跑抑制…」测 |
| 热生效 | **非 restartRequired**：设置页保存 → configEditor 持久化 → rawConfig 热改 → 调度器 reconcile 巡检环（默认 60s）现读 `getCfg()`——enabled/time 变更**下一个巡检环（≤60s）生效**（换键=旧 timer 清掉重 arm 零残留；停用=清 arm） | `lib/ingest-schedule.js:166-196`；「热改…」「接线：配置热改面…」测 |
| 生命周期 | `start()/stop()` 挂 `ctx.effect`（label `wiki-steward: ingest-schedule`，拆除=清 interval+armed timer 零残留、幂等）；缺 effect 缝（cordis:676 代理语义下属性访问抛→软取得）=不裸起定时器，功能启用时留痕如实 | `lib/index.js:537-550`；「接线：apply 装配…」「接线：缺 effect 缝…」测 |
| 双源并存 | 系统 crontab 第 30 行 `25 0 * * *` 仍在（红线禁写 crontab）：与插件 timer 并跑时 flock 挡并发（后到 SKIP exit 3）；**串行同日二次跑不挡**（cron 同语义）——UI 已如实注明「系统 cron 仍在 00:25 触发，flock 防重入；如需单一时间源请运维侧停用该行」（去留交用户） | `lib/client.js:63`；`diagnostic-report.md` §4.1 |

---

## 6. 断言修订理由清单（含 TDD 红点修订）

| # | 位置 | 修订 | 理由（判据强度不降级） |
|---|---|---|---|
| 1 | `test/settings-write.test.mjs:13` | 可改白名单 5 叶子 → 7 叶子 | F3 验收③明文「settings-write 白名单扩项」。扩展非弱化：原 5 叶子逐条仍在列；`vaultRoot`/`write.readOnly` 禁改断言、越界整单拒（`not_editable`）语义原样保留 |
| 2 | `test/ingest-routes.test.mjs:247` | `data.editable` 清单 5 → 7 | 同上（权威判据=服务端 EDITABLE_PATHS，测试随真值走）；响应契约形（data 四键）不变 |
| 3 | `test/load.test.mjs:28-49` | Config 期望面 + `ingest.schedule` | F3 验收④明文「配置键入 Config（zod）并保持向后兼容」。上波 INV-5『Config 键集零变化』系 B1/B2 波契约（当时无新键需求）；本波验收面即含新键。缺省 `enabled:false`+`time:'00:25'` =旧配置行为零变化；原 5 组键默认值逐条字面锁定不变 |
| 4 | `test/ingest-routes.test.mjs`（F3 新测自身红点） | 「非法时间不触达持久化缝」→「持久化不完成（change 抛错 edit 中止）」 | TDD 红点修订（本波新测，非既有断言）：既有架构中真 zod 校验在 `configEditor.edit` 内对**合并生效面**收口（`test/ingest-routes.test.mjs` 类型非法测试同款缝语义），预检缝只管白名单。判据强度不变：校验失败=持久化绝不完成，且 400 invalid 原文如实 |
| 5 | `test/ingest-schedule.test.mjs`（F3 新测自身红点 ×2） | 假时钟在 fireTimeout 前推进到到点时刻 | TDD 红点修订：fake clock 注入缝下 timer 发火≠时钟已走，测试装配补 `setNow`（真语义=timer 到点即到点时刻）；断言值不变 |

**零断言删除、零 skip、零弱化**；既有 350 条基线测试全部在场且绿。

---

## 7. 偏离申报与遗留

- **无简报偏离**。设计逐条照做：手动两按钮走既有通路 ✓；`ingest.schedule {enabled, time}`（zod）✓；自管 timer spawn 既有 `dsh-cron.sh wiki-ingest /root/bin/tasks/21-wiki-ingest.md`（复用 distill 缝）✓；`enabled=false` 不调度 ✓；错过补跑判据=既有日志面 ✓；双源提示文案入 UI ✓；白名单双侧扩项+HH:MM 校验 ✓；控件用既有简单形、零样式对齐 ✓。
- **裁定记录**（简报授权「你定缺省并在报告里说明理由」）：缺省 `enabled:false` + `time:'00:25'`（理由见 §5 第一行）。
- **过程中修复的真缺陷**：B1 地基锁抓到 `ctx.effect` 直访抛穿 apply（cordis:676）→ 软取得修复（§2.5）。既有集成锁对新代码可见，测试体系有效。
- **遗留/concerns**：① 系统 crontab 00:25 行仍在（红线禁写）——双源并跑语义与提示见 §5 尾行，停用与否交用户/运维；② 到点无条件 spawn（cron 同语义）意味着若插件时间与 cron 不同点、当日 cron 已跑，插件到点会再跑一次（串行双跑 flock 不挡）——补跑路径已按日志判据跳过，UI 已注明；③ 定时依赖 web 进程存活（选项 A 已知代价），进程不在场时段由错过补跑兜底；④ 上波 INV-5 与 F3 验收④的张力按验收授权处理（修订 #3），若复审裁定不当，回退面=删 Config `ingest` 键 + 两白名单叶 + 对应测试。
