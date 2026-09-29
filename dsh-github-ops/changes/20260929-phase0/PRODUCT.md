# PRODUCT.md — 产品规格书（dsh-github-ops 设置栏目优化）

> 变更：`changes/20260929-phase0/`（2026-09-29）。需求来源：用户三点需求 + Phase 1 九轮澄清（conversation.md）+ 两轮调研（reports/）。

## 概述 / Overview

在 dsh web GUI 设置菜单为 dsh-github-ops 插件新增「GitHub 集成」栏目（settings.section 槽，kb-context 零构建形），提供 GitHub token 维护、GitHub 访问手动检验，以及五项功能扩张（多账号库、仓库上下文卡、限额可视化/错误分类、多座注册兼容、插件自检 health 端点）。

**目标用户**: 本机 dsh 使用者（运维/开发，单人操作 dsh 设置菜单）
**核心价值**: GitHub 凭据与访问健康在设置菜单一处可见、可维护、可检验，不再手改 hosts.yml / 猜限额
**成功指标**: ①token 状态/更新/验证全流程在栏目内完成（零明文）②一键检验 ≤3s 出结构化结论 ③既有四层行为零回归（16/16 测试绿 + 新增 integration/load 全绿 + .testenv boot 冒烟四关）

---

## 用户故事 / User Stories

| ID | 角色 / Role | 故事 / Story | 价值 / Value | 优先级 / Priority | 状态 / Status |
|----|-------------|--------------|--------------|-------------------|---------------|
| US-1 | 使用者 | 在设置菜单「GitHub 集成」栏目查看 GitHub 认证状态（主机/登录名/token 是否在位，零明文） | 凭据现状一眼可见 | P0 | 已实现+已验证 |
| US-2 | 使用者 | 在栏目内录入/更新 token（密码框、保存即清空、「留空=不修改」），保存后立即验证 | 不再手改 hosts.yml | P0 | 已实现+已验证 |
| US-3 | 使用者 | 一键手动检验 GitHub 访问：本地配置面→认证/连通→延迟/限额三段判定，结构化结果 + 分类 hint + 限额 remaining/reset + 重新检查 | 超时/断网/失效可归因 | P0 | 已实现+已验证 |
| US-4 | 使用者 | 多账号库：查看 hosts.yml 全部账号（active 标记）、录入新账号（stdin）、逐账号验证、切换 active（gh auth switch 形） | 多账号日常切换 | P0 | 已实现+已验证 |
| US-5 | 使用者 | 仓库上下文卡：显示当前工作区 git remote/分支/GitHub 仓库基本信息 | 当前仓库上下文可见 | P1 | 已实现+已验证 |
| US-6 | 使用者 | 错误分类文案（401/403/429/超时等 hint）与限额可视化贯穿栏目各卡 | 失败可自助修复 | P1 | 已实现+已验证 |
| US-7 | 使用者 | 插件自检 health 端点（配置合成/gh 可用/凭据在位三段自检） | 运维自查入口 | P1 | 已实现+已验证 |
| US-8 | 使用者 | 设置栏目跨 GUI 版本兼容（settings.section 主座 + plugins.bundle.config 等兼容座自探测，防双挂载） | 升级不丢栏目 | P1 | 已实现+已验证（多座自探测 + 真机 navMenuEntries=1） |
| US-9 | 维护者 | 发版面欠账清理：W-3 repository 字段、N-1 files 补 CHANGELOG.md、N-2 dsh.plugin.json 处置 + integration 形测试补齐 | 可维护性 | P1 | 已实现+已验证 |
| US-10 | 使用者 | 栏目文案 locale 化（参照 dshmarket ctx.locale.register） | 国际化 | P2（backlog，本轮不做） | backlog |
| US-11 | 使用者 | 安全加固包其余项：REST Host 信任围栏、独立凭据擦除层 | 加固 | P2（backlog，用户裁定后置） | backlog |

---

## 产品不变量 / Product Invariants

| ID | 不变量 / Invariant | 验证方式 / Verification |
|----|--------------------|-------------------------|
| INV-1 | token 全程零明文：UI 永不显示明文（只显示主机/登录名/是否在位）；argv/日志/recall 零明文；请求体 ≤1MiB 有界 | 集成测试断言输出无 token 形态串；代码审查 grep；UI 手测 |
| INV-2 | token 只经 `gh auth login --with-token` 的 stdin 写入 hosts.yml（0600），单一认证源，不新增任何凭据存储 | 集成测试（假 gh 脚本记录 stdin/argv）；代码审查 |
| INV-3 | 新增 REST 路由每个 handler 首行 `connection.requestRejection` 鉴权，未授权返回 401/403 | 集成测试逐路由断言 |
| INV-4 | 「留空=不修改」：空 token 提交绝不破坏既有凭据；不做删除/登出（API 无删除端点、UI 无删除/登出按钮） | 集成测试 + API 面断言 |
| INV-5 | 健康检查独立超时 probeTimeoutMs=3000ms（Config 可改，1000-600000）；超时出分级错误卡，UI 不挂死 | 假 gh 慢响应脚本测试（延迟 >3s 断言超时分支） |
| INV-6 | 槽位方缺席=该面缺席，绝不炸插件（fail-open）；gh 未装/hosts.yml 缺失走分级错误卡 | 假 ctx 集成测试（无 slots 注入）+ 退化路径测试 |
| INV-7 | 既有四层行为零回归：命令强制层 / web_fetch 门禁 / 仓库工具集 / awareness 语义不变 | 既有 16 测试全绿 + 新增回归断言 |
| INV-8 | 测试全绿 ≠ 可加载：`test/load.test.mjs` 真 import + integration 形（假 ctx 真 apply() + 真 handler）+ .testenv boot 冒烟四关全绿 | 测试链路（LRN-039：走 git 快照真安装路径） |
| INV-9 | 模块 id=包名 `dsh-github-ops`；`lib/index.js` name='github-ops' 与 patch 行 id 不动 | boot 后 `/plugins/dsh-github-ops/client.js` 可取 + 设置栏目出现 |
| INV-10 | 凭据相关错误反馈只走结构化归因（401/403/429/超时/gh 缺失/写入失败），stderr 敏感串不透传 UI | 集成测试断言错误输出投影 |

---

## 可验证性 / Verifiability

- [ ] **功能完整性**: US-1..US-9 均可在设置栏目/测试中演示
- [ ] **不变量满足**: INV-1..INV-10 每条有对应测试或审查证据
- [ ] **边界条件**: 坏 token/断网/gh 未装/hosts.yml 不可写/槽位缺席/超时均有分级反馈
- [ ] **用户体验**: 健康检查 ≤3s（probeTimeoutMs）出结果；保存即验证

---

## 修订记录 / Revision History

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| v1.0 | 2026-09-29 | 初版：Phase 1 九轮澄清定稿（R1-R9 见 conversation.md）；需求③经三竞品调研（reports/three-competitors-research.md）转向功能扩张五项，安全加固包后置（除 health 端点提前进 v1）；locale 进 backlog |
