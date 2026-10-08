# tasks.md — wiki-steward 2026-10-07 Hindsight 同步优化波

> 状态: ⬜ 待开始 | 🔄 进行中 | ✅ 已完成 | ❌ 失败/撤单
> 派发路径裁定见 `ledger.md` R-1。派发标识执行时写回（DSH job id / AgentTeams task id）。

## 用户需求（4 条原始命题）
- **U1** 分析 wiki 与 Hindsight 的搭配优化方案（记忆内容 → raw → ingest → wiki 等）
- **U2** 手动同步 Hindsight 功能 + 同步日历查看 + 同步时间调整
- **U3** Hindsight 状态分析 + 启停按钮
- **U4** 分析还能增加或调整什么功能（发散）

---

## Phase 0 任务卡（四件套，逐项转卡 —— ERRORS [2026-09-23] 机制化要求）

### Task P0-1：机械扫描（承载表①）
- status: ✅
- 证据：`phase0/phase0-data.json`（2026-10-07 09:11:45 UTC）
- 输出要点：项目 2510 文件 / 914 目录；tech_stack=[vue]；已识别 overview.md；
  changes_dirs 含本波 `2026-10-07-hindsight-sync`；obsidian.vault 可达 `/mnt/unraid_data/Obsidian`。

### Task P0-2：通读 ERRORS.md + LEARNINGS.md（承载表②）
- status: ✅（ledger.md「教训内化」节，7 条 + 行号）
- 关键约束已转 R-1/R-2 机制化落点。

### Task P0-3：本地历史文档扫描（承载表③）
- status: ✅（overview.md:37 + `changes/2026-09-29-settings-ingest-controls/` 先例 +
  `source-of-truth/constitution.md` 不变量面）
- **关键前置结论**：教训库 Hindsight 相关条目**零命中** → 本波首次，无前例可循。

### Task P0-4：调研摘要引用 ①②③（承载表④，IL-5/IL-6）
- status: ✅（`captain-recon-consolidation.md` + 本板 R-4~R-8 + B-1/B-2 阻塞）

### Task P0-A：Hindsight 集成面侦察（只读）
- status: ✅（scout-hindsight-integration.md 535 行）
- role: scout（通用 subagent 行；具名行被 maxDepth 拒，见 ledger R-1）
- 交付：`phase0/scout-hindsight-integration.md`
- 验收：① dsh.js 注册面（导出/事件/工具名）② knowledge-pages 可读端点【实测 curl】
  ③ 启停三层语义与诚实结论 ④ CLI 可用命令 ⑤ 播种进度判据；每条标【实测】/【推断】

### Task P0-B：wiki-steward web 面板面侦察（只读）
- status: ✅（scout-wiki-steward-web.md 766 行）
- role: scout
- 交付：`phase0/scout-wiki-steward-web.md`
- 验收：① 设置页签注册机制原文 ② 前端依赖图 ③ 新增端点+页签改动清单 ④ dist 入库流程
  ⑤ 会被新增破掉的测试契约逐条 ⑥ Config/EDITABLE_PATHS 扩键路径

### Task P0-C：vault ingest 链路侦察（只读）
- status: ✅（scout-vault-ingest.md）
- role: scout
- 交付：`phase0/scout-vault-ingest.md`
- 验收：① ingest-pipeline.py 子命令与扫描范围 ② SCHEMA/INDEX 原文摘录 ③ raw 落点建议
  ④ raw 新目录是否破约定（含 AGENTS.md「不写其他 raw/ 区」铁律判定）⑤ 幂等去重面

---

## 宪法约束面（本波新增功能必须遵守，源 `source-of-truth/constitution.md`）
- **INV-1** raw 只增不改（唯一例外=sha256 机械回写）→ **同步产物不得改写 raw 既有内容**
- **INV-15** 测试无 mock/无跳过；失败零静默（degraded/告警留痕）
- **构造性强制 v1.5** 新端点不得做输入改写式拦截
- **红线** 禁语义编译脚本（LLM 蒸馏归 wiki-ingest 任务）
  → ⚠️ **本波「同步」必须是机械转录**（记忆原文落盘），绝不在插件内做 LLM 蒸馏
- **红线** vault 侧写必过 secrets 脱敏 + realpath 围栏
  → ⚠️ 记忆内容可能含敏感信息，**同步落盘前必须过 `lib/secrets.js` 脱敏**

---

## 待派卡（Phase 1 澄清后展开）
- （占位）Phase 1 需求澄清：一次一问，维度轮转
- （占位）Phase 2 方案设计 / Phase 3 设计文档
- （占位）Phase 6 实现波 —— **进 Phase 6 前必回用户面裁定 PATH C 是否启用**（ledger R-1）

---

## 🔴 阻塞项（Phase 1 必须先解，否则后续空转）
### B-1 蒸馏通道断裂（队长实测确认）
cron #21 连续多日 `MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"` exit 1。
**影响**：raw 落了也编译不出 wiki → 「记忆→raw→wiki」链断。
**待用户裁定**：是否在本变更内修复？修的话走 credentials service 还是 export 环境变量？

### B-2 同步源端成熟度
pages body 全 0 / facts 354 条有正文。已裁 R-4（走 facts），
但**是否先让知识页播种成熟**（`gitDiffTarget:155` 待播种）待用户定。

## 待用户拍板清单（Phase 1 澄清，IL-9 停条件归用户）
1. **启停语义**：L1 停同步（无风险）/ L2 改配置（需重启 dsh）/ L3 停容器（不可逆）
   → 你要的是「停同步」还是「停记录」？
2. **设置页落地**：方案 A（扩 settings.section 零构建 React，不碰 dist）/ C（Vue 新组件需重建 dist）
3. **B-1 蒸馏通道**：本变更内修 or 不修
4. **B-2 源端**：先播种 or 直接走 facts
5. **两处 AGENTS.md 修改**（R-7 条件②④，红线项）

## AgentTeams 派发板（PATH C，2026-10-07 23:20 建队，staged 待用户审批）
| 卡 | 类型 | 成员 | 依赖 | 状态 |
|----|------|------|------|------|
| t1 W1 epoch 守卫+N2 | implementation | coder | — | staged |
| t2 数据面收口尾项 | work | mechanic | — | ✅ 完成（23:28 报告，队长对盘核验通过；reports/data-closeout-report.md） |
| t3 复审 t1 | review | reviewer | t1 | staged |
| （预留）凭据修复 | 待定 | 待定 | 用户①/②+key | 未建 |
| （预留）Hindsight 功能卡 | implementation 等 | 待定 | Phase 1-3 | 未建 |
