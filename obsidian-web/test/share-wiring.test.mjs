// share-wiring — 0.2.0 fix-ui-port 问题 A 接线契约（照 dsh-better-sidebar 路线）：
//   ① 默认零自有端口：分享面挂 ctx.webServer.register({kind:'prefix', path:'/ob_share', handler})
//     （dsh web 3080 同域）——路径放行面恰一处语义不变（OW-INV-2：3500 /ob_share=外部契约，
//     由 login-gate/nginx 直通反代达成；内部面挂 webServer）。
//   ② server.sharePort: number|null——null=挂 webServer（默认）；number=独立 listener（可选模式）。
//   ③ watchdog 安全（掉服务根因回归）：独立模式端口占用/任何 listener 失败 → fail-open
//     （该次 boot 面不启 + degraded 留痕），绝不抛出让插件装载失败/拖垮 dsh 宿主进程。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createShareServer } from '../lib/share-server.js'
import { createShare } from '../lib/share.js'
import { apply } from '../lib/index.js'

const TMP = fileURLToPath(new URL('./.tmp-share-wiring', import.meta.url))
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
const IDX_BASE = path.join(TMP, 'idx')

const NOT_FOUND_BODY = '{"ok":false,"status":404,"code":"not_found","message":"分享不存在或已失效"}'

function makeVault(tag, files = {}) {
  const root = fs.mkdtempSync(path.join(TMP, `${tag}-`))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return root
}

/** 真实宿主缝记录器（webServer.register 形照 dsh-host-webserver：返回 disposer） */
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
      // 真 cordis effect 语义（S4 契约同源，B2 修复）：执行器立即执行、返回函数才是拆除器
      //（cordis lib/index.js:1142-1143 实测）——旧伪「effects.push(fn)」不执行执行器=错误契约烤进测试（假绿），已废。
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

// ── 伪 effect 宿主语义锁（P8-2b F-1，helper 路径）：本文件伪件 throw 行被断言锁死，删 throw 行此测试必红 ──
test('伪 effect 宿主语义锁（失效模式「伪件静默忽略非法返回 / 删 throw 行静默复发」，helper 路径）：执行器返回非函数非空 42 → TypeError("Invalid effect")', () => {
  const { ctx } = makeCtx()
  assert.throws(() => ctx.effect(() => 42), { name: 'TypeError', message: 'Invalid effect' })
})

/** 把注册面 handler 挂到真实 node:http server（面契约真 HTTP 往返，非纸面断言） */
function mountHandler(handler) {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => { void handler(req, res) })
    s.listen(0, '127.0.0.1', () => resolve({ server: s, base: `http://127.0.0.1:${s.address().port}` }))
  })
}

/** 占住一个端口（模拟 login-gate 3500 冲突面） */
function occupyPort() {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      resolve({ port, release: () => new Promise((r) => s.close(r)) })
    })
  })
}

/** 进程级 unhandledRejection 记录器（watchdog 掉服务根因=未处理拒绝杀进程） */
function rejectionRecorder() {
  const events = []
  const on = (err) => events.push(err)
  process.on('unhandledRejection', on)
  return { events, stop: () => process.off('unhandledRejection', on) }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── ① 默认 webServer 模式：零自有端口，分享面挂 ctx.webServer（/ob_share 恰一处）────────
test('① 默认（sharePort=null）挂 webServer：prefix:/ob_share 恰一处注册、零自有 listener、面契约原样', async () => {
  const vault = makeVault('webmode', { 'hello.md': '# hi' })
  const { ctx, disposers, routes } = makeCtx()
  apply(ctx, { vaultRoot: vault, indexDir: IDX_BASE })
  // 正向断言（B2 回归锁）：真语义 effect 下 apply 返回后注册面必须在场（挡失效模式「注册即自拆」）
  assert.ok(routes.has('prefix:/ob') && routes.has('exact:/ob/api/tree'), 'apply 返回后主面注册面在场（B2 回归锁：挡「注册即自拆」）')
  const keys = [...routes.keys()]
  const shareKeys = keys.filter((k) => k.includes('ob_share'))
  assert.deepEqual(shareKeys, ['prefix:/ob_share'], '分享注册面恰一处（路径放行面语义不变）')
  const route = routes.get('prefix:/ob_share')
  assert.equal(typeof route.handler, 'function', 'handler 必须是函数')
  // 真 HTTP 往返：面契约原样（统一 404 形 + 正常读 200）
  const { server, base } = await mountHandler(route.handler)
  try {
    const { share } = await createShare(vault, { target: 'hello.md', role: 'read' })
    const okRes = await fetch(`${base}/ob_share/${share.token}/hello.md`)
    assert.equal(okRes.status, 200, 'token 读面 200（面契约原样）')
    for (const p of ['/ob_share', '/ob_share/', '/ob_share/bad-token']) {
      const res = await fetch(`${base}${p}`)
      assert.equal(res.status, 404, `${p} 统一 404`)
      assert.equal(await res.text(), NOT_FOUND_BODY, `${p} 统一 404 体逐字节同形`)
    }
  } finally {
    await new Promise((r) => server.close(r))
    for (const d of disposers) await d() // 收敛点连动（S4）：调用真语义收集的拆除器（索引服务/分享面/路由 disposer）
  }
})

// ── ② 热禁用语义照旧（share.enabled=false 承担关停）────────────────────────────────
test('② webServer 模式热禁用：share.enabled=false → 面统一 404（关停语义照旧由 enabled=false 承担）', async () => {
  const vault = makeVault('webmode-off', { 'hello.md': '# hi' })
  const config = {
    vaultRoot: vault,
    indexDir: IDX_BASE,
    share: { enabled: true, defaultTtlDays: 7, requirePasswordForWrite: true },
    ui: { pageSize: 50 },
    server: { sharePort: null, shareHost: '0.0.0.0', trustProxy: [] },
  }
  const { ctx, disposers, routes } = makeCtx()
  apply(ctx, config)
  // 正向断言（B2 回归锁）：真语义 effect 下 apply 返回后注册面必须在场（挡失效模式「注册即自拆」）
  assert.ok(routes.has('prefix:/ob') && routes.has('exact:/ob/api/tree'), 'apply 返回后主面注册面在场（B2 回归锁：挡「注册即自拆」）')
  const route = routes.get('prefix:/ob_share')
  const { server, base } = await mountHandler(route.handler)
  try {
    const { share } = await createShare(vault, { target: 'hello.md', role: 'read' })
    assert.equal((await fetch(`${base}/ob_share/${share.token}/hello.md`)).status, 200, '启用态 200')
    config.share.enabled = false
    const off = await fetch(`${base}/ob_share/${share.token}/hello.md`)
    assert.equal(off.status, 404, '热禁用统一 404')
    assert.equal(await off.text(), NOT_FOUND_BODY, '热禁用统一 404 体逐字节同形')
  } finally {
    await new Promise((r) => server.close(r))
    for (const d of disposers) await d() // 收敛点连动（S4）：调用真语义收集的拆除器
  }
})

// ── ③ fail-open：独立模式端口占用 → apply 绝不抛、主 UI 面照挂、degraded 留痕 ─────────
test('③ fail-open：独立模式 sharePort 被占用 → apply 不抛 + 分享面不启 + 留痕 + 主 UI 面照挂', async () => {
  const vault = makeVault('failopen', { 'hello.md': '# hi' })
  const busy = await occupyPort()
  const rec = rejectionRecorder()
  const { ctx, disposers, warnings, routes } = makeCtx()
  try {
    assert.doesNotThrow(() => {
      apply(ctx, { vaultRoot: vault, indexDir: IDX_BASE, server: { sharePort: busy.port, shareHost: '127.0.0.1' } })
    }, '端口占用绝不抛出让插件装载失败（watchdog 掉服务根因）')
    // 主 UI 面照挂（插件装载不受分享面故障影响）
    assert.ok([...routes.keys()].some((k) => k.startsWith('prefix:/ob')), '主 UI 面照挂')
    // 假锁命名校准（S4）：真挡的是「拆除器未被 ctx.effect 收集→拆除缝形同虚设」
    assert.ok(disposers.length > 0, '拆除器被 ctx.effect 收集（收敛缝真接线：真语义 effect 返回值=拆除器）')
    await sleep(150) // 真等 listen 失败链路落地（异步留痕，不抢跑断言）
    assert.ok(warnings.some((w) => w.includes('分享')), '分享面故障必须留痕（INV-15 禁静默）')
    assert.equal(rec.events.length, 0, `绝不产生 unhandledRejection（实际：${rec.events.map((e) => e?.message ?? e)}）`)
  } finally {
    for (const d of disposers) await d() // 失败路径也收敛（不留 ref'd 句柄挂进程）
    rec.stop()
    await busy.release()
  }
})

// ── ④ start() fail-open 契约：绑定失败 resolve {listening:false} 不 reject ────────────
test('④ start() API 级绝不抛出：绑定失败 resolve {listening:false, reason}（fail-open 形）', async () => {
  const vault = makeVault('start-fail', { 'hello.md': '# hi' })
  const busy = await occupyPort()
  try {
    const warnings = []
    const handle = createShareServer({
      getConfig: () => ({ vaultRoot: vault, share: { enabled: true } }),
      port: busy.port,
      host: '127.0.0.1',
      syncIntervalMs: 0,
      warn: (line) => warnings.push(line),
    })
    const started = await handle.start()
    assert.equal(started.listening, false, '绑定失败 fail-open：面不启')
    assert.equal(typeof started.reason, 'string', '失败必须给可解释 reason')
    assert.equal(handle.listening(), false)
    assert.ok(warnings.some((w) => w.includes('fail-open')), 'degraded 留痕（INV-15）')
    await handle.close()
  } finally {
    await busy.release()
  }
})

// ── ⑤ watchdog 回归：syncState 自愈重试/热禁用关停路径零 unhandledRejection ──────────
test('⑤ watchdog 回归：端口占用下 syncState 重试 + 热禁用自关全路径零 unhandledRejection', async () => {
  const vault = makeVault('sync-fail', { 'hello.md': '# hi' })
  const busy = await occupyPort()
  const config = {
    vaultRoot: vault,
    share: { enabled: true, defaultTtlDays: 7, requirePasswordForWrite: true },
    server: { sharePort: busy.port, shareHost: '127.0.0.1', trustProxy: [] },
    ui: { pageSize: 50 },
  }
  const rec = rejectionRecorder()
  try {
    const warnings = []
    const handle = createShareServer({
      getConfig: () => config,
      port: busy.port,
      host: '127.0.0.1',
      syncIntervalMs: 20,
      warn: (line) => warnings.push(line),
    })
    const started = await handle.start()
    assert.equal(started.listening, false, '占用端口：面不启（fail-open）')
    await sleep(200) // timer 多轮 syncState 重试（全部绑定失败）
    config.share.enabled = false // 热禁用 → 自关路径
    await sleep(100)
    config.share.enabled = true // 再启用 → 重试路径
    await sleep(100)
    await handle.close()
    assert.equal(rec.events.length, 0, `自愈重试/自关路径零 unhandledRejection（实际：${rec.events.map((e) => e?.message ?? e)}）`)
  } finally {
    rec.stop()
    await busy.release()
  }
})

// ── ⑥ 释放端口后自愈：fail-open 不死心，面回来（同口同面）──────────────────────────
test('⑥ fail-open 自愈：端口释放后 syncState 重试真起面（同口同面），恢复留痕', async () => {
  const vault = makeVault('recover', { 'hello.md': '# hi' })
  const busy = await occupyPort()
  const config = {
    vaultRoot: vault,
    share: { enabled: true, defaultTtlDays: 7, requirePasswordForWrite: true },
    server: { sharePort: busy.port, shareHost: '127.0.0.1', trustProxy: [] },
    ui: { pageSize: 50 },
  }
  const rec = rejectionRecorder()
  try {
    const handle = createShareServer({
      getConfig: () => config,
      port: busy.port,
      host: '127.0.0.1',
      syncIntervalMs: 20,
      warn: () => {},
    })
    assert.equal((await handle.start()).listening, false, '占用期面不启')
    await busy.release() // 冲突源消失
    for (let i = 0; i < 100 && !handle.listening(); i++) await sleep(20)
    assert.equal(handle.listening(), true, 'syncState 自愈重试真起面（同口）')
    const { share } = await createShare(vault, { target: 'hello.md', role: 'read' })
    const res = await fetch(`http://127.0.0.1:${busy.port}/ob_share/${share.token}/hello.md`)
    assert.equal(res.status, 200, '恢复后同面可用')
    await handle.close()
    assert.equal(rec.events.length, 0)
  } finally {
    rec.stop()
  }
})
