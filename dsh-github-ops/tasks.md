# tasks.md — 任务清单（dsh-github-ops 设置栏目优化）

> 格式: 每个任务使用 `## Task N: [标题]` 开头，包含角色、技能、验收标准等字段。
> 状态标记: ⬜ 待开始 | 🔄 进行中 | ✅ 已完成 | ❌ 已阻塞
> 当前变更：`changes/20261010-webfetch-gate-copy/`（2026-10-10 Phase 8 R2：web_fetch 门禁 deny 文案去硬编码 + 哨兵结构化加固）
> 派发路径：PATH A 具名委派（沿用 obsidian-web 先例 Ruling；subagent_scout 具名行 maxDepth:0 实测拒派 → 通用 subagent + 契约内联降级路径）

---

## Task 1: Phase 0 ①机械扫描 phase0-scan.py

- status: ✅
- phase: Phase 0
- role: captain（机械操作）
- skills: clsh-project
- depends: 无
- covers: IL-4
- 派发标识: 本会话直跑（机械脚本，无需委派）

**验收标准**:

- [x] phase0-data.json 存在且非空（OBSIDIAN_VAULT 已带，vault 匹配非空）
- [x] 扫描产出路径 changes/20260929-phase0/phase0-data.json

## Task 2: Phase 0 ②通读 ERRORS.md + LEARNINGS.md

- status: ✅
- phase: Phase 0
- role: captain（通读内化）
- skills: clsh-project
- depends: 无
- covers: 红线 1、检索铁律

**验收标准**:

- [x] ERRORS.md（218 行）通读，相关条目摘出（ERR-007 用户明确指令不做多余分析、ERR-008 协调者不自己干活、2026-09-23 Phase 0 四件套机制化、2026-09-25 IL-2 E2E 验证）
- [x] LEARNINGS.md（154 行）通读，相关条目摘出（LRN-033 热重载红线、LRN-035 manifest 严格 JSON、LRN-036 patch 语义+功能在场双断言、LRN-038 vault 整文件写、LRN-039 测试走打包产物+真安装路径、LRN-040/041）

## Task 3: Phase 0 ③本地历史文档扫描（vault + docs/）

- status: ✅
- phase: Phase 0
- role: captain（检索）
- skills: obsidian-operations（检索铁律）
- depends: 无
- covers: IL-6

**验收标准**:

- [x] vault 检索（wiki_search「github token 设置 插件」、INDEX.md grep）——命中 wiki/syntheses MCP 系列（GitHub MCP 否决史：gh CLI 已覆盖全场景）、reference/integration/github-sync-guide
- [x] 本地 docs/ 命中关键证据：docs/2026-09-23-dsh-web-ui-mechanism.md（设置页族 typed slot：settings.section/plugins.tab/plugin.item/general.item，五缝合法面）、docs/audit-plugin-conventions-2026-09-28.md（dsh-github-ops 既有 findings：W-3 缺 repository、N-1 files 缺 CHANGELOG、N-2 dsh.plugin.json、N-5 peer 上界——0.2.1 已修）

## Task 4: Phase 0 ③'设置栏目集成契约深调研（scout 委派）

- status: ✅
- phase: Phase 0
- role: scout
- skills: zoom-out（模块/调用方地图）
- depends: 无
- covers: IL-6
- 派发标识: session d25885b8-aff3-481b-9666-3592868328e1（通用 subagent 降级路径——subagent_scout 具名行 maxDepth:0 拒绝，实测错误 "subagent depth 1 exceeds maxDepth 0"；角色契约内联进 prompt；模型=会话默认，工具面无 model 参数）

**验收标准**:

- [x] 报告落盘 changes/20260929-phase0/reports/settings-integration-research.md（261 行）
- [x] 覆盖 6 题：kb-context 设置栏目挂载 / dshmarket 设置栏目 / dsh web GUI 设置菜单注册契约 / wiki-steward-obsidian-web web 形态对比 / token 维护安全落点 / 访问健康检查探针
- [x] 每条结论带证据等级 + 文件:行号；凭据零明文（抽查 kb-context client.js:12,223-226 与 package.json dsh.client 声明一致）

## Task 6: Phase 1 三仓同类项目复用调研（用户 R7 转向指令）

- status: ✅
- phase: Phase 1
- role: scout
- skills: zoom-out
- depends: Task 4
- covers: IL-7（探索）、用户 R7 转向指令
- 派发标识: session ab2c28ae-2073-4228-a20d-1497011eaa19（通用 subagent 降级路径，契约内联）

**验收标准**:

- [ ] 报告落盘 changes/20260929-phase0/reports/three-competitors-research.md
- [ ] 逐仓功能清单 + 与 dsh-github-ops 重叠/互补矩阵 + 可复用点（账号/token 管理、设置面、健康检查）
- [ ] 重定优化需求建议（三点需求逐条：维持/修改/新增）+ NEEDS_HUMAN（yq04 vs gestaltrun 命名歧义）
- [ ] 凭据零明文、结论带出处

## Task 5: Phase 0 ④调研摘要 phase0-research.md（引用①②③产出）

- status: ✅
- phase: Phase 0
- role: captain
- skills: clsh-project
- depends: Task 1, Task 2, Task 3, Task 4
- covers: IL-5, IL-6, IL-NEW

**验收标准**:

- [ ] 引用 phase0-data.json 实际数据（file_count/languages/solutions_matches 等）
- [ ] 含「## 待确认问题清单」≥10 个编号问题，覆盖 ≥3 维度（功能/技术/边界/约束）
- [ ] gate-phase0.py PASS

## Task 7: Phase 2 TECH.md（2-3 方案对比 + ADR + 文件变更范围）

- status: ✅
- phase: Phase 2
- role: captain
- skills: clsh-project
- depends: Task 5, Task 6
- covers: US-1..US-9、INV-1..INV-10

**验收标准**:

- [ ] 含 2-3 方案对比表格（gate-phase2 方案关键词检查过）
- [ ] ADR 记录挂载/数据面/token 写入/健康探针/多账号/零构建 UI 等关键决策
- [ ] 文件变更范围表 + 实现注意事项 + 范围外 + 技术风险

## Task 8: Phase 2.5 视觉 Spike——候选参考图（artist）

- status: ✅
- phase: Phase 2.5
- role: artist
- skills: taste-skill、frontend-ui-engineering
- depends: Task 7
- covers: 视觉 Spike V1-V3
- 派发标识: session 7615f058-03e7-472c-b653-8f168a53a5bd（通用 subagent 降级路径——subagent_artist 具名行 maxDepth:0 同款拒派；契约内联）

**验收标准**:

- [ ] 2-3 张候选图落 changes/20260929-phase0/visual/candidate-*.png（≥600px 宽）
- [ ] 样式对齐 dsh token（唯一色板来源，从宿主 CSS 提取）
- [ ] 图内零真实凭据（token 一律遮罩形）

## Task 9: Phase 2.5 DESIGN.md（token 化约束，用户定稿后产出）

- status: ✅
- phase: Phase 2.5
- role: captain
- skills: taste-skill
- depends: Task 8
- covers: 视觉 Spike V3-V4

**验收标准**:

- [ ] 用户选定候选图 → 复制为 visual/final.png
- [ ] DESIGN.md ≥10 行，含色彩 token（hex）/字体字号阶梯/间距阶梯/圆角阴影/断点/定稿图引用

---

<!-- Phase 6 实现计划卡（Task 10-17）：按 TECH.md 文件变更范围拆卡，TDD 形（模块卡自带对应测试文件），最后测试波收口 + 发版欠账 + .testenv 交付核对。 -->

> Phase 6 实现计划（2026-09-29 起草）。上游：proposal.md（US/INV/API 合约）、constitution.md（C-1..C-5 / P-1..P-10）、TECH.md（ADR-001..008、文件变更范围、R-1..R-6）、DESIGN.md（token 约束）。
> 拆卡原则：单卡=单轮可完成量、独立关注点；实现卡自带配对测试文件（P-3 不跳测试）；范围外 US-10/US-11 不安排实现（TECH.md 已显式排除）。

## Task 10: lib/gh-auth.js 纯逻辑收编（runGh + 状态投影 + 探针三段 + 账号库 + 切换 + redact）

- status: ✅（commits 3599cea..4ff7fa7，修复环 R1 后 review clean）
- phase: Phase 6
- role: coder
- skills: clsh-project、doubt-driven-development
- depends: Task 7
- covers: US-1, US-3, US-4, US-6, INV-1, INV-2, INV-5, INV-10

**验收标准**:

- [ ] R-1 前置实测先行：.testenv 用一次性假 token 经 stdin 跑 `gh auth login --with-token`，把失败形（退出码/stderr 形）钉死，结论落 changes/20260929-phase0/reports/gh-auth-token-write-shape.md（R-1；P-10 真 token 禁入测试与日志，假值一次性用后即换）
- [ ] lib/gh-auth.js（新建）导出统一执行器 makeRunGh({ghBin, timeoutMs})：spawnSync 一律 stdin 传 token，env 恒定 GH_PROMPT_DISABLED=1 / NO_COLOR=1 / PAGER=cat，maxBuffer 4MiB；argv/日志/返回值零明文（P-5、INV-1）
- [ ] parseHostsMeta()：hosts.yml 元数据行级解析（active_account / user / users[] / git_protocol，oauth_token 只判在位），输出永不含 token 值（INV-1）；不引第三方 YAML 库（P-4），如确需依赖先改 TECH.md 再动代码（C-2）
- [ ] probeAccess() 三段探针：local-config（gh auth status --json hosts）→ auth-connect（gh api user）→ latency-quota（gh api rate_limit + 墙钟 elapsedMs），输出 {ok,stage,code,status,login,message,elapsedMs} + 分级 hint（401/403/429/超时/gh 缺失/写入失败，错误码 GHO-* 形）（US-3、US-6、INV-10）
- [ ] probeTimeoutMs 贯通全部探针调用（缺省 3000ms，超时出分级错误结果、不挂死）（INV-5）
- [ ] listAccounts() 账号投影 {login,active,configured,verified}（不读 token 值）+ switchActive()（gh auth switch；命令不可用（gh<2.20）降级提示手工切换）（US-4、R-3）
- [ ] redact()：git remote URL 凭据擦除 + token 形态串扫描（INV-1）
- [ ] 零新增凭据存储：一切凭据只经 gh stdin 进 hosts.yml（P-6、INV-2）
- [ ] test/gh-auth.test.mjs（新建）：假 gh 脚本记录 stdin/argv，覆盖状态投影/探针三段/失败分级/切换降级/redact/超时分支；断言输出零明文（P-10、R-6）
- [ ] 验证命令：`node --check lib/gh-auth.js`（exit 0）；`node --test test/gh-auth.test.mjs`（全绿）；`node --test`（既有 16 测试零回归，INV-7）

## Task 11: lib/settings-routes.js 数据面（8 端点 + 首行鉴权 + 1MiB + zod 白名单）

- status: ✅（commit 79dad60，Spec PASS + Quality Approved，4 minor deferred）
- phase: Phase 6
- role: coder
- skills: clsh-project、doubt-driven-development
- depends: Task 10
- covers: US-2, US-3, US-4, US-5, US-7, US-9, INV-1, INV-3, INV-4, INV-10

**验收标准**:

- [ ] lib/settings-routes.js（新建）注册 prefix `/api/github-ops` 8 端点：GET /status、POST /token、POST /check、GET /accounts、POST /accounts/verify、POST /accounts/switch、GET /repo-context、GET /health（ADR-002 合约逐条对齐）
- [ ] 每个 handler 首行 `connection.requestRejection(request)` 鉴权，未授权返回 401/403（INV-3）
- [ ] 请求体 ≤1MiB 有界（超限拒）；请求字段 zod 白名单整单拒（INV-1）
- [ ] POST /token「留空=不修改」：空 token 提交绝不触碰既有凭据；API 面无删除/登出端点（INV-4、P-8）
- [ ] GET /repo-context：URL 凭据擦除（INV-1）+ TTL ≤30s 内存缓存（ADR-006）；失败 fail-open 卡内降级（INV-6）
- [ ] GET /health 三段自检：配置合成（Config.parse 复检）/ gh 可用（gh --version，probeTimeoutMs）/ 凭据在位（hosts.yml 存在 + active 投影，零明文）（US-7、ADR-007）
- [ ] 错误一律结构化 {ok,stage,code,status,login,message,elapsedMs}；stderr 敏感串不透传（INV-10、P-5）
- [ ] test/settings-routes.test.mjs（新建，integration 形：假 ctx 真 handler）：逐路由鉴权矩阵（INV-3）、留空不修改（INV-4）、1MiB 限（INV-1）、零明文投影（INV-1）、错误结构化（INV-10）；US-9 的 integration 测试面由此卡补齐
- [ ] 验证命令：`node --check lib/settings-routes.js`（exit 0）；`node --test test/settings-routes.test.mjs`（全绿）；`node --test`（全量零失败）

## Task 12: 挂载与声明（lib/index.js + lib/repo-tools.js 微调 + cordis.patch.yml + package.json）

- status: ✅（be8f5aa..c74c0e7，Spec PASS + Quality Approved；层①死锁修复+Ruling-3 双层激活形；3 minor deferred/携带）
- phase: Phase 6
- role: coder
- skills: clsh-project、dsh-plugin-ops
- depends: Task 11
- covers: INV-5, INV-7, INV-9

**验收标准**:

- [ ] lib/index.js：inject 增 `webServer` / `connection` 挂载面，apply() 挂 settings-routes 子插件；runGh 收编改指 lib/gh-auth.js（lib/repo-tools.js 引用微调语义不变，INV-7 四层零回归）
- [ ] Config 增 probeTimeoutMs（zod min 1000 / max 600000 / default 3000）（INV-5、ADR-004）
- [ ] cordis.patch.yml config 全键重述（整行替换语义）+ `probeTimeoutMs: 3000`；只改包内文件，绝不写生产 profiles/web/cordis.patch.yml（P-9）
- [ ] package.json：`exports["./client"] = "./lib/client.js"`（缺=启动报错）+ `dsh.client{platform:'web', inject}`（对齐 kb-context 形最小集）；模块 id=包名 dsh-github-ops、lib/index.js name='github-ops' 与 patch 行 id 不动（INV-9、R-4）
- [ ] ctx.effect() 收敛释放：卸载还原 shell.resolve、撤路由与挂载（C-1、审计 W 教训反着做）
- [ ] 不引 TECH.md 未声明依赖（P-4）；不动 root 槽、不覆盖 sidebar/rightbar 占位（P-7）；文件结构偏离先改 TECH.md（C-2）
- [ ] 验证命令：`node --check lib/index.js && node --check lib/repo-tools.js`（exit 0）；`node -e "import('./lib/index.js').then(m=>console.log(m.name, m.inject.join(',')))"` 期望 `github-ops shell,tools,webServer,connection`；`node -e "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));console.log(p.exports['./client'], !!p.dsh.client)"` 期望 `./lib/client.js true`；`node --test`（16+新增全绿，INV-7）；`node --test test/load.test.mjs`（真 import 冒烟）

## Task 13: lib/client.js 客户端壳（__ModuleLoader__ + 槽位多座自探测 + fetch 文档相对）

- status: ✅（eea1d21..f1b1fe2，Spec PASS + Approved；chunk 形实测成立；M1/L1 携带 T14）
- phase: Phase 6
- role: coder
- skills: clsh-project、frontend-ui-engineering
- depends: Task 12
- covers: US-8, INV-6, INV-9

**验收标准**:

- [ ] lib/client.js（新建）`window.__ModuleLoader__.load({id:'dsh-github-ops', factory})` 注册形；factory(require) 只登记模块体，副作用全在 apply（INV-9、R-4）
- [ ] settings.section 主座注册（id='github-ops'，label「GitHub 集成」）+ 兼容座自探测（settings.plugins.tab / plugins.bundle.config 等）防双挂载（US-8、ADR-001、R-2）
- [ ] root 槽禁注册；sidebar/rightbar 只加内层 seat（P-7）
- [ ] fetch 一律文档相对 `api/github-ops/…`（站内绝对路径在 login-gate 基址下 404 的铁律）
- [ ] 槽位方缺席=该面缺席：catch + logger.warn，绝不炸插件（INV-6 fail-open）
- [ ] 兄弟 chunk 命名遵守 `client.<name>.js` 形（宿主 dsh-client-modules chunkUrl 解析约定，🟡 源码级证据）；.testenv 实测 `/plugins/dsh-github-ops/<chunk>.js` 可取性，404 则回退单文件形态并在 TECH.md 记录处置（C-2）
- [ ] test/client-shell.test.mjs（新建）：模块注册形、多座防双挂载、无 slots 注入 fail-open 三类断言
- [ ] 验证命令：`node --check lib/client.js`（exit 0）；`node --test test/client-shell.test.mjs`（全绿）

## Task 14: UI 渲染（lib/client.ui.js，双栏六节卡片 + 交互状态，DESIGN.md token 逐字）

- status: ✅（eea1d21..afc4cc5，修复环 R1 后 review clean；87/87）
- phase: Phase 6
- role: coder
- skills: clsh-project、frontend-ui-engineering、taste-skill
- depends: Task 13
- covers: US-1, US-2, US-3, US-4, US-5, US-6, US-7, INV-1, INV-4, INV-10

**验收标准**:

- [ ] 双栏概览式布局按 DESIGN.md 定稿图：左栏（认证状态卡/访问检验卡/插件自检卡）+ 右栏（token 维护卡/多账号库卡/仓库上下文卡）；<960px 折叠单列，max-width 1200px 居中，卡间距 16px
- [ ] 色彩/字体/间距/圆角阴影逐字引用 DESIGN.md token 表的 `--dsw-*` CSS 变量（C-5）；唯一强调色约束与禁令清单（零 em-dash 可见文案、无 emoji 图标、无渐变/玻璃拟态）逐项过
- [ ] UI 零明文：状态卡只显主机/登录名/token 是否在位；token 密码框保存即清空、「留空=不修改」提示（INV-1、INV-4、P-5）
- [ ] 无删除/登出按钮与入口（P-8）；零第三方 UI 库（P-4）
- [ ] 交互状态三件套：Loading（按钮内联 spinner + 禁用 + 骨架）、Error（分级错误卡 401/403/429/超时/gh 缺失/写入失败 + 修复指引，stderr 敏感串不透传）、Empty（多账号库空态「尚无其他账号」+ 添加入口）（INV-10）
- [ ] 限额可视化（remaining/reset 形如 4995/5000）与分类 hint 贯穿各卡（US-6）；组件/模块 ≤300 行
- [ ] 验证命令：`grep -nE '#[0-9A-Fa-f]{3,8}' lib/client.js lib/client.ui.js` 期望零命中（唯一色板来源 = --dsw-* 变量）；`node --test test/client-shell.test.mjs`（含 Loading/Error/Empty 渲染断言）；对照 DESIGN.md token 表与 changes/20260929-phase0/visual/final.png 逐项核对（review 证据落 review-package）

## Task 15: 测试波收口（退化形/超时形/零明文全链 + load 冒烟保持）

- status: ✅（BASE afc4cc5，87→109 全绿 + load exit 0；携带 D1/Empty 子树/F-7 全收口；T15 修复环 1 例：lib/client.ui.project.js labelOf 归因错显——测试驱动最小修复；证据=changes/20260929-phase0/reports/tester-report.md）
- phase: Phase 6
- role: tester
- skills: clsh-project、doubt-driven-development
- depends: Task 14
- covers: INV-1, INV-5, INV-6, INV-7, INV-8, INV-10

**验收标准**:

- [ ] 假 gh 慢响应脚本：延迟 >probeTimeoutMs 断言超时分级分支出结果、UI 面不挂死（INV-5、R-1 同法钉死失败形）
- [ ] 假 gh 失败形（401/403/429/非零退出/写入失败）断言结构化归因与 stderr 敏感串不透传（INV-10）
- [ ] 假 ctx 无 slots 注入：apply() 不炸、槽位缺席 fail-open、repo-context 失败降级不炸栏目（INV-6）
- [ ] 全链零明文断言：假 token 一次性假值，argv/日志/返回值/UI 投影全部扫描零明文（P-5、P-10、R-6）
- [ ] test/gh-auth.test.mjs 与 test/settings-routes.test.mjs 补齐上述退化形断言（如需新测试文件先按 C-2 补 TECH.md）；test/load.test.mjs 真 import 冒烟保持（INV-8）
- [ ] 既有 16 测试全绿零回归（INV-7、C-3）
- [ ] 验证命令：`node --test`（全量零失败）；`node --test test/load.test.mjs`（exit 0）；P-3 不跳测试标记完成，证据=测试输出落 tester-report.md

## Task 16: 发版面欠账清理（W-3 / N-1 / N-2）+ 版本文档同步

- status: ✅（89fd160，Spec PASS + Approved；四对齐+tag 待补（发版五步⑤ 已于 2026-09-29 执行补 tag）；Q-1/Q-2 nit 转终审）
- phase: Phase 6
- role: coder
- skills: clsh-project、dsh-plugin-ops
- depends: Task 15
- covers: US-9

**验收标准**:

- [ ] package.json 补 `repository`（fengcwf/dsh-plugins）（W-3）；`files` 补 CHANGELOG.md（N-1）
- [ ] dsh.plugin.json 处置（N-2）：保留则用途写进 README.zh.md 说明，或按审计建议移除（LRN-035 严格 JSON：不得用注释表达用途）；处置结论同步 TECH.md 文件变更范围（C-2）
- [ ] 插件 CHANGELOG.md 记 0.3.0 条目（设置栏目：US-1..US-9 事实 + 测试证据）；根 README.md 版本表同步 0.3.0（C-5 四处不脱节）
- [ ] 验证命令：`node -e "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));console.log(p.repository&&p.repository.url, p.files.includes('CHANGELOG.md'))"` 期望 repository 非空 + true；`grep -n '0.3.0' CHANGELOG.md ../../README.md` 两处命中；`bash scripts/check-release.sh dsh-github-ops` 期望 PASS
- [ ] 发版五步的 tag/push/gh release create 逐次用户确认后才执行（R-5、AGENTS.md 发版纪律；本卡只备料不发布）

## Task 17: .testenv boot 冒烟四关 + 交付核对（constitution 验收逐项）

- status: ✅（session 7c4a6359，BASE 89fd160，携带 L2 护栏/多 chunk 真机/raw 输出件；修复环 R1 后 review clean，commits f26e7d4..d5e6713）
- phase: Phase 6
- role: tester
- skills: clsh-project、validate-changes-match-specs
- depends: Task 16
- covers: US-8, US-9, INV-8, INV-9

**验收标准**:

- [ ] 测试装包走 git 快照真安装路径 `git+file:///opt/workdata/dsh-plugins#<ref>&path:dsh-github-ops`（LRN-039），不在源码位直接冒充安装
- [ ] boot 冒烟四关全绿（INV-8）：换票 HTTP 200/303 → `--dump-config` 含插件层 → `node --test` → load 真 import 冒烟
- [ ] boot 后 `/plugins/dsh-github-ops/client.js` 可取（HTTP 200）+ 设置菜单「GitHub 集成」栏目在场（INV-9、R-4、LRN-036 功能在场双断言；US-8 兼容座不双挂载现场确认）
- [ ] .testenv 红线：profile 禁名 web、禁跑 start-dsh.sh、端口避 3080/3500、测完回收测试进程
- [ ] 交付核对表落 changes/20260929-phase0/reports/delivery-checklist.md：constitution 代码/文档/交付验收逐项 + PRODUCT 可验证性逐项 + P-1..P-10 逐条证据指向（C-1..C-5）
- [ ] 发版与重启属 worktree 外副作用：tag/push/release 与生产启用逐次 NEEDS_HUMAN 用户确认（R-5、红线 4）
- [ ] 验证命令：`bash .testenv/smoke.sh` 期望四关全绿；`bash scripts/check-release.sh dsh-github-ops` 期望 PASS；`node --test` 期望零失败

## 覆盖矩阵自检（US/INV → Task）

- US-1 → Task 10（状态投影）、Task 14（状态卡渲染）
- US-2 → Task 11（POST /token）、Task 14（token 维护卡）
- US-3 → Task 10（探针三段）、Task 11（POST /check）、Task 14（访问检验卡）、Task 15（超时/失败形）
- US-4 → Task 10（账号库/切换）、Task 11（accounts 三端点）、Task 14（多账号库卡）
- US-5 → Task 11（GET /repo-context）、Task 14（仓库上下文卡）
- US-6 → Task 10（分类 hint/错误码）、Task 14（限额可视化）
- US-7 → Task 11（GET /health）、Task 14（插件自检卡）
- US-8 → Task 13（多座自探测）、Task 17（栏目在场断言）
- US-9 → Task 11（integration 形测试）、Task 16（W-3/N-1/N-2）、Task 17（交付核对）
- US-10 / US-11 → TECH.md 范围外显式排除（backlog），本轮不安排实现卡
- INV-1 → Task 10、Task 11、Task 14、Task 15
- INV-2 → Task 10
- INV-3 → Task 11
- INV-4 → Task 11、Task 14
- INV-5 → Task 10、Task 12、Task 15
- INV-6 → Task 11、Task 13、Task 15
- INV-7 → Task 10、Task 12、Task 15
- INV-8 → Task 15、Task 17
- INV-9 → Task 12、Task 13、Task 17
- INV-10 → Task 10、Task 11、Task 14、Task 15

## Task 18: Phase 8 R1 诊断（gap analysis，只读）——归档总结缺口确认

- status: ✅（G1-G6 缺口清单+补正红线产出）
- phase: Phase 8
- role: scout
- skills: clsh-project
- depends: Task 17
- covers: 用户反馈 R1（确认/流程）
- 派发标识: session c558e343-e6cd-427a-94da-35da6e8589e7

**验收标准**:

- [ ] 只读核对 changes/archive/ 三件 + retrospective，列出缺口清单（缺什么事实、应落在哪节）
- [ ] 不改任何文件

## Task 19: Phase 8 R1 修复——归档总结补正

- status: ✅（G1-G6 归档补正落盘，证据=.superpowers/sdd/tasks-dsh-github-ops/p8r1-fix-report.md；一致性复核=Task 20）
- phase: Phase 8
- role: coder
- skills: clsh-project
- depends: Task 18
- covers: 用户反馈 R1（确认/流程）
- 派发标识: session 88986d02-1976-4170-bb0d-bbf42f5158b2（诊断 G1-G6+裁决 N1 双句口径/N2 模板表注记/G6 批准）

**验收标准**:

- [ ] completion-summary/retrospective/handoff 补「PATH A 派发路径（未用 AgentTeams）+ 偏离理由与成本」「Phase 8 状态」事实
- [ ] 与既有内容一致，不改写其他结论

## Task 20: Phase 8 R1 审查——归档一致性复核

- status: ✅（verdict pass 零 findings；红线 grep 零改写实证）
- phase: Phase 8
- role: reviewer
- skills: validate-changes-match-specs
- depends: Task 19
- covers: 用户反馈 R1（确认/流程）
- 派发标识: session e1a8d83b-7ac0-4378-86d4-924a26adb51e

**验收标准**:

- [ ] 复核补正内容与事实一致（派发记录/ledger 可溯）
- [ ] verdict: pass 或 findings

## 任务总览 / Task Summary

| Task | 标题 | 阶段 | 状态 | 负责角色 |
|------|------|------|------|----------|
| 1 | 机械扫描 | Phase 0 | ✅ | captain |
| 2 | ERRORS/LEARNINGS 通读 | Phase 0 | ✅ | captain |
| 3 | 本地历史文档扫描 | Phase 0 | ✅ | captain |
| 4 | 设置栏目集成契约深调研 | Phase 0 | ✅ | scout |
| 5 | 调研摘要 | Phase 0 | ✅ | captain |
| 6 | 三仓同类项目复用调研 | Phase 1 | ✅ | scout |
| 7 | TECH.md 方案设计 | Phase 2 | ✅ | captain |
| 8 | 视觉 Spike 候选图 | Phase 2.5 | ✅ | artist |
| 9 | DESIGN.md token 化 | Phase 2.5 | ✅ | captain |
| 10 | gh-auth.js 纯逻辑收编 + 单测 | Phase 6 | ✅ | coder |
| 11 | settings-routes.js 数据面 8 端点 | Phase 6 | ✅ | coder |
| 12 | 挂载与声明（index/patch/package） | Phase 6 | ✅ | coder |
| 13 | client.js 壳 + 多座自探测 | Phase 6 | ✅ | coder |
| 14 | UI 渲染（双栏六节卡片） | Phase 6 | ✅ | coder |
| 15 | 测试波收口（退化形/零明文） | Phase 6 | ✅ | tester |
| 16 | 发版面欠账 + 版本文档 | Phase 6 | ✅ | coder |
| 17 | .testenv boot 四关 + 交付核对 | Phase 6 | ✅ | tester |
| 18 | P8-R1 诊断（归档缺口） | Phase 8 | ✅ | scout |
| 19 | P8-R1 修复（归档补正） | Phase 8 | ✅ | coder |
| 20 | P8-R1 审查（一致性复核） | Phase 8 | ✅ | reviewer |

## Task 21: Phase 8 R2 — web_fetch 门禁 deny 文案去硬编码（文案修复，语义零回归）

- status: ✅
- phase: Phase 8 R2
- role: coder
- skills: dsh-plugin-ops / clsh-project
- depends: 无（Phase 7 已归档；R2 = 用户实测反馈开轮）
- covers: 消除误导性硬编码文案（旧：匿名限额 60/h 且本机代理出口已耗尽 → 实测已失真致其他会话误判与 2FA 有关）
- 派发标识: subagent（通用行 + coder 契约内联；具名 implementer 行 maxDepth:0 拒派）
- 报告: changes/20261010-webfetch-gate-copy/task-01-report.md

**验收标准**:

- [x] 新文案只陈述结构性约束（web_fetch 无法携带 token），不复述任何实时观测
- [x] `${host}` 插值 / API_HOSTS / deny-ask-off 三态 / 尾缀拦截面 / index.js 接线逐字节未动
- [x] node --test 112 → 115/115（含 load 真 import 冒烟）
- [x] 四处版本对齐 0.3.1 + check-release.sh VERDICT PASS
- [x] 越界写零（仅 7 个 inScope 文件 + 报告；~/.dsh/ 零写入）

## Task 21-V: Phase 8 R2 — Task 21 独立验证（tester）

- status: ✅
- phase: Phase 8 R2
- role: tester
- skills: -
- depends: Task 21
- covers: IL-2（NO SELF-JUDGMENT ON QUALITY）
- 派发标识: subagent（通用行 + tester 契约内联；具名 tester 行 maxDepth:0 拒派）
- 报告: changes/20261010-webfetch-gate-copy/tester-report.md

**验收标准**:

- [x] V1 测试真绿 115/115（load 冒烟 ok 84 在列，单跑也绿）
- [x] V2 mutation 探针：/tmp 副本注入「60」坏形态 → 3 个新测试精确红，还原回全绿（排除假保险）
- [x] V3 六主机程序化自证（deny + 无过期观测 + 三指路 + host 插值 + token 零明文）
- [x] V4 语义零回归（diff 仅 reason 4 行；index.js diff 空）
- [x] V5 越界写零 + ~/.dsh/plugins 3h 内 0 写入
- [x] V6 四处 0.3.1 对齐；V7 check-release VERDICT PASS

## Task 21-R1: Phase 8 R2 — Task 21 双轴审查（代码/安全 + 文档/流程）

- status: ✅
- phase: Phase 8 R2
- role: reviewer
- skills: code-review-and-quality
- depends: Task 21
- covers: 五轴审查（原单卡 5 轴 14 项派发连续两次 run failed → 按铁律 7 拆两张窄卡）
- 派发标识: 代码/安全轴 = subagent（通用行 + reviewer 契约内联）；文档/流程轴 = 队长亲自跑（D1-D4 全只读 bash/grep）
- 报告: changes/20261010-webfetch-gate-copy/review-code.md + review-docs.md

**验收标准**:

- [x] 代码轴 verdict pass（0 blocker / 0 high），双导入实测 action 分歧 0/19、命令改写 0/31、边界高危用例无回归
- [x] 文档轴 D1 四处对齐且说法与实测一致 / D2 README.zh 零残留 / D3 本卡无越界写 / D4 未提前 commit/tag/release
- [x] 产出 finding F-1（medium）：哨兵 `STALE_OBSERVATION = /60|耗尽/` 是字面枚举，不防"新数字复辟"
- [→] 文档轴 verdict needs_revision：唯一 requiredFix = 补齐发版第五步（F-DOC-1 根 README 已宣称 0.3.1 而插件未发版）+ F-DOC-2 报用户确认

## Task 22: Phase 8 R2 — 修 F-1：哨兵升级为三族结构规则

- status: ✅
- phase: Phase 8 R2
- role: coder
- skills: dsh-plugin-ops
- depends: Task 21-R1（finding F-1）
- covers: 消除"只防旧数字、不防新数字复辟"的假保险
- 派发标识: subagent（通用行 + coder 契约内联）
- 报告: changes/20261010-webfetch-gate-copy/task-02-report.md

**验收标准**:

- [x] `lib/enforce.js` 逐字读过确认零数字零状态断言 → 未改它（改它属 Scope Creep）
- [x] 哨兵升级三族结构规则：A 定量断言（数字+量纲）/ B 配额语境裸数字 / C 实时状态断言（观测标记或状态词与基础设施/配额主体同现）
- [x] node --test 115 → 120/120；version 仍 0.3.1 未 bump；check-release VERDICT PASS
- [x] 队长独立 mutation 复现三坏形态：5000/h → 5 fail / 60/h → 5 fail / 本机代理出口已耗尽 → 4 fail，还原回 120/120

## 阶段里程碑 / Phase Milestones

| 阶段 | 里程碑 | 状态 | 确认人 |
|------|--------|------|--------|
| Init | 项目骨架 + gate-init | ✅ | 用户（确认码 683DA717） |
| Phase 0+1 | 需求准备与澄清 | 🔄 | — |
| Phase 2 | 方案设计与技术验证 | ⬜ | — |
| Phase 2.5 | 视觉 Spike（本变更含 UI） | ⬜ | — |
| Phase 3 | 设计文档 | ⬜ | — |
| Phase 4 | 机械检查与流程合规 | ⬜ | — |
| Phase 5 | 实现计划 | 🔄 | — |
| Phase 6 | 分发执行 | 🔄 | — |
| Phase 7 | 完成归档与流程复盘 | ⬜ | — |
| Phase 8 | 反馈循环 | ⬜ | — |
