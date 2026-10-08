# t12 Hindsight 设置节 UI 实现报告（2026-10-07 波，U2/U3 用户面）

> 卡：t12（implementation）｜attempt 1｜attempt_id `75cf70bf-3fec-4a52-8de6-37198b78efcd`
> 落点纪律：文档唯一落点 `wiki-steward/changes/2026-10-07-hindsight-sync/`；inScope=`web/src/`、`web/dist/`、`test/`、本目录。
> 依赖：t8（lib/hindsight-sync.js 同步引擎）+ t9（Config 扩键 + lib/hindsight-routes.js 4 端点）已完成——本卡纯 UI 面，零触碰 `lib/`。

## 0. 合同口径裁定（A/C 方案冲突，须队长确认留痕）

合同 objective 写「方案 A=扩 WikiStewardSettingsSection 零构建 React，R-8 裁定」，但同一合同：
① inScope 明文排除 `wiki-steward/lib/`（而 WikiStewardSettingsSection 在 `lib/client.js`，方案 A 必须改 lib/）；
② 验收明文强制 `.vue 只做展示`、`新增逻辑进 web/src/lib/ 纯模块`、`组件 ≤300 行`、`pnpm build 重建 web/dist`、`dist 字面判据`——这五条全部是**方案 C（Vue 面板）**语义，方案 A（「不碰 dist」）一条都满足不了。

**裁定：按 inScope + 验收面执行方案 C**（侦察卡 `scout-wiki-steward-web.md` 选项 C 原文形：`web/src/components/HindsightSyncPanel.vue` + `App.vue 挂载位`，「同步日历这类重交互 UI 适合此路」）。验收数组以合同 acceptance 原文为机械判据。

**可达性缺口（如实留痕，非本卡越界可解）**：`web/src/App.vue` 全量面板当前在运行时无消费方（`lib/client.js:474` 历史弹层硬传 `view:'log'`，scout 实测记录在案「view:'full' 无人消费……可以利用的空位」）。六控件已在面板挂载位落位，但**要进「wiki-steward · 设置」设置节还需 `lib/client.js` 加一处挂载**（把设置节内折叠区挂 `view:'full'` 或新 view 值）——`lib/` 归 t8/t9 后端面且本卡 inScope 明文排除，未动。建议：t13 终审裁定后由队长派后续小卡（1 行挂载 + client-face 测试断言修订），或用户裁定并入下一波。

## 1. 产出文件（changedPaths）

| 文件 | 性质 | 行数 |
|---|---|---|
| `web/src/lib/hindsight-model.js` | 新建：纯模块（日历聚合/状态徽标判定/时间校验/L2 三态/动作状态机） | 134 |
| `web/src/components/HindsightSyncPanel.vue` | 新建：六控件展示组件（判定逻辑零持有） | 129 |
| `web/src/App.vue` | 扩：Hindsight 节挂载位 + 数据编排（两路加载各报各错） | 157 |
| `web/src/api.js` | 扩：5 方法（hindsight status/sync/sync-log/toggle + settings 时间写面） | 59 |
| `web/src/styles.css` | 扩：`.ws-hs-*` 纯 token 样式 | 303 |
| `web/dist/panel.js` + `web/dist/style.css` | `pnpm build` 重建入库（LRN-045） | 115134B / 5333B |
| `test/hindsight-ui-model.test.mjs` | 新建：11 条（纯模块 7 + 端点形 1 + 落位纪律 1 + dist 判据 2） | 169 |
| 本报告 | 证据落盘 | — |

## 2. 六控件落位（solution-design §4 表逐行）

| §4 控件 | 落位（data-hs-role 语义键） | 数据源（文档相对端点） | 判定逻辑（纯模块） |
|---|---|---|---|
| 状态条（bank 数/fact_count/activeOps/synced 徽标） | `data-hs-role="status-bar"` | `GET api/wiki-steward/hindsight/status`（diagnose/sync_status 官方口径） | `statusBadges()`——synced 判据=activeOps===0（scout 主判据）；`sync_status` 取不到=「同步状态未知」如实不编造 |
| 「立即同步」按钮 | `data-hs-role="sync-button"` | `POST api/wiki-steward/hindsight/sync`（detached 单飞，回执 note 如实原文） | `beginAction/finishAction` 动作状态机 |
| 同步日历（按日计数条，非全尺寸网格） | `data-hs-role="sync-calendar"` | `GET api/wiki-steward/hindsight/sync-log`（t8 jsonl 逐行） | `aggregateSyncCalendar()`——dateKey 聚合降序、pct 相对峰值、畸形行计入 dropped 如实 |
| HH:MM 同步时间输入 | `data-hs-role="sync-time"`（+ `time-save`） | `POST api/wiki-steward/settings` {patch:{hindsight:{sync:{schedule:{time}}}}}（settings 四处同步面，t9 白名单叶子） | `isValidHhmm/normalizeHhmm`（严格 HH:MM，非法=null 不改写输入） |
| L1 启停开关 | `data-hs-role="l1-toggle"` | `POST api/wiki-steward/hindsight/toggle` {enabled}（热改立即生效） | `statusBadges` L1 徽标 + `l1Enabled` 派生 |
| L2 只读「⏳ 待重启」徽标展示区（写按钮后置不做） | `data-hs-role="l2-badges"` | `status.diagnose.config`（`~/.hindsight/coding-agent.json` 直读口径） | `l2View()`——disabled 三态（true/false/未知）+ 徽标常驻「⏳ 待重启」 |

加载失败如实报错：status / sync-log 两路独立 try-catch，各自 `ws-error` 原文展示（`Hindsight 状态加载失败：…`／`同步日历加载失败：…`），不白屏不吞错；`status.warnings` 逐条渲染。

## 3. 端点口径（文档相对、无前导斜杠——B 卡实测坑）

`web/src/api.js` 五个新方法全走 `` `${base}/…` `` 拼接，base 由挂载缝注入 `'api/wiki-steward'`（`lib/client.js` API_BASE 同值）→ 运行时 URL=`api/wiki-steward/hindsight/{status,sync,sync-log,toggle}`，零前导斜杠。测试锁：`hindsight-ui-model.test.mjs`「api.js 端点形」——正向断言 5 处 `${base}/…` 拼接形在场 + 反向 `doesNotMatch(/['"`]\/(?:api\/)?(?:wiki-steward\/)?hindsight/)` 零前导斜杠字面。

## 4. UI 约束面（B 卡必红清单逐条）

- **零硬编码色值**（hex/rgb/hsl）+ **零 `prefers-color-scheme`/`data-ds-dark-theme` 分支**——源码面扫描零命中佐证：

```
$ grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|prefers-color-scheme|data-ds-dark-theme' web/src/
grep exit=1（1=零命中）
```

色板唯一来源= `--dsw-alias-*` / `--dsw-radius-*` token（`.ws-hs-badge-*`、`.ws-hs-bar`、`.ws-hs-switch` 全 token）。既有双测试锁照旧全绿：`client-face.test.mjs:761`（SETTINGS_CSS 色值锁）+ `web-panel.test.mjs:239`（styles.css 色值锁）。
dist 面同锁（新增 `dist 色值锁` 测试）：hex 仅容 esbuild 对关键字 `transparent` 的等价改写 `#0000`（4 处，`border-color:transparent` 压缩产物，非手写色值），其余 hex/rgb/hsl 零命中——本锁先红后绿实证（首跑 hex 全禁断言恰红在 `#0000`，收窄为「仅容 #0000」后绿）。
- **不引第三方 UI 库**：控件全自绘（原生 `button`/`input[type=time]`/`input[type=checkbox][role=switch]`）+ dsh token；`package.json` 依赖面零变化（vue/vite 既有 devDeps）。
- **组件纪律**：判定逻辑全在 `web/src/lib/hindsight-model.js` 纯模块（零框架依赖，node --test 直测）；`.vue` 只做展示（computed 派生 + emit）；`HindsightSyncPanel.vue` 129 行、`App.vue` 157 行（均 ≤300，测试已钉）。

## 5. dist 字面判据 grep 原文（LRN-045 防假绿）

```
$ for k in status-bar sync-button sync-calendar sync-time l1-toggle l2-badges; do printf 'data-hs-role=%s → ' "$k"; grep -c -- "$k" web/dist/panel.js; done
data-hs-role=status-bar → 1
data-hs-role=sync-button → 1
data-hs-role=sync-calendar → 1
data-hs-role=sync-time → 1
data-hs-role=l1-toggle → 1
data-hs-role=l2-badges → 1
$ grep -o '立即同步\|同步日历\|待重启\|Hindsight 同步' web/dist/panel.js | sort | uniq -c
      2 Hindsight 同步
      2 同步日历
      1 待重启
      1 立即同步
$ grep -c 'hindsight/status' web/dist/panel.js
1
```

dist 陈旧即红：同判据进测试（`dist 字面判据`），源码改动未重建 = 恰红「dist 陈旧，先跑 pnpm build」。

## 6. 测试与验证

新增 11 条（`test/hindsight-ui-model.test.mjs`，纯模块单测 ≥3 满足：日历聚合×2 / 状态徽标判定×2 / 时间校验×1 / L2×1 / 动作机×1 + 端点形×1 + 落位纪律×1 + dist 判据×2）：

| # | 测试 | 覆盖 |
|---|---|---|
| 1-2 | aggregateSyncCalendar 逐日聚合 / 畸形行+limit | 日历聚合（验收点名） |
| 3-4 | statusBadges synced 口径 / 取不到不编造+activeOps | 状态徽标判定（验收点名） |
| 5 | isValidHhmm/normalizeHhmm 严格形 | 时间校验（验收点名） |
| 6 | l2View 三态 +「⏳ 待重启」 | L2 徽标 |
| 7 | 动作状态机 | sync/toggle/time |
| 8 | api.js 端点形（零前导斜杠） | B 卡实测坑 |
| 9 | 六控件语义键+文案+≤300 行 | §4 逐行落位 |
| 10-11 | dist 字面判据 / dist 色值锁 | LRN-045 |

验证命令（合同 verify 形）：

```
$ cd wiki-steward && node --test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
ℹ tests 451
ℹ pass 451
ℹ fail 0
（基线 440（t9 后）+ 新 11 = 451，零回退）

$ cd wiki-steward && pnpm build 2>&1 | tail -3 && node --test test/dist-browser-load.test.mjs ...
web/dist/panel.js   115.13 kB │ gzip: 35.92 kB
✓ built in 212ms
✔ ① 残留锁 … ✔ ② Node 全局残留锁 … ✔ ③ 真浏览器语义加载锁 … ✔ ④ 判别力 …
ℹ tests 4 / ℹ pass 4 / ℹ fail 0
```

## 7. 越界与遗留

- **越界：无**。`lib/`（t8/t9 后端面）/ `/root/.dsh/`（生产配置）/ 发版动作零触碰；`git status` 中 `wiki-steward/lib/*`、`test/{load,settings-write,ingest-routes}.test.mjs` 等改动属 t8/t9/t10 产物，非本卡。
- **遗留①（可达性缺口）**：设置节挂载位在 `lib/client.js`（out of scope），见 §0——建议 t13 裁定后派后续小卡。
- **遗留②（合同 A/C 口径）**：objective 文案与验收面不一致，本报告 §0 记录裁定理由，请队长校准合同措辞（防 t13/t11 按方案 A 口径误判）。
- **后置不做（合同明示）**：L2 写配置按钮（「写按钮后置不做」）；同步完成自动刷新日历（detached 语义下无完成事件，用户可用「刷新状态」手动拉取——如实不伪造完成时间）。
