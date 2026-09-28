// share-server — 分享服务独立入口 HTTP 面（T9 / OW-INV-2/6/10/11、C2 交接契约）
// 面契约（本卡锁定）：
//   - 入口 `3500 /ob_share/<token>` 精确前缀 fail-closed（大小写敏感、/ob_share 无尾斜杠不算面内）；
//     范围外路径→统一 404 四键体；面内方法越界/操作越权→统一 405 形 + allow 头（判在 checkAccess 之后）。
//   - 一切鉴权/存在性/范围失败 = 同一 404 响应体（accessDenied() 冻结四键形，逐字节同）；
//     限流（含缺 ip）= 429 统一形；管理面可解释错误（sensitive_name/password_required 等）绝不回 guest。
//   - 访客页 = 服务端 render.js 直出 HTML（live 渲染唯一源，禁前端二次渲染=零 <script>）+ 脱敏哨兵前置。
//   - guest 写操作只调不重造（vault-ops saveNote/createNote/deletePath/renameNote）：乐观锁+diffUndo+trash+事务。
//   - IP 口径 = socket.remoteAddress only（显式 server.trustProxy 清单才解析 XFF 最右可信跳）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createShareServer, guestIp } from '../lib/share-server.js'
import { createShare, accessDenied, rateLimited, generateToken, revokeShare } from '../lib/share.js'
import { renderMarkdown } from '../lib/render.js'
import { redact, REDACTED } from '../lib/redact.js'
import { apply } from '../lib/index.js'

const TMP = fileURLToPath(new URL('./.tmp-share-server', import.meta.url))
fs.mkdirSync(TMP, { recursive: true })
// 0.1.1 起索引库落本地盘 <indexDir>/<vault 名-哈希>/（迁出 CIFS）——apply 接线测试显式给 indexDir
//   （HOME 污染防线；落点解析语义单独锁定 test/index-dir.test.mjs）
const IDX_BASE = path.join(TMP, 'idx')

// 冻结形字面锁定（与 share.js 单源逐字节对齐 + 本文件独立字面双锁）
const NOT_FOUND_BODY = '{"ok":false,"status":404,"code":"not_found","message":"分享不存在或已失效"}'
const RATE_LIMITED_BODY = '{"ok":false,"status":429,"code":"rate_limited","message":"请求过于频繁，请稍后重试"}'
const NOT_ALLOWED_BODY = '{"ok":false,"status":405,"code":"not_allowed","message":"不支持的请求方法或操作"}'
const BAD_REQUEST_BODY = '{"ok":false,"status":400,"code":"bad_request","message":"请求参数不合法"}'

function makeVault(tag, files = {}) {
  const root = fs.mkdtempSync(path.join(TMP, `${tag}-`))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return root
}

/** 盘面清扫（C-1 fix r2）：vault 全树哨兵原文落点收集（写面中和判据：零落盘） */
function diskNeedles(root, needles) {
  const hits = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) { walk(abs); continue }
      const t = fs.readFileSync(abs, 'utf8')
      for (const n of needles) if (t.includes(n)) hits.push(`${path.relative(root, abs)} ⊃ ${n}`)
    }
  }
  walk(root)
  return hits
}

function makeConfig(vault, overrides = {}) {
  return {
    vaultRoot: vault,
    share: { enabled: true, defaultTtlDays: 7, requirePasswordForWrite: true, ...(overrides.share ?? {}) },
    server: { sharePort: 0, trustProxy: [], ...(overrides.server ?? {}) },
    ui: { pageSize: 50 },
  }
}

async function withServer(config, fn, opts = {}) {
  const handle = createShareServer({
    getConfig: () => config,
    port: opts.port ?? 0,
    host: '127.0.0.1',
    syncIntervalMs: 0,
  })
  const started = await handle.start()
  if (opts.expectListening === false) {
    assert.equal(started.listening, false, '禁用配置不得起监听')
  } else {
    assert.equal(started.listening, true, '监听应起')
  }
  const base = `http://127.0.0.1:${handle.address()?.port ?? opts.port}`
  try {
    await fn(base, handle)
  } finally {
    await handle.close()
  }
}

/** 起面后首请求重试（listen 异步收敛的真等待，不 sleep 盲等） */
async function waitForFace(url, tries = 100) {
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url)
    } catch {
      await new Promise((r) => setTimeout(r, 10))
    }
  }
  throw new Error(`面未起：${url}`)
}

/** 探一个空闲端口（真绑定-释放；仅用于「应无面」断言） */
function probePort() {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}

const get = (url, opts) => fetch(url, opts)

// ── ① 精确前缀 fail-closed ────────────────────────────────────────────────────
test('① 精确前缀 fail-closed：范围外路径一律同形 404（GET/POST/DELETE × 前缀近似形/大小写/空 token）', async () => {
  const vault = makeVault('prefix', { 'hello.md': '# hi' })
  const config = makeConfig(vault)
  const { share } = await createShare(vault, { target: 'hello.md', role: 'read' })
  await withServer(config, async (base) => {
    const outside = [
      '/', '/ob', '/ob_share', '/ob_share/', '/ob_sharex/' + share.token,
      '/Ob_share/' + share.token, '/ob_Share/' + share.token, '/x/y', '/ob_share%2F' + share.token,
    ]
    for (const p of outside) {
      for (const method of ['GET', 'POST', 'DELETE']) {
        const res = await get(base + p, { method })
        assert.equal(res.status, 404, `${method} ${p} 应 404`)
        assert.equal(await res.text(), NOT_FOUND_BODY, `${method} ${p} 应统一 404 体`)
      }
    }
  })
})

test('① URL 词法穿越形（raw ../、%2e%2e、%00、%5c、绝对形）一律同形 404（穿越防护）', async () => {
  const vault = makeVault('traversal', { 'hello.md': '# hi', 'secret.md': 'secret' })
  const config = makeConfig(vault)
  const { share } = await createShare(vault, { target: 'hello.md', role: 'read' })
  const t = share.token
  await withServer(config, async (base) => {
    const bad = [
      `/ob_share/${t}/../secret.md`, `/ob_share/${t}/%2e%2e/secret.md`, `/ob_share/${t}/..%2fsecret.md`,
      `/ob_share/${t}/a/%2e%2e/%2e%2e/secret.md`, `/ob_share/${t}/%00.md`, `/ob_share/${t}/%5c..%5csecret.md`,
      `/ob_share/${t}//etc/passwd`, `/ob_share/${t}/%2fetc%2fpasswd`,
    ]
    for (const p of bad) {
      const res = await get(base + p)
      assert.equal(res.status, 404, `${p} 应 404`)
      assert.equal(await res.text(), NOT_FOUND_BODY, `${p} 应统一 404 体`)
    }
  })
})

test('① 面内方法越界 → 405 统一形 + allow 头；坏 token 方法越界 404 先于 405（不泄露存在性）', async () => {
  const vault = makeVault('method', { 'hello.md': '# hi' })
  const config = makeConfig(vault)
  const { share } = await createShare(vault, { target: 'hello.md', role: 'read' })
  await withServer(config, async (base) => {
    for (const method of ['PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      const res = await get(`${base}/ob_share/${share.token}`, { method })
      assert.equal(res.status, 405, `${method} 应 405`)
      assert.equal(await res.text(), NOT_ALLOWED_BODY)
      assert.equal(res.headers.get('allow'), 'GET, HEAD, POST', 'allow 头列白名单方法')
    }
    for (const p of [`/ob_share/${generateToken()}`, '/ob_share/short', '/ob_share/']) {
      const res = await get(base + p, { method: 'DELETE' })
      assert.equal(res.status, 404, `${p} 坏 token 不得用 405 泄露存在性`)
      assert.equal(await res.text(), NOT_FOUND_BODY)
    }
  })
})

// ── ② 404 九形态同形（含管理面错误不外泄）────────────────────────────────────
test('② 404 九形态同形（错密码/缺密码/过期/撤销/一次性已消耗/不存在/坏 token 形/空 token/配置禁用）逐字节同', async () => {
  const vault = makeVault('shapes', { 'hello.md': '# hi', 'notes/a.md': 'a' })
  const config = makeConfig(vault)
  const bodies = []
  const collect = async (res) => {
    assert.equal(res.status, 404)
    bodies.push(await res.text())
  }
  await withServer(config, async (base) => {
    // ① 错密码 ② 缺密码
    const pw = await createShare(vault, { target: 'hello.md', role: 'read', password: 'pw-secret-1' })
    await collect(await get(`${base}/ob_share/${pw.share.token}?password=wrong`))
    await collect(await get(`${base}/ob_share/${pw.share.token}`))
    // ③ 过期（恰过期）
    const exp = await createShare(vault, { target: 'hello.md', role: 'read', expiresAt: Date.now() - 1000 })
    await collect(await get(`${base}/ob_share/${exp.share.token}`))
    // ④ 撤销
    const rev = await createShare(vault, { target: 'hello.md', role: 'read' })
    await revokeShare(vault, rev.share.token)
    await collect(await get(`${base}/ob_share/${rev.share.token}`))
    // ⑤ 一次性已消耗（首过二次 404）
    const one = await createShare(vault, { target: 'hello.md', role: 'read', oneShot: true })
    const first = await get(`${base}/ob_share/${one.share.token}`)
    assert.equal(first.status, 200, '一次性首过')
    await collect(await get(`${base}/ob_share/${one.share.token}`))
    // ⑥ 不存在（合法 token 形）⑦ 坏 token 形 ⑧ 空 token
    await collect(await get(`${base}/ob_share/${generateToken()}`))
    await collect(await get(`${base}/ob_share/short`))
    await collect(await get(`${base}/ob_share/`))
    // 管理面可解释错误不外泄：敏感名/内部段 subPath 与撤销面 POST 同形
    await collect(await get(`${base}/ob_share/${pw.share.token}/x.pem?password=pw-secret-1`))
    await collect(await get(`${base}/ob_share/${pw.share.token}/.ob-share/${pw.share.token}.json?password=pw-secret-1`))
    await collect(await get(`${base}/ob_share/${rev.share.token}`, { method: 'POST', body: '{}' }))
    // 形①-⑧ + 探针全部逐字节同（含管理面错误零外泄）
    for (const b of bodies) assert.equal(b, NOT_FOUND_BODY)
    assert.equal(new Set(bodies).size, 1, '九形态 + 探针逐字节同形')
  })
})

test('②bis 404 九形态（第⑨形：配置禁用面）同形 404 + 起不连两态皆面关', async () => {
  const vault = makeVault('disabled', { 'hello.md': '# hi' })
  const live = await createShare(vault, { target: 'hello.md', role: 'read' })
  // 形⑨a：启动即禁用 → 不监听（面消失）
  const disabledBoot = makeConfig(vault, { share: { enabled: false } })
  const deadPort = await probePort()
  await withServer(disabledBoot, async (base) => {
    await assert.rejects(() => get(base + `/ob_share/${live.share.token}`), '禁用面不得响应（连接拒绝）')
  }, { expectListening: false, port: deadPort })
  // 形⑨b：运行中热禁用（未 sync）→ 首个请求统一 404 且自关（面消失）
  const config = makeConfig(vault)
  await withServer(config, async (base, handle) => {
    config.share.enabled = false
    const res = await get(base + `/ob_share/${live.share.token}`)
    assert.equal(res.status, 404)
    assert.equal(await res.text(), NOT_FOUND_BODY, '热禁用首请求仍统一 404 体')
    for (let i = 0; i < 50; i++) {
      try {
        await get(base + `/ob_share/${live.share.token}`)
      } catch {
        return // 面消失（连接拒绝）= 关停演练通过
      }
      await new Promise((r) => setTimeout(r, 20))
    }
    assert.fail('热禁用后面应自关（连接拒绝）')
  })
})

test('② 404 体=share.js accessDenied() 冻结四键形单源逐字节对齐（防漂移）', () => {
  assert.equal(JSON.stringify(accessDenied()), NOT_FOUND_BODY)
  assert.equal(JSON.stringify(rateLimited()), RATE_LIMITED_BODY)
  assert.deepEqual(Object.keys(accessDenied()), ['ok', 'status', 'code', 'message'])
})

// ── ③ guest 写矩阵：笔记分享（写）=仅内容编辑 ────────────────────────────────
test('③ 笔记分享（写）=仅内容编辑：edit✓（乐观锁+diffUndo），create/delete/rename→405，他路径→404', async () => {
  const vault = makeVault('file-write', { 'hello.md': '# 旧内容 sk-oldtoken1234567890', 'other.md': '他文件' }) // fixture 带哨兵（C-1 脱敏版往返锁定）
  const config = makeConfig(vault)
  const { share, password } = await createShare(vault, { target: 'hello.md', role: 'write', autoPassword: true })
  const q = `?password=${encodeURIComponent(password)}`
  await withServer(config, async (base) => {
    const url = `${base}/ob_share/${share.token}${q}`
    // 读面（含编辑形态；锁经响应头给出）
    const page = await get(url)
    assert.equal(page.status, 200)
    const mtime = Number(page.headers.get('x-ob-mtime'))
    const etag = page.headers.get('x-ob-etag')
    assert.ok(Number.isFinite(mtime) && typeof etag === 'string' && etag !== '')
    // edit ✓（成功 + diffUndo=undo 源——C-1 翻正：对外 content 面一律脱敏版往返，原文零外泄）
    const saved = await get(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'edit', content: '# 新内容 sk-newtoken1234567890', expectedMtime: mtime }),
    })
    assert.equal(saved.status, 200)
    const savedBody = await saved.json()
    assert.equal(savedBody.data.ok, true)
    assert.equal(savedBody.data.subPath, '', 'guest 响应回 subPath 不回 vault 路径')
    assert.equal(savedBody.data.diffUndo.before.content, '# 旧内容 <redacted>', 'diffUndo.before=脱敏版快照（undo 恢复脱敏版与 C5 自洽；guest 只见脱敏版）')
    assert.equal(savedBody.data.diffUndo.after.content, '# 新内容 <redacted>', 'diffUndo.after=脱敏版快照')
    assert.equal(savedBody.data.diffUndo.before.redactCount, 1, '计数如实（before 中和 1 处）')
    assert.equal(savedBody.data.diffUndo.after.redactCount, 1, '计数如实（after 中和 1 处）')
    assert.equal(fs.readFileSync(path.join(vault, 'hello.md'), 'utf8'), '# 新内容 <redacted>', '保存=脱敏版覆盖落盘（C5 写面中和，盘上=脱敏版逐字节；fix r2）')
    assert.ok(!JSON.stringify(savedBody).includes(vault), 'guest 响应零 vault 绝对路径')
    assert.ok(!JSON.stringify(savedBody).includes('hello.md'), 'guest 响应零 vault-rel 路径')
    for (const raw of ['sk-oldtoken1234567890', 'sk-newtoken1234567890']) {
      assert.ok(!JSON.stringify(savedBody).includes(raw), `哨兵原文零外泄（C-1 负例：${raw}）`)
    }
    // 乐观锁冲突（stale mtime）→ conflict 形（对比面 before/incoming 三选数据基础；C-1 翻正：同脱敏版）
    const conflict = await get(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'edit', content: '竞争写 sk-inctoken1234567890', expectedMtime: mtime }),
    })
    assert.equal(conflict.status, 200)
    const conflictBody = await conflict.json()
    assert.equal(conflictBody.data.conflict, true)
    assert.equal(conflictBody.data.diffUndo.before.content, '# 新内容 <redacted>', '冲突 before=盘上现内容脱敏版（重载/对比基线；原文零外泄）')
    assert.equal(conflictBody.data.diffUndo.incoming.content, '竞争写 <redacted>', '冲突 incoming=本次尝试脱敏版（对比面）')
    assert.equal(conflictBody.data.diffUndo.before.redactCount, 1, '计数如实（冲突 before 中和 1 处）')
    assert.equal(conflictBody.data.diffUndo.incoming.redactCount, 1, '计数如实（冲突 incoming 中和 1 处）')
    for (const raw of ['sk-newtoken1234567890', 'sk-inctoken1234567890']) {
      assert.ok(!JSON.stringify(conflictBody).includes(raw), `冲突形哨兵原文零外泄（C-1 负例：${raw}）`)
    }
    assert.equal(fs.readFileSync(path.join(vault, 'hello.md'), 'utf8'), '# 新内容 <redacted>', '冲突不落盘（OW-INV-3；盘上=脱敏版逐字节）')
    // 无乐观锁不落盘 → 400 统一形（零内部 message 外泄）
    const noLock = await get(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'edit', content: 'x' }),
    })
    assert.equal(noLock.status, 400)
    assert.equal(await noLock.text(), BAD_REQUEST_BODY)
    // create/delete/rename → 405（笔记分享（写）仅内容编辑）
    for (const body of [
      { op: 'create', name: 'new.md' },
      { op: 'delete', confirm: '' },
      { op: 'rename', to: 'renamed.md' },
    ]) {
      const res = await get(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      assert.equal(res.status, 405, `${body.op} 笔记分享写应 405`)
      assert.equal(await res.text(), NOT_ALLOWED_BODY)
    }
    // 他路径 → 404（file 分享只寻址目标本体）
    const other = await get(`${base}/ob_share/${share.token}/other.md${q}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'edit', content: 'x', expectedMtime: 1 }),
    })
    assert.equal(other.status, 404)
    assert.equal(await other.text(), NOT_FOUND_BODY)
    assert.equal(fs.readFileSync(path.join(vault, 'other.md'), 'utf8'), '他文件', '范围外零写入')
    // 穿越写 → 404（穿越防护）
    const traversal = await get(`${base}/ob_share/${share.token}/%2e%2e%2fother.md${q}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'edit', content: 'x', expectedMtime: 1 }),
    })
    assert.equal(traversal.status, 404)
    assert.equal(await traversal.text(), NOT_FOUND_BODY)
    assert.equal(fs.readFileSync(path.join(vault, 'other.md'), 'utf8'), '他文件', '穿越零写入')
    assert.equal(fs.readFileSync(path.join(vault, 'hello.md'), 'utf8'), '# 新内容 <redacted>', '穿越零副作用（盘上=脱敏版逐字节）')
    // undo 往返（C-1 fix r2）：undo 源=diffUndo.before.content（脱敏版）→ 回写即恢复脱敏版（口径自洽，零数据自伤）
    const undoPage = await get(url)
    const undoMtime = Number(undoPage.headers.get('x-ob-mtime'))
    const undone = await get(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'edit', content: savedBody.data.diffUndo.before.content, expectedMtime: undoMtime }),
    })
    assert.equal(undone.status, 200)
    assert.equal(fs.readFileSync(path.join(vault, 'hello.md'), 'utf8'), savedBody.data.diffUndo.before.content, 'undo 恢复=undo 源逐字节（脱敏版恢复=C5 口径自洽）')
    assert.deepEqual(diskNeedles(vault, ['sk-oldtoken1234567890', 'sk-newtoken1234567890', 'sk-inctoken1234567890']), [], '盘面清扫：哨兵原文零落盘（写面中和）')
  })
})

test('③ 只读分享：一切写操作 405（read 角色=仅读）', async () => {
  const vault = makeVault('read-only', { 'notes/a.md': 'a' })
  const config = makeConfig(vault)
  const { share } = await createShare(vault, { target: 'notes', role: 'read' })
  await withServer(config, async (base) => {
    for (const [sub, body] of [
      ['', { op: 'create', name: 'new.md', content: 'x' }],
      ['/a.md', { op: 'edit', content: 'x', expectedMtime: 1 }],
      ['/a.md', { op: 'delete', confirm: 'a.md' }],
      ['/a.md', { op: 'rename', to: 'b.md' }],
    ]) {
      const res = await get(`${base}/ob_share/${share.token}${sub}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      assert.equal(res.status, 405, `read 角色 ${body.op} 应 405`)
      assert.equal(await res.text(), NOT_ALLOWED_BODY)
    }
    assert.equal(fs.readFileSync(path.join(vault, 'notes/a.md'), 'utf8'), 'a', '只读面零写入')
  })
})

// ── ③ guest 写矩阵：文件夹分享（写）=目录内新建/编辑/删除/改名 ─────────────────
test('③ 文件夹分享（写）=目录内新建/编辑/删除/改名四操作✓（乐观锁/undo/trash/事务复用），本体改删名✗', async () => {
  const vault = makeVault('dir-write', { 'notes/a.md': '内容A sk-atoken1234567890', 'notes/b.md': '内容B' }) // a.md 带哨兵（C-1 脱敏版往返锁定）
  const config = makeConfig(vault)
  const { share, password } = await createShare(vault, { target: 'notes', role: 'write', autoPassword: true })
  const q = `?password=${encodeURIComponent(password)}`
  await withServer(config, async (base) => {
    const rootUrl = `${base}/ob_share/${share.token}${q}`
    // 新建 ✓（op 门先行 + createNote 永不静默覆盖）
    const created = await get(rootUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'create', name: 'new.md', content: '# 新建' }),
    })
    assert.equal(created.status, 200)
    const createdBody = await created.json()
    assert.equal(createdBody.data.ok, true)
    assert.equal(createdBody.data.subPath, 'new.md')
    assert.equal(fs.readFileSync(path.join(vault, 'notes/new.md'), 'utf8'), '# 新建')
    // create 同族写面中和（C-1 fix r2）：body.content 同过 redact() 落盘=脱敏版逐字节
    const createdSecret = await get(rootUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'create', name: 'secret.md', content: '# 新建 sk-newsecret1234567890' }),
    })
    assert.equal(createdSecret.status, 200)
    assert.equal(fs.readFileSync(path.join(vault, 'notes/secret.md'), 'utf8'), '# 新建 <redacted>', 'create 落盘=脱敏版逐字节（写面中和，fix r2）')
    assert.deepEqual(diskNeedles(vault, ['sk-newsecret1234567890']), [], 'create 盘面清扫：哨兵原文零落盘')
    // 新建重名 → target-exists 域结果 + 零覆盖
    const again = await get(rootUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'create', name: 'new.md', content: '覆盖' }),
    })
    assert.equal((await again.json()).data.reason, 'target-exists')
    assert.equal(fs.readFileSync(path.join(vault, 'notes/new.md'), 'utf8'), '# 新建', '重名新建零覆盖')
    // 新建敏感名/穿越名 → 统一 404（范围失败，管理面错误不外泄）
    for (const name of ['x.pem', '../evil.md', '/etc/evil.md', 'sub/.env']) {
      const res = await get(rootUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'create', name, content: 'x' }),
      })
      assert.equal(res.status, 404, `create ${name} 应 404`)
      assert.equal(await res.text(), NOT_FOUND_BODY)
    }
    assert.equal(fs.existsSync(path.join(vault, 'evil.md')), false)
    assert.equal(fs.existsSync(path.join(vault, 'notes/x.pem')), false)
    // 编辑 ✓（乐观锁 + diffUndo）
    const pageA = await get(`${base}/ob_share/${share.token}/a.md${q}`)
    const mtimeA = Number(pageA.headers.get('x-ob-mtime'))
    const edited = await get(`${base}/ob_share/${share.token}/a.md${q}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'edit', content: '内容A2', expectedMtime: mtimeA }),
    })
    const editedBody = await edited.json()
    assert.equal(editedBody.data.ok, true)
    assert.equal(editedBody.data.subPath, 'a.md')
    assert.equal(editedBody.data.diffUndo.before.content, '内容A <redacted>', 'C-1 翻正：diffUndo.before=脱敏版快照（原文零外泄）')
    assert.equal(editedBody.data.diffUndo.before.redactCount, 1, '计数如实')
    assert.ok(!JSON.stringify(editedBody).includes('sk-atoken1234567890'), '哨兵原文零外泄（C-1 负例）')
    assert.equal(fs.readFileSync(path.join(vault, 'notes/a.md'), 'utf8'), '内容A2')
    // 改名 ✓（事务复用；guest 响应零 vault 路径）
    const renamed = await get(`${base}/ob_share/${share.token}/a.md${q}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'rename', to: 'renamed.md' }),
    })
    const renamedBody = await renamed.json()
    assert.equal(renamedBody.data.ok, true)
    assert.equal(renamedBody.data.subPath, 'a.md')
    assert.equal(renamedBody.data.to, 'renamed.md')
    assert.equal(fs.readFileSync(path.join(vault, 'notes/renamed.md'), 'utf8'), '内容A2')
    assert.equal(fs.existsSync(path.join(vault, 'notes/a.md')), false)
    assert.ok(!JSON.stringify(renamedBody).includes(vault))
    assert.ok(!JSON.stringify(renamedBody).includes('notes/renamed.md'), 'guest 响应零 vault-rel 路径')
    // 改名到已存在名 → target-exists（永不静默覆盖，OW-INV-5）
    const clash = await get(`${base}/ob_share/${share.token}/renamed.md${q}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'rename', to: 'b.md' }),
    })
    assert.equal((await clash.json()).data.reason, 'target-exists')
    assert.equal(fs.readFileSync(path.join(vault, 'notes/b.md'), 'utf8'), '内容B', 'rename 不覆盖既有')
    assert.equal(fs.readFileSync(path.join(vault, 'notes/renamed.md'), 'utf8'), '内容A2')
    // 改名到范围外/穿越 → 统一 404
    for (const to of ['../out.md', '/abs.md', 'x.pem', 'sub/../.ob-share/x.json']) {
      const res = await get(`${base}/ob_share/${share.token}/renamed.md${q}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'rename', to }),
      })
      assert.equal(res.status, 404, `rename to ${to} 应 404`)
      assert.equal(await res.text(), NOT_FOUND_BODY)
    }
    assert.equal(fs.existsSync(path.join(vault, 'out.md')), false)
    assert.equal(fs.existsSync(path.join(vault, 'abs.md')), false)
    // 删除 ✓（双确认先行 + trash 可逆）
    const noConfirm = await get(`${base}/ob_share/${share.token}/b.md${q}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'delete' }),
    })
    assert.equal((await noConfirm.json()).data.reason, 'confirm-missing', '缺双确认拒（副作用零发生）')
    const badConfirm = await get(`${base}/ob_share/${share.token}/b.md${q}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'delete', confirm: 'renamed.md' }),
    })
    assert.equal((await badConfirm.json()).data.reason, 'confirm-mismatch')
    assert.equal(fs.readFileSync(path.join(vault, 'notes/b.md'), 'utf8'), '内容B', '确认失败零副作用')
    const deleted = await get(`${base}/ob_share/${share.token}/b.md${q}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'delete', confirm: 'b.md' }),
    })
    const deletedBody = await deleted.json()
    assert.equal(deletedBody.data.ok, true)
    assert.equal(deletedBody.data.subPath, 'b.md')
    assert.equal(deletedBody.data.trashed, true, 'trash 可逆语义声明')
    assert.ok(!JSON.stringify(deletedBody).includes('.trash'), 'guest 响应零 trash 内部路径')
    assert.equal(fs.existsSync(path.join(vault, 'notes/b.md')), false)
    assert.equal(fs.readFileSync(path.join(vault, '.trash/notes/b.md'), 'utf8'), '内容B', '删除可逆（.trash 落点）')
    // 目录本体改/删/名 → 405（本体只读，四操作恰限目录内条目）
    for (const body of [
      { op: 'edit', content: 'x', expectedMtime: 1 },
      { op: 'delete', confirm: '' },
      { op: 'rename', to: 'x.md' },
    ]) {
      const res = await get(rootUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      assert.equal(res.status, 405, `本体 ${body.op} 应 405`)
      assert.equal(await res.text(), NOT_ALLOWED_BODY)
    }
  })
})

test('③ 未知 op/缺 op → 405 统一形（操作越权同形不外泄）', async () => {
  const vault = makeVault('op', { 'notes/a.md': 'a' })
  const config = makeConfig(vault)
  const { share, password } = await createShare(vault, { target: 'notes', role: 'write', autoPassword: true })
  await withServer(config, async (base) => {
    for (const body of [{ op: 'rm' }, {}, { op: 'read' }, { op: 123 }]) {
      const res = await get(`${base}/ob_share/${share.token}/a.md?password=${encodeURIComponent(password)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      assert.equal(res.status, 405, `${JSON.stringify(body)} 应 405`)
      assert.equal(await res.text(), NOT_ALLOWED_BODY)
    }
  })
})

test('③ 表单写面（无 JS）：urlencoded POST 编辑往返成功 + 冲突页给重试形态（禁前端二次渲染不含 script）', async () => {
  const vault = makeVault('form', { 'hello.md': '# 表单 sk-formtoken1234567890' }) // fixture 带哨兵（I-1 预填脱敏版锁定）
  const config = makeConfig(vault)
  const { share, password } = await createShare(vault, { target: 'hello.md', role: 'write', autoPassword: true })
  const q = `?password=${encodeURIComponent(password)}`
  await withServer(config, async (base) => {
    const page = await get(`${base}/ob_share/${share.token}${q}`)
    const html = await page.text()
    assert.ok(html.includes('<form method="POST"'), '写分享页带表单（无 JS 可用）')
    assert.ok(html.includes('name="expectedMtime"'), '表单携带乐观锁')
    assert.ok(!html.includes('sk-formtoken1234567890'), '编辑框预填=脱敏版（:564 同口径，哨兵不因编辑面旁路）')
    assert.ok(html.includes('&lt;redacted&gt;'), '预填脱敏占位符可见')
    const mtime = Number(page.headers.get('x-ob-mtime'))
    const posted = await get(`${base}/ob_share/${share.token}${q}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ op: 'edit', content: '# 表单改 sk-editedtoken12345678', expectedMtime: String(mtime), password }).toString(),
    })
    assert.equal(posted.status, 200)
    const postedHtml = await posted.text()
    assert.ok(!postedHtml.includes('<script'), '结果页零 script')
    assert.ok(postedHtml.includes('已保存') || postedHtml.includes('保存'), '结果页给保存反馈')
    assert.equal(fs.readFileSync(path.join(vault, 'hello.md'), 'utf8'), '# 表单改 <redacted>', '保存=脱敏版覆盖落盘（C5 写面中和，盘上=脱敏版逐字节；fix r2）')
    // 冲突（stale 锁）→ 结果页给冲突重试形态
    const conflict = await get(`${base}/ob_share/${share.token}${q}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ op: 'edit', content: '竞争', expectedMtime: String(mtime), password }).toString(),
    })
    assert.equal(conflict.status, 200)
    const conflictHtml = await conflict.text()
    assert.ok(conflictHtml.includes('冲突'), '冲突显式可见（三选数据基础）')
    assert.ok(conflictHtml.includes('name="expectedMtime"'), '冲突页重试带新锁')
    assert.ok(!conflictHtml.includes('<script'))
    // I-1 翻正：冲突重试表单预填=脱敏版（同页渲染脱敏、表单不得给原文——与 :564 同口径）
    assert.ok(!conflictHtml.includes('sk-editedtoken12345678'), '冲突重试表单预填哨兵原文零外泄（I-1 负例）')
    assert.ok(conflictHtml.includes('&lt;redacted&gt;'), '冲突表单预填=脱敏版')
    assert.match(conflictHtml, /已中和 1 处/, '冲突页计数如实（预填内容中和 1 处）')
    assert.equal(fs.readFileSync(path.join(vault, 'hello.md'), 'utf8'), '# 表单改 <redacted>', '冲突不落盘（盘上=脱敏版逐字节）')
  })
})

test('③/C2-3 目录分享列表：敏感/内部段/点文件/symlink 条目零出条目（渲染面不出）', async () => {
  const vault = makeVault('listing', {
    'notes/a.md': 'a',
    'notes/sub/c.md': 'c',
    'notes/.env': 'SECRET=1',
    'notes/x.pem': 'pem',
    'notes/.hidden.md': 'h',
    'notes/.trash/old.md': 'old',
    'notes/.ob-share/x.json': '{}',
    'notes/deep.key.md': 'k',
  })
  fs.symlinkSync('/etc/passwd', path.join(vault, 'notes/link.md'))
  const config = makeConfig(vault)
  const { share } = await createShare(vault, { target: 'notes', role: 'read' })
  await withServer(config, async (base) => {
    const res = await get(`${base}/ob_share/${share.token}`)
    assert.equal(res.status, 200)
    const html = await res.text()
    for (const shown of ['a.md', 'sub']) {
      assert.ok(html.includes(shown), `列表应出：${shown}`)
    }
    for (const hidden of ['.env', 'x.pem', '.hidden', '.trash', '.ob-share', 'deep.key.md', 'link.md', 'passwd']) {
      assert.ok(!html.includes(hidden), `列表不得出：${hidden}`)
    }
    // 子目录列表同判（c.md 在 sub 内可见；过滤规则不随层级失效）
    const sub = await get(`${base}/ob_share/${share.token}/sub`)
    assert.equal(sub.status, 200)
    assert.ok((await sub.text()).includes('c.md'), '子目录条目正常出')
    // 直接寻址同样 fail-closed
    for (const sub of ['link.md', '.env', 'x.pem', '.trash/old.md', 'deep.key.md']) {
      const direct = await get(`${base}/ob_share/${share.token}/${sub}`)
      assert.equal(direct.status, 404, `${sub} 应 404`)
      assert.equal(await direct.text(), NOT_FOUND_BODY)
    }
  })
})

// ── ④ 脱敏哨兵（分享面）──────────────────────────────────────────────────────
test('④ 分享内容过脱敏哨兵：sk-/PEM/ghp_/Bearer 中和+计数（render 前脱敏），原文零残留', async () => {
  const PEM = ['-----BEGIN PRIVATE KEY-----', 'MIIEvQIBADANBgkqhkiG9w0BAQEF', '-----END PRIVATE KEY-----'].join('\n')
  const secretNote = [
    '# 笔记', '',
    'key1 sk-abcdef1234567890 end', '',
    PEM, '',
    'token ghp_abcdef1234567890 end', '',
    'auth Bearer abcdef1234567890 end',
  ].join('\n')
  const vault = makeVault('redact', { 'hello.md': secretNote, 'notes/raw.txt': 'sk-abcdef1234567890 raw' })
  const config = makeConfig(vault)
  const { share } = await createShare(vault, { target: 'hello.md', role: 'read' })
  const dirShare = await createShare(vault, { target: 'notes', role: 'read' })
  await withServer(config, async (base) => {
    const res = await get(`${base}/ob_share/${share.token}`)
    const html = await res.text()
    for (const needle of ['sk-abcdef1234567890', 'ghp_abcdef1234567890', 'Bearer abcdef1234567890', 'BEGIN PRIVATE KEY', 'MIIEvQIBADANBgkqhkiG9w0BAQEF']) {
      assert.ok(!html.includes(needle), `哨兵泄漏：${needle}`)
    }
    assert.ok(html.includes('&lt;redacted&gt;') || html.includes(REDACTED), '占位符可见')
    assert.match(html, /已中和 4 处/, '计数可见（4 处）')
    // 原始文本下载同样过哨兵（分享内容无豁免）
    const raw = await get(`${base}/ob_share/${dirShare.share.token}/raw.txt`)
    assert.equal(raw.status, 200)
    const rawText = await raw.text()
    assert.ok(!rawText.includes('sk-abcdef1234567890'), '原始下载零哨兵残留')
    assert.equal(raw.headers.get('x-ob-redact-count'), '1', '下载面计数头')
  })
})

// ── ④/C-1 diffUndo 写响应零哨兵原文外泄（fix r1：C-1/I-1 负例三面清扫）────────
test('④/C-1 diffUndo 写响应哨兵原文零外泄：成功形/冲突形/表单冲突页=脱敏版往返+计数如实（Ruling 6 不回退）', async () => {
  const PEM = ['-----BEGIN PRIVATE KEY-----', 'MIIEvQIBADANBgkqhkiG9w0BAQEF', '-----END PRIVATE KEY-----'].join('\n')
  const secretNote = ['# 笔记', '', 'key1 sk-abcdef1234567890 end', '', PEM, '', 'token ghp_abcdef1234567890 end', '', 'auth Bearer abcdef1234567890 end'].join('\n')
  // 脱敏版字面双锁（4 处中和的期望形，非 redact() 自证）
  const SECRET_REDACTED = ['# 笔记', '', 'key1 <redacted> end', '', '<redacted>', '', 'token <redacted> end', '', 'auth <redacted> end'].join('\n')
  const rawNeedles = ['sk-abcdef1234567890', 'ghp_abcdef1234567890', 'Bearer abcdef1234567890', 'BEGIN PRIVATE KEY', 'MIIEvQIBADANBgkqhkiG9w0BAQEF', 'sk-newsecret1234567890', 'sk-incsecret1234567890']
  const vault = makeVault('redact-write', { 'hello.md': secretNote })
  const config = makeConfig(vault)
  const { share, password } = await createShare(vault, { target: 'hello.md', role: 'write', autoPassword: true })
  const q = `?password=${encodeURIComponent(password)}`
  await withServer(config, async (base) => {
    const url = `${base}/ob_share/${share.token}${q}`
    const page = await get(url)
    const mtime = Number(page.headers.get('x-ob-mtime'))
    // 冲突形（stale 锁先行——盘上仍为哨兵原文）：before=盘上脱敏版、incoming=本次脱敏版
    const conflict = await get(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'edit', content: '竞争 sk-incsecret1234567890', expectedMtime: 1 }),
    })
    assert.equal(conflict.status, 200)
    const conflictText = await conflict.text()
    const conflictBody = JSON.parse(conflictText)
    assert.equal(conflictBody.data.conflict, true)
    assert.equal(conflictBody.data.diffUndo.before.content, SECRET_REDACTED, '冲突 before=盘上内容脱敏版（字面双锁）')
    assert.equal(conflictBody.data.diffUndo.incoming.content, '竞争 <redacted>', '冲突 incoming=本次尝试脱敏版')
    assert.equal(conflictBody.data.diffUndo.before.redactCount, 4, '计数如实（before 中和 4 处）')
    assert.equal(conflictBody.data.diffUndo.incoming.redactCount, 1, '计数如实（incoming 中和 1 处）')
    assert.equal(conflict.headers.get('x-ob-redact-count'), '5', '写响应计数头如实（4+1，x-ob-redact-count 等价通道）')
    for (const raw of rawNeedles) assert.ok(!conflictText.includes(raw), `冲突形零外泄：${raw}`)
    // 表单冲突形（I-1）：重试表单预填=盘上脱敏版 + 计数可见
    const form = await get(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ op: 'edit', content: '竞争表单', expectedMtime: '1', password }).toString(),
    })
    assert.equal(form.status, 200)
    const formHtml = await form.text()
    for (const raw of rawNeedles) assert.ok(!formHtml.includes(raw), `表单冲突页零外泄：${raw}`)
    assert.ok(formHtml.includes('&lt;redacted&gt;'), '冲突表单预填=脱敏版（I-1 同 :564 口径）')
    assert.match(formHtml, /已中和 4 处/, '冲突页计数如实（预填内容中和 4 处）')
    // 成功形：正常保存一次 → before/after 全脱敏版（undo 恢复脱敏版与 C5 自洽）
    const saved = await get(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'edit', content: '# 覆盖 sk-newsecret1234567890', expectedMtime: mtime }),
    })
    assert.equal(saved.status, 200)
    const savedText = await saved.text()
    const savedBody = JSON.parse(savedText)
    assert.equal(savedBody.data.diffUndo.before.content, SECRET_REDACTED, '成功 before=保存前脱敏版')
    assert.equal(savedBody.data.diffUndo.after.content, '# 覆盖 <redacted>', '成功 after=保存后脱敏版')
    assert.equal(savedBody.data.diffUndo.before.redactCount, 4, '计数如实')
    assert.equal(savedBody.data.diffUndo.after.redactCount, 1, '计数如实')
    assert.equal(saved.headers.get('x-ob-redact-count'), '5', '写响应计数头如实（4+1）')
    for (const raw of rawNeedles) assert.ok(!savedText.includes(raw), `成功形零外泄：${raw}`)
    // 盘面（C-1 fix r2）：写面落盘=脱敏版逐字节 + 哨兵原文零落盘清扫（undo 恢复脱敏版=C5 口径自洽前提）
    assert.equal(fs.readFileSync(path.join(vault, 'hello.md'), 'utf8'), '# 覆盖 <redacted>', '盘上=脱敏版逐字节（写面中和，fix r2）')
    assert.deepEqual(diskNeedles(vault, rawNeedles), [], '盘面清扫：哨兵原文零落盘（写面中和）')
  })
})

// ── ⑤ live 渲染唯一源 + OW-INV-6 ─────────────────────────────────────────────
test('⑤ live 渲染唯一源：分享页主区=render.js 直出逐字节同；零 <script>（禁前端二次渲染）+ OW-INV-6 转义/拦 javascript:', async () => {
  const note = [
    '# 标题', '', '**粗体**', '', '<script>alert(1)</script>', '', '[点我](javascript:alert(1))', '',
    '| a | b |', '|---|---|', '| 1 | 2 |',
  ].join('\n')
  const vault = makeVault('render', { 'hello.md': note })
  const config = makeConfig(vault)
  const { share } = await createShare(vault, { target: 'hello.md', role: 'read' })
  await withServer(config, async (base) => {
    const res = await get(`${base}/ob_share/${share.token}`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /text\/html/)
    const html = await res.text()
    // 唯一源：主区逐字节 = renderMarkdown(redact(源))（不经任何第二套渲染）
    const main = /<main[^>]*>([\s\S]*)<\/main>/.exec(html)
    assert.ok(main, '页面含主区')
    assert.equal(main[1], renderMarkdown(redact(note).text).html, '主区与唯一渲染源逐字节同')
    // 禁前端二次渲染：整页零 script（无客户端渲染器可达）
    assert.ok(!html.toLowerCase().includes('<script'), '整页零 <script>')
    // OW-INV-6：原始 HTML 转义可见 + javascript: 拦截不漏字面
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), '原始 HTML 转义为文本')
    assert.ok(!html.includes('<script>alert'), '原始 HTML 零透传')
    assert.ok(!html.includes('javascript:'), 'javascript: 字面不漏')
    assert.ok(html.includes('ob-link-blocked'), '被拦链接有受控标记')
    // 渲染产物确证（标题 slug id + 强调 + 表格）
    assert.ok(html.includes('<h1 id="标题"') || html.includes('id="标题"'), '标题 id 服务端 slug')
    assert.ok(html.includes('<strong>粗体</strong>'), '强调渲染')
    assert.ok(html.includes('<table>'), 'GFM 表格渲染')
  })
})

// ── ⑥ 关停演练（OW-INV-10 可单独关停）────────────────────────────────────────
test('⑥ 关停演练：close()=面消失（连接拒绝）；热禁用 syncState=面消失；再启用=面回来', async () => {
  const vault = makeVault('shutdown', { 'hello.md': '# hi' })
  const config = makeConfig(vault)
  const { share } = await createShare(vault, { target: 'hello.md', role: 'read' })
  await withServer(config, async (base, handle) => {
    assert.equal((await get(`${base}/ob_share/${share.token}`)).status, 200)
    // 热禁用 + syncState → 面消失
    config.share.enabled = false
    await handle.syncState()
    assert.equal(handle.listening(), false)
    await assert.rejects(() => get(`${base}/ob_share/${share.token}`), '禁用后连接拒绝=面消失')
    // 再启用 → 面回来（热改语义）
    config.share.enabled = true
    await handle.syncState()
    assert.equal(handle.listening(), true)
    assert.equal((await get(`${base}/ob_share/${share.token}`)).status, 200)
  })
  // close() → 面消失（独立生命周期=可单独关停，主 UI 面不受影响）
  const config2 = makeConfig(vault)
  const handle2 = createShareServer({ getConfig: () => config2, port: 0, host: '127.0.0.1', syncIntervalMs: 0 })
  await handle2.start()
  const base2 = `http://127.0.0.1:${handle2.address().port}`
  assert.equal((await get(`${base2}/ob_share/${share.token}`)).status, 200)
  await handle2.close()
  await assert.rejects(() => get(`${base2}/ob_share/${share.token}`), 'close 后连接拒绝=面消失')
})

// ── ⑦ IP 口径（socket.remoteAddress only / 显式 trustProxy 才解析 XFF）────────
test('⑦ IP 口径：guestIp 单位矩阵（默认忽略 XFF；显式 trustProxy 最右可信跳；canonical ::ffff: 归一）', () => {
  const req = (remoteAddress, xff) => ({
    socket: { remoteAddress },
    headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
  })
  // 默认（无 trustProxy）：XFF 一律忽略
  assert.equal(guestIp(req('::ffff:10.0.0.5', '1.2.3.4'), []), '10.0.0.5')
  assert.equal(guestIp(req('10.0.0.5', '1.2.3.4'), undefined), '10.0.0.5')
  // 直连方不是可信代理：XFF 一律忽略（伪造不换桶）
  assert.equal(guestIp(req('10.0.0.5', '1.2.3.4'), ['10.0.0.9']), '10.0.0.5')
  // 显式 trustProxy + 直连=可信代理：最右可信跳口径（从右往左跳过可信代理，首个非可信=客户端）
  assert.equal(guestIp(req('10.0.0.9', '203.0.113.5, 10.0.0.9'), ['10.0.0.9']), '203.0.113.5')
  assert.equal(guestIp(req('10.0.0.9', '198.51.100.7, 10.0.0.8, 10.0.0.9'), ['10.0.0.9', '10.0.0.8']), '198.51.100.7')
  assert.equal(guestIp(req('10.0.0.9', '10.0.0.9'), ['10.0.0.9']), '10.0.0.9', '全链可信 → 最左原始客户端')
  assert.equal(guestIp(req('10.0.0.9', ''), ['10.0.0.9']), '10.0.0.9', '缺 XFF → 直连地址')
  assert.equal(guestIp(req('::ffff:10.0.0.9', '203.0.113.5, 10.0.0.9'), ['10.0.0.9']), '203.0.113.5', '::ffff: 归一后可信判定成立')
})

test('⑦ IP 口径集成：伪造 XFF 换桶绕限流失败（判在查表前、键=socket 地址；120 过 / 121 拒）', async () => {
  const vault = makeVault('ratelimit', { 'hello.md': '# hi' })
  const config = makeConfig(vault)
  const { share } = await createShare(vault, { target: 'hello.md', role: 'read' })
  await withServer(config, async (base) => {
    const url = `${base}/ob_share/${share.token}`
    for (let i = 1; i <= 120; i++) {
      const res = await get(url, { headers: { 'x-forwarded-for': `10.0.0.${i}` } })
      assert.equal(res.status, 200, `第 ${i} 次应过（XFF 不换桶）`)
    }
    const limited = await get(url, { headers: { 'x-forwarded-for': '9.9.9.9' } })
    assert.equal(limited.status, 429, '121 次应 429（换桶绕不过）')
    assert.equal(await limited.text(), RATE_LIMITED_BODY)
  })
})

test('⑦ 显式 trustProxy 集成：可信代理链下 XFF 客户端各自独立预算（口径生效）', async () => {
  const vault = makeVault('ratelimit-proxy', { 'hello.md': '# hi' })
  const config = makeConfig(vault, { server: { trustProxy: ['127.0.0.1'] } })
  const { share } = await createShare(vault, { target: 'hello.md', role: 'read' })
  await withServer(config, async (base) => {
    const url = `${base}/ob_share/${share.token}`
    for (let i = 1; i <= 60; i++) {
      assert.equal((await get(url, { headers: { 'x-forwarded-for': '203.0.113.5' } })).status, 200)
      assert.equal((await get(url, { headers: { 'x-forwarded-for': '198.51.100.7' } })).status, 200, '第二客户端独立预算')
    }
  })
})

// ── ⑥/T9 接线（OW-INV-10：独立 listener、可单独关停、缺收敛缝 fail-closed）────
test('T9 接线：apply 宿主缝+ctx.effect → 起独立分享 listener（server.sharePort）；dispose 关停面消失', async () => {
  const vault = makeVault('wire', { 'hello.md': '# hi' })
  const probe = await probePort()
  const disposers = []
  const warnings = []
  const routes = new Map()
  const ctx = {
    logger: { warn: (line) => warnings.push(line) },
    webServer: {
      register(route) {
        routes.set(`${route.kind}:${route.path}`, route)
        return () => routes.delete(`${route.kind}:${route.path}`)
      },
    },
    connection: { requestRejection: () => undefined },
    // 真 cordis effect 语义（S4 契约同源，B2 修复）：执行器立即执行、返回函数才是拆除器
    //（cordis lib/index.js:1142-1143 实测）——旧伪「effects.push(fn)」不执行执行器=错误契约烤进测试（假绿），已废。
    effect(fn) {
      const d = fn()
      if (typeof d === 'function') disposers.push(d)
    },
  }
  apply(ctx, { vaultRoot: vault, indexDir: IDX_BASE, server: { sharePort: probe } })
  // 正向断言（B2 回归锁）：真语义 effect 下 apply 返回后主 UI/REST 注册面必须在场
  //（挡失效模式「effect 拆除器当执行器→注册即自拆」）
  assert.ok(routes.has('prefix:/ob') && routes.has('exact:/ob/api/tree'), 'apply 返回后注册面在场（B2 回归锁：挡「注册即自拆」）')
  const base = `http://127.0.0.1:${probe}`
  const face = await waitForFace(`${base}/ob_share/`)
  assert.equal(face.status, 404, '分享面已监听（统一 404 体）')
  assert.equal(await face.text(), NOT_FOUND_BODY)
  // 主 UI 面零新增暴露：webServer 注册面不含任何分享路由
  for (const key of routes.keys()) assert.ok(!key.includes('ob_share'), `主面不得注册分享路由：${key}`)
  for (const d of disposers) await d() // 收敛点连动（S4）：调用真语义收集的拆除器（含分享面 close，可等待）
  await assert.rejects(() => get(`${base}/ob_share/`), 'dispose 后分享面消失（可单独关停）')
})

test('T9 接线：缺 ctx.effect 收敛缝 → 分享面不起（公开面生命周期不可控 fail-closed）+ 留痕不静默', async () => {
  const vault = makeVault('wire-noeffect', { 'hello.md': '# hi' })
  const probe = await probePort()
  const warnings = []
  const ctx = {
    logger: { warn: (line) => warnings.push(line) },
    webServer: { register: () => () => {} },
    connection: { requestRejection: () => undefined },
  }
  apply(ctx, { vaultRoot: vault, indexDir: IDX_BASE, server: { sharePort: probe } })
  assert.ok(warnings.some((w) => w.includes('分享服务')), '缺缝必须留痕（INV-15）')
  await assert.rejects(() => get(`http://127.0.0.1:${probe}/ob_share/`), '缺收敛缝不得开公开面')
})

// ── F1（终审 fix-wave）：share-server 读写面 realpath 咽喉——目录经别名（→.ob-share）不得列表 ──
test('F1 share-server 读写面 realpath 咽喉：目录经别名（→.ob-share/hidden）404 不泄内部段；正常文件读 200 零回退', async () => {
  const vault = makeVault('f1-dirlist', { 'notes/keep.md': '# K', '.ob-share/hidden/secret.json': '{"pw":"x"}' })
  const config = makeConfig(vault)
  // 前提：vault 内预存 in-root 目录别名（→.ob-share），位于分享范围内（notes/alias）
  fs.symlinkSync(path.join(vault, '.ob-share'), path.join(vault, 'notes', 'alias'))
  const { share } = await createShare(vault, { target: 'notes', role: 'read' })
  await withServer(config, async (base) => {
    const okRes = await get(`${base}/ob_share/${share.token}/keep.md`)
    assert.equal(okRes.status, 200, '正常文件读 200（正例零回退）')
    // 目录经别名（notes/alias/hidden → .ob-share/hidden）：最终真实节点落内部段 → 404，不得列表泄露
    const aliasRes = await get(`${base}/ob_share/${share.token}/alias/hidden`)
    assert.equal(aliasRes.status, 404, '目录经别名（→.ob-share）不得列表（内部段永不可经分享面触达）')
    const body = await aliasRes.text()
    assert.ok(!body.includes('secret.json'), '不得泄露 .ob-share/hidden 内容（条目名都不出）')
    assert.ok(!body.includes('"pw"'), '不得泄露 .ob-share/hidden 文件内容')
  })
})
