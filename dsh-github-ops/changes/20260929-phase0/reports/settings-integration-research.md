# dsh 设置菜单栏目接入调研（dsh-github-ops · GitHub token 维护 + 访问健康检查）

- 日期：2026-09-29（Phase 0 只读调研）
- 范围：kb-context v0.3.1 / dshmarket v1.66.5 / dsh web 宿主注册契约 / wiki-steward、obsidian-web 的 web 形态 / dsh-github-ops 现状 / gh CLI 认证面
- 证据等级：🟢 = 本机实测过；🟡 = 读过源码（含文件:行号）；🔴 = 仅文档/注释，未实测
- 红线遵守：全文不含任何 token 明文 / 凭据值；hosts.yml 只描述结构与字段名；gh 输出只引用掩码/结构形

---

## 0. 结论摘要

1. **设置栏目不是 HTTP 挂载出来的，是浏览器槽位注册出来的**：插件客户端 bundle 里 `ctx.slots.inject('settings.section', …)` → `ctx.slots.register({name:'settings.section', id, order, label}, Component)`，设置面板（宿主 `dsh-client-ui-settings-general` 壳）自动把它渲染成设置页 nav 行 + 内容页。HTTP 路由只负责数据面（读写），UI 谁托管 = 插件自己的 client bundle，宿主自动服务于 `/plugins/<包名>/client.js`。🟡
2. **kb-context = 最简零构建形**：`lib/client.js`（React 无 JSX 工厂形）注册 `settings.section`；数据面 `ctx.webServer.register({kind:'prefix', path:'/api/kb-context'})`（GET/POST `/settings`）；写路径经宿主 `configEditor` 缝（落 profile patch + 热生效），白名单 + zod 校验双保险。🟡
3. **dshmarket = 构建物形 + 多座注册**：`client/client.js`（tsdown 单文件 bundle 701KB）+ `src/`（TS 源码随包）+ `locale/`（JSON meta）；除 `settings.section`（Market 页）外还注册 `settings.plugins.tab` / `plugins.bundle.config` / `settings.plugin.item`（版本兼容多座）+ `shell.overlay`（toast）。设置栏目组件 = `src/client/MarketSection.tsx`（构建后进 client.js）。🟡
4. **宿主注册契约（可复用最小接入面）**：① `package.json` 的 `dsh.client {platform, inject}` + `exports['./client']`（缺 exports 报错、缺构建物报 `run pnpm run build`）→ 被 `dsh-client-modules` 扫描、自动服务 `/plugins/<id>/client.js`；② bundle 形 = `window.__ModuleLoader__.load({id, factory})`，`require('react')` 用宿主 React；③ 设置栏目 = `settings.section` 槽位（list/root，owner props 只有 `{close}`，id/order/label 三要素，label 是 thunk、locale 变更需重注册）；④ 数据面 = `webServer.register({kind:'prefix'|'exact', …})` + `connection.requestRejection` 鉴权缝；⑤ 配置持久化 = `configEditor.entries()/edit()` 缝（可缺位=只读）。🟡
5. **wiki-steward / obsidian-web = Vue 构建物形（第二形态）**：`web/`（vite lib 构建物入库 `web/dist`）+ `lib/client.js` 零构建壳注册槽位；复杂 UI 走「`lib/client.js` 动态 `import('api/<name>/panel.js')` → 插件自己 webServer prefix 静态服务 `web/dist`」（wiki-steward），或「`main` 槽 iframe 指 `/ob/` 全 SPA 静态面」（obsidian-web）。与 kb-context 形差异 = 多一个构建步骤与构建物入库，换来 Vue 组件工程化（≤300 行纪律）。🟡
6. **GitHub token 维护三条能力的安全命令路径**：查看状态 = `gh auth status --json hosts --jq '<安全投影>'`（JSON 恒 exit 0，须看 `state` 字段；绝不带 `--show-token`）；设置/更新 token = `echo … | gh auth login --with-token`（**token 只经 stdin，argv 永不含明文**，落盘 hosts.yml 0600 由 gh 负责）；验证访问 = `gh api user --jq .login`（exit 0/1 判据清晰）。🟢（退出码/耗时实测）+ 🔴（`--with-token` 语义取自 gh help）
7. **健康检查推荐探针**：`gh api rate_limit --jq '{core:.resources.core,search:.resources.search}'`（连通 + 认证 + 限额三合一，不耗限额，实测 ~0.65s）∪ `gh auth status --json hosts`（本地认证配置面）∪ 计时/timeout 包裹（延迟维度）。本插件已注册的 `github_auth_status`（= `auth status` + `api rate_limit` 两条 gh 命令）与 `github_api`（`gh api` 封装）就是现成探针的工具形，健康检查路由可直接复用 `runGh` 执行器。🟡🟢

---

## 1. kb-context 的设置栏目怎么挂进 dsh 设置菜单

### 1.1 形态判定：纯 HTTP 路由 + 前端槽位注册，两面缺一不可

- **不是**独立前端服务。设置 UI 由 kb-context 自己的客户端 bundle 提供，宿主自动托管于 `/plugins/kb-context/client.js`（`lib/client.js:1-3` 注释即契约：`dsh.client` 声明被 `dsh-client-modules` 扫入浏览器花名册）。🟡
- HTTP 面只有数据路由，挂 **dsh webServer 同一 HTTP 端口**（即 dsh web 3080 那个 server），前缀 **`/api/kb-context`**（`lib/settings-routes.js:10` `export const API_PREFIX = '/api/kb-context'`）。🟡

### 1.2 读写路径

| 方法 | 路径 | 语义 | 证据 |
|---|---|---|---|
| GET | `/api/kb-context/settings` | 回 `{data:{config, editable, writable}}`（Config 面 + 可改白名单 + 写缝是否在位） | `lib/settings-routes.js:90-106` |
| POST | `/api/kb-context/settings` | body `{patch}` → 白名单预检 → `configEditor` 缝持久化；成功回 `{data:{ok:true, config}}` | `lib/settings-routes.js:108-129` |
| 其余方法 | 同址 | 405 + `allow` 头 | `lib/settings-routes.js:136` |
| 其余路径 | `/api/kb-context/*` | 404 `not_found` | `lib/settings-routes.js:138` |

- 错误形统一 `{error:{code,message}}`（`lib/settings-routes.js:20-22`）；状态映射：`not_editable|bad_patch|invalid`→400、`no_entry`→409、写缝缺位→503 `write_unavailable`（`lib/settings-routes.js:113,120`）。🟡

### 1.3 配置落盘到哪 & 写安全

- **落盘位置不在插件手里**：写缝 = 宿主 `configEditor` 服务（`@deepseek-ai/dsh-config-editor`，描述 "Persist plugin configuration through profile patches and Loader reconciliation"），即落 **profile 的 cordis patch 覆盖层**并 reconcile 热生效；kb-context 只做校验与白名单（`lib/settings-write.js:112-147` `createApplyPatch`：`configEditor.entries()` 找 entryId='kb-context' 的活动行 → `configEditor.edit(entry, fn)`）。🟡
- 写安全四层（`lib/settings-write.js`）：🟡
  1. **白名单叶子全等**（`EDITABLE_PATHS`，`settings-write.js:10-18`）；白名单外叶子 = 整单拒 `not_editable`，绝不静默丢键（`checkPatchEditable`，:81-91）；
  2. **投影最小写入形**（`projectEditable`，:62-73）——白名单外的键双保险不进写入形；
  3. **真 zod 校验**合并后的生效面 inherited∪current∪patch（`applyEditablePatch`，:99-110）；
  4. **惰性写缝求值**（per-request `ctx.get('configEditor')`，缺位 = GET `writable:false` / POST 503 如实，后到可见——B1 修复注释 `lib/index.js:177-201`）。
- 路由层写安全（`lib/settings-routes.js`）：每 handler 第一行过鉴权缝 `connection.requestRejection({headers})`（OW-INV-8 同款，:24-30）；请求体有界 1 MiB（:13,:48-63）；畸形 JSON=400 绝不静默当空。🟡
- **注册姿势 = 双层子插件**（`lib/index.js:212-242`）：外层插件 `inject=['tools']` 照常工具/pre-step；设置面数据挂内层 `ctx.plugin({inject:['webServer','connection'], apply})`——provider 缺位=延迟激活不炸装载（headless/acp 部署面不受伤），effect 内当场注册、返回值=拆除器。🟡

### 1.4 前端（设置栏目 UI 本体）

- `lib/client.js`：零构建 React 工厂形 bundle，`window.__ModuleLoader__.load({id:'kb-context', factory})`（:12-14）；`exports.inject=['slots']` + `exports.apply`（:253-254）。🟡
- 注册设置栏目（:220-237）：`ctx.slots.inject('settings.section', setup)` → `ctx.slots.register({name:'settings.section', id:'kb-context', order:30, label:()=>…}, KbContextSettingsSection)`；注册失败 warn 不炸插件。🟡
- 请求一律**文档相对**（无前导斜杠）`api/kb-context/settings`（:20；教训注释 skill-explorer issue #1707：站内绝对 `/…` 会逃出 `<base href="./">` = 生产 404 根因）。🟡
- 组件形态：`SettingsRow`（boolean=checkbox / number=input / string[]=textarea / 其余只读）+ 保存按钮（writable=false 时降级为只读提示），失败/拒绝在容器内如实报错（:105-213）。🟡
- 纯设置无面板行——不注册 `sidebar.panellist`/`main`（:10、:218 注释）；root 壳槽位禁注册（`settings.launcher/trigger/header/close/action/onboarding`，:11）。🟡

### 1.5 package.json 声明（前端被发现的入口）

`kb-context/package.json`：`exports['./client']="./lib/client.js"`；`dsh.client = {platform:'web', inject:['@deepseek-ai/dsh-client-locale','@deepseek-ai/dsh-client-ui-renderer','@deepseek-ai/dsh-client-ui-layout']}`。🟡

---

## 2. dshmarket（插件市场）的设置栏目形态

### 2.1 `client/`、`src/`、`locale/`、`lib/` 各是什么

| 目录 | 性质 | 证据 |
|---|---|---|
| `client/client.js` | **构建物**：tsdown 打包的浏览器 bundle（701,193 B 单文件），构建脚本 `build:client: tsdown && node scripts/normalize-client-banner.mjs` | `dshmarket/package.json:24-25`、目录实测 🟢 |
| `src/`（含 `src/client/*.ts(x)`） | **TS 源码**，随包分发（`files` 含 `src`），供审计/二次构建；`lib/` 是它编译出的 Node 半包（`routes.js` 361KB = 服务端路由面） | `dshmarket/package.json:70-80`、目录实测 🟢 |
| `locale/en.json`、`zh.json` | 包 meta 本地化字典（`{"meta":{"title":"插件市场","description":…}}`），走 `exports['./locale/*.json']`；**运行时 UI 字典另在 `src/client/locales.ts` 用 `ctx.locale.register(NS,{zh,en})` 代码内注册** | `dshmarket/package.json:62-68`、`locale/zh.json` 🟢、`src/client/index.ts:108` |
| `lib/` | 编译后的 Node 半包（install/update/backup/routes 等服务端能力） | 目录实测 🟢 |

### 2.2 如何注册进 dsh web GUI 的设置菜单

- **发现机制与 kb-context 完全同款**：`dsh.client` 声明（`inject:['@deepseek-ai/dsh-client-locale','@deepseek-ai/dsh-client-ui-settings','@deepseek-ai/dsh-client-ui-theme'], platform:'web'`）+ `exports['./client']="./client/client.js"`（`dshmarket/package.json:44-67`）。🟡
- **设置栏目入口** = `settings.section` 槽位注册（`src/client/index.ts:155-172`）：
  `ctx.slots.register({name:'settings.section', id:'market', order:40, label:()=>t('nav'), locale:NS, inject:()=>({t})}, (ownerProps)=>buildMarketElement(ownerProps))`，外面套 `createSectionGate`（HOST 不想要 / 插件被卸载时可收回，:122-172）。🟡
- **多座防御**（版本兼容，值得抄的取舍）：`settings.plugin.item`（老线设置卡座，嵌套 `ctx.inject(['settingsScope'])` 决定是否挂，:200-214）、`plugins.bundle.config`（dsh 0.1.7+ 插件管理器 bundle 配置座，:237-246）、`settings.plugins.tab`（0.1.7 线 Plugins 设置区页签座，:274-282）——**探测靠槽位本身**（`slots.inject` 等槽位方出现才跑），不查版本串。🟡
- 其他注册面：`shell.overlay`（装完 toast，:284-288）、`provide('market', marketControl)`（对外控制面，:185-191）、`settings-nav-icon.ts`（DOM 级 nav 图标替换 hack——因为 `settings.section` 无 icon 通道，:6-27）。🟡
- 服务端（设置数据）：`lib/settings.js` 走 `@deepseek-ai/dsh-settings` 服务的 settings namespace（`sctx.settings.register(ns, schema, {base})`，schemastery schema）——注意其注释记录的两条教训：**别 import 宿主具名 helper**（`installSettingsSection`/`settingsNamespace` 被删导致宿主起不来，`lib/settings.js:47-67`）；**0.1.7 起 `SettingsService` 变 `describe`/`update` 无 `register`**（:69-80），namespace 机制版本面不稳。🟡

### 2.3 设置栏目组件文件路径

- 源码：`dshmarket/src/client/MarketSection.tsx`（「设置栏目本体」，Discover/Favorites/Themes/Installed 多 tab）、`src/client/SettingsCard.tsx`（设置卡）、`src/client/index.ts`（注册壳）。
- 生产运行的只有构建物 `dshmarket/client/client.js`（上述组件已编入）。🟡

---

## 3. dsh web GUI 设置菜单的注册契约（可复用最小接入面）

### 3.1 插件侧必须提供什么

| # | 提供物 | 形态 | 缺了会怎样 | 证据 |
|---|---|---|---|---|
| ① | `package.json` 的 `dsh.client {platform:'web', inject:[…], external?:[…], immediately?:bool}` | manifest 声明 | 不声明 = 不进浏览器花名册，前端完全不加载 | `dsh-client-modules/lib/index.js:60-75`（parseDshClient 校验形） |
| ② | `exports['./client']` → 一个 bundle 文件 | 字符串或 `{default:字符串}` | 报错 `declares dsh.client but exports no "./client" bundle` | `dsh-client-modules/lib/index.js:170-188`、:713-719 |
| ③ | bundle 构建物在盘上 | 随包文件（零构建手写也行） | 启动报 `client bundle not found; run 'pnpm run build' before launch` | `dsh-client-modules/lib/index.js:122-133`（MissingClientBundleError） |
| ④ | bundle 体 = `window.__ModuleLoader__.load({id:<包名>, factory})`；factory(require) 返回 `{inject, apply}` | 工厂形 CJS | 模块系统 boot 时校验 exports 形 | `dsh-client-modules/lib/index.js:445-486`（`__ModuleLoader__` queue/boot 协议）；kb-context `lib/client.js:12-14,253-254` |
| ⑤ | 设置栏目 = `ctx.slots.inject('settings.section', () => ctx.slots.register({name:'settings.section', id, order, label}, Component))` | 槽位注册 | 栏目不出现 | `dsh-client-ui-settings/lib/types/client/contract/slots.d.ts:62-77`；kb-context `lib/client.js:220-237` |
| ⑥ |（数据面）`ctx.webServer.register({kind:'prefix'|'exact', path, handler})`（返回 disposer；重复 (kind,path) 抛错）+ `connection.requestRejection` 鉴权缝 | 宿主服务缝 | 无数据面=UI 只能静态 | `dsh-host-webserver/lib/types/index.d.ts:30,85-90`；kb-context `settings-routes.js:25-30,140` |
| ⑦ |（配置持久化）`configEditor.entries()/edit()` 缝（可缺位=只读如实降级） | 宿主服务缝 | 配置只读 | kb-context `settings-write.js:121-147`、`index.js:196-201`；`dsh-config-editor` package description 🟢 |

### 3.2 `settings.section` 槽位契约原文要点（宿主类型文件）

- `kind:'list'; scope:'root'`；registrant options 三要素：**`id`**（section key，驱动 `only` 过滤）、**`order`**（nav 位置）、**`label`**（registrant 本地化的展示文本——**locale 变化时由 registrant 重新注册新文本**，壳不订阅读 locale；ledger bump 兼作壳的重渲染触发）（`slots.d.ts:62-77`）。🟡
- owner props 只有 **`{close:()=>void}`**（关闭设置面板；数据一律走自己的 inject 面/store）（`slots.d.ts:147-157`）。🟡
- 邻座参考：`settings.plugins.tab`（Plugins 设置区页签，id/order/label，:78-90）、`settings.general.item`（General 里的单行偏好，无 label 投影、自行画整行，:106-124）。**root 壳槽位禁注册**：`settings.launcher/trigger/header/action/close`（chrome 归壳，:13-61）。🟡
- 壳 = `dsh-client-ui-settings-general`（占 `sidebar.settings`），"A feature owns its own settings pages — adding a setting never means editing the shell"（`slots.d.ts:1-9`）。🟡

### 3.3 浏览器侧装配链（一句话版）

HTML 里宿主注入 `__ModuleLoader__` 队列 + `__DSH_BOOT__` 花名册 → 依 `dsh.client` 扫描结果按**模块图序**（`external` 声明构成图边，环=启动报错）组合出 `/plugins/??id1/client.js,id2/client.js&rev=<hash>` combo（immutable 缓存）→ 每个 factory 落地 → `ctx.slots` 生态把 `settings.section` 贡献挂进设置面板。证据：`dsh-client-modules/lib/index.js:203-206`（PLUGIN_ROUTE='/plugins'、combo 形）、:407-437（orderByModuleGraph）、:445-486（boot 协议）、:918（`/plugins/<id>/` 前缀）。

### 3.4 请求路径铁律

浏览器 fetch 一律**文档相对（无前导斜杠）**：`api/<name>/…`。站内绝对 `/…` 在 login-gate 3500 基址下解析失败 = 生产 404 根因（kb-context `client.js:19-20`、wiki-steward `client.js:6-13` 双处同款教训注释）。🟡

---

## 4. wiki-steward / obsidian-web 的 web/ 形态（Vue + 构建物入库）

### 4.1 wiki-steward：Vue lib 构建物 + 零构建壳动态 import

- **构建**：`web/vite.config.js:9-29` —— vite lib 形单入口 `web/src/panel.js` → `web/dist/panel.js` + `dist/style.css`（`cssCodeSplit:false`，`assetFileNames:'style.css'` 钉名）；Vue 运行时打进构建物（devDeps），宿主运行时零第三方网络请求。`web/dist` **入库随包**（`package.json files` 含 `web`）。🟡
- **lib 侧注册**：`lib/client.js`（346 行零构建工厂形）注册两类槽位：① `settings.section`（配置展示/可改，读写 `api/wiki-steward/settings`）；② `sidebar.panellist` 行 + `main` 槽页（ingest 面板，:1-10 注释、:247-249）。🟡
- **dist 如何托管**：插件服务端自己静态服务——`lib/ingest-routes.js` 单 prefix `/api/wiki-steward` 内部分发 REST，**其余路径走静态面 `web/dist`**（`staticHandler`：解码→分量围栏→realpath 前缀核，穿越/越界不 200，:94-111,270-282）；`distDir` 缺省 `new URL('../web/dist', import.meta.url)`（`lib/index.js:625`）。前端消费 = 动态 `import('api/wiki-steward/panel.js')`（`lib/client.js:24,27-30`）。🟡
- **教训注释**（`ingest-routes.js:9-13`）：旧「站内绝对 `/wiki-steward/panel.js` 动态 import」在 login-gate 基址下 404，已弃；自造 `settings.plugins.tab` 页签也弃，回归官方 `settings.section`。🟡

### 4.2 obsidian-web：全 SPA 静态面 + iframe 进 `main` 槽

- `web/dist/`（index.html + assets，element-plus 按需）由 `lib/web-routes.js` 的 **`/ob/`** 前缀服务（T2 API 形 `/ob/api/*` + 静态面，`web-routes.js:1-21`）。🟡
- `lib/client.js:5-8,51,77-88`：`sidebar.panellist` 行 + `main` 槽页，页内容 = **iframe 复用既有 `/ob/` 三栏 UI**。🟡

### 4.3 与 kb-context 形的差异与取舍

| 维度 | kb-context 形（零构建 React 工厂） | wiki-steward/obsidian-web 形（Vue + vite 构建物） |
|---|---|---|
| 构建步骤 | 无（lib/ 手写 ESM/工厂形） | 有（`pnpm build`，构建物入库 `web/dist`） |
| UI 上限 | 适合表单/列表小面板（JS 无 JSX，createElement 手写） | 适合复杂交互（组件 ≤300 行、逻辑拆 `web/src/lib/`、.vue 只展示） |
| 托管 | 宿主自动 `/plugins/<id>/client.js` | 客户端壳仍自动托管；**大 UI 走插件自己的 `/api/<name>/*` 静态面**（或 `/ob/` 形） |
| 依赖 | 零第三方 | Vue/（可选 element-plus 按需）打进构建物，运行时零外网请求 |
| 风险 | 无构建=无类型/无编译检查 | 构建物入库需版本纪律同步重建；动态 import 路径必须文档相对 |

**取舍建议**：token 维护 + 健康检查是「状态卡 + 表单 + 按钮」级交互，kb-context 形完全够用且接入面最小；若后续要表格/树/多 tab 大面板，再升 wiki-steward 形（两者数据面契约同款，可后换壳不动路由）。

---

## 5. GitHub token 维护的落点

### 5.1 插件现状（dsh-github-ops）

- 入口 `lib/index.js`：`name='github-ops'`、`inject=['shell','tools']`（:22-23）；Config 8 键（enabled/ghBin/enforceCommands/webFetchPolicy/registerRepoTools/allowDelete/awareness/ghTimeoutMs，:25-34）；三层职责 = shell.resolve 命令改写（:47-62）+ web_fetch 门禁（:64-78）+ `runGh` spawnSync 工具执行器（:82-90，`GH_PROMPT_DISABLED=1`、超时 `ghTimeoutMs`、maxBuffer 4MiB）。🟡
- `lib/enforce.js:2-8` 的关键论证（🔴→🟡 注释即设计依据）：**GH_TOKEN/GITHUB_TOKEN 环境变量到不了 bash 子进程**（dsh-subprocess 凭据擦除），存活路径只有两条 = gh CLI（hosts.yml）与 `$(gh auth token)` 命令替换（值不进日志/recall）。token 维护的落点因此锁定 **gh 的 hosts.yml**，不进 profile config、不进环境变量。🟡

### 5.2 `/root/.config/gh/hosts.yml` 结构（仅结构，值已红act）

- 文件权限 **0600** 🟢；顶层 key = 主机名（本机 `github.com`）；每主机字段：
  - `active_account`（str，当前活动账号名）
  - `git_protocol`（str，如 https/ssh）
  - `oauth_token`（str，40 字符 token 值——**永不读出/写出/展示**）
  - `user`（str，主账号名）
  - `users`（str[]，该主机的账号名列表）
- 多账号语义：`users` 列表 + `active_account` 指针；token 按账号存放（`gh auth switch` 切换、`gh auth logout` 移除）。🟢（结构实测）

### 5.3 `gh auth` 子命令语义（用法 / 退出码）

| 子命令 | 语义 | 退出码 | 等级 |
|---|---|---|---|
| `gh auth status [--json hosts] [--show-token]` | 每主机每账号测认证状态；`--json` 恒 exit 0（除非 fatal），**退出码判据只在文本形**：有认证问题 exit 1 + stderr | 健康 exit 0 🟢；文本形带问题 exit 1 🔴（help 原文） | 🟢/🔴 |
| `gh auth status --json` 字段 | `hosts.<host>[] = {state, active, host, login, tokenSource, scopes, gitProtocol}`（**无 token 字段**；`--show-token` 只影响文本形展示）；本机实测 `state:"success"`、`tokenSource` = hosts.yml 路径 | — | 🟢 |
| `gh auth login --with-token` | **PAT 从 stdin 读入**（"pass in a personal access token (classic) on standard input"）；最小 scopes `repo`,`read:org`,`gist`；fine-grained PAT 官方建议改用 `GH_TOKEN` 环境变量（但本机环境变量进不了 bash 子进程，见 5.1） | 成功 0 / 失败非 0 | 🔴（help 文档；写路径未实测） |
| `gh auth token [-h host] [-u user]` | **输出 token 明文**——日志/报告/响应体永远禁用；只允许以 `$(gh auth token)` 命令替换形式出现在命令串里（值不落盘，`enforce.js:52-66` 同款纪律） | — | 🟡 |
| `gh auth refresh --scopes …` / `--remove-scopes` / `--reset-scopes` | 增删 OAuth scopes（最小三件套不可删）；`gh auth switch` 切活动账号 | — | 🔴（help） |

### 5.4 三条能力的安全命令路径（推荐）

| 能力 | 命令路径 | 安全性质 |
|---|---|---|
| 查看状态 | `gh auth status --json hosts --jq '.hosts["<host>"][] | {state,active,login,tokenSource,gitProtocol,scopes}'`（scopes 若嫌长只回条数） | JSON 无 token 字段、禁 `--show-token`；tokenSource 只回路径；🟢 投影实测可用 |
| 设置/更新 token | HTTP `POST api/github-ops/token {token}` → 服务端 `spawn(gh, ['auth','login','--with-token'], {stdin: token})` | **argv 不含明文**（stdin 通道）；gh 自己原子写 hosts.yml（0600）；响应只回 `{ok}`；请求体有界（≤1 MiB，仿 kb-context `settings-routes.js:13`）；**全链路禁 log body**，错误 message 过正则擦除 `ghp_*/github_pat_*` 后才回 |
| 验证访问 | `gh api user --jq .login`（或下节探针组合） | 输出只有 login 名；坏 token = `gh: Bad credentials (HTTP 401)` exit 1 🟢 |

补充约束：写 token 属**安全敏感动作**（红线），UI 上应有显式确认 + 只在 HTTPS/loopback 的 webServer 面内做（dsh web 3080 = loopback）；绝不明文出现在会话注入/工具输出/CHANGELOG。

---

## 6. GitHub 访问健康检查

### 6.1 轻量探针选标（实测 🟢）

| 探针 | 测出维度 | 实测 | 备注 |
|---|---|---|---|
| `gh api rate_limit --jq '{core:.resources.core,search:.resources.search}'` | 连通性 + 认证有效性 + 限额余量/重置时刻 | exit 0，~0.65s，回 `{core:{limit,remaining,reset,used},search:{…}}` | **不消耗限额**；一发三查，主推 |
| `gh api user --jq .login` | 连通 + 认证（401=坏 token） | exit 0，~0.65s；坏 token：`gh: Bad credentials (HTTP 401)` exit 1 | 最小语义探针 |
| `gh auth status --json hosts` | 本地认证配置面（账号/active/tokenSource/scopes/协议） | exit 0（恒 0，须看 `state` 字段：`success`/其他） | 网络不通时仍可跑=定位「本地配置 vs 网络/API」分界 |
| 延迟/超时维度 | 用 `timeout <N>` 包裹 + 墙钟计时（spawn 计时） | 基线 ~0.65s（含 spawn） | 阈值建议 ≥3s 判慢、≥`ghTimeoutMs` 判超时 |

推荐健康检查三段判定：**本地配置（auth status JSON）→ API 连通+认证（rate_limit 或 user）→ 延迟计时**；任一段失败映射为结构化 `{ok:false, stage, code, message}`，让 UI 能区分「没登录 / token 失效 / 网络不通 / 限额耗尽（remaining=0 且 reset 时刻）」。

### 6.2 本插件已注册工具现状

- **`github_auth_status`**（`lib/repo-tools.js:36-46`）：两条 gh 命令 = `['auth','status']` + `['api','rate_limit','--jq','{core:.resources.core, search:.resources.search}']` —— 已经就是「状态 + 限额」探针的工具形；差异：它是文本形 `auth status`（带掩码 token 行 `ghp_****` 与 scopes 全文），健康路由应换 `--json` 投影形瘦身。🟡
- **`github_api`**（`lib/repo-tools.js:163-188`）：`gh api` 封装（path/method/query/fields/jq/paginate；非 GET 需 `confirm="yes"`）——健康探针 `github_api {path:'rate_limit', jq:'…'}` 或 `{path:'user', jq:'.login'}` 即可复用，但设置面板走自己的路由更直接（不占工具调用/会话 token）。🟡
- 执行器 `runGh`（`lib/index.js:82-90`）= spawnSync + 超时 + 输出裁剪（`renderSteps` cap 6000，`repo-tools.js:17-29`），健康路由可直接复用同款（改成 spawn 异步 + 计时更佳）。🟡

---

## 7. 对 dsh-github-ops 新增「dsh 设置菜单栏目」的推荐接入方案

### 7.A 最小可行（推荐首选：kb-context 形，零构建）

1. **manifest 两行**：`package.json` 加 `exports['./client']="./lib/client.js"` + `dsh.client={platform:'web', inject:['@deepseek-ai/dsh-client-locale','@deepseek-ai/dsh-client-ui-renderer','@deepseek-ai/dsh-client-ui-layout']}`（照 kb-context 同款列表，🟡 `kb-context/package.json`）。
2. **客户端壳 `lib/client.js`**（零构建 React 工厂形，照抄 kb-context `lib/client.js` 骨架）：
   `window.__ModuleLoader__.load({id:'github-ops', factory})` → `exports.inject=['slots']` → `ctx.slots.inject('settings.section', …)` 注册 `{name:'settings.section', id:'github-ops', order:25, label:()=>…}`，组件 = 三块：① 状态卡（state/login/tokenSource/gitProtocol/scopes 条数 + core 限额 remaining/limit + reset 本地时刻 + 延迟 ms）② token 维护（密码型输入 + 「验证并保存」按钮 + 显式确认）③ 「重新检查」按钮。失败/拒绝容器内如实报错。
3. **服务端数据面 `lib/settings-routes.js`**（照抄 kb-context 双层子插件形 `index.js:212-242` + 路由形 `settings-routes.js`）：
   - `GET api/github-ops/status` → 三段健康检查结果（6.1 判定式），**不含任何 token 字段**；
   - `POST api/github-ops/token` → `{token}` 经 **stdin** 喂 `gh auth login --with-token`；响应 `{ok}` 或 `{error:{code,message}}`（message 擦除凭据形）；
   - `POST api/github-ops/check`（可选）→ 强制重跑探针。
   - 每 handler 首行 `connection.requestRejection` 鉴权缝；请求体有界；**禁 log 请求体**；路由注册 `ctx.webServer.register({kind:'prefix', path:'/api/github-ops', handler})`。
4. **不走 configEditor**：token 是 secret 不进 profile config；若同时想暴露 `allowDelete`/`webFetchPolicy` 等可改配置，再加 `EDITABLE_PATHS` 白名单 + `configEditor.edit` 缝（照 kb-context `settings-write.js` 全套校验）。
5. **测试形**：`test/load.test.mjs` 真 `import('../lib/index.js')` + integration 形（假 ctx 真 `apply()` + 真 handler，断言 API 面/注册面；客户端 factory 用注入 `__fetch`/exec 缝单测——kb-context/wiki-steward 均留 `exports.__fetch` 测试缝，照抄）。🟡

### 7.B 可选进阶（按需，勿在最小面里前置）

- **Vue 形面板**（wiki-steward 形）：`web/`（vite lib → `web/dist/panel.js+style.css` 入库）+ `/api/github-ops/*` 静态面 + 客户端动态 `import('api/github-ops/panel.js')`。适合后续加 token 历史/多账号表格/探针日志等复杂交互。
- **多座注册**（dshmarket 形）：加 `plugins.bundle.config`（key='dsh-github-ops'）让插件管理器 bundle 页也有入口；`slots.inject` 自探测、无版本判断。
- **多账号维护**：`gh auth switch` / `gh auth logout` / `gh auth refresh --scopes` 三个动作进状态卡（均 argv 无 token）。
- **凭据引用缝**：宿主 `ctx.credentials`（`dsh-credentials`："settings carry references to secrets, providers own the values"，🟡 types 注释）——若要与官方 secret 管理对齐可评估 provider 写 hosts.yml/供 `GH_TOKEN`；但注意 5.1 的环境变量擦除约束，**不要**把 token 改存 profile config 或 env 作为「简化」。
- **locale 化**：`ctx.locale.register(NS,{zh,en})`（dshmarket `src/client/index.ts:108` 形）或 `locale/*.json` meta；最小面可先硬编码中文。

### 7.C 风险与红线备忘

- token 只经 stdin/`$(gh auth token)` 两个通道；出现「把 token 放进 argv/日志/响应/报告」的实现 = 直接打回。
- `gh auth status --json` 退出码恒 0，**不可**用 exit code 做健康判据（须看 `state`）；文本形 exit 1 判据反而可靠但输出含掩码 token 行与 scopes 全文。
- 快照无热链路：本能力上线 = 发版五步 + 换 tag 重装 + 重启（用户空档）。
- 客户端 fetch 一律文档相对；插件 id/包名/模块 id 三者保持一致（`github-ops` 现为 `name` 导出，`package.json name` 是 `dsh-github-ops`？——见 NEEDS_HUMAN #1）。

---

## 8. NEEDS_CONTEXT / NEEDS_HUMAN（未决问题）

1. **NEEDS_HUMAN｜模块 id 与包名一致性**：`lib/index.js` 导出 `name='github-ops'`，而目录/发版名是 `dsh-github-ops`。`dsh-client-modules` 以 **manifest package name** 标识浏览器模块（`lib/index.js:121` "The manifest package name identifies the browser module"），`__ModuleLoader__.load({id})` 应与之一致（kb-context/wiki-steward 均为包名即 id）。需确认 `dsh-github-ops/package.json` 的 `name` 字段最终值，并让 client bundle 的 id 与它一致（否则组合/路由对不上号）。
2. **NEEDS_CONTEXT｜设置栏目 id/名称/排序**：栏目 id 用 `github-ops` 还是 `dsh-github-ops`？label 文案（「GitHub」/「GitHub Ops」）与 `order`（kb-context=30、market=40，建议 25）待产品定夺。
3. **NEEDS_HUMAN｜token 更新动作的安全审批面**：UI 里 token 保存是否需要二次确认/输入遮罩/审计记录（写 hosts.yml 会替换当前账号 token）？以及是否允许「登出/切换账号」这类破坏性动作进 UI（建议默认不放，红线口径）。
4. **NEEDS_CONTEXT｜健康检查阈值**：慢/超时阈值（建议 3s / `ghTimeoutMs`）与「限额耗尽」提示是否需要 reset 时刻本地化展示；探针是否要并入会话注入的 awareness。
5. **NEEDS_CONTEXT｜`gh auth login --with-token` 行为细节未实测**（🔴）：成功/失败退出码、对既有账号 token 的替换语义、fine-grained PAT 的实际表现——实现阶段应在测试环境用**一次性假 token** 实测失败形（切勿用真实 token 在测试日志里跑）。
6. **NEEDS_HUMAN｜是否纳入 `gh auth refresh`（scopes 维护）**：会触发 GitHub 授权流（设备码/浏览器），headless 环境体验存疑；建议 v1 不做，列入进阶。

---

## 附：证据索引（文件:行号速查）

- kb-context：`/root/.dsh/profiles/web/node_modules/kb-context/lib/{index.js,client.js,settings-routes.js,settings-write.js}`、`package.json`
- dshmarket：`/root/.dsh/profiles/web/node_modules/dshmarket/{package.json,lib/settings.js,src/client/index.ts,src/client/MarketSection.tsx,src/client/settings-nav-icon.ts,locale/zh.json}`
- 宿主契约：`/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/{dsh-client-modules/lib/index.js,dsh-client-ui-settings/lib/types/client/contract/slots.d.ts,dsh-host-webserver/lib/types/index.d.ts,dsh-client-connection/lib/types/rpc.d.ts,dsh-config-editor/package.json,dsh-credentials/lib/types/index.d.ts}`
- workspace 形态：`/opt/workdata/dsh-plugins/{wiki-steward/lib/{client.js,index.js,ingest-routes.js},wiki-steward/web/vite.config.js,obsidian-web/lib/{client.js,web-routes.js}}`
- 插件现状：`/opt/workdata/dsh-plugins/dsh-github-ops/lib/{index.js,repo-tools.js,enforce.js}`
- gh 实测：`gh --version`（2.90.0）、`gh api user` / `gh api rate_limit` / `gh auth status [--json hosts]` / 坏 token 探针（2026-09-29 本机）
