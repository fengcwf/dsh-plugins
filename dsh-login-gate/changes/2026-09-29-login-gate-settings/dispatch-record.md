# dispatch-record — 派发台账

> 变更：changes/2026-09-29-login-gate-settings/｜2026-09-29｜派发标识：DSH 会话内 subagent 委派
> 运行时证据：具名委派行（subagent_scout 等）在本运行时被拒——`subagent depth 1 exceeds maxDepth 0`（实测 2 次）；**实际执行面 = PATH A 通用 `subagent` 行**（可用，实测），角色契约内联 prompt。角色隔离声明：通用行无人格/toolFilter 隔离，仅契约+证据字段强制（如实声明，不冒充 PATH A 具名行）。
> 派发路径裁定（P8R1 补记）：具名行→通用行换道=R-2；**PATH C（AgentTeams）当时未评估未裁定即换道=R-20**（2026-09-30 起本项目余下派发改走 AgentTeams 具名队 dsh-login-gate-0-3-0-phase8）。委派链详录（agent id/模型钉点 R-8/skill 注入）= conversation.md「Phase 6 派发实录」。
> 状态列/产出列于 2026-09-30 P8R1 回填至执行终态（原表停在 Task 10 running/11-15 空白，与实际不一致——diagnostic 2.2/2.3）。

| 卡 | 委派 | 模型=provider/model | 状态 | 产出 |
|---|---|---|---|---|
| Task 0.4 需求②认证/超时分析 | subagent（scout 契约内联，只读） | 模型=继承会话默认（mimo-v2.6-pro 路由；通用行无 model 钉点） | ✅ | reports/scout-a-auth-timeout.md |
| Task 0.5 需求①③设置机制/优化空间分析 | subagent（scout 契约内联，只读） | 模型=继承会话默认（同上） | ✅ | reports/scout-b-settings-contract.md |
| Task 10 users.js 模块 + 2 轮修复环 | subagent（SDD implementer 契约内联，agent ef54885f，fix 轮 resume 同卡） | 模型=继承会话默认（R-8：通用行无 model 参数，卡住升档=带说明 re-dispatch） | ✅ complete 13:52（review clean after 2 fix rounds） | .superpowers/sdd/…/task-10-report.md（commits 7b47c7c..f2b5d25） |
| Task 10 任务级审查 + scoped re-review×2 | subagent（reviewer 契约，agent 43b65533 / 7eb1991d / b5496eba） | 同上 | ✅（Spec ❌→2 轮收口） | SDD progress.md:38-49 判定行 |
| Task 11 设置面服务端 | subagent（SDD implementer，T10 完成后派；原实现者 id 经 fix resume 行留档=c845d53c） | 同上 | ✅ complete 16:07（1 轮修复环 F1-F9） | .superpowers/sdd/…/task-11-report.md（commits e8fcf9f..6a9fb26） |
| Task 11 任务级审查 + scoped re-review | subagent（reviewer 契约，agent 02e42ad6 / 0a802e97） | 同上 | ✅ | SDD progress.md:54-66 判定行 |
| Task 12 设置栏目 UI | subagent（artist 契约，agent id 未留档） | 同上 | ✅ complete 16:49（Spec 5/5 + Approved） | .superpowers/sdd/…/task-12-report.md（commit 4ff757b） |
| Task 12 任务级审查 | subagent（reviewer 契约，agent 42af8302） | 同上 | ✅ | SDD progress.md:71-74 判定行 |
| Task 13 测试补全 | subagent（SDD implementer，agent id 未留档） | 同上 | ✅ complete 17:32（69/69 绿） | .superpowers/sdd/…/task-13-report.md（commit 6285a15） |
| Task 13 任务级审查 | subagent（reviewer 契约，agent 961a610d） | 同上 | ✅ | SDD progress.md:78-81 判定行 |
| Task 14 测试环境验证 | subagent（tester 契约，agent 42d29472） | 同上 | ✅ DONE_WITH_CONCERNS 18:10（四关 4/4 + E2E a-f；F-1【high】→R-16） | .superpowers/sdd/…/task-14-report.md |
| Task 14 fix 波（F-1/R-16 + F-2 + R-17 文档） | subagent（implementer 契约，agent ab4542d8） | 同上 | ✅ 20:33（1a2a3a9+2613abe，72/72 绿） | .superpowers/sdd/…/task-14-fix-report.md |
| Task 14 fix scoped re-review | subagent（reviewer 契约，agent e2059fcb） | 同上 | ✅ 20:48（全 ADDRESSED） | SDD progress.md:95 判定行 |
| Task 15 整分支终审 | subagent（reviewer 契约，agent b6288a86，code-review-and-quality 五轴） | 同上 | ✅ PASS 21:04（0 blocker/high，独立复跑 72/72） | review-report.md + .superpowers/sdd/…/review-final-branch.diff |
| Task 16 文档与分析交付归档 | subagent（implementer 契约，agent 4b22113f） | 同上 | ✅ 21:45（146022e+0a0bfe1） | .superpowers/sdd/…/task-16-report.md |
| Task 16 任务级审查 + 微复核 | subagent（reviewer 契约，agent e9744368 / 779c90c3） | 同上 | ✅ | SDD progress.md:104-107 判定行 |
| COR-2 尖端补跑（发版门禁） | subagent（tester 契约，agent fdfc62c0） | 同上 | ✅ 21:45（四关 4/4 + E2E c/d C-5 级） | .superpowers/sdd/…/cor2-rerun-report.md |
| Task 8 发版五步 + 生产同步 | 协调者直做（无委派；tag/push 逐次用户确认） | — | ✅（生产同步 DONE 2026-09-30 00:2x 三重验证） | SDD progress.md:110-118 |

## SDD 环纪律（Phase 6）

- workspace=`.superpowers/sdd/tasks-2026-09-29-login-gate-settings/`（brief/report/progress 均在该目录）；BASE=0e02517
- 每卡 fresh implementer + 任务级审查（spec+质量双判定）+ ≤5 轮修复环（4-5 轮升档）+ 整分支终审（code-review-and-quality）
- 禁并行实现者；禁实现者自派 reviewer；控制器不代修 finding
- git 卫生：只 add dsh-login-gate/ 自有文件（树上有他会话 73 项未提交改动）

## 证据与抽查

- scout-a 关键常量协调者抽查复核：`lib/index.js:30`（sessionDays=30）、`lib/dsh-session.js:24`（TTL_MS=6h）、`lib/gate.js:73`（Max-Age）一致。
- 生产实况核查（协调者只读）：`/root/.dsh/profiles/web/cordis.patch.yml:22,25` = port 3500 / sessionDays 30。
- 回证要求（model-routing）：会话 `record.rows.modelSelection.lastUsed` 未单独回证（通用行继承会话默认）——记缺口，后续卡如需钉模型走 PATH B/C。

## 遗留 NEEDS_HUMAN / NEEDS_CONTEXT

1. NEEDS_HUMAN：Lucky 外网反代（家宽侧设备）改端口联动需人工同步（scout-b §五）。
2. NEEDS_CONTEXT（实测项）：configEditor Loader reconcile 是否重跑 login-gate apply——端口项按"重启生效"硬标处理（保守裁定）。
3. NEEDS_CONTEXT：kb-context 设置面 UX 波（T9-*）未执行——login-gate 设置页 UI 形制待其 brief 对齐，避免第三种形制分叉（Phase 2 议题）。
