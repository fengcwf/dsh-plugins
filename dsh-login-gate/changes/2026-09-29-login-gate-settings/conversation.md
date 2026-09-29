# conversation — dsh-login-gate 设置面与认证优化

> 变更：changes/2026-09-29-login-gate-settings/｜2026-09-29｜磁盘=唯一真源
> 说明：Phase 1 澄清经 DSH ask_user_question 逐问进行；本文件为忠实转录（用户发言原样记录，不增不改；问号统一半角、维度标签为元数据补记）。

## 用户原始需求（2026-09-29 10:57）

用户: dsh-login-gate优化，在dsh设置菜单增加栏目 1.可端口维护，默认3500 2.分析现在登录的超时认证是多久，多久后需要重新登录 3.分析是否有优化空间和更多可设置功能

## 探索证据（Phase 1 Round 1-3 探索面）

- Phase 0 侦察（grep + 代码调研）：scout-a 认证/超时机制调研报告（reports/scout-a-auth-timeout.md，含 grep sessionDays/TTL_MS/Max-Age 全量字面量）；scout-b 设置栏目机制调研 + 竞品先例调研（kb-context/wiki-steward/obsidian-web 三插件方案对比，reports/scout-b-settings-contract.md）。
- 技术选型/方案对比素材：设置面注册契约（settings.section vs 自造 tab 的 404 教训对比）、保存链（configEditor.edit vs 手写配置文件）两组方案对比，进 Phase 2 TECH.md。
- 本地历史文档调研：vault 部署文档（2026-09-21 拓扑）、docs/test-env-*、ERRORS/LEARNINGS 通读。

## Round 1（功能边界：端口维护语义）

灵犀（功能/兼容集成）: 「端口维护」功能做到哪一档?（现状：端口 3500 写在配置，改动需重启才生效；API/接口联动面：watchdog 探活、外网反代、obsidian-web 分享链接都钉着 3500，改端口涉及依赖/版本兼容）

用户: 可改端口+重启提示（设置页可改 port，默认 3500，保存写配置后提示「需重启生效」，并列出联动提醒：watchdog/start-dsh.sh/obsidian-web 分享链接 3500 契约/Lucky 外网反代需人工同步）

## Round 2（功能边界：可改参数范围）

灵犀（功能）: 设置面除端口外，哪些参数开放可改?（可多选；未选中的参数设置页只读展示——这是设置面功能范围的用户故事切分）

用户: 会话天数 sessionDays + 失败锁定 maxFailures + cookie/WS/gzip 行为三件（监听面三参数不开放，只读展示；不选「只做端口」）

## Round 3（边界/异常+功能：登录超时语义）

灵犀（边界异常）: 登录超时语义本波做到哪档?（现状：固定 30 天从登录那刻起算，活跃也不顺延，超时/失败后必须重新登录——这回答了你第②问：登录后 30 天内免登录，30 天到必须重新登录）

用户: 仅可配+讲清楚（sessionDays 可在设置面调 1~3650 天 + 设置页/登录页明示「登录后 N 天内免登录」；行为逻辑零改动，不做滑动续期/记住我）

## Round 4（功能+安全：账号管理）

灵犀（功能/安全加密）: 登录账号（users/usersFile，目前 admin/clsh）在设置面怎么处理?增删改密功能要不要?密码加密存储（scrypt）与敏感信息回显边界如何定?

用户: 完整增删改密（设置页支持增删账号、改密，scrypt 哈希由服务端生成、立即生效 usersFile 热加载——多一块写链路与安全面，纳入设计）

## Round 5（安全/权限：账号管理授权边界）

灵犀（安全/权限）: 设置面里的账号增删改密，谁有权限/授权操作?（门禁目前只有一个认证平面、无角色概念，权限边界需要裁定）

用户: 任何登录用户（当前门禁不分角色，简单优先；多人共用风险知悉）

## Round 6（收敛确认）

灵犀（功能）: 我理解的需求范围对吗?——dsh 设置菜单新增「dsh-login-gate」栏目：①端口维护（可改，默认 3500，保存后标重启生效+联动提醒）②会话天数等参数可改（其余只读展示）③登录页/设置页明示「N 天内免登录」④账号增删改密（scrypt 服务端生成、热加载）⑤优化空间分析报告留档（超出范围项列候选）?（该问被中断，未取得选择）

用户: 继续

（协调者裁定 R-4：范围确认按 Round 1-5 逐项选择 + 「继续」成立；如偏差用户随时纠偏。优化空间分析（第③问）已在 Phase 0 交付：reports/scout-a-auth-timeout.md 疑点 7 条 + phase0-research.md §五候选清单 A~K。）

## 范围定稿（P0/P2）

- P0：设置栏目（settings.section）+ 端口维护（可改+重启提示+联动清单）+ sessionDays/maxFailures/secureCookie/wsAllow/gzipPass 可改 + 监听面只读展示 + 账号增删改密（任何登录用户）+ 登录页/设置页明示免登录天数 + 超时/优化分析报告留档。
- P2（只出分析不做码）：滑动续期/记住我、logout 真吊销名单、限流时间窗衰减、WS 过期引导页、小时级超时。

## 阶段过渡授权（用户明示，IL-9）

用户: 开始下一阶段（Phase 4-6 连续推进；发版五步 tag/push/release/生产同步仍逐次确认）

用户: 确认进入 Phase 2（需求澄清已完，进方案设计）

用户: 可以进入 Phase 3（预先授权 Phase 2 门禁过后直接续接设计文档）

## Phase 6 派发实录（P8R1 补记 2026-09-30；转录自 SDD 正本 progress.md / dispatch-record.md，如实不增不改；agent id 未留档处标「未留档」，不编造）

> 术语对照（口径如实）：clsh 派发原语 delegate_task = DSH `subagent` 委派行（本波实际委派通道）；具名行 subagent_scout/implementer/reviewer/tester 运行时被拒（`subagent depth 1 exceeds maxDepth 0`，实测 2 次）→ 换道 PATH A 通用 `subagent` 行、角色契约内联 prompt（R-2，dispatch-record.md）；PATH C（AgentTeams）当时未评估未裁定（R-20：自 P8R1 起本项目余下派发改走 AgentTeams 具名队 dsh-login-gate-0-3-0-phase8）。
> 模型钉点（R-8）：通用行无 model 参数，按 model-routing 就近档位如实记「继承会话默认」（mimo-v2.6-pro 路由）；卡住升档=带说明 re-dispatch。skill 注入=各卡 tasks.md role/skills 行所载 skill 名（下逐卡括注）。
> 正本指针：brief/report/审查约束全在 `.superpowers/sdd/tasks-2026-09-29-login-gate-settings/`（下称 SDD 正本）；逐时点判定原文见 SDD 正本 progress.md。

### 委派链（任务派发实况）

- **Task 0.4 需求②认证/超时分析**（scout 只读侦察，skill 注入：无（代码侦察），模型=继承会话默认）：已派发 → 完成 ✅；产出 reports/scout-a-auth-timeout.md；agent id 未留档。
- **Task 0.5 需求①③设置机制/优化空间**（scout 只读侦察，skill 注入：无（代码侦察））：已派发 → 完成 ✅；产出 reports/scout-b-settings-contract.md；agent id 未留档。
- **Task 10 users.js 模块**（coder 契约，skill 注入：subagent-driven-development）：implementer **ef54885f** 已派发 13:06 → DONE_WITH_CONCERNS 13:17（commit 7b47c7c）→ 任务级审查 **43b65533** 13:27（Spec ❌/Quality Needs work）→ fix r1 resume **ef54885f** 13:36（930ea47）→ scoped re-review **7eb1991d** 13:41（D3 升必修）→ fix r2 resume **ef54885f** 13:46（f2b5d25）→ scoped re-review **b5496eba** → complete 13:52。产出 SDD 正本 task-10-brief.md / task-10-report.md / task-10-review-constraints.md。
- **Task 11 设置面服务端**（coder 契约，skill 注入：subagent-driven-development）：implementer 已派发（原实现者 id 仅经 fix resume 行留档：**c845d53c**）→ DONE_WITH_CONCERNS 14:29（commits e8fcf9f+552ba05）→ 任务级审查 **02e42ad6** 15:16（Spec ✅ 7/7 / Quality Needs work）→ fix r1 resume **c845d53c** 15:51（6a9fb26，F1-F9+R-11/R-12）→ scoped re-review **0a802e97** 16:07（全 ADDRESSED）→ complete 16:07。产出 SDD 正本 task-11-brief.md / task-11-context.md / task-11-report.md / task-11-review-constraints.md。
- **Task 12 设置栏目 UI**（artist 契约，skill 注入：frontend-ui-engineering）：implementer 已派发（agent id 未留档）→ DONE 16:38（commit 4ff757b）→ 任务级审查 **42af8302** 16:49（Spec ✅ 5/5 + Quality Approved）→ complete 16:49。产出 SDD 正本 task-12-brief.md / task-12-context.md / task-12-report.md / task-12-review-constraints.md。
- **Task 13 测试补全**（coder 契约，skill 注入：subagent-driven-development）：implementer 已派发（agent id 未留档）→ DONE 17:24（commit 6285a15，69/69 绿）→ 任务级审查 **961a610d** 17:32（Spec ✅ + Quality Approved）→ complete 17:32。产出 SDD 正本 task-13-brief.md / task-13-report.md。
- **Task 14 测试环境验证**（tester 契约，skill 注入：validate-changes-match-specs）：tester **42d29472** 已派发 → DONE_WITH_CONCERNS 18:10（四关 4/4 + E2E a-f，隔离 profile lgat14 3181/3600，R-15）→ F-1【high】实测推翻 R-11 前提 → 用户裁定 R-16（A 案即时生效+事前警示）→ fix implementer **ab4542d8** 20:27（1a2a3a9）→ fix r1 收口 +2613abe 20:33（R-17 文档 7 处）→ scoped re-review **e2059fcb** 20:48（全 ADDRESSED，3 Minors deferred）→ complete 20:48。产出 SDD 正本 task-14-brief.md / task-14-report.md / task-14-fix-report.md。
- **Task 15 任务级复审 + 整分支终审**（reviewer 契约，skill 注入：code-review-and-quality）：整分支终审 **b6288a86** 已派发 20:52（五轴，diff SDD 正本 review-final-branch.diff 215KB 全波 10 commits path-filtered）→ **PASS** 21:04（0 blocker/high；独立复跑 72/72）→ complete 21:04。判定件 changes/review-report.md。
- **Task 16 文档与分析交付归档**（coder 契约，skill 注入：dsh-plugin-ops）：implementer **4b22113f** 已派发 → DONE 21:20（commit 146022e）→ 任务级审查 **e9744368** 21:28（Spec ✅ / Quality Needs work）→ fix r1 21:36（0a0bfe1，F1 行号漂移）→ 微复核 **779c90c3** 21:45（ADDRESSED）→ complete。产出 SDD 正本 task-16-brief.md / task-16-report.md。
- **COR-2 尖端补跑（发版门禁）**（tester 契约）：tester **fdfc62c0** 已派发 → DONE 21:45（ref 146022e 四关 4/4 + E2E c/d C-5 级 + 回归零 + 产品缺陷 0，INV-6 证据链闭环）。产出 SDD 正本 cor2-rerun-report.md。
- **Task 8 发版五步 + 生产同步**：协调者直做（无委派；tag/push 逐次用户确认；生产同步 2026-09-30 00:2x 三重验证 DONE，SDD 正本 progress.md:117-118）。

### 协调者复核实录（判定原文见 SDD 正本 progress.md，此处为转录索引）

- 任务级审查判定（Spec/Quality 双判定，5 卡，SDD 正本 progress.md）：T10 Spec ❌/Quality Needs work（:38）→ 2 轮修复环收口；T11 Spec ✅ 7/7 / Quality Needs work（:54）→ 1 轮收口；T12 Spec ✅ 5/5 + Quality Approved（:71）；T13 Spec ✅ + Quality Approved（:78）；T16 Spec ✅ / Quality Needs work（:104）→ 1 轮收口。
- scoped re-review（5 次）：T10 r1（:44 F1-F3 ADDRESSED）、T10 r2（:47-49 review clean after 2 fix rounds）、T11 r1（:63 全 ADDRESSED）、T14-fix r1（:95 全 ADDRESSED）、T16 微复核（:107 ADDRESSED）。
- 整分支终审：**PASS**（0 blocker/high，独立复跑 72/72）——review-report.md「终审结论：PASS」（review-report.md:61）+ SDD 正本 progress.md:98（agent b6288a86）；review-report.md 指向：changes/2026-09-29-login-gate-settings/review-report.md。
- 协调者复核 tester 证据：task-14-report 四关 4/4 + E2E a-f 抽查复核（dispatch-record.md「证据与抽查」节：scout-a 关键常量 3 条复核一致）+ COR-2 尖端补跑证据链闭环（cor2-rerun-report.md）→ 终审一致性判定 US-6✓ / INV-6◐（SDD 正本 progress.md:98）。
- gate-phase6 证据面（本补记即为收口）：派发证据/skill 注入/Level 委派/协调者复核四面落 conversation.md，tester 证据落 changes/2026-09-29-login-gate-settings/tester-report.md（汇总页，指向 SDD 正本）；2026-09-30 P8R1 重跑结果与确认码见 ledger.md P8R1 收口行。

## Phase 8 Round 1 记录（2026-09-30，AgentTeams 队 dsh-login-gate-0.3.0-phase8）

**Skill 锚定声明**：我正在使用 clsh-project 的优化循环处理反馈（I am using clsh-project optimization loop）。反馈类型: 确认/流程。路由: Phase 7 归档修正 + 教训分流（路由…Phase 7）。

**症状记录**（用户报告/反映）：①归档总结里派发全部走子代理，AgentTeams 未出现；②好似没有进入 Phase 8。核对现象：gate-phase6/phase8 无确认码；收口消息出现「Phase 0-8 门禁全过」字样而实有码 8 个（文件/路径/行号锚点见 reports/p8r1-diagnostic.md）。

**派发链记录（diagnostic → fix → review，fresh context，含 skill 注入）**：
- 诊断任务派发创建：t1 [T-diag]，assignee=scout，agent attempt 7f3906c9-bfc7-45f2-ad05-5303819c4b1c，skill 注入=clsh-project（Phase 8a 只读纪律），产出 reports/p8r1-diagnostic.md。
- 修复任务派发创建：t2 [T-fix]，assignee=coder，attempt ba7ee98d-96fb-4086-a132-f00be6544b95，skill 注入=clsh-project + obsidian-operations（vault-write.py 唯一写入缝），产出 6 记录文件收口。
- 审查任务派发创建：t3 [T-review]，assignee=reviewer，attempt 3ef5f8c5-4daf-4d40-a42b-dde710cbd802，skill 注入=code-review-and-quality（五轴复核），判定=需修（F-1~F-3 证据指针漂移）。
- 修复任务派发创建：t4 [P8R1-fix-R1]，assignee=coder，attempt 9b171416-6807-4075-a705-19c152b7599e，skill 注入=clsh-project，3 行号修正+registry 佐证补档。
- 审查任务派发创建：t5 [P8R1-review-R1]，assignee=reviewer，attempt 1610d9a8-90b3-4253-82de-3c0883c2fc10，skill 注入=code-review-and-quality，判定=PASS（F-1~F-3 全 ADDRESSED）。

**依赖链（parent 关系）**：t2 parents=t1（fix record parents=diagnostic）；t3 parents=t2（review record parents=fix）；t4 parents=t3 findings（修复记录 parents=审查发现）；t5 parents=t4。依赖…记录链全对齐 tasks.md 派发 id 回写。

**收口**：P8R1 五卡链 complete；记录入库见后续 docs 提交；gate-phase8 于本记录落盘后重跑取码。
