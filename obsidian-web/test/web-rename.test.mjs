// /ob/api/rename 契约测试（T5）：改名/移动多文件事务 API 面——真 node:http 往返 + tmp vault 真写盘。
// 信封纪律（web-routes 同款）：形参/围栏非法 → 400 {error:{code,message}}；
//   事务域结果（成功/目标已存在/回滚态）一律 200 {data:{ok, rolledBack, warnings, changed[]}}（kb_mark ok 键惯例）。
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerWebRoutes } from '../lib/web-routes.js'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const TMP_ROOT = fileURLToPath(new URL('./.tmp-rename-api', import.meta.url))

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

async function withServer(t, fn, opts = {}) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const vault = fs.mkdtempSync(path.join(TMP_ROOT, 'v'))
  fs.cpSync(path.join(FIXTURES, 'vault'), vault, { recursive: true })
  t.after(() => {
    fs.rmSync(vault, { recursive: true, force: true })
    fs.rmSync(TMP_ROOT, { recursive: true, force: true })
  })
  const { routes, ctx } = makeCtx(opts)
  registerWebRoutes(ctx, () => ({ vaultRoot: vault, ui: { pageSize: 50 } }), {
    distDir: path.join(FIXTURES, 'dist'),
  })
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://x').pathname
    const route = routes.get(`exact:${pathname}`)
    if (route) return route.handler(req, res)
    res.writeHead(404)
    res.end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    await fn(base, vault)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

const postRename = (base, body) => fetch(`${base}/ob/api/rename`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

test('POST /ob/api/rename 正例：{data:{ok, rolledBack, warnings, changed[]}} 契约形 + 引用面同步', async (t) => {
  await withServer(t, async (base, vault) => {
    fs.writeFileSync(path.join(vault, 'notes/b.md'), '# B\n\nback [[a]]\n', 'utf8')
    fs.writeFileSync(path.join(vault, 'INDEX.md'), '# INDEX\n\n- [[notes/a]]\n', 'utf8')
    const res = await postRename(base, { from: 'notes/a.md', to: 'notes/z.md' })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(Object.keys(body).sort(), ['data'])
    assert.deepEqual(
      Object.keys(body.data).sort(),
      ['changed', 'from', 'moved', 'ok', 'rewritten', 'rolledBack', 'selfChanges', 'skipped', 'to', 'warnings'],
    )
    assert.equal(body.data.ok, true)
    assert.equal(body.data.rolledBack, false)
    assert.ok(Array.isArray(body.data.warnings))
    assert.ok(Array.isArray(body.data.changed))
    assert.equal(fs.existsSync(path.join(vault, 'notes/a.md')), false)
    assert.ok(fs.readFileSync(path.join(vault, 'notes/b.md'), 'utf8').includes('[[z]]'))
    assert.ok(fs.readFileSync(path.join(vault, 'INDEX.md'), 'utf8').includes('[[notes/z]]'))
  })
})

test('POST /ob/api/rename 目标已存在：域结果走 {data}（ok:false + reason:target-exists，供 UI 三选）', async (t) => {
  await withServer(t, async (base, vault) => {
    fs.writeFileSync(path.join(vault, 'notes/z.md'), '同名既有\n', 'utf8')
    const res = await postRename(base, { from: 'notes/a.md', to: 'notes/z.md' })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.data.ok, false)
    assert.equal(body.data.reason, 'target-exists')
    assert.equal(body.data.rolledBack, false)
    assert.ok(Array.isArray(body.data.warnings))
    assert.ok(Array.isArray(body.data.changed))
    assert.equal(fs.readFileSync(path.join(vault, 'notes/z.md'), 'utf8'), '同名既有\n', '静默覆盖反例必拒')
    // 显式 overwrite 才替换
    const forced = await postRename(base, { from: 'notes/a.md', to: 'notes/z.md', overwrite: true })
    assert.equal((await forced.json()).data.ok, true)
    assert.ok(fs.readFileSync(path.join(vault, 'notes/z.md'), 'utf8').includes('# Note A'))
  })
})

test('POST /ob/api/rename 形参缺失/非法 → 400 {error:{code,message}}', async (t) => {
  await withServer(t, async (base) => {
    for (const body of [{ to: 'notes/z.md' }, { from: 'notes/a.md' }, { from: '../out.md', to: 'notes/z.md' }, { from: 'notes/a.md', to: '/etc/x.md' }]) {
      const res = await postRename(base, body)
      assert.equal(res.status, 400, JSON.stringify(body))
      const err = (await res.json()).error
      assert.equal(err.code, 'bad_request')
      assert.ok(typeof err.message === 'string' && err.message.length > 0)
    }
  })
})

test('POST /ob/api/rename 鉴权缝（OW-INV-8）：过缝失败 403 零事务', async (t) => {
  await withServer(t, async (base, vault) => {
    const before = fs.readFileSync(path.join(vault, 'notes/a.md'), 'utf8')
    const res = await postRename(base, { from: 'notes/a.md', to: 'notes/z.md' })
    assert.equal(res.status, 403)
    assert.equal((await res.json()).error.code, 'forbidden')
    assert.equal(fs.readFileSync(path.join(vault, 'notes/a.md'), 'utf8'), before, '未过鉴权零写盘')
    assert.equal(fs.existsSync(path.join(vault, 'notes/z.md')), false)
  }, { rejection: 403 })
})

test('POST /ob/api/rename 方法守卫：GET 405 + allow 头', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/ob/api/rename?from=notes/a.md&to=notes/z.md`)
    assert.equal(res.status, 405)
    assert.equal(res.headers.get('allow'), 'POST')
  })
})
