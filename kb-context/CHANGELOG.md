# CHANGELOG — kb-context

## 0.2.0 — 2026-09-24

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
