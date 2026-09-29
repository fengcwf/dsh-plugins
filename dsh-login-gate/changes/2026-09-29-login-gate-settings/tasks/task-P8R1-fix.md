# P8R1-fix — 归档记录收口（gate-phase6 证据组织 + 总结修正 + 教训分流）

## 任务
按 diagnostic 差异清单修正记录，使 gate 可见面与实际执行一致。**只改记录文件，零代码改动**。

## 收口清单
1. conversation.md 追加「Phase 6 派发实录」：真实委派链（agent id、brief/report 路径、模型钉点 R-8 口径、skill 注入=各卡所载 skill 名）与「协调者复核实录」（任务级审查×N+终审 PASS 判定、review-report.md 指向）——如实转录，禁编造。
2. `changes/2026-09-29-login-gate-settings/tester-report.md`：汇总真实 tester 证据（task-14-report 四关 4/4+E2E a-f、cor2-rerun 尖端补跑、58/69/72 测试节点）+ 指向 SDD workspace 正本。
3. completion-summary.md 修正：删/改「Phase 0-8 门禁全过」类措辞为对账表（gate init/0/1/2/3/4/5/7 有码、6/8 补跑状态如实）；补派发路径事实（具名行运行时拒绝→通用行；PATH C 未评估→R-20）。
4. 教训分流（经 scripts/vault-write.py 落 wiki/reference/ERRORS.md，读全文拼接后写回）：①收口声明超证据（对账确认码清单制度）②派发路径未裁定即换道。
5. tasks.md 回写派发卡 id（P8R1 三卡）。

## 验收
- [ ] gate-phase6 重跑 PASS（或剩余项逐条有裁定行）
- [ ] completion-summary 每断言有证据指针
- [ ] ERRORS.md 两条落库且 registry 无 pending
- [ ] 全程零 lib/ 代码改动（git diff 自证）

## 约束
只改记录文件；git 卫生=只 add 实改文件；措辞现象化；不派子代理。
