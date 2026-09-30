# task-impl-report — 日志视图时间倒序+时间筛选+类型筛选（t1，Phase 8 反馈轮④）

> 状态：**完成**（`node --test` 411/411 绿（387 基线零回退 + 24 新增）、`npm run check` exit 0、web/dist 同 commit 重建）。
> 需求原文：`changes/2026-09-30-logview-filters/task-brief.md`；attempt 1（attempt_id ecd53601-dee9-48eb-86c7-01328c1175dd）。

## 1. 产出文件路径

| 产物 | 路径 |
|---|---|
| 本报告 | `wiki-steward/changes/2026-09-30-logview-filters/reports/task-impl-report.md` |
| 筛选模型纯模块（新） | `wiki-steward/web/src/lib/log-filter.js`（57 行） |
| lib 筛选扩参 | `wiki-steward/lib/ingest-log.js` / `wiki-steward/lib/ingest-routes.js` |
| 展示/容器 | `wiki-steward/web/src/components/IngestLogPanel.vue`（97 行）/ `LogHistoryView.vue`（51 行） |
| 样式/客户端 | `wiki-steward/web/src/styles.css` / `web/src/api.js` / `web/src/lib/log-view.js` |
| 构建物（同 commit 重建） | `wiki-steward/web/dist/panel.js` / `web/dist/style.css` |
| 测试 | `wiki-steward/test/log-filter.test.mjs`（新）/ `test/ingest-log.test.mjs`（增量）/ `test/ingest-routes.test.mjs`（增量） |

## 2. 改动 文件:行号（本轮 diff）

- `lib/ingest-log.js:166-224` 新增 `applyLogFilters`(:171)/`normalizeDateKey`(:185)/`parseLogFilters`(:202)；`tailSlice`(:226) 增 `filters` 参——先过滤后锚点切片（`:228` visible），hasMore/cursor/锚点语义在过滤集上保持
- `lib/ingest-routes.js:17` import；`logsGet`(:199-207)：since/until/type 扩参解析(:203)、非法=400 bad_request、过滤切片(:206)；响应形零变化
- `web/src/lib/log-view.js:34-42` 新增 `toDisplayOrder`（时间倒序展示序=存储升序逆序视图，纯函数）
- `web/src/lib/log-filter.js:1-57`（新）`defaultFilters`/`typeSelection`/`toggleType`/`setDate`/`filtersActive`/`toQuery`/`emptyStateMessage`
- `web/src/api.js:19-31` `fetchLogs(limit, cursor, filters)` 第三参透传 since/until/type（缺省不发=现状行为；空串如实透传）
- `web/src/components/IngestLogPanel.vue:1-97` 筛选条（起止日期 input + 三来源多选 checkbox，来源清单=meta.sources）、倒序展示(:19)、空态三分文案、区间倒置提示
- `web/src/components/LogHistoryView.vue:1-51` 持 filters；reload/loadOlder 同参下传（翻旧后过滤仍生效）；筛选变更=游标重置重取最新页
- `web/src/styles.css:176-211` 筛选条/日期输入样式（dsh token 唯一色板，零硬编码色值）
- `web/dist/panel.js`、`web/dist/style.css`：`npm run build`（vite 8.3.1）同批重建

## 3. 测试计数

- 基线 387 断言**零回退零修订**（既有测试文件仅追加：`test/ingest-log.test.mjs` 顶部 import 加 3 个导出名 + 尾部追加；`test/ingest-routes.test.mjs` 仅尾部追加；`test/web-panel.test.mjs` 等零改动）——「修订逐条注明理由」= **零修订，不适用**
- 新增 24 断言锁三能力：`test/log-filter.test.mjs` 13（筛选模型+能力①②③组合锁）、`test/ingest-log.test.mjs` +7（归一/解析/过滤切片/翻旧同参/空集）、`test/ingest-routes.test.mjs` +4（integration 形真 handler）
- `node --test`：**411/411 pass**（387+24）；`npm run check`：**exit 0**（node --check 全 lib + node --test）

## 4. 验收逐条证据

1. **默认时间倒序，翻旧追加于下方（去重/闸门保持）**：`toDisplayOrder`（log-view.js:40）=存储升序逆序（数据面 log-history 状态机零改动）；锁=log-filter.test.mjs「能力① toDisplayOrder」「能力① 组合：打开=最新页在上；『加载更早』旧块追加于下方（prependChunk 去重 + hasMore 闸门保持）」（含锚点重复行去重、`canLoadOlder` 闸门、零重复键断言）；组件接线 IngestLogPanel.vue:19 `groupBySource(toDisplayOrder(props.lines))`
2. **时间筛选 + 翻旧联动**：ingest-log.test.mjs「tailSlice+filters：过滤后再切片」「翻旧（cursor）后过滤仍生效——各页同参、锚点在过滤集内、不重不漏」（三页拼接=过滤集完整 ['alert-old','in1'..'in4']，区间外零条目）；ingest-routes.test.mjs「缺省（不带筛选参）= 现状行为（向后兼容）；翻旧 cursor 同参过滤仍生效」（p1 ['in2','in3']→p2 ['in1']，out1/scan1 不入）；UI 同参=LogHistoryView.vue loadOlder(:26) 与 reload(:17) 均传 `toQuery(filters.value)`
3. **类型筛选（三来源多选、可与时间叠加）**：log-filter.test.mjs「toggleType：去选/加选往返；全选自动归一」「可全不选」「toQuery：三能力叠加=since+until+type 同时发」；ingest-routes.test.mjs「type 多选=来源并集」（['in1','scan1']）+「since/until/type 组合——仅区间内+选中来源」（逐行断言 dateKey/source）；ingest-log.test.mjs「applyLogFilters …时间+类型叠加」
4. **空结果态如实、交互无报错、弹层开合干净**：log-filter.test.mjs「emptyStateMessage：三态如实」（全不选/有筛选无匹配/无筛选无记录各说各话）+「toggleType：可全不选——如实空选」；ingest-log.test.mjs「过滤集为空 = 空页 hasMore=false（如实空，不伪造）」；ingest-routes.test.mjs「type=（全不选）→ 空页如实不伪造」；筛选交互=纯函数 emit 上交（无副作用）；弹层开合=client.js 零改动，既有「历史弹层：挂载…关闭=unmount+清空」「F2 历史弹层=原生 Modal…开合/挂载行为面零变化」（client-face.test.mjs:339/:864）保持全绿；筛选态随组件生命周期**弹层重开=重置为缺省**（brief 允许任选，此处注明）；区间倒置=如实提示「当前时间区间为空」（IngestLogPanel.vue rangeEmpty）
5. **契约零变化、API 扩参向后兼容**：响应形锁=ingest-routes.test.mjs「Object.keys(data).sort() === ['cursor','hasMore','lines','sources']」；缺省对照=同测试「缺省不过滤=现状行为 ['out1','in1','in2','in3','scan1']」；`parseLogFilters` 缺席/空串→{since:null,until:null,types:null}（=不过滤）；非法参不静默放宽=400 bad_request 如实（「非法日期/未知来源 = 400」）
6. **387 零回退 + 新增锁三能力 + 全绿**：见 §3（411/411；既有断言零修订）
7. **组件 ≤300 行 / 逻辑纯模块 / dsh token 唯一色板 / dist 同 commit**：IngestLogPanel.vue 97 行、LogHistoryView.vue 51 行；逻辑全在 `web/src/lib/log-filter.js`（57 行纯函数）与 `log-view.js`/`log-history.js`；styles.css 新增块（:176-211）全 var(--dsw-alias-*/--dsw-radius-*)——既有「dsh token 唯一色板（零硬编码色值）」断言（web-panel.test.mjs）保持全绿；`npm run build` 重建 dist（dist 内含新筛选面字节：panel.js 含「起始日期」「未选任何来源类型…」），`test/dist-browser-load.test.mjs` 4/4 绿（真浏览器语义模拟加载重建物）；dist 新鲜度锁（check-release.sh commit 级）：本 commit 同含 web/src ×6 + web/dist ×2

## 5. 决定记录（口径）

- **时间筛选粒度=日（dateKey YYYYMMDD）**：三来源行只含日期键（告警行内有 HH:MM:SS 但证据口径仅取日期；cron 行无行内时刻）——按 brief「禁编造」红线不造时刻，UI 注记「时间筛选按日粒度」；since/until 闭区间
- **扩参命名**：since / until / type（type=来源 id 逗串；`type=` 显式全不选=空页，与缺省缺席可区分）；非法日期/未知来源=400（不静默放宽筛选面）
- **全不选语义**：三来源可全不选→如实空页+「未选任何来源类型」文案（brief 明示可全选/全不选）
- **翻旧（加载更早）**：闸门仍=hasMore（过滤集口径）；同参翻旧，页序展示恒倒序（最新在上、旧块落下方）
- **未做（按范围红线）**：不动 kb-context/obsidian-web/生产配置；无版本 bump/CHANGELOG/tag——发版 tag 留用户逐次确认
