// client-settings 单测（dsh-login-gate 设置栏目 UI + 登录页文案官方契约）：
// 被测件：lib/client.js —— window.__ModuleLoader__ 工厂形（零构建、React 无 JSX）；
//        lib/login-page.js —— renderLogin 纯函数（页脚文案动态 N）。
// 契约（changes/2026-09-29-login-gate-settings/PRODUCT.md US-1~4 + task-12-context.md）：
// settings.section 注册（id='login-gate'、order=31、label='dsh-login-gate'）；四区一段：
// 端口区（可改+事前警示+联动清单四行）/参数区（5 可改+3 只读）/账号区（增改删表单，列表仅名字
// 永无哈希）/说明段（N 天免登录动态 + 固定过期/302 重登/logout-all 机制）。
// 保存语义 R-12/R-16：空 draft 拒保存；成功=合并回显+字面「已保存，已生效（监听端口/参数已即时应用）」（G1）；
// 端口（port）草稿保存前必须先弹断连警示确认条（R-16 事前警示），确认才 POST、取消零 POST；其他键不弹；
// 失败=服务端 message 原文；writable:false=全部只读+注记；载入失败容器内如实。
// 删除契约（R-10）：{action:'delete', name, currentName}，currentName 取自 __gate/status 的 user；
// 取不到→禁用删除按钮+提示（fail-closed）。
// 请求一律文档相对（api/login-gate/settings 等，无前导斜杠=生产 404 教训）；样式只引
// --dsw-alias-* 别名（唯一色板来源）；零第三方 UI 库、零网络外呼。
// 零 mock 姿势：假缝只承接宿主最小形（__ModuleLoader__/require/ctx.slots/React 钩子/fetch），
// 取数走 exports.__fetch 注入缝（插桩非 mock）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderLogin } from '../lib/login-page.js'

const CLIENT_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const source = fs.readFileSync(CLIENT_PATH, 'utf8')

function loadClientFace() {
  const loaded = []
  const win = { __ModuleLoader__: { load: (m) => loaded.push(m) } }
  const effects = []
  let hookState = null
  let refSlot = null // useRef 持久化（真 React 语义：同实例重渲染返回同一 ref；卸载守卫依赖此）
  const reactStub = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useRef: (init) => {
      if (refSlot === null) refSlot = { current: init }
      return refSlot
    },
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
  const mod = loaded[0].factory(req)
  return { loaded, mod, effects }
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

// find/findAll 下钻数组子代（rows 以数组形进 children）
function find(node, pred) {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (node.type !== undefined && pred(node)) return node
  const kids = Array.isArray(node) ? node : (node.children ?? [])
  for (const c of kids) {
    const hit = find(c, pred)
    if (hit) return hit
  }
  return null
}

function findAll(node, pred, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (node.type !== undefined && pred(node)) out.push(node)
  const kids = Array.isArray(node) ? node : (node.children ?? [])
  for (const c of kids) findAll(c, pred, out)
  return out
}

const tick = () => new Promise((res) => setTimeout(res, 0))
const settle = async () => { for (let i = 0; i < 4; i++) await tick() }

const BASE_CONFIG = {
  port: 3500, listenHost: '127.0.0.1', upstreamPort: 3080, rewriteHost: true,
  sessionDays: 30, maxFailures: 5, secureCookie: true, wsAllow: ['^/api/'], gzipPass: true,
}
const BASE_SETTINGS = { data: { writable: true, applied: true, config: { ...BASE_CONFIG }, users: [{ name: 'alice' }, { name: 'bob' }] } }
const BASE_STATUS = { ok: true, user: 'me', exp: 0, mode: 'hmac' }

/** 装载就绪面：真模块加载 + 真注册 + 真组件驱动；onFetch 可覆写 POST 等分支 */
async function mount({ settings = BASE_SETTINGS, status = BASE_STATUS, onFetch = null } = {}) {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const Section = registered[0].component
  const calls = []
  mod.__fetch = async (url, init) => {
    calls.push({ url, init })
    if (onFetch) {
      const hit = await onFetch(url, init, calls)
      if (hit !== undefined) return hit
    }
    if (url === 'api/login-gate/settings' && !(init && init.method)) return { json: async () => JSON.parse(JSON.stringify(settings)) }
    if (url === '__gate/status' && !(init && init.method)) return { json: async () => JSON.parse(JSON.stringify(status)) }
    throw new Error('unexpected fetch: ' + url)
  }
  Section()
  effects[0]()
  await settle()
  const render = () => Section()
  return { mod, effects, Section, render, calls, tree: render() }
}

function rowOf(tree, key) {
  return find(tree, (n) => typeof n.type === 'function' && n.props.field && n.props.field.key === key)
}

function userRowOf(tree, name) {
  return find(tree, (n) => typeof n.type === 'function' && n.props.name === name && n.props.onDelete)
}

/** 渲染账号行（真组件体：el.type(el.props)），断言行内提示用 */
function renderUserRow(tree, name) {
  const el = userRowOf(tree, name)
  assert.ok(el, `账号行在：${name}`)
  return el.type(el.props)
}

function allText(tree) {
  return JSON.stringify(tree)
}

function noticeEl(tree) {
  return find(tree, (n) => typeof n.props?.className === 'string' && /notice|ok|error/.test(n.props.className))
}

/** 按钮文案定位（确认警示条两路驱动用） */
function buttonByText(tree, text) {
  return find(tree, (n) => n.type === 'button' && Array.isArray(n.children) && n.children.includes(text))
}

// ===== 工厂形 / 注册形 =====

test('工厂形：id=dsh-login-gate，导出 {inject, apply, __fetch}，只 require react', () => {
  assert.match(source, /^(\s*\/\/[^\n]*\n)*\s*window\.__ModuleLoader__\.load\(\{/, '必须是工厂形（浏览器 bundle 契约）')
  const { loaded, mod } = loadClientFace()
  assert.equal(loaded[0].id, 'dsh-login-gate')
  assert.equal(typeof loaded[0].factory, 'function')
  assert.deepEqual(mod.inject, ['slots'])
  assert.equal(typeof mod.apply, 'function')
  assert.equal(typeof mod.__fetch, 'function')
})

test('注册形：只注册 settings.section（id=login-gate、order=31、label=dsh-login-gate）', () => {
  const { mod } = loadClientFace()
  const registered = []
  const injected = []
  mod.apply(mkCtx(registered, injected))
  assert.deepEqual(injected, ['settings.section'])
  assert.deepEqual(registered.map((r) => r.decl.name), ['settings.section'], '只注册 settings.section（不注册 sidebar/main 等）')
  const { decl, component } = registered[0]
  assert.equal(decl.id, 'login-gate')
  assert.equal(decl.order, 31)
  assert.equal(typeof decl.label, 'function')
  assert.equal(decl.label(), 'dsh-login-gate')
  assert.equal(typeof component, 'function')
  for (const banned of ['settings.launcher', 'settings.trigger', 'settings.header', 'settings.close', 'settings.action', 'settings.onboarding', 'sidebar.panellist', 'main']) {
    assert.ok(!registered.some((r) => r.decl.name === banned), `禁注册槽位：${banned}`)
  }
})

test('兜底 disposer：slots 缺位/注册抛错=面缺席不炸插件，dispose 幂等收敛', () => {
  const face = loadClientFace()
  const ctx = {
    slots: {
      inject: (_n, setup) => setup(),
      register: () => { throw new Error('slot missing') },
    },
    logger: { warn: () => {} },
    effect: (fn) => { fn(); return () => {} },
  }
  const dispose = face.mod.apply(ctx)
  assert.equal(typeof dispose, 'function')
  dispose()
  dispose() // 幂等
  // slots 整体缺位也不炸（槽位方缺席=面缺席）
  const face2 = loadClientFace()
  const dispose2 = face2.mod.apply({ logger: { warn: () => {} }, effect: (fn) => { fn(); return () => {} } })
  assert.equal(typeof dispose2, 'function')
  dispose2()
})

// ===== 载入面 / 四区一段 =====

test('载入：GET 文档相对 api/login-gate/settings + __gate/status；ready 渲染四区一段', async () => {
  const { calls, tree } = await mount()
  assert.deepEqual(calls.map((c) => c.url).sort(), ['__gate/status', 'api/login-gate/settings'])
  for (const c of calls) assert.ok(!c.url.startsWith('/'), `请求文档相对（无前导斜杠）：${c.url}`)
  assert.equal(tree.props['data-dsh-plugin'], 'dsh-login-gate')
  const text = allText(tree)
  for (const group of ['端口', '参数', '登录账号', '登录会话机制']) {
    assert.ok(text.includes(group), `四区一段在：${group}`)
  }
  // 端口区：默认 3500 可改
  const portRow = rowOf(tree, 'port')
  assert.ok(portRow, '端口行在')
  assert.equal(portRow.props.readOnly, false)
  assert.equal(portRow.props.value, 3500)
  // 参数区：5 可改 + 3 只读
  for (const key of ['sessionDays', 'maxFailures', 'secureCookie', 'wsAllow', 'gzipPass']) {
    const row = rowOf(tree, key)
    assert.ok(row, `可改参数行在：${key}`)
    assert.equal(row.props.readOnly, false, `${key} 可改`)
  }
  for (const key of ['listenHost', 'upstreamPort', 'rewriteHost']) {
    const row = rowOf(tree, key)
    assert.ok(row, `只读参数行在：${key}`)
    assert.equal(row.props.readOnly, true, `${key} 只读展示`)
  }
  // 账号区：列表只显名字，永无哈希（INV-3）
  const text2 = allText(tree)
  assert.ok(text2.includes('alice') && text2.includes('bob'), '账号名字在')
  assert.ok(!/scrypt/i.test(text2), '绝无哈希（INV-3）')
  assert.ok(!text2.includes('$'), '绝无哈希形（INV-3）')
})

test('端口区联动清单四行（INV-7）：gate-watchdog / start-dsh.sh / obsidian-web / Lucky', async () => {
  const { tree } = await mount()
  const text = allText(tree)
  for (const kw of ['gate-watchdog', 'start-dsh.sh', 'obsidian-web', 'Lucky']) {
    assert.ok(text.includes(kw), `联动清单含：${kw}`)
  }
  const items = findAll(tree, (n) => typeof n.props?.className === 'string' && n.props.className.includes('link-item'))
  assert.ok(items.length >= 4, `联动清单四行（实得 ${items.length}）`)
})

test('说明段：「登录后约 N 天内免登录」N=sessionDays 动态 + 机制说明（固定过期/302/logout-all）', async () => {
  const { tree, render, calls } = await mount({
    onFetch: async (url, init) => {
      if (url === 'api/login-gate/settings' && init && init.method === 'POST') {
        return { json: async () => ({ data: { config: { ...BASE_CONFIG, sessionDays: 7 }, applied: true } }) }
      }
      return undefined
    },
  })
  let text = allText(tree)
  assert.ok(text.includes('登录后约 30 天内免登录'), 'N=30 动态文案在')
  for (const kw of ['固定过期', '不续期', '302', 'logout-all']) {
    assert.ok(text.includes(kw), `机制说明含：${kw}`)
  }
  // 改 sessionDays=7 保存后，N 随之变 7（动态）
  rowOf(tree, 'sessionDays').props.onChange(7)
  let t2 = render()
  find(t2, (n) => n.type === 'button' && n.props.className?.includes('save')).props.onClick()
  await settle()
  text = allText(render())
  assert.ok(text.includes('登录后约 7 天内免登录'), 'N 随 sessionDays 动态（7）')
  assert.ok(calls.some((c) => c.init && c.init.method === 'POST'), '确有保存请求')
})

// ===== 保存语义（R-11/R-12 + G1） =====

test('空 draft 拒保存：提示「没有待保存的变更」且零 POST', async () => {
  const { tree, render, calls } = await mount()
  find(tree, (n) => n.type === 'button' && n.props.className?.includes('save')).props.onClick()
  await settle()
  const text = allText(render())
  assert.ok(text.includes('没有待保存的变更'), '空 draft 拒保存提示在')
  assert.ok(!calls.some((c) => c.init && c.init.method === 'POST'), '空 draft 零 POST')
})

test('草稿改回原值=移出草稿：等价空 draft 拒保存（nextDraft 纯函数语义）', async () => {
  const { tree, render, calls } = await mount()
  rowOf(tree, 'sessionDays').props.onChange(7)
  let t = render()
  assert.notEqual(rowOf(t, 'sessionDays').props.value, 30, '草稿值先行回显')
  rowOf(t, 'sessionDays').props.onChange(30) // 改回原值
  t = render()
  find(t, (n) => n.type === 'button' && n.props.className?.includes('save')).props.onClick()
  await settle()
  assert.ok(allText(render()).includes('没有待保存的变更'), '改回原值=无待保存变更')
  assert.ok(!calls.some((c) => c.init && c.init.method === 'POST'), '改回原值零 POST')
})

test('保存成功（G1/R-16）：含 port 草稿=先弹断连警示确认条（零 POST）→ 确认才 POST → 合并回显 + 字面「已保存，已生效」+ draft 清空', async () => {
  const postBodies = []
  const { tree, render } = await mount({
    onFetch: async (url, init) => {
      if (url === 'api/login-gate/settings' && init && init.method === 'POST') {
        postBodies.push(JSON.parse(init.body))
        return { json: async () => ({ data: { config: { ...BASE_CONFIG, sessionDays: 7, port: 3600 }, applied: true } }) }
      }
      return undefined
    },
  })
  rowOf(tree, 'sessionDays').props.onChange(7)
  rowOf(render(), 'port').props.onChange(3600)
  let t = render()
  find(t, (n) => n.type === 'button' && n.props.className?.includes('save')).props.onClick()
  await settle()
  t = render()
  // 事前警示条（R-16）：含 port 草稿先弹、零 POST
  assert.equal(postBodies.length, 0, '确认前零 POST（端口断连警示先行）')
  assert.ok(allText(t).includes('保存后监听端口将立即切换'), '断连警示文案在')
  assert.ok(allText(t).includes('当前连接会断开'), '断连后果明示')
  for (const kw of ['Lucky 外网反代', 'gate-watchdog', 'obsidian-web 3500 分享契约']) {
    assert.ok(allText(t).includes(kw), `警示条联动点名：${kw}`)
  }
  assert.ok(buttonByText(t, '确认保存'), '确认按钮在')
  assert.ok(buttonByText(t, '取消'), '取消按钮在')
  // 确认 → 真正 POST
  buttonByText(t, '确认保存').props.onClick()
  await settle()
  t = render()
  assert.deepEqual(postBodies, [{ patch: { sessionDays: 7, port: 3600 } }], '只发变更叶子（数组整替）')
  const text = allText(t)
  assert.ok(text.includes('已保存，已生效'), 'G1 字面文案落点（R-16：已生效，非需重启）')
  assert.ok(text.includes('监听端口/参数已即时应用'), '附注：监听端口/参数已即时应用')
  const okEl = find(t, (n) => typeof n.props?.className === 'string' && n.props.className.includes('login-gate-settings-ok'))
  assert.ok(okEl, '成功 notice 在')
  assert.ok(allText(okEl).includes('已保存，已生效'), 'G1 字面文案=保存成功 notice 本体')
  assert.deepEqual(noticeEl(t).children, ['已保存，已生效（监听端口/参数已即时应用）'], 'G1 notice 全串等值（R-16 字面全文一字不差，非字面子串）')
  assert.equal(buttonByText(t, '确认保存'), null, '确认后警示条收起')
  // 合并回显：输入值=返回 config；draft 清空（再保存=空 draft 拒）
  assert.equal(rowOf(t, 'sessionDays').props.value, 7)
  assert.equal(rowOf(t, 'port').props.value, 3600)
  find(t, (n) => n.type === 'button' && n.props.className?.includes('save')).props.onClick()
  await settle()
  assert.ok(allText(render()).includes('没有待保存的变更'), '合并回显后 draft 清空')
})

test('端口警示条取消（R-16）：零 POST、警示条收起、草稿保留（可改后重存）', async () => {
  const postBodies = []
  const { tree, render } = await mount({
    onFetch: async (url, init) => {
      if (url === 'api/login-gate/settings' && init && init.method === 'POST') {
        postBodies.push(JSON.parse(init.body))
        return { json: async () => ({ data: { config: { ...BASE_CONFIG, port: 3600 }, applied: true } }) }
      }
      return undefined
    },
  })
  rowOf(tree, 'port').props.onChange(3600)
  let t = render()
  find(t, (n) => n.type === 'button' && n.props.className?.includes('save')).props.onClick()
  await settle()
  t = render()
  assert.ok(buttonByText(t, '取消'), '警示条在')
  buttonByText(t, '取消').props.onClick()
  await settle()
  t = render()
  assert.equal(postBodies.length, 0, '取消绝不 POST')
  assert.equal(buttonByText(t, '确认保存'), null, '取消后警示条收起')
  assert.equal(rowOf(t, 'port').props.value, 3600, '取消不清草稿（保留待保存变更）')
  // 重新点保存→警示条再现（草稿仍在）
  find(t, (n) => n.type === 'button' && n.props.className?.includes('save')).props.onClick()
  await settle()
  assert.ok(buttonByText(render(), '确认保存'), '草稿保留=警示条可再现')
  assert.equal(postBodies.length, 0, '仍零 POST（未确认不发）')
})

test('非端口键保存不弹确认（R-16：无断连影响）：直接 POST', async () => {
  const postBodies = []
  const { tree, render } = await mount({
    onFetch: async (url, init) => {
      if (url === 'api/login-gate/settings' && init && init.method === 'POST') {
        postBodies.push(JSON.parse(init.body))
        return { json: async () => ({ data: { config: { ...BASE_CONFIG, sessionDays: 7 }, applied: true } }) }
      }
      return undefined
    },
  })
  rowOf(tree, 'sessionDays').props.onChange(7)
  let t = render()
  find(t, (n) => n.type === 'button' && n.props.className?.includes('save')).props.onClick()
  await settle()
  t = render()
  assert.deepEqual(postBodies, [{ patch: { sessionDays: 7 } }], '非端口键直接 POST（不经确认）')
  assert.equal(buttonByText(t, '确认保存'), null, '非端口键不弹确认警示条')
  assert.ok(allText(t).includes('已保存，已生效'), '成功 notice 字面')
  assert.ok(allText(t).includes('监听端口/参数已即时应用'), '附注在')
})

test('保存失败：服务端 message 原文回显（not_editable），绝不静默', async () => {
  const { tree, render } = await mount({
    onFetch: async (url, init) => {
      if (url === 'api/login-gate/settings' && init && init.method === 'POST') {
        return { json: async () => ({ error: { code: 'not_editable', message: '字段 listenHost 不在可改白名单' } }) }
      }
      return undefined
    },
  })
  rowOf(tree, 'sessionDays').props.onChange(7)
  let t = render()
  find(t, (n) => n.type === 'button' && n.props.className?.includes('save')).props.onClick()
  await settle()
  assert.ok(allText(render()).includes('字段 listenHost 不在可改白名单'), '服务端 message 原文显示')
})

test('卸载守卫（审查顺手清 c）：卸载后 save 异步回调零 setState（noticeEl 静默、状态冻结）', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const Section = registered[0].component
  let release
  const held = new Promise((resolve) => { release = resolve })
  mod.__fetch = async (url, init) => {
    if (url === '__gate/status') return { json: async () => ({ ok: true, user: 'me', exp: 0, mode: 'hmac' }) }
    if (url === 'api/login-gate/settings' && !(init && init.method)) return { json: async () => JSON.parse(JSON.stringify(BASE_SETTINGS)) }
    if (url === 'api/login-gate/settings' && init && init.method === 'POST') {
      await held // 响应压到卸载之后才放行（在途请求的迟到响应）
      return { json: async () => ({ data: { config: { ...BASE_CONFIG, sessionDays: 42 }, applied: true } }) }
    }
    throw new Error('unexpected fetch: ' + url)
  }
  Section()
  const cleanup = effects[0]() // 载入 effect（返回 alive 清理器）
  await settle()
  let tree = Section()
  rowOf(tree, 'sessionDays').props.onChange(7)
  tree = Section()
  find(tree, (n) => n.type === 'button' && n.props.className?.includes('save')).props.onClick() // 保存在途
  cleanup() // 卸载（置 alive=false）
  release()
  await settle()
  tree = Section()
  assert.equal(noticeEl(tree), null, '卸载后零 setState：成功 notice 绝不落地（未守卫=RED）')
  assert.equal(rowOf(tree, 'sessionDays').props.value, 7, '卸载后状态冻结（迟到响应 config 42 绝不合并）')
  assert.ok(allText(tree).includes('保存中…'), 'saving 态冻结（不被迟到响应改写）')
})

test('writable:false：全部输入只读 + 注记，无保存按钮', async () => {
  const { tree } = await mount({
    settings: { data: { writable: false, applied: true, config: { ...BASE_CONFIG }, users: [{ name: 'alice' }] } },
  })
  for (const key of ['port', 'sessionDays', 'maxFailures', 'secureCookie', 'wsAllow', 'gzipPass']) {
    assert.equal(rowOf(tree, key).props.readOnly, true, `${key} 只读`)
  }
  assert.ok(!find(tree, (n) => n.type === 'button' && n.props.className?.includes('save')), '无保存按钮')
  assert.ok(allText(tree).includes('只读'), '只读注记在')
  const addForm = find(tree, (n) => n.props['data-login-gate-form'] === 'add')
  assert.ok(addForm, '账号表单在（只读态）')
  assert.equal(addForm.props.disabled, true, 'writable:false=账号表单全禁用（全部只读）')
})

test('载入失败：容器内如实报错（不炸面）', async () => {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply(mkCtx(registered, []))
  const Section = registered[0].component
  mod.__fetch = async () => { throw new Error('fetch failed') }
  Section()
  effects[0]()
  await settle()
  const tree = Section()
  const text = allText(tree)
  assert.ok(text.includes('载入失败'), '载入失败如实')
  assert.ok(text.includes('fetch failed'), '失败原因原文')
})

// ===== 账号区（增/改密/删契约） =====

test('账号新增/改密：POST api/login-gate/settings/users 契约形 + 成功合并回显', async () => {
  const posts = []
  const { tree, render } = await mount({
    onFetch: async (url, init) => {
      if (url === 'api/login-gate/settings/users' && init && init.method === 'POST') {
        const body = JSON.parse(init.body)
        posts.push(body)
        return { json: async () => ({ data: { users: body.action === 'add' ? [{ name: 'alice' }, { name: 'bob' }, { name: 'carol' }] : [{ name: 'alice' }, { name: 'bob' }] } }) }
      }
      return undefined
    },
  })
  const addForm = find(tree, (n) => n.props['data-login-gate-form'] === 'add')
  assert.ok(addForm, '新增账号表单在')
  // 测试钩子真落 DOM（审查顺手清 a）：AccountAddForm 渲染出的 div props 带该标记
  const addFormDom = addForm.type(addForm.props)
  assert.equal(addFormDom.type, 'div', '账号表单根元素=div')
  assert.equal(addFormDom.props['data-login-gate-form'], 'add', 'data-login-gate-form 真落组件 div props（非寄生 props）')
  addForm.props.onName('carol')
  addForm.props.onPassword('s3cret')
  let t = render()
  find(t, (n) => n.props['data-login-gate-form'] === 'add').props.onAdd()
  await settle()
  t = render()
  assert.deepEqual(posts[0], { action: 'add', name: 'carol', password: 's3cret' })
  assert.ok(allText(t).includes('carol'), '新增成功合并回显')
  const row = userRowOf(t, 'alice')
  row.props.onPassword('newpass')
  t = render()
  userRowOf(t, 'alice').props.onUpdate()
  await settle()
  assert.deepEqual(posts[1], { action: 'update', name: 'alice', password: 'newpass' })
})

test('删除契约（R-10）：body {action:delete, name, currentName}（currentName 取自 __gate/status 的 user）', async () => {
  const posts = []
  const { tree, render } = await mount({
    status: { ok: true, user: 'me', exp: 0, mode: 'hmac' },
    onFetch: async (url, init) => {
      if (url === 'api/login-gate/settings/users' && init && init.method === 'POST') {
        posts.push(JSON.parse(init.body))
        return { json: async () => ({ data: { users: [{ name: 'bob' }] } }) }
      }
      return undefined
    },
  })
  const row = userRowOf(tree, 'alice')
  assert.equal(row.props.canDelete, true, '非当前账号可删')
  row.props.onDelete()
  await settle()
  assert.deepEqual(posts[0], { action: 'delete', name: 'alice', currentName: 'me' }, '删除必带 currentName')
  assert.ok(allText(render()).includes('bob'), '删除成功合并回显')
})

test('删除 fail-closed：status 取不到 user → 删除按钮禁用 + 提示；当前登录账号行禁删（防自锁）', async () => {
  const posts = []
  const onFetch = async (url, init) => {
    if (url === 'api/login-gate/settings/users' && init && init.method === 'POST') {
      posts.push(JSON.parse(init.body))
      return { json: async () => ({ data: { users: [] } }) }
    }
    return undefined
  }
  // ① status 不给 user（401/404/直连场景）→ 全部删除禁用 + fail-closed 提示
  const a = await mount({ status: { ok: false }, onFetch })
  for (const name of ['alice', 'bob']) {
    assert.equal(userRowOf(a.tree, name).props.canDelete, false, `${name} 删除禁用（fail-closed）`)
  }
  assert.ok(allText(a.tree).includes('无法确定当前登录账号'), 'fail-closed 提示在')
  userRowOf(a.tree, 'alice').props.onDelete()
  await settle()
  assert.equal(posts.length, 0, 'fail-closed 下绝不发删除请求')
  // ② 当前登录账号=alice → 该行禁删 + 防自锁提示
  const b = await mount({ status: { ok: true, user: 'alice' }, onFetch })
  assert.equal(userRowOf(b.tree, 'alice').props.canDelete, false, '当前登录账号禁删（防自锁）')
  assert.equal(userRowOf(b.tree, 'bob').props.canDelete, true, '他人可删')
  assert.ok(allText(renderUserRow(b.tree, 'alice')).includes('防自锁'), '防自锁提示在（行内）')
  assert.equal(posts.length, 0, '禁用态不发请求')
})

test('账号操作失败：服务端 message 原文（config-only not_found 给因）', async () => {
  const { tree, render } = await mount({
    onFetch: async (url, init) => {
      if (url === 'api/login-gate/settings/users' && init && init.method === 'POST') {
        return { json: async () => ({ error: { code: 'not_found', message: '用户「alice」由配置（settings.yaml users）维护，不支持在此修改/删除' } }) }
      }
      return undefined
    },
  })
  userRowOf(tree, 'alice').props.onPassword('newpass')
  let t = render()
  userRowOf(t, 'alice').props.onUpdate()
  await settle()
  assert.ok(allText(render()).includes('由配置（settings.yaml users）维护'), 'config-only 给因原文显示')
})

// ===== 样式/请求形（dsh token 唯一色板；文档相对；零外呼） =====

test('样式面：--dsw-alias-* 唯一色板（带 fallback、零硬编码色值/零暗色分支）+ document 守卫幂等注入', () => {
  assert.match(source, /typeof document\s*!==\s*['"]undefined['"]/, '样式注入守卫 document（Node 无 document 不炸）')
  assert.match(source, /data-plugin-css/, 'style 幂等标记')
  const cssMatch = source.match(/var SETTINGS_CSS = \[([\s\S]*?)\]\.join/)
  assert.ok(cssMatch, '样式集中在 SETTINGS_CSS（单文件自包含）')
  const css = cssMatch[1]
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, '禁硬编码色值（hex）')
  assert.doesNotMatch(css, /rgba?\(/i, '禁硬编码色值（rgb/rgba）')
  assert.doesNotMatch(css, /hsla?\(/i, '禁硬编码色值（hsl/hsla）')
  assert.doesNotMatch(source, /prefers-color-scheme|data-ds-dark-theme/, '暗色不写 media query/分支')
  const aliasVars = source.match(/var\(--dsw-alias-[^)]*/g) ?? []
  assert.ok(aliasVars.length > 0, '色板一律引 --dsw-alias-* 宿主别名')
  for (const v of aliasVars) assert.ok(v.includes(','), `别名 token 带 fallback：${v}`)
  assert.match(source, /var\(--dsw-radius-[^)]*,/, '圆角引 --dsw-radius-* token（带 fallback）')
  assert.match(source, /login-gate-settings-save:focus-visible/, '焦点环引宿主 token')
})

test('请求形：文档相对 + 零第三方 UI 库 + 零网络外呼', () => {
  assert.doesNotMatch(source, /['"`]\/(api|__gate)\//, '禁绝对路径请求（生产 404 教训）')
  assert.doesNotMatch(source, /https?:\/\//, '零网络外呼（URL 字面都不留）')
  assert.doesNotMatch(source, /import\s|require\(\s*['"](?!react['"])/, '零第三方 UI 库（只 require react）')
  assert.match(source, /var SETTINGS_URL = 'api\/login-gate\/settings'/)
  assert.match(source, /var USERS_URL = 'api\/login-gate\/settings\/users'/)
  assert.match(source, /var STATUS_URL = '__gate\/status'/)
})

// ===== login-page.js 文案动态 N（纯函数） =====

test('登录页页脚文案动态 N（sessionDays）：renderLogin 纯函数', () => {
  const html7 = renderLogin({ sessionDays: 7 })
  assert.ok(html7.includes('登录后约 7 天内免登录'), 'sessionDays=7 动态')
  const html30 = renderLogin({})
  assert.ok(html30.includes('登录后约 30 天内免登录'), '缺省 30 天')
  const htmlOdd = renderLogin({ sessionDays: 365 })
  assert.ok(htmlOdd.includes('登录后约 365 天内免登录'), 'sessionDays=365 动态')
  const htmlBad = renderLogin({ sessionDays: 'abc' })
  assert.ok(htmlBad.includes('登录后约 30 天内免登录'), '非法入参回落 30')
  // 动态性证明：不同入参产出不同文案位
  assert.notEqual(html7.match(/登录后约 \d+ 天内免登录/)[0], html30.match(/登录后约 \d+ 天内免登录/)[0])
})
