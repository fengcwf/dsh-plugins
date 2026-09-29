# overview.md — 项目概览

> 本文件是项目的一页纸摘要，供快速了解项目全貌。

---

## 项目信息

| 字段 | 内容 |
|------|------|
| 项目名称 | [项目名] |
| 版本 | [当前版本] |
| 状态 | ✅ 已完成（0.3.0 实现完成，发版第五步待用户确认） |
| 负责人 | [灵犀 / coordinator] |
| 开始日期 | [YYYY-MM-DD] |
| 预计完成 | [YYYY-MM-DD] |

---

## 目标 / Goal

<!-- 用 2-3 句话描述项目要解决什么问题、为谁解决 -->

---

## 范围 / Scope

### 范围内

- [ ] [核心功能 1]
- [ ] [核心功能 2]

### 范围外

- [ ] [排除功能] — 原因: [为什么排除]

---

## 背景 / Background

<!-- 项目启动的上下文：技术背景、业务需求、历史教训 -->

---

## 关键决策摘要

| 阶段 | 决策 | 日期 |
|------|------|------|
| Phase 1 | [需求关键决策] | [日期] |
| Phase 2 | [技术方案选择] | [日期] |
| Phase 3 | [设计约束] | [日期] |

---

## 文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| PRODUCT.md | [路径] | 产品规格 |
| TECH.md | [路径] | 技术规格 |
| proposal.md | [路径] | 设计提案 |
| constitution.md | [路径] | 项目宪法 |
| tasks.md | [路径] | 任务清单 |

---

## 进度表

> 注：下表为模板示意（未回填），真实进度见下方「进度表 / Progress」表。

| Phase | 状态 | 完成日期 | 证据 |
|-------|------|----------|------|
| Phase 0 | ⬜ | | |
| Phase 1 | ⬜ | | |
| Phase 2 | ⬜ | | |
| Phase 3 | ⬜ | | |
| Phase 4 | ⬜ | | |
| Phase 5 | ⬜ | | |
| Phase 6 | ⬜ | | |
| Phase 7 | ⬜ | | |

<!-- gate-phase7.py 校验：本文件必须同时含 '状态' 与 '进度表'，每完成一个 Phase 更新一行 -->

## 进度表 / Progress

| 阶段 | 产出 | 状态 | 门禁码 |
|------|------|------|--------|
| Init | 项目骨架 + .cp-init.json | ✅ | 683DA717 |
| Phase 0 | 四件套调研 + settings-integration-research.md | ✅ | 9B38826E |
| Phase 1 | 10 轮需求澄清 + three-competitors-research.md + PRODUCT.md | ✅ | DE849E02 |
| Phase 2 | TECH.md（三方案对比 + 8 ADR + 8 端点矩阵） | ✅ | AC0901A7 |
| Phase 2.5 | 视觉 Spike 三候选 + 用户定稿（双栏概览式）+ DESIGN.md | ✅ | — |
| Phase 3 | proposal.md + constitution.md（P-1..P-10） | ✅ | BA9F2B9E |
| Phase 4 | 机械自检 | ✅ | 809AC5E7 |
| Phase 5 | 实现计划 tasks.md（Task 10-17 + 覆盖矩阵 US/INV） | ✅ | 2EC9D072 |
| Phase 6 | Task 10-17 全部 clean（2 轮修复环 + 整分支终审 READY） | ✅ | — |
| Phase 7 | 归档复盘（本文件 + archive 三件 + review-report + fix-notes） | ✅ | 见 gate-phase7 |
| Phase 8 | 优化循环（backlog 池 + 用户反馈驱动） | 🔄 R1 进行中（用户反馈驱动） | — |

测试基线：node --test 112/112（109 + 终审修复波 3 断言）；.testenv boot 四关全绿（真机 GUI 双断言 + 截图）。
