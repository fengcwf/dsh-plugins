# TECH.md — 技术规格书（dsh-login-gate 设置面与认证优化）

> 变更：changes/2026-09-29-login-gate-settings/｜2026-09-29｜依据：PRODUCT.md、reports/scout-b-settings-contract.md

## Global Constraints（不得触碰的面）

1. **禁止手写/直改 profile `/root/.dsh/profiles/web/cordis.patch.yml`**（LRN-033：服务存活期写该文件=热重载拆工具面）——配置写入唯一路径 = configEditor.edit（文件锁+reconcile）。
2. **禁止动生产脚本联动面**（gate-watchdog.sh / start-dsh.sh / reset-password.sh / update-gate.sh / gate-emergency.sh / Lucky 反代 / headless 自检文案）——端口联动以 UI 提示+文档清单收敛，不自动改（用户 Round 1 选项①明确排除自动联动）。
3. **禁止改认证行为逻辑**（INV-5）：固定过期、HMAC dlg_sid、scrypt 恒时校验、失败锁定、防枚举路径零改动。
4. **禁止动 obsidian-web 3500 /ob_share 外部契约代码**（跨插件边界）。
5. 测试红线：测试环境端口避 3080/3500、禁名 web profile、禁跑 start-dsh.sh、测完回收进程。
6. 快照无热链路：本变更落地=发版→生产换 tag 重装→重启（用户指定空档）。

## 架构决策 / Architecture Decisions

### ADR-001: 设置栏目注册形制 = 零构建单文件 lib/client.js（settings.section 槽）

- **方案A（选定）**：照 kb-context 先例——package.json `dsh.client{platform:'web',inject:[locale,renderer,layout]}` + `exports["./client"]` → `lib/client.js`（`__ModuleLoader__` 工厂形、React.createElement）→ `ctx.slots.register('settings.section', {id:'login-gate', order, label})`。
- **方案B（弃）**：wiki-steward 式 `web/` Vue+vite 构建物入库——设置面只是参数表单，引入构建链与 vendor chunk 成本不成比例。
- **权衡**：A 零构建、与 settings 面先例同形（kb-context UX 波 brief 落地前不引入第三种形制）；代价=单文件形制与组件 ≤300 行约定冲突 → 照 R-3 先例以形制为准留豁免记录。
- **教训约束**：客户端请求一律文档相对（自造绝对路径 = 生产 404，commit 350f81c 教训）。

### ADR-002: 保存链 = /api/login-gate/settings + configEditor.edit 白名单

- **方案A（选定）**：服务端 `ctx.webServer.register({kind:'prefix',path:'/api/login-gate/settings'})` → GET 回读 / POST `{patch}` → 白名单预检（白名单外整单拒 not_editable）→ zod 校验生效面 → `configEditor.edit(entryId='login-gate', change)` → 写 profile patch + Loader reconcile。
- **方案B（弃）**：插件自写配置文件/直写 YAML——绕开 reconcile、并发不安全、违反 Global Constraint 1。
- **生效语义（R-16，即时生效）**：sessionDays/maxFailures/secureCookie/wsAllow/gzipPass = handler per-call 读 config 热生效；port/listenHost/upstreamPort/rewriteHost = 写入后经宿主 re-apply 立即生效（端口保存前 UI 警示断连）（ADR-003 修订标注）。

### ADR-003: 端口维护 = 可改 + 事前警示 + 联动清单（用户 Round 1 裁定 / R-16 修订）

- 端口可编辑（默认 3500，整数 1-65535）；保存前弹断连警示确认条（监听端口立即切换、当前连接会断开）+ 保存成功回显「已保存，已生效」+ 联动清单四行（gate-watchdog 探活地址 / start-dsh.sh 检查 / obsidian-web 3500 分享契约 / Lucky 外网反代需人工同步）。
- **端口占用预检**：保存前服务端 `net` 探测目标端口可绑定性，占用即拒绝并给占用提示（防 EADDRINUSE 事故重演——obsidian-web 3500 冲突前科）。
- **生效语义（R-16）**：原「重启语义硬标」假设作废（2026-09-29 实测推翻，见下方修订标注）——语义=即时生效+事前警示；真·需重启（deferred rebind）为 P2 候选。
- **修订（2026-09-29，R-16）**：实测推翻原重启假设（2026-09-29 tester F-1），语义=即时生效+事前警示（R-16）；真·需重启（deferred rebind）列 P2 候选。

### ADR-004: 账号管理 = usersFile 原子写 + scrypt 服务端生成（用户 Round 4/5 裁定）

- 新增/改密：密码仅经 POST 传输，服务端 `crypto.scrypt`（沿用 lib/auth.js 参数 N=16384,r=8,p=8→现 p=1，keylen=32）生成 `scrypt$` 哈希写 usersFile；**响应/日志永不回显哈希**（INV-3）。
- 写入=读-改-写临时文件+rename 原子替换（usersFile 热加载，`lib/users.js` 现语义保留）；并发写加进程内互斥（串行化 promise 链）。
- 删除账号：防自锁——不允许删除"当前登录账号"（边界保护）；删除/改密即时影响新请求校验（usersFile per-call 读）。
- 授权=任何登录用户（Round 5），`/api/login-gate/settings` 全部子路由同鉴权缝（connection.requestRejection，INV-4）。

### ADR-005: 超时说明 = 文案层（用户 Round 3 裁定，零行为改动）

- 登录页页脚与设置页头部明示「登录后约 N 天内免登录」（N=sessionDays 动态）；设置页附机制说明段（固定过期不滑动续期、到期 302 重登、logout-all 全员下线）。

## 文件变更范围 / File Change Scope

| 文件 | 动作 | 内容 |
|------|------|------|
| `package.json` | 改 | `dsh.client` 块 + `exports["./client"]` + files 含 lib |
| `lib/client.js` | 新增 | settings.section 栏目（端口/参数/账号三区 + 说明文案），零构建单文件 |
| `lib/settings-routes.js` | 新增 | `/api/login-gate/settings` prefix：GET 回读、POST patch、账号 CRUD 子路由 |
| `lib/settings-write.js` | 新增 | 白名单 + zod 校验 + configEditor.edit 封装 + 端口占用预检 |
| `lib/users.js` | 改 | scrypt 生成 + 原子写 + 串行化 |
| `lib/index.js` | 改 | 注入 webServer 缝（延迟求值，照 kb-context B1/B2 形）；config normalize 增量 |
| `lib/login-page.js` | 改 | 页脚文案带动态 N |
| `test/*.mjs` | 新增/改 | client-settings / settings-routes / settings-write / users-atomic / integration 形 + load 冒烟 |
| `README.md` + `CHANGELOG.md` | 改 | 设置面说明 + 联动清单 + 版本记录 |

**文件依赖关系**：client.js → settings-routes（文档相对 API）→ settings-write → configEditor；users CRUD → users.js → usersFile；index.js 注册 routes（webServer 缺位时降级 writable:false，照 kb-context 缺缝形）。

## 实现注意事项 / Implementation Notes

- **编码规范**：零构建纯 ESM；client.js 无 JSX（React.createElement）；样式内联/注入 `<style>` 用 `var(--dsw-alias-*, fallback)` token（参照 wiki-steward/web/src/styles.css）；禁第三方 UI 库、禁网络外呼。
- **错误处理**：服务端判据原文回显（kb-context 形，不静默）；空 draft 拒保存；writable:false → 只读注记；端口占用 → 明示占用与建议。
- **性能考量**：settings GET per-request 读 config（热生效）；usersFile 读缓存 ≤1s 或 per-call（现语义）；无轮询。
- **组件行数**：client.js 预计 >300 行 → 单文件形制豁免（R-3 先例），结构分区清晰。

## 范围外 / Out of Scope

滑动续期、记住我、小时级超时、logout 真吊销名单、限流时间窗衰减、WS 过期引导页、监听面三参数可改、生产脚本自动联动、多角色权限体系（P2 候选清单见 phase0-research.md §五）。

## 技术风险 / Tech Risks

| 风险 | 缓解 |
|------|------|
| configEditor 缺位（独立测试环境/未来宿主变更） | 缺缝降级 writable:false + 只读注记（kb-context 形） |
| 端口切换即断连（宿主重 apply 重绑监听）误操作 | 保存前断连警示确认条 + 联动清单四行 + 端口占用预检（ADR-003 R-16） |
| usersFile 并发写坏文件 | 原子 rename + 进程内串行化 + 测试并发用例 |
| 改端口漏联动 | UI 联动清单四行 + README + INV-7 核对清单 |
| 300 行约定冲突 | 形制豁免记录（R-3），评审按分区质量判 |
