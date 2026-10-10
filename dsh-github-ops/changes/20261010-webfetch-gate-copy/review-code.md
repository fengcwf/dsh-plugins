# Code Review — dsh-github-ops 0.3.1 `gateWebFetch()` deny reason 文案修复

- **审查角色**：reviewer（代码正确性 / 安全双轴；窄范围，只看 `gateWebFetch()` deny reason 文案）
- **审查对象 commit**：working tree 未提交改动（`dsh-github-ops/lib/enforce.js`）
- **审查时间**：2026-10-10 11:28–11:39 (Asia/Shanghai)
- **写入权限**：仅本文件；除本文件外工作树零写入
- **证据基线**：`git show HEAD:dsh-github-ops/lib/enforce.js`（0.3.0）diff 到 working tree（0.3.1）

---

## C1 — 新文案是否真的解决了问题（逐句读新 reason）

### 读什么

实际生效的 deny reason（`node -e` 调用 `gateWebFetch()` 取运行时真实输出，非读源码猜）：

> web_fetch 对 api.github.com 无法携带 GitHub token（dsh-web-fetch-http provider 结构性匿名：请求不带浏览器 cookie 与任何环境凭据，工具入参也只有 url、无法带 headers），因此抓 GitHub API/原始文件只可能走匿名通道。请改用带认证的通道：github_repo_* 工具，或 bash 里 `gh api <path>` / `gh api repos/OWNER/REPO/contents/PATH`。(确实需要 HTTP 抓取时可临时用 bash 的 curl 并带 `Authorization: Bearer $(gh auth token)` 头。)

### 逐句判定

| 句子 | 类别 | 判定 |
|---|---|---|
| `web_fetch 对 ${host} 无法携带 GitHub token` | 结构性约束 | ✅ 已消除实时观测 |
| `（dsh-web-fetch-http provider 结构性匿名：请求不带浏览器 cookie 与任何环境凭据，工具入参也只有 url、无法带 headers）` | 结构性约束 | ✅ 无数字、无状态断言 |
| `因此抓 GitHub API/原始文件只可能走匿名通道。` | 结构性约束 | ✅ 见下方「匿名通道」专项 |
| `请改用带认证的通道：...` | 指路 | ✅ 四通道全在场 |
| `(确实需要 HTTP 抓取时可临时用 bash 的 curl 并带 ... 头。)` | 指路 | ✅ 已把旧文案"确实需要匿名抓取时"的错误定性改为"确实需要 HTTP 抓取时" |

### 「只可能走匿名通道」是结构事实还是隐含"墙撞了"的判断？

**判断：是结构事实，不含实时观测。**

理由（有证据，非印象）：

1. "匿名"在这里指**请求不带凭据**这一传输属性，不是指"当前未认证的状态"。前半句已用 provider 机制解释了为什么匿名（无 cookie、无环境凭据、入参无 headers），后半句"只可能走"是对该机制的必然推论。
2. 与旧文案的差别是可证的：旧句 `匿名限额 60/h 且本机代理出口已耗尽` = 两个**会随时间变化的量**（限额数、出口状态）；新句 `只可能走匿名通道` = 对**恒定机制**的陈述，不引用任何可变数值。
3. 扫描新文案的过期向量全部干净（实测）：
   - `/\d+\/h/`、`/60/`、`/耗尽/`、`/限额/`、`/proxy|代理/`、`/已/`、`/2FA/i`、`/出口/` → **零命中**
   - 新文案整体**不含任何数字**（`/[0-9]/.test(reason)` = false）。

### 四条指路通道核对（运行时实测，非目测）

| 通道 | 结果 |
|---|---|
| `gh api <path>` | PRESENT |
| `gh api repos/OWNER/REPO/contents/PATH` | PRESENT |
| `github_repo_*` | PRESENT |
| `Authorization: Bearer $(gh auth token)` | PRESENT |

### 反事实检验：明天改成「匿名限额 5000/h」会不会又被误导？

这是本次审查最关键的判断，结论**分两层**：

**第一层 — 文案设计本身 ✅ 防过期。** 新文案的设计哲学是"只描述不变量"，因此任何人往同一句里再塞 `5000/h` 都是在**引入一个新的过期向量**，而不是保留了旧缺陷。语义层面，修复是真实的，不是换个数字。

**第二层 — 机械守卫 ⚠️ 有盲区（非本 commit 引入，但是同一变更面的一部分，见 F-1）。** 测试判定器 `STALE_OBSERVATION = /60|耗尽/`（`test/enforce.test.mjs:7`）是**字面枚举**而非结构性规则。我实测构造反事实：

```js
today.replace('无法携带 GitHub token', '无法携带 GitHub token（匿名限额 5000/h）')
// → STALE_OBSERVATION.test(modified) === false   // 判定器放过
```

也就是说：**如果明天有人把 5000/h 写回同位置，115/115 全绿照过。** 判定器咬得住 0.3.0 那句，咬不住"同一个错误的新数字"。

这不构成本 commit 的 blocker（0.3.1 交付的文案确无过期向量，语义修复真实），但它是 **medium**：本变更引入的判定器只防了"旧数字复辟"，没防"新数字复辟"，属于证据强度低于其声称。修法见 F-1 requiredFix。

---

## C2 — 语义零回归（逐行读 diff）

### diff 范围（`git diff -U0`）

```
@@ -38 +38,3 @@ export function gateWebFetch(url):
@@ -40 +42 @@ export function gateWebFetch(url):
```

仅两个 hunk，全部落在 `reason:` 字符串字面量内部。逐条核对任务要求：

| 检查项 | 命令 / 方法 | 结果 |
|---|---|---|
| `API_HOSTS`（10-16 行）未变 | `JSON.stringify(HEAD.API_HOSTS) === JSON.stringify(NEW.API_HOSTS)` | ✅ 逐字节相同 |
| `host.endsWith('.githubusercontent.com')` 拦截面 | 19 URL 行为对比 | ✅ action 零分歧 |
| `action:'deny'` 分支 | 同上 | ✅ deny 面 7/7 一致 |
| `return {action:'allow'}` 分支 | 同上 | ✅ allow 面 12/12 一致（含 `evil.githubusercontent.com.attacker.com`、`mygithubusercontent.com.evil.com`、`api.github.com.evil.com`、`user:pass@api.github.com`、空串、非 URL） |
| `${host}` 插值仍动态 | 对比 HEAD/NEW reason 中注入的 host | ✅ 零分歧（含 `media.github.com` 尾缀案例） |
| 模板串（反引号）保持 | 读源码 38 行 | ✅ 第 38 行仍为反引号模板串 |
| `rewriteGithubCommand` 全函数 | 31 条命令 HEAD vs NEW 逐条 JSON 比对 | ✅ 0 差异 |
| `targetsGithubApi` | 同上 31 条 | ✅ 0 差异 |
| `index.js` 门禁接线未动 | `git diff --stat dsh-github-ops/lib/index.js` | ✅ 无输出（空） |

### 行为等价断言汇总

- `action` 分歧：**0/19**（deny 7 + allow 12 全一致）
- host 插值分歧：**0**
- `rewriteGithubCommand` 分歧：**0/31**
- `targetsGithubApi` 分歧：**0/31**

特别验证的两个回归高危点，均无回归：
- **尾缀拦截面**：`host.endsWith('.githubusercontent.com')` 仍拦住 `media.githubusercontent.com` / `a.githubusercontent.com`，且不误伤 `notgithubusercontent.com` 与 `mygithubusercontent.com.evil.com`。
- **命令改写注入点**：`$(gh auth token)` 仍在 `rewriteGithubCommand` 中，命令改写与本次 reason 文案相互独立，未被误动。

---

## C3 — 安全

### 3.1 token 零明文

```
grep -n 'ghp_\|github_pat_' dsh-github-ops/lib/enforce.js
→ 0 命中（grep -c = 0）
```

测试文件 `test/enforce.test.mjs` 有 3 处命中，逐条判性质：

| 行 | 内容 | 性质 | 判定 |
|---|---|---|---|
| 41 | `assert.doesNotMatch(deny.reason, /ghp_|github_pat_/, 'token 零明文')` | 负向断言（守卫） | ✅ 非泄露 |
| 83 | `assert.doesNotMatch(r.command, /ghp_|github_pat_/)` | 负向断言（守卫） | ✅ 非泄露 |
| 90 | `'curl -H "Authorization: Bearer ghp_x" ...'` | 假字面量作"已带头则不改写"的测试输入 | ✅ 非泄露，且 `ghp_x` **不是本次新增**（`git diff \| grep '^+' \| grep ghp_` 仅命中第 41 行的守卫断言，第 90 行无 `+` 前缀） |

`ghp_x` 是 GitHub token 的**公开伪形示例**（`ghp_` + 单字符 `x`，非真实 token 格式，真实为 36 位 base62），不含任何真实凭据，且测试不 exec（`grep child_process\|execSync\|spawn\|exec(` → 零命中），字符串不会进入任何 shell。

### 3.2 「坏源示例字符串」的 token 泄露风险评估

任务问：新测试里那个坏源示例字符串是旧文案形态，含 `$(gh auth token)` 命令替换，算不算 token 泄露风险？

**判断：不算。理由如下：**

1. **命令替换 ≠ token 值。** `$(gh auth token)` 是 shell 在执行时调用 `gh auth token` 子命令取回 token 的机制；字符串本身只是"取回动作"的描述，**不含 token 的任何字节**。这正是 `lib/enforce.js:5-6` 注释所陈述的设计意图（token 值不出现在命令字符串里 → 不进日志/rtk recall/会话记录）。
2. **测试不执行它。** 该字符串仅作为正则 `STALE_OBSERVATION` 与 `GUIDANCE` 的匹配对象，无 `child_process`/`exec`/`spawn` 调用，不会产生子进程、不会真的去取 token。
3. **同一形态已在生产代码中存在。** `lib/enforce.js:74-75` 的 `rewriteGithubCommand` 长期把 `Authorization: Bearer $(gh auth token)` 注入 curl/wget 命令，即该形态是本插件的既定安全设计（token 由 gh 托管），不是本次引入的新风险面。
4. **坏源字符串的宿主是测试文件**，不进发布产物。`grep -c 'ghp_' lib/enforce.js` = 0 表明**发布代码**零明文。

补充确认：新文案本身（`deny.reason`）也不含 `$(gh auth token)` 之外任何可执行凭据形态。

---

## Findings

### F-1 — 测试判定器只防旧数字，不防新数字（medium）

- **id**：F-1
- **severity**：`medium`
- **file**：`dsh-github-ops/test/enforce.test.mjs:7`
- **problem**：`STALE_OBSERVATION = /60|耗尽/` 是对 0.3.0 文案的**字面枚举**，不是"无实时观测"的结构性规则。实测把今天的真实值 `5000/h` 写回同一句，判定器返回 `false`（放过），115/115 仍全绿。也就是说这个守卫声称"坏源必命中"，实际只覆盖了它见过的那一个坏源，覆盖度强于其断言。
- **requiredFix**：把判定器从"具体数值"升级为"数值模式"，例如：
  ```js
  // 任何「限额/速率」类数字都是过期向量，与具体数值无关
  const STALE_OBSERVATION = /\d+\s*\/\s*h\b|限额|耗尽|已耗尽|代理出口/;
  ```
  改后我构造的反事实（`5000/h`）会被咬住，测试强度与其 C-4 声称对齐。
- **不进 blocker 的理由**：0.3.1 实际交付的文案干净无过期向量，C1 的语义修复是真实的；此 finding 是**证据强度低于声称**，不构成发版阻断。

### 关于「四条指路通道」的说明

任务书要求核对四条通道（`gh api <path>` / `gh api repos/OWNER/REPO/contents/PATH` / `github_repo_*` / `Authorization: Bearer $(gh auth token)`）——**四条全部 PRESENT**，无缺失。

但顺带发现一个**测试侧的覆盖缺口**（不上升到 finding，仅记录）：测试的 `GUIDANCE` 判定器是
```js
const GUIDANCE = /\bgh api\b|\bgithub_repo_|\bAuthorization\b/
```
（`test/enforce.test.mjs:10`），只验了 `gh api`、`github_repo_`、`Authorization` 三个关键词，**没有断言 `gh api repos/OWNER/REPO/contents/PATH` 这条第二形态**。我人工确认该形态在现行 reason 中在场，所以本次不构成缺陷；但若将来有人删掉这条第二形态，`GUIDANCE` 不会失败——与 F-1 同类（守卫覆盖窄于声称），一并修最省事：在 C-4 测试里补一句
```js
assert.match(deny.reason, /gh api repos\/OWNER\/REPO\/contents\/PATH/, '指路保留 contents 形态')
```
本次记为 **nit**，不入 findings 计数（不影响 verdict）。

---

## 辅助：测试套件

```
cd /opt/workdata/dsh-plugins/dsh-github-ops && node --test
ℹ tests 115   ℹ pass 115   ℹ fail 0   ℹ cancelled 0   ℹ skipped 0   ℹ todo 0   ℹ duration_ms 4227.6
```

无异常。符合预期 115/115 fail 0。

---

## VERDICT

**`verdict: pass`**

理由：

1. **C1 通过。** 新文案把"会过期的实时观测"（限额数 + 代理出口状态）替换为"结构性约束"（provider 无 cookie / 无环境凭据 / 入参无 headers）。「只可能走匿名通道」是对恒定机制的陈述，不含任何可变数值、不含数字、扫描全部过期向量零命中。四条指路通道全部在场。语义修复真实，不是换数字。
2. **C2 通过。** 行为等价性用 HEAD vs working 双导入实测：`action` 分歧 0/19、host 插值分歧 0、`rewriteGithubCommand` 分歧 0/31、`targetsGithubApi` 分歧 0/31、`API_HOSTS` 逐字节相同、`index.js` diff 为空。语义零回归成立。
3. **C3 通过。** 发布代码 `lib/enforce.js` token 模式零命中；测试里的 `ghp_x` 为非真实伪形且非本次新增；`$(gh auth token)` 是命令替换（取回动作描述）而非 token 值，且测试零 exec 路径，不构成泄露风险。
4. **无 blocker、无 high。** 唯一 finding 是 F-1（medium）：测试判定器防旧数字不防新数字——这是证据强度问题，不是发布正确性问题；0.3.1 交付物本身干净。

**签发条件（不阻断，建议随下一版处理）**：F-1 升级 `STALE_OBSERVATION` 为正则模式 + 补 `contents` 形态断言。修完后这个守卫才真正配得上它注释里那句"必须被正反例自证命中"。

---

## NEEDS_CONTEXT

无。root-cause 三项声明我已自行在宿主持久化安装位取证核实，无需队长补充：

| 新文案声称 | 取证位置 | 核实结果 |
|---|---|---|
| "请求不带浏览器 cookie 与任何环境凭据" | `@deepseek-ai/dsh-web-fetch-http/lib/index.js:359-360`（provider 注释原文） | ✅ 逐字一致 |
| URL 带 username/password 被拒 | 同文件 `:281` — `if (url.username.length > 0 \|\| url.password.length > 0) throw new WebError("credentials in URLs are not allowed", "WEB_BLOCKED_URL")` | ✅ 证实 |
| "工具入参也只有 url、无法带 headers" | `@deepseek-ai/dsh-tool-web/lib/index.js:739-743` — `parameters: { url: { type: "string", required: true, ... } }`，仅一个入参 | ✅ 证实 |

副作用确认：`grep -n 'process\.env\|GH_TOKEN\|GITHUB_TOKEN\|Authorization'` 于 provider `lib/index.js` → 零命中，独立佐证 provider 侧无任何环境凭据读取路径。
