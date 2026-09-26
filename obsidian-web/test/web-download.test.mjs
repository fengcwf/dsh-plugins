// /ob/api/download 契约测试（T7）：下载导出 API 面——真 node:http 往返 + tmp vault 真写盘。
// 契约（OW-US-7、OW-INV-9）：GET /ob/api/download?path=... 单文件=文本流、目录=zip 流；
//   ≤5000 文件/500MB 限额，超限拒 + 可解释提示（拒绝不截断）。
// 信封纪律（T5/T6 惯例）：域结果（超限拒/回收站拒/门拒/缺文件）一律 200 {data:{ok:false, reason, message}}
//   ——UI 按 reason 决策；仅形参/围栏非法 400 {error:{code,message}}；成功=二进制流（非信封）。
// 安全面：Content-Disposition 文件名消毒（防头注入）；symlink 不跟随（跳过+留痕：logger + x-ob-export-skipped）；
//   .trash 恢复材料拒导出（含 './' 词法形态）。
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { registerWebRoutes, contentDisposition } from '../lib/web-routes.js'
import { MAX_BYTES } from '../lib/export.js'
import { fetchDownload } from '../web/src/api.js'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const TMP_ROOT = fileURLToPath(new URL('./.tmp-download-api', import.meta.url))

function makeCtx({ rejection } = {}) {
  const routes = new Map()
  const warns = []
  return {
    routes,
    warns,
    ctx: {
      logger: { warn: (line) => warns.push(line) },
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
  const vault = opts.fresh ? fs.mkdtempSync(path.join(TMP_ROOT, 'v')) : fs.mkdtempSync(path.join(TMP_ROOT, 'v'))
  if (!opts.fresh) fs.cpSync(path.join(FIXTURES, 'vault'), vault, { recursive: true })
  t.after(() => fs.rmSync(TMP_ROOT, { recursive: true, force: true }))
  const { routes, ctx, warns } = makeCtx(opts)
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
    await fn(base, vault, warns)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

// ── 形参/围栏：400 {error}；域结果：200 {data:{ok:false, reason}} ─────────────────
test('形参/围栏非法 → 400 {error:{code,message}}；鉴权缝拒 → 401', async (t) => {
  await withServer(t, async (base) => {
    const noPath = await fetch(`${base}/ob/api/download`)
    assert.equal(noPath.status, 400)
    assert.equal((await noPath.json()).error.code, 'bad_request')

    const escape = await fetch(`${base}/ob/api/download?path=${encodeURIComponent('../x.md')}`)
    assert.equal(escape.status, 400, '穿越路径=围栏非法 400')
    assert.equal((await escape.json()).error.code, 'bad_request')
  })
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/ob/api/download?path=${encodeURIComponent('notes/a.md')}`)
    assert.equal(res.status, 401, '鉴权缝拒（OW-INV-8）')
  }, { rejection: 401 })
})

test('域拒 200 信封：not-found / in-trash（含 ./ 词法形态）/ not-a-file（symlink 不跟随）', async (t) => {
  await withServer(t, async (base, vault) => {
    fs.mkdirSync(path.join(vault, '.trash', 'notes'), { recursive: true })
    fs.writeFileSync(path.join(vault, '.trash', 'notes', 'a.md'), 'deleted\n')
    fs.symlinkSync(path.join(vault, 'notes', 'a.md'), path.join(vault, 'notes', 'link.md'))

    const missing = await fetch(`${base}/ob/api/download?path=${encodeURIComponent('notes/nope.md')}`)
    assert.equal(missing.status, 200, '域结果=200 信封（T5/T6 惯例）')
    assert.deepEqual(Object.keys((await missing.json()).data).sort(), ['message', 'ok', 'reason'])
    assert.equal((await (await fetch(`${base}/ob/api/download?path=${encodeURIComponent('notes/nope.md')}`)).json()).data.reason, 'not-found')

    for (const rel of ['.trash/notes/a.md', './.trash/notes/a.md']) {
      const res = await fetch(`${base}/ob/api/download?path=${encodeURIComponent(rel)}`)
      const body = await res.json()
      assert.equal(res.status, 200, rel)
      assert.equal(body.data.ok, false, rel)
      assert.equal(body.data.reason, 'in-trash', `回收站拒导出：${rel}`)
    }

    const link = await fetch(`${base}/ob/api/download?path=${encodeURIComponent('notes/link.md')}`)
    const linkBody = await link.json()
    assert.equal(linkBody.data.ok, false)
    assert.equal(linkBody.data.reason, 'not-a-file', 'symlink 不跟随：单文件导出拒')
  })
})

test('限额 API 面：5001 文件/500.1MB 双双拒 + 可解释提示（含实际值与上限）；拒=不产流', async (t) => {
  await withServer(t, async (base, vault) => {
    const dir = path.join(vault, 'many')
    fs.mkdirSync(dir, { recursive: true })
    for (let i = 0; i < 5001; i += 1) fs.closeSync(fs.openSync(path.join(dir, `f${String(i).padStart(5, '0')}.md`), 'w'))
    const res = await fetch(`${base}/ob/api/download?path=${encodeURIComponent('many')}`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /application\/json/, '拒=JSON 信封，不是半截 zip 流')
    const body = await res.json()
    assert.equal(body.data.ok, false)
    assert.equal(body.data.reason, 'limit-exceeded')
    assert.ok(body.data.message.includes('5001') && body.data.message.includes('5000'), `提示可解释：${body.data.message}`)

    // 字节面（稀疏文件=零磁盘成本）：500.1MB 单文件拒
    const big = path.join(vault, 'big.md')
    fs.closeSync(fs.openSync(big, 'w'))
    fs.truncateSync(big, MAX_BYTES + 100 * 1024)
    const res2 = await fetch(`${base}/ob/api/download?path=${encodeURIComponent('big.md')}`)
    const body2 = await res2.json()
    assert.equal(body2.data.ok, false)
    assert.equal(body2.data.reason, 'limit-exceeded')
    assert.ok(body2.data.message.includes(String(MAX_BYTES + 100 * 1024)) && body2.data.message.includes(String(MAX_BYTES)),
      `提示可解释：${body2.data.message}`)
  })
})

// ── 单 md 流形（任务必含⑤）──────────────────────────────────────────────────
test('单 md 流形：text/markdown 文本流 + Content-Disposition + body 逐字节同 + HEAD 无 body', async (t) => {
  await withServer(t, async (base, vault) => {
    const content = '# Note A\n\n内容 中文 ✅\n'
    fs.writeFileSync(path.join(vault, 'notes', 'a.md'), content)
    const res = await fetch(`${base}/ob/api/download?path=${encodeURIComponent('notes/a.md')}`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /text\/markdown/)
    assert.match(res.headers.get('content-disposition'), /^attachment; filename="a\.md"/)
    assert.equal(res.headers.get('content-length'), String(Buffer.byteLength(content)))
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(Buffer.from(content, 'utf8')), '单 md 流=文本原样逐字节')

    const head = await fetch(`${base}/ob/api/download?path=${encodeURIComponent('notes/a.md')}`, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.match(head.headers.get('content-disposition'), /a\.md/)
    assert.equal((await head.arrayBuffer()).byteLength, 0, 'HEAD 零 body')
  })
})

// ── 目录 zip 流 + 解压互验（任务必含②）+ symlink 留痕（③）─────────────────────
test('目录 zip 流：外部解压内容逐字节同 + symlink 跳过留痕（logger + x-ob-export-skipped）+ .trash 不入包', async (t) => {
  await withServer(t, async (base, vault, warns) => {
    const payload = { 'notes/a.md': 'A\n', 'notes/sub/deep.md': 'DEEP\n' }
    for (const [rel, c] of Object.entries(payload)) {
      fs.mkdirSync(path.dirname(path.join(vault, rel)), { recursive: true })
      fs.writeFileSync(path.join(vault, rel), c)
    }
    fs.writeFileSync(path.join(vault, 'secret-outside.txt'), 'OUTSIDE\n')
    fs.symlinkSync(path.join(vault, 'secret-outside.txt'), path.join(vault, 'notes', 'link.md'))
    fs.symlinkSync('/etc/hostname', path.join(vault, 'notes', 'link-escape.md'))
    fs.mkdirSync(path.join(vault, '.trash'), { recursive: true })
    fs.writeFileSync(path.join(vault, '.trash', 'x.md'), 'TRASHED\n')

    const res = await fetch(`${base}/ob/api/download?path=${encodeURIComponent('notes')}`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /application\/zip/)
    assert.match(res.headers.get('content-disposition'), /^attachment; filename="notes\.zip"/)
    assert.equal(res.headers.get('x-ob-export-files'), '2')
    assert.equal(res.headers.get('x-ob-export-skipped'), '2', 'symlink 跳过计数留痕')
    assert.equal(res.headers.get('x-ob-export-bytes'), String(Buffer.byteLength('A\n') + Buffer.byteLength('DEEP\n')))

    const zipPath = path.join(TMP_ROOT, 'notes.zip')
    fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()))
    assert.match(execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' }), /No errors detected/i)
    const names = execFileSync('zipinfo', ['-1', zipPath], { encoding: 'utf8' })
    assert.ok(names.includes('a.md') && names.includes('sub/deep.md'), names)
    assert.ok(!names.includes('link.md') && !names.includes('link-escape.md'), 'symlink 条目不入包')
    assert.ok(!names.includes('TRASHED') && !names.includes('.trash'), '.trash 恢复材料不入包')

    const extractDir = path.join(TMP_ROOT, 'extract')
    execFileSync('unzip', ['-q', '-o', '-d', extractDir, zipPath])
    for (const [rel, c] of Object.entries(payload)) {
      // zip 条目=相对导出目录（无包装目录——lib/export.js 契约）
      const inZip = rel.replace(/^notes\//, '')
      assert.ok(fs.readFileSync(path.join(extractDir, inZip)).equals(Buffer.from(c, 'utf8')), `解压逐字节同：${rel} → ${inZip}`)
    }
    assert.ok(!fs.existsSync(path.join(extractDir, 'link.md')), 'symlink 目标内容零逃逸')

    const skipLines = warns.filter((w) => w.includes('跳过'))
    assert.equal(skipLines.length, 2, `symlink 跳过必须留痕（logger）：${JSON.stringify(warns)}`)
    assert.ok(skipLines.some((w) => w.includes('link.md')) && skipLines.some((w) => w.includes('link-escape.md')))
  }, { fresh: true })
})

// ── 头注入文件名消毒（任务必含④）──────────────────────────────────────────────
test('Content-Disposition 文件名消毒：引号/CR/LF/反斜杠零头注入；filename* UTF-8 可回读', async (t) => {
  await withServer(t, async (base, vault) => {
    const nasty = 'evil"\r\nX-Injected: 1.md'
    fs.writeFileSync(path.join(vault, 'notes', nasty), 'payload\n')
    const res = await fetch(`${base}/ob/api/download?path=${encodeURIComponent(`notes/${nasty}`)}`)
    assert.equal(res.status, 200)
    const disp = res.headers.get('content-disposition')
    assert.ok(!/[\r\n]/.test(disp), `disposition 零 CR/LF（单行头值=注入不成行）：${JSON.stringify(disp)}`)
    assert.ok(!disp.includes('evil"'), '引号不进 filename= 引号串（防断头）')
    assert.equal(res.headers.get('x-injected'), null, '头注入必须零生效')

    // 客户端回读消毒后的名（fetchDownload 真往返）
    const dl = await fetchDownload(`notes/${nasty}`, base)
    assert.equal(dl.ok, true)
    assert.ok(!/[\r\n"]/.test(dl.filename), `客户端回读名同消毒：${JSON.stringify(dl.filename)}`)
    assert.ok(dl.filename.includes('X-Injected: 1.md'), `可辨识不丢字干：${dl.filename}`)
  })

  // contentDisposition 纯函数负例（头注入面逐形态）
  for (const bad of ['a\r\nb', 'a"b', 'a\\b', 'a\0b', '\r\nSet-Cookie: x=1']) {
    const v = contentDisposition(bad)
    assert.ok(!/[\r\n\0]/.test(v), `控制字符剥除：${JSON.stringify(bad)} → ${JSON.stringify(v)}`)
    const fn = /filename="([^"]*)"/.exec(v)
    assert.ok(fn, 'filename= 引号串完整可解析')
    assert.ok(!fn[1].includes('"'), '引号串内零引号')
  }
  assert.match(contentDisposition('中文 笔记.md'), /filename\*=UTF-8''%E4%B8%AD%E6%96%87/, '非 ASCII 走 filename* RFC 5987')
  assert.match(contentDisposition('中文 笔记.md'), /filename="[^"]*"/, '同时给 ASCII 回退名')
  assert.equal(contentDisposition(''), 'attachment; filename="download"; filename*=UTF-8\'\'download', '空名回退 download')
})

// ── 前端 fetchDownload 真往返（成功/域拒两形）────────────────────────────────
test('web/src/api.js fetchDownload：成功→blob+回读文件名；域拒→ok:false+message（真 HTTP 往返）', async (t) => {
  await withServer(t, async (base) => {
    const ok = await fetchDownload('notes/a.md', base)
    assert.equal(ok.ok, true)
    assert.equal(ok.filename, 'a.md')
    assert.equal(typeof ok.blob.size, 'number')
    assert.ok(ok.blob.size > 0)
    const missing = await fetchDownload('notes/nope.md', base)
    assert.equal(missing.ok, false)
    assert.equal(missing.reason, 'not-found')
    assert.ok(missing.message.length > 0, '域拒必须带可解释 message')
  })
})
