# t11 全链独立验证报告（tester-report）— Hindsight 记忆同步 U1-U3 集成面

- 任务：t11 · kind=verification · attempt 18adc817-402e-48a6-ae49-7268776c1136
- 验证者：tester（独立验证者红线：真实验证非转述；除本报告外零 write/edit 产出）
- 时间：2026-10-08 18:11–18:31（Asia/Shanghai）
- 结论：**6/6 验收项 passed，探针共 84 项子断言全过（e2e 54 + API 30），回归 455/455 零回退；无 NEEDS_CONTEXT 阻塞**。观察项 3 条（§7，均不构成失败）。

## 0. 验证方法与红线执行

- 探针脚本只写 `/tmp/t11/`（e2e.mjs / api.mjs + 结果 json + 日志），**零修改 lib/web/test 任何产品文件**；本报告为唯一落盘产出。
- 端到端探针 `vaultRoot`/`dataDir` 全部 `fs.mkdtempSync(os.tmpdir())`，**绝不写真 vault/home**；事后复核：`find /mnt/unraid_data/Obsidian -newermt '18:11:34' -type f` = 0 命中；`/root/.dsh/plugins/wiki-steward/data/` 内 `hindsight-sync-log.jsonl` 不存在、kb-alerts 中 `hindsight-sync` 命中 0。
- 真 Hindsight API 只读 GET（127.0.0.1:8888）：banks 与 memories/list 分页全量，全部只读。
- 扫描面只读执行 `python3 ingest-pipeline.py scan --summary`；ingest-pipeline.py mtime 保持 17:24（t10 改后值），未再被改动。

## 1. 逐项对账表（合同验收 6 条）

| # | 验收项 | 结果 | 证据（真实观察，非转述） |
|---|---|---|---|
| 1 | 端到端贯通探针（mkdtemp 注入，绝不写真 vault/home）：真 Hindsight 只读 GET→引擎转录→落盘→校验 frontmatter/sha256/聚合形/脱敏→幂等复跑零写盘 | **passed** | `/tmp/t11/e2e.mjs` **54/54 断言过**（`/tmp/t11/e2e-result.json`）。真 API：banks=2（`coding-agent::dsh-plugins` 595 facts + `coding-agent::公共` 119）；真 memories/list 分页全量 → syncAll 落 4 文件（`coding-agent--dsh-plugins-2026-09/10.md`、`coding-agent-2026-09/10.md`，bank+月聚合、`::`→`--`、禁日期前缀）。逐文件校验：frontmatter 六字段+最新时间/stale 聚合共 8 键、`source: hindsight`、`sha256 == bodyHash(body)`（闭合 --- 之后逐字重算）、`fact_count == body ### 条目数`、id 升序确定性、body 零 timestamp/is_stale 字段行、body 零 secret 形残留（sk-/ghp_/AKIA/PEM/JWT 正则 0 命中）。脱敏判死夹具（注入缝假 fetch 带 2 条明文密钥）：落盘 0 明文、日志 `redacted:2`。幂等复跑：4/4 `action=skipped` + **inode/mtime/size 三不变**（零写盘实证），日志仍逐次追加（2→4 行=同步日历留痕）。mkdtemp 探后清理 |
| 2 | API 面四端点真对真逐个探针（status/sync/sync-log/toggle），含非法参 400、鉴权缝 401 面 | **passed** | `/tmp/t11/api.mjs` **30/30 断言过**（`/tmp/t11/api-result.json`）。真 `registerIngestRoutes` 单 prefix 分发 + 真 handler + 真 `collectStatus`（真 fetch 打活 API）+ 真 `createApplyPatch`（configEditor 缝）+ 真引擎打真 Hindsight。① status 200：diagnose.config 官方五字段（真读 `/root/.hindsight/coding-agent.json`）、`sync_status` 恰三键 `{bank,activeOps:0,synced:true}`、banks 活值 595/119、warnings 空；② sync 200 回执三键 `started=true/reason=started`，**API 触发→真引擎→mkdtemp 落 4 文件 + 日志 2 行**（真端到端），L1 关→`started:false/reason:disabled`；③ sync-log 200 缺省 count=2、since/until 闭区间过滤、窄区间 count=0 不造数、**非法参 400 ×3**（`since=2026/10/06`、`until=abc`、区间倒置）均 `bad_request`；④ toggle 200→`editCalls=1` 真触达持久化缝→GET settings 回读 false→editable=EDITABLE_PATHS 10 叶同集→回开 true→**400 ×2**（enabled 非布尔/缺体）；⑤ **401 鉴权缝 ×4 端点**（requestRejection 过缝直接回拒，不进业务）；⑥ 405：status POST→allow:GET、toggle GET→allow:POST |
| 3 | 扫描面：`python3 ingest-pipeline.py scan --summary` 真实输出含 06-hindsight（只读扫描安全） | **passed** | `cd /opt/Workspace/scripts/obsidian && python3 ingest-pipeline.py scan --summary` **exit=0**；`grep -n "06-hindsight"` 稳定形（R-19）→ **line 2 命中**：`扫描目录: 01-articles, …, 05-kanban, 06-hindsight, projects`（8 目录），总文件数 633。直扫 `--source 06-hindsight` exit=0：`扫描目录: 06-hindsight / 总文件数: 0`（空目录也在扫描面）。原始输出 `/tmp/t11/scan-summary.log`。真 vault 06-hindsight 保持 0 个 .md（探针未落真 vault） |
| 4 | UI 数据面：panel.js 构建物可加载 + 六控件在场（dist 字面/真浏览器探针任一）；零硬编码色值复扫 | **passed** | ① dist 字面（t14 18:25 重建后最新 dist 复扫）：`grep -c 'data-hs-role": "<键>"'` 六键各=1——status-bar / sync-button / sync-calendar / sync-time / l1-toggle / l2-badges；端点形 `hindsight/status|sync|sync-log|toggle` 四字面在 dist；`ws-root--hindsight` 根类在 dist。② 可加载：`node --test test/dist-browser-load.test.mjs` **4/4**（真无 process 环境 ESM 加载+字节级残留扫描）。③ 色值复扫：`web/src/` hex/rgb/hsl/prefers-color-scheme **exit=1 零命中**；dist 仅 `style.css:#0000`——为 esbuild 把 src `border-color: transparent`（src transparent×8、`border-color: transparent`×4）等价改写，非硬编码色值（t12 同口径先红后绿实证）。④ 队长澄清执行：六控件「设置节真机可见」不在本卡验收面，归 t14，如实记录不判失败 |
| 5 | 回归：node --test 全量零回退；dist-browser-load 全绿；git 工作树除白名单 changedPaths 外零越界 | **passed** | ① `cd wiki-steward && node --test` **exit=0，455/455 pass 0 fail**（`/tmp/t11/node-test-final.log`；18:21 轮 451/451、18:23 轮 453/453、18:31 终轮 455/455——递增系 t14 并发施工新增测试，非回退）；② dist-browser-load 4/4；③ git 越界核对见 §6（本卡零越界；白名单外 16 个 tracked 文件均早于本卡开工 18:11 且不属本波任何任务 changedPaths） |
| 6 | tester-report.md 落盘（含逐项对账表+失败如实）；验证红线：只读探针，遇阻报 NEEDS_CONTEXT 不绕道 | **passed** | 本文件即落盘产出：`wiki-steward/changes/2026-10-07-hindsight-sync/tester-report.md`。对账表=§1；失败/瑕疵如实=§7（含探针自身首轮 bug、生产安装位 404 观察、并发改动漂移）；全程只读探针+mkdtemp，无绕道、无 NEEDS_CONTEXT 触发 |

## 2. 命令与退出码清单（contract order）

| command | status | exitCode | 观察 |
|---|---|---|---|
| `cd wiki-steward && node --test 2>&1 \| tail -5`（合同 Verify 命令） | passed | 0 | 末 5 行 `fail 0 / cancelled 0 / skipped 0 / todo 0 / duration_ms 5256`；全量计数 `tests 455 pass 455 fail 0`（完整输出另存 `/tmp/t11/node-test-final.log`） |
| `node /tmp/t11/e2e.mjs` | passed | 0 | checks=54 pass=54 fail=0 |
| `node /tmp/t11/api.mjs` | passed | 0 | checks=30 pass=30 fail=0 |
| `python3 ingest-pipeline.py scan --summary` | passed | 0 | grep -n 06-hindsight → line 2；总文件数 633 |
| `python3 ingest-pipeline.py scan --summary --source 06-hindsight` | passed | 0 | 扫描目录: 06-hindsight / 总文件数: 0 |
| `node --test test/dist-browser-load.test.mjs` | passed | 0 | tests 4 pass 4 fail 0 |
| `grep -rnoE "hex\|rgb(\|hsl(\|prefers-color-scheme" web/src/` | passed | 1 | exit=1 即零命中（预期红判据） |

## 3. e2e 探针明细（54 断言分组）

真 API 面（2）→ 落盘形（3：目录形/相对路径/禁日期前缀）→ 逐文件 frontmatter+body（4 文件 × 11 键 = 44：块闭合/六字段/source/date 与文件名月一致/sha256 形与重算相等/fact_count 对账/id 升序/无易变字段/易变聚合只在 frontmatter/零 secret 残留）→ 脱敏夹具（4：同步 ok/明文 A 不落盘/明文 B 不落盘/redacted>0）→ 幂等（3：全 skipped/inode+mtime+size 三不变/日志逐次追加）→ 纯函数（3：低质门禁/slug::→--/month 三级回退）。

真数据聚合实测：595 facts→269+326 两月文件；119 facts→11+108 两月文件；`latest_timestamp` 取月内最大、`stale_count` 按 `is_stale===true` 计数，均只在 frontmatter。

## 4. API 四端点明细（30 断言分组）

status 4 / sync 3（含真端到端落盘轮询：回执 detached 到手→轮询 mkdtemp 至 4 文件+2 日志行）/ sync-log 7 / toggle 6 / 401×4 / 405×2 / 注册缝 1（disposer 形）+ 顶层形 3。

## 5. 扫描面与 UI 面明细

- 扫描：完整输出 line 2 含 06-hindsight（8 目录白名单）；直扫空目录 exit 0；`find raw/06-hindsight -type f` = 0（只建目录不落 .md 的 t10 承诺被复核）。
- UI：六键 dist 字面逐键 grep -c=1（最新 dist mtime 2026-10-08 18:25:07，t14 重建后复扫仍全在）；dist-browser-load 4/4 真浏览器语义（子进程删 process 后动态 import 不抛）；色值复扫 src 0 / dist 仅 esbuild `#0000` 等价改写。

## 6. git 工作树越界核对

- 判据基线 = team.json 全任务 changedPaths 白名单 ∪ 本波 in-scope 目录 `changes/2026-10-07-hindsight-sync/` ∪ t14 在途（lib/client.js、web/src/panel.js、view-model.js、App.vue、test/client-face|web-panel.test.mjs、web/dist/*，mtime 18:13–18:25 = 本卡开工后由 t14 并发产生，属团队在途白名单）。
- **白名单外 tracked 文件 16 个**：`obsidian-web/*`（13 个，mtime ≤10-08 17:46）、`.gitignore`（10-01）、`dsh-github-ops/ledger.md`（09-30）、`wiki-steward/changes/2026-09-30-logview-filters/ledger.md`（09-30）——**全部早于本卡开工 18:11，均不在本波任何任务 changedPaths**，归属并行会话/前波遗留（obsidian-web 自有 changes/ 在途目录佐证），非本波产物；如实上报供队长知悉，不判本卡失败。
- **本卡自身零越界**：`find <repo> -newermt '18:11:34'` 全量比对，本卡写入面仅 `/tmp/t11/*` 与本报告；探针期间真 vault 0 文件变更、真 home 无 hindsight 同步日志。
- 外部仓 `/opt/Workspace`：`workspace.db/-wal`、`pm2-*.log` 在 18:29–18:30 有写——归属 PM2 God Daemon（07:41 起常驻）运行时服务（obsidian-web server），非 scan（scan 只读、ingest-pipeline.py mtime 17:24 未变）。

## 7. 观察项与失败如实（无阻塞，NEEDS_CONTEXT 未触发）

1. **探针自身首轮 bug（非产品缺陷）**：e2e.mjs 首跑 frontmatter 解析正则 `[a-z_]+` 吃不下 `sha256` 数字位 → TypeError；修探针（一行）后 54/54 全过。属验证工具瑕疵，如实留痕。
2. **生产安装位无新码（非本波缺陷，发版链路预期）**：`GET http://127.0.0.1:3080/api/wiki-steward/hindsight/status` → **404**，`/root/.dsh/plugins/wiki-steward/lib/hindsight-routes.js` 不存在——生产安装位跑的是旧发布版（本波明确无发版），四端点验证因此走**进程内真 handler 真分发**（同 LRN-047 真对真纪律）；同面 `GET /api/wiki-steward/settings` → 401 证明生产 authGate 存活。发版后建议补一次真 HTTP 冒烟。
3. **并发改动漂移**：全量测试计数 451（18:21）→453（18:23）→455（18:31），系 t14（claimed）在途新增测试与 dist 重建（18:25）；每轮均 0 fail，取终轮 455/455 为本卡回归证据。**t13 正式审查时应以审查时点最新树重跑**。

## 8. 产出文件

- 本报告：`wiki-steward/changes/2026-10-07-hindsight-sync/tester-report.md`
- 探针与原始证据（临时区，非交付物）：`/tmp/t11/{e2e.mjs,api.mjs,e2e-result.json,api-result.json,scan-summary.log,node-test-final.log,dist-final.log,color-*.txt,git-final.txt}`
