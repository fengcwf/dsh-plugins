// UI-C 视觉 token 锁（方向 c「苹果风深色高质感/明态同构」，用户看图定稿 2026-09-30「完全安装 dir-c-light
// 发版」；视觉正本=dir-c-apple-dark.html light 模式 + dir-c-light.png（渲染正本）/dir-c-dark.png（暗态参照），
// 设计说明=reports/ui-visual-2/README.md C 节；mock→实现映射=reports/ui-c-impl.md）：
//   ① 字阶锁：档比对比（页题 ×1.8=mock 27/15 + 600/-0.02em/1.3）+ h2 发丝线节奏 + 小字距面板条；
//   ② 间距锁：4/8 间距刻度逐值 + 阅读头网格排版（动作右上工具位）+ meta ·分隔；
//   ③ 圆角锁：两档 token 同源（radius-sm 8px 控件 / radius-xs 4px 行内），胶囊只给状态徽标；
//   ④ 控件细节锁：按钮内高光（C3）+ 同色相轻阴影（C4）+ 按下 0.5px 位移 + 幽灵档纯平 + 焦点光晕（C7）；
//   ⑤ 派生色 AA 比值复测（脚本算比值，明暗双态逐对 ≥4.5:1）：dir-c C1-C8 + 既有派生①②③；
//   ⑥ 明暗双态独立推导锁（暗分支独立推导：C1 white 3.5% / C2 black 22% / C4 白相微光 / C6 #fff 24%）；
//   ⑦ 状态面精致化锁：骨架贴版式（32px 题条）/ 错误卡层级 / 空状态 display 档；
//   ⑧ M1 树行工具位锁：闲置脱流/显形收回流内（三档 right 硬值与数值预留清零）；
//   ⑨ C1-C8 派生式注释锁（推导式逐条在场=红线「C1-C8 派生式逐条注释」机械面）。
// 纪律：既有测试零弱化（本文件纯新增于 UI-A 波；web-read-view 与本文件的视觉锁值按定稿同强度更新，
// 断言只增不删），派生色一律 color-mix 单向推导自 dsh token（非第二套色板）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SHARE_TOKEN_SNAPSHOT } from '../lib/share-theme.js'

const STYLES = fs.readFileSync(fileURLToPath(new URL('../web/src/styles.css', import.meta.url)), 'utf8')

/** 剥注释后取规则体（注释里也提类名，锁形只看声明区） */
const NOCOMMENT = STYLES.replace(/\/\*[\s\S]*?\*\//g, '')

function ruleBody(fragment) {
  const at = NOCOMMENT.indexOf(fragment)
  assert.ok(at >= 0, `styles.css 缺规则：${fragment}`)
  const open = NOCOMMENT.indexOf('{', at)
  let depth = 0
  for (let i = open; i < NOCOMMENT.length; i += 1) {
    if (NOCOMMENT[i] === '{') depth += 1
    else if (NOCOMMENT[i] === '}') {
      depth -= 1
      if (depth === 0) return NOCOMMENT.slice(open + 1, i)
    }
  }
  assert.fail(`规则体未闭合：${fragment}`)
}

/** 块体抽取（含嵌套；明暗双态锁用） */
function blockBody(startAt) {
  assert.ok(startAt >= 0, 'styles.css 缺目标块')
  const open = NOCOMMENT.indexOf('{', startAt)
  let depth = 0
  for (let i = open; i < NOCOMMENT.length; i += 1) {
    if (NOCOMMENT[i] === '{') depth += 1
    else if (NOCOMMENT[i] === '}') {
      depth -= 1
      if (depth === 0) return NOCOMMENT.slice(open + 1, i)
    }
  }
  assert.fail('块体未闭合')
}

/** prefers-color-scheme: dark 块体（明暗双态锁用） */
function darkBlock() {
  return blockBody(NOCOMMENT.indexOf('@media (prefers-color-scheme: dark)'))
}

// ── 对比度工具（与 test/web-ui-base.test.mjs 同口径：sRGB 逐通道 + WCAG 2.1）────────
function rgb(hex) {
  const h = hex.replace('#', '')
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
}
const toHex = (arr) => `#${arr.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
/** color-mix(in srgb, base, black|white pct) 同口径 */
function mixAxis(hex, axis, pct) {
  const t = axis === 'black' ? [0, 0, 0] : [255, 255, 255]
  return toHex(rgb(hex).map((c, i) => c * (1 - pct) + t[i] * pct))
}
/** color-mix(in srgb, color, transparent N%) 合成于 bg（keep=不透明度） */
function tintOver(hex, bg, keep) {
  return toHex(rgb(hex).map((c, i) => c * keep + rgb(bg)[i] * (1 - keep)))
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

// ── ① 字阶锁（dir-c 档比对比 + h2 发丝线节奏）────────────────────────────────
/** 从 STYLES 解析内容字号轴倍率（ui-a-review m2 修复：真锁实现面，非自证常量） */
function axisRatio(varName) {
  const m = new RegExp(`${varName}:\\s*calc\\(var\\(--dsh-content-font-size, 16px\\) \\* ([0-9.]+)\\)`).exec(STYLES)
  assert.ok(m, `styles.css 缺字阶档 ${varName}`)
  return Number(m[1])
}

test('字阶锁：页题 ×1.8 档比对比 + 600/-0.02em/1.3（dir-c 27px 页题形），派生内容字号轴', () => {
  const title = ruleBody('.ob-note-title')
  assert.match(title, /font-size:\s*var\(--ow-fs-page\)/, '页题消费 ×1.8 档')
  assert.match(title, /font-weight:\s*600/, '页题字重 600（mock 同款，非 700）')
  assert.match(title, /letter-spacing:\s*-0\.02em/, '页题字距 -0.02em（mock 逐值）')
  assert.match(title, /line-height:\s*1\.3;/, '页题行高 1.3（mock 逐值）')
  const ratio = axisRatio('--ow-fs-page') // 页题/正文 档比（dir-c 27/15=1.8）
  assert.ok(Math.abs(ratio - 1.8) < 0.001, `页题档比=dir-c 27/15=1.8（实解析 ${ratio}）`)
  assert.ok(ratio >= 1.75, `大字阶对比：页题/正文 ≥1.75 档比（实 ${ratio}）`)
  const h2Ratio = axisRatio('--ow-fs-h2')
  assert.ok(Math.abs(h2Ratio - 1.13) < 0.001, `h2 档比=dir-c 17/15≈1.13（实解析 ${h2Ratio}）`)
  assert.ok(ratio > h2Ratio, '页题档比 > h2 档比（层级对比成立）')
})

test('字阶锁：h2 发丝线节奏（margin 1.53em 0 0.71em + padding-top 18px + border-top hairline + 首节 h1/h2 全豁免）', () => {
  const h2 = ruleBody('.ob-prose h1, .ob-prose h2')
  assert.match(h2, /margin:\s*1\.53em 0 0\.71em/, 'h1/h2 间距=mock 26px 0 12px 映射')
  assert.match(h2, /padding-top:\s*18px/, 'h2 发丝线上内距=mock 18px（排印定值）')
  assert.match(h2, /border-top:\s*1px solid var\(--dsw-alias-border-l1/, 'h2 前发丝线=border-l1')
  assert.match(h2, /letter-spacing:\s*-0\.012em/, 'h2 字距=mock')
  // ui-a-review m3 修复：首节豁免扩到 h1:first-child（正文以 # 开头=首元素 h1），且豁免含发丝线本体
  const first = ruleBody('.ob-prose h1:first-child,')
  assert.match(first, /margin-top:\s*12px/, '首节贴阅读头（mock 12px）')
  assert.match(first, /padding-top:\s*0/, '首节无发丝线上内距')
  assert.match(first, /border-top:\s*0/, '首节无悬空发丝线（m3：h1/h2 同档全豁免）')
  const h3 = ruleBody('.ob-prose h3')
  assert.match(h3, /margin:\s*1\.29em 0 0\.57em/, 'h3 间距=mock 18px 0 8px 映射')
})

test('字阶锁：面板题/大纲题=panel-bar 小字距标签形（mock .panel-bar），空状态 display 档 600/-0.02em', () => {
  const pane = ruleBody('.ob-pane-title')
  assert.match(pane, /font-size:\s*11\.5px/, '面板题 11.5px（mock .panel-bar）')
  assert.match(pane, /font-weight:\s*600/, '面板题 600')
  assert.match(pane, /letter-spacing:\s*0\.08em/, '面板题 0.08em（mock .panel-bar）')
  const toc = ruleBody('.ob-toc-title')
  assert.match(toc, /letter-spacing:\s*0\.08em/, '大纲题字距 0.08em（mock .panel-bar）')
  assert.match(toc, /font-weight:\s*600/, '大纲题 600')
  assert.match(toc, /height:\s*38px/, '大纲题=38px 面板条（mock .panel-bar）')
  const empty = ruleBody('.ob-empty-title')
  assert.match(empty, /font-size:\s*var\(--ow-fs-display\)/, '空状态大题=display 档')
  assert.match(empty, /font-weight:\s*600/, '空状态大题 600')
  assert.match(empty, /letter-spacing:\s*-0\.02em/, '空状态大题 -0.02em（页题同款处理）')
})

// ── ② 间距锁（4/8 刻度 + 阅读头网格排版 + meta ·分隔）──────────────────────────
test('间距锁：4/8 刻度 sp=4/8/12/16/24/32/48 逐值（组件唯一间距面）', () => {
  const expect = {
    '--ow-sp-1': '4px', '--ow-sp-2': '8px', '--ow-sp-3': '12px', '--ow-sp-4': '16px',
    '--ow-sp-6': '24px', '--ow-sp-8': '32px', '--ow-sp-12': '48px',
  }
  for (const [name, val] of Object.entries(expect)) {
    assert.match(STYLES, new RegExp(`${name.replace(/-/g, '\\-')}:\\s*${val.replace(/px/g, 'px')}`), `${name}=${val}`)
  }
})

test('阅读头网格排版（dir-c .head-top）：路径左/动作右上工具位，元素零变化纯排版；窄屏逐区块退化', () => {
  const head = ruleBody('.ob-note-head')
  assert.match(head, /grid-template-areas:/, '阅读头=网格排版')
  assert.match(head, /'top acts'/, '首行=路径左 + 动作右上（mock .head-top）')
  assert.match(head, /'title title'/, '页题独占行')
  assert.match(head, /'meta meta'/, '元信息独占行')
  assert.match(head, /border-bottom:\s*1px solid var\(--dsw-alias-border-l1/, '头部区与正文区发丝分隔（mock .doc-head）')
  const acts = ruleBody('.ob-note-acts')
  assert.match(acts, /grid-area:\s*acts/, '动作位=网格区')
  assert.match(acts, /justify-self:\s*end/, '动作右上贴右缘')
  const meta = ruleBody('.ob-note-meta span + span::before')
  assert.match(meta, /content:\s*'·'/, '元信息 ·分隔（mock .note-meta .it + .it::before）')
  const narrow = NOCOMMENT.slice(NOCOMMENT.indexOf('@media (max-width: 960px)'))
  assert.match(narrow, /'top'\s*'acts'\s*'title'\s*'meta'/s, '窄屏阅读头退化=逐区块显式堆叠')
})

test('间距锁：阅读头节奏（mock 22px 32px 18px 排印定值）+ 树/大纲呼吸位（mock tree-body/toc-body 8px）', () => {
  assert.match(ruleBody('.ob-note-head'), /padding:\s*22px var\(--ow-sp-8\) 18px/, '阅读头节奏=mock .doc-head 22px 32px 18px')
  assert.match(ruleBody('.ob-tree {'), /padding:\s*8px/, '树内距=mock .tree-body 8px')
  assert.match(ruleBody('.ob-toc {'), /padding:\s*0/, '大纲面板条下体=toc-body（见列表呼吸位）')
  assert.match(ruleBody('.ob-toc > .ob-toc-list'), /padding:\s*8px/, '大纲体呼吸位=mock .toc-body 8px')
  assert.match(ruleBody('.ob-prose'), /padding:\s*4px var\(--ow-sp-8\) 28px/, '正文区内距=mock .prose 4px 32px 28px')
  assert.match(ruleBody('.ob-prose th,'), /padding:\s*7px 10px/, '表格内距=mock th/td 7px 10px')
})

// ── ③ 圆角锁（两档 token 同源 + 胶囊唯一例外）──────────────────────────────────
test('圆角锁：控件档=radius-sm 8px / 行内档=radius-xs 4px（token 同源零自造），胶囊只给状态徽标', () => {
  assert.match(STYLES, /--ow-radius-control:\s*var\(--dsw-radius-sm, 8px\)/, '控件档走 dsw radius-sm')
  assert.match(STYLES, /--ow-radius-inline:\s*var\(--dsw-radius-xs, 4px\)/, '行内档走 dsw radius-xs')
  const pillUses = [...STYLES.matchAll(/var\(--ow-radius-pill\)/g)]
  assert.equal(pillUses.length, 1, '胶囊只允许一处（状态徽标既有例外）')
  assert.match(ruleBody('.ob-chip'), /border-radius:\s*var\(--ow-radius-pill\)/, '胶囊唯一面=.ob-chip')
  assert.match(ruleBody('.ob-prose blockquote'), /border-radius:\s*var\(--ow-radius-control\)/, '引文卡=控件档圆角（mock）')
})

// ── ④ 控件细节锁（dir-c .btn：内高光 C3 + 同相轻影 C4 + 按下位移 + 焦点光晕 C7）────────
test('控件细节锁：按钮 1px 微影 + 内高光（C3）、主档同相影（C4）、按下 0.5px、幽灵档纯平', () => {
  const btn = ruleBody('.el-button')
  assert.match(btn, /box-shadow:\s*var\(--ow-shadow-btn\), var\(--ow-highlight-top\)/, '按钮=微影+内高光')
  assert.match(btn, /font-size:\s*var\(--dsw-font-xs-13-font-size/, '按钮 13px 字面（mock .btn）')
  assert.match(btn, /font-weight:\s*500/, '按钮 500 字重（mock）')
  assert.match(ruleBody('.el-button:not(.is-disabled):active'), /translateY\(0\.5px\)/, '按下 0.5px 位移（mock .btn:active）')
  const primary = ruleBody('.el-button.el-button--primary')
  assert.match(primary, /box-shadow:\s*var\(--ow-shadow-accent\)/, '主档=同色相轻影（C4）')
  assert.match(primary, /font-weight:\s*600/, '主档 600 字重（mock .btn-primary）')
  assert.match(ruleBody('.el-button.ob-btn-ghost'), /box-shadow:\s*none/, '幽灵档纯平')
  assert.match(ruleBody('.ob-tree-rename,'), /box-shadow:\s*var\(--ow-highlight-soft\)/, '树行内操作=顶缘内高光（mock .row-btn）')
  // 阴影/高光推导式落码（轻且同色相，非第二套色板）
  assert.match(STYLES, /--ow-shadow-card:\s*0 1px 3px color-mix\(in srgb, var\(--dsw-alias-label-primary, CanvasText\), transparent 92%\)/, 'C4 卡片同相影推导式')
  assert.match(STYLES, /--ow-shadow-btn:\s*0 1px 1px color-mix\(in srgb, var\(--dsw-alias-label-primary, CanvasText\), transparent 94%\)/, 'C4 按钮微影推导式')
  assert.match(STYLES, /--ow-shadow-accent:\s*0 1px 2px color-mix\(in srgb, var\(--dsw-alias-state-business-primary, Highlight\), transparent 70%\)/, 'C4 主档同相影推导式（mock .btn-primary 70%）')
  assert.match(STYLES, /--ow-highlight-top:\s*inset 0 1px 0 color-mix\(in srgb, var\(--dsw-alias-bg-base, Canvas\), transparent 55%\)/, 'C3 内高光推导式')
  assert.match(STYLES, /--ow-highlight-soft:\s*inset 0 1px 0 color-mix\(in srgb, var\(--dsw-alias-label-primary, CanvasText\), transparent 94%\)/, '行内件/代码块/引文内高光推导式（mock 94%）')
})

test('控件细节锁：单一克制强调色消费面=C5 选中淡底（树选中/菜单当前）+ 焦点环光晕 C7 + 主按钮', () => {
  assert.match(STYLES, /--ow-accent-tint:\s*color-mix\(in srgb, var\(--dsw-alias-state-business-primary, Highlight\), transparent 88%\)/, 'C5 淡底推导式')
  assert.match(STYLES, /--ow-ring-accent:\s*inset 0 0 0 1px color-mix\(in srgb, var\(--dsw-alias-state-business-primary, Highlight\), transparent 78%\)/, 'C5 伴生选中内描边推导式')
  assert.match(STYLES, /--ow-glow-focus:\s*0 0 0 4px color-mix\(in srgb, var\(--dsw-alias-state-business-primary, Highlight\), transparent 86%\)/, 'C7 焦点光晕推导式')
  assert.match(ruleBody('.ob-tree .el-tree-node.is-current'), /background:\s*var\(--ow-accent-tint\)/, '树选中=C5 淡底（mock aria-current）')
  assert.match(ruleBody('.ob-tree .el-tree-node.is-current'), /box-shadow:\s*var\(--ow-ring-accent\)/, '树选中=内描边（mock aria-current）')
  assert.match(ruleBody('.ob-menu .el-menu-item.is-active'), /background:\s*var\(--ow-accent-tint\)/, '菜单当前项=C5 淡底')
  assert.match(ruleBody('.ob-menu .el-menu-item.is-active'), /color:\s*var\(--ow-accent-text\)/, '菜单当前项=C8 文字')
  assert.match(ruleBody(':focus-visible'), /outline:\s*2px solid var\(--dsw-alias-state-business-primary/, '焦点环主色 2px')
  assert.match(ruleBody(':focus-visible'), /box-shadow:\s*var\(--ow-glow-focus\)/, '焦点环带光晕（mock .btn.is-focus/C7）')
})

// ── ⑤ 派生色 AA 比值复测（脚本算比值；推导式与声明逐值同）──────────────────────
test('派生色推导式落码（dir-c C1/C2/C5/C6/C8 + 错误卡保留面）：声明=color-mix 逐值，非第二套色板', () => {
  assert.match(STYLES, /--ow-panel-bg:\s*var\(--dsw-alias-bg-base, Canvas\)/, 'C1 明=bg-base')
  assert.match(STYLES, /--ow-shell-bg:\s*color-mix\(in srgb, var\(--dsw-alias-bg-base, Canvas\), black 2\.5%\)/, 'C2 明')
  assert.match(STYLES, /--ow-accent-text:\s*color-mix\(in srgb, var\(--dsw-alias-state-business-primary, Highlight\), black 15%\)/, 'C8 明')
  assert.match(STYLES, /--ow-error-bg:\s*color-mix\(in srgb, var\(--dsw-alias-state-error-primary, CanvasText\), transparent 96%\)/, '错误卡淡底（A6 保留面）')
  assert.match(STYLES, /--ow-chip-saved-bg:\s*color-mix\(in srgb, var\(--dsw-alias-state-success-primary, CanvasText\), transparent 88%\)/, 'C6 底明')
  assert.match(STYLES, /--ow-chip-saved-fg:\s*color-mix\(in srgb, var\(--dsw-alias-state-success-primary, CanvasText\), black 40%\)/, 'C6 字明')
  assert.match(STYLES, /--ow-chip-dirty-bg:\s*color-mix\(in srgb, var\(--dsw-alias-state-warn-primary, ButtonBorder\), transparent 88%\)/, 'C6 dirty 底明（三态同式）')
  assert.match(STYLES, /--ow-chip-dirty-fg:\s*color-mix\(in srgb, var\(--dsw-alias-state-warn-primary, ButtonBorder\), black 40%\)/, 'C6 dirty 字明')
  assert.match(STYLES, /--ow-chip-conflict-bg:\s*color-mix\(in srgb, var\(--dsw-alias-state-error-primary, CanvasText\), transparent 88%\)/, 'C6 conflict 底明')
  assert.match(STYLES, /--ow-chip-conflict-fg:\s*color-mix\(in srgb, var\(--dsw-alias-state-error-primary, CanvasText\), black 40%\)/, 'C6 conflict 字明')
})

test('派生色比值复测·明态：C1/C2/C5/C6/C8 + 派生①②③ 逐对 ≥AA 4.5:1（合成底口径）', () => {
  const bg = L['--dsw-alias-bg-base']
  const panelBg = bg // C1 明=bg-base
  const accentText = mixAxis(L['--dsw-alias-state-business-primary'], 'black', 0.15)
  assert.equal(accentText, '#3764c4', 'C8 派生值=推导值')
  const accentTint = tintOver(L['--dsw-alias-state-business-primary'], panelBg, 0.12)
  const shellBg = mixAxis(bg, 'black', 0.025) // C2 明
  const codeBg = L['--dsw-alias-markdown-code-block'] // dir-c 引文/代码块同底
  const errorBg = tintOver(L['--dsw-alias-state-error-primary'], bg, 0.04)
  const savedFg = mixAxis(L['--dsw-alias-state-success-primary'], 'black', 0.4)
  const savedBg = tintOver(L['--dsw-alias-state-success-primary'], panelBg, 0.12)
  const dirtyFg = mixAxis(L['--dsw-alias-state-warn-primary'], 'black', 0.4)
  const dirtyBg = tintOver(L['--dsw-alias-state-warn-primary'], panelBg, 0.12)
  const conflictFg = mixAxis(L['--dsw-alias-state-error-primary'], 'black', 0.4)
  const conflictBg = tintOver(L['--dsw-alias-state-error-primary'], panelBg, 0.12)
  assert.equal(savedFg, '#147638', 'C6 saved 文字派生值')
  assert.equal(dirtyFg, '#935f07', 'C6 dirty 文字派生值')
  assert.equal(conflictFg, '#8e0b0b', 'C6 conflict 文字派生值')

  const pairs = [
    ['C8 accent 字 on C5 淡底', accentText, accentTint],
    ['C8 accent 字 on C1 面板底', accentText, panelBg],
    ['label-primary on C5 淡底', L['--dsw-alias-label-primary'], accentTint],
    ['label-secondary on C5 淡底', L['--dsw-alias-label-secondary'], accentTint],
    ['label-secondary on C2 外壳底', L['--dsw-alias-label-secondary'], shellBg],
    ['label-primary on C2 外壳底', L['--dsw-alias-label-primary'], shellBg],
    ['C6 saved 字/底', savedFg, savedBg],
    ['C6 dirty 字/底', dirtyFg, dirtyBg],
    ['C6 conflict 字/底', conflictFg, conflictBg],
    ['label-secondary on 引文/代码块底', L['--dsw-alias-label-secondary'], codeBg],
    ['label-primary on 引文/代码块底', L['--dsw-alias-label-primary'], codeBg],
    ['label-primary on 错误卡底', L['--dsw-alias-label-primary'], errorBg],
    ['label-secondary on 错误卡底', L['--dsw-alias-label-secondary'], errorBg],
    // 既有派生①②③ 复测（比值不回退）
    ['派生①主按钮白字', mixAxis(L['--dsw-alias-state-business-primary'], 'black', 0.22), bg],
    ['派生②链接文字/白底', mixAxis(L['--dsw-alias-link'], 'black', 0.15), bg],
    ['派生③危险文字/白底', mixAxis(L['--dsw-alias-state-error-primary'], 'black', 0.08), bg],
  ]
  for (const [label, fg, back] of pairs) {
    const r = contrast(fg, back)
    assert.ok(r >= 4.5, `明态 ${label} ${r.toFixed(2)}:1 低于 AA 4.5`)
  }
})

test('派生色比值复测·暗态：C1/C2/C5/C6/C8 + 派生①②③ 逐对 ≥AA 4.5:1（合成底口径，暗分支独立推导）', () => {
  const bg = D['--dsw-alias-bg-base']
  const panelBg = mixAxis(bg, 'white', 0.035) // C1 暗
  const accentText = D['--dsw-alias-state-business-primary'] // C8 暗=直用 token
  const accentTint = tintOver(D['--dsw-alias-state-business-primary'], panelBg, 0.12)
  const shellBg = mixAxis(bg, 'black', 0.22) // C2 暗
  const codeBg = D['--dsw-alias-markdown-code-block']
  const errorBg = tintOver(D['--dsw-alias-state-error-primary'], bg, 0.04)
  const savedFg = mixAxis(D['--dsw-alias-state-success-primary'], 'white', 0.24)
  const savedBg = tintOver(D['--dsw-alias-state-success-primary'], panelBg, 0.16)
  const dirtyFg = mixAxis(D['--dsw-alias-state-warn-primary'], 'white', 0.24)
  const dirtyBg = tintOver(D['--dsw-alias-state-warn-primary'], panelBg, 0.16)
  const conflictFg = mixAxis(D['--dsw-alias-state-error-primary'], 'white', 0.24)
  const conflictBg = tintOver(D['--dsw-alias-state-error-primary'], panelBg, 0.16)
  assert.equal(savedFg, '#57d385', 'C6 saved 暗文字派生值')
  assert.equal(dirtyFg, '#f7b546', 'C6 dirty 暗文字派生值')
  assert.equal(conflictFg, '#f58282', 'C6 conflict 暗文字派生值')

  const pairs = [
    ['C8 accent 字 on C5 淡底', accentText, accentTint],
    ['label-primary on C5 淡底', D['--dsw-alias-label-primary'], accentTint],
    ['label-secondary on C5 淡底', D['--dsw-alias-label-secondary'], accentTint],
    ['label-secondary on C2 外壳底', D['--dsw-alias-label-secondary'], shellBg],
    ['label-primary on C2 外壳底', D['--dsw-alias-label-primary'], shellBg],
    ['C6 saved 字/底', savedFg, savedBg],
    ['C6 dirty 字/底', dirtyFg, dirtyBg],
    ['C6 conflict 字/底', conflictFg, conflictBg],
    ['label-secondary on 引文/代码块底', D['--dsw-alias-label-secondary'], codeBg],
    ['label-primary on 引文/代码块底', D['--dsw-alias-label-primary'], codeBg],
    ['label-primary on 错误卡底', D['--dsw-alias-label-primary'], errorBg],
    ['label-secondary on 错误卡底', D['--dsw-alias-label-secondary'], errorBg],
    ['派生①主按钮字/实底', D['--dsw-alias-state-business-primary'], bg],
    ['派生②链接文字/底', D['--dsw-alias-link'], bg],
    ['派生③危险文字/底', D['--dsw-alias-state-error-primary'], bg],
  ]
  for (const [label, fg, back] of pairs) {
    const r = contrast(fg, back)
    assert.ok(r >= 4.5, `暗态 ${label} ${r.toFixed(2)}:1 低于 AA 4.5`)
  }
})

// ── ⑥ 明暗双态独立推导锁（暗分支独立推导非反转）────────────────────────────────
test('明暗双态锁：暗分支逐条独立推导（C1 white 3.5% / C2 black 22% / C8 直用 / C3·C4 白相 / C6 #fff 24%）', () => {
  const dark = darkBlock()
  assert.match(dark, /--ow-panel-bg:\s*color-mix\(in srgb, var\(--dsw-alias-bg-base, Canvas\), white 3\.5%\)/, 'C1 暗=white 3.5%')
  assert.match(dark, /--ow-shell-bg:\s*color-mix\(in srgb, var\(--dsw-alias-bg-base, Canvas\), black 22%\)/, 'C2 暗=black 22%')
  assert.match(dark, /--ow-accent-text:\s*var\(--dsw-alias-state-business-primary, Highlight\)/, 'C8 暗=直用 token')
  assert.match(dark, /--ow-shadow-card:\s*0 1px 3px color-mix\(in srgb, var\(--dsw-alias-label-primary, CanvasText\), transparent 92%\)/, 'C4 暗=白相微光（dir-c-dark.png 像素采样）')
  assert.match(dark, /--ow-shadow-btn:\s*0 1px 1px color-mix\(in srgb, var\(--dsw-alias-label-primary, CanvasText\), transparent 92%\)/, 'C4 暗按钮=白相微光')
  assert.match(dark, /--ow-highlight-top:\s*inset 0 1px 0 color-mix\(in srgb, var\(--dsw-alias-label-primary, CanvasText\), transparent 93%\)/, 'C3 暗=label-primary 内高光')
  assert.match(dark, /--ow-chip-saved-bg:\s*color-mix\(in srgb, var\(--dsw-alias-state-success-primary, CanvasText\), transparent 84%\)/, 'C6 暗底 84%')
  assert.match(dark, /--ow-chip-saved-fg:\s*color-mix\(in srgb, var\(--dsw-alias-state-success-primary, CanvasText\), white 24%\)/, 'C6 暗字 #fff 24%')
  assert.match(dark, /--ow-chip-dirty-bg:\s*color-mix\(in srgb, var\(--dsw-alias-state-warn-primary, ButtonBorder\), transparent 84%\)/, 'C6 dirty 暗底（三态同式）')
  assert.match(dark, /--ow-chip-dirty-fg:\s*color-mix\(in srgb, var\(--dsw-alias-state-warn-primary, ButtonBorder\), white 24%\)/, 'C6 dirty 暗字')
  assert.match(dark, /--ow-chip-conflict-bg:\s*color-mix\(in srgb, var\(--dsw-alias-state-error-primary, CanvasText\), transparent 84%\)/, 'C6 conflict 暗底（三态同式）')
  assert.match(dark, /--ow-chip-conflict-fg:\s*color-mix\(in srgb, var\(--dsw-alias-state-error-primary, CanvasText\), white 24%\)/, 'C6 conflict 暗字')
  // 派生①②③ 暗分支=直用 token（不加深，既有口径）
  assert.match(dark, /--ow-accent-solid:\s*var\(--dsw-alias-state-business-primary, Highlight\)/, '派生①暗=直用')
})

// ── ⑦ 状态面精致化锁（骨架贴版式 / 错误卡层级 / 空状态）─────────────────────────
test('状态面锁：骨架贴新字阶版式（32px 题条）、错误卡层级清晰（题 h2 档 600 + A6 淡底）、空状态 display 档', () => {
  assert.match(ruleBody('.ob-sk-title'), /height:\s*32px/, '骨架题条=页题档高度（贴版式）')
  assert.match(ruleBody('.ob-sk-code'), /border-radius:\s*var\(--ow-radius-control\)/, '骨架代码块=控件档圆角')
  const err = ruleBody('.ob-error-card')
  assert.match(err, /background:\s*var\(--ow-error-bg\)/, '错误卡=A6 同口径淡底')
  assert.match(err, /border-left:\s*3px solid var\(--dsw-alias-state-error-primary/, '错误线=左 3px error（既有形）')
  const errTitle = ruleBody('.ob-error-title')
  assert.match(errTitle, /font-size:\s*var\(--ow-fs-h2\)/, '错误题=h2 档（层级最高）')
  assert.match(errTitle, /font-weight:\s*600/, '错误题 600')
  assert.match(ruleBody('.ob-error-guidance'), /font-size:\s*var\(--dsw-font-xs-13-font-size/, '指引=13px 降噪层')
  assert.match(ruleBody('.ob-error-path'), /font-family:\s*var\(--dsw-font-markdown-code-block-font-family/, '路径=mono 层')
})

// ── ⑧ M1 树行工具位锁（ui-a-review M1 压字 → 闲置脱流/显形收回流内）───────────────
test('M1 树行工具位锁：闲置脱流/显形收回流内（按钮三档 right 硬值清零），标签独立收缩位截断', () => {
  const node = ruleBody('.ob-tree-node {')
  assert.match(node, /display:\s*flex/, '行=flex（显形工具位在流内）')
  assert.ok(!/padding-right/.test(node), '数值预留位清零（108px 预留<按钮块宽=压字根因）')
  const label = ruleBody('.ob-tree-node-label')
  assert.match(label, /flex:\s*1 1 auto/, '标签=可收缩位')
  assert.match(label, /min-width:\s*0/, '标签 min-width:0（截断而非挤压）')
  assert.match(label, /text-overflow:\s*ellipsis/, '标签超长省略号（不入按钮块）')
  const slot = ruleBody('.ob-tree-row-actions')
  assert.match(slot, /position:\s*absolute/, '闲置态脱流不占标签宽（dir-c mock 闲置行全显）')
  assert.match(slot, /opacity:\s*0/, '闲置态隐形但仍可 Tab 聚焦（零 display:none）')
  assert.ok(!/display:\s*none|visibility:\s*hidden/.test(slot), '两态工具位禁 display:none/visibility:hidden 逃逸 Tab 可达（M1 两态成立性机械锁，ui-c-review F3）')
  const btns = ruleBody('.ob-tree-rename,')
  assert.ok(!/position:\s*absolute/.test(btns), '按钮无绝对定位（三档 right 硬值清零）')
  assert.ok(!/right:/.test(btns), '按钮无 right 硬值残留')
  assert.match(btns, /flex:\s*none/, '按钮块不收缩（宽=按钮块宽）')
  // 显形面：hover / 键盘聚焦 / 当前项三态 → 收回流内（工具位宽≡按钮块宽=预留位≥按钮块宽由构造成立）
  assert.match(
    NOCOMMENT,
    /\.ob-tree-node:hover \.ob-tree-row-actions,[\s\S]*?\.ob-tree-node:focus-within \.ob-tree-row-actions,[\s\S]*?\.ob-tree \.el-tree-node\.is-current \.ob-tree-row-actions \{[^}]*position:\s*static[^}]*margin-left:\s*auto[^}]*opacity:\s*1/,
    'hover/聚焦/当前三态显形并收回流内（永不压字）',
  )
})

// ── ⑨ C1-C8 派生式注释锁（红线：C1-C8 派生式逐条注释，暗分支独立推导）────────────
test('C1-C8 派生式注释锁：推导式逐条在场（含暗分支），与声明值同源', () => {
  for (const [tag, formula] of [
    ['C1', 'C1 面板底 = color-mix(bg-base, white 3.5%)（暗）/ bg-base（明）'],
    ['C2', 'C2 外壳底 = color-mix(bg-base, black 22%)（暗）/ color-mix(bg-base, black 2.5%)（明）'],
    ['C3', 'C3 面板内高光 = inset 0 1px 0 color-mix(label-primary, transparent 93%)（暗）'],
    ['C4', 'C4 卡片同相阴影 = 0 1px 3px color-mix(label-primary, transparent 92%)'],
    ['C5', 'C5 主色淡底 = color-mix(business-primary, transparent 88%)'],
    ['C6', 'C6 徽标语义底 = color-mix(semantic, transparent 88%)（明）/ 84%（暗）'],
    ['C7', 'C7 焦点光晕 = 0 0 0 4px color-mix(business-primary, transparent 86%)'],
    ['C8', 'C8 accent 文字安全色 = color-mix(business-primary, #000 15%)（明）/ business-primary（暗）'],
  ]) {
    assert.ok(STYLES.includes(formula), `缺 ${tag} 派生式注释：${formula}`)
  }
  assert.ok(STYLES.includes('C1-C8'), '头注标注派生族 C1-C8')
})
