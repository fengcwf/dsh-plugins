# Task 13 报告：lib/client.js 客户端壳 + lib/client.ui.js 最小桩 + test/client-shell.test.mjs

- 状态：✅ 完成（RED→GREEN，全量 72/72 零失败，.testenv chunk 可取性实测通过）
- 会话：Task 13 派发子会话；BASE c74c0e7 → 交付 eea1d21 + f1b1fe2
- 变更：dsh-github-ops 0.3.0 settings panel（changes/20260929-phase0/）

## 1. 实现

### lib/client.js（191 行，新建）——浏览器壳（F-scan-1 边界）

| 验收项 | 实现落点 | 证据 |
|---|---|---|
| `__ModuleLoader__` 注册形 + factory(require) 只登记模块体 | `lib/client.js:12-17` 注册 `id:'dsh-github-ops'`（INV-9）；副作用全在 `apply` | test「模块注册形」断言 factory 调用后 require 桩调用记录=空（零 require/零 chunk 拉取） |
| settings.section 主座（id='github-ops'，label「GitHub 集成」） | `lib/client.js:52-60`（SEATS[0]，order 30） | test「多座自探测 + 防双挂载」断言 opts.id='github-ops'、opts.label()='GitHub 集成' |
| 兼容座自探测 + 防双挂载（US-8/ADR-001/R-2） | `lib/client.js:52-85` SEATS 四座（settings.plugins.tab / plugins.bundle.config / settings.plugin.item）；`slots.inject` 即探测（宿主未声明该槽=回调永不执行=该面缺席，dshmarket 先例语义，零版本号判断）；单挂收敛=`mountSeat`（`lib/client.js:106-140`）：同/更高优先座在场→跳过；迟到高优先座→先挂新座再拆旧座（注册变更微任务批处理，同一同步块换手对宿主渲染不可见；dispose 按 record 身份守卫不牵连新座）——workbench 三形态收敛先例 | test「四座逆序触发单挂收敛，迟到高优先座切换」每步活动注册恒=1；test「主座先到时兼容座零注册」 |
| root 槽禁注册；sidebar/rightbar 只加内层 seat（P-7） | 座位表只含设置页族四座，全文件无 root/sidebar/rightbar 注册 | test「P-7 红线」注册名白名单断言 + 源码扫描 `slots.(inject|register)('root'/'sidebar'/'rightbar')` 零命中 |
| fetch 一律文档相对 `api/github-ops/…` | `lib/client.js:19,38-44`：`API_BASE='api/github-ops/'`（无前导斜杠，与宿主 `<base href="./">` 同基）；apiFetch 防御性剥前导斜杠；api 面（`{base, fetch}`）经 render* props 交 UI | test「fetch 帮手文档相对」：`apiFetch('status')`→`api/github-ops/status`；`apiFetch('/accounts/verify')`→归一；源码扫描 `['"`]/api/github-ops` 零命中（壳+桩） |
| 槽位方缺席=该面缺席：catch + logger.warn，绝不炸插件（INV-6） | `warn()` 双重守卫（ctx/logger 可缺位）；apply 逐座 try/catch（`lib/client.js:176-184`）；mountSeat register 抛错 catch（:114-118）；seat 组件渲染抛错 catch→null（:120-127）；chunk 拉取失败 catch+warn（:143-155, 170-172） | fail-open 四测：无 slots / register 抛错 / chunk 不可取(404形) / logger 缺位，均不炸+warn+零注册 |
| 挂载生命周期 | apply 返回拆除器（逆序撤 inject→撤注册）；`mountSeat` 异步竞态用 disposed 标记 | test「挂载生命周期拆除器收敛」：dispose 后活动注册=0 |

### lib/client.ui.js（30 行，新建）——Ruling-4 最小桩

- 兄弟 chunk 注册形 `load({id:'dsh-github-ops', chunk:'client.ui.js', factory})`（`lib/client.ui.js:10-13`）：chunk 名过宿主 `CLIENT_CHUNK` 白名单（dsh-client-modules `lib/index.js:171` `/^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/`；chunk 由 `chunkResponse` 取 `dirname(clientPath)/client.ui.js` = `lib/client.ui.js` 与 client.js 同目录）。
- render* 接口面：`renderSettingsSection(props)`（props=`{api, ownerProps}`）+ `renderSummary(props)`（bundle 页一行摘要，可回 null）；占位渲染「GitHub 集成（设置面构建中）」——Task 14 只填实现不改壳。
- 零硬编码色值、零 root/sidebar/rightbar 字面（P-7 源码扫描覆盖）。

### 壳↔UI 接口面（Task 14 契约）

`renderSettingsSection({ api: { base:'api/github-ops/', fetch(path, init) }, ownerProps })` / `renderSummary(同)`；summary 分发（`ownerProps.view==='summary'`）在壳内属**座位契约分发**非 UI 渲染（F-scan-1 边界内）。

## 2. 测试（test/client-shell.test.mjs，291 行，10 测试）

三类断言齐（+2 增强类）：
1. **模块注册形**：注册 id=包名（INV-9）/ factory 零副作用 / inject+apply+__fetch+apiFetch 导出面；
2. **多座防双挂载**：四座逆序触发单挂收敛+迟到高优先座切换（每步活动注册=1、旧座全拆、终态=主座）/ 主座先到兼容座零注册 / summary 分发 / api props 注入；
3. **无 slots fail-open**：无 slots、register 抛错、chunk 不可取、logger 缺位四形全不炸+warn；
   增强：**chunk 引用形**（`require.async('./client.ui.js')` 行为断言 + client.ui.js 注册形/CLIENT_CHUNK/ render* 面）、**fetch 文档相对**（行为 + 源码扫描）、**P-7 源码面扫描**。

## 3. TDD 证据

- **RED**：`node --test test/client-shell.test.mjs` = 0 pass / 1 fail（ERR_MODULE_NOT_FOUND: lib/client.js 缺席）→ 留证 `.superpowers/sdd/tasks-dsh-github-ops/task-13-red.txt`
- **GREEN**：同命令 10/10 全绿 → 留证 `task-13-green.txt`
- **回归**：`node --test` 全量 **72 tests / 72 pass / 0 fail**（基线 62 不掉 + 新增 10）
- **验证命令**（brief 逐条）：`node --check lib/client.js` exit 0；`node --check lib/client.ui.js` exit 0；`node --test test/client-shell.test.mjs` 全绿 ✅

## 4. .testenv chunk 可取性实测（Ruling-2 红线内执行，无需回退单文件形态）

脚本 `.testenv/t13-chunk-probe.sh`（未入 git）+ 输出 `.testenv/t13-chunk-probe-out.txt`：`plugintest` profile（非 web）@3180（避 3080/3500）、`dsh plugin add git+file://…#eea1d21…` 装快照、trap 回收（跑完 `ss` 确认 3180 无监听、无残留进程）：

| 资源 | 路由 | 结果 |
|---|---|---|
| 入口 | combo `plugins/??dsh-github-ops/client.js&rev=7a5a8ca84e20` | **HTTP 200**，8190B，注册形✓ 模块id✓ chunk引用✓ |
| 兄弟 chunk | `/plugins/dsh-github-ops/client.ui.js?rev=7a5a8ca84e20` | **HTTP 200**，1814B，注册形✓ chunk名✓ render*✓ |
| 负例 | `/plugins/dsh-github-ops/client.ui.js`（无 rev） | HTTP 404（chunk 路由钉 rev——UI 侧必须走 `require.async`） |

机制补充（🟡→实测）：入口 `client.js` **只经 combo 路由**服务（单文件直取 `/plugins/<id>/client.js?rev=` 本就 404，非缺陷）；chunk 走 `chunkResponse` 路由。boot 图 `__DSH_BOOT__` 中 dsh-github-ops 行 `inject` = dsh-client-locale / dsh-client-ui-renderer / dsh-client-ui-layout 三件套，与 kb-context 逐字一致（deferred 项核实：require 面相符，正常）。

处置（C-2）：**chunk 形成立**，已记 `changes/20260929-phase0/TECH.md` ADR-008「处置」段（含上表数字）+ 文件变更范围表补 `lib/client.ui.js` 行 + 文件依赖图补 chunk 引用（commit f1b1fe2）。

## 5. 文件清单

| 文件 | 操作 | commit |
|---|---|---|
| `dsh-github-ops/lib/client.js` | 新建（191 行） | eea1d21 |
| `dsh-github-ops/lib/client.ui.js` | 新建（30 行） | eea1d21 |
| `dsh-github-ops/test/client-shell.test.mjs` | 新建（291 行，10 测试） | eea1d21 |
| `dsh-github-ops/changes/20260929-phase0/TECH.md` | 修改（C-2 处置 + 文件范围 + 依赖图） | f1b1fe2 |

未入 git（工作区留置）：`.superpowers/.../task-13-{red,green}.txt`、`.testenv/t13-chunk-probe.sh` 及输出（沿 task-11/12 先例）。未 push、未 tag。

## 6. 自审（每主张落盘证据）

- 每条验收 = §1 表格行级证据（代码行号 + 具名测试）；三类断言齐且各自含正反例（逆序/正序触发、四形 fail-open）。
- 质量不由我裁（IL-2）：判定依据全部为测试输出（task-13-green.txt）与 probe HTTP 状态码（task-13-chunk-probe-out.txt）。
- 组件 ≤300 行：client.js 191 / client.ui.js 30 / 测试 291 ✅；零第三方依赖（P-4）；零明文（无任何凭据面）。
- 未动 lib/index.js / enforce.js / repo-tools.js / package.json / cordis.patch.yml（INV-7 零回归面未触碰）。

## 7. Concerns / NEEDS_CONTEXT

1. **NEEDS_CONTEXT（低，不阻塞，保守解释已落）**：「防双挂载」语义二解——(a) 单挂收敛+迟到高优先座切换（workbench 先例，US-8 文字直读）；(b) dshmarket 双座并存。已按 (a) 实现（brief 验收原文「防双挂载」支持）。若协调者意图是 (b)，改动点收敛在 `mountSeat` 单函数。
2. 兼容座键形取值：plugins.bundle.config / settings.plugin.item 用 `key:'dsh-github-ops'`（dshmarket 同款=包名），settings.section / settings.plugins.tab 用 `id:'github-ops'`（对齐 lib/index.js name 与 patch id）。宿主键语义若不同→兼容座静默缺席（fail-open），主座不受影响。
3. 测试为假 ctx 忠实建模（slots.inject 回调返回拆除器语义与宿主 SlotRegistry 对齐但非真宿主）；「设置栏目在 GUI 渲染出现」级验证归 Task 14/15/17（本卡 probe 覆盖到「资源可取 + 注册形在场」级）。
4. apply 同步只做 slots.inject（探测），实际挂载等 UI chunk 就绪（同源静态资源，毫秒级）；极端时序下该座短暂缺席属挂载生命周期语义，已注释。
5. 建议（未扩权未改）：package.json `scripts.check` 未含 `lib/client.js`/`lib/client.ui.js` 的 node --check（kb-context 形有）；归 Task 17/发版卡处置。
6. summary 分发（`view==='summary'`→renderSummary）在壳内，属座位契约分发非 UI 渲染（F-scan-1 边界说明见代码注释）；Task 14 若需更细 render* 面可扩 exports 不动壳。
