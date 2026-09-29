# SDD ledger — plan: /opt/workdata/dsh-plugins/dsh-github-ops/tasks.md

> Phase 6 执行账本（subagent-driven-development）。工作区：.superpowers/sdd/tasks-dsh-github-ops/。项目账本=dsh-github-ops/ledger.md（Rulings 同步记那边）。

## Setup 决定

- Ruling: 在主工作区 /opt/workdata/dsh-plugins 直接开发（不开 git worktree）— 依据：AGENTS.md 双 checkout 分工以本工作区为唯一开发入口、devDep link: 与 .testenv 与本路径耦合、发版五步从主分支 tag，obsidian-web/wiki-steward 两波先例同款；每卡提交面只含 dsh-github-ops/（+必要 changes/ 文档）— 代价如错：主分支出现半成品提交，可 revert/软重置，release 前有整分支复审+用户逐次确认闸。
- Ruling: 模型钉定不可用 — subagent 工具面无 model 参数（实测），全部委派=会话默认模型；SDD「显式指定模型」在本运行时无法执行，质量控制靠每任务审查+整分支复审补偿。

## 前置冲突扫描（Pre-flight）

| 卡对/卡 | 产出 vs 消费 | 发现 |
|---------|--------------|------|
| T10→T11 | gh-auth.js 导出（makeRunGh/parseHostsMeta/probeAccess/listAccounts/switchActive/redact）→ settings-routes.js 消费 | 干净：T11 未点名函数但语义与 T10 导出一致，T11 实现时读 T10 实际导出面 |
| T10→T12 | makeRunGh → repo-tools.js 引用微调 | 干净：T12 明确「语义不变、INV-7 零回归」 |
| T12→T13 | package.json exports ./client 声明 → T13 才建 lib/client.js | 可接受：T12 验证只读 manifest 不 import ./client；boot 面在 T17（T13/T14 之后）；空窗期不装不冒烟 |
| T13→T14 | client.js 壳 ↔ client.ui.js UI | **发现 F-scan-1**：边界未在卡文本钉死 → Ruling（下行） |
| T14/T13 | client-shell.test.mjs 归属 | 可接受：T13 建、T14 补渲染断言，同文件先后扩展 |
| T15→T10/T11 | 复用并扩展 gh-auth/settings-routes 测试 | 干净：卡内已声明归属延续 |
| T16 自洽 | 验证命令 `../../README.md` 路径 | **发现 F-scan-2**：路径笔误 → Ruling（下行） |
| T17 自洽 | git+file 快照装 + 四关 + 栏目在场双断言 | 干净 |

## 扫描 Rulings

- Ruling: F-scan-1 T13/T14 边界 = lib/client.js 只做模块注册 + 槽位多座自探测 + fetch 帮手 + 挂载生命周期；UI 渲染全部由 lib/client.ui.js 提供（导出 render* 函数），client.js 经兄弟 chunk `client.ui.js` 形引用、.testenv 实测 chunk 可取性，404 则合并单文件（对应卡内既定处置分支）— 为什么：防 T13 硬编码 UI 致 T14 重写；代价如错：合并单文件返工一轮（T14 责任面）。
- Ruling: F-scan-2 T16 验证命令的根 README 路径更正为 `../README.md`（dsh-github-ops/ 的上级=仓库根）— 为什么：`../../README.md` 指向 /opt/workdata/README.md 不存在，验收会假失败；代价如错：零（纯路径纠正，随 T16 派发携带，卡文本不回改保持 coder 产出原样）。

## Task 进度

<!-- 格式：Task <N>: complete (commits <base7>..<head7>, review clean) -->

- Ruling: 并行会话共用本 repo（实测 BASE..HEAD 区间混入 dsh-rtk-kit/login-gate/obsidian-web 提交 987b252/6a9fb26/6b6bf69）— 审查包一律**按本任务 commit 挑**（git show 逐 commit），不用 BASE..HEAD 区间；review-package 脚本的区间形在并行期不可用 — 为什么：否则审到别人的工作面；代价如错：漏审本任务某 commit（用 commit 清单对照 tasks.md 派发记录兜底）。
- Task 10: dispatched (BASE 4ce719b7 → commits 3599cea, 8c8d0fb) — implementer 15b28b42 报 DONE_WITH_CONCERNS（34/34 绿，R-1 实测落 reports/gh-auth-token-write-shape.md：坏 token=exit1+401 不写 hosts.yml；空 stdin 掉设备码流程→空 token 拒执行；gh auth status --json 恒 exit 0 判据看 state）。concerns ①writeToken 补入（ADR-003 本义，判为合理范围）②结果形带 hint/quota（US-3/6 需要）③stage-1 只判配置在位（ADR-004 对齐）④parseHostsMeta 形自定（T11 适配）——均观察级不阻塞。
- Task 10: review in-flight (reviewer 2ee384e9, 审查包 review-task10-3599cea-8c8d0fb.diff 40KB 3 文件 540 行)。
- Task 10: review verdict — Spec FAIL（F-1 Critical：parseHostsMeta/listAccounts 解析不了生产 hosts.yml 真实形——users 是 `- login` 序列、active_account:'true'；测试夹具锁的是自造形，US-4 真实配置列 0 账号）+ Needs work（F-2 Important：makeRunGh 返回值未过 redact；F-9 redact userinfo 含 @ 部分擦除）。其余验收面 PASS（makeRunGh/probeAccess 三段/结构化错误/probeTimeoutMs/switchActive 降级/redact/零 fs 写/R-1 报告/18 用例）；writeToken 判非 Extra（R-1+P-6+hint 面）。
- Task 10: fix round 1/5 (3 addressed pending re-review — F-1 生产形解析+夹具/F-2 返回值两级擦除/F-9 userinfo 正则; commits 8c8d0fb..4ff7fa7; RED 3 红→GREEN 19/19+35/35 连跑 6 次)
- Ruling: F-2 采纳「stdout 只形态扫描 + 消费者展示边界调 redact()」契约 — 代价如错：Task 11/12/13 展示边界漏调则 URL userinfo 透 UI；**钉为 Task 11/12/13 派发携带的验收点**（终审按此 triage）。
- Task 10: scoped re-review in-flight (re-reviewer 2ab3e246, diff review-task10-fix-4ff7fa7.diff 15KB 单 commit 2 文件)。
- Task 10: fix round 1/5 (3 addressed, 0 open — F-1/F-2/F-9 全 ADDRESSED，实跑三形夹具+假 gh+redact 8 边角+回归 35/35; commits 8c8d0fb..4ff7fa7)
- Task 10: minor (deferred): L-1 幻影账号——gh-auth.js:102 退化形（users 空且 user 缺）把被③否决的 active_account:'true' 合成账号 {"login":"true"}（触发需 hosts.yml 同缺 user/users，生产/legacy 均带 user）；建议删分支或值形过滤拒 'true'/'false'
- Task 10: minor (deferred): a) 无斜杠 URL query 含 @ 整体擦（旧正则同形行为非回归）b) 序列项内联 map 形 `- login: x` 当字面 login（生产为标量序列）c) 消费侧 redact 义务未复核实现者「本就全量 redact」说法→并入 Task 11/15 测试面 d) 报告行号漂移又一实例
- Task 10: complete (commits 3599cea..4ff7fa7 含 8c8d0fb, review clean — spec FAIL 修复环 R1 后双裁定过，1 Low deferred)
- 注：test/gh-auth.test.mjs 290 行近 300 上限——后续补测拆文件（Task 15 派发携带）。
- Task 10: minor (deferred): F-3 env 继承未剔除 GH_TOKEN/GITHUB_TOKEN/GH_ENTERPRISE_TOKEN/GH_HOST（本运行时实测全 absent，今日休眠）
- Task 10: minor (deferred): F-4 writeToken('') hint 与「留空=不修改」语义矛盾（gh-auth.js:279,:227）
- Task 10: minor (deferred): F-5 超时 hint 数字错（classifyRun 回退 3000 vs writeToken/switchActive 60000；:222,:268,:278,:333）
- Task 10: minor (deferred): F-6 probeTimeoutMs 无 min1000/max600000 钳制（:289）——⚠️①落点疑在 Task 12 Config zod，T12 派发带查
- Task 10: minor (deferred): F-7 测试缺口（403 分支/writeToken 网络错形 GHO-TOKEN-06/switchActive 空 login/畸形 hosts.yml/JSON 不可解析分支）
- Task 10: minor (deferred): F-8 超时归因用例负载敏感（建议 runGh 注入归因+留一条真 spawn 超时用例）
- Task 10: minor (deferred): F-10 测试临时目录不清理；报告行号引用漂移
- ⚠️ 处置：① INV-5 min/max 落点→Task 12 派发携带核对；② hosts.yml 真实形来源（gh 写/legacy）→Task 12 写侧带查；③ stage-① 判据 vs ADR-004 → Ruling: 实现与 ADR-004 三段意图一致（401 归因落 auth-connect），确认为已决；④ 抖动率→Task 15 收口波；⑤ DSH 宿主进程 env GH_TOKEN 未验→F-3 修复后覆盖。
- Task 11: dispatched (BASE 4ff757b, implementer 4cc25c48) → DONE commit 79dad60（2 文件 +584；settings-routes 14/14 绿 + 全量 49/49 零回归；RED/GREEN 落盘 task-11-red.txt/green.txt）。
- Ruling: Task 11 HTTP 语义采纳「业务结果（含 gh 失败）一律 200+ok:false，4xx/5xx 只表达契约违例」— 为什么：结构化结果形自带 ok/status/code，UI 分级错误卡依 ok:false+code 归因即可，与 kb-context 先例一致；代价如错：UI 若想按 HTTP 状态分流需小改（实现者留了口子）。
- Ruling: /accounts/verify 采纳非破坏形（gh auth status --json hosts 的 per-account state 判据，零 token 读取/零切换）而非 switch+probe — 为什么：验证不应劫持用户当前 active 账号；ADR-005「逐账号探针」以 state 判据满足，深度 probe 留 backlog；代价如错：verified 语义弱于全链 probe（结果形已标注），终审可复核。
- Task 11 carry → Task 12 派发清单：① registerSettingsRoutes(deps)→disposer[]（kb-context 先例形，ctx.plugin 拆缝传入照 kb-context/lib/index.js:212-242）② deps.workspaceDir 注入宿主工作区（勿留 process.cwd()）③ probeTimeoutMs 钳制（min1000/max600000）落 Config zod ④ recheckConfig 返回形 {ok,switches?,issues?}。
- Task 11: review in-flight (reviewer 待派，审查包 review-task11-79dad60.diff 44KB)。
- Task 11: review verdict — Spec PASS（8/8 handler 首语句鉴权 :153-:259、1MiB 流式有界 :131-142、strictObject 整单拒、留空零 gh 调用、repo-context TTL≤30s+先 redact 再解析、health 三段、sendJson 整树 scrub 全输出面）+ Quality Approved（零 Critical/Important）。两个判定题审查自裁合规：/accounts/verify 非破坏形（避免 switch→probe→switch 回改用户 active 的 INV-4 邻域风险）、200+ok:false（brief 只强制鉴权 401/403，INV-6 fail-open 精神支持）——UI 消费口径留整分支复审。
- Task 11: minor (deferred): M-1 KError super(msg??kind)+internal 回落使畸形 JSON/超限用户可见 message 变 "badjson"/"toolarge"（CONTRACT 中文文案死常量；:46,:128）；修=抛点补文案或 e.message===kind 回落 + 2 条 message 断言 → **携带进 Task 12 派发**
- Task 11: minor (deferred): M-2 dispatcher 404 先于鉴权缝（:295）未鉴权者可 404/401 差分枚举路径（8 handler 本身 INV-3 无破口）；修=dispatcher 先 authGate 再查表 → **携带进 Task 12 派发**
- Task 11: minor (deferred): M-3 stderr 首行 redact 后进 message，模式外自由形态敏感串仍可能透出（建议 gh 失败用静态归因文案、stderr 明细只进 warn）；M-4 SWITCH_SCHEMA login 放行 ""（:149，Task 10 已内建守卫双保险成立，建议 .min(1)）；Nits: GHO-REPO-CONTEXT-07 四段码与声明形略拧、verified 不分 host、repo-context 用例 200ms 定时微 flake 面
- Task 11: complete (commit 79dad60, review clean — 4 minor deferred，2 条携带 Task 12)
- Task 12: 中途重大发现（implementer 00efbc82 真 cordis Context 双向实测）：**0.2.1 层①命令强制层从未生效**——lib/index.js:60-62 把拆除器当执行器传 ctx.effect，effect 体 setup 期即跑=包壳当场还原（B2 类缺陷，与 dsh-rtk-kit/lib/index.js:126-128 注释 2026-09-29 e2e 实锤同款）；纯逻辑 enforce.test 抓不到接线死活。
- Ruling: 层①修复=恢复设计语义，不属 INV-7 回归（ADR-002/awareness 均按强制层存活设计）——审查误判由本裁决驳回；CHANGELOG 0.3.0 显式记修复条目；index-mount integration 双断言锁「apply 后包壳存活 + teardown 还原」。
- Ruling: 中间态纪律——Task 12 完成到 Task 13 完成前禁止任何 .testenv 安装/boot（package.json dsh.client 已声明而 client.js 未落地=合成报错 boot 不可用）；卡内不越界建 client.js 正确。
- workspaceDir 方案批准：ctx.workspaceRegistry.list()[0].path 惰性 getter，registry 缺位回落 process.cwd() 并留痕。
- Task 12: DONE 候审 commit be8f5aa（7 文件；61/61 绿=49 基线+12 新增；V1-V5 过；层①工厂形修复+双向实测证据落报告；M-1/M-2 已修带断言；workspaceDir=workspaceRegistry 惰性 getter）。
- Ruling-3: 外层 inject 改 ['shell','tools'] + 内层 ctx.plugin(inject:['webServer','connection'])（kb-context 形）——外层硬化 4 项会使非 web 部署整插件延迟激活=四层全死（含层①），与 0.2.1 激活语义相悖=INV-7 回归；卡文本 V2 期望串判计划缺陷按 spec 修订 `github-ops shell,tools`；补非 web 假 ctx 用例（数据面缺席但四层存活）为裁决核心证据。→ 审查前收口（SDD concerns 正确性先处理）。
- Task 12: deferred: settings-routes.js 恰 300 行（Task 15/终审 triage 拆文件）。
- Task 12 NEEDS_CONTEXT → Task 13/14 派发清单：①多工作区「用户工作区」表头无权威定义（建议 UI 暴露 workspace 标题/多仓投影）②dsh.client.inject 三件套（locale,ui-renderer,ui-layout）与 Task 13/14 实际 require 面对齐收口。
- 别名补记：上文「Ruling: 中间态纪律」即 Ruling-2（Task 12→13 之间禁装禁 boot），implementer 报告以此名引用。
- Task 12: ⚠️ 三项 controller 核销：① TECH.md C-2 同步属实（:85 记 Ruling-3 形+effect 工厂形）② dsh.client.inject 三件套与 kb-context 逐字节一致（实测比对 True）③ Ruling-2 在账。
- Task 12: minor (deferred): M12-1 层⑤外层 catch 静默吞错（补 warn redact 后留痕）；M12-2 工具数 10→11 陈旧文案 2 处（package.json:4 description、cordis.patch.yml:18 注释）→ 携带 Task 16（版本文档同步本职）；M12-3 scripts.check 未含新 lib 文件 node --check、防御分支无测试、deps.runGh 每调用重建（有意）。
- Task 12: complete (commits be8f5aa..c74c0e7, review clean — Spec PASS + Quality Approved，3 minor deferred/携带)
- Ruling-4: Task 13 交付面含最小 client.ui.js 桩（导出 render* 接口面、占位渲染）——理由：client.js 引用兄弟 chunk client.ui.js 而 Task 14 才填 UI，无桩则 T13-T14 之间重现中间态不可 boot（Ruling-2 禁令面）；T13 卡内 .testenv chunk 可取性实测以「client.js+桩都在场」为前提，跑不了就顺延 Task 17 并记 TECH.md（C-2）。代价如错：桩返工一轮（T14 本就要写该文件）。
- Task 13: DONE 候审（commits eea1d21 + f1b1fe2；client-shell 10/10 + 全量 72/72；.testenv chunk 实测过：combo 200 / chunk client.ui.js?rev= 200（1814B 注册形）/ 无 rev 404——chunk 形成立无需回退单文件，已记 TECH.md；Ruling-2 红线内操作且进程回收）。
- Task 13 carry → Task 16/17 派发清单：package.json scripts.check 补 lib/client.js + lib/client.ui.js 的 node --check（implementer 未扩权，归发版/交付卡）。
- Task 13: review in-flight (reviewer b7460642)。
- Task 13: review verdict — Spec PASS（INV-9 注册形/主座契约/四座自探测单挂收敛=US-8 判定满足/INV-6 四形 fail-open/fetch 文档相对/P-7 行为锁/Ruling-4 桩+chunk 白名单/Ruling-2 未越界/F-scan-1 壳零渲染）+ Quality Approved（无 blocker/high）。
- Ruling: L4 疑点核销——TECH.md 自 Phase 2 落盘（gate-phase2 PASS 对象），f1b1fe2 new file=untracked 首次入库，非 Phase 3 产物晚产；整分支复审按 git log 对账即可。
- Task 13: minor (deferred): M1 P-7 源码扫描正则失配（`slots.(inject|register)('root|sidebar|rightbar'` 匹配不到真实注册形=假保险，行为白名单真锁兜底）→ **携带 Task 14**（client-shell.test.mjs 是 T14 声明面）；L1 同座二次触发 noop 静默缺席 + loadUi 成功回调无 try/catch → **携带 Task 14**；L2 .testenv 护栏 `||`/`&&` 优先级假保险 → **携带 Task 17**；L3 apiFetch 不滤 `..` 段；L4 已核销；Nit CLIENT_CHUNK 行号 :169。
- Task 13: complete (commits eea1d21..f1b1fe2, review clean)
- Task 14: DONE 候审 commit 1f830c6（7 文件；client-shell 10→23 例、全量 85/85 基线零回归；UI 拆 4 兄弟 chunk 全 ≤300 行过 CLIENT_CHUNK 白名单；M1/L1 带回归测试修复；grep 零 hex）。
- Ruling: ⚠️① DESIGN.md token 表名=简写层、运行时主题只定义 --dsw-alias-* → 实现采用双链 var(--dsw-表名, var(--dsw-alias-真名))（表名逐字在场+真名兜底）**采纳**；DESIGN.md 表名校订 deferred 到 Phase 7（文档修正，非代码面）。代价如错：主题改名时兜底链失效——有 grep 零 hex + 渲染断言兜底。
- Ruling: ⚠️② ghp_**** 掩码不实现=**符合 INV-1 原文**（「只显主机/登录名/是否在位」，R5 用户口径；mockup 的 ghp_**** 仅示意非规格）。
- Ruling: ⚠️③ /repo-context 无 workspace 投影字段 → deferred backlog（US-5 只要求 remote/分支/仓库基本信息，workspace 路径非规格；数据面补字段后 UI 可加）。
- Task 14 carry → Task 17 派发清单：⚠️④ 5 个 client.*.js chunk 多层嵌套 require.async 真机可取性（boot 冒烟重点）；L2 .testenv 护栏 ||/&& 优先级假保险修复。
- Task 14: review verdict — Spec FAIL + Needs work。S1 HIGH=M1 扫描面回归（allClientSources() 的 CLIENT_CHUNK 过滤把 client.js 排除，而 SEATS name: 形只在 client.js——三处红线源码锁=假保险；一行可修+回归）；S2 MED=model:36 合成体缺 ok:false/http:true → 非 JSON 4xx/5xx 在 loadStatus/loadHealth/loadRepo 被当成功（INV-10 洞）+ body.http===true 死合取；MED-a=报告 §5 两处主张无 diff 支撑（verifyAccount 死动作、token.focus 零消费）。布局/token 双链/零明文/三件套/L1 重挂臂均自跑验证 PASS。
- Task 14: fix round 1/5 dispatched（回原 implementer 7e257623：S1+hex 锁面并入、S2、MED-a×2；LOW×2+NIT×2 deferred）。
- Task 14: minor (deferred): switchAccount busy 无 finally 收敛；Empty 断言 find 全树命中常驻卡头按钮锁不住空态入口（应限 .gho-empty 子树）；gho-spinner-wrap 死备选；styles ensureStyles 工厂注释措辞。
- Task 14: fix round 1/5 (3 addressed, 0 open — S1/S2/MED-a 全 ADDRESSED（反例逐条手算可命中、三路 502 断言旧码必红、verify 四点齐）；零新破坏; commits 1f830c6..afc4cc5)
- Task 14: minor (deferred): D1 禁 '/api/' 正则无正/反例自证（永真绿暴露面）→ **携带 Task 15**（测试面）；D2 Med 既有 INV-10 残洞：request() JSON 形 4xx/5xx 缺 ok:false 仍判成功（假成功家族另一入口）→ **终审立卡建议**；D3 非 JSON 2xx 空投影当成功；D4 报告 §7 头行「10→25」应为「23→25」（Cosmetic）；D5 verifyBtn 可见文案与 aria-label 不同名（WCAG 2.5.3 弱项）。
- Task 14: complete (commits eea1d21..afc4cc5 含 1f830c6, review clean — Spec FAIL 修复环 R1 后双裁定过，5 minor/deferred)
- Task 15: DONE 候审 commit 0c5d6d5（7 文件；109/109=87+22；3 个 degrade 测试文件拆分 C-2 先登记；D1/Empty 子树/F-7 五缺口收口；mutation 探针 5 轮咬合）。产品代码最小修复 1 处：client.ui.project.js labelOf 把 GHO-AUTH-CONNECT-* 误配鉴权缝 GHO-AUTH-* 分支（归因错显破 INV-10），3 断言 BASE 先红后绿——审查重点面。
- Task 15: minor (deferred): O-T15-1 Tab 畸形 hosts.yml 幻影 host 行（YAML 键名当主机名投影；安全不变量已锁，处置候选=跳过 tab 缩进行）→ 终审立卡；O-T15-2 client-shell.test.mjs 727 / settings-routes.test.mjs 312 超 300 既有状态（拆分属重构面）→ 终审 triage。
- Task 15: review in-flight (reviewer c6f37e1e)。
- Task 15: review verdict — Spec PASS（labelOf 修法最小 2 行/鉴权缝口径零偏移/3 断言旧码必红手算坐实；degrade 用例真锁；C-2 登记在；deferred 面零触碰）+ Quality Approved（4 low/nit：labelOf 字面量 vs /^\d\d$/ 形防缝码漂移、hint 硬编码副本漂移、报告措辞「每测独立取值」精度、本波无 raw 测试输出件）。
- Task 15: complete (commit 0c5d6d5, review clean)
- Ruling: N-2 dsh.plugin.json 处置=**保留 + README.zh.md 增加用途说明**（「社区工具发现惯例，官方 dsh 不读取」，LRN-035 严格 JSON 禁注释故用 README 表达）——审计判「保留无害」，删除反而破坏社区工具发现面。代价如错：误导面残留，README 说明即缓解。
- Task 16 携带清单：M12-2 计数同步（package.json:4 description、cordis.patch.yml:18 注释 10→11）；scripts.check 补 client 全家 node --check（T13 carry）；CHANGELOG 0.3.0 必含层①修复条目（Ruling-1）；F-scan-2 路径修正（根 README=../README.md 非 ../../）。
- Task 15 minor (deferred): labelOf 用 /^\d\d$/ 形防未来缝码漂移；hint 文案跨文件硬编码副本；报告措辞精度；raw 测试输出件缺失（终审前补一件即可）。
- Task 16: DONE 候审 commit 89fd160（7 文件=插件 6+根 README；W-3/N-1/N-2/M12-2/scripts.check/CHANGELOG 0.3.0 五条含层①修复条/版本表；check-release.sh PASS（tag 项 TODO 留发版第五步）；既有 16 基线独立核实=enforce7+load1+repo-tools8）。
- Ruling: Task 16 concern (a) README.zh.md 缺设置栏目专节 + 安装示例仍路径安装旧形 → **终审修复波优先项（发布前必修，C-5 文档与代码同步的用户面）**；concern (b) 项目文档入库=上游账本决策（不阻塞）。
- Task 16: review in-flight (reviewer d0fdfd27, 审查包 review-task16-89fd160.diff 23KB)。
- Task 16: review verdict — Spec PASS（CHANGELOG 五条双向对账零虚报零漏报、四对齐+tag 显式 TODO、计数 10→11 独立实测 GITHUB_TOOL_SPECS=11、scripts.check 11/11、N-2 处置、路径修正）+ Quality Approved（2 nit：Q-1 cordis.patch.yml 注释未点名 github_api、Q-2 TECH.md:163 记账措辞略宽）→ **携带终审修复波**。
- Task 16: complete (commit 89fd160, review clean)
- Task 17: DONE 候审 commit f26e7d4（delivery-checklist.md；四关全绿：换票 303→200 / dump-config 含层 / 109/109 / load 1/1；check-release PASS tag TODO；多 chunk 嵌套链真机 6 文件全 200+五边 require.async 真执行+GUI 真渲染截图；US-8 防双挂载双断言现场确认；raw 667 行+截图落盘；红线全守）。
- Ruling（carry 定性纠错）：L2「PORT=3080 拦不住」判定**不成立**——bash &&/|| 同优先级左结合，原形实测也拦；括号形=等价加固留用。该 carry 源自 Task 13 审查按 C 语言优先级推断，我未复核即采信——教训：转达审查发现前对可实测的机械性断言先实测一次。
- Task 17 finding 处置：F-1（MED）根 CHANGELOG.md 缺 dsh-github-ops 0.3.0 条目=constitution 文档验收真缺口（卡面遗漏非执行者之过）→ **列入终审修复波必修项**（与 README.zh.md 设置栏目节同批）；F-2（LOW）PRODUCT.md US 表无状态列 → 终审裁定标注落点（核对表 §6 已有事实）。
- Task 17: review in-flight。
- Task 17: review verdict — Spec FAIL（窄，证据件缺口）+ Needs work。产品/红线面独立复核全成立（四关/嵌套链/双断言/回收/发版待确认全找到对应物，十余处行号零差错）。S1 错误码无证据（GHO-STATUS-07/GHO-AUTH-01 raw 零命中）；S2 guard「实测」零产物=自我宣告；S3 client.js 200 口径替代待追认；S4 ref 等价输出未捕获；S5 check-release NOTE 漏转录；S6 证据指向落错块（v1 FAIL vs 2b PASS）；Q1 ADR 计数 5→8 硬错；Q2「零 token 形态」与 raw:24 一次性票据矛盾；Q3「Token 在位」实测未配置。
- Ruling（S3 追认）：口径替代**成立**——brief 验收 3 字面「裸路径 client.js 200」是计划文本机制假设错误（宿主本义=入口只经 combo+rev 服务，裸路径 404=机制非缺陷）；INV-9 实质（模块 id=包名+真加载+栏目真出现）由 combo 200+GUI 真加载达成。核对表改「✅（口径替代已追认）」。
- Task 17: fix round 1/5 dispatched（回原 implementer 7c4a6359：S1/S2 补输出或降格措辞、S3 追认措辞、S4-S6+Q1-Q3 随修）。
- Task 17: fix round 1/5 (9 addressed, 0 open — S1-S6+Q1-Q3 全 ADDRESSED；S2 实跑痕迹以 rc 分布 2/2/0+初跑 rc=127 自坑痕证实非誊写; commits f26e7d4..d5e6713)
- Task 17: minor (deferred): 核对表「9 块」计数应为 10/11（PART 8 未入枚举）；S6 引用 410/584 为计数 JSON 非字面 PASS 断言行（内容仍支撑）
- Task 17: complete (commits f26e7d4..d5e6713, review clean — Spec FAIL 修复环 R1 后全 ADDRESSED)
- 执行环收官：Task 10-17 全部 complete。净 diff 规模=26 文件 +4551/-29（dsh-github-ops/ scope）+ 根 README 1 行。
- Final whole-branch review in-flight (reviewer 09d3b3c8, review-final-branch.diff 273KB/4532 行; 五轴+deferred triage+必修清单 F-1/README 节)。
- Final whole-branch review verdict: **READY AFTER FIXES**（零 Critical）。五轴全 PASS（安全/正确性 各带 Important 代码小洞 1+2；可读性/架构/性能 PASS）。必修 7 项：I-1 env 凭据源剔除 GH_* 四键（F-3，P-6 隐形第二凭据源+US-2 假反馈）；I-2 D2 假成功残洞（JSON 4xx/5xx 缺 ok:false 合成体，INV-10 家族最后一入口）；I-3 TECH.md 漏登记 4 子 chunk+桩行陈旧（C-2/P-2 假 ✅）；I-4 根 CHANGELOG 0.3.0（F-1）；I-5 README.zh.md 安装钉版本形+设置栏目节；I-6 插件 CHANGELOG「待 Task 17」过时措辞；I-7 PRODUCT US 状态列回填（F-2 裁定）。
- Deferred triage 定案：驳回 19 条（已收口/非缺陷）；backlog ~25 条（hint 面/幻影 host/M-4/M-5/M-6/M-7 spawnSync 阻塞/labelOf 正则/hint 三副本/DESIGN.md 表名等）。
- Final fix wave dispatched (ONE, implementer 4235b0d4, 7 项一次收口)。
- Final fix wave DONE (commit c70bee6, 10 文件 +169/-14; 112/112=109+3; I-1/I-2 TDD 先红后绿; I-3..I-7 文档收口)。
- Ruling（R-FIX-WAVE-1 追认）：test/client-shell.test.mjs resetEpoch=now+3600 跨午夜时点炸弹（23:00 后「（今天）」断言假红，23:20 实测真红）→ 改钉「今天 12:00」，断言口径不变——测试基建缺陷属修复波正当范围；代价如错：零（断言语义不变）。②计数 109→112 三处同步 ③CHANGELOG 记终审修复波行为变化 bullet——均追认（IL-2 一致性要求）。
- Final fix wave scoped re-review in-flight。
