# p8r1-diagnostic — 归档记录 vs 实际执行差异审计（只读诊断）

> 变更：changes/2026-09-29-login-gate-settings/｜2026-09-30｜P8R1 Round 1 链路第 1 环（diagnostic）
> 范围：只读对照磁盘证据，逐项列差异（症状+文件路径+证据行号）；不含根因分析、不修改文件。
> 检索面：`dsh-login-gate/changes/2026-09-29-login-gate-settings/`、`.superpowers/sdd/tasks-2026-09-29-login-gate-settings/`、`/root/.hermes/gate-state/`、clsh 门禁脚本 `/root/.hermes/skills/productivity/clsh-project/scripts/`、git log/tag 面。

## 差异清单

### 面 1：门禁留档（声称过 vs 实有码）

| 项 | 声称 | 证据 | 判定 |
|---|---|---|---|
| 1.1 门禁覆盖面 | 发版收口消息「Phase 0-8 门禁全过」（转录于 [ledger.md:70](../ledger.md#L70)、[ledger.md:75](../ledger.md#L75) R-19） | 实有码 8 个：init 76C9AC21 [ledger.md:8](../ledger.md#L8)、phase0 A3B09993 [:9](../ledger.md#L9)、phase1 A9BD8113 [:10](../ledger.md#L10)、phase2 96108180 [:11](../ledger.md#L11)、phase3 B17429A9 [:13](../ledger.md#L13)、phase4 E10AA468 [:14](../ledger.md#L14)、phase5 D49FF8FE [:15](../ledger.md#L15)、phase7 1E614144 [SDD progress.md:114](../../../../.superpowers/sdd/tasks-2026-09-29-login-gate-settings/progress.md#L114)；gate-phase6 无码、2026-09-30 补跑 FAIL（6 项）[ledger.md:69](../ledger.md#L69)；gate-phase8 无码无运行记录 [ledger.md:68](../ledger.md#L68) | **差异**：声称 9 面全过 vs 实有码 8 个，缺 phase6/phase8 |
| 1.2 phase7 码留档位 | ledger 阶段账为单一交叉台账（[SDD progress.md:3](../../../../.superpowers/sdd/tasks-2026-09-29-login-gate-settings/progress.md#L3)） | 1E614144 仅出现在 [SDD progress.md:114](../../../../.superpowers/sdd/tasks-2026-09-29-login-gate-settings/progress.md#L114)；changes/ 域 grep 该码零命中（全 8-hex 检索仅命中 ledger.md 7 个码） | **差异**：phase7 码在 changes/ 面无留档，码留档面分两处 |
| 1.3 tasks.md 复选框 vs ledger 状态 | ledger.md:8-15 各阶段 ✅ 附码 | tasks.md 中 gate-phase1~5 复选框为 `[ ]`（[tasks.md:123](../tasks.md#L123)、[:138](../tasks.md#L138)、[:166](../tasks.md#L166)、[:179](../tasks.md#L179)、[:193](../tasks.md#L193)）；gate-phase6/7 `[ ]`（[tasks.md:209](../tasks.md#L209)）vs progress.md:114 gate-phase7 码 ✅ | **差异**：同一事实在两账面状态相反（勾选面落后） |
| 1.4 门禁机制侧 marker | 确认码两步流程随 marker 落盘（[gate_utils.py:54](../../../../../../root/.hermes/skills/productivity/clsh-project/scripts/gate_utils.py) generate_code + marker 管理节） | 默认标记位 `~/.hermes/gate-state/<slug>/`（gate_utils.py `_get_slug`+`_gate_state_dir`）现盘无本项目任一 slug 目录（候选 slug 377a13dbeffca129/492256a349c662b9/88f8d6fcfd49e86c 均无对应目录）；该目录最新 mtime=Sep 18，无 2026-09-29/30 记录 | **缺口**：8 码在默认 marker 位查无对应留档文件（限现盘默认位面；当时若 GATE_DIR 另有指向则不在本审计面） |
| 1.5 码形制 | — | 留档码=8 位大写 hex，与 clsh gate_utils.generate_code 出码形制一致（gate_utils.py:54-62 `digest[:8].upper()`） | 相符 |

### 面 2：派发记录（委派实况 vs 可寻回写）

| 项 | 声称 | 证据 | 判定 |
|---|---|---|---|
| 2.1 派发路径口径 | dispatch-record.md:3-4「派发标识：DSH 会话内 subagent 委派」+「实际执行面 = PATH A 通用 `subagent` 行」 | changes/ 与 SDD 面 grep「AgentTeams/PATH C」零命中（除 [ledger.md:59](../ledger.md#L59) P8R1 新增行）；[ledger.md:66](../ledger.md#L66) 自记「PATH C 的取舍无裁定行」 | **差异**：用户反映①落盘面属实——PATH C 无裁定行、无任何留档（对照 dispatch-record.md 仅记具名→通用处置） |
| 2.2 dispatch-record 状态列 | 表列 Task 10「🔄 running (agent ef54885f)」、Task 11-15「⬜」 | SDD progress.md:34-114 记 Task 10-16 全部 complete（终态 21:45，[progress.md:114](../../../../.superpowers/sdd/tasks-2026-09-29-login-gate-settings/progress.md#L114) 后另有 Task 8 生产同步 DONE） | **差异**：派发台账状态列停在中途态，与实际执行终态不一致 |
| 2.3 dispatch-record 产出列 | 表列产出仅 scout-a/scout-b 两行有值，Task 10 记「task-10-report.md（待）」，Task 11-15 产出列空 | 实际报告实有：`task-10/11/12/13/14/16-report.md`、`task-14-fix-report.md`、`cor2-rerun-report.md`（均在 SDD workspace） | **差异**：产出路径未回填 |
| 2.4 派发证据可寻回面（conversation.md） | gate-phase6 检查面=conversation.md 须含 delegate_task/kanban 派发记录（gate-phase6.py:138-156） | [conversation.md](../conversation.md) 全文=Phase 1 六轮问答+范围定稿+阶段过渡授权，无 delegate_task/subagent/agent id 字样；agent id（ef54885f/43b65533/02e42ad6/42af8302/961a610d/42d29472/ab4542d8/e2059fcb/b6288a86/4b22113f/e9744368/779c90c3/fdfc62c0 等）逐行在 [SDD progress.md](../../../../.superpowers/sdd/tasks-2026-09-29-login-gate-settings/progress.md) 与 dispatch-record.md:8；tasks.md:4 仅一句「派发标识：DSH 会话（subagent 委派，见 dispatch-record.md）」 | **差异**：派发事实存在于 dispatch-record/SDD 面，conversation.md 面缺失（补跑 FAIL 项之一「conversation.md 缺派发证据」[ledger.md:69](../ledger.md#L69) 与此对照成立） |
| 2.5 skill 注入证据 | gate-phase6 检查面=conversation.md 须含 skill 注入记录（gate-phase6.py:172-183） | skills 字样在 [tasks.md:200](../tasks.md#L200)、[:317](../tasks.md#L317)、[:330](../tasks.md#L330)（Task 7/15/16 role/skills 行）；conversation.md 无 | **差异**：同 2.4 错位，skill 注入记录在 tasks.md 面 |
| 2.6 Level B 委派证据 | gate-phase6 检查面=conversation.md 须含 `delegate_task`（gate-phase6.py:201-228） | 全盘 grep `delegate_task` 在 changes/ 与 SDD 面零命中；委派动作记载用词为「subagent」「dispatched」 | **差异**：字面零命中（补跑 FAIL 项之一，与脚本正则口径一致） |

### 面 3：tester 证据（实际位置 vs gate 查找位置）

| 项 | 声称 | 证据 | 判定 |
|---|---|---|---|
| 3.1 tester 证据实体 | task-14 报告=四关 4/4+E2E a-f（[progress.md](../../../../.superpowers/sdd/tasks-2026-09-29-login-gate-settings/progress.md) Task 14 行） | 正本 [task-14-report.md:18-25](../../../../.superpowers/sdd/tasks-2026-09-29-login-gate-settings/task-14-report.md#L18-L25)（四关表）+ [:35-49](../../../../.superpowers/sdd/tasks-2026-09-29-login-gate-settings/task-14-report.md#L35-L49)（E2E）+ [cor2-rerun-report.md](../../../../.superpowers/sdd/tasks-2026-09-29-login-gate-settings/cor2-rerun-report.md)（尖端补跑 C-5 级） | 相符（证据实体存在） |
| 3.2 tester 报告落位 vs gate 查找位 | gate-phase6 在 `changes/<变更>/{tester-report,test-report,test-results,testing-report,report}.md` 或项目根查找（gate-phase6.py REPORT_FILENAMES + find_file_in_changes 一层深度，gate_utils.py「changes/*/ + project root」） | 实际落位：`changes/<变更>/reports/tester-report.md`（指针页，[reports/tester-report.md:3](./tester-report.md#L3) 互指约定）+ SDD workspace 正本；`changes/<变更>/tester-report.md`（一层位）不存在 | **差异**：查找位与落位差一层（补跑记「缺 tester-report.md」[ledger.md:69](../ledger.md#L69) 与此对照成立） |
| 3.3 review-package 落盘件名 | tasks.md:208、[:325](../tasks.md#L325) 验收要求「tester-report.md + review-package.md 落盘」 | `review-package.md` 全盘不存在；实有形制=`review-*.diff` 14 个（SDD workspace，含 review-final-branch.diff 215KB） | **差异**：验收件名与实有产物名不一致 |

### 面 4：协调者复核（判定记录 vs gate 可见面）

| 项 | 声称 | 证据 | 判定 |
|---|---|---|---|
| 4.1 任务级审查判定 | completion-summary.md:9「12 轮 SDD 审查环」；tasks.md:323「SDD 任务级审查已随环执行」 | 判定行全在 SDD progress.md（Spec/Quality 双判定 5 行：[progress.md:38](../../../../.superpowers/sdd/tasks-2026-09-29-login-gate-settings/progress.md#L38) T10、:54 T11、:71 T12、:78 T13、:104 T16；re-review 5 行：:44、:63、:95、:107 + T10 r2 派发 :47）；changes/ 域 conversation.md 无任何审查/复核字样 | **差异**：复核事实存在于 SDD 面，gate 可见面（conversation.md）缺失——补跑记「缺协调者复核证据」[ledger.md:69](../ledger.md#L69) 与此对照成立 |
| 4.2 终审判定 | completion-summary.md:9「整分支终审 PASS（0 blocker/high）」 | [review-report.md:61](../review-report.md#L61)「终审结论：PASS」+ [progress.md:98](../../../../.superpowers/sdd/tasks-2026-09-29-login-gate-settings/progress.md#L98)（agent b6288a86，0 blocker/high） | 相符（终审判定在 changes/ 面可寻回） |
| 4.3 ledger plan 身份头 | gate-phase6 检查面=ledger.md 结构（gate-phase6.py:416-423） | 补跑 FAIL 项「ledger 缺 plan 身份头」[ledger.md:69](../ledger.md#L69)；[ledger.md:1-6](../ledger.md#L1-L6) 现头为标题+变更行，SDD progress.md:1 带 `plan: ...tasks.md` 身份行 | **差异**：ledger.md 面无 plan 身份行（与 SDD progress.md 头不同形） |

### 面 5：completion-summary 断言逐条对证据

| 项 | 声称（completion-summary.md） | 证据 | 判定 |
|---|---|---|---|
| 5.1 | :7「US-1~6 / INV-1~7 全数达成」 | [review-report.md:16](../review-report.md#L16) 一致性表列 INV-1/2/3/4/5/7 ✓、**表内无 INV-6 行**；[progress.md:98](../../../../.superpowers/sdd/tasks-2026-09-29-login-gate-settings/progress.md#L98) 终审记「US-6✓ INV-6◐」（INV-6=发版门禁六件套，[PRODUCT.md:28](../PRODUCT.md#L28)） | **差异**：「全数达成」词面 vs INV-6◐（部分达成）记号 |
| 5.2 | :9「12 轮 SDD 审查环（任务级×7 + scoped re-review×5）」 | progress.md 逐行：任务级 Spec/Quality 判定 5 行（T10/T11/T12/T13/T16）+ scoped re-review 派发 5 次（T10 r1/r2、T11 r1、T14-fix r1、T16 微复核）+ 终审 1 + COR-2 补跑 1；「任务级×7」在 progress.md 逐行计数不齐 7 条判定行 | **差异**：轮次切分口径与逐行计数不完全对得上（总数 11-12 条审查类记录近似） |
| 5.3 | :10「`node --test` 72/72 绿…独立复跑实证」 | [progress.md:96](../../../../.superpowers/sdd/tasks-2026-09-29-login-gate-settings/progress.md#L96)（T14 fix 后 72/72）、[review-report.md:61](../review-report.md#L61)（独立复跑 72/72） | 相符 |
| 5.4 | :13「release 提交 8f9847e，check-release PASS，tag `dsh-login-gate-v0.3.0` 已推 GitHub——ls-remote 实证」 | git log 8f9847e `release: dsh-login-gate 0.3.0` 在档；`git ls-remote` tag→8f9847e58cc87ed8bdcf1f42987928f6a1612d37；[progress.md:112](../../../../.superpowers/sdd/tasks-2026-09-29-login-gate-settings/progress.md#L112) check-release PASS | 相符 |
| 5.5 | :13「gh release 未执行（用户未选）；生产同步待用户空档」+ [handoff.md:12](../handoff.md#L12) | 远端无 release 记录面主张未查反例；[progress.md:117-118](../../../../.superpowers/sdd/tasks-2026-09-29-login-gate-settings/progress.md#L117)（生产同步 2026-09-30 00:2x DONE） | 部分相符：「生产同步待用户空档」为归档时点态，progress.md 事后已记 DONE，completion-summary 未同步 |
| 5.6 | :15「过程资产：…tester 报告群全在档」 | tester 正本在 `.superpowers/sdd/…/`（changes/ 域外）；changes/ 域内仅 `reports/tester-report.md` 指针页；dispatch-record 产出列空缺（见 2.3） | 部分相符：资产实有，部分不在归档查找面 |
| 5.7 | :3 状态行「完成：2026-09-29｜代码+测试+文档+发版 tag 全部完成」 | [ledger.md:17](../ledger.md#L17)「Phase 7/8: ⬜ pending」（现盘未更新）vs [progress.md:114](../../../../.superpowers/sdd/tasks-2026-09-29-login-gate-settings/progress.md#L114) Phase 7 归档 22:58 完成 + gate-phase7 码 | **差异**：ledger 阶段状态行与归档事实/总结状态行脱节 |
| 5.8 | 全文无 Phase 8 段（用户反映②「归档总结好似没有进入 Phase 8」） | completion-summary.md 现盘无 Phase 8 节；[ledger.md:55-59](../ledger.md#L55-L59) Phase 8 节为 2026-09-30 P8R1 后补（含 OL-5 锚定声明） | **属实**：归档时点 Phase 8 未入总结；现盘 ledger 已有后补记录 |
| 5.9 | :17「R-1~R-18」裁定清单 | ledger.md 现有 R-1~R-18 + R-19（[ledger.md:75](../ledger.md#L75)，P8R1 新增） | 相符（R-19 属归档后新增，不计归档时点口径） |

## 汇总

- 共对照 26 项：差异 16 项、缺口 1 项（1.4 marker 位）、部分相符 2 项、相符 6 项、用户反映属实 1 项（5.8）。
- 差异聚类（现象层面）：①门禁码声称面 9 vs 留档面 8（缺 phase6/phase8；phase7 码留档位在 SDD 面）②派发/复核/skill 注入事实集中于 SDD workspace 与 dispatch-record，conversation.md/tasks.md 可见面缺失或仅一语 ③tester 证据落位与 gate 一层查找位差一层 ④completion-summary 词面（全数达成/12 轮切分/生产同步态）与逐行证据存在口径差。
- 只读约束遵守：本报告为本任务唯一写入；其余文件零改动。

（P8R1-diagnostic 完；后续环 P8R1-fix / P8R1-review 见 tasks/task-P8R1-fix.md、tasks/task-P8R1-review.md）
