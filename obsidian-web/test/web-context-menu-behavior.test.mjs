// 右键菜单行为测试（C2 卡 2026-10-09）：真编译 + 真挂载 web/src/components/TreeContextMenu.vue，
// 驱动真键盘/鼠标事件，验证【键盘导航 / 关闭 / 边缘翻转】三项行为（IL-2：行为由测试判，不自证）。
//   真件口径：vue/compiler-sfc 真编译源码 → 真 Vue 运行时挂载 → 真事件派发（非 mock 断言、非纸面契约）。
//   零第三方依赖：DOM 用极简 shim（随测试生成于 test/.tmp-c2-behavior/，跑完清理）；
//   依赖白名单零变化（test/web-bundle.test.mjs / manifest.test.mjs 断言零新增）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, compileScript, compileTemplate } from 'vue/compiler-sfc'
// 注意：vue/runtime-dom 在**导入时**捕获 document（const doc = document），
// 故必须先装 DOM shim 再动态 import('vue')——顶层 import 会让运行时拿到 null。

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VUE_FILE = path.resolve(HERE, '../web/src/components/TreeContextMenu.vue')
const TMP = path.join(HERE, '.tmp-c2-behavior')
const LIB_DIR = path.resolve(HERE, '../web/src/lib')

// ── 极简 DOM shim（挂载 + 事件捕获/冒泡 + 焦点语义 + querySelectorAll）────────────
class NodeBase {
  constructor() { this.childNodes = []; this.parentNode = null; this._listeners = new Map() }
  appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c }
  insertBefore(c, ref) {
    c.parentNode = this
    const i = ref ? this.childNodes.indexOf(ref) : -1
    if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c)
    return c
  }
  removeChild(c) {
    const i = this.childNodes.indexOf(c)
    if (i >= 0) this.childNodes.splice(i, 1)
    c.parentNode = null
    return c
  }
  contains(n) {
    if (n === this) return true
    return this.childNodes.some((c) => c.contains?.(n))
  }
  addEventListener(type, fn, opts) {
    if (!this._listeners.has(type)) this._listeners.set(type, [])
    this._listeners.get(type).push({ fn, capture: opts === true || Boolean(opts?.capture) })
  }
  removeEventListener(type, fn) {
    const list = this._listeners.get(type) ?? []
    const i = list.findIndex((e) => e.fn === fn)
    if (i >= 0) list.splice(i, 1)
  }
  /** 与 DOM 同序：先捕获（根→叶，含 document）后冒泡（叶→根） */
  dispatchEvent(ev) {
    ev.target = ev.target ?? this
    const path = []
    let n = this
    while (n) { path.unshift(n); n = n.parentNode }
    for (const node of path) {
      for (const { fn, capture } of node._listeners?.get(ev.type) ?? []) {
        if (capture) { ev.currentTarget = node; fn.call(node, ev) }
      }
    }
    for (const node of [...path].reverse()) {
      for (const { fn, capture } of node._listeners?.get(ev.type) ?? []) {
        if (!capture) { ev.currentTarget = node; fn.call(node, ev) }
      }
    }
    return !ev.defaultPrevented
  }
}

/** 属性选择器（本测试只需 [role="x"] 形） */
function matchesSel(el, sel) {
  const m = /^\[([a-zA-Z-]+)="([^"]*)"\]$/.exec(sel)
  if (m) return el.getAttribute(m[1]) === m[2]
  if (sel.startsWith('.')) return (el.getAttribute('class') ?? '').split(/\s+/).includes(sel.slice(1))
  if (sel.startsWith('#')) return el.getAttribute('id') === sel.slice(1)
  return el.tagName === sel.toUpperCase()
}

class ShimElement extends NodeBase {
  constructor(tag) {
    super()
    this.tagName = String(tag).toUpperCase()
    this.style = {}
    this.attributes = new Map()
    this._text = ''
    this.offsetWidth = 148 // 菜单实测宽（CDP 证据 c2-01 rect.w=148）
    this.offsetHeight = 125 // 四项菜单实测高（CDP 证据 c2-01 rect.h=125）
  }
  get className() { return this.attributes.get('class') ?? '' }
  setAttribute(k, v) { this.attributes.set(k, String(v)) }
  getAttribute(k) { return this.attributes.get(k) ?? null }
  removeAttribute(k) { this.attributes.delete(k) }
  hasAttribute(k) { return this.attributes.has(k) }
  /** DOM 语义：querySelectorAll 只查后代（不含自身） */
  querySelectorAll(sel) {
    const out = []
    const walk = (n) => {
      for (const c of n.childNodes ?? []) {
        if (typeof c.tagName === 'string') { if (matchesSel(c, sel)) out.push(c); walk(c) }
      }
    }
    walk(this)
    return out
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null }
  focus() {
    if (activeElement) activeElement._focused = false
    this._focused = true
    activeElement = this
    doc.activeElement = this
  }
  blur() { this._focused = false; if (activeElement === this) { activeElement = doc.body; doc.activeElement = doc.body } }
  set textContent(v) { this._text = String(v); this.childNodes = [] }
  get textContent() { return this._text }
  get innerText() { return this._text }
  getBoundingClientRect() {
    return { x: 0, y: 0, left: 0, top: 0, right: this.offsetWidth, bottom: this.offsetHeight, width: this.offsetWidth, height: this.offsetHeight }
  }
}

class ShimText extends NodeBase {
  constructor(text) { super(); this._text = text }
  get textContent() { return this._text }
}

class ShimDocument extends NodeBase {
  constructor() { super(); this.activeElement = null }
  createElement(tag) { return new ShimElement(tag) }
  createElementNS(_ns, tag) { return new ShimElement(tag) }
  createTextNode(t) { return new ShimText(t) }
  createComment(t) { return new ShimText(t) }
  querySelector(sel) {
    if (sel === 'body') return this.body
    if (sel === 'html') return this.documentElement
    return this.documentElement?.querySelector(sel) ?? null
  }
}

let activeElement = null
const doc = new ShimDocument()

function installDom({ innerWidth = 1440, innerHeight = 900 } = {}) {
  const body = new ShimElement('body')
  const html = new ShimElement('html')
  html.appendChild(body)
  html.parentNode = doc
  doc.childNodes = [html]
  doc.body = body
  doc.documentElement = html
  activeElement = body
  doc.activeElement = body
  globalThis.document = doc
  globalThis.window = {
    innerWidth, innerHeight, document: doc,
    addEventListener: () => {}, removeEventListener: () => {},
    getComputedStyle: () => ({ display: 'block' }),
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
  }
  globalThis.Node = ShimElement
  globalThis.Element = ShimElement
  globalThis.SVGElement = ShimElement
  return { body, html }
}

function queryAll(root, pred) {
  const out = []
  const walk = (n) => {
    if (!n || typeof n.tagName !== 'string') return
    if (pred(n)) out.push(n)
    for (const c of n.childNodes ?? []) walk(c)
  }
  walk(root)
  return out
}

const keyEvent = (key) => ({ type: 'keydown', key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true }, stopPropagation() {} })
const mouseDown = (target) => ({ type: 'mousedown', target, defaultPrevented: false, preventDefault() {}, stopPropagation() {} })

// ── 真编译 .vue → ESM（落 TMP，故 'vue' 按项目 node_modules 解析）────────────────
function buildComponent() {
  fs.mkdirSync(TMP, { recursive: true })
  const source = fs.readFileSync(VUE_FILE, 'utf8')
  const { descriptor } = parse(source, { filename: VUE_FILE })
  const script = compileScript(descriptor, { id: 'cm-behavior', inlineTemplate: false })
  const tpl = compileTemplate({
    source: descriptor.template.content, filename: VUE_FILE, id: 'cm-behavior',
    compilerOptions: { bindingMetadata: script.bindings },
  })
  const code = [
    script.content
      .replace(/from ['"]\.\.\/lib\//g, `from '${LIB_DIR}/`)
      .replace('export default {', 'const __default__ = {'),
    tpl.code,
    'export default { ...__default__, render }',
  ].join('\n')
  const out = path.join(TMP, 'built.mjs')
  fs.writeFileSync(out, code)
  return out
}

const BUILT = buildComponent()
installDom() // 先建 document，再导入 vue 运行时
const { createApp, h, nextTick } = await import('vue')

/** 挂载真菜单组件 → 返回操纵面 */
async function mountMenu(props, { innerWidth = 1440, innerHeight = 900 } = {}) {
  const { body } = installDom({ innerWidth, innerHeight })
  const Comp = (await import(BUILT)).default
  const selected = []
  const closed = []
  const open = props.open ?? true
  const app = createApp({
    render: () => h(Comp, {
      open, x: props.x ?? 100, y: props.y ?? 100, path: props.path ?? 'notes/a.md', kind: props.kind ?? 'file',
      onSelect: (p) => selected.push(p), onClose: () => closed.push(true),
    }),
  })
  app.mount(body)
  await nextTick(); await nextTick(); await nextTick() // 等 watch 内 async focusOpen（place+focus）落定
  const menuRoot = () => queryAll(body, (n) => n.getAttribute('role') === 'menu')[0] ?? null
  const menuitems = () => queryAll(body, (n) => n.getAttribute('role') === 'menuitem')
  const handle = {
    body, selected, closed, unmount: () => app.unmount(),
    menuRoot, menuitems,
    activeText: () => activeElement?.textContent ?? null,
    press: async (key) => { menuRoot().dispatchEvent(keyEvent(key)); await nextTick() },
    clickItem: async (idx) => {
      const el = menuitems()[idx]
      el.dispatchEvent(mouseDown(el))
      el.dispatchEvent({ type: 'click', defaultPrevented: false, preventDefault() {}, stopPropagation() {} })
      await nextTick()
    },
    outsideMouseDown: async () => { doc.dispatchEvent(mouseDown(body)); await nextTick() },
  }
  mounted.push(handle)
  return handle
}

// 每个用例结束卸载并清空 document 监听器：否则上一用例的菜单监听器残留（真实浏览器里每次
// mount 对应一次 unmount，本 shim 不重装 document 故需显式清），会污染下一用例的关闭判定。
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }))
const mounted = []
test.afterEach(() => {
  for (const m of mounted.splice(0)) m.unmount()
  doc._listeners.clear()
})

// ── ① 键盘导航：打开即聚焦首项 + 方向键环移 + 高亮 class 跟随 ──────────────────
test('键盘导航：打开即聚焦首项（当前项高亮 is-active）', async () => {
  const m = await mountMenu({ kind: 'file' })
  assert.deepEqual(m.menuitems().map((i) => i.textContent), ['改名/移动', '下载', '删除', '分享'])
  assert.equal(m.activeText(), '改名/移动', '打开即聚焦首项（零鼠标也能操作）')
  assert.match(m.menuitems()[0].getAttribute('class'), /is-active/, '首项高亮 class 在场')
  assert.ok(!/is-active/.test(m.menuitems()[1].getAttribute('class')), '非当前项不高亮')
})

test('键盘导航：ArrowDown/ArrowUp 顺序移动 + 首尾环绕', async () => {
  const m = await mountMenu({ kind: 'file' })
  await m.press('ArrowDown'); assert.equal(m.activeText(), '下载')
  await m.press('ArrowDown'); assert.equal(m.activeText(), '删除')
  await m.press('ArrowDown'); assert.equal(m.activeText(), '分享')
  await m.press('ArrowDown'); assert.equal(m.activeText(), '改名/移动', '末项下键环绕回首项')
  await m.press('ArrowUp'); assert.equal(m.activeText(), '分享', '首项上键环绕到末项')
})

test('键盘导航：Home→首项 / End→末项；方向键吞默认（不滚页面）、字符键不吞', async () => {
  const m = await mountMenu({ kind: 'file' })
  await m.press('End'); assert.equal(m.activeText(), '分享')
  await m.press('Home'); assert.equal(m.activeText(), '改名/移动')
  const ev = keyEvent('ArrowDown')
  m.menuRoot().dispatchEvent(ev)
  assert.equal(ev.defaultPrevented, true, '方向键 preventDefault（菜单内环移不滚页面）')
  const other = keyEvent('a')
  m.menuRoot().dispatchEvent(other)
  assert.equal(other.defaultPrevented, false, '字符键不吞（不劫持输入）')
})

test('键盘导航：dir 节点=三项（改名不出），焦点只在这三项内环移', async () => {
  const m = await mountMenu({ kind: 'dir' })
  assert.deepEqual(m.menuitems().map((i) => i.textContent), ['下载', '删除', '分享'], '目录无改名（服务端契约同界）')
  await m.press('ArrowUp'); assert.equal(m.activeText(), '分享', '三项环移同样成立')
  await m.press('ArrowDown'); assert.equal(m.activeText(), '下载')
})

// ── ② 触发：Enter/Space/点击 只上抛（零业务执行）─────────────────────────────
test('触发：Enter 触发当前项（只上抛 {action,path,kind}）', async () => {
  const m = await mountMenu({ kind: 'file', path: 'notes/a.md' })
  await m.press('ArrowDown') // → 下载
  await m.press('Enter')
  assert.deepEqual(m.selected, [{ action: 'download', path: 'notes/a.md', kind: 'file' }])
})

test('触发：Space 触发当前项；点击任意项触发该项（dir 分享=三项面）', async () => {
  const m = await mountMenu({ kind: 'file' })
  await m.press(' ')
  assert.deepEqual(m.selected, [{ action: 'rename', path: 'notes/a.md', kind: 'file' }], 'Space=触发（按钮语义）')
  const m2 = await mountMenu({ kind: 'dir', path: '02-致远OA' })
  await m2.clickItem(2) // 分享
  assert.deepEqual(m2.selected, [{ action: 'share', path: '02-致远OA', kind: 'dir' }], '点击项=只上抛')
})

// ── ③ 关闭：Escape / Tab / 点击外部 三路都上抛 close ────────────────────────
test('关闭：Escape（菜单内按键）→ close（document 捕获层兜住，焦点漂出也关得掉）', async () => {
  const m = await mountMenu({ kind: 'file' })
  await m.press('Escape')
  assert.deepEqual(m.closed, [true], 'Escape 关闭（焦点在菜单内）')
  const m2 = await mountMenu({ kind: 'file' })
  doc.dispatchEvent(keyEvent('Escape')) // 焦点不在菜单内（漂出场景）
  await nextTick()
  assert.deepEqual(m2.closed, [true], '焦点漂出菜单时 Escape 仍关得掉（旧守卫会漏，已收口 document 层）')
})

test('关闭：Tab → close（焦点不困在菜单里）；点击外部 → close', async () => {
  const tab = await mountMenu({ kind: 'file' })
  await tab.press('Tab')
  assert.deepEqual(tab.closed, [true], 'Tab 移出即关闭')
  const out = await mountMenu({ kind: 'file' })
  await out.outsideMouseDown()
  assert.deepEqual(out.closed, [true], '点击外部关闭（mousedown 捕获，早于 click 误触）')
})

// 注：「点菜单内部不误关」与「点项后关闭」两态由真实浏览器证据覆盖（reports/c2-assets 的 CDP 实测：
// 左键点「删除」→ 删除双确认弹层打开且菜单 display=none，即「先上抛业务、再关菜单」正确；
// 键盘导航期间菜单保持可见=未被自己的关闭守卫误关）。本 shim 对 Teleport 节点 contains 语义保真度
// 不足（实测两个 role=menu 节点并存），故不在 shim 面断言该分支，避免测到 shim 而非组件。

// ── ④ 翻转：右/下缘溢出翻到指针另一侧；翻转后仍完整落在视口内 ──────────────────
test('翻转：指针贴右缘 → 菜单翻到指针左侧（left < x，右缘留白达标）', async () => {
  const m = await mountMenu({ x: 395, y: 89 }, { innerWidth: 420, innerHeight: 760 })
  const left = Number.parseFloat(m.menuRoot().style.left)
  assert.ok(left < 395, `应左翻（left=${left} < x=395）`)
  assert.ok(left + 148 <= 420 - 8, `翻转后右缘留白达标（left+w=${left + 148} ≤ 412）`)
  assert.ok(left >= 8, `左缘不越界（left=${left} ≥ 8）`)
})

test('翻转：指针贴下缘 → 菜单翻到指针上方（top < y，下缘留白达标）', async () => {
  const m = await mountMenu({ x: 100, y: 700 }, { innerWidth: 420, innerHeight: 760 })
  const top = Number.parseFloat(m.menuRoot().style.top)
  assert.ok(top < 700, `应上翻（top=${top} < y=700）`)
  assert.ok(top + 125 <= 760 - 8, `翻转后下缘留白达标（top+h=${top + 125} ≤ 752）`)
})

test('翻转：无溢出零翻转（CDP 证据 c2-01 同参：1440×900、x=222、y=116 → left=222/top=116）', async () => {
  const m = await mountMenu({ x: 222, y: 116 }, { innerWidth: 1440, innerHeight: 900 })
  assert.equal(Number.parseFloat(m.menuRoot().style.left), 222, '无溢出=指针原处')
  assert.equal(Number.parseFloat(m.menuRoot().style.top), 116, '无溢出=指针原处')
})

// ── ⑤ 可达性属性（真渲染 DOM 上核对，非纸面）─────────────────────────────────
test('可达性：role=menu 根 + role=menuitem 项 + tabindex=-1（焦点由脚本管理）+ 概览 label 含路径', async () => {
  const m = await mountMenu({ kind: 'file', path: 'notes/a.md' })
  assert.equal(m.menuRoot().getAttribute('role'), 'menu')
  assert.match(m.menuRoot().getAttribute('aria-label'), /notes\/a\.md/, '菜单概览名含目标路径（读屏可辨目标）')
  for (const item of m.menuitems()) {
    assert.equal(item.getAttribute('role'), 'menuitem')
    assert.equal(item.getAttribute('tabindex'), '-1', '项不进 Tab 序列（方向键环移=menu 语义）')
    assert.ok(item.getAttribute('title'), '每项有 title 提示（悬浮可辨）')
  }
})
