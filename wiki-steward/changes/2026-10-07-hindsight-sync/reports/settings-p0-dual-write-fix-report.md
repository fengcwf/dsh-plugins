# t19 P0 修复报告：hindsight 双源写入口（摘 rows 三行 + 契约同步）

- **日期**：2026-10-09（hindsight-sync 波次）
- **任务**：t19（kind=implementation，attempt 1）
- **裁定**：`changes/2026-10-07-hindsight-sync/solution-design-settings.md` R-29
- **症状**（队长复验事实）：`lib/client.js:77-79` 三个 rowCard（hindsight.enabled / sync.schedule.enabled / sync.schedule.time）与 HindsightSyncPanel 六控件（App.vue toggle / save-time）写同一组键；config 挂载 GET 一次不重拉 → **面板写完美后 rows 显旧值、底部保存=后写覆盖先写**。

## 一、R-29 裁定引用（为什么摘除而非镜像/刷新）

> **R-29 双源控件 → 摘除 rows 三行**（`:77-79`）。面板=功能主入口（六控件+实时状态），**rows 保留=双源永存（P0 无法靠刷新根治——两个独立保存通道永远可交叉）**；降只读=仍占 3 行噪音；加刷新=治标。代价：契约面动 3 处……已判「面板即唯一入口」符合 U2/U3 设计初衷（六控件本来就是这些键的专属 UI）。
> —— `solution-design-settings.md:17`

三个备选的否决理由：**镜像/保留 rows**=双源永存（两个独立保存通道永远可交叉，P0 无法靠刷新根治）；**降只读**=仍占 3 行噪音且语义误导；**加刷新**=治标（交叉写窗口仍在）。故摘除 rows 三行、面板为唯一入口。

## 二、diff 摘要

**① rows 摘除（唯一入口化）**——`lib/client.js`（+3/-3）：

```diff
       { path: ['ingest', 'schedule', 'time'], kind: 'time', label: '定时蒸馏执行时间（HH:MM）', note: '…' },
-      { path: ['hindsight', 'enabled'], kind: 'boolean', label: 'Hindsight 记忆同步开关（L1 启停，热改立即生效）', note: '关闭即停同步行为（手动/定时均不跑）；同步=机械转录记忆到 raw/06-hindsight/，不做语义编译。' },
-      { path: ['hindsight', 'sync', 'schedule', 'enabled'], kind: 'boolean', label: 'Hindsight 定时同步开关', note: '开启后每日到点触发记忆机械转录（与定时蒸馏错峰，缺省 03:25）。' },
-      { path: ['hindsight', 'sync', 'schedule', 'time'], kind: 'time', label: 'Hindsight 定时同步时间（HH:MM）', note: '缺省 03:25——在 wiki-ingest 00:25 之后错峰执行。' },
+      // ⚠️ R-29（t19 P0 双源根治）：hindsight 三行已摘——面板六控件为唯一写入口；被摘 note 文案已迁移
+      // 进面板提示位（HindsightSyncPanel 唯一入口说明），此处不保留镜像行（双源永存=P0 无法靠刷新根治）。
     ]
```

**grep 证明（验收①）**：`grep -n 'hindsight\|Hindsight' lib/client.js` → 仅剩挂载缝与展示面：头注（:24-26 挂载缝说明）、摘除留痕注释（:77-79）、挂载容器 CSS（:130 `.wiki-steward-hindsight-mount`）、挂载缝（:370-372 `WikiStewardHindsightMount`）、挂载钩子文案（:465+ 「Hindsight 同步」加载失败提示）；**EDITABLE_FIELDS 零 hindsight 叶**（三行已摘，② 一致性测试钉住）。

**② 契约同步（缺一即红测）**：

| 面 | diff 摘要 |
|---|---|
| `lib/settings-write.js`（+17/-13） | `EDITABLE_PATHS` 摘 3 叶（10→7）；新增 `HINDSIGHT_EDITABLE_PATHS`（3 叶专属写面白名单）；`checkPatchEditable`/`projectEditable`/`applyEditablePatch`/`createApplyPatch` 穿 `editablePaths` 参数（缺省=通用面，行为不变） |
| `lib/hindsight-routes.js`（+33/-6） | 写缝改 `applyHindsightPatch`（专属 3 叶白名单）；**新增 `POST /hindsight/settings`**（面板专属写面：schedule.enabled/time 等 3 叶，与 toggle 同缝） |
| `lib/index.js`（+5/-2） | 双缝接线：通用 `applyPatch`（7 叶，rows/POST settings 面）+ `applyHindsightPatch`（3 叶，/hindsight/* 面） |
| `web/src/api.js`（+9/-1） | 新增 `saveHindsightSettings`→`POST /hindsight/settings`（文档相对）；`saveSettings` 保留为通用面（hindsight 键已摘=整单拒） |
| `web/src/App.vue`（+1/-1） | `saveHindsightTime` 改走 `saveHindsightSettings`（面板写路径离开通用白名单面） |
| `web/src/components/HindsightSyncPanel.vue`（+1/-1） | :33-35 提示位改**唯一入口说明**，并入被摘三条 note 语义（L1 关闭即停/定时错峰 03:25/机械转录不做语义编译）——防残留或重复 |

> **R-29「契约面动 3 处」补全说明**：摘 `EDITABLE_PATHS` 3 叶后，面板原写路径（toggle→applyPatch、save-time→POST /settings）会穿通用白名单被 `not_editable` 整单拒（面板写入即断）。故契约面实际为 3+N：补 `HINDSIGHT_EDITABLE_PATHS` 专属写缝 + `/hindsight/settings` 端点 + api.js/App.vue 改道——使「摘叶」与「面板仍可写」同时成立（面板=唯一写入口的协议层闭环）。

**③ 测试随摘（修订理由入断言注释）**：

| 测试 | 随摘 |
|---|---|
| `test/settings-write.test.mjs` | 白名单断言 10→7 叶 + 新增 `HINDSIGHT_EDITABLE_PATHS` 3 叶断言 + **摘叶判死**（通用面 `isEditablePath`/`checkPatchEditable` 对 hindsight 键整单拒、专属面可写且 3 叶之外同样拒） |
| `test/hindsight-routes.test.mjs` ② | 双侧一致性 10→7 叶同集同序 + 摘叶判死（serverPaths/clientPaths 均不含 hindsight 三叶）+ 专属白名单 3 叶断言 |
| `test/hindsight-routes.test.mjs` ⑥ | 写缝改专属（`createApplyPatch(editablePaths: HINDSIGHT_EDITABLE_PATHS)`）；**新增**：`POST /hindsight/settings` schedule.time 写入 roundtrip 回读一致、通用 `POST /settings` 写 hindsight 键=400 not_editable（双源根治判死+被拒不落盘）、专属面 3 叶之外整单拒（写面不放大）、缺缝 503 双端点如实 |
| `test/ingest-routes.test.mjs` | `data.editable` 顺序断言随摘（10→7，理由注释） |
| `test/hindsight-ui-model.test.mjs` | api.js 端点形清单 +`hindsight/settings` + `saveHindsightSettings` 字面断言（发布物面 fetch 面随改） |

## 三、测试输出原文

受影响两套（`node --test test/hindsight-routes.test.mjs test/settings-write.test.mjs`）：

```
✔ ② 双侧一致性：settings-write EDITABLE_PATHS ↔ client.js EDITABLE_FIELDS 同集同序（现无测试=静默缺陷源）
✔ ⑥ toggle roundtrip：真 applyPatch（configEditor 最小缝）→ GET settings 回读一致 + editable 同列表回显
✔ 可改白名单契约：7 叶子（R-29 摘 hindsight 三项——面板唯一写入口）；HINDSIGHT 专属面 3 叶；vaultRoot / write.readOnly 永不在列（INV-7 语义勿动）
ℹ tests 18
ℹ pass 18
ℹ fail 0
```

合同 verify `cd wiki-steward && node --test 2>&1 | tail -5`：

```
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4996.434843
```

全量口径：**tests 463 / pass 463 / fail 0**（基线 463 持平，零回退）。

## 四、发布物面（动 .vue/api.js → LRN-045）

`pnpm build` 重建 `web/dist`（`panel.js` 115.89 kB / `style.css` 5.33 kB）入库；dist 字面判据（实测 grep `web/dist/panel.js`）：

```
hindsight/settings       1     ← 面板专属写面端点（新）
唯一写入口               1     ← 面板提示位唯一入口说明（新 note）
saveHindsightSettings    2     ← 面板写路径改道字面（新）
关闭即停同步行为         1     ← 被摘 note 语义迁移进面板（防残留/重复）
```

（既有 dist 锁全绿：`web-panel.test.mjs` dist 字面/色板锁、`hindsight-ui-model.test.mjs` 端点形/六控件/色值锁、`dist-browser-load.test.mjs` 4/4——463/463 实证。）

## 五、changedPaths 与越界申报

- `wiki-steward/lib/client.js`（rows 摘三行+留痕注释）
- `wiki-steward/lib/settings-write.js`（EDITABLE_PATHS 摘 3 叶 + HINDSIGHT_EDITABLE_PATHS + editablePaths 穿线）
- `wiki-steward/lib/hindsight-routes.js`（专属写缝 + POST /hindsight/settings）
- `wiki-steward/lib/index.js`（双缝接线）
- `wiki-steward/web/src/api.js`、`web/src/App.vue`、`web/src/components/HindsightSyncPanel.vue`、`web/dist/panel.js`（写路径改道 + note 迁移 + 重建入库）
- `wiki-steward/test/{settings-write,hindsight-routes,ingest-routes,hindsight-ui-model}.test.mjs`（随摘修订+判死探针）
- `wiki-steward/changes/2026-10-07-hindsight-sync/reports/settings-p0-dual-write-fix-report.md`（本报告）

**越界申报：无。** `package.json`/`CHANGELOG.md`/`README.md`/`docs/` 零触碰；无发版动作。
