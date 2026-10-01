# CHANGELOG — dsh-clsh-search

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
