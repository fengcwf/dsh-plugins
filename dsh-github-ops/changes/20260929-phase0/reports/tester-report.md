# tester-report.md — Task 15 测试波收口（退化形/超时形/零明文全链 + load 冒烟保持）

> 角色：tester（写测试与证据；产品代码仅测试驱动最小修复一处，显式记录见 §4）
> BASE：`afc4cc5`（Task 14 修复环 R1 后全量 87/87 绿）· 变更：`changes/20260929-phase0/`（dsh-github-ops 0.3.0）
> 覆盖：INV-1、INV-5、INV-6、INV-7、INV-8、INV-10；constitution P-3/P-5/P-10

---

## 0. 基线与终态（验证命令逐条）

| 命令 | 基线（改前） | 终态（改后） |
|------|--------------|--------------|
| `node --test` | `ℹ tests 87 / ℹ pass 87 / ℹ fail 0` | `ℹ tests 109 / ℹ pass 109 / ℹ fail 0` |
| `node --test test/load.test.mjs` | exit 0 | `exit 0`（真 `import('../lib/index.js')` 冒烟，INV-8） |
| `node --check lib/client.ui.project.js` | — | exit 0 |

- 新增测试 22 条：`test/gh-auth-degrade.test.mjs` 10 + `test/settings-routes-degrade.test.mjs` 7 + `test/client-degrade.test.mjs` 5。
- 零回归（INV-7、C-3）：既有 87 条全绿含 0.2.x 既有 16 条（enforce / repo-tools / load）；`node --test` 自动发现三个新文件（`*.test.mjs` 形）。
- 新文件行数全部 ≤300（231 / 250 / 214）；`test/gh-auth.test.mjs` 保持 290 行未动（本轮补测全部拆入 gh-auth-degrade）。

## 1. 验收逐条证据

### ① 假 gh 慢响应脚本：>probeTimeoutMs 超时分级出结果、UI 面不挂死（INV-5、R-1 同法钉死失败形）

- `test/gh-auth-degrade.test.mjs`「超时形@探针阶段①③」+「超时形@写 token（R-1 同法）」：假 gh `sleepMs:2500` > `probeTimeoutMs/timeoutMs:800` → `GHO-LOCAL-CONFIG-01` / `GHO-LATENCY-QUOTA-01` / `GHO-TOKEN-01`，hint 含「超时」（写 token 形=沿 R-1 实测同法钉死失败形）；墙钟断言 `Date.now()-t0 < 2200`（分级出结果、绝不等满 sleepMs=不挂死）。
- `test/settings-routes-degrade.test.mjs`「慢响应超时形全链（真 spawn）」：**真 `makeRunGh` + 假 gh 脚本**走 `POST /check` → `HTTP 200` + `ok:false` + `code=GHO-AUTH-CONNECT-01` + hint `/超时/`，墙钟 `wall < 2200`（实测 ~810ms）。
- `test/client-degrade.test.mjs`「超时分级结果→UI 不挂死」：悬挂响应释放超时分级 body → `check.phase` 出终态 `'error'`（绝不悬挂 `loading`）、分级卡在场、「重新检查」恢复入口在场、`gho-btn-busy` 零残留、六卡照常渲染。
- 输出摘录（终态）：`✔ 超时形@探针阶段①③… (1812ms)` `✔ 超时形@写 token… (806ms)` `✔ 慢响应超时形全链（真 spawn）… ✔ 超时分级结果→UI 不挂死…`

### ② 失败形 401/403/429/非零退出/写入失败：结构化归因 + stderr 敏感串不透传（INV-10）

- `test/gh-auth-degrade.test.mjs`：403→`GHO-AUTH-CONNECT-04`（F-7 补缺）+ 权限 hint；429→`GHO-AUTH-CONNECT-05`；非零退出（无 HTTP 线索）→`GHO-AUTH-CONNECT-99` 且 `message=stderr 首行`（多行不整段透传）；writeToken 网络错形→`GHO-TOKEN-06`（F-7 补缺）。
- `test/settings-routes-degrade.test.mjs`「失败形分级矩阵@POST /check」：401/403/429/非零退出 → `GHO-AUTH-CONNECT-03/04/05/99`，每形断言：`HTTP 200 + ok:false`（合同 9 业务失败语义）、结构化 9 字段齐（ok/stage/code/status/login/message/elapsedMs/hint/quota）、`raw detail line` 不进响应、`assertNoLeak`（秘密 + `user:pass@` + token/PAT 形态串）。
- 「失败形写入矩阵@POST /token」：网络错形/非零退出 → `GHO-TOKEN-06`，`opts.stdin` 才是 token 唯一通道、argv 零明文；「留空=不修改」（INV-4）在失败形下不受影响（零 gh 调用）。
- 「R-1 写入失败形全链（真 spawn）」：假 gh 把 stdin 回声进 stdout/stderr 的最坏形 + 真实 R-1 stderr（`error validating token: HTTP 401: Bad credentials…`）→ `GHO-TOKEN-03` + `status:401` + message 保真含 `401`（擦除的是凭据不是错误事实）+ 响应/argv 全零明文。
- 「日志/返回值零明文」：内部异常 message 含密 → `warn` 日志行与响应双双擦除（响应 `message='内部错误'`，内部细节零透传）。

### ③ 假 ctx 无 slots 注入：apply() 不炸、槽位缺席 fail-open、repo-context 失败降级不炸栏目（INV-6）

- 「假 ctx 无 slots 注入」（client-degrade ④）：client 壳 `apply()` 于无 slots ctx → 不炸、返回拆除器、warn 留痕；`lib/index.js apply()` 于无 slots/webServer/connection/plugin 假 ctx → 不炸、层①包壳照常在场（Ruling-3「数据面缺席≠四层死」）。
- 槽位缺席 fail-open：既有 `test/client-shell.test.mjs`（无 slots / register 抛错 / chunk 404 / logger 缺位四形）+ 本轮 `test/settings-routes-degrade.test.mjs`「缺缝 fail-open」（register/connection 缺位=数据面缺席不炸、留 warn 痕）。
- repo-context 失败降级不炸栏目：route 面既有 `test/settings-routes.test.mjs`（git 失败 fail-open）；UI 面本轮补「repo-context 失败降级不炸栏目」——传输失败形 + 业务硬失败形各一，repo 卡内降级、栏目六卡照常渲染、render 不炸。

### ④ 全链零明文：假 token 一次性假值，argv/日志/返回值/UI 投影全扫（P-5、P-10、R-6）

- argv 面：假 gh 调用记录 `{argv, env}` 逐条过零明文扫描（token 只走 stdin，P-5）；`stdin` 字段=传输通道按契排除。
- 返回值面：`writeToken/probeAccess/parseHostsMeta/listAccounts` 返回值逐个扫描（含假 gh 把 stdin 回声进 stdout/stderr 的最坏形——`[REDACTED]` 替换保真）。
- 日志面：`warn` 日志行扫描（内部异常含密形）。
- UI 投影面（client-degrade ③）：一次性假值 saveToken 链（保存即清空、只进请求体）+ 敌意原始串面（stderr/argv 回显形）→ 树文本零明文、原始串零渲染、白名单归因字段（`401 · token 无效`）正常显示。
- 两层擦除各有咬合断言：token 形态值咬「形态扫描」层、**非形态一次性值**（`ONCE_RAW`）咬「stdin 秘密精确擦除」层（mutation M3 实测后补，见 §3）。

### ⑤ 测试面补齐与文件拆分（C-2 先行）

- `changes/20260929-phase0/TECH.md` 文件变更范围已先登记三个新测试文件 + client-shell 修改面，再落代码（C-2）。
- `test/gh-auth.test.mjs` 与 `test/settings-routes.test.mjs` 的退化形断言以拆分文件收口（290 行近 300 上限 / 312 行已超限，不续加）；`test/load.test.mjs` 未动、冒烟保持。

### ⑥ 既有测试零回归 + 验证命令（INV-7、C-3、P-3）

- `node --test` → `ℹ tests 109 / ℹ pass 109 / ℹ fail 0`；`node --test test/load.test.mjs` → exit 0。P-3：本条即「测试输出落盘」证据，任务标记完成以此为前置。

## 2. TDD 红绿记录

### 真缺陷先红后绿（旧实现（BASE afc4cc5）上实测为红）

**F-T15-1（已修）：分级错误卡归因标题错显（INV-10）** —— `lib/client.ui.project.js labelOf` 用 `code.indexOf('GHO-AUTH-')===0` 前缀匹配鉴权缝码，误吞探针业务码 `GHO-AUTH-CONNECT-<NN>`：
- 红证据（3 断言，改实现前）：超时形 `actual: '来源受限' expected: /执行超时/`；403 形 `actual: '403 · 来源受限' expected: /403 · 权限不足/`；401 形实际显示 `401 · 未登录`（应 `401 · token 无效`）。
- 修复=最小一处（§4）；复跑全绿。

### Mutation 探针（新断言咬合证明，五轮全红→还原全绿）

| 探针 | 变异 | 预期红断言 | 结果 |
|------|------|-----------|------|
| M1 | `classifyRun` 超时分支失效 | 超时分级两测 | ✅ 2 红 |
| M2 | `kindOfStatus` 去 403 映射 | 403 归因测 | ✅ 1 红 |
| M3 | `makeRunGh` stdin 精密擦除失效 | 全链零明文 | ⚠️ 首轮 0 红（假保险：token 形态值被形态扫描层兜住）→ 补 `ONCE_RAW` 非形态秘密断言后 ✅ 1 红 |
| M4 | `sendJson` 整树 redact 失效 | 路由零明文 | ⚠️ 首轮 0 红（假保险：上游投影层已擦）→ 补「白名单违例键名反射」对抗断言后 ✅ 1 红 |
| M5 | cards 空态子树类名丢失 | Empty 子树断言 | ✅ 1 红 |

- 还原确认：`git diff --stat -- lib/` 仅剩 §4 预期修复 1 文件 2 行；全量 109/109 复绿。
- 不空转自证：调用面断言带正向检查（如「确实发生过 gh 写入调用」），防 green-by-vacuity。

## 3. 携带面（Task 15 附带三项）

1. **D1（禁 `/api/'` 正则缺正/反例自证）**：扫描形提为模块级 `banAbsApi`，M1/S1 回归清单补合成正反例——坏形 `"fetch('/api/github-ops/status')"` 必命中 / 好形 `"fetch('api/github-ops/status')"` 不误伤，并入「真实源码零命中」五类清单。
2. **Empty 子树断言**：空态入口断言限定 `.gho-empty` 子树（原全树 `find` 会命中常驻 `gho-actions` 卡头按钮，锁不住空态自带入口）；补非空态反证（`.gho-empty` 不得出现 + 常驻卡头入口仍在，两者互不混淆）。
3. **F-7（Task 10 遗留测试缺口）**：403 分支✅ / writeToken 网络错形 `GHO-TOKEN-06`✅ / switchActive 空 login（`GHO-SWITCH-06` + 零调用）✅ / 畸形 hosts.yml（垃圾行/Tab）✅ / probeAccess JSON 不可解析（`GHO-LOCAL-CONFIG-99`）✅。

## 4. 产品代码修复（显式记录，测试驱动最小修复）

| 项 | 内容 |
|----|------|
| 文件 | `lib/client.ui.project.js`（2 行：注释 + `labelOf` 鉴权缝分支收窄为 `GHO-AUTH-01/02` 精确匹配） |
| 缺陷 | 探针业务码 `GHO-AUTH-CONNECT-<NN>` 被前缀误配进鉴权缝分支 → 分级错误卡标题归因错显（超时→「来源受限」/403→「来源受限」/401→「未登录」），破坏 INV-10「结构化归因」与「状态 · 归因」合同 |
| 依据 | `test/client-degrade.test.mjs` 三条归因断言在 BASE 实现上实测为红（§2 红证据），修复后全绿；鉴权缝 `GHO-AUTH-01/02` 口径不变（既有 109 全绿零回归） |
| 边界 | 只动 `labelOf` 一处；不碰 D2/D3 等 deferred 项；`node --check` exit 0 |

## 5. 观察与遗留（不改产品代码，交终审立卡）

1. **O-T15-1（低危）Tab 缩进畸形 hosts.yml 产生幻影 host 行**：YAML 键名（`user`/`oauth_token`/`users`）被行级解析当主机名投影进 `hosts[]`。安全不变量不破（不抛异常、零明文、不伪造凭据——`hasToken/configured` 全 false，与 gh 的 YAML 严格拒绝一致，断言已锁）。处置候选=跳过含 tab 缩进行（一行）；**不建议** tab 计入缩进（会与 gh 实际行为相悖、制造「已配置」假阳性）。本轮不动产品代码（美观度投影超出测试驱动缺陷修复边界）。
2. **O-T15-2（既有状态）测试文件超 300 行**：`test/client-shell.test.mjs` 727（本轮携带编辑 +14）、`test/settings-routes.test.mjs` 312——Task 13/14 既有；拆分属重构面超 tester 职权。本轮新增三文件 231/250/214 全部 ≤300。
3. **D2/D3（已知 deferred）**：本轮断言面刻意避开（D2：`request()` JSON 形 4xx/5xx 缺 `ok:false` 仍判成功；D3：非 JSON 2xx 空投影）；执行中未撞出其用户可见症状，无新增证据，维持 deferred 交终审。
4. 其余 deferred（F-3 env 继承 / switchAccount busy finally / D5 aria-label 同名）未触碰。

## 6. P-10 / P-5 声明

- 全部凭据为一次性假值、每测独立取值（`ONCE_A..F`、`ONCE_RAW`、`ghp_secret_value` 等），无任何真实 token 进测试/测试日志；假值用后即换、不跨文件复用。
- 断言输出零明文为硬验收（`assertNoLeak`/`assertNoPlaintext` 双助手：已知秘密 + `user:pass@` + token/PAT 形态串全扫）。
