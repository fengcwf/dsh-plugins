# Task 11 报告 — lib/settings-routes.js 数据面 + test/settings-routes.test.mjs（integration 形）

- 状态：**DONE** · commit `79dad60`（2 files，+584/−0；未 push 未 tag）
- 工作目录：/opt/workdata/dsh-plugins/dsh-github-ops（git repo root /opt/workdata/dsh-plugins，仅 commit 本卡 2 文件）
- 时间：2026-09-29（Asia/Shanghai）

---

## 一、实现了什么

### lib/settings-routes.js（299 行，≤300 纪律达标）

**模块形（按指示取 kb-context 先例形）**：`registerSettingsRoutes(deps) → disposer[]`（先例 `kb-context/lib/settings-routes.js:77,142` 同形；简报建议的 `registerSettingsRoutes(ctx, deps)` 与先例冲突，按「以先例形为准」取先例形——ctx 由 Task 12 在 `ctx.plugin({inject:['webServer','connection']})` 内拆缝传入，见 kb-context/lib/index.js:212-242 同款接线）。deps 面（全部可注入，测试可假）：

| deps | 必/选 | 用途 |
|---|---|---|
| `register` | 必 | `ctx.webServer.register` 缝（`{kind:'prefix', path, handler}` → disposer，与先例一致） |
| `connection` | 必 | `{requestRejection(request)}` 鉴权缝；**缺 register 或缺 connection = 返回 `[]` 不注册不炸**（INV-6 fail-open，:74-79） |
| `Config` / `recheckConfig` | 二选一 | health「配置合成」段复检缝（zod schema 或 `() => {ok,switches?,issues?}` 函数；**不 import index.js，无环**） |
| `getConfig` / `config` | 二选一 | rawConfig 热改现读（per-call，先例 getConfig 形） |
| `ghAuth` | 选 | gh-auth 模块面（缺=真模块） |
| `runGh` | 选 | 执行器（缺=按 config 现建 `makeRunGh({ghBin, timeoutMs})`） |
| `readHosts` | 选 | `() => {exists, path, text}`（缺=GH_CONFIG_DIR ‖ XDG_CONFIG_HOME ‖ ~/.config + `/gh/hosts.yml` 自读） |
| `runGit` / `workspaceDir` | 选 | git 执行缝 / 工作区目录（缺=`process.cwd()`） |
| `cacheTtlMs` / `warn` | 选 | repo-context TTL（**硬顶 ≤30s**）/ 留痕 |

**8 端点（ADR-002 矩阵逐条对齐，路由表 :287-290）**：

| 端点 | 行为 | 要点 |
|---|---|---|
| `GET /status`（:152） | 本地认证状态投影 | hosts.yml → parseHostsMeta/listAccounts，**零网络**（测试断言 gh 零调用）；hosts/accounts/login 投影零明文 |
| `POST /token`（:162） | stdin 写入 | **留空=不修改**：空/缺失/空白 token → 200 `{ok:true,noop:true}` 且**零 gh 调用**（路由兜底，writeToken 拒空=双保险，INV-4）；非空 → `gh auth login --with-token` 只经 stdin（argv 零明文，P-5） |
| `POST /check`（:172） | 三段探针 | `probeAccess({runGh, probeTimeoutMs})`，**config.probeTimeoutMs 逐段透传**（ADR-004）；quota/login/elapsedMs/hint 结构化 |
| `GET /accounts`（:179） | 多账号投影 | `{login,active,configured,verified}`（verified 由 verify 回填）；布尔形幻影 login 过滤（见 carry-over 3） |
| `POST /accounts/verify`（:189） | 逐账号验证 | `gh auth status --json hosts` 的 per-account `state` 判据（success→verified）；未知 login → `state:'missing'`；**不切换账号、不读 token 值** |
| `POST /accounts/switch`（:211） | 切换 active | `gh auth switch`；gh<2.20 → `GHO-SWITCH-08` + 手工切换 hint（ADR-005/R-3） |
| `GET /repo-context`（:219） | 仓库上下文卡 | `git remote -v` + `git rev-parse --abbrev-ref HEAD` + `gh api repos/:o/:r`（stars/issues/default_branch）；**URL userinfo 擦除**；**TTL≤30s 内存缓存**（`Math.min(cacheTtlMs, 30_000)` 硬顶，:223）；失败 **fail-open 卡内降级**（200 + ok:false/降级 hint，绝不炸栏目） |
| `GET /health`（:258） | 三段自检 | ①配置合成（Config.parse 复检 + 6 开关状态投影）②gh 可用（`gh --version`，**probeTimeoutMs 透传**）③凭据在位（hosts.yml 存在 + active 投影，零明文）（ADR-007） |

**契约四件套（先例 API 形实证，非猜测）**：

1. **首行鉴权（INV-3）**：每个 handler 第一行业务语句 = `if (!authGate(req, res)) return`（8 处，:153/:163/:173/:180/:190/:212/:220/:259）；`authGate` 调 `connection.requestRejection(request)`（:111，传原始 req——宿主实现只读 `request.headers`，`dsh-client-connection/lib/index.js:586-588` 实证；kb-context 传 `{headers:req.headers}` 亦兼容）。未过缝 = HTTP 401/403 + `GHO-AUTH-01/02` 结构化回拒。
2. **请求体 ≤1MiB（INV-1）**：`readBody` 逐块累计 `Buffer.byteLength`，超 `1<<20` 即拒（:28,:131-142，GHO-ROUTE-02），绝不整包进内存。
3. **zod 白名单整单拒（INV-1）**：`z.strictObject` 四张请求 schema（:149）；未知字段/类型错 → 400 `GHO-ROUTE-03` 整单拒（kb-context settings-write 形），错误 message 只带字段名不带值。
4. **响应形（INV-10）**：恒为 `{ok,stage,code,status,login,message,elapsedMs,hint,quota,...payload}`；错误码 `GHO-<STAGE>-<NN>`——业务段沿 gh-auth 分级（01 超时/02 gh 缺失/03 401/04 403/05 429/06 写入/07 未配置/08 不支持/99 未知），路由契约段 `GHO-AUTH-01|02`、`GHO-ROUTE-01..05|99`。**HTTP 语义裁定（Ruling）**：业务结果（含 gh 侧失败）一律 HTTP 200 + `ok:false` 归因投影，HTTP 4xx/5xx 只表达传输/契约违例（401/403 鉴权、400 体/白名单、405 方法、404 路径、500 内部）——代价：若 UI/终审期望业务失败也走 4xx，需改映射（改动局部在 `sendJson` 调用点）。

**消费侧 redact 义务（Task 10 复审遗留 c，验收点）**：出边界 `sendJson` 对**整棵响应树逐串 `redact()`**（:55-60，URL userinfo + token/PAT 形态全擦），投影层再显式 `gh.redact()`（accountsOf/hostsOf/verify error/remote URL/health 字段）= 双保险；stderr 敏感串经 gh-auth 归因 + 双层 redact 后才出口。

### carry-over 显式记账

1. **redact 义务** ✓ 已做（上节）；对抗测试覆盖 `https://user:pass@host/x` 形（test:「路由输出零明文对抗」）。
2. **POST /token 留空兜底** ✓ 路由层短路（绝不触碰既有凭据），且测试断言 no-op 时 `runGh` 零调用（writeToken 拒空为第二保险）。
3. **L-1 幻影账号**：**已在 /accounts（及 /status/health 同投影）过滤布尔形 login**（`isPhantom`，:72；`login ∈ {true,false,null,yes,no,on,off}` 或空串不出口）——按 carry-over 指示显式记此一笔；hosts 投影的 `activeAccount` 同口径置 null。
4. **probeTimeoutMs 透传路径**：`deps.getConfig() → Config.safeParse → cfg().probeTimeoutMs（解析失败回落 raw → DEFAULT_PROBE_TIMEOUT_MS，仅类型兜底不钳制）→ probeAccess({probeTimeoutMs}) / 各 runGh 调用 {timeoutMs}`（/check :176、/accounts/verify :198、/repo-context gh 摘要 :239、/health gh --version :268）。**钳制（min1000/max600000）未做，按指示留 Task 12 Config zod 落点**。

## 二、测试与结果

`test/settings-routes.test.mjs`（285 行，integration 形：假 ctx（webServer/connection 缝）+ 真 handler + 真 gh-auth 归因 + 假 runGh/readHosts/runGit 注入），14 用例：

| # | 用例 | 覆盖 |
|---|---|---|
| 1 | 注册面 + 缺缝 fail-open | prefix/disposer；缺 connection 不注册不炸（INV-6） |
| 2 | 鉴权矩阵 8 端点 × (401,403) | 首行鉴权、错误码、**零副作用**（gh/git 零调用）（INV-3） |
| 3 | 契约守卫 | 405+allow 头、404、畸形 JSON、白名单整单拒×2（INV-1） |
| 4 | 1MiB 有界 | 超限 400 GHO-ROUTE-02、鉴权先行于读体（INV-1） |
| 5 | 留空=不修改 + 无删除/登出 | 4 种空形 200 noop 零 gh 调用；DELETE /token→405、POST /logout→404（INV-4/P-8） |
| 6 | token 写入 | argv 零明文、stdin 携带、响应零明文（P-5） |
| 7 | 零明文对抗 | 全 8 端点响应扫描：假 token/PAT/`user:pass@` 零出现；remote URL 擦除≠丢内容（INV-1/INV-10） |
| 8 | /status | 零网络投影、账号/hosts 投影、hosts 缺失 GHO-STATUS-07 |
| 9 | /check | 三段+quota+**probeTimeoutMs=4500 逐段透传**（ADR-004） |
| 10 | /check 失败归因 | GHO-AUTH-CONNECT-03/401/分级 hint/elapsedMs；stderr 敏感串不透传（INV-10） |
| 11 | /accounts + verify | 逐账号 state 判据、verified 回填、**L-1 幻影过滤** |
| 12 | /accounts/switch | 成功投影 + GHO-SWITCH-08 手工切换降级（R-3） |
| 13 | /repo-context | 摘要映射、TTL 缓存命中/过期、失败 fail-open（ADR-006/INV-6） |
| 14 | /health | 三段 ok + 降级归因（Config 复检不过/gh ENOENT/hosts 缺失）（ADR-007） |

**验证命令（逐条执行）**：

| 命令 | 结果 |
|---|---|
| `node --check lib/settings-routes.js` | **exit 0** |
| `node --test test/settings-routes.test.mjs` | **14/14 绿**（另 5 连跑稳定性 5×14/14 绿——吸收 Task 10 抖动教训，TTL 测试预算 40→100ms、sleep 200ms ≥2x 余量） |
| `node --test`（全量） | **49/49 零失败**（enforce 7 + gh-auth 19 + load 1 + repo-tools 8 + settings-routes 14）；既有 35 用例零回归（INV-7） |

证据文件：`.superpowers/sdd/tasks-dsh-github-ops/task-11-red.txt`（RED 原文）、`task-11-green.txt`（GREEN 全量尾部）。

## 三、TDD RED-GREEN 证据

1. **RED**：先写完整测试套（14 用例）→ `node --test test/settings-routes.test.mjs` **exit 1**，`ERR_MODULE_NOT_FOUND ... lib/settings-routes.js`（task-11-red.txt 已存，测试 1 fail 0 pass）。写实现前无一行实现代码。
2. **GREEN**：实现 lib/settings-routes.js（垂直切片：鉴权缝+契约骨架 → status/token/check → accounts/verify/switch → repo-context → health）→ 14/14 绿（首跑即全绿，无中途断言漂移）。中途实抓并按根因修的两处草稿残渣（占位死代码、错形表达式）发生在写文件同轮内、测试红绿跑之前，落盘状态已修正。
3. **加固**：gh 输出不可解析的归因从「请求体非法 400」改为内部 500（诚实归因，:201）；TTL 测试预算加厚。

## 四、文件清单

| 文件 | 操作 | 行数 | 备注 |
|---|---|---|---|
| `dsh-github-ops/lib/settings-routes.js` | 新建 | 299 | 8 端点数据面（≤300 达标） |
| `dsh-github-ops/test/settings-routes.test.mjs` | 新建 | 285 | integration 形 14 用例（≤300 达标） |

commit `79dad60`：`git show --stat` = 2 files changed, 584 insertions(+)。**未触碰** lib/index.js / lib/enforce.js / lib/repo-tools.js / 他插件工作面；未 push 未 tag。

## 五、自审发现

- **完整性 vs 简报**：验收 9 条逐条达成（8 端点 ✓ / 首行鉴权+401/403 ✓ / 1MiB+zod 白名单 ✓ / 留空不修改+无删除端点 ✓ / repo-context 擦除+TTL+fail-open ✓ / health 三段 ✓ / 结构化错误+stderr 不透传 ✓ / 测试五矩阵+US-9 集成面 ✓ / 三验证命令 ✓）。carry-over 1-4 逐条记账（上文）。
- **命名**：`settings-routes` 词根与 TECH.md 文件表一致；错误码/结果形与 gh-auth 同口径（`GHO-<STAGE>-<NN>` + {ok,stage,...}）。
- **YAGNI**：无未用导出；`API_PREFIX` 导出供测试/Task 12；`recheckConfig`/`Config` 二选一是简报明示的选项集；failRun 为 gh-auth 未导出 failResult 的 8 行同形构造（不扩 Task 10 接口），已在注释声明。
- **行数纪律**：lib 299 / test 285，均 ≤300（constitution 代码验收）。
- **每条主张有落盘证据**：命令+输出见第二节表；RED/GREEN 原文两份证据文件；锚点：鉴权 :110-117、1MiB :28,131-142、白名单 :143-149、redact 出边界 :55-60、TTL 硬顶 :223、health 三段 :258-282。
- **缺陷自省**：本轮两次「压缩重写时手滑」（占位死代码 / switches 投影错形）都在落盘后立即自查修正，其中错形一处若溜走会炸 health 段——教训：压缩改写后必须整文件复读+重跑测试（已执行）。

## 六、concerns

1. **HTTP 语义裁定**（上文 Ruling）：业务失败 200+ok:false。若 Task 13/14 UI 或终审期望业务失败映射 4xx，改动局部、契约其余不变。
2. **/accounts/verify 的判据选择**：取 `gh auth status --json hosts` per-account `state`（gh 对每账号真实校验 token、零破坏、零 token 读取）；**未做**「switch→probe→switch 回」三段探针形（会改用户 active 状态，破坏性）。ADR-005「验证=逐账号探针」字面若指三段探针，需终审裁量。
3. **repo-context 的「工作区」**：默认 `process.cwd()`，可经 `deps.workspaceDir` 注入；Task 12 接线时需定 DSH 工作区的取值（建议注入宿主会话工作区，而非插件目录）。
4. **verified 缓存**为注册期内存投影（插件重载即清空）；无持久化（P-6 零新凭据存储优先）。
5. `recheckConfig` 自定义函数需返回 `{ok, switches?, issues?}` 形（代码注释 + 本文档已声明）。

## 七、NEEDS_CONTEXT

1. **（非阻塞）`requestRejection` 传参形**：本卡传原始 `request`（简报字面形；宿主实现只读 `.headers`，实证 dsh-client-connection:586-588），kb-context 先例传 `{headers:req.headers}`——两形皆兼容现宿主；若未来宿主要求窄形对象，改 1 行。
2. **（非阻塞）health「配置合成」段的复检函数语义**：简报只说「从 deps 传入 schema 或复检函数」，函数返回形未定义——本卡取 `{ok, switches?, issues?}`（见 concerns 5）；Task 12 若用 schema 形则零成本。
