# Phase 0 调研摘要 — dsh-login-gate 设置面与认证优化

> 变更：changes/2026-09-29-login-gate-settings/｜2026-09-29｜引用产出：phase0-data.json（机械扫描）、reports/scout-a-auth-timeout.md、reports/scout-b-settings-contract.md、wiki/reference/ERRORS.md、LEARNINGS.md、vault 部署文档
> 用户需求（三项）：① dsh 设置菜单增加栏目（端口维护，默认 3500）② 分析现在登录的超时认证是多久、多久后需要重新登录 ③ 分析优化空间与更多可设置功能

## 一、项目现状（引用 phase0-data.json，IL-6）

- 机械扫描（`phase0-scan.py /opt/workdata/dsh-plugins/dsh-login-gate --kb /mnt/unraid_data/Obsidian`）：project_dir 命中、file_count 859、dir_count 38、languages=[typescript, javascript, json, yaml]、key_files=package.json(884B)+README.md(9118B)（node/docs 类）。
- 知识库扫描：pitfalls_count=37、obsidian 可用，solutions_matches 9 条、project_matches 20 条、keywords=[docs,dsh,gate,javascript,json,login,node,typescript,yaml]。
- 插件形制：零构建 ESM（lib/ 8 文件 + tools/hash-password.mjs + test/load.test.mjs），当前版本 0.2.0，**无 web/、无 client.js、无设置面**（scout-b §四）。

## 二、技术机制调研（两份侦察报告，均带文件:行号证据）

### 2.1 认证/超时机制（reports/scout-a-auth-timeout.md）——回答用户第②问

- **结论：登录会话固定 30 天**（`sessionDays=30`，`lib/index.js:30`），令牌 `exp=签发+30d`（`lib/gate.js:123`）+ Cookie `Max-Age=2592000`（`lib/gate.js:73`），**无滑动续期**（请求只验不重签，`lib/gate.js:153`）→ **登录后 30 天内免登录，30 天到必须重新登录**（任意 URL 302 → `/__gate/login?next=…`，`lib/gate.js:153-157`；WS 则 401 断连，`lib/gate.js:168-174`）。
- 凭证=HMAC-SHA256 签名无状态 Cookie `dlg_sid`（`lib/auth.js:58,63-64`）；secret 持久化 `$DSH_HOME/login-gate/secret`，logout-all 轮换 secret 全员下线（`lib/gate.js:139-145`）。
- 与 dsh 侧关系：浏览器只持有 `dlg_sid`；dsh 原生 cookie 由门禁服务端缓存注入，6h 内部刷新周期（`lib/dsh-session.js:24`），dsh 宿主 cookie 本身 30 天（dsh-cc/lib/index.js:802）。**实际"需要重新登录"的瓶颈永远是门禁会话**。
- 生产实况核查（协调者，`/root/.dsh/profiles/web/cordis.patch.yml:22,25`）：`port: 3500`、`sessionDays: 30` 显式覆盖；入口=内网 192.168.0.254:3500 + 外网 Lucky 反代（vault 部署文档 2026-09-21）。
- 失败锁定：每 IP 连续 5 次失败起指数退避 30s~300s（`lib/ratelimit.js:5,21-24`），计数无时间窗衰减。

### 2.2 设置栏目机制（reports/scout-b-settings-contract.md）——支撑用户第①③问

- **注册契约**：package.json `dsh.client{platform:'web',inject:[locale,renderer,layout]}` + `exports["./client"]` → 零构建单文件 `lib/client.js`（`__ModuleLoader__` 工厂形）→ `ctx.slots.register({name:'settings.section', id, order, label}, Component)`（`kb-context/lib/client.js:223-231`）。`dsh.bundle.patch` 与此无关。
- **保存链**：UI POST `api/<plugin>/settings`（文档相对请求）→ 白名单预检 → zod 校验 → `configEditor.edit()` → 写 profile `cordis.patch.yml` + Loader reconcile 热生效（`dsh-config-editor/lib/index.js:69-110`）。
- **热生效边界**：行为参数经 handler per-call 读 config 可热生效；**端口是一次性 `server.listen`（`lib/index.js:141-142`），改端口必须重启**（且 reconcile 是否重跑 apply 无证据，scout-b NEEDS_CONTEXT②）。
- **端口改动联动面大**（scout-b §五）：watchdog 探活、start-dsh.sh 检查、README、obsidian-web `/ob_share/` 3500 外部契约、Lucky 外网反代（外部设备，NEEDS_HUMAN）、测试护栏（3500=拒）。
- 先例形制：kb-context=零构建单文件 client.js（257 行，样式缺口）；wiki-steward=client.js 壳+web/ 构建物入库；kb-context UX 波**已建卡未执行**（形制分叉风险）。

## 三、历史教训内化（四件套②：ERRORS.md + LEARNINGS.md 通读）

- **ERR 2026-09-23**：Phase 0 漏做内化历史教训 → 本摘要四件套齐全（扫描+教训通读+本地文档+摘要引用）。
- **ERR 2026-09-25**：修复验证必须用户视角 E2E/功能在场，服务端 oracle 只作辅助 → 本变更验收含设置页真实渲染+保存回显断言。
- **LRN-033/ERR 2026-09-24**：web profile `cordis.patch.yml` 服务存活期禁写（热重载拆工具面），结构性变更走"停服→原子 mv→启服"→ 设置保存走 configEditor 有锁写入是唯一正道，发版安装走版本纪律+重启。
- **LRN-035**：profile manifest 严格 JSON 禁手工注释；LRN-036：patch 新增行必须 `- insert:`、config 整行替换。
- **LRN-039**：测试可信必须打包产物+真安装路径；LRN-041：本地 gate 与 CI 同入口。
- **ERR-007**：用户明确指令后不多余分析；ERR-008/2026-05-16：协调者不写代码，派 coder/artist/tester（本波全程 PATH A 委派）。

## 四、本地历史文档扫描（四件套③）

- vault 部署文档《dsh 部署（2026-09-21）》：3500=唯一入口（0.0.0.0:3500，内网 192.168.0.254:3500 + 外网 Lucky →3500）；应急入口 127.0.0.1:3080/?token=（web-url.txt）；重启必须 `/root/.dsh/start-dsh.sh`（刷新 token 供门禁注入）；users.json 热加载。
- 工作区 docs/test-env-*：测试环境红线=端口避 3080/3500（.testenv/smoke.sh 等 4 护栏文件）。
- 先例：kb-context/wiki-steward 设置面实现 + kb-context 设置面 UX 波（2026-09-29，未执行）；obsidian-web 3500/ob_share 外部契约。
- 3500 EADDRINUSE 前科：obsidian-web 分享端口与 login-gate 3500 冲突事故（生产 cordis.patch.yml:1638 注释）——端口维护功能必须带冲突提示。

## 五、优化空间与更多可设置功能（回答用户第③问，候选清单待 Phase 1 勾选）

**设置面候选（读写面）**：A. 端口维护（默认 3500，含冲突/联动提示）；B. sessionDays（会话天数）；C. maxFailures（失败锁定阈值）；D. secureCookie；E. wsAllow；F. gzipPass；G. 用户账号管理（users/usersFile）；H. 会话超时语义改造（滑动续期/记住我）；I. logout 真吊销（服务端吊销名单）；J. 限流时间窗衰减；K. WS 过期体验优化（引导页）。

**机制优化线索**（scout-a §疑点）：固定 30 天无续期、logout 不作废令牌、限流无窗口、XFF 信任边界、WS 401 体验、两套会话期错位说明。

## 待确认问题清单（Phase 1 逐条与用户确认）

1. [功能] 设置栏目中"端口维护"的语义：只读展示当前端口+变更指引（改 cordis.patch.yml + 重启 + 外部联动），还是允许在设置面直接改端口值（写配置、提示需重启生效）?
2. [功能] 除端口外，哪些参数纳入设置面可改（候选 sessionDays/maxFailures/secureCookie/wsAllow/gzipPass/账号管理）：全选还是子集?
3. [功能] 会话超时是否要做"滑动续期/记住我"（活跃用户免重登场景），还是仅把"30 天后重新登录"的现状在设置面讲清楚?
4. [功能] 用户账号（users/usersFile，admin/clsh）是否要在设置面可视化增删改密（账号管理流程），还是保持 usersFile 手工维护?
5. [技术] 保存链选哪条：configEditor.edit 白名单（热生效）+ 端口类只读，还是全量写 config 后统一"重启生效"（部署语义）?
6. [技术] 设置面 UI 形制用 kb-context 零构建单文件 client.js 形，还是 wiki-steward web/ 构建物形（架构选型）?
7. [技术] `/api/login-gate/settings` 数据面鉴权缝怎么接（connection.requestRejection 接口），是否复用 kb-context 延迟子插件形?
8. [边界] 端口变更联动（watchdog/start-dsh.sh/obsidian-web 3500 契约/Lucky 外部反代）如何在 UI 提示与文档收敛？改端口失败/端口占用异常时怎么降级提示?
9. [边界] 保存失败/写缝缺位（writable:false、configEditor 缺位错误）时 UI 呈现什么（沿用 kb-context 只读注记形）?
10. [边界] WS 过期只 401 断连（GUI 表现为自动重连超时）是否纳入本变更优化（如过期引导重登页 fallback）?
11. [约束] 组件 ≤300 行约定与零构建单文件形制冲突时的处置（照 R-3 先例：以形制为准留豁免记录）?
12. [约束] 本变更发版口径：bump 到 0.3.0（加能力 minor）还是 0.2.1？测试环境 boot 冒烟四关+安全边界由谁把关确认?
13. [约束] 生产落地方式确认：测试环境验证 → 发版 → 生产换 tag 重装 + 重启（LRN-033 停服原子迁移），重启窗口需用户指定空档?

## 七、阶段判定

- 当前：Phase 0 完成（四件套件套①②③④齐全）→ 待用户确认后进 Phase 1（需求澄清，一次一问）。
- 执行路径：PATH A 通用 `subagent` 行（具名行运行时被拒，见 conversation.md）；模型路由随 dispatch-record 落账。
