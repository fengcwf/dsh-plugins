# t13 整面终审报告 — Hindsight 同步波（reviewer-pro，kind=review）

- **日期**：2026-10-08 18:33–18:45（Asia/Shanghai）　**审查者**：reviewer-pro（attempt 1，attempt_id `3145f80a-41e5-4991-9206-6998f7d12974`）
- **被审对象**：t8/t9/t10/t11/t12/t14 全波合流面（reviewedTaskId 锚 t12）——`wiki-steward/lib/{hindsight-sync.js,hindsight-routes.js,index.js,settings-write.js,client.js}`、`wiki-steward/web/src/**`、`wiki-steward/web/dist/**`、`test/*`、`/opt/Workspace/scripts/obsidian/ingest-pipeline.py`（t10 白名单 1 行）
- **对照原文**：`solution-design.md` §2–§5（+§10 定形修正）；宪法红线 `tasks.md`「宪法约束面」+ INV-1/INV-15
- **verdict：needs_revision**（验收 3/4 过；**F1（high）定时同步触发面缺失=死控件+误导文案**，F2（medium）、F3（low）随返工一并收口）

## 一、solution-design.md §2-§5 逐条契约核对（文件:行号证据）

### §2 数据流（U1 核心）

| 契约句 | 判定 | 证据 |
|---|---|---|
| Hindsight API `/memories/list` + `/banks` 只读拉取 | ✅ | `lib/hindsight-sync.js:143`（`/v1/default/banks/${encodeURIComponent(bank)}/memories/list?limit&offset` 全量分页 :139-152）、`:156`（`/v1/default/banks`） |
| 机械转录绝不 LLM 语义编译 | ✅ | `lib/hindsight-sync.js:51-67` renderBody 纯字符串拼接（确定性 id 升序 :54）；全文件零 prompt/模型调用（§二） |
| 聚合 R-5：bank+时间窗（月）→ 一文件 | ✅ | `lib/hindsight-sync.js:197-208`（buckets Map + `path.posix.join('raw','06-hindsight',\`${slug}-${month}.md\`)` :207-208）；测试 `test/hindsight-sync.test.mjs:124`（两月=两文件） |
| 过滤门禁：text 空/低质跳过留痕 | ✅ | `lib/hindsight-sync.js:43-45`（trim<8）+ `:187-195`（skippedItems 留痕）；测试 `test/hindsight-sync.test.mjs:88-110`（3 跳过 + skipped_ids 入日志） |
| 脱敏：落盘前过 lib/secrets.js | ✅ | `lib/hindsight-sync.js:14`（`import { redact }`）、`:210-212`（`redact(renderBody(...))` 后才 bodyHash/写盘）、`:243`（告警正文也过脱敏）；夹具实证 §二 |
| 落点 `raw/06-hindsight/<bank-slug>-<YYYY-MM>.md` 稳定 ID 禁日期前缀 | ✅ | `lib/hindsight-sync.js:26-33` bankSlug（`::`→`--`）+ `:207-208`；测试 `:125`（`startsWith('coding-agent--dsh-plugins-')`） |
| frontmatter 六字段 title/date/tags/source/fact_count/sha256 | ✅ | `lib/hindsight-sync.js:75-89`（`source: hindsight` :81、`sha256`=bodyHash :83、date=`<YYYY-MM>-01` 稳定值 :79）；测试 `test/hindsight-sync.test.mjs:132-137` 逐字段 |
| 易变字段（timestamp/is_stale）只进 frontmatter 绝不进 body | ✅ | `lib/hindsight-sync.js:84-85`（latest_timestamp/stale_count 仅 frontmatter）+ `:48-49`（renderBody=该红线唯一渲染面）；测试 `:142-143`（body 零 `15:44:55`/零 `is_stale` 字面）+ `:138-139`（frontmatter 聚合值） |
| sha256=mark.bodyHash INV-13 同源 | ✅ | `lib/hindsight-sync.js:15,213`（`bodyHash(body)`）；测试 `:148-149`（frontmatter sha256 == 实测 body sha256） |
| Ingest 链：scan（sha256 三态）→ wiki | ✅ | `/opt/Workspace/scripts/obsidian/ingest-pipeline.py:39`（`"06-hindsight",  # …落点` 进 SCAN_DIRS，t10 白名单恰 1 行）；t11 tester 报告 §1#3（scan line 2 命中 + 直扫空目录 exit 0） |
| 幂等：同 bank 同月=同文件重写/跳过 | ✅ | `lib/hindsight-sync.js:229-235`（created/updated/skipped 三态，skip 零写盘）；测试 `:204-231`（inode 不变=零写盘硬证据） |

### §3 同步引擎契约

| 契约句 | 判定 | 证据 |
|---|---|---|
| fetch 直连 apiUrl 默认 `http://127.0.0.1:8888` | ✅ | `lib/hindsight-sync.js:121`；`lib/index.js:91`（Config 默认同值） |
| 超时 ≥30s（只能更长） | ✅ | `lib/hindsight-sync.js:19,126`（`Math.max(REQUEST_TIMEOUT_MS=30_000, …)`——timeoutMs:5 也抬到 30s）+ `:133` AbortSignal.timeout；测试 `:75-77,84` |
| `bank_id` 含 `::` 必 URL 编码 | ✅ | `lib/hindsight-sync.js:143`（encodeURIComponent→`%3A%3A`）；测试 `:81-82`（编码命中 + 绝无裸 `::`） |
| 触发面①手动（UI→POST 端点） | ✅ | `lib/hindsight-routes.js:94-118` createSyncStarter（L1 门禁 :98-100、detached 单飞 :101-110）→ `lib/index.js:733-743` 真引擎 |
| **触发面②定时（复用 ingest-schedule 调度器形，Config `hindsight.sync.schedule{enabled,time}`）** | ❌ **F1** | **无任何消费方**：`lib/index.js:574-598` 只起 `ingest.schedule` 一个调度器；`createHindsightSync` 全仓仅 `lib/index.js:737` 一处调用（挂在 POST sync）。`hindsight.sync.schedule` 只有四处同步面写口（`lib/settings-write.js:22-23`、`lib/client.js:78-79`、`cordis.patch.yml:31-33`、Config `lib/index.js:93-97`）与 UI 输入（`web/src/components/HindsightSyncPanel.vue:82-98`），零读方=死键。详见 §六 F1 |
| 同步日志 jsonl（时间/bank/条数/写入文件/跳过数/sha256 前后值） | ✅ | `lib/hindsight-sync.js:129`（`data/hindsight-sync-log.jsonl`）、`:238`（line 全字段 + `:236` files[].sha256_before/after）；测试 `:180-189` |
| 失败语义 fail-open + kb-alerts 告警（INV-15） | ✅ | `lib/hindsight-sync.js:241-247`（失败行也落日志 + alert.append）；测试 `:191-200` |
| 「队列幂等复用 lib/queue.js」 | ⚠️ F3（low） | 实现为 detached 单飞 running 旗（`lib/hindsight-routes.js:95-110`），未引 `lib/queue.js`。行为等价可接受（引擎 sha256 幂等），但与契约字面不符（§六 F3） |

### §4 UI 面（§10 修正后 C+A 混合口径）六控件

| 控件 | 判定 | 证据（`web/src/components/HindsightSyncPanel.vue`） |
|---|---|---|
| ①状态条（diagnose/sync_status 口径徽标） | ✅ | `:38` `data-hs-role="status-bar"`；徽标判定纯模块 `web/src/lib/hindsight-model.js`（statusBadges，取不到=「未知」不编造）；数据源 `lib/hindsight-routes.js:51-87` collectStatus（官方字段名 :59-64、activeOps/synced 主判据 :72-73、warnings 留痕） |
| ②「立即同步」按钮 | ✅ | `:56` `sync-button` → POST `${base}/hindsight/sync`（`web/src/api.js:44`） |
| ③同步日历（按日计数条） | ✅ | `:66` `sync-calendar`（聚合纯模块 hindsight-model.js；畸形行 dropped 如实计数 `:78-80`）；数据源 `lib/hindsight-routes.js:121-139,190-210`（since/until 闭区间 + 非法参 400） |
| ④同步时间 HH:MM | ⚠️ 随 F1 | 控件本身 ✅（`:88` `sync-time` + `:96` time-save → settings 写面 `web/src/api.js:53-56`）；但写入值**无消费方**（F1） |
| ⑤启停开关（L1） | ✅ | `:111` `l1-toggle` → POST `${base}/hindsight/toggle`（`web/src/api.js:47-52`）→ `lib/hindsight-routes.js:213-236`（applyPatch 同一持久化缝 :224，roundtrip 判死探针见 t9 报告） |
| ⑥L2 徽标（只读） | ✅ | `:123` `l2-badges`（l2View 三态纯模块；写按钮后置=与 §9 分诊⑤一致） |
| UI 约束：零硬编码色值 / 不引第三方 UI 库 / 文档相对 fetch / dist 重建 | ✅ | §四发布物面（src 色值扫描 exit=1；`web/src/api.js:36-56` 全 `${base}` 拼接零前导斜杠；组件 129 行 ≤300） |

### §5 Config / API 契约

| 契约句 | 判定 | 证据 |
|---|---|---|
| Config 顶层 `hindsight` 键组（§5 形 + 嵌套 `.prefault({})`） | ✅ | `lib/index.js:88-101`（enabled/apiUrl/banks/sync.schedule{enabled,time:'03:25'} 逐键同形）；`test/load.test.mjs:44-48`（键集断言 + 修订理由注释 + 向后兼容） |
| **四处同步面** | ✅ | ①`lib/index.js:88-101` ②`lib/settings-write.js:21-23`（+3 叶）③`cordis.patch.yml:26-33`（全键缺省）④`lib/client.js:77-79`（EDITABLE_FIELDS +3）；双侧一致性测试 `test/hindsight-routes.test.mjs`②（EDITABLE_PATHS↔EDITABLE_FIELDS 同集同序）+ `test/settings-write.test.mjs:13-29`（10 叶） |
| **端点形**（单 prefix 内部分发） | ✅ | `lib/hindsight-routes.js:241-244`（status/sync/sync-log/toggle 四路精确匹配，未提供路径→false 交 404 :245）；鉴权缝同款（authGate+methodGuard 逐 handler：`:155-156,178-179,191-192,214-215`）；成功 `{data}`/失败 `{error:{code,message}}`（sendJson/fail 复用 ingest-routes 同形） |
| POST sync 回执 started/reason/note | ✅ | `lib/hindsight-routes.js:182`；disabled/already-running 回执 `:99-103` |
| GET sync-log 非法参 400 不静默放宽 | ✅ | `lib/hindsight-routes.js:196-201`（格式 + 区间倒置）；测试覆盖 ×3（t11 api 探针 30/30 含 400×3） |
| POST toggle 走 settings 同一持久化缝 | ✅ | `lib/hindsight-routes.js:224`（applyPatch 裸 patch）+ 缺缝=503 如实 `:216-218` |
| 测试必红清单逐条应对 | ✅ | load 键集修订+理由（`test/load.test.mjs:44-47`）、EDITABLE_PATHS 扩（`test/settings-write.test.mjs:17-19`）、色值×2（`test/hindsight-ui-model.test.mjs:158` dist 色值锁 + src 扫描）、dist-browser-load（`test/dist-browser-load.test.mjs`，含「锁判别力」自证 :117-119）、LRN-045 dist 字面（`test/hindsight-ui-model.test.mjs:146`、`test/web-panel.test.mjs:286-297`） |

## 二、宪法红线核验

1. **lib/ 零 LLM 编译面** ✅：`grep -rniE "dsh-llm|prompt|completion|chat|model|openai|anthropic" lib/hindsight-sync.js lib/hindsight-routes.js web/src/lib/hindsight-model.js web/src/api.js` → **零命中**（仅注释声明「绝不 LLM 语义编译」`lib/hindsight-sync.js:1,52`）。渲染面 renderBody 纯确定性字符串转录（`:51-67`）。
2. **secrets 脱敏真在场（测试夹具实证）** ✅：夹具 `test/hindsight-sync.test.mjs:158`（`api_key=SECRETVALUE12345` + `sk-abcdef1234567890` 双哨兵明文注入假 fetch）→ 断言 `:165-168`（明文绝不落盘、`<redacted>` 如实、redacted 计数入日志）；**判死变异 M1**（摘除 `redact(...)`）→ 测试④立即红（§三）。t11 tester 复核同口径（e2e 判死夹具 redacted:2、body 零 secret 正则命中）。告警正文同样脱敏（`lib/hindsight-sync.js:243`）。
3. **写 vault 均过注入 vaultRoot / 真 vault 零误写** ✅：`createHindsightSync` 强制非空 `vaultRoot`/`dataDir`（`lib/hindsight-sync.js:119-120`），全部落盘路径从 `path.join(vaultRoot, ...)` 派生（`:130,208`）；测试全 mkdtemp 双目录注入 + `t.after` 清理（`test/hindsight-sync.test.mjs:20-28`）；**审查时点实测**：`/mnt/unraid_data/Obsidian/raw/06-hindsight/` 内 `.md` 计数 = **0**（t10「只建目录」承诺在审），真 home 无 `hindsight-sync-log.jsonl`。生产落点接线走 `cfg.vaultRoot` 注入（`lib/index.js:738`），无硬编码 vault 路径。
4. **INV-1 raw 只增语义**：同步产物改写例外=同 bank 同月同文件（`lib/hindsight-sync.js:229-235`，body 哈希变才重写），与 §2 幂等语义一致；**边角缺口见 F2**（slug 碰撞可致跨 bank 互覆写，超出例外语义）。

## 三、测试质量：恒真扫描 + 变异实验（/tmp 隔离，复原零污染）

**恒真扫描**（`test/hindsight-*.test.mjs`、`web-panel`、`client-face`、`settings-write`、`load`）：`assert.ok(true|1)` / 自我相等 / `.skip(` / `todo:` → **零命中**；断言密度：hindsight-sync 7 测试 74 断言、hindsight-routes 7 测试 59 断言、hindsight-ui-model 11 测试 64 断言；`dist-browser-load.test.mjs:117-119` 自带「锁判别力」自证（旧缺陷形必须被字节扫描看见）。假缝仅 I/O 边界（fetch/now/宿主最小形），业务逻辑全真跑（LRN-047）。

**变异实验**（`/tmp/t13-mut` 副本，9 个关键守卫逐个注入缺陷→跑对应测试→复原；`diff -rq` 复原后与 pristine 零差异，工作区零触碰）：

| # | 注入缺陷 | 红掉的测试（判别力实证） | 结果 |
|---|---|---|---|
| M1 | 摘除 `redact(...)`（脱敏失效） | ④「密文绝不进 vault（宪法红线…）」 | pass 6 / **fail 1** |
| M2 | `encodeURIComponent(bank)`→裸 bank | ①「bank_id 含 :: 必 URL 编码 %3A%3A」 | pass 6 / **fail 1** |
| M3 | 易变字段 timestamp 写进 body | ③「timestamp/is_stale 绝不进 body」 | pass 6 / **fail 1** |
| M4 | 幂等 skip 失效（恒重写） | ⑥「零写盘（inode 未变）」 | pass 6 / **fail 1** |
| M5 | 低质门禁失效（恒 keep） | ②「低质条目绝不进 vault」 | pass 6 / **fail 1** |
| M6 | status 端点摘 authGate | ③「鉴权/方法守卫 401/405 如实」 | pass 6 / **fail 1** |
| M7 | EDITABLE_PATHS 缩 1 叶 | ②「双侧一致性（静默缺陷源）」 | pass 5 / **fail 2** |
| M8 | dist 字面破坏（`ws-root--hindsight` 改写） | 「dist 字面判据（LRN-045 防假绿）」 | pass 21 / **fail 1** |
| M9 | 端点形破坏（`sync-log`→`synclog`） | ⑤「sync-log …」 | pass 6 / **fail 1** |

全部 9 个守卫**恰红在目标断言**，无恒真锁、无误报。

## 四、发布物面（LRN-045 防假绿）

1. **dist↔src 同源字节级实证**：`/tmp/t13-mut` 隔离副本跑 `vite build`（22 modules，built in 237ms）→ 产物 md5 与工作区入库 dist **完全一致**：`panel.js 9cc97b2debb935d1ab3b3624957037a6`（115440B）、`style.css cc1db681bb8c60f5ddd6a821f065e957`（5333B）——dist 与 src 同源、构建确定性、陈旧即会被字面判据抓住（M8 先红实证）。
2. **dist-browser-load**：`node --test test/dist-browser-load.test.mjs` → **4/4 pass**（无 process 环境真 ESM 加载 + 字节级残留扫描）。
3. **色值纪律**：`grep -rnoE "hex\(|rgb\(|hsl\(|prefers-color-scheme|#[0-9a-fA-F]{3,8}" web/src/` → **exit=1 零命中**；dist 仅 `#0000`（esbuild 对 `transparent` 的等价改写，t12 已先红后绿实证）。
4. **六控件字面**：`data-hs-role` 六键 src/dist 各=1；`ws-root--hindsight`、`data-ws-panel-view`、四端点形字面均在 dist。
5. **回归基线**：审查时点重跑 `node --test` → **455/455 pass / 0 fail**（t11 终轮同值，零回退）。

## 五、五轴审查

- **正确性**：主链（拉取→门禁→聚合→脱敏→原子写→日志→幂等）与契约逐条吻合，变异实证守卫有效。**缺陷**：F1 定时触发面缺失（死控件+承诺文案）、F2 slug 碰撞无守卫。
- **可读性**：模块头注逐条标注契约出处（solution-design 条款/裁定编号），测试命名直接映射验收项；`renderBody` 单一渲染面收窄红线暴露面，优秀。
- **架构**：I/O 边界全部可注入（fetch/now/vaultRoot/dataDir/alert/home），`createSyncStarter` 控制面与引擎分离，四端点复用 ingest-routes 鉴权缝一致性好。**偏差**：§3「复用 lib/queue.js」实为单飞旗标（F3）。
- **安全**：落盘/告警双路脱敏；`readDiagnoseConfig` 只回 `api_token_configured` 布尔不泄 token（`lib/hindsight-routes.js:29`）；四端点全过 authGate+methodGuard（M6 判死）；读路径无注入面（bank_id 全编码）。
- **性能**：分页 100/请求、单 bank 串行（现实 2 bank 可接受）；**观察**：`readSyncLogLines` 每次 GET 全量读 + jsonl 只增无轮转（长期线性涨，见 §七 O2）。

## 六、Findings（返工要求；复审换人）

### F1（high）— 定时同步触发面缺失：`hindsight.sync.schedule` 为死键，UI 承诺落空

- **问题**：solution-design.md:43（§3 触发面②）与 :56（§4 控件④）承诺「定时同步 + 同步时间调整」（亦是本波 U2 与团队目标明列项），但全仓**无任何调度器消费 `hindsight.sync.schedule`**：`lib/index.js:574-598` 仅起 `ingest.schedule` 调度器；`createHindsightSync` 仅 `lib/index.js:737` 一处调用（POST sync 手动路）。而用户面文案承诺已生效语义：`lib/client.js:78`「开启后每日到点触发记忆机械转录」、`web/src/components/HindsightSyncPanel.vue:117`「同步已启用（手动/定时均生效）」、`:82-98` 同步时间输入写入的配置无人读取。**用户打开定时开关后将永远静默不触发，且无任何告警留痕**。测试面亦无调度断言（无锁=无人发现）。
- **requiredFix**：二选一并留痕裁定——(a) 补定时触发面：复用 `lib/ingest-schedule.js` 调度器形（或同款 timer effect 缝）消费 `hindsight.sync.schedule{enabled,time}`，过 L1 门禁（`hindsight.enabled`）+ 单飞（与 createSyncStarter 同源），生命周期挂 `ctx.effect`（INV-3 零残留），补测试（到点触发/错峰/L1 关不跑/错过补跑判据）；或 (b) 若裁定后置：摘除/灰置 `lib/client.js:78-79` 两叶与 `HindsightSyncPanel.vue:82-98` 时间输入、改「手动/定时均生效」文案，并在 solution-design §6/§9 补记「定时后置」裁定。**不接受维持现状**（死控件+误导文案）。
- **file:line**：`wiki-steward/lib/index.js:574-598`（调度器消费面）、`wiki-steward/lib/client.js:78-79`、`wiki-steward/web/src/components/HindsightSyncPanel.vue:82-98,117`、`solution-design.md:43,56`。

### F2（medium）— bankSlug 碰撞可致跨 bank 互覆写（INV-1 raw 只增边角突破）

- **问题**：`bankSlug`（`lib/hindsight-sync.js:26-33`）存在碰撞面——`coding-agent` 与 `coding-agent::公共`（CJK 归 `-` 后去边）均归 `coding-agent`，假想 bank `a::b` 与 `a--b` 亦同。碰撞发生时第二个 bank 的同步会以 `action:'updated'` **重写第一个 bank 的 raw 文件**（`lib/hindsight-sync.js:229-235`），超出 §2「同 bank 同月产物 re_ingest 例外」语义=raw 被另一来源覆写。t8 报告已留痕「接受留痕」（`reports/hindsight-sync-engine-report.md:33`）但**未给任何守卫或拒写**。
- **requiredFix**：写前碰撞检测（目标文件存在且其 head 注释 `bank=` 标头与本次 bank 不符 → 拒写 + 告警 kb-alerts 留痕；或 slug 冲突时追加短哈希后缀保持确定性），补碰撞角测试（两 bank 归同 slug → 拒写/分名，绝不互覆）。
- **file:line**：`wiki-steward/lib/hindsight-sync.js:26-33,205-235`。

### F3（low）— §3「队列幂等复用 lib/queue.js」契约字面未兑现

- **问题**：`solution-design.md:45` 明文「队列幂等复用 `lib/queue.js`」，实现为 detached 单飞 running 旗（`lib/hindsight-routes.js:95-110`）+ 引擎 sha256 幂等，未引 queue.js。行为可接受，但文档与实现字面不符（整面终审的契约一致性口径）。
- **requiredFix**：在 solution-design §3 补注裁定（「同步幂等走 sha256 三态 + 单飞旗标，不复用 queue.js——理由…」）或按契约补 queue 面；二选一，消除字面歧义。

## 七、观察项（不阻塞，随返工顺手看）

- **O1**：skip 态下 frontmatter 易变字段（latest_timestamp/stale_count）不刷新（`lib/hindsight-sync.js:231-235`），is_stale 翻转/timestamp 更新会滞后到 body 变化才修正——与「幂等 skip 零写盘」的设计取舍一致（t8 报告明示双态），如实留痕；若未来 ingest 三态按 body 哈希判定，可考虑 skip 时仅刷 frontmatter。
- **O2**：`hindsight-sync-log.jsonl` 只增无轮转（`lib/hindsight-sync.js:165-172`），`GET sync-log` 每次全量读（`lib/hindsight-routes.js:121-139`）；建议上限/按月归档（性能轴）。
- **O3**：A/C 合同口径冲突已由队长 §10 定形修正（`solution-design.md:133-139`）收口，t12/t14 执行与 §10 一致，无需返工；t12 报告遗留「可达性缺口」已由 t14 补齐（`lib/client.js:371-372` 内联挂载，本审确认六控件在设置节渲染面真可见）。
- **O4**：t11 观察项②（生产安装位 404=发版链路预期）确认成立，建议发版后补真 HTTP 冒烟（与本波无发版一致）。

## 八、产出文件

- 本报告：`wiki-steward/changes/2026-10-07-hindsight-sync/reports/t13-final-review-report.md`
- 变异实验脚本与副本（临时区，非交付物）：`/tmp/t13-mut`、`/tmp/t13-pristine-src`、`/tmp/t13-mutate.sh`、`/tmp/t13-mutate2.sh`（复原零污染：`diff -rq` 三目录零差异；工作区零触碰）
