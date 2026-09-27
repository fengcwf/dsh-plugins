// 集成验收 A1-A3（T14 / Phase 6 验收实测）——集成级新验（既有面复用跑单另见证据）。
//   A1 并发冒烟：双会话并发编辑/改名互不阻塞、冲突 diff undo 可用
//   A2 分享安全：写权限无密码必拒；到期/一次性/撤销生效；敏感名拒；路径放行面恰一处
//   A3 可逆性：rename/移动事务故障注入下全量回滚、零断链、零残渣
// 真验零 mock：真 node:http 双面（主 UI 管理面 + /ob_share guest 面）真往返、真 tmp vault、
// 真故障注入（renameNote _onStage 缝真抛错）、真目录树 digest 比对。
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerWebRoutes } from '../lib/web-routes.js'
import { createShareServer } from '../lib/share-server.js'
import { createShare, revokeShare, checkAccess, accessDenied } from '../lib/share.js'
import { renameNote, readNote } from '../lib/vault-ops.js'

const TMP = fileURLToPath(new URL('./.tmp-acceptance', import.meta.url))
fs.mkdirSync(TMP, { recursive: true })

const NOT_FOUND_BODY = '{"ok":false,"status":404,"code":"not_found","message":"分享不存在或已失效"}'

// ── harness（web-share-mgmt.test.mjs 同款：真 node:http 往返，鉴权缝真过）────────
function makeVault(tag, files = {}) {
  const root = fs.mkdtempSync(path.join(TMP, `${tag}-`))
  fs.mkdirSync(path.join(root, 'notes'), { recursive: true })
  fs.writeFileSync(path.join(root, 'INDEX.md'), '# INDEX\n- [[notes/a]]\n- [[notes/b]]\n')
  fs.writeFileSync(path.join(root, 'notes', 'a.md'), '# A\n内容 A\n')
  fs.writeFileSync(path.join(root, 'notes', 'b.md'), '# B\n见 [[notes/a]]\n')
  fs.writeFileSync(path.join(root, 'secret.pem'), 'PRIVATE\n')
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), content)
  }
  return root
}

function makeConfig(vault) {
  return {
    vaultRoot: vault,
    share: { enabled: true, defaultTtlDays: 7, requirePasswordForWrite: true },
    server: { sharePort: 3500, shareHost: '127.0.0.1', trustProxy: [] },
    ui: { pageSize: 50 },
  }
}

function makeCtx() {
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
      connection: { requestRejection: () => undefined }, // 鉴权缝真过（授权态）
    },
  }
}

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

async function withApi(config, fn) {
  const { routes, ctx } = makeCtx()
  registerWebRoutes(ctx, () => config, { distDir: fileURLToPath(new URL('./fixtures/dist', import.meta.url)) })
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

async function postJson(base, route, payload) {
  const res = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  return { status: res.status, body: await res.json().catch(() => null), raw: await res.text().catch(() => '') }
}

/** 全树逐字节 digest（回滚诚实性/残渣判定基线） */
function treeDigest(root, base = '') {
  const out = []
  for (const e of fs.readdirSync(path.join(root, base), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = base ? `${base}/${e.name}` : e.name
    if (e.isDirectory()) out.push(`D ${rel}`, ...treeDigest(root, rel))
    else if (e.isSymbolicLink()) out.push(`L ${rel} -> ${fs.readlinkSync(path.join(root, rel))}`)
    else out.push(`F ${rel} ${fs.readFileSync(path.join(root, rel), 'utf8')}`)
  }
  return out
}

/** 断链扫描（OW-INV-4 验收原文口径）：每条 [[target]]（剥 #锚|别名）须落现存 .md */
function scanDangling(root) {
  const files = []
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(path.join(abs, e.name), r)
      else if (e.isFile() && e.name.endsWith('.md')) files.push(r)
    }
  }
  walk(root, '')
  const stems = new Set(files.map((f) => f.replace(/\.md$/i, '')))
  const dangling = []
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), 'utf8')
    for (const m of text.matchAll(/\[\[([^\[\]]+)\]\]/g)) {
      const t = m[1].split('#')[0].split('|')[0].trim().replace(/\.md$/i, '')
      if (!t) continue
      const viaRel = path.posix.normalize(path.posix.dirname(f) === '.' ? t : `${path.posix.dirname(f)}/${t}`)
      const base = t.split('/').pop()
      const names = new Set([...stems].map((s) => s.split('/').pop()))
      if (!stems.has(viaRel) && !stems.has(t) && !names.has(base)) dangling.push(`${f} → [[${m[1]}]]`)
    }
  }
  return dangling
}

// ══ A1 并发冒烟 ══════════════════════════════════════════════════════════════

test('A1 双会话并发编辑互不阻塞：两会话并行保存不同文件全成功（真 HTTP 并行，锁域不互扰）', async (t) => {
  const root = makeVault('a1-edit')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await withApi(makeConfig(root), async (base) => {
    const stA = await fetch(`${base}/ob/api/file?path=notes/a.md`).then((r) => r.json())
    const stB = await fetch(`${base}/ob/api/file?path=notes/b.md`).then((r) => r.json())
    const a = stA.data
    const b = stB.data
    const [saveA, saveB] = await Promise.all([
      postJson(base, '/ob/api/save', { path: 'notes/a.md', content: '# A\n会话 A 编辑\n', etag: a.etag }),
      postJson(base, '/ob/api/save', { path: 'notes/b.md', content: '# B\n会话 B 编辑\n', etag: b.etag }),
    ])
    assert.equal(saveA.status, 200, '会话 A 保存成功（不被会话 B 阻塞）')
    assert.equal(saveB.status, 200, '会话 B 保存成功（不被会话 A 阻塞）')
    assert.equal(saveA.body.data.ok, true)
    assert.equal(saveB.body.data.ok, true)
    assert.equal(readNote(root, 'notes/a.md').content, '# A\n会话 A 编辑\n')
    assert.equal(readNote(root, 'notes/b.md').content, '# B\n会话 B 编辑\n')
  })
})

test('A1 并发改名互不阻塞：无共享域双改名并发全成功；共享 INDEX 域竞争=显式 concurrent-modification+全量回滚（不挂死不丢数据）', async (t) => {
  const root = makeVault('a1-rename', { 'notes/c.md': '# C\n', 'notes/d.md': '# D\n' })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await withApi(makeConfig(root), async (base) => {
    // ① 无共享改写域（c/d 无链接引用、INDEX 零改写）：双会话并发改名互不阻塞、各自成功
    const [r1, r2] = await Promise.all([
      postJson(base, '/ob/api/rename', { from: 'notes/c.md', to: 'notes/c2.md' }),
      postJson(base, '/ob/api/rename', { from: 'notes/d.md', to: 'notes/d2.md' }),
    ])
    assert.equal(r1.body.data.ok, true, `会话 1 改名成功（${JSON.stringify(r1.body)}）`)
    assert.equal(r2.body.data.ok, true, `会话 2 改名成功（${JSON.stringify(r2.body)}）`)
    assert.ok(fs.existsSync(path.join(root, 'notes', 'c2.md')))
    assert.ok(fs.existsSync(path.join(root, 'notes', 'd2.md')))
    // ② 共享域（a/b 都被 INDEX.md 引用，事务同改 INDEX）：双改名并发互不阻塞（双双即时返回、
    //    不挂死）；竞争方=显式 concurrent-modification+全量回滚（诚实冲突语义，零数据丢失）
    const before = treeDigest(root)
    const [s1, s2] = await Promise.all([
      postJson(base, '/ob/api/rename', { from: 'notes/a.md', to: 'notes/a2.md' }),
      postJson(base, '/ob/api/rename', { from: 'notes/b.md', to: 'notes/b2.md' }),
    ])
    const results = [s1.body.data, s2.body.data]
    const okCount = results.filter((r) => r.ok === true).length
    assert.ok(okCount >= 1, `共享域并发改名至少一方成功（实测 ${JSON.stringify(results)}）`)
    for (const r of results) {
      if (r.ok === true) continue
      assert.equal(r.reason, 'concurrent-modification', '失败形必须显式可解释（不吞不冒充）')
      assert.equal(r.rolledBack, true, '竞争失败=全量回滚（rolledBack 如实）')
    }
    // 零数据丢失：双方原文都还在（成功方在新名、回滚方在原名）
    const texts = treeDigest(root).join('\n')
    assert.ok(texts.includes('内容 A'), 'a 原文零丢失')
    assert.ok(texts.includes('见 [[notes/a]]') || texts.includes('见 [[notes/a2]]'), 'b 原文零丢失')
    if (okCount !== 2) {
      assert.notDeepEqual(treeDigest(root), before, '共享域竞争下至少一方已完成落盘（before 比对非全同）')
    }
  })
})

test('A1 冲突 diff undo 可用：冲突响应带 before/incoming 双快照，undo 回写=原文逐字节同', async (t) => {
  const root = makeVault('a1-conflict')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await withApi(makeConfig(root), async (base) => {
    const orig = readNote(root, 'notes/a.md').content
    const st = await fetch(`${base}/ob/api/file?path=notes/a.md`).then((r) => r.json())
    const first = await postJson(base, '/ob/api/save', { path: 'notes/a.md', content: '# A\n先行者写入\n', etag: st.data.etag })
    assert.equal(first.body.data.ok, true)
    // 会话 B 持旧 etag 写入 → 冲突（OW-INV-3：无乐观锁不落盘，冲突显式）
    const conflict = await postJson(base, '/ob/api/save', { path: 'notes/a.md', content: '# A\n迟到者尝试\n', etag: st.data.etag })
    assert.equal(conflict.body.data.conflict, true, '旧锁写入=冲突不落盘')
    assert.equal(conflict.body.data.diffUndo.before.content, '# A\n先行者写入\n', '冲突材料：盘上现内容=对比/重载基线')
    assert.equal(conflict.body.data.diffUndo.incoming.content, '# A\n迟到者尝试\n', '冲突材料：本次尝试内容=对比面')
    assert.equal(readNote(root, 'notes/a.md').content, '# A\n先行者写入\n', '冲突不落盘')
    // diff undo 可用：拿 before 快照回写（新锁）= 还原先行者版本逐字节同
    const st2 = await fetch(`${base}/ob/api/file?path=notes/a.md`).then((r) => r.json())
    const undo = await postJson(base, '/ob/api/save', { path: 'notes/a.md', content: conflict.body.data.diffUndo.before.content, etag: st2.data.etag })
    assert.equal(undo.body.data.ok, true)
    assert.equal(readNote(root, 'notes/a.md').content, '# A\n先行者写入\n', 'undo 回写逐字节同')
    assert.ok(typeof orig === 'string')
  })
})

// ══ A2 分享安全全矩阵 ════════════════════════════════════════════════════════

test('A2 写权限无密码必拒（创建+升权双面）+ 敏感名拒（管理面可解释码）', async (t) => {
  const root = makeVault('a2-pw')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await withApi(makeConfig(root), async (base) => {
    const createNoPw = await postJson(base, '/ob/api/shares/create', { target: 'notes/a.md', role: 'write' })
    assert.equal(createNoPw.status, 400, '创建写分享无密码必拒（OW-INV-1）')
    assert.equal(createNoPw.body.error.code, 'password_required')
    const readShare = await postJson(base, '/ob/api/shares/create', { target: 'notes/a.md', role: 'read' })
    const token = readShare.body.data.share.token
    const upgradeNoPw = await postJson(base, '/ob/api/shares/role', { token, role: 'write' })
    assert.equal(upgradeNoPw.status, 400, '升写无密码必拒（OW-INV-1）')
    assert.equal(upgradeNoPw.body.error.code, 'password_required')
    for (const target of ['secret.pem', '.env']) {
      const sensitive = await postJson(base, '/ob/api/shares/create', { target, role: 'read' })
      assert.equal(sensitive.status, 400, `敏感名永禁：${target}`)
      assert.equal(sensitive.body.error.code, 'sensitive_name')
    }
  })
})

test('A2 到期/一次性/撤销生效：三种失效态 guest 面冻结 404 与不存在 token 逐字节同形', async (t) => {
  const root = makeVault('a2-life')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const config = makeConfig(root)
  const handle = createShareServer({ getConfig: () => config, port: 0, host: '127.0.0.1', syncIntervalMs: 0 })
  await handle.start()
  t.after(() => handle.close())
  const guest = `http://127.0.0.1:${handle.address().port}`
  const frozen = async (token) => {
    const res = await fetch(`${guest}/ob_share/${token}`)
    assert.equal(res.status, 404)
    const body = await res.text()
    assert.equal(body, NOT_FOUND_BODY, '冻结四键形逐字节同（不泄露存在性）')
    return body
  }
  // 到期
  const expired = await createShare(root, { target: 'notes/a.md', role: 'read', expiresAt: Date.now() - 1000 })
  await frozen(expired.share.token)
  // 一次性：恰一次成功、二次冻结
  const one = await createShare(root, { target: 'notes/a.md', role: 'read', oneShot: true })
  const first = await fetch(`${guest}/ob_share/${one.share.token}`)
  assert.equal(first.status, 200, '一次性首次访问 200')
  await frozen(one.share.token)
  assert.deepEqual(await checkAccess(root, { token: one.share.token }), accessDenied(), '一次性消耗后模型层同形拒')
  // 撤销：即时失效
  const revoked = await createShare(root, { target: 'notes/a.md', role: 'read' })
  await revokeShare(root, revoked.share.token)
  await frozen(revoked.share.token)
  // 基线：不存在 token 同形
  await frozen('z'.repeat(43))
})

test('A2 路径放行面恰一处：/ob_share/<token> 之外一切路径冻结 404（大小写/穿越/词法借道全拒）', async (t) => {
  const root = makeVault('a2-face')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const config = makeConfig(root)
  const { share } = await createShare(root, { target: 'notes/a.md', role: 'read' })
  const handle = createShareServer({ getConfig: () => config, port: 0, host: '127.0.0.1', syncIntervalMs: 0 })
  await handle.start()
  t.after(() => handle.close())
  const guest = `http://127.0.0.1:${handle.address().port}`
  // 唯一放行面：规范形 200
  const ok = await fetch(`${guest}/ob_share/${share.token}`)
  assert.equal(ok.status, 200, '规范形 /ob_share/<token> 放行（唯一放行面）')
  // raw 请求（不经 fetch URL 归一——'..' 词法形必须真到服务器面前）
  const rawGet = (p) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: handle.address().port, path: p, method: 'GET' }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end()
  })
  const probes = [
    '/',
    '/admin',
    '/ob/api/shares',
    '/ob_share',
    '/ob_share/',
    `/Ob_share/${share.token}`, // 大小写借道
    `/OB_SHARE/${share.token}`,
    `/ob_share/${share.token}/../../ob/api/shares`, // 词法穿越形（raw 直达）
    '/ob_share/../ob/api/shares',
    '/ob_share/%2e%2e/ob/api/shares',
    '/ob_share/' + 'x'.repeat(43), // 不存在 token
  ]
  for (const p of probes) {
    const res = await rawGet(p)
    assert.equal(res.status, 404, `放行面外必须冻结 404：${p}`)
    assert.equal(res.body, NOT_FOUND_BODY, `冻结形逐字节同：${p}`)
  }
})

// ══ A3 可逆性：故障注入下全量回滚、零断链、零残渣 ════════════════════════════

for (const [label, hit] of [
  ['回滚后期（before-delete：wikilink/INDEX 已改写完、删源前）', (s) => s === 'before-delete'],
  ['回滚中段（首件改写后）', (s) => s.startsWith('after-rewrite')],
]) {
  test(`A3 故障注入（${label}）→ 全量回滚、零断链、零残渣、rolledBack 如实`, async (t) => {
    const root = makeVault('a3-rollback')
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const before = treeDigest(root)
    assert.deepEqual(scanDangling(root), [], '基线零断链')
    const result = await renameNote(root, 'notes/a.md', 'notes/a-renamed.md', {
      _onStage: (s) => {
        if (hit(s)) throw new Error(`集成验收故障注入：${s}`)
      },
    }).catch((err) => ({ ok: false, rolledBack: false, thrown: err }))
    assert.equal(result.ok, false, '事务必须失败（不冒充成功）')
    // 全量回滚：全树逐字节还原
    assert.deepEqual(treeDigest(root), before, '全树逐字节还原（源复活、目标清、改写件还原）')
    assert.equal(result.rolledBack, true, 'rolledBack 与真实还原态一致（诚实性不变量）')
    // 零断链：wikilink/INDEX 全可达
    assert.deepEqual(scanDangling(root), [], '回滚后零断链（OW-INV-4）')
    // 零残渣：无锁/事务残渣、无 .1 序号改名、root 外零写入
    const residue = treeDigest(root).filter((l) => /\.lock|journal|\.tmp/.test(l))
    assert.deepEqual(residue, [], '零残渣（锁/journal/临时件零残留）')
    assert.equal(fs.existsSync(path.join(root, 'notes', 'moved')), false, '目标目录零残留')
    assert.equal(fs.existsSync(path.join(root, 'notes', 'a.md')), true, '源文件复活')
  })
}

test('A3 移动语义故障注入（before-rewrite）→ 移动事务同享全量回滚、源/目标双向零残渣', async (t) => {
  const root = makeVault('a3-move', { 'sub/keep.md': '# KEEP\n见 [[notes/a]]\n' })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const before = treeDigest(root)
  const result = await renameNote(root, 'notes/a.md', 'sub/a-moved.md', {
    overwrite: false,
    _onStage: (s) => {
      if (s.startsWith('before-rewrite')) throw new Error('移动事务中段注入')
    },
  })
  assert.equal(result.ok, false)
  assert.deepEqual(treeDigest(root), before, '移动故障=全量回滚（目标原样、源复活）')
  assert.equal(result.rolledBack, true)
  assert.deepEqual(scanDangling(root), [], '零断链')
})
