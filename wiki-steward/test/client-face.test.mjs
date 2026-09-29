// client-face 单测（dsh 客户端面官方契约）：
// 被测件：lib/client.js —— window.__ModuleLoader__ 工厂形（零构建、React 无 JSX）。
// 契约（裁定 2026-09-29 Task F1「面板搬家」）：①settings.section 命名空间注册（better-sidebar 路线，
// navLabel 进设置页）②ingest 日志查看能力搬进设置节「查看历史记录」弹层（view:'log' 挂 web/dist
// 日志视图，逻辑复用 web/src/lib/log-view*）③sidebar.panellist 行 + main 槽页注册移除（用户诉求：
// 不显示在 dsh 首页）——旧断言面按语义修订，逐条理由见 changes/2026-09-29-settings-ingest-controls/
// reports/task-f1-report.md「断言修订理由清单」④弃 settings.plugins.tab 自造页签与站内绝对
// '/wiki-steward/panel.js'（生产 404 根因）——panel.js 文档相对 'api/wiki-steward/panel.js'（官方
// prefix 路由面服务，issue #1707 教训：无前导斜杠/相对 base）；动态 import 说明符必须可解析
// （bare specifier 陷阱=TypeError: Failed to resolve module specifier，诊断 §1.2）。
// 零 mock 姿势：假缝只承接宿主最小形（__ModuleLoader__/require/ctx.slots/React 钩子/fetch），
// 被测逻辑=注册契约与挂载/取数缝本身，全真跑真断言。面板加载走 exports.__panelLoader 注入缝、
// 设置取数走 exports.__fetch 注入缝（插桩非 mock）；说明符解析语义另以真 ESM 动态 import 真验
// （真 fixture 模块 + document.baseURI 基址断言——补诊断 §1.2 测试盲区）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const CLIENT_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const source = fs.readFileSync(CLIENT_PATH, 'utf8')

/** 评估 lib/client.js（工厂形脚本）：假 window.__ModuleLoader__ + 假 require（最小形） */
function loadClientFace() {
  const loaded = []
  const win = {
    __ModuleLoader__: {
      load: (m) => loaded.push(m),
    },
  }
  // 假 React 钩子（最小形）：createElement 记树、useRef 返对象、useEffect 排队（测试驱动执行）、useState 单槽
  // （测试驱动重渲染；setter 支持函数形 updater——React 真语义补齐，设置节 delta 更新用 prev=>next 形）。
  // F2 控件形对齐（Task F2）：原生 primitives（@deepseek-ai/dsh-client-ui-primitives）以「最小契约假缝」承接——
  // 假组件渲染形严格镜像官方 .d.ts/实现的 DOM 契约（Switch→button[role=switch][aria-checked]、
  // Button→原生 button 属性透传、Input→span>input 属性透传、Modal→open=false 渲染 null，开则
  // [role=dialog][aria-label=title]+closeLabel 关闭钮+children），且标记 __primitive 由 createElement
  // 即时展开成 DOM 树——被测件是「我们传给原生控件的 props 接线」，控件内部渲染归宿主组件自身测试面。
  const effects = []
  let hookState = null
  const reactStub = {
    createElement: (type, props, ...children) => {
      const merged = { ...(props ?? {}) }
      if (children.length > 0) merged.children = children.length === 1 ? children[0] : children
      if (typeof type === 'function' && type.__primitive === true) return type(merged)
      return { type, props: merged, children }
    },
    useRef: (init) => ({ current: init }),
    useEffect: (fn) => { effects.push(fn) },
    useState: (init) => {
      if (hookState === null) hookState = { v: init }
      const ref = hookState
      return [ref.v, (next) => { ref.v = typeof next === 'function' ? next(ref.v) : next }]
    },
  }
  /** 原生控件假缝（最小契约形，镜像 dsh-client-ui-primitives .d.ts；无钩子——不扰 useState 单槽/effects 队列） */
  function prim(name, render) {
    Object.defineProperty(render, 'name', { value: name })
    render.__primitive = true
    return render
  }
  const uiStub = {
    Switch: prim('Switch', (p) => reactStub.createElement('button', {
      type: 'button',
      role: 'switch',
      'aria-checked': p.checked === true,
      'aria-label': p.label,
      title: p.title,
      disabled: p.disabled === true,
      className: p.className,
      onClick: () => p.onChange(!(p.checked === true)),
    }, reactStub.createElement('span', { className: 'ws-stub-switch-thumb' }))),
    Button: prim('Button', (p) => {
      const rest = { ...p }
      delete rest.variant
      delete rest.size
      delete rest.icon
      delete rest.children
      // 假缝回显被消费的变体/尺寸 props（真 Button 只用其选样式；回显供接线断言，非 DOM 契约）
      rest['data-ws-variant'] = p.variant
      rest['data-ws-size'] = p.size
      return reactStub.createElement('button', { type: 'button', ...rest }, p.children)
    }),
    Input: prim('Input', (p) => {
      const rest = { ...p }
      delete rest.icon
      delete rest.className
      delete rest.children
      return reactStub.createElement('span', { className: p.className }, reactStub.createElement('input', rest))
    }),
    Modal: prim('Modal', (p) => {
      if (p.open !== true) return null
      return reactStub.createElement('div', { role: 'dialog', 'aria-label': p.title, className: p.className },
        reactStub.createElement('button', { type: 'button', 'aria-label': p.closeLabel, onClick: p.onClose }),
        p.children)
    }),
  }
  const req = (name) => {
    if (name === 'react') return reactStub
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return uiStub
    throw new Error(`unexpected require: ${name}`)
  }
  const fn = new Function('window', source)
  fn(win)
  assert.equal(loaded.length, 1, 'bundle 必须登记一个模块')
  const exportsFace = loaded[0].factory(req)
  return { loaded, mod: exportsFace, effects, reactStub }
}

/** 最小 ctx（slots 缝承接注册契约） */
function mkCtx(registered, injected) {
  return {
    slots: {
      inject: (name, setup) => { injected.push(name); return setup() },
      register: (decl, component) => { registered.push({ decl, component }); return () => {} },
    },
    logger: { warn: () => {} },
    effect: (fn) => { fn(); return () => {} },
  }
}

/** 树内找节点 */
function find(node, pred) {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (typeof node.type === 'string' && pred(node)) return node
  for (const c of node.children ?? []) {
    const hit = find(c, pred)
    if (hit) return hit
  }
  return null
}

const tick = () => new Promise((res) => setTimeout(res, 0))

/**
 * 剥注释取真代码（注释里的旧引用/示例不算代码引用）：块注释 /* … *\/ 整段剥 + // 整行剥。
 * 过滤器修正（Task F1 续作）：原形只剥 `//` 整行、漏块注释——JSDoc 记载「sidebar.panellist 已移除」
 * 这类块注释字面会误报残留（红点实证 lib/client.js:322）；补齐块注释剥离后断言保持强形态（真代码零字面）。
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
}

/** 树内找全部匹配节点（F3 手动动作双按钮需要全量收集） */
function findAll(node, pred, out = []) {
  if (Array.isArray(node)) {
    for (const c of node) findAll(c, pred, out)
    return out
  }
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (typeof node.type === 'string' && pred(node)) out.push(node)
  for (const c of node.children ?? []) findAll(c, pred, out)
  return out
}

/** 树内找组件节点（React 子组件元素：type 为函数；数组 children 也下钻） */
function findComp(node, name) {
  if (Array.isArray(node)) {
    for (const c of node) {
      const hit = findComp(c, name)
      if (hit) return hit
    }
    return null
  }
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (typeof node.type === 'function' && node.type.name === name) return node
  for (const c of node.children ?? []) {
    const hit = findComp(c, name)
    if (hit) return hit
  }
  return null
}

/** 树内收集全部同名组件节点（F2：行卡结构重排后按语义收集 SettingsRow，不依赖 children 槽位形状） */
function findAllComp(node, name, out = []) {
  if (Array.isArray(node)) {
    for (const c of node) findAllComp(c, name, out)
    return out
  }
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (typeof node.type === 'function' && node.type.name === name) out.push(node)
  for (const c of node.children ?? []) findAllComp(c, name, out)
  return out
}

/** 设置节字段行（F2 断言修订：旧 `tree.children.find(Array.isArray)` 依赖 rows 直挂根的槽位形状——
 *  §3.2 rows 容器契约要求 rows 收进 `.rows` 列表容器，改按组件语义收集（行为面断言不变）。 */
function rowsOf(tree) {
  return findAllComp(tree, 'SettingsRow')
}

/** 保存按钮（F2 断言修订：控件形对齐后 Switch 也呈 button 语义，「树内首个 button」不再=保存——
 *  改语义锚 data-ws-action="save" 定位（原生属性透传，行为面断言不变）。 */
function saveButton(tree) {
  return find(tree, (n) => n.type === 'button' && n.props['data-ws-action'] === 'save')
}

/** 设置节跑进 ready 态并返回渲染树（GET 载入完成） */
async function readySection(mod, effects) {
  const registered = []
  mod.apply(mkCtx(registered, []))
  const Section = registered.find((r) => r.decl.name === 'settings.section').component
  Section()
  effects[0]()
  await tick()
  await tick()
  return { Section, tree: Section() }
}

// ── 工厂形与导出契约 ────────────────────────────────────────────────────────
test('client.js 是 __ModuleLoader__ 工厂形，id=wiki-steward，导出 {inject, apply, __panelLoader, __fetch}', () => {
  assert.match(source, /^(\s*\/\/[^\n]*\n)*\s*window\.__ModuleLoader__\.load\(\{/, '必须是工厂形（浏览器 bundle 契约；头注释可前置）')
  const { loaded, mod } = loadClientFace()
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].id, 'wiki-steward')
  assert.equal(typeof loaded[0].factory, 'function')
  assert.deepEqual(mod.inject, ['slots'], '只取 slots 缝（三面注册）')
  assert.equal(typeof mod.apply, 'function')
  assert.equal(typeof mod.__panelLoader, 'function')
  assert.equal(typeof mod.__fetch, 'function')
})

test('路径全文档相对（issue #1707 教训）：源码无站内绝对 /wiki-steward/*，面板 URL=api/wiki-steward/panel.js', async () => {
  const code = stripComments(source) // 注释里的旧路径示例不算引用
  assert.ok(!code.includes("'/wiki-steward"), '不得再引站内绝对 /wiki-steward/*（login-gate 基址下 404 根因）')
  assert.ok(!code.includes('"/wiki-steward'), '同上（双引号形）')
  // 断言修订理由（Task F1）：main 槽页已移除（面板搬家），PANEL_URL 改由历史弹层挂载缝消费——
  // 文档相对契约本身保留（历史入口仍要加载 panel.js 日志视图），驱动面从 main 组件换到历史挂载组件。
  const { mod, effects } = loadClientFace()
  mod.__fetch = async () => ({ json: async () => ({ data: { config: {}, writable: true, editable: [] } }) })
  const { tree } = await readySection(mod, effects)
  const entry = findComp(tree, 'WikiStewardHistoryEntry')
  const openTree = entry.type({ ...entry.props, open: true })
  const mountComp = findComp(openTree, 'WikiStewardHistoryMount')
  const seen = []
  mod.__panelLoader = async (url) => { seen.push(url); return { mount: () => ({ unmount: () => {} }) } }
  effects.length = 0
  const mountTree = mountComp.type(mountComp.props)
  mountTree.props.ref.current = { textContent: '' }
  effects[0]()
  await tick()
  assert.deepEqual(seen, ['api/wiki-steward/panel.js'], 'panel.js 必须文档相对请求（无前导斜杠，历史入口消费）')
})

// ── 注册面（settings 命名空间；面板双面已搬家进设置节）──────────────────────
test('注册面=仅 settings.section（断言修订：sidebar.panellist/main 双面移除——用户诉求=不显示在 dsh 首页）', () => {
  const { mod } = loadClientFace()
  const registered = []
  const injected = []
  mod.apply(mkCtx(registered, injected))
  assert.deepEqual(injected, ['settings.section'], '只注册设置节（侧栏行随诉求移除）')
  assert.deepEqual(registered.map((r) => r.decl.name), ['settings.section'])
  for (const r of registered) assert.notEqual(r.decl.name, 'settings.plugins.tab', '自造页签已弃（菜单页签不对的根因）')
})

test('面板搬家：源码零 sidebar.panellist/main 注册与 PanelIcon；hHd-Xa_* 裸类名无落点（随侧栏行移除）', () => {
  const code = stripComments(source)
  assert.ok(!code.includes('sidebar.panellist'), '侧栏行注册必须移除（诊断 §2.1 影响面；块注释/JSDoc 不算代码引用）')
  assert.ok(!code.includes("name: 'main'") && !code.includes('name: "main"'), 'main 槽页注册必须移除')
  assert.ok(!code.includes('WikiStewardPanelIcon'), '侧栏行 glyph 组件随之移除')
  assert.ok(!code.includes('hHd-Xa'), '裸类名文本产生点随侧栏行消失（诊断 §1.3）')
  const { mod } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const names = registered.map((r) => r.decl.name)
  assert.ok(!names.includes('sidebar.panellist') && !names.includes('main'), '运行时注册面同样零残留')
})

test('root 壳槽位禁注册（launcher/trigger/header/close/action/onboarding）；settings.section 是官方贡献面', () => {
  const { mod } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const names = registered.map((r) => r.decl.name)
  for (const banned of ['settings.launcher', 'settings.trigger', 'settings.header', 'settings.close', 'settings.action', 'settings.onboarding']) {
    assert.ok(!names.includes(banned), `root 壳槽位禁注册：${banned}`)
  }
  assert.ok(names.includes('settings.section'), 'settings.section=设置页贡献槽（better-sidebar 实证 + settings-general 壳 renderSlot 渲染）')
})

test('settings 命名空间注册形（better-sidebar 路线）：{name,id,order,label 函数,组件函数}', () => {
  const { mod } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const { decl, component } = registered.find((r) => r.decl.name === 'settings.section')
  assert.equal(decl.name, 'settings.section')
  assert.equal(decl.id, 'wiki-steward')
  assert.equal(typeof decl.order, 'number')
  assert.equal(typeof decl.label, 'function')
  assert.ok(decl.label().length > 0, 'navLabel 文案非空')
  assert.equal(typeof component, 'function')
})

test('历史入口：设置节内「查看历史记录」按钮点开弹层、关闭收起（断言修订：旧「面板两面注册形」随 sidebar.panellist/main 移除改为历史入口行为面）', async () => {
  const { mod, effects } = loadClientFace()
  mod.__fetch = async () => ({ json: async () => ({ data: { config: {}, writable: true, editable: [] } }) })
  const { Section, tree } = await readySection(mod, effects)
  const entry = findComp(tree, 'WikiStewardHistoryEntry')
  assert.ok(entry, '设置节必须含历史入口组件')
  let entryTree = entry.type(entry.props)
  const btn = find(entryTree, (n) => n.type === 'button')
  assert.match(JSON.stringify(btn.children), /查看历史记录/, '按钮文案=查看历史记录')
  assert.equal(btn.props['aria-expanded'], 'false', '未开=aria-expanded=false')
  assert.equal(findComp(entryTree, 'WikiStewardHistoryMount'), null, '未开=无挂载容器')

  entry.props.onToggle() // 点开
  const openEntry = findComp(Section(), 'WikiStewardHistoryEntry')
  assert.equal(openEntry.props.open, true, '点开后开合状态真翻转')
  entryTree = openEntry.type(openEntry.props)
  assert.ok(findComp(entryTree, 'WikiStewardHistoryMount'), '点开=日志视图挂载容器出现')
  assert.equal(find(entryTree, (n) => n.type === 'button').props['aria-expanded'], 'true')

  openEntry.props.onToggle() // 关闭收起
  const closedEntry = findComp(Section(), 'WikiStewardHistoryEntry')
  assert.equal(closedEntry.props.open, false, '再点=收起')
  assert.equal(findComp(closedEntry.type(closedEntry.props), 'WikiStewardHistoryMount'), null, '收起=挂载容器撤除')
})

test('slots.register 抛错 = 吞+兜底 disposer（缺槽位方绝不炸插件）', () => {
  const { mod } = loadClientFace()
  const ctx = {
    slots: {
      inject: (_n, setup) => setup(),
      register: () => { throw new Error('slot missing') },
    },
    logger: { warn: () => {} },
    effect: (fn) => { fn(); return () => {} },
  }
  const dispose = mod.apply(ctx)
  assert.equal(typeof dispose === 'function' || dispose === undefined, true)
  if (typeof dispose === 'function') dispose()
})

// ── 历史弹层挂载缝：日志视图（mount/unmount 契约 + 清理幂等）─────────────────
test('历史弹层：挂载日志视图（__panelLoader 注入缝）→ mount(el, {apiBase, view:"log"})，关闭=unmount+清空（断言修订：旧「main 槽页挂载 Vue 面板」随槽页移除改为历史弹层挂载，日志能力搬家语义保持）', async () => {
  const { mod, effects } = loadClientFace()
  mod.__fetch = async () => ({ json: async () => ({ data: { config: {}, writable: true, editable: [] } }) })
  const { tree } = await readySection(mod, effects)
  const entry = findComp(tree, 'WikiStewardHistoryEntry')
  const mountComp = findComp(entry.type({ ...entry.props, open: true }), 'WikiStewardHistoryMount')

  const mounts = []
  const unmounts = []
  mod.__panelLoader = async () => ({
    mount: (el, deps) => {
      mounts.push({ el, deps })
      return { unmount: () => { unmounts.push(1) } }
    },
  })

  effects.length = 0
  const mountTree = mountComp.type(mountComp.props)
  assert.equal(mountTree.type, 'div', '挂载容器=单 div（日志视图挂进 ref 节点）')
  const el = { textContent: '' }
  mountTree.props.ref.current = el
  const cleanup = effects[0]()
  await tick()
  assert.equal(mounts.length, 1)
  assert.equal(mounts[0].el, el)
  assert.equal(mounts[0].deps.apiBase, 'api/wiki-steward', 'apiBase 文档相对（与日志请求同基）')
  assert.equal(mounts[0].deps.view, 'log', '历史入口只挂日志视图（不暴露手动 ingest 动作——F3 领地）')
  cleanup()
  await tick()
  assert.equal(unmounts.length, 1)
  assert.equal(el.textContent, '', '清理=unmount+容器清空（无残影）')
})

test('历史弹层：日志视图加载失败 = 容器内如实报错（不白屏不吞不留裸文本），清理仍幂等（断言修订：兜底文本随能力搬家改述为历史记录）', async () => {
  const { mod, effects } = loadClientFace()
  mod.__fetch = async () => ({ json: async () => ({ data: { config: {}, writable: true, editable: [] } }) })
  const { tree } = await readySection(mod, effects)
  const entry = findComp(tree, 'WikiStewardHistoryEntry')
  const mountComp = findComp(entry.type({ ...entry.props, open: true }), 'WikiStewardHistoryMount')
  mod.__panelLoader = async () => { throw new Error('panel 404') }

  effects.length = 0
  const mountTree = mountComp.type(mountComp.props)
  const el = { textContent: '' }
  mountTree.props.ref.current = el
  const cleanup = effects[0]()
  await tick()
  assert.match(el.textContent, /panel 404|加载失败/, '失败必须如实可见')
  assert.match(el.textContent, /历史记录/, '兜底=历史记录加载失败如实文案（非裸类名/裸文本）')
  cleanup()
  cleanup() // 幂等：双清理不炸
})

// ── 说明符解析语义回归锁（真 ESM 动态 import 真验——补诊断 §1.2 测试盲区）─────
test('面板加载缝真浏览器语义：默认 __panelLoader 按 document.baseURI 真 ESM 解析（等价可解析形，非 bare specifier）', async () => {
  const { mod } = loadClientFace()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-panel-import-'))
  const fixturePath = path.join(tmp, 'api', 'wiki-steward', 'panel.js')
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true })
  fs.writeFileSync(
    fixturePath,
    'globalThis.__wsPanelFixtureUrl = import.meta.url\nexport function mount() { return { unmount() {} } }\n',
  )
  const prevDoc = globalThis.document
  globalThis.document = { baseURI: pathToFileURL(tmp + path.sep).href }
  try {
    const loaded = await mod.__panelLoader('api/wiki-steward/panel.js')
    assert.equal(typeof loaded.mount, 'function', '真 fixture 模块须导出 mount（真 ESM 解析成功=说明符可解析形）')
    assert.equal(
      globalThis.__wsPanelFixtureUrl,
      pathToFileURL(fixturePath).href,
      '说明符必须按 document.baseURI 解析出绝对 URL（浏览器动态 import URL 语义，与 fetch 同基）',
    )
  } finally {
    if (prevDoc === undefined) delete globalThis.document
    else globalThis.document = prevDoc
    delete globalThis.__wsPanelFixtureUrl
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('回归锁判别力：bare specifier（旧 bug 形 lib/client.js:29-31 裸 import(url)）在真 ESM 解析下必炸', async () => {
  await assert.rejects(
    () => import('api/wiki-steward/panel.js'),
    (e) => e && (e.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find (package|module)/.test(String(e.message))),
    '裸说明符=包名解析必失败——本锁对旧缺陷可见（诊断 §1.2 测试盲区：假缝测试两条链都看不见）',
  )
})

// ── settings.section 组件：配置展示/可改（GET 载入 + POST 保存，__fetch 注入缝）──
test('设置面组件：GET api/wiki-steward/settings 载入 → ready 渲染配置面（可写面有保存按钮）', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const { component: Section } = registered.find((r) => r.decl.name === 'settings.section')
  const calls = []
  mod.__fetch = async (url) => {
    calls.push(url)
    return { json: async () => ({ data: { config: { vaultRoot: '/mnt/unraid_data/Obsidian', write: { readOnly: true }, capture: { enabled: true, bufferRounds: 3 } }, readOnly: true, editable: [['capture', 'enabled']], writable: true } }) }
  }
  Section() // loading
  effects[0]()
  await tick()
  await tick()
  assert.deepEqual(calls, ['api/wiki-steward/settings'], '设置取数必须文档相对')
  const tree = Section()
  assert.equal(tree.props['data-dsh-plugin'], 'wiki-steward')
  assert.ok(saveButton(tree) !== null, '可写面有保存按钮（F2 断言修订：语义锚 data-ws-action=save——控件形对齐后 Switch 也呈 button 语义，「树内首个 button」判别力失真）')
  const note = JSON.stringify(tree.children)
  assert.match(note, /INV-7/, 'write.readOnly 只读项带 INV-7 注记')
})

test('设置面组件：保存=POST {patch:变更叶子}（文档相对），成功 notice 如实', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const { component: Section } = registered.find((r) => r.decl.name === 'settings.section')
  const calls = []
  mod.__fetch = async (url, init) => {
    calls.push({ url, init })
    if (init && init.method === 'POST') {
      return { json: async () => ({ data: { ok: true, config: { capture: { enabled: false } } } }) }
    }
    return { json: async () => ({ data: { config: { capture: { enabled: true, bufferRounds: 3 }, write: { readOnly: true }, vaultRoot: '/mnt/unraid_data/Obsidian' }, writable: true, editable: [['capture', 'enabled']] } }) }
  }
  Section()
  effects[0]()
  await tick()
  await tick()
  // 改一项（捕获开关）→ 重渲染 → 点保存
  let tree = Section()
  const editableRow = rowsOf(tree).find((c) => c.props.field && c.props.field.path.join('.') === 'capture.enabled')
  editableRow.props.onChange(false)
  tree = Section()
  const button = saveButton(tree)
  button.props.onClick()
  await tick()
  await tick()
  const post = calls.find((c) => c.init && c.init.method === 'POST')
  assert.ok(post, '必须发保存请求')
  assert.equal(post.url, 'api/wiki-steward/settings')
  assert.deepEqual(JSON.parse(post.init.body), { patch: { capture: { enabled: false } } }, '只发变更叶子')
  tree = Section()
  const ok = find(tree, (n) => typeof n.props?.className === 'string' && n.props.className.includes('ok'))
  assert.ok(ok, '成功 notice 如实')
})

test('设置面组件：服务端拒绝（not_editable）= 错误文案如实展示，绝不静默', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const { component: Section } = registered.find((r) => r.decl.name === 'settings.section')
  mod.__fetch = async (url, init) => {
    if (init && init.method === 'POST') {
      return { json: async () => ({ error: { code: 'not_editable', message: '字段 write.readOnly 不在可改白名单' } }) }
    }
    return { json: async () => ({ data: { config: {}, writable: true, editable: [] } }) }
  }
  Section()
  effects[0]()
  await tick()
  await tick()
  let tree = Section()
  const editableRow = rowsOf(tree).find((c) => c.props.field)
  editableRow.props.onChange(false)
  tree = Section()
  saveButton(tree).props.onClick()
  await tick()
  await tick()
  tree = Section()
  const err = find(tree, (n) => typeof n.props?.className === 'string' && n.props.className.includes('error'))
  assert.ok(err, '拒绝必须如实可见')
  assert.match(JSON.stringify(err.children), /不在可改白名单/, '服务端判据原文展示')
})

test('设置面组件：载入失败 = 容器内如实报错（不白屏不吞）', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const { component: Section } = registered.find((r) => r.decl.name === 'settings.section')
  mod.__fetch = async () => { throw new Error('fetch failed') }
  Section()
  effects[0]()
  await tick()
  await tick()
  const tree = Section()
  const err = find(tree, (n) => typeof n.props?.className === 'string' && n.props.className.includes('error'))
  assert.ok(err, '失败必须如实可见')
  assert.match(JSON.stringify(err.children), /fetch failed|载入失败/)
})

// ── Task F3：手动 ingest 动作（扫描增量/触发蒸馏，走既有通路）──────────────────
test('手动动作：设置节「扫描增量」「触发蒸馏」两按钮走既有 ingest 通路（文档相对 POST），{data} 反馈如实', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const { component: Section } = registered.find((r) => r.decl.name === 'settings.section')
  const calls = []
  mod.__fetch = async (url, init) => {
    calls.push({ url, init })
    if (init && init.method === 'POST' && url === 'api/wiki-steward/ingest/scan') {
      return { json: async () => ({ data: { ok: true, exitCode: 0, summary: { total: 3, skipped: 2, pending: 1, pendingFiles: [] }, output: '', logFile: 'l', argv: [] } }) }
    }
    if (init && init.method === 'POST' && url === 'api/wiki-steward/ingest/distill') {
      return { json: async () => ({ data: { started: true, reason: 'started', note: '蒸馏由任务执行：已触发 headless 任务（dsh-cron wiki-ingest），wiki 编译由任务会话按 wiki-ingest skill 完成；进度与结果见任务日志（本按钮不做 LLM 蒸馏）。', logFile: 'l' } }) }
    }
    return { json: async () => ({ data: { config: {}, writable: true, editable: [] } }) }
  }
  Section()
  effects[0]()
  await tick()
  await tick()
  let tree = Section()
  const actions = findComp(tree, 'WikiStewardManualActions')
  assert.ok(actions, '设置节必须含手动动作组件（F3 验收①）')
  const at = actions.type(actions.props)
  const btns = findAll(at, (n) => n.type === 'button')
  assert.equal(btns.length, 2, '两按钮')
  const labels = JSON.stringify(btns.map((b) => b.children))
  assert.match(labels, /扫描增量/)
  assert.match(labels, /触发蒸馏/)

  btns[0].props.onClick() // 扫描增量
  const runningTree = findComp(Section(), 'WikiStewardManualActions').type(findComp(Section(), 'WikiStewardManualActions').props)
  const runningBtns = findAll(runningTree, (n) => n.type === 'button')
  assert.equal(runningBtns[0].props.disabled, true, '执行中禁用（防重复触发）')
  await tick()
  await tick()
  const scanCall = calls.find((c) => c.url === 'api/wiki-steward/ingest/scan')
  assert.ok(scanCall, '扫描增量必须 POST 既有通路（ingest-routes scanPost）')
  assert.equal(scanCall.init.method, 'POST')
  tree = Section()
  const scanText = JSON.stringify(findComp(tree, 'WikiStewardManualActions').type(findComp(tree, 'WikiStewardManualActions').props).children)
  assert.match(scanText, /exit 0/, '{data} 反馈如实（exit code）')
  assert.match(scanText, /待编译 1/, '{data} 反馈如实（summary 增量面）')

  const actions2 = findComp(Section(), 'WikiStewardManualActions')
  const btns2 = findAll(actions2.type(actions2.props), (n) => n.type === 'button')
  btns2[1].props.onClick() // 触发蒸馏
  await tick()
  await tick()
  const distillCall = calls.find((c) => c.url === 'api/wiki-steward/ingest/distill')
  assert.ok(distillCall, '触发蒸馏必须 POST 既有通路（ingest-routes distillPost）')
  tree = Section()
  const distillText = JSON.stringify(findComp(tree, 'WikiStewardManualActions').type(findComp(tree, 'WikiStewardManualActions').props).children)
  assert.match(distillText, /蒸馏由任务执行/, '{data.note} 如实文案（按钮绝不做 LLM 蒸馏）')
})

test('手动动作：在跑/通道缺 = {data.note} 原文如实（ALREADY_RUNNING/CHANNEL_UNAVAILABLE 文案不改写）', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const { component: Section } = registered.find((r) => r.decl.name === 'settings.section')
  let n = 0
  mod.__fetch = async (url, init) => {
    if (init && init.method === 'POST' && url === 'api/wiki-steward/ingest/distill') {
      n += 1
      return {
        json: async () => (n === 1
          ? { data: { started: false, reason: 'already-running', note: '蒸馏任务已在执行（flock 防重入）：蒸馏由任务执行中，请稍后在日志面板查看结果。' } }
          : { data: { started: false, reason: 'channel-unavailable', note: '蒸馏通道不可用（缺 dsh-cron.sh 或 21-wiki-ingest.md 任务文件）：蒸馏走夜间任务（00:25 cron）或手动会话执行 wiki-ingest skill。' } }),
      }
    }
    return { json: async () => ({ data: { config: {}, writable: true, editable: [] } }) }
  }
  Section()
  effects[0]()
  await tick()
  await tick()

  let actions = findComp(Section(), 'WikiStewardManualActions')
  findAll(actions.type(actions.props), (x) => x.type === 'button')[1].props.onClick()
  await tick()
  await tick()
  actions = findComp(Section(), 'WikiStewardManualActions')
  let text = JSON.stringify(actions.type(actions.props).children)
  assert.match(text, /蒸馏任务已在执行（flock 防重入）/, '在跑文案原文如实')

  actions = findComp(Section(), 'WikiStewardManualActions')
  findAll(actions.type(actions.props), (x) => x.type === 'button')[1].props.onClick()
  await tick()
  await tick()
  actions = findComp(Section(), 'WikiStewardManualActions')
  text = JSON.stringify(actions.type(actions.props).children)
  assert.match(text, /蒸馏通道不可用（缺 dsh-cron\.sh 或 21-wiki-ingest\.md 任务文件）/, '通道缺文案原文如实')
})

test('手动动作：{error:{code,message}} 原文展示（绝不静默）', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const { component: Section } = registered.find((r) => r.decl.name === 'settings.section')
  mod.__fetch = async (url, init) => {
    if (init && init.method === 'POST') {
      return { json: async () => ({ error: { code: 'internal', message: 'scan boom' } }) }
    }
    return { json: async () => ({ data: { config: {}, writable: true, editable: [] } }) }
  }
  Section()
  effects[0]()
  await tick()
  await tick()
  let actions = findComp(Section(), 'WikiStewardManualActions')
  findAll(actions.type(actions.props), (x) => x.type === 'button')[0].props.onClick()
  await tick()
  await tick()
  actions = findComp(Section(), 'WikiStewardManualActions')
  const text = JSON.stringify(actions.type(actions.props).children)
  assert.match(text, /scan boom/, '{error.message} 原文如实')
})

// ── Task F3：定时执行控制（时间输入 + 启用开关 + 双源如实提示）──────────────────
test('定时控制：时间输入（input[type=time]）+ 启用开关入设置节，双源提示文案如实入 UI', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const { component: Section } = registered.find((r) => r.decl.name === 'settings.section')
  mod.__fetch = async () => ({
    json: async () => ({
      data: {
        config: { ingest: { schedule: { enabled: true, time: '23:30' } } },
        writable: true,
        editable: [['ingest', 'schedule', 'enabled'], ['ingest', 'schedule', 'time']],
      },
    }),
  })
  Section()
  effects[0]()
  await tick()
  await tick()
  const tree = Section()
  const timeRow = rowsOf(tree).find((c) => c.props.field && c.props.field.path.join('.') === 'ingest.schedule.time')
  const enableRow = rowsOf(tree).find((c) => c.props.field && c.props.field.path.join('.') === 'ingest.schedule.enabled')
  assert.ok(timeRow, '定时执行时间字段入设置节（F3 验收②）')
  assert.ok(enableRow, '定时启用开关字段入设置节（F3 验收②）')

  const timeTree = timeRow.type(timeRow.props)
  const input = find(timeTree, (n) => n.type === 'input' && n.props.type === 'time')
  assert.ok(input, '时间输入=原生 time 控件（语义保持：F2 控件形对齐只换壳为 Input 原生控件，type=time 透传）')
  assert.equal(input.props.value, '23:30', '当前配置值如实回显')

  // F2 断言修订：启用开关从裸 checkbox 换原生 Switch（§3.2「开关用 Switch（行内 switch 形）」）——
  // 数据面契约不变（onChange(bool)→draft→{patch}），断言从 input[type=checkbox].checked 改
  // button[role=switch].aria-checked + 点击=onChange(false)（功能面=布尔翻转，零行为变化）。
  const enableTree = enableRow.type(enableRow.props)
  const sw = find(enableTree, (n) => n.props && n.props.role === 'switch')
  assert.ok(sw, '启用开关=原生 Switch（role=switch 行内形，§3.2 控件形）')
  assert.equal(sw.props['aria-checked'], true)
  let toggled = null
  const enableRow2 = rowsOf(Section()).find((c) => c.props.field && c.props.field.path.join('.') === 'ingest.schedule.enabled')
  const swTree = enableRow2.type({ ...enableRow2.props, onChange: (v) => { toggled = v } })
  find(swTree, (n) => n.props && n.props.role === 'switch').props.onClick()
  assert.equal(toggled, false, 'Switch 点击=onChange(翻转值)——与原 checkbox onChange(checked) 数据契约一致')

  assert.match(
    JSON.stringify(tree.children),
    /系统 cron 仍在 00:25 触发，flock 防重入；如需单一时间源请运维侧停用该行/,
    '双源如实提示文案入 UI（去留交用户，F3 裁定③）',
  )
})

test('定时控制：改时间随保存走 {patch:{ingest:{schedule:{time}}}}（白名单双侧一致）', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const { component: Section } = registered.find((r) => r.decl.name === 'settings.section')
  const calls = []
  mod.__fetch = async (url, init) => {
    calls.push({ url, init })
    if (init && init.method === 'POST') {
      return { json: async () => ({ data: { ok: true, config: { ingest: { schedule: { enabled: false, time: '23:30' } } } } }) }
    }
    return { json: async () => ({ data: { config: { ingest: { schedule: { enabled: false, time: '00:25' } } }, writable: true, editable: [] } }) }
  }
  Section()
  effects[0]()
  await tick()
  await tick()
  let tree = Section()
  const timeRow = rowsOf(tree).find((c) => c.props.field && c.props.field.path.join('.') === 'ingest.schedule.time')
  timeRow.props.onChange('23:30')
  tree = Section()
  saveButton(tree).props.onClick() // 保存
  await tick()
  await tick()
  const post = calls.find((c) => c.init && c.init.method === 'POST')
  assert.ok(post, '必须发保存请求')
  assert.equal(post.url, 'api/wiki-steward/settings')
  assert.deepEqual(JSON.parse(post.init.body), { patch: { ingest: { schedule: { time: '23:30' } } } }, '只发变更叶子（ingest.schedule.time）')
})

// ===== Task F2：设置节 UI 对齐 dsh 原生设置风格（诊断 §3 风格契约逐项）============
// 参照：changes/2026-09-29-settings-ingest-controls/diagnostic-report.md §3（对齐清单）/§3.3（差异清单）。
// 红线口径：视觉与结构可动，功能面零行为变化（{data}/{error} 契约、timer 语义、白名单、历史入口行为面）。
// 原生控件假缝=uiStub（见 loadClientFace）：断言的是「我们传给原生控件的 props 接线」+ 自绘布局几何契约；
// 控件内部渲染形归宿主组件自身测试面（Switch/Button/Input/Modal 的 DOM 契约镜像官方 .d.ts）。

/** 取 SETTINGS_CSS 内单条规则体（源码级：样式集中 var SETTINGS_CSS=[…].join，零构建单文件自包含） */
function cssRule(css, cls) {
  const m = css.match(new RegExp(`\\.${cls}\\{([^}]*)\\}`))
  assert.ok(m, `缺 .${cls} 规则（§3.2 对齐清单落点）`)
  return m[1]
}

/** 载入就绪设置树（复用 readySection：GET 载入完成后的渲染树 + 重渲染句柄） */
async function f2Tree(config, extra = {}) {
  const { mod, effects } = loadClientFace()
  mod.__fetch = async () => ({ json: async () => ({ data: { config, writable: true, editable: [], ...extra } }) })
  return readySection(mod, effects)
}

test('F2 原生控件包接入：dsh.client.inject 扩 @deepseek-ai/dsh-client-ui-primitives（peer/dev 双声明），设置节用 Switch/Button/Input/Modal 四控件', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(CLIENT_PATH), '..', 'package.json'), 'utf8'))
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-primitives'), 'inject 必须含 primitives（require 表供给：dsh-client-modules makeRequire）')
  assert.ok(pkg.peerDependencies['@deepseek-ai/dsh-client-ui-primitives'], 'peer 声明（@deepseek-ai/* 共享包宿主拦截层供给）')
  assert.ok(pkg.devDependencies['@deepseek-ai/dsh-client-ui-primitives'], 'dev 声明（独立 node --test 面）')
  assert.match(source, /require\(['"]@deepseek-ai\/dsh-client-ui-primitives['"]\)/, 'factory 真 require 原生控件包')
  for (const comp of ['Switch', 'Button', 'Input', 'Modal']) {
    assert.match(source, new RegExp(`ui\\.${comp}\\b`), `设置节须用原生 ${comp}（§3.2 原生控件组件行）`)
  }
})

test('F2 样式面（§3.2）：dsh token 唯一色板（零硬编码色值/零暗色分支）+ 节容器/标题/引言/rows/rowCard/行名/字段几何契约 + 幂等注入', () => {
  assert.match(source, /typeof document\s*!==\s*['"]undefined['"]/, 'style 注入必须守卫 document（Node/测试环境无 document 不炸）')
  assert.match(source, /data-plugin-css/, 'style 幂等标记（claimStyles 归属）')
  assert.match(source, /getElementById\(STYLE_ID\)/, 'style 幂等注入（重入不重复插）')
  const cssMatch = source.match(/var SETTINGS_CSS = \[([\s\S]*?)\]\.join/)
  assert.ok(cssMatch, '样式集中在 SETTINGS_CSS（单文件自包含，零构建可注入）')
  const css = cssMatch[1]
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, '禁硬编码色值（hex）')
  assert.doesNotMatch(css, /rgba?\(/i, '禁硬编码色值（rgb/rgba）')
  assert.doesNotMatch(css, /hsla?\(/i, '禁硬编码色值（hsl/hsla）')
  assert.doesNotMatch(source, /prefers-color-scheme|data-ds-dark-theme/, '暗色随宿主 --dsw-alias-* 别名自动适配，禁 media query/分支')

  // §3.2 逐项几何（zGbnIq 原生设置节契约）
  const section = cssRule(css, 'wiki-steward-settings')
  assert.match(section, /max-width:720px/, '节容器 max-width 720px')
  assert.match(section, /flex-direction:column/, '节容器纵向')
  assert.match(section, /gap:12px/, '节容器 column gap 12px')
  const title = cssRule(css, 'wiki-steward-settings-title')
  assert.match(title, /font-size:16px/, '标题 16px')
  assert.match(title, /font-weight:500/, '标题 500')
  assert.match(title, /line-height:24px/, '标题 24px 行高')
  const intro = cssRule(css, 'wiki-steward-settings-intro')
  assert.match(intro, /font-size:14px/, '引言 14px')
  assert.match(intro, /line-height:22px/, '引言 22px 行高')
  assert.match(intro, /var\(--dsw-alias-label-tertiary\)/, '引言 tertiary（§3.2）')
  const rows = cssRule(css, 'wiki-steward-settings-rows')
  assert.match(rows, /gap:8px/, 'rows 间距 8px')
  assert.match(rows, /margin:12px 0 0/, 'rows 上边距 12px')
  const card = cssRule(css, 'wiki-steward-settings-rowCard')
  assert.match(card, /padding:12px 14px/, '行卡片 padding 12px 14px')
  assert.match(card, /gap:12px/, '行卡片 gap 12px')
  assert.match(card, /border:\.5px solid var\(--dsw-alias-settings-card-stroke\)/, '行卡片描边 card-stroke token')
  assert.match(card, /background:var\(--dsw-alias-settings-card-fill\)/, '行卡片底 card-fill token')
  assert.match(card, /border-radius:var\(--dsw-radius-xl\)/, '行卡片圆角 radius-xl')
  const rowName = cssRule(css, 'wiki-steward-settings-rowName')
  assert.match(rowName, /font-size:14px/, '行名 14px')
  assert.match(rowName, /font-weight:500/, '行名 500')
  assert.match(rowName, /line-height:22px/, '行名 22px 行高')
  const field = cssRule(css, 'wiki-steward-settings-field')
  assert.match(field, /flex-direction:column/, '字段纵向')
  assert.match(field, /gap:6px/, '字段列 gap 6px')
  // 输入框几何：宿主 Input 原生控件（.wrap=32px 高/.5px l4 描边/radius-md/bg layer-1/focus business-primary，
  // Input.module.css）+ 本节补齐 §3.2 剩余项（padding 0 10px、宽度 100%）
  const input = cssRule(css, 'wiki-steward-settings-input')
  assert.match(input, /height:32px/, '输入框高 32px')
  assert.match(input, /padding:0 10px/, '输入框 padding 0 10px')
  assert.match(input, /width:100%/, '输入框撑满字段列')
})

test('F2 设置节 DOM 形（§3.2）：节容器 > 标题/引言 > rows 容器 > rowCard 每字段一卡（行名/字段/注记分层）', async () => {
  const { tree } = await f2Tree({ capture: { enabled: true, bufferRounds: 3 }, vaultRoot: '/mnt/unraid_data/Obsidian' })
  assert.equal(tree.props['data-dsh-plugin'], 'wiki-steward', '根容器插件标记保持')
  assert.match(tree.props.className, /wiki-steward-settings/, '根=节容器类（720px/column/12px）')
  assert.ok(find(tree, (n) => typeof n.props?.className === 'string' && n.props.className.includes('wiki-steward-settings-title')), '标题层（16px/24px 500）')
  assert.ok(find(tree, (n) => typeof n.props?.className === 'string' && n.props.className.includes('wiki-steward-settings-intro')), '引言层（14px/22px tertiary）')
  assert.ok(find(tree, (n) => typeof n.props?.className === 'string' && n.props.className.includes('wiki-steward-settings-rows')), 'rows 列表容器（gap 8px/margin 12px 0 0）')
  const rows = rowsOf(tree)
  assert.ok(rows.length >= 3, '每字段一行卡（editable+readonly 全量）')
  let noted = 0
  for (const row of rows) {
    const card = row.type(row.props)
    assert.match(card.props.className, /rowCard/, '每卡=rowCard（stroke/fill/radius-xl/padding 12px 14px）')
    assert.ok(find(card, (n) => typeof n.props?.className === 'string' && n.props.className.includes('rowName')), '卡内行名（14px/22px 500）')
    assert.ok(find(card, (n) => typeof n.props?.className === 'string' && n.props.className.includes('wiki-steward-settings-field')), '卡内字段列（gap 6px）')
    if (row.props.field.note) {
      noted += 1
      assert.ok(find(card, (n) => typeof n.props?.className === 'string' && n.props.className.includes('wiki-steward-settings-note')), '卡内注记（12px/18px tertiary）')
    }
  }
  assert.ok(noted >= 2, '带 note 字段（定时开关/执行时间双源提示）的注记分层在场')
})

test('F2 控件形（§3.2）：布尔=Switch 行内形、数字=number、时间=time（原生语义保持）；按钮=原生 Button 36px 形（保存 primary/动作 outline）', async () => {
  const { tree } = await f2Tree({ capture: { enabled: true, bufferRounds: 3 }, ingest: { schedule: { enabled: false, time: '23:30' } } })
  const rows = rowsOf(tree)
  const boolRow = rows.find((c) => c.props.field.kind === 'boolean')
  const numRow = rows.find((c) => c.props.field.kind === 'number')
  const timeRow = rows.find((c) => c.props.field.kind === 'time')
  assert.ok(boolRow && numRow && timeRow, '三类控件各就位')
  assert.ok(find(boolRow.type(boolRow.props), (n) => n.props && n.props.role === 'switch'), '布尔=原生 Switch（行内形）')
  assert.ok(find(numRow.type(numRow.props), (n) => n.type === 'input' && n.props.type === 'number'), '数字=number 输入（原生语义保持）')
  assert.ok(find(timeRow.type(timeRow.props), (n) => n.type === 'input' && n.props.type === 'time'), '时间=time 输入（原生语义保持）')

  const save = saveButton(tree)
  assert.ok(save, '保存按钮（语义锚）')
  assert.equal(save.props['data-ws-variant'], 'primary', '保存=Button primary（button-primary-fill/foreground 族）')
  assert.equal(save.props['data-ws-size'], 'md', '保存=Button md（36px 形，Button.module.css .md）')
  assert.equal(save.props.disabled, false, '未保存态可点（行为面保持：空保存→如实提示）')

  const actions = findComp(tree, 'WikiStewardManualActions')
  const at = actions.type(actions.props)
  const scanBtn = find(at, (n) => n.type === 'button' && n.props['data-ws-action'] === 'scan')
  const distillBtn = find(at, (n) => n.type === 'button' && n.props['data-ws-action'] === 'distill')
  assert.ok(scanBtn && distillBtn, '手动两按钮带语义锚（行为面断言走既有 F3 测试）')
  assert.equal(scanBtn.props['data-ws-variant'], 'outline', '动作按钮=Button outline（secondary 形：.5px l3 描边）')
  assert.equal(scanBtn.props.disabled, false)

  const hist = findComp(tree, 'WikiStewardHistoryEntry')
  const histBtn = find(hist.type(hist.props), (n) => n.type === 'button' && n.props['data-ws-action'] === 'history')
  assert.ok(histBtn, '历史入口按钮带语义锚')
  assert.equal(histBtn.props['data-ws-variant'], 'outline', '历史入口=Button outline')
})

test('F2 历史弹层=原生 Modal（title/closeLabel 契约）；开合/挂载行为面零变化', async () => {
  const { Section, tree } = await f2Tree({})
  const entry = findComp(tree, 'WikiStewardHistoryEntry')
  const closedTree = entry.type(entry.props)
  assert.equal(find(closedTree, (n) => n.props && n.props.role === 'dialog'), null, '未开=无 dialog')

  entry.props.onToggle()
  const openEntry = findComp(Section(), 'WikiStewardHistoryEntry')
  const openTree = openEntry.type(openEntry.props)
  const dialog = find(openTree, (n) => n.props && n.props.role === 'dialog')
  assert.ok(dialog, '点开=原生 Modal dialog')
  assert.equal(dialog.props['aria-label'], 'wiki-steward · 历史记录', 'Modal title 契约（aria-label）')
  const closeBtn = find(dialog, (n) => n.type === 'button' && n.props['aria-label'] === '关闭')
  assert.ok(closeBtn, 'Modal 关闭钮（closeLabel=关闭）')
  assert.ok(findComp(openTree, 'WikiStewardHistoryMount'), '弹层内日志视图挂载容器（行为面不变）')

  closeBtn.props.onClick() // 关闭
  const after = findComp(Section(), 'WikiStewardHistoryEntry')
  assert.equal(after.props.open, false, '关闭=收起（Modal onClose→onToggle，行为面不变）')
})
