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
| `LogHistoryView.vue:17-29` | `reload()`：`const mine = ++epoch.value`（**filter-change 与 reload 均递增**——`onFilterChange`→`reload`、刷新按钮、`defineExpose` 外部刷新三入口同路）；响应后 `if (mine !== epoch.value) return`，**既不 applyLatest 也不 applyError**（错误同样不落当前视图） |
| `LogHistoryView.vue:30-41` | `loadOlder()`：`const mine = epoch.value`（沿用当前序号，不递增）；响应 epoch 不匹配即整份丢弃，**既不 applyOlder 也不替换当前页** |
| `LogHistoryView.vue:49-50` | `defineExpose({ reload, epoch })`：epoch 暴露供真实现测试直读序号契约（与既有 `reload` 暴露同款测试缝） |

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

- `pnpm build` 重建 `web/dist`（`panel.js` 102.49 kB / `style.css` 3.63 kB）并随本波入库（`git diff --numstat`：`web/dist/panel.js` +15/-3 量级字节变更与 src 同波）。
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
