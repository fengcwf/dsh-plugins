// A1 反链索引化验收测试（合同：changes/2026-09-28-b2-effect-fix/delta-specs/runtime-fix-wave.md 卡 A1；
// 根因证据：reports/p8-r3c-repro.md §2 量化 47.4s / §7 A1 输入）。
// 覆盖六轴：①解析语义锁（硬编码期望=语义同源锚点，防索引化漂移）②docs 快照≡文件构建等价锁
//   ③增量维护（save/create/rename/delete）≡全量重建 ④大 vault 性能断言（数千 md，冷<1s/热毫秒级）
//   ⑤降级路径限流限量 + degraded 留痕（INV-15 禁静默；禁止无界全库同步扫回归）⑥快照构建窗内增量不丢
//   ⑦API 面端到端（/ob/api/backlinks 大 vault <1s，形不变）。
// 真验零 mock：真 tmp vault、真 sqlite（node:sqlite）、真事件钩子、真 http 往返。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import {
  scanBacklinks, saveNote, createNote, renameNote, deletePath, readNote,
} from '../lib/vault-ops.js'
import { createIndexStore } from '../lib/index-store.js'
import { createIndexService } from '../lib/index-service.js'
import { getBacklinkCache, replaceFromDocs, resetBacklinkCaches, upsertSource } from '../lib/backlink-index.js'
import { registerWebRoutes } from '../lib/web-routes.js'

const TMP_ROOT = fileURLToPath(new URL('./.tmp-backlink-index', import.meta.url))

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

function pairs(r) {
  return r.backlinks.map((b) => [b.path, b.line])
}

// ── ①+② 解析语义锁 + docs 快照 ≡ 文件构建（语义同源：同一 matchesTarget/提取器，两种构建源）────────
const SEM_VAULT = {
  'INDEX.md': '# Index\n\n[[notes/a]]\n[[b|Bee]]\n[ext](https://e.com/a.md)\n[[#anchor]]\n',
  // 行位（1 基）：3=[[notes/a]] 4=[[b|Bee]] 5=外链 6=纯锚点
  'notes/a.md': '---\ntitle: A\n---\n\n# Note A\n\nSee [[b]] and [ref](b.md).\n[[c/d|alias]]\n',
  // 行位：7=同行双链（[[b]]+[ref](b.md)）8=[[c/d|alias]]（不匹配 notes/c——basename 是 d）
  'notes/b.md': '# Note B\n\nLinks back to [[a]] and [ref](a.md).\n',
  'notes/c.md': '# C\n\n[[b]]\n',
  'sub/deep.md': '# Deep\n\n[[notes/a]] and [direct](../notes/a.md)\n[[a#head]]\n[[sub/../x]]\n',
  // 行位：3=同行双链 4=锚点剥离 5=[[sub/../x]]（basename 'x' 命中）
  'notes/plain.md': 'no links here\n',
  'x/y.md': '[[a/..]]\n', // 病态 viaRel-only 匹配：normalize('x/a/..')==='x' → 反链给 x.md
}

const SEM_EXPECT = {
  'notes/a.md': [['INDEX.md', 3], ['notes/b.md', 3], ['sub/deep.md', 3], ['sub/deep.md', 4]],
  'notes/b.md': [['INDEX.md', 4], ['notes/a.md', 7], ['notes/c.md', 3]],
  'notes/c.md': [],
  'x.md': [['sub/deep.md', 5], ['x/y.md', 1]], // sub/../x→basename 'x' 命中 + a/..→viaRel 'x' 命中（两路各自成真）
  'notes/plain.md': [],
}

test('① 解析语义锁（硬编码期望）：别名/锚点剥离、basename、md 相对链接、同行多链一条、外链/纯锚点不计、viaRel 病态链', () => {
  const vault = makeVault(SEM_VAULT)
  resetBacklinkCaches()
  for (const [target, expected] of Object.entries(SEM_EXPECT)) {
    const r = scanBacklinks(vault, target)
    assert.deepEqual(Object.keys(r).sort(), ['backlinks', 'path'], `健康形零 degraded 键：${target}`)
    assert.deepEqual(pairs(r), expected, `语义锁：${target}`)
  }
})

test('② docs 快照构建 ≡ 文件构建（索引面查询不改语义；index-store body 同源）', async () => {
  const vault = makeVault(SEM_VAULT)
  // 文件构建面（降级路径）
  resetBacklinkCaches()
  const fileSide = {}
  for (const target of Object.keys(SEM_EXPECT)) fileSide[target] = scanBacklinks(vault, target)
  // docs 快照面（索引面路径：index-store docs 表 → replaceFromDocs）
  const idxDir = path.join(TMP_ROOT, 'idx-sem')
  const store = createIndexStore({ vaultRoot: vault, dir: idxDir })
  try {
    const entries = []
    for (const rel of Object.keys(SEM_VAULT)) {
      entries.push({ rel, content: fs.readFileSync(path.join(vault, rel), 'utf8'), stat: fs.statSync(path.join(vault, rel)) })
    }
    store.upsertFiles(entries)
    resetBacklinkCaches()
    await replaceFromDocs(getBacklinkCache(vault), store.listDocContents())
    for (const target of Object.keys(SEM_EXPECT)) {
      const docsSide = scanBacklinks(vault, target)
      assert.deepEqual(docsSide, fileSide[target], `docs 快照 ≡ 文件构建：${target}`)
    }
    assert.equal(getBacklinkCache(vault).source, 'docs', '构建源=索引面快照')
  } finally {
    store.close()
  }
})

// ── ③ 增量维护（save/create/rename/delete）≡ 全量重建 ─────────────────────────────────────
test('③ 增量维护等价锁：写路径事件后毫秒级增量 ≡ 全量重建（save/create/rename/delete）', async () => {
  const vault = makeVault({
    'a.md': '[[target]]\n',
    'target.md': '# Target\n',
    'other.md': 'plain\n',
  })
  resetBacklinkCaches()
  assert.deepEqual(pairs(scanBacklinks(vault, 'target.md')), [['a.md', 1]])

  const freshEquals = (target, expected) => {
    const inc = scanBacklinks(vault, target)
    assert.deepEqual(pairs(inc), expected, `增量面：${target}`)
    resetBacklinkCaches()
    const rebuilt = scanBacklinks(vault, target)
    assert.deepEqual(inc, rebuilt, `增量 ≡ 全量重建：${target}`)
    resetBacklinkCaches()
  }

  // create：[[target#h]] + [[target|alias]]（同行两条链只记一条）
  await createNote(vault, 'new.md', 'see [[target#h]] and [[target|alias]]\n')
  freshEquals('target.md', [['a.md', 1], ['new.md', 1]])

  // save：md 形相对链接
  const note = readNote(vault, 'other.md')
  const saved = await saveNote(vault, 'other.md', 'link [t](target.md)\n', { etag: note.etag })
  assert.equal(saved.ok, true)
  freshEquals('target.md', [['a.md', 1], ['new.md', 1], ['other.md', 1]])

  // rename：wikilink 改写件随事务增量；md 形链接不改写（renameNote 既定边界）→ 悬链照旧匹配旧名
  const renamed = await renameNote(vault, 'target.md', 'renamed.md')
  assert.equal(renamed.ok, true)
  freshEquals('renamed.md', [['a.md', 1], ['new.md', 1]])
  freshEquals('target.md', [['other.md', 1]])

  // delete：单源出桶
  const deleted = await deletePath(vault, 'a.md', { confirm: 'a.md' })
  assert.equal(deleted.ok, true)
  freshEquals('renamed.md', [['new.md', 1]])
})

// ── ④ 大 vault 性能验收（数千 md；冷构建 <1s、热查询毫秒级）─────────────────────────────
test('④ A1 验收：3000 md tmp vault 反链冷查询 <1s（含懒构建）、热查询毫秒级、结果全量正确', () => {
  const N = 3000
  const files = { 'target.md': '# Target\n' }
  for (let i = 0; i < N; i += 1) {
    const body = i % 10 === 0 ? `# F${i}\n\nsee [[target]]\n` : `# F${i}\n\nbody ${i}\n`
    files[`d${String(i % 30).padStart(2, '0')}/f${i}.md`] = body
  }
  const vault = makeVault(files)
  resetBacklinkCaches()

  const t0 = performance.now()
  const cold = scanBacklinks(vault, 'target.md')
  const coldMs = performance.now() - t0
  assert.equal(cold.backlinks.length, N / 10, '300 条反链全量命中（零漏零多）')
  assert.ok(!('degraded' in cold), '构建完整（零 degraded）')
  assert.ok(coldMs < 1000, `冷查询（含懒构建）必须 <1s，实测 ${coldMs.toFixed(1)}ms`)

  const t1 = performance.now()
  const ROUNDS = 20
  for (let i = 0; i < ROUNDS; i += 1) {
    const rel = `d${String((i * 10) % 30).padStart(2, '0')}/f${i * 10}.md` // 与生成布局同构
    const r = scanBacklinks(vault, rel)
    assert.ok(!('degraded' in r))
  }
  const warmMs = (performance.now() - t1) / ROUNDS
  assert.ok(warmMs < 100, `热查询必须毫秒级（<100ms 均摊），实测 ${warmMs.toFixed(2)}ms`)
})

// ── ⑤ 降级路径：限流 + 限量 + degraded 留痕（INV-15 禁静默；无界全库同步扫禁回归）────────────
test('⑤ 降级路径限流限量：buildMaxFiles 截断 → degraded 留痕 + 部分结果；cooldown 内不重建（限流）', () => {
  const files = {}
  for (let i = 1; i <= 10; i += 1) files[`a${i}.md`] = '[[target]]\n'
  files['target.md'] = '# T\n'
  const vault = makeVault(files)
  resetBacklinkCaches()

  const warns = []
  const opts = { buildMaxFiles: 3, warn: (line) => warns.push(line) }
  const r = scanBacklinks(vault, 'target.md', opts)
  assert.deepEqual(pairs(r), [['a1.md', 1], ['a10.md', 1], ['a2.md', 1]], '限量构建的部分结果（字典序前 3，如实标注）')
  assert.equal(r.degraded.reason, 'build-capped')
  assert.equal(r.degraded.scanned, 3)
  assert.equal(warns.length, 1, 'INV-15 留痕：degraded 必须 warn 一条')

  // 限流：cooldown 内不重复构建（不烧预算、不再 warn），degraded 形照旧可解释
  const r2 = scanBacklinks(vault, 'target.md', opts)
  assert.equal(r2.degraded.reason, 'build-capped')
  assert.equal(warns.length, 1, 'cooldown 内零重建零刷屏（限流）')

  // 上限恢复：给足 maxFiles 后（cooldown 过后）重建 → 完整 + 无 degraded
  resetBacklinkCaches()
  const ok = scanBacklinks(vault, 'target.md', { buildMaxFiles: 100 })
  assert.equal(ok.backlinks.length, 10)
  assert.ok(!('degraded' in ok))
})

// ── ⑥ 快照构建窗内增量不丢（竞态：异步分批解析 + 并发写路径事件）─────────────────────────
test('⑥ docs 快照构建窗内增量绝不丢：窗内 upsert + 真实 createNote 事件均在 finalize 后可见', async () => {
  const vault = makeVault({ 'seed.md': '[[target]]\n' })
  resetBacklinkCaches()
  const cache = getBacklinkCache(vault)

  const DOC_COUNT = 500 // ≥2 批（SYNC_BATCH=200）→ 构建窗真实跨事件循环
  function* docs() {
    for (let i = 0; i < DOC_COUNT; i += 1) yield { rel: `d${i}.md`, content: `[[target]] from d${i}\n` }
  }
  const syncing = replaceFromDocs(cache, docs())
  // 窗内同步增量（异步 run 启动前的窗口——正是竞态点）+ 真实写路径事件（createNote）
  upsertSource(cache, 'fresh.md', '[[target]] window-delta\n')
  await createNote(vault, 'live.md', '[[target]] live-delta\n')
  await syncing

  const r = scanBacklinks(vault, 'target.md')
  const srcs = new Set(r.backlinks.map((b) => b.path))
  assert.equal(r.backlinks.length, DOC_COUNT + 2, '500 docs + 窗内增量 + 真实事件，一条不丢')
  assert.ok(srcs.has('fresh.md'), '窗内增量存活（活版本优先，绝不被旧快照吞掉）')
  assert.ok(srcs.has('live.md'), '真实写路径事件存活')
  assert.ok(srcs.has('d0.md') && srcs.has(`d${DOC_COUNT - 1}.md`), 'docs 快照全量在场')
  assert.ok(!('degraded' in r))
})

// ── ⑦ API 面端到端：/ob/api/backlinks 大 vault <1s、响应形不变 ────────────────────────────
test('⑦ /ob/api/backlinks 端到端：2000 md vault 请求 <1s，信封 {data,total} 与形逐字段兼容', async () => {
  const N = 2000
  const files = { 'target.md': '# Target\n' }
  for (let i = 0; i < N; i += 1) {
    files[`d${String(i % 20).padStart(2, '0')}/f${i}.md`] = i % 7 === 0 ? `# F${i}\n\nsee [[target]]\n` : `# F${i}\n\nbody\n`
  }
  const vault = makeVault(files)
  resetBacklinkCaches()

  const routes = new Map()
  const ctx = {
    logger: { warn: () => {} },
    webServer: {
      register(route) {
        const key = `${route.kind}:${route.path}`
        routes.set(key, route)
        return () => routes.delete(key)
      },
    },
    connection: { requestRejection: () => undefined },
  }
  const dispose = registerWebRoutes(ctx, () => ({ vaultRoot: vault, ui: { pageSize: 50 } }), { distDir: path.join(TMP_ROOT, 'dist') })
  const handler = routes.get('exact:/ob/api/backlinks').handler
  const server = http.createServer((req, res) => Promise.resolve(handler(req, res)).catch(() => { res.writeHead(500); res.end() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    const t0 = performance.now()
    const res = await fetch(`${base}/ob/api/backlinks?path=${encodeURIComponent('target.md')}`)
    const elapsed = performance.now() - t0
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(Object.keys(body).sort(), ['data', 'total'], '信封形不变')
    assert.deepEqual(Object.keys(body.data).sort(), ['backlinks', 'path'], '健康形零新增键（逐字段兼容）')
    assert.equal(body.total, Math.ceil(N / 7))
    assert.equal(body.data.backlinks[0].path, 'd00/f0.md', '升序第一源')
    assert.ok(elapsed < 1000, `端到端必须 <1s，实测 ${elapsed.toFixed(1)}ms`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    dispose()
  }
})

// ── 索引服务接线（A1 硬要求③的服务面：start/对账 → 快照推送；写事件毫秒级增量）──────────────
test('⑧ index-service 接线：start 后反链缓存=docs 源；保存即增量毫秒级新鲜', async () => {
  const vault = makeVault({
    'a.md': '[[target]]\n',
    'target.md': '# Target\n',
  })
  resetBacklinkCaches()
  const service = createIndexService({ vaultRoot: vault, indexDir: path.join(TMP_ROOT, 'idx-svc') })
  try {
    await service.start()
    assert.equal(getBacklinkCache(vault).source, 'docs', 'start 即推索引面快照（零 vault 盘读）')
    assert.deepEqual(pairs(scanBacklinks(vault, 'target.md')), [['a.md', 1]])

    const created = await createNote(vault, 'fresh.md', '[[target]]\n')
    assert.equal(created.ok, true)
    const r = scanBacklinks(vault, 'target.md')
    assert.deepEqual(pairs(r), [['a.md', 1], ['fresh.md', 1]], '保存/新建即增量（毫秒级，不等对账）')
  } finally {
    service.stop()
  }
})
