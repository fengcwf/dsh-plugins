// dsh-login-gate — integration 形跨面契约（Task 13 验收 1）：
//   ①端到端 apply() 全链路：假 ctx 真 apply() → webServer 缝真 handler 执行 → GET/POST 契约 +
//     users CRUD 真落 usersFile（真 scrypt）+ 设置写真落 configEditor entry + 未登录拒零副作用。
//   ②跨面对账：真 client 消费代码（lib/client.js 真组件体）对着真服务端产出形逐项对齐——
//     契约漂移（键改名/形变更/消费键失踪）即红；currentName 来自真 gate /__gate/status（真签发者）。
// 假缝最小形（插桩非 mock）：ctx（effect/plugin/get）、connection.requestRejection、configEditor
// （宿主缝契约形）、forwarder（转发非本测职责）。其余全真：真 http handler、真 zod 校验、真 scrypt、真 fs。
// 客户端驱动装具自包含（与 test/client-settings.test.mjs 同构，useRef 持久化=真 React 语义）。
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply, Config } from '../lib/index.js'
import { createApplyPatch, createConfigReader, readEntryConfig } from '../lib/settings-write.js'
import { verifyPassword, createSessionManager } from '../lib/auth.js'
import { createRateLimiter } from '../lib/ratelimit.js'
import { createGateServer } from '../lib/gate.js'

const CLIENT_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const AUTH = { 'x-test-auth': '1' } // 假 connection 缝：带头=放行，缺=401

const BASE_CONFIG = {
  port: 3500, listenHost: '127.0.0.1', upstreamPort: 3080, rewriteHost: true,
  sessionDays: 30, maxFailures: 5, secureCookie: true, wsAllow: ['^/api/'], gzipPass: true,
}

/** 假 configEditor（宿主缝契约形，对齐 dsh-config-editor 实测：entry.options.config=已保存显式配置） */
function fakeConfigEditor(initial = {}) {
  const state = { config: { ...initial }, editCalls: 0 }
  return {
    state,
    entries: () => [{ options: { id: 'login-gate', config: state.config } }],
    edit: async (_entry, cb) => {
      state.editCalls += 1
      const next = cb(state.config, {})
      if (next !== undefined) state.config = next
    },
  }
}

/**
 * 全栈装配：假 ctx 真 apply()（gate effect 只收集不执行=门禁 listener 不真监听）→ child 缝真注册
 * → 真 http handler；另起真 gate 只为产 /__gate/status 真形（真签发者签 cookie）。
 */
async function startStack(t, { savedConfig = {} } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'dlg-e2e-home-'))
  const cfgDir = mkdtempSync(join(tmpdir(), 'dlg-e2e-cfg-'))
  const usersFile = join(cfgDir, 'accounts.json')
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
    rmSync(home, { recursive: true, force: true })
    rmSync(cfgDir, { recursive: true, force: true })
  })

  const editor = fakeConfigEditor(savedConfig)
  const pluginSpecs = []
  const outerEffects = []
  const ctx = {
    effect: (fn, label) => outerEffects.push({ fn, label }),
    logger: { info: () => {} },
    plugin: (spec) => pluginSpecs.push(spec),
    get: (name) => (name === 'configEditor' ? editor : undefined), // configEditor 经 ctx.get 缝挂上
  }
  apply(ctx, { ...BASE_CONFIG, users: { boss: 'scrypt$16384$8$1$aa$bb' }, usersFile })
  assert.equal(pluginSpecs.length, 1, 'apply() 应注册 webServer 子插件缝')
  assert.deepEqual(pluginSpecs[0].inject, ['webServer', 'connection'])

  const registered = []
  const childEffects = []
  const childCtx = {
    effect: (fn, label) => childEffects.push({ fn, label }),
    webServer: { register: (spec) => { registered.push(spec); return () => {} } },
    connection: { requestRejection: ({ headers }) => (headers['x-test-auth'] === '1' ? undefined : 401) },
  }
  pluginSpecs[0].apply(childCtx)
  const disposeRoutes = childEffects[0].fn()
  const server = http.createServer((req, res) => { registered[0].handler(req, res) })
  await new Promise((resolve) => server.listen({ port: 0, host: '127.0.0.1' }, resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  t.after(() => { try { disposeRoutes() } catch { /* 收敛不抛 */ } })

  // 真 gate：只为产 /__gate/status 真形（真 createSessionManager 签发）
  const sessions = createSessionManager({ getSecret: () => 'e2e-status-secret' })
  const gate = createGateServer({
    users: {},
    sessions,
    limiter: createRateLimiter(),
    forwarder: { forward: async (_req, res) => { res.writeHead(200); res.end('upstream') }, forwardUpgrade: async () => {} },
    onLogoutAll: () => {},
    sessionMode: () => 'hmac',
    secureCookie: false,
    sessionDays: 30,
    log: () => {},
  })
  await new Promise((resolve) => gate.listen({ port: 0, host: '127.0.0.1' }, resolve))
  t.after(() => new Promise((resolve) => gate.close(resolve)))
  const statusCookie = `dlg_sid=${sessions.issue('boss', 3600)}`

  const url = `http://127.0.0.1:${server.address().port}`
  const gateUrl = `http://127.0.0.1:${gate.address().port}`
  const get = (path, headers = AUTH) => fetch(url + path, { headers })
  const post = (path, body, headers = { ...AUTH, 'content-type': 'application/json' }) =>
    fetch(url + path, { method: 'POST', headers, body: JSON.stringify(body) })
  return { url, gateUrl, statusCookie, editor, usersFile, get, post, outerEffects }
}

// ===== 客户端驱动装具（自包含） =====

function loadClientFace() {
  const loaded = []
  const win = { __ModuleLoader__: { load: (m) => loaded.push(m) } }
  const effects = []
  let hookState = null
  let refSlot = null // useRef 持久化（真 React 语义：同实例重渲染返回同一 ref）
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
  new Function('window', fs.readFileSync(CLIENT_PATH, 'utf8'))(win)
  const mod = loaded[0].factory(req)
  return { mod, effects }
}

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

/** 条件等待（真网络往返无固定时长，禁固定 tick 竞态）：pred(getter()) 成立即返，超时抛 */
async function waitFor(getter, pred, what, ms = 3000) {
  const deadline = Date.now() + ms
  for (;;) {
    const v = getter()
    if (pred(v)) return v
    if (Date.now() > deadline) throw new Error(`waitFor 超时：${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
const rowOf = (tree, key) => find(tree, (n) => typeof n.type === 'function' && n.props.field && n.props.field.key === key)
const userRowOf = (tree, name) => find(tree, (n) => typeof n.type === 'function' && n.props.name === name && n.props.onDelete)
const allText = (tree) => JSON.stringify(tree)

/** 挂真 client 消费真服务端（__fetch 缝=真 fetch + 鉴权头/真 gate status cookie） */
async function mountClient(stack) {
  const { mod, effects } = loadClientFace()
  const registered = []
  mod.apply({
    slots: {
      inject: (_n, setup) => setup(),
      register: (decl, component) => { registered.push({ decl, component }); return () => {} },
    },
    logger: { warn: () => {} },
    effect: (fn) => { fn(); return () => {} },
  })
  const Section = registered[0].component
  const posts = []
  mod.__fetch = async (url, init) => {
    if (url === '__gate/status') {
      return fetch(stack.gateUrl + '/__gate/status', { headers: { cookie: stack.statusCookie } })
    }
    const headers = { ...(init?.headers ?? {}), ...AUTH }
    if (init && init.method === 'POST') posts.push({ url, body: JSON.parse(init.body) })
    return fetch(stack.url + '/' + url, { ...init, headers })
  }
  Section()
  effects[0]()
  const render = () => Section()
  await waitFor(render, (tree) => rowOf(tree, 'port') !== null, 'client 载入完成（ready）')
  return { Section, render, posts }
}

// ===== ① 端到端 apply() 全链路 =====

test('端到端 apply() 全链路：注册面真 handler → 设置写落 configEditor entry、账号写落 usersFile（真 scrypt）、未登录拒零副作用', async (t) => {
  const stack = await startStack(t)

  // GET 契约形（writable=true：configEditor 经 ctx.get 缝挂上）
  const res = await stack.get('/api/login-gate/settings')
  assert.equal(res.status, 200)
  const raw = await res.text()
  assert.equal(raw.includes('scrypt$'), false, '响应体永不含哈希（INV-3 跨面）')
  const body = JSON.parse(raw)
  assert.equal(body.data.writable, true, 'configEditor 缝在=writable:true')
  assert.equal(body.data.applied, true, 'R-16：applied 恒定 true（配置写入经宿主 re-apply 即时生效）')
  assert.equal('restartRequired' in body.data, false, 'restartRequired 面已废除')
  assert.deepEqual(body.data.config, BASE_CONFIG, '九键=apply 入参基线')
  assert.deepEqual(body.data.users, [{ name: 'boss' }], 'users 仅名字')

  // 设置写全链路：请求 → 路由 → createApplyPatch → configEditor entry（真写缝）
  const w = await stack.post('/api/login-gate/settings', { patch: { sessionDays: 7, maxFailures: 3 } })
  assert.equal(w.status, 200)
  assert.equal((await w.json()).data.applied, true, 'R-16：POST 成功 applied:true')
  assert.deepEqual(stack.editor.state.config, { sessionDays: 7, maxFailures: 3 }, '写入形真落 entry')
  const reread = await (await stack.get('/api/login-gate/settings')).json()
  assert.equal(reread.data.config.sessionDays, 7, 'R-12：写后 GET 回读已保存值')
  assert.equal(reread.data.config.maxFailures, 3)

  // 账号写全链路：请求 → users CRUD → usersFile 真落盘（真 scrypt 可校验）
  const add = await stack.post('/api/login-gate/settings/users', { action: 'add', name: 'alice', password: 'pw-alice' })
  assert.equal(add.status, 200)
  assert.deepEqual((await add.json()).data.users, [{ name: 'alice' }, { name: 'boss' }])
  const stored = JSON.parse(readFileSync(stack.usersFile, 'utf8'))
  assert.equal(verifyPassword('pw-alice', stored.alice), true, '真 scrypt 落盘可校验')
  assert.equal(verifyPassword('pw-alice', stored.boss), false)

  // 未登录拒 + 零副作用（配置/账号面均不落）
  const before = readFileSync(stack.usersFile, 'utf8')
  for (const call of [
    () => fetch(stack.url + '/api/login-gate/settings'),
    () => fetch(stack.url + '/api/login-gate/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ patch: { sessionDays: 1 } }) }),
    () => fetch(stack.url + '/api/login-gate/settings/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add', name: 'mallory', password: 'x' }) }),
  ]) {
    const r = await call()
    assert.equal(r.status, 401, '未登录一律 401')
    assert.equal((await r.json()).error.code, 'unauthorized')
  }
  assert.equal(readFileSync(stack.usersFile, 'utf8'), before, '未登录零副作用（usersFile 不动）')
  assert.deepEqual(stack.editor.state.config, { sessionDays: 7, maxFailures: 3 }, '未登录零副作用（entry 不动）')
  assert.equal(JSON.stringify((await (await stack.get('/api/login-gate/settings')).json()).data.users).includes('mallory'), false)
})

// ===== ② 跨面对账：GET 形 =====

test('跨面对账①：真 client 消费真服务端 GET 形——九键/users/writable 逐项对齐（契约漂移即红）', async (t) => {
  const saved = { port: 4567, sessionDays: 9, maxFailures: 3, secureCookie: false, wsAllow: ['^/ws/', 'any'], gzipPass: false }
  const stack = await startStack(t, { savedConfig: saved })
  const serverBody = await (await stack.get('/api/login-gate/settings')).json()
  assert.equal(serverBody.data.writable, true)

  const { render } = await mountClient(stack)
  const tree = render()
  assert.equal(tree.props['data-dsh-plugin'], 'dsh-login-gate')

  // 九键逐项对账：client 消费值 === server 产出值（服务端键改名/客户端字段漂移 → 红）
  for (const key of Object.keys(serverBody.data.config)) {
    const row = rowOf(tree, key)
    assert.ok(row, `client 字段表含服务端键：${key}`)
    assert.deepEqual(row.props.value, serverBody.data.config[key], `跨面值对齐：${key}`)
  }
  // 反向：客户端字段表全部键都在服务端 config 面（多出的键=消费了不存在的形）
  for (const key of ['port', 'sessionDays', 'maxFailures', 'secureCookie', 'wsAllow', 'gzipPass', 'listenHost', 'upstreamPort', 'rewriteHost']) {
    assert.ok(Object.hasOwn(serverBody.data.config, key), `服务端 config 面含 client 消费键：${key}`)
  }
  // users 形对账：真消费=真产出（仅名字、有序）
  const renderedUsers = []
  for (const u of serverBody.data.users) {
    const row = userRowOf(tree, u.name)
    assert.ok(row, `client 消费 users 条目：${u.name}`)
    renderedUsers.push(u.name)
  }
  assert.deepEqual(renderedUsers, ['boss'])
  // 契约面卫生：真服务端 wire 上永无哈希、client 树上永无哈希（INV-3）
  assert.equal(allText(tree).includes('scrypt'), false)
  // writable:true → 保存钮在（消费 writable 判据）
  assert.ok(find(tree, (n) => n.type === 'button' && n.props.className?.includes('save')), 'writable:true 保存钮在')
})

// ===== ③ 跨面对账：写路径往返 =====

test('跨面对账②：写路径往返——真 POST 契约形/真落盘/响应合并回显 + 服务端错误原文 + currentName 真 gate status', async (t) => {
  const stack = await startStack(t)
  const { render, posts } = await mountClient(stack)

  // 保存往返：client 只发变更叶子 {patch} ←→ server 契约形；响应合并回显 + G1 字面
  let tree = render()
  rowOf(tree, 'sessionDays').props.onChange(7)
  tree = render()
  find(tree, (n) => n.type === 'button' && n.props.className?.includes('save')).props.onClick()
  await waitFor(render, (t) => allText(t).includes('已保存，已生效'), '保存回显')
  assert.deepEqual(posts.at(-1).body, { patch: { sessionDays: 7 } }, 'POST 契约形：只发变更叶子')
  assert.equal(stack.editor.state.config.sessionDays, 7, '真写缝已落')
  tree = render()
  assert.equal(rowOf(tree, 'sessionDays').props.value, 7, '合并回显=服务端返回 config')
  assert.ok(allText(tree).includes('已保存，已生效'), 'G1 字面跨面成立（R-16 已生效语义）')

  // 错误原文往返：服务端 invalid 消息原文被 client 原样消费展示
  rowOf(tree, 'sessionDays').props.onChange(0)
  tree = render()
  find(tree, (n) => n.type === 'button' && n.props.className?.includes('save')).props.onClick()
  await waitFor(render, (t) => allText(t).includes('会话天数必须是 1-3650 的整数'), '服务端错误原文回显')
  assert.ok(allText(render()).includes('会话天数必须是 1-3650 的整数'), '服务端错误 message 原文跨面展示')
  assert.equal(stack.editor.state.config.sessionDays, 7, '拒写路径 entry 不动')

  // 账号新增往返：真 POST 契约形 → usersFile 真落盘（真 scrypt）→ 列表合并回显
  tree = render()
  const addForm = find(tree, (n) => n.props['data-login-gate-form'] === 'add')
  assert.ok(addForm, '新增账号表单在')
  addForm.props.onName('carol')
  addForm.props.onPassword('pw-carol')
  tree = render()
  find(tree, (n) => n.props['data-login-gate-form'] === 'add').props.onAdd()
  await waitFor(render, (t) => userRowOf(t, 'carol') !== null, '新增回显')
  assert.deepEqual(posts.at(-1).body, { action: 'add', name: 'carol', password: 'pw-carol' }, 'users POST 契约形')
  const stored = JSON.parse(readFileSync(stack.usersFile, 'utf8'))
  assert.equal(verifyPassword('pw-carol', stored.carol), true, '真 scrypt 落盘')
  tree = render()
  assert.ok(userRowOf(tree, 'carol'), '新增合并回显')
  assert.ok(allText(tree).includes('账号已新增'))

  // 删除往返：currentName 来自真 gate /__gate/status（真签发者）——防自锁两面对齐
  assert.equal(userRowOf(tree, 'boss').props.canDelete, false, '当前登录账号行禁删（真 status user=boss）')
  userRowOf(tree, 'carol').props.onDelete()
  await waitFor(render, (t) => userRowOf(t, 'carol') === null, '删除回显')
  assert.deepEqual(posts.at(-1).body, { action: 'delete', name: 'carol', currentName: 'boss' }, 'delete 契约形含 currentName（真 status 产）')
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(stack.usersFile, 'utf8')), 'carol'), false, 'usersFile 真删除')
  tree = render()
  assert.equal(userRowOf(tree, 'carol'), null, '删除成功合并回显')
  assert.ok(allText(tree).includes('账号已删除'))
})
