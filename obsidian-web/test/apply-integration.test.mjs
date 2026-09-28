// apply-integration — integration 形（S5）：假 ctx（真 effect 语义）+ 真 apply() + 真 handler 执行，两轴断言。
//   轴一 注册面在场：apply() 返回后 /ob 面与分享面注册真在场（B2 回归锁——失效模式「注册即自拆」，修前必红）
//   轴二 拆除面正确：await disposer() 后对应路由注销、独立模式 listener 真关闭（端口可再 bind）、二次调用幂等不抛
//   真 handler 执行：http.createServer 按 registry 转发真 handler，GET /ob/api/tree 双向形
//     （在场 200/正常形 ↔ 注销后 404/无路由形）——断言不得用「apply 不抛=成功」替代（假绿防线）。
//   LRN-037：全量体等价断言走 Buffer.equals / sha256，不做大字符串直接比较。
//   分享面挂载字面量零新增：一律 SHARE_URL_PREFIX 派生（share.js 恰一处锁口径）。
//   临时 vault=test/.tmp-* 惯例（真 fs 测试副本），收尾清理。
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply } from '../lib/index.js'
import { SHARE_URL_PREFIX } from '../lib/share.js'

const TMP = fileURLToPath(new URL('./.tmp-apply-integration', import.meta.url))
const IDX_BASE = path.join(TMP, 'idx')
// 分享面挂载路径=SHARE_URL_PREFIX 去尾斜杠派生（与 lib/index.js 站点③同口径；本文件零字面量）
const SHARE_MOUNT = SHARE_URL_PREFIX.replace(/\/$/, '')
const SHARE_KEY = `prefix:${SHARE_MOUNT}`
const TREE_KEY = 'exact:/ob/api/tree'
const OB_KEY = 'prefix:/ob'

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
// 收尾清理（带沉降窗口）：索引服务 fire-and-forget 的补跑扫描可能在拆除后仍异步落盘
//（实测会把 idx/<vault>-<hash> 写回）——循环 rm + 复查，杜绝残留。
test.after(async () => {
  for (let i = 0; i < 10; i += 1) {
    fs.rmSync(TMP, { recursive: true, force: true })
    await sleep(50)
    if (!fs.existsSync(TMP)) return
  }
  fs.rmSync(TMP, { recursive: true, force: true })
})

/** 真 fs 测试副本 vault（test/.tmp-* 惯例） */
function makeVault(tag, files) {
  const root = fs.mkdtempSync(path.join(TMP, `${tag}-`))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return root
}

/**
 * 假 ctx，但 effect=真 cordis 语义（S4 契约同源，主路径同源）：执行器立即执行、返回函数才是拆除器；非函数非法返回抛 Invalid effect；thenable/iterable 分支未复刻——伪件对此类返回亦抛 Invalid effect（fail-closed，非静默忽略；真宿主则按协议收集 thenable/iterable）。
 * webServer.register 收集 spec→handler Map（返回 disposer）；connection.requestRejection 返回 undefined=放行。
 */
function makeCtx() {
  const disposers = []
  const warnings = []
  const routes = new Map()
  return {
    ctx: {
      logger: { warn: (line) => warnings.push(line) },
      webServer: {
        register(route) {
          routes.set(`${route.kind}:${route.path}`, route)
          return () => routes.delete(`${route.kind}:${route.path}`)
        },
      },
      connection: { requestRejection: () => undefined },
      effect(fn) {
        const d = fn()
        if (typeof d === 'function') disposers.push(d)
        else if (d != null) throw new TypeError('Invalid effect')
      },
    },
    disposers,
    warnings,
    routes,
  }
}

/** 收敛点连动（Ruling R5：拆除器 thenable 聚合可等待——直接 await，无需轮询） */
async function disposeAll(disposers) {
  for (const d of disposers) await d()
}

/** 宿主 match 语义同款（web-routes.js 头注）：exact 优先 → 最长前缀；无匹配=404 无路由形 */
function dispatch(routes, req, res) {
  const pathname = new URL(req.url, 'http://x').pathname
  for (const [, route] of routes) {
    if (route.kind === 'exact' && route.path === pathname) return route.handler(req, res)
  }
  let best = null
  for (const [, route] of routes) {
    if (route.kind === 'prefix' && (pathname === route.path || pathname.startsWith(`${route.path}/`))) {
      if (!best || route.path.length > best.path.length) best = route
    }
  }
  if (best) return best.handler(req, res)
  res.writeHead(404)
  res.end()
}

/** 把 registry 里的真 handler 挂到真实 node:http server（真 HTTP 往返，非纸面断言） */
async function mountDispatch(routes) {
  const server = http.createServer((req, res) => {
    Promise.resolve(dispatch(routes, req, res)).catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, base: `http://127.0.0.1:${server.address().port}` }
}

/** 占一个空闲端口后立即释放（独立模式 sharePort=freePort） */
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}

/** 端口可再 bind（=listener 真关闭的唯一硬证据；SO_REUSEADDR 下两活 listener 仍互斥） */
function bindable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.once('error', () => resolve(false))
    s.listen(port, host, () => s.close(() => resolve(true)))
  })
}

/** 轮询 TCP 可连（独立模式 start 为 fire-and-forget，等 listener 真起） */
async function waitForPort(port, host = '127.0.0.1', timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const sock = net.connect(port, host, () => {
        sock.end()
        resolve(true)
      })
      sock.on('error', () => resolve(false))
    })
    if (ok) return true
    await sleep(25)
  }
  return false
}

// ── 伪 effect 宿主语义锁（终审 F1，helper 路径）：非法返回必须抛，不许静默 ───────────
test('伪 effect 宿主语义锁（失效模式「伪件静默忽略非法返回」，helper 路径）：执行器返回非函数非空 42 → TypeError("Invalid effect")', () => {
  const { ctx } = makeCtx()
  assert.throws(() => ctx.effect(() => 42), { name: 'TypeError', message: 'Invalid effect' })
})

// ── 轴一 注册面在场（默认 sharePort=null）──────────────────────────────────────────────
test('轴一① 注册面在场（B2 回归锁，失效模式「注册即自拆」——修前此断言必红）：apply() 返回后 /ob 面 + 分享面注册真在场', async () => {
  const vault = makeVault('axis1', { 'note.md': '# hello\n' })
  const { ctx, disposers, routes } = makeCtx()
  try {
    apply(ctx, { vaultRoot: vault, indexDir: IDX_BASE })
    // 真 effect 语义下注册动作当场跑：拆除器被收集（≥3：索引/路由/分享面），不是「把执行器推入队列」
    assert.ok(disposers.length >= 3, `effect 收集到拆除器（真语义），实际 ${disposers.length}`)
    // 失效模式「注册即自拆」：B2 修前 apply 返回后注册面已消失 → 此处红
    assert.ok(routes.has(TREE_KEY), `${TREE_KEY} 在场（B2 回归锁：挡「注册即自拆」）`)
    assert.ok(routes.has(OB_KEY), `${OB_KEY} 静态面在场（B2 回归锁：挡「注册即自拆」）`)
    assert.ok(routes.has(SHARE_KEY), `${SHARE_KEY} 分享面在场（默认 sharePort=null 挂同域）`)
    const shareKeys = [...routes.keys()].filter((k) => k.includes(SHARE_MOUNT))
    assert.deepEqual(shareKeys, [SHARE_KEY], '分享面注册恰一处（路径放行面语义不变）')
    assert.equal(typeof routes.get(TREE_KEY).handler, 'function', '真 handler 在场（非占位）')
    assert.equal(typeof routes.get(SHARE_KEY).handler, 'function', '分享面真 handler 在场（非占位）')
  } finally {
    await disposeAll(disposers)
  }
})

// ── 真 handler 执行（双向：在场 200/正常形 ↔ 注销后 404/无路由形）───────────────────────
test('真 handler 执行双向（失效模式「纸面注册假绿」）：http 转发真 handler——在场 GET /ob/api/tree 200/正常形、拆除后 404/无路由形', async () => {
  const vault = makeVault('handler', { 'note.md': '# hello\n' })
  const { ctx, disposers, routes } = makeCtx()
  const { server, base } = await mountDispatch(routes)
  try {
    apply(ctx, { vaultRoot: vault, indexDir: IDX_BASE })
    // 在场：200/正常形（信封 {data,total}、树形 {root,nodes}——web-routes.js 契约形）
    const okRes = await fetch(`${base}/ob/api/tree`)
    assert.equal(okRes.status, 200, '路由在场 → 200（真 handler 执行，非「apply 不抛=成功」）')
    const okBuf = Buffer.from(await okRes.arrayBuffer())
    const body = JSON.parse(okBuf.toString('utf8'))
    assert.deepEqual(Object.keys(body).sort(), ['data', 'total'], '正常形信封 {data,total}')
    assert.deepEqual(Object.keys(body.data).sort(), ['nodes', 'root'], '树形 {root,nodes}')
    assert.equal(body.data.root, path.resolve(vault), 'vaultRoot 真生效')
    assert.equal(body.total, 1, '真 fs 测试副本 1 个节点')
    assert.equal(body.data.nodes[0].path, 'note.md', '节点形 path=父 path/name')
    // 同请求两次体等价走 sha256（LRN-037：不做大字符串直接比较）
    const again = await fetch(`${base}/ob/api/tree`)
    const againBuf = Buffer.from(await again.arrayBuffer())
    assert.equal(again.status, 200, '重复请求仍 200')
    assert.equal(sha256(againBuf), sha256(okBuf), '同请求体等价（hash 比较，LRN-037）')
    // 拆除：路由注销后同请求变 404/无路由形（双向另一极）
    await disposeAll(disposers)
    const gone = await fetch(`${base}/ob/api/tree`)
    const goneBuf = Buffer.from(await gone.arrayBuffer())
    assert.equal(gone.status, 404, '拆除后 → 404/无路由形')
    assert.ok(goneBuf.equals(Buffer.alloc(0)), '404 体=空（无路由形，Buffer.equals 比较，LRN-037）')
    const goneRoot = await fetch(`${base}/ob`)
    assert.equal(goneRoot.status, 404, '/ob 面拆除后同样 404/无路由形')
  } finally {
    await disposeAll(disposers) // 幂等位点：失败路径也收敛（二次调用不抛，见轴二①）
    await new Promise((r) => server.close(r))
  }
})

// ── 轴二① 拆除面正确（webServer 模式）────────────────────────────────────────────────
test('轴二① 拆除面正确（失效模式「拆除不注销/半拆除」）：await disposer() 后 /ob 面与分享面路由全注销，二次调用幂等不抛', async () => {
  const vault = makeVault('teardown', { 'note.md': '# hello\n' })
  const { ctx, disposers, routes } = makeCtx()
  apply(ctx, { vaultRoot: vault, indexDir: IDX_BASE })
  assert.ok(routes.has(TREE_KEY) && routes.has(OB_KEY) && routes.has(SHARE_KEY), '拆除前注册面在场')
  await disposeAll(disposers)
  // 失效模式「拆除不注销/半拆除」：拆完必须真消失
  assert.ok(!routes.has(TREE_KEY), `${TREE_KEY} 已注销`)
  assert.ok(!routes.has(OB_KEY), `${OB_KEY} 已注销`)
  assert.ok(!routes.has(SHARE_KEY), `${SHARE_KEY} 已注销`)
  assert.equal(routes.size, 0, 'registry 零残留（无半拆除态）')
  // 二次调用幂等不抛（幂等 flag 双保险）
  await disposeAll(disposers)
  assert.equal(routes.size, 0, '二次拆除后仍零残留')
})

// ── 轴二② 拆除面正确（独立模式 listener）──────────────────────────────────────────────
test('轴二② 独立模式 listener 拆除（失效模式「拆除假关/半关 listener」）：sharePort=freePort 真起、拆除后端口可再 bind、二次调用幂等', async () => {
  const vault = makeVault('standalone', { 'note.md': '# hello\n' })
  const port = await freePort()
  const { ctx, disposers, routes } = makeCtx()
  try {
    apply(ctx, { vaultRoot: vault, indexDir: IDX_BASE, server: { sharePort: port, shareHost: '127.0.0.1' } })
    // listener 真起（独立模式不挂同域 webServer 面）
    assert.equal(await waitForPort(port), true, `独立 listener 真起（port=${port}）`)
    assert.ok(!routes.has(SHARE_KEY), '独立模式不挂同域分享面（模式互斥）')
    // 拆除：listener 真关闭=端口可再 bind（唯一硬证据）
    await disposeAll(disposers)
    assert.equal(await bindable(port), true, '拆除后端口可再 bind（listener 真关闭，非假关）')
    // 二次调用幂等不抛（close 幂等 + disposed flag）
    await disposeAll(disposers)
    assert.equal(await bindable(port), true, '二次拆除后端口仍可 bind（幂等不复起/不抛）')
  } finally {
    await disposeAll(disposers)
  }
})
