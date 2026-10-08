# F3 窄缝收口复审（t5 · 复审 t4）

- 日期：2026-10-08
- 被审：t4「F3 窄缝收口（reload 在途禁翻旧）+ F1/F2 报告笔误修正」attempt 1（`6557d7c6-af10-4d8f-bdf1-a93c48b14f9e` 的前序 t4 attempt）
- 审查形态：窄 diff 复审（只对 t4 最新 attempt 的 diff 与合同验收项核对，不全量重审）
- 审查人：integrator（复审换人纪律；t3 初审=`reports/w1-epoch-guard-review.md`）
- **verdict：needs_revision**（1 条 medium 发现；实现语义本身正确，欠的是其中一处门禁条件的测试锁定）

## 一、审查面（t4 diff 范围，`git diff --numstat` 实测）

| 文件 | numstat | 性质 |
|---|---|---|
| `web/src/components/LogHistoryView.vue` | +9/-1 | F3：`reloading` 标记 + finally + loadOlder 闸门 + prop 透传 |
| `web/src/components/IngestLogPanel.vue` | +3/-0 | `loadOlderDisabled` prop + 按钮 `:disabled` |
| `web/dist/panel.js` | +81/-71 | `pnpm build` 重建入库 |
| `test/log-history-view.test.mjs` | +54/-0 | +2 条 F3 门禁测试 +1 条 dist 字面锁（7→10，纯增） |
| `reports/w1-epoch-guard-report.md` | +121/-2 | §八 追加 + F1/F2 修正 |

越界面核对：`lib/`（服务端）零改动、无 bump/CHANGELOG/tag/push/release；报告 §八 自述与 diff 一致。

## 二、验收项 1：F3 语义核验（代码门禁点 + 测试双向核对）

代码侧三处门禁点（`web/src/components/LogHistoryView.vue`）：

1. `:38` 请求级语义门禁：`if (!canLoadOlder(history.value) || reloading.value) return`
2. `:66` → `IngestLogPanel.vue:96` 入口禁用：`:load-older-disabled="reloading"` / `:disabled="loadOlderDisabled"`
3. `:31-33` finally 条件清标记：`if (mine === epoch.value) reloading.value = false`（报告 §八 原文声称「被丢弃的旧 reload 不得误清新在途 reload 的门禁」）

测试↔代码双向核对（含「reload 完成后翻旧恢复可用」正路）：

| 门禁点 | 对应测试断言 | 双向核对 |
|---|---|---|
| ① 请求级闸门 | F3 测试 1 `:295`（绕过 disabled 直触发 onClick 仍零请求）、F3 测试 2 `:318` | 闭合 ✅ |
| ② 入口禁用 + 正路解除 | F3 测试 1 `:291`（disabled=true）、`:299`（落地后 false）、`:302-304`（翻旧恢复=同游标同参） | 闭合 ✅ |
| ③ finally epoch 条件 | **无任何测试覆盖** | **未闭合 → F-1** |

## 三、验收项 2：W1 无回归（既有 7 测试语义零漂移）

- `git diff --numstat -- wiki-steward/test/` = `54 0 log-history-view.test.mjs`：既有 7 条测试文本**零改动**（新增全部落在 `:281` 之后），非「改断言式漂移」。
- 源侧逐字核对：epoch 双路守卫（`mine !== epoch.value` 双路 return、loadOlder 沿用不递增）未被触碰——diff 中 `reload()`/`loadOlder()` 仅新增 `reloading` 相关行，原守卫行原样；N2 面（`log-filter.js`、`IngestLogPanel` 空态 v-if）零触碰（numstat 无该文件）。
- 全量实测：`node --test`（wiki-steward）→ `tests 425 / pass 425 / fail 0`（与 t4 自述 422→425 一致；含既有 7 条全绿）。

## 四、验收项 3：测试判别力（/tmp 隔离变异实验，跑毕删除、源树零污染）

隔离副本：`/tmp/t5-mut/ws`（tar 复制 + node_modules 软链），实验前后源树 diff sha 恒等：

```
baseline: 91db1228a72bb40ac9997a749c96cfd7c0b2e44f99545746ec6d091ef8da2f72  -
now     : 91db1228a72bb40ac9997a749c96cfd7c0b2e44f99545746ec6d091ef8da2f72  -
（/tmp/t5-mut 已删除）
```

| 变异 | 注入 | 结果 | 证明 |
|---|---|---|---|
| 基线 | 无 | 10/10 绿 | 副本与工作树同态 |
| A | 去掉 `:38` 的 `\|\| reloading.value` 请求门禁 | **2 红**（恰为 2 条 F3 测试），既有 7 条仍绿 | 请求级门禁断言非恒真 |
| B | 去掉 `IngestLogPanel.vue` 按钮 `:disabled` 绑定 | **1 红**（F3 测试 1 `:291` disabled 断言） | 入口禁用断言非恒真 |
| C′ | dist 中 `loadOlderDisabled` 字面彻底移除 | **1 红**（LRN-045 F3 字面锁） | dist 锁有判别力（先红后绿口径可复现） |
| **D** | 去掉 finally 的 `if (mine === epoch.value)` 条件 | **全量 425/425 仍全绿** | **无覆盖 → F-1** |

变异 D 请求级实证（探针直读 `api.calls`）：

```
MUT-D disabled = false
MUT-D calls = [..., {"cursor":"k1","query":{"since":"2026-09-05"}}]   ← 旧游标 k1 + 新参，窄缝原样重开
   actual: 4, expected: 3   → 探针红
复原后：MUT-D disabled = true / calls 停在 3 条（零请求）→ 探针绿
```

时序：点「刷新」(reload A 在途) → 改起始日期 (reload B 在途) → A 响应先落（epoch 不匹配丢弃，但 finally 会跑）→ 变异实现把 `reloading` 清成 false → 「加载更早」重开并发出旧游标+新参（该请求 `mine=epoch` 不被 W1 丢弃）。该排序在真实使用中常见（A 先发先到）。

## 五、验收项 4：F1/F2 修正核验（报告数字/行号 vs 磁盘实测）

| 项 | 报告现值 | 磁盘/历史实测 | 结论 |
|---|---|---|---|
| F1 §四 dist numstat | `110/95`（原笔误 `+15/-3`） | `git show --numstat e7a6ae7 -- wiki-steward/web/dist/panel.js` → `110 95`；同 commit `LogHistoryView.vue` = `15 3`（误抄源确认） | ✅ |
| F2 §一 reload 行号 | `LogHistoryView.vue:18-28`（t1 落盘态） | `git show e7a6ae7:…LogHistoryView.vue \| grep -n` → `async function reload() {`=18、闭 `}`=28 | ✅ |
| 行号基准说明 | §一表下「行号基准 = e7a6ae7 实测，F3 后漂移见 §八」 | 存在（`:19`） | ✅ 防误读 |
| §八 漂移对照表 | reload 21-34 / loadOlder 36-48 / defineExpose 56-57 / `reloading` 17-19 / finally 31-33 / 闸门 38 / prop 透传 66 / IngestLogPanel prop 15-16、`:disabled` 96 | 逐行 `grep -n`/`sed -n` 对盘全部一致（现行 `grep -n "async function reload"`=21、`loadOlder`=36、`defineExpose`=57） | ✅ |
| 组件行数 | LogHistoryView 71 行 / IngestLogPanel 101 行 | `wc -l` → 71 / 101 | ✅ |
| 发布物面 | panel.js 102.78 kB；`epoch`=1、`loadOlderDisabled`=2、N2 双文案各 1；本波 dist 增量 81/71 | `stat`=102786 B（102.78 kB）；`grep -o \| wc -l` → 1/2/1/1；`git diff --numstat web/dist` → `81 71` | ✅ |

## 六、发现

### F-1（medium）：finally 的 epoch 条件零测试锁定 —— F3 门禁第三处代码点无判别力覆盖

- **问题**：`LogHistoryView.vue:32` 的 `if (mine === epoch.value) reloading.value = false` 是「重叠 reload 下门禁不被旧响应误清」的唯一防线，t4 报告 §八 明文把它写进收口语义；但变异 D（去掉该条件）下 wiki-steward **全量 425/425 仍全绿**——该防线今日正确、明日被删/写错也无人发现。合同验收项 1 的「代码门禁点 + 测试双向核对」在 code→test 方向未闭合；验收项 3 的判别力覆盖不完整。
- **影响**：该条件一旦回归，「刷新在途 → 改筛选 → 旧刷新响应先落」即重开本次 F3 要消灭的「旧游标 k1 + 新参」窄缝（实验实证 disabled=false 且真发请求；该请求同 epoch、W1 守卫不拦），属本任务核心语义的回归盲区（非当下缺陷）。
- **要求修复**：在 `wiki-steward/test/log-history-view.test.mjs` 追加 1 条时序测试（复审探针同型，判别力已实证：变异 D 红、原实现绿）：mount 首取落地 → 点「刷新」(A 在途) → 改起始日期 (B 在途) → 先 resolve A（epoch 不匹配丢弃）→ 断言「加载更早」`disabled=true` 且直触发 onClick 后 `api.calls.length` 不变（零请求）→ resolve B → 断言门禁解除、翻旧 = 新游标 + 新参；报告 §八 补该测试输出原文，并把「finally 条件」从「未锁表述」落实为已锁。
- **文件/位置**：`wiki-steward/test/log-history-view.test.mjs:305`（F3 测试 2 之后追加）；参照实现语义见 `web/src/components/LogHistoryView.vue:31-33`。

## 七、复审执行命令与输出原文

```
① git diff --numstat -- wiki-steward/            → 测试 +54/-0、src +9/-1、+3/-0、dist +81/-71
② git show --numstat e7a6ae7 -- …/panel.js        → 110 95；（LogHistoryView.vue → 15 3）
③ git show e7a6ae7:…LogHistoryView.vue | grep -n "async function reload" → 18 … 闭括号 28
④ node --test（wiki-steward 全量）                 → ℹ tests 425 / pass 425 / fail 0
⑤ /tmp 变异 A：去请求门禁                          → fail 2（恰为 2 条 F3 测试）
⑥ /tmp 变异 B：去 :disabled 绑定                   → fail 1（F3 测试 1 :291）
⑦ /tmp 变异 C′：dist 移除 loadOlderDisabled 字面    → fail 1（LRN-045 F3 锁）
⑧ /tmp 变异 D：去 finally epoch 条件 + 全量        → ℹ tests 425 / pass 425 / fail 0（零红）
⑨ /tmp 探针（变异 D）请求级                        → disabled=false、calls 追加 {"cursor":"k1","query":{"since":"2026-09-05"}}；复原后探针绿
⑩ dist 字面/尺寸：epoch=1、loadOlderDisabled=2、当前时间区间为空=1、所选筛选条件下无日志条目=1；102786 B
⑪ 零污染：实验前后源树 diff sha 均 91db1228…a2f72；/tmp/t5-mut 已删除
```

## 八、changedPaths（本复审）

- `wiki-steward/changes/2026-10-07-hindsight-sync/reports/f3-closeout-review.md`（本报告，新建）

实现源码零改动（复审只读 + /tmp 隔离实验）。
