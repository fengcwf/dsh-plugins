# tasks.md — 任务派发板（dsh-login-gate 设置面与认证优化）

> 格式: `## Task N: [标题]`，字段纯文本（gate-phase5 正则不认加粗冒号）。状态: ⬜ 待开始 | 🔄 进行中 | ✅ 已完成 | ❌ 已阻塞
> 变更：changes/2026-09-29-login-gate-settings/｜派发标识：DSH 会话（subagent 委派，见 dispatch-record.md）

## Task 0: Init 项目基础设施（目录确认+文档骨架+roles 声明）

- status: ✅
- phase: Init
- role: 协调者（建档类单步操作）
- skills: clsh-project
- depends: 无
- covers: US-0（流程义务）

**验收标准**:

- [x] 用户确认项目名称/slug/项目目录（ask_user_question 2026-09-29）
- [x] .cp-init.json + overview.md + source-of-truth/constitution.md + 变更目录三件套落盘
- [x] raw fix-notes 目录建位（raw/projects/dsh-login-gate/fix-notes/）
- [x] gate-init.py 两步确认通过

## Task 0.1: Phase 0 ①机械扫描

- status: ✅
- phase: Phase 0
- role: 协调者（机械脚本）
- skills: clsh-project
- depends: Task 0
- covers: 流程义务（IL-4）

**验收标准**:

- [x] phase0-scan.py 跑完，phase0-data.json 落变更目录

## Task 0.2: Phase 0 ②ERRORS/LEARNINGS 通读

- status: ✅
- phase: Phase 0
- role: 协调者
- skills: obsidian-operations（检索铁律）
- depends: Task 0
- covers: 流程义务（红线1）

**验收标准**:

- [x] wiki/reference/ERRORS.md + LEARNINGS.md 全文通读，关键教训入摘要

## Task 0.3: Phase 0 ③本地历史文档扫描

- status: ✅
- phase: Phase 0
- role: 协调者 + scout
- skills: obsidian-operations
- depends: Task 0
- covers: 流程义务

**验收标准**:

- [x] vault 部署文档/工作区 docs/先例项目扫描命中并引用

## Task 0.4: 需求② 登录超时认证机制分析（scout-a）

- status: ✅
- phase: Phase 0
- role: scout（PATH A 通用 subagent）
- skills: 无（代码侦察）
- depends: Task 0
- covers: US-2

**验收标准**:

- [x] 凭证/过期常量逐条带文件:行号
- [x] 滑动续期 vs 固定过期判定
- [x] 与 dsh 会话错位行为
- [x] 报告落 reports/scout-a-auth-timeout.md（抽查 3 条常量复核一致）

## Task 0.5: 需求①③ 设置栏目机制+优化空间分析（scout-b）

- status: ✅
- phase: Phase 0
- role: scout（PATH A 通用 subagent）
- skills: 无（代码侦察）
- depends: Task 0
- covers: US-1, US-3

**验收标准**:

- [x] 设置页注册契约（package.json dsh.client + settings.section）带行号
- [x] 保存/生效链与热生效边界
- [x] login-gate 缺口清单 + 3500 引用面清单
- [x] 报告落 reports/scout-b-settings-contract.md

## Task 0.6: Phase 0 ④调研摘要

- status: ✅
- phase: Phase 0
- role: 协调者
- skills: clsh-project
- depends: Task 0.1~0.5
- covers: 流程义务（IL-5/IL-6）

**验收标准**:

- [x] phase0-research.md 引用扫描产出与两份侦察报告
- [x] 待确认问题清单 ≥10 题覆盖 ≥3 维度
- [x] gate-phase0.py 两步确认通过

---

## Task 1: Phase 1 需求澄清（一次一问，产物 PRODUCT.md）

- status: ⬜
- phase: Phase 1
- role: 协调者（与用户对话）
- skills: clsh-project
- depends: Task 0.6
- covers: US-1, US-2, US-3

**验收标准**:

- [ ] 13 项待确认问题收敛出范围（P0/P1/P2）
- [ ] 用户故事 US-* 与不变量 INV-* 成文
- [ ] gate-phase1 通过

## Task 2: Phase 2 方案设计（TECH.md + 方案对比 + Global Constraints）

- status: ⬜
- phase: Phase 2
- role: 协调者 + scout（如需补侦察）
- skills: clsh-project
- depends: Task 1
- covers: US-1, US-3

**验收标准**:

- [ ] ≥2 方案对比与推荐
- [ ] Global Constraints 头（不触碰面：生产 cordis.patch.yml、3500 外部契约等）
- [ ] gate-phase2 通过

## Task 3: Phase 2.5 视觉 Spike（设置 UI 视觉决策）

- status: ⬜
- phase: Phase 2.5
- role: artist（PATH A 通用 subagent）
- skills: taste-skill, frontend-ui-engineering
- depends: Task 2
- covers: US-1

**验收标准**:

- [ ] 设置栏目视觉方向 + dsh token 对齐稿
- [ ] V1-V3 门禁

## Task 4: Phase 3 设计文档（proposal.md + constitution.md）

- status: ⬜
- phase: Phase 3
- role: 协调者
- skills: clsh-project
- depends: Task 3
- covers: 全部

**验收标准**:

- [ ] bite-sized 任务切片 + 精确文件路径 + 验证步骤
- [ ] gate-phase3 通过

## Task 5: Phase 4 机械自检

- status: ⬜
- phase: Phase 4
- role: 协调者
- skills: clsh-project
- depends: Task 4
- covers: 流程义务

**验收标准**:

- [ ] gate-phase4 通过

## Task 6: Phase 5 实现计划（tasks 细化 + INV/US 覆盖矩阵）

- status: ⬜
- phase: Phase 5
- role: 协调者
- skills: subagent-driven-development
- depends: Task 5
- covers: 全部

**验收标准**:

- [ ] 实现卡拆到单轮可完成粒度
- [ ] gate-phase5 通过

## Task 7: Phase 6 分发执行（coder/tester/reviewer）

- status: ⬜
- phase: Phase 6
- role: coder/tester/reviewer（PATH A 通用 subagent）
- skills: subagent-driven-development, code-review-and-quality
- depends: Task 6
- covers: 全部

**验收标准**:

- [ ] node --test 全绿（含 load + integration 形）
- [ ] 测试环境 boot 冒烟四关
- [ ] tester-report.md + review-package.md 落盘
- [ ] gate-phase6/7 通过

## Task 8: 发版五步 + 生产同步（用户逐次确认）

- status: ✅（①~④ PASS + tag 已推 ✓；gh release 用户未选跳过；生产同步=换 tag v0.3.0 安装三重验证 ✓，重启用户自执行）
- phase: Phase 6 收尾
- role: 协调者
- skills: dsh-plugin-ops
- depends: Task 7
- covers: 全部

**验收标准**:

- [ ] bump version + CHANGELOG + 根 README 版本表 + check-release PASS
- [ ] tag/push/gh release 逐次用户确认
- [ ] 生产换 tag 重装 + 重启（用户指定空档）

---

## Task 10: users.js 账号模块扩展（scrypt 生成/原子写/CRUD 纯模块）

- status: ✅（commits 7b47c7c..f2b5d25，2 轮修复环，review clean，6 deferred minors）
- phase: Phase 6
- role: coder（PATH A 通用 subagent）
- skills: subagent-driven-development（implementer 契约）
- depends: Task 6
- covers: US-4, INV-3

**验收标准**:

- [ ] generateHash(password) 复用 lib/auth.js scrypt 参数，输出 `scrypt$` 格式
- [ ] usersFile 读-改-写临时文件+rename 原子替换；进程内串行化防并发写坏
- [ ] addUser/updatePassword/deleteUser（deleteUser 防自锁：拒删当前登录账号，由调用方传入）
- [ ] 响应/返回永不包含哈希明文
- [ ] node --test 新增 users 模块用例（原子写/并发串行/防自锁）全绿

## Task 11: 设置面服务端（settings-write + settings-routes + index 接线 + package.json）

- status: ✅（commits e8fcf9f..6a9fb26，1 轮修复环 F1-F9 全收口，39/39 绿，3 deferred minors）
- phase: Phase 6
- role: coder（PATH A 通用 subagent）
- skills: subagent-driven-development
- depends: Task 10
- covers: US-1, US-2, INV-1, INV-2, INV-4

**验收标准**:

- [ ] GET /api/login-gate/settings 回读 config + writable 标记；POST {patch} 白名单（port/sessionDays/maxFailures/secureCookie/wsAllow/gzipPass）+ zod 校验 + configEditor.edit
- [ ] 白名单外键整单拒 not_editable；configEditor 缺位 → writable:false / 503 write_unavailable
- [ ] 端口写入预检可绑定性，占用拒绝并给占用提示
- [ ] 鉴权缝 connection.requestRejection（未登录必拒）；users CRUD 子路由复用 Task 10 模块
- [ ] package.json 增 dsh.client + exports["./client"]；lib/index.js webServer 缝延迟求值（照 kb-context B1/B2 形）
- [ ] port/listenHost/upstreamPort/rewriteHost 写入标记 restartRequired（INV-1）
- [ ] node --test settings-routes/settings-write 用例全绿

## Task 12: 设置栏目 UI（lib/client.js）+ 登录页文案（lib/login-page.js）

- status: ✅（commit 4ff757b，Spec 5/5 + Approved，4 low/nit deferred）
- phase: Phase 6
- role: artist（PATH A 通用 subagent）
- skills: frontend-ui-engineering
- depends: Task 11
- covers: US-1, US-2, US-3, INV-1

**验收标准**:

- [ ] settings.section 栏目「dsh-login-gate」：端口区（可改+重启提示+联动清单四行）/参数区（5 可改+3 只读）/账号区（增删改密表单）/说明段（N 天免登录+机制说明）
- [ ] 样式 dsh token（var(--dsw-alias-*, fallback)）；禁第三方 UI 库；请求文档相对
- [ ] 保存空 draft 拒；成功合并回显；失败显服务端原文；writable:false 只读注记
- [ ] 登录页页脚文案动态 N（sessionDays）
- [ ] 形制豁免记录（单文件>300 行，R-3）入报告

## Task 13: 测试补全（integration 形 + load 冒烟 + 全套回归）

- status: ✅（commit 6285a15，69/69 绿，Spec ✅ + Approved，F1/F2 low deferred）
- phase: Phase 6
- role: coder（PATH A 通用 subagent）
- skills: subagent-driven-development
- depends: Task 12
- covers: INV-5, INV-6

**验收标准**:

- [ ] integration 形：假 ctx 真 apply() + 真 handler 执行（API 面/注册面运行时缝成立）
- [ ] test/load.test.mjs 真 import 冒烟；node --test 全绿（既有+新增）
- [ ] 认证行为回归：固定过期/锁定/防枚举用例不破（INV-5）

## Task 14: 测试环境验证（boot 冒烟四关 + E2E 用户可见行为）

- status: ✅（四关 4/4 + E2E a-f 达成；F-1【high】实测推翻重启假设→用户裁定 R-16=即时生效+事前警示；F-2 修复中；F-3 deferred）
- phase: Phase 6
- role: tester（PATH A 通用 subagent）
- skills: validate-changes-match-specs
- depends: Task 13
- covers: INV-6, INV-7, US-3, US-4

**验收标准**:

- [ ] .testenv boot 冒烟四关全绿（换票 HTTP 200/303 → --dump-config 含插件层 → node --test → load 冒烟）
- [ ] E2E：设置页真实渲染、端口保存回显+重启提示+联动清单、参数保存回读、账号增删改密登录流转（新密码可登旧密码失效）
- [ ] 未登录访问 /api/login-gate/settings 必拒；响应无哈希
- [ ] tester-report.md 落盘（含命令输出证据）

## Task 15: 任务级复审 + 整分支终审

- status: ✅（终审 PASS：0 blocker/high，72/72 独立复跑，COR-2=发版门禁）
- phase: Phase 6
- role: reviewer（PATH A 通用 subagent + 队长终审）
- skills: code-review-and-quality
- depends: Task 14
- covers: 全部 US/INV

**验收标准**:

- [ ] 每任务 spec 合规+质量判定（SDD 任务级审查已随环执行）
- [ ] 整分支终审五轴（正确性/可读性/架构/安全/性能）+ deferred minors 分诊
- [ ] review-package.md 落盘

## Task 16: 文档与分析交付归档（US-5/US-6 + INV-7）

- status: 🔄（implementer 4b22113f，含终审随手清 4 项）
- phase: Phase 6 收尾
- role: coder（PATH A 通用 subagent）
- skills: dsh-plugin-ops
- depends: Task 15
- covers: US-5, US-6, INV-7

**验收标准**:

- [ ] README：设置面说明 + 端口联动清单 + 超时机制说明（US-3/US-5）
- [ ] CHANGELOG 版本条目 + 根 README 版本表
- [ ] P2 候选清单（US-6）在档（phase0-research §五 + reports/）
