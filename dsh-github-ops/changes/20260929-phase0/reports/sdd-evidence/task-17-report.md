# Task 17 报告 — .testenv boot 冒烟四关 + 交付核对（tester · 2026-09-29）

**Status: DONE**（交付核对表落盘 + 四关全绿 + 真机双断言全过；2 条文档面 finding 留终审：F-1 根 CHANGELOG 缺 0.3.0 条目、F-2 PRODUCT.md US 状态列落点）
**Commits: `f26e7d4`**（`docs:` T17 交付核对表；仅 dsh-github-ops/changes/20260929-phase0/reports/delivery-checklist.md 一个文件；不 push 不 tag）

---

## 1. 验证口径与装包

- **LRN-039 真安装**：`dsh plugin --profile plugintest add 'git+file:///opt/workdata/dsh-plugins#89fd160ede193abc572aa882340a6c49a15fccf1&path:dsh-github-ops'`——ref=验证时工作树运行时代码态（`git status` 对 dsh-github-ops 追踪路径零修改实测；**非**旧脚本钉死的 stale ref eea1d212）。落地：实体目录（非 symlink）、version 0.2.1→**0.3.0**、zod 代装 1。
- commit 后代码等价自检：`git diff 89fd160..f26e7d4 -- lib test package.json cordis.patch.yml` = **空**（本 commit 纯文档）。

## 2. boot 冒烟四关（逐关，raw PART 1）

| 关 | 结果 | 实测 |
|----|------|------|
| 1 换票 | ✅ | HTTP **303** + 带 cookie 跟随终态 **200** |
| 2 dump-config 含插件层 | ✅ | `# == dsh-github-ops` 层 + `id: github-ops` |
| 3 node --test | ✅ | **109/109**（含 integration 形） |
| 4 load 真 import | ✅ | **1/1** |

附：`bash scripts/check-release.sh dsh-github-ops` = **PASS**（tag [TODO] 保持，发版待用户确认）。

## 3. Carried items

1. **L2 护栏修复（Task 13 deferred）**：已改为 `{ [ "$PORT" = 3080 ] || [ "$PORT" = 3500 ]; } && guard` 括号形——`.testenv/t13-chunk-probe.sh:19`、同款 `.testenv/t8b2-probe-obsidian.sh:27`、本卡新脚本；三处实测 3080/3500 拦、3180 放。⚠️ **修正 carry 的缺陷定性**：原症状「PORT=3080 拦不住」**实测不成立**——bash `&&`/`||` 等优先级左结合，原形 `(A||B)&&guard` 对 3080/3500 均拦截（carry 按 C 语言优先级推断）。括号形=行为等价的意图显式化加固，仍值得留。
2. **多 chunk 嵌套 require.async 真机验证（Task 14 ⚠️④）**：6 文件（entry + client.ui.{js,styles,model,cards,project}.js）经 combo 路由带 rev 形（`plugins/??dsh-github-ops/client.js&rev=f382b32b1e32`）+ chunk 路由 `?rev=` 全 200；**嵌套链五边逐级真机执行**（entry→ui→styles/model/cards、model→project，HTTP 实取字节→真 factory→require.async 递归解析→真渲染驱动 effects→loadParts/model.boot）；无 rev 负例 404（钉 rev 成立）。
3. **设置栏目双断言（INV-9/US-8/LRN-036）**：功能在场=注册面（settings.section/github-ops/「GitHub 集成」）+ 渲染面（gho-root + H1「GitHub 集成」+ 六卡全渲染+真机数据面回读：自检卡三段真值）+ **真机 GUI**（chromium CDP 实驱设置菜单，「GitHub 集成」菜单项真出现 + 栏目面板渲染，截图）；症状缺席=四座逆序触发每步活动注册≤1 + **GUI 全页 navMenuEntries=1**（第二命中=栏目 H1）= 不双挂载现场确认。
4. **raw 测试输出件**：`.superpowers/sdd/tasks-dsh-github-ops/task-17-raw-output.txt`（667 行，7 块完整原始输出）+ `task-17-shot-gui-settings.png`（sha256 a3a2630c…9425）。
5. **发版/重启零执行**：tag/push/`gh release create`/生产启用全部标「待用户确认」。

## 4. 交付核对表

`dsh-github-ops/changes/20260929-phase0/reports/delivery-checklist.md`（随 commit）：constitution 代码验收 4/4 ✅、文档验收 3✅+1❌（F-1）+1⚠️（F-2）、交付验收 2/2 ✅；PRODUCT 可验证性 4/4 ✅（INV-1..10 逐条证据表）；P-1..P-10 逐条证据指向（C-1..C-5 落点）；US-1..9 状态矩阵全 ✅。

## 5. 红线遵守

fake HOME（`.testenv/home`）+ profile **plugintest**@**3180** 全程；零 `start-dsh.sh`、零 `/root/.dsh` 写入、生产 3080/3500 未触碰；测完回收（boot + chromium 均杀，3180/9322 释放，trap/teardown 留痕 raw PART 4）。

## 6. 探针自坑留痕（均探针侧、非产品缺陷，已修）

- chainprobe v1 三缺陷（链边取早 / 拆座计数取晚 / 未驱动深层链）→ v2 全修（raw 2b 全程留痕）。
- cookie jar 拼头滤掉 `#HttpOnly_` 行致数据面 401——顺带实证 INV-3/INV-10（GHO-AUTH-01 结构化拒）；修正后数据面回读正常。
- `pkill -f '[t]17-chrome'` 因 echo 泄漏明文模式自匹配、SIGTERM 杀掉自家 shell（回收一度中断）→ 改按 PID/端口回收完成。教训候选：pkill 模式的明文形绝不能出现在同一条 cmdline 任何位置。

## 7. Findings（留终审/修复环）

| ID | 级别 | 内容 | 建议 |
|----|------|------|------|
| F-1 | MED | 根 `CHANGELOG.md` 缺 dsh-github-ops **0.3.0** 条目（constitution 文档验收 2.3 ❌；根文件在本卡 commit 范围外） | 发版前补（docs: 卡 / Task 16 carry），补齐即转 ✅ |
| F-2 | LOW | PRODUCT.md US 表无「状态」列（2.1 ⚠️ 两可；状态事实已由核对表 §6 承载） | 终审裁定标注落点 |
| N-1 | NOTE | T13 carry「\|\|/&& 缺陷」定性修正（见 §3.1） | 括号形保留即可 |
| N-3 | NOTE | ego 浏览器冷启动三连败（DevTools 端口 20s 不暴露）→ 手驱 chromium CDP 完成 GUI 取证 | 环境形，GUI 证据以截图+DOM 断言 JSON 为准 |

## 8. 证据路径

- 交付核对表：`dsh-github-ops/changes/20260929-phase0/reports/delivery-checklist.md`
- raw 原始输出：`.superpowers/sdd/tasks-dsh-github-ops/task-17-raw-output.txt`
- GUI 截图：`.superpowers/sdd/tasks-dsh-github-ops/task-17-shot-gui-settings.png`
- 探针脚本（.testenv，不入 git）：`t17-chunkprobe.sh` / `t17-chainprobe.mjs` / `t17-guiprobe.mjs` / `t17-teardown.sh` / `t17-evidence.sh`；`smoke.sh` 最小参数化（SMOKE_PLUGIN/SMOKE_KEEP，缺省行为不变）

---

## 9. 修复环 Round 1 fix report（S1-S6 + Q1-Q3 全清）

判定：Spec FAIL（窄，证据件缺口）+ Needs work——产品/红线面复核全部成立，本环只收证据与措辞。逐条处置：

| 项 | 判定 | 处置 | 补证落点 |
|----|------|------|----------|
| S3 裁定 | 口径替代追认成立 | 核对表 0.3 结果列改「✅（口径替代已追认：combo 路由形 200，裸路径 404=宿主机制本义）」+ 证据列补 INV-9 实质达成链（combo 200 + GUI 真加载） | checklist 0.3 行 |
| S1 MED 错误码无证据 | 属实（raw grep GHO-STATUS-07/GHO-AUTH-01=0） | **补真机现场**：`t17-evidence.sh` boot 测试实例（trap 回收）4 取证——E1/E2 无会话 status 与未知路径 **401 同形 `GHO-AUTH-01`**（顺带实证 M-2/INV-3 鉴权先行）；E3 带会话 status **`GHO-STATUS-07`**（hosts.yml 不存在）；E4 health **`GHO-HEALTH-07`** + 三段 sections（config/gh/credentials 真值） | raw PART 7；checklist 1.3/4.1.3/INV-10/N-2 引用改指 PART 7 E1-E4 |
| S2 MED guard 自我宣告 | 属实（raw 无正负例） | **补实跑**：三处 guard 行从真实脚本文件字节抽取执行 ×3 端口（9 用例）——3080/3500 → `rc=2 [guard] BLOCKED`、3180 → `rc=0 PASS-THROUGH` 全符；初跑 3180 用例 rc=127 系管道流脚误（非 guard 语义），PART 6b 临时文件法重跑修正留痕 | raw PART 6b（PART 6=初跑留痕）；checklist N-1 注实跑 |
| S4 LOW-MED ref 等价链 | 属实（断言未捕获） | 补 `git rev-parse` 三 sha 对照（89fd160 装包 ref / 8f9847e 验证时 HEAD / f26e7d4 当前）+ `git diff` 对运行时四路径**双双为空集**实录 | raw PART 6；checklist 头部 ref 行改指实证 |
| S5 LOW [NOTE] 漏转录 | 属实（raw:665 有、核对表无） | 3.2 转录 `[NOTE] 工作树有未提交变更 —— push 前提交` 原文 + §7 增「**发版前必办**：结清工作树未提交变更（.testenv/.superpowers 已 ignore，git 面应结清至零）」与 F-1 并列 | checklist 3.2 / §7 |
| S6 LOW 证据落错块 | 属实（3 拆 v1 FAIL、2b/FINAL PASS） | 0.4 引用改落 PART 2-FINAL [E]，注明 v1 FAIL 系探针计数取晚（raw:267/285 留痕；PASS 落 raw:410/584） | checklist 0.4 行 |
| Q1 ADR 计数 | 属实（实为 ADR-001..008=8） | 「5 条 ADR」→「8 条 ADR（ADR-001..008）」 | checklist 2.2 |
| Q2 token 形态措辞过宽 | 属实（raw:24 有测试实例票据 URL） | 改「零 **GitHub** token 形态；唯一 token 形态串=测试实例一次性登录票据 URL（raw PART 1 [1] 行，随回收作废）」 | checklist P-10 |
| Q3 「Token 在位」歧义 | 属实 | 改「Token 在位判定行（值=未配置）」 | checklist US-1 |

R1 后验证面变动：**零产品改动**（仅核对表措辞/证据指向 + raw 补证三块 + 本 fix report）；commit `docs:` 前缀仅 delivery-checklist.md 一个 git 文件；不 push 不 tag；`t17-evidence.sh` 全程 trap 回收（3180 已释放实测）。遗留不变：F-1（MED 根 CHANGELOG 缺 0.3.0，发版前补）+ F-2（LOW PRODUCT.md US 状态列落点，终审裁定）。
