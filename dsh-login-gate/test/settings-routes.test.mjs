// dsh-login-gate — lib/settings-routes.js 用例（Task 11 设置面数据面）
// 覆盖：GET/POST 契约形（writable/restartRequired）、白名单整单拒、校验失败拒、端口占用拒（mock+真 net）、
//      未登录必拒（connection.requestRejection 缝）、users CRUD（真 fs、Config usersFile 路径显式断言、
//      合并表判重名、响应永不含哈希、防自锁）、configEditor 缺位降级（writable:false/503）、
//      假 ctx 真 apply() 注册面（webServer.register 被调、prefix 正确、真 handler 执行）。
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerSettingsRoutes } from '../lib/settings-routes.js'
import { createApplyPatch, createConfigReader, readEntryConfig } from '../lib/settings-write.js'
import { apply, Config } from '../lib/index.js'
import { loadUsers } from '../lib/users.js'
import { verifyPassword } from '../lib/auth.js'

const AUTH = { 'x-test-auth': '1' } // 假 connection 缝：带头=放行，缺=401
const JSON_HEADERS = { ...AUTH, 'content-type': 'application/json' }

const baseConfig = () => ({
  port: 3500,
  listenHost: '127.0.0.1',
  upstreamPort: 3080,
  rewriteHost: true,
  sessionDays: 30,
  maxFailures: 5,
  secureCookie: true,
  wsAllow: ['^/api/'],
  gzipPass: true,
})

/** 假 configEditor（缝契约形，对齐 dsh-config-editor 实测：entry.options.config=已保存显式配置） */
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

/** 真接线（F5）：fake configEditor → createApplyPatch 写缝 + createConfigReader 已保存面现读（R-12） */
function wireEditor(initial = {}) {
  const editor = fakeConfigEditor(initial)
  return {
    editor,
    getApplyPatch: () => createApplyPatch({ configEditor: editor, entryId: 'login-gate', Config }),
    getConfig: createConfigReader({
      getBase: () => baseConfig(),
      readSaved: () => readEntryConfig(editor, 'login-gate'),
      normalize: (c) => ({ ...baseConfig(), ...c }),
    }),
  }
}

/** 注册路由 + 真 http 服务（真 req/res 真 handler），返回请求助手 */
async function startRoutes(t, overrides = {}) {
  const registered = []
  const disposers = registerSettingsRoutes({
    register: (spec) => {
      registered.push(spec)
      return () => {}
    },
    connection: { requestRejection: ({ headers }) => (headers['x-test-auth'] === '1' ? undefined : 401) },
    getConfig: () => baseConfig(),
    getBootConfig: () => baseConfig(),
    getUsers: () => ({}),
    usersFile: join(tmpdir(), 'unused-users.json'),
    getApplyPatch: () => async (patch) => ({ ok: true, config: { ...baseConfig(), ...patch }, effective: { ...baseConfig(), ...patch } }),
    getSession: () => null,
    warn: () => {},
    ...overrides,
  })
  assert.equal(registered.length, 1, '应只注册一个 prefix 路由')
  const server = http.createServer((req, res) => { registered[0].handler(req, res) })
  await new Promise((resolve) => server.listen({ port: 0, host: '127.0.0.1' }, resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  t.after(() => disposers.forEach((d) => { try { d() } catch { /* 收敛不抛 */ } }))
  const url = `http://127.0.0.1:${server.address().port}`
  const get = (path, headers = AUTH) => fetch(url + path, { headers })
  const post = (path, body, headers = JSON_HEADERS) =>
    fetch(url + path, { method: 'POST', headers, body: JSON.stringify(body) })
  return { url, get, post, registered }
}

test('GET /api/login-gate/settings：契约形（writable/restartRequired/config 九键/users 仅名字）', async (t) => {
  const { get } = await startRoutes(t, {
    getUsers: () => ({ alice: 'scrypt$16384$8$1$aa$bb', bob: 'scrypt$16384$8$1$cc$dd' }),
  })
  const res = await get('/api/login-gate/settings')
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.data.writable, true)
  assert.equal(typeof body.data.restartRequired, 'boolean')
  assert.deepEqual(
    Object.keys(body.data.config).sort(),
    ['gzipPass', 'listenHost', 'maxFailures', 'port', 'rewriteHost', 'secureCookie', 'sessionDays', 'upstreamPort', 'wsAllow'].sort(),
  )
  assert.deepEqual(body.data.config, baseConfig())
  assert.deepEqual(body.data.users, [{ name: 'alice' }, { name: 'bob' }])
  assert.equal(JSON.stringify(body).includes('scrypt$'), false, 'GET 响应绝不能含哈希')
  assert.equal(JSON.stringify(body).includes('usersFile'), false, 'GET config 不含 usersFile/users 内部键')
})

test('POST/GET（真接线 F5）：任一成功写入=已保存+restartRequired:true（R-11）；写后 GET 回读已保存值（R-12/F3）', async (t) => {
  const { editor, getApplyPatch, getConfig } = wireEditor()
  const { post, get } = await startRoutes(t, { getApplyPatch, getConfig })

  // 热键写入同样标重启（boot 期按值捕获，运行面不热生效——绝不宣称已生效）
  const res = await post('/api/login-gate/settings', { patch: { sessionDays: 7, maxFailures: 3 } })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.data.restartRequired, true, 'R-11：任一成功写入即需重启（含热键）')
  assert.equal(body.data.config.sessionDays, 7)
  assert.equal(body.data.config.maxFailures, 3)
  assert.deepEqual(editor.state.config, { sessionDays: 7, maxFailures: 3 }, '写入形落 entry')
  assert.equal(editor.state.editCalls, 1)

  // R-12/F3：写后 GET 回读已保存值（不是 boot 旧值）
  const after1 = await (await get('/api/login-gate/settings')).json()
  assert.equal(after1.data.config.sessionDays, 7, '写后 GET 应显已保存值')
  assert.equal(after1.data.restartRequired, true)

  const res2 = await post('/api/login-gate/settings', { patch: { port: 4700 } })
  assert.equal(res2.status, 200)
  const body2 = await res2.json()
  assert.equal(body2.data.config.port, 4700)
  assert.equal(body2.data.restartRequired, true)
  assert.equal(editor.state.editCalls, 2)

  const after2 = await (await get('/api/login-gate/settings')).json()
  assert.equal(after2.data.config.port, 4700, '写后 GET 回读新端口（R-12 证据）')
  assert.equal(after2.data.config.sessionDays, 7, '既有已保存值保持')
  assert.equal(after2.data.restartRequired, true)
})

test('POST：白名单外/只读键携带=整单拒 not_editable，绝不触达写缝', async (t) => {
  let calls = 0
  const { post } = await startRoutes(t, {
    getApplyPatch: () => async () => { calls += 1; return { ok: true } },
  })
  for (const patch of [{ listenHost: '0.0.0.0' }, { upstreamPort: 3090 }, { rewriteHost: false }, { users: { x: 'y' } }, { nope: 1 }]) {
    const res = await post('/api/login-gate/settings', { patch })
    assert.equal(res.status, 400, JSON.stringify(patch))
    const body = await res.json()
    assert.equal(body.error.code, 'not_editable')
    assert.match(body.error.message, /不可写/)
  }
  assert.equal(calls, 0, '不可改字段绝不叫醒写缝')
})

test('POST：校验失败（值域/形非法）= invalid 拒写', async (t) => {
  let calls = 0
  const { post } = await startRoutes(t, {
    getApplyPatch: () => async () => { calls += 1; return { ok: true } },
  })
  for (const patch of [{ sessionDays: 0 }, { port: 70000 }, { port: 3.5 }, { secureCookie: 'yes' }, { wsAllow: ['[bad'] }, {}]) {
    const res = await post('/api/login-gate/settings', { patch })
    assert.equal(res.status, 400, JSON.stringify(patch))
    assert.equal((await res.json()).error.code, 'invalid')
  }
  const res = await post('/api/login-gate/settings', { noPatch: true })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error.code, 'invalid')
  assert.equal(calls, 0, '校验失败绝不触达写缝')
})

test('POST：端口占用拒 port_in_use（mock 探测 + 真 net 各一），含占用提示且不落写', async (t) => {
  // mock 探测失败路径
  let calls = 0
  const { post } = await startRoutes(t, {
    probePort: async () => false,
    getApplyPatch: () => async () => { calls += 1; return { ok: true } },
  })
  const res = await post('/api/login-gate/settings', { patch: { port: 4700 } })
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.equal(body.error.code, 'port_in_use')
  assert.match(body.error.message, /4700/)
  assert.equal(calls, 0, '端口预检不过绝不触达写缝')

  // 真 net 路径：真绑定端口后探测必须拒（默认 probePortBindable）
  const srv = http.createServer()
  await new Promise((resolve) => srv.listen({ port: 0, host: '127.0.0.1' }, resolve))
  const busyPort = srv.address().port
  t.after(() => new Promise((resolve) => srv.close(resolve)))
  const { post: post2 } = await startRoutes(t)
  const res2 = await post2('/api/login-gate/settings', { patch: { port: busyPort } })
  assert.equal(res2.status, 400)
  assert.equal((await res2.json()).error.code, 'port_in_use')
})

test('configEditor 缺位降级：GET writable:false、POST 503 write_unavailable（kb-context 形）', async (t) => {
  const { get, post } = await startRoutes(t, { getApplyPatch: () => null })
  const body = await (await get('/api/login-gate/settings')).json()
  assert.equal(body.data.writable, false)
  assert.equal(body.data.restartRequired, false)
  const res = await post('/api/login-gate/settings', { patch: { sessionDays: 7 } })
  assert.equal(res.status, 503)
  assert.equal((await res.json()).error.code, 'write_unavailable')
})

test('鉴权缝：未登录 GET/POST/settings/users 一律拒 401，且零副作用', async (t) => {
  let calls = 0
  const file = join(mkdtempSync(join(tmpdir(), 'dlg-rt-')), 'users.json')
  const { get, post, url } = await startRoutes(t, {
    getApplyPatch: () => async () => { calls += 1; return { ok: true } },
    usersFile: file,
    getUsers: () => loadUsers({ usersFile: file }).users,
  })
  const g = await get('/api/login-gate/settings', {})
  assert.equal(g.status, 401)
  assert.equal((await g.json()).error.code, 'unauthorized')
  const p = await post('/api/login-gate/settings', { patch: { sessionDays: 7 } }, { 'content-type': 'application/json' })
  assert.equal(p.status, 401)
  const u = await post('/api/login-gate/settings/users', { action: 'add', name: 'alice', password: 'pw' }, { 'content-type': 'application/json' })
  assert.equal(u.status, 401)
  assert.equal(calls, 0)
  assert.equal(existsSync(file), false, '未登录不得写 usersFile')
})

test('鉴权缝统一在分发首行（F1）：未登录 PUT/未知路径/GET users 也 401，不泄漏路由与方法形', async (t) => {
  const { url } = await startRoutes(t)
  const put = await fetch(url + '/api/login-gate/settings', { method: 'PUT' })
  assert.equal(put.status, 401, '未登录 405/404 兜底必须先被 401 拦截')
  const nf = await fetch(url + '/api/login-gate/other')
  assert.equal(nf.status, 401, '未登录不得以 404 泄漏路径形')
  const gu = await fetch(url + '/api/login-gate/settings/users')
  assert.equal(gu.status, 401)
})

test('方法守卫与路径：405 + allow 头、非本面路径 404 route_not_found（已登录）', async (t) => {
  const { get, url } = await startRoutes(t)
  const put = await fetch(url + '/api/login-gate/settings', { method: 'PUT', headers: AUTH })
  assert.equal(put.status, 405)
  assert.equal(put.headers.get('allow'), 'GET, POST')
  const gu = await get('/api/login-gate/settings/users')
  assert.equal(gu.status, 405)
  assert.equal(gu.headers.get('allow'), 'POST')
  const nf = await get('/api/login-gate/other')
  assert.equal(nf.status, 404)
  assert.equal((await nf.json()).error.code, 'route_not_found')
})

test('错误码契约（F4）：畸形 JSON→invalid、未知路径→route_not_found、config-only 账号改删→not_found', async (t) => {
  const cfgDir = mkdtempSync(join(tmpdir(), 'dlg-cfg-'))
  const file = join(cfgDir, 'users.json')
  t.after(() => rmSync(cfgDir, { recursive: true, force: true }))
  const configOnlyUsers = { bob: 'scrypt$16384$8$1$cc$dd' } // config.users 仅有、usersFile 没有
  const { post, get, url } = await startRoutes(t, {
    usersFile: file,
    getUsers: () => ({ ...configOnlyUsers, ...loadUsers({ usersFile: file }).users }),
  })

  // 畸形 JSON（settings 与 users 两处）→ invalid（F4 归一，不再外泄 bad_request 码）
  const bad = await fetch(url + '/api/login-gate/settings', { method: 'POST', headers: JSON_HEADERS, body: '{bad' })
  assert.equal(bad.status, 400)
  assert.equal((await bad.json()).error.code, 'invalid')
  const bad2 = await fetch(url + '/api/login-gate/settings/users', { method: 'POST', headers: JSON_HEADERS, body: '{bad' })
  assert.equal(bad2.status, 400)
  assert.equal((await bad2.json()).error.code, 'invalid')

  // config-only 账号（合并表可见、usersFile 无）改/删 → not_found + 给因（不支持在此改/删）
  const upd = await post('/api/login-gate/settings/users', { action: 'update', name: 'bob', password: 'pw' })
  assert.equal(upd.status, 400)
  const ub = await upd.json()
  assert.equal(ub.error.code, 'not_found')
  assert.match(ub.error.message, /配置/)
  const del = await post('/api/login-gate/settings/users', { action: 'delete', name: 'bob', currentName: 'alice' })
  assert.equal(del.status, 400)
  assert.equal((await del.json()).error.code, 'not_found')
  assert.equal(existsSync(file), false, '拒写路径零副作用')

  const nf = await get('/api/login-gate/other')
  assert.equal((await nf.json()).error.code, 'route_not_found')
})

test('getBootConfig 缺省（F6）：null 时跳过 boot 比较，restartRequired 只看 pendingRestart', async (t) => {
  const { get, post } = await startRoutes(t, { getBootConfig: undefined })
  const before = await (await get('/api/login-gate/settings')).json()
  assert.equal(before.data.restartRequired, false, '无 boot 面且未写入=false')
  await post('/api/login-gate/settings', { patch: { sessionDays: 7 } })
  const after = await (await get('/api/login-gate/settings')).json()
  assert.equal(after.data.restartRequired, true, '写入后 pendingRestart 置位=true')
})

test('users CRUD（真 fs）：写入 Config usersFile 路径（显式断言）、响应永不含哈希、合并表判重名', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'dlg-home-'))
  const cfgDir = mkdtempSync(join(tmpdir(), 'dlg-cfg-'))
  const file = join(cfgDir, 'accounts.json')
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
    rmSync(home, { recursive: true, force: true })
    rmSync(cfgDir, { recursive: true, force: true })
  })
  const configOnlyUsers = { bob: 'scrypt$16384$8$1$cc$dd' } // config.users 仅有、usersFile 没有
  const { post, get } = await startRoutes(t, {
    usersFile: file,
    getUsers: () => ({ ...configOnlyUsers, ...loadUsers({ usersFile: file }).users }),
  })

  // 新增：显式断言写入的是路由给定的 Config usersFile 路径，绝不落 $DSH_HOME 缺省位
  const res = await post('/api/login-gate/settings/users', { action: 'add', name: 'alice', password: 'pw-alice' })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(body, { data: { users: [{ name: 'alice' }, { name: 'bob' }] } }, 'users 列表=合并表名字（sorted）')
  assert.equal(JSON.stringify(body).includes('scrypt$'), false, '响应永不含哈希')
  assert.ok(existsSync(file), '应写入 Config usersFile 路径')
  assert.ok(!existsSync(join(home, 'login-gate', 'users.json')), '绝不写 $DSH_HOME/login-gate/users.json 缺省位')
  const stored = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(verifyPassword('pw-alice', stored.alice), true, '落盘为 scrypt$ 哈希且可校验')

  // 合并表判重名：config-only 同名也拒（防文件条目遮蔽判断）
  const dupCfg = await post('/api/login-gate/settings/users', { action: 'add', name: 'bob', password: 'pw-bob' })
  assert.equal(dupCfg.status, 400)
  assert.equal((await dupCfg.json()).error.code, 'exists')
  const dupFile = await post('/api/login-gate/settings/users', { action: 'add', name: 'alice', password: 'pw-2' })
  assert.equal(dupFile.status, 400)
  assert.equal((await dupFile.json()).error.code, 'exists')

  // 改密：新密码生效旧密码失效（真校验），响应无哈希
  const upd = await post('/api/login-gate/settings/users', { action: 'update', name: 'alice', password: 'pw-new' })
  assert.equal(upd.status, 200)
  assert.equal(JSON.stringify(await upd.clone().json()).includes('scrypt$'), false)
  const stored2 = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(verifyPassword('pw-new', stored2.alice), true)
  assert.equal(verifyPassword('pw-alice', stored2.alice), false)

  // 参数非法：缺 action/名/密码
  for (const b of [{ action: 'add', name: '', password: 'x' }, { action: 'add', name: 'x', password: '' }, { action: 'nope', name: 'x', password: 'y' }, { name: 'x', password: 'y' }]) {
    const r = await post('/api/login-gate/settings/users', b)
    assert.equal(r.status, 400, JSON.stringify(b))
    assert.equal((await r.json()).error.code, 'invalid')
  }

  // 目标不存在
  const missing = await post('/api/login-gate/settings/users', { action: 'update', name: 'ghost', password: 'pw' })
  assert.equal(missing.status, 400)
  assert.equal((await missing.json()).error.code, 'not_found')

  // GET users 面随写入刷新（合并表）
  const listed = await (await get('/api/login-gate/settings')).json()
  assert.deepEqual(listed.data.users, [{ name: 'alice' }, { name: 'bob' }])
})

test('users 删除：防自锁（self_lock）、身份未知 fail-closed、会话身份优先于 body、删他人成功', async (t) => {
  const cfgDir = mkdtempSync(join(tmpdir(), 'dlg-cfg-'))
  const file = join(cfgDir, 'users.json')
  t.after(() => rmSync(cfgDir, { recursive: true, force: true }))
  let sessionUser = null
  const { post } = await startRoutes(t, {
    usersFile: file,
    getUsers: () => loadUsers({ usersFile: file }).users,
    getSession: () => (sessionUser ? { u: sessionUser } : null),
  })
  const seed = async (name) => post('/api/login-gate/settings/users', { action: 'add', name, password: 'pw-' + name })
  await seed('alice')
  await seed('carol')
  const unchanged = () => Object.keys(JSON.parse(readFileSync(file, 'utf8'))).sort()

  // 身份未知（无会话、body 不带 currentName）→ 拒删 fail-closed（Task 10 防自锁契约）
  const unknown = await post('/api/login-gate/settings/users', { action: 'delete', name: 'carol' })
  assert.equal(unknown.status, 400)
  assert.equal((await unknown.json()).error.code, 'current_user_unknown')
  assert.deepEqual(unchanged(), ['alice', 'carol'])

  // body.currentName 判自锁
  const selfBody = await post('/api/login-gate/settings/users', { action: 'delete', name: 'carol', currentName: 'carol' })
  assert.equal(selfBody.status, 400)
  assert.equal((await selfBody.json()).error.code, 'self_lock')
  assert.deepEqual(unchanged(), ['alice', 'carol'])

  // F9：非字符串 currentName 不得采信（无会话时按无身份拒删，不绕防自锁）
  const nonString = await post('/api/login-gate/settings/users', { action: 'delete', name: 'carol', currentName: 123 })
  assert.equal(nonString.status, 400)
  assert.equal((await nonString.json()).error.code, 'current_user_unknown', '非字符串 currentName 一律按无身份拒删')
  assert.deepEqual(unchanged(), ['alice', 'carol'])

  // 会话身份优先于 body（伪造 currentName 不能删自己）
  sessionUser = 'carol'
  const spoof = await post('/api/login-gate/settings/users', { action: 'delete', name: 'carol', currentName: 'alice' })
  assert.equal(spoof.status, 400)
  assert.equal((await spoof.json()).error.code, 'self_lock')
  assert.deepEqual(unchanged(), ['alice', 'carol'])

  // 删他人成功（currentName 取自会话）
  const okDel = await post('/api/login-gate/settings/users', { action: 'delete', name: 'alice', currentName: 'nobody' })
  assert.equal(okDel.status, 200)
  const body = await okDel.json()
  assert.deepEqual(body, { data: { users: [{ name: 'carol' }] } })
  assert.equal(JSON.stringify(body).includes('scrypt$'), false)
  assert.deepEqual(unchanged(), ['carol'])
})

test('假 ctx 真 apply()：webServer 缝 B1/B2 注册面成立（prefix /api/login-gate + 真 handler 执行 + 拆除器）', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'dlg-home-'))
  const cfgDir = mkdtempSync(join(tmpdir(), 'dlg-cfg-'))
  const file = join(cfgDir, 'users.json')
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
    rmSync(home, { recursive: true, force: true })
    rmSync(cfgDir, { recursive: true, force: true })
  })

  const pluginSpecs = []
  const outerEffects = []
  const ctx = {
    effect: (fn, label) => { outerEffects.push({ fn, label }) },
    logger: { info: () => {} },
    plugin: (spec) => { pluginSpecs.push(spec) },
    get: () => undefined,
  }
  apply(ctx, { usersFile: file, users: { boss: 'scrypt$16384$8$1$aa$bb' } })

  assert.equal(pluginSpecs.length, 1, 'apply() 应注册 webServer 子插件缝')
  assert.deepEqual(pluginSpecs[0].inject, ['webServer', 'connection'])

  const registered = []
  const childEffects = []
  const childCtx = {
    effect: (fn, label) => { childEffects.push({ fn, label }) },
    webServer: {
      register: (spec) => {
        registered.push(spec)
        return () => {}
      },
    },
    connection: { requestRejection: ({ headers }) => (headers['x-test-auth'] === '1' ? undefined : 401) },
  }
  pluginSpecs[0].apply(childCtx)
  assert.equal(childEffects.length, 1, '注册动作应走 c.effect（B2 形：effect 执行体内当场跑）')
  const disposer = childEffects[0].fn()
  assert.equal(registered.length, 1)
  assert.equal(registered[0].kind, 'prefix')
  assert.equal(registered[0].path, '/api/login-gate')
  assert.equal(typeof registered[0].handler, 'function')
  assert.equal(typeof disposer, 'function', 'effect 返回值=拆除器')

  // 真 handler 执行：GET 契约形（users=Config users ∪ usersFile 合并表）
  const server = http.createServer((req, res) => { registered[0].handler(req, res) })
  await new Promise((resolve) => server.listen({ port: 0, host: '127.0.0.1' }, resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}`
  const res = await fetch(url + '/api/login-gate/settings', { headers: AUTH })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.data.writable, false, 'configEditor 缺位（ctx.get 返回 undefined）→ writable:false')
  assert.deepEqual(body.data.users, [{ name: 'boss' }])
  assert.equal(JSON.stringify(body).includes('scrypt$'), false)

  // users CRUD 走真 apply() 接线：写入的是 Config usersFile 路径
  const add = await fetch(url + '/api/login-gate/settings/users', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ action: 'add', name: 'alice', password: 'pw-alice' }),
  })
  assert.equal(add.status, 200)
  assert.ok(existsSync(file), '真 apply() 接线也必须写 Config usersFile 路径')
  assert.ok(!existsSync(join(home, 'login-gate', 'users.json')), '绝不落 $DSH_HOME 缺省位')
  const listed = await (await fetch(url + '/api/login-gate/settings', { headers: AUTH })).json()
  assert.deepEqual(listed.data.users, [{ name: 'alice' }, { name: 'boss' }], '合并表判重/列表：文件条目与 config.users 并集')

  disposer()
  disposer() // 幂等/不炸
})
