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
  const effects = []
  let hookState = null
  const reactStub = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useRef: (init) => ({ current: init }),
    useEffect: (fn) => { effects.push(fn) },
    useState: (init) => {
      if (hookState === null) hookState = { v: init }
      const ref = hookState
      return [ref.v, (next) => { ref.v = typeof next === 'function' ? next(ref.v) : next }]
    },
  }
  const req = (name) => {
    if (name === 'react') return reactStub
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
  assert.ok(find(tree, (n) => n.type === 'button') !== null, '可写面有保存按钮')
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
  const rowElems = tree.children.find((c) => Array.isArray(c)) ?? []
  const editableRow = rowElems.find((c) => c && c.props && c.props.field && c.props.field.path.join('.') === 'capture.enabled')
  editableRow.props.onChange(false)
  tree = Section()
  const button = find(tree, (n) => n.type === 'button')
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
  const rowElems = tree.children.find((c) => Array.isArray(c)) ?? []
  const editableRow = rowElems.find((c) => c && c.props && c.props.field)
  editableRow.props.onChange(false)
  tree = Section()
  find(tree, (n) => n.type === 'button').props.onClick()
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
