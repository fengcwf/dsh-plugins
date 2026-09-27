// T11 索引三保险——手动刷新面：exact /ob/api/index/refresh（POST）。
// 语义（OW-US-11）：手动刷新=立即对账（先查补跑账本）；成功 200 {data:对账账本 run 形}；未接索引服务
// 503 {error:{code:'index_unavailable'}}（可解释）；GET 405；鉴权缝（OW-INV-8）401/403 零副作用。
// 真验零 mock：真 node:http 往返 + 真索引服务 + 真落盘账本。
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerWebRoutes } from '../lib/web-routes.js'
import { createIndexService, INDEX_DIR_NAME } from '../lib/index-service.js'

const TMP_ROOT = fileURLToPath(new URL('./.tmp-index-routes', import.meta.url))
const DIST = fileURLToPath(new URL('./fixtures/dist', import.meta.url))

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

const RUN_KEYS = ['counts', 'cursor', 'degraded', 'finishedAt', 'resumedFrom', 'runId', 'startedAt', 'status']
const COUNT_KEYS = ['added', 'degraded', 'removed', 'seen', 'updated']

test('手动刷新：POST /ob/api/index/refresh → 200 {data:对账 run 形}（计数/degraded 键锁定）+ 账本落盘', async () => {
  const vault = makeVault({ 'a.md': '# A\n\nhello world\n', 'b.md': '# B\n\nfoo bar\n' })
  const service = createIndexService({ vaultRoot: vault })
  await service.start()
  try {
    await withServer(async (base) => {
      const res = await fetch(`${base}/ob/api/index/refresh`, { method: 'POST' })
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.deepEqual(Object.keys(body), ['data'])
      assert.deepEqual(Object.keys(body.data).sort(), RUN_KEYS, '刷新返回=账本 run 形（键锁定）')
      assert.deepEqual(Object.keys(body.data.counts).sort(), COUNT_KEYS)
      assert.equal(body.data.status, 'done')
      // 手动刷新=对账校正：外部变更经刷新立即可见（第三保险）
      fs.writeFileSync(path.join(vault, 'c.md'), '# C\n\nmanual 刷新内容\n')
      const res2 = await fetch(`${base}/ob/api/index/refresh`, { method: 'POST' })
      const run2 = (await res2.json()).data
      assert.deepEqual(run2.counts, { seen: 2, added: 1, updated: 0, removed: 0, degraded: 0 }, '刷新即对账校正')
      const ledger = JSON.parse(fs.readFileSync(path.join(vault, INDEX_DIR_NAME, 'reconcile-ledger.json'), 'utf8'))
      assert.equal(ledger.runs.at(-1).runId, run2.runId, '刷新入对账账本')
    }, { index: { refresh: () => service.refresh() }, vault })
  } finally {
    service.stop()
  }
})

test('手动刷新边界：GET 405（POST only）；未接索引服务 503 index_unavailable（可解释，不装死）', async () => {
  const vault = makeVault({ 'a.md': '# A\n\nhello world\n' })
  await withServer(async (base) => {
    const get = await fetch(`${base}/ob/api/index/refresh`)
    assert.equal(get.status, 405)
    assert.ok((get.headers.get('allow') ?? '').includes('POST'))
    const post = await fetch(`${base}/ob/api/index/refresh`, { method: 'POST' })
    assert.equal(post.status, 503)
    const body = await post.json()
    assert.equal(body.error.code, 'index_unavailable')
    assert.equal(typeof body.error.message, 'string')
  }, { vault }) // 无 index 选项
})

test('手动刷新鉴权缝（OW-INV-8）：未通过 requestRejection → 401/403 零副作用（账本零新 run）', async () => {
  const vault = makeVault({ 'a.md': '# A\n\nhello world\n' })
  const service = createIndexService({ vaultRoot: vault })
  await service.start()
  const before = JSON.parse(fs.readFileSync(path.join(vault, INDEX_DIR_NAME, 'reconcile-ledger.json'), 'utf8')).runs.length
  try {
    for (const rejection of [401, 403]) {
      await withServer(async (base) => {
        const res = await fetch(`${base}/ob/api/index/refresh`, { method: 'POST' })
        assert.equal(res.status, rejection)
      }, { rejection, index: { refresh: () => service.refresh() }, vault })
    }
    const after = JSON.parse(fs.readFileSync(path.join(vault, INDEX_DIR_NAME, 'reconcile-ledger.json'), 'utf8')).runs.length
    assert.equal(after, before, '鉴权拒→零对账副作用')
  } finally {
    service.stop()
  }
})
