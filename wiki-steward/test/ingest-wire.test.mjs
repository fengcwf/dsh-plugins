// ingest-wire 单测（index.js 设置页签数据面接线）：webServer/connection 软取得（T13 timer 同款姿势，
// inject 维持 ['tools'] 不加服务）、缺缝 fail-open 留痕（INV-15）、注册 5 路由、ctx.effect 收敛、
// Config 热改现读（settings 响应跟 rawConfig 走）。
// 零 mock：假 host 缝最小形（wire.test 同款），业务面真调真文件系统（mkdtemp）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { apply } = await import('../lib/index.js')

function mkCtx({ withWeb = true, withEffect = true } = {}) {
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
const mkReq = (method, url) => ({ method, url, headers: {}, on() {} })

// ── 注册面 ──────────────────────────────────────────────────────────────────
test('接线：webServer 缝在场 → 注册 4 exact + 1 prefix（logs/settings/scan/distill + /wiki-steward 静态）', (t) => {
  const ctx = mkCtx()
  apply(ctx, { vaultRoot: mkTmp(t) })
  assert.deepEqual(ctx.webRoutes.map((r) => [r.kind, r.path]), [
    ['exact', '/wiki-steward/api/ingest/logs'],
    ['exact', '/wiki-steward/api/ingest/settings'],
    ['exact', '/wiki-steward/api/ingest/scan'],
    ['exact', '/wiki-steward/api/ingest/distill'],
    ['prefix', '/wiki-steward'],
  ])
  assert.equal(ctx.warnings.length, 0, '健康路径零留痕')
})

test('接线：webServer/connection 缺缝 = fail-open 留痕恰一 + 事件缝照常（INV-15 禁静默）', (t) => {
  const ctx = mkCtx({ withWeb: false })
  apply(ctx, { vaultRoot: mkTmp(t) })
  assert.equal(ctx.webRoutes.length, 0)
  assert.equal(ctx.warnings.length, 1)
  assert.match(ctx.warnings[0], /设置页签数据面.*未注册/)
  assert.equal(typeof ctx.handlers['session/event'], 'function', '捕获面照常（fail-open）')
})

test('接线：ctx.effect 收敛 → dispose 逐条回放（路由生命周期可关）', (t) => {
  const ctx = mkCtx()
  apply(ctx, { vaultRoot: mkTmp(t) })
  assert.equal(ctx.effects.length, 1)
  ctx.effects[0]()
  assert.equal(ctx.disposed.length, 5, '5 路由逐条 dispose')
})

test('接线：缺 ctx.effect 不炸（dispose 不收敛也不留悬挂异常）', (t) => {
  const ctx = mkCtx({ withEffect: false })
  apply(ctx, { vaultRoot: mkTmp(t) })
  assert.equal(ctx.webRoutes.length, 5)
})

// ── 热改现读（settings 响应跟 rawConfig 走，与工具层 write.readOnly 同源）────────
test('热改：GET settings 现读 rawConfig（write.readOnly 翻转即时可见，不冻结启动值）', async (t) => {
  const ctx = mkCtx()
  const rawConfig = { vaultRoot: mkTmp(t), write: { readOnly: true } }
  apply(ctx, rawConfig)
  const settingsRoute = ctx.webRoutes.find((r) => r.path === '/wiki-steward/api/ingest/settings')

  let res = mkRes()
  await settingsRoute.handler(mkReq('GET', '/wiki-steward/api/ingest/settings'), res)
  assert.equal(res.json().data.config.write.readOnly, true)

  rawConfig.write.readOnly = false // 热改
  res = mkRes()
  await settingsRoute.handler(mkReq('GET', '/wiki-steward/api/ingest/settings'), res)
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
  for (const [p, m] of [['/wiki-steward/api/ingest/scan', 'POST'], ['/wiki-steward/api/ingest/distill', 'POST']]) {
    const res = mkRes()
    await ctx.webRoutes.find((r) => r.path === p).handler(mkReq(m, p), res)
    assert.equal(res.status, 200, p)
  }
  assert.deepEqual(calls, ['scan', 'distill'])
})
