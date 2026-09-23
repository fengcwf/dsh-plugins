# Changelog — dsh-rtk-kit

## 0.2.0 — 2026-09-23
- 迁入 `fengcwf/dsh-plugins` monorepo；分发形态改为**版本钉装的 git 快照安装**（弃用 link:）。
- 行为与 0.1.0 相同（bash 命令 rtk 改写 resolve 缝 + session-start awareness + rtk_doctor）。

## 0.1.0 — 2026-09-23
- 首版：`lib/rewrite.js` 纯改写决策（`rtk rewrite` 缝、fail-open、元字符/凭据防护、排除清单）、3 级会话 awareness 注入、`rtk_doctor` 诊断工具。
