# task-f1-report.md — Task F1 面板搬家 + 历史记录入口（续作完工报告）

> 执行者：fresh 实现者（coder，续作会话）。前实现者派发中断（进程亡于约 2026-09-29 11:50），工作树留有未提交 WIP；
> 本会话第 0 步盘点 WIP 后在其基础上续作（未推倒重来）。
> 任务证据面：`changes/2026-09-29-settings-ingest-controls/diagnostic-report.md` §1/§2/§5 + `tasks.md` Task F1。
> 状态：**完成**（`node --test` 350/350 绿、`npm run check` exit 0、dist 同 commit 入库）。

---

## 1. WIP 盘点（前实现者已做了什么 / 本会话补了什么）

### 1.1 前实现者已完成（WIP 面，方向与任务验收一致，全部保留续用）

| 文件 | WIP 内容 | 判定 |
|---|---|---|
| `lib/client.js`（改） | ① `__panelLoader` 修复：`import(url)` 裸说明符 → `import(new URL(url, document.baseURI).href)`（诊断 §1.2 根因修复）；② 删除 `sidebar.panellist` 行 + `main` 槽页注册及 `WikiStewardPanelIcon`/`WikiStewardPanelPage` 组件（改写为 `WikiStewardHistoryEntry` 历史入口 + `WikiStewardHistoryMount` 弹层挂载缝，`mount(el,{apiBase,view:'log'})`）；③ 设置节新增 `historyOpen` 开合态（函数形 updater 防陈旧闭包）；④ 失败兜底改述「wiki-steward 历史记录加载失败：…」如实报错 | ✅ 与验收 1/2/3/4 同向 |
| `test/client-face.test.mjs`（改） | 注册面断言改「仅 settings.section」；新增「面板搬家零残留」「历史入口开合行为」「历史弹层挂载/失败兜底」面；说明符回归锁两条（真 ESM fixture 解析 + bare specifier 判别力锁）；断言修订理由已内联注释 | ✅ 测试先行（TDD 红→绿材料） |
| `test/web-panel.test.mjs`（改） | 新增 `log-history.js` 状态机 4 测 + `view-model.js` 1 测（尾部 N 行/滚动加载拼前去重/错误留痕/视图选择） | ✅ |
| `web/src/lib/log-history.js`（新） | 历史记录数据面纯状态机（`PAGE_SIZE=200` 尾部 N 行、`applyLatest` 整页替换、`applyOlder` 复用 `prependChunk` 锚点去重拼前、`applyError` 留痕、`canLoadOlder` 闸门）——与原面板 App.vue 数据面语义一致 | ✅ |
| `web/src/lib/view-model.js`（新） | `resolveView`：`'log'`→日志视图，缺省/未知→全量面板（`mount(el,{apiBase})` 契约向后兼容） | ✅（brief 未点名但属任务 3「逻辑模块等复用」实现件，一并续用） |
| `web/src/components/LogHistoryView.vue`（新） | 历史记录容器（展示=既有 `IngestLogPanel.vue`，逻辑=log-history.js），`defineExpose({reload})` 供触发后刷新 | ✅（同上） |
| `web/src/App.vue`、`web/src/panel.js`（改） | 日志面收敛为 `LogHistoryView` 复用；`mount(el,{apiBase,view})` 按 `resolveView` 选视图 | ✅ |

**偏离申报：无。** WIP 全部改动均在 Task F1 验收面内（任务 3 说「逻辑模块 web/src/lib/log-history.js 等复用」——`view-model.js`/`LogHistoryView.vue` 即「等复用」的实现件）；未发现越界（未触 `package.json`/`kb-context`/`obsidian-web`/生产配置/样式对齐/手动 ingest/定时配置）。

### 1.2 本会话补的部分（WIP 未完成项）

1. **测试注释过滤器缺口修复（唯一红点收口）**：WIP 测试「面板搬家：源码零 sidebar.panellist/main 注册」用
   `source.split('\n').filter(l => !l.trim().startsWith('//'))` 剥注释——只剥 `//` 整行、**漏块注释**，
   `lib/client.js:322` JSDoc 记载「sidebar.panellist 行 + main 槽页已随『面板搬家』移除」的**注释字面**误报残留
   （红点=该测 1 条 fail）。收口=测试内新增 `stripComments()`（块注释 `/*…*/` 整段剥 + `//` 整行剥），
   两处源码扫描测试统一改用；**断言保持强形态（真代码零字面），不弱化断言、不改产线注释**（详见 §5）。
2. **web/dist 重建入库**：`npm run build`（vite lib 形）重建 `web/dist/panel.js`（144.70 kB）+
   `web/dist/style.css`（2.40 kB）；构建物含 LogHistoryView/视图选择逻辑（取证：dist 内
   `view) === "log" ? wc : Uc, { api:` 编译形）。
3. **全量验证 + 报告 + 具名路径 commit**（本文件即交付证据）。

---

## 2. TDD 过程（红→绿轨迹）

1. **盘点（第 0 步）**：`git diff -- wiki-steward` + `git status --short` 读全部 WIP；对照 tasks.md Task F1 验收
   与诊断报告 §1/§2/§5 判定方向一致（§1.1 表）。
2. **基线测量**：WIP 现状跑 `node --test` → **350 tests / 349 pass / 1 fail**（红点=上述过滤器缺口；
   红点测试本身是 WIP 先行写下的新契约测试=「注册面必须只剩 settings.section」，产线代码已满足、测试工具缺陷致假红）。
3. **修测试工具（非修断言）**：加 `stripComments()` 注释剥离（测试文件内联修订理由注释）→ 重跑
   `node --test` → **350/350 全绿**。
4. **构建物重建**：`npm run build` → dist 变更入库面确认（`git status`：`web/dist/panel.js` M；
   `style.css` 重建后字节不变故无 diff，非缺漏）。
5. **全量验证**：`npm run check`（16 个 `node --check` + `node --test`）→ **exit 0**。
6. **dist 新鲜度锁核对**：锁=`scripts/check-release.sh:38-65` commit 级校验（改 `web/src/**` 的 commit 必须同 commit
   带 `web/dist/` 变更）——本 commit 同含 `web/src/App.vue|panel.js|lib/log-history.js|lib/view-model.js|
   components/LogHistoryView.vue` 与 `web/dist/panel.js`，**锁不触发**（验证记 §4）。

新增测试全为先立契约后补实现/收口的形状（前实现者写测试、产线实现同批落；本会话以测试结果驱动收口），
按验收面拆分：注册面收敛 2 测、历史入口行为 1 测、弹层挂载/失败 2 测、说明符回归锁 2 测、log-history 状态机 4 测、
view-model 1 测。

---

## 3. 测试命令输出计数

| 命令 | 输出摘要 | 判定 |
|---|---|---|
| `node --test`（WIP 现状，基线） | `tests 350 / pass 349 / fail 1`（红点=client-face 注释过滤缺口） | 红（如实记录） |
| `node --test`（收口后） | `tests 350 / suites 0 / pass 350 / fail 0 / cancelled 0 / skipped 0` | ✅ |
| `npm run check` | `node --check` ×16 全过 + `node --test` 350/350；**exit 0** | ✅ |
| `npm run build` | `✓ 19 modules transformed`；`web/dist/style.css 2.40 kB`、`web/dist/panel.js 144.70 kB` | ✅ |

- **计数口径**：基线 342（tasks.md Task T 验收口径）→ 本批新增 8 测（`client-face` +3：面板搬家零残留 1 +
  说明符回归锁 2；`web-panel` +5：log-history 状态机 4 + view-model 1），342 → **350**，零回退：
  342 基线测试全部保留在场且绿（无删除、无 skip；随面板搬家改写的 4 条旧断言测试为原地换被测面，计数不变）。

---

## 4. 验收逐条证据

### 验收 1：dsh 首页侧栏不再出现 wiki-steward 面板行（sidebar.panellist 注册移除）

- 产线：`lib/client.js:321-323` 注册面收敛为「注册一面：①settings.section」；`sidebar.panellist`/`main`
  注册块与 `WikiStewardPanelIcon`/`WikiStewardPanelPage` 组件整体移除（全文件 grep：`sidebar.panellist`
  仅存注释记载 :12/:322，`WikiStewardPanelIcon`/`hHd-Xa` 零命中）。
- 测试：`test/client-face.test.mjs:162`「注册面=仅 settings.section」（`injected === ['settings.section']`）
  + `:172`「面板搬家：源码零 sidebar.panellist/main 注册与 PanelIcon」（源码零字面 + 运行时注册面零残留）。
- 运行时影响面（诊断 §2.1）：sidebar.panellist/main 消费方是宿主壳，无插件间引用——移除=首页无行、无槽页。

### 验收 2：wiki-steward-settings 页「查看历史记录」按钮 + 弹层呈现 ingest 日志查看能力（来源标注/尾部 N 行/滚动加载语义保持）

- 入口：`lib/client.js:251-273` `WikiStewardHistoryEntry`（「查看历史记录」/「收起历史记录」按钮，
  `aria-expanded` 随开合，:260）挂进设置节 `:231`；弹层 `role="dialog"`（:264-267）。
- 日志能力：弹层挂 `WikiStewardHistoryMount`（:283-）→ 动态 import `web/dist/panel.js` →
  `mount(el, {apiBase:'api/wiki-steward', view:'log'})`（:291-293）→ `web/src/panel.js` 按
  `resolveView(view)` 选 `LogHistoryView`（`web/src/lib/view-model.js`）。
- 语义保持（`web/src/lib/log-history.js` + `web/src/components/LogHistoryView.vue`，展示复用既有
  `IngestLogPanel.vue` 的来源标注/分组）：
  - **尾部 N 行**：`PAGE_SIZE = 200`（与原面板分页一致）+ `applyLatest` 整页替换；
  - **滚动加载**：`applyOlder` 走 `prependChunk` 锚点键去重拼前（不重不漏）+ `canLoadOlder` 仅 `hasMore` 才翻；
  - **来源标注**：`meta.sources` 沿用既有归一（`stale` 严格 `=== true` 判定，与原面板一致）。
- 测试：`test/client-face.test.mjs:209`（按钮文案/开合翻转/挂载容器随开合出没）、`:250`（`view:'log'` 契约
  + 不暴露手动 ingest 动作——F3 领地）、`test/web-panel.test.mjs:171-217`（状态机 4 测）+ `:219`（视图选择）。
- 构建物：`web/dist/panel.js` 含编译形 `view) === "log" ? wc : Uc, { api:`（视图选择真入 dist）。

### 验收 3：模块说明符报错不复现（诊断 §1 结论修正 + 回归锁）

- 修复：`lib/client.js:39-40` `exports.__panelLoader = function loadPanel(url) { return import(new URL(url, document.baseURI).href) }`
  ——说明符先转真 URL（`new URL(…, document.baseURI).href` 形，诊断 §1.2「正确姿势」两形之一），
  与 fetch 同基解析（`<base>` 有无两口径均正确，诊断 NEEDS_CONTEXT #3 不阻塞）。
- 回归锁（补诊断 §1.2 测试盲区——旧假缝测试两条链都看不见 bare specifier）：
  - `test/client-face.test.mjs:304`「真浏览器语义」：真 ESM 动态 import 真 fixture 模块（tmp 落
    `api/wiki-steward/panel.js`，`document.baseURI` 基址断言 `import.meta.url` 解析出绝对 URL）——**断言说明符可解析形**；
  - `:331`「回归锁判别力」：裸说明符 `import('api/wiki-steward/panel.js')` 在真 ESM 解析下必炸
    （`ERR_MODULE_NOT_FOUND`/Cannot find package）——锁对旧缺陷可见（判别力自证）。
- 文档相对契约保持：`test/client-face.test.mjs:139`（PANEL_URL 仍= `api/wiki-steward/panel.js` 无前导斜杠，
  消费面从 main 组件换到历史挂载组件）。

### 验收 4：裸类名文本（hHd-Xa_*）不再显示；加载失败容器内如实报错

- `hHd-Xa_*`：诊断 §1.3 判定其产生点=侧栏行标题 span（随 `sidebar.panellist` 行整体移除即消失，无需先修 label 机制）。
  证据：`test/client-face.test.mjs:172` 源码零 `hHd-Xa` 字面 + 注册面零残留；`lib/client.js` 全文 grep `hHd-Xa` 零命中。
- 加载失败如实报错：`lib/client.js:297-301` 兜底 `el.textContent = 'wiki-steward 历史记录加载失败：' + e.message`
  （不白屏不吞不留裸文本）；测试 `test/client-face.test.mjs:283`（断言 `/panel 404|加载失败/` 且 `/历史记录/`
  ——兜底为如实文案非裸类名）+ 双清理幂等。

### 验证命令汇总

| 验证项 | 命令 | 结果 |
|---|---|---|
| 全量测试 | `node --test`（wiki-steward/） | 350/350 绿（基线 342 零回退 + 新增 8） |
| 语法+测试 | `npm run check` | exit 0 |
| dist 新鲜度锁 | commit 级核对（`scripts/check-release.sh:38-65` 规则：web/src 变更须同 commit 带 web/dist） | 本 commit 同含 web/src ×5 + web/dist/panel.js，锁不触发 |
| 红线面 | `git status --short` | 仅 wiki-steward/ 内文件；`package.json`/`kb-context`/`obsidian-web`/生产配置/依赖面零改动 |

---

## 5. 断言修订理由清单

| # | 修订点 | 理由 | 性质 |
|---|---|---|---|
| 1 | 注册面断言 `['settings.section','sidebar.panellist','main']` → `['settings.section']`（client-face :162） | 用户诉求=不显示在 dsh 首页，sidebar.panellist 行 + main 槽页随面板搬家移除（验收 1） | 语义修订（随能力移除） |
| 2 | 「面板两面注册形」整条测试 → 「历史入口行为面」（:209） | 同上；旧测试测的注册契约已不存在，改为测新能力（按钮开合/弹层出没） | 语义修订（换被测面） |
| 3 | 「main 槽页挂载 Vue 面板」→「历史弹层挂载日志视图」`mount(el,{apiBase,view:'log'})`（:250） | 能力搬家语义保持：挂载契约不变，驱动面从 main 组件换到历史挂载组件；`view:'log'` 断言同时锁「不暴露手动 ingest 动作」（F3 领地不越界） | 语义修订（搬家+断言更严） |
| 4 | 失败兜底断言文案「面板加载失败」→「历史记录加载失败」+ `/历史记录/` 断言（:283） | 兜底文本随能力搬家改述；新增「非裸类名/裸文本」断言（验收 4） | 语义修订（文案随搬家） |
| 5 | PANEL_URL 文档相对断言驱动面改走历史弹层挂载缝（:139） | main 槽页移除后旧驱动面不存在；URL 契约本身保留（历史入口仍加载 panel.js 日志视图） | 驱动面改写（断言语义不变） |
| 6 | 源码扫描测试注释剥离 `//`-行过滤 → `stripComments()`（块注释+行注释全剥）（:84-97、:139、:172） | **测试工具缺口修正，非断言语义变更**：原过滤漏块注释，`lib/client.js:322` JSDoc 记载注释字面误报残留（假红）；修过滤器保断言强形态（真代码零字面），产线注释不为测试让路 | 工具修正（断言保持强形态） |
| 7 | 假 React `useState` setter 补函数形 updater（:44） | React 真语义补齐（`prev => next` 形更新）——设置节 delta 更新需要；测试假缝更真，非断言让步 | 测试假缝补真 |

---

## 6. NEEDS_CONTEXT / concerns

1. **NEEDS_CONTEXT（不阻塞本卡）**：裸类名 `hHd-Xa_*` 的最终渲染路径（诊断 NEEDS_CONTEXT #1）仍无法只读钉死
   （label 数据链静态闭环无污染路径）；本卡按诊断结论「随行移除即消失」处置，源码/注册面零残留断言防回归。
   若 tester 复测发现首页仍有裸类名，需现场 DOM outerHTML 再查宿主侧。
2. **F2 边界留痕**：弹层壳为最小结构内联样式（fixed 覆盖 + 限高滚动，`lib/client.js:243-244`），
   **样式/token 对齐明确留 F2 收口**（本卡不越界改样式、不动 `package.json` 的 `dsh.client.inject`——
   诊断 §2.2 提到的 primitives `Modal` 形属 F2 选型）。
3. **工作树遗留非 F1 领地未跟踪文件**（未纳入本 commit，留给派发方/归档事务处置）：
   `wiki-steward/changes/` 其余文档（diagnostic-report.md/tasks.md/ledger.md 等）、`overview.md`、
   `source-of-truth/`、`.cp-init.json`、`.cp-visual-skip`、`.write-registry.json`。
4. `web/dist/style.css` 重建后字节不变（内容零变更）故 git 无 diff——非缺漏；dist 新鲜度锁按 commit 级
   「web/src 变更伴 web/dist 文件变更」判定，本 commit 含 `web/dist/panel.js` 已满足。
