// S2 阅读面视图模型 + 落地锁单测（delta-specs/ui-ca-wave.md S2 节；设计正本 candidate-a.md）：
//   ① 阅读头模型（页题/路径/元信息[更新时间/字数/标题数]/专注按钮）纯函数；
//   ② S2 排印轴落地锁：行长 68ch、字阶四档、段距节奏、标题间距分档
//     （UI-A 视觉波 2 2026-10-06 按 dir-a-apple-doc 正本定稿更新锁值：字阶 2/1.2/0.95/1.0=mock
//       32/19/15px 档比映射（元素/正文）、段距 0.95em、h1·h2 间距 1.8em 0 0.75em=mock 34px 0 14px、
//       h3 1.4em 0 0.45em=mock 22px 0 8px、blockquote 12px 16px=A6 淡底卡内距、pre 14px 16px、
//       表格 th border-l3 / td border-l1 发丝分档；同强度换常量、断言只增不删——
//       mock→实现映射见 reports/ui-a-impl.md，C→A 回切逐项对照见 reports/ui-a2-impl.md）；
//   ③ 专注模式最小面落码锁 + 按钮四档（S1 尾项 candidate-c 7）+ 危险档 AA 派生③对比度复测（脚本算比值）；
//   ④ A5 前端超时/中止落码锁（api.js AbortController + 8s TimeoutError）。
// 被测对象：web/src/lib/read-view.js + web/src/styles.css + web/src/api.js（纯新增测试，零改既有）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  formatNoteTime, countNoteChars, formatCount, noteMetaModel, focusButtonModel, readHeadModel,
} from '../web/src/lib/read-view.js'
import { LOAD_TIMEOUT_MS } from '../web/src/lib/load-state.js'
import { SHARE_TOKEN_SNAPSHOT } from '../lib/share-theme.js'

const WEB_SRC = fileURLToPath(new URL('../web/src', import.meta.url))
const STYLES = fs.readFileSync(`${WEB_SRC}/styles.css`, 'utf8')
const API = fs.readFileSync(`${WEB_SRC}/api.js`, 'utf8')

// ── ① 阅读头视图模型 ─────────────────────────────────────────────────────────
test('元信息时间文案：YYYY-MM-DD HH:MM（本地时区，无效回空串）', () => {
  const at = new Date(2026, 8, 27, 14, 32).getTime() // 2026-09-27 14:32 本地
  assert.equal(formatNoteTime(at), '2026-09-27 14:32')
  assert.equal(formatNoteTime('x'), '')
  assert.equal(formatNoteTime(0), '')
})

test('字数=源文去空白字符数（中英同权）；计数千分位', () => {
  assert.equal(countNoteChars('  a b 中文 \n'), 4)
  assert.equal(countNoteChars(null), 0)
  assert.equal(formatCount(1286), '1,286')
  assert.equal(formatCount(1234567), '1,234,567')
  assert.equal(formatCount(999), '999')
  assert.equal(formatCount(-5), '0')
})

test('阅读头元信息行：更新于/字数/标题数顺序固定，缺数据的行不占位（0 字恒在=事实）', () => {
  const at = new Date(2026, 8, 27, 14, 32).getTime()
  assert.deepEqual(
    noteMetaModel({ mtime: at, content: 'a'.repeat(1286), headings: 5 }),
    ['更新于 2026-09-27 14:32', '1,286 字', '5 个标题'],
  )
  assert.deepEqual(noteMetaModel({ content: '', headings: 0 }), ['0 字'])
  assert.deepEqual(noteMetaModel({ mtime: at }), ['更新于 2026-09-27 14:32'])
  assert.deepEqual(noteMetaModel({}), [])
})

test('专注模式按钮模型（最小面：无快捷键无持久化，仅按钮文案随态翻转）+ 阅读头模型', () => {
  assert.deepEqual(focusButtonModel(false), { focus: false, label: '专注模式' })
  assert.deepEqual(focusButtonModel(true), { focus: true, label: '退出专注' })
  const head = readHeadModel({
    path: '02-致远OA/表单-采购申请审批流改造.md',
    mtime: new Date(2026, 8, 27, 14, 32).getTime(),
    content: 'ab',
    headings: 5,
    focus: true,
  })
  assert.equal(head.title, '表单-采购申请审批流改造', '页题=路径末段去扩展名（noteTitle 同源）')
  assert.equal(head.path, '02-致远OA/表单-采购申请审批流改造.md')
  assert.deepEqual(head.meta, ['更新于 2026-09-27 14:32', '2 字', '5 个标题'])
  assert.equal(head.focusLabel, '退出专注')
})

// ── ② S2 排印轴落地锁 ────────────────────────────────────────────────────────
test('排印轴落码锁：行长 68ch、正文行高 1.75、段距 0.95em、标题间距 0.45–1.8em 分档（UI-A=dir-a 锁值）', () => {
  assert.match(STYLES, /\.ob-prose \{[^}]*max-width: var\(--ow-read-col\)/, '行长收 68ch 列宽（candidate-a 1；外框=68ch+2×32px 内距）')
  assert.match(STYLES, /--ow-read-col: calc\(68ch \+ var\(--ow-sp-8\) \* 2\)/, '行长合同=内容 68ch 随字号缩放（TECH §3.9.2）')
  assert.match(STYLES, /\.ob-prose \{[^}]*line-height: 1\.75/, '阅读正文行高 1.75（candidate-a 2）')
  assert.match(STYLES, /\.ob-prose p \{ margin: 0 0 0\.95em/, '段距 0.95em（dir-a .prose p）')
  assert.match(STYLES, /1\.8em 0 0\.75em/, 'h1/h2 上间距 1.8em 0 0.75em（dir-a 34px 0 14px 映射）')
  assert.match(STYLES, /1\.4em 0 0\.45em/, 'h3 上间距 1.4em 0 0.45em（dir-a 22px 0 8px 映射）')
  assert.match(STYLES, /1\.3em 0 0\.4em/, 'h4 上间距 1.3em（分档）')
})

test('字阶四档落码锁：页题 2 / h1·h2 1.2 / h3 0.95 / h4+ 1.0（dir-a 32/19/15px 档比映射），全部派生 --dsh-content-font-size', () => {
  assert.match(STYLES, /--ow-fs-page: calc\(var\(--dsh-content-font-size, 16px\) \* 2\)/, '页题档 ×2.0（dir-a 32px 大字阶对比）')
  assert.match(STYLES, /--ow-fs-h2: calc\(var\(--dsh-content-font-size, 16px\) \* 1\.2\)/, 'h1/h2 档 ×1.2（dir-a 19px）')
  assert.match(STYLES, /--ow-fs-h3: calc\(var\(--dsh-content-font-size, 16px\) \* 0\.95\)/, 'h3 档 ×0.95（dir-a 15px 小字重副题）')
  assert.match(STYLES, /\.ob-prose h4, \.ob-prose h5, \.ob-prose h6 \{[^}]*font-size: var\(--dsh-content-font-size/, 'h4+ 档 ×1.0=阅读档直用')
  assert.match(STYLES, /\.ob-prose h1, \.ob-prose h2 \{[^}]*font-size: var\(--ow-fs-h2\)/, 'h1/h2 消费 1.13 档')
  assert.match(STYLES, /\.ob-note-title \{[^}]*font-size: var\(--ow-fs-page\)/, '阅读头页题消费 2.0 档')
  // TECH §3.10.4 定稿三档保留命名档（display/caption），消费面=状态面大标题/脚注
  assert.match(STYLES, /--ow-fs-display: calc\(var\(--dsh-content-font-size, 16px\) \* 1\.6\)/, 'display 档保留')
  assert.match(STYLES, /--ow-fs-caption: calc\(var\(--dsh-content-font-size, 16px\) \* 0\.75\)/, 'caption 档保留')
})

test('专注模式落码锁：收起三侧 + 阅读列独占 + 入口=阅读头按钮（无快捷键无持久化）', () => {
  assert.match(STYLES, /\.ob-shell\.is-focus \{[^}]*grid-template-columns: minmax\(0, 1fr\)/, '阅读列独占')
  assert.match(STYLES, /\.ob-shell\.is-focus \.ob-menu,\s*\.ob-shell\.is-focus \.ob-tree,\s*\.ob-shell\.is-focus \.ob-toc \{[^}]*display: none/, '三侧收起')
  const app = fs.readFileSync(`${WEB_SRC}/App.vue`, 'utf8')
  assert.match(app, /:class="\{ 'is-focus': focusMode \}"/, 'class 切换零 v-if')
  assert.ok(!/keydown/i.test(app), '无快捷键（最小面）')
  const focusLines = app.split('\n').filter((l) => /focus/i.test(l))
  assert.ok(
    focusLines.every((l) => !/localStorage|sessionStorage|saveReadState|saveRecents/.test(l)),
    `专注态不持久化（最小面）：${focusLines.filter((l) => /localStorage|sessionStorage/.test(l)).join(' | ')}`,
  )
  const head = fs.readFileSync(`${WEB_SRC}/components/NoteHeader.vue`, 'utf8')
  assert.match(head, /aria-pressed/, '入口按钮 aria-pressed 随态')
})

// ── ③ 按钮四档（S1 尾项 candidate-c 7）+ AA 派生③对比度复测 ──────────────────
test('按钮四档落码锁：主=派生实底（既有）/ 次=缺省 / 幽灵 .ob-btn-ghost / 危险=错误色文字+描边（非实心红）', () => {
  assert.match(STYLES, /\.el-button\.ob-btn-ghost \{[^}]*--el-button-text-color: var\(--ow-link-safe/, '幽灵档=链接文字+透明底')
  assert.match(STYLES, /\.el-button\.el-button--danger,\s*\.el-button\.el-button--danger\.is-plain \{/, '危险档覆盖 solid+plain')
  const danger = /\.el-button\.el-button--danger,\s*\.el-button\.el-button--danger\.is-plain \{([\s\S]*?)\}/.exec(STYLES)
  assert.ok(danger, '危险档规则存在')
  assert.match(danger[1], /--el-button-text-color: var\(--ow-danger-text/, '危险档文字=派生③')
  assert.match(danger[1], /--el-button-bg-color: var\(--dsw-alias-bg-layer-1/, '危险档=中性底（不用实心红）')
  assert.match(danger[1], /--el-button-border-color: var\(--dsw-alias-border-l2/, '危险档=描边')
})

test('AA 派生③落码+复测：color-mix(error-primary, #000 8%) → #d91111，白底 5.20:1 ≥ 4.5（raw 4.50 前提复现）', () => {
  assert.match(STYLES, /color-mix\(in srgb, error-primary, #000 8%\)/, '注释缺推导式③（含 #000 混色轴原式）')
  assert.match(
    STYLES,
    /--ow-danger-text:\s*color-mix\(in srgb, var\(--dsw-alias-state-error-primary, CanvasText\), black 8%\)/,
    '危险档文字声明必须=推导值（black=#000 同值记法，派生自 dsh token 非第二套色板）',
  )
  const derived = mixBlack(L['--dsw-alias-state-error-primary'], 0.08)
  assert.equal(derived, '#d91111', '派生值=推导值')
  const ratio = contrast(derived, L['--dsw-alias-bg-base'])
  assert.ok(ratio >= 4.5, `派生③ vs 白底 ${ratio.toFixed(2)}:1 低于 AA 4.5`)
  assert.ok(Math.abs(ratio - 5.2) < 0.05, `与推导式注释 5.20:1 对照（实算 ${ratio.toFixed(2)}:1）`)
  const raw = contrast(L['--dsw-alias-state-error-primary'], L['--dsw-alias-bg-base'])
  assert.ok(raw < 4.5, `raw error-primary ${raw.toFixed(2)}:1 应复现现状缺口（4.50 不过 AA）`)
  const dark = contrast(D['--dsw-alias-state-error-primary'], D['--dsw-alias-bg-layer-1'])
  assert.ok(dark >= 4.5, `深色危险档直用 token ${dark.toFixed(2)}:1 低于 AA（不加深分支）`)
})

test('排印微调落码锁（S1 尾项 candidate-c 9 → UI-A dir-a）：表格横向发丝分档+表头加重、代码块内距、A6 引文淡底卡', () => {
  assert.match(STYLES, /\.ob-prose td \{[^}]*border-bottom: 1px solid var\(--dsw-alias-border-l1/, '表格横向 hairline：td=border-l1（dir-a 分档）')
  assert.match(STYLES, /\.ob-prose th \{[^}]*border-bottom: 1px solid var\(--dsw-alias-border-l3/, '表格横向 hairline：th=border-l3（dir-a 分档，去全框线）')
  assert.match(STYLES, /\.ob-prose th \{[^}]*font-weight: 600/, '表头加重')
  assert.match(STYLES, /\.ob-prose pre \{[^}]*padding: 14px 16px/, '代码块内距（dir-a .prose pre 14px 16px=candidate-c 9 点名值）')
  assert.match(STYLES, /\.ob-prose blockquote \{[^}]*padding: 12px 16px/, '引用卡内距（dir-a 12px 16px）')
  assert.match(STYLES, /\.ob-prose blockquote \{[^}]*background: var\(--ow-quote-bg\)/, '引用卡=A6 引文淡底（color-mix(label-primary, transparent 96%)）')
})

// ── ④ A5 前端超时/中止落码锁 ─────────────────────────────────────────────────
test('A5 落码锁：api.js AbortController + 8 秒超时中止 + TimeoutError 上抛（阈值同源 LOAD_TIMEOUT_MS）', () => {
  assert.equal(LOAD_TIMEOUT_MS, 8000)
  assert.match(API, /new AbortController\(\)/, 'AbortController 在 api 层')
  assert.match(API, /import \{ LOAD_TIMEOUT_MS, isTimeoutError \} from '\.\/lib\/load-state\.js'/, '阈值唯一源')
  assert.match(API, /name: 'TimeoutError'/, '超时中止以 TimeoutError 上抛（可解释超时）')
  assert.match(API, /signal: ctrl\.signal/, 'fetch 信号接线')
})

// ── 对比度工具（与 test/web-ui-base.test.mjs 同口径：sRGB 逐通道 + WCAG 2.1）──
function rgb(hex) {
  const h = hex.replace('#', '')
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
}
function mixBlack(hex, pct) {
  const k = 1 - pct
  return `#${rgb(hex).map((c) => Math.round(c * k).toString(16).padStart(2, '0')).join('')}`
}
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const L = SHARE_TOKEN_SNAPSHOT.light
const D = SHARE_TOKEN_SNAPSHOT.dark
