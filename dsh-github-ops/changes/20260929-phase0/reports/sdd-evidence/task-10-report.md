# Task 10 报告：lib/gh-auth.js 纯逻辑收编 + test/gh-auth.test.mjs

- 执行者：Task 10 coder（DSH 子代理，未派发任何子代理）
- 日期：2026-09-29　工作目录：/opt/workdata/dsh-plugins/dsh-github-ops
- Status: **DONE_WITH_CONCERNS**（功能全交付、验证全绿；1 次测试抖动已按根因修复；2 项解释决策待控制器过目，见 NEEDS_CONTEXT）

## 一、实现了什么

| 模块 | 能力 | 证据（file:line） |
|------|------|-------------------|
| `lib/gh-auth.js`（237 行，零第三方依赖） | `makeRunGh({ghBin,timeoutMs})` 统一执行器：token 只走 stdin、env 恒定 `GH_PROMPT_DISABLED=1/NO_COLOR=1/PAGER=cat`、maxBuffer 4MiB、返回值 stdin 精确擦除 + elapsedMs 墙钟 | `lib/gh-auth.js:27-51` |
| | `redact(text)`：git remote URL userinfo 擦除 + token/PAT 形态串扫描 | `lib/gh-auth.js:18-24` |
| | `parseHostsMeta(yamlText)`：hosts.yml 行级解析（不引 YAML 库，P-4），投影 active_account/user/users[]/git_protocol，`oauth_token` 只判在位 | `lib/gh-auth.js:53-88` |
| | `listAccounts(metaOrText,{verified})`：`{login,active,configured,verified}` 投影（不读 token 值） | `lib/gh-auth.js:90-111` |
| | `probeAccess({ghBin,runGh,probeTimeoutMs})`：三段探针 local-config（`gh auth status --json hosts`）→ auth-connect（`gh api user`）→ latency-quota（`gh api rate_limit` + 墙钟），输出统一形 `{ok,stage,code,status,login,message,elapsedMs,hint,quota}` | `lib/gh-auth.js:180-221` |
| | 错误分级 `GHO-<STAGE>-<NN>` + hint 面（401/403/429/超时/gh 缺失/写入失败/未配置/不支持/未知） | `lib/gh-auth.js:113-124` |
| | `writeToken(token,{...})`：`gh auth login --with-token` 经 stdin；空 token 拒绝执行（INV-4 下层守卫） | `lib/gh-auth.js:168-178` |
| | `switchActive(login,{...})`：`gh auth switch --user`；gh<2.20 降级手工切换 hint（R-3） | `lib/gh-auth.js:223-237` |
| `test/gh-auth.test.mjs`（259 行，18 用例） | 假 gh 脚本记录 stdin/argv/env；覆盖状态投影/探针三段/失败分级（401/429/超时/gh 缺失/未配置）/切换降级/redact/空 token 拒写/4MiB 有界/全链路零明文扫描（P-10） | `test/gh-auth.test.mjs:1-259` |
| `changes/20260929-phase0/reports/gh-auth-token-write-shape.md` | R-1 前置实测钉死（T1-T11 + 结论 8 条 + P-10 合规声明） | 全文 |

**未动**（本卡范围外，留 Task 12）：`lib/index.js` / `lib/enforce.js` / `lib/repo-tools.js`；亦未动 tasks.md/ledger.md（控制器记账面）。

## 二、测试与结果（验证命令=简报原文三条）

| 命令 | 结果 |
|------|------|
| `node --check lib/gh-auth.js` | **exit 0** |
| `node --test test/gh-auth.test.mjs` | **18/18 绿**（tests 18 pass 18 fail 0） |
| `node --test`（全套） | **34/34 绿**（tests 34 pass 34 fail 0；既有 16 + 新 18，零回归 INV-7） |
| 补充：`node --test test/enforce.test.mjs test/repo-tools.test.mjs test/load.test.mjs` | 16/16 绿（既有面独立确认） |
| 稳定性：连续 10 跑 + 4 路 CPU 加压 4 跑 | 14/14 全绿（抖动修复后） |

## 三、TDD 证据

**RED**（先写测试后实现）：
```
$ node --test test/gh-auth.test.mjs
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../lib/gh-auth.js' imported from .../test/gh-auth.test.mjs
ℹ tests 1 / pass 0 / fail 1
```
预期：被测模块尚未创建，用例必然全挂（模块级加载失败）。

**GREEN**（实现后）：
```
$ node --check lib/gh-auth.js && node --test test/gh-auth.test.mjs
CHECK-OK
✔ makeRunGh：stdin 传 token、argv/env 恒定、返回值零明文
✔ writeToken 失败形钉死（R-1 实测 stderr 形）：GHO-TOKEN-03 + 401 hint
✔ probeAccess 三段全通：stage=latency-quota + login/quota/elapsedMs + 探针 argv 顺序
...（18 项）
ℹ tests 18 / pass 18 / fail 0
```
中途 1 个断言红（`login` 未随失败分级透传）已按根因修（`fail` 闭包带 login，`lib/gh-auth.js:184`）。

## 四、R-1 前置实测结论（详见 reports/gh-auth-token-write-shape.md）

1. 坏 token：exit 1 + stderr `error validating token: HTTP 401: Bad credentials (https://api.github.com/)`，**不写 hosts.yml**（无半写残留）。
2. **空 stdin 不报错、掉进设备码流程**（GH_PROMPT_DISABLED=1 拦不住，实测挂起至被杀）→ `writeToken` 空 token 一律拒绝执行（已测：零 gh 调用）。
3. 成功形在 P-10 下不可达（gh 先经 API 验证 token，假 hostname 也走网络验证）→ 成功以 exit 0 判定，成功分支由假 gh 单测覆盖（诚实边界，非遗漏）。
4. `gh auth status --json hosts` **退出码恒 0**，判据须解析 JSON `state`（实测形含 state/error/active/host/login/tokenSource/gitProtocol，零 token 值）；空配置=`{"hosts":{}}`。
5. 本机 gh 2.90 `gh auth switch --user` 存在（R-3 本机非降级，降级分支由假 gh 模拟）。

## 五、自审发现

- **规格逐条对照**：验收 9 条全覆盖（R-1 报告 ✓ / makeRunGh ✓ / parseHostsMeta ✓ / probeAccess 三段+hint ✓ / probeTimeoutMs 缺省 3000 贯通 ✓ / listAccounts+switchActive ✓ / redact ✓ / 零凭据存储 ✓（模块无任何 fs 写）/ 测试+验证命令 ✓）。
- **命名/YAGNI**：三词根统一（gh-auth/settings-routes/client）；导出面 9 项皆有消费者（Task 11/12）或测试；无死代码。
- **行数**：lib 237 行 / test 259 行，均 ≤300（constitution 代码验收）。
- **抖动复盘（本次实抓）**：13 跑 1 红后加压复现成功——`probeTimeoutMs=150ms` 贴着假 gh（node shebang）启动成本（~110-160ms），调度变紧时 stage① 自身先超时、归因落 `local-config`。**实现行为正确**（每段超时如实执行），缺陷在测试预算。按根因修（预算 150→1000ms ≥6x 余量、sleep 6s、墙钟界 <5s、maxBuffer 余量 64→128KiB），复验 14 连绿。commit `8c8d0fb`。
- **一处文案瑕疵自纠**：switchActive 空 login 的 hint 误用 token 写入话术 → 改为 hint 可覆写（`lib/gh-auth.js:154`）。

## 六、NEEDS_CONTEXT（不阻塞，已按最保守解释实现，请控制器/Task 11 过目）

1. **额外函数 `writeToken`**：简报验收清单未列，但 TECH.md 文件变更范围明文 `lib/gh-auth.js = 纯逻辑：…写 token（stdin）…`，且验收要求 hint 含「写入失败」、R-1 全是 `--with-token` 形 → 按 TECH.md 实现并纳入统一结果形。若 Task 11 自己写，请忽略。
2. **统一结果形附加字段**：`{ok,stage,code,status,login,message,elapsedMs}` 七字段恒定外，恒带 `hint`、`quota` 两字段（US-3 要限额 remaining/reset 可视化、US-6 要分级 hint）；成功 `code=null`、`status=200`。
3. **stage-1 判据解释**（ADR-004「401=坏 token 落②」与「state 判据」的张力）：local-config 只判「配置在位」（hosts 非空 + 有 login），`state:"error"` 记入 message 不截停，401/403/429 归因落 auth-connect。
4. **parseHostsMeta 输出形**（简报未钉）：`{hosts:[{host,user,activeAccount,gitProtocol,hasToken,users:[{login,hasToken}]}]}`；`listAccounts` 接受 yaml 文本或 parse 结果（字符串自动 parse），verified 传入已验 login 列表/Set。
5. **探针 argv 逐字取简报**：`gh api user`、`gh api rate_limit`（无 --jq，完整 JSON 在 JS 侧投影），测试锁死 argv 序列。

## 七、提交

| SHA | 主题 | 文件 |
|-----|------|------|
| `3599cea` | feat: dsh-github-ops 收编 lib/gh-auth.js 纯逻辑 + test/gh-auth.test.mjs（Task 10） | lib/gh-auth.js、test/gh-auth.test.mjs、changes/…/reports/gh-auth-token-write-shape.md |
| `8c8d0fb` | fix: gh-auth 测试超时预算贴夹具启动成本致抖动——按根因加厚余量 | test/gh-auth.test.mjs |

未 push、未 tag（红线）；工作树里 obsidian-web 等他人改动与 changes/ 其余文档（控制器产物）均未纳入本次提交。

---

# Fix Report — 修复环 Round 1/5（F-1 / F-2 / F-9）

- 判定来源：任务审查（Spec compliance FAIL、Code quality Needs work）；Minor F-3..F-8/F-10 按账本 deferred 未动。
- Commit：`4ff7fa7` fix: gh-auth 解析生产 hosts.yml 真实形 + makeRunGh 返回值过 redact（2 文件，+66/-11）。

## F-1（Critical）parseHostsMeta/listAccounts 解析生产 hosts.yml 真实形

**改了什么**（lib/gh-auth.js）：
1. 行级解析支持 YAML 序列项 `- login`（生产形 `users:` 下的 `- fengcwf` 无冒号行）：序列分支只在 `users` 上下文建账号，pop 条件用 `indent > itemIndent`（同缩进不退出 users 上下文）——对应审查给的两处病因（正则丢无冒号行 / pop 先退出 users）；
2. 投影归一：users 空/缺时从 `user` 字段合成账号（user 不在 users 也补录）；
3. `active_account` 仅在匹配已知 login 时才认（生产形值 `'true'` 否决），否则回退 `user`；
4. token 在位归因：host 级 `oauth_token` 归到 effective active 账号的 `hasToken`（US-1 显示"在位"不再误报）；
5. listAccounts 同步兜底（users 空时合成、active 判定回退 user）。

**覆盖测试**（test/gh-auth.test.mjs）：新增夹具 `HOSTS_PROD_YAML`（序列 + `active_account: 'true'`）与 `HOSTS_LEGACY_YAML`（无 users 段）+ 用例 `F-1 生产真实形 + legacy 形…`，断言 users 投影/activeAccount 归一/listAccounts 四字段/零明文。

**RED（修复前，审查者同形断言）**：
```
✖ F-1 生产真实形 + legacy 形 …
  AssertionError: Expected values to be strictly deep-equal:
    actual: [],  expected: [ { login: 'fengcwf', hasToken: true } ]
```
**GREEN（修复后，审查者同形直跑被测模块）**：
```
parse: {"host":"github.com","user":"fengcwf","activeAccount":"fengcwf","gitProtocol":"https","hasToken":true,"users":[{"login":"fengcwf","hasToken":true}]}
list:  [{"login":"fengcwf","active":true,"configured":true,"verified":false}]
```

## F-2（Important）makeRunGh 返回值过 redact

**改了什么**：`scrub` 升级为两级——stdin 秘密精确擦除 + token 形态扫描应用于 **stdout/stderr 双流**；stderr 另过全量 `redact()`（含 URL userinfo 擦除）；**stdout 只做形态扫描保真 JSON**（URL userinfo 擦除属 redact() 层职责，消费者义务=展示/投影边界调 redact()——probeAccess/writeToken/switchActive 的 message 本就全量 redact）。契约逐字写进代码注释（lib/gh-auth.js:41-43）与测试。

**覆盖测试**：并入 makeRunGh 用例（F-2 段）——假 gh 回显 `{"url":"https://user:pass@keep.example/x","tok":"ghp_secretvalueB…"}` + stderr `dial https://user:p@ss@host/x failed`，断言 stdout token 形态被 `[REDACTED]`、stdout URL 原样（契约钉死）、stderr=`dial https://host/x failed`、返回值零明文扫描过。

**RED**：`✖ makeRunGh：stdin 传 token…（The expression evaluated to a falsy value）`；**GREEN**：19/19 全过。

## F-9 redact userinfo 正则

**改了什么**：`[^/\s@]+@` → `[^/\s]*@`（含 @ 的 userinfo 全擦；不跨 /，路径邮箱安全）；redact 拆出 `redactTokens`（形态扫描）复用。

**覆盖测试**：redact 用例加两条——`https://user:p@ss@host/x` → `https://host/x`；`https://github.com/a/b?u=foo@bar` 原样不动。

**RED**：`actual: 'https://ss@host/x' / expected: 'https://host/x'`（复现审查判定）；**GREEN**：同形直跑 `redact F-9: "https://host/x"`。

## 验证命令与输出

| 命令 | 输出 |
|------|------|
| `node --check lib/gh-auth.js` | exit 0 |
| `node --test test/gh-auth.test.mjs` | `ℹ tests 19 / pass 19 / fail 0` |
| `node --test`（全套） | `ℹ tests 35 / pass 35 / fail 0`（既有 16 零回归） |
| 连跑 6 次全套 | 6/6 `pass 35 fail 0`（抖动前科，复验稳定） |
| wc -l | lib/gh-auth.js 258 行、test/gh-auth.test.mjs 290 行（均 ≤300） |

## 遗留（按审查账本 deferred，本轮未动）

F-3 env 剔除 GH_TOKEN 族 / F-4 writeToken('') hint 语义 / F-5 超时 hint 数字 / F-6 probeTimeoutMs 钳制（疑落 Task 12 Config）/ F-7 测试缺口（403、GHO-TOKEN-06 网络错形、switchActive 空 login、畸形 hosts.yml、JSON 不可解析）/ F-8 超时归因注入化 / F-10 报告行号漂移。
