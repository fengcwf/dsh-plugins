# Changelog — dsh-github-ops

## 0.2.0 — 2026-09-23
- 迁入 `fengcwf/dsh-plugins` monorepo；分发形态改为**版本钉装的 git 快照安装**（弃用 link:）。
- 行为与 0.1.0 相同。

## 0.1.0 — 2026-09-23
- 首版：GitHub 命令强制 token 模式（curl/wget 注入 `$(gh auth token)`、`git clone` → `gh repo clone`）、web_fetch 匿名 API 门禁（api.github.com 等 deny）、11 个仓库管理工具（gh 后端，删除双闸 confirm+allowDelete、`github_api` 非 GET 需 confirm）。
