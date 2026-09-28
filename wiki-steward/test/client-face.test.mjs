// client-face 单测（dsh 客户端面官方契约）：
// 被测件：lib/client.js —— window.__ModuleLoader__ 工厂形（零构建、React 无 JSX）。
// 契约（裁定 2026-09-28）：①settings.section 命名空间注册（better-sidebar 路线，navLabel 进设置页）
// ②sidebar.panellist 行 + main 槽页（slots.register 形照 skill-explorer）③弃 settings.plugins.tab
// 自造页签与站内绝对 '/wiki-steward/panel.js'（生产 404 根因）——panel.js 改文档相对
// 'api/wiki-steward/panel.js'（官方 prefix 路由面服务，issue #1707 教训：无前导斜杠/相对 base）。
// 零 mock 姿势：假缝只承接宿主最小形（__ModuleLoader__/require/ctx.slots/React 钩子/fetch），
// 被测逻辑=注册契约与挂载/取数缝本身，全真跑真断言。面板加载走 exports.__panelLoader 注入缝、
// 设置取数走 exports.__fetch 注入缝（插桩非 mock）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

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
  // 假 React 钩子（最小形）：createElement 记树、useRef 返对象、useEffect 排队（测试驱动执行）、useState 单槽（测试驱动重渲染）
  const effects = []
  let hookState = null
  const reactStub = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useRef: (init) => ({ current: init }),
    useEffect: (fn) => { effects.push(fn) },
    useState: (init) => {
      if (hookState === null) hookState = { v: init }
      const ref = hookState
      return [ref.v, (next) => { ref.v = next }]
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
  const code = source.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n') // 注释里的旧路径示例不算引用
  assert.ok(!code.includes("'/wiki-steward"), '不得再引站内绝对 /wiki-steward/*（login-gate 基址下 404 根因）')
  assert.ok(!code.includes('"/wiki-steward'), '同上（双引号形）')
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const page = registered.find((r) => r.decl.name === 'main').component
  const seen = []
  mod.__panelLoader = async (url) => { seen.push(url); return { mount: () => ({ unmount: () => {} }) } }
  const tree = page()
  tree.props.ref.current = { textContent: '' }
  effects[0]()
  await tick()
  assert.deepEqual(seen, ['api/wiki-steward/panel.js'], 'panel.js 必须文档相对请求（无前导斜杠）')
})

// ── 注册面（settings 命名空间 + 面板两面）────────────────────────────────────
test('注册面=正确三面：settings.section + sidebar.panellist + main；不再注册 settings.plugins.tab', () => {
  const { mod } = loadClientFace()
  const registered = []
  const injected = []
  mod.apply(mkCtx(registered, injected))
  assert.deepEqual(injected, ['settings.section', 'sidebar.panellist', 'main'])
  assert.deepEqual(registered.map((r) => r.decl.name), ['settings.section', 'sidebar.panellist', 'main'])
  for (const r of registered) assert.notEqual(r.decl.name, 'settings.plugins.tab', '自造页签已弃（菜单页签不对的根因）')
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

test('面板两面注册形（skill-explorer 形）：sidebar.panellist 行 {id,order,label}；main 槽页用 key', () => {
  const { mod } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const row = registered.find((r) => r.decl.name === 'sidebar.panellist')
  assert.equal(row.decl.id, 'wiki-steward')
  assert.equal(typeof row.decl.order, 'number')
  assert.equal(typeof row.decl.label, 'function')
  assert.equal(typeof row.component, 'function')
  const page = registered.find((r) => r.decl.name === 'main')
  assert.equal(page.decl.key, 'wiki-steward')
  assert.equal(typeof page.decl.inject, 'function')
  assert.equal(typeof page.component, 'function')
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

// ── main 槽页组件：Vue 面挂载缝（mount/unmount 契约 + 清理幂等）───────────────
test('main 槽页：挂载 Vue 面板（__panelLoader 注入缝）→ mount(el, {apiBase})，清理=unmount+清空', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const { component: Page } = registered.find((r) => r.decl.name === 'main')

  const mounts = []
  const unmounts = []
  mod.__panelLoader = async () => ({
    mount: (el, deps) => {
      mounts.push({ el, deps })
      return { unmount: () => { unmounts.push(1) } }
    },
  })

  effects.length = 0
  const tree = Page()
  assert.equal(tree.type, 'div', '槽位容器=单 div（Vue 面挂进 ref 节点）')
  const el = { textContent: '' }
  tree.props.ref.current = el
  const cleanup = effects[0]()
  await tick()
  assert.equal(mounts.length, 1)
  assert.equal(mounts[0].el, el)
  assert.equal(mounts[0].deps.apiBase, 'api/wiki-steward', 'apiBase 文档相对（与面板请求同基）')
  cleanup()
  await tick()
  assert.equal(unmounts.length, 1)
  assert.equal(el.textContent, '', '清理=unmount+容器清空（无残影）')
})

test('main 槽页：面板加载失败 = 容器内如实报错（不白屏不吞），清理仍幂等', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const { component: Page } = registered.find((r) => r.decl.name === 'main')
  mod.__panelLoader = async () => { throw new Error('panel 404') }

  effects.length = 0
  const tree = Page()
  const el = { textContent: '' }
  tree.props.ref.current = el
  const cleanup = effects[0]()
  await tick()
  assert.match(el.textContent, /panel 404|加载失败/, '失败必须如实可见')
  cleanup()
  cleanup() // 幂等：双清理不炸
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
