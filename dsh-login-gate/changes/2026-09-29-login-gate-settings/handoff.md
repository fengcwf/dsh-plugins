# handoff — dsh-login-gate 设置面与认证优化（交接 / 后续 / 剩余）

> 变更：changes/2026-09-29-login-gate-settings/｜2026-09-29

## 已完成（无剩余代码工作）

0.3.0 全波：实现/测试/文档/终审 PASS/tag `dsh-login-gate-v0.3.0` 已推 GitHub（安装：`dsh plugin --profile web add 'github:fengcwf/dsh-plugins#dsh-login-gate-v0.3.0&path:dsh-login-gate'`）。

## 剩余事项（后续交接）

1. **生产同步（待用户指定空档）**：换 tag 重装 + `/root/.dsh/start-dsh.sh` 重启（重启杀死当前会话宿主，须避开使用时段）；重启后核对：门禁 health、3500 入口、设置栏目出现、Lucky 外网反代照常。
2. **gh release create**：用户未选，需要时执行 `gh release create dsh-login-gate-v0.3.0 --title 'dsh-login-gate v0.3.0' --notes-file dsh-login-gate/CHANGELOG.md`（或取 0.3.0 条目）。
3. **改端口时的人工联动**（INV-7/NEEDS_HUMAN）：Lucky 外网反代目标端口需家宽侧设备人工同步；gate-watchdog/start-dsh.sh 文档已给行号锚点。
4. deferred 17 项（终审分诊全部「可留」）：下波触碰时随手清（清单见 review-report.md 分诊结论 + SDD progress.md）。
5. P2 候选六项：滑动续期/记住我/logout 真吊销/限流时间窗/WS 过期引导/小时级超时（README Roadmap 已列）。
