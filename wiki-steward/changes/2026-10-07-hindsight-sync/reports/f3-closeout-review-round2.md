# F3 收口复审 round 2（t7 · 复审 t6）

- 日期：2026-10-08
- 被审：t6（repair round 2）——针对 t5 复审发现 F-1 的修复
- 审查形态：窄 diff 复审（只对 t6 最新 attempt 增量与合同验收项核对；t4 面已在 t5 复审对盘，仅复核未漂移）
- 审查人：integrator（t5 初审=`reports/f3-closeout-review.md`，本文件=round 2）
- **verdict：pass**（F-1 已锁，验收项 1-4 全闭合；1 条非阻断 scope 观察见 §六）

## 一、t6 增量（`git diff --numstat` 对 HEAD 实测）

| 文件 | numstat | 与 t5 时点对比 |
|---|---|---|
| `test/log-history-view.test.mjs` | +91/-0 | t5 时 +54/-0 → **t6 净增 +37/-0**（333→370 行，10→11 测试） |
| `web/src/components/LogHistoryView.vue` | +9/-1 | 与 t5 逐 hunk 相同（**零改动**） |
| `web/src/components/IngestLogPanel.vue` | +3/-0 | 与 t5 相同（**零改动**） |
| `web/dist/panel.js` | +81/-71 | 与 t5 相同（**零改动**，未重建也未误动） |
| `reports/w1-epoch-guard-report.md` | +146/-2 | t5 时 +121/-2 → t6 净增 §八「F3 补锁」小节 |

## 二、验收项 1+F-1 闭合：新测试语义核验（`test/log-history-view.test.mjs:329-364`）

t6 追加「F3 门禁（时序探针同型）」，逐条对 t5 F-1 requiredFix 核对：

| requiredFix 要素 | 测试落实 | 行 |
|---|---|---|
| mount 首取落地 | resolve calls[0]（d1/k1） | `:333` |
| 刷新 → A 在途、改起始日期 → B 在途 | 两段 + `calls[2].query={since}` 断言 | `:336-342` |
| 先 resolve A（epoch 不匹配丢弃） | `doesNotMatch /staleA/` + `match /d1/` | `:344-348` |
| 断言 disabled=true + 直触发 onClick 零请求 | `:351`、`:354`（calls 仍 3） | ✅ |
| resolve B → 门禁解除、翻旧=新游标+新参 | `:358-363`（cursor=kB、query={since}） | ✅ |
| 报告 §八 补测试输出原文 | `reports/w1-epoch-guard-report.md:164-187` 含输出原文+426 新总数+已锁声明 | ✅ |

时序与 t5 复审探针同型（探针在 /tmp 验证过红/绿两态，本审重放见 §三）。三处门禁点现均 code→test 闭合：①请求级闸门 ②入口禁用+正路解除 ③finally epoch 条件（本轮补齐）。**「reload 完成后翻旧恢复可用」正路在新旧测试均不被误禁**（`:358-361` disabled=false → 请求发出）。

## 三、验收项 3：判别力变异实验（/tmp 隔离副本，跑毕删除）

| 实验 | 注入 | 结果 |
|---|---|---|
| 基线 | 无 | 11/11 绿 |
| **D**（t5 F-1 反证重放） | finally 去 `if (mine === epoch.value)` 条件 | **恰 1 红 = t6 新测试**（其余 10 绿）→ F-1 已锁 |
| A（回归抽验） | 去 `:38` 请求级门禁 | **3 红** = 原 2 条 F3 + t6 新测试（新测试兼具请求门禁判别力） |
| 复原 | 还原 src | 11/11 绿 |

零污染：实验前后源树 diff sha 均 `28494e487b3c22889b9cfcd607d463d74e6162c0d0f7604940fed12ec727cca3`；`/tmp/t7-mut` 已删除。

## 四、验收项 2：W1 无回归

- 测试面 `+91/-0` **纯增**：既有 10 条（含 t5 的 2 条 F3 + dist 锁）文本零改动，t6 只在 `:329` 后追加。
- 源面零触碰（§一 hunk 逐条比对 t5 记录相同）：epoch 双路守卫、N2 面（log-filter/空态 v-if）原样。
- 全量 `node --test` → **tests 426 / pass 426 / fail 0**（425+1 零回退）；`test/dist-browser-load.test.mjs` 4/4。

## 五、验收项 4：F1/F2 复核（未被 t6 触碰、对盘仍一致）

- F1 §四：`web/dist/panel.js` **110/95**、误抄源 `LogHistoryView.vue`=15/3 —— `git show --numstat e7a6ae7` 复测一致（t5 已实测，本轮 grep 确认文本未回退）。
- F2 §一：`LogHistoryView.vue:18-28`（e7a6ae7 态 `async function reload()`=18、闭括号=28）+ 行号基准说明 `:19` —— 一致。
- 发布物面：dist 字面 `epoch`=1、`loadOlderDisabled`=2、`当前时间区间为空`=1、`所选筛选条件下无日志条目`=1（报告「判据保持」声明复核通过）；文件未被 t6 改动。

## 六、观察（非阻断）：t6 报告改动的 scope 追认

t6 合同 In scope 未列 `reports/w1-epoch-guard-report.md`，但 t6 追加了 §八「F3 补锁」小节（`:164-187`）。**实质核验：该改动系 t5 F-1 requiredFix 明文要求（「报告 §八 补该测试输出原文」），内容与磁盘一致**（测试名/输出原文/11 测试/426 总数/+37 行数/333→370/源与 dist 零改动/字面判据 1/2/1/1 均复测通过）。建议队长在 ledger/dispatch-record 补一句 scope 追认即可，不构成质量问题。

## 七、本审执行命令与输出原文

```
① git diff --numstat -- wiki-steward/{web/src,web/dist,test}  → test +91/0；src +9/-1、+3/-0；dist +81/71（与 t5 同）
② git diff -- wiki-steward/web/src | sha256sum                → hunk 与 t5 记录逐条相同（零改动）
③ node --test（全量）                                          → ℹ tests 426 / pass 426 / fail 0
④ node --test test/dist-browser-load.test.mjs                 → ℹ tests 4 / pass 4 / fail 0
⑤ /tmp 变异 D（finally 去 epoch 条件）                        → fail 1 =「F3 门禁（时序探针同型）」
⑥ /tmp 变异 A（去请求级门禁）                                  → fail 3 = 2 条既有 F3 + t6 新测试
⑦ 复原重跑                                                    → 11/11 绿
⑧ dist 字面 grep                                              → 1/2/1/1
⑨ 报告 §一/§四/§八 对盘 grep                                   → 18-28、110/95、补锁小节均在且一致
⑩ 零污染：前后 sha 均 28494e48…cca3；/tmp/t7-mut 已删除
```

## 八、changedPaths（本复审）

- `wiki-steward/changes/2026-10-07-hindsight-sync/reports/f3-closeout-review-round2.md`（本报告，新建）

实现源码/测试零改动（复审只读 + /tmp 隔离实验）。
