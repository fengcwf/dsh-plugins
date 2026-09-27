// 构图与 token 纪律锁（T13 / TECH §3.10 构图定稿 + §3.9 主题跟随 + ARC-5/ARC-6）
//   ① 构图布局锁：三栏 300/阅读/248 常量（web/src/lib/layout.js 单源）与 styles.css --ow-* 双向一致
//      + 响应式退化逐区块显式（窄屏：树→抽屉、TOC→抽屉、分屏→单栏、工具栏→compact）。
//   ⑥ token 跟随：零自造色板（声明值零色值字面量）+ 消费的 --dsw-* 全是真 token（快照中有值）
//      + 阅读字阶派生 --dsh-content-font-size（display ×1.6 / 阅读 ×1 / caption ×0.75）。
//   ARC-6：单文件组件 ≤300 行；重交互件（el-dialog/el-popconfirm/el-tree-v2/el-table/textarea）禁 v-if。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LAYOUT, BREAKPOINTS, layoutMode, responsivePlan } from '../web/src/lib/layout.js'
import { SHARE_TOKEN_SNAPSHOT } from '../lib/share-theme.js'

const WEB_SRC = fileURLToPath(new URL('../web/src', import.meta.url))
const STYLES_PATH = path.join(WEB_SRC, 'styles.css')
const stylesCss = fs.readFileSync(STYLES_PATH, 'utf8')

function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(abs))
    else out.push(abs)
  }
  return out
}

/** 剥注释；.vue 只取 <style> 块（模板内 :style 是 JS 表达式不在管辖面） */
function cssSources(abs) {
  const raw = fs.readFileSync(abs, 'utf8')
  if (!abs.endsWith('.vue')) return [raw]
  return [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1])
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')

/** 规则体内的声明对（prop, value）——只看 {} 内部，天然避开 #app 选择器误判 */
function declarations(cssText) {
  const out = []
  for (const m of stripComments(cssText).matchAll(/\{([^{}]*)\}/g)) {
    for (const d of m[1].split(';')) {
      const i = d.indexOf(':')
      if (i > 0) out.push([d.slice(0, i).trim(), d.slice(i + 1).trim()])
    }
  }
  return out
}

function mediaBlock(cssText, query) {
  const at = cssText.indexOf(query)
  if (at < 0) return null
  const open = cssText.indexOf('{', at)
  let depth = 0
  for (let i = open; i < cssText.length; i += 1) {
    if (cssText[i] === '{') depth += 1
    else if (cssText[i] === '}') {
      depth -= 1
      if (depth === 0) return cssText.slice(open + 1, i)
    }
  }
  return null
}

// ── ① 构图布局锁：常量 ↔ CSS --ow-* 双向一致 ──────────────────────────────────
test('构图锁：三栏常量 300/248（树/TOC）+菜单轨 72 是唯一源，styles.css --ow-* 逐值同', () => {
  assert.equal(LAYOUT.treeWidth, 300, '树列 300px（TECH §3.10.1 终态）')
  assert.equal(LAYOUT.tocWidth, 248, 'TOC 列 248px（TECH §3.10.1 终态）')
  assert.equal(LAYOUT.menuWidth, 72, '菜单轨 72px')
  const root = declarations(stylesCss)
  const varValue = (name) => {
    const hit = root.find(([p]) => p === name)
    assert.ok(hit, `styles.css :root 缺 ${name}`)
    return hit[1]
  }
  assert.equal(varValue('--ow-tree-width'), `${LAYOUT.treeWidth}px`)
  assert.equal(varValue('--ow-toc-width'), `${LAYOUT.tocWidth}px`)
  assert.equal(varValue('--ow-menu-width'), `${LAYOUT.menuWidth}px`)
  // 消费面锁：.ob-shell 网格必须吃这两个变量（而不是字面量）
  const shellRule = /\.(ob-shell)[^{}]*\{([^{}]*)\}/.exec(stylesCss)
  assert.ok(shellRule, 'styles.css 缺 .ob-shell 规则')
  assert.match(shellRule[2], /var\(--ow-tree-width\)/, '.ob-shell 消费 --ow-tree-width')
  assert.match(shellRule[2], /var\(--ow-toc-width\)/, '.ob-shell 消费 --ow-toc-width')
})

// ── ① 响应式退化：断点常量 ↔ media query ↔ 逐区块退化声明 ─────────────────────
test('响应式退化：narrow 断点常量与 CSS media query 一致；layoutMode 边界恰在断点', () => {
  assert.equal(BREAKPOINTS.narrowMaxWidth, 960, '窄屏断点 960px')
  const query = `@media (max-width: ${BREAKPOINTS.narrowMaxWidth}px)`
  assert.ok(stylesCss.includes(query), `styles.css 缺 ${query} 退化块`)
  assert.equal(layoutMode(BREAKPOINTS.narrowMaxWidth), 'narrow', '断点本身=窄屏（max-width 含端点）')
  assert.equal(layoutMode(BREAKPOINTS.narrowMaxWidth + 0.5), 'wide')
  assert.equal(layoutMode(360), 'narrow')
})

test('响应式退化：逐区块显式（树=drawer、TOC=drawer、分屏=单栏、工具栏=compact）纯函数与 CSS 双锁', () => {
  assert.deepEqual(responsivePlan('wide'), {
    tree: 'column', toc: 'column', editor: 'split', toolbar: 'full',
  })
  assert.deepEqual(responsivePlan('narrow'), {
    tree: 'drawer', toc: 'drawer', editor: 'single-column', toolbar: 'compact',
  })
  const query = `@media (max-width: ${BREAKPOINTS.narrowMaxWidth}px)`
  const block = mediaBlock(stylesCss, query)
  assert.ok(block, `styles.css 缺 ${query} 块`)
  const plan = responsivePlan('narrow')
  const evidence = {
    '树→抽屉': [plan.tree === 'drawer', /\.ob-tree\[[^\]]*\]\s*\{/, /max-height|transform|position:\s*fixed/],
    'TOC→抽屉': [plan.toc === 'drawer', /\.ob-toc\[[^\]]*\]\s*\{/, /max-height|transform|position:\s*fixed/],
    '分屏→单栏': [plan.editor === 'single-column', /\.ob-editor-split[^{}]*\{[^{}]*flex-direction:\s*column/],
    '工具栏→compact': [plan.toolbar === 'compact', /\.ob-editor-toolbar[^{}]*\{[^{}]*(flex-wrap|overflow)/],
  }
  for (const [label, [flag, ...res]] of Object.entries(evidence)) {
    assert.ok(flag, `responsivePlan('narrow') 未给 ${label} 退化值`)
    for (const re of res) assert.match(block, re, `${query} 块缺 ${label} 落地声明（${re}）`)
  }
})

// ── ⑥ token 跟随：零自造色板 + 真 token + 字阶轴 ──────────────────────────────
test('token 跟随：web/src 声明值零色值字面量（hex/rgb/hsl/oklch 零命中——禁自造色板 ARC-5）', () => {
  const offenders = []
  for (const abs of walk(WEB_SRC)) {
    if (!/\.(css|vue)$/.test(abs)) continue
    for (const src of cssSources(abs)) {
      for (const [prop, value] of declarations(src)) {
        if (/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|lab|color)\s*\(/.test(value)) {
          offenders.push(`${path.relative(WEB_SRC, abs)}: ${prop}: ${value}`)
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `自造色板残留（应全走 var(--dsw-*)）：\n${offenders.join('\n')}`)
})

test('token 跟随：web/src 消费的 --dsw-* 全部是真 token（快照明暗双份都有值——幻影 token 零容忍）', () => {
  const names = new Set()
  for (const abs of walk(WEB_SRC)) {
    if (!/\.(css|vue)$/.test(abs)) continue
    for (const src of cssSources(abs)) {
      for (const m of src.matchAll(/var\((--dsw-[a-z0-9-]+)/g)) names.add(m[1])
    }
  }
  assert.ok(names.size > 0, 'web/src 应消费 --dsw-* token')
  const light = SHARE_TOKEN_SNAPSHOT.light
  const dark = SHARE_TOKEN_SNAPSHOT.dark
  const phantom = [...names].sort().filter((n) => !(n in light) || !(n in dark))
  assert.deepEqual(phantom, [], `幻影 token（dsw 主题无定义，永远走兜底）：${phantom.join(', ')}`)
})

test('token 跟随：阅读字阶派生 --dsh-content-font-size（display ×1.6 / 阅读 ×1 / caption ×0.75）', () => {
  assert.match(
    stylesCss,
    /\.ob-prose[^{}]*\{[^{}]*font-size:\s*var\(--dsh-content-font-size/,
    '阅读面字号=内容字号轴 --dsh-content-font-size（TECH §3.9.2/§3.10.4）',
  )
  assert.match(
    stylesCss,
    /calc\(var\(--dsh-content-font-size[^)]*\)\s*\*\s*1\.6\)/,
    'display 字阶 ×1.6 派生自内容字号轴',
  )
  assert.match(
    stylesCss,
    /calc\(var\(--dsh-content-font-size[^)]*\)\s*\*\s*0\.75\)/,
    'caption 字阶 ×0.75 派生自内容字号轴',
  )
})

// ── ARC-6：单文件 ≤300 行 + 重交互件禁 v-if ───────────────────────────────────
test('ARC-6：单文件组件 ≤300 行（含模板/脚本/样式全文行数）', () => {
  const over = []
  for (const abs of walk(WEB_SRC)) {
    if (!abs.endsWith('.vue')) continue
    const lines = fs.readFileSync(abs, 'utf8').split('\n').length
    if (lines > 300) over.push(`${path.relative(WEB_SRC, abs)}=${lines}`)
  }
  assert.deepEqual(over, [], `超 300 行组件：${over.join(', ')}`)
})

test('ARC-6：重交互件（el-dialog/el-popconfirm/el-tree-v2/el-table/textarea）禁 v-if', () => {
  const HEAVY = /<(el-dialog|el-popconfirm|el-tree-v2|el-table|textarea)\b([\s\S]*?)>/g
  const offenders = []
  for (const abs of walk(WEB_SRC)) {
    if (!abs.endsWith('.vue')) continue
    const raw = fs.readFileSync(abs, 'utf8')
    for (const m of raw.matchAll(HEAVY)) {
      if (/\bv-if\s*=/.test(m[2])) offenders.push(`${path.relative(WEB_SRC, abs)}: <${m[1]} 带 v-if`)
    }
  }
  assert.deepEqual(offenders, [], `重交互件 v-if 残留（应 v-show 保挂载）：\n${offenders.join('\n')}`)
})

// ── M5（T13 review 随行收口）：语义色桥接——element-plus danger/warning/success 归一到 dsw state token ──
test('M5 语义色桥接：--el-color-danger/warning/success → state token（真 token 零自造，与桥接块同纪律）', () => {
  const bridge = stylesCss.match(/:root\s*\{[\s\S]*?\}/)?.[0] ?? ''
  for (const [varName, token] of [
    ['--el-color-danger', '--dsw-alias-state-error-primary'],
    ['--el-color-warning', '--dsw-alias-state-warn-primary'],
    ['--el-color-success', '--dsw-alias-state-success-primary'],
  ]) {
    assert.match(bridge, new RegExp(`${varName}:\\s*var\\(${token.replace(/-/g, '\\-')},`), `${varName} 必须桥接到 ${token}（语义色不得走 element-plus 原生色板）`)
  }
})
