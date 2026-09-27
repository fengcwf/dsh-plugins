// client-face 单测（dsh 客户端面：settings.plugins.tab 页签注册 + Vue 面挂载缝）：
// 被测件：lib/client.js —— window.__ModuleLoader__ 工厂形（零构建），apply 走 ctx.slots.inject
// 注册 `settings.plugins.tab`（settings 子面=页签；root 壳槽位 launcher/trigger/header/section 禁注册），
// 页签组件把 web/dist 的 Vue 面板挂进槽位 DOM（mount/unmount 契约 + 清理幂等）。
// 零 mock 姿势（wire.test 同款）：假缝只承接宿主最小形（__ModuleLoader__/require/ctx.slots/React 钩子），
// 被测逻辑=注册契约与挂载缝本身，全真跑真断言。面板加载走 exports.__panelLoader 注入缝（插桩非 mock）。
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
  // 假 React 钩子（最小形）：createElement 记树、useRef 返对象、useEffect 排队（测试驱动执行）
  const effects = []
  const reactStub = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useRef: (init) => ({ current: init }),
    useEffect: (fn) => { effects.push(fn) },
  }
  const mod = { exports: {} }
  const req = (name) => {
    if (name === 'react') return reactStub
    throw new Error(`unexpected require: ${name}`)
  }
  // 工厂形脚本求值（登记 factory）→ 按 loader 语义调 factory(require) 得模块导出面
  const fn = new Function('window', source)
  fn(win)
  assert.equal(loaded.length, 1, 'bundle 必须登记一个模块')
  const exportsFace = loaded[0].factory(req)
  void mod
  return { loaded, mod: exportsFace, effects, reactStub }
}

// ── 工厂形与导出契约 ────────────────────────────────────────────────────────
test('client.js 是 __ModuleLoader__ 工厂形，id=wiki-steward，导出 {inject, apply}', () => {
  assert.match(source, /^(\s*\/\/[^\n]*\n)*\s*window\.__ModuleLoader__\.load\(\{/, '必须是工厂形（浏览器 bundle 契约；头注释可前置）')
  const { loaded, mod } = loadClientFace()
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].id, 'wiki-steward')
  assert.equal(typeof loaded[0].factory, 'function')
  assert.deepEqual(mod.inject, ['slots'], '只取 slots 缝（settings 页签注册）')
  assert.equal(typeof mod.apply, 'function')
})

test('root 壳槽位禁注册：只碰 settings.plugins.tab（不注册 launcher/trigger/header/close/section）', () => {
  const { mod } = loadClientFace()
  const injected = []
  const registered = []
  const ctx = {
    slots: {
      inject: (name, setup) => { injected.push(name); return setup() },
      register: (decl, component) => { registered.push({ decl, component }); return () => {} },
    },
    logger: { warn: () => {} },
    effect: (fn) => { fn(); return () => {} },
  }
  mod.apply(ctx)
  assert.deepEqual(injected, ['settings.plugins.tab'])
  assert.equal(registered.length, 1)
  const names = registered.map((r) => r.decl.name)
  for (const banned of ['settings.launcher', 'settings.trigger', 'settings.header', 'settings.close', 'settings.action', 'settings.section', 'settings.onboarding']) {
    assert.ok(!names.includes(banned), `root 壳槽位禁注册：${banned}`)
  }
})

test('页签注册形：id=wiki-steward、order 稳定、label 函数给文案、组件是函数', () => {
  const { mod } = loadClientFace()
  const registered = []
  const ctx = {
    slots: {
      inject: (_n, setup) => setup(),
      register: (decl, component) => { registered.push({ decl, component }); return () => {} },
    },
    logger: { warn: () => {} },
    effect: (fn) => { fn(); return () => {} },
  }
  mod.apply(ctx)
  const { decl, component } = registered[0]
  assert.equal(decl.name, 'settings.plugins.tab')
  assert.equal(decl.id, 'wiki-steward')
  assert.equal(typeof decl.order, 'number')
  assert.equal(typeof decl.label, 'function')
  assert.ok(decl.label().length > 0, '页签文案非空')
  assert.equal(typeof component, 'function')
})

test('slots.register 抛错 = 吞+兜底 disposer（页签缺失绝不炸插件）', () => {
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
})

// ── 页签组件：Vue 面挂载缝（mount/unmount 契约 + 清理幂等）───────────────────
test('组件：挂载 Vue 面板（__panelLoader 注入缝）→ mount(el, {apiBase})，清理=unmount+清空', async () => {
  const { mod, effects, reactStub } = loadClientFace()
  const registered = []
  const ctx = {
    slots: {
      inject: (_n, setup) => setup(),
      register: (decl, component) => { registered.push({ decl, component }); return () => {} },
    },
    logger: { warn: () => {} },
    effect: (fn) => { fn(); return () => {} },
  }
  mod.apply(ctx)
  const { component: Tab } = registered[0]

  const mounts = []
  const unmounts = []
  mod.__panelLoader = async () => ({
    mount: (el, deps) => {
      mounts.push({ el, deps })
      return { unmount: () => { unmounts.push(1) } }
    },
  })

  // 驱动组件：假 React 钩子最小形（useRef 返回树上的 ref 对象；effect 测试驱动执行）
  effects.length = 0
  const tree = Tab()
  assert.equal(tree.type, 'div', '槽位容器=单 div（Vue 面挂进 ref 节点）')
  const el = { textContent: '' }
  tree.props.ref.current = el
  const cleanup = effects[0]()
  await new Promise((res) => setTimeout(res, 0)) // 让 loader promise 落定
  assert.equal(mounts.length, 1)
  assert.equal(mounts[0].el, el)
  assert.equal(mounts[0].deps.apiBase, '/wiki-steward/api')
  cleanup()
  await new Promise((res) => setTimeout(res, 0))
  assert.equal(unmounts.length, 1)
  assert.equal(el.textContent, '', '清理=unmount+容器清空（无残影）')
})

test('组件：面板加载失败 = 容器内如实报错（不白屏不吞），清理仍幂等', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  const ctx = {
    slots: {
      inject: (_n, setup) => setup(),
      register: (decl, component) => { registered.push({ decl, component }); return () => {} },
    },
    logger: { warn: () => {} },
    effect: (fn) => { fn(); return () => {} },
  }
  mod.apply(ctx)
  const { component: Tab } = registered[0]
  mod.__panelLoader = async () => { throw new Error('panel 404') }

  effects.length = 0
  const tree = Tab()
  const el = { textContent: '' }
  tree.props.ref.current = el
  const cleanup = effects[0]()
  await new Promise((res) => setTimeout(res, 0))
  assert.match(el.textContent, /panel 404|加载失败/, '失败必须如实可见')
  cleanup()
  cleanup() // 幂等：双清理不炸
})
