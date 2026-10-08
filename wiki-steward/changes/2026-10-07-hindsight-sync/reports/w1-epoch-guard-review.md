# t3 复审报告 — W1 epoch 守卫 + N2 文案互斥（被审任务 t1）

- **日期**：2026-10-08　**审查者**：reviewer（kind=review，attempt 1，attempt_id `f9511b64-aea3-41ca-a99f-b8cee1e50c43`）
- **被审对象**：t1 工作树 diff（`git status` 面：`web/src/{components/LogHistoryView.vue,components/IngestLogPanel.vue,lib/log-filter.js}` + `web/dist/panel.js` + `test/log-history-view.test.mjs`（新）+ 本报告对应实现报告）
- **对照原文**：`wiki-steward/changes/2026-09-30-logview-filters/review-report.md:106-110`（W1/N1/N2/N3/N4 裁定）
- **verdict：pass**（4/4 验收项过；4 条 low/nit 级留痕，无返工项）

## 一、t1 合同验收 6 项逐条核对

| # | t1 验收项 | 判定 | 证据（文件:行号 + 输出原文） |
|---|---|---|---|
| 1 | epoch 持有：filter-change/reload 递增、响应不匹配即丢弃（不 applyOlder 不替换当前页） | ✅ | `LogHistoryView.vue:16` `const epoch = ref(0)`；`:18-28` reload（`:19` `const mine = ++epoch.value`，`:22` 成功路丢弃、`:25` 失败路丢弃）；`:30-41` loadOlder（`:32` `const mine = epoch.value` 沿用，`:35/:38` 双路丢弃）；`:43-46` onFilterChange 同步 `filters.value=next` 后即调 reload；`:50` `defineExpose({ reload, epoch })`。变异实验 M1（移除全部 4 处守卫）→ 测试 1/2 立即红（见 §三） |
| 2 | N2 互斥：倒置只呈「当前时间区间为空」 | ✅ | `log-filter.js:52-55` `rangeInverted`；`IngestLogPanel.vue:22` 收编单一判定源、`:69` 倒置提示、`:87` 空态文案 `v-if="lines.length === 0 && !error && !rangeEmpty"`。变异 M2（去掉 `!rangeEmpty`）→ 测试 4 红 |
| 3 | 真实现测试锁竞态 + N2，禁 mock 自证（LRN-047） | ✅ | `test/log-history-view.test.mjs`（279 行/7 测试）：真 SFC（`vue/compiler-sfc` `registerHooks` 直编源文件，:24-42）+ 真 Vue `createRenderer` 内存节点 + 真 `log-history/log-filter` 状态机；`grep -nE '\.skip\|t\.mock\|mock(\|node:mock\|todo('` → **NO mock/skip/todo**；唯一假缝=`props.api.fetchLogs` 可控传输（:109-117，I/O 边界注入缝）。判别力有变异实验实证（§三） |
| 4 | `node --test` 全绿零回退（基线 415，≥416） | ✅ | 本审独立复跑：`node --test` → `tests 422 / pass 422 / fail 0 / skipped 0`，EXIT=0；**基线独立复跑**：排除新文件后 `node --test $(ls test/*.test.mjs \| grep -v log-history-view)` → `tests 415 / pass 415 / fail 0`（415+7=422）；`git status --short wiki-steward/test/` → 仅 `?? test/log-history-view.test.mjs`（既有测试文件零触碰=零修订） |
| 5 | `pnpm build` 重建 dist 并入库、字面含新语义（LRN-045） | ✅（附 F4 观察） | 重建前后 md5 一致=字节级同源：`panel.js e62becd304d12bd1a107b0d668ed5e22`、`style.css 38831877bab9468825e89f5f803fb215`（build ✓ built in 181ms，产物 102.49 kB/3.63 kB 与报告一致）；字面计数：`epoch=1`（`panel.js:3055` `epoch: a` = expose 属性键）、`当前时间区间为空=1`、`所选筛选条件下无日志条目=1`；旧形为零：`n.filters.since !== "" && n.filters.until`（旧内联判定）=**0**、`e.lines.length === 0 && !e.error ?`（旧渲染条件）=**0**、新形 `e.lines.length === 0 && !e.error && !s.value`=1、守卫 `e !== a.value`=**4**（双路×两函数）；`node --test test/dist-browser-load.test.mjs` → `pass 4 / fail 0` |
| 6 | 报告落盘含 N1/N3/N4 对账 + 测试输出原文 | ✅（2 处引用瑕疵=F1/F2） | `reports/w1-epoch-guard-report.md`：§五 N1/N3/N4 对账表（:59-61）、§六 输出原文（:68-74 422/422、:82-88 build+dist-browser-load、:93-95 dist 计数）、§七 changedPaths+越界申报。本审复跑输出与报告逐项吻合；引用瑕疵见 §六 F1/F2 |

## 二、竞态语义审查（合同验收项 2）

**递增点**（唯一）：`LogHistoryView.vue:19` `++epoch.value`，位于 `reload()` 同步首句。三入口全部同路汇入 reload：`onMounted(reload)`（:48）、刷新按钮 `@reload`（:60 → `IngestLogPanel.vue:36` emit）、`defineExpose({reload})`（:50）、`onFilterChange→reload()`（:43-45）。组件内 `filters` 唯一变异点=`:44`（与递增同属 `onFilterChange` 同步执行段）。

**丢弃点**（全覆盖两路全部 4 个异步返回路径）：组件仅 2 个 `await` 点（`:21` reload、`:34` loadOlder——`grep -n await` 全量核实，IngestLogPanel 零 async）；每个 `await` 的成功路与 catch 路各有 `if (mine !== epoch.value) return`，dist 侧实测同型守卫 4 处。

**「响应先到、epoch 后增」残余窗口：不存在**。
- `onFilterChange` 的 `filters.value = next`（:44）与 `++epoch.value`（经 :45→:19）处于**同一同步 run-to-completion**；JS 微任务（promise 续体）不可插入其间——「先改筛选、后递增 epoch」的中间态不可达。
- 两个方向排序均安全：晚到的旧请求（mine=旧值）在 epoch 已递增后落地 → 恒不匹配 → 整份丢弃；若旧响应续体先于 filter-change 事件执行，则彼时视图仍属旧筛选集，落地合法（非越筛）。
- loadOlder 捕获的是**发请求时刻**的 epoch（:32），任何先于递增发出的请求 `mine < 新 epoch`，必被丢弃；任何后于递增发出的请求参数来自新 `filters.value`（:34 `toQuery(filters.value)`）。

**留痕观察（F3，low，backlog，不阻断本轮）**：存在**请求构造侧**窄缝（非响应竞态）——filter-change 后、reload 响应落地前点「加载更早」（`meta.hasMore` 仍为旧页真值），loadOlder 以「旧游标 + 新筛选参」发请求，响应与在途 reload 同 epoch（mine 相等）故不被丢弃。后果上界：锚点行仍在新筛选集 → 合法续翻；不在 → 服务端 `tailSlice`（`lib/ingest-log.js:239` 区间）返回空页+`stale:true` → `applyOlder` 置 `stale` 留痕、`hasMore=false` 翻旧收起（「刷新」可恢复）；若晚到响应先于 reload 落地则瞬时拼接、随即被 reload 整页替换。**不产生越筛内容污染**（请求/响应均带新参），且复审原文 :106 的建议方案本身同具此属性（t1 按建议方案落地=符合约定修复口径）。可选收口（backlog）：reload 在途时禁用翻旧，或 loadOlder 捕获 history 版本号比对。

## 三、测试质量（合同验收项 3）：真实现口径 + 恒真扫描 + 变异实验

**真实性**：被测件为真组件整链（真 SFC 编译、真运行时渲染、真状态机/纯函数），非 mock 自证；`makeApi()` 只替换 I/O 传输（client-face 同款注入缝纪律），晚到时序经手动 resolve 构造——时序注入正是竞态测试的合法缝。

**恒真扫描结论：未发现恒真断言**。7 测试逐条过目：无 `assert.ok(true)` 型；关键断言均可在合理错误实现下变红（下表变异实证）；`test 1:163 doesNotMatch /old1|old2/`、`test 4:242 暂无日志不并存` 等辅助断言判别力有限但非恒真（分别能抓「晚到响应整页替换」与「倒置提示被整体隐藏」两类错实现，M4 已实证后者）。

**变异实验（/tmp 隔离副本，跑毕删除，源树 md5 校验未动）**：

| 变异 | 注入 | 结果 | 证明 |
|---|---|---|---|
| M1 | 移除全部 4 处 `if (mine !== epoch.value) return` | 测试 1、2 **红**（fail 2） | 竞态测试锁真实现，非空转 |
| M2 | 去掉空态渲染 `!rangeEmpty` | 测试 4 **红** | N2 互斥锁有效 |
| M3 | loadOlder 改 `++epoch.value` | 测试 3 **红** | 「loadOlder 不递增」契约有锁 |
| M4 | 去互斥 + 倒置提示恒藏 | 测试 4 **红** | 「互斥靠藏提示实现」被抓 |
| M5 | 空态文案恒不渲染 | 测试 5 **红** | 判别力对照双向成立（锁不许对正常空态失明） |
| 复原 | 还原后 `diff -r` 源树一致 | 7/7 绿 | 实验零污染 |

先红后绿（LRN-045）独立复证：`git show HEAD:wiki-steward/web/dist/panel.js \| grep -c epoch` → **0**（旧构建物零命中，测试 7 在重建前必红），与 t1 报告声明一致。

## 四、发布物面（合同验收项 4）

- **重建确定性**：本审 `pnpm build` 重建前后 `md5sum` 完全一致 → 工作树 dist 与 src 字节级同源（非手改、非陈旧残留）。
- **新语义字面**：`epoch=1`（`:3055`，`defineExpose` 属性键=缩编下唯一存活形，亦为测试直读缝）、`当前时间区间为空=1`、`所选筛选条件下无日志条目=1`。
- **旧形为零**：旧内联倒置判定（`n.filters.since...`）=0、旧渲染条件（`!e.error ?`）=0；新渲染条件=1、新守卫 `e !== a.value`=4。
- `dist-browser-load` **4/4**（字节残留锁 + 无 process 真 ESM 加载）；`style.css` 与 HEAD 一致零变更（src 样式未动，符合预期）。

## 五、对照 0.7.0 波复审原文 :106-110 逐条核验

| 原文行 | 建议/裁定 | t1 处置核验 |
|---|---|---|
| :106 W1 warning | 「加 epoch/seq，filter-change/reload 递增，响应 epoch 不匹配即丢弃；约 3 行」 | ✅ 同构落地且更完整（成功/失败双路 + expose 测试缝，实测 15 行级）；语义根治由变异 M1 反证 |
| :107 N1 nit | 「接受，留 cosmetic」 | ✅ 未动（`log-filter.js` numstat 纯增 5 行=仅 rangeInverted；`toQuery:44-50` 零改动），报告 §五 对账留痕 |
| :108 N2 nit | 「可后续用 v-if 互斥；裁定接受」 | ✅ 已做且用单一判定源 `rangeInverted`（比字面建议更收敛）；测试 4/5 双向锁 |
| :109 N3 nit | 「留痕即可（非恒真；真过滤另有真实现锁）」 | ✅ 既有测试文件零触碰（`git status` 实证），本波新测试严守真对真；报告 §五 对账 |
| :110 N4 nit | 「下轮报告校对」 | ⚠️ 部分：报告声明「行号全部写前实测」，实测发现 2 处引用瑕疵（F1/F2）——量级同 N4，留痕下轮校对 |

## 六、发现表（全部 low/nit，无返工项；verdict=pass）

| id | severity | 问题 | 处置建议 |
|---|---|---|---|
| F1 | low（文档精度） | t1 报告 `w1-epoch-guard-report.md:49` 称 `git diff --numstat：web/dist/panel.js +15/-3`——实测 dist numstat=**110/95**，+15/-3 是 `LogHistoryView.vue` 的数字（引错对象） | 队长收口时顺手校对一行；不影响任何构建/测试事实 |
| F2 | low（文档精度） | 报告 `:15` 表 `LogHistoryView.vue:17-29` 指 reload——实测 reload=**18-28**（17/29 为前后空行）；与「行号全部写前实测」的自述相抵（N4 类复发） | 同上校对；代码本体无误 |
| F3 | low（残余缝留痕） | filter-change 后、reload 响应前的 loadOlder 请求构造缝（旧游标+新参、同 epoch 落地），后果上界=stale 留痕+翻旧收起（刷新恢复），无越筛内容污染；超出复审 :106 建议方案覆盖面 | 记 backlog（可选：reload 在途禁翻旧 / history 版本比对），不阻断 |
| F4 | info（流程） | 「入库」字面（git commit）未发生：HEAD dist 仍为 0.7.0 波旧物，本波全部产物（含门禁文件）在工作树待统一提交——与 t2/门禁文件同状态，非 t1 单独欠账 | 队长波次收口时统一 commit；LRN-045 实质（重建+字节同源）已由本审实证 |

**blocker：none。安全/性能轴无发现。**

## 七、本审执行命令与输出原文

```
① node --test                       → ℹ tests 422 / pass 422 / fail 0        EXIT=0
② node --test <除新文件的全部>        → ℹ tests 415 / pass 415 / fail 0        （基线独立复跑）
③ pnpm build（前后 md5sum）          → ✓ built in 181ms；panel.js/style.css md5 前后相同
④ dist 字面 grep                     → epoch=1 / 当前时间区间为空=1 / 所选筛选条件下无日志条目=1；
                                        旧形（n.filters.since 内联、旧渲染条件）=0；守卫 e!==a.value=4
⑤ git show HEAD:.../panel.js | grep → epoch=0（旧物零命中=测试7 先红实证）
⑥ node --test test/dist-browser-load.test.mjs → pass 4 / fail 0
⑦ 变异实验 M1-M5（/tmp 隔离副本）    → 5 注入各自定点红，复原后 7/7 绿、diff 源树零污染
⑧ mock/skip 扫描                     → NO mock/skip/todo
```
