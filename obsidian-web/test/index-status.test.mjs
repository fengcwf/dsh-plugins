// A4 只读 index/status 端点契约测试（合同=changes/2026-09-28-b2-effect-fix/delta-specs/runtime-fix-wave.md
// 卡 A4 第 2 项；NEEDS_HUMAN-2 可观测性闭环）：
//   GET /ob/api/index/status → 200 {data:{wired, vaultRoot, dir, ready, docs:{count},
//     fts:{available, reason}, lastReconcile:null|{runId,status,startedAt,finishedAt,counts},
//     degraded:null|{reason,message,at}}}——索引库开闭态/文档数/最后对账时间/degraded 原因/fts 可用性。
//   只读零副作用：不开库、不自愈重试、不写账本（byte 级账本不变锁）；未接索引服务=200 wired:false
//   可解释形（观测面不装死不 5xx）；鉴权缝（OW-INV-8）401/403 零副作用；POST 405。
// 真验零 mock：真 node:http 往返、真索引服务、真落盘账本、真 sqlite 锁。
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { registerWebRoutes } from '../lib/web-routes.js'
import { createIndexService } from '../lib/index-service.js'
import { resolveIndexDir } from '../lib/index-store.js'

const TMP_ROOT = fileURLToPath(new URL('./.tmp-index-status', import.meta.url))
const DIST = fileURLToPath(new URL('./fixtures/dist', import.meta.url))
// 0.1.1 起索引库落本地盘 <indexDir>/<vault 名-哈希>/（迁出 CIFS）——测试显式给 indexDir（HOME 污染防线）
const IDX_BASE = path.join(TMP_ROOT, 'idx')
const idxDir = (vault) => resolveIndexDir({ vaultRoot: vault, indexDir: IDX_BASE })
const ledgerPathOf = (vault) => path.join(idxDir(vault), 'reconcile-ledger.json')

const DATA_KEYS = ['degraded', 'dir', 'docs', 'fts', 'lastReconcile', 'ready', 'vaultRoot', 'wired']
const LAST_RUN_KEYS = ['counts', 'finishedAt', 'runId', 'startedAt', 'status']
const COUNT_KEYS = ['added', 'degraded', 'removed', 'seen', 'updated']

function makeVault(files) {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true })
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, 'v'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return dir
}

test.after(() => fs.rmSync(TMP_ROOT, { recursive: true, force: true }))

function makeCtx({ rejection } = {}) {
  const routes = new Map()
  return {
    routes,
    ctx: {
      logger: { warn: () => {} },
      webServer: {
        register(route) {
          routes.set(`${route.kind}:${route.path}`, route)
          return () => routes.delete(`${route.kind}:${route.path}`)
        },
      },
      connection: { requestRejection: () => rejection },
    },
  }
}

function dispatch(routes, req, res) {
  const pathname = new URL(req.url, 'http://x').pathname
  for (const [, route] of routes) {
    if (route.kind === 'exact' && route.path === pathname) return route.handler(req, res)
  }
  res.writeHead(404)
  res.end()
}

async function withServer(fn, { rejection, index, vault } = {}) {
  const { routes, ctx } = makeCtx({ rejection })
  registerWebRoutes(ctx, () => ({ vaultRoot: vault, ui: { pageSize: 50 } }), { distDir: DIST, index })
  const server = http.createServer((req, res) => {
    Promise.resolve(dispatch(routes, req, res)).catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    await fn(base)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

// 真锁库（第二连接 BEGIN IMMEDIATE 持锁）：开库失败 fail-open 形态（index-failopen 同款）
function lockDb(vault) {
  const dir = idxDir(vault)
  fs.mkdirSync(dir, { recursive: true })
  const dbPath = path.join(dir, 'index.db')
  fs.writeFileSync(dbPath, '')
  const holder = new DatabaseSync(dbPath)
  holder.exec('BEGIN IMMEDIATE')
  let released = false
  return {
    release() {
      if (released) return
      released = true
      holder.exec('ROLLBACK')
      holder.close()
    },
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 等构造期 fire-and-forget 落账落定（只等文件出现，不做业务动作） */
async function settleLedger(vault) {
  for (let i = 0; i < 100; i += 1) {
    if (fs.existsSync(ledgerPathOf(vault))) return
    await sleep(10)
  }
}

// ── ① schema 锁定 + 索引面真值（开闭态/文档数/最后对账/degraded/fts 可用性）────────────────
test('① GET /ob/api/index/status 形状锁定：data 八键 + docs/fts/lastReconcile 嵌套键 + 真值一致', async () => {
  const vault = makeVault({ 'a.md': '# A\n\nalpha\n', 'b.md': '# B\n\nbeta\n', 'c.md': '# C\n\ngamma\n' })
  const service = createIndexService({ vaultRoot: vault, indexDir: IDX_BASE })
  await service.start()
  try {
    await withServer(async (base) => {
      const res = await fetch(`${base}/ob/api/index/status`)
      assert.equal(res.status, 200)
      assert.match(res.headers.get('content-type'), /application\/json/)
      const body = await res.json()
      assert.deepEqual(Object.keys(body.data).sort(), DATA_KEYS, 'data 键集锁定（只增不改=本次新增面即此形）')
      assert.equal(body.data.wired, true)
      assert.equal(body.data.ready, true, '索引库开闭态=已开库')
      assert.equal(body.data.vaultRoot, path.resolve(vault))
      assert.deepEqual(Object.keys(body.data.docs).sort(), ['count'])
      assert.equal(body.data.docs.count, 3, '文档数=库内 .md 数')
      assert.deepEqual(Object.keys(body.data.fts).sort(), ['available', 'reason'])
      assert.deepEqual(body.data.fts, { available: true, reason: null }, 'fts 可用性')
      assert.equal(body.data.degraded, null, '零降级留痕')
      const last = body.data.lastReconcile
      assert.deepEqual(Object.keys(last).sort(), LAST_RUN_KEYS, 'lastReconcile 键形')
      assert.deepEqual(Object.keys(last.counts).sort(), COUNT_KEYS, 'counts 键形')
      assert.equal(last.status, 'done', '最后对账状态')
      assert.equal(last.counts.added, 3, 'start 启动补跑=首条对账 run（added=全库入库数）')
      const second = await service.refresh()
      const res2 = await fetch(`${base}/ob/api/index/status`)
      const last2 = (await res2.json()).data.lastReconcile
      assert.notEqual(last2.runId, last.runId, 'lastReconcile 跟随最新对账 run')
      assert.equal(last2.status, 'done')
      assert.deepEqual(second.counts, last2.counts, 'run 语义与 status 摘要同源')
      assert.equal(last2.counts.seen, 3, '二次对账=seen 全中（增量 diff 计数）')
      assert.equal(last2.counts.added, 0)
      assert.ok(last2.finishedAt >= last.finishedAt, '最后对账时间随 run 推进')
      assert.equal(typeof last.startedAt, 'number')
      assert.equal(typeof last.finishedAt, 'number', '最后对账时间')
      assert.ok(last.finishedAt >= last.startedAt)
    }, { index: { refresh: () => service.refresh(), status: () => service.status() }, vault })
  } finally {
    service.stop()
  }
})

// ── ② 只读零副作用（NEEDS_HUMAN-2 核心：观测面绝不写、绝不自愈、绝不开库）──────────────────
test('② 只读零副作用：重复 GET 账本 byte 级不变；锁库 degraded 态 status 不触发自愈/不写账本', async () => {
  const vault = makeVault({ 'a.md': '# A\n\nalpha\n' })
  const service = createIndexService({ vaultRoot: vault, indexDir: IDX_BASE })
  await service.start()
  try {
    await service.refresh()
    const before = fs.readFileSync(ledgerPathOf(vault))
    await withServer(async (base) => {
      for (let i = 0; i < 3; i += 1) {
        const res = await fetch(`${base}/ob/api/index/status`)
        assert.equal(res.status, 200)
        const body = await res.json()
        assert.equal(body.data.docs.count, 1)
      }
    }, { index: { refresh: () => service.refresh(), status: () => service.status() }, vault })
    assert.deepEqual(fs.readFileSync(ledgerPathOf(vault)), before, '账本 byte 级不变（只读零副作用）')
  } finally {
    service.stop()
  }
  // 锁库 degraded 形态：status 恒 200 可读 + fts 不可用 + 原因留痕；且 status 调用不写账本（不触发 ensureStore）
  const vault2 = makeVault({ 'a.md': '# A\n\nalpha\n' })
  const lock = lockDb(vault2)
  const service2 = createIndexService({ vaultRoot: vault2, indexDir: IDX_BASE, busyTimeoutMs: 30, openAttempts: 1, retryDelayMs: 1, warn: () => {} })
  try {
    await settleLedger(vault2) // 构造期 recordDegraded fire-and-forget 先落定（其写账在构造期，非 status 触发）
    const before = fs.readFileSync(ledgerPathOf(vault2))
    await withServer(async (base) => {
      const res = await fetch(`${base}/ob/api/index/status`)
      assert.equal(res.status, 200, 'degraded 态观测面照样 200 可读（不装死不 5xx）')
      const body = await res.json()
      assert.equal(body.data.wired, true)
      assert.equal(body.data.ready, false, '开闭态=未开库')
      assert.deepEqual(body.data.docs, { count: 0 }, '未开库文档数=0（如实）')
      assert.equal(body.data.fts.available, false, 'fts 可用性=不可用')
      assert.equal(body.data.fts.reason, 'index-store-unavailable')
      assert.equal(body.data.degraded.reason, 'index-store-unavailable', 'degraded 原因留痕')
      assert.equal(typeof body.data.degraded.at, 'number')
      const again = await fetch(`${base}/ob/api/index/status`)
      assert.equal(again.status, 200)
    }, { index: { refresh: () => service2.refresh(), status: () => service2.status() }, vault: vault2 })
    assert.deepEqual(fs.readFileSync(ledgerPathOf(vault2)), before, 'status 不触发自愈重试/不写账本（byte 级锁）')
  } finally {
    lock.release()
    service2.stop()
  }
})

// ── ③ 未接索引服务：200 wired:false 可解释形（观测面不装死）────────────────────────────────
test('③ 未接索引服务：GET /ob/api/index/status → 200 {data:{wired:false,...零值形}}', async () => {
  const vault = makeVault({ 'a.md': '# A\n\nalpha\n' })
  await withServer(async (base) => {
    const res = await fetch(`${base}/ob/api/index/status`)
    assert.equal(res.status, 200, '观测面恒 200（未接索引服务=可解释形，非 5xx 非 404）')
    const body = await res.json()
    assert.deepEqual(Object.keys(body.data).sort(), DATA_KEYS, 'wired:false 同形（键集恒定）')
    assert.deepEqual(body.data, {
      wired: false,
      vaultRoot: null,
      dir: null,
      ready: false,
      docs: { count: 0 },
      fts: { available: false, reason: 'index-service-not-wired' },
      lastReconcile: null,
      degraded: null,
    })
  }, { vault })
})

// ── ④ 方法守卫 + 鉴权缝（OW-INV-8）零副作用 ───────────────────────────────────────────────
test('④ POST 405 + allow 头；鉴权缝 401/403 直接回拒（零副作用零业务处理）', async () => {
  const vault = makeVault({ 'a.md': '# A\n\nalpha\n' })
  const service = createIndexService({ vaultRoot: vault, indexDir: IDX_BASE })
  await service.start()
  try {
    await service.refresh()
    const before = fs.readFileSync(ledgerPathOf(vault))
    const index = { refresh: () => service.refresh(), status: () => service.status() }
    await withServer(async (base) => {
      const post = await fetch(`${base}/ob/api/index/status`, { method: 'POST' })
      assert.equal(post.status, 405)
      assert.equal(post.headers.get('allow'), 'GET, HEAD', '方法守卫 allow 头')
      assert.deepEqual((await post.json()).error.code, 'method_not_allowed')
    }, { index, vault })
    for (const rejection of [401, 403]) {
      await withServer(async (base) => {
        const res = await fetch(`${base}/ob/api/index/status`)
        assert.equal(res.status, rejection)
        assert.deepEqual((await res.json()).error.code, rejection === 401 ? 'unauthorized' : 'forbidden')
      }, { rejection, index, vault })
    }
    assert.deepEqual(fs.readFileSync(ledgerPathOf(vault)), before, '405/401/403 全程零副作用')
  } finally {
    service.stop()
  }
})
