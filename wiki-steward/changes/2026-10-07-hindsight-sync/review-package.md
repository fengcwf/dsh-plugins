# review-package.md — 设置页波整面终审（t21，reviewer-pro）

> 门禁文件（灵犀协议阶段门禁）：整面终审结论落此；明细证据见 `reports/t21-settings-final-review.md` 引用的各卡报告与本包 §三-§五 原文。
> 被审：t19（P0 双源写修复）+ t20（六组重排 + 运行逻辑图）合流面，reviewedTaskId 锚 t20。
> 对照：`solution-design-settings.md` §2-§3（R-29~R-34）逐条。

## 一、总裁定

**verdict = pass**（4/4 验收项全过；0 blocker/high/medium；1 条 nit 级留痕见 §六）

| 验收项 | 结果 | 一句话证据 |
|---|---|---|
| t19/t20 合同验收逐条核对（file:line + 输出原文） | passed | §三逐条表；466/466 全绿（基线 463+3 零回退） |
| P0 根治验证（唯一写入口 + EDITABLE 双侧同集同序 7 叶 + data.editable 回显） | passed | §四 grep 原文 + MA/MB/MF 三判死变异恰红 |
| 重排验证（六组顺序/rows 顺序未动/Hindsight 组 5/逻辑图首屏第 2 位） | passed | §五渲染序证据 + MD/MC 变异恰红 |
| 逻辑图内容核对（R-31 四泳道真实落点、无凭据/key/内网地址敏感面） | passed | §六逐点对位表 + ME 泄漏判死变异 |
| 发布物面（LRN-045 src↔dist 同源、dist-browser-load、色值复扫） | passed | /tmp 隔离重建 md5 逐字节一致（panel.js `7d0b94fc…`/style.css `cc1db681…`）、dist-browser-load 4/4、两处色值扫描 exit=1 零命中 |

## 二、方法与纪律

- 只审 t19+t20 最新 diff 与合同验收项（执行纪律③），未全量重审 t8-t16 已闭环面。
- 变异实验全部在 `/tmp/t21-mut` 隔离副本执行，逐个注入→跑目标测试→从 `/tmp/t21-pristine` 复原；结束 `diff -rq` 三目录零差异=复原零污染，工作区零触碰（本包为唯一产出）。
- 测试输出原文均本审独立复跑（非转述卡报告）。

## 三、t19/t20 合同验收逐条核对

### t19（P0 双源写入口摘除，R-29）

| # | 合同项 | 判定 | 证据（file:line + 原文） |
|---|---|---|---|
| 1 | rows 三行摘除、面板=唯一写入口 | ✅ | `lib/client.js:82-84`（摘除留痕注释，无镜像行）；`grep -c "path: \['hindsight'" lib/client.js` = **0**；被摘 note 语义迁入面板提示位 `web/src/components/HindsightSyncPanel.vue:33-35` |
| 2 | 契约同步（EDITABLE_PATHS 10→7 + HINDSIGHT_EDITABLE_PATHS 3 叶 + 穿线） | ✅ | `lib/settings-write.js:11-29`（7 叶 + 3 叶两表）；`:73,91,109,131` `editablePaths` 参数化（缺省=通用面行为不变）；`lib/index.js:762-764` 双缝接线（通用 applyPatch 7 叶 / applyHindsightPatch 3 叶） |
| 3 | 面板写入不断（专属端点闭环） | ✅ | `lib/hindsight-routes.js:240-250`（POST /hindsight/settings 专属写面）+ `:271` 分发 + `web/src/api.js:53-54`（saveHindsightSettings 文档相对）+ `web/src/App.vue:91`（saveHindsightTime 改道） |
| 4 | 测试随摘 + 判死探针 | ✅ | `test/settings-write.test.mjs`（7+3 叶断言 + 摘叶判死）、`test/hindsight-routes.test.mjs:121-135`（双侧同集同序 + 双侧零 hindsight 叶）+ ⑥（专属 roundtrip/通用面拒写判死/写面不放大/缺缝 503）、`test/ingest-routes.test.mjs:250-252`（editable 顺序随摘+理由注释） |
| 5 | 全量 463/463（当时基线持平零回退） | ✅ | 本审终态复跑 466/466（含 t20 新 3 条）见 §七 |

### t20（六组重排 + 运行逻辑图，R-31/32/33）

| # | 合同项 | 判定 | 证据 |
|---|---|---|---|
| 1 | 六组结构 §3 逐位 | ✅ | 组标题渲染序=运行逻辑图/会话捕获/写入队列与安全/Ingest·蒸馏/Hindsight 记忆同步/部署信息（只读）——`test/client-face.test.mjs`「t20 六组重排」18 项逐位断言绿；`lib/client.js:72-89` group 元数据 9 行 |
| 2 | rows 数组顺序零变动 | ✅ | `lib/client.js:72-89` 仅加 `group` 元数据；`test/ingest-routes.test.mjs:252` data.editable 顺序断言=7 叶原序绿；变异 MC（swap 两叶）→ 该断言恰红 |
| 3 | Hindsight 面板在组 5 | ✅ | `lib/client.js:464-467`（组 5 h4 + WikiStewardHindsightMount，Ingest 组之后）；六组测试逐位断言锁 |
| 4 | 逻辑图首屏第 2 位 | ✅ | 渲染序 `lib/client.js:480` intro → `:481` `WikiStewardFlowBlock` → rows → 保存钮（`:489`）——引言后第 1 个块=首屏第 2 位（R-32） |
| 5 | kb-context 形制一致 | ✅ | 字段级 group 元数据 + `addRow` 插 `h4.wiki-steward-settings-group`（t20 报告 §1 形制对照 kb-context/lib/client.js:47-94,455-457） |
| 6 | 载体合规（R-33） | ✅ | `WikiStewardFlowBlock`（`lib/client.js:274-294`）零依赖 createElement + `details/summary` 折叠（open:true=先见图）+ `--dsw-alias-*` token CSS；零第三方/零 SVG |
| 7 | 红测清单 7 项全守 | ✅ | t20 报告 §5 核对表逐条本审复跑绿（单 settings.section/intro+rows 两 className/树含双挂载缝/EDITABLE 双侧/data.editable 顺序/pnpm build/色值双锁）；断言修订 1 处（:724 双源文案→节内零重复锁）理由注释在案 |

## 四、P0 根治验证（双源写零复活）

1. **客户端 rows 面**：`grep -c "path: \['hindsight'" lib/client.js` = **0**（EDITABLE_FIELDS 零 hindsight 叶）；`grep -n 'hindsight' lib/client.js` 仅剩挂载缝/逻辑图素材/留痕注释（无任何写控件）。
2. **手工 fetch 面（服务端协议层）**：通用 `POST /settings` 白名单=7 叶，hindsight 键整单拒（`lib/settings-write.js:11-19` + `checkPatchEditable:91-98`）；专属面 `POST /hindsight/settings` 白名单=3 叶（`HINDSIGHT_EDITABLE_PATHS`），之外同样整单拒（写面不放大，⑥ 测试锁）。
3. **EDITABLE 双侧同集同序（7 叶）**：`test/hindsight-routes.test.mjs:121-135`（clientPaths deepEqual serverPaths + length=7 + 双侧零 hindsight 叶）；`test/ingest-routes.test.mjs:252` data.editable 回显=同 7 叶同序。
4. **判死实证（变异）**：MA（把 hindsight 叶塞回通用表）→ 7 叶契约测试恰红；MB（专属表缩 1 叶）→ 专属白名单断言恰红；MF（checkPatchEditable 拒写失效=手工 fetch 面复活）→「⑥ …通用 POST /settings 写 hindsight 键=400 not_editable」判死测试恰红。

## 五、重排验证

- 六组顺序/标题=§3 逐位（§三 t20#1）；**rows 数组顺序未动**（MC 变异 swap 两叶 → data.editable 顺序断言恰红=顺序面真锁）。
- Hindsight 面板=组 5（`lib/client.js:464-467`），逻辑图=首屏第 2 位（`:480-481`）。
- **MD 变异**（改 1 个 group 元数据）→「t20 六组重排…组标题顺序…面板降组 5」恰红=分组面真锁。

## 六、运行逻辑图内容核对（R-31 逐点）

| R-31 节点 | 落点字面（`lib/client.js` FLOW_LANES :237-272） | 判定 |
|---|---|---|
| A 捕获→raw/（turn-stopping→每 N 轮 flush→双轨落点→失败队列→告警） | `:243-247`（session/event + agent/turn-stopping / capture.bufferRounds 缺省 3 / raw/04-session_logs/… + raw/projects/…/conversation.md / kb-index/queue/ 重试 3 次 TTL 7 天→kb-alerts.md） | ✅ |
| B raw/→wiki/（scan→sha256 三态→kb_mark→蒸馏 headless→wiki_* CRUD→kb_validate） | `:252-255`（ingest-pipeline.py scan 含 06-hindsight / kb_mark sha256 三态 / dsh-cron.sh wiki-ingest 00:25→headless /root/bin/tasks/21-wiki-ingest.md / wiki_write / wiki_validate → <vaultRoot>/wiki/） | ✅ |
| C Hindsight API→raw/06-hindsight/→并入 B→wiki/ | `:260-264`（127.0.0.1:8888 / 机械转录 `<bank-slug>-<hash8>-<YYYY-MM>.md` 纯机械不 LLM / 并入 SCAN_DIRS→wiki/） | ✅ |
| D 运维（crontab→dsh-cron.sh flock→headless；timer 同 wrapper） | `:268-271`（crontab／插件 timer 到点 spawn 同一 wrapper 共用 flock 防重入 / 每任务一把锁 失败追加 kb-alerts.md / dsh --profile headless） | ✅ |
| 真实落点（vault 路径/脚本/任务文件/端口） | 12 个落点字面测试锁在场（client-face「运行逻辑图」） | ✅ |
| **不画凭据与 key（红线）** | 测试反向断言（api_token/Bearer/sk-/password/密钥 零命中）；**ME 变异**（向泳道塞 `sk-leakcredential`）→ 逻辑图测试恰红=反向锁真有效 | ✅ |
| 内网地址敏感面 | 无内网 IP；`http://127.0.0.1:8888`=回环端口，属 R-31 明文允许的「端口」节点标注（非内网地址、非凭据） | ✅（附 nit 留痕 §八 N1） |

## 七、发布物面（LRN-045）与测试输出原文

```
$ node --test                       → ℹ tests 466 / ℹ pass 466 / ℹ fail 0（基线 463+3 零回退，exit 0）
$ node --test test/dist-browser-load.test.mjs → ℹ tests 4 / pass 4 / fail 0
$ （/tmp/t21-mut 隔离）npm run build → web/dist/panel.js 116.03 kB，✓ built in 308ms
$ md5sum web/dist/* （重建 vs 入库） → panel.js 7d0b94fc14fb76b834b9e5256499915d（一致）
                                       style.css cc1db681bb8c60f5ddd6a821f065e957（一致）
$ sed -n '/var SETTINGS_CSS/,/].join/p' lib/client.js | grep -cE 'hex|rgb\(|hsl\(|prefers-color-scheme|#[0-9a-fA-F]{3,8}' → 0
$ grep -rnE 'hex\(|rgb\(|hsl\(|prefers-color-scheme|#[0-9a-fA-F]{3,8}' web/src/ | wc -l → 0
```

dist 字面判据（本审复跑）：`hindsight/settings`=1、`唯一写入口`=1、`saveHindsightSettings`=2、`关闭即停同步行为`=1、`共用 flock 防重入`=1、`如需单一时间源请运维侧停用该 cron 行`=1——t19/t20 报告所列判据全部在场且计数吻合。

## 八、发现与留痕

- **blocker/high/medium：0**。
- **N1（nit）**：逻辑图泳道 C 带 `http://127.0.0.1:8888` 端口字面——合规（R-31 明文允许端口标注、回环非内网地址、零凭据），但若用户侧对外分享截图/导出，端口+服务形态略增指纹面；无需返工，用户在意可改「Hindsight API（本机端口）」。
- **N2（nit）**：`isEditablePath`（`lib/settings-write.js:52`）仍只查通用表——当前无 hindsight 消费方（写面全走 checkPatchEditable(editablePaths)），语义正确；若未来有人拿它判面板键会误判，建议注释点名（一行）。
- 转 backlog（前波既有，不重复开卡）：O1 skip 态 frontmatter 易变字段滞后 / O2 同步日志无轮转 / O4 发版后真 HTTP 冒烟 / R-34 order 撞号 30 跨插件协调 / 逻辑图图形化（B/C 档另波）。

## 九、变异实验台账（/tmp/t21-mut，复原零污染）

| # | 注入缺陷 | 目标测试 | 结果 |
|---|---|---|---|
| MA | hindsight 叶塞回通用 EDITABLE_PATHS | settings-write「7 叶子契约」 | pass 10 / **fail 1** 恰红 |
| MB | HINDSIGHT_EDITABLE_PATHS 缩 1 叶 | settings-write「专属面 3 叶」 | pass 10 / **fail 1** 恰红 |
| MC | EDITABLE_PATHS 两叶换序 | ingest-routes「GET settings…editable 回显」 | pass 23 / **fail 1** 恰红 |
| MD | 1 个 group 元数据改错组 | client-face「t20 六组重排…面板降组 5」 | pass 31 / **fail 1** 恰红 |
| ME | 泳道塞凭据字面 `sk-…` | client-face「运行逻辑图…不画凭据」 | pass 31 / **fail 1** 恰红 |
| MF | checkPatchEditable 拒写失效 | hindsight-routes「⑥ …通用面拒写判死」 | pass 6 / **fail 1** 恰红 |

恒真扫描（新增/受影响测试）：`assert.ok(true|1)`/自我相等/`.skip(`/`todo:` 零命中；client-face 32 测试 / 185 断言。

## 十、产出

- 本门禁文件：`wiki-steward/changes/2026-10-07-hindsight-sync/review-package.md`
- 实验区（临时，非交付物）：`/tmp/t21-mut`、`/tmp/t21-pristine`、`/tmp/t21-mutate.py`（`diff -rq` 复原零差异）
