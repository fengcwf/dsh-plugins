# obsidian-web

## 用途

DeepSeek Harness（DSH）的 **Obsidian vault Web 管理插件**：在 dsh web 内提供 Web UI 查看/编辑/下载/分享笔记 + vault 目录维护。

- **主 UI 面零新增暴露面**（OW-INV-10）：UI 与 REST 挂 dsh web 同域 3080（`ctx.webServer.register`），逐路由过官方 `ctx.connection.requestRejection` 鉴权缝（Host/Origin 围栏 + 签名 cookie，OW-INV-8），不自起端口。
- **分享面**：唯一公开放行面 `/ob_share/<token>`（独立服务，默认逐条显式生成、不对外），可单独关停。
- **写安全**：保存带 mtime/etag 乐观锁 + 冲突 diff undo（OW-INV-3）；改名/移动多文件 journal 事务（OW-INV-4）；删除 .trash 可逆（OW-INV-5）。

> 当前 0.1.0（未发版）含 T1-T14 全业务面：阅读/搜索/分屏编辑/改名事务/可逆删除/下载导出/分享（live 面+管理面）/索引三保险/vault 目录档案/同页面板 UI。

## 安装（钉版本）

```bash
# 安装/升级 = 钉版本 git 快照（升级 = 换新 tag 重执行同一条命令）
dsh plugin --profile web add 'github:fengcwf/dsh-plugins#obsidian-web-v0.1.0&path:obsidian-web'
/root/.dsh/start-dsh.sh        # 重启生效（会闪断会话，选空档执行）

# 卸载
dsh plugin --profile web remove obsidian-web
```

## 配置

配置走 profile 的 `cordis.patch.yml` 覆盖（**整行替换非深度合并**：覆盖者必须重述全部键），不改包内文件（快照会被升级冲掉）。

| 键 | 默认 | 说明 |
|---|---|---|
| `vaultRoot` | `/mnt/unraid_data/Obsidian` | 所有读写/下载/分享/目录维护的文件系统根（T12 起 realpath 围栏拒穿越/symlink） |
| `share.enabled` | `true` | 分享总开关；`false` 时 `/ob_share/*` 全 404（fail-closed） |
| `share.defaultTtlDays` | `7` | 分享链接默认有效期（天） |
| `share.requirePasswordForWrite` | `true` | 写权限强制访问密码（生成后可改） |
| `ui.pageSize` | `50` | 树/列表分页大小 |
| `server.sharePort` | `3500` | 分享服务独立端口（唯一独立入口，可单独关停） |
| `server.shareHost` | `0.0.0.0` | 分享服务绑定面（要收口 loopback 反代场景显式配 `127.0.0.1`） |
| `server.trustProxy` | `[]` | 显式可信代理 IP 清单（缺省一律忽略 X-Forwarded-For，防换桶绕限流） |

## 发版检查清单（dsh-plugin-ops 版本纪律）

1. **版本纪律五步缺一不可**：bump `package.json` version → 本 CHANGELOG `## <ver> — <日期>` → 根 README 版本表同步 → `bash ../scripts/check-release.sh obsidian-web` PASS → commit + tag `obsidian-web-v<ver>` + push + `gh release create`。
2. **dist 与源码同 commit**（T2 交接检查项）：`web/src`/`web/vite.config.js` 变更必须**同一 commit** 重构建入库 `web/dist`（快照安装零构建=线上即产物）；提交前 `npm run build` 并复核 `git diff --stat` 里 dist 与源码同批出现。
3. **token 快照刷新义务**（T13）：dsh 色板（dsh-client-ui-theme）升版后重跑 `node tools/extract-token-snapshot.mjs --write` 刷新分享页快照（缺定义 fail-loud）。
