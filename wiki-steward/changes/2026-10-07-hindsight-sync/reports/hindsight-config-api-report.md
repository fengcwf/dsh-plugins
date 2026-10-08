# t9 Config 扩键 + Hindsight API 4 端点报告（U2/U3 数据面）

- **日期**：2026-10-08（hindsight-sync 波次）
- **任务**：t9（kind=implementation，attempt 1）
- **依据**：`changes/2026-10-07-hindsight-sync/solution-design.md` §5 + phase0 侦察 B 卡必红清单
- **产出**：`lib/hindsight-routes.js`（新建 247 行）+ `test/hindsight-routes.test.mjs`（新建 310 行，7 测试）+ 四处同步面扩键 + 3 处必红断言修订

## 一、Config 扩键（solution-design §5 形）

`lib/index.js` 顶层新增 `hindsight` 键组：`{enabled:false, apiUrl:'http://127.0.0.1:8888', banks:[], sync:{schedule:{enabled:false, time:'03:25'}}}`——嵌套默认值**全部 `.prefault({})`**（zod v4 `.default({})` 短路实测坑；测试①以「部分形配置照样填满内层」判死探针钉住）。缺省 `enabled:false`=零行为变化（旧配置 parse 后行为零变化，向后兼容断言保留）。

## 二、四处同步面逐处证据（缺一不可）

| # | 位置 | 改动 | 证据 |
|---|---|---|---|
| 1 | `lib/index.js` Config | `hindsight` 键组 §5 形 + `.prefault({})` | 测试①（默认值/嵌套 prefault/HH:MM 真校验/向后兼容）+ `load.test.mjs` 修订断言全绿 |
| 2 | `lib/settings-write.js` EDITABLE_PATHS | +3 叶：`hindsight.enabled`、`hindsight.sync.schedule.enabled`、`hindsight.sync.schedule.time` | `settings-write.test.mjs` 10 叶子断言 + `checkPatchEditable` 白名单预检（toggle 写面真跑） |
| 3 | `cordis.patch.yml` 默认值 | +`hindsight:` 块（enabled/apiUrl/banks/sync.schedule 全键缺省值） | 测试②断言 yml 含 `hindsight:`/`enabled: false`/`apiUrl`/`banks: []`/`schedule:`/`time: '03:25'` |
| 4 | `lib/client.js` EDITABLE_FIELDS | +3 条（boolean/boolean/time + 中文 label/note） | 测试②双侧同集断言（见下） |

**新增一致性测试（静默缺陷源补锁，B 卡点名）**：测试② 抽取 client.js `EDITABLE_FIELDS` 全部 `path:[…]` 与 `EDITABLE_PATHS` **同集同序 deepEqual**（10 叶）+ cordis.patch.yml 默认值面键齐断言——两侧漂移即红（现无测试=静默缺陷源，本波补上）。

## 三、API 4 端点（单 prefix `/api/wiki-steward` 内部分发，authGate+methodGuard 同款）

`lib/hindsight-routes.js`（真 handler 经 `lib/ingest-routes.js` 单 prefix 分发缝挂入——`registerIngestRoutes` 新增 `hindsight` 分发缝参数，未知 `/hindsight/*` 路径落静态面 404 如实）：

| 端点 | 语义 | 关键锁 |
|---|---|---|
| `GET /hindsight/status` | 状态分析：`diagnose.config`（`~/.hindsight/coding-agent.json` 直读，官方字段名 `path/exists/api_url/api_token_configured/disabled`）+ `sync_status{bank,activeOps,synced}`（`/banks/{id}/operations` 实测计数 `status∈{pending,processing}`；`synced=activeOps===0`——scout §主判据）+ `banks[]`（`/banks` 官方字段 `id/fact_count/last_write_at/created_at` 活值不缓存）+ 插件面 `enabled`/`schedule`（Config 口径名）。**勿自造字段名**：取不到=如实 `null`+`warnings` 留痕，绝不编造 | 测试③：官方字段 deepEqual、activeOps=3 实测计数、API 挂→sync_status null+warnings |
| `POST /hindsight/sync` | 手动同步 **detached**（不阻塞请求）：L1 门禁（`hindsight.enabled=false`→`reason:'disabled'`）+ 单飞（进行中→`reason:'already-running'`）+ 回执 `{started,reason,note}` 三键（ingest/distill 同款形） | 测试④：disabled 回执、detached（deferred 引擎未 resolve 即已回执）、单飞、落地后可再触发 |
| `GET /hindsight/sync-log?since&until` | 同步日历数据源：jsonl 逐行 + `since/until`（YYYY-MM-DD 闭区间）过滤 + 畸形行跳过计数留痕；**非法参 400**（格式错/区间倒置）；文件缺=空不造数 | 测试⑤：过滤/单边/缺省全量/3 组非法参 400/畸形行 skipped=1 |
| `POST /hindsight/toggle` | L1 启停写面：走 **settings 同一持久化机制**（`createApplyPatch` 白名单缝，裸 patch 直传与 `settingsPost` 同款）；`enabled` 非布尔=400、缺写缝=503 如实 | 测试⑥ roundtrip 判死探针（见下） |

## 四、真对真 roundtrip 测试（LRN-047 禁两侧 mock）

测试⑥：真 `createApplyPatch`（configEditor 宿主最小缝 `entries`+`edit`，`change` 回调真跑 `applyEditablePatch` 真 zod 校验）+ 真 handler 打真端点——**非默认值（`enabled:true`）save → GET settings 回读一致**（roundtripPreserved 判死探针：写侧不持久化或读侧取旧值即红）+ 回关往返 + `editable` 回显 **= EDITABLE_PATHS 同列表**（`ingest-routes.test.mjs:249` 同款双侧一致）+ 非法体 400 + 缺写缝 503。

## 五、必红清单（侦察 B 卡）逐条应对

| # | B 卡必红项 | 应对 | 状态 |
|---|---|---|---|
| 1 | `load.test.mjs:29` Config 顶层键集 deepEqual | **断言修订**（expected +`hindsight` 键组）+ 修订理由注释（ingest 键先例 :39-42 形制）；原 6 组键默认值逐条锁定不变 | ✅ 修订（理由入断言注释） |
| 2 | `settings-write.test.mjs:13` EDITABLE_PATHS 7 叶子精确列表 | **断言修订** 7→10 叶子 + 修订理由注释（原 7 叶逐条在列，扩展非弱化） | ✅ 修订 |
| 3 | `ingest-routes.test.mjs:249` editable 回显同列表 | **断言修订** +10 叶子 + 修订理由注释（响应契约形 data 四键不变） | ✅ 修订 |
| 4 | `client-face.test.mjs:761` + `web-panel.test.mjs:239` 色值/暗色分支 | t9 零 UI 样式改动（client.js 只加 EDITABLE_FIELDS 文案条目，无 hex/rgb/hsl/`prefers-color-scheme`）→ 两锁**保持绿**（440/440 实证） | ✅ 不触发（UI 归 t10，届时沿用 token 纪律） |
| 5 | `dist-browser-load.test.mjs` Node 全局残留 | `web/dist` 零改动（t10 统一重建）→ 锁保持绿 | ✅ 不触发 |
| 6 | 🔴 假绿陷阱（漏 build 时 dist 三锁仍绿） | 发布物面归 t10（本波 out of scope web/dist）；**留给 t10 的必验提醒**：dist 重建入库 + LRN-045 字面判据 + 既有 dist 字节比对锁（`ingest-routes.test.mjs:362`）同 commit | ✅ 留痕移交 |
| 补 | EDITABLE_PATHS ↔ EDITABLE_FIELDS 一致性（静默缺陷源） | **新增测试②** 双侧同集同序 + cordis.patch.yml 默认值面键齐 | ✅ 新锁 |

**GET settings 响应键集精确断言核对**（合同点名 `apply-integration.test.mjs:293`）：该断言= `Object.keys(data)` 四键（config/editable/readOnly/writable）——本波响应**键集不变**（config 内容含新键但键集断言面不动），故**无需修订、零触碰**（440/440 实证）。

## 六、测试输出原文

`node --test test/hindsight-routes.test.mjs`：

```
✔ ① Config hindsight 键组：§5 形默认值 + 嵌套 .prefault 填内层 + HH:MM 真校验
✔ ② 双侧一致性：settings-write EDITABLE_PATHS ↔ client.js EDITABLE_FIELDS 同集同序（现无测试=静默缺陷源）
✔ ③ status 口径：diagnose.config 五字段直读 + sync_status{bank,activeOps,synced} + banks 官方字段（活值）
✔ ③ 鉴权/方法守卫：status 过 authGate + methodGuard（401/405 如实）
✔ ④ sync：L1 未启用回执 disabled；启用=detached 不阻塞 + 单飞 already-running；落地后可再触发
✔ ⑤ sync-log：since/until 闭区间过滤 + 缺省全量 + 非法参 400（区间倒置/格式）+ 畸形行留痕
✔ ⑥ toggle roundtrip：真 applyPatch（configEditor 最小缝）→ GET settings 回读一致 + editable 同列表回显
ℹ tests 7
ℹ pass 7
ℹ fail 0
```

合同 verify `cd wiki-steward && node --test 2>&1 | tail -5`：

```
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5023.306927
```

全量口径：**tests 440 / pass 440 / fail 0**（基线 433 + 新增 7，零回退；3 处必红断言按上表修订，其余零触碰）。

## 七、changedPaths 与越界申报

- `wiki-steward/lib/hindsight-routes.js`（新建 247 行：4 端点 handler + createSyncStarter + collectStatus/readDiagnoseConfig/readSyncLogLines）
- `wiki-steward/test/hindsight-routes.test.mjs`（新建 310 行，7 测试）
- `wiki-steward/lib/index.js`（Config +hindsight 键组 + 数据面接线：引擎工厂/触发器/statusProbe 注入）
- `wiki-steward/lib/settings-write.js`（EDITABLE_PATHS +3 叶）
- `wiki-steward/lib/client.js`（EDITABLE_FIELDS +3 条）
- `wiki-steward/lib/ingest-routes.js`（HTTP 辅助导出 + `hindsight` 分发缝委托；既有端点零改动）
- `wiki-steward/cordis.patch.yml`（+hindsight 默认值块）
- `wiki-steward/test/load.test.mjs`、`test/settings-write.test.mjs`、`test/ingest-routes.test.mjs`（3 处必红断言修订+理由注释）
- `wiki-steward/changes/2026-10-07-hindsight-sync/reports/hindsight-config-api-report.md`（本报告）

**越界申报：无。** `web/src`、`web/dist` 零改动（UI/发布物面归 t10）、`/root/.dsh/` 零触碰、无发版动作。全部模块 `node --check` 通过，依赖仅既有内部模块（ingest-routes/settings-write/hindsight-sync）。
