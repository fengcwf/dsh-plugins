// T13 客户端壳测试 + T14 UI 渲染测试（扩展不重写）：①模块注册形 ②多座防双挂载 ③无 slots fail-open（+ chunk 引用形 / fetch 文档相对 / 挂载生命周期）
// ④UI 渲染（Loading/Error/Empty + 零明文 + P-8 + DESIGN token/禁令）⑤携带修复（M1 扫描面 / L1 挂载缝）。
// 载入形：globalThis.window.__ModuleLoader__ 捕获注册（浏览器工厂形在 Node 的最小宿主）；
// require 面全部测试桩供给（react / 兄弟 chunk），零网络零 DOM；UI 经 spy 桩断言壳的 props 注入与 render* 分发。
// 红线断言：P-7（root 槽禁注册 / sidebar、rightbar 零占位）、INV-6（槽位方缺席=该面缺席，绝不炸插件）、
// INV-9（模块 id=包名 dsh-github-ops）、fetch 文档相对铁律（站内绝对 '/…' 在 login-gate 基址下 404）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

// —— 最小模块宿主：捕获 window.__ModuleLoader__.load 注册 ——
const registrations = []
globalThis.window = { __ModuleLoader__: { load: (r) => registrations.push(r) } }
await import('../lib/client.js')
await import('../lib/client.ui.js')
await import('../lib/client.ui.model.js')
await import('../lib/client.ui.project.js')
await import('../lib/client.ui.cards.js')
await import('../lib/client.ui.styles.js')

const shellReg = registrations.find((r) => r.chunk === undefined)
const uiReg = registrations.find((r) => r.chunk === 'client.ui.js')

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

// require 桩：'react' → fakeReact；require.async('./client.ui*.js') → 兄弟 chunk 模块（uiError=模拟 chunk 不可取）
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
    if (uiError) throw uiError
    if (spec === './client.ui.js') return ui ?? realUiModule()
    if (spec === './client.ui.model.js') return chunkModule('client.ui.model.js')
    if (spec === './client.ui.project.js') return chunkModule('client.ui.project.js')
    if (spec === './client.ui.cards.js') return chunkModule('client.ui.cards.js')
    if (spec === './client.ui.styles.js') return chunkModule('client.ui.styles.js')
    throw new Error('unexpected chunk: ' + spec)
  }
  return req
}

// lib/ 下壳 + 全部 UI 兄弟 chunk 源码（S1 修复：CLIENT_CHUNK 正则不含 client.js——壳必须显式入列，
// SEATS 表 name: 注册形只在壳里，M1/P-7/P-8/绝对路径三处源码锁漏扫壳=假保险）
const allClientSources = () => [
  read('../lib/client.js'),
  ...readdirSync(new URL('../lib/', import.meta.url))
    .filter((f) => f !== 'client.js' && CLIENT_CHUNK.test(f))
    .map((f) => read('../lib/' + f)),
]

// P-7/M1 红线扫描形（模块级共享：M1 回归用例自证正反例都真命中）
const banCall = /slots\.(inject|register)\(\s*['"`](root|sidebar|rightbar)['"`]/
const banName = /name:\s*['"`](root|sidebar|rightbar)['"`]/
const banAbsApi = /['"`]\/api\/github-ops/ // D1（T15 携带）：站内绝对 '/api/…' 字面（fetch 必须文档相对）

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

  // 源码面：壳与 UI 全 chunk 不得出现站内绝对 '/api/github-ops' 字面（扫描形=banAbsApi，正反例自证见 M1/S1 用例）
  for (const src of allClientSources()) {
    assert.equal(banAbsApi.test(src), false, '禁站内绝对 /api/… 字面')
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
  // 源码面：壳与 UI 全 chunk 不得出现 root/sidebar/rightbar 注册字面。
  // M1（T13 携带）：正则须覆盖 SEATS 表与 options() 的 `name: '…'` 形（原调用形正则失配=假保险）；
  // 扫描形在模块级共享（banCall/banName），扫描集合必含壳（S1 回归用例另证）。
  assert.match("ctx.slots.inject('sidebar', fn)", banCall, '正例自证：调用形可命中')
  assert.match("ctx.slots.register({ name: 'root' }, fn)", banName, '正例自证：name: 形可命中（M1）')
  for (const src of allClientSources()) {
    assert.equal(banCall.test(src), false, '禁 root/sidebar/rightbar 调用形注册')
    assert.equal(banName.test(src), false, '禁 root/sidebar/rightbar name: 形（SEATS/options，M1）')
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

// ================= ④ UI 渲染（T14：双栏六节 + Loading/Error/Empty + 零明文 + P-8 + 禁令） =================
// 载入形：真 client.ui.* 兄弟 chunk 工厂（fakeReact）；model 层喂假 api（记录调用、按 path 供应回应），
// 用 model.getState() 驱动 cards 纯渲染（容器/展示分离，零 DOM 零网络）。

const uiChunkReg = (name) => registrations.find((r) => r.chunk === name)
function chunkModule(name) {
  const reg = uiChunkReg(name)
  assert.ok(reg, name + ' 应有 __ModuleLoader__ 注册')
  assert.equal(reg.id, 'dsh-github-ops', 'chunk 注册 id=包名（INV-9）')
  assert.match(reg.chunk, CLIENT_CHUNK, 'chunk 名过 CLIENT_CHUNK 白名单')
  const req = (spec) => {
    assert.equal(spec, 'react')
    return fakeReact
  }
  req.async = async (spec) => {
    if (spec === './client.ui.project.js') return chunkModule('client.ui.project.js')
    throw new Error('unexpected chunk: ' + spec)
  }
  return reg.factory(req)
}
const cards = chunkModule('client.ui.cards.js')
const modelMod = chunkModule('client.ui.model.js')
const stylesMod = chunkModule('client.ui.styles.js')

// —— 树遍历（fakeReact 元素）——
function collectNodes(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (Array.isArray(node)) { for (const n of node) collectNodes(n, out); return out }
  if (typeof node === 'string' || typeof node === 'number') return out
  if (node.__el) { out.push(node); for (const c of node.children) collectNodes(c, out) }
  return out
}
function collectStrings(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (Array.isArray(node)) { for (const n of node) collectStrings(n, out); return out }
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (node.__el) {
    for (const [k, v] of Object.entries(node.props ?? {})) {
      if (typeof v === 'string' && ['aria-label', 'title', 'placeholder', 'alt'].includes(k)) out.push(v)
    }
    for (const c of node.children) collectStrings(c, out)
  }
  return out
}
const classListOf = (el) => String(el.props?.className ?? '').split(/\s+/).filter(Boolean)
const hasClass = (node, cls) => collectNodes(node).some((el) => classListOf(el).includes(cls))
const findByClass = (node, cls) => collectNodes(node).find((el) => classListOf(el).includes(cls)) ?? null
const findByTag = (node, tag) => collectNodes(node).find((el) => el.type === tag) ?? null
const textsOf = (node) => collectStrings(node).join('\n')

// —— 假 api（记录调用；route=响应体 {httpOk?,status?,body} 或 Error=模拟传输失败）——
function fakeApi(routes) {
  const calls = []
  return {
    calls,
    base: 'api/github-ops/',
    fetch: async (path, init = {}) => {
      calls.push({ path, init })
      const route = routes[path]
      if (route instanceof Error) throw route
      if (typeof route === 'function') return route(init) // 悬挂响应（测 busy 态）
      if (!route) throw new Error('no route stub: ' + path)
      return {
        ok: route.httpOk ?? true,
        status: route.status ?? 200,
        json: async () => {
          if (route.jsonThrows) throw new Error('not json') // 非 JSON 形（如 login-gate HTML/代理 502）
          return route.body ?? {}
        },
      }
    },
  }
}

// —— 数据面结构化形样本（与 lib/settings-routes.js 响应形逐字段对齐）——
// resetEpoch 钉「今天 12:00 本地」：now+3600 形在 23:00 后跨午夜落明日，formatReset 的「（今天）」分支永不命中
//（2026-09-29 23:20 实测红——时点型定时炸弹，非产品缺陷）；断言口径不变（仍锁 HH:MM（今天））。
const resetEpoch = Math.floor(new Date(new Date().toDateString()).getTime() / 1000) + 12 * 3600
const STATUS_OK = {
  ok: true, stage: 'status', code: null, status: 200, login: 'fengcwf', message: '本地认证状态投影（零明文）', elapsedMs: 3, hint: null, quota: null,
  hosts: [{ host: 'github.com', activeAccount: 'fengcwf', gitProtocol: 'ssh', hasToken: true, users: 2 }],
  accounts: [{ login: 'fengcwf', active: true, configured: true, verified: false }, { login: 'ci-bot', active: false, configured: true, verified: false }],
}
const VERIFY_OK = {
  ok: true, stage: 'verify', code: null, status: 200, login: 'fengcwf', message: '逐账号验证完成', elapsedMs: 120, hint: null, quota: null,
  accounts: [{ login: 'fengcwf', verified: true, state: 'success', error: null }, { login: 'ci-bot', verified: true, state: 'success', error: null }],
}
const CHECK_OK = {
  ok: true, stage: 'latency-quota', code: null, status: 200, login: 'fengcwf', message: '三段探针通过', elapsedMs: 650, hint: null,
  quota: { core: { limit: 5000, remaining: 4995, reset: resetEpoch }, search: { limit: 30, remaining: 30, reset: resetEpoch } },
}
const HEALTH_OK = {
  ok: true, stage: 'health', code: null, status: 200, login: 'fengcwf', message: '三段自检通过', elapsedMs: 20, hint: null, quota: null,
  sections: {
    config: { ok: true, message: '配置合成复检通过', switches: { enforceCommands: true } },
    gh: { ok: true, message: 'gh CLI 可用', version: 'gh 2.62.0', elapsedMs: 5 },
    credentials: { ok: true, message: '凭据在位（零明文投影）', hostsPath: '/home/u/.config/gh/hosts.yml', active: 'fengcwf', accounts: 2 },
  },
}
const REPO_OK = {
  ok: true, stage: 'repo-context', code: null, status: 200, login: 'fengcwf', message: '仓库上下文（git + gh api 摘要）', elapsedMs: 40, hint: null, quota: null,
  git: { branch: 'main', remotes: [{ name: 'origin', url: 'github.com/fengcwf/dsh-plugins.git' }] },
  repo: { fullName: 'fengcwf/dsh-plugins', stars: 12, issues: 3, defaultBranch: 'main' },
}
const ROUTES_ALL_OK = { status: { body: STATUS_OK }, 'accounts/verify': { body: VERIFY_OK }, health: { body: HEALTH_OK }, 'repo-context': { body: REPO_OK }, check: { body: CHECK_OK } }

test('T14 Loading（骨架）：双栏容器 + 六卡骨架（贴合最终布局形状）', () => {
  const model = modelMod.createModel({ api: fakeApi(ROUTES_ALL_OK) })
  const tree = cards.renderSettingsView(model.getState(), model.actions)
  assert.ok(hasClass(tree, 'gho-grid'), '双栏容器在场')
  const cols = collectNodes(tree).filter((el) => classListOf(el).includes('gho-col'))
  assert.equal(cols.length, 2, '双栏（<960px 折叠单列由 CSS 控制）')
  const leftTexts = textsOf(cols[0])
  const rightTexts = textsOf(cols[1])
  for (const t of ['认证状态', '访问检验', '插件自检']) assert.ok(leftTexts.includes(t), '左栏含 ' + t)
  for (const t of ['Token 维护', '多账号库', '仓库上下文']) assert.ok(rightTexts.includes(t), '右栏含 ' + t)
  assert.ok(collectNodes(tree).filter((el) => classListOf(el).includes('gho-skeleton')).length >= 3, '结果卡骨架在场')
  assert.match(textsOf(tree), /GitHub 集成/)
})

test('T14 Loading（按钮态）：检验进行中=按钮禁用 + 内联 spinner + 骨架行', async () => {
  let release
  const routes = { ...ROUTES_ALL_OK, check: () => new Promise((res) => { release = res }) }
  const model = modelMod.createModel({ api: fakeApi(routes) })
  await model.actions.boot()
  const pending = model.actions.check()
  const state = model.getState()
  assert.equal(state.check.phase, 'loading')
  const tree = cards.renderSettingsView(state, model.actions)
  const btn = findByClass(tree, 'gho-btn-primary')
  assert.ok(btn, '主操作按钮在场')
  assert.equal(btn.props.disabled, true, '进行中按钮禁用')
  assert.ok(hasClass(btn, 'gho-spinner-wrap') || collectNodes(btn).some((el) => classListOf(el).includes('gho-spinner')), '按钮内联 spinner')
  await settle() // 投影 chunk 惰性载入后请求才发出（悬挂响应缝就绪）
  release({ ok: true, status: 200, json: async () => CHECK_OK })
  await pending
  assert.equal(model.getState().check.phase, 'ready')
})

test('T14 Error（分级错误卡）：401 分级 + 修复指引 + stderr 零透传（INV-10）', async () => {
  const routes = {
    ...ROUTES_ALL_OK,
    check: { body: { ok: false, stage: 'latency-quota', code: 'GHO-LATENCY-QUOTA-03', status: 401, login: null, message: 'gh: HTTP 401', elapsedMs: 30, quota: null, hint: 'token 无效或已过期：请在设置栏目更新 token', stderr: 'raw ghp_SECRET123 leaked' } },
  }
  const model = modelMod.createModel({ api: fakeApi(routes) })
  await model.actions.boot()
  await model.actions.check()
  const tree = cards.renderSettingsView(model.getState(), model.actions)
  const err = findByClass(tree, 'gho-error-card')
  assert.ok(err, '分级错误卡在场')
  const texts = textsOf(err)
  assert.match(texts, /401 · token 无效/, '分级标题：状态 + 归因')
  assert.match(texts, /请在设置栏目更新 token/, '修复指引（分类 hint）')
  assert.equal(texts.includes('ghp_SECRET123'), false, 'stderr 敏感串零透传（INV-10）')
  assert.equal(texts.includes('leaked'), false, '不拼接任何原始 stderr（合同 1）')
})

test('T14 Error（传输失败）：fetch 拒绝 → 网络分级卡，不挂死', async () => {
  const routes = { ...ROUTES_ALL_OK, check: new Error('ECONNREFUSED') }
  const model = modelMod.createModel({ api: fakeApi(routes) })
  await model.actions.boot()
  await model.actions.check()
  assert.equal(model.getState().check.phase, 'error')
  const tree = cards.renderSettingsView(model.getState(), model.actions)
  const err = findByClass(tree, 'gho-error-card')
  assert.ok(err, '传输失败也走分级错误卡')
  assert.match(textsOf(err), /网络请求失败|刷新/, '带修复指引')
})

test('T14 Empty（多账号库空态）：「尚无其他账号」+ 添加账号入口', async () => {
  const routes = {
    ...ROUTES_ALL_OK,
    status: { body: { ...STATUS_OK, accounts: [], hosts: [] } },
    'accounts/verify': { body: { ...VERIFY_OK, accounts: [] } },
  }
  const model = modelMod.createModel({ api: fakeApi(routes) })
  await model.actions.boot()
  const tree = cards.renderSettingsView(model.getState(), model.actions)
  const texts = textsOf(tree)
  assert.match(texts, /尚无其他账号/, '空态文案')
  // T15 携带收口：入口断言限定 .gho-empty 子树——全树 find 会命中常驻卡头按钮（cards 里 gho-actions 常驻「添加账号」），
  // 锁不住空态自带入口；且非空态不得出空态子树（判据不空转）。
  const empty = findByClass(tree, 'gho-empty')
  assert.ok(empty, '空态子树 .gho-empty 在场')
  assert.match(textsOf(empty), /尚无其他账号/, '空态文案在 .gho-empty 子树内')
  const addBtn = collectNodes(empty).find((el) => el.type === 'button' && textsOf(el).includes('添加账号'))
  assert.ok(addBtn, '空态自带「添加账号」入口（限定 .gho-empty 子树）')
  const full = modelMod.createModel({ api: fakeApi(ROUTES_ALL_OK) })
  await full.actions.boot()
  const fullTree = cards.renderSettingsView(full.getState(), full.actions)
  assert.equal(findByClass(fullTree, 'gho-empty'), null, '非空态不出空态子树（空态判据不空转）')
  assert.match(textsOf(fullTree), /添加账号/, '常驻卡头入口仍在（与空态入口互不混淆）')
})

test('T14 限额可视化 + 三段检验行（US-3/US-6）：remaining/reset + 分类 hint 贯穿', async () => {
  const model = modelMod.createModel({ api: fakeApi(ROUTES_ALL_OK) })
  await model.actions.boot()
  await model.actions.check()
  const tree = cards.renderSettingsView(model.getState(), model.actions)
  const texts = textsOf(tree)
  assert.match(texts, /配置文件解析正常/)
  assert.match(texts, /gh api \/user → 200/)
  assert.match(texts, /\d+ms · 4995\/5000/, '延迟 + 限额 remaining/limit（mono）')
  assert.match(texts, /4995 \/ 5000/, '认证状态卡限额可视化')
  assert.match(texts, /\d{2}:\d{2}（今天）/, '限额重置时间')
  const quota = model.getState().check.quota
  assert.equal(quota.remaining, 4995)
  assert.equal(quota.limit, 5000)
  // 插件自检三行（US-7）
  for (const t of ['配置合成', 'gh 可用', '凭据在位']) assert.ok(texts.includes(t), '自检行 ' + t)
})

test('T14 零明文（INV-1/P-5）：密码框 + 保存即清空 + 留空=不修改 + 保存后立即验证', async () => {
  const api = fakeApi({ ...ROUTES_ALL_OK, token: { body: { ok: true, stage: 'token', code: null, status: 200, login: 'fengcwf', message: 'token 已经 stdin 写入 hosts.yml（单一认证源）', elapsedMs: 10, hint: null, quota: null, noop: false } } })
  const model = modelMod.createModel({ api })
  await model.actions.boot()
  const input = findByTag(cards.renderSettingsView(model.getState(), model.actions), 'input')
  assert.ok(input, 'token 输入框在场')
  assert.equal(input.props.type, 'password', '密码框')
  assert.match(String(input.props.placeholder ?? ''), /留空=不修改/, '「留空=不修改」提示')
  model.actions.setTokenDraft('ghp_secret_value')
  await model.actions.saveToken(model.getState().token.draft)
  assert.equal(model.getState().token.draft, '', '保存即清空')
  assert.equal(JSON.parse(api.calls.find((c) => c.path === 'token').init.body).token, 'ghp_secret_value', 'token 只进请求体（stdin 链路）')
  assert.ok(api.calls.some((c) => c.path === 'check'), '保存后立即验证（US-2）')
  const texts = textsOf(cards.renderSettingsView(model.getState(), model.actions))
  assert.equal(texts.includes('ghp_secret_value'), false, 'UI 零明文（INV-1）')
  const before = api.calls.length
  await model.actions.saveToken('')
  assert.equal(api.calls.length, before, '留空=不修改：不发请求、不触碰凭据（INV-4）')
  assert.match(textsOf(cards.renderSettingsView(model.getState(), model.actions)), /留空=不修改/)
})

test('T14 多账号交互：逐账号验证 + 切换 active（busy 态 + POST 语义）', async () => {
  const api = fakeApi({ ...ROUTES_ALL_OK, 'accounts/switch': { body: { ok: true, stage: 'switch', code: null, status: 200, login: 'ci-bot', message: '已切换 active 账号为 ci-bot', elapsedMs: 30, hint: null, quota: null } } })
  const model = modelMod.createModel({ api })
  await model.actions.boot()
  let rows = model.getState().accounts.rows
  assert.equal(rows.length, 2)
  assert.equal(rows.find((r) => r.login === 'fengcwf').verified, true, 'boot 已带逐账号验证投影')
  assert.equal(rows.find((r) => r.login === 'fengcwf').active, true)
  const pending = model.actions.switchAccount('ci-bot')
  const busyTree = cards.renderSettingsView(model.getState(), model.actions)
  const busyRow = collectNodes(busyTree).find((el) => classListOf(el).includes('gho-row') && textsOf(el).includes('ci-bot'))
  assert.ok(busyRow && collectNodes(busyRow).some((el) => classListOf(el).includes('gho-spinner')), '切换中行内 spinner')
  await pending
  const sw = api.calls.find((c) => c.path === 'accounts/switch')
  assert.equal(JSON.parse(sw.init.body).login, 'ci-bot')
  rows = model.getState().accounts.rows
  assert.equal(rows.find((r) => r.login === 'ci-bot').busy, false, '终态收敛')
  const texts = textsOf(cards.renderSettingsView(model.getState(), model.actions))
  assert.ok(texts.includes('切换') || texts.includes('当前'), '非 active 行给「切换」，active 行给「当前」')
  // MED a①接线回归：逐账号验证入口=状态按钮 → verifyAccount → POST {logins:[…]} + 行状态刷新
  const tree2 = cards.renderSettingsView(model.getState(), model.actions)
  const row2 = collectNodes(tree2).find((el) => classListOf(el).includes('gho-row') && textsOf(el).includes('ci-bot'))
  const verifyBtn = collectNodes(row2).find((el) => el.type === 'button' && /已验证|待验证/.test(textsOf(el)))
  assert.ok(verifyBtn, '逐账号验证入口接线（US-4，非纯 span）')
  assert.match(String(verifyBtn.props['aria-label'] ?? ''), /验证/, 'aria 语义在')
  await verifyBtn.props.onClick()
  const vf = api.calls.filter((c) => c.path === 'accounts/verify' && c.init.body).at(-1)
  assert.deepEqual(JSON.parse(vf.init.body).logins, ['ci-bot'], '逐账号验证只验该账号')
  assert.equal(model.getState().accounts.rows.find((r) => r.login === 'ci-bot').busy, false, '验证终态收敛')
})

test('T14 P-8 + 禁令清单（可见文案）：无删除/登出入口；零 em-dash/emoji；状态点配文字', async () => {
  const model = modelMod.createModel({ api: fakeApi({ ...ROUTES_ALL_OK, check: { body: { ok: false, stage: 'token', code: 'GHO-TOKEN-06', status: null, login: null, message: '写入失败', elapsedMs: 5, quota: null, hint: 'hosts.yml 不可写：请检查文件权限后重试' } } }) })
  await model.actions.boot()
  await model.actions.check()
  model.actions.addAccount()
  const trees = [
    cards.renderSettingsView(model.getState(), model.actions),
    cards.renderSettingsView({ ...model.getState(), accounts: { ...model.getState().accounts, rows: [] } }, model.actions),
  ]
  const texts = trees.map(textsOf).join('\n')
  assert.equal(/删除|登出|注销|移除|revoke|log\s*out/i.test(texts), false, 'P-8：无删除/登出按钮与入口')
  assert.equal(/[\u2013\u2014]/.test(texts), false, '零 em-dash/en-dash 可见文案（DESIGN 禁令）')
  assert.equal(/\p{Extended_Pictographic}/u.test(texts), false, '无 emoji 图标（DESIGN 禁令）')
  for (const src of allClientSources()) {
    assert.equal(/method:\s*['"`]DELETE['"`]/i.test(src), false, 'API 面无删除方法（P-8）')
    assert.equal(/(删除|登出)\s*(token|账号|凭据)?(按钮|入口)?/i.test(String(src.split('\n').filter((l) => /['"`]/.test(l)).join('\n'))), false, 'UI 字符串字面无删除/登出入口')
  }
})

test('T14 布局与 token（DESIGN.md C-5）：双栏/<960 单列/1200px/16px + 零 hex + 色值全 var(--dsw-*)', () => {
  const css = stylesMod.CSS
  assert.match(css, /max-width:\s*1200px/, '内容列 max-width 1200px')
  assert.match(css, /@media\s*\(max-width:\s*959px\)/, '<960px 断点折叠单列')
  assert.equal(/grid-template-columns:\s*1fr/.test(css), true, '折叠=单列')
  assert.match(css, /gap:\s*var\(--dsw-space-4,\s*16px\)/, '卡间距 16px（space-4）')
  assert.equal(/#[0-9A-Fa-f]{3,8}/.test(css), false, '零硬编码 hex（唯一色板来源=--dsw-*）')
  for (const src of allClientSources()) {
    assert.equal(/#[0-9A-Fa-f]{3,8}/.test(src), false, '零硬编码 hex（全 client 源码面，S1 并面）')
  }
  assert.match(css, /--dsw-font-mono/, '数值/命令列 mono')
  assert.match(css, /--dsw-font-family/, '字体族 token')
  for (const m of css.matchAll(/(?:^|[;{])\s*(color|background|background-color|border-color|border-top-color|border-bottom-color|border|outline-color|box-shadow|fill|stroke)\s*:\s*([^;{}]+)/g)) {
    assert.match(m[2], /var\(--dsw-|color-mix\(|inherit|currentColor|transparent|none|initial|unset|^0$/, '色值/几何值须引用 --dsw-* 变量：' + m[1] + ': ' + m[2])
  }
})

test('T14 DESIGN token 表逐字在场（C-5：DESIGN 名为首选引用）', () => {
  const css = stylesMod.CSS
  const tokens = [
    '--dsw-bg-module-platform', '--dsw-bg-base', '--dsw-bg-layer-1',
    '--dsw-border-l1', '--dsw-border-l2', '--dsw-border-l3',
    '--dsw-label-primary', '--dsw-label-secondary', '--dsw-label-tertiary', '--dsw-label-caption',
    '--dsw-state-business-primary', '--dsw-state-business-bg', '--dsw-state-business-fg',
    '--dsw-state-success-dot', '--dsw-state-success-bg', '--dsw-state-success-fg',
    '--dsw-state-warning-dot', '--dsw-state-warning-bg', '--dsw-state-warning-fg',
    '--dsw-state-error-dot', '--dsw-state-error-bg', '--dsw-state-error-border', '--dsw-state-error-fg',
    '--dsw-font-family', '--dsw-font-mono',
    '--dsw-space-1', '--dsw-space-2', '--dsw-space-3', '--dsw-space-4', '--dsw-space-5', '--dsw-space-6',
    '--dsw-radius-xs', '--dsw-radius-sm', '--dsw-radius-md', '--dsw-shadow-l1',
  ]
  for (const token of tokens) assert.ok(css.includes(token), 'token 逐字引用缺失：' + token)
})

// ================= ⑤ 携带修复（T13 review：M1 已并入 P-7 用例 / L1 挂载缝） =================

test('L1 同座二次触发（槽位重声明）：跳过分支可重挂，旧拆除后绝不静默缺席', async () => {
  const { ctx, calls } = makeCtx()
  const mod = shellReg.factory(makeRequire({ ui: spyUiModule() }))
  mod.apply(ctx)
  await settle()
  const rec = calls.injects.find((i) => i.name === 'settings.section')
  const disposeFirst = rec.cb() // 第一次触发：挂载
  await settle()
  assert.equal(activeOf(calls).length, 1)
  const disposeSecond = rec.cb() // 同座二次触发（旧 effect 尚未拆）：登记待挂（可重挂）
  await settle()
  assert.equal(activeOf(calls).length, 1, '二次触发不产生双挂')
  disposeFirst() // 槽位重声明：旧实例拆除
  await settle()
  assert.equal(activeOf(calls).length, 1, '待挂座自动重挂（不静默缺席，L1）')
  assert.equal(activeOf(calls)[0].opts.name, 'settings.section')
  disposeSecond() // 新拆除器负责收敛
  await settle()
  assert.equal(activeOf(calls).length, 0, '可重挂拆除器最终收敛')
})

test('L1 挂载期异常 fail-open（INV-6）：重挂失败只 warn 不炸、状态不悬挂', async () => {
  const { ctx, calls } = makeCtx()
  let failRegister = false
  ctx.slots.register = (opts, comp) => {
    if (failRegister) throw new Error('slot "' + opts.name + '" is not declared')
    const rec = { opts, comp, active: true }
    calls.registers.push(rec)
    return () => { rec.active = false }
  }
  const mod = shellReg.factory(makeRequire({ ui: spyUiModule() }))
  mod.apply(ctx)
  await settle()
  const a = calls.injects.find((i) => i.name === 'settings.section')
  const b = calls.injects.find((i) => i.name === 'settings.plugins.tab')
  const disposeA = a.cb()
  await settle()
  b.cb() // 待挂
  await settle()
  failRegister = true // 重挂时槽位方缺席
  assert.doesNotThrow(() => disposeA(), '重挂失败绝不向宿主抛（.then 成功回调 try+warn）')
  await settle()
  assert.ok(calls.warns.length >= 1, '失败留 warn 痕迹')
  assert.equal(activeOf(calls).length, 0, '状态不悬挂')
  failRegister = false
  const disposeB = b.cb() // 同座再触发仍可挂（fail-open 后可恢复）
  await settle()
  assert.equal(activeOf(calls).length, 1, '恢复路径可用')
  disposeB()
})

test('T14 Error（非 JSON 5xx）：HTTP 502 HTML 形=硬失败分级卡，绝不当成功（S2）', async () => {
  const routes = {
    ...ROUTES_ALL_OK,
    status: { httpOk: false, status: 502, jsonThrows: true },
    health: { httpOk: false, status: 502, jsonThrows: true },
    'repo-context': { httpOk: false, status: 502, jsonThrows: true },
  }
  const model = modelMod.createModel({ api: fakeApi(routes) })
  await model.actions.boot()
  assert.equal(model.getState().auth.phase, 'error', 'status 非 JSON 5xx=分级卡（非「未检测到」成功形）')
  assert.equal(model.getState().health.phase, 'error', 'health 同缝（洞限三个 load，逐个断言）')
  assert.equal(model.getState().repo.phase, 'error', 'repo 同缝')
  const tree = cards.renderSettingsView(model.getState(), model.actions)
  const errs = collectNodes(tree).filter((el) => classListOf(el).includes('gho-error-card'))
  assert.ok(errs.length >= 3, '三卡各出分级错误卡')
  const texts = textsOf(tree)
  assert.match(texts, /502 · 服务内部错误/, '分级标题=状态 · 归因（5xx 兜底归因）')
  assert.match(texts, /请查看 dsh 日志|刷新/, '修复指引在场（INV-10）')
  assert.equal(texts.includes('未检测到'), false, '绝不误当成功投影')
})

test('M1/S1 扫描面回归：源码锁真读到壳（SEATS name: 靶子），坏形必命中、真实源码零命中', () => {
  const srcs = allClientSources()
  assert.ok(srcs.some((s) => s.includes("name: 'settings.section'")), '扫描集合必含 lib/client.js（SEATS 表=name: 真实靶子，S1）')
  assert.ok(srcs.length >= 6, '壳 + UI 全 chunk 都在扫描面（当前 ' + srcs.length + ' 份）')
  // 反例自证：合成坏源码必命中（防「扫描真空转」假保险复发）
  assert.equal(banName.test("ctx.slots.register({ name: 'root' }, fn)"), true, '反例自证：name: 形必命中')
  assert.equal(banCall.test("ctx.slots.inject('sidebar', fn)"), true, '反例自证：调用形必命中')
  assert.equal(/method:\s*['"`]DELETE['"`]/i.test("api.fetch('x', { method: 'DELETE' })"), true, '反例自证：DELETE 形必命中')
  assert.equal(/#[0-9A-Fa-f]{3,8}/.test('.x{color:#4176E6}'), true, '反例自证：hex 形必命中')
  // D1（T15 携带）：站内绝对 '/api/' 扫描形自证正反例（坏形必命中/好形不命中，防正则失配=假保险）
  assert.equal(banAbsApi.test("fetch('/api/github-ops/status')"), true, '反例自证：站内绝对 /api/ 形必命中')
  assert.equal(banAbsApi.test("fetch('api/github-ops/status')"), false, '正例自证：文档相对形不误伤')
  // 真实源码（壳 + 全 chunk）零命中
  const all = srcs.join('\n')
  assert.equal(banName.test(all), false)
  assert.equal(banCall.test(all), false)
  assert.equal(/method:\s*['"`]DELETE['"`]/i.test(all), false)
  assert.equal(/#[0-9A-Fa-f]{3,8}/.test(all), false)
  assert.equal(banAbsApi.test(all), false, '站内绝对 /api/ 形真实源码零命中')
})
