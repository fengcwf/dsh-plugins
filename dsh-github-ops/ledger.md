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
- [2026-09-30] Phase 8 Round 1（确认/流程）complete：用户反馈「归档未反映派活路径偏离（未用 AgentTeams）+ 未进入 Phase 8」→ 路由 Phase 7 归档修正。派发链 Task 18 诊断（c558e343，G1-G6 缺口清单+补正红线）→ Task 19 修复（88986d02，597c8db+cd403d9，G1-G6 全落盘含修复环计数 10/14/17 事实校订）→ Task 20 审查（e1a8d83b，verdict pass 零 findings，保护数字改前改后 grep 计数逐项相等）。归档三件已如实反映 PATH A 偏离+成本三条与 Phase 8 时点状态。
- [2026-09-30] Phase 8 R2 输入口径（用户裁定）：等用户实测反馈后逐件开轮（反馈类型路由：UI/样式→artist、逻辑→coder、性能→coder、需求变更→Phase 1-3 重走、确认→Phase 7）；backlog 池暂不自动跑。R1 收口于 gate-phase8 PASS（82E48AF8）。

## Phase 8 Round 2（2026-10-10，web_fetch 门禁文案）

- **[2026-10-10] 开轮**：用户反馈「dsh-github-ops 修复——其他会话报 web_fetch 对 raw.githubusercontent.com 只能匿名访问；是否有调用插件的 token 使用，还是插件有问题影响，最近 GitHub 新增了 2FA」。反馈类型 = **逻辑 bug（误导性硬编码文案）** → 按 Phase 8 路由表派 Phase 6 coder。
- **[2026-10-10] 队长 Phase 8a 只读诊断**（记录现象不分析根因的边界内）：报错逐字出自 `lib/enforce.js:36-41` `gateWebFetch()`；安装位与 checkout 的 enforce.js md5 一致（0.3.0）；gh 认证 `5000/5000/used 0`、匿名 curl raw 返 200、代理 192.168.0.41:7890 活着 → **与 2FA / token 失效无关**；web_fetch 结构性带不了 token（`dsh-web-fetch-http` provider 注释 "Requests carry no browser cookies or ambient credentials" + `parseFetchUrl` 拒 userinfo + 工具 schema 仅 `url` 入参无 headers）→ 门禁设计正确，坏的只是它用会过期的实时观测解释自己。两项真问题：①生产 `webFetchPolicy: deny`（包内 patch 自带，profile patch 无 github-ops 行）→ 确定性拦所有会话；②文案硬编码「60/h 且本机代理出口已耗尽」。附带发现：`ask` 在本机等于 deny（`dsh-user-approval` `decide()` 里 `effectivePolicy==='never'` 直拒，源于 danger-full-access）——修它需动生产 patch，属 P-9，仅案记。
- **Ruling（方案 2026-10-10）**：用户裁定「B 优先、A 并行」= B 改插件文案去硬编码（走发版流程）/ A 并行调 `webFetchPolicy`。A 的承载经查证改为**案记不改**：生产 profile patch 不含 github-ops 行，改它 = 新增配置覆盖；且 P-9 明禁服务存活期写生产 `cordis.patch.yml`（LRN-033 热重载拆活树），`ask` 又在本机被 approval=never 转 reject → A 三条路全不通，代价如错 = 需重启窗口才能尝试验证，先在 B 里把文案修对。B 的必要性独立成立。
- **[2026-10-10] Task 21 派发**（coder，通用 subagent 行 + 角色契约内联——具名 implementer 行 maxDepth:0 拒派，同 2026-09-29 实测）：RED→GREEN，删「60/h 且出口已耗尽」改为结构性约束陈述；`node --test` 112→**115/115**；`check-release.sh` VERDICT PASS；版本四处 0.3.1；工作树 7 个 inScope 文件 + 3 报告，`~/.dsh/` 零写入。证据：`changes/20261010-webfetch-gate-copy/task-01-report.md`。
- **[2026-10-10] Task 21 独立验证**（tester，同样降级形）：V1-V7 全 PASS；**V2 mutation 探针**证明新测试真能咬（/tmp 副本注入「60」坏形态 → 3 个新测试精确红，还原回 115/115），排除假保险；`~/.dsh/plugins/dsh-github-ops` 3h 内 0 写入。队长另行独立复现同一 mutation 结论。证据：`tester-report.md`。
- **[2026-10-10] Task 21 双轴审查**（原单卡 5 轴 14 项派发连续两次 run failed → 按铁律 7 拆成两张窄卡）：①代码正确性/安全轴 reviewer → **verdict pass**，0 blocker/0 high，1 medium finding **F-1**；②文档/流程轴由队长亲自跑（D1-D4 全只读 bash/grep，属可自干轻活，不触 IL-3）。
  - 代码轴结论：新文案只陈述结构性约束、全文零数字；「只可能走匿名通道」判定为结构事实（指请求不带凭据的传输属性，非"当前未认证"状态）；HEAD vs working 双导入实测 `action` 分歧 0/19、`rewriteGithubCommand` 0/31、`API_HOSTS` 逐字节相同、`index.js` diff 空，含 `evil.githubusercontent.com.attacker.com`/`user:pass@api.github.com` 等高危边界无回归。
  - **F-1（medium）**：哨兵 `STALE_OBSERVATION = /60|耗尽/` 是字面枚举非结构性规则——队长实测复现：把 reason 改成「当前匿名限额 5000/h」这种"看起来是今天真值"的新数字，115/115 仍全绿，哨兵咬不住。
  - 文档轴结论：D1 四处版本对齐且说法与实测一致、D2 README.zh 两处同步到位零残留、D3 本卡无越界写、D4 未提前 commit/tag/release → 判 `needs_revision`，唯一 requiredFix = 补齐发版第五步（F-DOC-1：根 README 已宣称 0.3.1 而插件未发版，README 行由并发会话 obsidian-web 波 commit 代为收走）。
  - F-DOC-2（low，报用户）：生产 `cordis.patch.yml` mtime 11:13:57 被写，时间线吻合 obsidian-web 0.3.1 发布（grep github-ops 0 命中，与本卡无关）；是否属服务存活期热写待用户确认。
- **[2026-10-10] Task 22 派发**（coder，修 F-1）：`lib/enforce.js` 逐字读过确认零数字零状态断言 → **未改它**（改它属 Scope Creep）；哨兵升级为三族结构规则（A 定量断言=数字+量纲 / B 配额语境裸数字 / C 实时状态断言=观测标记或状态词与基础设施/配额主体同现）。`node --test` 115→**120/120**；check-release PASS；version 仍 0.3.1 未 bump；md5 证 `lib/enforce.js`/`package.json` 未被本卡改动。**队长独立 mutation 复现三个坏形态**：`5000/h`→5 fail、`60/h`→5 fail、`本机代理出口已耗尽`→4 fail，还原回 120/120——与 coder 自述数字逐一相符。证据：`changes/20261010-webfetch-gate-copy/task-02-report.md`。
- **[2026-10-10] 待用户裁决（发版第五步，P-8/P-9 边界）**：commit 仅含 `dsh-github-ops` 的 7 个 inScope 文件（根 README/CHANGELOG 已被并发会话 commit，勿交叉）→ tag `dsh-github-ops-v0.3.1`（与未发版的 v0.3.0 一并归发版波）→ push → `gh release create` → 生产换 tag 重 `dsh plugin add` + 重启（重启杀会话宿主，须用户空档）。**修复目前尚未到达其他会话的运行时**：安装位仍是 0.3.0 快照，那句误导文案在安装位仍活着。
