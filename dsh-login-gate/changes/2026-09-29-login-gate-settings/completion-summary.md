# completion-summary — dsh-login-gate 设置面与认证优化（完成总结）

> 变更：changes/2026-09-29-login-gate-settings/｜完成：2026-09-29｜状态：代码+测试+文档+发版 tag 全部完成；生产同步待用户指定空档

## 完成摘要（summary / completion）

- **交付**（对照 PRODUCT.md US-1~6 / INV-1~7 全数达成）：
  1. dsh 设置菜单新增「dsh-login-gate」栏目（settings.section）：端口维护（可改默认 3500+占用预检+断连警示确认条+联动清单四行）、参数区（5 可改 3 只读）、账号增删改密（scrypt 服务端生成/usersFile 原子写/防自锁）、超时说明段（N 天免登录动态）。
  2. 用户问题②答案：登录会话**固定 30 天**（sessionDays 可配 1~3650）、无滑动续期、到期 302 重登（reports/scout-a-auth-timeout.md 全证据链）。
  3. 用户问题③答案：优化空间分析 + P2 候选六项留档（phase0-research.md §五 + README Roadmap）。
- **质量链**：12 轮 SDD 审查环（任务级×7 + scoped re-review×5）+ 整分支终审 **PASS**（0 blocker/high）+ 测试环境双轮实测（Task 14 四关 4/4+E2E a-f、COR-2 尖端补跑 C-5 级证据）。
- **测试**：`node --test` 72/72 绿（认证回归/跨面契约对账/原子写/设置面）；独立复跑实证。
- **发版**：0.3.0（release 提交 8f9847e，check-release PASS，tag `dsh-login-gate-v0.3.0` 已推 GitHub——ls-remote 实证）；gh release 未执行（用户未选）；生产同步待用户空档。
- **过程资产**：conversation/tasks/ledger/dispatch-record/phase0-research/TECH/PRODUCT/constitution/proposal/review-report/tester 报告群全在档。

## 关键裁定（详见 ledger.md / SDD progress.md）

R-1~R-18：门禁码呈现、执行路径实测、A 案即时生效语义（R-16 用户裁定）、共享仓插提交隔离（R-9×4）、归档布局（R-18）等。
