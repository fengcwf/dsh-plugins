# dsh-login-gate

DeepSeek Harness（DSH）**表单登录门禁插件**：为 `dsh web` 网页端提供「用户名 + 密码」登录入口，配合 Lucky / Nginx 反向代理实现外网 HTTPS 安全访问。多用户、多会话、每 IP 锁定、fail-closed，**不使用 HTTP Basic Auth**。

```
手机 APK / 浏览器
   │ HTTPS https://dsh.fengcwf.cn（Lucky：ACME 证书 + 反代，Host 模式「使用请求Host」）
   ▼ http://127.0.0.1:3500
dsh-login-gate（dsh 进程内插件）
   表单登录（scrypt 校验 + 每 IP 指数退避锁定）→ HMAC 签名会话 Cookie（HttpOnly）
   ▼ 认证反代（Host/Origin 改写为 loopback + 原生 DSH 会话注入 + WS 透传）
dsh web 127.0.0.1:3080（保持仅回环监听，官方安全模型不变）
```

## 功能

- **表单登录**：密码每次登录只过线一次，之后为签名会话 Cookie（默认 30 天）——区别于 Basic Auth 每请求携带
- **多用户**：`users.json` 账号表（推荐）或配置文件 `users`；**热加载**——写入新账号无需重启
- **密码存储**：scrypt 自描述哈希 `scrypt$16384$8$1$salt$hash`（与 dsh-gateway 格式兼容），恒时比较，畸形输入 fail-closed；明文仅 legacy 兼容并告警
- **会话管理**：HMAC-SHA256 签名令牌；**logout-all 轮换签名 secret，一键作废全部已登录设备**
- **爆破防护**：每 IP 连续失败 ≥5 次后指数退避锁定（30s 起、上限 300s）；用户名未命中时执行等耗时哑校验，防用户名枚举
- **认证反代**：Host/Origin 改写为 loopback 形式（设置面板远程完整可用）；**原生 DSH 会话注入**（token 兑换优先，见下）；**WebSocket 完整透传**——升级请求的 `Connection`/`Upgrade`/`Sec-WebSocket-*` 头机制性保留（v0.1.3 修复：此前 hop-by-hop 剥离误伤握手头，上游收不到升级请求会 404 → 前端"自动重连"常驻）；大体积 JSON/文本透明 gzip
- **fail-closed**：未配置任何用户时，所有人只能看到配置提示页
- **设置面（0.3.0）**：dsh 设置菜单「dsh-login-gate」栏目——端口维护 / 参数可配 / 账号增删改密 / 超时说明段（详见下文「设置面」）
- **安全默认**：监听 `127.0.0.1`（公网入口交给 Lucky）；门禁会话 Cookie 不转发给上游；`__gate` 端点外的一切路径均需登录；登录后跳转目标经严格校验（拒绝 `//`、`/\`、CRLF 注入）

## 原生 DSH 会话注入（为什么需要）

dsh-3301 项目实证：新版 DSH 用**签名且绑定 authority 的 cookie** 认证每个 GUI 请求，仅改写 Host 的外部反代会被 401 拒绝——网关必须持有自己的真实会话。本插件按实测可靠性依次尝试（dsh 0.1.5-rc.2 实机验证）：

| 优先级 | 模式 | 机制 | 实测 |
|---|---|---|---|
| 1 | B | **token 兑换**：`GET http://127.0.0.1:<上游>/?token=<启动token>` → 303 + 真实 `dsh-auth-<hash>` 会话 cookie；token 实时读 `$DSH_HOME/web-url.txt` / `dsh-web.log`，dsh 重启后自动跟随 | ✅ GUI 200 |
| 2 | A | 进程内官方 API `ctx.connection.authenticatedUrl()` 换取真实 Set-Cookie | 视版本 |
| 3 | C | 读 `$DSH_HOME/.credentials.yaml` 的 `client-connection/browser-session` secret 自铸 `v1.<payload>.<HMAC>`（dsh-3301 公式） | ⚠️ 该版本不认可，仅兜底 |
| 4 | D | 均不可用 → 不注入 + 告警一次 | — |

上游对幂等请求返回 401 时自动作废缓存并**重新兑换重试一次**（dsh 重启换 token 自愈）。

查看当前模式：`curl http://127.0.0.1:3500/__gate/health` → `{"ok":true,"users":N,"mode":"B|A|C|D"}`（B=token 兑换，实测推荐态）

## 安装

```sh
dsh plugin --profile web add github:fengcwf/dsh-login-gate
```

重启 dsh web 后，插件按 `cordis.patch.yml` 自动挂载（`login-gate` 配置段可在 settings.yaml 中修改）。

### 配置账号（推荐 usersFile 方式）

```sh
node <插件目录>/tools/hash-password.mjs --write alice
node <插件目录>/tools/hash-password.mjs --write bob
# 写入 $DSH_HOME/login-gate/users.json（0600），格式 {"alice":"scrypt$...","bob":"scrypt$..."}
# 热加载：无需重启
```

### Lucky 反向代理配置

1. Web 服务 → 新增反代规则：域名 `dsh.fengcwf.cn` → 目标 `http://127.0.0.1:3500`；
2. **Host 自定义模式选「使用请求Host」**（Lucky 官方 Web 模块要求，核对非默认端口无丢失）；
3. WebSocket：默认开启，无需额外开关；
4. HTTPS/证书：Lucky ACME 给该子域签发；
5. **不要**在 Lucky 上再配置 BasicAuth（认证由本插件承担，双层只会双重登录）。

> Lucky 与 DSH 不在同一台机器时：把插件 `listenHost` 改为可信私网 IP，并用防火墙限制来源为 Lucky 的私网地址。

## 端点

| 端点 | 说明 |
|---|---|
| `GET /__gate/login` | 登录页（已登录自动跳回 next） |
| `POST /__gate/login` | 校验账号密码 → Set-Cookie → 跳回原地址 |
| `POST /__gate/logout` | 注销当前会话 |
| `POST /__gate/logout-all` | 轮换 secret，作废**全部**已登录设备（需已登录） |
| `GET /__gate/health` | 健康检查（无认证）：`{ok, users, mode}` |
| `GET /__gate/status` | 当前会话信息（需登录） |

## 设置面（dsh 设置菜单「dsh-login-gate」栏目）

dsh 设置菜单内提供「dsh-login-gate」栏目（`settings.section` 槽），四区一段：

- **端口区（端口维护）**：门禁监听端口可改（默认 3500，整数 1-65535）；保存前服务端做**端口占用预检**（占用即拒绝并提示）；保存前弹**断连警示确认条**（监听端口立即切换、当前连接会断开），确认才保存、取消零请求；下方常驻联动清单（见「端口联动清单」）。
- **参数区（5 可改 + 3 只读）**：可改——`sessionDays`（1~3650）/ `maxFailures` / `secureCookie` / `wsAllow` / `gzipPass`；只读展示——`listenHost` / `upstreamPort` / `rewriteHost`（在配置文件中设置）。
- **账号区（增删改密）**：登录账号新增 / 删除 / 改密——scrypt 哈希服务端生成（密码仅经 POST 传输，响应与日志永不回显哈希）；`usersFile` 原子写 + 热加载，保存即刻生效；任何登录用户可操作。**删除契约（防自锁）**：请求必带 `currentName`（取自 `/__gate/status` 的 `user`），不允许删除当前登录账号；`currentName` 取不到时禁用删除按钮并提示（fail-closed）。
- **超时说明段**：「登录后约 N 天内免登录」（N = sessionDays 动态）+ 会话机制说明（见下节）。

**保存语义 = 即时生效 + 事前警示（R-16）**：保存即经宿主应用（`configEditor.edit` 白名单写入 → Loader reconcile → 宿主 re-apply），九键均为 apply 期快照、重 apply 重取，**无需重启**；唯一事前警示 = 端口保存前的断连警示确认条（弹条在前、确认才写入）。白名单外键整单拒绝（`not_editable`），配置写入不手写 profile 文件。

### 端口联动清单（INV-7：改端口时需人工同步以下四处）

| # | 联动点 | 位置 | 同步内容 |
|---|---|---|---|
| 1 | gate-watchdog 探活 | `gate-watchdog.sh:34` | `curl http://127.0.0.1:3500/__gate/health` 的探活地址/端口 |
| 2 | start-dsh.sh 监听检查 | `start-dsh.sh:101-113` | 启动时监听/health 检查的端口 |
| 3 | obsidian-web 分享契约 | obsidian-web 3500 `/ob_share` | 外发分享链接的端口契约 |
| 4 | Lucky 外网反代 | 家宽侧设备（外部） | 反代目标端口，**需人工同步**（NEEDS_HUMAN） |

> 联动面仅提示、不自动改（用户裁定）；改端口后请逐行核对上表。

## 登录会话超时机制（US-3 / US-5）

- **登录后 N 天内免登录**：N = `sessionDays`（默认 30，可配 1~3650），会话令牌 `exp` 与 Cookie `Max-Age` 同期。
- **固定过期、不滑动续期**：请求只校验不重签，N 天从登录那刻算起，与活跃度无关。
- **到期 302 重新登录**：过期后访问任意页面 302 → 登录页（WS 连接 401 断连）。
- **logout-all 全员下线**：轮换签名 secret，全部已登录设备立即作废。

机制详证（凭据/过期时间表、时序行为、与 dsh 原生会话的错位分析）：[`reports/scout-a-auth-timeout.md`](changes/2026-09-29-login-gate-settings/reports/scout-a-auth-timeout.md)；设置面机制调研：[`reports/scout-b-settings-contract.md`](changes/2026-09-29-login-gate-settings/reports/scout-b-settings-contract.md)；候选清单：[`phase0-research.md`](changes/2026-09-29-login-gate-settings/phase0-research.md) §五（两份分析报告 + §五候选清单 = 需求②③的交付归档）。

## 安全模型

- **本门禁（表单登录）是唯一认证边界**：Host/Origin 改写为 loopback 后，DSH 视所有通过门禁的请求为本机来源（设置面板因此在远程完整可用）——与 dsh-gateway / dsh-3301 / dsh-mobile-app 认证代理同构；
- **多用户 = 多账号共享同一 DSH 实例**：登录后所有账号看到同一套会话/工作区/文件/终端（DSH 为单用户设计）。需要数据隔离时，请为每用户部署独立 dsh 实例 + 反代按子域路由；
- 会话 secret 存 `$DSH_HOME/login-gate/secret`（0600）；凭据文件 `$DSH_HOME/.credentials.yaml` 仅被**读取**用于铸造会话，删除该记录会使注入会话立即失效；
- Lucky 层建议叠加：强密码（≥16 位随机）+（可选）访问 IP 限制；`secureCookie` 在 HTTPS 部署下保持 `true`。

## 与 Android 壳（dsh-mobile-app 等 WebView APK）的配合

WebView 壳打开 `https://dsh.fengcwf.cn` → 显示本插件登录页（标准网页表单）→ 登录后 `dlg_sid` Cookie（HttpOnly）由 WebView 持久化，之后打开即进。壳的 HttpAuth 自动登录逻辑在此模式下不再使用（可从 fork 中移除）；WebSocket 握手自动携带 Cookie，实时事件无需额外处理。

## 已验证（端到端测试台实测）

- scrypt 哈希往返 / 错误密码拒绝 / 畸形哈希 fail-closed
- 会话签发-校验 / secret 轮换立即作废全部会话
- 每 IP 锁定（429 + Retry-After）/ 其他 IP 不受影响
- usersFile 热加载（mtime 缓存）
- 端到端：未登录 302 → 登录页；登录成功 Set-Cookie 跳转；带会话转发时 **Host/Origin 改写 ✓ 门禁 Cookie 剥离 ✓ 原生会话注入 ✓**
- **WS 隧道回归套件 22/22（v0.1.3）**：升级握手 101 透传 ✓ `Connection: Upgrade`/`Upgrade: websocket`/`Sec-WebSocket-Key|Version` 完整抵达上游 ✓ Host 改写 ✓ 会话注入 ✓ 门禁 Cookie 不泄漏 ✓ 白名单 403 ✓ 未认证 401 ✓ 早期帧（head）透传 ✓；HTTP 侧：Connection 动态逐跳头剥离 ✓ 上游绝对 Location 改写 ✓ 登录跳转目标 `/\`、`//`、CRLF 注入全拦截 ✓ 回归无破坏 ✓
- dsh 0.1.5-rc.2 实机：token 兑换会话注入 → GUI 200（经门禁转发）

## 版本记录

| 版本 | 变更 |
|---|---|
| 0.3.0（待发版） | **设置面**：dsh 设置菜单「dsh-login-gate」栏目（端口维护+断连警示+联动清单 / 参数 5 可改 3 只读 / 账号增删改密 / 超时说明段）；保存语义=即时生效+事前警示（R-16）；登录页「N 天免登录」动态文案（详见 CHANGELOG） |
| 0.2.0 | 迁入 `fengcwf/dsh-plugins` monorepo，分发改钉版本 git 快照；行为同 0.1.3，补 load 冒烟 |
| 0.1.3 | **WS 隧道修复**：升级转发的 `buildHeaders` 改为 `upgrade:true` 机制性保留握手头（修复 hop-by-hop 剥离误伤 `Connection`/`Upgrade` → 上游 404 → 前端"自动重连"常驻）；upgrade 事件 `head` 早期帧透传；WS 隧道连接超时 5s；HTTP 转发补 RFC 7230 §6.1 动态逐跳头剥离；上游绝对 Location 改写防 loopback 泄漏；登录跳转目标校验硬化（拒 `//`、`/\`、CRLF） |
| 0.1.2 | 会话注入改 **token 兑换优先**（dsh 0.1.5-rc.2 实测）；上游 401 自动重新兑换重试；修复日志双前缀 |
| 0.1.0 | 首版：表单登录门禁 + 认证反代 + scrypt 多用户 + HMAC 会话 + 每 IP 锁定 |

## 致谢与机制来源

本插件是对以下开源项目的机制综合（详见各文件头注释）：

- [clarknu/dsh-gateway](https://github.com/clarknu/dsh-gateway)：scrypt 自描述哈希、HMAC 会话、secret 实时轮换、fail-closed 姿态
- [Aztech-Lab/dsh-3301](https://github.com/Aztech-Lab/dsh-3301)：原生 DSH 会话获取（credentials.yaml 铸造 + authenticatedUrl API）、表单登录理念、scrypt 参数与存储权限收紧
- [534119219/chicheng-gate](https://github.com/534119219/chicheng-gate)：门禁端口与 DSH 端口分层、明文禁存
- [hongshuxifan321/dsh-mobile-app](https://github.com/hongshuxifan321/dsh-mobile-app)（server/plugin）：Cordis 插件生命周期、Host/Origin loopback 改写、WS 隧道与逐跳头清理

## Roadmap

> ~~DSH 设置页内的可视化账号管理卡片~~ **已实现（0.3.0 设置面）**——端口维护/参数可配/账号增删改密/超时说明段，见上文「设置面」。

- **P2 候选（US-6，仅分析未排期）**：滑动续期 / 记住我 / logout 真吊销（服务端吊销名单）/ 限流时间窗衰减 / WS 过期引导页 / 小时级超时——依据 [`phase0-research.md`](changes/2026-09-29-login-gate-settings/phase0-research.md) §五与 `reports/` 两份分析
- 可选的登录页品牌自定义（标题/Logo）
- 按用户的会话配额与审计日志

## License

MIT © 2026 fengcwf
