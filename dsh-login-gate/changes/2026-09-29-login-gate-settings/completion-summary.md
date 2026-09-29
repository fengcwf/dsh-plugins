# completion-summary — dsh-login-gate 设置面与认证优化（完成总结）

> 变更：changes/2026-09-29-login-gate-settings/｜完成：2026-09-29｜状态：代码+测试+文档+发版 tag 全部完成；生产同步 **DONE**（2026-09-30 00:2x，换 tag v0.3.0 安装三重验证，重启由用户自执行——SDD progress.md:117-118）
> 2026-09-30 P8R1 记录收口：本文件逐断言补证据指针；措辞与证据对账（R-19）。差异来源=reports/p8r1-diagnostic.md。

## 门禁对账表（记录类声明唯一依据=确认码清单；对账 2026-09-30 P8R1，R-19）

| 门禁 | 确认码 | 留档位 | 状态 |
|---|---|---|---|
| init | 76C9AC21 | ledger.md:8 | ✅ |
| phase0 | A3B09993 | ledger.md:9 | ✅ |
| phase1 | A9BD8113 | ledger.md:10 | ✅ |
| phase2 | 96108180 | ledger.md:11 | ✅ |
| phase3 | B17429A9 | ledger.md:13 | ✅ |
| phase4 | E10AA468 | ledger.md:14 | ✅ |
| phase5 | D49FF8FE | ledger.md:15 | ✅ |
| phase6 | 382CE667 | ledger.md「P8R1 收口」行（2026-09-30 重跑 PASS + marker 落盘 `~/.hermes/gate-state/377a13dbeffca129/phase6.json`） | ✅ P8R1 补跑 |
| phase7 | 1E614144 | ledger.md 阶段进度 Phase 7 行（原留档位=SDD progress.md:114，P8R1 补记入 changes/ 面） | ✅ |
| phase8 | 无码 | — | ⬜ 未运行（gate-phase8 无运行记录，如实；待 Phase 8 循环收口时跑） |

对账结论：归档时点实有码 8 个（缺 phase6/phase8）；P8R1 补跑 phase6 后实有码 9 个。**「Phase 0-8 门禁全过」为超证据措辞**（R-19 收口消息词面 vs 实有码，见 reports/p8r1-diagnostic.md 面 1.1）；本表以码为唯一依据，缺码即缺证据。

## 完成摘要（summary / completion；每断言附证据指针）

- **交付**（对照 PRODUCT.md US-1~6 / INV-1~7）：
  1. US-1~3 dsh 设置菜单新增「dsh-login-gate」栏目（settings.section）：端口维护（可改默认 3500+占用预检+断连警示确认条+联动清单四行）、参数区（5 可改 3 只读）、超时说明段（N 天免登录动态）——达成（review-report.md「Completeness」US-1~6 逐条达成）。
  2. US-4 账号增删改密（scrypt 服务端生成/usersFile 原子写/防自锁）——达成（review-report.md「Security」防自锁三源+原子写 0600+rename）。
  3. US-5 用户问题②答案：登录会话**固定 30 天**（sessionDays 可配 1~3650）、无滑动续期、到期 302 重登（reports/scout-a-auth-timeout.md 全证据链）。
  4. US-6 用户问题③答案：优化空间分析 + P2 候选六项留档（phase0-research.md §五 + README Roadmap）。
  5. 不变量：INV-1/2/3/4/5/7 ✓（review-report.md「Consistency」一致性表逐项）；**INV-6◐ 部分达成**（发版门禁六件套：check-release PASS + tag 已推 ✓（SDD progress.md:110）、gh release 未执行（用户未选，:112）、生产同步 ✓（:117-118）；终审判定词面=US-6✓ INV-6◐，:98）。**非「全数达成」**（P8R1 校正，diagnostic 5.1）。
- **质量链**（计数口径按 SDD 正本逐行，P8R1 校正 diagnostic 5.2）：审查类记录 12 条 = 任务级 Spec/Quality 判定 5（T10/T11/T12/T13/T16：SDD progress.md:38/:54/:71/:78/:104）+ scoped re-review 5（T10 r1/r2、T11 r1、T14-fix r1、T16 微复核：:44/:47/:63/:95/:107）+ 整分支终审 1（:98）+ COR-2 尖端补跑复核 1（:108）；终审 **PASS**（0 blocker/high，review-report.md:61）。
- **测试**：`node --test` 72/72 绿（认证回归 6/跨面契约对账/原子写/设置面）——Task 14 fix 后（SDD progress.md:90）+ 独立复跑（review-report.md:61）双证；测试节点 58/58→69/69→72/72（:67/:76/:90）；测试环境实测双轮=Task 14 四关 4/4+E2E a-f（task-14-report.md:18-25,:31-90）+ COR-2 尖端补跑 C-5 级（cor2-rerun-report.md）。证据汇总=本变更根一层 tester-report.md（gate 查找位，P8R1 补）。
- **发版**：0.3.0（release 提交 8f9847e，check-release PASS，tag `dsh-login-gate-v0.3.0` 已推 GitHub——ls-remote 实证，SDD progress.md:110）；gh release 未执行（用户未选，:112）；生产同步 **DONE**（2026-09-30 00:2x 三重验证：spec/node_modules 版本 0.3.0 + client export + dump-config 含 login-gate 层；:117-118。handoff.md:11「待空档」为归档时点态，以此处为准——diagnostic 5.5）。
- **派发路径事实**（P8R1 补记；用户反映①对账，diagnostic 面 2）：Phase 6 全部派发经 PATH A 通用 `subagent` 行——具名行 subagent_* 运行时被拒（`subagent depth 1 exceeds maxDepth 0`，实测 2 次）后换道（R-2，dispatch-record.md:3-4）；**PATH C（AgentTeams）当时未评估未裁定即换道**（R-20；自 P8R1 起余下派发改走 AgentTeams 具名队 dsh-login-gate-0-3-0-phase8）。真实委派链（agent id / brief-report 路径 / 模型钉点 R-8 口径 / skill 注入）与协调者复核实录见 conversation.md「Phase 6 派发实录」（P8R1 补）。
- **过程资产**：conversation/tasks/ledger/dispatch-record/phase0-research/TECH/PRODUCT/constitution/proposal/review-report 全在档（changes/ 域）；tester 证据正本在 `.superpowers/sdd/tasks-2026-09-29-login-gate-settings/`（task-10/11/12/13/14/16-report.md、task-14-fix-report.md、cor2-rerun-report.md），changes/ 域汇总/指针页=根一层 tester-report.md + reports/tester-report.md；审查包实产形制=review-*.diff 14 个 + review-report.md（无 review-package.md 文件名——diagnostic 3.3 名实差，P8R1 注记，tasks.md 验收行同步注记）。

## 关键裁定（详见 ledger.md / SDD progress.md）

R-1~R-18：门禁码两步呈现（R-1）、执行路径实测与换道（R-2）、A 案即时生效语义（R-16 用户裁定）、共享仓插提交隔离（R-9×4）、归档布局（R-18）等。R-19（收口声明对账制度）/ R-20（派发路径必留裁定行）为 P8R1 新增。

## Phase 8（P8R1 记录收口，2026-09-30；用户反映②对账）

归档时点本总结无 Phase 8 段属实（diagnostic 5.8，用户反映②成立）；现补记本循环：

- 反馈=归档记录与实际执行不一致（确认/流程类）；链路 diagnostic→fix→review；brief=tasks/task-P8R1-{diagnostic,fix,review}.md。
- 诊断（AgentTeams t1）：reports/p8r1-diagnostic.md——26 项断言=差异 16+缺口 1+部分相符 2+相符 6+用户反映属实 1。
- 修复（AgentTeams t2，本文件）：门禁对账表+逐断言证据指针、conversation.md 派发实录+协调者复核实录、tester-report.md 汇总页、dispatch-record/tasks/ledger 状态同步、ERRORS.md 两条教训落库（vault-write.py，registry 无 pending）；gate-phase6 重跑 **PASS**（码 382CE667，marker 已落盘）；全程零 lib/ 代码改动（git diff 自证）。
- 复核（AgentTeams t3，待执行）：一致性复核结论以任务面/审查留档为准。
