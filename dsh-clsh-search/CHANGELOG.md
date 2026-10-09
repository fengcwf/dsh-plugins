# CHANGELOG — dsh-clsh-search

## 0.2.0 — 2026-10-09

第二变更波（clsh Phase 0-8 全流程，计划 Task 1-30；基线 0.1.0 = tag `dsh-clsh-search-v0.1.0`）：用户 8 项诉求 + 追加代理 + 6 项技术债全落点（US-8~US-17），零新增依赖（仍仅 zod，K-8）。

### 用户诉求落点（原始 8 项逐条）

- **诉求 #1 0.2.x 候选池审阅**：`review-package-final.md` §四 候选中选定 6 项技术债全部落地（见下「技术债 6 项」）。
- **诉求 #2 设置页菜单名称和图标**：nav 与页内 H1 两处统一改「搜索设置」（去包名后缀）；图标经 Phase 0 核实由宿主按 section id 硬编码、槽位契约无 icon 字段，收敛为接受默认齿轮（插件侧不改）。落点：`lib/client.js`、`web/src/App.vue`、`test/client-entry.test.mjs`。
- **诉求 #3 触发日志查看**：进程内存环（默认 200 条，可配 `logCapacity`），条目键白名单闭集 = 时间/经由/成败/耗时/条数/源 + 查询词**脱敏摘要**（长度+首词，不记完整查询词）；不落盘、重启即清空（页面明示，INV-11/INV-12）；日志写入失败不影响搜索主链、页面明示「日志不可用」（INV-13）。设置页「查看触发日志」弹层：尾部 50 行滚动 + 容量计数 + 清空按钮 + 503 明示。落点：`lib/trigger-log.js`、`web/src/components/LogModal.vue`。
- **诉求 #4 插件测试按钮**：诊断卡本地自检清单（七项：Config 可读 / 源表可构造 / priority 词表 / 配置写缝 / 缓存目录可写 / 触发日志环 / 出站门禁，汇总「N 项 · X 通过 / Y 失败」）+ 独立「真联网测试」按钮（仅用户点击触发，不进 `node --test` 默认集，INV-14）+ 手动清缓存按钮。落点：`lib/diagnostics.js`、`web/src/components/DiagnosticsCard.vue`。
- **诉求 #5 搜索源健康测试**：逐源「测试」按钮（单源探针绕过聚合缓存与 guard 预算，`healthTimeoutMs=5000`）+ 每源最近耗时/成功/失败展示；批量真联网测试 10s 总上限截断（「未测（超时截断）」如实明示）。落点：`web/src/components/SourceHealthRow.vue`、`GET /probe`、`GET /onlineTest`。
- **诉求 #6 搜索源自定义增删**：卡内行内编辑器——URL 模板（`{query}` 全位置 `encodeURIComponent` 替换）+ 结果项/标题/链接 CSS 选择器 + 填写引导（占位示例 + 支持语法列表）；受限选择器子集引擎 fail-closed（伪类/兄弟组合器等超集形态显式 `SELECTOR_UNSUPPORTED` 拒绝，零脚本能力，INV-16）；出站强制 https、拒 `http://` 明文与内网/回环/链路本地/云元数据地址（INV-15）。落点：`lib/sources/custom.js`、`lib/selector.js`、`web/src/components/CustomSourceCard.vue`。
- **诉求 #7 让位语义解释**：接管三档（让位/强制/禁用）说明从 `:title` 悬浮提示提为**常驻可见** hint + 「按场景怎么选」三句引导，零新增 token。落点：`web/src/components/TakeoverCard.vue`。
- **诉求 #8 其他优化调研并入**：跨源 URL 去重（同一 URL 只保留优先级高者，结果条数配额让给真正不同的结果，US-15）+ 搭车项两项（手动清缓存、逐源耗时/成败统计展示，US-16）。落点：`lib/aggregate.js`、`lib/diagnostics.js`。
- **追加·代理网络**：多套代理地址维护（`sources.proxies`，地址形校验、**拒 `user:pass@` 认证形态**，INV-18）+ 每源独立勾选走代理（境外源 ddg/bing 默认走、国内源 so360/baidu 默认直连）+ 自实现 HTTPS-over-CONNECT 隧道（TLS 建连 / 三层超时 / 407 结构化拒绝 / 重定向自实现逐跳处理 / 解压后判定）；socket 层收敛唯一出网文件 `lib/sources/common.js`（INV-17，K-4 锁受控放宽）且必经出站门禁。设置页代理卡含空池勾选明示错误、不支持认证文字明示。落点：`lib/sources/common.js`、`web/src/components/ProxyCard.vue`。

### 技术债 6 项（候选池 §四，用户全选）

- **跨源 URL 去重**：`lib/aggregate.js` 收口单点 `dedupeByUrl`（fresh 与缓存读面同口径）。
- **W3-5 baidu `mu` 正则**：lookbehind 修 `data-mu` 前缀吞并（`lib/sources/baidu.js`）+ 回归锁。
- **C3 + W3-3 重试退避与体上限**：可中止指数退避（`retryBackoffMs=300`，仅 5xx/408/网络失败进环）+ 响应体三路上限（`maxResponseBytes=1048576`，超限 `RESPONSE_TOO_LARGE` 不入重试类目）。
- **C1 真页 fixture 回归库**：5 个脱敏真页 + 解析锚/字段齐全/脱敏审计/零出网四类用例（`test/fixtures/real/`）。
- **W65R2-N1 warn 文案时序**：fail-open warn 字面回查对齐，两处跨卡锁定断言复核通过。
- **C-W5-1 ego 计数**：`spendEgo()` 接生产调用方（US-17 设置页真实计数；与宿主 50 次/任务兜底不叠加明示）。

### 安全与工程面

- **出站门禁 `assertPublicHttps`（SSRF 防线）**：强制 https、拒内网/回环/链路本地/云元数据/CGNAT/组播保留段/`localhost` 家族/单标签内网名/URL 内嵌凭据，支持注入 DNS 解析器做解析后 IP 同段核验（fail-close）。
- **Config 扩 7 组键**（`sources.custom` / `sources.useProxy` / `sources.proxies` / `retryBackoffMs` / `maxResponseBytes` / `logCapacity` / `healthTimeoutMs`），全部 zod 默认值零迁移；键面封闭锁同步翻修（INV-19）。
- **设置页五卡序**：源 → 预算 → 让位 → 代理 → 诊断（+ 源健康行、日志弹层、自定义源编辑器），UI 位置纪律 INV-21、零新增 UI 依赖（INV-22）。
- **发布物面**：`web/dist` 随 `web/src` 双次重建幂等（LRN-045），`check-release.sh` dist 新鲜度锁 PASS。

### 版本引用证据（质量面出处）

- 全量 `node --test` **328/328/0** + load 真 import 冒烟；dist 重建经队长/tester/mechanic 三方独立构建 `cmp` 零差异、sha256 同值复核。发版前总验证（T29）与增量复审、逐卡验证记录见 `dsh-clsh-search/changes/20261006-phase0/`（tester-report.md 与 `tasks/task-*-report.md`）。
- **版本三处一致**：`package.json` `version = 0.2.0` = 本节 `## 0.2.0` = 根 `README.md` 版本表 `dsh-clsh-search 0.2.0`；体检命令 `bash scripts/check-release.sh dsh-clsh-search` → `[VERDICT] PASS`（输出原文见 `changes/20261006-phase0/tasks/task-30-report.md`）。
- **发版第⑤步（commit + tag `dsh-clsh-search-v0.2.0` + push + `gh release create` + 生产安装/重启）= NEEDS_HUMAN**，须用户逐次确认后由队长执行（P-8），本卡零执行。

## 0.1.0 — 2026-10-01

首发（clsh Phase 0-8 全流程，计划 Task 1-19）：DeepSeek Harness 免 key 多源聚合搜索插件——修复现状 `web_search` 报 `configured web provider "deepseek-official" is not registered` 且无法禁用的问题，以 DDG/Bing/360/百度 四源聚合接管官方搜索 provider，并注入工具调用顺序策略。

### 用户故事落点（US-1 至 US-7 逐条）

- **US-1 web_search 免报错接管（P0）**：`registerSearchProvider` 幂等注册 + 运行时兜底指针（`web.searchProviderId` 悬空或仍为 `deepseek-official` → apply 内补指 `dsh-clsh-search`，只写指针公开字段、不 unregister 官方 provider）。落点：`lib/index.js` 接管缝、`test/provider.test.mjs`、`test/integration.test.mjs`、`test/activation-hardening.test.mjs`。真运行时终判：`registeredSearchProviders` 含本插件、as-configured 真调用返回真实结果、原报错从正常路径消失。
- **US-2 四源聚合与失败切换（P0）**：默认优先级 DDG→Bing→360→百度，任一源失败自动切换下一家、单源开关、优先级排序、结果条数 clamp（默认 8，可配 1-10）。落点：`lib/sources/{ddg,bing,so360,baidu}.js`、`lib/aggregate.js`、`web/src/components/SourceCard.vue`、`web/src/lib/source-order.js`。
- **US-3 设置页配置面（P0）**：`web/` Vue 设置面板（构建物 `web/dist` 入库随包）——源开关/排序、单查询超时与重试、整链预算、结果条数、缓存 TTL、ego-browser 兜底预算、接管开关；服务端读写路由 `GET/PUT /api/dsh-clsh-search/settings`（信封 `{data:{config,editable,writable}}`）+ 客户端挂载入口 `exports["./client"]`。落点：`lib/settings-routes.js`、`lib/client.js`（挂载入口工厂）、`web/src/components/{SourceCard,BudgetCard,TakeoverCard}.vue`、`web/src/lib/{settings-api,budget-model,takeover-model}.js`。
- **US-4 全源失败明示错误块（P0）**：aggregate 收口 `ContentBlock[]` 错误块（逐源失败原因 + 发生时间 + 降级建议 `web_fetch → ego-browser`），handler 层明示给 LLM 而非裸 throw；反爬/验证码命中即停不重试不切源（即停类目 = 202/挑战页/验证码页/异常 HTML）。落点：`lib/aggregate.js`、`lib/ratelimit.js`、`lib/index.js`（`renderToolBlocks`）。
- **US-5 隐私红线（P0）**：查询词只发所选搜索源；vault/记忆/会话上下文不出网；凭据只以 env 名（credential-ref）引用、不落明文。落点：`web/src/components/TakeoverCard.vue` 隐私提示（PRIVACY_NOTICE）、`test/k-constraints.test.mjs` K-4 文字面。
- **US-6 工具调用顺序策略（P0）**：注入「vault+记忆 → web_search → web_fetch → ego-browser（仅兜底）」分层接力文案，含每级进入条件、失败判据与降级触发器、整链预算熔断说明（15 次上限）。落点：`lib/strategy.js`、`test/strategy.test.mjs`、`lib/guard.js`（预算守卫）。
- **US-7 接管三态让位语义（P1）**：`takeOver = auto/force/off`——profile 显式指定别家 searchProvider 或宿主修复官方 provider 时让位，不产生双重接管冲突；`force` 强制接管。落点：`lib/index.js`（takeOver 归一与让位判定）、`web/src/components/TakeoverCard.vue`。

### 版本引用证据（质量面出处）

- **冒烟四关**（boot 换票 303/200 → `--dump-config` 含插件层 → `node --test` 171/171 → load 真 import 7/7）+ US-1 真运行时终判 + settings 面复验 + US-2 不倒退 8/8 + 故障隔离行为面 17/17：`dsh-clsh-search/changes/20260930-phase0/tester-report.md`（RESULT: PASS，两轮对照）。
- **K-1~K-11 判据矩阵**（集成判据逐条落点与证据行）：`.superpowers/sdd/tasks-20260930-phase0/task-17-report.md`。
- **版本三处一致**：`package.json` `version = 0.1.0` = 本文件 `## 0.1.0` = 根 `README.md` 版本表 `dsh-clsh-search 0.1.0`；体检命令 `bash scripts/check-release.sh dsh-clsh-search`（输出原文见 `.superpowers/sdd/tasks-20260930-phase0/task-19-report.md`）。
- **发版第⑤步（commit + tag `dsh-clsh-search-v0.1.0` + push + `gh release create`）：NEEDS_HUMAN**，须用户逐次确认后由队长执行（P-8），本卡不执行。
