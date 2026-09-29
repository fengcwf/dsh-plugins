# 交付核对表 — dsh-github-ops 0.3.0「设置栏目优化」（Task 17 · tester · 2026-09-29）

> **验证口径**：LRN-039——git 快照真安装 → boot 冒烟四关 → 真机功能探针（源码位直跑不作数）。
> **验证装包 ref**：`89fd160ede193abc572aa882340a6c49a15fccf1`（= 验证时工作树运行时代码态；本核对表 commit 仅新增文档，运行时代码与 ref 逐字节一致——`git diff 89fd160..<本 commit> -- dsh-github-ops/lib dsh-github-ops/test dsh-github-ops/package.json dsh-github-ops/cordis.patch.yml` 为空集）。
> **完整原始输出**：`.superpowers/sdd/tasks-dsh-github-ops/task-17-raw-output.txt`（7 块：四关 / 嵌套链×3（含两轮探针缺陷修正留痕 2b、2-FINAL）/ GUI 双断言 / 回收 / check-release）。
> **GUI 现场截图**：`.superpowers/sdd/tasks-dsh-github-ops/task-17-shot-gui-settings.png`（sha256 `a3a2630c…9425`）。

---

## 0. 本卡验收面（Task 17 brief 验收标准）

| # | 验收项 | 结果 | 证据（raw 输出定位） |
|---|--------|------|----------------------|
| 0.1 | 测试装包走 git 快照真安装 `git+file:///opt/workdata/dsh-plugins#<ref>&path:dsh-github-ops`（LRN-039），不冒充安装 | ✅ | PART 1 [B]：`dsh plugin add git+file://…#89fd160…` → 实体目录落地 version=0.3.0、zod 代装 1、0.2.1→0.3.0 替换 |
| 0.2 | boot 冒烟四关全绿（INV-8） | ✅ | 见 §0.1 四关表（PART 1 [1][2][3][4]） |
| 0.3 | `/plugins/dsh-github-ops/client.js` 可取（HTTP 200）+ 设置菜单「GitHub 集成」栏目在场（INV-9/R-4/LRN-036 功能在场双断言） | ✅（口径注记见下） | PART 2 [C]：入口经 **combo 路由带 rev 形**（`plugins/??dsh-github-ops/client.js&rev=…`，即宿主交付入口）HTTP **200**/10474B；裸路径 `/plugins/dsh-github-ops/client.js` 直取 **404** = 宿主路由设计（入口走 combo 广告、chunk 钉 rev，与 Task 13 探针口径一致，[C] 参照行已记录）；栏目在场 = PART 3 GUI 双断言 + 截图 |
| 0.4 | US-8 兼容座不双挂载现场确认 | ✅ | PART 2 [E] 四座逆序触发每步活动注册≤1、终态单挂 settings.section、旧座 3 拆；PART 3 全页「GitHub 集成」叶子元素=2（菜单项 1 + 栏目 H1 1），navMenuEntries=1 |
| 0.5 | .testenv 红线（禁 web 名 / 禁 start-dsh.sh / 避 3080/3500 / 测完回收） | ✅ | 全脚本 guard 拦截面 + profile=plugintest@3180 + PART 4 回收（3180/9322 释放、生产 3080/3500 未触碰） |
| 0.6 | 交付核对表落盘 | ✅ | 本文件 |
| 0.7 | 发版与重启不执行（NEEDS_HUMAN 逐次确认） | ✅ | §7 标注「待用户确认」；check-release tag 项 [TODO] 保持未建 |

### 0.1 四关逐关（`SMOKE_PLUGIN=dsh-github-ops SMOKE_KEEP=1 bash .testenv/smoke.sh 89fd160…`）

| 关 | 判据 | 结果 | 实测 |
|----|------|------|------|
| 1 | 换票 HTTP 200/303 | ✅ | token URL 换票 **303** + 带 cookie 跟随终态 **200**（`/?token=…` @3180） |
| 2 | `--dump-config` 含插件层 | ✅ | `# == dsh-github-ops` 层 + `- id: github-ops` 行在场（config 全键合成可见） |
| 3 | `node --test` | ✅ | **109/109 pass，0 fail**（含 integration 形：假 ctx 真 apply() + 真 handler） |
| 4 | load 真 import 冒烟 | ✅ | `test/load.test.mjs` **1/1 pass**（真 `import('../lib/index.js')` + 导出契约） |

附加：`bash scripts/check-release.sh dsh-github-ops` = **PASS**（version/CHANGELOG/README/dist 锁四项 PASS；tag `dsh-github-ops-v0.3.0` = [TODO] **待用户确认后创建**）。

### 0.2 多 chunk 嵌套 require.async 真机验证（Task 14 ⚠️④ 收口）

| 项 | 结果 | 证据 |
|----|------|------|
| combo 路由带 rev 形 | ✅ | `plugins/??dsh-github-ops/client.js&rev=f382b32b1e32`（__DSH_BOOT__ 实取） |
| 入口 + 5 兄弟 chunk 全部 HTTP 200（chunk 路由 `?rev=` 钉 rev） | ✅ | client.js / client.ui.js / client.ui.styles.js / client.ui.model.js / client.ui.cards.js / client.ui.project.js 六文件 200 + 注册形 + chunk 名 |
| 嵌套链逐级真机执行（HTTP 实取字节 → 真 factory → require.async 递归解析） | ✅ | 五边齐：entry→ui、ui→styles/model/cards、model→project（project 边在 boot 取数期被触发 4 次） |
| 无 rev 负例 | ✅ | 直取 client.ui.js → **404**（chunk 路由钉 rev，UI 侧必须走 require.async） |
| 真渲染驱动（首渲→effects→loadParts/model.boot→重渲） | ✅ | 六卡全渲染 + 真机数据面回读（插件自检卡：`配置合成复检通过` / `gh version 2.90.0 在位` / `hosts.yml 不存在（本地无凭据）`） |
| 渲染文本零 token 形态（INV-1） | ✅ | `tokenShapedInRender=false` |

### 0.3 设置栏目在场双断言（症状缺席 + 功能在场）

| 断言 | 面 | 结果 |
|------|----|------|
| 功能在场①：注册面 | 真机 served bytes → 模块注册捕获 | 主座 `settings.section` / `id=github-ops` / `label=「GitHub 集成」` ✅ |
| 功能在场②：渲染面 | 真渲染树 | `div.gho-root[data-dsh-plugin=dsh-github-ops]` + H1「GitHub 集成」+ 六卡（认证状态/访问检验/Token 维护/多账号库/仓库上下文/插件自检）✅ |
| 功能在场③：真机 GUI | chromium CDP 实驱设置菜单 | 「GitHub 集成」菜单项真出现（active）+ 栏目面板渲染认证状态卡（截图）✅ |
| 症状缺席①：模块层 | 四座逆序触发单挂收敛 | 每步活动注册 ≤1、旧座全拆、终态单挂主座 ✅ |
| 症状缺席②：GUI 层 | 全页叶子元素分类 | `navMenuEntries=1`（第二命中=栏目 H1 标题，非第二菜单入口）= 不双挂载 ✅ |

---

## 1. constitution.md — 代码验收逐项

| # | 验收项 | 结果 | 证据 |
|---|--------|------|------|
| 1.1 | `node --test` 零失败，且含 load 冒烟 + integration 形（假 ctx 真 apply() + 真 handler） | ✅ | 109/109（raw PART 1 [3]）；load.test.mjs 真 import（[4]）；integration 形 = 「层⑤ 设置面挂载：双层子插件 + 真 handler 鉴权」「鉴权矩阵：8 端点首行 requestRejection」等 |
| 1.2 | INV-1..INV-10 逐条测试/审查证据 | ✅ | §4.2 逐条表（Task 10-16 acceptanceResults + 本表 §0 真机证据） |
| 1.3 | 无硬编码凭据；错误输出结构化（INV-10） | ✅ | 「零明文总扫描」「M-1 用户可见 message：回落 CONTRACT 中文文案」「sendJson 整树 redact 咬合」；真机 GHO-STATUS-07/GHO-AUTH-01 结构化形（raw PART 2） |
| 1.4 | 组件/模块 ≤300 行；`ctx.effect()` 收敛释放 | ✅ | `wc -l`：lib/ 最大 settings-routes.js **300 行**（client.ui.model 276 / client 247 / cards 242）；测试文件不属组件面（client-shell.test 727 为测试）。「层⑤…撤路由（C-1 收敛释放）」「fail-open…拆除器收敛」测试在场 |

## 2. constitution.md — 文档验收逐项

| # | 验收项 | 结果 | 证据 |
|---|--------|------|------|
| 2.1 | PRODUCT.md US-1..US-9 状态标注 | ⚠️ 两可 | PRODUCT.md US 表无「状态」列（仅优先级，US-10/11 标 backlog）；**状态事实**由本表 §6 覆盖矩阵核对（US-1..US-9 全实现+验证绿）+ task-10..16 报告 acceptanceResults 承载。若执字面需回填 PRODUCT.md 状态列 → 标 **NEEDS_PARENT**（终审裁定标注落点） |
| 2.2 | TECH.md 文件范围与实际一致 | ✅ | TECH.md §文件变更范围 + Task 16 commit（89fd160）body「TECH.md 文件变更范围同步处置结论（C-2）」；TECH.md 5 条 ADR 均带状态行（已采纳 2026-09-29） |
| 2.3 | CHANGELOG（插件 + 根）含 0.3.0 条目；README 版本表同步 | ❌ 1/3 缺 | 插件 `dsh-github-ops/CHANGELOG.md` ✅ 含 `## 0.3.0`（check-release PASS）；根 README 版本表 ✅（0.3.0，check-release PASS）；**根 `CHANGELOG.md` ❌ 缺 dsh-github-ops 0.3.0 条目**（最新条目止于 0.2.1 兼容面）→ **F-1**（发版前须补；根文件在本卡 commit 范围外——「只 commit dsh-github-ops/ 内文件」） |
| 2.4 | DESIGN.md token 与实现引用一致（--dsw-*） | ✅ | 测试「T14 布局与 token（DESIGN.md C-5）：双栏/1200px/16px + 零 hex + 色值全 var(--dsw-*)」「T14 DESIGN token 表逐字在场（C-5）」+ client.ui.cards.js:4 零样式字面注释 |

## 3. constitution.md — 交付验收逐项

| # | 验收项 | 结果 | 证据 |
|---|--------|------|------|
| 3.1 | .testenv boot 冒烟四关全绿 | ✅ | §0.1（换票 303→200 → dump-config 含插件层 → 109/109 → load 1/1） |
| 3.2 | 发版五步逐项过 `check-release.sh`；发版逐次经用户确认 | ✅（发版动作待确认） | check-release **PASS**（tag [TODO] 保持）；tag/push/`gh release create` 与生产启用 = **待用户确认**（§7），本卡零执行 |

## 4. PRODUCT.md — 可验证性逐项

### 4.1 四项

| # | 项 | 结果 | 证据 |
|---|----|------|------|
| 4.1.1 | 功能完整性：US-1..US-9 均可在设置栏目/测试中演示 | ✅ | §6 覆盖矩阵逐 US；真机 GUI 六卡在场（截图 + raw PART 3） |
| 4.1.2 | 不变量满足：INV-1..INV-10 每条有测试或审查证据 | ✅ | §4.2 |
| 4.1.3 | 边界条件：坏 token/断网/gh 未装/hosts.yml 不可写/槽位缺席/超时均有分级反馈 | ✅ | 测试矩阵：「失败形 401/403/429/非零退出→GHO-AUTH-CONNECT-03/04/05/99」「超时形→GHO-…-01」「probeAccess：gh 缺失→GHO-LOCAL-CONFIG-02」「writeToken 失败形→GHO-TOKEN-03/06」「缺缝 fail-open」「非 JSON 5xx=硬失败分级卡」；真机 hosts.yml 缺失→分级卡（render「hosts.yml 不存在（本地无凭据）」+ GHO-STATUS-07） |
| 4.1.4 | 用户体验：健康检查 ≤3s（probeTimeoutMs）出结果；保存即验证 | ✅ | 「probeTimeoutMs 缺省 3000（INV-5）」「Config probeTimeoutMs 钳制 min 1000/max 600000」「超时分级结果→UI 不挂死（busy→终态 error + 重新检查入口）」「T14 零明文：…保存后立即验证」 |

### 4.2 INV-1..INV-10 证据逐条

| INV | 不变量 | 证据（测试名 / 真机证据） |
|-----|--------|---------------------------|
| INV-1 | token 全程零明文 | 「零明文总扫描（P-10、INV-1）」「UI 投影零明文」「日志/返回值零明文（P-5/P-10/R-6）」「路由输出零明文对抗」+ t17 渲染零 token 形态 + GUI 截图 Token=未配置 |
| INV-2 | 只经 stdin 写 hosts.yml，单一认证源 | 「writeToken 成功形：argv 不落 token、stdin 传 token」「makeRunGh：stdin 传 token、argv/env 恒定」「parseHostsMeta…绝不读取 token 值」；gh-auth.js:9-10 单一认证源注释 |
| INV-3 | 每 handler 首行 requestRejection | 「鉴权矩阵：8 端点首行 requestRejection，未授权 401/403 且零副作用」「M-2 差分枚举回归（鉴权先行于 404 查表）」 |
| INV-4 | 留空=不修改；无删除/登出 | 「POST /token 留空=不修改（INV-4）」「writeToken 空 token：拒绝执行且零调用」「T14 P-8 + 禁令清单：无删除/登出入口」 |
| INV-5 | 独立超时 probeTimeoutMs=3000ms 可配 | 「probeAccess：probeTimeoutMs 贯通 + 超时分级（不挂死）」「超时形@探针阶段①③ / @写 token」「Config probeTimeoutMs 钳制」 |
| INV-6 | fail-open：槽位缺席/gh 缺失不炸插件 | 「假 ctx 无 slots 注入」「fail-open ×5」「repo-context 失败降级不炸栏目」「缺缝 fail-open」+ 真机降级卡 |
| INV-7 | 四层零回归 | 「层①命令强制层 / 层② web_fetch 门禁 / 层③工具集 / 层④ awareness」+ 既有 16 测试基线零回归（7e42997，Task 16 记录）+ 109/109 |
| INV-8 | load + integration + boot 四关 | §0.1 四关 + integration 形测试（1.1） |
| INV-9 | 模块 id=包名；name/patch id 不动；client.js 可取 + 栏目出现 | 「模块注册形（INV-9/R-4）」「导出契约与声明面（INV-9/R-4）」+ §0.3 三面证据 |
| INV-10 | 结构化归因，stderr 敏感串不透传 UI | 「POST /check 失败归因 GHO-<STAGE>-<NN>」「探针 403 归因标题口径」「M-1 用户可见 message」「sendJson 整树 redact 咬合」+ 真机 GHO-STATUS-07 形 |

## 5. 禁止操作 P-1..P-10 逐条证据指向（宪法 C-1..C-5 落点）

| 禁令 | 保护条款 | 本波遵守证据 |
|------|----------|--------------|
| P-1 不删改 constitution 约束 | C-1/C-4 | `changes/20260929-phase0/constitution.md` 原文在场（66 行，2026-09-29 落盘后零修改）；本卡只读引用 |
| P-2 未更新 TECH.md 即改文件结构 | C-2 | 各实现卡均先更 TECH.md 再改码（Task 16 commit body 记 C-2 同步）；本卡零代码结构改动（.testenv 护栏脚本修复属测试环境，不入交付面） |
| P-3 跳过测试标完成 | C-1（IL-2） | Task 10-16 全部带测试证据过审（task-10..16-report.md acceptanceResults）；本卡全部结论带命令输出（raw 五段），零自我裁量 |
| P-4 引入未声明外部依赖（含第三方 UI 库） | C-5 | `package.json` dependencies 仅 `{ "zod": "^4.3.6" }`；UI 自绘 + `--dsw-*` token（测试「零 hex + 色值全 var(--dsw-*)」） |
| P-5 token 明文进 argv/日志/recall/返回值/UI | C-1/INV-1 | gh-auth.js:9、28（stdin 统一执行器）；测试「全链零明文」「UI 投影零明文」「日志/返回值零明文」；本卡渲染面零 token 形态 |
| P-6 新增凭据存储 | C-5/INV-2 | hosts.yml 单一认证源（gh-auth.js:9-10）；测试「writeToken…只经 stdin 进 gh」；无任何凭据写盘面 |
| P-7 root 槽注册 / sidebar、rightbar 占位 | C-3 宿主红线 | client.js:9 红线注释 + SEATS 表（client.js:52-85，四座均非 root/sidebar/rightbar）；测试「P-7 红线：root 槽禁注册；sidebar/rightbar 零占位」+「M1/S1 扫描面回归」 |
| P-8 删除 token/登出 API 或 UI | C-3/INV-4 | settings-routes.js 8 端点无删除/登出面（GET status/accounts/repo-context/health + POST token/check/accounts-verify/accounts-switch）；client.ui.cards.js:7 P-8 注释 + 测试「无删除/登出入口」 |
| P-9 服务存活期写生产 profiles/web/cordis.patch.yml | C-3（LRN-033） | 本波全程 fake HOME（HOME=.testenv/home、DSH_HOME=…/home/.dsh、profile=plugintest@3180）；生产 3080/3500 未触碰、`/root/.dsh` 零写入（PART 4 回收记录） |
| P-10 真实 token 进测试/测试日志 | C-1/INV-1 | 测试用一次性假值（「全链零明文：一次性假 token 经 stdin 写入」）；.testenv 无 hosts.yml（真机「hosts.yml 不存在（本地无凭据）」）；raw 输出与截图零 token 形态（token URL 为测试实例一次性票据，随回收作废） |

## 6. US 覆盖矩阵核对（US-1..US-9 状态事实，供 2.1 裁定）

| US | 内容 | 状态 | 验证证据 |
|----|------|------|----------|
| US-1 | 认证状态投影 | ✅ 实现+验证 | 真机认证状态卡（主机/登录名/Token 在位，零明文）+「GET /status：本地认证状态投影」 |
| US-2 | token 录入/更新（留空=不修改，保存即清空+验证） | ✅ | 真机 Token 维护卡 +「T14 零明文：密码框 + 保存即清空 + 留空=不修改 + 保存后立即验证」 |
| US-3 | 一键三段检验 + 结构化归因 | ✅ | 真机访问检验卡 +「POST /check：三段探针 + quota 投影」+ 失败归因矩阵 |
| US-4 | 多账号库（active 标记/录入/逐账号验证/切换） | ✅ | 真机多账号库卡（含空态「尚无其他账号」）+「GET /accounts + /accounts/verify」「POST /accounts/switch」 |
| US-5 | 仓库上下文卡 | ✅ | 真机仓库上下文卡 +「GET /repo-context：TTL≤30s 缓存 + fail-open」 |
| US-6 | 错误分类 hint + 限额可视化 | ✅ | 真机 API 限额/限额重置行 +「T14 限额可视化 + 三段检验行（US-3/US-6）」+「403 归因标题口径」 |
| US-7 | 插件自检 health | ✅ | 真机插件自检卡三段真值（配置合成复检通过/gh 2.90.0 在位/hosts.yml 不存在）+「GET /health：三段自检」 |
| US-8 | 多座自探测防双挂载 | ✅ | §0.3 症状缺席双面 + 测试「多座自探测 + 防双挂载（US-8）」×2 |
| US-9 | 发版面欠账 + integration 形补齐 | ✅ | Task 16（W-3 repository/N-1 files/N-2 dsh.plugin.json/M12-2）+ integration 形测试群；check-release PASS |
| US-10/US-11 | locale / 安全加固包其余项 | ⏸ backlog | TECH.md 范围外显式排除（本轮不实现，PRODUCT.md 已标 P2 backlog） |

## 7. 发版与重启（⚠️ 均属 worktree 外副作用——待用户逐次确认，本卡零执行）

| 动作 | 状态 |
|------|------|
| `git tag dsh-github-ops-v0.3.0` + push + `gh release create` | **待用户确认**（check-release tag 项 [TODO] 保持；红线 4 / R-5） |
| 生产 `~/.dsh/plugins` 拉取 + 钉版本安装启用 + `/root/.dsh/start-dsh.sh` 重启 | **待用户确认**（重启杀宿主进程=会话闪断，只放用户空档） |

## 8. 遗留与 finding（供终审/修复环）

| ID | 级别 | 内容 | 建议 |
|----|------|------|------|
| F-1 | MED | 根 `CHANGELOG.md` 缺 dsh-github-ops **0.3.0** 条目（2.3 ❌；根文件在本卡 commit 范围外） | 发版前补一条（docs: 卡 / Task 16 carry）；补齐后 2.3 转 ✅ |
| F-2 | LOW | PRODUCT.md US 表无「状态」列（2.1 ⚠️ 两可） | 终审裁定标注落点（回填 PRODUCT.md 或以本表 §6 为准） |
| N-1 | NOTE | Task 13 carry「\|\|/&& 优先级缺陷」实测**症状不成立**：bash `&&`/`\|\|` 等优先级左结合，原形 `[ =3080 ] \|\| [ =3500 ] && guard` 对 PORT=3080/3500 均实测拦截（GUARD-RAN）；carry 的「3080 拦不住」按 C 语言优先级推断，与 bash 不符 | 仍按卡片要求改为 `{ …; } && guard` 括号形（行为等价、意图显式化）：`.testenv/t13-chunk-probe.sh:19` + 同款 `.testenv/t8b2-probe-obsidian.sh:27` + 本卡新脚本；三处实测 3080/3500 拦、3180 放 |
| N-2 | NOTE | 探针自坑两则（均探针侧、已修，非产品缺陷）：①chainprobe v1 链边取早/拆座计数取晚/未驱动深层链→v2 全修；②cookie jar 拼头滤掉 `#HttpOnly_` 行致 401（GHO-AUTH-01 结构化拒=顺带验证 INV-3/INV-10）→修正后数据面回读正常 | raw PART 2/2b/2-FINAL 全程留痕 |
| N-3 | NOTE | 浏览器相降级：ego 冷启动三连败（Chrome DevTools 端口 20s 不暴露）→按「撞墙两次换策略」手驱 chromium CDP（`.testenv/t17-guiprobe.mjs`）完成 GUI 现场确认 | GUI 证据以截图 + DOM 断言 JSON 为准 |
