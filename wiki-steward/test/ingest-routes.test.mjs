// ingest-routes 接线单测（设置页签数据面 REST + web/dist 静态）：
// GET /wiki-steward/api/ingest/{logs,settings} + POST /wiki-steward/api/ingest/{scan,distill} +
// prefix /wiki-steward 静态（web/dist 构建物）。形对齐 obsidian-web 惯例：
// 成功 {data}，失败 {error:{code,message}}，每条 handler 第一行过 connection.requestRejection 鉴权缝。
// 零 mock：假 host 缝只承接 webServer.register/connection.requestRejection 的最小形（wire.test 同款姿势），
// 业务面真调真文件系统（mkdtemp）+ 注入式触发缝。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { registerIngestRoutes } = await import('../lib/ingest-routes.js')
const { defaultLogSources } = await import('../lib/ingest-log.js')

function mkTmp(t, prefix = 'wiki-steward-ingest-routes-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** 假 host 缝：register 只记账（宿主缝最小形）；connection.requestRejection 缺省放行 */
function mkHost({ rejection } = {}) {
  const routes = []
  const register = (spec) => {
    routes.push(spec)
    return () => {}
  }
  const connection = {
    requestRejection: typeof rejection === 'function' ? rejection : () => undefined,
  }
  return { routes, register, connection }
}

function mkRes() {
  return {
    status: 0,
    headers: {},
    body: undefined,
    ended: false,
    writeHead(status, headers) {
      this.status = status
      Object.assign(this.headers, headers ?? {})
    },
    setHeader(k, v) { this.headers[k] = v },
    end(body) {
      this.ended = true
      if (body !== undefined) this.body = body
    },
    json() { return this.body === undefined ? null : JSON.parse(this.body) },
  }
}

function mkReq({ method = 'GET', url = '/' } = {}) {
  return { method, url, headers: { host: '127.0.0.1:3080' }, on() {} }
}

function findRoute(routes, p) {
  const r = routes.find((x) => x.path === p)
  assert.ok(r, `路由缺失：${p}`)
  return r
}

function mkSetup(t, opts = {}) {
  const home = mkTmp(t)
  const distDir = mkTmp(t, 'wiki-steward-dist-')
  const trigCalls = { scan: 0, distill: 0 }
  const trigger = {
    scan: async () => {
      trigCalls.scan += 1
      return { ok: true, exitCode: 0, summary: { total: 1, skipped: 0, pending: 1, pendingFiles: [] }, output: 'o', logFile: '/l/scan.log', argv: ['x'] }
    },
    distill: async () => {
      trigCalls.distill += 1
      return { started: true, reason: 'started', note: '蒸馏由任务执行', logFile: '/l/d.log', argv: ['y'] }
    },
    distillStatus: async () => ({ running: false, channelAvailable: true, logFile: '/l/d.log', lockFile: '/l/d.lock' }),
  }
  const host = mkHost(opts)
  const disposers = registerIngestRoutes({
    register: host.register,
    connection: host.connection,
    getConfig: () => ({ vaultRoot: '/mnt/unraid_data/Obsidian', capture: { bufferRounds: 3, enabled: true }, write: { readOnly: true }, queue: { maxRetries: 3, ttlDays: 7 }, secrets: { enabled: true } }),
    trigger,
    sources: defaultLogSources({ home }),
    distDir,
    warn: () => {},
  })
  return { home, distDir, host, trigCalls, disposers, trigger }
}

// ── 鉴权缝（每条 handler 第一行）────────────────────────────────────────────
test('鉴权缝：requestRejection 回拒 → 401/403 {error:{code}}，业务面绝不执行', async (t) => {
  const { host, trigCalls } = mkSetup(t, { rejection: () => 401 })
  for (const [method, p] of [['GET', '/wiki-steward/api/ingest/logs'], ['GET', '/wiki-steward/api/ingest/settings'], ['POST', '/wiki-steward/api/ingest/scan'], ['POST', '/wiki-steward/api/ingest/distill']]) {
    const res = mkRes()
    await findRoute(host.routes, p).handler(mkReq({ method, url: p }), res)
    assert.equal(res.status, 401)
    assert.equal(res.json().error.code, 'unauthorized')
  }
  assert.equal(trigCalls.scan + trigCalls.distill, 0, '回拒后触发缝零调用')
})

test('鉴权缝：403 形（forbidden）', async (t) => {
  const { host } = mkSetup(t, { rejection: () => 403 })
  const res = mkRes()
  await findRoute(host.routes, '/wiki-steward/api/ingest/settings').handler(mkReq({ url: '/wiki-steward/api/ingest/settings' }), res)
  assert.equal(res.status, 403)
  assert.equal(res.json().error.code, 'forbidden')
})

// ── GET logs：尾部 N 行 + 滚动加载 + 来源标注 ────────────────────────────────
test('GET logs：真日志文件 → {data:{lines,hasMore,cursor,sources}} 逐行带来源标注', async (t) => {
  const { host, home } = mkSetup(t)
  const log = path.join(home, '.dsh/logs/cron/wiki-ingest-20260928.log')
  fs.mkdirSync(path.dirname(log), { recursive: true })
  fs.writeFileSync(log, 'a1\na2\na3\n')

  const res = mkRes()
  await findRoute(host.routes, '/wiki-steward/api/ingest/logs').handler(mkReq({ url: '/wiki-steward/api/ingest/logs?limit=2' }), res)
  assert.equal(res.status, 200)
  const data = res.json().data
  assert.deepEqual(data.lines.map((l) => l.text), ['a2', 'a3'])
  assert.equal(data.hasMore, true)
  assert.ok(data.cursor)
  for (const l of data.lines) assert.ok(l.label && l.source, '每行带来源')
  assert.ok(Array.isArray(data.sources) && data.sources.length >= 3)

  const res2 = mkRes()
  await findRoute(host.routes, '/wiki-steward/api/ingest/logs').handler(mkReq({ url: `/wiki-steward/api/ingest/logs?limit=2&cursor=${encodeURIComponent(data.cursor)}` }), res2)
  assert.deepEqual(res2.json().data.lines.map((l) => l.text), ['a1'])
  assert.equal(res2.json().data.hasMore, false)
})

test('GET logs：坏游标 = stale 空页（不抛 500 不编造）', async (t) => {
  const { host } = mkSetup(t)
  const res = mkRes()
  await findRoute(host.routes, '/wiki-steward/api/ingest/logs').handler(mkReq({ url: '/wiki-steward/api/ingest/logs?cursor=%7Bbad' }), res)
  assert.equal(res.status, 200)
  assert.equal(res.json().data.stale, true)
  assert.deepEqual(res.json().data.lines, [])
})

test('GET logs：limit 越界收口（负/NaN/超上限归一，不炸）', async (t) => {
  const { host, home } = mkSetup(t)
  const log = path.join(home, '.dsh/logs/cron/wiki-ingest-20260928.log')
  fs.mkdirSync(path.dirname(log), { recursive: true })
  fs.writeFileSync(log, 'a\nb\n')
  for (const q of ['limit=-5', 'limit=abc', 'limit=999999']) {
    const res = mkRes()
    await findRoute(host.routes, '/wiki-steward/api/ingest/logs').handler(mkReq({ url: `/wiki-steward/api/ingest/logs?${q}` }), res)
    assert.equal(res.status, 200, q)
    assert.ok(Array.isArray(res.json().data.lines), q)
  }
})

test('GET logs：POST 打到 logs = 405 method guard', async (t) => {
  const { host } = mkSetup(t)
  const res = mkRes()
  await findRoute(host.routes, '/wiki-steward/api/ingest/logs').handler(mkReq({ method: 'POST', url: '/wiki-steward/api/ingest/logs' }), res)
  assert.equal(res.status, 405)
  assert.equal(res.json().error.code, 'method_not_allowed')
})

// ── GET settings / POST scan / POST distill ─────────────────────────────────
test('GET settings：Config 面 + vaultRoot/write.readOnly + 通道状态（只读展示）', async (t) => {
  const { host } = mkSetup(t)
  const res = mkRes()
  await findRoute(host.routes, '/wiki-steward/api/ingest/settings').handler(mkReq({ url: '/wiki-steward/api/ingest/settings' }), res)
  assert.equal(res.status, 200)
  const data = res.json().data
  assert.equal(data.config.vaultRoot, '/mnt/unraid_data/Obsidian')
  assert.equal(data.config.write.readOnly, true)
  assert.equal(data.readOnly, true)
  assert.equal(data.channel.available, true)
  assert.ok(Array.isArray(data.sources))
})

test('POST scan：触发缝真被调用 → {data:{ok,summary,logFile}}', async (t) => {
  const { host, trigCalls } = mkSetup(t)
  const res = mkRes()
  await findRoute(host.routes, '/wiki-steward/api/ingest/scan').handler(mkReq({ method: 'POST', url: '/wiki-steward/api/ingest/scan' }), res)
  assert.equal(res.status, 200)
  assert.equal(trigCalls.scan, 1)
  const data = res.json().data
  assert.equal(data.ok, true)
  assert.equal(data.summary.pending, 1)
  assert.equal(data.logFile, '/l/scan.log')
})

test('POST distill：触发缝真被调用 → {data:{started,note}}（蒸馏由任务执行）', async (t) => {
  const { host, trigCalls } = mkSetup(t)
  const res = mkRes()
  await findRoute(host.routes, '/wiki-steward/api/ingest/distill').handler(mkReq({ method: 'POST', url: '/wiki-steward/api/ingest/distill' }), res)
  assert.equal(res.status, 200)
  assert.equal(trigCalls.distill, 1)
  const data = res.json().data
  assert.equal(data.started, true)
  assert.match(data.note, /蒸馏由任务执行/)
})

test('POST scan：触发缝抛错 → 500 {error:{code:internal}} 留痕不吞', async (t) => {
  const home = mkTmp(t)
  const distDir = mkTmp(t, 'wiki-steward-dist-')
  const host = mkHost()
  registerIngestRoutes({
    register: host.register,
    connection: host.connection,
    getConfig: () => ({ vaultRoot: '/v', capture: {}, write: { readOnly: true }, queue: {}, secrets: {} }),
    trigger: {
      scan: async () => { throw new Error('spawn boom') },
      distill: async () => ({ started: false }),
      distillStatus: async () => ({ running: false, channelAvailable: false }),
    },
    sources: defaultLogSources({ home }),
    distDir,
    warn: () => {},
  })
  const res = mkRes()
  await findRoute(host.routes, '/wiki-steward/api/ingest/scan').handler(mkReq({ method: 'POST', url: '/wiki-steward/api/ingest/scan' }), res)
  assert.equal(res.status, 500)
  assert.equal(res.json().error.code, 'internal')
  assert.match(res.json().error.message, /spawn boom/)
})

// ── 静态面（web/dist 构建物）+ 穿越围栏 ─────────────────────────────────────
test('静态面：/wiki-steward/panel.js 命中 dist 文件（MIME 正确）；穿越/越界绝不 200', async (t) => {
  const { host, distDir } = mkSetup(t)
  fs.writeFileSync(path.join(distDir, 'panel.js'), 'export const mount = () => {}\n')
  const stat = findRoute(host.routes, '/wiki-steward')
  assert.equal(stat.kind, 'prefix')

  const ok = mkRes()
  await stat.handler(mkReq({ url: '/wiki-steward/panel.js' }), ok)
  assert.equal(ok.status, 200)
  assert.match(ok.headers['content-type'], /javascript/)
  assert.ok(ok.body.includes('mount'))

  for (const url of ['/wiki-steward/../package.json', '/wiki-steward/..%2fpackage.json', '/wiki-steward/../../etc/passwd', '/wiki-steward/nope.js']) {
    const res = mkRes()
    await stat.handler(mkReq({ url }), res)
    assert.notEqual(res.status, 200, `穿越/缺文件绝不 200：${url}`)
  }
})
