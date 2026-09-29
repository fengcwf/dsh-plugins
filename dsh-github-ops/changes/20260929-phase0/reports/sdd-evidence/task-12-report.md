# Task 12 报告：挂载与声明（lib/index.js + lib/repo-tools.js 微调 + cordis.patch.yml + package.json）

- 状态：**完成**（review 待 controller）
- Commit：`be8f5aa` feat: 挂载与声明——设置面双层子插件接线 + probeTimeoutMs + client 声明 + M-1/M-2（Task 12）（仅 dsh-github-ops/ 7 文件）
- 测试：`node --test` **61/61 绿**（49 基线零掉落 + 12 新增）；V1-V5 验证命令逐条符合期望值
- 证据文件：`task-12-red.txt`（RED 26 测 7 败）、`task-12-green.txt`（GREEN 61 测 0 败）同目录

---

## 一、实现（逐条验收对照）

| 验收项 | 落点 | 结果 |
|---|---|---|
| lib/index.js inject 增 webServer/connection + apply() 挂 settings-routes 子插件 | `lib/index.js:23`、`:135-189` | ✅ `node -e` 实测 `github-ops shell,tools,webServer,connection` |
| runGh 收编改指 lib/gh-auth.js（repo-tools 引用微调语义不变） | `lib/index.js:84`（工具层）+ `:164`（deps 热改现读执行器）；`lib/repo-tools.js` 仅执行器缝标注注释 | ✅ 实测 repo-tools.js 零 runGh 耦合（纯 argv 构造器，无可改指的引用）；收编全在 index.js；层③真执行断言绿 |
| Config 增 probeTimeoutMs（min 1000 / max 600000 / default 3000） | `lib/index.js:35-36`（INV-5 钳制落点；gh-auth/Settings-routes 只透传） | ✅ 6 条边界断言（999/600001 拒、1000/600000/4500/3000 过） |
| cordis.patch.yml config 全键重述 + probeTimeoutMs: 3000 | `cordis.patch.yml:26-27` | ✅ 测试断言全键在场 + id: github-ops / name: 'dsh-github-ops' 不动（P-9 零生产写入） |
| package.json exports["./client"] + dsh.client{platform:'web', inject} | `package.json:11,33-38` | ✅ 实测 `./lib/client.js true`；inject=kb-context 形最小集（locale/renderer/layout） |
| 模块 id=包名 / name='github-ops' / patch 行 id 不动（INV-9/R-4） | 均未触碰 | ✅ 测试断言 pkg.name='dsh-github-ops'、mod.name='github-ops'、patch id 不动 |
| ctx.effect() 收敛释放（卸载还原 shell.resolve、撤路由与挂载） | `lib/index.js:66-71`（工厂形）、`:135-189`（子插件拆除器） | ✅ 双断言锁死：apply 后包壳存活 + teardown 还原；卸载撤路由（spec.disposed=true） |
| P-4 无未声明依赖 / P-7 无 root 槽、sidebar/rightbar / C-2 先改 TECH.md | imports 全为内部模块+既有 zod/@deepseek-ai；无槽位注册 | ✅ TECH.md 三处先行更新（index.js 行扩展 / repo-tools 行改写 / 新增 test/index-mount.test.mjs 行） |

### M-1/M-2（Task 11 遗留，本卡收口）

- **M-1**：`settings-routes.js` 抛点补显式中文文案（`KError('badjson', CONTRACT.badjson[2])`、`KError('toolarge', CONTRACT.toolarge[2])`）+ internal() 回落条件收紧（`e.message !== e.kind` 才用 e.message，否则 CONTRACT 文案）。2 条 message 断言：畸形 JSON → `请求体不是合法 JSON`；超 1MiB → `请求体超过 1MiB 上限`。
- **M-2**：dispatcher 改「鉴权先行于查表回拒」（未过缝不给 404 差分=防路径枚举；过缝才如实 404；handler 内首行鉴权 INV-3 不变、每请求 requestRejection 仍只调用一次）。差分枚举回归断言：未授权(401/403) 下已知/未知路径 status+code 同形；已授权未知路径如实 404 GHO-ROUTE-05。

### deps 接线契约（carry-over ①）

settings-routes.js 实际解构面全数供给：`register`（webServer.register 拆缝）、`connection`、`Config`、`getConfig`（热改现读）、`ghAuth`（显式传 gh-auth 模块）、`runGh`（gh-auth.makeRunGh 热改现读重建）、`workspaceDir`（惰性 getter）、`cacheTtlMs: 30_000`（ADR-006）、`warn`。`readHosts`/`runGit` 走 settings-routes 内建默认（GH_CONFIG_DIR 感知读 hosts / spawnSync git with deps.workspaceDir）——index 侧重复实现反而引入漂移面，其默认已被 settings-routes.test.mjs 覆盖。health 配置合成段经 `deps.Config.safeParse` 消费 `{ok,switches,issues}` 形（Task 11 契约一致，carry-over ④）。

### workspaceDir（carry-over ②，Ruling 批准）

宿主干净来源**已找到**：`ctx.workspaceRegistry.list()`（dsh-workspace 服务，api-session/workspace-controller 同款消费面）→ 表头元素 `.path`，惰性 getter 每请求现读（后建工作区可见）；registry 缺位/求值失败回落 settings-routes 内建默认 `process.cwd()` 并 warn 留痕一次。行为断言：临时 git 仓（唯一 remote）+ 假 registry → `/repo-context` 返回该仓 remote（非插件目录 cwd），证明走宿主工作区。

## 二、TDD 证据

1. **RED**（`task-12-red.txt`）：先写 `test/index-mount.test.mjs`（10 测）+ settings-routes.test.mjs 追加 M-1/M-2（2 测）→ 26 测 7 败：导出契约/Config probeTimeoutMs/层①包壳存活/层⑤挂载/层⑤deps 缝/M-1（`actual: 'badjson'`）/M-2（`404 !== 401`）。既有 19 测全绿（零回归先行验证）。
2. **GREEN**（`task-12-green.txt`）：M-1/M-2 修复 + index.js 接线 + 声明面 → 61/61 绿（49 基线零掉落 + 12 新增）。
3. **验证命令逐条**（brief V1-V5）：
   - V1 `node --check lib/index.js && node --check lib/repo-tools.js` → exit 0
   - V2 `node -e "import('./lib/index.js')..."` → `github-ops shell,tools,webServer,connection`（与期望逐字一致）
   - V3 `node -e "...package.json..."` → `./lib/client.js true`（与期望逐字一致）
   - V4 `node --test` → 61/61（16+新增全绿，INV-7）
   - V5 `node --test test/load.test.mjs` → 真 import 冒烟绿
4. **真实 cordis Context 双向实测**（effect 形判定，输出原文落盘于此）：

```
# 拆除器形（0.2.1 现状）：apply 后立即还原
拆除器形 apply 后（异步激活后）包壳存活 = false

# 工厂形（本卡修复形）：
typeof ctx.effect 返回 = function
工厂形 apply 后包壳存活 = true
teardown 后还原 = true
```

判定：cordis 工厂语义=effect execute 当场跑、返回函数才是拆除器。0.2.1 的 `ctx.effect(() => { shell.resolve = origResolve })` 在 setup 期当场还原、包壳即死——**命令强制层在 0.2.1 运行时从未生效**（与 /root/.dsh/plugins/dsh-rtk-kit/lib/index.js:126-128 的 2026-09-29 e2e 教训逐字吻合）。Ruling-1 裁定：本卡改工厂形=恢复设计语义，非 INV-7 回归。

## 三、文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `lib/index.js` | 修改（124→200 行） | inject 挂载面、Config probeTimeoutMs、runGh 收编 makeRunGh、工厂形 effect、设置面双层子插件挂载、workspaceDir 惰性 getter |
| `lib/settings-routes.js` | 修改（299→300 行，≤300 守住） | M-1 文案回落×2 抛点+internal 条件；M-2 dispatcher 鉴权先行 |
| `lib/repo-tools.js` | 微调（注释级，语义不变） | 执行器缝收编标注 + 陈旧注释 10→11 修正 |
| `cordis.patch.yml` | 修改 | 全键重述 + `probeTimeoutMs: 3000` |
| `package.json` | 修改 | `exports["./client"]` + `dsh.client{platform:'web', inject}` |
| `test/index-mount.test.mjs` | 新建（236 行） | 假 ctx 真 apply()：导出契约/声明面/INV-5 钳制/四层逐层/挂载撤销/deps 缝/fail-open |
| `test/settings-routes.test.mjs` | 修改（+27 行） | M-1 2 条 message 断言 + M-2 差分枚举回归断言 |
| `changes/20260929-phase0/TECH.md` | 修改（C-2 先行） | index.js 行扩展、repo-tools 行改写、新增 index-mount 测试行（文件未入库，随 Task 10/11 先例留 Phase 7） |

## 四、自审（INV-7 四层零回归逐层核对）

| 层 | 语义变更审查 | 证据 |
|---|---|---|
| ① 命令强制层 | rewriteGithubCommand/enforce.js 零改动；resolve 包壳逻辑逐字不变；stdin 守卫/配置开关透传不变。变更点仅 effect 形（修复死锁→包壳真正存活，Ruling-1=恢复设计语义）+ `.map(runGh)`→`.map((argv) => runGh(argv))`（防 map index 串进 opts，行为等价） | 层① 2 测（改写/守卫/还原/开关）+ enforce.test.mjs 7 测全绿 |
| ② web_fetch 门禁 | gateWebFetch 与 pre-execute 注册逐字不变 | 层② 测（deny/ask/放行/off 不注册）+ enforce.test.mjs 全绿 |
| ③ 仓库工具集 | GITHUB_TOOL_SPECS/renderSteps 零语义改动；runGh 换 gh-auth.makeRunGh——stdout 多一层 stdin 精确擦除+token 形态扫描、stderr 过 redact（仅当输出含 token 形态串才可见差异，属 INV-1 加固）；退出码/截断/`(no output)` 渲染语义不变 | 层③ 真执行断言（echo 后端经 makeRunGh 产出）+ repo-tools.test.mjs 8 测全绿 |
| ④ awareness | AWARENESS 文案与注入逻辑不变（warn 出口加 console 兜底，fail-open 语义不变） | 层④ 测（文案注入/开关）全绿 |

其余红线：P-4 零新依赖（imports 全内部+既有）；P-7 零槽位注册（root/sidecar 未触）；P-9 零生产写入；P-5/P-10 测试全程 ghBin='echo' + mkdtemp 假仓（零真实凭据/零网络/零明文）；C-1 装载面 load 冒烟绿、假 ctx 缺 plugin/effect 缝 fail-open 不炸。

## 五、Concerns

1. **外层 inject 硬化 webServer/connection 的部署面影响**（唯一实质权衡）：非 web 部署面（headless/acp/sdk）provider 缺位时插件**整体延迟激活**（四层含命令强制层一并不生效）——kb-context 为此特意外层只 inject ['tools']、由内层子插件承载 web 面。本卡按 brief 验证命令机械锁死 `shell,tools,webServer,connection`（"值以它为准"），生产 web 面零影响；若需保 headless 面四层语义，须 controller 改验收形（外层 ['shell','tools']），那将改变 V2 期望值。
2. **中间态 boot 不可用**：dsh.client 已声明而 lib/client.js（Task 13）未落地——dsh-client-modules 激活扫描会 statSync/readFileSync bundle，缺失=启动合成报错（lib/index.js:152 missingBundles）。Ruling-2 已裁决：Task 13→17 顺序安全，期间禁止任何 .testenv 安装/boot。
3. `settings-routes.js` 恰 300 行（约定上限）——后续改动需先拆文件或减注释，勿静默越线。
4. package.json description 仍写「10 个仓库管理工具」（实际 11）——属 Task 16 文档同步面，本卡未动（C-2 范围纪律）。
5. 工具层 ghBin/ghTimeoutMs 冻结于 apply（与 0.2.1 相同，INV-7 parity）；设置面 deps.runGh 热改现读——两处语义差异是有意的，勿在后续"顺手统一"。

## 六、NEEDS_CONTEXT（非阻塞，保守解释已继续）

1. **多工作区取值语义未定义**：`ctx.workspaceRegistry.list()[0].path`（注册表显示序表头=最新创建）作为「用户工作区」；多工作区用户下取哪个无权威定义。建议 Task 14 UI 或端点 payload 后续暴露 workspace 标题/路径或多仓投影；缺位回落 process.cwd() 已 warn 留痕。
2. **dsh.client.inject 最小集**按 kb-context 形照抄三件套（locale/renderer/layout）；Task 13/14 实际 require 面若不同（纯 DOM 零 require / 需 ui-primitives）应随 client 实现同卡收口调整 manifest——manifest 与 client 的 require 面需最终对齐。

---

## 七、Delta（Ruling-3 处置后修订，**以本段为准**；§1-6 为初版记录保留可追溯）

> ⚠️ 初版 §1-6 中「inject = shell,tools,webServer,connection」相关行（验收表第 1 行、V2 期望、concern ①）已被 Ruling-3 修订，以下为准。

### Ruling-3：采纳 kb-context 形双层激活语义（concern ① 处置）

- **裁决**：外层 `inject = ['shell', 'tools']`（维持 0.2.1 激活语义：非 web 部署四层照常生效）；设置数据面由内层 `ctx.plugin({inject:['webServer','connection'], ...})` 承载（web 面才激活，provider 缺位=延迟激活不炸装载=INV-6 fail-open）。卡文本 V2 期望串 `github-ops shell,tools,webServer,connection` 判为计划缺陷（与 spec INV-7 冲突），按 spec 修订为期望 `github-ops shell,tools`。
- **改动**（commit `c74c0e7`，fix: 前缀，2 文件 +35/-10）：
  1. `lib/index.js`：inject 回 `['shell', 'tools']` + Ruling-3 注释；层⑤注释同步（内层承载/延迟激活语义）。
  2. `test/index-mount.test.mjs`：导出契约断言改**双断言**——①外层激活形 `['shell','tools']`（Ruling-3 口径）②内层子插件 `inject: ['webServer','connection']` 不变（activate() 内断言）；`mountRoutes()` → `activate()`（建模 cordis 硬 inject 延迟语义：provider 全在场才激活，缺位=不 apply）；两个 web 面用例补 `activated === true` 断言。
  3. **新增 Ruling-3 核心证据用例**：`非 web 部署面：无 webServer/connection provider → 数据面延迟激活缺席，四层（含层①包壳）照常存活`——断言 activated=false / specs=0（数据面缺席不炸）+ 层①包壳存活（curl→Bearer 改写在）/ 层②门禁在 / 层③11 工具在 / 层④awareness 在 / 卸载还原照常。
  4. TECH.md `lib/index.js` 行同步（C-2）：「inject 维持 ['shell','tools']（0.2.1 激活语义，Ruling-3）；设置数据面由内层子插件硬 inject ['webServer','connection'] 承载」。
- **证据**：`node --test` **62/62 绿**（61 基线零掉落 + 1 新增，task-12-green.txt 已更新）；V1 `node --check` exit 0；**V2 实测输出 `github-ops shell,tools`**（与 Ruling-3 新口径期望逐字一致）；V3 `./lib/client.js true`；V5 load 冒烟绿。

### 其余裁决落地

- **② deferred**：settings-routes.js 恰 300 行（上限）→ Task 15/终审 triage 拆文件（concerns ③ 记账，本卡不动）。
- **③ NEEDS_CONTEXT 两则已转 Task 13/14 派发清单**，不阻塞本卡（§6 原文保留）。

### 初版 concern ① 处置结论

初版 concern ①（外层硬化 inject 的 headless 面影响）经 Ruling-3 **消除**：现外层激活形与 0.2.1 完全一致（INV-7 零回归），web 面数据面照常（内层激活），headless 面数据面缺席=fail-open 如实。层①修复（Ruling-1）不受影响——工厂形 effect 在两种部署面都存活。
