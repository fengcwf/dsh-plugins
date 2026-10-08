# t15 repair-round-2 报告（Hindsight 同步：定时调度面 / 碰撞分名 / queue 裁定）

> 卡：t15（repair round 2，合同经队长 amend 1 revision）｜attempt 1｜attempt_id `98171236-27a7-4377-a160-f99909965162`
> 队长修订三裁定执行：①F1 取 **(a) 补定时调度面**（不摘控件）②F2 取 **短哈希后缀分名**（否决标头比对拒写）③F3 **只改文档**。
> 越界：无（发版面 package.json/CHANGELOG/README 零触碰；/root/.dsh/ 零触碰）。

## 0. 三裁定逐条对位

### F1（裁定 a）：定时触发面已落地——「死控件」变活控件
- **接线**：`lib/index.js` 与既有 ingest 调度器**并列**挂第二个 `createIngestScheduler` 实例（同款形复用），生命周期 `ctx.effect` label=`wiki-steward: hindsight-schedule`（INV-3 零残留：teardown 清 armed timer+interval，测试钉住幂等）。
- **消费面**：`hindsight.sync.schedule{enabled,time}`（热改现读 readCfg，下个 reconcile 生效）；非法时间防御回退=`defaults.hindsight.sync.schedule.time`（=Config 缺省 03:25，禁双处硬编码）。
- **L1 门禁**：`getCfg.enabled = schedule.enabled && hindsight.enabled`——L1 关=不 arm 不触发（测试）；热改开 L1 + 过点无跑记录 → 补跑一次（测试）。createSyncStarter 内层 L1 门禁同源保留（防御纵深）。
- **同源单飞**：触发缝=与手动按钮**同一** `createSyncStarter` 实例（已上提外层共用）——在途二次触发=already-running 拒重入、引擎不重建不二跑（测试）。
- **补跑判据**：同步日志 jsonl 当日有行（含失败行）=已跑不补跑（`syncRanOnStamp`，stamp=YYYYMMDD dateStamp 同口径）。
- **注入缝**：`opts.hindsight={createEngine,now,runRecordExists,setTimeout,clearTimeout,setInterval,clearInterval,reconcileIntervalMs}`（假 clock/timer/引擎=I/O 边界缝，控制逻辑全真跑，ingest-schedule 测试同款形，零 mock 自证）。
- **UI 面零改动**：HindsightSyncPanel 时间输入/`lib/client.js:78-79` 两叶原样保留——现消费真实调度面，「手动/定时均生效」文案成立（不满足「维持现状」禁令的死控件条件已消除）。

### F2：碰撞角短哈希后缀分名（队长指定方案）
- **规则**：文件名 `<bank-slug>-<hash8>-<YYYY-MM>.md`，`hash8=sha256(bank_id) 前 8 位`（`bankHash8`/`bankFileBase` 导出）——**确定性**（同 bank 恒同名，与写入顺序无关），两 bank 绝不互覆、合法第二 bank 正常写入（否决拒写方案的理由=丢数据）。
- **碰撞实证**（测试⑧）：`coding-agent` 与 `coding-agent::公共` **同归 slug=`coding-agent`**（CJK 归 `-` 后尾连字符被 trim——断言实证碰撞前提）→ 分名 `coding-agent-cc928dc9-2026-10.md` / `coding-agent-a3906a67-2026-10.md`；A 文件只含 A 记忆、B 文件只含 B 记忆（互覆=必红）；裸 slug 文件不存在；二跑零新文件+双 skip（分名与幂等并存）。hash 字面钉死（ad942f05/cc928dc9/a3906a67）——规则变更必红。
- **引用面同步**：引擎头注（R-6 行）+ 写路径 + `solution-design.md` §2 数据流行 + 测试夹具 6 处（②③④⑤⑥⑦ 的文件名字面）全部更新；`bankSlug` 语义不变（tags 仍用 slug）。

### F3：solution-design §3 补注裁定（只改文档）
- §3「失败语义」行原「队列幂等复用 `lib/queue.js`」字面歧义**已消除**，补注裁定：**同步幂等走 sha256 三态（created/updated/skipped）+ 同步单飞旗标（createSyncStarter `running` 旗，手动/定时同源共用），不复用 queue.js**。理由：queue=失败幂等**补交**面（重试上限/TTL 逐条账本），同步是幂等**重写**语义（月桶级 sha256 比对 skip），失败由下次同步/手动触发自然重跑；引入 queue=TTL/逐条重试与月桶重写打架 + queue 补交与单飞旗标双账=静默双跑风险源。`queue.js` 零改动。

## 1. 产出文件（changedPaths）

| 文件 | 性质 |
|---|---|
| `wiki-steward/lib/index.js` | F1：hsDataDir/startSync/hsSyncLogFile 上提外层（与手动同源单飞）+ 并列调度器装配 + opts.hindsight 缝 + opts 文档 |
| `wiki-steward/lib/hindsight-sync.js` | F2：`bankHash8`/`bankFileBase`/写路径分名 + F1：`syncRanOnStamp` 补跑判据 + 头注规则更新 |
| `wiki-steward/changes/2026-10-07-hindsight-sync/solution-design.md` | F2 §2 命名行 + F3 §3 裁定补注（含 F1 落地注记） |
| `wiki-steward/test/hindsight-sync.test.mjs` | F2：夹具 6 处换新名 + 字面钉死断言 + ⑧碰撞角 + ⑨补跑判据（7→9 条） |
| `wiki-steward/test/hindsight-schedule.test.mjs` | F1：6 条（接线/到点/拆除、单飞、错峰、L1 门禁、补跑判据、缺 effect 留痕） |
| `wiki-steward/changes/2026-10-07-hindsight-sync/reports/hindsight-repair-r2-report.md` | 本报告 |
| `wiki-steward/web/dist/{panel.js,style.css}` | 合同 verify 的 `pnpm build` 重建（本卡零 web/src 改动；重建内容=当时 web/src 现状——含他卡在途的 panel.js/view-model.js 改动，此前 dist 已陈旧，重建后全量复跑 463/463 无回退） |

**inScope 偏差报备（R-17 同款）**：验收明文要求「补测试/补碰撞角测试」但 inScope 未列 `test/`——按验收明文执行并此处报备；`lib/ingest-schedule.js`、`lib/client.js`、`queue.js` 在裁定 (a)+F3 文档分支下无需改动，零触碰。

## 2. 测试与验证

新增 8 条（hindsight-schedule 6 + hindsight-sync ⑧⑨），基线 455 → **463/463 零回退**：

| # | 测试 | 覆盖（合同验收点名） |
|---|---|---|
| 1 | 接线 effect label + 到点触发一次 + teardown 零残留（幂等） | 到点触发 / INV-3 |
| 2 | 单飞：在途二次触发不重建引擎不二跑 | already-running 防重入（同源） |
| 3 | 错峰：03:25 vs 00:25 同日恰错 3h、同步在蒸馏之后 | 错峰 |
| 4 | L1 关=不 arm 不触发；热改开 L1 过点补跑一次 | L1 门禁 |
| 5 | 过点+无记录补跑一次（判据问当日 stamp）/ 有记录不补跑 | 补跑判据 |
| 6 | 缺 effect 缝留痕不裸起定时器；缺省 disabled 零留痕 | INV-3/INV-15 |
| 7 | 碰撞角：同 slug 两 bank 分名落盘各含各家记忆、二跑幂等 | 两 bank 归同 slug 绝不互覆 |
| 8 | syncRanOnStamp：当日有行（含失败行）=已跑/跨日/文件缺/畸形行 | 补跑判据数据源 |

验证命令（合同 verify 形）：

```
$ cd wiki-steward && node --test 2>&1 | tail -5
ℹ fail 0 / ℹ cancelled 0 / ℹ skipped 0 / ℹ todo 0 / ℹ duration_ms 4704.5
（计数面：ℹ tests 463 / ℹ pass 463 / ℹ fail 0；重建 dist 后复跑同值）

$ cd wiki-steward && pnpm build 2>&1 | tail -3 && node --test test/dist-browser-load.test.mjs 2>&1 | tail -4
web/dist/panel.js   115.44 kB │ gzip: 36.02 kB
✓ built in 226ms
ℹ cancelled 0 / ℹ skipped 0 / ℹ todo 0 / ℹ duration_ms 351.45
（dist-browser-load 4/4：零 process/Buffer 残留 + 无 process 真 ESM 加载）
```

## 3. 遗留（不阻塞本卡）

- 本卡未触碰 `web/src`（F1(a) 分支不需要摘控件/改文案）；若 t11/t13 复审认为「同步中…」按钮文案需标注定时态，归 UI 微调卡。
- F2 文件名规则变更后，若有**外部**引用旧命名（vault AGENTS.md 开放项① 的目录树注记尚未写）——开放项① 写注记时按 `<slug>-<hash8>-<YYYY-MM>.md` 新规则描述。

## 4. 逐条 diff 摘要（合同第 6 项：改动逐条 + 测试输出原文在 §2）

| 文件 | diff 摘要 |
|---|---|
| `lib/index.js` | +91/-2（git numstat）：import 扩 `isValidScheduleTime`/`syncRanOnStamp`；hsDataDir/hsSyncLogFile/startSync 上提外层（内层 -15 收编为引用，注释更新）；并列 `createIngestScheduler` 装配块（getCfg=L1 门禁叠 schedule、distill=同一 startSync、runRecord=syncRanOnStamp、opts.hindsight 缝）+ `wiki-steward: hindsight-schedule` effect 挂载/缺缝留痕；apply opts 文档 +3 行 |
| `lib/hindsight-sync.js` | t8 新建未跟踪文件上的增量：+`bankHash8`/`bankFileBase` 导出（sha256 前 8 位）+`syncRanOnStamp` 补跑判据 +写路径 `base` 分名（`<slug>-<hash8>-<月>.md`）+头注 R-6 规则改写；`bankSlug` 语义零变化 |
| `changes/…/solution-design.md` | +28/-3（git numstat）：§2 数据流行命名规则改 `<bank-slug>-<hash8>-<YYYY-MM>.md`（含碰撞角注记）；§3 触发面补 F1 落地注记；§3 失败语义行「复用 queue.js」→ 单飞旗标裁定+理由（F3） |
| `test/hindsight-sync.test.mjs` | t8 新建未跟踪文件上的增量：夹具 6 处文件名换 `<slug>-<hash8>-…`（字面钉死 hash：ad942f05/a3906a67）+bankHash8/bankFileBase 断言 +⑧碰撞角 +⑨补跑判据（7→9 条） |
| `test/hindsight-schedule.test.mjs` | 新建 258 行 / 6 测试（接线+到点+拆除零残留、单飞防重入、错峰、L1 门禁、补跑判据、缺 effect 留痕）——假 clock/timer/引擎注入缝，控制逻辑全真跑 |
| `web/dist/{panel.js,style.css}` | 合同 verify 的 `pnpm build` 重建（本卡 web/src 零改动；重建=当时 web/src 现状，此前 dist 相对树上 web/src 已陈旧——LRN-045 防假绿反而收口；重建后全量复跑 463/463） |

F1 文案面（合同第 3 项）：`lib/client.js:78`「开启后每日到点触发记忆机械转录（与定时蒸馏错峰，缺省 03:25）」与 `web/src/components/HindsightSyncPanel.vue:117`「同步已启用（手动/定时均生效）」**零改动**——调度面落地后两句=真承诺（到点触发+手动按钮同一 createSyncStarter），符合「不改文案」要求。
