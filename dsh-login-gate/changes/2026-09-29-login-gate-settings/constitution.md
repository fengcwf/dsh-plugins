# constitution.md — 项目宪法（dsh-login-gate 设置面与认证优化）

> 变更：changes/2026-09-29-login-gate-settings/｜2026-09-29

## 项目约束 / Project Constraints

### C-1: 配置写入唯一路径 = configEditor.edit
禁止手写/直改 profile `cordis.patch.yml`（LRN-033 热重载拆工具面）。所有设置保存经白名单+zod 校验+configEditor 原子写。

### C-2: 认证行为逻辑零改动
固定过期、HMAC dlg_sid、scrypt 恒时校验、失败锁定、防枚举路径不改；本变更只加配置面与 UI（INV-5）。

### C-3: 配置写入即时生效 + 端口保存前断连警示
配置写入经宿主 re-apply **即时生效**；插件不主动重绑监听，重绑由宿主重 apply 驱动；端口保存前 UI 必须警示断连（INV-1，R-16 修订 2026-09-29）。

### C-4: 密码安全不变量
永不明文落盘/回显；scrypt$ 单向；usersFile 原子写；响应/日志无哈希（INV-3）。

### C-5: 验收以用户可见行为为准
服务端 oracle 只作辅助；测试环境真实渲染+保存回显+登录流转 E2E 才算数（ERR 2026-09-25）。

## 禁止操作 / Prohibited Actions

- 禁止手写生产 `/root/.dsh/profiles/web/cordis.patch.yml`（含热改）
- 禁止改动生产联动脚本（gate-watchdog.sh / start-dsh.sh / reset-password.sh / update-gate.sh / gate-emergency.sh / Lucky 反代）
- 禁止改 obsidian-web 3500 /ob_share 契约代码
- 禁止在测试环境用 web profile 名 / 跑 start-dsh.sh / 占 3080、3500 端口
- 禁止执行者自行 push/merge/发版（发版五步逐次用户确认）
- 禁止白名单外配置键写入；禁止响应体回显密码哈希

## 验收标准 / Acceptance Criteria

### 代码验收
- node --test 全绿（load 冒烟 + integration 形：假 ctx 真 apply + 真 handler）
- settings-write 白名单拒写、users 原子写并发、端口占用预检三类用例在档

### 文档验收
- README 设置面说明 + 端口联动清单；CHANGELOG 版本条目；根 README 版本表同步

### 流程验收
- 测试环境 boot 冒烟四关全绿 → 发版五步（check-release PASS）→ 生产换 tag 重装（重启用户指定空档）
- gate-phase3~7 两步确认码留档

## 实现细节规范 / Implementation Details Spec

### 编码规范
零构建纯 ESM；client.js 无 JSX（React.createElement）；样式 `var(--dsw-alias-*, fallback)` dsh token；禁第三方 UI 库与网络外呼；客户端请求文档相对。

### 错误处理
服务端判据原文回显；空 draft 拒；writable:false → 只读注记；端口占用明示。
