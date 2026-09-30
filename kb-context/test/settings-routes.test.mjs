// settings-routes 单测（kb-context 设置面数据面，官方路由形，沿 wiki-steward 同款）：
// 单 prefix /api/kb-context + 内部分发 GET/POST settings；成功 {data}，失败 {error:{code,message}}，
// 每条 handler 第一行过 connection.requestRejection 鉴权缝。
// 零 mock：假 host 缝最小形（register/connection），业务面真跑 settings-write（真 zod Config）。
import test from 'node:test'
import assert from 'node:assert/strict'

const { registerSettingsRoutes, API_PREFIX } = await import('../lib/settings-routes.js')
const { createTriggerLog, ENTRY_KEYS } = await import('../lib/trigger-log.js')
const { createApplyPatch } = await import('../lib/settings-write.js')
const { Config } = await import('../lib/index.js')

function mkHost({ rejection } = {}) {
  const routes = []
  const register = (spec) => { routes.push(spec); return () => {} }
  const connection = { requestRejection: typeof rejection === 'function' ? rejection : () => undefined }
  return { routes, register, connection }
}

function mkRes() {
  return {
    status: 0,
    headers: {},
    body: undefined,
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers ?? {}) },
    setHeader(k, v) { this.headers[k] = v },
    end(body) { if (body !== undefined) this.body = body },
    json() { return this.body === undefined ? null : JSON.parse(this.body) },
  }
}

function mkReq({ method = 'GET', url = '/', body } = {}) {
  const payload = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  return {
    method,
    url,
    headers: payload === undefined ? {} : { 'content-type': 'application/json' },
    on() {},
    async *[Symbol.asyncIterator]() {
      if (payload !== undefined) yield Buffer.from(payload)
    },
  }
}

function mkSetup(opts = {}) {
  const host = mkHost(opts)
  const disposers = registerSettingsRoutes({
    register: host.register,
    connection: host.connection,
    ...(opts.triggerLog ? { triggerLog: opts.triggerLog } : {}),
    getConfig: () => ({ triggers: { words: ['OA'], entityPaths: [] }, budget: { maxSnippets: 3, maxTokens: 2000 }, timeoutMs: 1500, scope: { indexAll: ['wiki'], grepOnDemand: [] }, hotMap: { enabled: false, maxChars: 600 }, vaultRoot: '/mnt/unraid_data/Obsidian' }),
    ...(opts.applyPatch ? { applyPatch: opts.applyPatch } : {}),
    ...(opts.getApplyPatch ? { getApplyPatch: opts.getApplyPatch } : {}),
    warn: () => {},
  })
  return { host, disposers }
}

const call = async (host, { method = 'GET', url, body } = {}) => {
  const res = mkRes()
  await host.routes[0].handler(mkReq({ method, url, body }), res)
  return res
}

test('注册面：单 prefix /api/kb-context（官方路由形）；未知路径 404 not_found', async () => {
  const { host, disposers } = mkSetup()
  assert.deepEqual(host.routes.map((r) => [r.kind, r.path]), [['prefix', API_PREFIX]])
  assert.equal(disposers.length, 1)
  const res = await call(host, { url: '/api/kb-context/nope' })
  assert.equal(res.status, 404)
  assert.equal(res.json().error.code, 'not_found')
})

test('鉴权缝：requestRejection 回拒 → 401/403 {error:{code}}，业务面绝不执行', async () => {
  const { host } = mkSetup({ rejection: () => 401 })
  for (const method of ['GET', 'POST']) {
    const res = await call(host, { method, url: '/api/kb-context/settings', body: method === 'POST' ? { patch: { timeoutMs: 1 } } : undefined })
    assert.equal(res.status, 401, method)
    assert.equal(res.json().error.code, 'unauthorized')
  }
  const { host: h2 } = mkSetup({ rejection: () => 403 })
  const res2 = await call(h2, { url: '/api/kb-context/settings' })
  assert.equal(res2.status, 403)
  assert.equal(res2.json().error.code, 'forbidden')
})

test('GET settings：Config 面 + 可改白名单 7 叶子 + writable 缺缝如实（false）', async () => {
  const { host } = mkSetup()
  const res = await call(host, { url: '/api/kb-context/settings' })
  assert.equal(res.status, 200)
  const data = res.json().data
  assert.equal(data.config.timeoutMs, 1500)
  assert.deepEqual(data.editable.map((p) => p.join('.')), [
    'triggers.words',
    'triggers.entityPaths',
    'budget.maxSnippets',
    'budget.maxTokens',
    'timeoutMs',
    'scope.indexAll',
    'scope.grepOnDemand',
    'triggerLog.enabled',
  ])
  assert.equal(data.writable, false)
})

test('POST settings：缺写缝 = 503 write_unavailable（如实不装可写）', async () => {
  const { host } = mkSetup()
  const res = await call(host, { method: 'POST', url: '/api/kb-context/settings', body: { patch: { timeoutMs: 800 } } })
  assert.equal(res.status, 503)
  assert.equal(res.json().error.code, 'write_unavailable')
})

test('POST settings：真写缝（createApplyPatch+configEditor 最小缝）→ 200 落最小写入形', async () => {
  const editCalls = []
  const applyPatch = createApplyPatch({
    configEditor: {
      entries: () => [{ options: { id: 'kb-context' } }],
      edit: async (entry, change) => { editCalls.push(change({ triggers: { words: ['OA'] } }, {})) },
    },
    entryId: 'kb-context',
    Config,
  })
  const { host } = mkSetup({ applyPatch })
  const res = await call(host, { method: 'POST', url: '/api/kb-context/settings', body: { patch: { timeoutMs: 800, triggers: { words: ['OA', '用友'] } } } })
  assert.equal(res.status, 200)
  assert.equal(res.json().data.ok, true)
  assert.deepEqual(editCalls, [{ triggers: { words: ['OA', '用友'] }, timeoutMs: 800 }])
})

test('POST settings：白名单外（hotMap.enabled / vaultRoot）→ 400 not_editable，持久化缝绝不触达', async () => {
  let called = 0
  const applyPatch = createApplyPatch({
    configEditor: {
      entries: () => [{ options: { id: 'kb-context' } }],
      edit: async () => { called += 1 },
    },
    entryId: 'kb-context',
    Config,
  })
  const { host } = mkSetup({ applyPatch })
  for (const patch of [{ hotMap: { enabled: true } }, { vaultRoot: '/tmp/x' }]) {
    const res = await call(host, { method: 'POST', url: '/api/kb-context/settings', body: { patch } })
    assert.equal(res.status, 400, JSON.stringify(patch))
    assert.equal(res.json().error.code, 'not_editable')
  }
  assert.equal(called, 0)
})

test('POST settings：类型非法 → 400 invalid（真 zod 判据原文）；畸形请求体 → 400 bad_request', async () => {
  const applyPatch = createApplyPatch({
    configEditor: {
      entries: () => [{ options: { id: 'kb-context' } }],
      edit: async (entry, change) => change({}, {}),
    },
    entryId: 'kb-context',
    Config,
  })
  const { host } = mkSetup({ applyPatch })
  const res = await call(host, { method: 'POST', url: '/api/kb-context/settings', body: { patch: { timeoutMs: '800' } } })
  assert.equal(res.status, 400)
  assert.equal(res.json().error.code, 'invalid')
  assert.match(res.json().error.message, /配置校验失败/)

  const res2 = await call(host, { method: 'POST', url: '/api/kb-context/settings', body: '{bad json' })
  assert.equal(res2.status, 400)
  assert.equal(res2.json().error.code, 'bad_request')
})

test('method guard：GET settings 不收 PUT（405 + allow 头）', async () => {
  const { host } = mkSetup()
  const res = await call(host, { method: 'PUT', url: '/api/kb-context/settings' })
  assert.equal(res.status, 405)
  assert.equal(res.json().error.code, 'method_not_allowed')
  assert.equal(res.headers.allow, 'GET, POST')
})

test('getApplyPatch 惰性写缝（B1 时序窗口回归锁）：缺位 → GET writable:false + POST 503；后到 → 同 handler 转可写 200', async () => {
  // configEditor 后到可见：per-request 求值，不做 apply 时单次快照（T8-D1 §2-d/§2-e）
  let editor = null
  const { host } = mkSetup({
    getApplyPatch: () => (editor === null ? null : createApplyPatch({ configEditor: editor, entryId: 'kb-context', Config })),
  })
  // 缺位：展示面照常 + writable:false 如实；写端点 503 write_unavailable（不许 500/404）
  let res = await call(host, { url: '/api/kb-context/settings' })
  assert.equal(res.status, 200)
  assert.equal(res.json().data.writable, false)
  res = await call(host, { method: 'POST', url: '/api/kb-context/settings', body: { patch: { timeoutMs: 800 } } })
  assert.equal(res.status, 503)
  assert.equal(res.json().error.code, 'write_unavailable')
  // 后到：同一 handler（不重注册）立即可见
  const editCalls = []
  editor = {
    entries: () => [{ options: { id: 'kb-context' } }],
    edit: async (entry, change) => { editCalls.push(change({ triggers: { words: [] } }, {})) },
  }
  res = await call(host, { url: '/api/kb-context/settings' })
  assert.equal(res.status, 200)
  assert.equal(res.json().data.writable, true)
  res = await call(host, { method: 'POST', url: '/api/kb-context/settings', body: { patch: { timeoutMs: 800 } } })
  assert.equal(res.status, 200)
  assert.equal(res.json().data.ok, true)
  assert.deepEqual(editCalls, [{ triggers: { words: [] }, timeoutMs: 800 }])
})

test('getApplyPatch 解析器抛错 → 按缺位收敛（503 write_unavailable，绝不抛穿）', async () => {
  const { host } = mkSetup({ getApplyPatch: () => { throw new Error('proxy: cannot get property "configEditor" without inject') } })
  const res = await call(host, { method: 'POST', url: '/api/kb-context/settings', body: { patch: { timeoutMs: 800 } } })
  assert.equal(res.status, 503)
  assert.equal(res.json().error.code, 'write_unavailable')
})

// ===== 0.4.0 触发日志双端点（A-TL1/A-TL4：GET logs + POST logs/clear；TECH 实现面 3）=====

function mkLogRing(n = 0) {
  const log = createTriggerLog({})
  for (let i = 1; i <= n; i++) {
    log.record({ ts: 1000 + i, hit: i % 2 === 0, channel: i % 2 === 0 ? 'words' : 'none', matched: i % 2 === 0 ? ['OA'] : [], snippets: i, tokenEst: i * 10, elapsedMs: i * 5, reason: i % 2 === 0 ? 'hit' : 'no-trigger-match' })
  }
  return log
}

test('GET /api/kb-context/logs：200 {entries,capacity,enabled}（entries 时间倒序，最新在前；键集==闭集白名单）', async () => {
  const log = mkLogRing(3)
  const { host } = mkSetup({ triggerLog: log })
  const res = await call(host, { url: '/api/kb-context/logs' })
  assert.equal(res.status, 200)
  const body = res.json()
  assert.deepEqual(Object.keys(body).sort(), ['capacity', 'enabled', 'entries'], '成功形=TECH 实现面 3 字面 {entries,capacity,enabled}')
  assert.equal(body.capacity, 200)
  assert.equal(body.enabled, true)
  assert.equal(body.entries.length, 3)
  assert.deepEqual(body.entries.map((e) => e.ts), [1003, 1002, 1001], '时间倒序（最新在前）')
  for (const e of body.entries) {
    assert.deepEqual(Object.keys(e).sort(), [...ENTRY_KEYS].sort(), 'INV-TL1 机械断言：entry 键集==白名单 8 键')
  }
  assert.deepEqual(body.entries[1].matched, ['OA'], '命中词/路径面透传（配置词表成员，偶数条=hit）')
  assert.deepEqual(body.entries[0].matched, [], '未命中条 matched 空（零原文）')
})

test('POST /api/kb-context/logs/clear：200 {cleared:n}（n=清空前条数）；清后 GET entries 空', async () => {
  const log = mkLogRing(2)
  const { host } = mkSetup({ triggerLog: log })
  const res = await call(host, { method: 'POST', url: '/api/kb-context/logs/clear' })
  assert.equal(res.status, 200)
  assert.deepEqual(Object.keys(res.json()), ['cleared'], '成功形=TECH 实现面 3 字面 {cleared:n}')
  assert.equal(res.json().cleared, 2, 'cleared=清空前条数（A-TL4）')
  const after = await call(host, { url: '/api/kb-context/logs' })
  assert.equal(after.status, 200)
  assert.deepEqual(after.json().entries, [], '清后零条目')
  const again = await call(host, { method: 'POST', url: '/api/kb-context/logs/clear' })
  assert.equal(again.json().cleared, 0, '空环再清=0（如实不虚报）')
})

test('logs 双端点：鉴权缝回拒=401/403 {error:{code}}（沿既有包络）；方法守卫=405+allow；缺数据源=503 logs_unavailable', async () => {
  // 鉴权缝
  const { host: hAuth } = mkSetup({ triggerLog: mkLogRing(1), rejection: () => 401 })
  for (const [method, url] of [['GET', '/api/kb-context/logs'], ['POST', '/api/kb-context/logs/clear']]) {
    const res = await call(hAuth, { method, url })
    assert.equal(res.status, 401, url)
    assert.deepEqual(Object.keys(res.json()).sort(), ['error'], '错误形沿既有包络 {error:{code,message}}')
    assert.equal(res.json().error.code, 'unauthorized')
  }
  // 方法守卫（错误形同包络 + allow 头）
  const { host: hM } = mkSetup({ triggerLog: mkLogRing(1) })
  const postLogs = await call(hM, { method: 'POST', url: '/api/kb-context/logs', body: {} })
  assert.equal(postLogs.status, 405)
  assert.equal(postLogs.json().error.code, 'method_not_allowed')
  assert.equal(postLogs.headers.allow, 'GET')
  const getClear = await call(hM, { method: 'GET', url: '/api/kb-context/logs/clear' })
  assert.equal(getClear.status, 405)
  assert.equal(getClear.headers.allow, 'POST')
  // 缺数据源（registerSettingsRoutes 未传 triggerLog）=503 如实，不装有日志
  const { host: hNone } = mkSetup()
  for (const [method, url] of [['GET', '/api/kb-context/logs'], ['POST', '/api/kb-context/logs/clear']]) {
    const res = await call(hNone, { method, url })
    assert.equal(res.status, 503, url)
    assert.equal(res.json().error.code, 'logs_unavailable')
  }
})

test('logs 端点：环 enabled 现读透传（kill switch 热关后 GET enabled:false，旧条目保留）；未知路径仍 404', async () => {
  let on = true
  const log = createTriggerLog({ isEnabled: () => on })
  log.record({ ts: 1, hit: true, channel: 'words', matched: ['OA'], snippets: 1, tokenEst: 1, elapsedMs: 1, reason: 'hit' })
  const { host } = mkSetup({ triggerLog: log })
  on = false
  const res = await call(host, { url: '/api/kb-context/logs' })
  assert.equal(res.json().enabled, false, 'enabled 现读（A-TL5 热关可见）')
  assert.equal(res.json().entries.length, 1, '热关不清旧条目（record no-op 语义）')
  const res2 = await call(host, { url: '/api/kb-context/nope' })
  assert.equal(res2.status, 404)
  assert.equal(res2.json().error.code, 'not_found')
})
