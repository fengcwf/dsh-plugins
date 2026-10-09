# t20 设置节重排（六组）+ 运行逻辑图 报告

> 卡：t20（implementation）｜attempt 1｜attempt_id `ea2c81df-d7d1-4614-abf0-c6e7518cfb58`
> 定形依据：`solution-design-settings.md` §2-§3（R-29~R-34）+ `phase0/scout-settings-layout.md` §5「运行逻辑图素材」（全实证）+ §6/§7 载体评估（A 案纯文本）。
> 输入=t19 摘除 hindsight 三行后的干净 rows（7 可改 + 2 只读）。越界：无（package.json/CHANGELOG/README/docs 零触碰，无发版）。

## 1. 六组结构（solution-design-settings.md §3 逐位对位）

| 组 | 落位（渲染序） | 内容 |
|---|---|---|
| 1 运行逻辑图 | 引言后、rows 前（**首屏第 2 位**，R-32） | `WikiStewardFlowBlock`（h4 组标题 + details 折叠） |
| 2 会话捕获 | rows 内 h4 | capture.enabled / capture.bufferRounds |
| 3 写入队列与安全 | rows 内 h4 | queue.maxRetries / queue.ttlDays / secrets.enabled |
| 4 Ingest·蒸馏 | rows 内 h4 | **动作两按钮（扫描增量/触发蒸馏）+ 历史记录入口** + ingest.schedule.enabled / ingest.schedule.time |
| 5 Hindsight 记忆同步 | rows 内 h4 | Hindsight 六控件面板（WikiStewardHindsightMount，**从第 2 位降至组 5**——P1 主次颠倒修正） |
| 6 部署信息（只读） | rows 内 h4 | vaultRoot / write.readOnly（灰置：muted 卡 + 值文本/disabled Switch 原 readonly 形） |
| 底部 | 根级 | 保存按钮（R-30 保存粒度不变：仅 rows 剩余字段草稿→POST {patch}） |

**形制**=kb-context 字段级 group（`kb-context/lib/client.js:47-94` + `:455-457` 插 h4）：`EDITABLE_FIELDS`/`READONLY_FIELDS` 仅加 `group` 元数据，**rows 数组顺序零变动**（`addRow` 按组插 `h4.wiki-steward-settings-group`）；引言改写为面向用户一句话链路（原实现细节文案=P2）。

## 2. 分组 diff 摘要

| 文件 | diff 摘要 |
|---|---|
| `lib/client.js` | ① EDITABLE_FIELDS 7 行 + READONLY_FIELDS 2 行各加 `group` 元数据（顺序零变动）② `SettingsRow` 卡加 `props.muted` → `wiki-steward-settings-rowCardMuted`（灰置）③ 新增 `FLOW_LANES`（四泳道素材）+ `WikiStewardFlowBlock`（~50 行零依赖 createElement：details/summary 折叠 + 泳道 div + 步骤 span/箭头）④ `SETTINGS_CSS` +9 规则（组标题/灰置/逻辑图全 token）⑤ 渲染面重排：`addRow` 插 h4、Ingest 组内插 ManualActions+HistoryEntry、HindsightMount=组 5、只读两行=组 6；intro 改写 ⑥ 双源提示归一面板：行 note 只留执行语义 |
| `web/src/components/HindsightSyncPanel.vue` | 面板提示合并双源说明（唯一落点）：「…与 wiki-ingest 蒸馏错峰——wiki-ingest 由系统 cron 00:25 与插件 timer 双源触发、共用 flock 防重入，如需单一时间源请运维侧停用该 cron 行…」 |
| `web/dist/panel.js` | `pnpm build` 重建入库（116.03 kB；LRN-045）；`style.css` 重建字节不变（本卡样式改动全在 lib/client.js SETTINGS_CSS） |
| `test/client-face.test.mjs` | ① :724 双源断言修订（理由注释，见 §5）② 新增 3 条：六组结构逐位 / 逻辑图（R-31/33）/ 部署信息灰置 |

## 3. 运行逻辑图文本内容原文（R-31 四泳道全链，素材=scout-settings-layout.md §5 实证；不画凭据）

```
A 会话捕获 → raw/
  会话事件（session/event + agent/turn-stopping） → 每 N 轮强制 flush（capture.bufferRounds，缺省 3）
  → raw/04-session_logs/<标题> - YYYY-MM-DD-HH-MM.md ／ raw/projects/<项目>/changes/<变更>/conversation.md
  → 失败 → kb-index/queue/（重试 3 次 / TTL 7 天）→ kb-alerts.md 告警
B raw/ → wiki/（增量编译）
  ingest-pipeline.py scan（SCAN_DIRS 含 06-hindsight） → kb_mark sha256 三态（created/updated/skipped）
  → dsh-cron.sh wiki-ingest（00:25）→ dsh --profile headless（/root/bin/tasks/21-wiki-ingest.md）
  → wiki_write / wiki_validate → <vaultRoot>/wiki/
C Hindsight 记忆 → raw/06-hindsight/
  Hindsight API（http://127.0.0.1:8888） → 机械转录 raw/06-hindsight/<bank-slug>-<hash8>-<YYYY-MM>.md（纯机械不 LLM）
  → 并入 B 扫描面（SCAN_DIRS）→ wiki/
D 运维（定时/告警）
  crontab ／ 插件 timer（到点 spawn 同一 wrapper，共用 flock 防重入） → dsh-cron.sh（每任务一把锁，失败追加 kb-alerts.md）
  → headless 执行（dsh --profile headless）
```

载体（R-33）：`WikiStewardFlowBlock` 零依赖 createElement 纯文本步骤链 + `--dsw-alias-*` token CSS（暗色随宿主别名自动适配）+ 原生 `details/summary` 折叠语义（默认 open=先见图再操作，折叠对冲首屏变长）；不引 mermaid/第三方、不手绘 SVG。测试锁：`data-ws-lane` A/B/C/D 四泳道、`details`+`open:true`+`summary`、12 个真实落点字面、`不画凭据`反向断言（api_token/Bearer/sk-/password/密钥 零命中）。

## 4. dist 字面判据 grep 原文（LRN-045；web 改动=面板提示合并）

```
$ for k in "共用 flock 防重入" "如需单一时间源请运维侧停用该 cron 行" "唯一写入口" "Hindsight 同步" "立即同步" "同步日历" "待重启"; do printf '%s → ' "$k"; grep -c -- "$k" web/dist/panel.js; done
共用 flock 防重入 → 1
如需单一时间源请运维侧停用该 cron 行 → 1
唯一写入口 → 1
Hindsight 同步 → 2
立即同步 → 1
同步日历 → 2
待重启 → 1
```

双源提示去重核验（P2「两处重复一并消」）：

```
$ grep -n "系统 cron 仍在 00:25 触发|共用 flock 防重入|如需单一时间源" lib/client.js web/src/components/HindsightSyncPanel.vue
lib/client.js:271:  'crontab ／ 插件 timer（到点 spawn 同一 wrapper，共用 flock 防重入）',
web/src/components/HindsightSyncPanel.vue:34:  …共用 flock 防重入，如需单一时间源请运维侧停用该 cron 行…唯一写入口（R-29）。
```

解读：控件提示面**零重复**（行 note 只剩执行语义「每日到点执行时间（HH:MM）；改动约 1 分钟内热生效…」）；`client.js:271` 是逻辑图泳道 D 的 flock 节点（R-31 内容素材非提示，不计重复）；00:25/cron/flock/单一时间源说明唯一落点=面板提示（dist 上表 1/1 命中）。

## 5. 红测清单核对（合同第 4 项逐条）

| 红测项 | 结果 | 证据 |
|---|---|---|
| 单 settings.section | ✅ 守住 | client-face `注册面=仅 settings.section` 绿（32/32 全绿） |
| intro + rows 两 className | ✅ 守住 | `F2 设置节 DOM 形`（:888-889）绿——intro 只改文案不改 className；rows 容器保持 `wiki-steward-settings-rows` |
| 树含 HindsightMount + ManualActions | ✅ 守住 | t14 两挂载缝测试绿 + 新测试组内逐位断言（`WikiStewardManualActions`/`WikiStewardHistoryEntry` 归 Ingest 组、`WikiStewardHindsightMount` 归组 5） |
| EDITABLE 双侧同集同序 | ✅ 守住 | settings-write / hindsight-routes 双侧一致性测试绿（本卡零动白名单面） |
| data.editable 顺序 | ✅ 守住 | ingest-routes.test.mjs:251 绿——**rows 数组顺序零变动**（仅加 group 元数据，新测试钉行序 9 项原序） |
| web 改动 pnpm build 重建 dist（LRN-045） | ✅ | §4 dist 字面判据 grep 原文 + dist-browser-load 4/4 |
| 零硬编码色值（client-face + web-panel 两处锁） | ✅ | 两锁绿；补充扫描原文：`sed -n '/var SETTINGS_CSS/,/].join/p' lib/client.js | grep -E 'hex|rgb|hsl|prefers-color-scheme'` → exit=1 零命中；`grep -rnE … web/src/` → exit=1 零命中 |

**断言修订 1 处（理由注释在案）**：client-face `定时控制…双源提示文案如实入 UI`（:724）——原断言锁「双源提示文案入 UI」与 P2「双源提示两处重复」直接冲突；按队长裁定（t20 任务⚠️条「双源提示两处重复一并消（归一面板）」）改为锁「设置节树内零双源字面（doesNotMatch）」+ 面板侧唯一落点由 dist 字面判据锁（§4）。测试名同步改述。其余测试**零改动**（:903 仅注释措辞）。

## 6. 测试与验证

新增 3 条（client-face 29→32）：①六组结构（组标题顺序+行序零变动+组内逐位 18 项）②运行逻辑图（四泳道/details 折叠/12 落点字面/不画凭据）③部署信息灰置逐行判定。

```
$ cd wiki-steward && node --test 2>&1 | tail -5
ℹ fail 0 / ℹ cancelled 0 / ℹ skipped 0 / ℹ todo 0 / ℹ duration_ms 4854.2
（计数面：ℹ tests 466 / ℹ pass 466 / ℹ fail 0——基线 463 + 新 3 零回退）

$ cd wiki-steward && pnpm build 2>&1 | tail -3 && node --test test/dist-browser-load.test.mjs 2>&1 | tail -4
web/dist/panel.js   116.03 kB │ gzip: 36.24 kB
✓ built in 220ms
ℹ cancelled 0 / ℹ skipped 0 / ℹ todo 0 / ℹ duration_ms 348.4
（dist-browser-load 4/4：零 process/Buffer 残留 + 无 process 真 ESM 加载）
```

## 7. 越界与遗留

- **越界：无**。package.json / CHANGELOG.md / README.md / docs/ 零触碰；settings-write/EDITABLE_PATHS 白名单面零动（R-29 摘叶归 t19 已结）。
- 遗留（不阻塞）：R-34 order 撞号 30 跨插件协调（记 U4）；逻辑图若用户要图形化→B/C 档另波（需重建 dist+发版五步）。
