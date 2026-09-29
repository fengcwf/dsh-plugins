# proposal.md — 设计提案（dsh-login-gate 设置面与认证优化）

> 变更：changes/2026-09-29-login-gate-settings/｜2026-09-29｜详版技术规格见 TECH.md

## 背景 / Background

dsh-login-gate 已在生产承担唯一登录入口（3500），但无任何设置面：端口/会话超时/账号维护全部手工改配置文件与跑 hash 工具。用户需求：dsh 设置菜单增加栏目（①端口维护默认 3500 ②超时认证分析 ③优化空间分析）。②③已在 Phase 0 交付分析报告。

## 方案对比 / Options Comparison

### 方案 A: 零构建单文件 client.js + configEditor 白名单（推荐）

- 设置栏目照 kb-context 先例（settings.section 槽 + `__ModuleLoader__` 单文件），服务端 `/api/login-gate/settings` 走 configEditor.edit（锁+reconcile 原子写）。
- 权衡：零构建链、与既有设置面同形、配置写入天然并发安全；代价=单文件形制超 300 行（豁免记录）。

### 方案 B: web/ Vue+vite 构建物 + 自写配置文件

- wiki-steward 式构建物面板 + 插件自写 YAML。
- 权衡：组件化好，但引入构建链；自写配置绕开 reconcile，违反 Global Constraint 1（LRN-033），并发写不安全。弃。

### 推荐方案

方案 A。设计决策四条（ADR-001~004 详 TECH.md）：注册形制、保存链、端口可改+重启提示+占用预检+联动清单、账号 CRUD（scrypt 服务端生成+原子写）。

## 推荐方案详述 / Recommended Approach

### 架构概要

浏览器设置面（client.js）→ 文档相对 REST（/api/login-gate/settings）→ 白名单+zod 校验 → configEditor.edit → profile cordis.patch.yml + Loader reconcile；账号 CRUD → users.js 原子写 usersFile（热加载）。

### 关键设计决策

1. 端口/监听面写入后硬标「需重启生效」（reconcile 不重跑 apply 的保守假设，ADR-003）。
2. 白名单外配置键整单拒 not_editable；服务端判据原文回显。
3. 密码仅服务端生成 scrypt$ 哈希，响应/日志永不回显（INV-3）。
4. 删除账号防自锁：禁止删除当前登录账号。

### 数据模型 / API 合约

- GET `/api/login-gate/settings` → `{data:{config, writable, port, listenHost, upstreamPort, rewriteHost, users:[{name}], sessionDays, ...}}`
- POST `/api/login-gate/settings` `{patch:{...}}` → `{data:{config}}`；白名单外/校验失败 → `{error:{code,message}}`
- POST `/api/login-gate/settings/users` `{action:add|update|delete, name, password?}` → 同上；响应不含哈希

## 设计约束 / Design Constraints

Global Constraints 六条（TECH.md 头）：不手写 profile patch、不动生产联动脚本、不动认证行为逻辑、不动 obsidian-web 契约、测试红线、快照无热链路。

## 不在范围内 / Out of Scope

滑动续期/记住我/小时级超时、logout 真吊销、限流时间窗、WS 过期引导、监听面可改、自动联动生产脚本、多角色权限。

## 风险与缓解 / Risks & Mitigation

configEditor 缺位→只读降级；端口漏联动→UI 清单+INV-7 核对；usersFile 并发→原子 rename+串行化；行数约定→形制豁免（R-3）。
