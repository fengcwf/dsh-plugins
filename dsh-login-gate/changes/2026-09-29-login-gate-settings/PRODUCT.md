# PRODUCT.md — 产品规格书（dsh-login-gate 设置面与认证优化）

> 变更：changes/2026-09-29-login-gate-settings/｜2026-09-29｜来源：conversation.md Round 1-6

## 概述 / Overview

dsh-login-gate（登录门禁插件，生产拓扑：Lucky 外网反代 + 内网 192.168.0.254:3500 → 门禁 → dsh web 127.0.0.1:3080）新增 **dsh 设置菜单栏目**：端口维护（默认 3500）、登录会话超时可配、行为参数可调、登录账号增删改密；并交付登录超时认证机制与优化空间两份分析（用户需求②③）。

## 用户故事 / User Stories

| ID | 角色 | 功能描述 | 业务价值 | 优先级 |
|----|------|---------|---------|--------|
| US-1 | 登录用户 | 在 dsh 设置菜单看到「dsh-login-gate」栏目，可维护门禁端口（默认 3500）；保存后明确提示「需重启生效」并列出联动清单（watchdog/start-dsh.sh/obsidian-web 3500 契约/Lucky 外网反代需人工同步） | 端口维护可视化，杜绝改端口漏联动 | P0 |
| US-2 | 登录用户 | 在设置面调整 sessionDays（1~3650）/maxFailures/secureCookie/wsAllow/gzipPass；listenHost/upstreamPort/rewriteHost 只读展示 | 日常参数维护免改文件 | P0 |
| US-3 | 登录用户 | 登录页与设置页明示「登录后 N 天内免登录」（N=当前 sessionDays）；设置页附超时机制说明（固定过期、到期重新登录、与 dsh 会话关系） | 回答需求②：超时认证时长透明化 | P0 |
| US-4 | 登录用户 | 设置面登录账号增删改密：scrypt 哈希服务端生成、usersFile 热加载即刻生效、任何登录用户可操作 | 账号维护免手工跑 hash 工具 | P0 |
| US-5 | 维护者 | 登录认证/超时机制分析报告 + 优化空间与更多可设置功能候选清单落档 | 回答需求②③，后续演进有据 | P0 |
| US-6 | 维护者 | 候选优化（滑动续期/记住我/logout 真吊销/限流时间窗/WS 过期引导/小时级超时）仅分析不做码 | 范围收敛，风险不外溢 | P2 |

## 产品不变量 / Product Invariants

| INV | 约束 | 验证方式 |
|-----|------|---------|
| INV-1 | 配置写入经宿主 re-apply **即时生效**；插件不主动重绑监听，重绑由宿主重 apply 驱动；端口保存前 UI 必须警示断连 | 设置页警示条断言 + 代码评审（插件不主动重绑 listener） |
| INV-2 | 配置写入只经 configEditor.edit 白名单（原子锁+reconcile）；白名单外键整单拒绝 not_editable；不手写 profile cordis.patch.yml（LRN-033） | settings-write 测试：白名单外 POST 必拒 |
| INV-3 | 密码永不明文落盘/回显；scrypt$ 单向哈希；usersFile 原子写；列表/日志不泄哈希 | 代码评审 + 测试断言响应体无哈希 |
| INV-4 | 未登录请求永远无法触达 /api/login-gate/settings（鉴权缝 connection.requestRejection） | 测试：无凭证 GET/POST 必拒 |
| INV-5 | 认证行为逻辑零改动（固定过期、HMAC dlg_sid、失败锁定、防枚举）；本变更只加可配置面与 UI | 既有 node --test 全绿 + diff 评审 |
| INV-6 | 发版门禁：node --test 全绿（含 load 冒烟 + integration 形）+ 测试环境 boot 冒烟四关 + check-release.sh PASS | tester 报告 + 门禁文件 |
| INV-7 | 3500 外部契约联动清单随端口设置项与文档同步（obsidian-web /ob_share、Lucky 反代、gate-watchdog、start-dsh.sh） | 设置页提示文案 + README 更新核对 |

## 可验证性 / Verifiability

- US-1：设置页端口输入框默认 3500、保存成功回显 + 重启提示 + 联动清单可见（integration 测试 + 测试环境真实渲染）
- US-2：五参数保存后 GET 回读一致；三监听参数只读（writable 语义）
- US-3：登录页文案含"登录后约 N 天内免登录"（N 随配置）；设置页含机制说明
- US-4：增/删/改密后 usersFile 更新、scrypt$ 格式正确、新密码可登录、旧密码失效（测试环境 E2E）
- US-5/6：reports/ 两份分析 + phase0-research.md §五候选清单在档

## 修订记录 / Revision History

- 2026-09-29 v1：Phase 1 澄清定稿（Round 1-6，用户逐项选择 + 继续确认）
