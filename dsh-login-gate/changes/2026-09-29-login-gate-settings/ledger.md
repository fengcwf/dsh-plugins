# Ledger — plan: dsh-login-gate 设置面与认证优化（跨轮记忆，磁盘=唯一真源）

> 变更：changes/2026-09-29-login-gate-settings/｜2026-09-29
> 派发标识：DSH 会话 subagent 委派（具名行运行时被拒，见 dispatch-record.md）

## 阶段进度

- Init: ✅ complete（名称/slug/目录用户确认；.cp-init.json + overview + constitution + 变更三件套；gate-init 码 76C9AC21 ✅）
- Phase 0: ✅ complete（四件套：①scan phase0-data.json ②ERRORS/LEARNINGS 通读 ③vault 部署文档+docs/先例扫描 ④phase0-research.md 引用①②③；gate-phase0 码 A3B09993 ✅）
- Phase 1: ✅ complete（Round 1-6 一次一问；范围 P0/P2 定稿；gate-phase1 码 A9BD8113 ✅）
- Phase 2: ✅ complete（TECH.md 方案对比 + ADR-001~005 + Global Constraints 6 条；gate-phase2 码 96108180 ✅）
- Phase 2.5: ✅ skip（.cp-visual-skip 豁免：settings.section 形制由设计系统决定，R-5）
- Phase 3: ✅ complete（proposal.md + constitution.md；gate-phase3 码 B17429A9 ✅）
- Phase 4: ✅ complete（phase4-selfcheck.md 实质自查表；gate-phase4 码 E10AA468 ✅）
- Phase 5: ✅ complete（tasks.md Task 10-16 实现卡，US 覆盖 6/6；gate-phase5 码 D49FF8FE ✅）
- Phase 6: ✅ complete（SDD 环 Task 10-16 全 complete + 整分支终审 PASS；gate-phase6 码 382CE667 ✅——2026-09-30 P8R1 补跑所得，归档时点无码，详见「P8R1 收口」节）
- Phase 7: ✅ complete（归档三件套 22:58；gate-phase7 码 1E614144 ✅——原留档位仅 SDD progress.md:114，P8R1 补记入本行 changes/ 面）
- Phase 8: 🔄 P8R1 优化循环 in-progress（gate-phase8 未运行、无码，如实；反馈=归档记录与实际执行不一致，链路 diagnostic→fix→review）

## Phase 6 进度（详 SDD ledger：.superpowers/sdd/tasks-2026-09-29-login-gate-settings/progress.md）

- Task 10 (users.js 模块): ✅ complete (agent ef54885f；commits 7b47c7c..f2b5d25)；全环 Task 10-16 详 SDD progress.md，委派链详 conversation.md「Phase 6 派发实录」（P8R1 补）

## 关键事实（Phase 0 已核验，勿再查）

- 登录会话=固定 30 天（sessionDays=30，`lib/index.js:30`），无滑动续期（`lib/gate.js:153` 只验不重签）；到期任意 URL 302 登录页（`lib/gate.js:153-157`），WS 401 断连（`:168-174`）。凭证 dlg_sid（HMAC-SHA256，`lib/auth.js:58,63`）；logout-all 轮换 secret 全员下线（`lib/gate.js:139-145`）。
- dsh 注入 cookie 6h 滚动（`lib/dsh-session.js:24`），dsh 宿主 cookie 30 天——用户"需要重新登录"的瓶颈=门禁会话。
- 生产实况：port 3500 / sessionDays 30（`/root/.dsh/profiles/web/cordis.patch.yml:22,25`）；入口=内网 192.168.0.254:3500 + 外网 Lucky 反代（家宽侧设备，改端口需人工联动——NEEDS_HUMAN）。
- 设置栏目契约：package.json `dsh.client` + `exports["./client"]` → 零构建 `lib/client.js`（`__ModuleLoader__`）→ `ctx.slots.register('settings.section')`；保存=POST `api/<plugin>/settings` → 白名单 → configEditor.edit → 写 profile cordis.patch.yml + Loader reconcile 热生效。端口=一次性 listen（`lib/index.js:141-142`），**改端口必须重启**。
- 端口改动联动面：gate-watchdog.sh:34 / start-dsh.sh:101-113 / reset-password.sh / update-gate.sh / gate-emergency.sh / README / obsidian-web share-links.js:22,138 + share-server.js:390（3500 /ob_share 外部契约）/ .testenv 测试护栏（3500=拒）/ headless 自检文案。

## Rulings（停摆即 bug：裁定后继续，判断错代价随记）

- R-1 gate 两步确认码：码随阶段报告呈现用户（审计可见），--verify 即时执行不为码停摆——依据：用户 approval=never 指向自主推进 + 各阶段实质确认由用户触点承担（Init 三项已 ask_user_question 确认）。判断错代价=用户未过目门禁码；可逆（码与 gate 结果留档，用户可叫停重审）。
- R-2 执行路径：具名委派行（subagent_scout 等）运行时被拒（depth 1 exceeds maxDepth 0，实测 2 次）→ 全部走 PATH A 通用 `subagent` 行、角色契约内联 prompt；**不冒充角色隔离**（如实记 dispatch-record）。判断错代价=隔离弱化，靠证据字段+reviewer/tester 独立卡补偿。
- R-3 需求②③（分析）随 Phase 0 交付，不再单列 Phase；需求①（设置栏目）走 Phase 1-6。

## Learnings

- [2026-09-29] gate-phase0 问题行必须半角 `?` 结尾、章节名 `## 待确认` 起头（全角"？"/编号前缀"六、"都会被计为 0 问题）。
- [2026-09-29] DSH 运行时：preset 具名 subagent 行（maxDepth:0）在本部署一律拒建（depth 1 > maxDepth 0），通用 `subagent` 行可用——与 clsh runtime-evidence 的"PATH A 可用"口径不符，按实测为准。

## Phase 6 进度

（待 Phase 6 开工后逐任务记账）

## Phase 8 Optimization Rounds

（待 Phase 8）

## Fix 裁决记录

（待 fix 卡出现后记账）


## Phase 8 Optimization Rounds

**Skill 锚定声明（OL-5）**：我正在使用 clsh-project 的优化循环处理反馈。反馈类型: 确认/流程（归档记录与实际执行不一致）。路由: Phase 7 归档修正 + 教训分流（Phase 8 Round 1，2026-09-30）。

- Round 1: 确认/流程 → Phase 7 归档修正 + 派发链 diagnostic→fix→review→fix-R1→review-R1 → complete（AgentTeams 队执行；t3 需修 3 指针漂移→t4 修→t5 PASS；产出 reports/p8r1-*.md 四件）

## Phase 8 Round 1 — 症状记录（8a，只读不改；现象记录非分析）

用户报告/反映：
1. 项目归档总结里派发全部走子代理，AgentTeams（PATH C）未出现。
2. 归档总结好似没有进入 Phase 8。

核对到的事实（对照磁盘与脚本状态）：
- gate-phase8 无运行记录、无确认码。
- gate-phase6 无运行记录；2026-09-30 补跑返回 FAIL（6 项：conversation.md 缺派发证据/skill 注入证据/Level B 委派证据、缺 tester-report.md、缺协调者复核证据、ledger 缺 plan 身份头）。
- 发版收口消息中出现「Phase 0-8 门禁全过」字样；当时已留档确认码为 init/0/1/2/3/4/5/7 共 8 个。
- 派发实况=具名行（subagent_scout 等）被运行时拒绝（depth 1 exceeds maxDepth 0，实测 2 次）后改用通用 subagent 行；agent_teams_status 于 2026-09-30 返回「do not lead or belong to any active team」（平面可用、队未建）。dispatch-record.md 只记录了具名→通用的处置（R-2），PATH C 的取舍无裁定行。

## Rulings（本波新增）

- R-19（声明越证据）：收口消息「Phase 0-8 门禁全过」措辞超出当时证据面（实跑门禁 8 个）——记录类声明此后一律对账确认码清单再落笔；判断错代价=用户被误导为全流程已验，本次由用户质询纠正。
- R-20（派发路径）：PATH C（AgentTeams）当时未评估未裁定即落通用 subagent 行——自本轮起本项目余下派发改走 AgentTeams 具名队（staged 队已建待批）；判断错代价=少一次用户审批触点，多一分无角色隔离执行面。

## Learnings（本波新增）

- [2026-09-30] 收口类声明（"全过/完成"）必须以门禁确认码清单为唯一依据逐项对账，缺码即缺证据。
- [2026-09-30] 派发路径三选（具名行/通用行/AgentTeams）须在 ledger 留裁定行；运行时拒绝其一不等于其余路径已评估。

## P8R1 收口（2026-09-30，记录类零代码）

- gate-phase6 重跑：**PASS**（2026-09-30，收口后实跑）；确认码 **382CE667**（R-1 口径：码随报告呈现用户留档 + --verify 即时执行）；marker 已落盘 `~/.hermes/gate-state/377a13dbeffca129/phase6.json`（HMAC 在签；slug=sha256("/opt/workdata/dsh-plugins/dsh-login-gate")[:16]——后续 gate 命令须用同一 project_dir 字符串）。
- 落点表（收口 5 项，全为记录文件）：①conversation.md「Phase 6 派发实录」+「协调者复核实录」②tester-report.md（本变更根一层，gate 查找位）汇总 tester 证据 ③completion-summary.md 门禁对账表+逐断言证据指针+Phase 8 段 ④wiki/reference/ERRORS.md 两条教训（vault-write.py 原子写，registry 无 pending）⑤tasks.md 回写 P8R1 三卡派发 id+复选框对账。差异对照见 reports/p8r1-diagnostic.md。
- 佐证同步（P8R1 顺带收口诊断差异 1.2/1.3/2.2/2.3/3.3/5.7）：dispatch-record.md 状态/产出列回填至终态；tasks.md gate 复选框与本账对齐；review-package.md 名实差注记（实产=review-*.diff 14 个+review-report.md）。
- 自证：全程零 `lib/` 代码改动（git diff --name-only -- dsh-login-gate/ 无 lib/ 条目）；只改记录文件。
