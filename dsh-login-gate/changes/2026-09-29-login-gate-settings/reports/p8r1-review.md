# P8R1-review — 记录修正 vs 证据一致性复核（2026-09-30）

> 复核对象=P8R1-fix（AgentTeams t2）落点文件；口径=只读核对「修正文案 ↔ 磁盘证据」，不改被复核文件。证据源=SDD 正本 `.superpowers/sdd/tasks-2026-09-29-login-gate-settings/`、`wiki/reference/ERRORS.md`、changes/ 域各记录面。

## 判定：需修（needs_revision）

- **不臆造/不夸大核心面通过**：全部内容性断言（agent id、路径、测试计数、发现分级、门禁码）与磁盘证据逐一相符，未发现任何编造或夸大。
- **需修点=证据指针精度**：3 处「文件:行号」指针与实证位置漂移（1 medium / 2 low），恰属 R-19「每断言必须带证据指针（文件:行号）」机制的自身缺陷，建议一次性行号修正后收口（零内容改动）。

## 发现清单（severity 分级）

| id | severity | 问题 | 位置 | 须修正 |
|---|---|---|---|---|
| F-1 | medium | 「72/72（Task 14 fix 后）」证据指针引 SDD progress.md:**96**，但 :96 为「Task 14: complete」行、无测试计数；72/72 实证首现在 progress.md:**90**（Task 14 fix DONE 行「72/72 绿」）。同一误引出现在两文件 | [tester-report.md:14](../../tester-report.md#L14)、[completion-summary.md:32](../../completion-summary.md#L32) | 两处 `:96` → `:90` |
| F-2 | low | 「E2E a-f 全达成（task-14-report.md:35-49）」范围欠覆盖：a-f 六节实跨 task-14-report.md:**31-90**（c 端口保存 :55、d 参数回读 :65、e 账号 9/9 :69、f 401+零哈希 :85），:35-49 仅覆盖 a 行与 b 节开头 | [tester-report.md:13](../../tester-report.md#L13)、[completion-summary.md:32](../../completion-summary.md#L32) | 引用范围改 `:31-90`（或分段引 :31-40/:42-53/:55-68/:69-84/:85-90） |
| F-3 | low | 「handoff.md:12『待空档』」实为 handoff.md:**11**（:12 是 gh release 行），差一行 | [completion-summary.md:33](../../completion-summary.md#L33) | `handoff.md:12` → `handoff.md:11` |

## 五面核对明细

### ① conversation.md 派发实录：agent id / 路径逐条抽查 — **一致**

- 17 个 agent id 全部在 SDD progress.md 逐行对上：ef54885f(:32)、43b65533(:38)、7eb1991d(:43-44)、b5496eba(:47)、c845d53c(:58)、02e42ad6(:53-54)、0a802e97(:61,63)、42af8302(:70-71)、961a610d(:77-78)、42d29472(:84)、ab4542d8(:90)、e2059fcb(:94-95)、b6288a86(:97-98)、4b22113f(:101)、e9744368(:104)、779c90c3(:107)、fdfc62c0(:108)；「未留档」标注如实（Task 0.4/0.5、Task 12/13 implementer）。
- 路径全部实存：reports/scout-a-auth-timeout.md、reports/scout-b-settings-contract.md、SDD 正本 task-10/11/12/13/14/16-report.md + task-14-fix-report.md + cor2-rerun-report.md + review-final-branch.diff（214606 B≈215KB ✓）+ review-*.diff 14 个 ✓、review-report.md、互指页 reports/tester-report.md。
- skill 注入名逐卡对上 brief 的 skills 行：task-10/13=subagent-driven-development、task-12=frontend-ui-engineering、task-14=validate-changes-match-specs、task-16=dsh-plugin-ops ✓。
- 行号转录（:38/:44/:47-49/:54/:63/:71/:78/:95/:98/:104/:107/:108）抽查全准。

### ② tester-report.md 数字 vs 正本 — **数字全一致**（指针 2 处见 F-1/F-2）

- 四关 4/4（task-14-report.md:18-25 ✓ 精确覆盖四关表）；E2E a 6/6、b 渲染树 21/21、e 9/9、f 401+零哈希与正本逐项相符（:31/:42/:69/:85）。
- 测试节点 58/58（progress.md:67 ✓）→ 69/69（:76 ✓）→ 72/72（实 :90，见 F-1）；独立复跑 72/72（review-report.md:61 ✓）。
- 发现分级 F-1【high】/F-2【medium】/F-3【low】与 progress.md:85-86、task-14-report 正本相符；COR-2（ref 146022e 四关 4/4+E2E c/d C-5 级，progress.md:108 ✓）。

### ③ completion-summary 断言逐条有据 — **内容全部有据**（指针 3 处见 F-1/F-2/F-3）

- 门禁对账表 9 码逐一对上：init 76C9AC21/phase0 A3B09993/phase1 A9BD8113/phase2 96108180/phase3 B17429A9/phase4 E10AA468/phase5 D49FF8FE（ledger.md:8-15 ✓）、phase7 1E614144（progress.md:114 ✓）、phase6 382CE667（ledger「P8R1 收口」行 ✓）、phase8 无码如实 ⬜。
- INV-6◐：check-release+tag ✓（progress.md:110）、gh release 未执行（:112 ✓）、生产同步 DONE（:117-118 ✓）；终审词面 US-6✓ INV-6◐（:98 ✓）。
- 质量链 12=5+5+1+1 逐行计数与 progress.md:38/:54/:71/:78/:104 + :44/:47/:63/:95/:107 + :98 + :108 全部对上（diagnostic 5.2「任务级×7 数不齐」已修正）。
- review-report.md 引用面实存：「Completeness」US-1~6 逐条达成(:6-8)、「Security」防自锁三源(:26-29)、「Consistency」(:14)、:61 终审结论 PASS ✓；review-*.diff 14 个 ✓；「Phase 0-8 门禁全过」超证据措辞已删除改对账表(:21) ✓。

### ④ ERRORS.md 两条教训 — **入库且语义准确**

- [2026-09-30] 收口声明超证据（R-19）与 [2026-09-30] 派发路径未裁定即换道（R-20）两条均在 wiki/reference/ERRORS.md（:242-257），Error/Lesson/修正措施/状态四要素齐，语义与 ledger R-19/R-20 及 diagnostic 一致，无夸大无走样。
- 注：t2 报文「registry 无 pending」中所称 registry 文件本轮未定位到（vault 无 *registry* 命中），该子项未取证——不影响「两条已入库」本体判定。

### ⑤ 「Phase 0-8」类措辞 — **已清除/已改对账**

- 全域 grep 复核：余留「Phase 0-8 / 全过」8 处均为合法语境——diagnostic/task-fix 引述（批评对象）、completion-summary:21 明确标注为超证据措辞并被对账表取代、ledger R-19 症状与教训记录、review-report.md:28「全过」指 INV-3 测试面非门禁码。**无任何活断言仍声称门禁全过** ✓。

## 结论

内容面（不臆造、不夸大）**通过**；指针面 3 处行号/范围漂移（F-1 medium、F-2/F-3 low）需一次行号级修正。修正量≈3 行，零内容改动；修后本复核可直接转 PASS（复跑本清单 F-1~F-3 三处即可）。
