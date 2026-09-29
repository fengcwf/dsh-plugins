# phase0-research.md — Phase 0 调研摘要（dsh-github-ops 设置栏目优化）

> 由 LLM 基于 `phase0-data.json`（机械扫描）+ ②ERRORS/LEARNINGS 通读 + ③本地历史文档 + ③'scout 深调研分析生成。
> 变更：`changes/20260929-phase0/`（2026-09-29）。需求三点：①设置菜单增加栏目（GitHub token 维护）②手动检验 GitHub 访问（连通/认证/超时）③其他优化与可维护功能分析。

---

## 0. Phase 0 四件套引用证据（SKILL §0 第 5 步）

| 件 | 产出 | 引用 |
|----|------|------|
| ①机械扫描 | `changes/20260929-phase0/phase0-data.json`（scan_time 2026-09-29T03:08:45Z，scanner 1.0.0） | 本文件 §1/§3 数据全部取自该 JSON |
| ②ERRORS/LEARNINGS 通读 | `wiki/reference/ERRORS.md`（218 行）+ `wiki/reference/LEARNINGS.md`（154 行） | §2 |
| ③本地历史文档扫描 | `docs/2026-09-23-dsh-web-ui-mechanism.md`、`docs/audit-plugin-conventions-2026-09-28.md`、vault 检索（wiki_search + INDEX grep） | §3 |
| ③'深调研（scout） | `changes/20260929-phase0/reports/settings-integration-research.md`（261 行，session d25885b8） | §4/§5，关键结论已抽查证据（kb-context `lib/client.js:12,223-226`、package.json `dsh.client`/`exports['./client']` 与报告一致） |

---

## 1. 项目类型判定

| 字段 | 值 |
|------|-----|
| 类型 | **优化**（既有插件加能力 + 设置 UI 从无到有） |
| 技术栈 | phase0-data.json `project.tech_stack=[]`（未识别框架标签）；实际=零构建纯 ESM JS + zod + `@deepseek-ai/dsh-tools`/`dsh-llm` peer（package.json） |
| 主要语言 | phase0-data.json `project.languages=['typescript','javascript','json','yaml']` |
| 已有文件数 | phase0-data.json `project.file_count=860`、`dir_count=42`（含 node_modules）；`is_new_project=false` |
| 已有产出物 | phase0-data.json `existing_artifacts=['overview.md','tasks.md']`；代码面 `lib/`（index.js 124 行 / enforce.js 95 行 / repo-tools.js 202 行）+ `test/`（3 文件 145 行，实测 16/16 绿——审计附录 A） |
| 现版本 | 0.2.1（2026-09-29 发版，peer/engines 上界放行 dsh 0.2.x，行为零变更） |

---

## 2. 历史教训匹配（②通读产出）

- **ERR-007 用户已明确指令后不做多余分析** → 用户三点需求已确认（token=状态+设置/更新+验证不含删除；第 3 项=报告+高价值项实现），Phase 1 只补盲区不重开已决问题。
- **ERR-008 / 2026-05-16 灵犀不自己干活** → 全程 PATH A 具名委派（实测 `subagent_scout` maxDepth:0 拒派 → 降级通用 subagent + 契约内联，ledger 已记）。
- **2026-09-23 Phase 0 漏做四件套** → 本文件 §0 逐件留证；gate 只查结构，实质自查随产物落盘。
- **LRN-033 热重载红线** → 本变更最终落生产走「发版 → 生产拉取 → 重启」，服务存活期不写 `profiles/web/cordis.patch.yml`。
- **LRN-035 manifest 严格 JSON** → package.json 改动后 `python3 -m json.tool` 校验；禁手注释。
- **LRN-036 patch 语义 + 功能在场双断言** → 验收=症状缺席+功能在场（设置栏目真出现、路由真通）。
- **LRN-038 vault-write 整文件写** → fix-notes 写入先读现状。
- **LRN-039 测试走打包产物 + 真安装路径** → 验证链=.testenv git 快照（`git+file://`）boot 冒烟四关 + 功能探针，源码直跑结论不作数。
- **LRN-040 单一推导函数** → gh 配置路径/DSH_HOME 类推导全插件只准一处。
- **2026-09-25 IL-2 E2E 验证** → 设置栏目验收以用户可见行为（浏览器视角）为准，服务端 oracle 只作辅助。

---

## 3. Obsidian 知识库 + 本地历史文档关联（③产出）

### Solutions 匹配（phase0-data.json `obsidian.solutions_matches`，keyword=github/node/json/ops 共 11 篇）

- `wiki/solutions/git-gnutls-proxy-workaround`（github）：git 走代理的坑——健康检查「网络不通」判定要区分单站阻断/全网断（LRN-036 同款三分法）。
- `wiki/solutions/loop-engineering-report`（github）：循环工程化——修复环纪律参考。
- `wiki/solutions/fetch-credentials-missing`、`external-api-check-openapi`（json）：外部 API 凭据/探针设计参考。
- `wiki/syntheses/2026-05-05-MCP与Skill冲突分析`：**GitHub MCP 否决史**——gh CLI 已覆盖全场景，本次 token/健康能力继续走 gh 后端（hosts.yml 认证），不引 MCP/不新增凭据面。
- `wiki/reference/integration/github-sync-guide`：GitHub 同步操作指南（用户日常通道背景）。

### 关键本地文档（历史项目沉淀，直接决定方案形态）

- `docs/2026-09-23-dsh-web-ui-mechanism.md`：**「设置菜单栏目」官方正门 = typed slot 设置页族**（`settings.section` / `plugins.tab` / `plugin.item` / `general.item`）；数据面=`ctx.webServer.register` REST 缝 + `connection.requestRejection` 鉴权缝；浏览器面=`package.json dsh.client` + `exports['./client']`。红线：`root` 槽禁注册（遮蔽 AppFrame）、`sidebar`/`rightbar` 只加内层 seat。安全写入=`@deepseek-ai/dsh-atomic-write`（writeFileAtomic + withFileLock）。
- `docs/audit-plugin-conventions-2026-09-28.md`：dsh-github-ops 既有欠账（第 3 项输入）：**W-3** 缺 `repository` 字段（A1.4 FAIL）、**N-1** `files` 缺 `CHANGELOG.md`、**N-2** 遗留 `dsh.plugin.json`（官方不读，易误导）；根 CHANGELOG W-1 缺条目。基线 blocker B-1 已消解（2026-09-29 实测 `git rev-list --count HEAD..origin/main = 0`）。

---

## 4. 已有项目分析（优化类）与缺口

### 现状四层（lib/index.js:44-123，inject=['shell','tools']）

| 层 | 实现 | 现状 |
|----|------|------|
| ①命令强制层 | `shell.resolve` 包装（enforce.js `rewriteGithubCommand`，fail-open + stdin 守卫） | ✅ 成熟 |
| ②web_fetch 门禁 | `tools/pre-execute` allow/ask/deny（`webFetchPolicy`） | ✅ 成熟 |
| ③仓库工具集 | 10+1 个 defineTool（gh 后端，runGh=index.js:82-90 统一 spawnSync+timeout+env 消毒） | ✅ 成熟 |
| ④awareness 注入 | `agent/session-start` 教学层 | ✅ 成熟 |

### 缺口（= 用户三点需求的落点）

1. **无设置 UI**：`web/`、`lib/client.js`、settings 缝全无——「dsh 设置菜单增加栏目」从零建。
2. **token 无维护面**：token 躺在 `~/.config/gh/hosts.yml`（0600，结构=主机名→`{active_account,git_protocol,oauth_token,user,users[]}`），无查看/更新入口；**secret 红线：token 不进 config/profile config/configEditor**（scout §7.C）。
3. **无手动健康检查**：`github_auth_status`（repo-tools.js:36-46）已有 auth status + rate_limit 数据，但无「一键检验连通/认证/超时」的人用通道。
4. **可维护性欠账**（第 3 项输入）：W-3/N-1/N-2（§3）+ 无 integration 形测试（AGENTS.md 2026-09-28 要求假 ctx 真 apply() + 真 handler）+ 无 `repository`/CHANGELOG 入 `files`。

### 采纳的接入方案基线（scout §7，证据等级见报告）

**最小可行 = kb-context 形零构建五件**（用户已裁定「参考 kb-context、插件市场的设置栏目」）：
①package.json `dsh.client{platform:'web',inject}` + `exports['./client']` ②`lib/client.js` 零构建壳（`window.__ModuleLoader__.load` + `ctx.slots.inject('settings.section', …)`，槽位方缺席=该面缺席不炸插件）③`lib/settings-routes.js` 双层子插件数据面（GET status / POST token / POST check，每 handler 首行 `connection.requestRejection`、请求体 1MiB 有界、白名单叶子校验）④token 只经 stdin（`gh auth login --with-token`，argv/日志零明文；`gh auth token` 明文吐出=全链路禁用）⑤load + integration 双测。
进阶（Vue 面板形、多账号 switch/logout、`gh auth refresh`、locale 化）**不进最小面**。

---

## 待确认问题清单（§5）

1. [功能] 「设置/更新 token」的录入交互是单行密码框 + 保存按钮（提交 POST `/api/github-ops/token`，服务端 `gh auth login --with-token` 走 stdin）吗?
2. [功能] 「手动检验 GitHub 访问」的展示面要含哪些指标——连通性、认证状态（account/login）、核心与搜索限额余量、探测延迟毫秒数、超时阈值吗?
3. [功能] 健康检查是「一键全检」单按钮（auth status + rate_limit + 延迟三段合一）还是分项可单独触发?
4. [功能] 设置栏目是否同时展示插件运行配置只读视图（enabled/enforceCommands/webFetchPolicy/registerRepoTools/allowDelete/awareness/ghTimeoutMs 八键）?
5. [功能] 第 3 项「其他优化/可维护功能」的高价值入选判据是——发版面欠账（W-3/N-1/N-2）+ integration 测试补齐为下限，另有哪些候选（如健康阈值配置化、locale、多账号）入选本轮?
6. [技术] 客户端模块 id 与包名对齐问题怎么定：`lib/index.js` 导出 `name='github-ops'` 但 package.json name=`dsh-github-ops`——浏览器模块 id 必须=包名（dsh-client-modules 以 manifest 匨名识别），以哪个为终值（改 name 面 vs 只对齐 client id）?
7. [技术] 健康检查探针超时用独立 `probeTimeoutMs`（建议缺省 3s）还是复用 `ghTimeoutMs`（60s，交互式体验差）?
8. [技术] `gh auth login --with-token` 的失败形（坏 token/断网/gh 未装/hosts.yml 不可写）退出码与 stderr 形——.testenv 一次性假 token 实测钉死（勿真 token 进测试日志）?
9. [边界] UI 展示 token 的安全形：永不显示明文，只显示来源与账号指纹（如 `ghp_****` 末 4 位 / oauth_token 是否在位）吗?
10. [边界] 探针失败的归因三分（没登录 / token 失效 / 网络不通 / 限额耗尽）在 UI 上如何分级反馈，且不泄露 stderr 中的敏感串?
11. [边界] gh 未安装、`~/.config/gh/hosts.yml` 不存在、槽位方（settings.section）缺席三种环境退化时，栏目/路由各自的行为?
12. [约束] token 明文红线执行面：argv 零明文、日志/recall 零明文、请求体 1MiB 有界、路由首行鉴权——是否逐条进验收标准并由测试锁死?
13. [约束] 本变更发版走版本纪律（minor bump 0.3.0：新增能力）+ .testenv boot 冒烟四关 + 发版逐次确认，生产启用重启放用户空档?
14. [约束] UI 依赖口径：最小面零第三方 UI 库（自绘 + dsh token），若进阶 Vue 面板才允许 element-plus 按需——是否确认最小面零依赖?

---

## 6. 信息缺口详情

| # | 缺口 | 来源 | Phase 1 处理方式 |
|---|------|------|-----------------|
| 1 | 包名/模块 id 终值（`name='github-ops'` vs `dsh-github-ops`） | scout NEEDS_HUMAN①（dsh-client-modules 以包名识别） | 追问用户（改动面影响 inject 行 id 与 awareness source） |
| 2 | 栏目文案（id/label/order）与 token 保存是否二次确认/审计 | scout NEEDS_HUMAN②③ | 追问用户 |
| 3 | 是否允许登出/切账号进 UI | scout NEEDS_HUMAN③（建议默认不放） | 追问用户（默认否） |
| 4 | 健康阈值缺省值与可配置性 | scout NEEDS_CONTEXT④ | 追问用户 + 给建议值（3s） |
| 5 | `gh auth login --with-token` 失败形实测数据 | scout NEEDS_CONTEXT⑤（🔴 语义仅文档） | .testenv 假 token 实测（不问用户，工程验证） |
| 6 | `gh auth refresh` 授权流是否 v1 纳入 | scout NEEDS_CONTEXT⑥ | 追问用户（建议 v1 不做） |

## 7. Phase 1 追问建议

1. 命名定夺：包名/客户端模块 id/栏目 id 的终值（含 `lib/index.js` name 是否随之对齐）。
2. 栏目功能边界：token 保存二次确认、登出/切账号、配置只读视图三件的取舍。
3. 健康检查展示面与阈值：指标清单 + 超时缺省（3s）+ 是否可配置。
4. 第 3 项高价值清单拍板：发版欠账（W-3/N-1/N-2）+ integration 测试为基线，进阶项（locale/多账号/refresh/健康阈值配置化）逐项选入/弃。
