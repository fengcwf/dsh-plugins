---
title: t14 设置节挂载缝（六控件可达性收口，t12②）
date: 2026-10-08
tags: [wiki-steward, hindsight-sync, settings-section, mount-seam, accessibility]
status: active
source: t14 / attempt d088f872-ff86-4b8c-b419-2e69c91c6783
related: [wiki-steward/changes/2026-10-07-hindsight-sync/]
---

# t14 — 设置节挂载缝（六控件可达性收口）

- **任务**：t14（kind=implementation）
- **执行人**：mechanic，attempt 1，`d088f872-ff86-4b8c-b419-2e69c91c6783`
- **执行时间**：2026-10-08 18:14 → 18:25（+08:00）
- **结论**：全量 `node --test` **455/455 pass，exit 0**（基线 451 + 新增 4，零回退）；`web/dist` 经 `pnpm build` 重建入库；dist 判别力先红后绿实证

---

## 0. 现状与目标

| 项 | 事实 |
|---|---|
| 缺口（t12②，scout 实测在案） | `HindsightSyncPanel.vue` 六控件已落，但运行时**无消费方**——`lib/client.js:474` 历史弹层硬传 `view:'log'`，日志视图里不含六控件 |
| 既有挂载形 | `mod.mount(el, { apiBase, view })` → `{unmount()}`（panel.js 契约，`resolveView` 只认 `'log'`，其余落全量面板） |
| 目标 | 六控件在「wiki-steward · 设置」设置节**真实可见可达**；`view:'log'` 历史弹层零回退 |

### 最小设计骨架（先于动手）

1. `web`：`resolveView` 加 `'hindsight'` 三分叉 → `panel.js` 分发 → `App.vue` 收 `view` prop、只渲染 Hindsight 节 → `pnpm build` 重建 dist。
2. `client.js`：抽 `usePanelMount(view)` 单一实现（历史缝改调它、行为不变），新增 `WikiStewardHindsightMount` 内联挂进设置节渲染面。
3. 测试：client-face 加 2 条可达性断言；web-panel 加 resolveView + dist 字面判据（LRN-045）；全量零回退。
4. 报告落盘。

---

## 1. 挂载缝 diff 原文（`wiki-steward/lib/client.js`）

### 1.1 抽共享挂载钩子（历史缝行为面不变，只参数化 view）

```diff
@@ -451,12 +462,13 @@
     /**
-     * 历史弹层挂载缝：web/dist 日志视图挂进容器。
-     * 挂载契约：mount(el, {apiBase, view:'log'}) → {unmount()}；清理=unmount+容器清空，幂等。
+     * 面板挂载钩子（view 参数化——t14：历史日志面与 Hindsight 面共用同一挂载/清理语义，
+     * 分叉只在 view 值与容器标识，避免两处各写一份挂载/失败兜底/幂等清理逻辑）。
+     * 挂载契约：mount(el, {apiBase, view}) → {unmount()}；清理=unmount+容器清空，幂等。
      * panel.js 走文档相对路径（api/wiki-steward/panel.js，官方 prefix 路由面服务）；
      * 加载失败=容器内如实报错（不白屏不吞不留裸文本）。
      */
-    function WikiStewardHistoryMount() {
+    function usePanelMount(view) {
       var elRef = react.useRef(null)
       react.useEffect(function effect() {
         var el = elRef.current
@@ -467,13 +479,13 @@
           .then(function load() { return exports.__panelLoader(PANEL_URL) })
           .then(function mount(mod) {
             if (!alive) return
-            if (!mod || typeof mod.mount !== 'function') throw new Error('日志视图模块缺 mount 导出')
-            handle = mod.mount(el, { apiBase: API_BASE, view: 'log' })
+            if (!mod || typeof mod.mount !== 'function') throw new Error('面板视图模块缺 mount 导出')
+            handle = mod.mount(el, { apiBase: API_BASE, view: view })
           })
           .catch(function onFail(e) {
             if (!alive) return
             try {
-              el.textContent = 'wiki-steward 历史记录加载失败：' + ((e && e.message) || e)
+              el.textContent = 'wiki-steward ' + (view === 'log' ? '历史记录' : 'Hindsight 同步') + '加载失败：' + ((e && e.message) || e)
             } catch { /* 容器失效不抛 */ }
           })
         return function cleanup() {
@@ -484,7 +496,15 @@
           handle = null
           try { el.textContent = '' } catch { /* 同上 */ }
         }
-      }, [])
+      }, [view])
+      return elRef
+    }
+
+    /**
+     * 历史弹层挂载缝：web/dist 日志视图挂进容器（view:'log'，Task F1 历史入口语义不变）。
+     */
+    function WikiStewardHistoryMount() {
+      var elRef = usePanelMount('log')
       return react.createElement('div', {
         ref: elRef,
         className: 'wiki-steward-history-mount',
```

> 失败兜底文案按 view 分叉：`view==='log'` 仍出「历史记录加载失败」（既有断言 `/历史记录/` 零回退），hindsight 面出「Hindsight 同步加载失败」。

### 1.2 新增 Hindsight 挂载缝

```diff
+    /**
+     * Hindsight 挂载缝（t14 可达性收口）：web/dist Hindsight 同步面板挂进设置节渲染面，
+     * view:'hindsight' → panel.js 分叉到 App 的 Hindsight-only 面（六控件：状态/同步/日历/
+     * 时间/L1 启停/L2 徽标）。与历史缝同形（同 __panelLoader / 同面板 URL / 同幂等清理），
+     * 分叉只在 view 值——历史缝 view:'log' 行为零回退由 test/client-face.test.mjs 既有断言钉住。
+     */
+    function WikiStewardHindsightMount() {
+      var elRef = usePanelMount('hindsight')
+      return react.createElement('div', {
+        ref: elRef,
+        className: 'wiki-steward-hindsight-mount',
+        'data-dsh-plugin': 'wiki-steward',
+        'data-dsh-wiki-steward-view': 'hindsight',
+      })
+    }
```

### 1.3 挂进 settings.section 渲染面（**内联**，非弹层 → 真实可见）

```diff
@@ -359,6 +367,9 @@
       return react.createElement('div', { className: 'wiki-steward-settings', 'data-dsh-plugin': 'wiki-steward' },
         react.createElement('h3', { className: 'wiki-steward-settings-title' }, 'wiki-steward · 设置'),
         react.createElement('p', { className: 'wiki-steward-settings-intro' }, '可改项即时热生效（…）'),
+        // t14 六控件可达性收口：Hindsight 同步面板（状态/同步/日历/时间/L1/L2 六控件）直接
+        // 挂在设置节渲染面（非弹层），挂载缝 view:'hindsight' → web/dist Hindsight-only 面。
+        react.createElement(WikiStewardHindsightMount, null),
         react.createElement(WikiStewardHistoryEntry, { open: state.historyOpen === true, onToggle: toggleHistory }),
```

> **为什么内联而不是弹层**：合同要求「真实**可见**可达」。历史入口走弹层是因为它是一次性查阅动作；六控件是常驻状态面（状态徽标/日历/时间/L1 开关），内联才不藏在一次点击之后，也避免与设置节自身内容重复（见 §2 Hindsight-only 面）。

### 1.4 头注释 ⑦ 与样式面

```diff
+//   ⑦ Hindsight 六控件可达（t14「设置节挂载缝」）= 设置节渲染面内联挂 web/dist Hindsight 同步面板
+//      （WikiStewardHindsightMount，view:'hindsight'）——web/src/panel.js 视图分叉 'log'|'hindsight'|
+//      'full'，App.vue 收 view prop 只渲染 HindsightSyncPanel（六控件），不与设置节既有内容重叠。
+//      挂载/失败兜底/幂等清理与历史缝同源（usePanelMount(view) 单一实现），历史缝 view:'log' 零回退。
@@ -120,6 +127,7 @@
       '.wiki-steward-history-mount{min-height:120px}',
+      '.wiki-steward-hindsight-mount{min-height:160px;margin:12px 0 0}',
```

> 样式仍走 token（`--dsw-alias-*`/`--dsw-radius-*`）唯一色板，零硬编码色值。

---

## 2. web 视图分叉面（view 适配面）

### 2.1 `web/src/lib/view-model.js`（+4 −1）

```diff
 // 历史入口 view='log' → 只挂日志视图（不暴露手动 ingest 动作——F3 领地）；
+// 设置节 Hindsight 缝 view='hindsight' → 只挂 Hindsight 同步面板（六控件，
+// t14 六控件可达性收口——不重复渲染触发/日志/配置三节，避免与设置节自身内容重叠）；
 // 缺省/未知 → 全量面板（mount(el, {apiBase}) 既有契约向后兼容）。
 export function resolveView(view) {
-  return view === 'log' ? 'log' : 'full'
+  if (view === 'log') return 'log'
+  if (view === 'hindsight') return 'hindsight'
+  return 'full'
 }
```

### 2.2 `web/src/panel.js`（+7 −1）

```diff
-  const view = resolveView(deps.view) === 'log' ? LogHistoryView : App
-  const app = createApp(view, { api })
+  const resolved = resolveView(deps.view)
+  // view 分叉：'log'=日志视图（历史入口）；'hindsight'/'full'=App——App 按 view prop 决定
+  // 是否只渲染 Hindsight 同步节（六控件），LogHistoryView 不接 view prop（避免属性透传落 DOM）。
+  const isLog = resolved === 'log'
+  const app = isLog
+    ? createApp(LogHistoryView, { api })
+    : createApp(App, { api, view: resolved })
   app.mount(el)
```

### 2.3 `web/src/App.vue`（接 view prop + 门控）

**改动前**

```js
const props = defineProps({ api: { type: Object, required: true } })
```
```html
<div class="ws-root">
  <HindsightSyncPanel … />
  <IngestTriggerPanel … />
  <LogHistoryView ref="logView" :api="props.api" />
  <IngestSettingsPanel … />
</div>
```

**改动后**（165 行，≤300 行约定内）

```js
const props = defineProps({
  api: { type: Object, required: true },
  // 面板面形（t14 挂载缝）：'full'=全量面板（缺省，契约向后兼容）；'hindsight'=只渲染
  // Hindsight 同步节（设置节挂载缝消费——六控件可见可达，不与设置节既有内容重叠）。
  view: { type: String, default: 'full' },
})
const onlyHindsight = () => props.view === 'hindsight'
```
```html
<div class="ws-root" :data-ws-panel-view="view" :class="onlyHindsight() ? 'ws-root--hindsight' : 'ws-root--full'">
  <HindsightSyncPanel … />
  <template v-if="!onlyHindsight()">
    <IngestTriggerPanel … />
    <LogHistoryView ref="logView" :api="props.api" />
    <IngestSettingsPanel … />
  </template>
</div>
```

> **`ws-root--hindsight` / `data-ws-panel-view` 的作用**：① 语义标记（面板面形可观测）② 作为**只在新增分叉代码里出现的独有字面**供 dist 字面判据判陈旧（LRN-045）——`hindsight` 单词本身在 dist 里到处是（端点串），不足以判别。
> `view` 缺省 `'full'` ⇒ `mount(el, { apiBase })` 既有调用（无 view）零回退。
> `logView` ref 在 hindsight 面不挂载，但 `runScan` 用 `logView.value?.reload()` 可选链，且该按钮本身也被门控隐藏——无悬空引用。

---

## 3. `web/dist` 重建 + LRN-045 判别力实证

### 3.1 重建

```console
$ cd wiki-steward && pnpm build
> vite build --config web/vite.config.js
vite v8.3.1 building client environment for production...
✓ 22 modules transformed.
web/dist/style.css    5.33 kB │ gzip:  1.17 kB
web/dist/panel.js   115.44 kB │ gzip: 36.02 kB
✓ built in 231ms
build_rc=0
```

| 构建物 | 终态 |
|---|---|
| `web/dist/panel.js` | 115440 B（HEAD 基线 102786 B；t12 后 115134 B） |
| `web/dist/style.css` | 5333 B |

### 3.2 判别力先红后绿（dist 陈旧必红）

```console
$ grep -c 'ws-root--hindsight' web/dist/panel.js
1
$ # 临时把判据字面改旧（模拟 dist 未重建）→ 跑 web-panel 测试
ℹ pass 21
ℹ fail 1
AssertionError: dist 缺 Hindsight-only 根类字面——web/dist 陈旧，先跑 pnpm build（LRN-045）
$ # 还原 + 重新 pnpm build
$ grep -c 'ws-root--hindsight' web/dist/panel.js
1        # 还原后终测 455/455 全绿
```

**判定：该断言对「dist 陈旧」可见（先红后绿），非假绿。**

---

## 4. 探针输出

### 4.1 新增可达性断言（client-face，27 → 29）

```console
$ node --test test/client-face.test.mjs
✔ 设置节挂载缝（t14）：渲染面内联挂 Hindsight 面板 → mount(el,{apiBase, view:"hindsight"})；卸载=unmount 消费+容器清空（幂等双清理） (5.909279ms)
✔ t14 双缝并存零回退：同一设置节树内历史缝仍挂 view:"log"、Hindsight 缝挂 view:"hindsight"（同 __panelLoader 同面板 URL，只在 view 分叉） (4.616693ms)
ℹ tests 29  ℹ pass 29  ℹ fail 0
```

**断言 1（settings 路径可达六控件语义）**——探针判据逐条命中：

```js
const mountComp = findComp(tree, 'WikiStewardHindsightMount')
assert.ok(mountComp, 'settings.section 渲染面必须含 WikiStewardHindsightMount（六控件可达性最后一公里）')
...
assert.equal(mounts[0].deps.apiBase, 'api/wiki-steward', 'apiBase 文档相对（与日志/设置请求同基）')
assert.equal(mounts[0].deps.view, 'hindsight', '设置节缝必须挂 Hindsight 面（view 语义含 Hindsight）')
assert.equal(unmounts.length, 1, '卸载干净：handle.unmount 被消费且幂等')
assert.equal(el.textContent, '', '清理=unmount+容器清空（无残影）')
```

> 挂载路径上 **mount 被调用** ✓、**view 语义含 Hindsight 面** ✓（合同可探针判据两项）；
> `cleanup()` 调两次只 `unmount` 一次 ⇒ `handle.unmount` 被消费且幂等 ✓。

**断言 2（log 路径零回退 + 双缝并存）**：

```js
assert.ok(entry, 'log 路径零回退：历史入口仍在设置节')
assert.ok(historyComp, 'log 路径零回退：历史弹层仍渲染到日志挂载缝')
assert.deepEqual(seen, ['api/wiki-steward/panel.js', 'api/wiki-steward/panel.js'], '两缝同面板说明符（文档相对，无前导斜杠）')
assert.equal(mounts[0].view, 'hindsight', 'Hindsight 缝=view hindsight（首个渲染的缝）')
assert.equal(mounts[1].view, 'log', '历史缝=view log（既有行为零回退——断言面不变）')
```

### 4.2 既有 view:'log' 断言零回退（原测试一字未改）

```console
$ node --test test/client-face.test.mjs | grep -E '历史弹层|路径全文档相对'
✔ 路径全文档相对（issue #1707 教训）：源码无站内绝对 /wiki-steward/*，面板 URL=api/wiki-steward/panel.js (14.056084ms)
✔ 历史弹层：挂载日志视图（__panelLoader 注入缝）→ mount(el, {apiBase, view:"log"})，关闭=unmount+清空（断言修订：…） (5.414217ms)
✔ 历史弹层：日志视图加载失败 = 容器内如实报错（不白屏不吞不留裸文本），清理仍幂等（断言修订：…） (4.839796ms)
✔ F2 历史弹层=原生 Modal（title/closeLabel 契约）；开合/挂载行为面零变化 (2.347798ms)
```

> **`client-face.test.mjs` 无既有断言需要修订** —— 本次是「加两条」而非「改旧的」：历史缝抽成 `usePanelMount('log')` 后，`WikiStewardHistoryMount` 仍返回带 `ref` 的单 `div`、`deps.view` 仍 `'log'`、失败兜底仍含「历史记录」，旧断言面原样通过（这正是抽钩子时守住的契约）。故无「按需修订」项，也无需写修订理由注释。

### 4.3 web 面断言（web-panel，20 → 22）

```console
$ node --test test/web-panel.test.mjs
✔ t14 resolveView："hindsight"=Hindsight-only 面（设置节挂载缝消费）；log/缺省/未知=既有语义零回退 (0.130546ms)
✔ t14 挂载缝源面 + dist 字面判据（LRN-045 防假绿）：App.vue 接 view prop 并按 view 门控其余三节；web/dist/panel.js 含 Hindsight 分叉字面（pnpm build 后非陈旧） (1.435823ms)
ℹ tests 22  ℹ pass 22  ℹ fail 0
```

既有 `resolveView` 断言（`'log'/'x'/undefined/null` → 既有值）**未改**，新增用例追加在文件末尾。

---

## 5. 全量验证

### 5.1 基线（改动前）

```console
$ cd wiki-steward && node --test | tail -12
ℹ tests 451
ℹ pass 451
ℹ fail 0
ℹ duration_ms 4805.03795
exit 0
```

### 5.2 改后（合同 Verify 命令）

```console
$ cd wiki-steward && node --test 2>&1 | tail -5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4624.178057
rc=0

$ cd wiki-steward && node --test 2>&1 | tail -9     # 终态（dist 重建后复跑）
ℹ tests 455
ℹ pass 455
ℹ fail 0
ℹ duration_ms 4671.071555
verify_rc=0
```

**451 → 455 = +4（client-face +2、web-panel +2），fail 0，零回退。**

---

## 6. 验收项逐条核对

| # | 验收项 | 状态 | 证据 |
|---|---|---|---|
| 1 | settings.section 渲染面可达六控件（新增挂载缝/视图切换；view 可达 Hindsight 面）——探针：挂载路径上 mount 被调用且 view 语义含 Hindsight 面 | ✅ passed | §4.1 断言 1：`findComp(tree,'WikiStewardHindsightMount')` 在设置节 ready 树内存在；驱动后 `mounts.length===1`、`deps.view==='hindsight'`、`deps.apiBase==='api/wiki-steward'`。链路 client.js `usePanelMount('hindsight')` → panel.js `resolveView` → `'hindsight'` → App `view='hindsight'` → 只渲染 `HindsightSyncPanel`（六控件） |
| 2 | 既有 `view:'log'` 历史弹层零回退（原有测试全绿即证）；卸载干净（handle.unmount 消费、dispose 无残留） | ✅ passed | §4.2：4 条历史弹层/面板 URL 既有断言全绿且**一字未改**；client-face 29/29。卸载：断言 1 中 `cleanup()` 双调只 `unmount` 一次 + `el.textContent===''`；`apply()` 的 `dispose`（disposers 循环）未改动面 |
| 3 | client-face.test.mjs：钉死 view:'log'/挂载面的断言按需修订（注释写修订理由）；新增可达性断言 ≥2 条（settings 路径 + log 路径零回退） | ✅ passed | **无既有断言需修订**（理由见 §4.2：抽 `usePanelMount` 守住旧契约，旧断言面原样通过，故零修订、零修订注释）。新增 2 条：§4.1 断言 1（settings 路径可达六控件语义）+ 断言 2（log 路径零回退/双缝并存） |
| 4 | 若需改 web/src：`pnpm build` 重建 `web/dist` 入库 + dist 字面判据（LRN-045） | ✅ passed | 已改 web/src（view-model/panel/App.vue）→ §3.1 `pnpm build` rc=0、dist 终态 115440B/5333B；§3.2 dist 字面判据 `ws-root--hindsight`/`data-ws-panel-view` **先红后绿**判别力实证（改旧必 fail 1） |
| 5 | 全量 `node --test` 零回退（基线 451+）；报告落盘含挂载缝 diff 原文 + 探针输出 | ✅ passed | §5：451 → **455/455，exit 0**；本报告 §1 挂载缝 diff 原文、§4 探针输出 |

---

## 7. 改动文件清单（In scope）

| 路径 | 操作 | 说明 |
|---|---|---|
| `wiki-steward/lib/client.js` | 编辑 | 头注释 ⑦、`.wiki-steward-hindsight-mount` 样式、`usePanelMount(view)` 抽取、`WikiStewardHindsightMount` 新增、设置节渲染面插入、`WikiStewardHistoryMount` 改调钩子（行为面不变） |
| `wiki-steward/web/src/lib/view-model.js` | 编辑 | `resolveView` 三分叉 `log|hindsight|full` |
| `wiki-steward/web/src/panel.js` | 编辑 | view 分发：log→LogHistoryView；hindsight/full→App（透传 view prop） |
| `wiki-steward/web/src/App.vue` | 编辑 | 接 `view` prop（缺省 full）、`onlyHindsight()` 门控其余三节、根节点 `data-ws-panel-view`/`ws-root--hindsight` 标记（165 行） |
| `wiki-steward/web/dist/panel.js`、`style.css` | `pnpm build` 重建入库 | 115440 B / 5333 B |
| `wiki-steward/test/client-face.test.mjs` | 新增 2 用例 | +73 行，既有断言零修订 |
| `wiki-steward/test/web-panel.test.mjs` | 新增 2 用例 | +24 行，既有 resolveView 断言零修订 |
| `wiki-steward/changes/2026-10-07-hindsight-sync/reports/t14-settings-mount-seam-report.md` | 新建 | 本报告 |

**Out of scope 零触碰**：`lib/hindsight-routes.js`、`lib/hindsight-sync.js`、`lib/index.js` 未动；`/root/.dsh/` 未动；无任何发版动作（未 bump version / 未 tag / 未 release）。

### 产出文件路径

- `wiki-steward/changes/2026-10-07-hindsight-sync/reports/t14-settings-mount-seam-report.md`（本文件）
