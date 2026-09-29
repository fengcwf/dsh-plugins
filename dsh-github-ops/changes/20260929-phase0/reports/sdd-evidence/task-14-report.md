# Task 14 报告：UI 渲染（lib/client.ui.js，双栏六节卡片 + 交互状态，DESIGN.md token 逐字）

- 任务：.superpowers/sdd/tasks-dsh-github-ops/task-14-brief.md（验收与验证命令以其为准）
- 设计权威：changes/20260929-phase0/DESIGN.md（token 表）+ visual/final.png（双栏概览式定稿图）
- 结论：**DONE（GREEN）** · commit `1f830c6`（仅 dsh-github-ops/ 内 7 文件）· `node --test test/client-shell.test.mjs` 23/23 · 全量 `node --test` **85/85**（72 基线零回归，+13 新用例）

## 1. TDD 证据（RED → GREEN）

- **RED**：先落测试再实现。测试就绪、实现缺席时首轮执行失败，错误原文：
  `AssertionError [ERR_ASSERTION]: client.ui.cards.js 应有 __ModuleLoader__ 注册`（tests 11 / pass 10 / fail 1）。
- **GREEN**：实现 4 兄弟 chunk + 入口填真 + client.js L1 修后 `node --test test/client-shell.test.mjs` = 23/23。
- 过程诚实记录：①RED 是把三个新 chunk 临时移出 lib/ 后跑出的「实现缺席」失败；②实现落盘后首轮仍红一次，根因=测试文件忘了 `await import('../lib/client.ui.*')`（chunk 自注册靠 import），修测试装载而非放宽断言；③其后 2 次红均为测试桩时序（fakeApi 缺函数路由分支、悬挂响应需等投影 chunk 惰性载入后请求才发出），断言本身未放宽。
- 新增 13 用例（扩展不重写既有 10 例；仅 P-7 扫描块按 M1 扩正则、源码扫描面扩到 client 全家，注释标明缘由）：
  Loading 骨架 / Loading 按钮态（禁用+内联 spinner）/ Error 401 分级（hint + stderr 零透传）/ Error 传输失败 / Empty 空态 /
  限额可视化+三段检验行 / 零明文（密码框+保存即清空+留空=不修改+保存后立即验证）/ 多账号交互（busy+POST 语义）/
  P-8+禁令清单（可见文案）/ 布局与 token（CSS 机械锁）/ DESIGN token 表逐字在场 / L1×2（同座二次触发重挂、挂载期异常 fail-open）。

## 2. 验证命令（brief 逐条）

| 命令 | 结果 |
|---|---|
| `grep -nE '#[0-9A-Fa-f]{3,8}' lib/client.js lib/client.ui.js` | **零命中**（exit 1） |
| 扩面 `grep -nE '#[0-9A-Fa-f]{3,8}' lib/client*.js` | **零命中**（6 文件全 0） |
| `node --test test/client-shell.test.mjs` | 23/23 绿（含 Loading/Error/Empty 渲染断言） |
| `node --test`（全量基线） | **85/85 绿**（基线 72 不掉，+13） |
| 行数 ≤300（组件/模块） | client.js 247 / client.ui.js 119 / model 276 / project 110 / cards 234 / styles 110 |
| CLIENT_CHUNK 白名单 `client.<name>.js` | 5 个 UI chunk 全过（含 `client.ui.cards.js` 形） |
| 站内绝对 `/api/…` 字面、root/sidebar/rightbar 注册、DELETE 方法 | 全零命中 |

## 3. 实现（文件清单）

| 文件 | 行数 | 角色 |
|---|---|---|
| lib/client.ui.js | 119 | 入口 chunk：render* 接口面 + 容器组件（chunk 装载/模型订阅/生命周期）+ bundle 页一行摘要 |
| lib/client.ui.model.js | 276 | 状态模型：取数（api.fetch 文档相对）+ 动作（boot/check/saveToken/verifyAccount/switchAccount/addAccount） |
| lib/client.ui.project.js | 110 | 纯投影：分级错误卡 / 三段检验行 / 限额格式化 / 自检三行（F-scan-1 拆出，model 惰性 require.async 取用） |
| lib/client.ui.cards.js | 234 | 纯渲染：双栏六节卡片 + 共享原语（骨架/错误卡/按钮/状态点/矢量图标） |
| lib/client.ui.styles.js | 110 | token 样式（CSS 文本 + 幂等注入，document 守卫） |
| lib/client.js | 247 | 改：L1 挂载缝（待挂登记/微任务补位 + .then 成功回调 try+warn） |
| test/client-shell.test.mjs | 10→23 例 | 扩展：④UI 渲染 ⑤携带修复（M1 并入 P-7 用例） |

分工=容器/展示分离（frontend-ui-engineering）：模型层零 DOM 零 React、cards 零取数；hooks 只在两个薄容器组件（各 ~40 行）。

### 布局对照 final.png（逐项）

- 双栏概览式：左栏=认证状态/访问检验/插件自检；右栏=Token 维护/多账号库/仓库上下文（col 顺序与图一致，测试断言）。
- 双栏非对称 `minmax(0,3fr) minmax(0,4fr)`（图左栏≈875px : 右栏≈1155px ≈ 3:4）；`<960px` 折叠单列（`@media (max-width: 959px)`→`grid-template-columns:1fr`）；`max-width:1200px` 居中；卡间距 16px（space-4）、列间距 24px（space-5）、卡内分组 12px（space-3）。
- 六卡标题逐字：认证状态 / 访问检验 / 插件自检 / Token 维护 / 多账号库 / 仓库上下文；页头「GitHub 集成」+「dsh-github-ops · 认证、访问检验与仓库上下文」。
- 按钮文案逐字（DESIGN 清单）：保存并验证 / 检查 GitHub 访问 / 重新检查 / 添加账号 / 切换；active 行徽章「active」+「当前」。
- 认证状态卡行：主机 / 登录名 / Token（「已配置」绿 chip，仅是否在位）/ API 限额 `4995 / 5000`（mono）/ 限额重置 `14:32（今天）`。
- 访问检验三段行：本地配置（配置文件解析正常）/ 认证连通（`gh api /user → 200`，mono）/ 延迟 · 限额（`650ms · 4995/5000`，mono）；对勾/叉=矢量 SVG。
- 仓库上下文行：remote（`origin · …`，mono）/ 分支 / 仓库（fullName + 矢量星标 + 星数）。
- 错误卡形（图 401 卡）：状态点 +「401 · token 无效」+ message + 修复指引 hint；描边不叠影。

### token 映射（DESIGN.md 表 → 实现引用 → 运行时证据）

**Ruling（关键）**：DESIGN.md token 表的变量名是简写层，运行时主题（`@deepseek-ai/dsh-client-ui-theme`）只定义 `--dsw-alias-*` 语义别名（+ `--dsw-radius-*`/`--dsw-shadow-lv*`/`--dsw-font-family`）。证据：全 dsh checkout grep `--dsw-label-primary|--dsw-bg-base|--dsw-font-mono|--dsw-space-1|--dsw-shadow-l1`（非 alias）**零命中**；宿主自身以 `var(--dsw-font-mono, ui-monospace, …)` 形引用、kb-context 生产插件全用 `--dsw-alias-*`。**处置：双链引用 `var(--dsw-<DESIGN 表名>, var(--dsw-alias-<运行时真名>))`**——表名逐字在场（测试机械锁）+ 真名兜底保证渲染与暗色自动适配（用户裁定）。间距无主题 token：`var(--dsw-space-N, <DESIGN 值 px>)`。

| DESIGN 用途 | 实现引用（首选 → 兜底） | 浅色对照一致性 |
|---|---|---|
| 画布底 | `--dsw-bg-module-platform` → `--dsw-alias-bg-module-platform` | F5F6F7=bluish-60 ✓ |
| 卡面 | `--dsw-bg-base` / `--dsw-bg-layer-1` → alias 同名 | FFFFFF ✓ |
| 边框 l1/l2/l3 | `--dsw-border-l1/l2/l3` → alias 同名 | 0000000A/1A/1F ✓ |
| 文字 primary/secondary/tertiary/caption | `--dsw-label-*` → alias 同名 | 0F1115/61666B/81858C/ADB2B8 ✓ |
| 唯一强调色 | `--dsw-state-business-primary` → alias（主按钮/焦点环/链接/active 徽章） | 4176E6=deepseek-500 ✓ |
| 主操作浅底/深字 | `--dsw-state-business-bg/-fg` → `alias-state-business-tertiary` / color-mix(business-primary 72%, label-primary) | E4EDFD ✓ / 深字按宿主配对先例派生（见下） |
| 成功（点/浅底/深字） | `--dsw-state-success-dot/bg/fg` → `alias-state-success-primary/-tertiary` / color-mix(success-primary 72%, label-primary) | 22C55E/E6FAED ✓ |
| 警告（点/浅底/深字） | `--dsw-state-warning-dot/bg/fg` → `alias-state-warn-primary/-tertiary/-label` | F59E0B/FEF5E7 ✓ |
| 错误（点/浅底/描边/深字） | `--dsw-state-error-dot/bg/border/fg` → `alias-state-error-primary` + color-mix 8%/30% 描边 + color-mix 72% 深字 | EC1313 系 ✓ |
| 字体族/mono | `--dsw-font-family`；`--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace`（宿主同款回退形） | DESIGN「DejaVu Sans Mono 回退」语义 ✓ |
| 间距 space-1..6 | `--dsw-space-N, 4/8/12/16/24/32px`（DESIGN 表值作回退） | ✓ |
| 圆角 xs/sm/md | `--dsw-radius-xs/sm/md`（真实 token，直引） | 4/8/12px ✓ |
| 阴影 | `--dsw-shadow-l1` → `--dsw-shadow-lv1`（真名 lv1）；错误卡描边不叠影 | ✓ |

- 深字色取 color-mix 派生的依据=宿主自身配对先例（dsh-client-ui-* 源码：`background:var(--dsw-alias-state-success-tertiary); color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 72%, var(--dsw-alias-label-primary))`；warn 配对 `warn-tertiary + warn-label` 14 处）。理由：DESIGN 表深字浅色值是静态色（green-900 等），静态值不随暗色反转会塌对比度，派生形两态可读（用户裁定暗色自动适配）。
- 机械锁（测试）：DESIGN 表 token 名逐字在场；`color/background/border/box-shadow/fill/stroke` 声明值必须 `var(--dsw-*|color-mix(|inherit|currentColor|transparent|none`；零 hex。

## 4. 自审（DESIGN.md 禁令清单逐项）

| 禁令 | 结论 | 证据 |
|---|---|---|
| 零 em-dash/en-dash 可见文案 | PASS | 测试树遍历断言 + 全部字符串字面扫描零命中 |
| 无 emoji 图标（状态点=CSS 圆点、星标=矢量星形） | PASS | `.gho-dot` CSS 圆点；对勾/叉/星=svgIcon 矢量 path；`\p{Extended_Pictographic}` 断言 + grep 零命中 |
| 无渐变/玻璃拟态/霓虹外发光 | PASS | grep `gradient|backdrop-filter|blur(` 零命中 |
| 无三等宽卡堆砌（双栏非对称） | PASS | `grid-template-columns:minmax(0,3fr) minmax(0,4fr)`（对齐定稿图 3:4） |
| 禁纯黑文本色 | PASS | 零 hex；文本全 `--dsw-label-*` |
| 唯一强调色约束 | PASS | business-primary 仅主按钮/焦点环/「切换」链接/active 徽章；语义色仅状态点、对错图标、错误卡、状态 chip（图绿「已配置」/amber「待验证」形） |
| 触感：:active translateY(1px)、focus ring 2px | PASS | `.gho-btn:active:not(:disabled){transform:translateY(1px)}`；focus-visible=focus-ring 2px（含 prefers-reduced-motion 降级） |

其他验收逐项：Loading（按钮内联 spinner+禁用+骨架，测试断言）✓；Error 分级 401/403/429/超时/gh 缺失/写入失败+修复指引、stderr 零透传（测试注入 `stderr: raw ghp_SECRET…` 断言树内不可见）✓；Empty「尚无其他账号」+添加入口 ✓；限额可视化 remaining/limit/reset + 分类 hint 贯穿 ✓；组件/模块 ≤300 行（最大 276）✓；UI 零明文（INV-1/P-5）：状态卡只显主机/登录名/是否在位、密码框保存即清空、「留空=不修改」（INV-4：空提交零请求零触碰）、token 只进请求体（stdin 链路）✓；P-8：无删除/登出按钮与入口（树遍历 + DELETE 方法 + 字面扫描三重锁）✓；零第三方 UI 库（P-4，纯 react.createElement 自绘）✓。

## 5. NEEDS_CONTEXT / 假设（保守继续，需父级裁定）

1. **DESIGN.md token 表名与运行时不一致**（见 §3 Ruling）：建议 Phase 7 校订 DESIGN.md 表（表名→真名或注明双链约定），否则后续按表名直写会踩空（变量不存在=样式静默失效）。
2. **定稿图 Token 行 `ghp_****` 掩码形态未实现**：合同 1/INV-1「只显主机/登录名/token 是否在位」，且数据面 /status 只投影 `hasToken` 布尔、无形态数据；UI 不自行拼接（显示边界）。如确需掩码请数据面补投影（不建议）。
3. **多工作区投影（合同 8）暂缺**：/repo-context 响应（settings-routes.js repoHandler）只有 `git/repo/hint`，无 workspace 字段——UI 不自行拼接，仓库上下文卡暂不展示工作区标题/路径。如需展示请数据面补 workspace 投影字段（建议后续卡，非本卡 inScope）。
4. **添加账号入口=引导复用 token 录入链路**（数据面唯一录入端点 POST /token，`gh auth login --with-token` 即加入 hosts.yml）：按钮点按→引导文案（粘贴 PAT 后在 Token 维护卡保存）。**输入框聚焦增强未实现**（原报告曾称「token.focus 计数（容器可聚焦输入框）」与 diff 不符——Round 1 已删死计数器 `token.focus`，聚焦增强记 deferred）。
5. **逐账号验证入口已接线（Round 1）**：「已验证/待验证」=按钮（`.gho-verify`，aria-label「重新验证账号 <login>」+ busy 禁用）→ `actions.verifyAccount(login)` → POST /accounts/verify `{logins:[login]}`（零破坏），行状态经 /accounts/verify 投影刷新；boot 自动跑一次全量验证以呈现图中已验证/待验证混排。覆盖测试=「T14 多账号交互」用例接线断言。
6. **未配置（code -07）按空态/未配置展示**（hosts.yml 缺失属常态），其余 ok:false 走分级错误卡；分流看 ok/code 不看 HTTP 状态（合同 9）✓。
7. 通过态行 detail 取服务端 message/投影（如「配置合成复检通过」），定稿图「cordis.patch.yml 合并正常」视为示意文案。

## 6. concerns

1. **未做真机浏览器实测**：本卡验证面=Node 测试+源码机械锁。建议后续卡把 .testenv boot 冒烟四关跑一遍，重点：5 个 `client.*.js` chunk 真机可取性（dsh-client-modules `chunkResponse` 源码级证据=与 client.js 同目录任意 `client.<name>.js` 即服务，但 **多层嵌套 require.async（entry→model→project）未实测**）+ 真 GUI 截图对照 final.png。
2. hooks 依赖宿主 react 真身（useState/useEffect，kb-context 生产先例同款）；Node 测试走 fakeReact 只跑纯渲染/模型层，两个薄容器组件的 hook 路径未在 Node 侧执行（风险低：组件各 ~40 行且逻辑已下沉模型层）。
3. 整体拆座瞬间，待挂座可能被微任务补位后随即拆掉（alive 守卫 + 微任务合并已把窗口压到最小，终态恒收敛 0 注册）；属外观瞬态，不影响防双挂载不变量（既有 4 例多座测试全绿）。

## 7. 修复环 Round 1（Spec FAIL + Needs work → 修复记录）

> 测试口径更新：client-shell 10→**25 例**（原 23 + 本轮 2 新增），全量 `node --test` **87/87**（基线 85 不掉，+2）。

### 【S1 HIGH】源码锁漏扫壳（M1 扫描面回归=假保险）

- **根因**：`allClientSources()` 用 CLIENT_CHUNK 正则过滤 lib/，实测 `CLIENT_CHUNK.test('client.js')===false` → P-7 banName/banCall、P-8 DELETE、禁 `/api/` 绝对形三处源码扫描**全部不含 lib/client.js**，而 SEATS 表（`name: 'settings.section'` 等 name: 注册形=M1 真实靶子）只在壳里。
- **改了什么**：`allClientSources()` 显式前置 `read('../lib/client.js')` + chunks（壳必入列）；`banCall/banName` 提升模块级共享；零 hex 自动锁并入 `allClientSources()` 循环（不再只锁 stylesMod.CSS 文本）。
- **覆盖测试**：新增「M1/S1 扫描面回归」——①扫描集合必含壳（断言含 SEATS 表字面 `name: 'settings.section'`）且 ≥6 份；②反例自证：合成坏源码（`name: 'root'`、`slots.inject('sidebar'`、`method 'DELETE'`、hex）逐一必命中；③真实源码（壳+全 chunk）四类零命中。
- **命令 + 输出**：`node --test test/client-shell.test.mjs` → `tests 25 / pass 25 / fail 0`（M1/S1 用例 ✔）。

### 【S2 MED】非 JSON 4xx/5xx 被当成功 + 死合取

- **根因**：`request()` 对非 JSON 响应合成 `{transport:false, code:null, …}` 缺 `ok:false` → `isHardFailure` 判 false → login-gate HTML/302、代理 502 在 loadStatus/loadHealth/loadRepo 渲染「未检测到/未配置」而非 INV-10 分级卡；`body.http===true` 全仓无人产出=死合取。
- **改了什么**：合成体改 `{ ok:false, code:null, status, message:'HTTP <s>', hint:null }`（硬失败形）；`isHardFailure` 删死合取（只余 `transport===true` / `ok===false && !-07`）；project.js 归因补 4xx/5xx 兜底（≥500→「服务内部错误」、≥400→「请求被拒」）+ `hintByStatus` 修复指引。
- **覆盖测试**：新增「T14 Error（非 JSON 5xx）」——status/health/repo-context 三路 `502 + jsonThrows` → 三 phase 全 error、≥3 张分级卡、标题「502 · 服务内部错误」+ 修复指引、树内无「未检测到」（洞限三个 load，逐个断言）。
- **命令 + 输出**：`node --test test/client-shell.test.mjs` → `tests 25 / pass 25 / fail 0`。

### 【MED a】报告主张与 diff 不符 ×2（IL-2 证据纪律）

- **①逐账号验证**：原 cards 纯 span、`verifyAccount` 死动作 → **补接线**：`verifyBtn`（`.gho-verify`，aria-label「重新验证账号 <login>」+ busy 禁用）→ `actions.verifyAccount(login)`；覆盖测试=「T14 多账号交互」新增断言（按钮存在 / aria 在 / `onClick()` → POST `/accounts/verify` body `{logins:['ci-bot']}` / 终态 busy 收敛）。
- **②token.focus 死计数器**：**删除**（addAccount 只留引导文案）；报告 §5-4 措辞已改为「聚焦增强未实现（deferred）」。§5-4/§5-5 已就地改正，全文主张与 diff 一致。
- **命令 + 输出**：`node --test`（全量）→ `tests 87 / pass 87 / fail 0`；`wc -l lib/client*.js` → 247/242/119/276/113/113 全 ≤300；`grep -cE '#[0-9A-Fa-f]{3,8}' lib/client*.js` → 全 0。

### 【deferred 不动（已记账，终审 triage）】

switchAccount busy finally 收敛（LOW）/ Empty 断言限定 `.gho-empty` 子树（LOW）/ `gho-spinner-wrap` 死备选（NIT）/ styles 工厂注释措辞（NIT）/ 输入框聚焦增强（新增 LOW）。
