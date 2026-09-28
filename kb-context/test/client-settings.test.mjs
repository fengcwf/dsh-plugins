// client-settings 单测（kb-context 客户端面官方契约）：
// 被测件：lib/client.js —— window.__ModuleLoader__ 工厂形（零构建、React 无 JSX）。
// 契约（裁定 2026-09-28「kb-context 插件也在设置菜单添加相关设置配置」）：
// settings.section 命名空间注册（better-sidebar 路线，navLabel 进设置页）；纯设置无面板行
// （不注册 sidebar.panellist / main / settings.plugins.tab）；取数/保存走文档相对
// api/kb-context/settings（issue #1707 教训：无前导斜杠/相对 base）。
// 可改=triggers.words/entityPaths、budget、timeoutMs、scope；hotMap/vaultRoot 只读展示。
// 零 mock 姿势：假缝只承接宿主最小形（__ModuleLoader__/require/ctx.slots/React 钩子/fetch），
// 设置取数走 exports.__fetch 注入缝（插桩非 mock）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const CLIENT_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const source = fs.readFileSync(CLIENT_PATH, 'utf8')

function loadClientFace() {
  const loaded = []
  const win = { __ModuleLoader__: { load: (m) => loaded.push(m) } }
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

test('client.js 是 __ModuleLoader__ 工厂形，id=kb-context，导出 {inject, apply, __fetch}', () => {
  assert.match(source, /^(\s*\/\/[^\n]*\n)*\s*window\.__ModuleLoader__\.load\(\{/, '必须是工厂形（浏览器 bundle 契约）')
  const { loaded, mod } = loadClientFace()
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].id, 'kb-context')
  assert.equal(typeof loaded[0].factory, 'function')
  assert.deepEqual(mod.inject, ['slots'])
  assert.equal(typeof mod.apply, 'function')
  assert.equal(typeof mod.__fetch, 'function')
})

test('纯设置无面板行：只注册 settings.section（不注册 sidebar.panellist/main/settings.plugins.tab）', () => {
  const { mod } = loadClientFace()
  const registered = []
  const injected = []
  mod.apply(mkCtx(registered, injected))
  assert.deepEqual(injected, ['settings.section'])
  assert.deepEqual(registered.map((r) => r.decl.name), ['settings.section'])
})

test('root 壳槽位禁注册（launcher/trigger/header/close/action/onboarding）；settings.section 是官方贡献面', () => {
  const { mod } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const names = registered.map((r) => r.decl.name)
  for (const banned of ['settings.launcher', 'settings.trigger', 'settings.header', 'settings.close', 'settings.action', 'settings.onboarding']) {
    assert.ok(!names.includes(banned), `root 壳槽位禁注册：${banned}`)
  }
  assert.ok(names.includes('settings.section'))
})

test('settings 命名空间注册形（better-sidebar 路线）：{name,id,order,label 函数,组件函数}', () => {
  const { mod } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const { decl, component } = registered[0]
  assert.equal(decl.name, 'settings.section')
  assert.equal(decl.id, 'kb-context')
  assert.equal(typeof decl.order, 'number')
  assert.equal(typeof decl.label, 'function')
  assert.ok(decl.label().length > 0)
  assert.equal(typeof component, 'function')
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

test('设置面组件：GET api/kb-context/settings 载入（文档相对）→ ready 渲染（可改+只读两面）', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const Section = registered[0].component
  const calls = []
  mod.__fetch = async (url) => {
    calls.push(url)
    return {
      json: async () => ({
        data: {
          config: { triggers: { words: ['OA'], entityPaths: [] }, budget: { maxSnippets: 3, maxTokens: 2000 }, timeoutMs: 1500, scope: { indexAll: ['wiki'], grepOnDemand: [] }, hotMap: { enabled: false, maxChars: 600 }, vaultRoot: '/mnt/unraid_data/Obsidian' },
          editable: [['triggers', 'words'], ['timeoutMs']],
          writable: true,
        },
      }),
    }
  }
  Section()
  effects[0]()
  await tick()
  await tick()
  assert.deepEqual(calls, ['api/kb-context/settings'])
  const tree = Section()
  assert.equal(tree.props['data-dsh-plugin'], 'kb-context')
  assert.ok(find(tree, (n) => n.type === 'button') !== null, '可写面有保存按钮')
  const all = JSON.stringify(tree.children)
  assert.match(all, /触发词面/, 'triggers.words 可改面在')
  assert.match(all, /热图/, 'hotMap 只读展示在')
})

test('设置面组件：保存=POST {patch:变更叶子}（triggers.words 数组整替），成功 notice 如实', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const Section = registered[0].component
  const calls = []
  mod.__fetch = async (url, init) => {
    calls.push({ url, init })
    if (init && init.method === 'POST') {
      return { json: async () => ({ data: { ok: true, config: { triggers: { words: ['OA', '用友'] } } } }) }
    }
    return { json: async () => ({ data: { config: { triggers: { words: ['OA'] } }, writable: true, editable: [['triggers', 'words']] } }) }
  }
  Section()
  effects[0]()
  await tick()
  await tick()
  let tree = Section()
  const rowElems = tree.children.find((c) => Array.isArray(c)) ?? []
  const row = rowElems.find((c) => c && c.props && c.props.field && c.props.field.path.join('.') === 'triggers.words')
  row.props.onChange(['OA', '用友'])
  tree = Section()
  find(tree, (n) => n.type === 'button').props.onClick()
  await tick()
  await tick()
  const post = calls.find((c) => c.init && c.init.method === 'POST')
  assert.ok(post)
  assert.equal(post.url, 'api/kb-context/settings')
  assert.deepEqual(JSON.parse(post.init.body), { patch: { triggers: { words: ['OA', '用友'] } } }, '数组整替（一行一项）')
  tree = Section()
  assert.ok(find(tree, (n) => typeof n.props?.className === 'string' && n.props.className.includes('ok')), '成功 notice 如实')
})

test('设置面组件：服务端拒绝（not_editable）= 判据原文展示，绝不静默；载入失败=容器内如实报错', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const Section = registered[0].component
  mod.__fetch = async (url, init) => {
    if (init && init.method === 'POST') {
      return { json: async () => ({ error: { code: 'not_editable', message: '字段 hotMap.enabled 不在可改白名单' } }) }
    }
    return { json: async () => ({ data: { config: {}, writable: true, editable: [] } }) }
  }
  Section()
  effects[0]()
  await tick()
  await tick()
  let tree = Section()
  const rowElems = tree.children.find((c) => Array.isArray(c)) ?? []
  rowElems.find((c) => c && c.props && c.props.field).props.onChange(false)
  tree = Section()
  find(tree, (n) => n.type === 'button').props.onClick()
  await tick()
  await tick()
  tree = Section()
  const err = find(tree, (n) => typeof n.props?.className === 'string' && n.props.className.includes('error'))
  assert.ok(err)
  assert.match(JSON.stringify(err.children), /不在可改白名单/)

  // 载入失败面（另一组件实例：重置 hook 槽需重新加载工厂）
  const face2 = loadClientFace()
  const reg2 = []
  face2.mod.apply(mkCtx(reg2, []))
  face2.mod.__fetch = async () => { throw new Error('fetch failed') }
  reg2[0].component()
  face2.effects[0]()
  await tick()
  await tick()
  const tree2 = reg2[0].component()
  const err2 = find(tree2, (n) => typeof n.props?.className === 'string' && n.props.className.includes('error'))
  assert.ok(err2, '载入失败必须如实可见')
  assert.match(JSON.stringify(err2.children), /fetch failed|载入失败/)
})
