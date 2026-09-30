# CHANGELOG — wiki-steward

## 0.7.0 — 2026-09-30

历史日志视图三能力改造（Phase 8 反馈轮④，来源：`changes/2026-09-30-logview-filters/`，设置页历史记录弹层）：

- **默认时间倒序**：日志视图最新在上（倒序排列），滚动加载更早条目追加下方，翻旧锚点游标语义不变（追加不破坏回翻）。
- **时间区间筛选 `since`/`until`**：日粒度**闭区间** `[since, until]`（dateKey 字典序比较、含两端点）；翻旧（cursor 加载更早）**同参联动**——各页沿用同一筛选、锚点在过滤集内、不重不漏。
- **类型（来源）筛选**：三来源（cron 任务日志 / 手动扫描日志 / 告警账本）多选，可与时间条件**叠加**（交集语义）；**全不选=如实空页**（零条目不伪造）。
- **契约零变化**：Config / API 端点 / 客户端 `dsh.client` 契约零改动（纯视图层 + 读侧筛选）。
- **测试 391→415**（+24：倒序/时间窗/类型/组合/空态/翻旧同参全数锁定，**零回退零修订**）；另含合流缝测试夹具修复 1 条（`test/ingest-log.test.mjs:272` 告警账本夹具落点随数据面收口迁 `plugins/wiki-steward/data/kb-alerts.md`，commit `30e99c3`，修后 415/415 全绿）。
- **已知 deferred**：W1 `reload` 与在途 `loadOlder` 窄窗口竞态（无请求序号守卫，可致展示越筛）——epoch 守卫（约 3 行）下轮收口。

## 0.6.0 — 2026-09-30

数据面收口（~/.dsh 根目录治理）：

- **三件状态落点迁移**：队列 `~/.dsh/kb-index/queue/`、补跑账本 `~/.dsh/kb-index/schedule-ledger.json`、告警账本 `~/.dsh/kb-alerts.md` → 源码位插件数据目录 `~/.dsh/plugins/wiki-steward/data/`（`kb-index/queue/`、`kb-index/schedule-ledger.json`、`kb-alerts.md`）。
- **遗留迁移**：`migrateLegacyState()` apply 期一次性搬迁（opts.paths 测试缝注入=不迁）——无遗留=零副作用；逐项新家已有不覆盖；旧 `kb-index/` 迁空即删、非空（对家 kb-context active.db 在场）保留；失败逐项留痕不阻塞。
- **告警账本发现位随迁**：`ingest-log.js` alerts:kb 落点同步。外部配套：`/root/bin/dsh-cron.sh` ALERT_FILE 缺省随迁 + `mkdir -p` 兜底（数据目录未建不丢告警）；`/root/bin/tasks/21-wiki-ingest.md` 开场读取位随迁。
- **测试**：新增 `test/migrate.test.mjs` 4 项，既有路径断言随迁（391 全绿）。

## 0.5.0 — 2026-09-29

设置页/ingest 控制面改造批（Phase 8 轮，来源：`changes/2026-09-29-settings-ingest-controls/`，F1 面板搬家 + F2 UI 对齐 + F3 手动 ingest/定时控制 + T-F1/T-F2 收口）：

- **面板搬家 + 历史记录入口**（F1）：首页侧栏面板行移除，「查看历史记录」入口迁入设置页（弹层日志面：各来源逐行来源标注、尾部 200 行、滚动翻旧不破坏回翻）；修裸 import 说明符（`Failed to resolve module specifier 'api/wiki-steward/panel.js'`）
- **修真浏览器弹层挂根因**（T-F1 修复环 R1，潜伏缺陷非本批回归）：`web/vite.config.js` 缺 define 致构建物 219 处未替换 `process.env.NODE_ENV`（真浏览器 `import()` 抛 ReferenceError、历史弹层运行时挂；Node 测试面结构性盲区）→ vite define 钉 `"production"` + 重建 `web/dist` + 真浏览器加载回归锁（grep `process.env.NODE_ENV` = 0）
- **设置页 UI 对齐 dsh 设置风格**（F2）：原生 primitives（Switch/Button/Input/Modal）+ dsh token 唯一色板（§3.2 契约逐值落 CSS）；React 设置节单文件工厂束 = 宿主 require 表契约（纯逻辑文件内命名函数区，账本裁定接受）
- **手动 ingest + 定时执行控制**（F3，选项 A：插件自管 timer，零侵入 dsh-cron 通道）：设置页「扫描增量/触发蒸馏」双按钮（蒸馏=spawn `dsh-cron.sh wiki-ingest` 通道 detached + flock 防重入，通道不可用则不渲染按钮、如实提示走夜间任务）+ `ingest.schedule{enabled,time}` 配置键（到点 spawn 同通道、flock 兜底、错过补跑、配置热改 ≤60s 生效；**缺省 `enabled:false`** = 升级零行为变化）；原生「自动化任务」通道评估后不采用（提醒投递器与 headless 蒸馏执行体错位，automation-task-report.md §1-§5）
- **测试 342→387**（+45）：`node --test` 387/387 pass fail 0；真浏览器复测（弹层日志面渲染/来源标注/滚动翻旧 chunk 10/10）、不写系统 crontab 红线核过（`crontab -l | md5sum` 前后未变）
- **已知提示**：系统 crontab 00:25 行仍在（与插件 timer 双源并存，flock 防重入；设置页文案如实标注）；如需单一时间源请运维侧停用该行

## 0.4.1 — 2026-09-28

B1/B2 修复波（来源：`changes/2026-09-28-b1b2-service-effect-fix/`，Task 1 实现 + Task 2 zod 归位）：

- **B1 服务缝取得修复**（`lib/index.js`）：数据面服务取得由 softService 单次快照改为双层子插件形 `ctx.plugin({inject:['webServer','connection'], apply(c){…}})` 硬 inject——外层 `export const inject=['tools']` 不动；provider 缺位=子插件延迟激活不炸装载、后到自动补激活（INV-2 fail-open）；configEditor 保持可缺位软取得（缺=写端点 503 如实，展示面照常）
- **B2 effect 生命周期语义修复**（`lib/index.js`）：注册动作迁入 `c.effect` 执行体内——立即执行、返回值=拆除器（label `wiki-steward: ingest-routes`）、拆除幂等零残留；register 返回拆除器即记账+返回值去重双记账，注册中途抛错先收敛已注册资源再上抛；缺 effect 缝=跳过注册不悬挂（INV-3）；修前注册当场自拆/悬挂
- **zod 依赖归位**（`package.json`，工作区裁定 2026-09-28：仅 `@deepseek-ai/*` 走 peer+dev 双声明，第三方统一 `dependencies`）：zod 从 `peerDependencies` 迁入 `dependencies`（^4.6.5，git 快照安装自动代装），devDep `zod link:` 副本移除；`@deepseek-ai/dsh-llm`/`@deepseek-ai/dsh-tools` 双声明零变化——修前第三方 zod 在 peer（peer 不代装，autoInstallPeers:false），干净安装即 `ERR_MODULE_NOT_FOUND: zod`
- **测试 333→342**（+9：`test/apply-integration.test.mjs` 8 锁锁 B1/B2 回归——假 ctx 真 `apply()` + 真注册/handler 执行；`load.test.mjs` 子注入/拆除器契约 1）；断言修订 2 处逐条注明理由（task-1-report.md）；`node --test` 342/342 pass fail 0、`npm run check` exit 0

## 0.4.0 — 2026-09-28

设置菜单页签修正 + 面板加载 404 修复（能力级重做，用户反馈两问题）：设置页签归位 **settings.section 设置菜单命名空间**（better-sidebar 路线，navLabel 自动进设置页）；ingest 面板改挂 **sidebar.panellist 行 + main 槽页**（skill-explorer 形）；弃自造 `settings.plugins.tab` 页签与站内绝对 `/wiki-steward/panel.js` 动态 import（生产 404 根因：login-gate 3500 基址下逃出 `<base href="./">` 前缀+旧路由族无人服务）。

- **客户端面官方契约**（`lib/client.js` 重写，零构建 `window.__ModuleLoader__` 工厂形、React.createElement 无 JSX）：`package.json` `dsh.client`（platform=web, inject=locale/renderer/layout 三件，skill-explorer 契约形——旧 inject:["slots"] 为误形）+ `exports["./client"]` 扫描面；宿主自动服务 `/plugins/wiki-steward/client.js`（dsh-client-modules 浏览器花名册）
- **设置菜单两面**：① `settings.section` 命名空间注册（better-sidebar 形：`{name:'settings.section', id:'wiki-steward', order, label}`）=设置页 navLabel 条目，组件做**配置展示/可改**；② ingest 日志/触发面板=`sidebar.panellist` 行 + `main` 槽页（slots.register 形照 skill-explorer：`{name:'sidebar.panellist', id, order, label}` + `{name:'main', key, inject}`），Vue 面板挂载契约不变（`mount(el,{apiBase})→{unmount()}`，清理幂等，失败容器内如实报错）；root 壳槽位 launcher/trigger/header/close/action/onboarding 维持禁注册（**settings.section 不在禁注册列**——better-sidebar 实证注册 + settings-general 壳 `renderSlot("settings.section")` 渲染贡献组件，上一波『禁注册含 settings.section』系误读已纠正）
- **路由族官方形**（`lib/ingest-routes.js`，裁定 3）：`ctx.webServer.register({kind:"prefix", path:"/api/wiki-steward"})` 单 prefix + 内部分发——`GET/POST /api/wiki-steward/settings`（设置面展示/写入）、`GET /api/wiki-steward/ingest/{logs,settings}`、`POST /api/wiki-steward/ingest/{scan,distill}`、其余=web/dist 静态（panel.js/style.css，穿越围栏不变）；客户端一律**文档相对**请求 `api/wiki-steward/…`（skill-explorer issue #1707 教训：无前导斜杠/相对 base）；panel.js 面 404→200 回归钉死（真构建物字节等价断言）
- **设置写路径**（`lib/settings-write.js` 新增，裁定 B「写路径走 settings 服务或 ctx.webServer API」取后者）：可改白名单=最小集（capture.enabled/bufferRounds、queue.maxRetries/ttlDays、secrets.enabled；**vaultRoot/write.readOnly 不可改**——INV-7 注记语义勿动）；白名单外叶子整单拒（not_editable，绝不静默丢键）、对象深合并数组整替、真 zod 校验生效面（inherited∪current∪patch）；落盘走 host `configEditor.edit`（@deepseek-ai/dsh-config-editor——dsh-settings 服务同款持久化缝：校验→profile patch→reconcile 热生效）；缺缝=写端点 503 write_unavailable 如实+writable:false，展示面照常
- 测试 308→333（+25：client-face 6→13/settings-write 新 9/ingest-routes 11→18/ingest-wire 6→8，其中 ingest-dist 清单契约随 `dsh.client` 新形同步 1 条）；双 umask 口径全绿、npm run check exit 0；真验零 mock（真文件系统+真 zod Config+真构建物字节核）

## 0.3.0 — 2026-09-28

设置页签 ingest 面板（用户反馈需求）：dsh 设置页新增 **wiki-steward · Ingest 页签**（`settings.plugins.tab`），可查 ingest 日志与相关设置、手动触发 ingest（双动作）。

- **设置页签**（`lib/client.js`，dsh 客户端面零构建工厂形）：`dsh.client`（platform=web, inject=slots）+ `exports["./client"]` 扫描契约；`apply` 经 `ctx.slots.inject('settings.plugins.tab')` 注册页签（id=wiki-steward, order=30）——**只碰 settings 子面，root 壳槽位（launcher/trigger/header/close/action/section/onboarding）禁注册**；页签组件动态 import Vue 面板（`mount(el,{apiBase}) → {unmount()}` 契约，清理幂等，加载失败容器内如实报错不白屏）
- **Vue 面板**（`web/`，kb/obsidian-web web/ 惯例：web/ 源码 → web/dist 构建物随包入库；**最小构建选型=vite lib 形单入口**→`dist/panel.js + style.css`，Vue 打进构建物、运行时零第三方请求；不引 element-plus——面板纯展示+两按钮控件需求为零，样式对齐 dsh token；devDeps: vue/@vitejs/plugin-vue/vite）：组件 ≤300 行禁 v-if 重交互（ARC-6 同款），逻辑全落 `web/src/lib/*.js` 纯模块（log-view/trigger-model/settings-model），.vue 只做展示（容器/展示分离）
- **ingest 日志**（`lib/ingest-log.js`）：调研结论=**无统一日志文件**（ingest-pipeline.py 仅 stdout；夜间任务日志在 `~/.dsh/logs/cron/wiki-ingest-YYYYMMDD.log`（dsh-cron.sh 写）；告警账本 `~/.dsh/kb-alerts.md`）→ 面板**各来源拼接+逐行如实标注来源**（id/label/文件名/行号），顺序（dateKey,文件名,行号）升序（告警行内时间戳优先）；尾部 N 行+滚动加载（锚点游标，追加不破坏回翻，游标失效=空页 stale 留痕不编造）；超限文件只读尾段+行级 truncated 留痕
- **手动触发 ingest 双动作**（`lib/ingest-trigger.js`，裁定语义=脚本不语义编译）：「**扫描增量**」调 `ingest-pipeline.py scan --summary` 机械面（H3 规矩只调脚本本体），结果（增量清单）写扫描日志 `wiki-ingest-scan-YYYYMMDD.log` → 面板可见，`summarizeScan` 机械解析（真实输出形钉测试）；「**触发蒸馏**」呼叫 headless 任务通道 `/root/bin/dsh-cron.sh wiki-ingest 21-wiki-ingest.md`（detached 不阻塞请求，flock 防重入探针=已跑则不重入）并提示「**蒸馏由任务执行**」（按钮绝不做 LLM 蒸馏）；通道不可用则**不渲染蒸馏按钮**+面板写明「蒸馏走夜间任务/手动会话」（不造假通道）
- **相关设置**：Config 面（vaultRoot/capture/write/queue/secrets）+ vaultRoot/write.readOnly **只读展示**（INV-7 注记，语义勿动）+ 日志来源/蒸馏通道状态如实展示；本波可改项最小集=∅（用户需求是"查看"；改 config=走 cordis config 热改语义，不进本面板）
- **数据面**（`lib/ingest-routes.js`，obsidian-web /ob/ 同款形）：`GET /wiki-steward/api/ingest/{logs,settings}`、`POST /wiki-steward/api/ingest/{scan,distill}`、prefix `/wiki-steward` 静态（web/dist，穿越围栏：URL 归一化前后双判+分量拒+realpath 前缀核）；API 形 {data}/{error:{code,message}}，每条 handler 第一行过 `connection.requestRejection` 鉴权缝；接线=webServer/connection **软取得**（T13 timer 同款姿势，`inject` 维持 `['tools']` 不变——load.test 钉住），缺缝 fail-open 留痕（捕获/工具面照常），`ctx.effect` 收敛 dispose
- 测试 245→308（+63：ingest-log 12 / ingest-trigger 11 / web-panel 13 / ingest-routes 11 / client-face 6 / ingest-wire 6 / ingest-dist 4——真文件系统+child_process 注入缝；真验含真跑 ingest-pipeline.py scan（只读）+真跑 dsh-cron.sh 缺任务文件 exit 2 / flock 防重入 exit 3（DSH_CRON_LOG_DIR/DSH_KB_ALERTS 注入落点，绝不碰真 home、绝不触发 LLM）；双 umask 口径 308/308×2 全绿、npm run check exit 0）；既有 245 断言零改动（mkCtx/load 最小假缝补 webServer/connection 两 stub，各用例留痕计数语义不变）

## 0.2.0 — 2026-09-26

首个功能版：捕获/校验/回写/CRUD/队列/拦截全量交付（0.1.0 壳版留待面全部落地）+ 终审遗留清障批。

- **捕获**（`lib/capture.js` / `lib/buffer.js`）：会话事件捕获入 raw/（`agent/session-start`/`session/event`/`agent/turn-stopping` 三缝）、轮次缓冲（bufferRounds 轮攒批、turn 槽=sessionId+最老未落盘轮、dedupKey `sessionKey+\n+turn` 防碰撞、turn-stopping 强制收口、session/disposed 双清）；全量脱敏先行（secrets 三层）
- **校验**（`lib/validate.js`）：`kb_validate` 六规则——frontmatter 六字段（solutions 增 reusability/项目文档 status 词表）、index 双向（登记形统一解析 Obsidian 语义+vault-root 回退+stem 多命中歧义 warn）、naming 类型化命名表（硬禁 error/形态欠账 warn）、placement 归属表禁令、structure 四段+wikilink 语法（fence 豁免）、evidence 证据清单（INV-15，wiki/ 域限定）；`quickCheck`/`quickFindings` 分级快检缝（T14 分流消费，severity 分级）；判定面收窄（reference/项目文档/infra 豁免）
- **回写**（`lib/mark.js`）：`kb_mark` sha256 原子回写——两态字节手术（换值只动值字节/缺行补插闭合 `---` 前）、`expectedRevision` 乐观并发（冲突拒不覆盖）、fs-safe 原子写、写后三层校验（未动段 hash + 值段字节 + 行形 prefix/suffix strip 区，写坏=write-corrupt+journal 逆放）、幂等同值零写盘、无 frontmatter/多 sha256 行歧义拒
- **CRUD**（`lib/crud.js`）：`wiki_write`/`wiki_delete`/`wiki_rename`——realpath 四步围栏+全链逐段防 symlink 逃逸、统一覆盖语义（缺省拒 target-exists）、delete→`.trash/<rel>` 可逆+双确认（confirm=路径复述）+落点 O_EXCL 占位防窄窗覆盖+冲突改名 `.N`、rename=journal 多文件事务（改前快照/批量失败即中止回滚/锁内 RMW 不吞并发/rolledBack 诚实位）+wikilink 全库重写四设计（歧义不动/捕获组回填/风格保持/不制造新歧义）、vaultRoot 必传+默认只读（INV-7）
- **队列/告警**（`lib/queue.js` / `lib/alert.js`）：入队 tmp+rename 原子、flush 重试 maxRetries、ttlDays 过期清理、告警留痕（INV-15 禁静默）
- **拦截**（`lib/gate.js`）：`tools/pre-execute` 判定矩阵（allow/ask/deny 三态无输入改写）——readOnly vault 写类全 deny 早拦、新建不合指引 deny+指路、存量页问题 ask 不阻塞修复、非 vault/读工具零快检放行、edit 补丁外推按编辑后内容判、异常 fail-open 留痕
- **共享层**：`lib/secrets.js` 三层脱敏+占位符+计数；`lib/fs-safe.js` 写安全基元——`writeAtomic`（wx 独占+双 fsync+rename+失败清残）、`withFileLock`/`withLeaseLock`（lease 时间戳 stale 自愈+超时接管留痕）、`realpathGuard`（形式拒→归一→归属→dangling 外指逐段判逃逸）、`journalSave`/`journalRollback`（content+sha256+mode 快照、逆放+幂等）
- **遗留清障批（终审 deferred 收口）**：`journalRollback` 写后 fchmod 精确还原 mode（不受 umask 截损，双 umask 口径同判）；`withLeaseLock` 释放=成功 `unlink(lease.json)` 原子放弃+锁目录实例门（dev+inode）——「绝不拆新持有者」结构性成立；`.trash` 落点 O_EXCL 占位（wx 文件/mkdir 目录独占后 rename 覆盖占位=唯一落点）；CJK 判据补扩展 B+ 代理对区段（纯扩展 B 命名不误报）；`collectMd`/`listWikiMd` readdir 失败 io 留痕（校验/改写漏报面收口）；⑥证据规则收窄 wiki/ 域（`wikiRel !== null` 一门，raw/ 捕获产物不触发）；⑥引用行判据收紧（fence/代码块内行不算，引用行须正文）；mark 行形核 prefix/suffix strip 区字节不变；INDEX `key=''` 畸形登记→歧义拒（不再静默 continue）；kb_mark 失败原因枚举死项 `read-only` 清理；gate reason 去裁定黑话
- 测试 245/245（load/secrets/fs-safe/capture/buffer/validate/mark/crud/queue/alert/gate/wire——mkdtemp 真文件系统零 mock，故障注入仅 _write/_failAt/_beforeApply/_readdir 缝；双 umask 口径复核）

## 0.1.0 — 2026-09-23

初版：插件骨架（壳）、全量脱敏与写安全共享层（Task 8）。

- `package.json`（`dsh.bundle.patch`）+ `cordis.patch.yml` insert 行 `{id: wiki-steward, name: wiki-steward, config: 全部键}`（config 整行替换语义，自带全键）
- `lib/index.js`：导出 `name` / `inject` / `Config`(zod) / `apply`；**default 导出 `{inject, apply}` 对象**（R13 教训：工厂函数形态会被宿主静默忽略）；`inject = []`（壳期零宿主服务依赖，T11/T12 扩 tools）
- `Config` 全键：`capture{bufferRounds,enabled}`、`write{readOnly}`、`queue{maxRetries,ttlDays}`、`secrets{enabled}`（delta-spec §2）
- `apply`：配置防御性校验——非法配置留痕告警后 fail-open（INV-15 禁静默）；业务接线留缝 T9-T13
- `lib/secrets.js`：三层脱敏（①PEM 整块 ②赋值形态保 key 名 ③token 形态）+ `<redacted>` 占位符 + 计数 + `SENSITIVE_PATTERNS` 导出（INV-11；宁漏不误伤护栏）
- `lib/fs-safe.js`：写安全共享基元 `writeAtomic`/`withFileLock`/`realpathGuard`/`journalSave`+`journalRollback`（冲突扫描裁定：T11 kb_mark 与 T12 CRUD 消费，不重复实现）
- `test/load.test.mjs` + `test/secrets.test.mjs` + `test/fs-safe.test.mjs`：加载冒烟 / 哨兵中和与 lookalike 反例 / 原子写清残、锁互斥、围栏负例、journal 往返
- 零第三方运行时依赖：zod / `@deepseek-ai/*` 走 peer+dev 双声明（devDep `link:` 宿主运行时副本，kb-context 同款形态）
- 本版不含捕获/校验/回写/CRUD/队列/告警业务模块（`lib/capture|buffer|validate|mark|crud|queue|alert.js`），留待 T9-T14
