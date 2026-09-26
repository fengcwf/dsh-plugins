// /ob/ 路由面契约测试（T2）：JSON 读接口 + 静态 UI 服务，全部走真实 node:http 往返（零 mock 输出）。
// API 形（T2 自定，报告写明）：{data, total?} / {error:{code,message}}（沿历史 obsidian-workbench 惯例）。
// 鉴权缝（OW-INV-8）：每条 handler 第一行过 ctx.connection.requestRejection → 401/403。
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
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
  const config = opts.config ?? { vaultRoot: VAULT, ui: { pageSize: 50 } }
  registerWebRoutes(ctx, () => config, { distDir: DIST, search: opts.search })
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
test('注册面锁定：apply 恰注册 8 条 exact API（含 T4 保存/渲染面 + T5 改名面 + T6 删除面）+ /ob 重定向 + prefix /ob 静态面', () => {
  const { routes, ctx } = makeCtx()
  apply(ctx, { vaultRoot: VAULT })
  assert.deepEqual([...routes.keys()].sort(), [
    'exact:/ob',
    'exact:/ob/api/backlinks',
    'exact:/ob/api/delete',
    'exact:/ob/api/file',
    'exact:/ob/api/rename',
    'exact:/ob/api/render',
    'exact:/ob/api/save',
    'exact:/ob/api/search',
    'exact:/ob/api/tree',
    'prefix:/ob',
  ])
})

test('dispose 全量注销；无宿主缝（独立测试上下文）不炸不注册', () => {
  const { routes, ctx } = makeCtx()
  const dispose = registerWebRoutes(ctx, () => ({ vaultRoot: VAULT, ui: { pageSize: 50 } }), { distDir: DIST })
  assert.equal(routes.size, 10)
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

// ── /ob/api/search（T3 搜索面）───────────────────────────────────────────────
const SEARCHVAULT = path.join(FIXTURES, 'searchvault')

test('GET /ob/api/search 形状锁定：信封 {data,total}；data={backend,degraded,query,results}；项={path,line,snippet,score,title}', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/ob/api/search?q=${encodeURIComponent('needle')}`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /application\/json/)
    const body = await res.json()
    assert.deepEqual(Object.keys(body).sort(), ['data', 'total'])
    assert.deepEqual(Object.keys(body.data).sort(), ['backend', 'degraded', 'query', 'results'])
    assert.equal(body.data.query, 'needle')
    assert.equal(body.data.backend, 'scan', 'T11 前默认 scan 后端（fts 缝可插拔）')
    assert.equal(body.data.degraded, null)
    assert.equal(body.total, body.data.results.length)
    assert.ok(body.total >= 2, '全文命中真检索')
    for (const item of body.data.results) {
      assert.deepEqual(Object.keys(item).sort(), ['line', 'path', 'score', 'snippet', 'title'], JSON.stringify(item))
      assert.equal(typeof item.score, 'number', 'score=排序权重（数值）')
      assert.ok(!/<(?!\/?mark>)/.test(item.snippet), `snippet 唯一标签=<mark>：${item.snippet}`)
    }
  }, { config: { vaultRoot: SEARCHVAULT, ui: { pageSize: 50 } } })
})

test('GET /ob/api/search 负例：缺参/空查询 400，形 {error:{code,message}}；limit 非法 400', async () => {
  await withServer(async (base) => {
    for (const url of ['/ob/api/search', `/ob/api/search?q=${encodeURIComponent('  ')}`, '/ob/api/search?q=x&limit=0', '/ob/api/search?q=x&limit=abc']) {
      const res = await fetch(base + url)
      assert.equal(res.status, 400, url)
      const body = await res.json()
      assert.deepEqual(Object.keys(body).sort(), ['error'])
      assert.equal(body.error.code, 'bad_request', url)
    }
  }, { config: { vaultRoot: SEARCHVAULT, ui: { pageSize: 50 } } })
})

test('GET /ob/api/search 超时降级留痕（INV-15 风格）：fail-open 200 + degraded 提示，不出 5xx', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/ob/api/search?q=${encodeURIComponent('needle')}`)
    assert.equal(res.status, 200, '超时 fail-open：降级不报错')
    const body = await res.json()
    assert.ok(body.data.degraded, '降级标记进返回')
    assert.equal(body.data.degraded.reason, 'timeout')
    assert.match(body.data.degraded.message, /超时/)
    assert.ok(Array.isArray(body.data.results), '返回部分结果')
  }, {
    config: { vaultRoot: SEARCHVAULT, ui: { pageSize: 50 } },
    search: { timeoutMs: 0 },
  })
})

test('GET /ob/api/search 2 字盲区与标题命中走同 API 形（LIKE 兜底零差异）', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/ob/api/search?q=${encodeURIComponent('链接')}`)
    assert.equal(r.status, 200)
    const body = await r.json()
    assert.deepEqual(body.data.results.map((x) => [x.path, x.line]), [['notes/beta.md', 3]])
    assert.ok(body.data.results[0].snippet.includes('<mark>链接</mark>'))
  }, { config: { vaultRoot: SEARCHVAULT, ui: { pageSize: 50 } } })
})

// ── 方法/鉴权缝 ─────────────────────────────────────────────────────────────
test('非 GET 一律 405 {error:{code:"method_not_allowed"}}', async () => {
  await withServer(async (base) => {
    for (const url of ['/ob/api/tree', '/ob/api/search?q=x', '/ob/']) {
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

// ── /ob/api/save（T4 保存面：OW-INV-3 乐观锁 + 冲突三选）────────────────────
const TMP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp-routes')

function tmpVault(t) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, 'v'))
  fs.cpSync(VAULT, dir, { recursive: true })
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

async function postJson(base, url, body) {
  const res = await fetch(base + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

test('POST /ob/api/save 形状锁定：200 {data:{ok,...,diffUndo}} 且 GET /ob/api/file 读回一致', async (t) => {
  const root = tmpVault(t)
  const config = { vaultRoot: root, ui: { pageSize: 50 } }
  await withServer(async (base) => {
    const before = await (await fetch(`${base}/ob/api/file?path=notes%2Fa.md`)).json()
    const { status, body } = await postJson(base, '/ob/api/save', {
      path: 'notes/a.md',
      content: '# 经 HTTP 保存\n',
      expectedMtime: before.data.mtime,
    })
    assert.equal(status, 200)
    assert.deepEqual(Object.keys(body).sort(), ['data'])
    assert.deepEqual(Object.keys(body.data).sort(), ['diffUndo', 'etag', 'mtime', 'ok', 'path', 'size'])
    assert.equal(body.data.ok, true)
    assert.deepEqual(Object.keys(body.data.diffUndo).sort(), ['after', 'before'])
    assert.equal(body.data.diffUndo.before.content, before.data.content, '保存前快照过线（diff undo 材料）')
    const after = await (await fetch(`${base}/ob/api/file?path=notes%2Fa.md`)).json()
    assert.equal(after.data.content, '# 经 HTTP 保存\n', '保存后读回一致')
    assert.equal(after.data.etag, body.data.etag)
  }, { config })
})

test('POST /ob/api/save 冲突：200 {data:{conflict:true, diffUndo:{before,incoming}}}（三选弹层材料）', async (t) => {
  const root = tmpVault(t)
  const config = { vaultRoot: root, ui: { pageSize: 50 } }
  await withServer(async (base) => {
    const before = await (await fetch(`${base}/ob/api/file?path=notes%2Fa.md`)).json()
    const { status, body } = await postJson(base, '/ob/api/save', {
      path: 'notes/a.md',
      content: '我方内容',
      expectedMtime: before.data.mtime - 1000,
    })
    assert.equal(status, 200)
    assert.equal(body.data.conflict, true)
    assert.deepEqual(Object.keys(body.data).sort(), ['conflict', 'diffUndo', 'path'])
    assert.deepEqual(Object.keys(body.data.diffUndo).sort(), ['before', 'incoming'])
    assert.equal(body.data.diffUndo.before.content, before.data.content)
    assert.equal(body.data.diffUndo.incoming.content, '我方内容')
    const disk = await (await fetch(`${base}/ob/api/file?path=notes%2Fa.md`)).json()
    assert.equal(disk.data.content, before.data.content, '冲突零写入')
  }, { config })
})

test('POST /ob/api/save 负例：无乐观锁 400（无乐观锁不落盘）/ 缺 path 400 / GET 405 / 穿越 400', async (t) => {
  const root = tmpVault(t)
  const config = { vaultRoot: root, ui: { pageSize: 50 } }
  await withServer(async (base) => {
    for (const body of [
      { path: 'notes/a.md', content: 'x' },
      { path: 'notes/a.md', content: 'x', expectedMtime: undefined, etag: undefined },
      { content: 'x', expectedMtime: 1 },
      { path: '../escape.md', content: 'x', expectedMtime: 1 },
    ]) {
      const { status, body: out } = await postJson(base, '/ob/api/save', body)
      assert.equal(status, 400, JSON.stringify(body))
      assert.equal(out.error.code, 'bad_request')
    }
    const get = await fetch(`${base}/ob/api/save`)
    assert.equal(get.status, 405, 'GET /ob/api/save 405')
    assert.equal((await get.json()).error.code, 'method_not_allowed')
  }, { config })
})

test('POST /ob/api/save 鉴权缝（OW-INV-8）：写面同样过 requestRejection', async (t) => {
  const root = tmpVault(t)
  await withServer(async (base) => {
    const { status, body } = await postJson(base, '/ob/api/save', { path: 'notes/a.md', content: 'x', expectedMtime: 1 })
    assert.equal(status, 403)
    assert.equal(body.error.code, 'forbidden')
  }, { config: { vaultRoot: root, ui: { pageSize: 50 } }, rejection: 403 })
})

// ── /ob/api/render（T4 预览面：唯一渲染源 ARC-1，分屏预览不过前端解析）────────
test('POST /ob/api/render 形状锁定：{data:{html,toc}} 与 render.js 出口同源一致', async () => {
  await withServer(async (base) => {
    const { status, body } = await postJson(base, '/ob/api/render', { content: '# 预览标题\n\n正文 **粗**' })
    assert.equal(status, 200)
    assert.deepEqual(Object.keys(body).sort(), ['data'])
    assert.deepEqual(Object.keys(body.data).sort(), ['html', 'toc'])
    assert.ok(body.data.html.includes('<h1'), body.data.html)
    assert.ok(body.data.html.includes('<strong>粗</strong>'), body.data.html)
    assert.deepEqual(body.data.toc.map((x) => x.text), ['预览标题'])
  })
})

test('POST /ob/api/render 消毒面：XSS 向量过线零透传（预览与分享页同管线口径）', async () => {
  await withServer(async (base) => {
    const { body } = await postJson(base, '/ob/api/render', {
      content: '<script>alert(1)</script>\n\n[x](javascript&#x3a;alert(1))\n\n<img src=x onerror=alert(1)>',
    })
    const html = body.data.html
    assert.ok(!html.toLowerCase().includes('<script'), html)
    assert.ok(!html.toLowerCase().includes('onerror='), html)
    assert.ok(!/href="[^"]*javascript\s*:/i.test(html), html)
  })
})

test('POST /ob/api/render 负例：缺 content 400 / 非字符串 400', async () => {
  await withServer(async (base) => {
    for (const body of [{}, { content: 42 }]) {
      const { status, body: out } = await postJson(base, '/ob/api/render', body)
      assert.equal(status, 400)
      assert.equal(out.error.code, 'bad_request')
    }
  })
})
