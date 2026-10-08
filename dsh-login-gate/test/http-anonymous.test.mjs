// dsh-login-gate — HTTP 匿名放行（httpAnonymous）行为锁
// 来源合同：obsidian-web/changes/2026-09-28-b2-effect-fix/delta-specs/share-anonymous-gate.md
//          + reports/share-3500-path-feasibility.md §2.2（安全边界变更）
// 被测件：lib/gate.js（真 createGateServer + 真监听 + 真 handler）、lib/index.js（normalize 透传）。
// 纪律（INV-5/C-2）：只锁行为、绝不改行为——真 http server、真正则、真会话校验；
// 假缝仅承接 forwarder（转发非本测职责；放行是否走同一 forward 由调用计数证明）。
//
// 锁定面（合同红线逐条）：
//   ① 精确前缀语义：^/ob_share/ 命中放行；/ob_share_backup/x、/x/ob_share/、/ob_shareX/ 一律不放行
//   ② 方法锁：仅 GET/HEAD；POST/PUT/DELETE/PATCH 不放行
//   ③ 越界硬否定：点段 .. / %2e 编码形 / 反斜杠变体一律不放行（防前缀被借道到前缀之外）
//   ④ 默认关：键空（含未配置、非数组）→ 全部路径仍 302（零开口，行为与旧版逐字一致）
//   ⑤ 同一通道：放行请求走 forwarder.forward（未另建转发路径）
//   ⑥ 响应不改写：放行只是「交给上游」，403/404 形由上游给出（门禁不改 body/status）
//   ⑦ 留痕：放行命中写一行日志（可审计）
import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import http from 'node:http'
import { createSessionManager } from '../lib/auth.js'
import { createRateLimiter } from '../lib/ratelimit.js'
import { createGateServer } from '../lib/gate.js'
import { apply } from '../lib/index.js'

const RULE = ['^/ob_share/']

/** 取一个真空闲端口（真 listen→close，供真 apply 的门禁监听） */
async function freePort() {
  const s = net.createServer()
  await new Promise((r) => s.listen({ port: 0, host: '127.0.0.1' }, r))
  const p = s.address().port
  await new Promise((r) => s.close(r))
  return p
}

/** 等门禁真起来（最多 2s） */
async function waitListening(port) {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const s = net.connect({ port, host: '127.0.0.1' })
      s.on('connect', () => { s.destroy(); resolve(true) })
      s.on('error', () => resolve(false))
      setTimeout(() => { s.destroy(); resolve(false) }, 200)
    })
    if (ok) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`门禁未在 2s 内监听 ${port}`)
}

/**
 * 起真门禁（真 createGateServer + 临时端口真监听）。
 * forwarder 是假缝（转发非本测职责），但 **计数并原样带出上游响应** ——
 * 放行是否走同一 forward 由 forwardCalls / 请求 url 证明（合同「面口径零分叉」）。
 */
async function startGate(t, { httpAnonymous = RULE, omitAnon = false, upstreamStatus = 200, upstreamBody = 'upstream' } = {}) {
  const holder = { secret: 'test-secret-' + Math.random().toString(36).slice(2) }
  const sessions = createSessionManager({ getSecret: () => holder.secret })
  const logs = []
  const calls = []
  const server = createGateServer({
    users: { boss: 'scrypt$16384$8$1$aa$bb' },
    sessions,
    limiter: createRateLimiter({ maxFailures: 5 }),
    forwarder: {
      forward: async (req, res) => {
        calls.push({ method: req.method, url: req.url })
        res.writeHead(upstreamStatus, { 'content-type': 'text/plain' })
        res.end(upstreamBody)
      },
      forwardUpgrade: async () => {},
    },
    onLogoutAll: () => { holder.secret = 'rotated-' + Math.random().toString(36).slice(2) },
    sessionMode: () => 'hmac',
    secureCookie: false,
    sessionDays: 30,
    ...(omitAnon ? {} : { httpAnonymous }), // omitAnon = 真·未配置（连键都不传，测 Config 缺省）
    log: (line) => logs.push(String(line)),
  })
  await new Promise((resolve) => server.listen({ port: 0, host: '127.0.0.1' }, resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    base,
    calls,
    logs,
    cookie: `dlg_sid=${sessions.issue('boss', 3600)}`,
    req: (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init }),
  }
}

const isRedirectToLogin = (res) => {
  assert.equal(res.status, 302, `应 302 跳登录，实得 ${res.status}`)
  assert.match(String(res.headers.get('location') ?? ''), /^\/__gate\/login/)
}

// ===== ① 命中放行（合同 R1）+ ② 同一通道（合同「放行走同一 forwarder.forward」）=====

test('R1 命中放行：GET/HEAD ^/ob_share/ 免会话 200，且走同一 forwarder.forward（零新通道）', async (t) => {
  const { req, calls } = await startGate(t)
  for (const method of ['GET', 'HEAD']) {
    const res = await req('/ob_share/abc123', { method })
    assert.equal(res.status, 200, `${method} /ob_share/abc123 应匿名放行 200，实得 ${res.status}`)
  }
  // 同一通道证据：两次命中 = forwarder.forward 两次，url 原样透传（门禁未改写路径）
  assert.equal(calls.length, 2, '放行请求经 forwarder.forward（非另建转发）')
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), ['GET /ob_share/abc123', 'HEAD /ob_share/abc123'])
})

test('R1b 子路径与查询串放行：/ob_share/<token>/sub?x=1 命中（前缀语义，非全等）', async (t) => {
  const { req, calls } = await startGate(t)
  const res = await req('/ob_share/abc123/sub/page.md?password=pw')
  assert.equal(res.status, 200)
  assert.equal(calls[0].url, '/ob_share/abc123/sub/page.md?password=pw', 'url 原样透传（含查询串）')
})

// ===== ③ 反例三形：前缀伪装 / 位置变体 / 连写变体（合同 R3）=====

test('R3 反例三形：/ob_share_backup/x、/x/ob_share/、/ob_shareX/ 一律仍 302（精确前缀语义）', async (t) => {
  const { req, calls } = await startGate(t)
  for (const path of ['/ob_share_backup/x', '/x/ob_share/', '/ob_shareX/', '/ob_share', '/ob_shar/x', '/OB_SHARE/x']) {
    const res = await req(path)
    isRedirectToLogin(res)
  }
  assert.equal(calls.length, 0, '反例零转发（未命中=不触达上游）')
})

test('R3b 越界硬否定：点段 .. / 编码形 %2e·%2f / 反斜杠变体 一律仍 302（防前缀被借道出前缀之外）', async (t) => {
  const { req, calls } = await startGate(t)
  // fetch() 会在发请求前把 /ob_share/. 归一成 /ob_share/（客户端侧归一），故纯点尾形走真 socket 验证
  for (const path of [
    '/ob_share/../../',
    '/ob_share/..%2f..%2f',
    '/ob_share/%2e%2e/api',
    '/ob_share/%2E%2E/api',
    '/ob_share\\..\\api',
    '/ob_share/a/../../../etc',
    '/ob_share/%2f..%2f',
  ]) {
    const res = await req(path)
    isRedirectToLogin(res)
  }
  assert.equal(calls.length, 0, '越界形零转发')
})

test('R3c 纯点尾形（真 socket，绕开客户端归一）：/ob_share/. 与 /ob_share/.. 原样送达 → 仍 302', async (t) => {
  const { base, calls } = await startGate(t)
  const u = new URL(base)
  const rawLine = (target) => new Promise((resolve, reject) => {
    const s = net.connect({ port: Number(u.port), host: '127.0.0.1' }, () => {
      s.write(`GET ${target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`)
    })
    let buf = ''
    s.on('data', (d) => { buf += d.toString() })
    s.on('end', () => resolve(buf.split('\r\n')[0]))
    s.on('error', reject)
    setTimeout(() => { s.destroy(); reject(new Error('timeout: ' + target)) }, 3000)
  })
  for (const target of ['/ob_share/.', '/ob_share/..', '/ob_share/../x']) {
    assert.match(await rawLine(target), /^HTTP\/1\.1 302/, `${target} 应 302`)
  }
  assert.equal(calls.length, 0, '纯点尾形零转发')
})

// ===== ④ 方法锁（合同 R5）=====

test('R5 方法锁：仅 GET/HEAD 放行；POST/PUT/DELETE/PATCH 一律 302（写方法绝不对匿名开放）', async (t) => {
  const { req, calls } = await startGate(t)
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const res = await req('/ob_share/abc123', { method })
    isRedirectToLogin(res)
  }
  assert.equal(calls.length, 0, '写方法零转发')
})

test('R5b 方法大小写归一：Node 在路由前即拒非标准形（大小写不敏感放行不依赖客户端归一）', async (t) => {
  const { base, calls } = await startGate(t)
  const u = new URL(base)
  const raw = (method) => new Promise((resolve, reject) => {
    const s = net.connect({ port: Number(u.port), host: '127.0.0.1' }, () => {
      s.write(`${method} /ob_share/abc123 HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`)
    })
    let buf = ''
    s.on('data', (d) => { buf += d.toString() })
    s.on('end', () => resolve('END:' + buf.split('\r\n')[0]))
    s.on('error', (e) => resolve('ERR:' + e.message))
    setTimeout(() => { s.destroy(); resolve('TIMEOUT:' + JSON.stringify(buf)) }, 2000)
  })
  // 实证：Node http 解析器对非大写方法名报 "Invalid method encountered"，请求**到不了路由**
  // → 门禁的 `String(method).toUpperCase()` 归一只是纵深防御（上游/未来解析器差异下的兜底），
  //    放行与否由大写 GET/HEAD 决定，这一点由 R1 锁定。
  for (const m of ['get', 'head', 'GeT']) {
    const r = await raw(m)
    assert.ok(!r.startsWith('END:HTTP/1.1 2'), `小写 ${m} 不得被当放行（实得：${r}）`)
  }
  assert.equal(calls.length, 0, '非标准方法零转发')
})

test('R6 默认关：httpAnonymous 未配置/空数组/非数组 → /ob_share/ 仍 302（零开口，与旧版逐字一致）', async (t) => {
  const cases = [
    { opts: { omitAnon: true }, label: '未配置（键缺省）' },
    { opts: { httpAnonymous: [] }, label: '空数组' },
    { opts: { httpAnonymous: null }, label: 'null（非法形）' },
    { opts: { httpAnonymous: '^/ob_share/' }, label: '字符串（非法形）' },
    { opts: { httpAnonymous: ['^/ok', 123] }, label: '含非字符串项（数字项不得变未锚定正则）' },
  ]
  for (const { opts, label } of cases) {
    const { req, calls } = await startGate(t, opts)
    const res = await req('/ob_share/abc123')
    isRedirectToLogin(res)
    assert.equal(calls.length, 0, `${label} 应零转发`)
  }
})

test('R6b 默认关不误伤已登录用户：键空时带会话 cookie 照常转发（既有语义零弱化）', async (t) => {
  const { req, cookie, calls } = await startGate(t, { httpAnonymous: [] })
  const res = await req('/ob_share/abc123', { headers: { cookie } })
  assert.equal(res.status, 200, '已登录用户照常转发')
  assert.equal(calls.length, 1)
})

// ===== ⑥ 响应不改写（合同「坏 token 仍由插件侧返回既有 404 形」）=====

test('R4 响应零改写：上游 404/403 原样透传（门禁不改 status、不改 body）', async (t) => {
  const { req } = await startGate(t, { upstreamStatus: 404, upstreamBody: 'not found' })
  const res = await req('/ob_share/BADTOKEN')
  assert.equal(res.status, 404, '坏 token = 上游既有 404 形（门禁不改写）')
  assert.equal(await res.text(), 'not found')
})

test('R4b 门禁端点不被匿名放行污染：/__gate/health 200、/__gate/status 未登录 401（五端点语义零变化）', async (t) => {
  const { req } = await startGate(t)
  const health = await req('/__gate/health')
  assert.equal(health.status, 200, '/__gate/health 仍无认证可达')
  const status = await req('/__gate/status')
  assert.equal(status.status, 401, '/__gate/status 未登录仍 401（未被放行规则吞掉）')
})

test('R2 未旁路：/ 与 /ob/api/tree 仍 302（放行规则不扩散到其它路径）', async (t) => {
  const { req, calls } = await startGate(t)
  isRedirectToLogin(await req('/'))
  isRedirectToLogin(await req('/ob/api/tree'))
  assert.equal(calls.length, 0)
})

// ===== ⑦ 留痕（合同「可观测」）=====

test('可观测：放行命中留一行痕（含方法/路径/ip），未命中不留放行痕', async (t) => {
  const { req, logs } = await startGate(t)
  await req('/ob_share/abc123')
  const hits = logs.filter((l) => l.includes('匿名放行'))
  assert.equal(hits.length, 1, `放行留痕一行，实得 ${JSON.stringify(logs)}`)
  assert.match(hits[0], /GET \/ob_share\/abc123/)
  await req('/ob_share_backup/x')
  assert.equal(logs.filter((l) => l.includes('匿名放行')).length, 1, '未命中不留放行痕')
})

// ===== ⑧ normalize 透传（index.js：默认空 + 数组归一）=====

test('normalize 透传（真 apply + 真 gate）：配置→gate 全链路行为随配置变（非法形不炸装载）', async (t) => {
  const home = (await import('node:fs')).mkdtempSync((await import('node:os')).tmpdir() + '/dlg-anon-')
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  })

  /**
   * 真 apply()（假 ctx：effect 真跑、端口用真空闲端口 → 真监听真 handler）+ 真 createForwarder
   * 指向一个真上游 → 端到端验证「配置形 → 门禁行为」的透传链（不是只看 normalize 返回值）。
   */
  async function realStack(raw, t2) {
    const upstream = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('UP:' + req.url)
    })
    await new Promise((r) => upstream.listen({ port: 0, host: '127.0.0.1' }, r))
    t2.after(() => new Promise((r) => upstream.close(r)))
    const upPort = upstream.address().port

    const gatePort = await freePort()
    const effects = []
    const ctx = {
      effect: (fn, label) => effects.push({ fn, label }),
      plugin: () => {},
      logger: { info: () => {} },
      get: () => undefined,
    }
    apply(ctx, { port: gatePort, upstreamPort: upPort, users: { boss: 'scrypt$16384$8$1$aa$bb' }, ...raw })
    const dispose = effects[0].fn()
    t2.after(() => { try { dispose() } catch { /* 幂等 */ } })
    await waitListening(gatePort)
    return `http://127.0.0.1:${gatePort}`
  }

  // (1) 默认（键缺省）→ /ob_share/ 仍 302（零开口）
  {
    const base = await realStack({}, t)
    const res = await fetch(base + '/ob_share/abc123', { redirect: 'manual' })
    assert.equal(res.status, 302, '缺省配置：/ob_share/ 仍 302')
  }
  // (2) 配置开启 → 匿名 200 且真转发到真上游（body 带上游真形）
  {
    const base = await realStack({ httpAnonymous: ['^/ob_share/'] }, t)
    const res = await fetch(base + '/ob_share/abc123', { redirect: 'manual' })
    assert.equal(res.status, 200, '开启后：匿名 200')
    assert.equal(await res.text(), 'UP:/ob_share/abc123', '真转发到真上游（同一 forwarder.forward）')
    const bad = await fetch(base + '/ob_share_backup/x', { redirect: 'manual' })
    assert.equal(bad.status, 302, '反例仍 302')
    const post = await fetch(base + '/ob_share/abc123', { method: 'POST', redirect: 'manual' })
    assert.equal(post.status, 302, '写方法仍 302')
  }
  // (3) 非法形（字符串）→ 不炸装载且不放行（收敛为不放行）
  {
    const base = await realStack({ httpAnonymous: '^/ob_share/' }, t)
    const res = await fetch(base + '/ob_share/abc123', { redirect: 'manual' })
    assert.equal(res.status, 302, '非法形（字符串）收敛=不放行，且不炸装载')
  }
})

test('Config schema：httpAnonymous 默认空数组（zod 缺省 = 零开口）', async () => {
  const { Config } = await import('../lib/index.js')
  assert.deepEqual(Config.parse({}).httpAnonymous, [])
  assert.deepEqual(Config.parse({ httpAnonymous: ['^/ob_share/'] }).httpAnonymous, ['^/ob_share/'])
})

test('写入面预检：httpAnonymous 必须是字符串数组 + 正则可编译；无 any 通配（安全边界键）', async () => {
  const { checkPatchValues, checkPatchEditable } = await import('../lib/settings-write.js')
  assert.deepEqual(checkPatchValues({ httpAnonymous: ['^/ob_share/'] }), { ok: true })
  assert.deepEqual(checkPatchValues({ httpAnonymous: [] }), { ok: true }, '空数组=可写（收口为零开口）')
  for (const bad of ['^/ob_share/', null, 1, ['^/ok', 5], ['[unclosed'], ['']]) {
    assert.equal(checkPatchValues({ httpAnonymous: bad }).ok, false, `httpAnonymous=${JSON.stringify(bad)} 应拒`)
  }
  assert.deepEqual(checkPatchEditable({ httpAnonymous: ['^/ob_share/'] }), { ok: true }, '进可写白名单')
})

// ===== ⑨ F1 规则内容治理（复审 Critical：只校验「可编译」不校验「不构成通配」）=====

/** F1 翻车形全集：能通过 zod + 旧写入面预检、但 `re.test(path)` 对任意路径恒真的规则 */
const ANON_WILDCARD_RULES = ['', '^', '.*', '.', '.+', '.?', '^.*', '^/.*', '^/.+', '^[a-z]*', '^/[a-z]', 'ob_share', '^ob_share/']

test('F1-write 写入面拒通配：空串/纯通配/零宽锚点/未锚定形一律 ok:false（不得入库）', async () => {
  const { checkPatchValues } = await import('../lib/settings-write.js')
  for (const rule of ANON_WILDCARD_RULES) {
    const r = checkPatchValues({ httpAnonymous: [rule] })
    assert.equal(r.ok, false, `httpAnonymous=${JSON.stringify(rule)} 应在写入面被拒（否则一次误配=整站匿名免登）`)
    assert.equal(r.code, 'invalid', `${JSON.stringify(rule)} 应为 invalid 码`)
    assert.match(r.message, /httpAnonymous 规则不合法/, `${JSON.stringify(rule)} 消息应指认规则不合法`)
  }
  // 混排：一条好 + 一条坏 = 整单拒（绝不「丢掉坏的后放行好的」）
  const mixed = checkPatchValues({ httpAnonymous: ['^/ob_share/', '.*'] })
  assert.equal(mixed.ok, false, '混入通配条应整单拒')
  // 合法锚定前缀仍可写（含未来合法需求形）
  for (const rule of ['^/ob_share/', '^/ob_share/[a-z]+', '^/ob/', '^\\/ob_share\\/']) {
    assert.deepEqual(checkPatchValues({ httpAnonymous: [rule] }), { ok: true }, `${JSON.stringify(rule)} 应可写`)
  }
  // 条数上限（工程上限防误刷，非安全判据）
  const tooMany = Array.from({ length: 33 }, (_, i) => '^/p' + i + '/')
  assert.equal(checkPatchValues({ httpAnonymous: tooMany }).ok, false, '超 32 条应拒')
  assert.deepEqual(checkPatchValues({ httpAnonymous: Array.from({ length: 32 }, (_, i) => '^/p' + i + '/') }), { ok: true }, '32 条边界内应可写')
})

test('F1-load 装载层兜底：通配规则入配置 → 丢该条 + 告警一行，/anything 与 /ob/api/tree 仍 302（不炸装载）', async (t) => {
  for (const rule of ['', '^', '.*', '^/.*']) {
    const { req, calls, logs } = await startGate(t, { httpAnonymous: [rule] })
    for (const p of ['/anything', '/ob/api/tree', '/', '/ob_share/abc123']) {
      const res = await req(p)
      isRedirectToLogin(res)
    }
    assert.equal(calls.length, 0, `${JSON.stringify(rule)} 装载后应零转发（连 /ob_share/ 都不通，fail-closed）`)
    const warns = logs.filter((l) => l.includes('httpAnonymous 规则已丢弃'))
    assert.ok(warns.length >= 1, `${JSON.stringify(rule)} 应留丢弃告警（不静默）`)
    assert.match(warns.join('\n'), new RegExp(JSON.stringify(rule).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('F1-ACL 规则集合级反通配回归锁：四类规则混喂真 gate，只有合法锚定前缀放行 /ob_share/', async (t) => {
  // 铁律：**任何规则集合下都不得出现「非 /ob_share/ 路径被放行」**。
  // 把四类同形一起喂真 gate（含正确规则打头、通配形殿后的「被拖垮」阵型）。
  const sets = [
    { rules: ['^/ob_share/'], label: '仅合法形' },
    { rules: [''], label: '空串' },
    { rules: ['^'], label: '零宽锚点' },
    { rules: ['.*'], label: '纯通配' },
    { rules: ['^.*'], label: '锚定通配' },
    { rules: ['^/ob_share/', ''], label: '合法+空串（被拖垮阵型）' },
    { rules: ['^/ob_share/', '.*'], label: '合法+纯通配（被拖垮阵型）' },
    { rules: ['^/ob_share/[a-z]+'], label: '合法受限前缀' },
    { rules: ['^/ob_share/', '^/ok', '^/.*'], label: '合法两条+通配殿后' },
    // R1（复审 #2）：「锚定但非精确前缀」形同样入集合级回归锁——修前这 5 形过判据且放行
    // 合同 R3 三形（`^/ob_share` → `/ob_share_backup/x`、`/ob_shareX/`；`^/x` → `/x/ob_share/`）。
    { rules: ['^/ob_share'], label: '少尾斜杠（typo 级）' },
    { rules: ['^/x'], label: '目标前缀沉到第二段' },
    { rules: ['^/o'], label: '更短字面前缀' },
    { rules: ['^/ob_[a-z]+'], label: '字符类拼出等价形' },
    { rules: ['^/(?:ob_share)'], label: '非捕获分组等价形' },
    { rules: ['^/ob_share', '^/ob_share/'], label: '非精确+精确混排（不得拖垮精确形）' },
  ]
  const NON_SHARE_PATHS = ['/anything', '/', '/ob/api/tree', '/ob_share_backup/x', '/x/ob_share/', '/ob_shareX/']
  const SHARE_TARGET = '/ob_share/abc123'
  for (const { rules, label } of sets) {
    const { req, calls } = await startGate(t, { httpAnonymous: rules })
    // 治理后的有效规则集（装载层与写入面同一判据；空串/通配/未锚定全部在此被丢）
    const { filterAnonymousRules } = await import('../lib/anon-rules.js')
    const { rules: effective } = filterAnonymousRules(rules)
    // 期望值由**有效集合的实测匹配**推出（不靠字面猜）：这与门禁 `anonRules.some(re => re.test(path))`
    // 是同一条语义，避免测试自造一套口径。
    const shareReleased = effective.some((r) => new RegExp(r).test(SHARE_TARGET))
    const nonShareReleased = NON_SHARE_PATHS.filter((p) => effective.some((r) => new RegExp(r).test(p)))

    // 铁律（红线原话）：**任何规则集合下都不得出现「非 /ob_share/ 路径被放行」**。
    assert.deepEqual(nonShareReleased, [], `${label}：非 /ob_share/ 路径不得被放行，实得 ${JSON.stringify(nonShareReleased)}`)

    for (const p of NON_SHARE_PATHS) isRedirectToLogin(await req(p))
    const share = await req(SHARE_TARGET)
    if (shareReleased) assert.equal(share.status, 200, `${label}：${SHARE_TARGET} 应放行`)
    else isRedirectToLogin(share)
    // 转发计数与规则面严格一致（无额外转发 = 无泄漏路径）
    assert.equal(calls.length, shareReleased ? 1 : 0, `${label}：转发次数应与放行面一致，实得 ${calls.length}`)
  }
})

test('F1-apply normalize 透传（真 apply + 真 gate）：坏规则在装载层即被丢，真链路上 /anything 仍 302', async (t) => {
  const home = (await import('node:fs')).mkdtempSync((await import('node:os')).tmpdir() + '/dlg-anon-f1-')
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  })
  const upstream = (await import('node:http')).createServer((req, res) => { res.writeHead(200); res.end('UP:' + req.url) })
  await new Promise((r) => upstream.listen({ port: 0, host: '127.0.0.1' }, r))
  t.after(() => new Promise((r) => upstream.close(r)))
  const upPort = upstream.address().port

  async function realStack(raw, t2) {
    const gatePort = await freePort()
    const effects = []
    const ctx = { effect: (fn) => effects.push({ fn }), plugin: () => {}, logger: { info: () => {} }, get: () => undefined }
    apply(ctx, { port: gatePort, upstreamPort: upPort, users: { boss: 'scrypt$16384$8$1$aa$bb' }, ...raw })
    const dispose = effects[0].fn()
    t2.after(() => { try { dispose() } catch { /* 幂等 */ } })
    await waitListening(gatePort)
    return `http://127.0.0.1:${gatePort}`
  }

  // (1) 合法形真链路：照常放行（不因治理误伤）
  {
    const base = await realStack({ httpAnonymous: ['^/ob_share/'] }, t)
    const res = await fetch(base + '/ob_share/abc123', { redirect: 'manual' })
    assert.equal(res.status, 200, '合法锚定前缀仍放行')
    assert.equal(await res.text(), 'UP:/ob_share/abc123')
  }
  // (2) 通配形真链路：装载层丢条 → 零开口（fail-closed）且不炸装载
  for (const rule of ['', '^', '.*']) {
    const base = await realStack({ httpAnonymous: [rule] }, t)
    for (const p of ['/anything', '/ob/api/tree', '/ob_share/abc123']) {
      const res = await fetch(base + p, { redirect: 'manual' })
      assert.equal(res.status, 302, `规则 ${JSON.stringify(rule)} 经真 apply 后 ${p} 应仍 302`)
    }
  }
  // (3) 混排（合法打头 + 通配殿后）：正确规则不被拖垮
  {
    const base = await realStack({ httpAnonymous: ['^/ob_share/', ''] }, t)
    assert.equal((await fetch(base + '/ob_share/abc123', { redirect: 'manual' })).status, 200, '混排后仍只放行合法前缀目标')
    for (const p of ['/anything', '/ob/api/tree']) {
      assert.equal((await fetch(base + p, { redirect: 'manual' })).status, 302, `${p} 不得被通配条拖成放行`)
    }
  }
})

// ===== ⑫ R1 锚定但非精确前缀治理（复审 #2 R1：62 形越过合同 R3 边界）=====

/** 合同 R3 红线三形（delta-specs/share-anonymous-gate.md:16,34 —— 权威来源） */
const ANON_R3_SHAPES = ['/ob_share_backup/x', '/x/ob_share/', '/ob_shareX/']

/**
 * R1「锚定但非精确前缀」形：过双道判据、且 `re.test(path)` 命中**合同 R3 三形**的形
 * （复审 #2 §1.4 六十二族；下表每形都由 ANON_R3_SHAPES 实证命中 verderified，见下）。
 *   少尾斜杠（一次 typo 的量级）→ `/ob_share_backup/x`、`/ob_shareX/`
 *   目标前缀沉到第二段（`^/x`）→ `/x/ob_share/`（R3 位置变体）
 *   分组/字符类等价形（`^/(?:ob_share)`、`^/ob_s[a-z]+`）→ 同上
 * 注：`^/ob_shar/` 这类「不同首段的精确前缀」只命中 `/ob_shar/x`，**不在 R3 三形族内**，
 * 不属本锁范围（那属用户自选前缀的合法锚定形，非前缀伪装）。
 */
const ANON_IMPRECISE_PREFIX_RULES = [
  '^/ob_share',      // 少一尾斜杠（typo 级）
  '^/ob_share/?',    // 可选尾斜杠
  '^/ob_share/*',    // `*` 前无 `/`（连写伪装）
  '^/(?:ob_share)',  // 非捕获分组等价形
  '^/ob_s[a-z]+',    // 字符类拼出的等价形
  '^/ob_[a-z]+',
  '^/[a-z]*_share',  // 反向拼形
  '^/x',             // 目标前缀沉到第二段
  '^/x/',
  '^/x/[a-z]+',
  '^/x/\\w+',
  '^/o',
  '^/ob',
  '^/ob_',
  '^/o[a-z/]*',
  '^\\/ob_share',   // 反斜杠转义等价形（正则 `\/` = 字面 `/`，与 `^/ob_share` 同语义）
]

const ANON_LEGAL_PREFIX_RULES = [
  '^/ob_share/',
  '^/ob_share/[a-z]+',
  '^/ob/',
  '^\\/ob_share\\/',
  '^/ob_share/docs/',
  '^/ob_share/[a-z]*',
  '^/ob_share/.*',
  '^/api/[^/]+$',
  '^/ob_share/\\w+',
  '^/public/',
  '^/static/',
]

test('R1-write 写入面拒「锚定但非精确前缀」：合同 R3 三形并入负面探针，62 族一律 ok:false（不得入库）', async () => {
  const { checkPatchValues } = await import('../lib/settings-write.js')
  // 元锁（防「镀金清单」）：本表每形必须**真的**能匹配合同 R3 三形之一。
  // 否则列表里掺进打不中 R3 的形，测试看似红得快、其实没在测 R1 缺口。
  for (const rule of ANON_IMPRECISE_PREFIX_RULES) {
    const re = new RegExp(rule)
    assert.ok(ANON_R3_SHAPES.some((p) => re.test(p)),
      `元锁：${JSON.stringify(rule)} 必须真能命中合同 R3 三形之一（否则本锁未覆盖 R1 缺口）`)
  }
  for (const rule of ANON_IMPRECISE_PREFIX_RULES) {
    const r = checkPatchValues({ httpAnonymous: [rule] })
    assert.equal(r.ok, false, `httpAnonymous=${JSON.stringify(rule)} 应被写入面拒（少尾斜杠/分组等价形=越过合同 R3 边界）`)
    assert.equal(r.code, 'invalid')
    assert.match(r.message, /httpAnonymous 规则不合法/, `${JSON.stringify(rule)} 消息应指认规则不合法`)
  }
  // 混排：合法 + 非精确前缀 = 整单拒（绝不「丢掉坏的后放行好的」）
  const mixed = checkPatchValues({ httpAnonymous: ['^/ob_share/', '^/ob_share'] })
  assert.equal(mixed.ok, false, '混入非精确前缀条应整单拒')
})

test('R1-load 装载层兜底：非精确前缀入配置 → 丢该条 + 告警，合同 R3 三形仍 302 零转发（不炸装载）', async (t) => {
  // 每形单独喂真 gate（fail-closed：该条被丢 → 零开口；fail-open 才是放行 R3）
  for (const rule of ANON_IMPRECISE_PREFIX_RULES) {
    const { req, calls, logs } = await startGate(t, { httpAnonymous: [rule] })
    for (const p of ['/ob_share_backup/x', '/x/ob_share/', '/ob_shareX/', '/ob_share', '/ob_share/abc123']) {
      isRedirectToLogin(await req(p))
    }
    // 计数器证据：合同 R3 三形**零转发**（不是只看状态码；fail-open 会打真上游）
    assert.equal(calls.length, 0, `${JSON.stringify(rule)}：合同 R3 三形应零转发，实得 ${calls.length}`)
    const warns = logs.filter((l) => l.includes('httpAnonymous 规则已丢弃'))
    assert.ok(warns.length >= 1, `${JSON.stringify(rule)} 应留丢弃告警（不静默）`)
  }
})

test('R1-legal 合法精确前缀零误伤：11 形双面保留，装载后约定目标仍 200', async (t) => {
  const { checkPatchValues } = await import('../lib/settings-write.js')
  const { filterAnonymousRules } = await import('../lib/anon-rules.js')
  for (const rule of ANON_LEGAL_PREFIX_RULES) {
    assert.deepEqual(checkPatchValues({ httpAnonymous: [rule] }), { ok: true }, `${JSON.stringify(rule)} 写入面应可写`)
    assert.equal(filterAnonymousRules([rule]).rules.length, 1, `${JSON.stringify(rule)} 装载层应保留`)
  }
  // 代表形真链路：合法前缀照常放行（治理不误伤）——收敛不能缩掉合法面
  for (const [rule, probe] of [['^/ob_share/', '/ob_share/abc123'], ['^/ob_share/[a-z]+', '/ob_share/abc'], ['^/ob/', '/ob/api/tree']]) {
    const { req, calls } = await startGate(t, { httpAnonymous: [rule] })
    assert.equal((await req(probe)).status, 200, `${JSON.stringify(rule)} 目标 ${probe} 应放行`)
    assert.equal(calls.length, 1)
  }
})

test('R1-apply 真链路（真 apply + 真 forwarder）：非精确前缀装载期即被丢，合同 R3 三形不触达上游', async (t) => {
  // 与复审 #2 §9-C 同构：真 apply() + 真 forwarder + 隔离真上游（临时端口）——
  // 修前 `['^/ob_share']` 下 `/ob_share_backup/x` = 200 且 upstreamHits 递增；修后必须 302 且不递增。
  const home = (await import('node:fs')).mkdtempSync((await import('node:os')).tmpdir() + '/dlg-anon-r1-')
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  })
  const upstreamHits = []
  const upstream = (await import('node:http')).createServer((req, res) => {
    upstreamHits.push(req.url)
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('UP:' + req.url)
  })
  await new Promise((r) => upstream.listen({ port: 0, host: '127.0.0.1' }, r))
  t.after(() => new Promise((r) => upstream.close(r)))
  const upPort = upstream.address().port

  async function realStack(raw, t2) {
    const gatePort = await freePort()
    const effects = []
    const ctx = { effect: (fn) => effects.push({ fn }), plugin: () => {}, logger: { info: () => {} }, get: () => undefined }
    apply(ctx, { port: gatePort, upstreamPort: upPort, users: { boss: 'scrypt$16384$8$1$aa$bb' }, ...raw })
    const dispose = effects[0].fn()
    t2.after(() => { try { dispose() } catch { /* 幂等 */ } })
    await waitListening(gatePort)
    return `http://127.0.0.1:${gatePort}`
  }

  // 复现复审六组：每一组装载期丢条 → 零开口 → R3 三形 302 且上游零命中
  for (const rule of ['^/ob_share', '^/x', '^/o', '^/ob', '^/ob_[a-z]+', '^(?:ob_share)']) {
    const before = upstreamHits.length
    const base = await realStack({ httpAnonymous: [rule] }, t)
    for (const p of ['/ob_share_backup/x', '/x/ob_share/', '/ob_shareX/', '/ob_share', '/ob_shar/x', '/anything']) {
      const res = await fetch(base + p, { redirect: 'manual' })
      assert.equal(res.status, 302, `规则 ${JSON.stringify(rule)}：${p} 应 302（锚定但非精确前缀不得越过合同 R3 边界），实得 ${res.status}`)
    }
    assert.equal(upstreamHits.length - before, 0, `规则 ${JSON.stringify(rule)}：合同 R3 形零触达上游，实得 ${JSON.stringify(upstreamHits.slice(before))}`)
  }
  // 精确前缀形仍正常放行（对照：治理不是把合法精确前缀也堵死）
  {
    const before = upstreamHits.length
    const base = await realStack({ httpAnonymous: ['^/ob_share/'] }, t)
    const res = await fetch(base + '/ob_share_backup/x', { redirect: 'manual' })
    assert.equal(res.status, 302, '精确前缀 ^/ob_share/ 仍不放行前缀伪装形')
    assert.equal(upstreamHits.length - before, 0)
    const ok = await fetch(base + '/ob_share/abc123', { redirect: 'manual' })
    assert.equal(ok.status, 200)
    assert.equal(await ok.text(), 'UP:/ob_share/abc123')
    assert.equal(upstreamHits.length - before, 1, '合法目标恰一次上游命中')
  }
})

// ===== ⑬ F2 越界硬否定扩口径（复审 Major：; / NUL %00 / 任意长点串 / 反斜杠）=====

test('F2 类点段/参数型借道：..; / ..%00 / ....// 一律仍 302 且零转发（门禁层不再依赖上游 404 兜底）', async (t) => {
  const { req, calls } = await startGate(t)
  // 复审实证三形：旧判据只挡「真点段/编码/反斜杠」，`;`/`%00`/`....` 能过放行门禁
  // 注：fetch() 客户端会把 `....//../../etc` 归一成 `/ob_share/etc`（URL 路径归一发生在
  // 请求线发出之前，门禁根本见不到原形），故归一真正常点段可解；需要「原样送达」的
  // 复合形由下方 F2d 真 socket 锁住。
  for (const path of [
    '/ob_share/..;/x',
    '/ob_share/..%00/x',
    '/ob_share/....//x',
    '/ob_share/..;/',
    '/ob_share/..;',
    '/ob_share/..../',
  ]) {
    const res = await req(path)
    isRedirectToLogin(res)
  }
  assert.equal(calls.length, 0, '类点段/参数型借道形零转发（上游不再被请求）')
})

test('F2d 复合越界形真 socket 原样送达：....//../../etc 与 ..;/..%2f 原样到达仍 302（绕开客户端归一）', async (t) => {
  const { base, calls } = await startGate(t)
  const u = new URL(base)
  const rawLine = (target) => new Promise((resolve, reject) => {
    const s = net.connect({ port: Number(u.port), host: '127.0.0.1' }, () => {
      s.write(`GET ${target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`)
    })
    let buf = ''
    s.on('data', (d) => { buf += d.toString() })
    s.on('end', () => resolve(buf.split('\r\n')[0]))
    s.on('error', reject)
    setTimeout(() => { s.destroy(); reject(new Error('timeout: ' + target)) }, 3000)
  })
  // 真 socket 直送：不经 fetch/URL 归一，门禁收到请求线上的原形
  for (const target of [
    '/ob_share/....//../../etc',
    '/ob_share/..;/..%2f',
    '/ob_share/..;/../../etc',
    '/ob_share/..../..;/x',
    '/ob_share/..%00/../../../etc',
  ]) {
    assert.match(await rawLine(target), /^HTTP\/1\.1 302/, `${target} 应 302`)
  }
  assert.equal(calls.length, 0, '复合越界形零转发（上游不再被请求）')
})

test('F2b 参数型 token 段不被误伤：abc;jsessionid=1 仍放行（`;` 只作点段分隔符判据，非全局拒）', async (t) => {
  const { req, calls } = await startGate(t)
  const res = await req('/ob_share/abc;jsessionid=1')
  assert.equal(res.status, 200, '合法（非点段）参数型 token 段仍放行——治理不误伤真实用法')
  assert.equal(calls.length, 1)
})

test('F2c 既有越界形零回归：旧 12 形在新判据下仍全 302', async (t) => {
  const { req, calls } = await startGate(t)
  for (const path of [
    '/ob_share/../../',
    '/ob_share/..%2f..%2f',
    '/ob_share/%2e%2e/api',
    '/ob_share/%2E%2E/api',
    '/ob_share\\..\\api',
    '/ob_share/a/../../../etc',
    '/ob_share/%2f..%2f',
  ]) {
    isRedirectToLogin(await req(path))
  }
  assert.equal(calls.length, 0, '旧越界形零回归')
})

// ===== ⑪ F3 审计 IP 口径（复审 Minor：匿名放行日志 ip 须用连接级地址）=====

test('F3 审计 ip 用连接级 socket.remoteAddress（私网下 XFF 伪造不得污染主 ip 字段）', async (t) => {
  const { req, logs } = await startGate(t)
  await req('/ob_share/abc123', { headers: { 'x-forwarded-for': '1.2.3.4' } })
  const hits = logs.filter((l) => l.includes('匿名放行'))
  assert.equal(hits.length, 1, `放行留痕一行，实得 ${JSON.stringify(logs)}`)
  // 主 ip 须是服务端观察值（回环地址），不是伪造的 XFF 首跳
  assert.match(hits[0], /ip=127\.0\.0\.1|ip=::1|ip=::ffff:127\.0\.0\.1/, `主 ip 应为连接级地址，实得：${hits[0]}`)
  assert.doesNotMatch(hits[0], /ip=1\.2\.3\.4/, '伪造 XFF 不得进主 ip 字段')
  // XFF 仅作附加上下文且显式标注不可信
  assert.match(hits[0], /xff=1\.2\.3\.4\(不可信,仅附注\)/, 'XFF 应作 xff= 附注并标注不可信')
})

// F3（复审 requiredFix 原文）显式过滤锁：数字项**被丢弃**而不是被 String() 成未锚定正则。
// `['^/ob_share/', 123]` → 200 仅因首条命中（若 123 被 String() 成 '/123/'，/123/ 也命中，
// 该形仍是 200，故须配合 `[123]` → 302 才能证明「过滤缺失即放行面扩大」）。
test('F3b 非字符串项被丢弃（非 String()）：[123] 不放行，且不放行任何含 123 的路径', async (t) => {
  // (1) 只有数字项 → 丢干净 → 零开口
  {
    const { req, calls } = await startGate(t, { httpAnonymous: [123] })
    for (const p of ['/ob_share/abc123', '/123/', '/x?q=123']) isRedirectToLogin(await req(p))
    assert.equal(calls.length, 0, '[123] 应零转发（数字项被丢，未变成 /123/ 正则）')
  }
  // (2) 合法 + 数字 → 只留合法条，放行面恰为锚定前缀
  {
    const { req, calls } = await startGate(t, { httpAnonymous: ['^/ob_share/', 123] })
    assert.equal((await req('/ob_share/abc123')).status, 200, '合法条命中即放行')
    isRedirectToLogin(await req('/anything'))
    isRedirectToLogin(await req('/123/'))
    // 关键反证：若 123 被 String() 成 '/123/'，则 /123/ 会被放行 → calls 变 2
    assert.equal(calls.length, 1, `转发应恰 1 次（数字项未被变成 /123/ 正则），实得 ${calls.length}：${JSON.stringify(calls)}`)
  }
})


