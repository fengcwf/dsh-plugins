# ledger.md — dsh-login-gate 设置面与认证优化（跨轮记忆，磁盘=唯一真源）

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
- Phase 6: 🔄 in-progress（SDD 环：workspace=.superpowers/sdd/tasks-2026-09-29-login-gate-settings，BASE=0e02517）
- Phase 7/8: ⬜ pending

## Phase 6 进度（详 SDD ledger：.superpowers/sdd/tasks-2026-09-29-login-gate-settings/progress.md）

- Task 10 (users.js 模块): 🔄 dispatched (agent ef54885f)

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
