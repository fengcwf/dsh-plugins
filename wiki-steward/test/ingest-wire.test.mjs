// ingest-wire 单测（index.js 数据面接线）：webServer/connection/configEditor 软取得（T13 timer 同款姿势，
// inject 维持 ['tools'] 不加服务）、缺缝 fail-open 留痕（INV-15）、注册单 prefix /api/wiki-steward
// （官方路由形，裁定 3）、ctx.effect 收敛、Config 热改现读（settings 响应跟 rawConfig 走）、
// 设置写缝（configEditor → createApplyPatch）接线与缺缝 503 如实。
// 零 mock：假 host 缝最小形（wire.test 同款），业务面真调真文件系统（mkdtemp）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { apply } = await import('../lib/index.js')
const { API_PREFIX } = await import('../lib/ingest-routes.js')

function mkCtx({ withWeb = true, withEffect = true, withConfigEditor = true } = {}) {
  const handlers = {}
  const warnings = []
  const registered = []
  const webRoutes = []
  const disposed = []
  const effects = []
  const ctx = {
    handlers,
    warnings,
    registered,
    webRoutes,
    disposed,
    logger: { warn: (l) => warnings.push(l) },
    tools: { register: (tool) => registered.push(tool) },
    // T13 timer 服务缝最小形（缺位另有留痕——这里恒在场，只测 web 缝面）
    get(name) {
      if (name !== 'timer') return undefined
      return { interval: () => () => {} }
    },
    on(event, fn) { handlers[event] = fn },
  }
  if (withWeb) {
    ctx.webServer = {
      register(spec) {
        webRoutes.push(spec)
        return () => disposed.push(spec.path)
      },
    }
    ctx.connection = { requestRejection: () => undefined }
  }
  if (withConfigEditor) {
    // configEditor 服务缝最小形（host @deepseek-ai/dsh-config-editor：entries/edit）
    ctx.configEditor = {
      entries: () => [{ options: { id: 'wiki-steward' } }],
      edit: async (entry, change) => { ctx.applied = change({ capture: { bufferRounds: 4 } }, {}) },
    }
  }
  if (withEffect) {
    ctx.effect = (fn) => { effects.push(fn); return () => {} }
  }
  ctx.effects = effects
  return ctx
}

function mkTmp(t, prefix = 'wiki-steward-ingest-wire-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
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
const mkReq = (method, url, body) => ({
  method,
  url,
  headers: body === undefined ? {} : { 'content-type': 'application/json' },
  on() {},
  async *[Symbol.asyncIterator]() {
    if (body !== undefined) yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  },
})

// ── 注册面 ──────────────────────────────────────────────────────────────────
test('接线：webServer 缝在场 → 注册单 prefix /api/wiki-steward（官方路由形，内部分发）', (t) => {
  const ctx = mkCtx()
  apply(ctx, { vaultRoot: mkTmp(t) })
  assert.deepEqual(ctx.webRoutes.map((r) => [r.kind, r.path]), [['prefix', API_PREFIX]])
  assert.equal(ctx.warnings.length, 0, '健康路径零留痕')
})

test('接线：webServer/connection 缺缝 = fail-open 留痕恰一 + 事件缝照常（INV-15 禁静默）', (t) => {
  const ctx = mkCtx({ withWeb: false })
  apply(ctx, { vaultRoot: mkTmp(t) })
  assert.equal(ctx.webRoutes.length, 0)
  assert.equal(ctx.warnings.length, 1)
  assert.match(ctx.warnings[0], /数据面.*未注册/)
  assert.equal(typeof ctx.handlers['session/event'], 'function', '捕获面照常（fail-open）')
})

test('接线：ctx.effect 收敛 → dispose 逐条回放（路由生命周期可关）', (t) => {
  const ctx = mkCtx()
  apply(ctx, { vaultRoot: mkTmp(t) })
  assert.equal(ctx.effects.length, 1)
  ctx.effects[0]()
  assert.equal(ctx.disposed.length, 1, 'prefix 路由 dispose 回放')
})

test('接线：缺 ctx.effect 不炸（dispose 不收敛也不留悬挂异常）', (t) => {
  const ctx = mkCtx({ withEffect: false })
  apply(ctx, { vaultRoot: mkTmp(t) })
  assert.equal(ctx.webRoutes.length, 1)
})

// ── 热改现读（settings 响应跟 rawConfig 走，与工具层 write.readOnly 同源）────────
test('热改：GET settings 现读 rawConfig（write.readOnly 翻转即时可见，不冻结启动值）', async (t) => {
  const ctx = mkCtx()
  const rawConfig = { vaultRoot: mkTmp(t), write: { readOnly: true } }
  apply(ctx, rawConfig)

  let res = mkRes()
  await ctx.webRoutes[0].handler(mkReq('GET', '/api/wiki-steward/ingest/settings'), res)
  assert.equal(res.json().data.config.write.readOnly, true)

  rawConfig.write.readOnly = false // 热改
  res = mkRes()
  await ctx.webRoutes[0].handler(mkReq('GET', '/api/wiki-steward/ingest/settings'), res)
  assert.equal(res.json().data.config.write.readOnly, false, '热改现读（非启动冻结）')
})

test('接线：POST scan/distill 走接线触发缝（注入 opts.web.trigger，真调用记账）', async (t) => {
  const ctx = mkCtx()
  const calls = []
  apply(ctx, { vaultRoot: mkTmp(t) }, {
    web: {
      trigger: {
        scan: async () => { calls.push('scan'); return { ok: true, exitCode: 0, summary: { total: 0, skipped: 0, pending: 0, pendingFiles: [] }, output: '', logFile: '/x', argv: [] } },
        distill: async () => { calls.push('distill'); return { started: true, reason: 'started', note: '蒸馏由任务执行', logFile: '/y' } },
        distillStatus: async () => ({ running: false, channelAvailable: true, logFile: '/y', lockFile: '/y.lock' }),
      },
    },
  })
  for (const [p, m] of [['/api/wiki-steward/ingest/scan', 'POST'], ['/api/wiki-steward/ingest/distill', 'POST']]) {
    const res = mkRes()
    await ctx.webRoutes[0].handler(mkReq(m, p), res)
    assert.equal(res.status, 200, p)
  }
  assert.deepEqual(calls, ['scan', 'distill'])
})

// ── 设置写缝接线（configEditor → createApplyPatch）────────────────────────────
test('接线：configEditor 缝在场 → GET writable:true + POST settings 真落盘缝被叫醒', async (t) => {
  const ctx = mkCtx()
  apply(ctx, { vaultRoot: mkTmp(t) })
  let res = mkRes()
  await ctx.webRoutes[0].handler(mkReq('GET', '/api/wiki-steward/settings'), res)
  assert.equal(res.json().data.writable, true, '写缝在场=可写')

  res = mkRes()
  await ctx.webRoutes[0].handler(mkReq('POST', '/api/wiki-steward/settings', { patch: { capture: { enabled: false } } }), res)
  assert.equal(res.status, 200)
  assert.deepEqual(ctx.applied, { capture: { bufferRounds: 4, enabled: false } }, 'configEditor.edit(change) 真被调用并落最小写入形')
})

test('接线：configEditor 缺缝 = writable:false + POST 503 如实（绝不装可写；诚实面=响应判据非额外告警）', async (t) => {
  const ctx = mkCtx({ withConfigEditor: false })
  apply(ctx, { vaultRoot: mkTmp(t) })

  let res = mkRes()
  await ctx.webRoutes[0].handler(mkReq('GET', '/api/wiki-steward/settings'), res)
  assert.equal(res.json().data.writable, false)

  res = mkRes()
  await ctx.webRoutes[0].handler(mkReq('POST', '/api/wiki-steward/settings', { patch: { capture: { enabled: false } } }), res)
  assert.equal(res.status, 503)
  assert.equal(res.json().error.code, 'write_unavailable')
})
