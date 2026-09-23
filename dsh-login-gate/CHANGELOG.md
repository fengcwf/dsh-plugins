# Changelog — dsh-login-gate

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
