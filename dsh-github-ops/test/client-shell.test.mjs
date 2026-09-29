// T13 客户端壳测试：①模块注册形 ②多座防双挂载 ③无 slots fail-open（+ chunk 引用形 / fetch 文档相对 / 挂载生命周期）。
// 载入形：globalThis.window.__ModuleLoader__ 捕获注册（浏览器工厂形在 Node 的最小宿主）；
// require 面全部测试桩供给（react / 兄弟 chunk），零网络零 DOM；UI 经 spy 桩断言壳的 props 注入与 render* 分发。
// 红线断言：P-7（root 槽禁注册 / sidebar、rightbar 零占位）、INV-6（槽位方缺席=该面缺席，绝不炸插件）、
// INV-9（模块 id=包名 dsh-github-ops）、fetch 文档相对铁律（站内绝对 '/…' 在 login-gate 基址下 404）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

// —— 最小模块宿主：捕获 window.__ModuleLoader__.load 注册 ——
const registrations = []
globalThis.window = { __ModuleLoader__: { load: (r) => registrations.push(r) } }
await import('../lib/client.js')
await import('../lib/client.ui.js')

const shellReg = registrations.find((r) => r.chunk === undefined)
const uiReg = registrations.find((r) => r.chunk !== undefined)

// 宿主 chunk 命名约定（dsh-client-modules CLIENT_CHUNK，源码级证据）
const CLIENT_CHUNK = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/

// —— 假 react（壳应零 UI 字面，只在桩里 createElement）——
const fakeReact = {
  createElement: (type, props, ...children) => ({ __el: true, type, props: props ?? {}, children }),
}

// 真桩模块（client.js+桩都在场前提）：跑 client.ui.js 工厂一次
function realUiModule() {
  assert.ok(uiReg, 'client.ui.js 应有注册')
  return uiReg.factory((spec) => {
    assert.equal(spec, 'react')
    return fakeReact
  })
}

// spy UI：记录 render* 调用（断言壳的 props 注入与 summary 分发）
function spyUiModule() {
  const calls = { section: [], summary: [] }
  return {
    calls,
    renderSettingsSection: (props) => { calls.section.push(props); return { __el: true, type: 'section-spy' } },
    renderSummary: (props) => { calls.summary.push(props); return { __el: true, type: 'summary-spy' } },
  }
}

// require 桩：'react' → fakeReact；require.async('./client.ui.js') → ui（或 uiError 模拟 chunk 不可取）
function makeRequire({ ui, uiError } = {}) {
  const calls = []
  const req = (spec) => {
    calls.push(spec)
    if (spec === 'react') return fakeReact
    throw new Error('unexpected require: ' + spec)
  }
  req.calls = calls
  req.async = async (spec) => {
    calls.push('async:' + spec)
    if (spec === './client.ui.js') {
      if (uiError) throw uiError
      return ui ?? realUiModule()
    }
    throw new Error('unexpected chunk: ' + spec)
  }
  return req
}

// 假 ctx（忠实 slots.inject 语义：callback 返回拆除器，声明塌缩/卸载时调用；register 返回拆除器）
function makeCtx({ withSlots = true, registerThrows = false, injectThrows = false } = {}) {
  const calls = { injects: [], registers: [], warns: [] }
  const ctx = {
    logger: { warn: (m) => calls.warns.push(String(m)) },
  }
  if (withSlots) {
    ctx.slots = {
      inject: (name, cb) => {
        if (injectThrows) throw new Error('slot "' + name + '" inject failed')
        const rec = { name, cb, effect: null, disposed: false }
        calls.injects.push(rec)
        return () => {
          if (rec.disposed) return
          rec.disposed = true
          if (typeof rec.effect === 'function') { const d = rec.effect; rec.effect = null; d() }
        }
      },
      register: (opts, comp) => {
        if (registerThrows) throw new Error('slot "' + opts.name + '" is not declared')
        const rec = { opts, comp, active: true }
        calls.registers.push(rec)
        return () => { rec.active = false }
      },
    }
  }
  return { ctx, calls, fire: (name) => {
    const rec = calls.injects.find((i) => i.name === name)
    assert.ok(rec, '应已 inject 座位 ' + name)
    rec.effect = rec.cb()
  } }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const activeOf = (calls) => calls.registers.filter((r) => r.active)
const SEAT_NAMES = ['settings.section', 'settings.plugins.tab', 'plugins.bundle.config', 'settings.plugin.item']

// ================= ① 模块注册形 =================

test('模块注册形（INV-9/R-4）：__ModuleLoader__ 注册 id=包名 + factory(require) 只登记模块体', () => {
  assert.ok(shellReg, 'client.js 应有 __ModuleLoader__ 注册')
  assert.equal(shellReg.id, 'dsh-github-ops', '模块 id 必须=包名（INV-9）')
  assert.equal(shellReg.chunk, undefined, '入口注册不带 chunk 字段')
  assert.equal(typeof shellReg.factory, 'function')

  const req = makeRequire()
  const mod = shellReg.factory(req)
  assert.deepEqual(req.calls, [], 'factory(require) 只登记模块体：零 require/零 chunk 拉取（副作用全在 apply）')
  assert.deepEqual(mod.inject, ['slots'])
  assert.equal(typeof mod.apply, 'function')
  assert.equal(typeof mod.__fetch, 'function', 'fetch 缝（测试注入）在场')
  assert.equal(typeof mod.apiFetch, 'function', '文档相对 fetch 帮手在场')
})

test('兄弟 chunk 引用形 + client.ui.js 注册形（CLIENT_CHUNK 约定）与 render* 接口面', async () => {
  assert.ok(uiReg, 'client.ui.js 应有 __ModuleLoader__ 注册')
  assert.equal(uiReg.id, 'dsh-github-ops', 'chunk 注册 id=包名')
  assert.equal(uiReg.chunk, 'client.ui.js', '兄弟 chunk 名 client.<name>.js 形')
  assert.match(uiReg.chunk, CLIENT_CHUNK, 'chunk 名过宿主 CLIENT_CHUNK 白名单')

  const ui = realUiModule()
  assert.equal(typeof ui.renderSettingsSection, 'function', 'render* 接口面：renderSettingsSection')
  assert.equal(typeof ui.renderSummary, 'function', 'render* 接口面：renderSummary')
  const el = ui.renderSettingsSection({ api: null, ownerProps: {} })
  assert.equal(el && el.type, 'div', '桩占位渲染在场（Task 14 换真 UI）')
  assert.equal(ui.renderSummary({}), null)

  // 壳经 require.async('./client.ui.js') 引用兄弟 chunk（挂载生命周期）
  const { ctx, calls } = makeCtx()
  const req = makeRequire()
  const mod = shellReg.factory(req)
  mod.apply(ctx)
  await settle()
  assert.ok(req.calls.includes('async:./client.ui.js'), '壳经 require.async 引用兄弟 chunk')
  assert.equal(calls.injects.length, SEAT_NAMES.length, '四座全部自探测注入')
})

test('fetch 帮手文档相对（login-gate 基址铁律）：api/github-ops/… 无前导斜杠', async () => {
  const req = makeRequire()
  const mod = shellReg.factory(req)
  const seen = []
  mod.__fetch = (url, init) => { seen.push({ url, init }); return Promise.resolve({ ok: true }) }

  await mod.apiFetch('status')
  assert.equal(seen[0].url, 'api/github-ops/status', '文档相对形（无前导斜杠）')
  assert.ok(!seen[0].url.startsWith('/'), '站内绝对形在 login-gate 基址下 404，禁用')

  await mod.apiFetch('/accounts/verify')
  assert.equal(seen[1].url, 'api/github-ops/accounts/verify', '防御性归一：剥前导斜杠')

  // 源码面：壳与桩不得出现站内绝对 '/api/github-ops' 字面
  for (const src of [read('../lib/client.js'), read('../lib/client.ui.js')]) {
    assert.equal(/['"`]\/api\/github-ops/.test(src), false, '禁站内绝对 /api/… 字面')
  }
})

// ================= ② 多座防双挂载 =================

test('多座自探测 + 防双挂载（US-8）：四座逆序触发单挂收敛，迟到高优先座切换', async () => {
  const spy = spyUiModule()
  const { ctx, calls, fire } = makeCtx()
  const mod = shellReg.factory(makeRequire({ ui: spy }))
  mod.apply(ctx)
  await settle()

  // 逆序触发（模拟兼容座先到）：每步后活动注册恒=1（防双挂载）
  fire('settings.plugin.item')
  await settle()
  assert.equal(activeOf(calls).length, 1)
  fire('plugins.bundle.config')
  await settle()
  assert.equal(activeOf(calls).length, 1, '迟到高优先座切换：旧座拆除，绝不双挂')
  fire('settings.plugins.tab')
  await settle()
  assert.equal(activeOf(calls).length, 1)
  fire('settings.section')
  await settle()
  assert.equal(activeOf(calls).length, 1)

  const active = activeOf(calls)
  assert.equal(active.length, 1)
  assert.equal(active[0].opts.name, 'settings.section', '最高优先座（主座）收敛在场')
  assert.equal(calls.registers.filter((r) => r.active === false).length, 3, '旧座全部拆除')
  assert.equal(active[0].opts.id, 'github-ops', '主座 id=github-ops')
  assert.equal(active[0].opts.label(), 'GitHub 集成', '主座 label「GitHub 集成」')

  // 主座组件经 renderSettingsSection 渲染，props 注入 api（文档相对 fetch 面）
  active[0].comp({ view: undefined })
  const props = spy.calls.section.at(-1)
  assert.equal(typeof props.api.fetch, 'function', 'render* 收到 api.fetch 帮手')
  assert.equal(props.api.base, 'api/github-ops/')
  assert.deepEqual(props.ownerProps, { view: undefined })

  // summary 视图分发归 renderSummary（plugins.bundle.config 座契约）
  const { ctx: ctx2, calls: calls2, fire: fire2 } = makeCtx()
  const spy2 = spyUiModule()
  shellReg.factory(makeRequire({ ui: spy2 })).apply(ctx2)
  await settle()
  fire2('plugins.bundle.config')
  await settle()
  activeOf(calls2)[0].comp({ view: 'summary' })
  assert.equal(spy2.calls.summary.length, 1, 'summary 视图走 renderSummary')
  assert.equal(spy2.calls.section.length, 0)
})

test('多座防双挂载（US-8）：主座先到时兼容座零注册', async () => {
  const { ctx, calls, fire } = makeCtx()
  shellReg.factory(makeRequire({ ui: spyUiModule() })).apply(ctx)
  await settle()
  fire('settings.section')
  await settle()
  for (const name of SEAT_NAMES.slice(1)) fire(name)
  await settle()
  assert.equal(calls.registers.length, 1, '仅主座注册一次，兼容座防双挂载跳过')
  assert.equal(calls.registers[0].opts.name, 'settings.section')
})

test('P-7 红线：root 槽禁注册；sidebar/rightbar 零占位', async () => {
  const { ctx, calls, fire } = makeCtx()
  shellReg.factory(makeRequire({ ui: spyUiModule() })).apply(ctx)
  await settle()
  for (const name of SEAT_NAMES) fire(name)
  await settle()
  assert.ok(calls.registers.length >= 1)
  for (const rec of calls.registers) {
    assert.ok(SEAT_NAMES.includes(rec.opts.name), '只允许设置页族座位，实际：' + rec.opts.name)
    assert.notEqual(rec.opts.name, 'root')
    assert.notEqual(rec.opts.name, 'sidebar')
    assert.notEqual(rec.opts.name, 'rightbar')
  }
  // 源码面：壳与桩不得出现 root/sidebar/rightbar 注册字面
  for (const src of [read('../lib/client.js'), read('../lib/client.ui.js')]) {
    assert.equal(/slots\.(inject|register)\(\s*['"`](root|sidebar|rightbar)['"`]/.test(src), false)
  }
})

// ================= ③ 无 slots fail-open（INV-6） =================

test('fail-open（INV-6）：ctx 无 slots → apply 不炸 + logger.warn + 零注册', async () => {
  const { ctx, calls } = makeCtx({ withSlots: false })
  const mod = shellReg.factory(makeRequire({ ui: spyUiModule() }))
  assert.doesNotThrow(() => mod.apply(ctx), '槽位方缺席绝不炸插件')
  await settle()
  assert.equal(calls.registers.length, 0, '该面缺席=不挂载')
  assert.ok(calls.warns.length >= 1, '缺席面须留 logger.warn 痕迹')
})

test('fail-open（INV-6）：slots.register 抛错（槽位方缺席形）→ catch + warn + 不炸', async () => {
  const { ctx, calls, fire } = makeCtx({ registerThrows: true })
  const mod = shellReg.factory(makeRequire({ ui: spyUiModule() }))
  mod.apply(ctx)
  await settle()
  for (const name of SEAT_NAMES) assert.doesNotThrow(() => fire(name), '注册失败不向宿主抛')
  await settle()
  assert.equal(calls.registers.length, 0)
  assert.ok(calls.warns.length >= 1)
})

test('fail-open（INV-6）：兄弟 chunk 不可取（404 形）→ 不炸 + warn + 零注册', async () => {
  const { ctx, calls, fire } = makeCtx()
  const mod = shellReg.factory(makeRequire({ uiError: new Error('chunk 404') }))
  mod.apply(ctx)
  await settle()
  for (const name of SEAT_NAMES) fire(name)
  await settle()
  assert.equal(calls.registers.length, 0, 'UI 缺席=该面缺席')
  assert.ok(calls.warns.length >= 1)
})

test('fail-open（INV-6）：logger 缺位也不炸 + 挂载生命周期拆除器收敛', async () => {
  const { ctx, calls } = makeCtx()
  delete ctx.logger
  const mod = shellReg.factory(makeRequire({ ui: spyUiModule() }))
  let dispose
  assert.doesNotThrow(() => { dispose = mod.apply(ctx) })
  assert.equal(typeof dispose, 'function', 'apply 返回拆除器')
  await settle()
  calls.injects.find((i) => i.name === 'settings.section').effect =
    calls.injects.find((i) => i.name === 'settings.section').cb()
  await settle()
  assert.equal(activeOf(calls).length, 1)
  dispose()
  assert.equal(activeOf(calls).length, 0, '拆除器撤注册（挂载生命周期收敛）')
})
