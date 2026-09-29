# Task R2 报告 — 发版前收口（T-F2 真缺陷修复 + 报告定性修正）

> 2026-09-29 · fresh 实现者（coder）· 工作区 /opt/workdata/dsh-plugins · 测试基线 386/386（commit 4ce719b 后）

## 1. 任务与边界（终审 triage 两件小事）

1. **T-F2 真缺陷修复（2 行行为）**：`lib/client.js` onChange（原 :295-298）与 toggleHistory（原 :221-223）基于渲染闭包 `state.draft`/`state.historyOpen` 重建补丁并整体替换 draft——同一 React 批次内两次变更 = 后写覆盖前写（开关草稿丢失）。改**函数式 updater**（`setState(prev => …)`），补一条回归锁（同批次连发两变更，两叶子都保留），**锁先红后绿**、旧缺陷形可见（判别力自证）。
2. **报告定性修正（纯文字）**：① `reports/task-f2-report.md` concern② 机制定性改为「特异性胜出（0,2,0 > 0,1,0）非注入顺序依赖；真回归面=宿主改 Input.module.css 结构」；② T-F2「可能探针假象」表述改为「真缺陷（stale-closure 草稿竞态），已修（本 commit）」。

红线执行实录：只动 `wiki-steward/lib/client.js`（2 行行为）+ `wiki-steward/test/`（回归锁）+ 报告文字；`git add` 具名路径（禁 -A）；不 push/tag/release；零子代理（全程本会话自做）。

## 2. 代码改动（2 行行为，其余零改动）

| 落点 | 修前（缺陷形） | 修后（函数式 updater） |
|---|---|---|
| `lib/client.js:221` toggleHistory | `update({ historyOpen: state.historyOpen !== true })`（读渲染闭包） | `setState(function (prev) { return Object.assign({}, prev, { historyOpen: prev.historyOpen !== true }) })` |
| `lib/client.js:295` onChange | `var next = setPath(JSON.parse(JSON.stringify(state.draft)), …)` + `update({ draft: next, notice: null })`（闭包 draft 重建 + 整体替换） | `setState(function (prev) { return Object.assign({}, prev, { draft: setPath(…(prev.draft)…, field.path, value), notice: null }) })` |

机制：闭包读 → prev 读。同批次两次 setState 函数式 updater 依序对各自 prev 应用，前一叶子进 prev.draft 后被后一 updater 合并保留，不再后写覆盖前写；toggleHistory 双击同理净零。

## 3. 回归锁（新增 1 条）

`test/client-face.test.mjs` → `T-F2 回归锁：同批次连发两变更两叶子都保留（后写不再覆盖前写）+ 同批双击开关净零（函数式 updater）`：

- 同批次两变更 = 同一渲染树取两行 onChange（`ingest.schedule.enabled` → true、`ingest.schedule.time` → '04:30'），其间不重渲染（= React 批处理等价形），随后保存断言 POST `{patch}` 两叶子齐；
- 同批双击历史开关（onToggle×2）= 净零（仍收起）；
- **判别力自证**（上波教训：锁对旧缺陷形必须可见）：两症状合成一条失败清单（数组 diff），防首断言吞掉第二症状——旧形下红点一次性列全两症状。

## 4. 红 → 绿轨迹（证据原文）

**红**（未改 `lib/client.js`，`node --test --test-name-pattern='T-F2 回归锁' test/client-face.test.mjs`）：

```
✖ T-F2 回归锁：同批次连发两变更两叶子都保留（后写不再覆盖前写）+ 同批双击开关净零（函数式 updater）
  AssertionError: 同批次连发两变更两叶子都保留 + 同批双击开关净零（函数式 updater 消陈旧闭包）
  + actual - expected
  + [
  +   '①同批双击开关未归零（open=true）',
  +   '②同批两叶子后写覆盖前写（补丁={"patch":{"ingest":{"schedule":{"time":"04:30"}}}}）'
  + ]
  - []
ℹ tests 1 / pass 0 / fail 1
```

判读：② 补丁只剩 `time`、`enabled` 叶丢失——与 tester-report T-F2 实录（time 生效、enabled 未入 draft）同形，**实证非探针假象**；① 双击未归零 = toggleHistory 同族陈旧闭包。

**绿**（2 行修复后，同命令）：`✔ T-F2 回归锁：…` → `ℹ tests 1 / pass 1 / fail 0`。

## 5. 验证计数（基线 386 零回退 + 新增 1）

| 命令 | 结果 |
|---|---|
| `node --test`（修复后全套） | **tests 387 / pass 387 / fail 0**（386 基线零回退 + 新增 1） |
| `npm run check`（node --check 全 lib + node --test） | **exit 0** |
| `node --test`（基线取证，改动前） | tests 386 / pass 386 / fail 0 |

## 6. 报告定性修正记录（纯文字）

1. `reports/task-f2-report.md` concern②：
   - 修前：「Input padding 覆写依赖样式顺序……（同优先级后者胜——本表在 primitives materialize 后 append）。若宿主改 `Input.module.css` 结构/优先级需回归该 2px 项。」
   - 修后：「**特异性胜出（0,2,0 > 0,1,0）非注入顺序依赖；真回归面=宿主改 `Input.module.css` 结构**。（原表述「同优先级后者胜——本表在 primitives materialize 后 append」系误判为注入顺序依赖，随本修正撤回。）」
2. T-F2「可能探针假象」表述 → 「真缺陷（stale-closure 草稿竞态），已修（本 commit）」。**落点勘误（留痕）**：该字样在 `reports/` 目录内零命中，实际落点为本变更目录门禁文件 `tester-report.md:187`（T-F2 行 problem/requiredFix 两栏）与 `ledger.md:21`（Deferred lows 行，保留「当时记」痕迹 + R2 定性修正）。两处按定性修正意图同批改写；因红线具名口径为 `reports/*.md` 且该两文件 git 未跟踪，**未入本 commit**（留工作树待波主结算）——若终审坚持仅限 `reports/` 目录，此两处可原样回退（原文已在 §4/本节留痕）。

## 7. Concerns / NEEDS_CONTEXT

- **save() 同批陈旧闭包残余面（未动，超终审「2 行」边界）**：`save()` 仍读渲染闭包 `state.draft`（`Object.keys(state.draft)`、`JSON.stringify({patch: state.draft})`）——若保存与编辑在同一 React 批次触发（如 onChange 后未重渲染即点保存），会发旧补丁。建议后续波按同法（`setState(prev => …)` 内读 `prev.draft`）收口，回归锁可复用本锁形。
- **tester-report.md T-F3 行括注残留旧机制措辞**：「与 F2 concern②（样式顺序/宿主 CSS 依赖）同族留观」——「样式顺序」随 concern② 定性修正已不成立，但非终审点名处，未动（最小改动纪律）。
- **本 commit 不含发版动作**：版本仍 0.4.1 不 bump（与 F1/F3 同口径——发版五步属独立发版波，逐次确认）。
- commit sha 见派发回执（本报告随该 commit 入库）。
