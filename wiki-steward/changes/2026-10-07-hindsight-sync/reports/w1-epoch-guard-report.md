# W1 epoch 守卫 + N2 文案互斥收口报告（t1 / 0.7.0 波 deferred 收口）

- **日期**：2026-10-07（hindsight-sync 波次）
- **任务**：t1（kind=implementation，attempt 1）
- **出处**：`wiki-steward/changes/2026-09-30-logview-filters/review-report.md:106`（W1 warning：reload 与在途 loadOlder 无请求序号守卫，晚到的旧筛选页可 `applyOlder` 拼进新筛选视图）、`:108`（N2 nit：区间倒置双文案并存）
- **改动面**：`wiki-steward/web/src/`、`wiki-steward/web/dist/`、`wiki-steward/test/`（服务端 `lib/` 零改动；生产配置、发版动作零触碰）

## 一、W1 实现 —— epoch 请求序号守卫（语义根治，非掩盖）

`web/src/components/LogHistoryView.vue` 持 `epoch`（请求序号，`ref(0)`）：

| 位置 | 语义 |
|---|---|
| `LogHistoryView.vue:14-16` | 守卫说明 + `const epoch = ref(0)` |
| `LogHistoryView.vue:18-28`（t1 落盘态实测） | `reload()`：`const mine = ++epoch.value`（**filter-change 与 reload 均递增**——`onFilterChange`→`reload`、刷新按钮、`defineExpose` 外部刷新三入口同路）；响应后 `if (mine !== epoch.value) return`，**既不 applyLatest 也不 applyError**（错误同样不落当前视图）。**F2 修正**：原写 `:17-29` 系笔误（N4 类复发）；修正依据=复审实测 18-28 且本波落笔前 `grep -n` 实测核对一致（`async function reload() {` 在 18、闭括号在 28） |
| `LogHistoryView.vue:30-41` | `loadOlder()`：`const mine = epoch.value`（沿用当前序号，不递增）；响应 epoch 不匹配即整份丢弃，**既不 applyOlder 也不替换当前页** |
| `LogHistoryView.vue:49-50` | `defineExpose({ reload, epoch })`：epoch 暴露供真实现测试直读序号契约（与既有 `reload` 暴露同款测试缝） |

> 行号基准：上表行号 = **t1 落盘态（commit `e7a6ae7`）实测**；F3 收口后行号漂移对照见 §八（`reload` 等随 F3 门禁新增行位移）。

语义保证：**旧筛选响应（loadOlder 页或 reload 页）无论早到晚到，永不落进新筛选视图**；`meta.cursor` 不跨筛选集（丢弃零副作用，下一次翻旧仍取新筛选集游标+同参查询）。与复审建议方案（「加 epoch/seq，filter-change/reload 递增，响应 epoch 不匹配即丢弃」）同构，落地为成功/失败双路守卫（约 15 行）。

## 二、N2 实现 —— 区间倒置双文案互斥渲染

| 位置 | 语义 |
|---|---|
| `web/src/lib/log-filter.js:52-55` | 新增纯函数 `rangeInverted(filters)`（since>until，日粒度 YYYY-MM-DD 字典序）——倒置判定**单一来源** |
| `web/src/components/IngestLogPanel.vue:21-22` | `rangeEmpty` computed 改调 `rangeInverted(props.filters)`（原内联比较式收编，零语义漂移） |
| `web/src/components/IngestLogPanel.vue:86-87` | 空态文案渲染加 `&& !rangeEmpty`：**区间倒置时只呈现「起始日期晚于截止日期——当前时间区间为空。」（`:69`），空态文案「所选筛选条件下无日志条目。」不再并存**（互斥渲染；全不选/暂无日志两文案同理不并存） |

## 三、测试（LRN-047 真对真口径，禁 mock 自证）

新增 `wiki-steward/test/log-history-view.test.mjs`（279 行，7 测试）：

**真实现挂载管线**：真 SFC 源文件（`vue/compiler-sfc` 同线程 `registerHooks` 直编 `LogHistoryView.vue`/`IngestLogPanel.vue`——与 vite 同一官方编译器）+ 真 Vue 运行时（`createRenderer` 内存节点，无 DOM）+ 真 `lib/log-history.js`/`log-filter.js` 状态机。**唯一假缝 = `props.api.fetchLogs` 可控传输**（I/O 边界注入缝，client-face 注入缝同款纪律）——手动 resolve 制造「旧筛选响应晚到」时序，被测的容器编排/状态机/展示条件全为真实现。

| # | 测试 | 锁语义 |
|---|---|---|
| 1 | W1 竞态：加载更早在途时改筛选 | 旧筛选 loadOlder 晚到被丢弃（`oldLate` 不渲染、`newX` 保持）+ **游标不跨筛选集**（再翻旧发 `cursor=k3`+`since` 同参；晚到响应零副作用不触发新请求） |
| 2 | W1 竞态：在途 reload 遇 filter-change | 旧 reload 响应晚到被丢弃，不覆盖新筛选页（`stale` 不渲染） |
| 3 | W1 epoch 契约 | 直读真组件请求序号：mount=1、reload→2、filter-change→3、loadOlder 沿用 3 不递增；同 epoch 响应正常落地（守卫不误杀） |
| 4 | N2 互斥渲染 | 倒置时只见「当前时间区间为空」，`所选筛选条件下无日志条目`/`暂无日志（各来源均无记录）`均不并存 |
| 5 | N2 判别力对照 | 非倒置空结果只呈空态文案、无区间提示（互斥双向，锁不可对正常空态失明） |
| 6 | `rangeInverted` 边界 | 真模块直调：since>until 真；等值单日/正序/缺任一边界/缺省均假 |
| 7 | LRN-045 发布物面锁 | `web/dist/panel.js` 字面含 `epoch`（W1 守卫）+ N2 双文案（见下节） |

**先红后绿判别力**：测试 7 在 `pnpm build` 重建前对旧 dist **红**（`dist 字面含 W1 请求序号守卫语义（epoch 属性键）` assertion 失败——旧构建物零命中），重建后绿——即「src 改了 dist 旧」假绿在本锁下必现。

## 四、发布物面（LRN-045，防假绿）

- `pnpm build` 重建 `web/dist`（`panel.js` 102.49 kB / `style.css` 3.63 kB）并随本波入库（`git show --numstat e7a6ae7` 实测：`web/dist/panel.js` **110/95** 量级字节变更与 src 同波。**F1 修正**：原写「+15/-3」系笔误——那是同 commit `LogHistoryView.vue` 的 numstat（15/3）被误抄为 dist 的数；修正依据=复审实测 110/95 且本波落笔前 `git show --numstat e7a6ae7 -- wiki-steward/web/dist/panel.js` 复测一致）。
- **dist 字面判据**（实测 grep `web/dist/panel.js`）：`epoch` = **1 命中**（重建前 0）；`当前时间区间为空` = 1；`所选筛选条件下无日志条目` = 1。
  缩编事实说明（本波实测）：esbuild 缩编剥离标识符与注释（`applyLatest`/`emptyStateMessage`/`rangeEmpty` 等源码名在 dist 零命中），存活形仅**属性键与字符串**；故 W1 发布物判据取 `defineExpose({ reload, epoch })` 的 `epoch` 属性键——既是缩编下唯一存活形，也是真实现测试的直读缝（一举两得，非为判据造字面）。
- `node --test test/dist-browser-load.test.mjs` **4/4 绿**（字节残留锁 + 无 process 真 ESM 加载锁，构建物真浏览器可加载语义零回退）。
- N2 互斥为条件渲染（无新增字符串），判据=双文案字面在 dist 各 1 + 渲染面互斥由测试 4/5 锁定。

## 五、N1 / N3 / N4 处置对账（按复审裁定留痕，本波只对账不动代码）

| 项 | 复审裁定 | 本波处置 | 依据 |
|---|---|---|---|
| N1（`type=` 串序=UI 插入序，非 `sources` 展示序） | 接受，留 cosmetic | **未顺手做**（合同明示「N1/N3/N4 按复审裁定留痕不动」）；服务端按集合并集 7==7 语义无影响，若归一需动 `toQuery` 查询投影语义并补测，与 W1/N2 解耦，继续留 cosmetic backlog | review-report.md:107 |
| N3（`log-filter.test.mjs:137-140` 手工构造 mock 页循环断言近乎自证） | 留痕即可（非恒真；真过滤由 `ingest-log.test.mjs:267`/`ingest-routes.test.mjs:405,440` 真实现测试锁定） | **留痕不动**；本波新增测试严守 LRN-047 真对真（真组件整链，唯一假缝=I/O 传输）。git 证据：本波 `test/` 面**纯增 1 文件**、既有测试文件零触碰（`git diff --numstat` test/ 面无既有文件） | review-report.md:108 上一行 |
| N4（0.7.0 报告称 `styles.css:176-211`，实为 176-209） | 下轮报告校对 | **本报告行号全部写前实测**（`grep -n`/`wc -l` 现场输出），无推断行号——校对口径已对 | review-report.md:109 |

## 六、验证输出原文证据

**① 全量 `cd wiki-steward && node --test`（基线 415 全绿 → 422，新增 7，零回退零修订）**：

```
ℹ tests 422
ℹ pass 422
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4737.788991
```

（新测试逐条绿：`W1 竞态：加载更早在途时改筛选…` ✔ / `W1 竞态：在途 reload 遇 filter-change…` ✔ / `W1 epoch 契约…` ✔ / `N2 互斥渲染…` ✔ / `N2 判别力对照…` ✔ / `rangeInverted…` ✔ / `LRN-045 发布物面…` ✔）

**② `cd wiki-steward && pnpm build 2>&1 | tail -3 && node --test test/dist-browser-load.test.mjs 2>&1 | tail -4`**：

```
web/dist/panel.js   102.49 kB │ gzip: 32.62 kB

✓ built in 360ms
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

**③ dist 字面 grep（LRN-045 判据）**：

```
epoch                        1
当前时间区间为空             1
所选筛选条件下无日志条目     1
```

**④ 既有断言零回退**：`git diff --numstat`——`test/` 面仅新增 `log-history-view.test.mjs`（?? untracked），既有测试文件零修改零删除；415 既有测试全部保持绿（422 总数=415+7）。

## 七、changedPaths

- `wiki-steward/web/src/components/LogHistoryView.vue`（+15/-3：epoch 守卫双路 + expose）
- `wiki-steward/web/src/components/IngestLogPanel.vue`（+5/-4：rangeInverted 收编 + N2 互斥渲染）
- `wiki-steward/web/src/lib/log-filter.js`（+5：`rangeInverted` 纯函数）
- `wiki-steward/web/dist/panel.js`（`pnpm build` 重建入库）
- `wiki-steward/test/log-history-view.test.mjs`（新，279 行，7 测试）
- `wiki-steward/changes/2026-10-07-hindsight-sync/reports/w1-epoch-guard-report.md`（本报告）

**越界申报：无。** `lib/`（服务端）零改动、`/root/.dsh/` 零触碰、无 bump/CHANGELOG/tag/push/release；组件行数合规（LogHistoryView 63 行、IngestLogPanel 98 行，均 ≤300）。

---

## 八、F1/F2/F3 收口（t4 repair round 1，来源 t3 复审 `reports/w1-epoch-guard-review.md` 留痕）

### F3（主项）：reload 在途禁翻旧 —— 「旧游标+新参」请求构造窄缝消灭

现象（复审留痕）：filter-change 后、reload 响应前点「加载更早」→ 发出「旧游标+新参」请求且同 epoch 不被 W1 丢弃。修法取复审建议最小形：`reloading` ref 标记 reload 在途 → **请求级语义门禁**（`loadOlder` 闸门叠加）+ **入口禁用**（按钮 `disabled`）；语义=「翻旧只能在稳定视图上发生」。

**diff 摘要**（`git diff e7a6ae7 -- wiki-steward/web/src`）：

```diff
--- web/src/components/LogHistoryView.vue
+// F3 门禁（t3 复审留痕收口）：reload 在途标记——翻旧只能在稳定视图上发生（…）
+const reloading = ref(false)
 async function reload() {
   const mine = ++epoch.value
+  reloading.value = true
   ...
+  } finally {
+    if (mine === epoch.value) reloading.value = false
   }
 }
 async function loadOlder() {
-  if (!canLoadOlder(history.value)) return
+  // F3：reload 在途不发翻旧请求（旧游标+新参窄缝）；W1 epoch 守卫保持不变
+  if (!canLoadOlder(history.value) || reloading.value) return
 ...
     :filters="filters"
+    :load-older-disabled="reloading"
--- web/src/components/IngestLogPanel.vue
+  // F3 门禁：reload 在途禁用「加载更早」入口（翻旧只能在稳定视图上发生；请求级语义门禁在容器）
+  loadOlderDisabled: { type: Boolean, default: false },
 ...
         type="button"
+        :disabled="loadOlderDisabled"
         @click="emit('load-older')"
```

（`finally` 仅在 `mine === epoch.value` 时清标记：被丢弃的旧 reload 不得误清新在途 reload 的门禁；W1 epoch 双路守卫逐字未动。）

**测试输出原文**（真实现口径 LRN-047：真 SFC+真运行时+真状态机，唯一假缝=props.api I/O 传输；既有 7 测试零改动零漂移）：

```
✔ F3 门禁：reload（刷新）在途点「加载更早」不发请求（入口禁用+语义门禁），落地后门禁解除
✔ F3 门禁（复审现象复现）：filter-change 后 reload 响应前点翻旧不发「旧游标+新参」请求
✖ LRN-045 发布物面（F3）：web/dist/panel.js 字面含门禁语义（loadOlderDisabled 属性键）  ← 重建前对旧 dist 红（expected /loadOlderDisabled/）
   → pnpm build 重建后同测试 ✔（先红后绿判别力）
```

锁语义逐条：按钮 `disabled=true`（入口禁用）+ 直接触发 `onClick` 仍零请求（语义门禁，非仅 UI）+ reload 落地后门禁解除（翻旧正常发出，同游标同参=W1 零漂移）；filter-change 路径复现复审窄缝现场：calls 零新增（原会发旧游标 k1+新参）、新页落地后翻旧=新游标 k3+新参（W1 游标不跨集保持）。

#### F3 补锁（t6 repair round 2）：时序探针同型测试 + `finally` 条件**已锁**

t4 报告中「`finally` 仅在 `mine === epoch.value` 时清标记（被丢弃的旧 reload 不得误清新在途 reload 的门禁）」原为实现表述、未单独上锁——t6 以复审探针同型时序测试落实为**已锁**（判别力同源：变异 D=finally 无条件清标记 → 本测试必红）。追加测试 `test/log-history-view.test.mjs`「F3 门禁（时序探针同型）」：mount 首取落地 → 点「刷新」(A 在途) → 改起始日期 (B 在途) → **先 resolve A 的响应**（epoch 不匹配整份丢弃）→ 断言「加载更早」`disabled=true` 且直触发 `onClick` 后 `api.calls.length` 不变（零请求=门禁未被 A 的 finally 误清）→ resolve B → 断言门禁解除、翻旧=新游标+新参。

**测试输出原文**（真实现口径不变：真 SFC+真运行时+真状态机，唯一假缝=props.api I/O 传输）：

```
✔ F3 门禁（时序探针同型）：A 响应晚到被丢弃后门禁仍锁（finally 仅 mine===epoch 才清），B 落地才解除 (2.971774ms)
ℹ tests 11
ℹ pass 11
ℹ fail 0
```

全量 `node --test` 新总数（425→**426**，+1 零回退）：

```
ℹ tests 426
ℹ pass 426
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

t6 changedPaths：`wiki-steward/test/log-history-view.test.mjs`（+37/-0 实测：333→370 行，11 测试）、`wiki-steward/changes/2026-10-07-hindsight-sync/reports/w1-epoch-guard-report.md`（本小节）。`web/src`/`web/dist` 零改动（纯测试面收口；dist 字面判据保持：epoch=1、loadOlderDisabled=2、N2 双文案各 1）。

### F2：报告行号笔误修正

**diff 摘要**：§一 表格 `reload` 行 `LogHistoryView.vue:17-29` → **`LogHistoryView.vue:18-28`**（t1 落盘态实测）+ 表下新增行号基准说明。修正依据=复审实测 18-28、落笔前 `grep -n` 核对一致（`async function reload() {`=18、闭括号=28）——N4 类校对纪律（落笔前实测）。

### F1：dist numstat 笔误修正

**diff 摘要**：§四 `web/dist/panel.js`「+15/-3」→ **`110/95`** + 修正依据标注。修正依据=`git show --numstat e7a6ae7` 实测（dist=110/95、`LogHistoryView.vue`=15/3 即误抄源），与复审实测一致。

### 行号漂移对照（F3 后现行实测，防 N4 复发）

| 位置 | t1 落盘态（§一表基准） | F3 后现行 |
|---|---|---|
| epoch 说明+ref | 14-16 | 14-16（不变） |
| `reload()` | 18-28 | 21-34 |
| `loadOlder()` | 30-41 | 36-48 |
| `defineExpose` | 49-50 | 56-57 |
| F3 新增 | — | `reloading` :17-19、`finally` :31-33、闸门 :38、prop 透传 :66；IngestLogPanel prop :15-16、按钮 `:disabled` :96 |

### 发布物面（LRN-045）

`pnpm build` 重建（`panel.js` 102.78 kB / `style.css` 3.63 kB）；dist 字面（实测 grep）：`epoch`=**1**、`loadOlderDisabled`=**2**、`当前时间区间为空`=**1**、`所选筛选条件下无日志条目`=**1**——F3 门禁语义在 dist **可判**（`loadOlderDisabled` 属性键缩编存活，测试 ⑥ 同型字面锁，无需退化为「不可判」说明）；本波 dist 增量（vs `e7a6ae7`）= **81/71**（`git diff --numstat`）。

### 测试输出原文（全量 + 合同 verify）

① 全量 `node --test`（422→**425**，+3 零回退）：

```
ℹ tests 425
ℹ pass 425
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

② 合同 verify `node --test 2>&1 | tail -5`：

```
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4699.528921
```

③ 合同 verify `grep -c 'epoch' web/dist/panel.js && node --test test/dist-browser-load.test.mjs 2>&1 | tail -4`：

```
1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 334.349522
```

（`test/dist-browser-load.test.mjs` 全量口径：tests 4 / pass 4 / fail 0，①②③④ 全 ✔）

### t4 changedPaths

- `wiki-steward/web/src/components/LogHistoryView.vue`（+9/-1：reloading 标记 + finally + 闸门 + prop 透传）
- `wiki-steward/web/src/components/IngestLogPanel.vue`（+3/-0：`loadOlderDisabled` prop + 按钮 `:disabled`）
- `wiki-steward/web/dist/panel.js`（`pnpm build` 重建入库）
- `wiki-steward/test/log-history-view.test.mjs`（+54/-0：2 条 F3 门禁测试 + 1 条 dist 字面锁，7→10）
- `wiki-steward/changes/2026-10-07-hindsight-sync/reports/w1-epoch-guard-report.md`（本节追加 + F1/F2 修正）

**t4 越界申报：无。** `lib/` 零改动、`/root/.dsh/` 零触碰、无发版动作；组件行数合规（LogHistoryView 71 行、IngestLogPanel 101 行，均 ≤300）。
