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
