# P8R1-diagnostic — 归档记录 vs 实际执行差异审计（只读诊断）

## 任务
对照磁盘证据逐项审计 Phase 6/7/8 账面与实际执行的差异，产出差异清单（症状+文件路径+证据行号），不修改任何文件、不做根因分析。

## 审计面（已知起点，需扩全）
1. 门禁留档面：grep `changes/2026-09-29-login-gate-settings/` 与 `.superpowers/sdd/tasks-2026-09-29-login-gate-settings/` 内全部 gate 确认码记录，列出"声称过"vs"实有码"的差集。
2. 派发记录面：dispatch-record.md / SDD progress.md / 各 task-N-report.md 的委派实况（agent id、brief、report 路径）是否在 conversation.md/tasks.md 有可寻回写。
3. tester 证据面：tester 报告实际位置（SDD workspace task-14-report.md / cor2-rerun-report.md / reports/tester-report.md 指针）vs gate-phase6 查找位置（changes/<变更>/tester-report.md 等）。
4. 协调者复核面：任务级审查/终审的判定记录是否出现在 gate 可见文件。
5. 归档总结面：completion-summary.md 各断言逐条对证据打勾/打叉。

## 产出
`changes/2026-09-29-login-gate-settings/reports/p8r1-diagnostic.md`（差异清单表：项/声称/证据/判定），返回值给结论与路径。

## 约束
只读；不改文件；措辞用现象记录（避免"根因/问题在于/因为…导致"句式）；不派子代理。
