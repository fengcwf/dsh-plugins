# Changelog — obsidian-web

## 0.2.4 — 2026-10-09
- **UI 视觉回切 dir-a（精致文档风）**：按用户定稿换回 ui-a-impl 版本——字阶档比（页题 ×2.0/h2 ×1.2/h3 ×0.95）、留白与排印（段距 0.95em、h2 发丝线节奏、引文淡底卡）、派生族 C1-C8→A1-A7；`.vue`/`lib/` 零改动。**保留** M1 两态工具位、AA 明暗（明 4.56/暗 5.55）、行长=内容 68ch+双内距。
- **自适应缺口修复（G-4/G-7/G-8）**：修 el-table 被正文排印口径污染导致的布局契约失真（1440px 表可用宽 604→756px，「操作」列不再被硬切，末列五档可达）；新增 `@media print`（长笔记 1 页→4 页）与 `prefers-reduced-motion`（最长 transition 0.34s→收敛）。注：审计原判「表头错位 718px」经真渲染实测不成立（对齐差恒为 0），已按实测重新定性（见 reports/ui-responsive-gap-fix.md）。
- **分享链接口径修复（真 bug）**：`share-links.js` 在 sharePort=null 时曾回落 `DEFAULT_SHARE_PORT=3500`（=门禁端口，站外访客被 302 到登录页）→ 改为仅下发路径；同步修 `web-routes.js` sharePortOf 与 SettingsPanel 硬编码 3500、过期注释改现行 PATH 契约口径。RED→GREEN 实证：还原旧逻辑→6 条必红。
- **分享面承载改道（配合门禁侧）**：profile `sharePort: null` 走 webServer 同域 `/ob_share/` 前缀，分享面不再依赖 3501 独立端口（3501 停止监听）；外网经 10086→3500 门禁放行后可达，**无需家宽侧 Lucky 改动**（实证 `__gate/health` 200）。门禁侧匿名放行前缀由 dsh-login-gate 同批发版承载（安全边界变更，默认关、仅 GET/HEAD、精确前缀）。
- 测试 598→601（新增：溢出治理 2 锁 + G-4/G-7/G-8 3 锁，既有零弱化）；全量 601/601/0。


## 0.2.3 — 2026-09-30
- **UI 视觉全量升级（dir-c-light 定稿，高质感面板风）**：区域面板卡片化+三层抬升（暗态独立推导非反转）、焦点环光晕、带对勾保存徽标（语义胶囊）、行内操作 hover/当前显形、全卡宽发丝分隔、控件细节精致化；字阶档比改齐定稿（页题 ×1.8 / h2 ×1.13 / h3 ×0.93，随字号轴保比例）；行长修正=内容 68ch+双内距（修复 border-box 下实际 ~53ch 缺口）。
- **树行工具位根治（M1）**：三档 right 硬值+固定预留退场 → 两态工具位（闲置脱流保标签全显+Tab 可达，显形收回流内，预留位≡按钮块宽由构造成立）——长标签行省略号截断、按钮不压字；display/visibility 逃逸被测试锁死。
- 对比度 AA 明暗双态复测（最低 4.81:1/5.48:1）；派生色 C1-C8 全走 color-mix 单向推导自 dsh token（推导式入注释+测试锁）。
- **测试 570→586（新增 16）**：视觉 token 锁（字阶/间距/圆角/控件/AA 比值/明暗双态/状态面）+ M1 工具位锁（含 display/visibility 禁用断言）+ C1-C8 注释锁；证据面可复现（pixel-probe.py 36/36 自校验）。
- 质量链：UI-A/UI-C 双实施+三轮换人复审（M1..m5、F1..F3 全闭环）+ 真渲染证据图 5 张（像素采样校验）；零 IA 变更、组件 ≤300 行。


## 0.2.2 — 2026-09-29
- **运行时阻塞根治（0.2.1 生产反馈：一直慢/dsh 掉线/读取挂起）**：
  - backlinks 索引化：每次开笔记同步扫全库 15277 md（47.4s，CIFS 放大）→ docs 表派生链接级缓存+增量维护，复验 22-25ms（rchar 硬证全量扫消失）；
  - tree 缓存：4.3s/次全量重扫 → 事件增量+TTL 30s+journal 幂等，6-8ms；
  - index-service 异步化：主线程同步 fs 三面清零（fs.promises+批让出），对账窗 12.6s 阻塞→事件循环尖峰 134.6ms；
  - search fts 修复：<3 码点短中文词结构性走 scan 的路由盲区 → canHandle 声明制+SQL≡regex 下推安全门（不窄化召回），q=用友 15.2ms（原 scan 902ms）；
  - 前端 8s 加载状态机：AbortController+超时中止+请求身份+读写文案区分+写失败 reloadTree 兜底——「一直加载中无报错」根治；
  - 新增只读 `GET /ob/api/index/status`（索引/fts/对账/degraded 可观测）。
- **UI C+A 优化**（视觉 Spike 定稿）：C 公共底座（4/8 间距/圆角/焦点环/保存徽标四态/面板统一头/hairline/状态面治理+对比度 AA 五修，color-mix 派生自 dsh token 推导式入注释）+ A 阅读优先（行长 68ch/字阶四档/阅读头/专注模式）+ 按钮四档与排印微调。零 IA 变更（B 方向另波）。
- **测试面 492→570（新增 78 用例）**（口径更正：此前提交信息「510→570/+60」系波内中途快照，分支真实口径以此为准）：integration 两轴+状态机行为锁+反链/树缓存等价锁+fts 等价锁+manifest 四对齐联动锁与安装钉版一致性锁（发版失同步病根根治）+flaky 断言净口径稳定化。
- 运维件（/root/.dsh/，随重启生效）：watchdog 探测 15s+连续 3 次才自愈+坏件签名分流回滚；start-dsh.sh 端口真释放再启（重启竞争链根治）。
- 验证：tester 终验 PASS 零 findings（.testenv 钉 sha 四关+功能探针+性能验收对照：backlinks 47.4s→22-25ms/tree 4.3s→6-8ms/file p95 11.9ms/阻塞传导消失）；整分支终审 PASS（0 Critical/Major）。


## 0.2.1 — 2026-09-28
- **B2 修复（功能面全 404 根因）**：`ctx.effect` 工厂语义误用——五位点（`lib/index.js` ×4 + `lib/client.js`）改「注册在执行体内当场跑、返回值=拆除器」形 + 注册抛错先收敛已注册资源再上抛 + 拆除幂等；修前路由注册完即自拆（`/ob/*` 全 404/405）、独立分享面 close 在 start 前空跑 + 拆除期泄漏监听。宿主契约对照 cordis `_execute`（立即执行、返回函数=拆除器）。
- **测试契约同源化**：6 测试文件伪 ctx `effect` 改真语义（含 `TypeError('Invalid effect')` 分支，6/6 逐副本 `assert.throws` 锁死、删行变异必红）+ 新增 `test/apply-integration.test.mjs` 两轴 integration 测试（注册面在场 / 拆除面正确 / 真 handler 双向 / 独立 listener 真关）；482→492 全绿。
- **包内配置缺省归位**：`cordis.patch.yml` `server.sharePort` 缺省 3500→`null`（同域 prefix 零自有端口，根治与 login-gate 3500 的缺省冲突）。⚠️ 行为提示：config 整行替换语义下**profile 覆盖者不受影响**（生产 profile 现配 3501 照旧）；仅全新缺省安装的行为从「独立 3500 listener」变为「webServer 同域 /ob_share」。
- **依赖归位**：`zod` 从 `peerDependencies` 迁 `dependencies ^4.6.5`（git 快照自动代装，干净 profile 单装不再 `ERR_MODULE_NOT_FOUND`）；`@deepseek-ai/*` 三件 peer+dev 双声明不变。
- 验证：`.testenv` 钉 sha 真安装复验 boot 冒烟四关 + 功能探针全绿（修前 404/405 → 修后 `/ob/`、`/ob/api/tree`、`/ob/api/file`、`POST /ob/api/render`、`/ob_share/<token>` 两模式全在场）；tester PASS / 终审 PASS / Phase 8 F1 闭环（492/0）。


## 0.2.0 — 2026-09-28
- **问题 A：分享面 3500 与 login-gate 冲突 + watchdog 掉 dsh 服务 → 双模式（照 dsh-better-sidebar 路线）**：
  - **默认不再开自有端口**：分享面挂 `ctx.webServer.register({kind:'prefix', path:'/ob_share', handler})`（dsh web 3080 同域）——`server.sharePort` 契约改 `number|null`：`null`（默认）=挂 webServer、`number`=独立 listener（可选模式，照旧可单独关停）。**对外契约 `3500 /ob_share/<token>` 语义不变**（PATH 契约非端口契约）：由 login-gate/nginx 直通反代保持（OW-INV-2 批注修订）；链接生成端口缺省恒 3500（`share-links` 回落单一来源不变）。
  - **watchdog 安全（掉服务根因回归）**：独立模式端口占用/任何 listener 失败 → **fail-open**——该次 boot 分享面不启 + degraded 留痕（INV-15），**绝不抛出让插件装载失败/拖垮 dsh**。机制：`start()` API 级绝不 reject（绑定失败 resolve `{listening:false, reason:'listen_failed'}`）；`syncState` 自愈重试（同口同面）全路径零 unhandledRejection；listener `error` 永久监听（非 once，防 unhandled 'error' 炸进程）；`handle()` 全路径 fail-closed 网兜（统一 404/400 形 + 留痕）。根因分析（为何 better-sidebar 不掉服务）：零自有 listener + 全走 `ctx.webServer` + `ctx.effect` 收敛——本插件旧独立 listener 的绑定失败回路（`syncState` 定时重试 `void syncState()` 未接 catch → unhandledRejection 杀宿主进程 → watchdog 判死重启）即掉服务根因链，现全链封死。
  - **面口径零分叉**：webServer 模式与独立模式共用同一 `createShareServer.handle` 实现（新增 `createShareHandler` 薄导出），精确前缀/统一 404 形/限流/鉴权/脱敏契约逐字不变；`share.enabled=false` 关停语义照旧（webServer 模式=handler 统一 404 面消失）。模式绑定=启动时配置值（热改 restartRequired）。
  - **回归测试** `test/share-wiring.test.mjs` 6 项真验零 mock：默认 webServer 模式恰一处注册+真 HTTP 面契约原样；热禁用统一 404；端口占用 fail-open（apply 不抛+主 UI 照挂+留痕+零 unhandledRejection）；`start()` API 级绝不抛出；watchdog 回归（syncState 重试/热禁用自关/再启用全路径零 unhandledRejection）；释放端口后自愈真起面（同口同面）。
- **问题 B：菜单未展示 → 客户端面板入口（照 @linxin666/dsh-client-ui-skill-explorer 模块契约）**：
  - `package.json` 加 `dsh.client`（inject 三件 `@deepseek-ai/dsh-client-locale`/`dsh-client-ui-renderer`/`dsh-client-ui-layout`，`platform:"web"`）+ `exports["./client"]`（宿主按 `exports["./client"]` 定位 client bundle）；`files` 含 `lib`（client.js 进安装快照）。
  - `lib/client.js` **零构建手写**（无 JSX/无打包器/零新增依赖）：`window.__ModuleLoader__.load({id:'obsidian-web', factory:(require)=>exports.apply/exports.inject})`；`ctx.slots.inject('sidebar.panellist', ...)` 注册行（id=`obsidian-web`、order=35、label=`Obsidian vault`）+ `ctx.slots.inject('main', ...)` 注册 main 槽页（iframe 指既有 `/ob/` 静态面——选型=复用 web-routes 已服务的三栏 UI，零重复实现；路径绝对形与本插件面既有约定一致）；两座经 `slots.inject` 等宿主声明（壳未声明=面板缺席不炸装载），注册交 `ctx.effect` 收敛。
  - **回归测试** `test/client-module.test.mjs` 4 项：真 import 加载（`__ModuleLoader__.load` 定义真捕获）、工厂产物形（`exports.apply/inject` 在）、面板注册契约（行/页注册形 + iframe `src=/ob/` + dispose 全撤）、manifest 声明（dsh.client 三件+platform+exports+files 含 lib）。
- **发版三件**：bump 0.2.0（能力=minor）+ 本 CHANGELOG + 根 README 版本表/根 CHANGELOG 同步 + README 配置表/安装钉版本更新；契约锁同步（`load.test.mjs` sharePort 双模式、`manifest.test.mjs` 0.2.0）。delta-spec 批注：OW-INV-2「3500 /ob_share」=外部契约（反代达成），内部面挂 webServer。不 tag 不 push（归发版波）。

## 0.1.1 — 2026-09-28
- **Bug 修复：boot 因索引库打开失败而装载失败（`database is locked`）→ fail-open**（生产日志 304/324 两轮 boot 必现，`1 entry did not activate`，插件装载失败）：
  - **根因（复现/strace/库文件态实证，详见 `.superpowers/sdd/tasks/fix-boot-lock-report.md`）**：vault 落 CIFS（`vers=3.1.1,nounix,mapposix,noperm,soft`）挂载，SMB per-handle 字节锁语义把 SQLite 同 fd 锁升级（`F_WRLCK [0x40000002,510)` 覆盖同 fd 已持 `F_RDLCK` 同区间）判为自身冲突 `EACCES`→SQLITE_BUSY→`database is locked`——该挂载上任何 SQLite 写（含建库 SCHEMA）恒失败（全新文件/零进程持有必挂、`index.db` 停在 0 字节、本地盘同代码整条锁序列全绿）。候选①锁残留/②双实例双开/③IMMEDIATE 并发事务均被实证排除。
  - **产品语义（boot 永不因索引失败而装载失败——索引库是展示面，ARC-2 可重建零损失）**：`createIndexService` 建库/开库失败 fail-open——插件继续装载，索引面进 degraded 留痕（INV-15 风格：warn 线 + 对账账本 run `status:'degraded'` + `status()` 可观测），检索走 scan 兜底（`createSearchService` 对 fts 后端 `index_unavailable` 自动降级 scan，`backend` 如实报 scan）；`apply` 另加最后防线网兜（任何索引面异常同样放行装载+留痕）。
  - **开库自愈**：`PRAGMA busy_timeout`（缺省 500ms；node:sqlite 默认 0=锁竞争立即失败）+ 小退避重试（缺省 2 次、指数退避 50ms 起，只重试锁类错误 SQLITE_BUSY/LOCKED）——真锁竞争（他进程持锁/并发开库）自愈；tick/手动刷新/start 补跑同径 `ensureStore` 自愈重试，恢复后全量对账重建（run `done`+计数如实）。
  - **`POST /ob/api/index/refresh`**：索引面 degraded 自愈失败 → 与「未接索引服务」同形 503 `index_unavailable`（可解释，不装死）。
  - **回归测试**（真验零 mock，`test/index-failopen.test.mjs` 6 项）：真锁（第二连接 `BEGIN IMMEDIATE` 持锁）→ apply 必成功 + degraded 留痕 + refresh 503；释放后自愈重建（run `done`+计数如实）；跨进程持锁释放→退避重试自愈（真第二进程）；busy_timeout 真生效（持锁下失败耗时 ≥ busyTimeout）；degraded 期检索自动降级 scan、恢复后回 fts；degraded 态增量跳过留痕不炸 + `stop()` 安全收敛。
  - **已知边界（如实）**：根因在挂载锁语义（环境面）——本修复保证 boot/检索行为不丢并把重试自愈做实，但该 CIFS 挂载上索引库将持续 degraded（重试无法愈合恒定的锁语义故障，检索走 scan 兜底）；要恢复索引能力需调整挂载锁语义或把索引库迁出 CIFS（NEEDS_CONTEXT 交裁定，见报告）——**裁定已收口：同版本迁出 CIFS，见下条**。
- **索引库迁出 CIFS 落本地盘（fix-boot-lock 后续裁定收口，同版本）**：索引=可重建零损失缓存（ARC-2）不该落 CIFS（SQLite 落 CIFS 恒败，根因实证见 `.superpowers/sdd/tasks/fix-boot-lock-report.md`）——①Config 新增 `indexDir`（索引库基目录；缺省/空串/纯空白=出厂默认 `~/.dsh/cache/obsidian-web/`，`~` 按 `os.homedir()` 展开；解析语义单一来源 `index-store.resolveIndexDir`，优先级 `dir` > `indexDir` > 默认）②索引库落点改 `<indexDir>/<vault 名-哈希>/`——每 vault 一库（多 vault 档案各一库），安全名（basename 净化仅 `[A-Za-z0-9._-]`）+ `sha256(vaultRoot)` 前 16 位防撞名③旧落点 `<vaultRoot>/.ob-index/` 检测到→重建提示留痕（索引可重建零损失：不迁移旧库、**绝不静默删除**，旧目录留用户手动清理）④busy_timeout/开库 fail-open/degraded 留痕/自愈重试语义全部保留（双保险——CIFS 上的 vault 读写照旧，只有索引库本地化；`test/index-failopen.test.mjs` 6 项照跑新落点）⑤FTS5 速度面恢复证据：本地盘（ext4）300 篇冷建 362ms（1.21ms/篇）、MATCH 查询 19.5ms、增量对账 68ms（`test/index-dir.test.mjs` 实测 diagnostic）⑥回归测试 `test/index-dir.test.mjs` 6 项真验零 mock（落点解析语义缺省/空串/空白/`~`/覆盖/优先级、稳定+防撞名+安全名、默认落点端到端真写真查（fake HOME 不污染真 `~/.dsh/cache`）、覆盖落点真写真查+速度证据、多档案分库互不串、旧落点提示+旧目录逐字节保留）。

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
- **分屏编辑与安全保存（T4 / OW-US-3、OW-US-4、OW-INV-3、OW-INV-6）**：`lib/render.js` unified 管线归位（remark/unified/rehype 白名单族 + rehype-sanitize 消毒层，{html,toc} 出口；表格/嵌套列表/脚注/任务清单；XSS 全向量负例）+ `vault-ops.saveNote`（withFileLock 单文件原子锁 + mtime/etag 乐观锁：无乐观锁不落盘、冲突三选材料、diff undo 往返）+ `POST /ob/api/save`、`POST /ob/api/render` + 分屏编辑 UI（源码/预览联动、保存防抖 600ms、冲突三选弹层、内存级 undo）。
- **改名/移动多文件事务（T5 / OW-US-5、OW-INV-4）**：journal 快照/逆放原语 + `renameNote` 六坑序编排（目标副本→逐文件锁内 RMW→INDEX 同事务→最后删源→失败整体回滚）+ `wikilink-rewrite` 引擎（歧义不动留痕/#锚·别名捕获组回填/裸名风格保持/toBase 不制造新歧义）+ `POST /ob/api/rename` 信封（{ok,rolledBack,warnings,changed[]}）；静默覆盖/TOCTOU/批量失败回滚/锁内 RMW/标题内链接/空源残渣六坑反例逐条有测。
- **删除可逆（T6 / OW-US-6、OW-INV-5）**：`deletePath` .trash 移动语义（非 rm；取回=逆向 rename 逐字节同）+ 双确认（confirm=目标相对路径全等复述，检查先于一切副作用）+ trash 落点认领（O_EXCL 占位防覆盖窄窗+序号改名）+ `POST /ob/api/delete` + 前端双确认弹层。
- **下载导出（T7 / OW-US-7、OW-INV-9）**：`GET /ob/api/download` 单 md 文本流/目录 zip 流（MAX_FILES 5000/MAX_BYTES 500MB/MAX_ENTRIES 65535 限额预扫超限拒+可解释，绝不截断）+ `lib/zip.js` 最小 zip writer（零第三方；unzip/zipinfo/python3 三工具互验）+ lstat 门 symlink 不跟随跳过留痕 + 前端下载入口。
- **分享模型（T8 / OW-US-8、OW-INV-1、OW-INV-2、OW-INV-2b）**：`lib/share.js` 256bit base64url token + scrypt 密码（写权限强制密码/autoPassword 明文恰一次/升写须先有密码）+ 敏感文件名永禁（12 条 glob 逐段判定）+ 到期/一次性（锁内 read-verify-consume）/撤销 + 404 同形不泄露存在性 + 每 IP 120/min 滑窗限流 + 角色分级范围模型（笔记写=仅编辑、文件夹写=目录内新建/编辑/删除/改名）。
- **分享服务独立入口（T9 / OW-INV-2、OW-INV-6、OW-INV-10）**：`lib/share-server.js` node:http 独立 listener（server.sharePort）+ `/ob_share/<token>` 精确前缀 fail-closed + live 渲染直出（整页零 `<script>`+CSP）+ 脱敏哨兵（PEM/token 形态中和+计数如实）+ guest 写操作（乐观锁+undo+trash+rename 事务复用）+ IP 口径=socket.remoteAddress（显式 trustProxy 才解析 XFF）+ 可单独关停。
- **分享管理与设置页（T10 / OW-US-9、OW-US-10）**：管理面 HTTP 六路由（列表/查看计数/撤销/密码与权限调整/设置）+ 链接生成服务端单一来源（`share-links.buildShareLinks` 唯一拼接点，前端零拼接）+ 内外网地址同显 + 外网域名设置（`<vaultRoot>/.ob-share/settings.json` 0600 原子写）+ 管理 UI 面板（SharePanel 六小件）。
- **索引三保险（T11 / OW-US-11、OW-INV-11）**：①保存即增量（`vault-ops` 写路径事件钩子 saveNote/createNote/renameNote/deletePath → 毫秒级文件级增量，冲突/域拒绝零事件）②30min 定时对账（全量 diff 校正 seen/added/updated/removed/degraded + 对账账本落盘 JSON `<vaultRoot>/.ob-index/reconcile-ledger.json` INV-15 风格 + 分批可中断 + 账本续跑——陈旧窗口 ≤30min 定时器语义保证）③手动刷新 `POST /ob/api/index/refresh`（立即对账，未接索引服务 503 可解释）。
- **FTS5 索引库 + fts 后端接管（T11）**：`lib/index-store.js`（node:sqlite FTS5 trigram，ARC-2 仅展示索引、可全量重建，库落 `<vaultRoot>/.ob-index/`；规则指纹变更清库重建）+ `lib/index-service.js`（三保险编排 + fts 后端）——`createSearchService({backends:{fts}})` 零 API 变化接管 T3 检索缝（compileQuery plan→FTS MATCH/LIKE 逐词转义，命中行/score/snippet 走 `matchDocs` 与 scan 逐字节同口径，双后端等价测试锁定）；2 字盲区/纯符号查询结构性走 scan 兜底。
- **设置页 vault 目录档案 + realpath 围栏终态（T12 / OW-US-13、OW-INV-7）**：`resolveInRoot` 全链逐段解引用围栏（形式拒/trim 别名穿越拒/纯点空格段 fail-closed/自环·互指判逃逸/dangling 外指=逃逸意图拒）+ TOCTOU 收口（open 前 realpath 复核+fd 打开后 dev/ino 复核+锁内/操作后复核）+ vault 目录档案 CRUD（默认行恒在不可删、注册表 0600 原子写）+ 健康三探针（可读/可写/延迟，CIFS 抖动容忍）+ 切换 restartRequired:true 热改可解释拒不冒充 + 换 vault 各配提示。
- **UI 构图与 token 跟随（T13 / ARC-5、ARC-6）**：三栏 300/阅读/248 构图锁 + 窄屏 960 逐区块退化（树/TOC=折叠抽屉）+ 分屏状态持久化敌意值归一 + rename UI 入口（树节点按钮→RenameDialog→多文件事务）+ element-plus 按需装配+显式 vendor 分块（entry 51.78KB/vendor 394.01KB，全 chunk ≤500KB）+ 分享页 token 快照内联导出（26 token 明暗双份、零外链、整页零 script）+ 幻影 token 归真 + `updateShareRole` 密码三态载荷合流（password:null=清除，写+清显式拒）。
- **集成验收与收口批（T14）**：A1-A3 验收码 HMAC 核 + 集成级实测；写面显式拒最终分量 symlink（saveNote/createNote lstat 门与 export/share 同向，同物不变量保真——文件级别名写语义裁定）；`/ob/api/shares/password` 服务端面下线（密码调整单一来源=role 载荷合流；未发版零外部调用方）；renameOutcome rolledBack 全分支透传；element-plus danger/warning/success 语义色桥接 state token；zip writer sink setMaxListeners 噪声清理；T4-T10 历史欠账收口（本文件逐版本如实补记）。
