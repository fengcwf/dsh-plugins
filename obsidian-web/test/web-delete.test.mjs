// /ob/api/delete 契约测试（T6）：删除可逆 API 面——真 node:http 往返 + tmp vault 真写盘；
// 前端双确认纯逻辑（web/src/lib/delete-confirm.js）单测锁形（组件零业务逻辑，T2/T4 纪律）。
// 信封纪律（web-routes 同款）：形参/围栏非法 → 400 {error:{code,message}}；
//   删除域结果（成功/双确认拒/门拒/落点失败）一律 200 {data:{ok, trashPath, warnings}}（kb_mark ok 键惯例）。
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerWebRoutes } from '../lib/web-routes.js'
import { confirmMatches, buildDeletePayload } from '../web/src/lib/delete-confirm.js'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const TMP_ROOT = fileURLToPath(new URL('./.tmp-delete-api', import.meta.url))

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

const postDelete = (base, body) => fetch(`${base}/ob/api/delete`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

test('POST /ob/api/delete 正例：{data:{ok, path, trashPath, warnings}} 契约形 + 移动语义（源消失、trash 落点在）', async (t) => {
  await withServer(t, async (base, vault) => {
    const res = await postDelete(base, { path: 'notes/a.md', confirm: 'notes/a.md' })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(Object.keys(body).sort(), ['data'])
    assert.deepEqual(Object.keys(body.data).sort(), ['ok', 'path', 'trashPath', 'warnings'])
    assert.equal(body.data.ok, true)
    assert.equal(body.data.path, 'notes/a.md')
    assert.equal(body.data.trashPath, '.trash/notes/a.md')
    assert.equal(fs.existsSync(path.join(vault, 'notes/a.md')), false, '源已移走（移动语义，非 rm 语义之外的真删）')
    assert.ok(fs.existsSync(path.join(vault, '.trash/notes/a.md')), '可逆：内容在 .trash/<rel>')
  })
})

test('POST /ob/api/delete 双确认：缺 confirm → ok:false reason:confirm-missing + 副作用零发生', async (t) => {
  await withServer(t, async (base, vault) => {
    const res = await postDelete(base, { path: 'notes/a.md' })
    assert.equal(res.status, 200, '域结果走 {data} 信封（UI 按 reason 决策）')
    const body = await res.json()
    assert.deepEqual(Object.keys(body.data).sort(), ['message', 'ok', 'reason', 'trashPath', 'warnings'])
    assert.equal(body.data.ok, false)
    assert.equal(body.data.reason, 'confirm-missing')
    assert.equal(body.data.trashPath, null)
    assert.ok(fs.existsSync(path.join(vault, 'notes/a.md')), '源不动')
    assert.equal(fs.existsSync(path.join(vault, '.trash')), false, '.trash 不产生=确认先于一切副作用')
  })
})

test('POST /ob/api/delete 双确认：confirm 复述不符 → ok:false reason:confirm-mismatch + 副作用零发生', async (t) => {
  await withServer(t, async (base, vault) => {
    const res = await postDelete(base, { path: 'notes/a.md', confirm: 'notes/b.md' })
    const body = await res.json()
    assert.equal(body.data.ok, false)
    assert.equal(body.data.reason, 'confirm-mismatch')
    assert.ok(fs.existsSync(path.join(vault, 'notes/a.md')))
    assert.equal(fs.existsSync(path.join(vault, '.trash')), false)
  })
})

test('POST /ob/api/delete 形参/围栏非法 → 400 {error:{code,message}}（缺 path / path 越界）', async (t) => {
  await withServer(t, async (base, vault) => {
    for (const payload of [{ confirm: 'x' }, { path: '../etc/passwd', confirm: '../etc/passwd' }, { path: '/abs.md', confirm: '/abs.md' }]) {
      const res = await postDelete(base, payload)
      assert.equal(res.status, 400, `非法形参必 400：${JSON.stringify(payload)}`)
      const body = await res.json()
      assert.deepEqual(Object.keys(body).sort(), ['error'])
      assert.equal(body.error.code, 'bad_request')
    }
    assert.ok(fs.existsSync(path.join(vault, 'notes/a.md')))
  })
})

test('POST /ob/api/delete 源 lstat 门：symlink 拒 not-a-file / 真实目录删除保留（域结果）', async (t) => {
  await withServer(t, async (base, vault) => {
    fs.symlinkSync(path.join(vault, 'notes/a.md'), path.join(vault, 'notes/link.md'))
    const r1 = await (await postDelete(base, { path: 'notes/link.md', confirm: 'notes/link.md' })).json()
    assert.equal(r1.data.ok, false)
    assert.equal(r1.data.reason, 'not-a-file')
    const r2 = await (await postDelete(base, { path: 'notes', confirm: 'notes' })).json()
    assert.equal(r2.data.ok, true, '真实目录删除保留')
    assert.equal(r2.data.trashPath, '.trash/notes')
    assert.ok(fs.statSync(path.join(vault, '.trash/notes')).isDirectory())
  })
})

test('POST /ob/api/delete 方法守卫 GET→405 + 鉴权缝（OW-INV-8）401/403 直接回拒', async (t) => {
  await withServer(t, async (base) => {
    const getRes = await fetch(`${base}/ob/api/delete`)
    assert.equal(getRes.status, 405)
    assert.equal(getRes.headers.get('allow'), 'POST')
  })
  await withServer(t, async (base) => {
    const res = await postDelete(base, { path: 'notes/a.md', confirm: 'notes/a.md' })
    assert.equal(res.status, 403)
    assert.equal((await res.json()).error.code, 'forbidden')
  }, { rejection: 403 })
  await withServer(t, async (base) => {
    const res = await postDelete(base, { path: 'notes/a.md', confirm: 'notes/a.md' })
    assert.equal(res.status, 401)
    assert.equal((await res.json()).error.code, 'unauthorized')
  }, { rejection: 401 })
})

test('POST /ob/api/delete in-trash 门（修复轮 Issue 1）：./.trash/… 词法形态不绕过 → reason:in-trash + 恢复材料不动', async (t) => {
  await withServer(t, async (base, vault) => {
    fs.mkdirSync(path.join(vault, '.trash'), { recursive: true })
    fs.writeFileSync(path.join(vault, '.trash/keep.md'), 'RECOVERABLE\n', 'utf8')
    const res = await postDelete(base, { path: './.trash/keep.md', confirm: './.trash/keep.md' })
    assert.equal(res.status, 200, '域结果走 {data} 信封')
    const body = await res.json()
    assert.equal(body.data.ok, false)
    assert.equal(body.data.reason, 'in-trash', 'API 面同门（deletePath 规范化判定）')
    assert.equal(fs.readFileSync(path.join(vault, '.trash/keep.md'), 'utf8'), 'RECOVERABLE\n', '恢复材料逐字节不动')
  })
})

// ── 前端双确认纯逻辑（web/src/lib/delete-confirm.js；组件零业务逻辑）───────────────
test('前端双确认：confirmMatches 严格全等（错字/空白/大小写全拒），缺省拒', () => {
  assert.equal(confirmMatches('notes/a.md', 'notes/a.md'), true)
  assert.equal(confirmMatches('notes/a.md ', 'notes/a.md'), false, '尾随空白不匹配')
  assert.equal(confirmMatches(' notes/a.md', 'notes/a.md'), false)
  assert.equal(confirmMatches('notes/A.md', 'notes/a.md'), false, '大小写敏感')
  assert.equal(confirmMatches('', 'notes/a.md'), false)
  assert.equal(confirmMatches(undefined, 'notes/a.md'), false, '缺省（未复述）必拒')
  assert.equal(confirmMatches('notes/a.md', ''), false, '空目标路径不可确认')
})

test('前端双确认：buildDeletePayload 复核双保险——匹配才出载荷，不匹配/缺省一律 null（不发请求）', () => {
  assert.deepEqual(buildDeletePayload('notes/a.md', 'notes/a.md'), { path: 'notes/a.md', confirm: 'notes/a.md' })
  assert.equal(buildDeletePayload('notes/a.md', 'notes/a.md '), null, '不匹配不得出载荷（客户端 crud 复核）')
  assert.equal(buildDeletePayload('notes/a.md', undefined), null)
})
