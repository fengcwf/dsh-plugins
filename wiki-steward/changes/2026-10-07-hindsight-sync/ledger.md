# ledger — wiki-steward 2026-10-07 Hindsight 同步优化波

变更目录：`changes/2026-10-07-hindsight-sync/`（项目文档唯一落点 = 项目目录，裁决 A=丙）
项目：wiki-steward 0.7.0（已发版运行）｜ monorepo：fengcwf/dsh-plugins

## 用户原始需求（2026-10-07）
1. 已装 Hindsight 记忆插件，分析 wiki 与 Hindsight 的互相搭配优化方案（把记忆内容同步到 raw 再 ingest 到 wiki 等）
2. 增加手动同步 Hindsight 功能 + 同步日历查看 + 同步时间调整
3. 增加 Hindsight 状态分析 + 启停按钮
4. 分析还有什么功能可以增加或调整

## R-1 派发路径裁定（换道前留档 —— ERRORS [2026-09-30]「派发路径未裁定即换道」）

| 路径 | 本轮判定 | 证据 / 依据 |
|------|---------|------------|
| **A 具名委派**（subagent_scout/implementer/reviewer/tester） | ❌ 运行时不可用 | 2026-10-07 17:08 三行全部被拒：`subagent depth 1 exceeds maxDepth 0` |
| **B workflow 脚本**（`agent()`/`pipeline()`） | ⏸ 本轮未用，Phase 6 备用 | 有界修复环 >3 轮时改走 B；`agent()` 只收 label/phase/schema/provider/model（实测硬约束） |
| **C AgentTeams**（profile: clsh） | ⏸ **评估中，未启用** | 本波 ≥4 卡 + 预期含修复环 → 落入 ERRORS [2026-09-30]「大波次默认建队」区间 |

- **本轮实际使用**：通用 `subagent` 行 × 3（只读侦察，background）。
  理由：三卡彼此独立只读、互不依赖、无修复环，每卡天然 fresh-context。
- **未启用 PATH C 的理由（显式留档）**：本轮为 Phase 0 只读调研波（3 张侦察卡），
  建队收益（Fix Loop 自动化 / 成员会话复用）在只读调研面不成立。
- **⚠️ 待办（进 Phase 6 前必回用户面）**：实现波默认应启用 PATH C，
  不许静默沿用通用行 —— 依据 ERRORS [2026-09-30]「大波次派活未走 AgentTeams 建队协议（用户质询发现）」。

## R-2 证据纪律（本轮生效）
- 所有「已改 / 已完成」断言必须附 grep/read 磁盘验证输出（ERRORS [2026-10-01]「处置回执自述超证据」）。
- 收口声明先对账门禁确认码清单再落笔（ERRORS [2026-09-30]「收口声明超证据」）。
- 前端验收含**发布物面**（`web/dist` 重建 + bundle 断言），不许只测 src（LEARNINGS LRN-045）。

## R-3 Phase 0 固定四件套（IL-4/IL-5/IL-6）
| # | 动作 | 状态 | 证据 |
|---|------|------|------|
| ① | `scripts/phase0-scan.py` 机械扫描 | ✅ | `changes/2026-10-07-hindsight-sync/phase0/phase0-data.json`（2026-10-07 09:11 UTC 跑出） |
| ② | 通读 `wiki/reference/ERRORS.md` + `LEARNINGS.md` | ✅ | 见下文「教训内化」节（含条目名+行号） |
| ③ | 本地历史文档扫描（vault 检索 + 项目 changes/） | ✅ | 见「历史文档扫描」节 |
| ④ | 调研摘要引用 ①②③ | ⏳ | Phase 0 收口时写 `research-summary.md`，必须引用三者 |

## 教训内化（② 实测 grep 结果）
读 `/mnt/unraid_data/Obsidian/wiki/reference/`（ERRORS.md 24840B / LEARNINGS.md 25416B）：
- ERRORS.md:181 `[2026-09-23] Phase 0 漏做"内化历史教训"+ 门禁只拦结构未拦实质`
  → 承载表职责必须逐项转任务卡；Phase 0 四件套缺一不可。**本轮据此先读教训再派活。**
- ERRORS.md:229 `[2026-09-30] 大波次派活未走 AgentTeams 建队协议`
- ERRORS.md:250 `[2026-09-30] 派发路径未裁定即换道` → → **本文件 R-1 裁定行即为其机制化落点**
- ERRORS.md:241 `[2026-09-30] 收口声明超证据` → → R-2
- ERRORS.md:259 `[2026-10-01] 处置回执自述超证据` → → R-2
- LEARNINGS.md:145 `LRN-044 pnpm 同 spec 装包静默复用旧快照` → 生产装包换 tag 必 remove+重 add
- LEARNINGS.md:153 `LRN-045 src/bundle 面盲区` → 前端验收含发布物面
- LEARNINGS.md:161 `LRN-046 fake-ctx 静默盲区` → 测试 ctx 需 Proxy 防呆（新增 apply 接线时注意）
- LEARNINGS.md:169 `LRN-047 双侧假响应双绿` → 新端点需真对真 roundtrip 测试，禁两侧 mock

## 历史文档扫描（③）
- 项目内历史波次：`changes/2026-09-29-settings-ingest-controls/`（设置面/ingest 控制面改造，本需求最邻近先例）、
  `changes/2026-09-30-logview-filters/`（首波 AgentTeams PATH C）、
  `changes/2026-09-28-b1b2-service-effect-fix/`（服务缝/effect 修复）。
- `overview.md`:37 记载 0.5.0 波「设置页/ingest 控制面改造」→ 本次需求是其同族扩面。
- 教训库内**无** Hindsight 相关条目（grep `hindsight|记忆插件|记忆同步` 于 ERRORS/LEARNINGS 零命中）
  → 本波属首次，无前例可循，侦察结论不作「已有约定」推断。

## 轮次
- 2026-10-07 轮 1：读 skill(clsh-project) + 环境侦察 + 派 3 张只读侦察卡 + Phase 0 四件套开工。

## R-4~R-8 三卡侦察合并裁定（2026-10-07，队长）
- **R-4 同步对象 = memories/facts，不是 knowledge pages**（pages 实测 body 全 0；facts 354 条有正文）
- **R-5 粒度 = 聚合**（一条一文件 = 重演 05-holographic 的 1091 垃圾事故）
- **R-6 落点 = `raw/06-hindsight/`**，稳定 ID 命名，禁用日期前缀（防 wiki 重复页爆炸）
- **R-7「只写 wiki/ 与 raw/projects/」判定：不算违反**，前提是自动化管道写入 + 4 条件（含两处 AGENTS.md 修改=红线待用户确认）
- **R-8 设置页落地 = 方案 A**（扩 settings.section 零构建 React，不碰 dist）；方案 C(Vue) 归用户产品裁定

## 🔴 两个前置阻塞（先于需求本身，需用户拍板）
- **B-1 蒸馏通道已断 8 天**：cron #21 连续 `MISSING_CREDENTIAL: deepseek-official` exit 1（队长 tail 4 份日志确认）
  → 链路建了也编译不出 wiki 页
- **B-2 同步源端两极**：pages 空壳 / facts 有料 → 已裁 R-4，但**是否先修播种**待用户定

## Phase 0 四件套状态（收口）
| ①机械扫描 | ✅ phase0/phase0-data.json |
| ②ERRORS+LEARNINGS 通读 | ✅ 7 条见上 |
| ③历史文档扫描 | ✅ overview.md + 0.5.0 先例 + constitution + 三卡 |
| ④摘要引用①②③ | ✅ **captain-recon-consolidation.md**（合并裁定，含队长复验表） |

## R-9 派发路径：PATH C 已启用（2026-10-07 23:20，用户质询触发）
- 用户质询「为什么不是创建 agent-teams」= R-1 待办的触发点。`agent_teams_status` 查实无活动队（上波已归档）→
  新建 staged 队 `wiki-steward-hindsight-wave`（profile:clsh，8 成员，模型路由已配）。
- 种子卡：t1（W1 epoch 守卫+N2，implementation→coder/pro）、t2（数据面收口尾项，work→mechanic/flash）、
  t3（复审 t1，review→reviewer/flash，依赖 t1）。
- 暂不建：凭据修复（等用户 ①/② + key）；Hindsight 功能卡（等 Phase 1 裁定）。
- 教训对账：ERRORS [2026-09-30]「大波次未建队」「未裁定即换道」同型第 3 次被用户质询——本次处置=当轮建队+留档。

## R-10 遗留三项分析裁定（2026-10-07，实测取证）
- **凭据**：`.credentials.yaml` 键面=XIAOMI_MIMO_API_KEY/XIAOMI_TOKEN_PLAN_API_KEY，**无 DEEPSEEK_API_KEY**
  （grep 键名实证）；hourly-check+wiki-ingest 同句 MISSING_CREDENTIAL。推荐 ① credentials service（dsh 报错原文自指的路）。
- **W1**：0.7.0 波复审 review-report.md:106 竞态=reload/loadOlder 无序号守卫；方案=epoch 递增+不匹配丢弃（~3 行）；N2 顺手互斥。
- **数据面尾项**：旧落点停写 6 天但**旧账本 76 行独有**（新账本 0 重复，grep 实证）→ 归档不裸删；
  摘除两处容忍清单（~/.dsh/AGENTS.md:30 + /root/bin/dsh-root-lint.sh:26）只摘 kb-index/kb-alerts.md。

## R-11 计划审批 + 派发启动（2026-10-07 23:2x）
- 用户经 pre-run review UI 审批通过 staged 计划 `wiki-steward-hindsight-wave`；调度器接管派发（t1 coder / t2 mechanic / t3 reviewer 依赖 t1）。
- **早期信号（系统提示面证据）**：~/.dsh/AGENTS.md 已被改——过渡容忍行已摘除 `kb-index/` `kb-alerts.md` 两项（保留 login-gate/ dsh-usage/）、白名单新增 `_archive-20261007/` → t2（数据面收口尾项）已在执行，动作与合同步骤②一致。
- 待用户输入（不阻塞 t1/t2/t3）：凭据 ①/② 裁定 + DEEPSEEK_API_KEY（推荐① credentials service）；两处 AGENTS.md 修改中的 vault 版（R-7 条件②④）。
- 纪律：不 busy-poll 成员；报告到达自动唤醒。

## R-12 / R-13 t2 结算裁定（2026-10-07 23:30，队长对盘核验后）
- **t2 验收通过**（四步全对盘核实：旧落点消失 / md5 一致 / 双清单同改 / lint 12/2 净增零）。真实 rc=1 与成员自述一致（队长首测 rc=0 系管道尾码误读，已重测纠正——教训：测退出码勿接管道）。
- **R-12 接受附带必改**：`_archive-20261007/` 补入 AGENTS.md 白名单 + lint ALLOW。理由：归属表「临时/证据产物→`_` 前缀目录」+ `_archive-20260930` 先例；不接受则归档动作自身产新增告警（自相矛盾）。代价若错：白名单略宽，巡检少抓一项——可随时摘除。
- **R-13 12 条既有白名单外告警 → backlog，不扩本波 scope**：条目属其他运行时组件活状态（whale-widget/workbuddy/dsh-web 的 whale-*、.dshw-*、.workbuddy-*），盲移会破坏运行中组件；.bak 两件可归档但非本波授权面。事实：告警账本已 2007 行且每小时+12 行噪声（23:04→23:30 实测 1956→2007），蒸馏通道修复后夜间清账本可对冲。**待用户裁定**：另行派卡归位 vs 入白名单 vs 维持现状。
- 自我修正：t2 合同验收「或仅剩 login-gate/dsh-usage 既有项」是我写错的预期（写时不知 12 条先例存在）；主口径「零新增告警」成立，成员按主口径判 passed 并显式记偏差=正确处置。

## R-14 2026-10-08 15:00 续轮（用户「继续」）盘面
- t1：attempt 1 产物已在树（422/422 绿、报告 23:45 落），但昨夜收尾中断未结算 → 调度器重派 attempt 2。
  队长裁决：发协调指令「核验+补交勿重做」（幂等，不打断在途）。
- t3：pending（依赖 t1）。t2：✅ 已结算。
- 隔夜 cron 20261008：wiki-ingest 与 hourly-check 依旧 MISSING_CREDENTIAL（凭据未修，符合预期——key 仍待用户）。
- 主需求（Hindsight 4 条）Phase 2 方案设计本轮由队长推进（IL-9：用户「继续」=放行信号，非队长催进）。
- t1 attempt 2 completed（核验补交形，队长指令有效）。队长冒烟抽验：dist 字面 epoch=1/N2 双文案各 1、422/422、lib/ 零改动=inScope 守住。质量终判移交 t3 复审（IL-2）。
- Phase 2 方案设计已落 `solution-design.md`（数据流/引擎契约/UI 面/Config+API/测试必红清单/U4 发散/开放项 6 条）。
- t3 复审 **pass**（4/4、blocker=none；5 组 /tmp 变异实验实证判别力 M1-M5；独立复跑 422/422+415 基线）。留痕 F1-F4。
- **F4 已处置**：commit e7a6ae7（19 文件 +3805/-102，含门禁文件全量；不 push 不 tag——发版五步留用户确认）。
- **R-15 F3 裁定**：不 defer，建 t4（repair r1，coder）+ t5（review，integrator 换人）收口。理由：本波=竞态收口波，同族残余再 defer 就是「W1 怎么欠出来的」重演（0.7.0 裁定原文「随下个反馈轮顺手收口」——现在就是下轮）；代价若错：多一轮卡的成本。F1/F2（报告笔误，N4 类复发）并入 t4 顺手修。
- t4 completed（F3=reloading 标记+请求级门禁+按钮 disabled 三层；7→10 测试；F1/F2 修正带依据=落笔前实测纪律）。队长抽验：425/425、dist 字面 epoch=1/loadOlderDisabled=2/N2 各 1、lib/ 零改动、F1/F2 对盘一致。移交 t5 复审（重点：reloading 标记 finally 清理条件的竞态正确性）。
- t5 复审 **needs_revision**（1 条 medium F-1）：F3 修复语义本身正确、三组变异实证主门禁判别力，但 `LogHistoryView.vue:31-33` finally 的 `if (mine===epoch.value) reloading.value=false` **零测试锁定**（变异 D 删之全量 425 仍全绿）——承重防线无判别力覆盖=回归盲区。
- 修复环自动化处置（协议：不重建不插手）：系统已建 t6（repair r2→coder，acceptance=F-1.requiredFix：补时序测试锁「重叠 reload 下门禁不被旧响应误清」）+ t7（review r2→integrator）。R-16 记：此为质量回路正常工作实证（IL-2 判别力口径：代码正确≠质量，测试锁定才=质量）。
- t6 completed（+1 时序测试锁 finally 条件，7→11；426/426）。队长抽验过。**R-17 合同口径教训**：系统自动 repair 卡的 inScope 取自 finding.requiredFix 文件位置，漏验收明文要求的报告路径——成员不越权+报备=正确处置，队长已 evidence_note 追认。**机制改进待办**：自动 repair 环建卡后队长即查 inScope 是否覆盖验收全产物，缺则 edit_plan 补（卡未启动前）或追认（完成后）。
- t7 **pass**（F-1 闭合：变异 D 从「425 全绿」翻转「恰 1 红」；三处门禁 code→test 全闭合；426/426；sha 恒等零污染）。t7⑤ scope 追认=t6 evidence_note + R-17 + commit body 三处在案，闭环。
- **竞态收口线封账**：commit e7a6ae7（W1+N2+t2 数据面）+ 000a7d6（F3+F-1）。全部 7 卡终态。
- 质量回路战绩实证：1 轮 needs_revision（F-1 判别力盲区）→ repair → 复审 pass——IL-2「测试锁定才=质量」的活例。

## R-18 开放项分诊 + 主需求实现卡进队（2026-10-08 17:2x，用户两轮「继续」）
- 用户连续两轮「继续」未答开放项 → 按「停摆即 bug」分诊：①②降级非阻塞（lint 校验方向=「AGENTS.md 写的路径须存在」，反向不强制）；**③ SCAN_DIRS 本轮动手**（链路硬前置+原始需求授权；untracked 脚本改前备份）；④真阻塞（key 值物理只有用户有；路由声明定位=clsh preset agent.cordis.yml，改=范围外）；⑤⑥不阻塞。
- 实现卡链（Phase 3 合同形=solution-design §9）：t8 引擎→t9 Config+API→t12 UI（串行契约链）｜t10 SCAN_DIRS 并行｜t11 tester 全链（deps t8/t9/t10/t12，edit_plan 补 t12 依赖边）｜t13 终审 reviewer-pro（deps t11/t12）。
- 派发过程留痕：UI 卡首建被拒（inScope 与 t8 重叠、缺直接依赖边）→ 补 deps [t8,t9] 重建成功；卡 id 与手工前缀错位（SCAN_DIRS 实为 t10）→ 后续卡去数字前缀。
- t10 completed（SCAN_DIRS +1 行恰 1 hunk、备份 md5 5330e15b 一致、raw/06-hindsight 空目录零 .md、scan 8 项 rc=0、wiki-lint IDENTICAL 零新增）。队长抽验 4/4 过（diff/落点/备份/scan 命中）。
- **R-19 双料教训（同族第 2 次）**：①合同 verify 命令「tail -8」截断看不到目标行（在第 2 行）——成员如实报告未越权改输出，正确；**verify 命令写法新规：取行用 grep -n / 带行号 head，禁裸管道切片**。②队长抽验自己又踩同坑（head -3|tail -1 取到第 3 行=0 命中，重查 grep -n 才命中）——**测退出码勿接管道**（t2 时已记）+ **取行勿管道切片**，合并为「验证命令稳定性」条目。成员建议已采纳为规范。
- t10 A 点（verify 字面会误导复审）已由本条吸收；B 点（wiki-lint 重写 lint-report.md 为工具固有）判正常留痕。
- t8 completed（引擎 273 行+测试 249 行；433/433；幂等双态以 inode 不变取证=真落盘验证；slug 碰撞边角留痕「provider::repo 形接受」）。队长抽验 4/4（计数/在场/红线关键词 13 处/web 零触碰）。t9 自动接棒。
- t9 completed（Config+4 端点+四处同步面+双侧一致性补锁=B 卡静默缺陷源收口；440/440）。队长抽验 4/4。**卡号口误两连**（t10 报告写「移交 t10」实为 t12、t9 同款）——卡 subject 数字前缀与系统 id 错位的后遗症；实质无碍（t12 合同自带 dist 判据），N4 类笔误并入 t13 终审校对面。

## R-20 合同自相矛盾裁定（t12 抓出，队长合同 bug 自曝）
- 现象：t12 objective 写「方案 A 零构建 React 不碰 dist」，inScope/验收却是 Vue+dist 重建（方案 C 纪律）——两套口径打架。
- 处置：artist 按可执行面（inScope+验收）执行 C 并报备=正确；方案定形 **C+A 混合**（solution-design §10 替代 §4）；R-8「A 不碰 dist」作废。
- 教训入账：**合同 objective/inScope/acceptance 落笔前必须互相对一遍口径**（本例三处出自不同章节、未做一致性校对）；与 N4/F1-F2「写前实测」同族=文档一致性纪律。
- 可达性缺口（t12②）成立：六控件无消费方=半成品 → **t14 挂载缝小卡**（deps t12），不入 backlog。t11/t13 依赖图同步补 t14。
- t12 结算（队长追认 A/C 口径冲突=合同 bug；451/451；六控件 data-hs-role 六键+色值零命中+dist 判据先红后绿）。
- t14 挂载缝卡已建（mechanic，deps t12）——可达性不入 backlog。依赖图：t13 deps 补 t14 成功；t11 已启动锁死 deps（edit_plan 拒改），改以 send_message 澄清验收口径（「设置节可见」归 t14、tester 按 dist 字面判据）。
- 派发教训（R-19 同族）：卡建晚于调度节奏时「先建全图再放调度」优于「边建边派」——本波 t11 先于 t14 启动即此因。后续建卡尽量同批补全依赖再等调度。
- t14 completed（挂载缝 usePanelMount 单一实现+内联 settings 渲染面；455/455=451+4；LRN-045 先红后绿实证（故意改旧字面→红→还原绿）；既有 view:'log' 4 断言一字未改零回退）。队长抽验 4/4——「越界 3 行」核实=t8/t9 未提交遗留（?? 新文件+t9 index.js），非 t14 越界，成员申报准确。t12② 可达性收口。
- commit 纪律：t8-t14 产物暂不 commit（t11 tester 在跑，防 git diff 面变化干扰其对盘）；t11+t13 波次收口统一 commit（F4 原则）。
- t11 completed（6/6 验收、84 子断言（e2e 54+API 30）、455/455 零回退、真 vault/home 零写入、幂等三不变取证）。队长抽验 3/3（真 vault 零写入复核/回归/报告在场）。
- t11 观察项采纳：生产安装位无新 routes（live 404 属无发版预期）→ **发版后补真 HTTP 冒烟**列入发版检查单（随发版五步走）。
- t11 亮点留档：白名单外 16 tracked 文件逐一核归属（obsidian-web×13=并行会话）而非放过——验证纪律到位。
- t13 整面终审（reviewer-pro）调度派发中=本波最后一卡。

## R-21 t13 终审 needs_revision（3 findings）+ t15 合同修订（2026-10-08 18:5x）
- t13 verdict=needs_revision：宪法红线/测试判别力（9 变异实验恰红）/发布物面（隔离重建 md5 与入库一致=src↔dist 字节同源）三项全过；**F1 high=定时触发面死键**（Config schedule.time 无消费方、文案承诺「到点触发」为假）——**根因=我的 t9 合同漏「接调度器」验收**（solution-design §3 有、合同没带）；F2 medium=bankSlug 碰撞跨 bank 互覆写（推翻 t8「接受边角」裁定——终审判超 INV-1 例外语义，正确，防覆写优先）；F3 low=§3「复用 queue.js」字面未兑现。
- 修法裁定：F1 取 (a) 补调度面（U2 明文「同步时间调整」，摘控件=需求缩水）；F2 取短哈希后缀（标头拒写会丢合法第二 bank）；F3 文档补注。
- **amend_task 实战首次**（captain-only）：t15 自动卡合同 inScope 只有 web/ 面（按 finding 文件位置生成），修法 (a) 需 lib/ ——「合同使诚实完成不可能」正是 amend 设计场景。修订留痕 1 revision；outOfScope 绝对路径被 scope 模式拒（改发版面相对路径）。已 send_message 通知 artist 重读合同。
- 教训（R-19 同族第 3 例）：**实现卡合同必须把设计文档的触发/接线面带进验收**——「设计有、合同漏」=死键温床（F1 与 t12 A/C 冲突、t6 scope 漏报同根：合同各段出自不同处未对口径）。
- t15 completed（F1(a) 调度面+L1 门禁/热改补跑/单飞/effect 零残留 6 测试；F2 短哈希分名——队长 node 直调 bankFileBase 实测三 bank 互异：cc928dc9/a3906a67/ad942f05；F3 文档补注；463/463=455+8）。t16 复审接棒。
- **R-22 amend 交接缝隙**：amend 后派单提示的 acceptance 仍是旧快照（3 条），成员按旧报被机械拒、改按新 6 条过——**机制待改进：派单提示应随 amend 同步**（插件层面问题，记 U4 候选）；成员踩坑留痕=正确处置。
- dist 重建时机留痕：t15 的 verify pnpm build 顺带修复了 dist 相对 web/src 的陈旧（含 t14 改动未重建）——t14 声称重建过但 t15 发现仍陈旧，t16 复审以重建后状态为准核 md5。
