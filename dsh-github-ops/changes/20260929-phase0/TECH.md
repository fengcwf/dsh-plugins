# TECH.md — 技术规格书（dsh-github-ops 设置栏目优化）

> 变更：`changes/20260929-phase0/`（2026-09-29）。上游：PRODUCT.md（US-1..US-9 / INV-1..INV-10）、reports/settings-integration-research.md（宿主契约）、reports/three-competitors-research.md（竞品形态）。

## 方案对比 / Options & Trade-offs（技术选型）

| 维度 | 方案 A：kb-context 形零构建（settings.section 槽 + REST 数据面）⭐推荐 | 方案 B：Vue + vite web/ 构建物入库（wiki-steward 形） | 方案 C：独立 HTTP 面板/SPA（obsidian-web /ob/ 形） |
|------|------|------|------|
| 形态 | `lib/client.js` 零构建壳注册 `settings.section` 槽 + `lib/settings-routes.js` 数据面 | `web/` Vue 组件工程化 + vite lib 构建物入库 + 零构建壳动态 import | 插件自托管全 SPA，iframe/独立页进 main 槽 |
| 与需求契合 | ✅ 正中「dsh 设置菜单增加栏目」 | ✅ 可行，但重 | ❌ 不进设置菜单，违背需求① |
| 工作量 | 中（纯 ESM + 自绘 UI） | 高（构建链 + vendor chunk + 桥接） | 高 |
| 依赖面 | 零第三方 UI 库（符合 AGENTS.md「轻控件自绘 + dsh token」裁定） | element-plus 按需 + vite，构建物入库 | 同 B |
| 维护成本 | 低（无构建链，契约薄） | 中（构建链随宿主升级） | 中高 |
| 风险 | 槽位契约随宿主版本漂移（多座兼容缓解） | 构建物与宿主 renderer 版本耦合 | 暴露面自担 + 双形态漂移 |
| 结论 | **采纳**（且已过竞品调研：三竞品无一进设置菜单，此面无先例但契约已有 kb-context/dshmarket 双生产先例） | 进阶备选（v2 若栏目交互复杂化再迁，数据面契约不变） | 不采纳 |

**备选与权衡记录**：方案 B 的组件工程化优势在本栏目「状态卡+表单」形态下收益不足（AGENTS.md UI 依赖口径：复杂交互才允许 element-plus）；方案 C 与用户需求字面冲突。迁移路径：A 的数据面（`/api/github-ops/*`）与 UI 分离，v2 迁 B 不动 REST 契约。

---

## 架构决策 / Architecture Decisions

### ADR-001: 设置栏目挂载 = settings.section 槽 + 多座兼容自探测

**状态**: 已采纳 **日期**: 2026-09-29
**背景**: 需求①「在 dsh 设置菜单增加栏目」；宿主合法面为 typed slot 设置页族（docs/2026-09-23-dsh-web-ui-mechanism.md §2）。
**决策**: `ctx.slots.inject('settings.section', …)` 主座注册（id='github-ops'，label「GitHub 集成」）；US-8 兼容座（`settings.plugins.tab`/`plugins.bundle.config` 等）运行时自探测、防双挂载（workbench 三形态收敛先例）。**红线**：`root` 槽禁注册；`sidebar`/`rightbar` 只加内层 seat。
**理由**: 官方正门 + 生产双先例（kb-context、dshmarket）；多座自探测解决 GUI 版本漂移。
**影响**: 客户端壳需槽位探测逻辑；槽位方缺席=该面缺席（INV-6 fail-open）。

### ADR-002: 数据面 = webServer prefix `/api/github-ops/*` + 首行鉴权

**状态**: 已采纳 **日期**: 2026-09-29
**决策**: 双层子插件注入 `['webServer','connection']`，`ctx.webServer.register({kind:'prefix', path:'/api/github-ops'})`；端点矩阵：
`GET /status`（认证状态投影）、`POST /token`（设置/更新，「留空=不修改」）、`POST /check`（访问检验）、`GET /accounts`（多账号列表）、`POST /accounts/verify`（逐账号验证）、`POST /accounts/switch`（切换 active）、`GET /repo-context`（仓库上下文卡）、`GET /health`（插件自检）。
每个 handler **首行** `ctx.connection.requestRejection(request)`（INV-3）；请求体 ≤1MiB 有界（INV-1）；客户端 fetch 一律**文档相对** `api/github-ops/…`（scout 报告 §3.4 铁律：站内绝对路径在 login-gate 基址下 404）。
**理由**: kb-context 生产同款形（settings-routes.js:10,140）。
**影响**: 每端点独立鉴权测试（INV-3）。

### ADR-003: token 写入 = `gh auth login --with-token` 经 stdin → hosts.yml 单一认证源

**状态**: 已采纳 **日期**: 2026-09-29
**决策**: token 只经 stdin 传递（argv/日志/recall 零明文，INV-1/INV-2）；不新增任何凭据存储（竞品 forge 的 secrets.json 形**不复用**——gh hosts.yml 已是认证源，多存一处=多一处泄漏面）；`gh auth token` 明文输出全链路禁用。UI 侧密码输入、保存即清空、「留空=不修改」（forge 形态吸收，INV-4）。
**理由**: 保持 enforce.js 的凭据模型（hosts.yml 托管）；竞品调研核心判定。
**影响**: `--with-token` 失败形 🔴 仅文档——Phase 6 实现前用一次性假 token 在 .testenv 实测钉死（真 token 禁入测试日志）。

### ADR-004: 访问检验 = 三段探针 + 独立超时 probeTimeoutMs

**状态**: 已采纳 **日期**: 2026-09-29
**决策**: ①本地配置面 `gh auth status --json hosts`（state 判据）→ ②认证/连通 `gh api user --jq .login`（401=坏 token 🟢实测）→ ③限额/延迟 `gh api rate_limit --jq '{core,search}'`（~0.65s 🟢实测）+ 墙钟计时。结果结构化 `{ok,stage,code,status,login,message,elapsedMs}` + 分类 hint（401/403/429/超时，forge probeAccount 形吸收）；`probeTimeoutMs` 进 Config（缺省 3000，1000-600000），UI 显示延迟毫秒数（INV-5）。
**影响**: 健康检查复用 runGh 执行器（timeout 可按调用传 probeTimeoutMs）。

### ADR-005: 多账号库 = hosts.yml `users[]`/`active_account` 投影 + `gh auth switch`

**状态**: 已采纳 **日期**: 2026-09-29
**决策**: 只读投影 hosts.yml 账号元数据（**不读 token 值**）；录入=新 token stdin 注入（同 ADR-003）；验证=逐账号探针；切换 active=`gh auth switch`（gh ≥2.20）→ 不可用时降级提示手工切换。**不做删除/登出**（INV-4/API 面无删除端点）。
**理由**: US-4；切换能力是用户 R9 显式选择（边界变化已在 conversation.md Round 9 记录）。

### ADR-006: 仓库上下文卡 = git remote/分支 + `gh api repos/:owner/:repo` 摘要

**状态**: 已采纳 **日期**: 2026-09-29
**决策**: 服务端读工作区 git remote -v / 当前分支（URL 凭据擦除——git-remotes redact 形吸收），GitHub 摘要经 gh api（stars/issues/default_branch），短 TTL 内存缓存（≤30s）防点刷。UI 手动刷新。
**影响**: 失败 fail-open（卡内降级提示，不炸栏目）。

### ADR-007: 插件自检 health = `GET /api/github-ops/health` 三段自检

**状态**: 已采纳 **日期**: 2026-09-29
**决策**: ①配置合成（Config.parse 复检 + 各开关状态）②gh 可用（`gh --version`，probeTimeoutMs）③凭据在位（hosts.yml 存在 + active 账号投影，零明文）。结构化 JSON，同样首行鉴权。

### ADR-008: 客户端零构建 + 自绘 UI + dsh token（唯一色板来源）

**状态**: 已采纳 **日期**: 2026-09-29
**决策**: `lib/client.js` 零构建壳 + 兄弟 chunk `lib/client.ui.js`（`window.__ModuleLoader__.load({id:'dsh-github-ops', factory})`，INV-9 模块 id=包名；壳经 `require.async('./client.ui.js')` 取 UI，chunk 名过宿主 `CLIENT_CHUNK` 白名单 `client.<name>.js`）；UI 自绘 + dsh token（DESIGN.md token 表逐字进实现）；不引第三方 UI 库。
**理由**: AGENTS.md UI 依赖口径 + 组件 ≤300 行约定；页面 DOM 交互零依赖。
**处置（C-2，T13 Ruling-4 / F-scan-1）**: 壳与 UI 拆两文件——`lib/client.js` 只做模块注册 + 槽位多座自探测 + fetch 帮手 + 挂载生命周期，UI 渲染逻辑全归 `lib/client.ui.js`（T13 交付 render* 接口面最小桩，Task 14 填真 UI；无桩则 T13→T14 之间不可 boot）。**.testenv 实测（2026-09-29，`plugintest@3180` 装 `#eea1d21`，测完回收）**：入口经 combo 路由 `plugins/??dsh-github-ops/client.js&rev=7a5a8ca84e20` HTTP 200（8190B，注册形/模块 id/chunk 引用在场）；兄弟 chunk `/plugins/dsh-github-ops/client.ui.js?rev=7a5a8ca84e20` HTTP 200（1814B，注册形/chunk 名/render* 面在场）；负例无 rev 直取 HTTP 404（chunk 路由钉 rev，UI 侧必须走 `require.async`）——**chunk 形成立，无需回退单文件形态**。

---

## 文件变更范围 / File Change Scope

| 文件路径 | 操作 | 职责说明 |
|----------|------|----------|
| `lib/client.js` | 新建 | 浏览器壳（F-scan-1 边界）：`__ModuleLoader__.load` + 槽位多座自探测防双挂载 + fetch 文档相对帮手 + 挂载生命周期；零 UI 字面 |
| `lib/client.ui.js` | 新建 | UI 兄弟 chunk（Ruling-4）：render* 接口面（renderSettingsSection/renderSummary）+ 占位渲染最小桩；Task 14 填真 UI（双栏六节卡片，≤300 行/文件） |
| `lib/settings-routes.js` | 新建 | 数据面双层子插件：8 端点注册 + 首行鉴权 + 1MiB 有界 + zod 白名单校验 |
| `lib/gh-auth.js` | 新建 | 纯逻辑：状态投影/写 token（stdin）/探针/账号库/切换（可单测，runGh 统一执行器在此收编） |
| `lib/index.js` | 修改 | inject 维持 `['shell','tools']`（0.2.1 激活语义，Ruling-3：非 web 部署四层照常生效）；设置数据面由内层子插件硬 inject ['webServer','connection'] 承载（kb-context 双层形）；Config 增 `probeTimeoutMs`；runGh 收编进 gh-auth.js 引用；ctx.effect 工厂形收敛（shell.resolve 卸载还原——拆除器形会当场还原、包壳即死，rtk-kit 2026-09-29 教训） |
| `lib/enforce.js` | 微调 | 不动语义（INV-7）；如需 redact 工具函数从 gh-auth.js 引用 |
| `lib/repo-tools.js` | 微调 | 执行器缝标注（runGh 由 index.js 经 gh-auth.makeRunGh 注入；本模块纯 argv 构造零 spawn 耦合，语义不变） |
| `cordis.patch.yml` | 修改 | config 增 `probeTimeoutMs: 3000`（整行替换语义注意全键重述） |
| `package.json` | 修改 | `dsh.client{platform:'web',inject}` + `exports['./client']`（缺=启动报错）；`files` 补 CHANGELOG.md；补 `repository`（W-3）；`scripts.check` 补全 lib 11 文件 `node --check` 面（T13 carry） |
| `dsh.plugin.json` | 修改 | **N-2 处置（已裁决）：保留**——社区工具发现惯例（社区目录/发现工具可读），官方 dsh 不读取（生效靠 `dsh.bundle.patch`）；LRN-035 严格 JSON 禁注释，用途说明写 `README.zh.md` 不写 JSON；version 随 `package.json` bump 0.3.0 |
| `test/settings-routes.test.mjs` | 新建 | integration 形：假 ctx 真 apply() + 真 handler——鉴权矩阵/留空不修改/1MiB 限/零明文投影 |
| `test/gh-auth.test.mjs` | 新建 | 纯逻辑单测：状态投影/探针三段/失败分级/切换降级 |
| `test/client-shell.test.mjs` | 新建 | 模块壳形：`__ModuleLoader__` 注册形 + 槽位探测 + 缺席 fail-open |
| `test/index-mount.test.mjs` | 新建 | 挂载与声明 integration 形（假 ctx 真 apply()）：inject/Config（INV-5 钳制）/四层逐层（INV-7）/设置面挂载与撤销（C-1 收敛释放）/deps.workspaceDir 宿主工作区缝 |
| `test/load.test.mjs` | 修改 | 保持真 `import('../lib/index.js')` 冒烟（INV-8） |
| `test/gh-auth-degrade.test.mjs` | 新建（Task 15，C-2 先登记） | 退化形/失败形单测：假 gh 慢响应超时分级（INV-5）、401/403/429/非零退出/写入失败分级归因（INV-10）、F-7 遗留缺口（writeToken 网络错形 GHO-TOKEN-06、switchActive 空 login、畸形 hosts.yml 垃圾行/Tab、probeAccess JSON 不可解析）、全链零明文（P-5/P-10/R-6）。gh-auth.test.mjs 290 行近 300 上限，本轮补测拆此文件（每文件 ≤300 行） |
| `test/settings-routes-degrade.test.mjs` | 新建（Task 15，C-2 先登记） | 数据面退化形 integration 形：真 makeRunGh + 假 gh 脚本全链（慢响应 >probeTimeoutMs 超时分级不挂死、R-1 写入失败形 stderr 敏感串不透传）、失败形分级矩阵（401/403/429/非零退出/写入失败 GHO-TOKEN-06）、缺缝 fail-open（INV-6）、warn 日志/返回值零明文 |
| `test/client-degrade.test.mjs` | 新建（Task 15，C-2 先登记） | UI 面退化形：超时分级结果→分级卡终态不挂死（INV-5）、repo-context 失败降级不炸栏目（INV-6）、UI 投影零明文对抗（INV-1/P-5）、假 ctx 无 slots apply() 不炸 |
| `test/client-shell.test.mjs` | 修改（Task 15 携带） | D1「禁站内绝对 /api/」正则补合成正/反例自证（防扫描假保险）；Empty 空态「添加账号」断言限定 `.gho-empty` 子树（原全树 find 会命中常驻卡头按钮，锁不住空态自带入口） |
| `changes/20260929-phase0/DESIGN.md` + `visual/final.png` | 新建 | Phase 2.5 视觉定稿（gate-phase2 机械要求） |
| `CHANGELOG.md` / 根 `README.md` 版本表 / `README.zh.md` | 修改 | 发版五步②③（0.3.0）；README.zh.md 补 `dsh.plugin.json` 用途说明（N-2）与计数同步（11 工具/109 测试/`node --check` × 11/`probeTimeoutMs` 配置行） |

### 文件依赖关系

```
lib/index.js ──挂载──▶ lib/settings-routes.js ──调用──▶ lib/gh-auth.js ──spawn──▶ gh CLI（hosts.yml）
     │                        │
     │                        └──鉴权──▶ ctx.connection.requestRejection
     └──注入──▶ lib/client.js（浏览器壳）──require.async('./client.ui.js')──▶ lib/client.ui.js（render* 接口面）
                     └──fetch(文档相对)──▶ /api/github-ops/*
```

---

## 实现注意事项 / Implementation Notes

### 编码规范
- 零构建纯 ESM JS（Node ≥24）；zod Config schema；`ctx.effect()` 收敛释放（审计 W：kb-context 缺 effect 的教训反着做）
- 组件/模块 ≤300 行；禁 `v-if` 类重交互（零构建 DOM 渲染同理：状态渲染函数化）
- 并发单步多工具（执行者契约）；命名统一 `gh-auth`/`settings-routes`/`client` 三词根

### 安全纪律（INV 级，逐条进测试）
- token 零明文四不：不进 argv、不进日志、不进 recall/返回值、不进 UI（INV-1）
- 每 handler 首行鉴权（INV-3）；错误输出走结构化归因投影，stderr 敏感串不透传（INV-10）
- 请求体 1MiB 有界；zod 白名单整单拒（kb-context settings-write 形）

### 错误处理策略
- 错误码格式 `GHO-[端点]-[序号]`（如 `GHO-TOKEN-01`）；分级 hint：401 token 无效 / 403 权限不足 / 429 限额耗尽 / 超时 / gh 未装 / 写入失败（US-6）
- fail-open 面：槽位缺席、repo-context 失败、awareness 注入失败（既有）——绝不炸插件（INV-6）

### 性能考量
- 检验/探针 ≤3s（probeTimeoutMs=3000 缺省）；UI 出结果即时反馈（INV-5）
- repo-context TTL ≤30s；accounts 列表不轮询

---

## 范围外 / Out of Scope

- [ ] locale 国际化（US-10）— 用户 R9 未选，进 backlog
- [ ] REST Host 信任围栏、独立凭据擦除层（US-11）— 用户 R8 裁定安全加固后置（注意：零明文/鉴权等 INV 属需求①②安全验收面，不在此列）
- [ ] token 删除 / 登出 — INV-4 明确不做
- [ ] remote 操作面板、Issues/PR/Actions 面板、多 forge 账号库/push 策略 — 生态协同装竞品（dsh-git-remotes / workbench / dsh-git-forge），不重造（三竞品调研结论）
- [ ] `gh auth refresh` 授权流 — scout 建议 v1 不做，backlog

---

## 技术风险 / Tech Risks

| 风险 ID | 风险描述 | 影响程度 | 可能性 | 缓解策略 |
|---------|---------|---------|--------|---------|
| R-1 | `--with-token` 失败形语义 🔴 仅文档（退出码/stderr 形未知） | 中 | 中 | Phase 6 实现前 .testenv 假 token 实测钉死（一次，落 fix-notes/测试文档） |
| R-2 | 槽位契约随宿主版本漂移（settings.section 形态变化） | 中 | 低 | 多座自探测（ADR-001）+ 槽位缺席 fail-open + boot 冒烟含栏目在场断言（LRN-036 功能在场） |
| R-3 | `gh auth switch` 不可用（gh 版本 <2.20） | 低 | 低 | 探测降级提示手工切换（ADR-005） |
| R-4 | 模块 id ≠ 包名导致 client 不加载 | 高 | 低 | INV-9 测试锁死 + boot 冒烟 `/plugins/dsh-github-ops/client.js` 断言 |
| R-5 | 快照无热链路：改代码必须发版换 tag + 重启才生效 | 低 | 高 | 发版五步 + 逐次确认；.testenv 先测后发（AGENTS.md 红线） |
| R-6 | 假 token 进测试日志泄露面 | 高 | 低 | 测试用一次性假值并断言输出零明文；真 token 禁入测试（INV-1 测试面） |
