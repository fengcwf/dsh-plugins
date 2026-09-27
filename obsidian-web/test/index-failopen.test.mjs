// fix-boot-lock 回归——索引开库失败 fail-open（2026-09-28 boot 失败修复）：
//   症状：`database is locked` 于 createIndexStore→apply → 插件装载失败（boot 每次必挂）。
//   产品语义（本测试锁定）：boot 永不因索引失败而装载失败——
//   ①真锁（第二连接 BEGIN IMMEDIATE 持锁）→ apply 必成功 + degraded 留痕（INV-15：warn 线 +
//     账本 run status='degraded'）+ /ob/api/index/refresh 503 index_unavailable（可解释）
//   ②释放后自愈重建（refresh/tick 同径）→ run done + 计数如实 + 库回 ok
//   ③busy_timeout pragma + 小退避重试（跨进程持锁释放 → 开库自愈；持锁下失败耗时 ≥ busyTimeout）
//   ④检索行为不丢：fts 后端 index_unavailable → search 自动降级 scan，恢复后回 fts
// 真验零 mock：真 node:sqlite 锁、真子进程持锁、真 http 往返、真 apply、真落盘账本。
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { apply } from '../lib/index.js'
import { createIndexService } from '../lib/index-service.js'
import { createIndexStore, resolveIndexDir } from '../lib/index-store.js'
import { createSearchService, compileQuery } from '../lib/search.js'
import { createNote } from '../lib/vault-ops.js'

const TMP_ROOT = fileURLToPath(new URL('./.tmp-index-failopen', import.meta.url))
// 0.1.1 起索引库落本地盘 <indexDir>/<vault 名-哈希>/（迁出 CIFS）——测试显式给 indexDir（HOME 污染防线）
const IDX_BASE = path.join(TMP_ROOT, 'idx')
const idxDir = (vault) => resolveIndexDir({ vaultRoot: vault, indexDir: IDX_BASE })

test.after(() => fs.rmSync(TMP_ROOT, { recursive: true, force: true }))

function makeVault(files) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, 'v'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return dir
}

// 真锁库形态准备：0 字节库（生产实证形态=建库期被锁，SCHEMA 从未写入）——0.1.1 起落点=
//   本地盘 <indexDir>/<vault 名-哈希>/（resolveIndexDir 单一来源，锁的正是服务将开的库）
function prepareDb(vault) {
  const dir = idxDir(vault)
  fs.mkdirSync(dir, { recursive: true })
  const dbPath = path.join(dir, 'index.db')
  fs.writeFileSync(dbPath, '')
  return dbPath
}

// 真锁（第二连接持锁）：BEGIN IMMEDIATE 占 RESERVED——同款生产形态（建库期被锁）
function lockDb(vault) {
  const dbPath = prepareDb(vault)
  const holder = new DatabaseSync(dbPath)
  holder.exec('BEGIN IMMEDIATE')
  let released = false
  return {
    dbPath,
    release() {
      if (released) return // 幂等：body 释放后 finally 可再调（不重复 ROLLBACK/close）
      released = true
      holder.exec('ROLLBACK')
      holder.close()
    },
  }
}

function readLedger(vault) {
  return JSON.parse(fs.readFileSync(path.join(idxDir(vault), 'reconcile-ledger.json'), 'utf8'))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function makeHost() {
  const routes = new Map()
  const warnings = []
  const effects = []
  const ctx = {
    logger: { warn: (line) => warnings.push(String(line)) },
    webServer: {
      register(route) {
        routes.set(`${route.kind}:${route.path}`, route)
        return () => routes.delete(`${route.kind}:${route.path}`)
      },
    },
    connection: { requestRejection: () => undefined },
    effect(fn) {
      effects.push(fn)
    },
  }
  return { routes, warnings, effects, ctx }
}

async function post(routes, pathname) {
  const server = http.createServer((req, res) => {
    const target = new URL(req.url, 'http://x').pathname
    for (const [, route] of routes) {
      if (route.kind === 'exact' && route.path === target) return route.handler(req, res)
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${pathname}`, { method: 'POST' })
    return { status: res.status, body: await res.json() }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

const RUN_KEYS = ['counts', 'cursor', 'degraded', 'finishedAt', 'resumedFrom', 'runId', 'startedAt', 'status']

test('① 真锁下 apply 必成功（fail-open）+ degraded 留痕（INV-15）+ refresh 503 index_unavailable', async () => {
  const vault = makeVault({ 'a.md': 'alpha note\n', 'sub/b.md': 'beta note\n', 'c.txt': 'not md\n' })
  const lock = lockDb(vault)
  const { routes, warnings, effects, ctx } = makeHost()
  const port = await freePort()
  try {
    assert.doesNotThrow(() => apply(ctx, { vaultRoot: vault, indexDir: IDX_BASE, server: { sharePort: port } }), 'apply 期建库/开库失败绝不炸插件装载')
    assert.ok(routes.has('exact:/ob/api/index/refresh'), '索引刷新路由照挂（索引面 degraded ≠ 路由缺席）')
    assert.ok(
      warnings.some((l) => l.includes('fail-open') && l.includes('degraded')),
      `degraded 留痕（warn 线）必须在场：${JSON.stringify(warnings)}`,
    )

    // 手动刷新自愈重试仍失败 → 与「未接索引服务」同形 503（可解释，不装死）
    const res = await post(routes, '/ob/api/index/refresh')
    assert.equal(res.status, 503)
    assert.equal(res.body.error.code, 'index_unavailable')

    // INV-15 留痕：账本 run 形 status='degraded'（键锁定 RUN_KEYS，degraded 条目带 reason/message）
    const ledger = readLedger(vault)
    const degradedRun = ledger.runs.filter((r) => r.status === 'degraded').at(-1)
    assert.ok(degradedRun, `账本必须有 status='degraded' 留痕：${JSON.stringify(ledger.runs)}`)
    assert.deepEqual(Object.keys(degradedRun).sort(), RUN_KEYS, 'degraded run 键形与对账 run 同锁')
    assert.equal(degradedRun.degraded[0].reason, 'index-store-unavailable')
    assert.match(String(degradedRun.degraded[0].message), /locked|busy/i)

    // 释放后自愈重建（tick/手动刷新同径）：run done + 计数如实（.md only：a.md + sub/b.md）
    lock.release()
    const healed = await post(routes, '/ob/api/index/refresh')
    assert.equal(healed.status, 200)
    assert.equal(healed.body.data.status, 'done')
    assert.equal(healed.body.data.counts.added, 2, '自愈后全量重建 added=盘上 .md 数')
    assert.equal(healed.body.data.counts.degraded, 0)
  } finally {
    lock.release()
    for (const fn of effects.reverse()) {
      try {
        await fn?.()
      } catch { /* 清理失败不掩盖断言 */ }
    }
  }
})

test('② service 级 degraded 留痕 + 释放后自愈重建（status() 可观测，INV-15）', async () => {
  const vault = makeVault({ 'a.md': 'alpha\n', 'b.md': 'beta\n', 'c.md': 'gamma\n' })
  const lock = lockDb(vault)
  const warns = []
  const service = createIndexService({
    vaultRoot: vault,
    indexDir: IDX_BASE,
    busyTimeoutMs: 30,
    openAttempts: 1,
    retryDelayMs: 1,
    warn: (line) => warns.push(String(line)),
  })
  try {
    const st = service.status()
    assert.equal(st.ready, false, '锁库下开库失败 → degraded（构造不抛=fail-open）')
    assert.equal(st.degraded.reason, 'index-store-unavailable')
    assert.ok(warns.some((l) => l.includes('fail-open')))

    await assert.rejects(
      service.refresh(),
      (err) => err.code === 'index_unavailable',
      '自愈重试仍失败 → index_unavailable 上抛（可解释）',
    )
    const ledger = readLedger(vault)
    assert.ok(ledger.runs.some((r) => r.status === 'degraded'), '每次自愈失败留痕落账（INV-15 禁静默）')

    lock.release()
    const run = await service.refresh()
    assert.equal(run.status, 'done')
    assert.deepEqual(run.counts, { seen: 0, added: 3, updated: 0, removed: 0, degraded: 0 })
    assert.equal(service.status().ready, true, '自愈后索引面回 ok')
    assert.equal(service.status().degraded, null)
    assert.equal(service.store.count(), 3, '自愈重建：索引库条目=盘上 .md 数')
  } finally {
    lock.release()
    service.stop()
  }
})

// 子进程持锁脚本（真第二进程——同进程单线程在同步退避期间无法释放锁，跨进程才是真自愈场景）
const HOLDER_SRC = `
import { DatabaseSync } from 'node:sqlite'
const [dbPath, holdMs] = process.argv.slice(2)
const h = new DatabaseSync(dbPath)
h.exec('BEGIN IMMEDIATE')
process.stdout.write('LOCKED\\n')
setTimeout(() => { h.exec('ROLLBACK'); h.close(); process.exit(0) }, Number(holdMs))
`

test('③ busy_timeout+小退避重试自愈：跨进程持锁释放 → 开库成功（真第二进程）', async () => {
  const vault = makeVault({ 'a.md': 'alpha\n' })
  const dbPath = prepareDb(vault) // 本进程不持锁——子进程是唯一持锁者（双持锁会互斥死等）
  const script = path.join(TMP_ROOT, `holder-${Date.now()}.mjs`)
  fs.writeFileSync(script, HOLDER_SRC)
  const child = spawn(process.execPath, [script, dbPath, '350'], { stdio: ['ignore', 'pipe', 'ignore'] })
  try {
    // 等子进程真持上锁（握手：LOCKED 到达 / 子进程先亡=测试失败，绝不静默挂死）
    const locked = await new Promise((resolve, reject) => {
      child.stdout.once('data', (d) => (d.toString().includes('LOCKED') ? resolve(true) : reject(new Error(`握手异常：${d}`))))
      child.once('exit', (code) => reject(new Error(`持锁子进程提前退出 code=${code}`)))
    })
    assert.equal(locked, true)
    const t0 = Date.now()
    const store = createIndexStore({ vaultRoot: vault, indexDir: IDX_BASE, busyTimeoutMs: 40, openAttempts: 6, retryDelayMs: 50 })
    const elapsed = Date.now() - t0
    assert.equal(store.count(), 0)
    assert.ok(elapsed >= 250, `开库必须等到持锁释放（真重试自愈，非首试即成）：elapsed=${elapsed}ms`)
    store.close()
  } finally {
    child.kill()
    fs.rmSync(script, { force: true })
  }
})

test('④ busy_timeout pragma 真生效：持锁下开库失败耗时 ≥ busyTimeout（非立即 SQLITE_BUSY）', async () => {
  const vault = makeVault({ 'a.md': 'alpha\n' })
  const lock = lockDb(vault)
  try {
    const t0 = Date.now()
    assert.throws(
      () => createIndexStore({ vaultRoot: vault, indexDir: IDX_BASE, busyTimeoutMs: 250, openAttempts: 1 }),
      (err) => /locked|busy/i.test(String(err?.message ?? '')),
    )
    const elapsed = Date.now() - t0
    assert.ok(elapsed >= 200, `busy_timeout=250 须正等待后再失败：elapsed=${elapsed}ms`)
  } finally {
    lock.release()
  }
})

test('⑤ 检索行为不丢：degraded 期 fts 查询自动降级 scan；自愈后回 fts（真 degraded 服务，零 mock）', async () => {
  const vault = makeVault({ 'a.md': 'alpha content here\n', 'b.md': 'beta content here\n' })
  const lock = lockDb(vault)
  const service = createIndexService({ vaultRoot: vault, indexDir: IDX_BASE, busyTimeoutMs: 30, openAttempts: 1, retryDelayMs: 1, warn: () => {} })
  const search = createSearchService({ backends: { fts: service.ftsBackend } })
  try {
    const degraded = await search.search(vault, 'alpha')
    assert.equal(degraded.backend, 'scan', '索引面 degraded → scan 兜底（backend 如实报 scan）')
    assert.ok(degraded.results.length >= 1, 'scan 兜底必须真命中（行为不丢）')

    lock.release()
    await service.refresh() // 自愈 + 全量重建
    const healed = await search.search(vault, 'alpha')
    assert.equal(healed.backend, 'fts', '自愈后检索回 fts 后端')
    assert.ok(healed.results.length >= 1)
  } finally {
    lock.release()
    service.stop()
  }
})

test('⑥ degraded 态：保存即增量跳过留痕不炸（每 episode 一条 warn）+ stop() 不抛', async () => {
  const vault = makeVault({ 'a.md': 'alpha\n' })
  const lock = lockDb(vault)
  const warns = []
  const service = createIndexService({ vaultRoot: vault, indexDir: IDX_BASE, busyTimeoutMs: 20, openAttempts: 1, retryDelayMs: 1, warn: (l) => warns.push(String(l)) })
  try {
    await service.start().catch(() => {}) // 启动补跑失败留痕（定时器仍排定——生产语义）
    await createNote(vault, 'new1.md', 'one\n')
    await createNote(vault, 'new2.md', 'two\n')
    const skips = warns.filter((l) => l.includes('索引增量更新跳过'))
    assert.equal(skips.length, 1, '每 degraded episode 一条 warn（INV-15 禁静默且防刷屏）')
  } finally {
    lock.release()
    assert.doesNotThrow(() => service.stop(), 'degraded 态 stop() 不抛（store 缺位安全收敛）')
  }
})
