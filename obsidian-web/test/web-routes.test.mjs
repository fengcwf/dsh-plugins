// /ob/ 路由面契约测试（T2）：JSON 读接口 + 静态 UI 服务，全部走真实 node:http 往返（零 mock 输出）。
// API 形（T2 自定，报告写明）：{data, total?} / {error:{code,message}}（沿历史 obsidian-workbench 惯例）。
// 鉴权缝（OW-INV-8）：每条 handler 第一行过 ctx.connection.requestRejection → 401/403。
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply } from '../lib/index.js'
import { registerWebRoutes } from '../lib/web-routes.js'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const VAULT = path.join(FIXTURES, 'vault')
const DIST = path.join(FIXTURES, 'dist')

function makeCtx({ rejection } = {}) {
  const routes = new Map()
  return {
    routes,
    ctx: {
      logger: { warn: () => {} },
      webServer: {
        register(route) {
          const key = `${route.kind}:${route.path}`
          if (routes.has(key)) throw new Error(`duplicate route ${key}`)
          routes.set(key, route)
          return () => routes.delete(key)
        },
      },
      connection: { requestRejection: () => rejection },
    },
  }
}

// 宿主 match 语义复刻（dsh-host-webserver 源码实测）：exact 优先 → 最长前缀，
// 且 pathname===prefix || startsWith(prefix+'/')。
function dispatch(routes, req, res) {
  const pathname = new URL(req.url, 'http://x').pathname
  for (const [, route] of routes) {
    if (route.kind === 'exact' && route.path === pathname) return route.handler(req, res)
  }
  let best
  for (const [, route] of routes) {
    if (route.kind !== 'prefix') continue
    if (pathname !== route.path && !pathname.startsWith(`${route.path}/`)) continue
    if (best === undefined || route.path.length > best.path.length) best = route
  }
  if (best !== undefined) return best.handler(req, res)
  res.writeHead(404)
  res.end()
}

async function withServer(fn, opts = {}) {
  const { routes, ctx } = makeCtx(opts)
  registerWebRoutes(ctx, () => ({ vaultRoot: VAULT, ui: { pageSize: 50 } }), { distDir: DIST })
  const server = http.createServer((req, res) => {
    Promise.resolve(dispatch(routes, req, res)).catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    await fn(base, routes)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

// ── 注册面（API 形锁定到接线层）───────────────────────────────────────────────
test('注册面锁定：apply 恰注册 3 条 exact API + /ob 重定向 + prefix /ob 静态面', () => {
  const { routes, ctx } = makeCtx()
  apply(ctx, { vaultRoot: VAULT })
  assert.deepEqual([...routes.keys()].sort(), [
    'exact:/ob',
    'exact:/ob/api/backlinks',
    'exact:/ob/api/file',
    'exact:/ob/api/tree',
    'prefix:/ob',
  ])
})

test('dispose 全量注销；无宿主缝（独立测试上下文）不炸不注册', () => {
  const { routes, ctx } = makeCtx()
  const dispose = registerWebRoutes(ctx, () => ({ vaultRoot: VAULT, ui: { pageSize: 50 } }), { distDir: DIST })
  assert.equal(routes.size, 5)
  dispose()
  assert.equal(routes.size, 0)
  assert.doesNotThrow(() => apply({}, { vaultRoot: VAULT }), '缺 webServer/connection 缝时跳过注册（非宿主上下文）')
})

// ── /ob/api/tree ────────────────────────────────────────────────────────────
test('GET /ob/api/tree 形状锁定：{data:{root,nodes}, total}，total=节点总数', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/ob/api/tree`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /application\/json/)
    const body = await res.json()
    assert.deepEqual(Object.keys(body).sort(), ['data', 'total'])
    assert.deepEqual(Object.keys(body.data).sort(), ['nodes', 'root'])
    assert.equal(typeof body.total, 'number')
    const names = body.data.nodes.map((n) => n.name)
    assert.deepEqual(names, ['notes', 'sub', 'INDEX.md'])
    const count = (nodes) => nodes.reduce((acc, n) => acc + 1 + (n.children ? count(n.children) : 0), 0)
    assert.equal(body.total, count(body.data.nodes), 'total=递归节点数（目录+文件）')
  })
})

// ── /ob/api/file ────────────────────────────────────────────────────────────
test('GET /ob/api/file 形状锁定：data={path,content,mtime,etag,size,rendered:{html,toc}}', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/ob/api/file?path=${encodeURIComponent('notes/a.md')}`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(Object.keys(body).sort(), ['data'])
    assert.deepEqual(Object.keys(body.data).sort(), ['content', 'etag', 'mtime', 'path', 'rendered', 'size'])
    assert.deepEqual(Object.keys(body.data.rendered).sort(), ['html', 'toc'])
    assert.ok(body.data.rendered.html.includes('Note A'))
    assert.ok(!body.data.rendered.html.toLowerCase().includes('<script'), '渲染面零未转义脚本（OW-INV-6 雏形）')
    assert.ok(!/javascript\s*:/i.test(body.data.rendered.html), '渲染面拦 javascript:')
    for (const item of body.data.rendered.toc) assert.deepEqual(Object.keys(item).sort(), ['id', 'level', 'text'])
  })
})

test('GET /ob/api/file 负例：缺参 400 / 穿越 400 / 缺文件 404，形 {error:{code,message}}', async () => {
  await withServer(async (base) => {
    for (const [url, status, code] of [
      ['/ob/api/file', 400, 'bad_request'],
      [`/ob/api/file?path=${encodeURIComponent('../etc/passwd')}`, 400, 'bad_request'],
      [`/ob/api/file?path=${encodeURIComponent('/etc/passwd')}`, 400, 'bad_request'],
      [`/ob/api/file?path=${encodeURIComponent('notes/nope.md')}`, 404, 'not_found'],
    ]) {
      const res = await fetch(base + url)
      assert.equal(res.status, status, url)
      const body = await res.json()
      assert.deepEqual(Object.keys(body).sort(), ['error'])
      assert.deepEqual(Object.keys(body.error).sort(), ['code', 'message'])
      assert.equal(body.error.code, code, url)
    }
  })
})

// ── /ob/api/backlinks ───────────────────────────────────────────────────────
test('GET /ob/api/backlinks 形状锁定：{data:{path,backlinks:[{path,line,text}]}, total}', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/ob/api/backlinks?path=${encodeURIComponent('notes/a.md')}`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(Object.keys(body).sort(), ['data', 'total'])
    assert.deepEqual(Object.keys(body.data).sort(), ['backlinks', 'path'])
    assert.equal(body.total, 3)
    assert.deepEqual(body.data.backlinks.map((b) => [b.path, b.line]), [
      ['INDEX.md', 3],
      ['notes/b.md', 3],
      ['sub/deep.md', 3],
    ])
  })
})

// ── 方法/鉴权缝 ─────────────────────────────────────────────────────────────
test('非 GET 一律 405 {error:{code:"method_not_allowed"}}', async () => {
  await withServer(async (base) => {
    for (const url of ['/ob/api/tree', '/ob/']) {
      const res = await fetch(base + url, { method: 'POST' })
      assert.equal(res.status, 405, url)
      const body = await res.json()
      assert.equal(body.error.code, 'method_not_allowed')
    }
  })
})

test('鉴权缝（OW-INV-8）：requestRejection=403/401 直接回拒，形 {error:{code}}', async () => {
  await withServer(async (base) => {
    const r403 = await fetch(`${base}/ob/api/tree`)
    assert.equal(r403.status, 403)
    assert.equal((await r403.json()).error.code, 'forbidden')
  }, { rejection: 403 })
  await withServer(async (base) => {
    const r401 = await fetch(`${base}/ob/api/tree`)
    assert.equal(r401.status, 401)
    assert.equal((await r401.json()).error.code, 'unauthorized')
    const page = await fetch(`${base}/ob/`)
    assert.equal(page.status, 401, 'UI 静态面同样过鉴权缝')
  }, { rejection: 401 })
})

// ── 静态 UI 服务（web/dist）─────────────────────────────────────────────────
test('静态面：/ob/ 出 index、资源出文件、/ob 302 → /ob/、穿越拒、缺文件 404', async () => {
  await withServer(async (base) => {
    const index = await fetch(`${base}/ob/`)
    assert.equal(index.status, 200)
    assert.match(index.headers.get('content-type'), /text\/html/)
    assert.ok((await index.text()).includes('obsidian-web fixture'))
    const asset = await fetch(`${base}/ob/assets/app.js`)
    assert.equal(asset.status, 200)
    assert.ok((await asset.text()).includes('fixture-app'))
    const redirect = await fetch(`${base}/ob`, { redirect: 'manual' })
    assert.equal(redirect.status, 302)
    assert.equal(redirect.headers.get('location'), '/ob/')
    for (const url of ['/ob/..%2f..%2fetc/passwd', '/ob/../../etc/passwd', '/ob/%2e%2e%2fpackage.json']) {
      const res = await fetch(base + url)
      assert.notEqual(res.status, 200, `穿越不得 200：${url}`)
      assert.ok(!(await res.text()).includes('root:'), `穿越不得泄文件：${url}`)
    }
    assert.equal((await fetch(`${base}/ob/nope.js`)).status, 404)
    // exact API 优先于 prefix：/ob/api/tree 不会被静态面吞掉（已在上面 200 JSON 佐证）
  })
})
