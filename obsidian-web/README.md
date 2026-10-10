# obsidian-web

## 用途

DeepSeek Harness（DSH）的 **Obsidian vault Web 管理插件**：在 dsh web 内提供 Web UI 查看/编辑/下载/分享笔记 + vault 目录维护。

- **主 UI 面零新增暴露面**（OW-INV-10）：UI 与 REST 挂 dsh web 同域 3080（`ctx.webServer.register`），逐路由过官方 `ctx.connection.requestRejection` 鉴权缝（Host/Origin 围栏 + 签名 cookie，OW-INV-8），不自起端口。
- **客户端面板**（0.2.0，照 skill-explorer 模块契约）：dsh web 侧栏「Obsidian vault」行 + main 槽页（iframe 复用 `/ob/` 三栏 UI），`lib/client.js` 零构建手写 + `package.json` `dsh.client` 声明。
- **分享面（0.2.0 双模式，默认零自有端口）**：唯一公开放行面 `/ob_share/<token>`，默认挂 `ctx.webServer`（dsh web 3080 同域）；可选独立 listener（`server.sharePort:number`）；对外契约 `3500 /ob_share/<token>` 由 login-gate/nginx 直通反代保持（PATH 契约非端口契约，OW-INV-2）；`share.enabled=false` 全 404 可单独关停。
- **写安全**：保存带 mtime/etag 乐观锁 + 冲突 diff undo（OW-INV-3）；改名/移动多文件 journal 事务（OW-INV-4）；删除 .trash 可逆（OW-INV-5）。

> 当前 0.3.0（已发版）含 T1-T14 全业务面 + 0.1.1 boot 失败修复（索引开库失败 fail-open + 索引库迁出 CIFS 落本地盘 `indexDir`）+ 0.2.0 fix-ui-port（分享面双模式默认挂 webServer 根治 3500/login-gate 冲突与 watchdog 掉服务 + 客户端面板菜单）+ 0.3.0 交互面（三栏拖拽分隔条 / 目录右键菜单 / 目录分享 / 插件自有统一背景）：阅读/搜索/分屏编辑/改名事务/可逆删除/下载导出/分享（live 面+管理面，含目录 target）/索引三保险/vault 目录档案/同页面板 UI/侧栏面板入口。

## 安装（钉版本）

```bash
# 安装/升级 = 钉版本 git 快照（升级 = 换新 tag 重执行同一条命令）
dsh plugin --profile web add 'github:fengcwf/dsh-plugins#obsidian-web-v0.3.0&path:obsidian-web'
/root/.dsh/start-dsh.sh        # 重启生效（会闪断会话，选空档执行）

# 卸载
dsh plugin --profile web remove obsidian-web
```

## 配置

配置走 profile 的 `cordis.patch.yml` 覆盖（**整行替换非深度合并**：覆盖者必须重述全部键），不改包内文件（快照会被升级冲掉）。

| 键 | 默认 | 说明 |
|---|---|---|
| `vaultRoot` | `/mnt/unraid_data/Obsidian` | 所有读写/下载/分享/目录维护的文件系统根（T12 起 realpath 围栏拒穿越/symlink） |
| `indexDir` | `~/.dsh/cache/obsidian-web` | 索引库基目录（本地盘，0.1.1 迁出 CIFS）：每 vault 一库 `<indexDir>/<vault 名-哈希>/`；空/缺省=出厂默认（`~` 按 os.homedir() 展开）；索引=可重建缓存（ARC-2），旧落点 `<vaultRoot>/.ob-index/` 检测到仅留痕提示重建、不自动删除 |
| `share.enabled` | `true` | 分享总开关；`false` 时 `/ob_share/*` 全 404（fail-closed） |
| `share.defaultTtlDays` | `7` | 分享链接默认有效期（天） |
| `share.requirePasswordForWrite` | `true` | 写权限强制访问密码（生成后可改） |
| `ui.pageSize` | `50` | 树/列表分页大小 |
| `server.sharePort` | `null` | 分享面模式（0.2.0 双模式）：`null`（默认）=挂 `ctx.webServer`（dsh web 3080 同域 `/ob_share`，零自有端口）；`number`=独立 listener（可选模式，可单独关停）。对外契约 `3500 /ob_share/<token>` 由 login-gate/nginx 直通反代保持（链接生成端口缺省恒 3500）。模式绑定=启动时配置值，热改需重启（restartRequired） |
| `server.shareHost` | `0.0.0.0` | 独立模式绑定面（webServer 模式不适用；要收口 loopback 反代场景显式配 `127.0.0.1`） |
| `server.trustProxy` | `[]` | 显式可信代理 IP 清单（缺省一律忽略 X-Forwarded-For，防换桶绕限流） |

## 发版检查清单（dsh-plugin-ops 版本纪律）

1. **版本纪律五步缺一不可**：bump `package.json` version → 本 CHANGELOG `## <ver> — <日期>` → 根 README 版本表同步 → `bash ../scripts/check-release.sh obsidian-web` PASS → commit + tag `obsidian-web-v<ver>` + push + `gh release create`。
2. **dist 与源码同 commit**（T2 交接检查项｜发版级机械锁：src/dist 同批由 check-release 把关）：`web/src`/`web/index.html`/`web/vite.config.js` 变更必须**同一 commit** 重构建入库 `web/dist`（快照安装零构建=线上即产物）；`scripts/check-release.sh` **commit 级校验**把关（基线=上个插件 tag，无 tag=未发版窗口全历史；构建输入变更未伴 `web/dist` 变更即 FAIL「重建 dist 同 commit」）；提交前 `npm run build` 并复核 `git diff --stat` 里 dist 与源码同批出现。
3. **token 快照刷新义务**（T13）：dsh 色板（dsh-client-ui-theme）升版后重跑 `node tools/extract-token-snapshot.mjs --write` 刷新分享页快照（缺定义 fail-loud）。
