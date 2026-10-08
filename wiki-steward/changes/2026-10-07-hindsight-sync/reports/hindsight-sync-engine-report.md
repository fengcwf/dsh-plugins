# t8 Hindsight 同步引擎报告（lib/hindsight-sync.js 机械转录，U1 核心）

- **日期**：2026-10-08（hindsight-sync 波次）
- **任务**：t8（kind=implementation，attempt 1）
- **依据**：`changes/2026-10-07-hindsight-sync/solution-design.md` §2/§3 + R-4/R-5/R-6 裁定
- **产出**：`wiki-steward/lib/hindsight-sync.js`（新建，273 行）+ `wiki-steward/test/hindsight-sync.test.mjs`（新建，249 行，7 测试）

## 一、契约实现面（验收逐条对位）

| 验收 | 实现 | 位置 |
|---|---|---|
| `createHindsightSync(opts)` 工厂导出 | 返回 `{syncAll, syncBank, listBanks, fetchBankMemories, timeoutMs, pageSize, logFile, outDir}` | `lib/hindsight-sync.js:96-` |
| fetch 聚合 `/memories/list` 全量分页 | `fetchBankMemories`：`limit/offset` 循环至 `offset >= total` 或空页（防死循环） | 同上 |
| bank_id 含 `::` 必 URL 编码 `%3A%3A` | `encodeURIComponent(bank)`（测试断言 URL 含 `%3A%3A`、绝无裸 `::`） | 同上 |
| 单请求超时 ≥30s | `REQUEST_TIMEOUT_MS = 30_000` 常量；`timeoutMs = Math.max(30_000, opts.timeoutMs)`（配置只能更长不能更短）；每次请求 `AbortSignal.timeout(timeoutMs)` 下传 | `:23` `:135` |
| 空 text/低质门禁跳过并留痕 | `isLowQuality`：trim 后 < `MIN_TEXT_LEN=8`（CJK 口径：8 字符起算正常）跳过；`skipped`/`skipped_ids` 入同步日志，条目绝不进 vault | `:41` |
| bank+月 → `<bank-slug>-<YYYY-MM>.md` 稳定 ID 命名 | `bankSlug`（`::`→`--`，非 `[A-Za-z0-9._-]` 归 `-`，去边；确定性）+ `monthKeyOf`（`date`→`timestamp`→同步月三级回退）；**禁日期前缀文件名**（测试断言文件名以 bank-slug 起头） | `:28` `:34` |
| frontmatter 含 title/date/tags/source: hindsight/fact_count/sha256 | `renderFrontmatter`（`date: "<YYYY-MM>-01"` 月份桶稳定值=幂等友好；`sha256`=body 哈希） | `:73-` |
| 易变字段（timestamp/is_stale）只进 frontmatter 绝不进 body | body 渲染面 `renderBody` 只转录稳定字段（id/text/context/fact_type/document_id/entities）；易变字段聚合为 frontmatter `latest_timestamp`/`stale_count`（测试断言 body 无 `15:44:55`/`is_stale` 字面） | `:52` `:79-80` |
| 落盘前过 `lib/secrets.js` 脱敏 | body 渲染后整体 `redact()`（宪法红线 vault 侧写必过脱敏）；计数 `redacted` 入同步日志；错误正文同样脱敏后入告警/日志 | `:170` |
| 原子写 O_EXCL+fsync+rename | `fs-safe.writeAtomic`（mark.js 同款纪律）；测试断言零 `.tmp` 残留、skip 时 inode 不变 | `:186` |
| vaultRoot/dataDir 注入缝 | 两缝必填（测试 mkdtemp，绝不写真 home/vault）；落点 `<vaultRoot>/raw/06-hindsight/` | `:126-131` |
| 同步日志 jsonl（同步日历数据源） | 每 bank 每次同步一行 `data/hindsight-sync-log.jsonl`：`{ts, bank, facts, skipped, skipped_ids, redacted, files:[{file, month, fact_count, action, sha256_before, sha256_after}]}`（时间/条数/写入文件/跳过数/sha256 前后值全齐）；`withFileLock` 追加 | `:155` |
| 失败 fail-open + 告警进 kb-alerts | `syncBank`/`syncAll` 永不抛；失败→`alert.js` `append('hindsight-sync', …)`（复用 createAlert 形，落 `dataDir/kb-alerts.md`）+ 失败行同样落同步日志（INV-15 禁静默） | `:196-204` |
| 幂等双态 | body sha256（`mark.bodyHash` INV-13 同源复用——与 ingest 三态判定同口径）同→`action:'skipped'` 零写盘；变→`'updated'` 原子重写（re_ingest 语义） | `:178-186` |

## 二、设计裁定备忘（可复审点）

1. **sha256 口径**：frontmatter `sha256` = **body** 哈希（复用 `mark.bodyHash`，INV-13 与 ingest 同源）——易变字段在 frontmatter 不动 body 哈希，故 is_stale 翻转不触发 re_ingest（红线语义）。
2. **易变字段聚合形**：per-file `latest_timestamp`（条目 timestamp|date 最大值）+ `stale_count`（is_stale 计数）——逐条 timestamp/is_stale 不进 body（防每夜 re_ingest）。
3. **`date: <YYYY-MM>-01`**：月份桶稳定值而非同步日日期——同步日日期每夜变值会破坏幂等美学（skip 判定虽锚 body sha256，frontmatter 稳定更贴 raw 素材语义）。
4. **低质阈值 8 字符（CJK 口径）**：原拟 10 会误杀 8 字中文短句（实测）；7 及以下跳过。
5. **slug 去边规则已知边角**：`coding-agent::公共` 与假想 bank `coding-agent` 会归同一 slug（碰撞面）；现实 bank 形如 `provider::repo`（`::`→`--` 保双横线区分），接受留痕。
6. **一条一文件红线**：R-5 聚合=bank+月一文件（05-holographic 1091 垃圾事故教训）——测试 ③ 断言两月=两文件、禁日期前缀命名。

## 三、测试（7 条 ≥6；假 fetch 注入缝 + 真落盘 mkdtemp + 脱敏夹具，LRN-047 真对真）

| # | 测试 | 锁语义 |
|---|---|---|
| ① | fetch 聚合 | 全量分页（5 条跨 3 页 offset 0/2/4）；URL 含 `coding-agent%3A%3Adsh-plugins`、绝无裸 `::`；`timeoutMs ≥ 30_000`；每次请求 `AbortSignal` 下传 |
| ② | 低质门禁 | 空/空白/过短 3 条跳过留痕（日志 skipped=3 + skipped_ids）、绝不进 vault；低质边界 1/7 字=跳、8 字=正常（CJK 口径） |
| ③ | 聚合落盘 | 两月两文件、命名以 bank-slug 起头（禁日期前缀）、slug/月桶规则确定性；frontmatter 六字段 + `latest_timestamp`/`stale_count`；body 零 timestamp/is_stale 字面；`sha256`=body 实测哈希；body id 升序确定性 |
| ④ | 安全面 | `api_key=…`/`sk-…` 密文绝不进 vault（`<redacted>` 落盘、计数入日志）；只写注入 vaultRoot；writeAtomic 零 `.tmp` 残留 |
| ⑤ | 同步日志+fail-open | jsonl 行字段全齐（ts/bank/条数/写入文件/跳过数/sha256 前后值、action=created）；fetch 失败→不抛、结果如实、kb-alerts 有告警行、失败行落日志 |
| ⑥ | 幂等双态 | 同内容二跑 `skipped` + **inode 不变**（零写盘硬证据）+ 逐字节未变；内容变 `updated` + sha256 前后异 + inode 变（re_ingest） |
| ⑦ | banks 发现 | `banks:[]`→`/banks` 清单逐 bank 各自落盘+各自日志行（`{id}`/`{bank_id}` 形兼容） |

**测试输出原文**（`node --test test/hindsight-sync.test.mjs`）：

```
✔ ① fetch 聚合：memories/list 全量分页；bank_id 含 :: 必 URL 编码 %3A%3A；单请求超时 ≥30s + signal 下传
✔ ② 低质门禁：空 text/空白/过短条目跳过留痕，不进 vault；其余如实转录
✔ ③ 聚合落盘：bank+月 → <bank-slug>-<YYYY-MM>.md（禁日期前缀）；frontmatter 六字段；timestamp/is_stale 绝不进 body
✔ ④ 安全面：落盘前过 secrets.redact（密文不进 vault）；writeAtomic 原子写零 .tmp 残留；只写注入 vaultRoot
✔ ⑤ 同步日志：每 bank 一行 jsonl（时间/bank/条数/写入文件/跳过数/sha256 前后值）；失败 fail-open + 告警进 kb-alerts
✔ ⑥ 幂等：同内容二次同步=零写盘（sha256 同 skip）；内容变=sha256 更新落盘（re_ingest）——双态锁定
✔ ⑦ banks 空=发现全部 bank：/banks 清单逐 bank 各自聚合落盘+各自日志行
ℹ tests 7
ℹ pass 7
ℹ fail 0
```

## 四、全量回归（合同 verify）

`cd wiki-steward && node --test 2>&1 | tail -5`：

```
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4637.847215
```

全量口径：**tests 433 / pass 433 / fail 0**（基线 426 + 新增 7，零回退零修订）。

## 五、changedPaths 与越界申报

- `wiki-steward/lib/hindsight-sync.js`（新建 273 行）
- `wiki-steward/test/hindsight-sync.test.mjs`（新建 249 行，7 测试）
- `wiki-steward/changes/2026-10-07-hindsight-sync/reports/hindsight-sync-engine-report.md`（本报告）

**越界申报：无。** `web/`、`/opt/Workspace/scripts/`（ingest-pipeline.py 归 t11）、`/root/.dsh/` 零触碰；无发版动作。模块纯 ESM 零构建（`node --check` SYNTAX_OK），依赖仅既有 `fs-safe/secrets/mark/alert` 内部模块。
