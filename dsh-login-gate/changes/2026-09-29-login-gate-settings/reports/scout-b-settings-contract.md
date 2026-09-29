# 侦察报告 B：dsh 设置菜单栏目注册机制与 login-gate 缺口（只读）

> 来源：PATH A 通用 subagent scout（2026-09-29）；全程零改动。行号引用见各条。

## 一、设置页注册契约

1. **客户端模块契约**：package.json 声明 `dsh.client{platform:'web', inject:[...]}`（`kb-context/package.json:32-43`，inject 三件=@deepseek-ai/dsh-client-locale/-ui-renderer/-ui-layout；`wiki-steward/package.json:38-48` 同形）+ `exports["./client"]`（`kb-context/package.json:10`、`wiki-steward/package.json:10`）。宿主强制校验：`dsh-client-modules/lib/index.js:713-724`（要求 platform==='web'，缺 `./client` 大声 throw）；combo 自动服务 `/plugins/<id>/client.js`（`dsh-client-modules/lib/index.js:204,293`）。**`dsh.bundle.patch` 只管服务端装载/config，与设置栏目无关**。
2. **client.js 形制**：`window.__ModuleLoader__.load({id, factory})`，factory(require) 可 `require('react')`；导出 `{inject:['slots'], apply(ctx)}`，副作用全在 apply（`kb-context/lib/client.js:1-21,253-254`）。
3. **settings.section 槽**：`ctx.slots.inject('settings.section', setup)` 包 `ctx.slots.register({name:'settings.section', id, order, label:fn}, Component)`（`kb-context/lib/client.js:223-231`；`wiki-steward/lib/client.js:305-313`）。宿主契约 `dsh-client-ui-settings/lib/types/client/contract/slots.d.ts:73-78`。槽位方缺席=面缺席不炸插件；root 壳槽位禁注册但 settings.section 不在禁列（`wiki-steward/lib/client.js:12-15`）。**历史教训**：自造 `settings.plugins.tab` + 站内绝对路径动态 import = 生产 404（commit 350f81c；`wiki-steward/lib/client.js:11-13`；`ingest-routes.js:13`）；客户端请求一律**文档相对**（`kb-context/lib/client.js:18-20`）。
4. **三插件形制**：kb-context=无 web/、单文件零构建 client.js（257 行）；wiki-steward=双形（client.js 壳 + `web/` Vue+vite lib 单入口构建物入库，`web/vite.config.js:1-28` → dist/panel.js+style.css，经 `ingest-routes.js:94-111` prefix 静态服务）；obsidian-web=client.js 壳 + web/dist 经 `web-routes.js:390-417,687`（面板型，无 settings.section）。element-plus 按需参照形=`obsidian-web/web/src/element-plus.js`。

## 二、保存/生效链路

- 读：GET `api/<plugin>/settings` → `ctx.webServer.register({kind:'prefix', path:'/api/<plugin>'})`（`kb-context/lib/settings-routes.js:140`）；API 形={data}/{error:{code,message}}（:14-16）；每 handler 首行鉴权缝 `connection.requestRejection`（:24-29）。
- 写：POST `{patch:变更叶子}`（`client.js:154-157`）→ 白名单预检整单拒 not_editable（`settings-write.js:80-97`）→ zod 校验生效面 inherited∪current∪patch（:105-120）→ `configEditor.edit(entry, change)`（:121-147）。
- 持久化=**profile `cordis.patch.yml`**：`dsh-config-editor/lib/index.js:26-28,69-110`（文件锁→reconcile→resolveConfig→写 YAML→"Fulfillment after Loader reconciliation completes"=热生效）。
- 热生效边界：kb-context/wiki-steward 热生效靠 handler per-call 读 config（`kb-context/lib/index.js:154-156`、`settings-routes.js:104`）；**login-gate 端口是一次性 `server.listen`（`dsh-login-gate/lib/index.js:141-142`），改端口不热生效**。缺缝=GET writable:false / POST 503 write_unavailable（`settings-routes.js:111-115`），UI 换只读注记（`client.js:206-208`）。

## 三、kb-context 先例解剖

- 栏目：label `'kb-context'`（`client.js:229`）、order 30、id='kb-context'。代码：client.js 257 行（SettingsRow :63-104、组件 :110-214、注册 :216-256）+ settings-routes.js 143 行 + settings-write.js 147 行 + 8 个 client-settings 测试。
- **样式现状缺口**：查不到任何 CSS（类名仅 `client.js:200-208` 引用，无规则定义）；dsh token 参照形=`wiki-steward/web/src/styles.css:7-138`（`var(--dsw-alias-*, fallback)`）、`obsidian-web/web/src/styles.css:2-11`（`--el-color-primary` 桥接）。
- 文案：现状 label 平铺无 per-field 说明；`field.note` 行下说明渲染形可抄 `wiki-steward/lib/client.js:107-109`。⚠️ **kb-context 设置面 UX 波已建卡未执行**（`changes/2026-09-29-kb-context-settings-ux/` tasks.md T9-D1/F1/V1/R1 全 ⬜，brief 未产出）——"刚做过 UX 优化"实为派发未落地。
- 保存/回显（`client.js:145-170`）：空 draft 拒（:148）；saving='保存中…'（:207）；成功=合并回显+'已保存（热生效…）'（:167）；失败=显示服务端判据原文绝不静默（:160-162）；writable=false=只读注记（:208）。

## 四、login-gate 缺口清单

现状：无 web/、无 lib/client.js、无 settings-routes/settings-write；`package.json:6-34` 无 `dsh.client`、无 `exports["./client"]`（exports 仅 '.'/'./package.json'）；`inject=[]`（`lib/index.js:22`）自起 listener（:141-142）。config 13 键（`lib/index.js:24-37`）；端口 3500 定义点 `lib/index.js:27,69`、`cordis.patch.yml:12`、生产覆盖 `/root/.dsh/profiles/web/cordis.patch.yml:22`。

要补：①package.json `dsh.client{platform:'web',inject:[locale,renderer,layout]}` + `exports["./client"]` + files 含 lib（照 `kb-context/package.json:10,32-43`）；②lib/client.js 零构建 `__ModuleLoader__` 形 + settings.section（照 `kb-context/lib/client.js:216-256`），样式用 `--dsw-alias-*` token；③服务端数据面 `/api/login-gate/settings`（webServer+connection 可延迟内层子插件形，照 `kb-context/lib/index.js:196-235` B1/B2 修复形）+ settings-write 白名单；④热读语义实测（gate 一次性 listen，行为参数需 per-call 读；端口=重启语义）；⑤测试四件（client-settings/settings-routes/settings-write/load+integration）；⑥发版五步。

**建议裁定（待用户确认）**：port/listenHost/upstreamPort/rewriteHost=只读展示+标"改后需重启+外部联动"；可改=行为参数 sessionDays/maxFailures/gzipPass/secureCookie/wsAllow。

## 五、3500 引用面清单（改端口联动点）

- 工作区：`dsh-login-gate/cordis.patch.yml:12`、`lib/index.js:27,69`、`README.md:8,39,60`；**obsidian-web 分享链接外部契约** `share-links.js:22,138`（DEFAULT_SHARE_PORT）、`share-server.js:4,7,390`（`3500 /ob_share/<token>` 直通反代）；`wiki-steward/lib/ingest-routes.js:13`；测试护栏（3500=拒）`.testenv/smoke.sh:6,13,25`、`deploy-probe-3plugins.sh:23`、`e2e-probe.sh:5,22,104-106`、`t3-e2e.sh:5`；`docs/test-env-*.md` 约 19 处。
- 生产：`gate-watchdog.sh:34`（`curl http://127.0.0.1:3500/__gate/health` 探活）；`start-dsh.sh:5-15,33,101-113`（GATE 变量、ss 监听检查 0.0.0.0:3500、health、入口/应急提示）；`reset-password.sh:7,29,80,94`；`update-gate.sh:5,51`；`gate-emergency.sh:37-38`；`README.md` 约 20 行；`/root/bin/dsh-watchdog.sh:3,8,39-40,50-52,93`（cron */5）；headless 每小时自检任务文案含 3500。
- 外部：**NEEDS_HUMAN**——Lucky 反代 `https://dsh-mobile.cwf.fengcwf.cn:10086 → http://192.168.0.254:3500`（`start-dsh.sh:7`、`/root/.dsh/README.md:15`）配置体在家宽侧设备，查不到；nginx `/etc/nginx/` 零命中 3500。

## 六、UI 约定（AGENTS.md:63,100-104）

web/ 构建物入库随包、Vue+vite lib 单入口、lib/ 零构建；组件 ≤300 行、禁 v-if 重交互、样式对齐 dsh token；默认自绘不引第三方 UI 库，复杂交互才 element-plus 按需（禁全量 import、独立 vendor chunk、token 桥接、零第三方网络请求）。kb-context 零构建单文件形与 ≤300 行冲突时以形制为准留豁免（ledger R-3 先例）。

## 七、NEEDS_CONTEXT / NEEDS_HUMAN

1. NEEDS_HUMAN：Lucky 外网反代改端口联动在外部设备，需人工同步。
2. NEEDS_CONTEXT（实测项）：configEditor Loader reconcile 是否重跑 login-gate apply（listener 重绑）——`dsh-config-editor/lib/index.js:65-76` 只写到 reconciliation，未见 apply 重跑证据 → 端口项必须硬标"重启生效"。
3. NEEDS_CONTEXT：kb-context UX 波未落地，login-gate 设置页 UI 形制宜待其 brief 对齐，避免第三种形制分叉。
