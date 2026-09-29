# Changelog — dsh-github-ops

## 0.3.0 — 2026-09-29
- 新增 dsh 设置菜单「GitHub 集成」栏目（settings.section + 多座兼容）：认证状态卡、token 维护（留空=不修改、保存即验证、全程零明文）、访问检验（三段探针，`probeTimeoutMs: 3000` 可配）、多账号库（展示/录入/验证/切换 active，无删除登出）、仓库上下文卡、插件自检 health + 限额可视化与分级错误文案。
- 数据面 `/api/github-ops/*` 8 端点（首行鉴权、1MiB 请求有界、zod 白名单校验、结构化错误）。
- **修复命令强制层接线死锁**：0.2.1 的 `ctx.effect` 拆除器形致包壳即死，curl/wget token 注入与 `git clone` 改写**从未生效**；改为工厂形（shell.resolve 包装）+ 双断言锁死。
- 测试面：integration 形（假 ctx 真 `apply()` + 真 handler）与退化形/失败形收口，`node --test` **109/109** 全绿（含 load 真 import 冒烟 + 既有 16 测试零回归）；`.testenv` boot 冒烟四关待 Task 17 执行。
- 发版面欠账清理：`package.json` 补 `repository`（W-3）、`files` 补 `CHANGELOG.md`（N-1）、工具计数 10→11 同步（M12-2：description 与 `cordis.patch.yml` 注释）、`scripts.check` 补齐全部 lib 文件 `node --check` 面（T13 carry）；`dsh.plugin.json` 保留（N-2 处置）——社区工具发现惯例、官方 dsh 不读取，用途说明记 `README.zh.md`（严格 JSON 禁注释，LRN-035），版本随 `package.json` bump。

## 0.2.1 — 2026-09-29
- 兼容面（行为零变更）：`peerDependencies`（`@deepseek-ai/dsh-tools`/`dsh-llm`）与 `dsh.plugin.json` engines 上界 `<0.2.0-0` → `<0.3.0-0`，放行 dsh 0.2.x（含 0.2.0-rc.1）。背景：0.2.0-rc.1 版本门禁拒载实测（`docs/test-env-upgrade-020-2026-09-29.md` §2）。

## 0.2.0 — 2026-09-23
- 迁入 `fengcwf/dsh-plugins` monorepo；分发形态改为**版本钉装的 git 快照安装**（弃用 link:）。
- 行为与 0.1.0 相同。

## 0.1.0 — 2026-09-23
- 首版：GitHub 命令强制 token 模式（curl/wget 注入 `$(gh auth token)`、`git clone` → `gh repo clone`）、web_fetch 匿名 API 门禁（api.github.com 等 deny）、11 个仓库管理工具（gh 后端，删除双闸 confirm+allowDelete、`github_api` 非 GET 需 confirm）。
