// client-face 单测（dsh 客户端面官方契约）—— 被测件：lib/client.js（工厂形 CJS bundle，零构建纯 JS）。
// 契约（Task 7 简报测试契约，照 wiki-steward client-face 形）：
//   ① 加载形：window.__ModuleLoader__.load({id,factory}) 在场 + exports.apply(ctx) + exports.inject=['slots']。
//   ② 注册回调：假 ctx.slots 捕获 settings.section 注册（name/id/order/label/组件函数），label()='RTK Kit'（INV-1）。
//   ③ 面貌（INV-10/INV-7）：零第三方 UI 库 import（require 白名单仅 react）、零 settings.plugins.tab、
//      零 fetch('/ 开头站内绝对 URL（issue #1707 教训：文档相对，无前导斜杠）。
//   ④ 触发方式（INV-11/INV-3）：挂载自动拉统计恰一次（加载中指标 '-' 占位）；版本/健康仅按钮触发；
//      周期切换 日|周|月|全部（缺省「全部」）纯客户端切片、零新请求。
//   ⑤ 状态面（US-4/INV-5）：空闲/加载中/成功/失败（红叉+原因 --danger）/超时（--warning+重试）/rtk 缺失（安装提示）。
//   ⑥ 测试红线（INV-4/INV-8）：fetch 全走注入假实现（exports.__fetch 插桩），零真实 rtk 执行。
// 零 mock 姿势：假缝只承接宿主最小形（__ModuleLoader__/require/ctx.slots/React 钩子/fetch），
// 被测逻辑=注册契约、状态机与触发方式本身，全真跑真断言（mini React runtime 驱动挂载/重渲染）。
// 注意：mini runtime 的钩子槽按调用序全局排布——组件纪律与实现一致「状态全在根组件、子渲染无钩子」。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const CLIENT_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const CHUNK_PATH = fileURLToPath(new URL('../lib/client.install.js', import.meta.url))
const source = fs.readFileSync(CLIENT_PATH, 'utf8')

// ── 工厂形加载 + mini React runtime（最小宿主形） ─────────────────────────────

function loadClientFace() {
  const loaded = []
  const win = { __ModuleLoader__: { load: (m) => loaded.push(m) } }
  const runtime = { hooks: [], cursor: 0, pending: [], tree: null, renders: 0, Component: null, props: null }
  function expand(node) {
    if (node === null || node === undefined || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map(expand)
    if (typeof node.type === 'function') return expand(node.type(node.props))
    const out = { type: node.type, props: { ...node.props } }
    if ('children' in out.props) out.props.children = expand(out.props.children)
    return out
  }
  runtime.render = () => {
    runtime.cursor = 0
    runtime.tree = expand(runtime.Component(runtime.props))
    runtime.renders += 1
  }
  runtime.flushEffects = () => {
    const list = runtime.pending.splice(0)
    for (const fn of list) fn()
  }
  runtime.mount = (Component, props) => {
    runtime.Component = Component
    runtime.props = props ?? {}
    runtime.render()
    runtime.flushEffects()
  }
  const reactStub = {
    createElement: (type, props, ...children) => {
      const merged = { ...(props ?? {}) }
      if (children.length > 0) merged.children = children.length === 1 ? children[0] : children
      return { type, props: merged }
    },
    useState: (init) => {
      const i = runtime.cursor++
      if (!(i in runtime.hooks)) runtime.hooks[i] = init
      return [runtime.hooks[i], (next) => {
        runtime.hooks[i] = typeof next === 'function' ? next(runtime.hooks[i]) : next
        runtime.render()
      }]
    },
    useEffect: (fn, deps) => {
      const i = runtime.cursor++
      const prev = runtime.hooks[i]
      const changed = prev === undefined
        || !deps || deps.length !== prev.deps.length || deps.some((d, k) => d !== prev.deps[k])
      runtime.hooks[i] = { fn, deps: deps ?? [] }
      if (changed) runtime.pending.push(fn)
    },
    useRef: (init) => {
      const i = runtime.cursor++
      if (!(i in runtime.hooks)) runtime.hooks[i] = { current: init }
      return runtime.hooks[i]
    },
  }
  const holder = { chunk: null }
  const req = (name) => {
    if (name === 'react') return reactStub
    throw new Error(`unexpected require: ${name}`) // require 白名单断言的执行面：非 react 一律炸
  }
  // 兄弟 chunk 缝（Task 4）：require.async('./client.install.js') → 真 chunk 模块（宿主 CLIENT_CHUNK 形）
  req.async = (spec) => (spec === './client.install.js' && holder.chunk
    ? Promise.resolve(holder.chunk)
    : Promise.reject(new Error(`unexpected chunk: ${spec}`)))
  const fn = new Function('window', source)
  fn(win)
  assert.equal(loaded.length, 1, 'bundle 必须登记一个模块')
  const mod = loaded[0].factory(req)
  // 装载真 client.install.js chunk（同最小宿主形；缺文件=chunk 面缺席，仅 Task 4 前的中间态容忍）
  const chunkRegs = []
  if (fs.existsSync(CHUNK_PATH)) {
    new Function('window', fs.readFileSync(CHUNK_PATH, 'utf8'))({ __ModuleLoader__: { load: (m) => chunkRegs.push(m) } })
    const reg = chunkRegs.find((r) => r.chunk === 'client.install.js')
    if (reg) holder.chunk = reg.factory(req)
  }
  return { loaded, chunkRegs, mod, chunk: holder.chunk, runtime }
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

/** 树内找全部匹配节点（数组 children 也下钻） */
function findAll(node, pred, out = []) {
  if (Array.isArray(node)) {
    for (const c of node) findAll(c, pred, out)
    return out
  }
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (typeof node.type === 'string' && pred(node)) out.push(node)
  if (node.props && node.props.children !== undefined) findAll(node.props.children, pred, out)
  return out
}
function find(node, pred) { return findAll(node, pred)[0] ?? null }
function texts(node, out = []) {
  if (typeof node === 'string') { out.push(node); return out }
  if (Array.isArray(node)) { for (const c of node) texts(c, out); return out }
  if (node && typeof node === 'object' && node.props && node.props.children !== undefined) texts(node.props.children, out)
  return out
}
function textOf(tree) { return texts(tree).join(' ') }

const button = (tree, action) => find(tree, (n) => n.type === 'button' && n.props['data-rtk-action'] === action)
const segButton = (tree, period) => find(tree, (n) => n.type === 'button' && n.props['data-rtk-period'] === period)
const metric = (tree, key) => find(tree, (n) => n.type === 'span' && n.props['data-rtk-metric'] === key)
const metricText = (tree, key) => { const n = metric(tree, key); return n ? texts(n).join('') : null }
const checkRow = (tree, id) => find(tree, (n) => n.props && n.props['data-rtk-check'] === id)

/** 注入假 fetch（记录调用；路由表回信封；零真实网络/零真实 rtk——INV-4/INV-8 红线） */
function mkFetch(routes) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init })
    const hit = routes[url]
    const body = typeof hit === 'function' ? await hit() : hit
    return { json: async () => body }
  }
  fn.calls = calls
  return fn
}

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) }

/** 挂载设置节（注册回调取组件 → mini runtime 挂载 → 首轮 effects 执行） */
function mountSection(routes, opts = {}) {
  const { mod, runtime } = loadClientFace()
  const fake = mkFetch(routes)
  mod.__fetch = fake
  const registered = []
  const injected = []
  const dispose = mod.apply(mkCtx(registered, injected))
  assert.equal(typeof dispose, 'function', 'apply 必须回 disposer')
  const entry = registered.find((r) => r.decl.name === 'settings.section')
  runtime.mount(entry.component, { close: () => {} })
  return { mod, runtime, fake, entry, injected, dispose }
}

// ── 夹具（信封形照 Task 6 契约：成功 {data}；失败 {error:{code,message[,hint]}}） ──

const GAIN_OK = {
  data: {
    summary: {
      total_commands: 2070, total_input: 1200000, total_output: 380000, total_saved: 820000,
      avg_savings_pct: 68, total_time_ms: null, avg_time_ms: null,
    },
    // 多行 daily：锁「最新桶」切片口径（max 周期键），防与「序列合计」混淆
    daily: [
      { date: '2026-09-28', commands: 9, input_tokens: 90, output_tokens: 9, saved_tokens: 9, savings_pct: 10 },
      { date: '2026-09-29', commands: 1, input_tokens: 10, output_tokens: 5, saved_tokens: 6, savings_pct: 30 },
    ],
    weekly: [{ week_start: '2026-09-22', week_end: '2026-09-28', commands: 2, input_tokens: 20, output_tokens: 10, saved_tokens: 12, savings_pct: 32 }],
    monthly: [{ month: '2026-09', commands: 3, input_tokens: 30, output_tokens: 15, saved_tokens: 18, savings_pct: 33 }],
  },
}
const GAIN_MISSING_FIELDS = {
  data: { summary: { total_commands: null, total_input: null, total_output: null, total_saved: null, avg_savings_pct: null }, daily: [], weekly: [], monthly: [] },
}
const VERSION_OK = { data: { available: true, version: '0.49.0', path: '/root/.local/bin/rtk', hint: null } }
const VERSION_MISSING = { data: { available: false, version: null, path: '/root/.local/bin/rtk', hint: 'rtk 二进制缺失：请先安装 rtk（https://example.invalid/install）' } }
const HEALTH_OK = {
  data: [
    { id: 'binary-exec', label: '二进制可执行', status: 'pass', detail: 'rtk 可执行' },
    { id: 'version-parse', label: '版本可解析', status: 'pass', detail: 'rtk 0.49.0' },
    { id: 'rewrite-seam', label: 'rewrite 缝生效', status: 'pass', detail: '^rtk 改写缝在位' },
    { id: 'guard-matrix', label: '守卫矩阵健全', status: 'pass', detail: '8 测试' },
    { id: 'fail-open', label: 'fail-open 链路', status: 'pass', detail: '降级不炸' },
    { id: 'gain-source', label: '统计源可用', status: 'pass', detail: 'gain -a -f json 可解析' },
    { id: 'compression-effective', label: '压缩生效', status: 'fail', detail: '近 30 天无压缩记录' },
  ],
}
const ERR_TIMEOUT = { error: { code: 'RTK_TIMEOUT', message: 'rtk 执行超时（5000ms）' } }
const ERR_UNAVAILABLE = { error: { code: 'RTK_UNAVAILABLE', message: 'rtk 执行失败（spawn 级）：ENOENT', hint: 'rtk 二进制缺失：请先安装 rtk' } }
const ERR_GENERIC = { error: { code: 'RTK_ERROR', message: 'rtk gain 输出不是合法 JSON' } }

// ── ① 加载形（工厂形 CJS 契约） ────────────────────────────────────────────────

test('加载形：__ModuleLoader__ 工厂形 CJS，id=dsh-rtk-kit，导出 {inject, apply, __fetch}', () => {
  assert.match(source, /^(\s*\/\/[^\n]*\n)*\s*window\.__ModuleLoader__\.load\(\{/, '必须是工厂形（浏览器 bundle 契约；头注释可前置）')
  const { loaded, mod } = loadClientFace()
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].id, 'dsh-rtk-kit')
  assert.equal(typeof loaded[0].factory, 'function')
  assert.deepEqual(mod.inject, ['slots'], '只取 slots 缝')
  assert.equal(typeof mod.apply, 'function')
  assert.equal(typeof mod.__fetch, 'function', 'fetch 注入缝（测试红线：零真实请求）')
})

// ── ② 注册回调（INV-1） ──────────────────────────────────────────────────────

test('注册回调：settings.section 独立菜单项（name/id/order/label/组件函数），label() 回 RTK Kit', () => {
  const { mod } = loadClientFace()
  const registered = []
  const injected = []
  mod.apply(mkCtx(registered, injected))
  assert.deepEqual(injected, ['settings.section'], '只走 settings.section（零 settings.plugins.tab 旧路线）')
  assert.equal(registered.length, 1)
  const { decl, component } = registered[0]
  assert.equal(decl.name, 'settings.section')
  assert.equal(decl.id, 'rtk-kit')
  assert.equal(typeof decl.order, 'number')
  assert.equal(typeof decl.label, 'function')
  assert.equal(decl.label(), 'RTK Kit', '菜单项文案（INV-1）')
  assert.equal(typeof component, 'function', '注册体=组件函数')
})

test('注册回调：缺槽位方 fail-open（inject 不炸装载，ADR-001 影响面）', () => {
  const { mod } = loadClientFace()
  let threw = null
  try {
    mod.apply({
      slots: {
        inject: () => { throw new Error('slot missing') },
        register: () => () => {},
      },
      logger: { warn: () => {} },
    })
  } catch (e) { threw = e }
  assert.equal(threw, null, '缺槽不抛（slots.inject 缺槽 fail-open）')
})

// ── ③ 面貌断言（INV-10/INV-7，grep 级） ───────────────────────────────────────

test('面貌：零第三方 UI 库 import、零 settings.plugins.tab、零站内绝对 URL（issue #1707）', () => {
  // 剥注释取真代码（头注释里的旧路线/示例不算代码引用）
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
  const requires = [...code.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1])
  assert.deepEqual([...new Set(requires)], ['react'], 'require 白名单仅 react（纯 React 零第三方 UI 库，INV-10）')
  assert.ok(!code.includes('settings.plugins.tab'), '零旧页签路线（INV-1）')
  assert.ok(!code.includes('element-plus') && !code.includes('antd'), '零第三方 UI 库字面')
  assert.ok(!/fetch\(\s*['"`]\//.test(code), "零 fetch('/ 开头站内绝对 URL")
  assert.ok(!/['"`]\//.test(code), '零以 / 开头的字符串字面（一律文档相对）')
  assert.ok(!/^\s*import\s/m.test(code), '零 ESM import（工厂形 CJS，零构建链）')
})

test('DESIGN.md token 逐字落地（色彩 9 + 字阶 15/14/13/12 + 间距 4/8/12/16/24 + 圆角 6px）', () => {
  for (const pair of [
    '--bg-page:#ffffff', '--bg-subtle:#f7f8fa', '--border:#e5e6eb',
    '--text-primary:#1f2329', '--text-secondary:#646a73', '--accent:#3370ff',
    '--success:#2ea44f', '--danger:#d83931', '--warning:#d97706',
  ]) {
    assert.ok(source.includes(pair), `色彩 token 逐字落地缺 ${pair}`)
  }
  for (const size of ['15px', '14px', '13px', '12px']) {
    assert.ok(source.includes(size), `字阶缺 ${size}`)
  }
  // Ruling C（2026-09-29）：指标值 13px/600（定稿图 final.png 优先，20px 系 DESIGN.md 转写误差）——正向锁 + 防漂移
  assert.match(source, /\.rtk-m-value\{font-size:13px;font-weight:600/, '指标值=13px/600（Ruling C 对齐定稿图）')
  assert.ok(!source.includes('20px'), 'Ruling C 后零 20px 残留')
  for (const space of ['4px', '8px', '12px', '16px', '24px']) {
    assert.ok(source.includes(space), `间距阶梯缺 ${space}`)
  }
  assert.ok(source.includes('6px'), '圆角 6px 在场')
})

test('一页三区块 + 页头定稿（INV-1）：RTK Kit / rtk 输出压缩工具包 / RTK 版本 / 节省统计 / 功能健康', () => {
  const routes = {
    'api/rtk-kit/gain': GAIN_OK,
    'api/rtk-kit/version': VERSION_OK,
    'api/rtk-kit/health': HEALTH_OK,
  }
  const { runtime } = mountSection(routes)
  const text = textOf(runtime.tree)
  assert.ok(text.includes('RTK Kit'), '页头标题')
  assert.ok(text.includes('rtk 输出压缩工具包'), '副题（12px --text-secondary）')
  for (const t of ['RTK 版本', '节省统计', '功能健康']) assert.ok(text.includes(t), `三区块缺 ${t}`)
  assert.equal(findAll(runtime.tree, (n) => n.props && n.props['data-rtk-block']).length, 3, '恰三区块')
})

// ── ④ 触发方式（INV-11 / INV-3） ─────────────────────────────────────────────

test('触发方式：挂载自动拉统计恰一次；版本/健康仅按钮触发（按钮前零请求）', async () => {
  const routes = {
    'api/rtk-kit/gain': GAIN_OK,
    'api/rtk-kit/version': VERSION_OK,
    'api/rtk-kit/health': HEALTH_OK,
  }
  const { runtime, fake } = mountSection(routes)
  await settle()
  assert.deepEqual(fake.calls.map((c) => c.url), ['api/rtk-kit/gain'], '进页自动拉统计恰一次（INV-11）')
  assert.equal(fake.calls[0].url[0], 'a', 'URL 文档相对（无前导斜杠，issue #1707）')

  button(runtime.tree, 'check-version').props.onClick()
  await settle()
  assert.deepEqual(fake.calls.map((c) => c.url), ['api/rtk-kit/gain', 'api/rtk-kit/version'], '版本检查=按钮触发恰一次')

  button(runtime.tree, 'run-health').props.onClick()
  await settle()
  assert.deepEqual(fake.calls.map((c) => c.url), ['api/rtk-kit/gain', 'api/rtk-kit/version', 'api/rtk-kit/health'], '健康检查=按钮触发恰一次')
  const healthCall = fake.calls[2]
  assert.equal(healthCall.init.method, 'POST', 'health 走 POST')
  assert.equal(healthCall.init.body, '{}', 'body 发 {}（服务端不读）')
})

test('触发方式：加载中指标值「-」占位（INV-11）', () => {
  const routes = { 'api/rtk-kit/gain': () => new Promise(() => {}) } // 挂起态：渲染加载中
  const { runtime } = mountSection(routes)
  for (const key of ['commands', 'input', 'output', 'saved', 'rate']) {
    assert.equal(metricText(runtime.tree, key), '-', `加载中 ${key} 应为 '-' 占位`)
  }
})

test('成功态指标形（定稿）：2,070 / 1.2M / 380K / 820K / 68%（节省率 --success）', async () => {
  const { runtime } = mountSection({ 'api/rtk-kit/gain': GAIN_OK })
  await settle()
  assert.equal(metricText(runtime.tree, 'commands'), '2,070')
  assert.equal(metricText(runtime.tree, 'input'), '1.2M')
  assert.equal(metricText(runtime.tree, 'output'), '380K')
  assert.equal(metricText(runtime.tree, 'saved'), '820K')
  assert.equal(metricText(runtime.tree, 'rate'), '68%')
  assert.match(metric(runtime.tree, 'rate').props.className, /rtk-ok/, '节省率 --success 着色接线')
})

test('缺字段=null 渲染「-」占位（Task 6 契约：缺字段 null/[] 占位）', async () => {
  const { runtime } = mountSection({ 'api/rtk-kit/gain': GAIN_MISSING_FIELDS })
  await settle()
  for (const key of ['commands', 'input', 'output', 'saved', 'rate']) {
    assert.equal(metricText(runtime.tree, key), '-', `null 字段 ${key} 应为 '-'`)
  }
})

test('周期切换（INV-3）：日|周|月|全部纯客户端切片、零新请求，缺省「全部」', async () => {
  const { runtime, fake } = mountSection({ 'api/rtk-kit/gain': GAIN_OK })
  await settle()
  assert.equal(fake.calls.length, 1)
  const allBtn = segButton(runtime.tree, 'all')
  assert.ok(allBtn, '缺省「全部」分段在场')
  assert.match(allBtn.props.className, /rtk-on/, '缺省选中「全部」')

  // 切片口径（Ruling B）：序列取最新桶（max 周期键）；「全部」=summary 聚合
  segButton(runtime.tree, 'day').props.onClick()
  assert.equal(metricText(runtime.tree, 'commands'), '1', '日=最新日桶（2026-09-29，非序列合计 10）')
  assert.equal(metricText(runtime.tree, 'rate'), '30%')
  segButton(runtime.tree, 'week').props.onClick()
  assert.equal(metricText(runtime.tree, 'commands'), '2')
  segButton(runtime.tree, 'month').props.onClick()
  assert.equal(metricText(runtime.tree, 'commands'), '3')
  segButton(runtime.tree, 'all').props.onClick()
  assert.equal(metricText(runtime.tree, 'commands'), '2,070')
  assert.equal(fake.calls.length, 1, '周期切换零新请求（客户端切片）')
})

// ── ⑤ 状态面（US-4 / INV-5 / Ruling A） ──────────────────────────────────────

test('版本成功态：✓ rtk 0.49.0 · /root/.local/bin/rtk（mono）', async () => {
  const { runtime, fake } = mountSection({ 'api/rtk-kit/gain': GAIN_OK, 'api/rtk-kit/version': VERSION_OK })
  await settle()
  button(runtime.tree, 'check-version').props.onClick()
  await settle()
  const block = find(runtime.tree, (n) => n.props && n.props['data-rtk-block'] === 'version')
  const text = textOf(block)
  assert.ok(text.includes('rtk 0.49.0'), '版本号')
  assert.ok(text.includes('/root/.local/bin/rtk'), '二进制路径')
  assert.equal(fake.calls.filter((c) => c.url === 'api/rtk-kit/version').length, 1)
})

test('版本缺失态（Ruling A）：available:false → data.hint 安装提示 + --warning（数据态非错误）', async () => {
  const { runtime } = mountSection({ 'api/rtk-kit/gain': GAIN_OK, 'api/rtk-kit/version': VERSION_MISSING })
  await settle()
  button(runtime.tree, 'check-version').props.onClick()
  await settle()
  const block = find(runtime.tree, (n) => n.props && n.props['data-rtk-block'] === 'version')
  assert.ok(textOf(block).includes('rtk 二进制缺失：请先安装 rtk'), '缺失态读 data.hint（安装提示）')
  assert.ok(findAll(block, (n) => /rtk-warn/.test(n.props.className ?? '')).length > 0, '--warning 着色接线')
})

test('健康检查：七项行 + meta 统计 + 检查行形（名称左/状态右 + 失败原因次行，不藏失败）', async () => {
  const { runtime } = mountSection({ 'api/rtk-kit/gain': GAIN_OK, 'api/rtk-kit/health': HEALTH_OK })
  await settle()
  button(runtime.tree, 'run-health').props.onClick()
  await settle()
  const block = find(runtime.tree, (n) => n.props && n.props['data-rtk-block'] === 'health')
  const text = textOf(block)
  assert.ok(text.includes('7 项 · 6 通过 / 1 失败'), 'meta 统计形（定稿）')
  for (const item of HEALTH_OK.data) assert.ok(checkRow(block, item.id), `检查行缺 ${item.id}`)
  const failRow = checkRow(block, 'compression-effective')
  assert.ok(texts(failRow).join(' ').includes('✗ 失败'), '失败行状态右置')
  assert.ok(texts(failRow).join(' ').includes('近 30 天无压缩记录'), '失败原因次行（detail 如实展示）')
  const passRow = checkRow(block, 'binary-exec')
  assert.ok(texts(passRow).join(' ').includes('✓ 正常'), '通过行状态')
})

test('状态面（US-4）：gain RTK_TIMEOUT → rtk 响应超时 + 重试按钮（--warning）', async () => {
  const { runtime, fake } = mountSection({ 'api/rtk-kit/gain': ERR_TIMEOUT })
  await settle()
  const text = textOf(runtime.tree)
  assert.ok(text.includes('rtk 响应超时'), '超时文案（INV-5）')
  const retry = button(runtime.tree, 'retry-gain')
  assert.ok(retry, '超时态带重试按钮')
  assert.match(retry.props.className, /rtk-btn/)
  assert.ok(findAll(runtime.tree, (n) => /rtk-warn/.test(n.props.className ?? '')).length > 0, '--warning 着色接线')
  retry.props.onClick()
  await settle()
  assert.equal(fake.calls.filter((c) => c.url === 'api/rtk-kit/gain').length, 2, '重试=再次请求')
})

test('状态面：gain RTK_UNAVAILABLE → error.hint 安装提示（--warning）', async () => {
  const { runtime } = mountSection({ 'api/rtk-kit/gain': ERR_UNAVAILABLE })
  await settle()
  const text = textOf(runtime.tree)
  assert.ok(text.includes('rtk 二进制缺失：请先安装 rtk'), '缺失态读 error.hint')
  assert.ok(!text.includes('rtk 响应超时'), '非超时态')
})

test('状态面：gain RTK_ERROR → 红叉 + 原因小字（--danger），不吞错误', async () => {
  const { runtime } = mountSection({ 'api/rtk-kit/gain': ERR_GENERIC })
  await settle()
  const text = textOf(runtime.tree)
  assert.ok(text.includes('rtk gain 输出不是合法 JSON'), '失败原因原文')
  assert.ok(findAll(runtime.tree, (n) => /rtk-fail/.test(n.props.className ?? '')).length > 0, '--danger 着色接线')
})

test('状态面：health RTK_TIMEOUT → rtk 响应超时 + 重试按钮（INV-5）', async () => {
  const { runtime, fake } = mountSection({ 'api/rtk-kit/gain': GAIN_OK, 'api/rtk-kit/health': ERR_TIMEOUT })
  await settle()
  button(runtime.tree, 'run-health').props.onClick()
  await settle()
  const block = find(runtime.tree, (n) => n.props && n.props['data-rtk-block'] === 'health')
  assert.ok(textOf(block).includes('rtk 响应超时'), '健康区超时文案')
  const retry = button(block, 'retry-health')
  assert.ok(retry, '健康区重试按钮')
  retry.props.onClick()
  await settle()
  assert.equal(fake.calls.filter((c) => c.url === 'api/rtk-kit/health').length, 2, '重试=再次请求')
})

test('状态面：版本 RTK_ERROR（错误信封）→ 红叉 + 原因小字（--danger）', async () => {
  const { runtime } = mountSection({ 'api/rtk-kit/gain': GAIN_OK, 'api/rtk-kit/version': ERR_GENERIC })
  await settle()
  button(runtime.tree, 'check-version').props.onClick()
  await settle()
  const block = find(runtime.tree, (n) => n.props && n.props['data-rtk-block'] === 'version')
  assert.ok(textOf(block).includes('rtk gain 输出不是合法 JSON'), '失败原因原文进版本区')
})

// ── Ruling I / F-01：失败态显式「重试」按钮（不只超时态） ──────────────────────

test('F-01：gain 失败态（自动拉取失败）带「重试」按钮，点击=重发回 loading 再成功', async () => {
  let calls = 0
  const routes = {
    'api/rtk-kit/gain': () => { calls += 1; return calls === 1 ? ERR_GENERIC : GAIN_OK },
  }
  const { runtime, fake } = mountSection(routes)
  await settle()
  assert.ok(textOf(runtime.tree).includes('rtk gain 输出不是合法 JSON'), '失败态红叉+原因小字')
  const retry = button(runtime.tree, 'retry-gain')
  assert.ok(retry, '失败态带重试按钮（F-01，非仅超时态）')
  assert.equal(retry.props.children, '重试')
  retry.props.onClick()
  assert.equal(metricText(runtime.tree, 'commands'), '-', '点击后回 loading 态（指标「-」占位）')
  await settle()
  assert.equal(metricText(runtime.tree, 'commands'), '2,070', '重试成功后渲染指标')
  assert.equal(fake.calls.filter((c) => c.url === 'api/rtk-kit/gain').length, 2, '重试=重发请求')
})

test('F-01：版本块失败态带「重试」按钮（原操作按钮保留），点击=重发 version 请求', async () => {
  let calls = 0
  const routes = {
    'api/rtk-kit/gain': GAIN_OK,
    'api/rtk-kit/version': () => { calls += 1; return calls === 1 ? ERR_GENERIC : VERSION_OK },
  }
  const { runtime, fake } = mountSection(routes)
  await settle()
  button(runtime.tree, 'check-version').props.onClick()
  await settle()
  let block = find(runtime.tree, (n) => n.props && n.props['data-rtk-block'] === 'version')
  assert.ok(textOf(block).includes('rtk gain 输出不是合法 JSON'), '失败原因原文')
  const retry = button(block, 'retry-version')
  assert.ok(retry, '版本失败态带重试按钮（F-01）')
  assert.ok(button(block, 'check-version'), '原操作按钮保留不动（Ruling I）')
  retry.props.onClick()
  await settle()
  block = find(runtime.tree, (n) => n.props && n.props['data-rtk-block'] === 'version')
  assert.ok(textOf(block).includes('rtk 0.49.0'), '重试成功后渲染版本行')
  assert.equal(fake.calls.filter((c) => c.url === 'api/rtk-kit/version').length, 2, '重试=重发请求')
})

// ── Task 4 增：兄弟 chunk 引用形（安装面 client.install.js，require.async 惰性取用） ─────────────

test('兄弟 chunk 引用形（Task 4）：require.async("./client.install.js") 惰性取用安装面；chunk 名过宿主白名单', () => {
  const { chunk } = loadClientFace()
  assert.ok(source.includes('require.async('), '壳经 require.async 引用兄弟 chunk（零构建多 chunk 先例形）')
  assert.ok(source.includes("'./client.install.js'"), 'chunk 引用 ./client.install.js')
  assert.match('client.install.js', /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/, 'chunk 名过宿主 CLIENT_CHUNK 白名单')
  assert.ok(chunk, 'client.install.js chunk 可载入（exports 面在场）')
  assert.equal(typeof chunk.renderInstallRow, 'function', '安装控件 render 面')
  assert.equal(typeof chunk.runInstall, 'function', '安装状态机执行面')
})

test('Task 4 接入缝：URL_INSTALL 常量在场（文档相对；与 doctor-routes 锁等值由 client-install 测试锁定）', () => {
  assert.ok(source.includes("var URL_INSTALL = 'api/rtk-kit/install'"), 'URL_INSTALL 常量（文档相对无前导斜杠）')
  assert.ok(!/fetch\(\s*['"`]\//.test(source), '零 fetch 站内绝对 URL（issue 1707）')
})
