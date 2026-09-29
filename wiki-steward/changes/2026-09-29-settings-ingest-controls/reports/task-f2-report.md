# task-f2-report.md — Task F2 设置页 UI 对齐 dsh 设置风格（完工报告）

> 执行者：fresh 实现者（artist+coder，subagent_oneshot）。工作区 `/opt/workdata/dsh-plugins`。
> 任务证据面：`changes/2026-09-29-settings-ingest-controls/diagnostic-report.md` §3（对齐清单）/§3.3（差异清单）/§5（影响面）+ `tasks.md` Task F2。
> 同族参照：`git show ebbf148 -- kb-context/`（kb-context 0.3.2 设置面对齐 dsh token——学姿势：token 唯一色板/幂等样式注入/契约断言先行，不照抄内容）。
> 状态：**完成**。`node --test` **382/382 绿**（基线 374 零回退 +8）、`npm run check` exit 0、`check-release.sh` PASS（含 dist 新鲜度锁）、组件逐个 ≤300 行。

---

## 0. 一句话结论

设置节从「零 CSS 裸控件」改造为 **dsh 原生设置节（zGbnIq）同构形**：控件换宿主原生 primitives（`Switch/Button/Input/Modal`，经 `dsh.client.inject` 供进 require 表），自绘布局按 §3.2 逐值落 CSS（`--dsw-alias-*`/`--dsw-radius-*` token 唯一色板），历史弹层收口原生 `Modal`，日志视图面（web/src/styles.css）同步对齐 §3.2 并重建 `web/dist` 入库。**功能面零行为变化**（{data}/{error} 契约、timer 语义、白名单、历史入口行为面全部由既有测试原样锁死）。

## 1. 对齐清单逐项达成证据（现状 → 目标，文件:行号）

### 1.1 §3.1 壳层契约（弹层面板 800px/导航列 188px/导航行/内容区）

**不属本卡改动面**：壳=宿主 `dsh-client-ui-settings-general`（`.VOzbGW_panel/.nav/.navCell/.header/.options`，`dsh-client-ui-settings-general/lib/client.js:60`）。设置节渲染于其 `renderSlot("settings.section")` 内容区（同文件 `:337`），壳几何由宿主供给、本插件零触碰（清单项=宿主既有达成，无需改造）。

### 1.2 §3.2 section 内容契约（逐项：目标值 → 落点）

目标真源 = `dsh-client-ui-settings-models/lib/client.js:58`（`.zGbnIq_*` CSS 全文）。

| # | 清单项 | 目标值 | 现状（改造前） | 达成落点（改造后） | 判定 |
|---|---|---|---|---|---|
| 1 | 节容器 | max-width 720px、column、gap 12px | 根 div 无样式（裸流式布局） | `.wiki-steward-settings`：`lib/client.js:105`（max-width:720px/flex-direction:column/gap:12px）+ 根挂载 `lib/client.js:361` | ✅ |
| 2 | 标题 | 16px/24px 500 | `<h3>` 浏览器默认 | `.wiki-steward-settings-title` `lib/client.js:106` + `lib/client.js:362` | ✅ |
| 3 | 引言 | 14px/22px `--dsw-alias-label-tertiary` | `p.wiki-steward-settings-note`（无 CSS） | `.wiki-steward-settings-intro` `lib/client.js:107` + `lib/client.js:363` | ✅ |
| 4 | 行卡片 | border .5px `settings-card-stroke`、bg `settings-card-fill`、radius-xl、padding 12px 14px、gap 12px | `div.wiki-steward-settings-row` 裸行（无卡片形） | `.wiki-steward-settings-rowCard` `lib/client.js:109` + SettingsRow 渲染 `lib/client.js:198` | ✅ |
| 5 | rows | gap 8px、margin 12px 0 0 | 行数组直挂根（无容器） | `.wiki-steward-settings-rows` `lib/client.js:108` + 容器 `lib/client.js:367` | ✅ |
| 6 | 行名 | 14px/22px 500 | label 无样式 | `.wiki-steward-settings-rowName` `lib/client.js:110` + `lib/client.js:190-197` | ✅ |
| 7 | 字段 | field column gap 6px | 无字段分层 | `.wiki-steward-settings-field` `lib/client.js:111` + `lib/client.js:199` | ✅ |
| 8 | fieldLabel | 12px/18px 500 secondary | — | **无适用面**：本节每卡单字段，标签即行名（rowName 形）；多字段卡形（zGbnIq editor 内）无本插件用户。不造冗余层 | ◻ 如实申报 |
| 9 | 输入框 | 高 32px、radius-md、.5px border-l4、bg layer-1、padding 0 10px、14px/22px、focus business-primary | 裸 `input[type=number/time]`（浏览器默认） | 原生 `ui.Input`：宿主 `Input.module.css:1-12`（.wrap=height 32px/border .5px l4/radius-md/bg layer-1/:focus-within business-primary）+ `:31`（.input 14px/22px）；本节补 §3.2 剩余项 `.wiki-steward-settings-input{width:100%;height:32px;padding:0 10px}` `lib/client.js:115`（覆盖 .wrap 的 8px padding） | ✅（padding 差 2px 由本表补齐） |
| 10 | 按钮 | 高 36px、radius-md、padding 0 14px、14px/22px、primary=button-primary-fill/label-primary-foreground、disabled .4、focus 环 | `.ws-btn` 仅 Vue 面板在用（5px 12px/radius-sm）；设置节保存按钮无样式类生效 | 原生 `ui.Button`：`Button.module.css:9`（radius-md=12px，token 实值 `dsh-client-ui-theme/lib/client.js:1142`）、`:15`（padding 0 14px）、`:23-24`（.md height 36px）、`:36`（.primary=button-primary-fill/label-primary-foreground）、`:disabled opacity .4`；保存=primary `lib/client.js:369-377`，动作/历史=outline `lib/client.js:396-411,432-439` | ✅ |
| 11 | 设置行（列表形，session-log 式） | row border-bottom .5px l2、padding 16px 0、title 14px/20px、description 12px/18px secondary | — | **部分适用**：无「设置行列表」用户（本节=卡片形）；注记按 description 形 12px/18px 落 `.wiki-steward-settings-note` `lib/client.js:112`；日志面注记 `web/src/styles.css:35` | ◻ 如实申报 |
| 12 | 原生控件组件（首选） | SettingsForm / settingsTextField / settingsNumberField / Switch / Checkbox / Input / SegmentedControl / Modal / Toast | 零使用（裸控件） | **采用** Switch `lib/client.js:153`、Input `lib/client.js:161,172`、Button `lib/client.js:369,396,404,432`、Modal `lib/client.js:441`（4 件，checklist 明点名的 Switch/Modal 全落）；**未采用** SettingsForm/SettingsValueField/settingsTextField/settingsNumberField/SettingsFormModel（裁定 R1，§3） | ✅（附裁定） |

### 1.3 §3.3 差异清单逐项收口（现状 → 目标）

| # | 项 | 现状（诊断原文） | 收口证据 |
|---|---|---|---|
| 1 | 设置节样式覆盖 | `wiki-steward-settings-*` 类名零 CSS（web/dist/style.css grep=0） | `SETTINGS_CSS` 注入表 `lib/client.js:104-124`（18 条规则全量覆盖设置节类名）+ 幂等注入 `lib/client.js:126-138`（STYLE_ID + `data-plugin-css` + `getElementById` 幂等 + `typeof document !== 'undefined'` 守卫） |
| 2 | 字体/间距 | .ws-root 13px/20px、grid 120-180px｜1fr | 设置节 §3.2 分层（§1.2 表）；日志面 `web/src/styles.css:5-10`（ws-root 14px/22px gap 12px） |
| 3 | 控件形 | 原生裸 checkbox/number/time | 布尔=`ui.Switch`（button[role=switch] 行内形）、number/time=`ui.Input`（type 透传语义保持）、textarea 补 `.wiki-steward-settings-textarea`（l4 描边/radius-md/layer-1/focus business-primary，`lib/client.js:116-117`） |
| 4 | 按钮 | .ws-btn 5px 12px radius-sm（且设置节保存无样式生效） | `ui.Button` 36px md/primary/outline（§1.2 #10）；Vue 面 `.ws-btn` 同步对齐 36px/radius-md/0 14px/14px 22px + `.ws-btn-ghost` 28px sm 行内形（`web/src/styles.css:51-99`） |
| 5 | 弹层 | 无（F1 自绘 fixed overlay + 内联样式） | `ui.Modal`（`lib/client.js:441-447`：title='wiki-steward · 历史记录'/closeLabel='关闭'/onClose→onToggle；遮罩、Escape、关闭钮、body portal 归宿主控件）；F1 内联 `HISTORY_OVERLAY_STYLE/HISTORY_PANEL_STYLE` 整体删除 |
| 6 | 日志展示 | ws-log/ws-log-line/ws-tag monospace | 壳=Modal（§3.2 重做 ✓）；日志数据行保持 monospace 12px/18px（数据展示面）；ws-tag 对齐 zGbnIq rowTag 形（radius-xs/11px/16px，`web/src/styles.css:117-127`）；`log-view.js` 纯模块复用不动 |

### 1.4 色板 token（唯一来源）与暗色

- 设置节 `SETTINGS_CSS` 与 `web/src/styles.css` 双双 **零硬编码色值**（hex/rgb/hsl 测试锁：`test/client-face.test.mjs` F2 样式面、`test/web-panel.test.mjs` F2 styles.css 双测）、**零暗色分支**（禁 `prefers-color-scheme`/`data-ds-dark-theme`，暗色随宿主 `--dsw-alias-*` 别名重定义自动适配——kb-context 0.3.2 同姿势）。
- 全部圆角引 `--dsw-radius-*`（xs/sm/md/lg/xl/panel 实值 `dsh-client-ui-theme/lib/client.js:1142`）；focus 环引 `--dsw-focus-ring-*`（`web/src/styles.css:74-77`）。

## 2. 裁定记录（Rulings，含代价）

### R1 — SettingsForm 家族不采用，改用叶子原生控件 Switch/Button/Input/Modal

- **裁定**：`SettingsForm / SettingsValueField / SettingsSecretField / settingsTextField / settingsNumberField / SettingsFormModel` 不进本设置节；采用其叶子控件族 `Switch/Button/Input/Modal`。
- **证据**：① **像素失配**——该家族是 Plugins 页 staged-form 形：`fields.module.css` `.input{height:34px;…font-size:13px}`、`SettingsForm.module.css` `.save{padding:5px 14px;…font-size:13px;background:var(--dsw-alias-label-primary)}`，与 §3.2 输入框 32px/14px、按钮 36px/14px/22px+`button-primary-fill` 逐值不合；用之=对着清单失配。② **语义不同构**——`SettingsFormModel` 是 revision-fenced staged-document 模型（`lib/types/settings-form/form-model.d.ts`：`getSnapshot/subscribe/mutate(ops, expectedRevision)`、dirty 门闸禁保存、override/reset 徽章、empty=clear），本插件是 GET 配置 + POST `{patch}` 白名单整单语义（`lib/settings-write.js:11-17` 权威判据）；换模型=F1/F3 行为面重写（红线「不改功能语义」禁）。③ checklist 本身把 `Switch`（§3.2 #3「开关用 Switch」）与 `Modal`（§3.3 #5「= Modal primitive」）**点名为控件形目标**，`Button md=36px/radius-md=12px` 与 §3.2 按钮行逐值一致、`Input .wrap` 与 §3.2 输入框行逐值一致——叶子族即像素级达成面。
- **代价若判错**：若审查裁定必须挂 SettingsForm 保存行（host `.save` 形），需接受 13px/5px 保存形或再覆写其 CSS，且 dirty 门闸会吞掉「空保存→没有待保存的变更」反馈（现行为保留，见 §5 测试）——属行为面变更，需另行裁定后再动。

### R2 — 「逻辑落 web/src/lib 纯模块」的适用面（React 设置节平台约束）

- **裁定**：Vue 面板侧达标现状保持（`web/src/lib/log-view.js/log-history.js/trigger-model.js/settings-model.js/view-model.js` 纯模块，`.vue` 只做展示）；React 设置节（`lib/client.js`）保持单文件工厂束，纯逻辑（`getPath/setPath`、draft/patch、动作反馈）为文件内命名纯函数区，组件逐个 ≤300 行。
- **证据**：require 表只认「platform seed 词 + 已登记工厂」（`dsh-client-modules/lib/client.js:696-714` `makeRequire`），本地 `web/src/lib/*.js` 不在表内；`require.async('./…')` 只吃 `client.*.js` 形构建 chunk 且须宿主 boot 路由服务（`chunkUrl` 同文件 `:480-485`）——插件单 client 入口（`exports["./client"]`=lib/client.js）是宿主契约。同族 kb-context/skill-explorer 均单文件自包含（kb-context `lib/client.js` 同款 `<style>` 注入形）。
- **代价若判错**：若要求设置节逻辑也落 web/src/lib，需宿主支持多 client chunk 或把设置节整体改造成 panel.js 内嵌 Vue 面（行为面大改）——超 F2「只动视觉与结构」边界。

### R3 — web/src/styles.css 属 F2 领地（诊断 §5.1 ★ + 验收「dist 重建入库」）

历史弹层的日志视图=设置节子件（F2 红线列名「历史入口」的功能面），其 `ws-*` 面按 §3.2 对齐布局/字体/控件形（§1.3 #2/#4/#6），功能面零行为变化；`web/dist` 同 commit 重建入库（`style.css` 2.40→3.01 kB，`panel.js` 字节不变 144.70 kB）。

## 3. TDD / 验证轨迹

### 3.1 红→绿双环（断言先行）

**环 1（设置节控件/结构）**：先升级测试 harness（原生控件假缝 `uiStub`：渲染形严格镜像官方 .d.ts——Switch→`button[role=switch][aria-checked]`、Button→原生 button 属性透传、Input→`span>input` 属性透传、Modal→open=false 渲染 null 否则 `[role=dialog][aria-label]+closeLabel 钮+children`；`__primitive` 标记由 createElement 即时展开成 DOM 树——被测件=「我们传给原生控件的 props 接线」，控件内部渲染归宿主组件自身测试面）+ 断言修订（§4）+ 5 条 F2 新测试 → **RED 10/26**（5 条修订波及的旧测试 + 5 条新测试，红名单原文留痕于执行日志）→ 实现 `lib/client.js` 结构重构 + `package.json` inject/peer/dev → **GREEN 26/26**。

**环 2（web/src 样式）**：2 条 styles.css 契约测试（token 唯一色板 + §3.2 几何逐项）→ **RED 2/20** → `web/src/styles.css` 对齐（去硬编码色值回退、按钮/标题/注记/根几何、primary 双 token）→ **GREEN 20/20**（测试侧两处自修正：断言计数 `noted>=3`→`>=2`——白名单仅 2 字段带 note；值断言补空白容差——styles.css 为可读形 `height: 36px`，非实现侧变更）。

### 3.2 全量验证（完工判据）

| 项 | 结果 | 证据 |
|---|---|---|
| `node --test` 全量 | **382/382，fail 0**（基线 374 +8：client-face +5 F2、ingest-dist +1 依赖口径、web-panel +2 styles） | 执行日志 `ℹ tests 382 / ℹ pass 382 / ℹ fail 0` |
| 基线零回退 | 374 条旧测试全绿（其中 8 处断言按 §4 修订，行为面断言逐条保持） | 同上 |
| `npm run check` | **exit 0**（node --check ×17 lib + node --test） | 执行日志 |
| dist 新鲜度锁 | **PASS**：`[PASS] dist 新鲜度锁：1 个 web 源变更 commit 均伴 web/dist 同 commit（基线=上个 tag wiki-steward-v0.4.1）` | `bash scripts/check-release.sh wiki-steward`（整体 VERDICT: PASS，version/CHANGELOG/README/tag 四对齐均 PASS） |
| 组件行数 ≤300 | SettingsRow 60 / WikiStewardSettingsSection 170 / WikiStewardManualActions 29 / WikiStewardHistoryEntry 22 / WikiStewardHistoryMount 36 / apply 37（`lib/client.js` 全文 542 行=单文件工厂束，见 R2） | 行数自查（逐函数 L146-L535） |
| 跨插件零波及 | kb-context `node --test` 194/194 绿（其 `test/manifest.test.mjs:19-29` 对 wiki-steward 只锁 `dependencies.zod ^4.6.5` + `peerDependencies.zod` 不存在——本波零触碰 zod 声明）；kb-context/obsidian-web/生产配置零改动 | 只读执行 + `git status` |
| 依赖口径 | `@deepseek-ai/dsh-client-ui-primitives` 走 peer（`>=0.2.0-rc.1`）+ dev（`link:` 运行时副本）双声明，不进 dependencies（dsh-plugin-ops 依赖三件套；测试环境独立 node --test 面用假缝不解析真包，故无解析缺位问题） | `package.json:28-39` + `test/ingest-dist.test.mjs` 依赖口径测试 |

## 4. 断言修订理由清单（不弱化断言、不改行为面）

| # | 位置 | 原断言 | 新断言 | 理由 |
|---|---|---|---|---|
| 1 | `test/client-face.test.mjs` 保存按钮定位 ×4（GET ready/保存/拒绝/定时改时间） | `find(tree, n => n.type === 'button')`（树内首个 button=保存） | `saveButton(tree)` = 语义锚 `data-ws-action="save"` | 控件形对齐后 `Switch` 也呈 button 语义（`button[role=switch]`），旧判别式在新树上返回开关而非保存（判别力失真）；改语义锚后 POST url/body/notice 文案等行为断言逐条原样 |
| 2 | `test/client-face.test.mjs` 行发现 ×4（同上） | `tree.children.find(c => Array.isArray(c))`（rows 直挂根槽位） | `rowsOf(tree)` = 按组件语义收集 `SettingsRow` | §3.2 rows 容器契约要求 rows 收进 `.rows` 列表容器（结构对齐），槽位形状断言改为组件语义断言；`props.field.path/onChange` 行为断言不变 |
| 3 | `test/client-face.test.mjs` 定时控制-启用开关 | `input[type=checkbox]` + `.checked===true` | `button[role=switch]` + `aria-checked` + 点击→`onChange(false)` | §3.2 #3「开关用 Switch（行内 switch 形）」=清单点名的控件形改造；数据契约 `onChange(bool)→draft→{patch}` 不变，断言从 DOM 形改行为形（点击真触发翻转值） |
| 4 | `test/client-face.test.mjs` 定时控制-时间输入 | `input[type=time]`（注释「简单形，样式 F2 收口」） | 断言**原样保留**（仅注释改「语义保持：只换壳为 Input 原生控件，type=time 透传」） | 零修订——F2 只换壳不换语义，原断言继续成立（红线「定时控件功能面零行为变化」的直接锁） |
| 5 | `test/ingest-dist.test.mjs` 清单契约 | `dsh.client.inject` deepEqual 官方三件 | deepEqual 四件（+`@deepseek-ai/dsh-client-ui-primitives`） | 诊断 §2.2 明示此步属 F2 领地（require 表须先 materialize 该包）；另新增「依赖口径」测试锁 peer+dev 双声明（断言只增不减） |
| 6 | `test/web-panel.test.mjs`（新增 2 测） | — | styles.css token 唯一色板 + §3.2 几何逐项 | 新增锁（F2 领地首次有样式契约测试，防回归） |

## 5. 功能面零行为变化的锁（既有测试原样绿）

- **{data}/{error} 契约**：保存只发变更叶子 `{patch}`、not_editable/invalid 服务端判据原文展示、载入失败如实报错（`test/client-face.test.mjs`「保存=POST」「服务端拒绝」「载入失败」全绿）；手动动作 `data.note` 原文（在跑/通道缺文案不改写）、`{error.message}` 原文（「手动动作」3 测全绿）。
- **timer 语义/白名单**：`ingest.schedule.{enabled,time}` 白名单双侧一致、改时间走 `{patch:{ingest:{schedule:{time}}}}`（「定时控制：改时间…」绿）；双源提示文案原样入 UI（「定时控制：时间输入…」绿，文案断言逐字保持）。
- **历史入口行为面**：查看/收起开合翻转、`aria-expanded` 两态、挂载 `mount(el,{apiBase:'api/wiki-steward',view:'log'})` 契约、清理=unmount+清空幂等、加载失败容器内如实报错（F1 四测全绿，断言零修订）。
- **保存按钮微行为**：保存常亮（仅 saving 禁用）、空保存→「没有待保存的变更」如实提示——未采用 SettingsForm dirty 门闸（R1），行为字节级保持。

## 6. Concerns / NEEDS_CONTEXT

1. **原生控件假缝的验证边界**：单测断言的是「我们传给原生控件的 props 接线」+ 假缝镜像的 .d.ts DOM 契约；`Switch/Button/Input/Modal` 的真实渲染形归宿主组件。建议 Task T 在 `.testenv` 设置页面探针里核对：开关真呈 switch 形、按钮 36px、输入 32px、历史弹层（Modal 走 body portal）开合/Escape/遮罩关闭。
2. **Input padding 覆写机制定性（R2 修正）**：`.wiki-steward-settings .wiki-steward-settings-input{padding:0 10px}` 覆写宿主 `.wrap` 的 8px——**特异性胜出（0,2,0 > 0,1,0）非注入顺序依赖；真回归面=宿主改 `Input.module.css` 结构**。（原表述「同优先级后者胜——本表在 primitives materialize 后 append」系误判为注入顺序依赖，随本修正撤回。）`:has(input:disabled)` 需 Chrome 105+（dsh web 目标浏览器均支持）。
3. **R1/R2 两条裁定是取舍不是全胜**：若用户/审查裁定「必须用 SettingsForm」或「设置节逻辑必须落 web/src/lib」，两者都触行为面/平台契约（§2 代价栏），需另行裁定与排期，不在 F2「只动视觉与结构」边界内可解。
4. **清单 #8/#11 无适用面**（fieldLabel/列表形设置行）：如实申报未落（本插件无多字段卡、无设置行列表用户），未造冗余 DOM 凑清单。
5. **本 commit 不含发版动作**：版本仍 0.4.1（F1/F3 同口径——发版五步属独立发版波）；`check-release.sh` 四对齐当前 PASS 于 0.4.1 基线，发版时再 bump。
