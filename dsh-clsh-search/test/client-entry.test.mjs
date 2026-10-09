// client-entry.test.mjs — W6.6：挂载入口串联件（Ruling-15 A）
// 假宿主装载全链：__ModuleLoader 工厂 → settings.section 注册 → 面板动态 import → mount/unmount 实证。
// 离线：沙箱载工厂（new Function 注入 window/document）+ 假 react/slots + 假面板模块（mkdtemp），
// 另以真 web/dist 构建物做动态 import 可达实证。不触网、不写真实 home。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const CLIENT_JS = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const WEB_DIST = fileURLToPath(new URL('../web/dist', import.meta.url))
const PACKAGE_JSON = fileURLToPath(new URL('../package.json', import.meta.url))

/** 沙箱装载：window/document 形参注入执行 client.js，捕获 __ModuleLoader__.load 规约。 */
function loadClientSpec(baseURI) {
  const windowShim = { __ModuleLoader__: { load(spec) { windowShim.__spec = spec } } }
  const documentShim = { baseURI }
  const source = readFileSync(CLIENT_JS, 'utf8')
  const run = new Function('window', 'document', `${source}\n;return window.__spec;`)
  return run(windowShim, documentShim)
}

/** 假 react：useRef 返固定容器、useEffect 同步执行并登记 cleanup、createElement 记录。 */
function fakeReact(holder) {
  const state = { cleanups: [], created: [] }
  return {
    state,
    useRef: () => ({ current: holder }),
    useEffect: (fn) => {
      const cleanup = fn()
      state.cleanups.push(cleanup)
      return cleanup
    },
    createElement: (type, props, ...children) => {
      const node = { type, props, children }
      state.created.push(node)
      return node
    },
  }
}

/** 假容器元素（cleanup 清空语义的最小面）。 */
function fakeEl() {
  return { firstChild: null, textContent: '', removeChild() {} }
}

/** 假 slots（safeRegister 面）：inject 捕获 setup、register 捕获 decl+component、disposer 计数。 */
function fakeSlots({ registerThrows = false } = {}) {
  const state = { injected: [], registered: [], disposals: 0, warnings: [] }
  return {
    state,
    slots: {
      inject(slotName, setup) {
        state.injected.push({ slotName, setup })
        return () => { state.disposals += 1 }
      },
      register(decl, component) {
        if (registerThrows) throw new Error('槽位方缺席')
        state.registered.push({ decl, component })
        return () => { state.disposals += 1 }
      },
    },
    logger: { warn: (line) => state.warnings.push(String(line)) },
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

test('工厂形契约：__ModuleLoader 规约 + exports.apply/inject 面（wiki-steward 同形）', () => {
  const spec = loadClientSpec('file:///tmp/')
  assert.equal(spec.id, 'dsh-clsh-search')
  assert.equal(typeof spec.factory, 'function')
  const react = fakeReact(fakeEl())
  const mod = spec.factory((name) => (name === 'react' ? react : assert.fail(`意外 require：${name}`)))
  assert.equal(typeof mod.apply, 'function', 'exports.apply 在场')
  assert.deepEqual(mod.inject, ['slots'], 'exports.inject 契约（客户端服务名）')
  assert.equal(typeof mod.__panelLoader, 'function', '__panelLoader 测试缝在场（wiki-steward 同形）')
  assert.equal(Object.prototype.toString.call(mod), '[object Module]', 'Module toStringTag 形')
})

test('settings.section 注册（safeRegister 形）：decl 面 + 贡献组件 + 释放收敛；槽位缺席不炸', async () => {
  const spec = loadClientSpec('file:///tmp/')
  const react = fakeReact(fakeEl())
  const mod = spec.factory(() => react)
  const harness = fakeSlots()
  const dispose = mod.apply({ slots: harness.slots, logger: harness.logger })

  assert.equal(harness.state.injected.length, 1)
  assert.equal(harness.state.injected[0].slotName, 'settings.section', 'settings.section 命名空间注册')
  harness.state.injected[0].setup() // 壳 setup → register（捕获 decl+component）
  const { decl, component } = harness.state.registered[0]
  assert.equal(decl.name, 'settings.section')
  assert.equal(decl.id, 'dsh-clsh-search')
  assert.equal(typeof decl.order, 'number')
  assert.equal(decl.order, 50, 'W66-N1：独占 order（30/31/40 已被他插件占用，避免同值并列）')
  assert.equal(decl.label(), '搜索设置')
  assert.equal(typeof component, 'function', '贡献组件在场（React 函数组件形）')
  dispose()
  assert.equal(harness.state.disposals, 1, 'inject 面收敛（setup 注册面的回收归壳）')

  // 槽位方缺席（register 抛）= 该面缺席不炸插件，warn 留痕
  const harness2 = fakeSlots({ registerThrows: true })
  const mod2 = spec.factory(() => react)
  const dispose2 = mod2.apply({ slots: harness2.slots, logger: harness2.logger })
  const noop = harness2.state.injected[0].setup()
  assert.equal(typeof noop, 'function', '缺席路径返回空拆')
  assert.match(harness2.state.warnings.join('\n'), /注册失败/, '缺席留痕不静默')
  dispose2()
})

test('面板动态 import → mount → unmount 全链实证（假宿主 + 假面板记录器）', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-clsh-search-client-'))
  try {
    // 假面板落说明符子路径 api/dsh-clsh-search/main.js（与静态服务映射同形），记录 mount/unmount
    globalThis.__panelCalls = []
    const apiDir = path.join(dir, 'api', 'dsh-clsh-search')
    await mkdir(apiDir, { recursive: true })
    await writeFile(path.join(apiDir, 'main.js'), [
      'export function mount(el, deps) {',
      '  globalThis.__panelCalls.push({ mounted: true, el, deps })',
      '  return { unmount() { globalThis.__panelCalls.push({ unmounted: true }) } }',
      '}',
      'export default { mount }',
    ].join('\n'), 'utf8')

    const baseURI = pathToFileURL(dir + path.sep).href
    const spec = loadClientSpec(baseURI)
    const react = fakeReact(fakeEl())
    const mod = spec.factory(() => react)
    const harness = fakeSlots()
    mod.apply({ slots: harness.slots, logger: harness.logger })
    harness.state.injected[0].setup()
    const { component } = harness.state.registered[0]

    // 渲染贡献组件（假 react hooks 同步跑 effect → 动态 import 假面板 → mount）
    const holder = fakeEl()
    react.useRef = () => ({ current: holder })
    component()
    for (let i = 0; i < 10 && globalThis.__panelCalls.length < 1; i += 1) await tick()
    const calls = globalThis.__panelCalls
    assert.equal(calls.length, 1, '面板恰挂载一次')
    assert.equal(calls[0].mounted, true)
    assert.equal(calls[0].el, holder, '挂载容器=贡献组件容器')
    assert.equal(calls[0].deps.apiBase, 'api/dsh-clsh-search', 'deps.apiBase=文档相对设置接口基（issue #1707 口径）')

    // 卸载对称：cleanup → handle.unmount + 容器清空
    react.state.cleanups[0]()
    assert.deepEqual(calls[1], { unmounted: true }, 'unmount 成对')
  } finally {
    delete globalThis.__panelCalls
    await rm(dir, { recursive: true, force: true })
  }
})

test('真构建物动态 import 可达（静态面目标在场）+ 面板载入失败不炸设置页', async () => {
  // 真构建物经说明符子路径可达：api/dsh-clsh-search/main.js → web/dist/main.js（静态映射同形，symlink）
  const dirA = await mkdtemp(path.join(os.tmpdir(), 'dsh-clsh-search-client2-'))
  const dirB = await mkdtemp(path.join(os.tmpdir(), 'dsh-clsh-search-client3-'))
  try {
    const apiDirA = path.join(dirA, 'api', 'dsh-clsh-search')
    await mkdir(apiDirA, { recursive: true })
    await symlink(path.join(WEB_DIST, 'main.js'), path.join(apiDirA, 'main.js'))
    const spec = loadClientSpec(pathToFileURL(dirA + path.sep).href)
    const react = fakeReact(fakeEl())
    const mod = spec.factory(() => react)
    const real = await mod.__panelLoader('api/dsh-clsh-search/main.js')
    assert.equal(typeof real.mount, 'function', '真构建物 mount 导出可达')

    // 载入失败（缺 mount 导出）：容器内如实报错，不抛不炸（独立目录避 ESM 模块缓存串相）
    const apiDirB = path.join(dirB, 'api', 'dsh-clsh-search')
    await mkdir(apiDirB, { recursive: true })
    await writeFile(path.join(apiDirB, 'main.js'), 'export const notMount = 1', 'utf8')
    const badSpec = loadClientSpec(pathToFileURL(dirB + path.sep).href)
    const badReactHolder = fakeEl()
    const badReact = fakeReact(badReactHolder)
    const badMod = badSpec.factory(() => badReact)
    const harness = fakeSlots()
    badMod.apply({ slots: harness.slots, logger: harness.logger })
    harness.state.injected[0].setup()
    const { component } = harness.state.registered[0]
    badReact.useRef = () => ({ current: badReactHolder })
    component()
    for (let i = 0; i < 10 && badReactHolder.textContent === ''; i += 1) await tick()
    assert.match(badReactHolder.textContent, /载入失败/, '失败如实报错于容器内')
  } finally {
    await rm(dirA, { recursive: true, force: true })
    await rm(dirB, { recursive: true, force: true })
  }
})

test('package.json exports["./client"] 接线 + C-W65-2 静态前缀定案（文档相对、无前导斜杠）', async () => {
  const pkg = JSON.parse(await readFile(PACKAGE_JSON, 'utf8'))
  assert.equal(pkg.exports['./client'], './lib/client.js', 'exports["./client"] 两行接线')
  assert.ok(pkg.files.includes('lib'), 'lib 在 files（client.js 随包分发）')
  // C-W65-2 定案：面板与设置接口同基 api/dsh-clsh-search（wiki-steward api/<name>/panel.js 同形）
  const source = readFileSync(CLIENT_JS, 'utf8')
  assert.match(source, /PANEL_URL = 'api\/dsh-clsh-search\/main\.js'/, '面板=文档相对说明符')
  assert.match(source, /API_BASE = 'api\/dsh-clsh-search'/, '设置接口同基')
  assert.equal(/PANEL_URL = '\//.test(source), false, '禁前导斜杠（issue #1707）')
})
