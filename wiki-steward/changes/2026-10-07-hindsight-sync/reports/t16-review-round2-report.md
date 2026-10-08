# t16 review-round-2 报告 — Hindsight 同步波整面终审（复审 t15 repair-round-2）

- **日期**：2026-10-08 19:12–19:25（Asia/Shanghai）　**审查者**：reviewer-pro（kind=review round 2，attempt 1，attempt_id `5f9b7500-391c-41ee-b448-5fc2227669ed`）
- **被审对象**：t15 repair-round-2 的 diff（F1 定时调度面 / F2 hash8 分名 / F3 契约裁定）+ 与 t13 终审 findings 的收口对账；round-1 未变面沿用 t13 报告证据（执行纪律③：只审最新 attempt 的 diff 与合同验收项，禁全量重审）
- **对照原文**：`reports/t13-final-review-report.md`（F1/F2/F3 + O1-O4）+ `solution-design.md` §2-§5（repair-r2 修订后）
- **verdict：pass**（F1/F2/F3 三条 findings 全部收口且有测试判死实证；新增 1 条 low 级测试判别力留痕 F4，不构成返工）

## 一、t13 findings 收口对账

| # | t13 finding | 判定 | 证据（文件:行号 + 变异实证） |
|---|---|---|---|
| F1（high）定时触发面缺失 | ✅ **收口** | `lib/index.js:605-658`：与 ingest 调度器并列挂 `createIngestScheduler` 同款形实例（label `wiki-steward: hindsight-schedule` :655），**真消费** `hindsight.sync.schedule{enabled,time}`（getCfg 热改现读 :628-636）；L1 门禁收在调度面（`enabled: s.enabled === true && c.hindsight.enabled === true` :633）；触发缝=与手动按钮**同一 createSyncStarter 实例**（startSync 上提外层 :616-627，handlers 复用同变量 :789-795 → 手动/定时同源单飞）；补跑判据=`syncRanOnStamp(hsSyncLogFile, stamp)`（`lib/hindsight-sync.js:70-87`，当日有行含失败行=已跑；文件缺/非法 stamp/畸形行不作数）；生命周期挂 ctx.effect 拆除零残留（:652-655）；缺 effect 缝=不裸起+启用时留痕（:656-658）。默认 03:25 取 `defaults.hindsight.sync.schedule.time`（:634，`Config.parse({})` :430 派生——禁双处硬编码）。**变异 N1**（摘 L1 门禁）→「L1 门禁：…关=不 arm 到点也不跑」测试恰红；**N5**（拆除器改空）→「teardown 零残留」恰红；**N4**（runRecord 恒 true）→「⑨ 补跑判据」恰红。文案面承诺（client.js:78 / HindsightSyncPanel.vue:117）现为真承诺，零改动合理 |
| F2（medium）slug 碰撞互覆 | ✅ **收口** | `lib/hindsight-sync.js:42-50`：`bankHash8`（sha256(bank_id) 前 8 位，**只认 bank_id 原文非 slug**）+ `bankFileBase`=`<slug>-<hash8>`；写路径 `:249-251` 用 base 派生 `rel/target`（仍全量走注入 vaultRoot）。测试⑧（`test/hindsight-sync.test.mjs:254-289`）：碰撞前提实证（`coding-agent` 与 `coding-agent::公共` 同归 slug）+ 基名字面钉死（`coding-agent-cc928dc9`/`coding-agent-a3906a67`，规则变更必红）+ 两文件各只含自家记忆（互覆=必现红）+ 无裸 slug 文件 + 二跑幂等零新文件。**变异 N3**（去 hash 后缀）与 **N6**（hash 宽度 8→7）均整面红（夹具 6 处 hash 字面全钉死）。文档同步：`solution-design.md:31`（§2 命名修订+碰撞角说明）；t8 报告:33 旧「接受留痕」口径以 solution-design 现文为准 |
| F3（low）queue.js 字面不符 | ✅ **收口** | `solution-design.md:45` 改述为明文裁定：「同步幂等走 sha256 三态 + createSyncStarter 单飞旗标，不复用 lib/queue.js」+ 理由留痕（queue=失败幂等补交面 vs 同步=幂等重写语义，双账并存=静默双跑风险源）。裁定内容经本审评估成立（queue 的 TTL/逐条重试与月桶重写语义确实不匹配），queue.js 零改动符合「最小面」 |

## 二、solution-design §2-§5 契约一致性（round-2 改动面核对）

| 契约面 | 判定 | 证据 |
|---|---|---|
| §2 聚合命名（修订后 `<bank-slug>-<hash8>-<YYYY-MM>.md`） | ✅ | doc `:31` ↔ 实现 `lib/hindsight-sync.js:48-50,249-251` ↔ 测试⑧字面三处同源；禁日期前缀/幂等语义不变 |
| §2 数据流/sha256/易变字段 | ✅（round-1 证据沿用，未被 diff 触及） | redact 后 bodyHash 同源（`lib/hindsight-sync.js:253-256`）、frontmatter 易变字段唯一渲染面、writeAtomic 原子写（:277）逐项与 t13 §一表一致 |
| §3 触发面①手动+②定时 | ✅ | doc `:43` 补 F1 落地注记与实现逐点对应（effect label/补跑判据/L1 门禁/单飞同源） |
| §3 失败语义/同步日志 | ✅ | fail-open+kb-alerts（`:285-290`）不变；日志行字段不变 |
| §4 六控件 / §5 四处同步+端点形 | ✅（round-1 证据沿用） | web/src 零改动（mtime 18:20=t14 期）；EDITABLE_PATHS/EDITABLE_FIELDS/cordis/Config 四处未被 diff 触及 |
| 契约自洽性（本轮唯一新增歧义源检查） | ✅ | F2 命名修订已回写 §2（非只改代码不改文档）；F1 落地状态回写 §3；F3 裁定回写 §3——文档/实现/测试三方同源 |

## 三、测试质量（恒真扫描 + round-2 变异实验）

- **恒真扫描**：`test/hindsight-schedule.test.mjs`（6 测试 / 26 断言）、`test/hindsight-sync.test.mjs`（9 测试 / 97 断言）——`assert.ok(true|1)`/自我相等/`.skip(`/`todo:` 零命中；假缝只在 I/O 边界（假 clock/timer/引擎/宿主缝），控制逻辑（arm/到点/门禁/补跑/拆除/单飞）全真跑（真 `apply` integration 形）。
- **变异实验**（`/tmp/t16-mut` 隔离副本，逐个注入→跑对应测试→复原；`diff -rq` 复原零差异、工作区零触碰）：

| # | 注入缺陷 | 目标测试 | 结果 |
|---|---|---|---|
| N1 | 摘 L1 门禁（`&& c.hindsight.enabled === true`） | 「L1 门禁：…关=不 arm 到点也不跑」 | pass 5 / **fail 1**（恰红） |
| N2 | 摘 createSyncStarter `if (running)` 单飞守卫 | 「单飞：定时触发在途时再次触发…」 | **pass 6 / fail 0（未红→F4）** |
| N2b | 同 N2 打 t9 既有单飞测试 | `hindsight-routes.test.mjs`④「单飞 already-running」 | pass 6 / **fail 1**（恰红——守卫有覆盖） |
| N3 | hash8 分名失效（去后缀） | ⑧ 碰撞角 | pass 2 / fail 7（夹具字面全红） |
| N4 | 补跑判据失效（恒「已跑」） | ⑨ syncRanOnStamp | pass 8 / **fail 1**（恰红） |
| N5 | 拆除器改空（`return () => {}`） | 「teardown 零残留」 | pass 5 / **fail 1**（恰红） |
| N6 | hash8 宽度 8→7 | ⑧ 基名字面钉死 | pass 2 / fail 7（恰红） |

### F4（low，留痕不返工）— 「单飞」测试断言被 firedKey 去重遮蔽

- **问题**：`test/hindsight-schedule.test.mjs:159-181` 名为「单飞」的测试在**静态假时钟**（nowRef 恒 T0）下二次 `fireTimeout` 复算出同一 occurrence key，被调度器 `firedKey` 去重（`lib/ingest-schedule.js:135`）先行拦下，根本到达不了 `createSyncStarter` 的 `running` 旗——变异 N2（摘守卫）该测试仍 6/6 绿。守卫本身有覆盖（t9 `hindsight-routes.test.mjs`④ 对 N2b 恰红），**无覆盖缺口**，但该测试名/注释（「与手动按钮共用 createSyncStarter 旗标」）overclaim 了它实际锁的语义。
- **建议（下一波顺手）**：二次触发前推进 `nowRef.value` 到次日（绕开 occurrence 去重）或直接驱动同一 `startSync` 两次断言 `already-running` 回执；或改名为「同 occurrence 去重」如实。

## 四、宪法红线复核（改动面）

1. **零 LLM 编译面** ✅：`grep -rniE "dsh-llm|prompt|completion|openai|anthropic"` 改动三件（hindsight-sync/index/hindsight-routes）零命中；调度触发=纯机械 `startSync()`→引擎转录。
2. **脱敏在场** ✅：写路径未被 diff 触及——`redact(renderBody(...))` 先于 bodyHash/写盘（`lib/hindsight-sync.js:253-256`）、告警正文脱敏（:286）；t13 M1 判死实证沿用。
3. **写 vault 均过注入 vaultRoot / 真 vault 零误写** ✅：命名改动后 target 仍 `path.join(vaultRoot, 'raw', '06-hindsight', …)`（:251）；调度面测试全 mkdtemp（`test/hindsight-schedule.test.mjs:20-24`）；本审复核真 vault `raw/06-hindsight/` 内文件数=**0**。
4. **raw 只增语义** ✅：F2 后碰撞互覆路径消除；幂等双态不变（⑧二跑 `skipped` 零新文件实证）。

## 五、发布物面（LRN-045）

1. **web/src 零改动** ✅：`ls -la web/src` 全部 mtime 18:20（t14 期）——t15「web/src 零改动」申报属实。
2. **dist↔src 同源** ✅：dist md5 与 t13 终审钉死值**完全一致**（`panel.js 9cc97b2debb935d1ab3b3624957037a6` / `style.css cc1db681bb8c60f5ddd6a821f065e957`）——src 未动而 dist 经 t15 verify 重建仍字节一致=构建确定性再证。
3. **dist-browser-load** ✅：4/4 pass / 0 fail。
4. **回归** ✅：`node --test` **463/463 pass / 0 fail**（基线 455 + 新增 8：hindsight-schedule 6 + hindsight-sync ⑧⑨），零回退。

## 六、五轴（round-2 增量）

- **正确性**：F1 调度面语义完整（到点无条件触发 cron 同语义 / 错过补跑统一判据 / 热改下环生效 / L1 热开过点补跑），F2 分名确定性且拒写方案的丢数据风险被正确否决（header 注释留痕）。F4 为测试面瑕疵非产品缺陷。
- **可读性**：`lib/index.js:605-612` 头注把门禁/单飞/补跑/生命周期四语义一次讲清；`bankHash8` 注明「只认 bank_id 原文非 slug」防误改。
- **架构**：`createIngestScheduler` 同款形复用而非新造调度器（一致性好）；`startSync` 上提共享=手动/定时单飞同源，无双账。
- **安全**：改动面无新 I/O 注入面；`syncRanOnStamp` 只读日志文件（路径注入缝）；无新增鉴权面。
- **性能**：`syncRanOnStamp` 全量读日志（与 O2 同口子，补跑判据每 reconcile 环一次）——O2（日志轮转/上限）仍为既有观察项，不升格。

## 七、结论

- **verdict=pass**：t13 三条 findings（F1 high / F2 medium / F3 low）全部按 requiredFix 收口，其中 F1/F2/F3 的修复均有变异实验或字面钉死判据支撑；发布物面与回归零回退；宪法红线在改动面复核全过。
- **留痕**：F4（low）+ 既有观察项 O1（skip 态 frontmatter 易变字段滞后）/O2（同步日志无轮转）/O4（发版后补真 HTTP 冒烟）转下一波 backlog，不阻塞本波收口。
- 命名规则变更（F2）提示：真实 vault 当前 0 个同步产物，无旧名文件迁移问题；若未来存在 repair-r2 前旧名文件（`<slug>-<YYYY-MM>.md`），会被新名文件并存为孤儿素材，届时按 raw 只增原则人工归档即可（留痕 O5）。

## 八、产出文件

- 本报告：`wiki-steward/changes/2026-10-07-hindsight-sync/reports/t16-review-round2-report.md`
- 变异实验脚本与副本（临时区，非交付物）：`/tmp/t16-mut`、`/tmp/t16-pristine`、`/tmp/t16-mutate.sh`、`/tmp/t16-mutate2.sh`（复原零污染：`diff -rq` 三目录零差异；工作区零触碰）
