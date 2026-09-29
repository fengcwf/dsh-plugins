// ingest-routes 接线单测（数据面官方路由形，裁定 3）：
// 单 prefix /api/wiki-steward + 内部分发：
// GET /api/wiki-steward/settings（设置面展示）+ POST /api/wiki-steward/settings（设置面写入）+
// GET /api/wiki-steward/ingest/{logs,settings} + POST /api/wiki-steward/ingest/{scan,distill} +
// 其余=web/dist 静态（panel.js/style.css）。成功 {data}，失败 {error:{code,message}}，
// 每条 handler 第一行过 connection.requestRejection 鉴权缝。
// 含 panel.js 面 404→200 回归（旧站内绝对 /wiki-steward/panel.js 无人服务=生产 404 根因）。
// 零 mock：假 host 缝只承接 webServer.register/connection.requestRejection 的最小形（wire.test 同款姿势），
// 业务面真调真文件系统（mkdtemp + 真 web/dist 构建物）+ 注入式触发缝。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { registerIngestRoutes, API_PREFIX } = await import('../lib/ingest-routes.js')
const { defaultLogSources } = await import('../lib/ingest-log.js')
const { createApplyPatch } = await import('../lib/settings-write.js')
const { Config } = await import('../lib/index.js')

const REAL_DIST = fileURLToPath(new URL('../web/dist', import.meta.url))

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

function mkReq({ method = 'GET', url = '/', body } = {}) {
  const payload = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  return {
    method,
    url,
    headers: { host: '127.0.0.1:3080', ...(payload !== undefined ? { 'content-type': 'application/json' } : {}) },
    on() {},
    async *[Symbol.asyncIterator]() {
      if (payload !== undefined) yield Buffer.from(payload)
    },
  }
}

function apiRoute(host) {
  const r = host.routes.find((x) => x.path === API_PREFIX)
  assert.ok(r, `路由缺失：${API_PREFIX}`)
  assert.equal(r.kind, 'prefix', '官方路由形=单 prefix 注册')
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
    ...(opts.applyPatch ? { applyPatch: opts.applyPatch } : {}),
    warn: () => {},
  })
  return { home, distDir, host, trigCalls, disposers, trigger }
}

const call = async (host, { method = 'GET', url, body } = {}) => {
  const res = mkRes()
  await apiRoute(host).handler(mkReq({ method, url, body }), res)
  return res
}

// ── 鉴权缝（每条 handler 第一行）────────────────────────────────────────────
test('鉴权缝：requestRejection 回拒 → 401/403 {error:{code}}，业务面绝不执行', async (t) => {
  const { host, trigCalls } = mkSetup(t, { rejection: () => 401 })
  for (const [method, p] of [['GET', '/api/wiki-steward/ingest/logs'], ['GET', '/api/wiki-steward/ingest/settings'], ['GET', '/api/wiki-steward/settings'], ['POST', '/api/wiki-steward/settings'], ['POST', '/api/wiki-steward/ingest/scan'], ['POST', '/api/wiki-steward/ingest/distill']]) {
    const res = await call(host, { method, url: p })
    assert.equal(res.status, 401, p)
    assert.equal(res.json().error.code, 'unauthorized', p)
  }
  assert.equal(trigCalls.scan + trigCalls.distill, 0, '回拒后触发缝零调用')
})

test('鉴权缝：403 形（forbidden）', async (t) => {
  const { host } = mkSetup(t, { rejection: () => 403 })
  const res = await call(host, { url: '/api/wiki-steward/ingest/settings' })
  assert.equal(res.status, 403)
  assert.equal(res.json().error.code, 'forbidden')
})

// ── GET logs：尾部 N 行 + 滚动加载 + 来源标注 ────────────────────────────────
test('GET logs：真日志文件 → {data:{lines,hasMore,cursor,sources}} 逐行带来源标注', async (t) => {
  const { host, home } = mkSetup(t)
  const log = path.join(home, '.dsh/logs/cron/wiki-ingest-20260928.log')
  fs.mkdirSync(path.dirname(log), { recursive: true })
  fs.writeFileSync(log, 'a1\na2\na3\n')

  const res = await call(host, { url: '/api/wiki-steward/ingest/logs?limit=2' })
  assert.equal(res.status, 200)
  const data = res.json().data
  assert.deepEqual(data.lines.map((l) => l.text), ['a2', 'a3'])
  assert.equal(data.hasMore, true)
  assert.ok(data.cursor)
  for (const l of data.lines) assert.ok(l.label && l.source, '每行带来源')
  assert.ok(Array.isArray(data.sources) && data.sources.length >= 3)

  const res2 = await call(host, { url: `/api/wiki-steward/ingest/logs?limit=2&cursor=${encodeURIComponent(data.cursor)}` })
  assert.deepEqual(res2.json().data.lines.map((l) => l.text), ['a1'])
  assert.equal(res2.json().data.hasMore, false)
})

test('GET logs：坏游标 = stale 空页（不抛 500 不编造）', async (t) => {
  const { host } = mkSetup(t)
  const res = await call(host, { url: '/api/wiki-steward/ingest/logs?cursor=%7Bbad' })
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
    const res = await call(host, { url: `/api/wiki-steward/ingest/logs?${q}` })
    assert.equal(res.status, 200, q)
    assert.ok(Array.isArray(res.json().data.lines), q)
  }
})

test('GET logs：POST 打到 logs = 405 method guard', async (t) => {
  const { host } = mkSetup(t)
  const res = await call(host, { method: 'POST', url: '/api/wiki-steward/ingest/logs' })
  assert.equal(res.status, 405)
  assert.equal(res.json().error.code, 'method_not_allowed')
})

// ── GET settings / POST scan / POST distill ─────────────────────────────────
test('GET ingest/settings：Config 面 + vaultRoot/write.readOnly + 通道状态（只读展示）', async (t) => {
  const { host } = mkSetup(t)
  const res = await call(host, { url: '/api/wiki-steward/ingest/settings' })
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
  const res = await call(host, { method: 'POST', url: '/api/wiki-steward/ingest/scan' })
  assert.equal(res.status, 200)
  assert.equal(trigCalls.scan, 1)
  const data = res.json().data
  assert.equal(data.ok, true)
  assert.equal(data.summary.pending, 1)
  assert.equal(data.logFile, '/l/scan.log')
})

test('POST distill：触发缝真被调用 → {data:{started,note}}（蒸馏由任务执行）', async (t) => {
  const { host, trigCalls } = mkSetup(t)
  const res = await call(host, { method: 'POST', url: '/api/wiki-steward/ingest/distill' })
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
  const res = await call(host, { method: 'POST', url: '/api/wiki-steward/ingest/scan' })
  assert.equal(res.status, 500)
  assert.equal(res.json().error.code, 'internal')
  assert.match(res.json().error.message, /spawn boom/)
})

// ── 设置面（settings 命名空间数据面）：展示 + 写入 ────────────────────────────
test('GET settings：Config 面 + 可改白名单 + writable 缺缝如实（false）', async (t) => {
  const { host } = mkSetup(t)
  const res = await call(host, { url: '/api/wiki-steward/settings' })
  assert.equal(res.status, 200)
  const data = res.json().data
  assert.equal(data.config.vaultRoot, '/mnt/unraid_data/Obsidian')
  // 断言修订理由（Task F3，验收③）：可改白名单随「settings-write 白名单扩项」由 5 叶子扩 7 叶子
  //（+ingest.schedule.enabled / ingest.schedule.time）——扩展非弱化，响应契约形（data 四键）不变。
  assert.deepEqual(data.editable.map((p) => p.join('.')), ['capture.enabled', 'capture.bufferRounds', 'queue.maxRetries', 'queue.ttlDays', 'secrets.enabled', 'ingest.schedule.enabled', 'ingest.schedule.time'])
  assert.equal(data.writable, false, '缺 configEditor 缝=writable:false 如实')
})

test('POST settings：缺写缝 = 503 write_unavailable（如实不装可写）', async (t) => {
  const { host } = mkSetup(t)
  const res = await call(host, { method: 'POST', url: '/api/wiki-steward/settings', body: { patch: { capture: { enabled: false } } } })
  assert.equal(res.status, 503)
  assert.equal(res.json().error.code, 'write_unavailable')
})

test('POST settings：真写缝（createApplyPatch+configEditor 最小缝）→ 200 落最小写入形', async (t) => {
  const editCalls = []
  const applyPatch = createApplyPatch({
    configEditor: {
      entries: () => [{ options: { id: 'wiki-steward' } }],
      edit: async (entry, change) => { editCalls.push(change({ capture: { bufferRounds: 5 } }, {})) },
    },
    entryId: 'wiki-steward',
    Config,
  })
  const { host } = mkSetup(t, { applyPatch })
  const res = await call(host, { method: 'POST', url: '/api/wiki-steward/settings', body: { patch: { capture: { enabled: false } } } })
  assert.equal(res.status, 200)
  assert.equal(res.json().data.ok, true)
  assert.deepEqual(editCalls, [{ capture: { bufferRounds: 5, enabled: false } }])
  assert.deepEqual(res.json().data.config, { capture: { bufferRounds: 5, enabled: false } })
})

test('POST settings：ingest.schedule 补丁走白名单→持久化缝（F3 定时控制写入通路）', async (t) => {
  const editCalls = []
  const applyPatch = createApplyPatch({
    configEditor: {
      entries: () => [{ options: { id: 'wiki-steward' } }],
      edit: async (entry, change) => { editCalls.push(change({ ingest: { schedule: { enabled: false, time: '00:25' } } }, {})) },
    },
    entryId: 'wiki-steward',
    Config,
  })
  const { host } = mkSetup(t, { applyPatch })
  const res = await call(host, { method: 'POST', url: '/api/wiki-steward/settings', body: { patch: { ingest: { schedule: { enabled: true, time: '23:30' } } } } })
  assert.equal(res.status, 200)
  assert.equal(res.json().data.ok, true)
  assert.deepEqual(editCalls, [{ ingest: { schedule: { enabled: true, time: '23:30' } } }], '白名单两叶子真落写入形')
  assert.deepEqual(res.json().data.config, { ingest: { schedule: { enabled: true, time: '23:30' } } })
})

test('POST settings：ingest.schedule 非法时间 → 400 invalid（真 zod 判据原文，持久化不完成）', async (t) => {
  // 缝语义（既有架构，POST settings 类型非法测试同款）：真 zod 校验在 edit 内对合并生效面收口，
  // 校验失败=change 抛错 → edit 中止不落盘（持久化绝不完成）。
  let persisted = false
  const applyPatch = createApplyPatch({
    configEditor: {
      entries: () => [{ options: { id: 'wiki-steward' } }],
      edit: async (entry, change) => {
        const next = change({}, {})
        persisted = true // change 不抛才走到这=落盘（校验失败必到不了）
        return next
      },
    },
    entryId: 'wiki-steward',
    Config,
  })
  const { host } = mkSetup(t, { applyPatch })
  const res = await call(host, { method: 'POST', url: '/api/wiki-steward/settings', body: { patch: { ingest: { schedule: { time: '25:00' } } } } })
  assert.equal(res.status, 400)
  assert.equal(res.json().error.code, 'invalid')
  assert.match(res.json().error.message, /配置校验失败/)
  assert.equal(persisted, false, '校验失败持久化不完成（edit 中止）')
})

test('POST settings：白名单外（write.readOnly）→ 400 not_editable，持久化缝绝不触达', async (t) => {
  let called = 0
  const applyPatch = createApplyPatch({
    configEditor: {
      entries: () => [{ options: { id: 'wiki-steward' } }],
      edit: async () => { called += 1 },
    },
    entryId: 'wiki-steward',
    Config,
  })
  const { host } = mkSetup(t, { applyPatch })
  const res = await call(host, { method: 'POST', url: '/api/wiki-steward/settings', body: { patch: { write: { readOnly: false } } } })
  assert.equal(res.status, 400)
  assert.equal(res.json().error.code, 'not_editable')
  assert.equal(called, 0)
})

test('POST settings：类型非法 → 400 invalid（真 zod 判据原文）', async (t) => {
  const applyPatch = createApplyPatch({
    configEditor: {
      entries: () => [{ options: { id: 'wiki-steward' } }],
      edit: async (entry, change) => change({}, {}),
    },
    entryId: 'wiki-steward',
    Config,
  })
  const { host } = mkSetup(t, { applyPatch })
  const res = await call(host, { method: 'POST', url: '/api/wiki-steward/settings', body: { patch: { capture: { bufferRounds: '3' } } } })
  assert.equal(res.status, 400)
  assert.equal(res.json().error.code, 'invalid')
  assert.match(res.json().error.message, /配置校验失败/)
})

test('POST settings：畸形请求体 → 400 bad_request（不静默当空）', async (t) => {
  const applyPatch = async () => ({ ok: true, config: {} })
  const { host } = mkSetup(t, { applyPatch })
  const res = await call(host, { method: 'POST', url: '/api/wiki-steward/settings', body: '{bad json' })
  assert.equal(res.status, 400)
  assert.equal(res.json().error.code, 'bad_request')
})

// ── 静态面（web/dist 构建物）+ panel.js 404→200 回归 + 穿越围栏 ──────────────
test('panel.js 面 404→200 回归：/api/wiki-steward/panel.js 服务真构建物（MIME 正确）', async (t) => {
  const home = mkTmp(t)
  const host = mkHost()
  registerIngestRoutes({
    register: host.register,
    connection: host.connection,
    getConfig: () => ({}),
    trigger: { scan: async () => ({}), distill: async () => ({}), distillStatus: async () => ({}) },
    sources: defaultLogSources({ home }),
    distDir: REAL_DIST, // 真 web/dist 构建物（不是临时替身）
    warn: () => {},
  })
  const res = await call(host, { url: '/api/wiki-steward/panel.js' })
  assert.equal(res.status, 200, '旧 404 面（panel.js 无人服务）现在必须 200')
  assert.match(res.headers['content-type'], /javascript/)
  const real = fs.readFileSync(path.join(REAL_DIST, 'panel.js'))
  // 字节等价用 Buffer.equals（勿对 140KB 级字符串用 assert.equal——失败路径的断言 diff 生成是 O(n²)，会挂死事件循环）
  assert.ok(Buffer.from(res.body).equals(Buffer.from(real)), '字节=真构建物')

  // 旧站内绝对路径族（生产 404 根因）不再被服务（prefix 归 /api/wiki-steward）
  const old = await call(host, { url: '/wiki-steward/panel.js' })
  assert.notEqual(old.status, 200, '旧 /wiki-steward/* 路径族已弃')
})

test('静态面：panel.js 命中 dist 文件（MIME 正确）；穿越/越界绝不 200', async (t) => {
  const { host, distDir } = mkSetup(t)
  fs.writeFileSync(path.join(distDir, 'panel.js'), 'export const mount = () => {}\n')
  const stat = apiRoute(host)

  const ok = mkRes()
  await stat.handler(mkReq({ url: '/api/wiki-steward/panel.js' }), ok)
  assert.equal(ok.status, 200)
  assert.match(ok.headers['content-type'], /javascript/)
  assert.ok(ok.body.includes('mount'))

  for (const url of ['/api/wiki-steward/../package.json', '/api/wiki-steward/..%2fpackage.json', '/api/wiki-steward/../../etc/passwd', '/api/wiki-steward/nope.js']) {
    const res = mkRes()
    await stat.handler(mkReq({ url }), res)
    assert.notEqual(res.status, 200, `穿越/缺文件绝不 200：${url}`)
  }
})
