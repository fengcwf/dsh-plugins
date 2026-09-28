# CHANGELOG — kb-context

## 0.3.1 — 2026-09-28

Phase 8 修复波（B1/B2/S3，来源报告：`changes/2026-09-28-kb-context-b1b2-fix/reports/diagnostic-report.md`（T8-D1 诊断）、`fix-b1b2-report.md`（T8-F1）、`fix-deps-report.md`（T8-F2））：

- **B1 服务缝取得修复**（`lib/index.js`）：设置面服务由 softService 软取得改为双层子插件形 `ctx.plugin({inject:['webServer','connection'], …})` 硬 inject 取得 + configEditor 惰性求值——`/api/kb-context/settings` 在真运行时可注册成功（修前"测试全绿但线上 404"）；缺缝 fail-open 留痕语义不弱化（INV-15：双缺=非 web 面不告警，半缺留痕）
- **B2 effect 工厂语义修复**（`lib/index.js`）：`ctx.effect` 按宿主契约改形——注册动作放执行体、返回值=拆除器、注册抛错先收敛已注册资源再上抛（label `kb-context: settings-routes`）；修前注册当场自拆（路由随注册即拆除）
- **`writable` 语义变化注记**：GET settings 的 `writable` 字段由静态快照判定改为**当下可写性现求**（configEditor per-request 惰性求值）——语义=如实反映当前持久化缝可用性（boot 窗口内可 false→true 翻转）
- **zod 依赖归类**（S3，工作区裁定 2026-09-28）：zod 从 `peerDependencies` 迁入 `dependencies`（^4.6.5，git 快照安装自动代装），devDep `link:` 移除；`@deepseek-ai/dsh-llm`/`@deepseek-ai/dsh-tools` 保持 peer+dev 双声明不变——修前第三方 zod 在 peer（peer 不代装，autoInstallPeers:false），干净安装即 `ERR_MODULE_NOT_FOUND: zod`
- **测试 179→189**（+10：integration 形补 B1/B2 回归锁——假 ctx 真 `apply()` + 真注册/handler 执行 + cordis 代理"未 inject 访问即抛"模拟；manifest.test.mjs 契约改形锁 `dependencies.zod`，断言只增不删）；双 umask 口径全绿、`npm run check` exit 0

## 0.3.0 — 2026-09-28

设置菜单新增相关设置配置（用户反馈需求）：kb-context 以**客户端模块 + settings.section 设置命名空间**进设置菜单（better-sidebar 路线，navLabel 自动进设置页），配置展示/可改。

- **客户端面**（`lib/client.js` 新增，零构建 `window.__ModuleLoader__` 工厂形、React.createElement 无 JSX）：`package.json` `dsh.client`（platform=web, inject=locale/renderer/layout）+ `exports["./client"]` 扫描面；`settings.section` 注册（`{name:'settings.section', id:'kb-context', order, label}`）——**纯设置无面板行**（不注册 sidebar.panellist/main/settings.plugins.tab；root 壳槽位 launcher/trigger/header/close/action/onboarding 禁注册）
- **可改项**（裁定枚举）：`triggers.words`/`triggers.entityPaths`（textarea 一行一项，数组整替）、`budget.maxSnippets`/`budget.maxTokens`、`timeoutMs`、`scope.indexAll`/`scope.grepOnDemand`；**hotMap/vaultRoot 只读展示**（裁定枚举外）；热改语义本就支持 per-call 读（检索/注入 handler 每次调用现读 config）
- **设置面数据**（`lib/settings-routes.js` 新增，沿 wiki-steward 同款官方形）：`ctx.webServer.register({kind:"prefix", path:"/api/kb-context"})` → `GET/POST /api/kb-context/settings`（文档相对请求形）；写路径=`lib/settings-write.js`（新增）：可改白名单整单拒外键（not_editable）、真 zod 校验生效面、host `configEditor.edit` 持久化热生效（dsh-settings 服务同款缝）；缺缝=503 write_unavailable 如实+writable:false；接线=webServer/connection/configEditor **软取得**（`inject` 维持 `['tools']` 不变），半缺缝留痕、双缺=非 web 部署面不告警（既有告警计数契约零改动）
- 测试 157→179（+22：client-settings 8/settings-routes 8/settings-write 6）；双 umask 口径全绿、npm run check exit 0；真验零 mock（真 zod Config+configEditor 最小缝）

## 0.2.1 — 2026-09-28

生产 bug 修复：启用 kb-context 后对话报错 `format v4 message requires a producer-owned source kind`。

- **注入消息 source 契约修正**（`lib/inject.js`，BUG 2026-09-28）：`source` 由旧形 `kind:'plugin'`+`plugin:'kb-context'` 改为 **`{kind:'kb-context', form:'recall', sections:[…]}`**（键集={kind,form,sections}，去 plugin 键）——v3-to-v4 producer-owned 依据：V4 原生面 `source()` 显式拒绝 kind:'plugin'（报错原文即本 bug 症状），迁移映射 `rewritePluginSource` 亦剥 plugin 键、kind 取插件自有名，此处直出规范形
- **INV-5 键集契约注释/断言同步**：source 键集={kind,form,sections}；禁 model 字段拒收等既有语义零弱化（`isRecallMessage` 三键咬合改 kind/form/sections）
- **真校验器回归（零 mock）**：import dsh 安装里的 `dsh-session-format-v3-to-v4` `restoreReleasedV4Artifact`（内部 `assertV4MessageSources`→`source()`）对真 `createUserMessage` 注入产物校验——正例 kind:'kb-context' 通过；负例旧形 kind:'plugin' 必拒且报错原文钉死（RED 恰红先行：旧形下正例回归恰红=生产事故原文）
- 测试 155→157（+2 回归）

## 0.2.0 — 2026-09-26

首个功能版：检索/注入/工具全量交付（0.1.0 壳版留待面全部落地）+ 终审遗留清障批。

- **检索全量**（`lib/index-db.js` / `lib/search.js` / `lib/trigger.js` / `lib/diagnose.js`）
  - `index-db.js`：SQLite（内置 `node:sqlite`）FTS5 索引库——增量索引 `applyIncremental`（快表前滚/removed 清理/触发器完整判据）、`trigramTerms` 词项判定、`validateIndex` 词表对账（千页 PoC 口径）
  - `search.js`：查询编译（逐词引号 OR + 词内引号加倍中和 FTS 语法注入、短词/空词 LIKE 兜底 `ESCAPE '!'` 转义）、FTS5 BM25 命中 + LIKE 兜底 OR 合并、SQL 内置 `kb_deadline_ok()` deadline 守卫（DatabaseSync 阻塞下唯一中止缝）、预算截断（≤maxSnippets/maxTokens 首条必保）、bm25 归一防 -0/NaN
  - `trigger.js`：热词/实体触发扫描（triggers.words + entityPaths 热表、triggered/hotMap 观察面）
  - `diagnose.js`：kb_diagnose 七态诊断（no-open/no-index/stale/no-match/degraded/no-hit/hit 含调整轮拆态）
- **注入全量**（`lib/inject.js` / `lib/redact.js`）
  - `inject.js`：`agent/session-start` 三缝注入——触发判定→检索→片段组装→脱敏→转义渲染；handler 级 `Promise.race` 硬中断（timeoutMs 内必 fail-open，不寄生 search 自觉限时）；budget 截断、空态 hint（属性先 redact 再转义）、`kbContext.detail`（redacted/hits 计数）留痕
  - `redact.js`：三层脱敏（PEM 整块/赋值形态保 key 名/token 五形态）+ `<redacted>` 占位符抽走回填保字面 + 计数（与 wiki-steward secrets.js 同核）
- **工具面**（`lib/tools.js`）：`wiki_read` / `wiki_search` / `kb_diagnose` defineTool 注册（`ctx.tools` 缺失 fail-open 留痕）；vaultRoot 解析=Config 单一来源 + realpath 防 symlink 逃逸；cfg 形状 salvage 修复
- **契约**：zod peer `^4.6.5`（T1 Ruling 兑现：下界=实测 `.prefault` 语义版，与 wiki-steward 同界）；default 导出 `{inject, apply}` 对象（R13 教训）；非法配置留痕 fail-open（INV-15 禁静默）
- **遗留清障批（终审 deferred 收口）**：`compileQuery` 单遍分区（trigramTerms 每词双调→一次探测分区，`_probe` 注入缝）；`timeoutMs` 语义 JSDoc（0/负/NaN 归零=立即超时而非不限时）；vaultRoot 注记「R2 裁定」与 R-教训序列撞号 → 改「Controller 裁定②」
- 测试 155/155（load/manifest/trigger/search/inject/tools/diagnose/index-db/redact——真索引真检索真注入零 mock；双 umask 口径复核）

## 0.1.0 — 2026-09-24

初版：插件骨架（壳）与加载冒烟。

- `package.json`（`dsh.bundle.patch`）+ `cordis.patch.yml` insert 行 `{id: kb-context, name: kb-context, config: 全部键}`（config 整行替换语义，自带全键）
- `lib/index.js`：导出 `name` / `inject` / `Config`(zod) / `apply`；**default 导出 `{inject, apply}` 对象**（R13 教训：工厂函数形态会被宿主静默忽略）
- `Config` 全键热改定义：`triggers{words,entityPaths}`、`hotMap{enabled,maxChars}`、`budget{maxSnippets,maxTokens}`、`timeoutMs`、`scope{indexAll,grepOnDemand}`
- `apply`：配置防御性校验——非法配置留痕告警后 fail-open（INV-15 禁静默）
- `test/load.test.mjs`：真 `import('../lib/index.js')` 冒烟 + R13 回归 + Config 全键单测
- 零第三方运行时依赖：zod 走 peer+dev 双声明（devDep `link:` 宿主运行时副本），运行时共享宿主实例
- 本版不含检索/注入/工具模块（`lib/trigger|search|inject|index-db|tools.js`）与 client bundle（`dsh.client`），留待后续任务
