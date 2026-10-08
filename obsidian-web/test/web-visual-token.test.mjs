// UI-A 视觉 token 锁（方向 a「苹果风精致文档」，用户裁定 2026-10-06「切换为 ui-a-impl 版本」——
// 0.2.3 的 dir-c-light 视觉效果不合意；视觉正本=dir-a-apple-doc.html + dir-a-light.png（渲染正本）/
// dir-a-dark.png（暗态参照），设计说明=reports/ui-visual-2/README.md A 节；
// mock→实现映射=reports/ui-a-impl.md，C→A 回切逐项对照=reports/ui-a2-impl.md）：
//   ① 字阶锁：大字阶对比（页题 ×2.0=32px 对正文 + 600/-0.02em/1.28）+ h2 发丝线节奏 + 大纲小字距标签；
//   ② 间距锁：4/8 间距刻度逐值 + 阅读头网格排版（动作右上工具位）+ 克制留白 38px 56px 18px + meta ·分隔；
//   ③ 圆角锁：两档 token 同源（radius-sm 8px 控件 / radius-xs 4px 行内），胶囊只给状态徽标；
//   ④ 控件细节锁：按钮内高光（A5）+ 同色相轻阴影（A3）+ 按下 0.5px 位移 + 幽灵档纯平 + 焦点环（dir-a 无光晕）；
//   ⑤ 派生色 AA 比值复测（脚本算比值，明暗双态逐对 ≥4.5:1）：dir-a A1-A7 + 既有派生①②③；
//   ⑥ 明暗双态独立推导锁（暗分支独立推导：A1 white 3% / A5 label-primary 92% / A3 黑轴 55% / A4 #fff 24%）；
//   ⑦ 状态面锁：骨架贴版式（32px 题条）/ 错误卡层级 / 空状态 display 档；
//   ⑧ M1 树行工具位锁：闲置脱流/显形收回流内（三档 right 硬值与数值预留清零）；
//   ⑨ A1-A7 派生式注释锁（推导式逐条在场=红线「A1-A7 派生式逐条注释」机械面）；
//   ⑩ 窄屏横向溢出治理锁（ui-responsive-audit G-1 blocker / G-2 major / G-3 major 机械面）。
// 纪律：既有测试零弱化（本文件视觉锁值按 A 定稿同强度回切更新，断言只增不删），
// 派生色一律 color-mix 单向推导自 dsh token（非第二套色板）。
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

test('字阶锁：页题 ×2.0 大字阶对比 + 600/-0.02em/1.28（dir-a 32px 页题形），派生内容字号轴', () => {
  const title = ruleBody('.ob-note-title')
  assert.match(title, /font-size:\s*var\(--ow-fs-page\)/, '页题消费 ×2.0 档')
  assert.match(title, /font-weight:\s*600/, '页题字重 600（mock 同款，非 700）')
  assert.match(title, /letter-spacing:\s*-0\.02em/, '页题字距 -0.02em（mock 逐值）')
  assert.match(title, /line-height:\s*1\.28;/, '页题行高 1.28（mock 逐值）')
  assert.match(title, /max-width:\s*640px/, '页题 max-width 640px（mock 逐值=阅读栏同宽）')
  const ratio = axisRatio('--ow-fs-page') // 页题/正文 档比（dir-a 32/16=2.0）
  assert.ok(Math.abs(ratio - 2) < 0.001, `页题档比=dir-a 32/16=2.0（实解析 ${ratio}）`)
  assert.ok(ratio >= 1.9, `大字阶对比：页题/正文 ≥1.9 档比（实 ${ratio}）`)
  const h2Ratio = axisRatio('--ow-fs-h2')
  assert.ok(Math.abs(h2Ratio - 1.2) < 0.001, `h2 档比=dir-a 19/15.5≈1.2（实解析 ${h2Ratio}）`)
  assert.ok(ratio > h2Ratio, '页题档比 > h2 档比（层级对比成立）')
  const h3Ratio = axisRatio('--ow-fs-h3')
  assert.ok(Math.abs(h3Ratio - 0.95) < 0.001, `h3 档比=dir-a 15/15.5≈0.95 小字重副题（实解析 ${h3Ratio}）`)
  assert.ok(h2Ratio > h3Ratio, 'h3 档比 < h2 档比（副题层级成立）')
})

test('字阶锁：h2 发丝线节奏（margin 1.8em 0 0.75em + padding-top 20px + border-top hairline + 首节 h1/h2 全豁免）', () => {
  const h2 = ruleBody('.ob-prose h1, .ob-prose h2')
  assert.match(h2, /margin:\s*1\.8em 0 0\.75em/, 'h1/h2 间距=mock 34px 0 14px 映射')
  assert.match(h2, /padding-top:\s*20px/, 'h2 发丝线上内距=mock 20px（排印定值）')
  assert.match(h2, /border-top:\s*1px solid var\(--dsw-alias-border-l1/, 'h2 前发丝线=border-l1')
  assert.match(h2, /letter-spacing:\s*-0\.015em/, 'h2 字距=mock -0.015em')
  assert.match(h2, /font-weight:\s*600/, 'h2 字重 600（dir-a .prose h2）')
  // ui-a-review m3 保真：首节豁免含 h1:first-child（正文以 # 开头=首元素 h1），且豁免含发丝线本体
  const first = ruleBody('.ob-prose h1:first-child,')
  assert.match(first, /margin-top:\s*6px/, '首节贴阅读头（mock 6px）')
  assert.match(first, /padding-top:\s*0/, '首节无发丝线上内距')
  assert.match(first, /border-top:\s*0/, '首节无悬空发丝线（m3：h1/h2 同档全豁免）')
  const h3 = ruleBody('.ob-prose h3')
  assert.match(h3, /margin:\s*1\.4em 0 0\.45em/, 'h3 间距=mock 22px 0 8px 映射')
  assert.match(h3, /font-weight:\s*600/, 'h3 字重 600（dir-a .prose h3）')
  assert.match(h3, /letter-spacing:\s*-0\.01em/, 'h3 字距 -0.01em（mock）')
})

test('字阶锁：面板题=h3 档题面（mock 文档头），大纲题=小字距标签 0.1em（mock .toc-title），空状态 display 档 600/-0.02em', () => {
  const pane = ruleBody('.ob-pane-title')
  assert.match(pane, /font-size:\s*var\(--ow-fs-h3\)/, '面板题=h3 档（dir-a 文档头题面；panel-bar 11.5px 退场）')
  assert.match(pane, /font-weight:\s*600/, '面板题 600')
  assert.match(pane, /letter-spacing:\s*-0\.01em/, '面板题 -0.01em（mock h3 字距）')
  const toc = ruleBody('.ob-toc-title')
  assert.match(toc, /letter-spacing:\s*0\.1em/, '大纲题字距 0.1em（mock .toc-title）')
  assert.match(toc, /font-weight:\s*600/, '大纲题 600')
  assert.match(toc, /padding:\s*0 8px/, '大纲题 0 8px 内距（mock .toc-title）')
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

test('阅读头网格排版（dir-a .head-top）：路径左/动作右上工具位，元素零变化纯排版；窄屏逐区块退化', () => {
  const head = ruleBody('.ob-note-head')
  assert.match(head, /grid-template-areas:/, '阅读头=网格排版')
  assert.match(head, /'top acts'/, '首行=路径左 + 动作右上（mock .head-top）')
  assert.match(head, /'title title'/, '页题独占行')
  assert.match(head, /'meta meta'/, '元信息独占行')
  assert.ok(!/border-bottom/.test(head), '阅读头零发丝分隔（dir-a .note-head 无 border-bottom——C 波全卡宽发丝退场）')
  const acts = ruleBody('.ob-note-acts')
  assert.match(acts, /grid-area:\s*acts/, '动作位=网格区')
  assert.match(acts, /justify-self:\s*end/, '动作右上贴右缘')
  const meta = ruleBody('.ob-note-meta span + span::before')
  assert.match(meta, /content:\s*'·'/, '元信息 ·分隔（mock .note-meta .it + .it::before）')
  assert.match(meta, /margin:\s*0 10px/, '·分隔间距=10px（dir-a 逐值）')
  const narrow = NOCOMMENT.slice(NOCOMMENT.indexOf('@media (max-width: 960px)'))
  assert.match(narrow, /'top'\s*'acts'\s*'title'\s*'meta'/s, '窄屏阅读头退化=逐区块显式堆叠')
  assert.match(narrow, /justify-self:\s*start/, '窄屏动作位退到路径行下方左对齐（逐区块显式）')
})

test('间距锁：阅读头克制留白（mock 38px 56px 18px 排印定值）+ 树/大纲呼吸位（mock tree 18px 12px / toc 20px 12px）', () => {
  assert.match(ruleBody('.ob-note-head'), /padding:\s*38px 56px 18px/, '阅读头留白=mock .note-head 38px 56px 18px')
  assert.match(ruleBody('.ob-tree {'), /padding:\s*18px 12px/, '树呼吸位=mock .tree 18px 12px')
  assert.match(ruleBody('.ob-toc {'), /padding:\s*20px 12px/, '大纲呼吸位=mock .toc 20px 12px')
  assert.match(ruleBody('.ob-menu {'), /padding:\s*16px 10px/, '菜单轨呼吸位=mock .menu 16px 10px')
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
test('控件细节锁：按钮 1px 微影 + 内高光（A5）、主档同相影（A3）、按下 0.5px、幽灵档纯平、行内件微影', () => {
  const btn = ruleBody('.el-button')
  assert.match(btn, /box-shadow:\s*var\(--ow-shadow-btn\), var\(--ow-highlight-top\)/, '按钮=微影+内高光（A5）')
  assert.match(btn, /font-size:\s*var\(--dsw-font-xs-13-font-size/, '按钮 13px 字面（mock .btn）')
  assert.match(btn, /font-weight:\s*500/, '按钮 500 字重（mock）')
  assert.match(ruleBody('.el-button:not(.is-disabled):active'), /translateY\(0\.5px\)/, '按下 0.5px 位移（mock .btn:active）')
  const primary = ruleBody('.el-button.el-button--primary')
  assert.match(primary, /box-shadow:\s*var\(--ow-shadow-accent\)/, '主档=同色相轻影（A3）')
  assert.match(primary, /font-weight:\s*600/, '主档 600 字重（mock .btn-primary）')
  assert.match(ruleBody('.el-button.ob-btn-ghost'), /box-shadow:\s*none/, '幽灵档纯平')
  assert.match(ruleBody('.ob-tree-rename,'), /box-shadow:\s*var\(--ow-shadow-btn\)/, '树行内操作=中性微影（mock .row-btn 1px 微影）')
  // 阴影/高光推导式落码（轻且同色相，非第二套色板）
  assert.match(STYLES, /--ow-shadow-btn:\s*0 1px 1px color-mix\(in srgb, var\(--dsw-alias-label-primary, CanvasText\), transparent 94%\)/, 'A3 行内件/按钮微影推导式')
  assert.match(STYLES, /--ow-shadow-accent:\s*0 1px 2px color-mix\(in srgb, var\(--dsw-alias-state-business-primary, Highlight\), transparent 72%\)/, 'A3 主档同相影推导式（mock .btn-primary 72%）')
  assert.match(STYLES, /--ow-highlight-top:\s*inset 0 1px 0 color-mix\(in srgb, var\(--dsw-alias-bg-base, Canvas\), transparent 45%\)/, 'A5 内高光推导式（mock .btn 45%）')
  assert.match(STYLES, /--ow-highlight-soft:\s*inset 0 1px 0 color-mix\(in srgb, var\(--dsw-alias-label-primary, CanvasText\), transparent 94%\)/, '代码块顶缘内高光推导式（mock 94%）')
})

test('控件细节锁：单一克制强调色消费面=A2 选中淡底（树选中/菜单当前）+ 焦点环（dir-a 无光晕）+ 主按钮', () => {
  assert.match(STYLES, /--ow-accent-tint:\s*color-mix\(in srgb, var\(--dsw-alias-state-business-primary, Highlight\), transparent 88%\)/, 'A2 淡底推导式')
  assert.match(ruleBody('.ob-tree .el-tree-node.is-current'), /background:\s*var\(--ow-accent-tint\)/, '树选中=A2 淡底（mock aria-current）')
  assert.ok(!/box-shadow/.test(ruleBody('.ob-tree .el-tree-node.is-current')), '树选中零内描边（dir-a aria-current 逐值——C 波内描边退场）')
  assert.match(ruleBody('.ob-menu .el-menu-item.is-active'), /background:\s*var\(--ow-accent-tint\)/, '菜单当前项=A2 淡底')
  assert.match(ruleBody('.ob-menu .el-menu-item.is-active'), /color:\s*var\(--ow-accent-text\)/, '菜单当前项=A7 文字')
  assert.match(ruleBody(':focus-visible'), /outline:\s*2px solid var\(--dsw-alias-state-business-primary/, '焦点环主色 2px')
  assert.ok(!/box-shadow/.test(ruleBody(':focus-visible')), '焦点环零柔光圈（dir-a :focus-visible 逐值——C7 光晕退场）')
})

// ── ⑤ 派生色 AA 比值复测（脚本算比值；推导式与声明逐值同）──────────────────────
test('派生色推导式落码（dir-a A1/A2/A4/A5/A6/A7 + 错误卡保留面）：声明=color-mix 逐值，非第二套色板', () => {
  assert.match(STYLES, /--ow-side-bg:\s*color-mix\(in srgb, var\(--dsw-alias-bg-base, Canvas\), black 2\.5%\)/, 'A1 明=side-bg（侧栏底）')
  assert.match(STYLES, /--ow-accent-tint:\s*color-mix\(in srgb, var\(--dsw-alias-state-business-primary, Highlight\), transparent 88%\)/, 'A2 明=主色淡底')
  assert.match(STYLES, /--ow-shadow-accent:\s*0 1px 2px color-mix\(in srgb, var\(--dsw-alias-state-business-primary, Highlight\), transparent 72%\)/, 'A3 明=同相轻影')
  assert.match(STYLES, /--ow-highlight-top:\s*inset 0 1px 0 color-mix\(in srgb, var\(--dsw-alias-bg-base, Canvas\), transparent 45%\)/, 'A5 明=按钮内高光 45%')
  assert.match(STYLES, /--ow-quote-bg:\s*color-mix\(in srgb, var\(--dsw-alias-label-primary, CanvasText\), transparent 96%\)/, 'A6 明=引文淡底 96%')
  assert.match(STYLES, /--ow-accent-text:\s*color-mix\(in srgb, var\(--dsw-alias-state-business-primary, Highlight\), black 15%\)/, 'A7 明')
  assert.match(STYLES, /--ow-error-bg:\s*color-mix\(in srgb, var\(--dsw-alias-state-error-primary, CanvasText\), transparent 96%\)/, '错误卡淡底（A4 error 保留面）')
  assert.match(STYLES, /--ow-chip-saved-bg:\s*color-mix\(in srgb, var\(--dsw-alias-state-success-primary, CanvasText\), transparent 88%\)/, 'A4 底明')
  assert.match(STYLES, /--ow-chip-saved-fg:\s*color-mix\(in srgb, var\(--dsw-alias-state-success-primary, CanvasText\), black 40%\)/, 'A4 字明')
  assert.match(STYLES, /--ow-chip-dirty-bg:\s*color-mix\(in srgb, var\(--dsw-alias-state-warn-primary, ButtonBorder\), transparent 88%\)/, 'A4 dirty 底明（三态同式）')
  assert.match(STYLES, /--ow-chip-dirty-fg:\s*color-mix\(in srgb, var\(--dsw-alias-state-warn-primary, ButtonBorder\), black 40%\)/, 'A4 dirty 字明')
  assert.match(STYLES, /--ow-chip-conflict-bg:\s*color-mix\(in srgb, var\(--dsw-alias-state-error-primary, CanvasText\), transparent 88%\)/, 'A4 conflict 底明')
  assert.match(STYLES, /--ow-chip-conflict-fg:\s*color-mix\(in srgb, var\(--dsw-alias-state-error-primary, CanvasText\), black 40%\)/, 'A4 conflict 字明')
})

test('派生色比值复测·明态：A1/A2/A4/A6/A7 + 派生①②③ 逐对 ≥AA 4.5:1（合成底口径）', () => {
  const bg = L['--dsw-alias-bg-base']
  const docBg = bg // 文档面（A 分栏下正文底=bg-base）
  const sideBg = mixAxis(bg, 'black', 0.025) // A1 明侧栏底
  const accentText = mixAxis(L['--dsw-alias-state-business-primary'], 'black', 0.15)
  assert.equal(accentText, '#3764c4', 'A7 派生值=推导值')
  // A2 淡底叠于侧栏底（树/菜单当前项都在侧栏面上）
  const accentTint = tintOver(L['--dsw-alias-state-business-primary'], sideBg, 0.12)
  const codeBg = L['--dsw-alias-markdown-code-block']
  // A6 引文淡底 = color-mix(label-primary, transparent 96%) over 文档面
  const quoteBg = tintOver(L['--dsw-alias-label-primary'], docBg, 0.04)
  assert.equal(quoteBg, '#f5f5f6', 'A6 明引文淡底派生值（label-primary #0f1115 4% over #fff：B 通道 255→246）')
  const errorBg = tintOver(L['--dsw-alias-state-error-primary'], docBg, 0.04)
  const savedFg = mixAxis(L['--dsw-alias-state-success-primary'], 'black', 0.4)
  const savedBg = tintOver(L['--dsw-alias-state-success-primary'], sideBg, 0.12)
  const dirtyFg = mixAxis(L['--dsw-alias-state-warn-primary'], 'black', 0.4)
  const dirtyBg = tintOver(L['--dsw-alias-state-warn-primary'], sideBg, 0.12)
  const conflictFg = mixAxis(L['--dsw-alias-state-error-primary'], 'black', 0.4)
  const conflictBg = tintOver(L['--dsw-alias-state-error-primary'], sideBg, 0.12)
  assert.equal(savedFg, '#147638', 'A4 saved 文字派生值')
  assert.equal(dirtyFg, '#935f07', 'A4 dirty 文字派生值')
  assert.equal(conflictFg, '#8e0b0b', 'A4 conflict 文字派生值')

  const pairs = [
    ['A7 accent 字 on A2 淡底', accentText, accentTint],
    ['A7 accent 字 on 文档面', accentText, docBg],
    ['label-primary on A2 淡底', L['--dsw-alias-label-primary'], accentTint],
    ['label-secondary on A2 淡底', L['--dsw-alias-label-secondary'], accentTint],
    ['label-secondary on A1 侧栏底', L['--dsw-alias-label-secondary'], sideBg],
    ['label-primary on A1 侧栏底', L['--dsw-alias-label-primary'], sideBg],
    ['A4 saved 字/底', savedFg, savedBg],
    ['A4 dirty 字/底', dirtyFg, dirtyBg],
    ['A4 conflict 字/底', conflictFg, conflictBg],
    ['label-secondary on A6 引文底', L['--dsw-alias-label-secondary'], quoteBg],
    ['label-primary on A6 引文底', L['--dsw-alias-label-primary'], quoteBg],
    ['label-secondary on 代码块底', L['--dsw-alias-label-secondary'], codeBg],
    ['label-primary on 代码块底', L['--dsw-alias-label-primary'], codeBg],
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

test('派生色比值复测·暗态：A1/A2/A4/A6/A7 + 派生①②③ 逐对 ≥AA 4.5:1（合成底口径，暗分支独立推导）', () => {
  const bg = D['--dsw-alias-bg-base']
  const docBg = bg
  const sideBg = mixAxis(bg, 'white', 0.03) // A1 暗侧栏底
  const accentText = D['--dsw-alias-state-business-primary'] // A7 暗=直用 token
  const accentTint = tintOver(D['--dsw-alias-state-business-primary'], sideBg, 0.12)
  const quoteBg = tintOver(D['--dsw-alias-label-primary'], docBg, 0.04) // A6 暗
  assert.equal(quoteBg, '#1e1e20', 'A6 暗引文淡底派生值（label-primary #f9fafb 4% over bg-base #151517）')
  const codeBg = D['--dsw-alias-markdown-code-block']
  const errorBg = tintOver(D['--dsw-alias-state-error-primary'], docBg, 0.04)
  const savedFg = mixAxis(D['--dsw-alias-state-success-primary'], 'white', 0.24)
  const savedBg = tintOver(D['--dsw-alias-state-success-primary'], sideBg, 0.16)
  const dirtyFg = mixAxis(D['--dsw-alias-state-warn-primary'], 'white', 0.24)
  const dirtyBg = tintOver(D['--dsw-alias-state-warn-primary'], sideBg, 0.16)
  const conflictFg = mixAxis(D['--dsw-alias-state-error-primary'], 'white', 0.24)
  const conflictBg = tintOver(D['--dsw-alias-state-error-primary'], sideBg, 0.16)
  assert.equal(savedFg, '#57d385', 'A4 saved 暗文字派生值')
  assert.equal(dirtyFg, '#f7b546', 'A4 dirty 暗文字派生值')
  assert.equal(conflictFg, '#f58282', 'A4 conflict 暗文字派生值')

  const pairs = [
    ['A7 accent 字 on A2 淡底', accentText, accentTint],
    ['label-primary on A2 淡底', D['--dsw-alias-label-primary'], accentTint],
    ['label-secondary on A2 淡底', D['--dsw-alias-label-secondary'], accentTint],
    ['label-secondary on A1 侧栏底', D['--dsw-alias-label-secondary'], sideBg],
    ['label-primary on A1 侧栏底', D['--dsw-alias-label-primary'], sideBg],
    ['A4 saved 字/底', savedFg, savedBg],
    ['A4 dirty 字/底', dirtyFg, dirtyBg],
    ['A4 conflict 字/底', conflictFg, conflictBg],
    ['label-secondary on A6 引文底', D['--dsw-alias-label-secondary'], quoteBg],
    ['label-primary on A6 引文底', D['--dsw-alias-label-primary'], quoteBg],
    ['label-secondary on 代码块底', D['--dsw-alias-label-secondary'], codeBg],
    ['label-primary on 代码块底', D['--dsw-alias-label-primary'], codeBg],
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
test('明暗双态锁：暗分支逐条独立推导（A1 white 3% / A5 label-primary 92% / A3 黑轴 55% / A7 直用 / A4 #fff 24%）', () => {
  const dark = darkBlock()
  assert.match(dark, /--ow-side-bg:\s*color-mix\(in srgb, var\(--dsw-alias-bg-base, Canvas\), white 3%\)/, 'A1 暗=white 3%')
  assert.match(dark, /--ow-accent-text:\s*var\(--dsw-alias-state-business-primary, Highlight\)/, 'A7 暗=直用 token')
  assert.match(dark, /--ow-highlight-top:\s*inset 0 1px 0 color-mix\(in srgb, var\(--dsw-alias-label-primary, CanvasText\), transparent 92%\)/, 'A5 暗=label-primary 92% 内高光')
  assert.match(dark, /--ow-shadow-accent:\s*0 1px 2px color-mix\(in srgb, black, transparent 55%\)/, 'A3 暗=黑轴同相影（mock [data-theme=dark] .btn-primary 55%）')
  assert.match(dark, /--ow-chip-saved-bg:\s*color-mix\(in srgb, var\(--dsw-alias-state-success-primary, CanvasText\), transparent 84%\)/, 'A4 暗底 84%')
  assert.match(dark, /--ow-chip-saved-fg:\s*color-mix\(in srgb, var\(--dsw-alias-state-success-primary, CanvasText\), white 24%\)/, 'A4 暗字 #fff 24%')
  assert.match(dark, /--ow-chip-dirty-bg:\s*color-mix\(in srgb, var\(--dsw-alias-state-warn-primary, ButtonBorder\), transparent 84%\)/, 'A4 dirty 暗底（三态同式）')
  assert.match(dark, /--ow-chip-dirty-fg:\s*color-mix\(in srgb, var\(--dsw-alias-state-warn-primary, ButtonBorder\), white 24%\)/, 'A4 dirty 暗字')
  assert.match(dark, /--ow-chip-conflict-bg:\s*color-mix\(in srgb, var\(--dsw-alias-state-error-primary, CanvasText\), transparent 84%\)/, 'A4 conflict 暗底（三态同式）')
  assert.match(dark, /--ow-chip-conflict-fg:\s*color-mix\(in srgb, var\(--dsw-alias-state-error-primary, CanvasText\), white 24%\)/, 'A4 conflict 暗字')
  // 派生①②③ 暗分支=直用 token（不加深，既有口径）
  assert.match(dark, /--ow-accent-solid:\s*var\(--dsw-alias-state-business-primary, Highlight\)/, '派生①暗=直用')
})

// ── ⑦ 状态面精致化锁（骨架贴版式 / 错误卡层级 / 空状态）─────────────────────────
test('状态面锁：骨架贴新字阶版式（32px 题条）、错误卡层级清晰（题 h2 档 600 + A4 淡底）、空状态 display 档', () => {
  assert.match(ruleBody('.ob-sk-title'), /height:\s*32px/, '骨架题条=页题档高度（贴版式）')
  assert.match(ruleBody('.ob-sk-code'), /border-radius:\s*var\(--ow-radius-control\)/, '骨架代码块=控件档圆角')
  const err = ruleBody('.ob-error-card')
  assert.match(err, /background:\s*var\(--ow-error-bg\)/, '错误卡=A4 error 保留面淡底')
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

// ── ⑩ 窄屏横向溢出治理锁（ui-responsive-audit G-1/G-2/G-3 同批修，防回退）──────────
test('溢出治理锁 G-1：长代码块/长链接不撑破阅读列（pre code 自身滚动 + prose 断行 + center 隔离）', () => {
  // 根因：pre{overflow:auto} 只让自己可滚，内层 code 仍以固有宽度参与祖先 scrollWidth
  // （390px 实测 .ob-center scrollWidth=1701/clientWidth=296，scrollLeft=300 时阅读头左缘 -219px）
  const preCode = ruleBody('.ob-prose pre code')
  assert.match(preCode, /display:\s*block/, 'pre>code 块级化（不再以内联固有宽撑破祖先）')
  assert.match(preCode, /overflow-x:\s*auto/, 'pre>code 自身横向可滚（长代码在 pre 内滚）')
  const pre = ruleBody('.ob-prose pre')
  assert.match(pre, /max-width:\s*100%/, 'pre 不被内层内容顶宽')
  const prose = ruleBody('.ob-prose {')
  assert.match(prose, /min-width:\s*0/, '.ob-prose 可收缩（grid/flex 子项）')
  assert.match(prose, /overflow-wrap:\s*break-word/, '.ob-prose 超长串断行')
  assert.match(ruleBody('.ob-prose a'), /word-break:\s*break-word/, '链接超长串断行（审计 offender：a）')
  assert.match(ruleBody('.ob-center {'), /overflow-x:\s*hidden/, '阅读列横向隔离兜底')
})

test('溢出治理锁 G-2/G-3：窄屏菜单标签单行省略号（零裁切）+ 表格自身横向滚动（末列可达）', () => {
  const narrow = NOCOMMENT.slice(NOCOMMENT.indexOf('@media (max-width: 960px)'))
  const menu = /\.ob-menu \.el-menu-item \{([^}]*)\}/.exec(narrow)
  assert.ok(menu, '窄屏块内菜单项规则存在')
  assert.match(menu[1], /white-space:\s*nowrap/, 'G-2：窄屏菜单标签单行（换行后被 height:36px 裁切=缺陷）')
  assert.match(menu[1], /overflow:\s*hidden/, 'G-2：溢出隐藏')
  assert.match(menu[1], /text-overflow:\s*ellipsis/, 'G-2：超长省略号（标签可读，元素文案不变）')
  const table = ruleBody('.ob-prose table')
  assert.match(table, /display:\s*block/, 'G-3：表格块级化（承载横向滚动容器）')
  assert.match(table, /overflow-x:\s*auto/, 'G-3：表格自身横向可滚（320px 末列可达）')
  assert.match(table, /width:\s*100%/, 'G-3 修后表格仍占满列宽（语义不变）')
})

// ── ⑪ 自适应缺口锁（ui-responsive-audit G-4 major / G-7 minor / G-8 minor 同批修，防回退）──
test('G-4 锁：el-table 内部表格脱离正文排印口径（布局契约复位 + 面板根可收缩）', () => {
  // 根因（2026-10-08 真渲染实测，非静态推断）：G-3 的 `.ob-prose table { display:block; overflow-x:auto }`
  // 是裸 table 选择器，SharePanel/VaultProfilesPanel 根节点正是 `class="ob-prose ob-share"`/
  // `ob-vault-profiles`，el-table 内部两表（.el-table__header/.el-table__body）被卷进正文口径：
  // computed display 由 table→block、table-layout:fixed 被自家滚动盒遮蔽，且 overflow-x:auto 造出的
  // 新滚动盒改变了自身 scrollWidth 测量结果 → el-table 的 scrollX 判据失真。
  const NOEL = NOCOMMENT
  // ① 正文表格规则必须排除 el-table 内部两表（作用域收窄，规则体 G-3 语义逐条保留=零弱化）
  assert.match(
    NOEL,
    /\.ob-prose > table,\s*\.ob-prose table:not\(\.el-table__header\):not\(\.el-table__body\)\s*\{/,
    'G-4：正文表格规则显式排除 el-table 内部两表（裸 table 选择器会把 el-table 卷进正文口径）',
  )
  // ② el-table 内部两表布局契约复位（display:table + table-layout:fixed + overflow:visible）
  for (const sel of ['.ob-prose .el-table__header,', '.ob-prose .el-table__body']) {
    assert.ok(NOEL.includes(sel), `G-4：缺 el-table 复位选择器 ${sel}`)
  }
  const reset = /\.ob-prose \.el-table__header,\s*\.ob-prose \.el-table__body \{([^}]*)\}/.exec(NOEL)
  assert.ok(reset, 'G-4：el-table 内部两表复位规则存在')
  assert.match(reset[1], /display:\s*table/, 'G-4：内部表复位为 table（el-table 布局契约，非块级滚动盒）')
  assert.match(reset[1], /table-layout:\s*fixed/, 'G-4：table-layout:fixed 复位（列宽由 <col> 决定）')
  assert.match(reset[1], /overflow:\s*visible/, 'G-4：内部表不再自造滚动盒（scrollWidth 测量不被改写）')
  // ③ 两个面板根可收缩（横向滚动落在表格自身，不把整页撑宽）
  const panelRoots = /\.ob-prose\.ob-share,\s*\.ob-prose\.ob-vault-profiles \{([^}]*)\}/.exec(NOEL)
  assert.ok(panelRoots, 'G-4：分享/vault 面板根规则存在')
  assert.match(panelRoots[1], /min-width:\s*0/, 'G-4：面板根可收缩（grid/flex 子项）')
  assert.match(panelRoots[1], /max-width:\s*100%/, 'G-4：面板根不超容器宽（横向滚动落表格自身）')
  // ④ 锁形：不得回退成裸 table 选择器（未来改选择器作用域必被此条拦下）
  assert.ok(
    !/\.ob-prose table \{[^}]*display:\s*block/.test(NOEL),
    'G-4：禁止回退为裸 `.ob-prose table` 块级化（会把 el-table 内部表一并卷进正文口径）',
  )
})

test('G-7 锁：@media print 打印适配（长笔记跨页 + chrome 全隐 + 分页友好）', () => {
  const printAt = NOCOMMENT.indexOf('@media print')
  assert.ok(printAt >= 0, 'G-7：缺 @media print 块（审计实测：零 @media print = 长笔记被截在一屏）')
  const print = blockBody(printAt)
  // ① 根因修复：解链视口高度 → 文档按内容自然流（跨页）
  const shell = /\.ob-shell \{([^}]*)\}/.exec(print)
  assert.ok(shell, 'G-7：print 块内 .ob-shell 规则存在')
  assert.match(shell[1], /height:\s*auto/, 'G-7：外壳高度自适应（100vh 是「截在一屏」的根因）')
  assert.match(shell[1], /overflow:\s*visible/, 'G-7：外壳不再裁切（overflow:hidden 会吞掉跨页内容）')
  assert.match(shell[1], /display:\s*block/, 'G-7：打印面单栏（四区网格无意义）')
  // ② 交互 chrome 全隐（可读性优先）
  assert.match(
    print,
    /\.ob-menu,[\s\S]*?\.ob-tree,[\s\S]*?\.ob-toc,[\s\S]*?\.ob-drawer-toggle,[^}]*display:\s*none/,
    'G-7：菜单轨/目录树/大纲/抽屉开关打印面隐藏',
  )
  // ③ 正文放开（纸宽折行）
  const prose = /\.ob-prose \{([^}]*)\}/.exec(print)
  assert.match(prose[1], /max-width:\s*none/, 'G-7：正文不限宽（按纸宽自动折行）')
  const centerPrint = /\.ob-center \{([^}]*)\}/.exec(print)
  assert.match(centerPrint[1], /overflow:\s*visible/, 'G-7：中央列放开裁剪')
  // ④ 分页友好：标题/表格行不被跨页腰斩（WCAG/纸面可读性）
  assert.match(print, /break-inside:\s*avoid/, 'G-7：块级内容避免跨页腰斩')
  assert.match(print, /page-break-inside:\s*avoid/, 'G-7：分页兼容写法（break-inside 老引擎兜底）')
})

test('G-8 锁：@media (prefers-reduced-motion: reduce) 动效收敛（WCAG 2.3.3）', () => {
  const rmAt = NOCOMMENT.indexOf('@media (prefers-reduced-motion: reduce)')
  assert.ok(rmAt >= 0, 'G-8：缺 reduced-motion 块（审计实测：17 处 transition 在 reduce 下仍生效）')
  const rm = blockBody(rmAt)
  // ① 全元素收敛（审计实测修前 0.3s 不变 → 修后 0.00001s）
  assert.match(rm, /transition-duration:\s*0\.01ms\s*!important/, 'G-8：transition 时长收敛（状态变化保留，只去时长）')
  assert.match(rm, /animation-duration:\s*0\.01ms\s*!important/, 'G-8：animation 时长收敛')
  assert.match(rm, /animation-iteration-count:\s*1\s*!important/, 'G-8：无限动画不再循环')
  // ② 通配三态（伪元素一并覆盖）
  assert.match(rm, /\*::before/, 'G-8：覆盖 ::before')
  assert.match(rm, /\*::after/, 'G-8：覆盖 ::after')
  // ③ 零弱化校验：不得用 transition:none（会连带改 transition-property 造成样式回退面）
  assert.ok(!/transition:\s*none/.test(rm), 'G-8：禁 transition:none（改 property 会引入回退面）')
})

// ── ⑨ A1-A7 派生式注释锁（红线：A1-A7 派生式逐条注释，暗分支独立推导）────────────
test('A1-A7 派生式注释锁：推导式逐条在场（含暗分支），与声明值同源', () => {
  for (const [tag, formula] of [
    ['A1', 'A1 侧栏底（菜单轨/树/大纲同底）= color-mix(bg-base, black 2.5%)（明）/ color-mix(bg-base, white 3%)（暗）'],
    ['A2', 'A2 主色淡底 = color-mix(business-primary, transparent 88%)'],
    ['A3', 'A3 同色相轻影 = 0 1px 2px color-mix(business-primary, transparent 72%)'],
    ['A4', 'A4 徽标语义底 = color-mix(semantic, transparent 88%)（明）/ 84%（暗）'],
    ['A5', 'A5 按钮内高光 = inset 0 1px 0 color-mix(bg-base, transparent 45%)（明）'],
    ['A6', 'A6 引文淡底 = color-mix(label-primary, transparent 96%)'],
    ['A7', 'A7 accent 文字安全色 = color-mix(business-primary, black 15%)（明）/ business-primary（暗）'],
  ]) {
    assert.ok(STYLES.includes(formula), `缺 ${tag} 派生式注释：${formula}`)
  }
  assert.ok(STYLES.includes('A1-A7'), '头注标注派生族 A1-A7')
  // C 波派生族退场（零残留：C1-C8 消费面与声明同步清除）
  for (const gone of ['--ow-panel-bg', '--ow-shell-bg', '--ow-ring-accent', '--ow-glow-focus', 'C1 面板底', 'C2 外壳底', 'C5 主色淡底', 'C6 徽标语义底', 'C7 焦点光晕', 'C8 accent 文字安全色']) {
    assert.ok(!STYLES.includes(gone), `C 波残留未清：${gone}`)
  }
})
