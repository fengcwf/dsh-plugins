# 三个同类 dsh 插件调研（dsh-git-remotes / dsh-git-forge / dsh-github-workbench）——功能复用与优化需求重定

- 日期：2026-09-29（Phase 0 只读调研，第二轮：同类项目复用调研）
- 调研对象：`gestaltrun/dsh-git-remotes` 0.1.0、`thirsty5034/dsh-git-forge` 0.1.5、`meyaomiao/dsh-github-workbench` 0.3.0（均浅克隆至 /tmp 实读源码）
- 对照基线：`/opt/workdata/dsh-plugins/dsh-github-ops`（0.2.1）+ 既有报告 `settings-integration-research.md`（设置栏目挂载契约）
- 证据等级：🟢 = 本机实测；🟡 = 读过源码（含文件:行号）；🔴 = 仅文档/README/注释
- 红线遵守：全文零 token 明文/凭据值，仅描述结构与字段名

---

## ⚠️ 命名歧义（置顶，NEEDS_HUMAN #1）

**用户原话写的是 `yq04/dsh-git-remotes`，该 owner 下查无此仓**：`gh repo view yq04/dsh-git-remotes` 返回 `GraphQL: Could not resolve to a Repository with the name 'yq04/dsh-git-remotes'`（🟢 2026-09-29 实测）。GitHub 搜索仅 `gestaltrun/dsh-git-remotes` 为最接近同名项，本次调研以它为准。

**关键线索**：`gestaltrun/dsh-git-remotes` 自己的 README 安装命令仍然写 `git+https://github.com/yq04/dsh-git-remotes.git`（`README.md:20` 🟡），而仓库当前归属 gestaltrun。两种可能：① 仓库由 yq04 转让/改名至 gestaltrun，README 未同步；② gestaltrun 是 fork/重发布而 README 引用原作者。**调研结论对该仓功能面的可信度高（源码实读），但「哪个是用户想要的那一个」需用户裁决**，见第 4 节。

---

## 0. 结论摘要（逐仓一句话画像）

| 仓库 | 一句话画像 | 与我们需求最相关的一点 |
|---|---|---|
| `gestaltrun/dsh-git-remotes` | better-sidebar 的「Git 远程」页签：fetch / ff-only pull / 人肉确认 push，**不存任何 token**，安全姿势（URL 凭据擦除、argv-only、Host 信任围栏）是三仓中最干净的样板 | 安全姿势可整套借鉴；功能面（remote 操作）与我们互补不重叠 🟡 |
| `thirsty5034/dsh-git-forge` | better-sidebar 的「Forge 账号库 + 按项目授权 + push 策略」：**多账号 token 录入/存储/探测验证**（GitHub/Gitea/GitLab/Gitee/Bitbucket），token 存 `$DSH_HOME/git-forge/secrets.json`（0600），永不进模型上下文 | **token 维护/验证的形态学金矿**：probeAccount 结构化探针、留空=保留原 token、tokenConfigured 布尔投影、health 自检方法 🟡 |
| `meyaomiao/dsh-github-workbench` | 纯客户端「GitHub 工作台」：侧边栏仓库树 + Issues/PR/Actions + 收件箱，PAT 存浏览器 localStorage 直连 api.github.com，三形态挂载（原生右侧栏 → better-sidebar 页签 → 独立面板） | 错误分类文案、限额可视化、whoami 身份探针可借鉴；**localStorage 明文 token 姿势不复用**（违我们凭据纪律）🟡 |

**核心判定**：三个竞品**全部挂在 better-sidebar / 原生侧边栏页签上，没有一个进 dsh 设置菜单**——我们「settings.section + webServer REST + 零构建壳」方案（既有报告 7.A）**没有竞品先例、维持原案**；token 维护与健康检查的功能形态则在 dsh-git-forge 里有成熟先例，**可复用形态、不复用存储**。

---

## 1. 逐仓功能清单

### 1.1 gestaltrun/dsh-git-remotes（0.1.0，TypeScript + tsdown 构建）

**功能面**（`README.md:5-12, 34-41` 🔴→🟡）：
- 状态视图：当前分支、上游、ahead/behind、remote 列表（`src/parse-status.ts` 🟡）
- `git fetch`（全部或指定 remote，默认 prune 清 `[gone]` 跟踪分支）
- `git pull --ff-only`（分叉报错，不隐式 merge）
- `git push`（面板**二次确认 `confirm:true`** 才执行；**无 force-push**、**不给模型注册 push 工具**，`src/index.ts:109-122` 🟡）

**挂进 dsh GUI 的形态**：
- Host 半：`inject=['webServer','sessions','loader']`（`src/index.ts:29`），REST 前缀 `/git-remotes/api`（`src/index.ts:31`），方法面 `status/fetch/pull/push` 一方法一路径、POST-only JSON（`src/index.ts:86-124,137` 🟡）
- 客户端半：`ctx.betterSidebar.registerTab({id:'dsh-git-remotes', title:'Git 远程', order:25, single:true})`（`src/client/index.tsx:26-33` 🟡）；`dsh.plugin.json` 的 `client.main: ./lib/client-registry.js`、`cordis.patch.yml` bundle insert（🟡）
- 无 better-sidebar 时 host 路由照挂、Tab 不出现（`README.md:23` 🔴）

**配置与凭据**：
- **零 token 存储**：「推送凭据走你本机已有的 credential helper / SSH agent，插件不存 token」（`README.md:30` 🔴）
- 唯一配置 = `trustedHosts`（从 loader 的 `connection` entry config 读，`src/index.ts:53-61` + `src/context-types.ts:32` 🟡）

**安全姿势（三仓最佳，值得整套抄）**🟡：
- **URL 凭据擦除**：`redactRemoteUrl` 把 `user:pass@host` → `user:***@host`，错误文本/URL 展示前统一过（`src/redact.ts:2-6`；应用于 `src/git.ts:70,128`、`src/classify.ts:10`）
- **argv-only spawn**：`spawn('git', [...args])` 无 shell 拼接，`LC_ALL=C`、timeout kill（`src/git.ts:2-5,51`）
- **remote 名先校验再进 argv**（`src/remote-name.ts:3`）、路径围栏（`src/path-guard.ts`）
- **Host 信任围栏**：请求 Host 头须 loopback 或配置的 trustedHosts，否则 403（`src/trust-fence.ts:2-53`，`src/index.ts:132-135`）
- push 双保险：`confirm:true` 必须显式传 + `force` 传 true 直接 400（`src/index.ts:110-115`）

### 1.2 thirsty5034/dsh-git-forge（0.1.5，零构建 ESM + 零构建客户端）

**功能面**（`README.zh-CN.md:5-15, 76-96` 🔴→🟡）：
- **账号库**（多账号）：GitHub / Gitea / GitLab / Gitee / Bitbucket，字段 `id/name/provider/gitHost/apiBase/authMethod(token|ssh)/username/defaultOwner` + 分离存储的 `token`（`lib/index.js:129-185` 🟡）
- **按项目授权**（`projectPathKey` = DSH 会话工作区 cwd，env `DSH_GIT_FORGE_PROJECT` 优先，`lib/index.js:81-88,777-785` 🟡）
- **push 拦截**：`ctx.tools.guard` 硬拦 bash `git push` / `git remote add|set-url` 指向未授权 host；裸 `git push` 解析 remote URL 后判定（`lib/index.js:541-583` 🟡）；未配置授权的项目默认不拦（`README.zh-CN.md:103` 🔴）
- **模型工具 `GitForge`**（只读策略面：list_accounts / list_project_accounts / get_policy / check_remote，`lib/index.js:585-713` 🟡）
- **Agent HTTPS git 凭据助手**：生成 `gitconfig`（写 `$DSH_HOME/git-forge/gitconfig` + `GIT_CONFIG_GLOBAL` env 指向，不碰 `~/.gitconfig`，`lib/index.js:715-755` 🟡），helper 脚本 `scripts/git-credential-dsh-git-forge.mjs` 只在 Host 内读 secrets；R1 = 同 host 恰好 1 个已授权 token 账号才自动注入（`lib/shared/credential-select.js:2-60` 🟡）
- **系统提示词 section**（`registerPrompt`，含「Never ask the user to paste tokens into chat」，`lib/index.js:796-813` 🟡）+ shellEnv 非敏感诊断变量（`lib/index.js:758-794` 🟡）

**挂进 dsh GUI 的形态**：
- Host 半：`inject=['webServer','sessions','tools']`（`lib/index.js:47`），REST 前缀 `/dsh-git-forge/api`、POST-only、单方法路径分发：`health / getProjectContext / listAccounts / saveAccount / deleteAccount / getGrants / setGrants / setUnboundPolicy / getUnboundPolicy / probeAccount / checkRemote`（`lib/index.js:430-516, 815-866` 🟡）
- 客户端半：better-sidebar 页签（`lib/client.js` 673 行，UI 对齐 dsh-ssh-tunnel 风格 `README.zh-CN.md:13` 🔴）；三栏结构 = 项目授权 / 账号库 / 策略状态（`README.zh-CN.md:76-80` 🔴）；`dsh.client.inject=['@deepseek-ai/dsh-client-locale']`、i18n zh/en 字典（`lib/client.js:18-128` 🟡）
- **同样不进 dsh 设置菜单**，无 `settings.section`

**配置与凭据存储**（`README.zh-CN.md:66-74` 🔴 + `lib/index.js:53-78` 🟡）：
- `$DSH_HOME/git-forge/` 目录（chmod 0700）：`accounts.json`（账号元数据，无 token）、`secrets.json`（token，`byAccountId` 映射，0600）、`grants.json`（projectPathKey → accountIds + enforcePush + unboundPolicy）、`gitconfig`（生成的 helper 配置，文件头注明 "do not put tokens here"）
- **录入通道 = 侧栏账号表单**（字段：名称/平台/Git Host/API Base/认证方式/Token/用户名/默认 owner，`lib/client.js:25-50` 🟡）→ POST `saveAccount` → `upsertAccountRecord` 写双文件（`lib/index.js:458-460,129-185` 🟡）
- token 输入框 `type="password"` + autoComplete off（`lib/client.js:535` 🟡）；**留空 = 不修改已有 token**（`lib/client.js:36` tokenHint 🟡）；清除 token 走独立 checkbox（`lib/client.js:37,541-542` 🟡）

**安全姿势** 🟡：
- 模型面/工具输出**禁止 token 字段**：`modelAccountSummary` 黑名单键 `['token','password','secret','pat','access_token','accessToken']`（`lib/shared/account-summary.js:112-130`）；UI 面 `publicAccount` 只回 `tokenConfigured` 布尔（`lib/shared/account-summary.js:80-108`）
- probe 请求 token 只进 HTTP 头（provider 分头：GitLab `PRIVATE-TOKEN` / Gitea `token ` / 其余 `Bearer `），不进 URL/argv（`lib/index.js:308-320` 🟡）
- REST 面 Host 信任围栏（loopback / trustedHosts，403 otherwise，`lib/index.js:393-412,834-837` 🟡）
- 生成 gitconfig 0600、注释明示不含 token（`lib/index.js:722-742` 🟡）

**健康检查/验证先例（对我们最有价值的部分）**：
- **`probeAccount`**（`lib/index.js:260-391` 🟡）：`GET {apiBase}/user` + **10s AbortController 超时** + 结构化结果 `{ok, mode, status, url, apiBase, login, message, gitHost, bodyHead(80字符)}`；失败 hint 分类：401/403 →「check token scopes / validity」、404 → 按 provider 提示 apiBase 路径（Gitea 应以 /api/v1 结尾）、超时 →「check LAN DNS/TLS/firewall from the DSH host」（:384）；ssh 账号不探测只报「use system git/ssh」（:264-271）；未配 token →「token not configured — edit the account and paste a PAT」（:274-281）
- **`health` 方法**（`lib/index.js:431-441` 🟡）：插件自检 = `{ok, version, name, gitForgeRegistered, gitCredentialHelper(文件在位), gitconfigPath, gitConfigGlobalActive}`——纯非敏感诊断，供 UI/排障

### 1.3 meyaomiao/dsh-github-workbench（0.3.0，React + esbuild 双入口）

**功能面**（`README.md:63-86` 🔴→🟡）：
- Code：远端目录树（`git/trees?recursive=1` 一次拉取）+ 文本文件行号预览（<900KB，超限降级外链）
- Issues / PR 全量列表（Search API `is:issue`/`is:pr`）+ **写操作**：建 Issue/PR、评论、编辑、关闭重开、合并三法（merge/squash/rebase 强确认弹窗）
- Actions：runs 列表 + 重跑/取消（取消需确认）
- 仓库切换器（自动识别工作区 `.git/config`、公开仓搜索、最近使用）+ 聊天 GitHub 链接接管 + 收件箱（Issues/PR/Actions 三分栏未读）
- 页脚实时 **core 限额剩余**（`src/workbench.tsx:328` 🟡）

**挂进 dsh GUI 的形态（三形态运行时协商，`src/mount.ts` 全文 🟡）**：
1. **官方原生右侧栏**（DSH 0.1.5+，最高优先）：`ctx.inject(['sidebarRightTabs','sidebarRight'])` → `tabs.register({id:'dsh-github-workbench', kind:'github-workbench', priority:'extension'})` + `ctx.slots` 注册 `'sidebar.right.pane.tab'` / `'sidebar.right.pane.tab.title'` 座位（`src/mount.ts:44-108`）
2. **better-sidebar 页签**：`registry.registerTab({id:'github-workbench:repo', order:55, urlTarget:github.com 链接接管, settings:{toggles, pluginToggles}})`（`src/mount.ts:238-285`）
3. **独立右侧面板**（无 better-sidebar 兜底）：自绘固定层 + 竖条开关 + 拖缘调宽，运行时收敛防双挂载（`src/mount.ts:287-423`）
- 纯客户端插件：服务端 `apply()` 空（`src/index.ts:13-18` 🟡），全部数据浏览器直连 api.github.com（CORS 对浏览器开放，`cordis.patch.yml` 注释 🔴）

**配置与凭据**（`src/config.ts` 🟡）：
- **localStorage 单一事实源**（`gw.token`/`gw.repo`/`gw.branch` 等，`src/config.ts:9-30`）
- better-sidebar 齿轮设置作 token 兜底源：tab descriptor `settings.pluginToggles: [{key:'token', type:'text'}, {key:'autoRefreshSec', type:'number'}]`（`src/mount.ts:259-268` 🟡），值经 `absorbHostToken` 一次性合并进 localStorage（`src/config.ts:98-110` 🟡）
- 自己的 ⚙ 设置弹层里 token 输入是 `type="password"`（`src/workbench.tsx:635` 🟡），但**宿主 pluginToggles 通道是 `type:'text'`**（`src/mount.ts:266` 🟡）且 localStorage 为**明文**——与我们「token 零明文落盘」纪律冲突

**安全姿势** 🟡：
- 优点：token 不经 DSH 服务端、不进会话上下文、无服务端日志面（纯客户端，`README.md:77-86` 🔴）；密码型输入框；错误文案不回显 token
- 缺点：token 明文存 localStorage + 宿主 pluginSettings（`type:'text'`）；浏览器侧 XSS 面无额外防护；无 URL 凭据擦除需求（token 只进 header）

**健康检查/验证先例**：
- **whoami 身份探针**：`getViewerLogin()` = `GET /user` → `login`（结果缓存，`src/api.ts:546-555` 🟡）——同时是「token 是否有效」的隐式验证 + 评论删除按钮归属判断
- **限额可视化**：每次响应读 `x-ratelimit-remaining`/`x-ratelimit-resource`（`src/api.ts:63-64`），页脚实时展示（`src/workbench.tsx:328`）
- **错误分类文案**（`src/api.ts:77-89` 🟡）：401「Token 无效或已过期(HTTP 401)。请在 ⚙ 设置里检查 Personal Access Token」/ 403 限额耗尽 vs 权限不足（看 remaining=0 + upstream 文本）/ 404「确认 owner/repo、分支或编号正确；私有仓需 Token 具备读取权限」/ 422 参数校验
- **token 状态点**：已配置 PAT(5000/h) vs 未配置（匿名 60/h 无法写）（`src/workbench.tsx:303-304` 🟡）

### 1.4 对照：dsh-github-ops 现状（0.2.1）

三层职责（`lib/index.js:1-13` 🟡）：① `shell.resolve` 改写（curl/wget→GitHub API 注入 `Bearer $(gh auth token)`、git clone https→`gh repo clone`）② web_fetch 门禁（deny/ask/off）③ 10+1 gh 后端工具（`github_auth_status`/`github_repo_list/search/info/clone/create/fork/edit/archive/delete` + `github_api`）。token 单一认证源 = gh CLI hosts.yml（0600），**无任何 GUI**。已有探针工具 `github_auth_status`（auth status + rate_limit 组合）。

---

## 2. 重叠/互补矩阵

### 2.1 逐功能矩阵

| 功能 | 出处 | 与 dsh-github-ops 关系 | 判定 |
|---|---|---|---|
| curl/git 命令强制注入认证 | 我们 enforce.js | 三仓均无（forge 用 credential helper 达成同效） | **独有**（forge 的 helper 是互补实现路径） |
| web_fetch 匿名抓取门禁 | 我们 enforce.js | 三仓均无 | **独有** |
| gh 后端仓库管理工具（10+1） | 我们 repo-tools.js | workbench 的 Issues/PR/Actions 是 GUI 面同域操作 | **互补**（模型面 vs 人肉 GUI 面） |
| GitHub token 状态查看 | 需求① | forge 账号库 `publicAccount`（tokenConfigured 布尔）+ workbench 状态点/限额 | **重叠**（形态先例在 forge） |
| token 设置/更新 | 需求① | forge 表单→`saveAccount`（自有 secrets.json）；workbench ⚙→localStorage | **重叠**（存储落点不同：我们=gh hosts.yml 经 stdin） |
| token 验证（probe） | 需求① | **forge `probeAccount` 先例**（结构化+超时+分类 hint）；workbench `getViewerLogin` | **重叠**（直接可借鉴形态） |
| token 删除/登出 | 需求①明示不做 | forge 有 clearToken/deleteAccount | 不做（维持原案，forge 该点不复用） |
| 访问健康检查（连通/认证/超时） | 需求② | forge probe 超时 hint + workbench 401/403/404 分类 + 我们 rate_limit 三合一探针 | **重叠**（形态互补拼装） |
| 插件自检 health 端点 | 无 | **forge `health` 方法先例** | **独有于 forge**（建议吸收） |
| REST 面 Host 信任围栏 | 无 | **forge + git-remotes 双先例**（isTrusted/isTrustedApiRequest） | **独有于竞品**（建议吸收，与我们 connection 缝双保险） |
| URL/错误凭据擦除 | 无 | **git-remotes `redactRemoteUrl` 先例** | **独有于 git-remotes**（建议吸收） |
| remote fetch/pull/push 面板 | 无 | git-remotes 全套 | **独有于 git-remotes**（建议不复用，见 2.3） |
| 多 forge 账号库（Gitea/GitLab/…） | 无 | forge 全套 | **独有于 forge**（建议不复用，见 2.3） |
| 按项目授权 + push 策略 | 无 | forge 全套 | **独有于 forge**（建议不复用，生态协同） |
| Issues/PR/Actions/收件箱面板 | 无 | workbench 全套 | **独有于 workbench**（建议不复用） |
| dsh 设置菜单栏目（settings.section） | 需求①②的挂载点 | **三仓均无先例**（全挂侧边栏页签） | **独有**（维持 kb-context 形原案） |

### 2.2 重点问题一：账号/token 管理形态 vs 我们「token 维护」需求

- **dsh-git-forge = 唯一完整的账号/token 管理面**：多账号（id 区分元数据与 secret 双文件）、录入通道 = 侧栏表单 → POST REST、存储 = `$DSH_HOME/git-forge/secrets.json`（0600，目录 0700，`byAccountId` 映射）、验证 = `probeAccount`（结构化结果 + 10s 超时 + 分类 hint）、更新语义 = **留空保留原 token**、清除 = 显式 checkbox、投影纪律 = 模型面黑名单键 + UI 面只回 `tokenConfigured` 布尔（`lib/index.js:53-78,129-185,260-391`、`lib/shared/account-summary.js:80-130`、`lib/client.js:36,535` 🟡）。
- **与我们的关键差异**：forge 自持 token 库（credential helper 注入 HTTPS git）；**我们锚定 gh CLI hosts.yml 单认证源**（enforce.js 论证：dsh 子进程环境变量擦除，hosts.yml 是存活路径，既有报告 5.1 🟡）。**双 token 库会造成「工具认 gh、git 认 forge」的分裂**——所以复用形态、不复用存储。
- **可复用清单**（→ 需求①）：① `probeAccount` 结构化结果形与超时/hint 文案分类（`lib/index.js:308-391`）；② 「留空=不修改」更新语义（`lib/client.js:36`）；③ `tokenConfigured` 布尔投影 + 黑名单键擦除（`account-summary.js:130`）；④ token 输入 `type="password"` + autoComplete off（`lib/client.js:535`）；⑤ provider 分认证头思路 → 我们只需 `Bearer`（`gh api user` 封装）。
- **workbench 可复用**：whoami 探针（`src/api.ts:546-555`）、token 状态点（`src/workbench.tsx:303-304`）。**不复用**：localStorage/`pluginToggles type:'text'` 明文存储（`src/config.ts:29-30`、`src/mount.ts:266`）。
- **git-remotes 可复用**：`redactRemoteUrl`（`src/redact.ts:5-6`）；其「插件不存 token」哲学与我们一致（`README.md:30`）。

### 2.3 重点问题二：设置栏目/设置面形态 vs 我们 settings.section 方案

- **三仓没有任何一个进 dsh 设置菜单**：git-remotes = better-sidebar registerTab（`src/client/index.tsx:26-33`）；forge = better-sidebar 页签三栏（`README.zh-CN.md:76-80`）；workbench = 原生右侧栏座位 / better-sidebar 页签 / 独立面板三形态（`src/mount.ts`）。
- **唯一的「设置字段」先例**是 better-sidebar tab descriptor 的 `settings.pluginToggles`（声明式字段 `{key,title,type:'text'|'number',min,max}`，宿主齿轮渲染，`src/mount.ts:259-268` 🟡）——但宿主是 **better-sidebar 的页签齿轮**，不是 dsh 设置菜单，且该通道 token 字段是 `type:'text'` 明文。
- **结论**：我们「`settings.section` 槽位 + webServer REST + 零构建壳（kb-context 形）」方案**维持原案**（既有报告 7.A），它是 dsh 设置菜单的唯一挂法；竞品补充的是**数据面安全姿势**（Host 信任围栏、凭据擦除、结构化错误）。可吸收的多座防御思想 = dshmarket 的 `plugins.bundle.config` 插件管理器入口（既有报告 7.B 已列，进阶）。
- 另一个可吸收的挂载细节：workbench 的 `ctx.inject(['slots', …])` 座位等待 + 「服务迟到自动切换形态、杜绝双挂载」的收敛策略（`src/mount.ts:41-197` 🟡）——若未来设置面要降级容错可参考；v1 最小面用不上。

### 2.4 重点问题三：三仓有而我们没有、用户日常可能要的功能

| 功能 | 出处 | 建议 | 理由 |
|---|---|---|---|
| remote 状态/fetch/ff-only pull/确认 push | git-remotes | **不复用** | better-sidebar 生态已有专插件（装即得）；与内置 Git Tab 分工明确；我们聚焦 GitHub API 面非本地 git 面。可做「生态指引」：文档提一句推荐搭配 |
| URL 凭据擦除 redact | git-remotes `src/redact.ts:5-6` | **建议复用**（吸收实现形） | 我们错误路径会经 gh stderr / curl 输出；正则擦 `user:pass@` 与 `ghp_*/github_pat_*` 成本极低、红线价值高 |
| REST Host 信任围栏 | git-remotes `trust-fence.ts` / forge `lib/index.js:393-412` | **建议复用**（吸收实现形） | 我们 settings REST 若只靠 connection 缝，双保险缺席；两仓双先例证明这是社区标准姿势 |
| 多 forge 账号库（Gitea/GitLab/Gitee/Bitbucket） | forge | **不复用** | 超出 github-ops 定位（GitHub 专属）；用户若要多 forge，直接装 dsh-git-forge 更对 |
| 按项目授权 + push 策略（tools.guard） | forge `lib/index.js:541-583` | **不复用**（v1） | 面向 git push 推送面，不是 GitHub API 面；且策略引擎复杂度高。若未来要「防误推」，参考 `evaluatePushPolicy` 或装 forge |
| Agent HTTPS credential helper | forge `scripts/git-credential-dsh-git-forge.mjs` | **不复用** | 我们的 git 认证走 gh repo clone / 系统 credential helper 已够；引入 = 第二套凭据注入面，违背单一认证源 |
| Issues/PR/Actions/收件箱面板 | workbench | **不复用** | 纯 GUI 大面板，workbench 已存在且活跃维护；重复造 = 维护负担。模型侧同域操作我们已有 github_api/工具集 |
| 限额可视化（remaining/reset + 状态点） | workbench `src/api.ts:63-64`、`src/workbench.tsx:303-328` | **建议复用**（展示思想） | 与需求②天然融合：状态卡加 core/search 限额与 reset 本地时刻（我们探针本来就回 rate_limit） |
| 401/403/404 分类错误文案 | workbench `src/api.ts:77-89` | **建议复用**（文案分类形） | 健康检查失败态要能区分「没登录/token 失效/网络/限额/权限」，workbench 是现成分类表 |
| 工作区仓库自动识别（.git/config 解析） | workbench `src/config.ts:113-132` | **进阶候选** | 状态卡显示「当前工作区仓库 + 其可见性」能提升日常感；实现走我们服务端读文件（不走 /sidebar/api/fs.read 那条 sidebar 依赖） |
| i18n 字典（zh/en） | forge `lib/client.js:18-128` | **进阶候选** | workbench 硬编码中文是反例；我们 v1 中文硬编码可接受 |

### 2.5 重点问题四：健康检查/连接验证先例

**有先例，且拼起来正好是既有报告 6.1 的三段判定**：
1. **本地配置面**：我们 `gh auth status --json`（state 判据）——竞品无对应（forge 的等价物是「tokenConfigured 布尔」`lib/shared/account-summary.js:80-87` 🟡）
2. **API 连通+认证**：forge `probeAccount`（`GET /user` + 10s 超时 + 结构化结果 + 分类 hint，`lib/index.js:260-391` 🟡）∪ workbench `getViewerLogin`（`src/api.ts:546-555` 🟡）∪ 我们 `gh api rate_limit`（三合一不耗额，既有报告 6.1 🟢）
3. **延迟/超时**：forge 的 AbortController 10s + 「probe timed out … check LAN DNS/TLS/firewall」文案（`lib/index.js:322-323,383-385` 🟡）是我们「计时 + 阈值」的现成文案形
4. **插件自检**：forge `health` 方法（version/注册状态/依赖文件在位，`lib/index.js:431-441` 🟡）——建议我们同样加一个 `GET api/github-ops/health`，排障（Phase 8）价值高

---

## 3. 重定优化需求建议

### 需求① GitHub token 维护（状态查看 + 设置/更新 + 验证，不做删除）

| # | 建议 | 内容与理由 | 证据 |
|---|---|---|---|
| ①-1 | **维持原案** | 挂载 = settings.section（kb-context 形）+ webServer REST；token 写入 = `echo … \| gh auth login --with-token` stdin 通道（argv 永不含明文）；存储 = gh hosts.yml（单一认证源） | 既有报告 7.A/5.4；forge 双 token 库分裂风险反证（`lib/index.js:53-58` 🟡） |
| ①-2 | **修改为**：状态卡加 `tokenConfigured` 布尔 + `login`（probe 回显）+ tokenSource 路径 + active 账号名 | forge `publicAccount` 投影形：UI 面只回布尔与元数据，黑名单键擦除双保险 | `lib/shared/account-summary.js:80-130` 🟡 |
| ①-3 | **修改为**：更新语义「输入框留空 = 不修改」+ 保存按钮显式影响提示（「将替换当前账号 token」） | forge tokenHint 语义 + 红线「写 token 属安全敏感动作需显式确认」 | `lib/client.js:36` 🟡；既有报告 5.4/7.C |
| ①-4 | **新增**：密码型输入 + autoComplete off + 保存后输入框即清空 | forge 表单姿势 | `lib/client.js:535-536` 🟡 |
| ①-5 | **新增**：响应/日志凭据擦除层（`ghp_*`/`github_pat_*`/`user:pass@` 正则 → 掩码） | git-remotes redact 先例；错误 message 必须擦后才回 UI | `src/redact.ts:2-6` 🟡 |
| ①-6 | **不做**：token 删除/登出/清除（维持用户边界）；多账号 switch/logout 进阶再议 | 用户明示不做删除；gh hosts.yml 已有多账号语义（users/active_account）状态卡**展示**即可 | 既有报告 5.2 🟢 |

### 需求② 手动检验 GitHub 访问（连通/认证/超时）

| # | 建议 | 内容与理由 | 证据 |
|---|---|---|---|
| ②-1 | **维持原案** | 三段判定：auth status（本地配置，state 判据）→ rate_limit/user（连通+认证）→ 计时（慢 ≥3s / 超时 ≥ghTimeoutMs） | 既有报告 6.1 🟢 |
| ②-2 | **修改为**：结果形用 forge `probeAccount` 的结构化形 `{ok, stage, code, status, login?, message, elapsedMs}` + 分类 hint（401/403→token scopes、超时→「check LAN DNS/TLS/firewall」、404→apiBase/路径） | 结构化 + hint 分类是 forge 与 workbench 双先例的共识 | `lib/index.js:334-387` 🟡、`src/api.ts:77-89` 🟡 |
| ②-3 | **新增**：结果卡展示 core/search 限额 remaining/limit + reset 本地时刻 + 状态点 | rate_limit 探针本来就回这些数据；workbench 证明用户看得懂 | `src/workbench.tsx:328` 🟡 |
| ②-4 | **新增**：「重新检查」按钮 + 失败可重试（手动检验的「手动」语义） | 需求②明示手动 | — |

### 需求③ 其他优化/可维护功能候选清单

按 价值 / 工作量 / 风险 打分（高/中/低），给出取舍：

| # | 候选 | 价值 | 工作量 | 风险 | 建议 |
|---|---|---|---|---|---|
| A | REST 路由 Host 信任围栏（loopback + trustedHosts）与 connection 缝双保险 | 高 | 低 | 低 | **纳入 v1**（两仓双先例 = 社区标准姿势） |
| B | 凭据擦除层（响应/错误 message 正则掩码） | 高 | 低 | 低 | **纳入 v1**（红线工程化） |
| C | 插件自检 `GET api/github-ops/health`（version + 注册面状态 + ghBin 在位 + 写缝在位） | 中 | 低 | 低 | **纳入 v1**（forge health 先例；Phase 8 排障直接用） |
| D | 限额可视化（remaining/reset + 状态点） | 中 | 低 | 低 | **纳入 v1**（并入②-3） |
| E | 健康检查失败态分类文案表（401/403/404/超时/网络） | 中 | 低 | 低 | **纳入 v1**（并入②-2） |
| F | 工作区仓库上下文卡（解析 .git/config 显示 owner/repo + 可见性，走服务端读文件） | 中 | 中 | 低 | **v1.1 候选**（workbench 形参考） |
| G | 多账号展示（users/active_account）+ `gh auth switch` 动作 | 中 | 中 | 中（破坏性边界） | **进阶**（既有报告 7.B；switch 有副作用需确认门） |
| H | Locale 化（zh/en 字典，forge 形） | 低 | 低 | 低 | **进阶** |
| I | 多座注册 `plugins.bundle.config`（插件管理器入口） | 低 | 低 | 低 | **进阶**（dshmarket 形，slots.inject 自探测） |
| J | 定时自动健康检查 / 会话启动轻探针 | 低 | 中 | 中（行为侵入） | **不做**（保持「手动」语义，awareness 文本已有指引） |
| K | Gitea/多 forge 支持 | 低 | 高 | 高（定位稀释） | **不复用**（要用装 dsh-git-forge） |
| L | Issues/PR/Actions 面板 | 中 | 高 | 中 | **不复用**（workbench 已存在；模型侧已有 github_api） |
| M | remote fetch/push 面板 | 低 | 中 | 中 | **不复用**（git-remotes 已存在） |
| N | push 策略引擎（tools.guard） | 中 | 高 | 中 | **不复用 v1**（生态协同：文档指引装 dsh-git-forge） |
| O | Agent HTTPS credential helper | 低 | 高 | 高（第二凭据注入面） | **不复用**（违单一认证源） |

**需求③的一句话重定**：从「大而全的功能扩张」收敛为「**v1 = 安全加固包（A+B+C+D+E）+ 原 token 维护/健康检查两栏**；F-I 进阶池；J-O 不做并写明生态协同去处」。

---

## 4. NEEDS_CONTEXT / NEEDS_HUMAN

1. **NEEDS_HUMAN｜命名歧义（置顶问题）**：用户写 `yq04/dsh-git-remotes` 查无此仓（🟢 实测），gestaltrun 同名仓的 README 安装命令却仍指向 `yq04/dsh-git-remotes.git`（`README.md:20` 🟡）——是「仓库转让后 README 未同步」还是「gestaltrun 是 fork/重发布」？**本次调研按 gestaltrun 版本出结论**；若用户指的是另一个私有/已删仓库，功能面结论需重估。
2. **NEEDS_CONTEXT｜需求③范围取舍**：上表 A-E 纳入 v1 是「安全加固包」口径——若用户想要的「其他优化」是**功能扩张型**（如 F 工作区仓库卡 / L 面板类），请圈定候选项后再入 Phase 1。
3. **NEEDS_CONTEXT｜是否做多账号**：gh hosts.yml 本身支持多账号（users/active_account，既有报告 5.2 🟢），但「切换/登出」是破坏性动作（既有报告 8.3/8.6 同源未决）；forge 的多账号形可参照但它是独立 token 库。v1 建议只展示不操作。
4. **NEEDS_CONTEXT｜token 维护写路径的替换语义**：`gh auth login --with-token` 对既有账号 token 的替换行为仍 🔴（既有报告 8.5 未决，本轮竞品调研无法替代实测）；实现阶段须用一次性假 token 在 `.testenv/` 实测失败形。
5. **NEEDS_CONTEXT｜健康检查阈值**：慢/超时阈值（建议 3s / `ghTimeoutMs`）、reset 时刻本地化展示与否（既有报告 8.4 同源未决）；forge 固定 10s 超时 + 文案形可作参照基线。
6. **NEEDS_CONTEXT｜竞品参考的署名/许可**：三仓许可 = BSD-3-Clause（git-remotes）/ MIT（forge、workbench）；吸收实现形（redact 正则、probe 结果结构）是否需在代码注释署来源——本工作区惯例是设计来源注释块（`lib/index.js:2-6` 形），建议照办。

---

## 附：证据索引（浅克隆于 /tmp，调研后未删除）

- `gestaltrun/dsh-git-remotes` → `/tmp/scout-git-remotes`：`README.md`、`src/{index.ts,git.ts,redact.ts,trust-fence.ts,remote-name.ts,path-guard.ts,parse-status.ts,classify.ts}`、`src/client/index.tsx`、`dsh.plugin.json`、`cordis.patch.yml`
- `thirsty5034/dsh-git-forge` → `/tmp/scout-git-forge`：`README.zh-CN.md`、`lib/index.js`、`lib/client.js`、`lib/shared/{account-summary.js,credential-select.js,git-policy.js,remote-resolve.js}`、`scripts/git-credential-dsh-git-forge.mjs`、`package.json`
- `meyaomiao/dsh-github-workbench` → `/tmp/scout-github-workbench`：`README.md`、`src/{mount.ts,config.ts,api.ts,workbench.tsx,client.ts,index.ts}`、`package.json`、`cordis.patch.yml`
- 本方：`/opt/workdata/dsh-plugins/dsh-github-ops/lib/{index.js,repo-tools.js,enforce.js}`、`changes/20260929-phase0/reports/settings-integration-research.md`
- 仓存在性实测：`gh repo view` × 4（2026-09-29，yq04 无、其余三仓有）
