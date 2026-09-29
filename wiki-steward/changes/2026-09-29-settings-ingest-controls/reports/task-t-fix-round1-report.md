# task-t-fix-round1-report.md — T-F1 修复环 R1：web/dist 构建物 `process.env.NODE_ENV` 未替换（blocker）

> 执行者：fresh 实现者（coder，subagent）。工作区 `/opt/workdata/dsh-plugins`。
> 任务证据面：`tester-report.md` T-F1（逐字）+ 修复环 R1 派活单（vite define 重建 dist + 真浏览器加载回归锁，先红后绿）。
> 状态：**完成**。`node --test` **386/386 绿**（基线 382 零回退 +4 新锁）、`npm run check` exit 0、`check-release.sh` PASS（含 dist 新鲜度锁）、手工 `grep -c 'process\.env\.NODE_ENV' web/dist/panel.js` = **0**。

---

## 0. 一句话结论

`web/vite.config.js` 按构建模式补 `define: {'process.env.NODE_ENV': …}`（lib 形显式 define——vite lib 模式故意不替换该标识符留给消费方，宿主前端无 `process` 垫片必须钉成字面量）→ `npm run build` 重建 `web/dist/panel.js` 入库（144,708 → 99,232 字节，`style.css` 逐字节不变）→ 新增回归锁 `test/dist-browser-load.test.mjs`（字节级残留扫描 + 无 `process` 环境真 ESM 加载 + 判别力自证），**锁先红后绿**，对旧缺陷可见。

## 1. 缺陷确认（tester T-F1 逐字 + 复现计数）

tester：`web/dist/panel.js` 含 219 处未替换 `process.env.NODE_ENV`（vite 无 `define`），浏览器 `import()` 即抛 `ReferenceError: process is not defined` →「查看历史记录」弹层只显示「wiki-steward 历史记录加载失败：process is not defined」；宿主前端无 `process` 垫片，任何真浏览器必复现；Node 测试面结构性抓不到（各历史构建均含，非本批回归）。

修复前实测计数（`grep -o | wc -l` vs `grep -c`）：

| 口径 | 修复前 | 修复后 |
|---|---|---|
| `process.env.NODE_ENV` 出现次数（`grep -o`） | **219**（与 tester 一致） | **0** |
| `process.env.NODE_ENV` 命中行数（`grep -c`） | 181（与 tester `grep -c 'process\.'` 同源） | 0 |
| `process.env` 宽口径 | 219 | 0 |
| 裸 `process` 词面 | 219+ | 1（`u.process(…)`，Vue 渲染器内部方法名——见 §4） |
| `panel.js` 字节 | 144,708 | 99,232（dev 分支死代码随 define 消解） |

## 2. 红→绿轨迹（先红后绿，锁先行）

| 步骤 | 动作 | 证据 |
|---|---|---|
| 1. 锁先行（红） | 新建 `test/dist-browser-load.test.mjs`，直接对**修复前**构建物跑 | **3 红 1 绿**：① 残留锁 ✖（219 处）、② Node 全局残留锁 ✖（`process.*` 属性访问）、③ 无 process 环境加载锁 ✖（子进程 exit 1，stderr 含 `process is not defined`）、④ 判别力 ✔ |
| 2. 修复 | `web/vite.config.js` 补 `define`（见 §3） | `node --check web/vite.config.js` SYNTAX_OK |
| 3. 重建 | `npm run build`（= `vite build --config web/vite.config.js`） | `✓ 19 modules transformed`，`web/dist/panel.js 99.23 kB`、`web/dist/style.css 3.01 kB`（与修复前 3,012 字节逐字节相同=0 行 diff） |
| 4. 转绿 | 重跑同一锁文件 | **4/4 绿**（tests 4 / pass 4 / fail 0） |

红面逐字（步骤 1 输出摘录）：

```
✖ ① 残留锁：web/dist 产物零 process.env.NODE_ENV 字节残留（vite define 必须真替换）
  AssertionError: web/dist/panel.js 残留 process.env.NODE_ENV——真浏览器 import() 必抛 ReferenceError: process is not defined（T-F1 blocker）
✖ ② Node 全局残留锁：dist 产物零 process/require/module/Buffer 节点 API/global. 残留
  AssertionError: web/dist/panel.js 残留 Node 全局 process.* 属性访问——真浏览器面必须零残留
✖ ③ 真浏览器语义加载锁：无 process 全局子进程动态 import panel.js 不抛 + 导出 mount
  AssertionError: 无 process 环境加载 panel.js 必须成功
✔ ④ 判别力：旧缺陷形（未替换 process.env.NODE_ENV）在残留锁与加载锁下必红
```

**判别力自证（锁对旧缺陷可见）**：④ 用旧缺陷形 fixture（含未替换 `process.env.NODE_ENV` 的最小模块）证明——字节扫描必计数 >0、无 `process` 环境动态 import 必炸 `ReferenceError: process is not defined`（与 tester 取证同款报错）。红面 ①②③ 就是本锁在修复前的真实输出（红→绿轨迹如上表）。

## 3. 修复内容（只动 web/ 构建配置 + dist 重建 + test/ 回归锁）

`web/vite.config.js`（+11/-1 行，vite lib 形惯例按构建模式取值）：

```js
export default defineConfig(({ mode }) => ({
  ...
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production'),
  },
  ...
}))
```

选型说明：vite **lib 模式故意不替换** `process.env.NODE_ENV`（留给消费方按需 define）——这正是 219 处漏网的机制根因；宿主前端无 `process` 垫片，必须显式 define 成字面量。按构建模式取值：`npm run build`（mode=production）→ `"production"` 字面量；dev server（mode=development）→ `"development"`（dev 只服务 src 不出 dist，不影响入库构建物）。

## 4. 残留扫描结果（任务第 3 条：dist 内其他 Node 全局核对）

扫描面 = `web/dist/panel.js` + `web/dist/style.css`（字节级 + 正则词界，LRN-037 大文本用 Buffer/正则）：

| 残留项 | 命中 | 判定 |
|---|---|---|
| `process.env.NODE_ENV` / `process.env` | 0 / 0 | ✅ 已 define 清零 |
| `process.*` 属性访问（`\bprocess\s*\.`） | 0 | ✅ |
| `__dirname` / `__filename` | 0 / 0 | ✅ |
| `require(` / `module.exports` | 0 / 0 | ✅ |
| `setImmediate` | 0 | ✅ |
| `Buffer.<节点 API>`（from/alloc/isBuffer…） | 0 | ✅ |
| `global.<属性访问>` | 0 | ✅ |

**明示豁免（扫描时人工核对上下文，非残留、无需 define/清理）**：

1. 裸 `process` 词面 1 处 = `u.process(e, t, r, …)`——**Vue 渲染器内部方法名**（局部对象属性调用，非 Node `process` 全局，浏览器安全）；
2. `Buffer` 词面 2 处 = `ir.cleanupBuffer(…)` / `!ir.cleanupBuffer(e)`——**插件 API 方法名**（`cleanupBuffer`，非 Node `Buffer` 全局；`\bBuffer` 词界不命中）；
3. `global` 词面 2 处 = `typeof self < "u" ? self : typeof window < "u" ? window : typeof global < "u" ? global : {}`——**Vue 全局探测**（typeof 守卫：浏览器 `typeof global === "undefined"`，`global` 分支不求值，安全）。

以上三项与回归锁 ② 的豁免口径一致（锁只禁真浏览器会炸/会歪的形，不误伤词面巧合）。

## 5. 回归锁设计（`test/dist-browser-load.test.mjs`，+4 测试）

| # | 锁 | 判据 | 面向缺陷 |
|---|---|---|---|
| ① | 字节级残留锁 | `web/dist/*` 中 `process.env.NODE_ENV`/`process.env` 字节计数 = 0（Buffer.indexOf 循环计数） | T-F1 本体（219 处未替换） |
| ② | Node 全局残留锁 | `process.*`/`require(`/`module.exports`/`__dirname`/`__filename`/`setImmediate`/`Buffer.<节点 API>`/`global.` 全零（正则词界，豁免见 §4） | 任务第 3 条顺带核对面 |
| ③ | 真浏览器语义加载锁 | 子进程 `delete globalThis.process` 后动态 `import(panel.js)` **不抛** + 导出 `mount`（成功标记 `WS_DIST_IMPORT_OK`） | 浏览器模块求值期任何 `process` 访问即炸——Node 测试面自带 `process` 结构性抓不到的盲区 |
| ④ | 判别力自证 | 旧缺陷形 fixture 在 ①③ 下必红（计数 >0 + `ReferenceError: process is not defined`） | 锁不可对旧缺陷失明 |

锁形纪律：零 mock（真查真构建物字节、真子进程真 ESM 解析，与 `client-face.test.mjs` 真 import 面同款）；子进程级隔离不污染父测试进程的 `process`（Node --test 面自身依赖）。

## 6. 验证证据（全量面）

| 验证项 | 结果 | 命令 |
|---|---|---|
| `node --test` | **386/386 绿**（fail 0）——基线 382（commit b555e82）零回退 +4 新锁 | `node --test` |
| `npm run check` | **exit 0**（lib 逐件 `node --check` + 386/386） | `npm run check` |
| dist 新鲜度锁 | **PASS**（commit 后回填，见 §7） | `bash scripts/check-release.sh wiki-steward` |
| 手工核对 | `grep -c 'process\.env\.NODE_ENV' web/dist/panel.js` = **0**（grep exit 1 = 无命中） | `grep -c 'process\.env\.NODE_ENV' web/dist/panel.js` |
| 构建物契约 | `mount` 导出在位（`ingest-dist.test.mjs` 既有锁 + 新锁 ③ 双确认）；`style.css` 逐字节不变（0 行 diff） | `node --test test/ingest-dist.test.mjs` |

## 7. dist 新鲜度锁（commit 级校验，回填）

`check-release.sh` 的 dist 新鲜度锁 = commit 级校验（web 源变更必伴 web/dist 同 commit 重建，基线=上个 tag `wiki-steward-v0.4.1`）。本修复 commit 同时含 `web/vite.config.js`（构建输入）与 `web/dist/panel.js`（重建产物）。**commit 后实跑**（`bash scripts/check-release.sh wiki-steward`）：

```
[PASS] package.json version = 0.4.1
[PASS] CHANGELOG.md 含 '## 0.4.1' 更新记录
[PASS] 根 README.md 版本表已同步
[PASS] tag wiki-steward-v0.4.1 已存在
[PASS] dist 新鲜度锁：3 个 web 源变更 commit 均伴 web/dist 同 commit（基线=上个 tag wiki-steward-v0.4.1）
[NOTE] 工作树有未提交变更 —— push 前提交
---
[VERDICT] PASS
```

> 注：窗口内 3 个 web 源变更 commit = `c88be4a`（Task F1 面板搬家）+ `b555e82`（Task F2 设置页对齐）+ 本修复环，均伴 `web/dist` 同 commit，锁未触发；`[NOTE]` 工作树未提交变更 = 本工作区其他插件（obsidian-web 等）在改中的文件，非本环改动面。

## 8. 红线自查

- ✅ 只改 `wiki-steward/web/`（`vite.config.js` 配置 + `dist/panel.js` 重建）与 `wiki-steward/test/`（新锁文件）+ 本报告；`web/dist/style.css` 重建后逐字节不变
- ✅ 不碰 `lib/` 产品逻辑（F1/F3/F2 成果行为面零触碰——`git diff --stat` 仅 vite.config.js + dist/panel.js + test/ + 本报告）
- ✅ 不碰 kb-context/obsidian-web/生产配置
- ✅ `git add` 具名路径（禁 -A）；不 push/tag/release
- ✅ 禁 spawn 子代理（本环全程未委派）；无 NEEDS_CONTEXT/NEEDS_HUMAN
- ✅ 测试基线 382 零回退（386 = 382 + 4）

## 9. concerns（如实）

1. **未真浏览器复测**：本环的「真浏览器语义」由子进程 `delete globalThis.process` + 真 ESM 动态 import 模拟（tester 修复建议认可的锁形之一：「Node vm/最小 ESM fixture 模拟无 process 环境 import 不抛」）。tester 取证环境（真浏览器弹层）建议在验收时按原路径复测一次「查看历史记录」弹层的来源标注/滚动加载两验收项（tester C6 备忘：T-F1 修复后需复测）。
2. **dist 构建物形态变化**：panel.js 144,708 → 99,232 字节（-31%）——`define` 钉 `"production"` 后 Vue dev 分支成死代码被构建器消解，属预期而非行为变化（生产语义本就是 production）；`style.css` 逐字节不变。若验收时需比对运行时行为，锚点=既有 382 测试全绿 + 新锁 ③ mount 契约通过。
3. **豁免词面的脆弱性**（§4 三项）：若未来 Vue 版本把内部方法 `process` 改成带点号的属性访问（`u.process.x`），回归锁 ② 会误报——届时按同款「先核对上下文再调豁免口径」处理，不放松锁本体。
4. 本批未做版本 bump/CHANGELOG（发版纪律五步不在本修复环范围）；`check-release.sh` 四对齐面仍锚定 v0.4.1 现状 PASS，真正发版时再走完整五步。
