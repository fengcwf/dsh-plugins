# Changelog — obsidian-web

## 0.1.0 — 2026-09-26
- **插件壳首发（T1）**：`obsidian-web/` 包骨架——`package.json`（`dsh.bundle.patch` + 零第三方运行时依赖，zod/dsh 共享包 peer+dev 双声明）、`cordis.patch.yml`（insert 行 + 全键 config）、`lib/index.js` 入口。
- **导出契约（R13 教训回归）**：default 导出为 `{inject, apply}` 对象（工厂函数形态会被宿主静默忽略）；`name`/`inject`/`Config`/`apply` 同步具名导出。
- **Config（zod v4）四组键**：`vaultRoot`（默认 `/mnt/unraid_data/Obsidian`）、`share{enabled, defaultTtlDays, requirePasswordForWrite}`、`ui{pageSize}`、`server{sharePort}`；嵌套对象默认值用 `.prefault({})`（T1 教训：zod v4 `.default({})` 短路直返不填内层默认）。
- **缝位就位**：OW-INV-8 鉴权缝注释（`ctx.connection.requestRejection`，Host/Origin + 签名 cookie，secret 走 `ctx.credentials`）；OW-INV-10 暴露面注释（主 UI 挂 `ctx.webServer.register` 同域 3080 零新增面；分享服务 3500 独立可关停，T9 接）。
- **占位模块**：`lib/{vault-ops,share,render,redact}.js` 契约注释占位 + `web/` 构建物目录占位（T13 起）。
- **测试**：`test/load.test.mjs`（load 冒烟 + R13 回归 + Config 默认值精确断言/坏类型拒/无共享引用 + apply 告警行为）+ `test/manifest.test.mjs`（依赖形态 + 发版纪律契约回归）。
- **目录树与阅读面（T2）**：`lib/render.js`+`lib/render-inline.js` live 渲染最小版（唯一渲染源，输出零未转义 HTML + URL scheme 白名单 + 事件属性中和，OW-INV-6 雏形）；`lib/vault-ops.js` 读侧（树列表/读文件/反链扫描，路径围栏雏形）；`lib/web-routes.js` `/ob/` JSON 读接口 + 静态 UI（每条路由过 `requestRejection` 鉴权缝，OW-INV-8/10）。
- **web/ 前端脚手架（T2）**：Vue3 + vite + element-plus——三栏构图（树 300px 虚拟滚动 / 阅读 / TOC 248px）+ 侧栏菜单中央列同页面板切换（OW-US-1/14）；`web/dist` 构建物随包入库（安装期零构建）。
- **全 vault 全文+标题搜索（T3 / OW-US-2）**：`lib/search.js` 查询编译纯函数（空/1 字/2 字/中英混/纯符号边界，2 字盲区=短词与纯符号词走 LIKE/前缀兜底）+ **可插拔检索后端缝**（`registerWebRoutes` 第三参 `search.backends.fts` 注入即接管，T11 索引三保险接 FTS5 后端零 API 变化；短查询结构性走 scan 兜底）+ scan 后端（全量扫描、并发 8 限流、单查 2s 超时 fail-open 降级留痕 `degraded:{reason:'timeout',message,scanned}`，INV-15 风格）。
- **搜索 API（T3）**：`GET /ob/api/search?q=&limit=` → `{data:{backend,degraded,query,results}, total}`，结果项 `{path, line, snippet, score, title}` 键集锁定；snippet=转义 HTML + `<mark>` 高亮（唯一标签，ARC-1 消毒口径，HTML 注入 query 负例必测）；**score=排序权重（越大越优，仅用于结果排序，非匹配概率/百分比——detpecca 教训，语义句进描述/文案）**。
- **前端搜索面板（T3）**：侧栏「搜索」同页面板一格（OW-US-14）——`SearchPanel.vue`（容器：查询态+API）/`SearchResults.vue`（展示：标题·路径:行号·score·消毒 snippet）/`web/src/lib/search-view.js`（SCORE_HINT 语义句+降级提示纯函数）；降级提示进界面留痕。
- **搜索出口消毒强制（T3 审前加固 / ARC-1）**：`createSearchService` 出口对**任一后端** hits 强制 snippet=已转义形态结构断言（escapeHtml 五实体口径 + 唯一标签 `<mark>` 严格交替），不合规拒（`bad_backend` fail-closed，不静默再消毒）——闭死插拔缝 v-html 破口；插拔缝假绿断言修复 + fts 后端契约补查询串转义义务（防 MATCH 'C++' 类符号查询炸 SQL 语法，ERR-004 同类）。
- **索引三保险（T11 / OW-US-11、OW-INV-11）**：①保存即增量（`vault-ops` 写路径事件钩子 saveNote/createNote/renameNote/deletePath → 毫秒级文件级增量，冲突/域拒绝零事件）②30min 定时对账（全量 diff 校正 seen/added/updated/removed/degraded + 对账账本落盘 JSON `<vaultRoot>/.ob-index/reconcile-ledger.json` INV-15 风格 + 分批可中断 + 账本续跑——陈旧窗口 ≤30min 定时器语义保证）③手动刷新 `POST /ob/api/index/refresh`（立即对账，未接索引服务 503 可解释）。
- **FTS5 索引库 + fts 后端接管（T11）**：`lib/index-store.js`（node:sqlite FTS5 trigram，ARC-2 仅展示索引、可全量重建，库落 `<vaultRoot>/.ob-index/`；规则指纹变更清库重建）+ `lib/index-service.js`（三保险编排 + fts 后端）——`createSearchService({backends:{fts}})` 零 API 变化接管 T3 检索缝（compileQuery plan→FTS MATCH/LIKE 逐词转义，命中行/score/snippet 走 `matchDocs` 与 scan 逐字节同口径，双后端等价测试锁定）；2 字盲区/纯符号查询结构性走 scan 兜底。
