// dsh-login-gate — 认证行为回归（INV-5，Task 13 全新面）：
//   ①固定过期不续期（issue/verifyCookie 的 exp 判定、请求不重签、篡改 exp 拒、过期拒）
//   ②失败锁定（maxFailures 阈值起锁 + 指数退避 + 封顶 + 成功清零；HTTP 面 429 + retry-after）
//   ③防枚举（未命中用户名走哑 scrypt：响应逐字一致 + KDF 真跑下界）
//   ④logout-all 轮换 secret 全员失效（真登录×2 → 轮换 → 含执行者全失效，再登录照常）
// 被测件：lib/auth.js（createSessionManager）、lib/ratelimit.js（createRateLimiter）、lib/gate.js（真 handler）。
// 纪律（INV-5/C-2）：只锁行为、绝不改行为——真 scrypt（N=16384）、真 http handler、真表单登录；
// 假缝仅承接 forwarder（转发非本测职责）、log 收集与 secret 轮换持有器（index.js rotateSecret 同形）。
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createSessionManager, hashPassword } from '../lib/auth.js'
import { createRateLimiter } from '../lib/ratelimit.js'
import { createGateServer } from '../lib/gate.js'

/** 起真门禁服务器（真 createGateServer + 临时端口监听），返回请求助手 */
async function startGate(t, { users, sessionDays = 30, maxFailures = 5 } = {}) {
  const holder = { secret: 'test-secret-' + Math.random().toString(36).slice(2) }
  const sessions = createSessionManager({ getSecret: () => holder.secret })
  const limiter = createRateLimiter({ maxFailures })
  const logs = []
  const server = createGateServer({
    users,
    sessions,
    limiter,
    forwarder: {
      forward: async (_req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('upstream') },
      forwardUpgrade: async () => {},
    },
    onLogoutAll: () => { holder.secret = 'rotated-' + Math.random().toString(36).slice(2) }, // index.js rotateSecret 同形
    sessionMode: () => 'hmac',
    secureCookie: false,
    sessionDays,
    log: (line) => logs.push(String(line)),
  })
  await new Promise((resolve) => server.listen({ port: 0, host: '127.0.0.1' }, resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return { url: `http://127.0.0.1:${server.address().port}`, holder, logs }
}

/** 表单登录（redirect:manual——302/Set-Cookie 必须原样可见）；x-forwarded-for 做 per-IP 隔离 */
const login = (url, user, pass, ip, extra = {}) => fetch(url + '/__gate/login', {
  method: 'POST',
  redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': ip, ...extra.headers },
  body: new URLSearchParams({ u: user, p: pass, next: '/' }).toString(),
})

/** Set-Cookie 形 → cookie 头（dlg_sid=<token>） */
const cookieOf = (res) => String(res.headers.get('set-cookie')).split(';')[0]

const decodePayload = (token) => JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'))

// ===== ① 固定过期、不续期 =====

test('固定过期不续期（INV-5·会话层）：exp 一次签发定终身——verify 不顺延、篡改 exp 拒、过期拒、轮换即失效', () => {
  let secret = 'secret-A'
  const sessions = createSessionManager({ getSecret: () => secret })

  const token = sessions.issue('alice', 3600)
  const issued = decodePayload(token)
  const p1 = sessions.verifyCookie(`dlg_sid=${token}`)
  assert.equal(p1.u, 'alice')
  assert.equal(p1.exp, issued.exp, 'verify 返回 exp=签发时写入（请求不重签）')
  const p2 = sessions.verifyToken(token)
  assert.equal(p2.exp, p1.exp, '重复校验 exp 不顺延（固定过期、不续期）')
  assert.equal(p2.iat, p1.iat, 'iat 同样不顺延')

  // 篡改 exp 续期=签名不匹配拒（exp 不可被客户端延长）
  const sig = token.split('.')[1]
  const tampered = Buffer.from(JSON.stringify({ ...issued, exp: issued.exp + 86_400_000 }), 'utf8').toString('base64url') + '.' + sig
  assert.equal(sessions.verifyToken(tampered), null, '篡改 exp 一律拒')

  // exp 判定：过期令牌拒
  assert.equal(sessions.verifyToken(sessions.issue('alice', -1)), null, 'exp 已过期一律拒')

  // 形非法/缺 cookie 拒
  assert.equal(sessions.verifyCookie('other=abc'), null, '非本门禁 cookie 名拒')
  assert.equal(sessions.verifyCookie(undefined), null)
  assert.equal(sessions.verifyToken('nodot'), null)

  // 轮换 secret（logout-all 机制底座）：全部已发令牌立即失效
  const other = sessions.issue('bob', 3600)
  assert.ok(sessions.verifyToken(other))
  secret = 'secret-B'
  assert.equal(sessions.verifyToken(token), null, '轮换后旧令牌全失效（alice）')
  assert.equal(sessions.verifyToken(other), null, '轮换后旧令牌全失效（bob）')
})

test('固定过期不续期（INV-5·HTTP 面）：登录 Set-Cookie Max-Age=会话定长；后续请求零 Set-Cookie 重签、exp 原值', async (t) => {
  const gate = await startGate(t, { users: { alice: hashPassword('pw') }, sessionDays: 1 })
  const res = await login(gate.url, 'alice', 'pw', '10.0.0.1')
  assert.equal(res.status, 302)
  const sc = res.headers.get('set-cookie')
  assert.ok(sc.includes('Max-Age=86400'), `Cookie Max-Age=sessionDays*86400 定长（实得 ${sc}）`)
  assert.ok(sc.includes('HttpOnly'))
  const cookie = cookieOf(res)
  const issued = decodePayload(cookie.slice('dlg_sid='.length))
  const delta = issued.exp - Date.now()
  assert.ok(delta > 86_350_000 && delta < 86_405_000, `令牌 exp=签发时刻+定长 86400s（实差 ${delta}ms）`)

  const st1 = await fetch(gate.url + '/__gate/status', { headers: { cookie } })
  assert.equal(st1.status, 200)
  assert.equal(st1.headers.get('set-cookie'), null, 'status 请求零 Set-Cookie（请求不重签）')
  const body1 = await st1.json()
  assert.equal(body1.user, 'alice')

  const fwd = await fetch(gate.url + '/any', { headers: { cookie }, redirect: 'manual' })
  assert.equal(fwd.status, 200)
  assert.equal(await fwd.text(), 'upstream')
  assert.equal(fwd.headers.get('set-cookie'), null, '转发请求零 Set-Cookie（请求不重签）')

  const body2 = await (await fetch(gate.url + '/__gate/status', { headers: { cookie } })).json()
  assert.equal(body2.exp, body1.exp, '两次请求 exp 原值（活跃不顺延）')
  assert.ok(body2.exp <= issued.exp, '响应 exp 不得超出签发 exp')
})

// ===== ② 失败锁定（maxFailures 指数退避） =====

test('失败锁定指数退避（INV-5）：阈值起锁→30s 起步逐次翻倍→封顶 300s→成功清零；per-IP 隔离（真 ratelimit）', () => {
  const limiter = createRateLimiter({ maxFailures: 2 })
  assert.deepEqual(limiter.check('1.1.1.1'), { ok: true })
  limiter.recordFailure('1.1.1.1')
  assert.equal(limiter.check('1.1.1.1').ok, true, '阈值前不锁')

  limiter.recordFailure('1.1.1.1')
  const first = limiter.check('1.1.1.1')
  assert.equal(first.ok, false, '达阈值起锁')
  assert.ok(first.retryAfter >= 25 && first.retryAfter <= 31, `首锁≈30s（实得 ${first.retryAfter}s）`)

  // 指数退避：fails=3→60s、4→120s、5→240s、6→封顶 300s（实测区间容差）
  const ladder = [[3, 50, 61], [4, 100, 121], [5, 200, 241], [6, 280, 301]]
  for (const [fails, lo, hi] of ladder) {
    limiter.recordFailure('1.1.1.1')
    const r = limiter.check('1.1.1.1')
    assert.equal(r.ok, false, `第 ${fails} 次失败仍锁`)
    assert.ok(r.retryAfter >= lo && r.retryAfter <= hi, `第 ${fails} 次失败后退避落 ${lo}-${hi}s（实得 ${r.retryAfter}s）`)
  }

  assert.equal(limiter.check('2.2.2.2').ok, true, 'per-IP 隔离：他 IP 不受连累')
  limiter.recordSuccess('1.1.1.1')
  assert.equal(limiter.check('1.1.1.1').ok, true, '登录成功清零')

  // 缺省 maxFailures=5：4 次失败不锁、第 5 次起锁
  const d = createRateLimiter()
  for (let i = 0; i < 4; i++) d.recordFailure('3.3.3.3')
  assert.equal(d.check('3.3.3.3').ok, true, '缺省阈值 5：4 次失败不锁')
  d.recordFailure('3.3.3.3')
  assert.equal(d.check('3.3.3.3').ok, false, '第 5 次起锁')
})

test('失败锁定（INV-5·HTTP 面）：连续失败达 maxFailures 后 429 + retry-after，锁定期正确密码也拒；per-IP 隔离', async (t) => {
  const gate = await startGate(t, { users: { alice: hashPassword('pw') }, maxFailures: 2 })
  const ip = '10.7.7.7'
  for (let i = 0; i < 2; i++) {
    const r = await login(gate.url, 'alice', 'wrong', ip)
    assert.equal(r.status, 401, `第 ${i + 1} 次失败=401`)
    assert.ok(gate.logs.some((l) => l.includes('登录失败')))
  }
  const locked = await login(gate.url, 'alice', 'pw', ip) // 锁定期：正确密码也拒
  assert.equal(locked.status, 429, '锁定期间一律 429（含正确密码）')
  assert.ok(Number(locked.headers.get('retry-after')) >= 1, 'retry-after 头在')
  assert.ok((await locked.text()).includes('尝试过于频繁'))

  const other = await login(gate.url, 'alice', 'pw', '10.7.7.8')
  assert.equal(other.status, 302, 'per-IP 隔离：他 IP 照常登录')
})

// ===== ③ 防枚举（未命中用户名走哑 scrypt） =====

test('防枚举（INV-5）：未命中用户名走哑 scrypt——响应逐字一致、KDF 真跑（真 scrypt 耗时下界）', async (t) => {
  const gate = await startGate(t, { users: { alice: hashPassword('pw') } })

  const t0 = Date.now()
  const miss = await login(gate.url, 'ghost', 'wrong', '10.8.8.1')
  const missMs = Date.now() - t0
  const missBody = await miss.text()

  const t1 = Date.now()
  const bad = await login(gate.url, 'alice', 'wrong', '10.8.8.2')
  const badMs = Date.now() - t1
  const badBody = await bad.text()

  assert.equal(miss.status, 401)
  assert.equal(bad.status, 401)
  assert.equal(missBody, badBody, '未命中用户 / 密码错误：响应正文逐字一致（零存在性泄漏）')
  assert.ok(missBody.includes('用户名或密码错误'), '统一错误文案')
  const failLogs = gate.logs.filter((l) => l.startsWith('登录失败：user='))
  assert.equal(failLogs.length, 2, '两端各记一条失败日志')
  assert.ok(failLogs.every((l) => /^登录失败：user=\S* ip=/.test(l)), '失败日志同一形（服务端留痕不改响应形）')

  // 哑 scrypt 真跑：N=16384 工作集 ~16MiB，短路实现必 <5ms——下界锁「未命中也付 KDF 成本」
  assert.ok(missMs >= 10, `未命中用户名耗时 ${missMs}ms（应与真 scrypt 同阶，短路实现必 <5ms）`)
  assert.ok(badMs >= 10, `密码错误耗时 ${badMs}ms（真 scrypt）`)
  const ratio = missMs / badMs
  assert.ok(ratio > 0.1 && ratio < 10, `两端耗时同阶（${missMs}ms vs ${badMs}ms）`)
})

// ===== ④ logout-all 轮换 secret 全员失效 =====

test('logout-all 轮换 secret 全员失效（INV-5）：真登录×2 → 轮换 → 含执行者全失效，再登录照常', async (t) => {
  const gate = await startGate(t, { users: { alice: hashPassword('pw-a'), bob: hashPassword('pw-b') } })
  const alice = cookieOf(await login(gate.url, 'alice', 'pw-a', '10.9.9.1'))
  const bob = cookieOf(await login(gate.url, 'bob', 'pw-b', '10.9.9.2'))
  assert.equal((await fetch(gate.url + '/__gate/status', { headers: { cookie: alice } })).status, 200, 'alice 会话在')
  assert.equal((await fetch(gate.url + '/__gate/status', { headers: { cookie: bob } })).status, 200, 'bob 会话在')

  const anon = await fetch(gate.url + '/__gate/logout-all', { method: 'POST', redirect: 'manual' })
  assert.equal(anon.status, 401, '未登录不得 logout-all')

  const la = await fetch(gate.url + '/__gate/logout-all', { method: 'POST', redirect: 'manual', headers: { cookie: alice } })
  assert.equal(la.status, 302)
  assert.ok(String(la.headers.get('set-cookie')).includes('Max-Age=0'), '执行者 cookie 立即清除')

  for (const [name, cookie] of [['alice', alice], ['bob', bob]]) {
    const st = await fetch(gate.url + '/__gate/status', { headers: { cookie } })
    assert.equal(st.status, 401, `${name} 会话已失效（含执行者）`)
    const page = await fetch(gate.url + '/x', { headers: { cookie }, redirect: 'manual' })
    assert.equal(page.status, 302, `${name} 受保护路径 302 重登`)
    assert.ok(String(page.headers.get('location')).includes('/__gate/login'), '302 目标=登录页')
  }

  const again = await login(gate.url, 'alice', 'pw-a', '10.9.9.1')
  assert.equal(again.status, 302, '轮换后登录照常（新 secret 签发）')
  assert.equal((await fetch(gate.url + '/__gate/status', { headers: { cookie: cookieOf(again) } })).status, 200)
})
