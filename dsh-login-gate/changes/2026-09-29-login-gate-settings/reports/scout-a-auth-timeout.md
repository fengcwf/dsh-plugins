# 侦察报告 A：dsh-login-gate 登录认证 / 会话超时机制（只读）

> 来源：PATH A 通用 subagent scout（2026-09-29）；未修改任何文件。路径相对 `/opt/workdata/dsh-plugins/dsh-login-gate/`；dsh 宿主 `/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-connection/` 简写 `dsh-cc/`。
> 抽查核验（协调者）：`lib/index.js:30`（sessionDays 默认 30）、`lib/dsh-session.js:24`（TTL_MS=6h）、`lib/gate.js:73`（Max-Age）三条已复核一致。

**一句话结论**：门禁会话 **固定 30 天**（`sessionDays=30`，登录签发后请求不续期），到期后访问任意 URL 被 **302 到登录页重新登录**；dsh 原生注入会话另有 **6 小时内部刷新周期**（真实 dsh cookie 本身 30 天）。生产实况（/root/.dsh/profiles/web/cordis.patch.yml:22,25）：`port: 3500`、`sessionDays: 30` 显式覆盖。

## 【凭证与过期时间表】

1. **登录成功发放**：HMAC-SHA256 签名的无状态 Cookie 令牌，Cookie 名 `dlg_sid`（`lib/auth.js:58`）；格式 `b64url(JSON{u,iat,exp}).b64url(HMAC)`（`lib/auth.js:63-64`）；签名 secret 持久化 `$DSH_HOME/login-gate/secret`（0600，`lib/index.js:42-44,47-61`），写失败退内存 secret → 重启后会话全失效（`lib/index.js:59`）。Set-Cookie：`Path=/; HttpOnly; SameSite=Lax[; Secure]` + `Max-Age=sessionDays*86400`（`lib/gate.js:72-73`）。

2. **过期时间常量清单**

| 常量 | 值 | 位置 |
|---|---|---|
| `sessionDays` zod 默认 | **30 天**（范围 1~3650） | `lib/index.js:30` |
| `sessionDays` normalize 兜底 | 30 | `lib/index.js:72` |
| `sessionDays` 生产显式 | 30 | `cordis.patch.yml:21`；`/root/.dsh/profiles/web/cordis.patch.yml:25` |
| 令牌 `exp` | 签发时刻 + `sessionDays*86400` 秒 | `lib/gate.js:123`、`lib/auth.js:63` |
| Cookie `Max-Age` | `sessionDays*86400` 秒（=2592000） | `lib/gate.js:73` |
| 过期判定 | `Date.now() > payload.exp` 即拒 | `lib/auth.js:81` |
| dsh 注入 cookie 内部刷新周期 `TTL_MS` | **6 小时** | `lib/dsh-session.js:24` |
| 模式 C 自铸 cookie `expiresAt` / 刷新 | now+6h / 3h 后刷新 | `lib/dsh-session.js:137,140` |
| **dsh 宿主侧** `cookieMaxAgeDays` | **30 天** | `dsh-cc/lib/index.js:802,815`；`dsh-cc/lib/types/index.d.ts:43` |
| dsh cookie `expiresAt` | `issuedAt + maxAgeDays*24h` | `dsh-cc/lib/index.js:396`（`DAY_MILLISECONDS` `:224`） |

3. **固定过期，无滑动续期**：普通请求只 `verifyCookie` 校验、不写 Set-Cookie 不重签（`lib/gate.js:153`；`lib/auth.js:68-93`）；Set-Cookie 仅登录成功（`lib/gate.js:125`）与 logout/logout-all（`lib/gate.js:73,75,137,144`）。**30 天从登录那刻算起，与活跃度无关**。dsh 宿主侧同样固定过期，但门禁每 6h 用启动 token 重兑换，注入侧实际滚动续命。

4. **与 dsh token/会话的关系**：门禁持有的 dsh 会话 = `GET http://127.0.0.1:<upstreamPort>/?token=<启动token>` 兑换的真实 `dsh-auth-*` cookie（`lib/dsh-session.js:3-8,105`；dsh 签发 `dsh-cc/lib/index.js:394-408`）；启动 token 来自 `$DSH_HOME/web-url.txt` / `dsh-web.log` 实时读取（`lib/dsh-session.js:89-92,101-104`），dsh 每进程随机（`dsh-cc/lib/index.js:244-250`）重启即换。**浏览器只持有 `dlg_sid`，dsh-auth cookie 由门禁服务端缓存注入**（`lib/index.js:107`、`lib/proxy.js:48-57`）。
   - **错位 A（gate 活、dsh 会话获取失败=模式 D）**：门禁放行但转发无原生 cookie → 上游 401。GET/HEAD 自动重兑换重试一次（`lib/proxy.js:115-123`）；仍 401 时用户看到 dsh 明文 *"dsh web authentication required..."*（`dsh-cc/lib/index.js:443-451`）——**门禁已登录却看到 401**。POST 与 WS 不重试（`lib/proxy.js:116` 限定 GET/HEAD）。
   - **错位 B（dsh 重启换 token）**：每 6h 刷新周期或 401 自愈自动跟随新 token（`lib/dsh-session.js:9-10,109`）。
   - **错位 C（gate 过期、dsh 注入会话仍有效）**：302 回登录页重登即恢复——**最常见"需要重新登录"路径**。两套 30 天独立可配（`lib/index.js:30` vs `dsh-cc/lib/index.js:802`），实际瓶颈永远是 gate 会话。

5. **重新登录触发**：过期后任意 URL **302 → `/__gate/login?next=<原URL>`**（`lib/gate.js:153-157`）；WS upgrade → **401 + socket destroy**（`lib/gate.js:168-174`）；`/__gate/status` → 401 JSON（`lib/gate.js:146-148`）。登录页**无"记住我"、无验证码**（表单 u/p/next，`lib/login-page.js:42-49`）；页脚"登录后约 N 天内免登录"（`lib/login-page.js:50`）。失败锁定=每 IP 指数退避（5 次起锁 `30s×2^超出`、封顶 300s，`lib/ratelimit.js:5,21-24`），锁定期 429+retry-after（`lib/gate.js:106-109`），成功清零（`lib/ratelimit.js:30-32`）；未命中用户名走哑 scrypt 防枚举（`lib/gate.js:59,116`）。

7. **限流**（`lib/ratelimit.js:5`）：`maxFailures=5`（`lib/index.js:31`、`cordis.patch.yml:23`）、`baseLockMs=30_000`、`maxLockMs=300_000`；锁定 `= min(30s×2^(fails−5), 300s)`。**无时间窗口**——失败计数只增不衰减、成功才清；内存态重启清空，>4096 桶才 prune（`lib/ratelimit.js:35-41`）。

## 【时序行为】

1. **T0 登录**：scrypt 恒时校验（`lib/auth.js:26-49`）→ issue 令牌 `exp=T0+30d`（`lib/gate.js:123`）→ 302 + `Set-Cookie: dlg_sid=…; Max-Age=2592000`（`lib/gate.js:125,72-73`）。
2. **T0~T0+30d 每请求**：验 HMAC+exp（`lib/auth.js:68-91`）→ 转发，**不刷新**（`lib/gate.js:153-159`）；剥离 dlg_sid、注入 dsh-auth（`lib/proxy.js:48-57`）；注入 cookie 每 6h 重兑换；上游 401（GET/HEAD）重兑换重试一次（`lib/proxy.js:115-123`）。
3. **T0+30d 后**：exp 拒（`lib/auth.js:81`）→ 302 登录页；WS 401。
4. **提前全失效**：任意登录用户 `POST /__gate/logout-all` → 轮换并持久化 secret（`lib/gate.js:139-145`、`lib/index.js:99-102`）→ 全部会话立即作废（`lib/auth.js:55-56`）；单用户 logout 只清自己 cookie（`lib/gate.js:136-138`）。
5. **进程重启**：门禁 secret 从文件恢复→会话续命（`lib/index.js:47-53`）；dsh 重启换 token，门禁自动跟随。

## 【配置面清单】

zod `Config` 全键（`lib/index.js:24-37`）：`enabled`(true) / `listenHost`('127.0.0.1') / `port`(3500) / `upstreamPort`(3080) / `rewriteHost`(true) / `sessionDays`(30，1-3650) / `maxFailures`(5) / `secureCookie`(true) / `wsAllow`(['^/api/']) / `gzipPass`(true) / `users`({}) / `usersFile`(可选，缺省 `$DSH_HOME/login-gate/users.json`，`lib/users.js:8-10`)。配置入口=插件 config（`cordis.patch.yml:3-36` / settings.yaml login-gate 段）；**端口无环境变量入口（查不到）**。环境变量仅 `DSH_HOME`、`DSH_LOGIN_GATE_CREDENTIALS`（`lib/dsh-session.js:33`）。

## 【疑点/优化空间线索】

1. 固定 30 天无滑动续期：活跃用户也强制重登（`lib/gate.js:153` 无重签）——"活跃即续期"需加低频重发 Set-Cookie。
2. logout 不真正作废令牌：无服务端会话表/吊销名单，logout 仅清浏览器 cookie（`lib/gate.js:136-138`）；真正失效仅 logout-all 轮换 secret。
3. 限流失败计数无衰减/无窗口（`lib/ratelimit.js:18-27`）：跨天累积 5 次也锁定；重启清零。
4. 私网地址信任 XFF（`lib/gate.js:61-70`）：局域网直连可伪造 XFF 绕过每 IP 锁定（当前 127.0.0.1/反代姿态下可控，生产实况 0.0.0.0:3500 直暴露——见部署文档）。
5. WS 过期只能 401 断连，无法 302 登录页——用户易误判为故障。
6. 模式 C 自铸仅 6h 且当前 dsh 不认可（`lib/dsh-session.js:6-7,137`）——兜底形同虚设，已知限制。
7. 两套 30 天独立可配：gate 固定 30d vs dsh 注入 6h 滚动 → "gate 活着却见 401"仅出现在会话获取失败（模式 D）。

**NEEDS_CONTEXT**：无。**NEEDS_HUMAN**：①"记住我/会话续期/小时级超时"当前均不支持，需立变更（本变更可选范围）；②生产实际值已由协调者补充核查：`/root/.dsh/profiles/web/cordis.patch.yml` `sessionDays: 30`、`port: 3500`。
