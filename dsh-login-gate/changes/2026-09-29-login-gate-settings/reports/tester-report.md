# tester-report.md（Phase 6 / Task 14 测试环境验证）— 指针页

**正本 = `.superpowers/sdd/tasks-2026-09-29-login-gate-settings/task-14-report.md`**（同名互指约定：本页为阶段门禁文件位指针，命令输出证据/发现分级/回收核对全在正本；正本同目录另有 `tester-report.md` 指针页）。

- 状态：DONE_WITH_CONCERNS
- 四关：换票 303→200 / dump-config 含 login-gate 层 / node --test 69/69 / load 冒烟 2/2 + 快照真 import —— 4/4 PASS
- E2E：门禁登录流 6/6、设置页（combo 模块可取 + settings.section 注册捕获 + 真组件真数据面渲染树 21/21）、端口保存回显+R-12 回读、参数保存回读、账号增删改密 9/9、未登录 401 + 零哈希 —— 全达成（浏览器渲染相未取证，兜底证据链+边界注明）
- 发现：F-1【high】写入热生效 vs「需重启生效」（宿主 configEditor.resolveConfig 重 apply、门禁即时换端口）；F-2【medium】「服务缝半缺未注册」告警误导；F-3【low】重复删除 not_found（仅记录）
