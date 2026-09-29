# dispatch-record — 派发台账

> 变更：changes/2026-09-29-login-gate-settings/｜2026-09-29｜派发标识：DSH 会话内 subagent 委派
> 运行时证据：具名委派行（subagent_scout 等）在本运行时被拒——`subagent depth 1 exceeds maxDepth 0`（实测 2 次）；**实际执行面 = PATH A 通用 `subagent` 行**（可用，实测），角色契约内联 prompt。角色隔离声明：通用行无人格/toolFilter 隔离，仅契约+证据字段强制（如实声明，不冒充 PATH A 具名行）。

| 卡 | 委派 | 模型=provider/model | 状态 | 产出 |
|---|---|---|---|---|
| Task 0.4 需求②认证/超时分析 | subagent（scout 契约内联，只读） | 模型=继承会话默认（mimo-v2.6-pro 路由；通用行无 model 钉点） | ✅ | reports/scout-a-auth-timeout.md |
| Task 0.5 需求①③设置机制/优化空间分析 | subagent（scout 契约内联，只读） | 模型=继承会话默认（同上） | ✅ | reports/scout-b-settings-contract.md |
| Task 10 users.js 模块 | subagent（SDD implementer 契约内联） | 模型=继承会话默认（R-8：通用行无 model 参数，卡住升档=带说明 re-dispatch） | 🔄 running (agent ef54885f) | .superpowers/sdd/…/task-10-report.md（待） |
| Task 11 设置面服务端 | subagent（SDD implementer，T10 完成后派） | 同上 | ⬜ | |
| Task 12 设置栏目 UI | subagent（artist 契约） | 同上 | ⬜ | |
| Task 13 测试补全 | subagent（SDD implementer） | 同上 | ⬜ | |
| Task 14 测试环境验证 | subagent（tester 契约） | 同上 | ⬜ | |
| Task 15 复审/终审 | subagent（reviewer 契约）+ 队长 | 同上 | ⬜ | |

## SDD 环纪律（Phase 6）

- workspace=`.superpowers/sdd/tasks-2026-09-29-login-gate-settings/`（brief/report/progress 均在该目录）；BASE=0e02517
- 每卡 fresh implementer + 任务级审查（spec+质量双判定）+ ≤5 轮修复环（4-5 轮升档）+ 整分支终审（code-review-and-quality）
- 禁并行实现者；禁实现者自派 reviewer；控制器不代修 finding
- git 卫生：只 add dsh-login-gate/ 自有文件（树上有他会话 73 项未提交改动）

## 证据与抽查

- scout-a 关键常量协调者抽查复核：`lib/index.js:30`（sessionDays=30）、`lib/dsh-session.js:24`（TTL_MS=6h）、`lib/gate.js:73`（Max-Age）一致。
- 生产实况核查（协调者只读）：`/root/.dsh/profiles/web/cordis.patch.yml:22,25` = port 3500 / sessionDays 30。
- 回证要求（model-routing）：会话 `record.rows.modelSelection.lastUsed` 未单独回证（通用行继承会话默认）——记缺口，后续卡如需钉模型走 PATH B/C。

## 遗留 NEEDS_HUMAN / NEEDS_CONTEXT

1. NEEDS_HUMAN：Lucky 外网反代（家宽侧设备）改端口联动需人工同步（scout-b §五）。
2. NEEDS_CONTEXT（实测项）：configEditor Loader reconcile 是否重跑 login-gate apply——端口项按"重启生效"硬标处理（保守裁定）。
3. NEEDS_CONTEXT：kb-context 设置面 UX 波（T9-*）未执行——login-gate 设置页 UI 形制待其 brief 对齐，避免第三种形制分叉（Phase 2 议题）。
