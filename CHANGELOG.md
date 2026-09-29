# CHANGELOG — fengcwf/dsh-plugins

> 纪律：每次更新 = 版本号 + 更新记录（本文件 + 各插件 `CHANGELOG.md` + tag `<插件名>-v<版本>`）。

## 2026-09-29
- `dsh-github-ops` **0.3.0（设置栏目 + 数据面 + 层①命令强制层修复，未发版）**：dsh 设置菜单「GitHub 集成」栏目（六卡：认证状态/访问检验/Token 维护/多账号库/仓库上下文/插件自检）+ 数据面 `/api/github-ops/*` 8 端点（首行鉴权、1MiB 请求有界、zod 白名单校验）+ **层①命令强制层接线死锁修复**（0.2.1 `ctx.effect` 拆除器形致包壳即死，curl/wget token 注入与 `git clone` 改写从未生效 → 工厂形接线 + 双断言锁死）；`node --test` 全绿 **112/112**（终审判定基线 109/109 + 终审修复波 3 断言）+ `.testenv` boot 冒烟四关全绿（含多 chunk 嵌套链与 GUI 栏目在场双断言）。详见 `dsh-github-ops/CHANGELOG.md` 与 `dsh-github-ops/changes/20260929-phase0/`；tag `dsh-github-ops-v0.3.0` 归发版波。
- `dsh-rtk-kit` / `dsh-github-ops` **0.2.1（兼容面，随 dsh 0.2.0-rc.1 升级发版）**：`peerDependencies`（`@deepseek-ai/dsh-tools`/`dsh-llm`）与 `dsh.plugin.json` engines 上界 `<0.2.0-0` → `<0.3.0-0`，放行 dsh 0.2.x；行为零变更。背景=0.2.0-rc.1 版本门禁拒载（`docs/test-env-upgrade-020-2026-09-29.md` §2 + `dsh-research/31-dsh升级0.2.0-rc.1分析.md`）；两插件 checkout 测试绿（rtk-kit 9/9、github-ops 16/16）。

## 2026-09-28
- `kb-context` **0.3.1（Phase 8 修复波，未发版）**：B1 服务缝取得修复（softService 软取得 → 双层子插件 `ctx.plugin` 硬 inject + configEditor 惰性求值，`/api/kb-context/settings` 真运行时可注册；修前"测试全绿但线上 404"）+ B2 effect 工厂语义修复（注册放执行体、返回值=拆除器、拆除期全撤零泄露；修前注册当场自拆）+ zod 依赖归类（peer→`dependencies`，第三方统一进 dependencies 裁定）；来源报告 `docs/test-env-deploy-3plugins-2026-09-28.md`；详见 `kb-context/CHANGELOG.md`；tag `kb-context-v0.3.1` 归发版波。
- `obsidian-web` **0.2.0（能力增强，未发版）**：问题 A 分享面双模式（照 dsh-better-sidebar 路线）——默认零自有端口挂 `ctx.webServer`（`/ob_share` 同域 3080），`server.sharePort:number|null`（number=独立 listener 可选），对外契约 `3500 /ob_share/<token>` 由 login-gate/nginx 直通反代保持（PATH 契约，OW-INV-2 批注）；独立模式 listener 失败 fail-open（绝不炸装载/宿主=watchdog 掉服务根因回归，start/syncState/handle 全路径零 unhandledRejection + 自愈重试）；问题 B 客户端面板菜单（照 skill-explorer 模块契约）——`dsh.client` 声明 + 零构建 `lib/client.js`（`sidebar.panellist` 行「Obsidian vault」+ main 槽页 iframe 指 `/ob/` 三栏 UI）。详见 `obsidian-web/CHANGELOG.md`；tag `obsidian-web-v0.2.0` 归发版波。
- `obsidian-web` **0.1.1（bug 修复，未发版）**：boot 失败修复——索引库开库失败（CIFS 挂载 SQLite 锁语义 → `database is locked`）不再炸插件装载：fail-open + degraded 留痕（INV-15）+ `busy_timeout`/小退避重试自愈 + 检索 scan 兜底 + refresh 503 可解释；**后续收口（同版本）：索引库迁出 CIFS 落本地盘 `indexDir`**（缺省 `~/.dsh/cache/obsidian-web/`，每 vault 一库 `<indexDir>/<vault 名-哈希>/`；旧落点 `<vaultRoot>/.ob-index/` 检测留痕不静默删）——FTS5 速度面恢复（300 篇冷建 362ms/MATCH 查询 19.5ms 实测）；详见 `obsidian-web/CHANGELOG.md`；tag `obsidian-web-v0.1.1` 归发版波。

## 2026-09-26
- `obsidian-web` **0.1.0 开发完成（未发版）**：T1-T14 垂直切片全业务面（阅读/搜索/编辑/改名事务/可逆删除/导出/分享/索引/vault 档案/同页 UI）+ T14 集成验收收口；内容逐版本如实记于 `obsidian-web/CHANGELOG.md`；tag `obsidian-web-v0.1.0` 与发版归发版波。

## 2026-09-23
- 初始化 monorepo：`dsh-rtk-kit` **0.2.0**、`dsh-github-ops` **0.2.0** 迁入（原 `~/.dsh/plugins/<pkg>` 独立目录）。分发形态从 link: 安装切换为**版本钉装的 git 快照安装**；插件行为与 0.1.0 相同，无功能变更。
