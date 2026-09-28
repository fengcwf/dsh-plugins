// client-module — 0.2.0 fix-ui-port 问题 B：客户端模块契约（照 @linxin666/dsh-client-ui-skill-explorer）。
// 零构建手写 lib/client.js：window.__ModuleLoader__.load({id, factory:(require)=>exports})；
// 真加载（node import 真执行）+ 工厂产物形断言 + 面板注册契约（sidebar.panellist 行 + main 槽页）。
// 宿主缝（window.__ModuleLoader__/require/react/slots）是 dsh web 客户端运行时设施，
// node 侧以记录器承载——被测物=client.js 真实代码与真实调用形，零业务 mock。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const CLIENT_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url))

/** 加载 client.js 并捕获 __ModuleLoader__ 定义（真 import 真执行，顶层 load 调用真发生） */
async function loadDefinition() {
  const captured = {}
  const prev = globalThis.window
  globalThis.window = {
    __ModuleLoader__: {
      load(def) { captured.def = def },
    },
  }
  try {
    await import(`${pathToFileURL(CLIENT_PATH).href}?t=${Date.now()}`)
  } finally {
    if (prev === undefined) delete globalThis.window
    else globalThis.window = prev
  }
  return captured.def
}

/** React 记录器（宿主运行时模块）：createElement 按 React 元素形记录 */
function makeReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children }
    },
  }
}

/** slots 宿主缝记录器（形照 @deepseek-ai/dsh-client-ui-slots：inject 回调返回 register disposer，
 *  inject disposer 撤销时连带撤销回调内注册——skill-explorer disposers.push(slots.inject(...)) 同款） */
function makeSlotsCtx() {
  const injected = []
  const registered = []
  const effects = []
  const slots = {
    inject(name, cb) {
      const entry = { name, cb: null, cleanup: null }
      entry.cb = () => { entry.cleanup = cb() }
      injected.push(entry)
      return () => {
        if (typeof entry.cleanup === 'function') entry.cleanup()
        const at = injected.indexOf(entry)
        if (at !== -1) injected.splice(at, 1)
      }
    },
    register(desc, component) {
      const entry = { desc, component }
      registered.push(entry)
      return () => {
        const at = registered.indexOf(entry)
        if (at !== -1) registered.splice(at, 1)
      }
    },
  }
  return { ctx: { slots, effect: (fn) => effects.push(fn) }, injected, registered, effects }
}

// ── ① 真加载：顶层 window.__ModuleLoader__.load 契约 ─────────────────────────────────
test('① client.js 真加载：window.__ModuleLoader__.load({id:"obsidian-web", factory}) 定义被真捕获', async () => {
  const def = await loadDefinition()
  assert.ok(def, 'client.js 必须调用 window.__ModuleLoader__.load')
  assert.equal(def.id, 'obsidian-web', '模块 id=包名（loader 按 <id>/client 归一）')
  assert.equal(typeof def.factory, 'function', 'factory 必须是函数')
})

// ── ② 工厂产物形：exports.apply/inject 在（node 加载断言）────────────────────────────
test('② 工厂产物形：factory(require) → exports.apply 函数 + exports.inject 服务名数组', async () => {
  const def = await loadDefinition()
  const react = makeReact()
  const requireStub = (name) => {
    if (name === 'react') return react
    throw new Error(`client.js 只应 require("react")，实际：${name}`)
  }
  const exports = def.factory(requireStub)
  assert.equal(typeof exports.apply, 'function', 'exports.apply 必须在（加载断言）')
  assert.ok(Array.isArray(exports.inject), 'exports.inject 必须在（加载断言）')
  assert.deepEqual([...exports.inject], ['slots'], '客户端服务面=slots（面板注册缝）')
})

// ── ③ 面板注册契约：sidebar.panellist 行 + main 槽页（照 skill-explorer hHd-Xa_panelRow）──
test('③ apply 注册 sidebar.panellist 行（id/order/label）+ main 槽页（iframe 指 /ob/ 静态面）', async () => {
  const def = await loadDefinition()
  const react = makeReact()
  const exports = def.factory((name) => {
    assert.equal(name, 'react')
    return react
  })
  const { ctx, injected, registered, effects } = makeSlotsCtx()
  exports.apply(ctx)
  // 两个槽位都经 slots.inject 等待宿主声明（壳未声明=面板缺席不炸装载，skill-explorer 同款）
  assert.deepEqual(injected.map((x) => x.name).sort(), ['main', 'sidebar.panellist'], '槽位=sidelist 行 + main 页')
  // 行注册形
  injected.find((x) => x.name === 'sidebar.panellist').cb()
  const row = registered.find((x) => x.desc.name === 'sidebar.panellist')
  assert.ok(row, 'sidebar.panellist 注册必须发生')
  assert.equal(row.desc.id, 'obsidian-web', '行 id=插件 id')
  assert.equal(typeof row.desc.order, 'number', 'order 必须是数值（排序键）')
  assert.equal(row.desc.label(), 'Obsidian vault', '行 label 契约字面')
  assert.equal(typeof row.component, 'function', '行图标组件必须在')
  // main 槽页形
  injected.find((x) => x.name === 'main').cb()
  const page = registered.find((x) => x.desc.name === 'main')
  assert.ok(page, 'main 槽页注册必须发生')
  assert.equal(page.desc.key, 'obsidian-web', 'main key 与行 id 同源（选中联动）')
  const el = page.component({})
  assert.equal(el.type, 'iframe', '槽页=iframe 指既有 /ob/ 静态面（三栏 UI 已存在）')
  assert.equal(el.props.src, '/ob/', 'iframe src=/ob/（web-routes prefix /ob 既有面）')
  // 收敛：apply 交出 effect disposer，执行后两注册全撤（不悬挂）
  assert.equal(effects.length, 1, 'apply 必须交 ctx.effect 收敛')
  effects[0]()
  assert.equal(registered.length, 0, 'dispose 后注册全撤')
})

// ── ④ manifest：dsh.client 声明进快照（files 含 lib，client 产物可分发）────────────────
test('④ package.json：dsh.client 三件 inject + platform:web；exports["./client"]→lib/client.js；files 含 lib', () => {
  const pkg = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  assert.deepEqual(pkg.dsh?.client?.inject, [
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-renderer',
    '@deepseek-ai/dsh-client-ui-layout',
  ], 'dsh.client.inject 照 skill-explorer 三件')
  assert.equal(pkg.dsh?.client?.platform, 'web', 'dsh.client.platform=web')
  assert.equal(pkg.exports?.['./client'], './lib/client.js', 'exports["./client"]=客户端半包（host 按此定位 client bundle）')
  assert.ok(pkg.files.includes('lib'), 'files 必须含 lib（client.js 进安装快照）')
})
