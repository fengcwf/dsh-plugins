# review-report — 整分支终审（C7 fresh-context review）— dsh-login-gate 设置面与认证优化

> 终审者：fresh subagent（code-review-and-quality 五轴）｜范围：全波 10 commits（0e02517..2613abe path-filtered，215KB diff）｜独立复跑 `node --test` **72/72 绿**
> **终审判定：PASS**——merge 前必须修（blocker/high）清单为空。

## Completeness（完整性）

US-1~6 逐条达成：设置栏目四区一段（端口+联动四行/参数 5 可改 3 只读/账号 CRUD/超时说明）；范围外六候选（滑动续期/记住我/真吊销/限流窗口/WS 引导/小时级超时）确认零实现；tests 面 72 用例与全波改动对账吻合（6+3+2+49+12）。

## Correctness（正确性）

跨面契约零漂移：client 字段表 ↔ EDITABLE_KEYS ↔ displayConfig 九键逐项对齐（手工交叉核 + contract-e2e 反向对账）；值域双侧一致（port 1-65535 / sessionDays 1-3650 / maxFailures≥1，与 zod Config 同域）；delete 契约由 contract-e2e 真签发者取证；错误码表逐码锁死。COR-1【low】TECH.md L27 机制表述失准（已随手清）；COR-2【medium·证据链】尖端补跑（已由 COR-2 rerun 闭环：四关 4/4 + E2E c/d C-5 级）；COR-3【low】端口确认流无真跨面用例（deferred）。

## Consistency（一致性）

US/INV 一致性表：INV-1（R-16 三面一致：applied:true 恒定/事前警示条/文档修订）✓、INV-2（白名单整单拒）✓、INV-3（四面零泄漏）✓、INV-4（首行鉴权缝）✓、INV-5（auth 面零 diff+回归 6 用例）✓、INV-7（联动清单+警示条点名）✓；Global Constraints 6/6 ✓。

## Clarity（可读性）

注释全为有据裁定/教训注引；单文件形制豁免 R-3 已批（client.js 615 行分区清晰）。

## Risks（风险）

遗留全部 low/nit 级（17 项 deferred 经分诊：T12 四项已核销，其余可留）；writable:false UI 严于服务端（保守方向，R 判保留）；SEC-2 scrypt 面无速率限制（与既有 auth 姿态一致）。

## Security（安全）

INV-3 哈希零泄漏四面（错误/警告/响应/日志）全过：JSON.parse 摘录切断（e.name 形）、warn 零用户输入插值、displayConfig 投影+userList 仅名字、多处 `scrypt$` 断言锁死。INV-4 鉴权缝无绕径（authGate 分发首行，405/404 兜底亦 401，测试锁死）。端口预检 bind 后即 close 无悬挂。usersFile 原子写（tmp 0600+rename）+进程内串行化。防自锁三源（UI 禁删/服务端会话优先防伪造/模块契约 fail-closed）。

## Performance（性能）

scryptSync 同步计算面（~60ms/次）与 addUser 先哈希后查重名（F5）均与既有 auth 姿态同源（INV-5 禁改 auth.js），低频管理面可留；settings GET per-request 现读无 N+1、无轮询。

## Maintainability / Testability（可维护性/可测性）

settings-routes→settings-write→configEditor 分层无环（users→auth 单向）；B1/B2 双层子插件接线正确（configEditor 惰性后到可见、缺缝降级 fail-open）；测试真行为面（真 fs/真 scrypt/真 handler/真网络）+ 跨面契约对账测试是全波最大质量资产。

## Coverage（覆盖）

认证回归 auth-regression 6 用例（固定过期不续期/指数退避锁定/哑 scrypt 防枚举/logout-all 轮换）为本波新增覆盖；测试环境实测（Task 14 四关+E2E、COR-2 尖端补跑）双轮证据链闭环。

## 分诊结论（deferred 17 项）

T12 四项 ✅核销；T10 六项/T11 三项/T13 四项/T14-fix 三尾/产品分叉一项——全部「可留」，无一阻 merge。发版物死链风险（F2）已随 release 提交入库闭环。

## Findings（severity 分级：Critical / Major / Minor / Suggestion）

- **[Major] COR-2 证据链缺口**（已闭环）：R-16 改用户可见面前测试环境证据取自修复前 ref——尖端补跑四关 4/4 + E2E c/d C-5 级证据闭环。证据：[settings-routes.js:175]（applied:true）、[client.js:506]（警示字面）。
- **[Minor] COR-1** TECH.md L27 机制表述失准（per-call 热读→apply 期快照）——已随手清。证据：[index.js:201]。
- **[Minor] SEC-1** usersPost catch-all 400 误分类基础设施错误、e.message 或含路径——deferred（终审分诊可留）。证据：[settings-routes.js:259]。
- **[Minor] F1 测试断言面**（Task 14 fix）：notice/警示条子串断言非全串等值——已补全串等值断言。证据：[client-settings.test.mjs:329]。
- **[Suggestion] F2 死夹具参数** getBootConfig 残留——已删。证据：[settings-routes.test.mjs:71]。
- **[Suggestion] F3 头注旧词**「重启提示」——已改「事前警示」。证据：[client-settings.test.mjs:6]。
- **[Minor] SEC-2** usersPost scrypt 面无速率限制（仅登录用户可达、与既有 auth 姿态一致）——deferred 可留。证据：[settings-routes.js:230]。
- **[Minor] T10 系耐久/性能边缘**（rename 前 fsync、addUser 先哈希后查重名）——deferred 可留。证据：[users.js:95]、[users.js:142]。

**无 Critical 发现。**

## 总体评价 / Overall Assessment / 结论

**终审结论：PASS**——全波 10 commits 合体质量高：安全面（INV-3/INV-4）测试+手工双查零泄漏零绕径；跨面契约对账（contract-e2e 真签发者/真落盘）为最大质量资产；R-16 语义改落得干净三面一致；独立复跑 [load.test.mjs:1] 全套 72/72 绿。遗留全部 Minor/Suggestion 级（deferred 17 项经分诊无一阻 merge）。发版 0.3.0：release 提交 [package.json:3]、tag dsh-login-gate-v0.3.0 已推 GitHub。
