# handoff.md — 交接（2026-09-29-github-ops-settings）

## 后续/剩余事项

1. **发版五步⑤（待用户逐次确认）**：tag dsh-github-ops-v0.3.0 → push → gh release create；check-release.sh 已 PASS 除 tag TODO。工作树有未提交变更（项目文档 ledger/tasks/changes 大部分 untracked）需先结清。
2. **生产启用（待用户空档）**：`dsh plugin --profile web add 'github:fengcwf/dsh-plugins#dsh-github-ops-v0.3.0&path:dsh-github-ops'` + 重启（会杀会话宿主进程）。
3. **backlog 池**（终审 triage 定案，~25 条）：M-7 spawnSync 阻塞事件循环（建议 async spawn 或 README 标注，Major 降级）、hint 旋钮指错/writeToken hint 矛盾、verified Set 键形、busy finally、静默 catch warn、labelOf 正则形、hint 三副本文案收敛、DESIGN.md token 表名校订（--dsw-alias-* 真名）、/repo-context workspace 投影字段、幻影 host 行、apiFetch `..` 滤除等——全量清单见 reports/sdd-evidence/sdd-ledger.md 与 review-report.md。
4. **Phase 8 优化循环**：用户使用反馈驱动（停止条件在用户）。
