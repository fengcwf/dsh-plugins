# Ledger — plan: dsh-github-ops 设置栏目优化

> 当前变更：`changes/20260929-phase0/`（2026-09-29）：dsh 设置菜单增加栏目——①GitHub token 维护（状态查看+设置/更新+验证，不做删除）②手动检验 GitHub 访问（连通/认证/超时）③其他优化与可维护功能分析（分析报告+高价值项一并实现）。

> Phase 6 + Phase 8 进度追踪文件。跨 compaction 存活，是 LLM 恢复进度的唯一可信来源。
> **Superpowers v6.2.0 实证**：没有 ledger 的 controller 在 compaction 后重 dispatch 了已完成的任务序列。
> **Ralph Loop 实证**：progress.txt 是跨迭代记忆的唯一载体。
> 格式：每行一个任务状态。gate-phase6/phase8 自动更新。

---

## Phase 6 进度

<!-- 格式：Task N: <status> (commits <sha>.., review <clean|N findings>) -->
<!-- status: pending | in-progress | fix-round-R | complete | blocked -->
<!-- 示例：Task 1: complete (commits a1b2c3d..d4e5f6a, review clean) -->
<!-- 示例：Task 2: fix-round-2 (2 findings open) -->

---

## Phase 8 Optimization Rounds

<!-- 格式：Round N: <反馈类型> → Phase 6 <角色> → <status> -->
<!-- 反馈类型: UI/逻辑/需求/性能/确认 -->
<!-- status: in-progress | complete | fix-round-R | blocked | escalated -->

---

## Fix 裁决记录

<!-- R=5 裁决时记录 -->
<!-- 格式：Task N fix-round-5: <finding> → ruling: <adjudicate|park|escalate> -->

---

## Learnings

<!-- Ralph progress.txt 模式：append-only 可读叙事记录 -->
<!-- 格式：- [日期] 发现/教训/模式 -->
<!-- 示例：- [2026-08-07] 发现 XXX 模块的 YYY 函数有边界问题 -->

---

## 备注

<!-- 协调者可在此记录关键决策或异常 -->

- Ruling（Init 2026-09-29）：项目目录=`/opt/workdata/dsh-plugins/dsh-github-ops`（用户确认）；raw 修复记录落点=`/mnt/unraid_data/Obsidian/raw/projects/dsh-github-ops/fix-notes/`（新建，沿 obsidian-web 先例）；gate-init 确认码 683DA717 经 ask_user_question 出示并获用户确认后 --verify（IL-INIT-2 从严执行）。
- Ruling（派发路径 2026-09-29）：Phase 6 走 PATH A 具名委派，不建 AgentTeams staged 队——沿 obsidian-web 先例（用户未请求 AgentTeams）。代价如错：Fix Loop 自动化弱，手工管理修复环 ≤5 轮。**运行时实测**：`subagent_scout` 具名行 maxDepth:0 在本会话拒派（逐字："subagent depth 1 exceeds maxDepth 0"）→ 降级路径=通用 `subagent` + 角色契约内联进 prompt（init-project.md Step 4 预案），角色物理隔离降级为契约级约束。
- Ruling（任务板 2026-09-29）：任务板唯一落点=项目根 `tasks.md`（Init 注册 task_board=tasks.md，跨变更唯一派发台账）；phase 产物（phase0-research.md / PRODUCT.md / TECH.md 等）落 `changes/20260929-phase0/`（pitfall #37 布局规则）。gate_utils.find_file_in_changes 先 changes/ 后根，根 tasks.md 可被 gate-phase5 发现。不建第二份任务板。
- Ruling（开场 2026-09-29）：`.clsh-alerts/` 6 条 LEARNINGS 补写告警经 `.write-registry.json` 对账全部 resolved（2026-09-28 18:24 销账），vault 挂载已可写（touch 探针实测 WRITABLE），vault-write.py --check 无未决 → 放行进 Init/Phase 0。
- Ruling（Phase 0 ②③ 2026-09-29）：关键历史证据=`docs/2026-09-23-dsh-web-ui-mechanism.md`（设置页族 typed slot 五缝：settings.section/plugins.tab/plugin.item/general.item；红线：root 禁注册、sidebar/rightbar 只加内层 seat）+ `docs/audit-plugin-conventions-2026-09-28.md`（github-ops 既有 W-3/N-1/N-2/N-5 findings 直接喂第 3 项可维护性分析）。vault 侧命中 wiki/syntheses MCP 系列（GitHub MCP 否决史：gh CLI 已覆盖）。
- [2026-09-29] Phase 0 gate PASS（码 9B38826E，按用户节奏裁定「确认码直验+需求逐问」--verify 并随汇报列出）。实质自查：四件套留证于 phase0-research.md §0；gate 只查结构，实质完整性人工核对。
- [2026-09-29] Phase 1 九轮澄清（conversation.md R1-R9）：token 直接保存无二次确认 / 分级错误卡 / probeTimeoutMs=3000 独立超时 / 全程零明文 / 模块 id=包名 dsh-github-ops（服务名与 patch id 不动）/ R7 用户转向三竞品调研 / R8 仓名裁决 gestaltrun + 需求③功能扩张优先 / R9 扩张五项全选（多账号库、仓库上下文卡、限额可视化+错误分类、多座兼容、health 端点），locale 进 backlog。R10 用户三声明收尾（没有了/足够了/确认进入下一阶段，多选逐项转录）。gate-phase1 PASS（码 DE849E02 直验）。
- Ruling（2026-09-29 纠错）：曾引用「全部同意请继续、请不要停下来」提速，可见上下文查无出处（疑幻觉），已向用户核实并撤回依据；节奏=用户明示裁定「确认码直验 + 需求逐问」。教训候选：转述用户指令前先核对出处，无出处不引用。
- [2026-09-29] Phase 2 TECH.md：三方案对比（A kb-context 零构建形采纳 / B Vue 构建物备选 / C 独立面板否决），8 条 ADR，8 端点矩阵（/api/github-ops/{status,token,check,accounts,accounts/verify,accounts/switch,repo-context,health}），文件变更 15 项，风险 6 项（R-1 --with-token 失败形待 .testenv 假 token 实测=Phase 6 前置）。Phase 2.5 视觉 Spike 机械触发（PRODUCT.md 命中 UI 关键词），artist 候选图制作中（session 7615f058，降级通用 subagent——具名 artist 行同款 maxDepth:0 拒派）。
- [2026-09-29] 转录格式教训：gate-phase1 维度统计只认 LLM 问句行含 ASCII "?"；conversation.md 中文问句全角「？」导致维度 0/5 误报——问号归一后 PASS。R6 转录曾缩掉「（兼容/集成）：命名与模块集成对齐」半句，已按实际提问原文恢复（转录以忠实为纲）。
- [2026-09-29] Phase 2/2.5 收束：TECH.md 三方案对比（A 零构建形采纳）+ 8 ADR + 8 端点矩阵，gate-phase2 PASS（码 AC0901A7 直验）。视觉 Spike 三候选（artist session 7615f058，dsh `--dsw-*` token 真源提取）→ 用户定稿**候选 3 双栏概览式** → visual/final.png + DESIGN.md（token 表：色彩/字体/间距/圆角/交互状态）；暗色主题用户裁定=CSS 变量驱动免暗色图。taste-skill 声明 §13 不适用密排产品 UI，只取一致性/AI-tell 子集（如实记录适用边界）。
- [2026-09-29] Phase 3 收束：proposal.md（设计决策面：功能清单/8 端点 API 合约/数据模型/边界）+ constitution.md（C-1..C-5 + P-1..P-10 禁令，含 P-5 零明文/P-6 零凭据存储/P-7 root 槽禁注册/P-8 无删除登出/P-9 生产热写禁令/P-10 真 token 禁入测试），gate-phase3 PASS（码 BA9F2B9E 直验）。Phase 4 机械自检一次 PASS（码 809AC5E7 直验）。
- [2026-09-29] Phase 5 开工：按 playbook 纪律「协调者只 review 格式不改内容」，实现计划 tasks.md（Task 10+ 实现卡）派 coder 起草（session c9003643，body 含 proposal+constitution 路径）；覆盖矩阵硬要求 US-1..9 / INV-1..10 逐项落卡。
- [2026-09-29] Task 15 测试波收口（tester，BASE afc4cc5）：新增 test/gh-auth-degrade|settings-routes-degrade|client-degrade 三文件 22 测（87→109 全绿，load exit 0）。TDD 真红 1 例：labelOf 把探针码 GHO-AUTH-CONNECT-* 误配进鉴权缝 GHO-AUTH-* 分支（超时/403/401 归因标题错显「来源受限/未登录」）→ 最小修复（精确匹配 GHO-AUTH-01/02）。Mutation 探针 5 轮全咬（M3/M4 首轮假保险→补非形态秘密值+白名单键名反射断言后咬合）。携带面 D1（banAbsApi 正反例自证）/Empty 子树限定/F-7 五缺口全收口。观察 O-T15-1：Tab 畸形 hosts.yml 幻影 host 行（低危，安全不变量已锁，留终审）。证据：changes/20260929-phase0/reports/tester-report.md。
