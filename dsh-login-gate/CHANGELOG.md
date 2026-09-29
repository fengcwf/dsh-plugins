# Changelog — dsh-login-gate

## 0.3.0 — 2026-09-29（待发版：发版五步未执行，tag/push 待用户确认）
- **设置栏目**：dsh 设置菜单「dsh-login-gate」栏目（`settings.section` 槽）——端口维护 / 参数区 / 账号区 / 超时说明段四区一段；零构建单文件 `lib/client.js`（`__ModuleLoader__` 工厂形 + React.createElement）。
- **端口维护（US-1 / INV-7）**：端口可改（默认 3500，整数 1-65535）+ 服务端端口占用预检 + 保存前断连警示确认条（R-16 事前警示：确认才写入、取消零请求）+ 联动清单四行（gate-watchdog.sh:36 探活 curl 行 / start-dsh.sh:118-129 [3/3] 验证监听端口与门禁段 / obsidian-web 3500 `/ob_share` 分享契约 / Lucky 外网反代需人工同步）。
- **参数可配（US-2）**：`sessionDays`（1~3650）/`maxFailures`/`secureCookie`/`wsAllow`/`gzipPass` 5 键可改；`listenHost`/`upstreamPort`/`rewriteHost` 3 键只读展示；写入只经 `configEditor.edit` 白名单（白名单外整单拒 `not_editable`）。
- **账号 CRUD（US-4）**：新增/删除/改密，scrypt 哈希服务端生成 + `usersFile` 原子写 + 热加载即时生效；删除防自锁（`currentName` 取自 `/__gate/status`，拒删当前登录账号，取不到即 fail-closed）；响应/日志永不回显哈希（INV-3）。
- **保存语义（R-16）**：**即时生效 + 事前警示**——保存即经宿主 re-apply 应用（九键 apply 期快照、重 apply 重取），无需重启；唯一事前警示 = 端口保存前断连确认条。
- **超时说明（US-3）**：登录页/设置页明示「登录后约 N 天内免登录」（N=sessionDays 动态）+ 会话机制说明段（固定过期不滑动续期 / 到期 302 重登 / logout-all 全员下线）。
- **测试面**：72 用例全绿（认证回归 auth-regression 6 + 跨面契约对账 contract-e2e 3 + load 冒烟 2 + 设置面/账号 49 + users 原子写 12）+ integration 形（假 ctx 真 `apply()` + 真 handler）。
- **文档**：README 新增「设置面」「端口联动清单（INV-7）」「登录会话超时机制」章节 + Roadmap 改写；分析交付归档 US-5/US-6 = `changes/2026-09-29-login-gate-settings/reports/scout-a-auth-timeout.md`、`reports/scout-b-settings-contract.md`、`phase0-research.md` §五。
- 注：**发版五步未执行**——package.json 未 bump、未打 tag、未 push；tag/push/`gh release create` 待用户逐次确认（Task 8）。

## 0.2.0 — 2026-09-23
- 迁入 `fengcwf/dsh-plugins` monorepo（历史随迁自独立仓库 `fengcwf/dsh-login-gate` @`165f86b`，`git log` 可溯 v0.1.0–v0.1.3 原提交）。
- 分发形态改为**版本钉装的 git 快照**：`github:fengcwf/dsh-plugins#dsh-login-gate-v0.2.0&path:dsh-login-gate`（原 `github:fengcwf/dsh-login-gate` 独立 spec 停用）。
- 行为与 0.1.3 相同；补 `test/load.test.mjs` 加载冒烟。

## 0.1.3 —（原仓库 `165f86b`）
- WS tunnel 握手修复：`buildHeaders(upgrade:true)` 机制级保留 `Connection/Upgrade/Sec-WebSocket-*`（此前 hop-by-hop 剥离把握手降级为普通 GET → 上游 404 → 客户端"自动重连"死循环）；gate upgrade 传递 head buffer（早期 WS 帧不丢）；WS 连接超时 5s。
- 安全加固：上游绝对 Location 重写为 path（不泄漏回环地址）；`safeNext` 拒绝 `//`、`/\`、CRLF（开放重定向 + 响应拆分）；RFC 7230 §6.1 按 Connection 头剥离 hop-by-hop。
- e2e 22/22 绿（WS 101 透传、头完整性、cookie 隔离、白名单、回归）。

## 0.1.2 —（原仓库 `930aa80`）
- 修复 WS tunnel 握手：`forwardUpgrade()` 经 `buildHeaders()` 剥掉 hop-by-hop 头，上游收不到 upgrade（`/api/remote.mux` 404，网页无限重连）。

## 0.1.1 —（原仓库 `3d9b57c`）
- Mode B 改为原生 DSH 会话：startup token 换真实 session cookie（verified on dsh 0.1.5-rc.2）；credentials.yaml HMAC 铸造仅作兜底。
- 401 自愈：幂等请求遇上游 401 使缓存会话失效并重试一次（适配 dsh 重启 token 轮换）。
- 修复重复 `[login-gate]` 日志前缀。

## 0.1.0 —（原仓库 `8600a38`）
- 首版：表单登录门禁 + 反代（3500 → 3080）+ 用户管理（users.json）+ 失败锁定指数退避。
