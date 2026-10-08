# Phase 0 侦察报告 — wiki-steward web/设置面板挂载机制与前后端契约

> 卡片：Phase 0 只读侦察（第 2/3 卡：改动面评估）｜日期 2026-10-07
> 范围：`/opt/workdata/dsh-plugins/wiki-steward`（package.json / cordis.patch.yml / lib/ / web/ / test/）
> 红线遵守：**全程只读**，未修改任何被测文件；唯一写侧动作 = 创建本变更目录与本文件。
> 证据标记：【读码】=读源码确认；【实测】=执行 git/命令验证；【推断】=无直接证据的推断（明示）

---

## 0. 结论摘要 —— 新增一组「Hindsight 记忆同步」页签的改动清单

### 0.1 最重要的一条（先看这个）

**wiki-steward 当前在 dsh 设置页里没有「页签组」概念，只有一个设置节栏目。**

现有 `lib/client.js` **只注册一个** `settings.section` 槽位（`lib/client.js:518-523`），注册进来的是单个 React 无 JSX 组件 `WikiStewardSettingsSection`（`lib/client.js:213-384`）。所谓「页签（IngestSettingsPanel / IngestTriggerPanel / IngestLogPanel）」是 **`web/` Vue 面板内部的 section 组件**，只在「查看历史记录」弹层里以 `view:'log'` 形态出现，**不是设置导航里的页签**。

因此「新增一组 Hindsight 记忆同步页签」有两种截然不同的落地路径，**改动面差一个数量级**，必须先裁定：

| 方案 | 形态 | 涉及文件 | 需重建 dist | 建议 |
|---|---|---|---|---|
| **A. 扩现有设置节**（推荐） | 在 `WikiStewardSettingsSection` 内加 Hindsight 子区块 + `EDITABLE_FIELDS` 加行（`lib/client.js`） | `lib/client.js`、`lib/settings-write.js`、`lib/index.js`、`cordis.patch.yml`、4 个 test | ❌ 不需要 | 与现有 wiki-steward 形态一致（kb-context 同款零构建 React），与新配置项同源走 configEditor；不触碰 dist 面。手动同步按钮 = 复制现有 `WikiStewardManualActions` 形态（已验证可做） |
| **B. 独立设置节** | 再注册一个 `settings.section`（id 不同）或 `settings.plugins.tab` | 同 A + 新注册 + 可能动 `order` | ❌ 不需要 | 会让 wiki-steward 在设置导航里出现两行；且 `test/client-face.test.mjs:251` **硬钉「注册面=仅 settings.section」**、`names` 换成数组 exclusions：会红，需被裁定为「断言修订」 |
| **C. 走 Vue 面板新页签** | `web/src/components/HindsightSyncPanel.vue` + `App.vue` 挂载位 | web/src/** + **必须 `pnpm build` 重建 dist 并入库** | ✅ 需要 | 「同步日历」这类重交互 UI 适合此路；但引入 dist 面风险（见 §4/§5.2），且新增后 dist 陈旧被 `ingest-routes.test.mjs:362` 用真 dist 字节比对盯住 |

**建议选 A（扩节）作为主干**；若「同步日历」确需复杂网格 UI，则 A 打底 + C 承载日历这一个复杂件（混合），并在 Phase 1 明确写进 US。

### 0.2 落地清单（以方案 A「扩现有设置节 + 新增后端端点」为准）

**最小必改 5 个源文件：**

| # | 文件 | 改动 | 依据 |
|---|---|---|---|
| 1 | `lib/client.js` | `EDITABLE_FIELDS`（:65-73）加新行 + Hindsight 子区块组件 + 新 API URL 常量（:42-46 区） + 动作按钮 | 【读码】现有 `ingest.schedule` 两项就是照这个模式加的（见 :71-72 的 EDITABLE_FIELDS 条目 + :651/:700 的定时控制测试） |
| 2 | `lib/index.js` | `Config`（:50-82）加 `hindsight: z.object({...}).prefault({})`（嵌套对象必须用 `.prefault({})`，**不能用 `.default({})`**） | 【读码】`lib/index.js:49` 明写 zod v4 实测 `.default({})` 短路不填内层默认 |
| 3 | `lib/settings-write.js` | `EDITABLE_PATHS`（:11-19）加叶子路径 | 【读码】白名单双侧：服务端权威 + client.js 副本 |
| 4 | `lib/ingest-routes.js` | `handler`（:275-287）加 `if (p === \`${API_PREFIX}/hindsight/xxx\`)` 分发 + 新 handler（每个首行过 `authGate`） | 【读码】现有分发就是这个梯形结构 |
| 5 | `cordis.patch.yml` | config 整行替换语义 → 新键必须有默认值，否则 Profile 覆盖重述时丢 | 【读码】`cordis.patch.yml:3` 明文「整行替换（非深度合并）」 |

**必红测试 5 个（断言 Exact 全键/白名单/请勿期待意外飘绿）：**

| test 文件:行 | 断言内容 | 为何红 |
|---|---|---|
| `test/load.test.mjs:29-49` | `assert.deepEqual(Config.parse({}), expected)` 顶层键集精确相等（含 `assert.deepEqual(Config.parse(undefined), expected)`） | 新增顶层 `hindsight` 键 → expected 少/多键 → **必红**。这是当前 skew 面唯一堵点：`ingest` 键当年就是这样显式「断言修订」加的（:39-42 留了修订理由注释，可作为本波模板） |
| `test/settings-write.test.mjs:13-25` | `assert.deepEqual(EDITABLE_PATHS.map(p=>p.join('.')), [7 条精确列表])` | 加白名单叶子 → 列表变 → **必红**（同文件 :13 标题就写「7 叶子」） |
| `test/ingest-routes.test.mjs:249` | `assert.deepEqual(data.editable.map(p=>p.join('.')), [同上 7 条])` | GET settings 回显的 editable 清单精确相等 → **必红** |
| `test/client-face.test.mjs:761` 样式面断言 | `SETTINGS_CSS` 零硬编码色值/零暗色分支 | 新增 UI 若引入 hex/rgb/hsl 或 `prefers-color-scheme` → **必红**（`web/src/styles.css` 同款锁在 `test/web-panel.test.mjs:239-244`） |
| `test/dist-browser-load.test.mjs:62/80/100` | dist 零 Node 全局残留 + 无 process 真加载 | 走方案 C 且 **忘了 `pnpm build`** → dist 陈旧：不一定红（旧 dist 本来过锁），但 `ingest-routes.test.mjs:362` 真 dist 字节比对仍在，功能面零生效 = 假绿陷阱。另：新依赖若引入 `process.*`/`Buffer.*` → **必红** |

**必做收尾：**`pnpm build` 重建 `web/dist`（仅方案 C 时）→ **`git add wiki-steward/web/dist`**（dist 是 git 跟踪的，`.gitignore` 未排除，见 §4.2 实测）→ `node --test` 全绿 → `bash scripts/check-release.sh wiki-steward`。

---

## 1. 面板如何挂进 dsh 设置页（Question 1）

### 1.1 三条接缝，各司其职（结论在前）

| 面 | 机制 | 声明位置 |
|---|---|---|
| **入口（被宿主发现）** | `package.json` `dsh.client{platform:'web', inject:[…]}` + `exports['./client']` | `package.json:44-52`（inject 列 4 个 `@deepseek-ai/*` 包）+ `package.json:7-11`（`"./client": "./lib/client.js"`） |
| **UI 挂载（在哪显示）** | `lib/client.js` 工厂形 bundle → `ctx.slots.inject('settings.section', …)` → `ctx.slots.register(decl, Component)` | **不是 cordis.patch.yml**。`cordis.patch.yml` 只喂后端 config，**不含任何 UI/页签声明** |
| **数据面（读写走哪）** | `lib/ingest-routes.js` 单 prefix 注册 `ctx.webServer.register({kind:'prefix', path:'/api/wiki-steward'})` | `lib/ingest-routes.js:288` |

### 1.2 页签标题/图标/入口组件的声明处原文

**① 入口与 inject 声明 — `package.json:44-52`：**

```json
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    },
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-renderer",
        "@deepseek-ai/dsh-client-ui-layout",
        "@deepseek-ai/dsh-client-ui-primitives"
      ]
    }
  },
```

> 【读码】inject 四个包里「先 materialize 才能 `require`」的语义见 `lib/client.js:36-39`：包须列进 `dsh.client.inject` 才会进 require 表。

**② setting.section 注册（title/label/order/入口组件都在这里）— `lib/client.js:516-528`：**

```js
      try {
        // ① 设置菜单（dsh-better-sidebar 路线）：navLabel 自动进设置页；历史入口在节内
        disposers.push(safeRegister('settings.section', {
          name: 'settings.section',
          id: 'wiki-steward',
          order: 30,
          label: function label() { return 'wiki-steward' },
        }, WikiStewardSettingsSection))
      } catch (e) {
```

- **标题**：`label` thunk 返回 `'wiki-steward'`（**无独立标题硬编码在别处**；设置导航行文案就是它）
- **图标**：**无**。`lib/client.js:497` 注释明写：`sidebar.panellist` 行 + `main` 槽页已随「面板搬家」移除；`test/client-face.test.mjs:261` 进一步钉住源码不得含 `WikiStewardPanelIcon`（旧 glyph 组件）。**当前设置节无图标契约。**
- **入口组件**：`WikiStewardSettingsSection`（`lib/client.js:213` 起定义）

**③ 组件树的实际结构 — `lib/client.js:359-383`（节容器根）：**

```js
      return react.createElement('div', { className: 'wiki-steward-settings', 'data-dsh-plugin': 'wiki-steward' },
        react.createElement('h3', { className: 'wiki-steward-settings-title' }, 'wiki-steward · 设置'),
        react.createElement('p', { className: 'wiki-steward-settings-intro' }, '可改项即时热生效（写路径=官方路由面 api/wiki-steward/settings → configEditor 持久化缝）；只读项语义勿动。'),
        react.createElement(WikiStewardHistoryEntry, { open: state.historyOpen === true, onToggle: toggleHistory }),
        react.createElement(WikiStewardManualActions, { ... }),
        react.createElement('div', { className: 'wiki-steward-settings-rows' }, rows),
        ...
```

### 1.3 「现有几个页签、各自叫什么」——**答案可能会让计划改写**

需要区分两个层次，这个区分是本报告最有价值的发现之一：

**(a) dsh 设置导航层：只有 1 个，叫「wiki-steward」**
- 【读码 + 实测】`test/client-face.test.mjs:256-257` 断言 `injected` 与 `registered` **恰等于 `['settings.section']`**；
- `test/client-face.test.mjs:251` 标题：「注册面=仅 settings.section（断言修订：sidebar.panellist/main 双面移除——用户诉求=不显示在 dsh 首页）」
- `test/client-face.test.mjs:253-257` 正文明令 **禁 `settings.plugins.tab`**：`for (const r of registered) assert.notEqual(r.decl.name, 'settings.plugins.tab', '自造页签已弃（菜单页签不对的根因）')`

> ⚠️ **对本需求的直接影响**：`lib/client.js:24` 注释「弃自造 `settings.plugins.tab` 页签」—— 这个插件历史上试过自造页签，**失败了**（注释称其是「旧 404 面」）。若要给 Hindsight 单开一个设置导航页签，走 `settings.plugins.tab` 是撞已知南墙；唯一干净走法是再注册一个 `settings.section`（不同 id），但会红 `test/client-face.test.mjs:251`。**建议改为节内子区块。**

**(b) Vue 面板内部（web/dist，只在「查看历史记录」弹层的 `view:'log'` 形态，以及历史 `view:'full'` 形态里有）**
- `IngestTriggerPanel` 「手动触发 ingest」（`web/src/components/IngestTriggerPanel.vue:20` `aria-label="手动触发 ingest"`，`:21` 标题 `手动触发 ingest`）
- `IngestLogPanel` 「ingest 日志」（`IngestLogPanel.vue:33-34`）
- `IngestSettingsPanel` 「相关设置（只读展示）」（`IngestSettingsPanel.vue:18`）
- 组装顺序见 `web/src/App.vue:56-65`（`ws-root` 容器内竖向排列）

> 【实测】`view:'full'` 全量面板（`App.vue`）目前**在运行时无人消费** —— `lib/client.js:471` 挂载历史弹层时**硬传 `view: 'log'`**，即 `resolveView` 永远得到 `'log'`，`App.vue`（含 IngestSettingsPanel / IngestTriggerPanel 两 section）在生产路径上不被挂载。`view-model.js:5` 保留 full 分支是为向后兼容。这是「新增页签组」时可以利用的空位，也是容易误判的点。

### 1.4 明确回答「client.js 调哪个 API 注册页签」

【读码】**既不是 HTTP 请求，也不是 cordis.patch.yml 配置，而是浏览器侧 cordis 槽位 API：**

```js
// lib/client.js:504-515（safeRegister 定义）
      function safeRegister(slotName, decl, component) {
        return slots.inject(slotName, function setup() {
          try {
            return slots.register(decl, component)
          } catch (e) { ... warn ... ; return function noop() {} }
        })
      }
```

链路：`window.__ModuleLoader__.load({id:'wiki-steward', factory})`（`lib/client.js:30-32`）→ `exports.inject = ['slots']`（`lib/client.js:539`）→ `exports.apply = apply`（`lib/client.js:540`）→ 宿主注入 `slots` → `apply(ctx)` 里 `safeRegister('settings.section', …)`。

旁证【读码】：`dsh-github-ops/lib/client.js:6-6` 注释「设置菜单栏目… slots.inject 即探测（宿主未声明该槽…）」；`dsh-github-ops/changes/20260929-phase0/reports/settings-integration-research.md:12` 结论行第一条明写：「**设置栏目不是 HTTP 挂载出来的，是浏览器槽位注册出来的**」。

### 1.5 cordis.patch.yml 的角色（明确「不放 UI」）

【读码】全文 23 行，只有 `- insert: [{id:'wiki-steward', name:'wiki-steward', config:{…}}]`：vaultRoot / capture{bufferRounds,enabled} / write{readOnly} / queue{maxRetries,ttlDays} / secrets{enabled}。**无任何 slot/UI/label/order 键。**

⚠️ 但有一条对新增配置项是硬约束（`cordis.patch.yml:3`）：

```
# ⚠️ config 是整行替换语义（非深度合并）：profile 覆盖者必须在此基础上重述全部键。
```

即：新增 `hindsight.*` 键后，**生产 profile 若做了 config 覆盖，必须人工把所有旧键重述一遍**，否则覆盖层整行替换会把旧键打掉。这是发布 checklist 的必记项。

---

## 2. 前端结构（Question 2）

### 2.1 行数实测（AGENTS.md「组件 ≤300 行」合规）

【实测】`wc -l`：

| 文件 | 行数 | ≤300 |
|---|---|---|
| `web/src/App.vue` | 66 | ✅ |
| `web/src/api.js` | 34 | — |
| `web/src/panel.js` | 35 | — |
| `web/src/components/IngestLogPanel.vue` | 97 | ✅ |
| `web/src/components/IngestSettingsPanel.vue` | 34 | ✅ |
| `web/src/components/IngestTriggerPanel.vue` | 46 | ✅ |
| `web/src/components/LogHistoryView.vue` | 51 | ✅ |
| `web/src/lib/log-filter.js` | 57 | — |
| `web/src/lib/log-history.js` | 50 | — |
| `web/src/lib/log-view.js` | 50 | — |
| `web/src/lib/settings-model.js` | 34 | — |
| `web/src/lib/trigger-model.js` | 57 | — |
| `web/src/lib/view-model.js` | 6 | — |
| `web/src/styles.css` | 209 | — |

**全部远低于 300 行上限**（最大 97）。新增组件有充足预算；按同款纪律，逻辑应落 `web/src/lib/*.js` 纯模块（可 `node --test` 直测）。

### 2.2 依赖图（文本）

```
                         宿主 lib/client.js (零构建 React bundle)
                                  │  exports.__panelLoader('api/wiki-steward/panel.js')
                                  │  mount(el, {apiBase:'api/wiki-steward', view:'log'})
                                  ▼
                       web/src/panel.js  (mount/unmount 契约)
                          │                       │
        resolveView(view)==='log' ? 真 : 假        createApi('api/wiki-steward')
                          │                       │
              ┌───────────┴───────┐               │
              ▼                   ▼               │
   components/LogHistoryView.vue      App.vue  ────┤
              │                       │           │
              │ 子                    子（3 个）     │
              ▼                       ├─→ components/IngestTriggerPanel.vue
   components/IngestLogPanel.vue      │        └─→ lib/trigger-model.js
              │                       ├─→ components/LogHistoryView.vue（复用）
       ┌──────┴──────┐                └─→ components/IngestSettingsPanel.vue
       ▼             ▼                                    └─→ lib/settings-model.js
 lib/log-filter.js  lib/log-view.js
       ▲             ▲
       └─────┬───────┘
             │ import { prependChunk } from './log-view.js'
       lib/log-history.js ────────────────┘
```

**精确的模块依赖（全部 `import` 语句实测）：**

| From | imports To |
|---|---|
| `web/src/panel.js:5-10` | vue, `styles.css`, `App.vue`, `components/LogHistoryView.vue`, `api.js`, `lib/view-model.js` |
| `web/src/App.vue:5-9` | vue, `IngestTriggerPanel.vue`, `LogHistoryView.vue`, `IngestSettingsPanel.vue`, `lib/trigger-model.js` |
| `components/LogHistoryView.vue:6-9` | vue, `IngestLogPanel.vue`, `lib/log-history.js`, `lib/log-filter.js` |
| `components/IngestLogPanel.vue:6-8` | vue, `lib/log-view.js`, `lib/log-filter.js` |
| `components/IngestSettingsPanel.vue:5-6` | vue, `lib/settings-model.js` |
| `components/IngestTriggerPanel.vue:5` | vue（**零 lib 依赖**：纯展示，状态从 props 来） |
| `lib/log-history.js:4` | `lib/log-view.js`（`prependChunk` 一个函数） |
| `lib/log-filter.js` / `lib/log-view.js` / `lib/settings-model.js` / `lib/trigger-model.js` / `lib/view-model.js` | **零依赖纯模块** |

**关键结构特征：【读码】依赖图是 DAG 无环，`lib/*` 六模块互不依赖（唯一跨依赖 = log-history → log-view 的 `prependChunk`）；`.vue` 之间只有「父→子」单向，无子到父、无兄弟互引。** 新增 Hindsight 组件只要仿照 `LogHistoryView → IngestLogPanel + lib/xxx-model.js` 这个三角，就不会引入环。

### 2.3 六个 lib 模块职责（一句话）

| 模块 | 职责 | 导出给 UI 的面 |
|---|---|---|
| `log-view.js` | 日志**视图**模型：连续同来源段分组、锚点键去重、时间倒序、来源短角标 | `groupBySource` / `prependChunk` / `lineKey` / `toDisplayOrder` / `shortTag` |
| `log-history.js` | 历史数据面**状态机**：尾部 N 行 + 游标滚动加载 + 错误留痕 + stale 归一 | `PAGE_SIZE=200` / `initialHistory` / `applyLatest` / `applyOlder` / `applyError` / `canLoadOlder` |
| `log-filter.js` | 筛选**模型**：默认态/类型多选开关/日期置位/查询串投影/空态文案三分 | `defaultFilters` / `typeSelection` / `toggleType` / `setDate` / `filtersActive` / `toQuery` / `emptyStateMessage` |
| `trigger-model.js` | 双动作**触发状态机**：scan/distill 的 running→done\|error\|skipped 与文案 | `TRIGGERS` / `initialTriggerState` / `beginTrigger` / `finishTrigger` |
| `settings-model.js` | Config 面**只读展示**投影：`settingsGroups(data) → [{title, rows:[{key,value,note,editable}]}]` | `settingsGroups` |
| `view-model.js` | 挂载视图选择：`resolveView(view) → 'log'\|'full'` | `resolveView` |

> 【读码】`settings-model.js:2` 明写「本波可改项最小集 = ∅（用户需求是"查看"；改 config=走 cordis config 热改语义，不在本面板）」—— **Vue 面板侧刻意不做写操作**。所有可改落在零构建 React 设置节（`lib/client.js`）。这印证 §0.1 建议：**Hindsight 的「同步时间/启停」这类可改项应按现有纪律走 client.js 的 `EDITABLE_FIELDS`，而不是塞进 Vue 面板。**

---

## 3. 前后端契约（Question 3）

### 3.1 前端怎么请求后端

【读码】**两条独立路径，不共享封装：**

**路径 1 — 零构建 React 设置节（`lib/client.js`）：手写 fetch，无封装**

```js
// lib/client.js:42-46
    var PANEL_URL = 'api/wiki-steward/panel.js'
    var SETTINGS_URL = 'api/wiki-steward/settings'
    var INGEST_SCAN_URL = 'api/wiki-steward/ingest/scan'
    var INGEST_DISTILL_URL = 'api/wiki-steward/ingest/distill'
    var API_BASE = 'api/wiki-steward'
```

```js
// lib/client.js:59-62（__fetch 是可注入测试缝）
    exports.__fetch = function doFetch(url, init) {
      return fetch(url, init)
    }
```

> ⚠️ **回答提问里的一个前提更正**：实际是**文档相对 `api/wiki-steward/…`（无前导斜杠）**，不是 `/api/wiki-steward/…`。原因见 `lib/client.js:8-9`：站内绝对 `/…` 会逃出 `<base href="./">` 前缀 = 生产 404 根因（教训来自 skill-explorer issue #1707）。`test/client-face.test.mjs:228-247` 有一条专项回归锁钉住：「源码无站内绝对 /wiki-steward/*，面板 URL=api/wiki-steward/panel.js」，且用 `stripComments` 排除注释后再 `assert.ok(!code.includes("'/wiki-steward"))`。**新增端点必须在 client.js 里写成 `'api/wiki-steward/hindsight/xxx'` 形式，带前导斜杠必红。**

**路径 2 — Vue 面板（`web/src/api.js`）：有薄封装 `createApi(base)`**

```js
// web/src/api.js:15-33
export function createApi(base) {
  return {
    fetchSettings: () => requestJson(`${base}/ingest/settings`),
    fetchLogs: (limit, cursor, filters) => { ... },
    scan: () => requestJson(`${base}/ingest/scan`, { method: 'POST' }),
    distill: () => requestJson(`${base}/ingest/distill`, { method: 'POST' }),
  }
}
```

base 由 `panel.js:25` 传入：`deps.apiBase ?? '/wiki-steward/api'`；实际由 client.js 挂载时给 `apiBase: API_BASE`（=`'api/wiki-steward'`，见 `lib/client.js:471`）。

> ⚠️ **口径不一致（潜在风险点，见 §6）**：`web/src/panel.js:25` 的默认兜底值是 `'/wiki-steward/api'`（**带前导斜杠 + 路径次序不同**），这与实际运行 inflow 的 `'api/wiki-steward'` 不一致。生产路径上恒定由 client.js 传入真值因此不发作，但：**若任何新调用方直接 `mount(el)` 而不传 apiBase，会打到 `/wiki-steward/api/…`（404 面）**。这是现存不一致，不是本需求引入的，但复用 panel.js 挂载 Hindsight 视图时会踩。

**统一响应契约**：成功 `{data}`；失败 `{error:{code,message}}`（`lib/ingest-routes.js:10` 头注 + `web/src/api.js:1-13` `requestJson` 实现）。

### 3.2 primitives 如何引入 & 用了哪些组件

**引入方式（三重声明，缺一不可）：**

1. `package.json:28` `peerDependencies: {"@deepseek-ai/dsh-client-ui-primitives": ">=0.2.0-rc.1"}`
2. `package.json:33` `devDependencies` 里 `link:` 指向宿主 `node_modules` 实体（供独立 `node --test`）
3. `package.json:46-51` `dsh.client.inject` 含该包 → 宿主 `makeRequire` 先 materialize

```js
// lib/client.js:39
    var ui = require('@deepseek-ai/dsh-client-ui-primitives')
```

> 【读码】`lib/client.js:36-39` 注释：「包须列进 package.json dsh.client.inject 才会先行 materialize 供本工厂同步 require；peer+dev 双声明（宿主拦截层供给 + 独立测试面）」。AGENTS.md「仅 `@deepseek-ai/*` 共享包走 peer+dev 双声明」的机制真相（peer 不代装）与之同源。

**实际使用的组件（四处，`test/client-face.test.mjs:750-759` 有专项断言逐个钉住）：**

| 组件 | 用在哪 | 代码位置 |
|---|---|---|
| `ui.Switch` | 布尔行（内联在 rowHead） | `lib/client.js:153-159` |
| `ui.Input` | `type:'number'`（数值行）/ `type:'time'`（时间行） | `lib/client.js:161-178` |
| `ui.Button` | 保存（primary/md）、手动动作×2（outline/md）、历史入口（outline/md） | `lib/client.js:371-378`、`:398-413`、`:434-441` |
| `ui.Modal` | 历史记录弹层（open/onClose/title/closeLabel） | `lib/client.js:443-448` |

> 【读码】`for (const comp of ['Switch','Button','Input','Modal']) assert.match(source, new RegExp('ui\\.'+comp+'\\b'))`（`client-face.test.mjs:757-759`）——这四个组件的 `ui.` 引用被硬钉，重构时删掉任一个 `ui.X` 字面量就红。

**⚠️ 「同步日历」要注意**：现有 primitives 只用到 Switch/Input/Button/Modal 四个，**没有日历/日期网格组件**。「同步日历」若要用原生 `<input type="date">`（像 `IngestLogPanel.vue:43` 那样）还算轻；若要月历网格，primitives 未见提供，须**先确认包里有 `DatePicker`/`Calendar` 导出**——本报告未验证 primitives 包导出面（属未决问题 Q3）。按 AGENTS.md UI 约定，复杂交互才可引 element-plus 且须按需装配 + 独立 vendor chunk + 样式桥接 dsh token。

### 3.3 后端路由全清单（`lib/ingest-routes.js`）

【读码】单 prefix 注册（`lib/ingest-routes.js:288`：`register({kind:'prefix', path: API_PREFIX, handler})`），`API_PREFIX = '/api/wiki-steward'`（`:20`）。分发梯形在 `:275-287`：

| 方法 | 路径 | handler | 100% 源自 |
|---|---|---|---|
| GET | `/api/wiki-steward/settings` | `settingsGet` (`:154`) | Config 面 + `readOnly` + `editable` 清单 + `writable` |
| POST | `/api/wiki-steward/settings` | `settingsPost` (`:174`) | `{patch}` → `applyPatch` → configEditor |
| GET | `/api/wiki-steward/ingest/logs` | `logsGet` (`:199`) | `readMergedLog`+`tailSlice`（支持 limit/cursor/since/until/type） |
| GET | `/api/wiki-steward/ingest/settings` | `ingestSettingsGet` (`:219`) | Config + 通道状态 + sources（**Vue 面板消费**） |
| POST | `/api/wiki-steward/ingest/scan` | `scanPost` (`:247`) | `trigger.scan()` |
| POST | `/api/wiki-steward/ingest/distill` | `distillPost` (`:260`) | `trigger.distill()` |
| GET | **其余** `/api/wiki-steward/*` | `statics` (`:95`) | `web/dist` 静态面（realpath 围栏，穿越/越界不 200） |

**每条 handler 的强制骨架（新增端点必须照抄，否则测试 + 安全面双失）：**

```js
  const xxxGet = async (req, res) => {
    if (!authGate(connection, req, res)) return        // ← 第一行，必过鉴权缝
    if (!methodGuard(req, res, ['GET'])) return        // ← 第二行，方法守卫（不符回 405 + allow 头）
    try {
      ...
      sendJson(res, 200, { data: {...} })
    } catch (e) {
      warn(`[wiki-steward] ...失败：${e?.message ?? e}`)  // ← catch 必留痕（INV-15 禁静默）
      fail(res, 500, 'internal', String(e?.message ?? e))
    }
  }
```

依据：`lib/ingest-routes.js:45-51`（`authGate`：`connection.requestRejection({headers})`）、`:53-58`（`methodGuard`）、`:10-11` 头注。 **`test/ingest-routes.test.mjs:118-126` 对现有 6 条路径逐一跑「401/403 回拒 → `trigCalls.scan + trigCalls.distill === 0`（业务面绝不执行）」** —— 新增端点若漏了 `authGate`，这条新增不了的断言面上暂看不出，但会**实质引入未鉴权端点（安全缺陷）**，且 Phase 7 复审视察必 autoreject。

**请求体读取**：需 body 的用 `readJsonBody(req)`（`lib/ingest-routes.js:77-92`，上限 `MAX_BODY_BYTES = 1<<20`，畸形 = 400 `bad_request` 不静默当空）。

### 3.4 【回答问题 3 的核心】「新增一个后端端点 + 一个前端页签」完整改动清单

以下按「方案 A（扩节）+ 新增一个 hehindsight GET/POST 端点」给出，**精确到文件名**：

**A. 后端（3 文件）**

| 文件 | 具体行/位置 | 改动 |
|---|---|---|
| `lib/ingest-routes.js` | `:275-287` handler 梯形 | 加一行 `if (p === \`${API_PREFIX}/hindsight/status\`) return hindsightStatusGet(req, res)` |
| `lib/ingest-routes.js` | 新 handler 定义区（建议放 `distillPost` 后、`:274` 前） | 新增 `const hindsightStatusGet = async (req,res) => { if(!authGate(...))return; if(!methodGuard(...))return; try{...}catch(e){...} }` |
| `lib/index.js` | `:50-82` Config | 加 `hindsight: z.object({ enabled: z.boolean().default(false), time: z.string().regex(/^([01]\d\|2[0-3]):([0-5]\d)$/, '时间格式须为 HH:MM').default('00:30') }).prefault({})` **注意 `.prefault({})` 不是 `.default({})`** |
| `lib/settings-write.js` | `:11-19` EDITABLE_PATHS | 追加 `Object.freeze(['hindsight','enabled'])`、`Object.freeze(['hindsight','time'])` |

**B. 前端（1 文件 + 可选 web/）**

| 文件 | 位置 | 改动 |
|---|---|---|
| `lib/client.js` | `:42-46` URL 常量区 | 加 `var HINDSIGHT_STATUS_URL = 'api/wiki-steward/hindsight/status'`（**无前导斜杠**） |
| `lib/client.js` | `:65-73` `EDITABLE_FIELDS` | 加 `{ path:['hindsight','enabled'], kind:'boolean', label:'…', note:'…' }`、`{ path:['hindsight','time'], kind:'time', … }` |
| `lib/client.js` | 新增组件（建议仿 `WikiStewardManualActions` @ `:393-421`） | `function WikiStewardHindsightActions(props){…}` + 状态槽 `state.actions.hindsightSync`（改 `:214` 的 initial state） |
| `lib/client.js` | `:359-383` 根 return | 在 rows 前插入 `<WikiStewardHindsightActions …/>` |
| `lib/client.js` | `:104-123` SETTINGS_CSS | 仅当新增样式时；**必须用 `--dsw-alias-*` / `--dsw-radius-*` token，零 hex/rgb/hsl，零暗色分支** |

**C. 配置默认（1 文件）**

| 文件 | 位置 | 改动 |
|---|---|---|
| `cordis.patch.yml` | `:7` config 块 | 加 `hindsight: { enabled: false, time: '00:30' }`（**必须给默认**，整行替换语义下 profile 覆盖者要重述全键） |

**D. 测试（必须同步改，否则红）**

| 文件 | 位置 | 改动 |
|---|---|---|
| `test/load.test.mjs` | `:31-45` expected | 加 `hindsight: {...}` + **在注释里写「断言修订理由」**（照抄 `:39-42` 现有模板） |
| `test/settings-write.test.mjs` | `:13-25` EDITABLE_PATHS 列表 + 标题「7 叶子」 | 改列表 + 改数量表述 |
| `test/ingest-routes.test.mjs` | `:249` `data.editable` 列表 | 同上 |
| `test/ingest-routes.test.mjs` | `:120` 鉴权缝遍历数组 | 新端点加入，获 401/403 覆盖 |
| 新增测试（`test/hindsight-sync.test.mjs` 建议） | — | 端点 roundtrip + 白名单双侧 + client 面渲染 + 动作走通 |

**E. 仅方案 C（Vue 面板）才额外需要**

| 文件 | 改动 |
|---|---|
| `web/src/components/HindsightSyncPanel.vue`（新） | ≤300 行，纯展示 |
| `web/src/lib/hindsight-model.js`（新） | 纯函数逻辑，`test/web-panel.test.mjs` 直测 |
| `web/src/App.vue` 或 `panel.js` 的 `resolveView` 分支 | 挂进相应视图 / 加新 view 值（改 `web/src/lib/view-model.js` 后 `test/web-panel.test.mjs:219-224` 的 `resolveView` 断言要注意是否仍成立） |
| `web/src/api.js` | 加 `hindsightStatus: () => requestJson(\`${base}/hindsight/status\`)` |
| `web/src/styles.css` | 仅 token 化样式 |
| **`web/dist/panel.js` + `web/dist/style.css`** | **`pnpm build` 重建并 `git add`**（详见 §4） |

---

## 4. 构建与入库（Question 4）

### 4.1 构建命令与入口

【读码】`package.json:21-22`：

```json
    "build": "vite build --config web/vite.config.js",
    "dev": "vite --config web/vite.config.js"
```

【读码】`web/vite.config.js:19-35`：lib 形单入口 ES：

```js
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false, // 单 style.css（panel.js mount 时按 import.meta.url 就近注入）
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/panel.js', import.meta.url)),
      formats: ['es'],
      fileName: () => 'panel.js',
    },
    rollupOptions: { output: { assetFileNames: 'style.css' } },
  },
```

- **入口 = `web/src/panel.js`**、产物 = `web/dist/panel.js` + `web/dist/style.css`（assetFileNames 钉死避免 vite 默认 `<pkg>.css`）
- ⚠️ **一条不能动的 define**（`web/vite.config.js:16-18`）：`'process.env.NODE_ENV'` 必须替换为字面量。注释记载这是 T-F1 blocker 的修复：「宿主前端无 process 垫片 —— 浏览器 import() 模块求值即抛 ReferenceError: process is not defined」，由 `test/dist-browser-load.test.mjs` 锁死。

【实测】工具链在位：`ls -d node_modules/vite node_modules/@vitejs` → 两个目录均在；`node_modules/.bin/vite` 存在；`pnpm` / `npm` 均在 PATH（`/root/.nvm/versions/node/v24.14.1/bin/`）。

### 4.2 dist 是否 git 跟踪 —— **是，且 .gitignore 未排除**

【实测】

```
$ git ls-files wiki-steward/web/
wiki-steward/web/dist/panel.js          ← 已跟踪
wiki-steward/web/dist/style.css         ← 已跟踪
wiki-steward/web/src/App.vue
... (src 全部 17 个文件)

$ git check-ignore -v wiki-steward/web/dist/panel.js wiki-steward/web/dist/style.css
(not ignored)                            ← 未被排除
```

根 `.gitignore` 实际内容（【实测】）：`node_modules/` / `pnpm-lock.yaml` / `*.log` / `.testenv/` / `obsidian-web/test/.tmp-*/` / `dsh-login-gate/data/` / `kb-context/data/` / `wiki-steward/data/` / `.wt/` —— **无 `dist`、无 `web/dist` 规则**。插件自身无 `.gitignore`（`(none)`）。

`web/README.md:5` 的纪律与此一致：「构建物**入库随包分发**（git 快照安装代跑构建——禁安装期执行代码，dist 必须提交）」。

> ⚠️ **注意一处不一致**：`pnpm-lock.yaml` 被根 `.gitignore` 排除（未入库），但 `wiki-steward/pnpm-lock.yaml` 文件实体存在。这是既有状态，非本需求引入，仅记录。

### 4.3 dist 与 src 的时间戳对比（【实测】，用于判断当前是否陈旧）

```
2026-09-30 10:31:00 web/dist/panel.js        ← 产物
2026-09-30 10:31:00 web/dist/style.css       ← 产物
2026-09-30 10:30:10 web/src/components/IngestLogPanel.vue   ← 最新 src
2026-09-30 10:21:07 web/src/lib/log-view.js
2026-09-30 10:20:46 web/src/lib/log-filter.js
2026-09-30 10:30:27 web/src/components/LogHistoryView.vue
```

**结论：当前 dist 比所有 src 都新 → 无陈旧。** 但这正说明上波「改 src 后重建 dist」被执行过；**本波方案 C 若改 src，必须以 `pnpm build` 收尾并 `git add wiki-steward/web/dist`，否则「src 新 / dist 旧」= 功能不生效的假绿。**

---

## 5. 测试契约 —— 哪些测试会因新增而失败（Question 5）

### 5.0 基线实测

【实测】`cd wiki-steward && node --test` →

```
ℹ tests 415   ℹ pass 415   ℹ fail 0   ℹ cancelled 0   ℹ skipped 0   ℹ todo 0
ℹ duration_ms 16321.36619
```

**415/415 全绿**。所有「会因新增而红」的结论都基于这 415 条绿的基础上推演。

### 5.1 必红清单（逐条：测试名 + 断言内容 + 为什么会红）

| # | 文件:行 | 测试名 | 断言内容 | 为何必红 / 触发条件 |
|---|---|---|---|---|
| **1** | `test/load.test.mjs:29` | `Config 全键默认值与契约精确一致（delta-spec §2 整行 + T9 vaultRoot 补键）` | `assert.deepEqual(Config.parse({}), expected)`，expected = `{vaultRoot, capture, write, queue, secrets, ingest}` **精确相等**；另 `assert.deepEqual(Config.parse(undefined), expected)`、`:56-58` 多处 `assert.equal(c.queue.maxRetries, 3, '未触达键保持默认（字面锁定）')` | **新增 `hindsight` 顶层键 → deepEqual 立即失败。** 这是硬堵点，无法绕——只能按 `:39-42` 的先例做「断言修订」（当年 `ingest` 键就是这样加进去的，注释留了修订理由模板） |
| **2** | `test/settings-write.test.mjs:13` | `可改白名单契约：7 叶子（F3 扩 ingest.schedule 两项）；vaultRoot / write.readOnly 永不在列（INV-7 语义勿动）` | `assert.deepEqual(EDITABLE_PATHS.map(p=>p.join('.')), ['capture.enabled', …, 'ingest.schedule.time'])` **7 条精确列表**，外加 `for (const banned of [['vaultRoot'],['write','readOnly'],['write'],[]]) assert.equal(isEditablePath(banned), false)` | **新增白名单叶子 → 列表变 9 条 → 必红。** 标题里的「7 叶子」也需同步改述 |
| **3** | `test/ingest-routes.test.mjs:249` | `GET settings：Config 面 + 可改白名单 + writable 缺缝如实（false）` | `assert.deepEqual(data.editable.map(p=>p.join('.')), [同上 7 条])` + `assert.equal(data.writable, false)` | 同上，后端回显清单精确相等 → **必红** |
| **4** | `test/client-face.test.mjs:761` | `F2 样式面（§3.2）：dsh token 唯一色板（零硬编码色值/零暗色分支）+ … 幂等注入` | `SETTINGS_CSS` 串：禁 `#rrggbb` / `rgba?()` / `hsla?()` / `prefers-color-scheme\|data-ds-dark-theme`；且必须含 `typeof document !== 'undefined'` 守卫 | **新增 UI 若硬编码色值或加暗色分支 → 必红。** 只用 `--dsw-alias-*`/`--dsw-radius-*` token 则不红 |
| **5** | `test/web-panel.test.mjs:239` | `F2 styles.css：dsh token 唯一色板（零硬编码色值）——禁 hex/rgb/hsl，暗色随宿主别名适配` | 同第 4 条，但作用于 `web/src/styles.css` 文件实体 | 方案 C 改 `web/src/styles.css` 时同样适用 |
| **6** | `test/dist-browser-load.test.mjs:62` / `:80` / `:100` | ①②③ 三锁 | ① dist 零 `process.env.NODE_ENV`/`process.env` 字节；② 零 `process.*`/`require(`/`module.exports`/`__dirname`/`__filename`/`setImmediate`/`Buffer.*`/`global.` 正则命中；③ 无 process 子进程 `import(panel.js)` 退出码 0 + stdout 含 `WS_DIST_IMPORT_OK` | 方案 C：新代码若带入 Node API（如 `Buffer.from`、`process.cwd`）→ **必红**。另若**漏 build**，dist 虽仍过锁（旧产物本身合规），但**功能零生效 = 假绿陷阱**（这条不在测试红/绿面上，是只能靠人工 checklist 防的） |

### 5.2 「不一定红但极可能翻车」的次级考生

| # | 文件:行 | 测试名 | 风险 |
|---|---|---|---|
| **7** | `test/client-face.test.mjs:251` | `注册面=仅 settings.section（断言修订：sidebar.panellist/main 双面移除…）` | `assert.deepEqual(injected, ['settings.section'])` + `:253` `assert.notEqual(r.decl.name, 'settings.plugins.tab', '自造页签已弃（菜单页签不对的根因）')` → **方案 B 必红**（injected 变两个）。这也是「自造 settings.plugins.tab 页签」的历史否决点 |
| **8** | `test/client-face.test.mjs:810` | `F2 设置节 DOM 形（§3.2）：节容器 > 标题/引言 > rows 容器 > rowCard 每字段一卡` | `assert.ok(rows.length >= 3)`、**遍历每一行**都验 caché 必须有 `rowCard` / `rowName` / `wiki-steward-settings-field`；`:829` `assert.ok(noted >= 2)` | 新增 UI **必须复用同一套 className 骨架**；自造一套不同名的 div → 若它是 row **则必红**（遍历命中）；若插在 rows 容器之外则安全 |
| **9** | `test/client-face.test.mjs:833` | `F2 控件形（§3.2）：布尔=Switch 行内形、数字=number、时间=time…` | `rows.find(c => c.props.field.kind === 'time')` 等三类控件各就位 + `saveButton` 的 `data-ws-variant==='primary'`/`data-ws-size==='md'`/`disabled===false` | 新 kind 若不落在 boolean/number/time 之一，会走 `SettingsRow` 的 else 分支（只读 span）—— 需注意自己的控件类型是否被 `rows.find` 期望 |
| **10** | `test/client-face.test.mjs:651` / `:700` | `定时控制：时间输入（input[type=time]）+ 启用开关入设置节，双源提示文案如实入 UI` / `定时控制：改时间随保存走 {patch:{ingest:{schedule:{time}}}}（白名单双侧一致）` | 显式检查 `field.path` 形如 ingest.schedule.time、note 文案含「cron/flock/不太确定」，`data-ws-action` 语义锚 | Hindsight 的「时间调整/启停」应完全照这个模式做；若期望 test 覆盖新 selectors，**需新增测试**（既有测试不会自动覆盖） |
| **11** | `test/ingest-routes.test.mjs:118` | `鉴权缝：requestRejection 回拒 → 401/403 {error:{code}}，业务面绝不执行` | 遍历 `[['GET','/api/wiki-steward/ingest/logs'], …, ['POST','/api/wiki-steward/ingest/distill']]` 硬编码 6 条 → **新端点不在列 = 零鉴权覆盖（不断言就不会红）**。属安全面 gap，必须手工补进数组 |
| **12** | `test/apply-integration.test.mjs:293` | `真 handler 执行面：注册后 settings/ingest 面 200 + POST scan/distill 动作通路可达（integration 真验）` | `assert.deepEqual(Object.keys(res.json().data).sort(), ['config','editable','readOnly','writable'])` —— **GET settings 响应键集精确相等** | 若改 GET settings 追加新字段（如 `hindsight`）→ **必红**。若新数据走独立 endpoint 则不红。**这条容易被忽略** |
| **13** | `test/ingest-routes.test.mjs:362` | `panel.js 面 404→200 回归：/api/wiki-steward/panel.js 服务真构建物（MIME 正确）` | `distDir: REAL_DIST`（真 `web/dist`）→ `/api/wiki-steward/panel.js` 200 + `Buffer.from(res.body).equals(Buffer.from(real))` **字节等价**（注释警告勿用字符串比对：140KB O(n²) 会挂死事件循环） | 方案 C 必须重建 dist 且**新组件真进了 bundle**；否则字节仍等于旧 dist → 不红，但新 UI 永不 serve = 假绿 |
| **14** | `test/client-face.test.mjs:228` | `路径全文档相对（issue #1707 教训）` | `assert.ok(!code.includes("'/wiki-steward"))` 双引号/单引号两形 + `assert.deepEqual(seen, ['api/wiki-steward/panel.js'])` | 新增 URL 常量写成 `'/api/…'` 前导斜杠 → `code.includes("'/wiki-steward")` 未必命中（取决于字符串），但会因 base.href 逃逸在生产 404。**测试不一定红，生产必错** |

### 5.3 不会红的面（可以放宽）

- `test/web-panel.test.mjs` 里 liberty 的 log-view / log-history / log-filter / settings-model / view-model 单测：除 `styles.css` 两条外，均 import 具体 `lib/*.js` 模块，**新增新模块不影响**。
- Config 部分覆盖测试（`load.test.mjs:51`）：只在已有键上做覆盖，加新键不破坏。
- 全部 415 条基线测试与新增逻辑互不干扰的部分（如 crud / mark / validate / queue / gate 面）。

---

## 6. Config 面（Question 6）

### 6.1 `lib/index.js` 的 zod Config 全键（实测 + 原文）

【读码】`lib/index.js:50-82`：

```js
export const Config = z.object({
  vaultRoot: z.string().default(DEFAULT_VAULT_ROOT),                      // :52  默认 '/mnt/unraid_data/Obsidian'
  capture: z.object({
    bufferRounds: z.number().default(3),                                  // :55
    enabled: z.boolean().default(true),                                   // :56
  }).prefault({}),                                                        // :57
  write: z.object({ readOnly: z.boolean().default(true) }).prefault({}),  // :59-61
  queue: z.object({ maxRetries: z.number().default(3),                    // :64
                    ttlDays: z.number().default(7) }).prefault({}),       // :65
  secrets: z.object({ enabled: z.boolean().default(true) }).prefault({}), // :68-70
  ingest: z.object({
    schedule: z.object({
      enabled: z.boolean().default(false),                                // :78
      time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, '时间格式须为 HH:MM').default('00:25'),
    }).prefault({}),                                                      // :80
  }).prefault({}),                                                        // :81
}).prefault({})                                                           // :82  顶层容忍 undefined
```

**顶层 6 键：** `vaultRoot` / `capture` / `write` / `queue` / `secrets` / `ingest`。

⚠️ **两条写给新键的硬约束：**

1. **嵌套对象默认值必须用 `.prefault({})`**（`lib/index.js:49` 原文）：「⚠️ 嵌套对象默认值一律用 .prefault({})：zod v4（实测 4.6.5）的 .default({}) 短路直返、不填内层字段默认。」 → 新增 `hindsight: z.object({...})` **必须 `.prefault({})`**，用 `.default({})` 会导致缺 `hindsight` 键时 `cfg.hindsight` 为 `{}`、`cfg.hindsight.enabled` 为 `undefined`（后端 readCfg 读空值 → 运行时崩）。
2. **热改语义**（`lib/index.js:48`）：config 每次事件现读 `Config.safeParse(rawConfig)`，非法时回退全默认 + `warn` 一次（`:404-410`，INV-15 禁静默）。新增键的非法值只需 zod 拒即可，走既有留痕通路，无需新代码。

**如需自定义非法格式 （Hindsight 大概率要，比如 bank 名 / 时间 / 路径）：**
照抄 `ingest.schedule.time` 的 `.regex()` 写法（`:79`），并在 `load.test.mjs:61-71` 加 `assert.throws`。

### 6.2 `lib/settings-write.js` 的 `EDITABLE_PATHS` 白名单

【读码】`lib/settings-write.js:11-19`：

```js
export const EDITABLE_PATHS = Object.freeze([
  Object.freeze(['capture', 'enabled']),
  Object.freeze(['capture', 'bufferRounds']),
  Object.freeze(['queue', 'maxRetries']),
  Object.freeze(['queue', 'ttlDays']),
  Object.freeze(['secrets', 'enabled']),
  Object.freeze(['ingest', 'schedule', 'enabled']),
  Object.freeze(['ingest', 'schedule', 'time']),
])
```

**不在白名单：`vaultRoot`（INV-7 语义勿动）与 `write.readOnly`（INV-7 默认只读）—— 两者都被 `test/settings-write.test.mjs:26-28` 显式加固为「永不可改」。**

> 【推断】`EDITABLE_PATHS` 的元素是 `Object.freeze` 过的数组，但**外层数组本身未 freeze**（`:11` 只是 `Object.freeze([...])` 包住一个字面量数组字面量、其元素是 freeze 的 path 数组）。它是普通 `const` 导出，测试用 `EDITABLE_PATHS.map(...)` 读内容做 `deepEqual`（`settings-write.test.mjs:17`）。因此白名单**可以追加元素**；真正会红的只有 §5.1 #2/#3 的精确列表断言（那是「断言修订」范畴，非缺陷）。

### 6.3 settings-write.js 校验逻辑逐层拆解（回答问题 6 后半）

写入链路：`lib/ingest-routes.js:174` `settingsPost` → `applyPatch(body?.patch)` → `lib/settings-write.js:122` `createApplyPatch` 返回的闭包。共 5 道闸，按序：

**闸 1 — 白名单预检（`checkPatchEditable`，`settings-write.js:82-92`）**
```
① !isPlainObject(patch)            → {ok:false, code:'bad_patch', 'patch 必须是对象'}
② leafPaths(patch).filter(len>0) 空 → {ok:false, code:'bad_patch', 'patch 为空（无可改叶子）'}
③ 任一叶子 !isEditablePath(p)      → {ok:false, code:'not_editable', `字段 X.Y 不在可改白名单（仅可改：…）`}
```
- `leafPaths`（`:26-35`）：递归收集叶子路径；**空对象 `{}` 视为叶子**（因此 `{capture:{}}` 的叶子是 `['capture']` → 不在白名单 → 拒）。
- `isEditablePath`（`:42-44`）：**叶子路径全等**匹配（`samePath` 逐元素相等，`:37-39`）—— 即白名单是**叶子级**，父路径 `['capture']` 或 `['ingest']` 都不算可写。
- **整单拒语义**（`:6-7` 头注 + `test/settings-write.test.mjs:46-58`）：白名单外叶子 → 整单拒，**绝不静默丢键**。

**闸 2 — 最小写入形投影（`projectEditable`，`settings-write.js:64-74`）**
按白名单顺序从 patch 抽出白名单叶子、重建最小对象（`getPath(patch, p)` 取不到就跳过）—— **双保险**：即使闸 1 被绕过，非白名单键也绝不进写入形。

**闸 3 — 三层合并（`applyEditablePatch`，`settings-write.js:100-111`）**
```js
const effective = mergeInto(structuredClone(inherited), structuredClone(current))
mergeInto(effective, minimal)
```
- `mergeInto`（`:46-52`）：**对象深合并、数组/标量整替**（即 `{…}` 词表类整行替换，与 cordis patch 整行替换语义一致，`:8`）。
- 「生效面」= **inherited ∪ current ∪ patch 合并后再 zod 校验**（`test/settings-write.test.mjs:105-111` 专项验证了 inherited 层非法也拒）。

**闸 4 — 真 zod 校验（`:106-109`）**
```js
const parsed = Config.safeParse(effective)
if (!parsed.success) return { ok:false, code:'invalid',
  message: `配置校验失败：${issues.map(i => `${i.path.join('.')||'(root)'}: ${i.message}`).join('; ')}` }
```
成功返回：`{ok:true, config: mergeInto(structuredClone(current), minimal), parsed: parsed.data}` —— **注意落盘形 `config` 只含 `current ∪ patch`，不含 inherited**（`test/settings-write.test.mjs:39` 断言「写入形=current∪patch（inherited 不落盘）」）。

**闸 5 — 宿主持久化缝（`createApplyPatch`，`settings-write.js:122-148`）**
```js
const entries = configEditor.entries()
const entry = entries.find(e => e?.options?.id === entryId)      // entryId='wiki-steward'（cordis.patch.yml 的 insert 行 id）
if (entry === undefined) return {ok:false, code:'no_entry', `配置入口 wiki-steward 不在活动表…`}
await configEditor.edit(entry, (current, inherited) => {
  const r = applyEditablePatch({inherited, current, patch}, Config)
  if (!r.ok) { const err = new Error(r.message); err.code = r.code; throw err }
  applied = r.config
  return r.config
})
```
- **落地位置不在插件手里**：`configEditor`（`@deepseek-ai/dsh-config-editor`）= 落 profile patch + reconcile 热生效（`settings-write.js:114-116` 注释；四条 field notes：dsh-settings 服务同款持久化缝）。
- **缺缝 = 诚实降级**（`lib/index.js:686-687`，`applyPatch === null`）：GET `/settings` 回 `writable:false`（`ingest-routes.js:164`）、POST 回 **503 `write_unavailable`**（`ingest-routes.js:177-179`），展示面照常 —— 「诚实面=响应判据非额外告警」。

**HTTP 状态映射（`ingest-routes.js:185`）**
```js
const status = code === 'not_editable' || code === 'bad_patch' || code === 'invalid' ? 400
             : code === 'no_entry' ? 409 : 500
```
即：`not_editable`/`bad_patch`/`invalid`→**400**；`no_entry`→**409**；其余→**500**。新增移动端failure码如需特殊状态，须在此手写映射，否则一律落 500。

### 6.4 「新增『同步时间/启停开关』这类可热改配置项」要走哪几处

按契约，**恰好 4 处，缺一不可**（这四处在历史上由 Task F3 的 ingest.schedule 双 Introduced 定性，可作为裁剪模板）：

| # | 落点 | 文件:行 | 内容 | 漏了会怎样 |
|---|---|---|---|---|
| **1** | **Config 定义** | `lib/index.js:50-82` | 加 `hindsight: z.object({enabled: z.boolean().default(false), time: z.string().regex(/^HH:MM$/).default('00:30')}).prefault({})` | zod 不认该键 → POST `{patch:{hindsight:{…}}}` 的 leafPath 是 `hindsight.enabled`，先在闸 1 就过不了白名单；且 hot-read 得到 undefined → 后端运行时炸。另**嵌套必须 `.prefault({})`** |
| **2** | **EDITABLE_PATHS 白名单（权威）** | `lib/settings-write.js:11-19` | 加 `Object.freeze(['hindsight','enabled'])`、`Object.freeze(['hindsight','time'])` | 闸 1 判 `not_editable` → 400。**UI 能显示但保存必拒**，是「假 UI」的经典成因 |
| **3** | **cordis.patch.yml 默认值** | `cordis.patch.yml:7` config 块 | 加 `hindsight: { enabled: false, time: '00:30' }` | 不致命（zod 会给默认），但 profile 者直接覆盖时改由于「整行替换」会丢。发布 checklist 项 |
| **4** | **UI 表单**（**双侧**） | `lib/client.js:65-73` `EDITABLE_FIELDS`（客户端副本，注释 `:64` 明写「只控表单；服务端 lib/settings-write.js 为权威判据，双侧一致」）；kind ∈ boolean / number / time / string[] / 其他（只读 span），渲染分支见 `SettingsRow` `:152-192` | 漏了 → **用户在 UI 里看不到这一行**（保存按钮在，但改不了这两项）。特别注意 **client.js 副本与服务端白名单必须双侧一致**，否则 UI 显示了保存却 400（`test/client-face.test.mjs:486` 有「服务端拒绝 not_editable = 错误文案如实展示，绝不静默」的专项锁，届时 UI 会显示错误文案） |

> 若还要热生效执行（到点真跑），还有**第 5 处（可选）**：挂 `ctx.effect` 的 scheduler/定时器 —— 参照现有 `ingestSchedule` 接线（`lib/index.js:547-584`）＋ `lib/ingest-schedule.js`。这是 Hindsight「启停 + 同步时间」真正是要考虑的面。

---

## 7. 风险点 —— 本波新增最可能踩到的陷阱

按「踩中概率 × 后果严重度」排序：

### R-1 【高】「页签」这个词把我们带错路径 —— 自造 `settings.plugins.tab` 是历史否决方案
- **证据**：`lib/client.js:24` 「弃自造 `settings.plugins.tab` 页签（旧 404 面）」；`test/client-face.test.mjs:253-257` 显式 `assert.notEqual(r.decl.name,'settings.plugins.tab','自造页签已弃（菜单页签不对的根因）')`。
- **后果**：若按直觉给 Hindsight 注册一个新 `settings.plugins.tab`，直接红 + 重走已失败路线。
- **建议**：走「扩现有设置节」（§0.1 A），或在 Phase 1 就明确为什么必须独立节。

### R-2 【高】`Config.parse({})` 顶层键集被 `deepEqual` 硬钉 —— 加键必红，不可回避
- **证据**：`test/load.test.mjs:29-49`，包含 `assert.deepEqual(Config.parse({}), expected)` 与 `assert.deepEqual(Config.parse(undefined), expected)`。
- **后果**：加 `hindsight` 顶层键瞬间红。这不是可以「绕」的，只能按 `:39-42` 的既有模板做**断言修订**（明确写修订理由 + 「旧键行为零变化」的向后兼容论证，正如当年 ingest 键的做法）。**预期的工作量的一部分，不是 bug。**

### R-3 【高】白名单双侧不同步 → UI 显示了但保存 400
- **证据**：`lib/client.js:64` 注释：「可改白名单（客户端副本，只控表单；服务端 lib/settings-write.js 为权威判据，**双侧一致**）」。
- **后果**：`EDITABLE_FIELDS` 加了、`EDITABLE_PATHS` 忘了加 → 表单出现、保存 400 `not_editable`。反之则 UI 没有入口。
- **Mitigation**：新增一条测试断言两者同序同名（`EDITABLE_FIELDS.map(f=>f.path.join('.'))` deepEqual `EDITABLE_PATHS.map(p=>p.join('.'))`）。**目前没有这个测试**，双侧不同步是静默缺陷源。

### R-4 【高】`.prefault({})` vs `.default({})` —— zod v4 陷阱
- **证据**：`lib/index.js:49`：「⚠️ 嵌套对象默认值一律用 .prefault({})：zod v4（实测 4.6.5）的 .default({}) 短路直返、不填内层字段默认。」
- **后果**：写成 `.default({})` → 缺键时 `cfg.hindsight.enabled` 为 `undefined` → 后端 readCfg 的 per-call 路径炸（typeof undefined），且 load.test 的 `Config.parse({})` 也会红。
- **Mitigation**：Phase 6 code review 专项 grep `\.default(\{`。

### R-5 【中高】dist 假绿陷阱 —— 「src 改了 dist 没重建」测试全绿但功能零生效
- **证据**：`web/README.md:5`「dist 必须提交」+ `test/ingest-routes.test.mjs:362-383` 用真 `web/dist` 字节比对 + 本波 requisite LRN-045（ledger.md:44 记载「前端验收含**发布物面**（web/dist 重建 + bundle 断言），不许只测 src」）。
- **后果**：方案 C 若漏 `pnpm build`，(a) `dist-browser-load` 三锁**仍绿**（旧产物合规）；(b) `ingest-routes.test.mjs:362` 字节比对**仍绿**（比对的是 dist 本身）；(c) 而 `test/web-panel.test.mjs` 只测 `web/src/lib/*.js` 纯模块 → **全绿但线上无新 UI**。
- **Mitigation**：Phase 6 验收必须含「dist 重建 + 新组件字符串真在 bundle 里」的 grep 断言 + `git status` 证实 dist 已 stage。

### R-6 【中】新端点漏 `authGate` —— 测试不断言，安全面开天窗，Phase 7 复审必 autoreject
- **证据**：`lib/ingest-routes.js:45-51` + `test/ingest-routes.test.mjs:118-126` 硬编码遍历 6 条路径验证回拒。
- **后果**：新端点不在该数组 → **零鉴权覆盖**，测试不红（条数变了、很可能没人察觉），但端点公开可用。
- **Mitigation**：新端点入该数组；Phase 6 checklist 列此项。

### R-7 【中】文档相对 vs 站内绝对 —— 测试不一定红，生产必 404
- **证据**：`lib/client.js:8-9`（`<base href="./">` 逃逸根因）、`test/client-face.test.mjs:228-247`。
- **额外已知不一致**：`web/src/panel.js:25` 的默认兜底是 `'/wiki-steward/api'`（前导斜杠 + 路径次序不同），与实际运行的 `'api/wiki-steward'` 不符 —— 只在「不传 apiBase 直接 mount」时发作。
- **Mitigation**：新 URL 常量一律 `'api/wiki-steward/…'`；若要复用 panel.js 的独立挂载，先修 `panel.js:25` 默认值为 `'api/wiki-steward'`（或显式传值并在测试钉住）。

### R-8 【中】effects-out：cordis.patch.yml 的 config 整行替换语义
- **证据**：`cordis.patch.yml:3`「⚠️ config 是整行替换语义（非深度合并）：profile 覆盖者必须在此基础上重述全部键」。
- **后果**：生产若存在 profile 级 config 覆盖（$HOME/.dsh/profiles/web/cordis.patch.yml），新增键后不重述 → 旧键丢失 → Config parse 走 default → 用户原配置（如 vaultRoot）被静默回出厂。
- **Mitigation**：发布 checklist 包含「检查生产 profile 是否覆盖 wiki-steward config」。

### R-9 【低中】`'settings.plugins.tab'` 之外的主题不一致 —— `web/src/panel.js` 的 `apiBase` 默认值
见 R-7。

### R-10 【低】primitives 日历组件存在性未验证
- 「同步日历」若需月历网格，本报告**未验证** `@deepseek-ai/dsh-client-ui-primitives` 是否导出 `DatePicker`/`Calendar`。现有只用 Switch/Input/Button/Modal 四件（`test/client-face.test.mjs:756` 硬钉）。
- **Mitigation**：Phase 1 或 Phase 2 前先 `ls` 宿主包的导出面确认；若无 → 走 `<input type="date">` 轻量方案，或按 AGENTS.md UI 约定引 element-plus 且须「按需装配 + 独立 vendor chunk + 样式桥接 dsh token + 零第三方网络请求」。

### R-11 【低】`test/client-face.test.mjs` 的 `stripComments` 使注释不算引用
- 例如你在注释里写旧路径示例不会触发断言，但**代码字符串里的路径会**。新增 URL 时注意不要在任何字符串里出现 `'/wiki-steward`。

---

## 8. 未决问题（Open Questions）

以下 6 条**侦察面查不到/需要用户或宿主实测裁定**，全部显式留白，不含推断结论冒充：

1. **Q1 — Hindsight 记忆插件本机已装，但它的读写 API/CLI 面是什么？**
   本卡只读 wiki-steward 仓库；**未阅读**任何 Hindsight 插件源码或 `.dsh` 配置。ledger.md:58 已记「教训库内无 Hindsight 相关条目」。
   → 需另一张卡侦察：Hindsight 安装位、数据落点（记忆库目录/bank 名）、有无 CLI 或 HTTP API、**能否被其他插件以编程方式读取**（决定「同步」是文件复制还是 API 调用）。这是 Q 需求 1+2 的技术地基，缺它无法进 Phase 2。

2. **Q2 — 「同步到 raw 再 ingest 到 wiki」是否已有半自动链路可复用？**
   本卡证实 raw→wiki 的蒸馏走 `dsh-cron wiki-ingest` + `wiki-ingest` skill（`lib/ingest-trigger.js`，由 **「触发蒸馏」按钮经 headless 任务通道**，自己不做 LLM）；但**Hindsight 记忆 → raw/ 这一段零现存代码**。
   → 需裁定：导出落点是 raw/ 某个子目录（如 `raw/projects/` 之外的 Hindsight 专区）还是其他；导出脚本放哪。AGENTS.md「插件运行时生成文件落点」有硬约束（生成文件禁写安装位 `~/.dsh/profiles/*/node_modules/*`、禁写源码位 monorepo checkout、禁散落 `~/.dsh` 根，应落 `~/.dsh/plugins/wiki-steward/data/`）。

3. **Q3 — `@deepseek-ai/dsh-client-ui-primitives` 是否提供日历/日期网格/图表组件？**
   现有只用到 Switch/Input/Button/Modal（被 `test/client-face.test.mjs:756` 硬钉）。「同步日历」「状态分析」若需网格/图表，先确认宿主包导出面（本报告未读该包）。

4. **Q4 — settings.section 的 label 是否支持 i18n/locale 重注册，以及 order 冲突容忍度？**
   `package.json:47` inject 了 `@deepseek-ai/dsh-client-locale`；`lib/client.js:522` 的 label 是硬写 thunk `() => 'wiki-steward'`。
   → 若 Hindsight 需要独立导航项（方案 B），需先确认宿主对同 order（现有 30）重复 section 的渲染行为，以及是否需要 locale 重注册。需实测宿主包或真机。

5. **Q5 — 生产环境（`~/.dsh/profiles/web/cordis.patch.yml`）当前是否已存在 wiki-steward 的 config 覆盖？**
   本卡**只读本仓库**，未读 `/root/.dsh/` 生产配置。这决定 R-8 是「潜在风险」还是「确定会炸」。建议 Phase 6 发布前**由 worker 卡实测** `grep -A5 'wiki-steward' /root/.dsh/profiles/web/cordis.patch.yml`。

6. **Q6 — 方案 A vs C（或混合）的最终决定权不在侦察面。**
   侦察只给出三方案的改动面差异与风险（§0.1）；「同步日历/状态分析」的 UI 复杂度是否需要 Vue（引 dist 面风险）还是能压缩进节内 React 组件，**属 Phase 1/2 产品裁定**，需回用户面确认。依据 IL-9：停条件属于用户。

---

## 附：证据索引（本报告所有关键结论的文件:行回溯）

| 结论 | 证据位置 |
|---|---|
| dsh.client.inject 声明 | `package.json:44-52` |
| exports ./client | `package.json:10` |
| 版本/构建脚本 | `package.json:3`（0.7.0）/ `:21-22` |
| settings.section 唯一注册 | `lib/client.js:516-528`（注册）/ `:501`（apply） |
| 客户端白名单副本 | `lib/client.js:65-73` |
| URL 常量（文档相对） | `lib/client.js:42-46` |
| primitives require + 四组件 | `lib/client.js:39` / `:153` `:161` `:172` `:371` `:398` `:434` `:443`（Switch/Input/Button/Modal） |
| SETTINGS_CSS token 约束 | `lib/client.js:104-123` |
| 面板 URL 文档相对 + panelLoader | `lib/client.js:42` / `:55-57` |
| 弹层挂载硬传 view:'log' | `lib/client.js:471` |
| Config 全键 | `lib/index.js:50-82` |
| .prefault 铁律 | `lib/index.js:49` |
| 嵌套字符串不必 deep merged ding | `lib/index.js:404-416`（readCfg 热改） |
| 数据面双层子插件注册 | `lib/index.js:695-740` |
| cordis.patch.yml 整行替换语义 | `cordis.patch.yml:3` |
| API prefix + 6 路由分发 | `lib/ingest-routes.js:20` / `:275-287` |
| authGate / methodGuard / readJsonBody | `lib/ingest-routes.js:45-58` / `:77-92` |
| 静态面 realpath 围栏 | `lib/ingest-routes.js:95-134` |
| EDITABLE_PATHS | `lib/settings-write.js:11-19` |
| 五道闸 | `lib/settings-write.js:82`(闸1) `:64`(闸2) `:100-105`(闸3) `:106-109`(闸4) `:122-148`(闸5) |
| HTTP 状态映射 | `lib/ingest-routes.js:185` |
| vite lib 单入口 + NODE_ENV define | `web/vite.config.js:19-35` / `:16-18` |
| panel.js mount 契约 + apiBase 默认 | `web/src/panel.js:23-35` / `:25` |
| App.vue 组装顺序 | `web/src/App.vue:56-65` |
| api.js createApi | `web/src/api.js:15-33` |
| dist git 跟踪实测 | `git ls-files wiki-steward/web/` + `git check-ignore`（均【实测】） |
| 基线 415/415 | `node --test`（【实测】） |
| 行数 ≤300 实测 | `wc -l` 输出表 §2.1 |
| 机架/工具链在位 | `ls node_modules/vite` + `which pnpm`（【实测】） |
