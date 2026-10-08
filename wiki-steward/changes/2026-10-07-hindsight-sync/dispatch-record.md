# dispatch-record — wiki-steward 2026-10-07 波（Hindsight 同步 + 遗留收口）

> **派发路径裁定**：PATH C（AgentTeams，队名 `wiki-steward-hindsight-wave`，profile:clsh，staged 待用户 GUI 审批）。
> 历史留痕：Phase 0 三张只读侦察卡走通用 `subagent` 行（具名 subagent_scout/implementer/reviewer/tester 被运行时拒
> `subagent depth 1 exceeds maxDepth 0`——环境缺陷）；用户质询「为什么不是创建 agent-teams」后当轮建队（ERRORS [2026-09-30]
> 同型第 3 次触发，处置=建队 + 本行留档）。
> 模型路由钉在成员上（clsh profile）：coder=pro、mechanic=flash、reviewer=flash（卡级记录见下表）。

| 卡 | 类型 | 成员 | 依赖 | 模型 | 状态 | 结算证据 |
|----|------|------|------|------|------|---------|
| t1 W1 epoch 守卫+N2 互斥 | implementation | coder | — | mimo-v2.6-pro | ✅ attempt 2 completed（attempt 1 产物+核验补交；422/422；队长冒烟抽验 dist 字面 1/1/1、lib/ 零改动；报告 w1-epoch-guard-report.md） |
| t2 数据面收口尾项（归档+清单摘除） | work | mechanic | — | mimo-v2.6-flash | staged 待批 | 待 |
| t3 复审 t1 | review | reviewer | t1 | mimo-v2.6-flash | 🔄 调度器派发中（t1 依赖已满足） | 待 |
| （预留）凭据修复 | 待定 | 待定 | 用户 ①/② 裁定 + key | — | 未建（NEEDS_HUMAN） | — |
| （预留）Hindsight 功能卡（同步/日历/状态/启停 L1） | implementation 等 | 待定 | Phase 1-3 裁定 | — | 未建 | — |

修复环纪律：审查 needs_revision 自动回原实现者修复 + 换人复审；≤3 轮 codeMaxRounds，超限 escalated 人工裁决。
