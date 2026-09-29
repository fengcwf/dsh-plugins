// A2 tree 缓存契约测试（合同=changes/2026-09-28-b2-effect-fix/delta-specs/runtime-fix-wave.md 卡 A2）：
//   ①缓存命中零重扫 ②写路径事件毫秒级增量（emitVaultChange 钩子面）③增量 ≡ 全量扫描（独立 oracle）
//   ④TTL 兜底（外部编辑绕过钩子）+ stale-while-revalidate 不阻塞请求 ⑤大 tmp vault 验收：冷 <1s、
//   热 <100ms ⑥root 隔离 + LRU 上限 ⑦dot 条目/symlink 不出树（scan 语义锁）⑧端到端 /ob/api/tree。
// 真验零 mock：真 tmp vault、真 fs、真写路径（createNote/saveNote/renameNote/deletePath）、真 node:http。
// 形不变锁：listTree 返回形 {root,nodes} + 节点形（既有 test/vault-ops.test.mjs 锁形零改动零弱化，
//   本文件为缓存层新增面）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { listTree, listTreeAsync, createNote, saveNote, readNote, renameNote, deletePath } from '../lib/vault-ops.js'
import {
  getTreeSync, peekTreeCache, resetTreeCaches, whenTreeIdle, TREE_CACHE_MAX_ROOTS,
} from '../lib/tree-cache.js'
import { registerWebRoutes } from '../lib/web-routes.js'

const TMP_ROOT = fileURLToPath(new URL('./.tmp-tree-cache', import.meta.url))
const DIST = fileURLToPath(new URL('./fixtures/dist', import.meta.url))
test.after(() => fs.rmSync(TMP_ROOT, { recursive: true, force: true }))

function makeVault(tag, files = {}) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, `${tag}-`))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return dir
}

/** 独立 oracle（按合同形独立再推导：dot 跳过/symlink 不入/目录优先 byName 码元序）——增量 ≡ 全量 的比对基 */
function scanOracle(abs, rel = '') {
  const dirs = []
  const files = []
  for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
    if (d.name.startsWith('.')) continue
    const childRel = rel ? `${rel}/${d.name}` : d.name
    if (d.isDirectory()) dirs.push({ name: d.name, path: childRel, type: 'dir', children: scanOracle(path.join(abs, d.name), childRel) })
    else if (d.isFile()) files.push({ name: d.name, path: childRel, type: 'file' })
  }
  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  return [...dirs.sort(byName), ...files.sort(byName)]
}

function countNodes(nodes) {
  return nodes.reduce((acc, n) => acc + 1 + (n.children ? countNodes(n.children) : 0), 0)
}

// ── ① 形不变 + 缓存命中零重扫 ─────────────────────────────────────────────────────
test('① 形不变 {root,nodes} + 缓存命中：二次 listTree 同快照零重扫（builtAt/树对象恒定）', () => {
  resetTreeCaches()
  const vault = makeVault('shape', { 'a.md': '# a\n', 'sub/b.md': '# b\n' })
  const t1 = listTree(vault)
  assert.deepEqual(Object.keys(t1).sort(), ['nodes', 'root'], 'listTree 形不变恰 {root,nodes}')
  assert.equal(t1.root, path.resolve(vault))
  const entry = peekTreeCache(vault)
  assert.ok(entry !== null && entry.tree !== null, '首查后缓存已建')
  const builtAt = entry.builtAt
  const t2 = listTree(vault)
  assert.equal(t2, t1, '缓存命中=同一快照对象（零重扫）')
  assert.equal(peekTreeCache(vault).builtAt, builtAt, '未重建（builtAt 恒定）')
  assert.deepEqual(t1.nodes.map((n) => n.name), ['sub', 'a.md'], '节点形/排序语义不变（目录优先字典序）')
})

// ── ② 写路径事件毫秒级增量（emitVaultChange 钩子面；零 TTL 等待）─────────────────────
test('② 事件增量即时：create/save/rename/delete 后 listTree 立即反映（零 TTL、零重建等待）', async () => {
  resetTreeCaches()
  const vault = makeVault('events', { 'a.md': '# a\n', 'sub/b.md': '# b\n' })
  listTree(vault) // 建缓存

  const created = await createNote(vault, 'sub/new.md', '# new\n')
  assert.equal(created.ok, true)
  let tree = listTree(vault)
  assert.ok(tree.nodes.find((n) => n.name === 'sub').children.some((n) => n.name === 'new.md'), 'create 即时入树')
  assert.equal(peekTreeCache(vault).rebuilding, null, '增量路径零重建（不触发后台重建）')

  const note = readNote(vault, 'a.md')
  await saveNote(vault, 'a.md', '# a 改\n', { etag: note.etag })
  tree = listTree(vault)
  assert.ok(tree.nodes.some((n) => n.name === 'a.md'), 'save 不破坏树形')

  const renamed = await renameNote(vault, 'sub/new.md', 'moved.md')
  assert.equal(renamed.ok, true)
  tree = listTree(vault)
  const sub = tree.nodes.find((n) => n.name === 'sub')
  assert.ok(!sub.children.some((n) => n.name === 'new.md'), 'rename 源出树')
  assert.ok(tree.nodes.some((n) => n.name === 'moved.md'), 'rename 目标入树（跨目录移动）')

  const deleted = await deletePath(vault, 'moved.md', { confirm: 'moved.md' })
  assert.equal(deleted.ok, true)
  tree = listTree(vault)
  assert.ok(!tree.nodes.some((n) => n.name === 'moved.md'), 'delete 即时出树')
  assert.deepEqual(tree.nodes, scanOracle(vault), '增量结果 ≡ 独立 oracle 全量扫描')
})

// ── ③ 增量等价锁（组合操作序列 ≡ 全量；幂等/无操作路径）──────────────────────────────
test('③ 增量 ≡ 全量（组合序列）+ dot 条目不出树（scan 语义锁：增量与扫描同口径）', async () => {
  resetTreeCaches()
  const vault = makeVault('equiv', {
    'a.md': '# a\n', 'z.md': '# z\n', 'sub/c.md': '# c\n', 'sub/deep/d.md': '# d\n',
    'readme.txt': 'plain\n',
  })
  listTree(vault)

  await createNote(vault, 'sub/e.md', '# e\n')
  await createNote(vault, '.hidden/x.md', '# x\n') // dot 条目：写路径可见、树内不可见
  const za = readNote(vault, 'z.md')
  await saveNote(vault, 'z.md', '# z2\n', { etag: za.etag })
  await renameNote(vault, 'sub/deep/d.md', 'sub/d2.md')
  await deletePath(vault, 'a.md', { confirm: 'a.md' })
  await createNote(vault, 'newdir-file.md', '# n\n')

  const cached = listTree(vault)
  assert.deepEqual(cached.nodes, scanOracle(vault), '组合序列后增量树 ≡ 独立 oracle')
  assert.ok(!JSON.stringify(cached.nodes).includes('.hidden'), 'dot 条目永不出树（增量 no-op=扫描同口径）')
  const sub = cached.nodes.find((n) => n.name === 'sub')
  const deep = sub.children.find((n) => n.name === 'deep')
  assert.ok(deep !== undefined && deep.type === 'dir' && deep.children.length === 0, 'rename 移走唯一文件后空目录仍出树（scanDir 同口径；增量不误删目录）')
})

// ── ④ TTL 兜底（外部编辑绕过钩子）+ stale-while-revalidate ──────────────────────────
test('④ TTL 兜底：外部编辑（绕过钩子）→ 请求先回旧快照（不阻塞）→ 后台重建后可见', async () => {
  resetTreeCaches()
  const vault = makeVault('ttl', { 'a.md': '# a\n' })
  const opts = { ttlMs: 0, refreshCooldownMs: 0 } // ttlMs=0=每次访问即失效（兜底路径强制触发）
  getTreeSync(vault, opts) // 建缓存

  fs.writeFileSync(path.join(vault, 'ext.md'), '# 外部编辑\n') // 人用 Obsidian 直改形（绕过钩子）
  const t0 = performance.now()
  const stale = getTreeSync(vault, opts) // 失效即刷：触发后台重建，但请求立刻返回旧快照
  const staleMs = performance.now() - t0
  assert.ok(!stale.nodes.some((n) => n.name === 'ext.md'), 'stale-while-revalidate：先回旧快照（TTL 窗内陈旧）')
  assert.ok(staleMs < 200, `陈旧快照返回不被重建拖住（实测 ${staleMs.toFixed(1)}ms < 200ms）`)

  await whenTreeIdle(vault) // 确定性等待后台重建
  const fresh = getTreeSync(vault, { ttlMs: 60_000, refreshCooldownMs: 0 })
  assert.ok(fresh.nodes.some((n) => n.name === 'ext.md'), 'TTL 兜底重建后外部编辑可见')
  assert.deepEqual(fresh.nodes, scanOracle(vault), '重建后 ≡ 全量扫描')
})

// ── ⑤ A2 验收：大 tmp vault 冷 <1s（首查冷构建）、热均摊 <100ms ─────────────────────
test('⑤ A2 验收：15000 节点 tmp vault——首查冷构建 <1s、热查询均摊 <100ms（零盘读）', () => {
  resetTreeCaches()
  const vault = makeVault('bench')
  const FILES = 15_000
  const DIRS = 100
  for (let i = 0; i < FILES; i += 1) {
    const dir = path.join(vault, `d${String(i % DIRS).padStart(3, '0')}`)
    if (i < DIRS) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `f${String(i).padStart(5, '0')}.md`), `# note ${i}\nbody ${i}\n`)
  }

  const t0 = performance.now()
  const tree = listTree(vault) // 首查冷构建（同步）
  const coldMs = performance.now() - t0
  assert.equal(countNodes(tree.nodes), FILES + DIRS, '节点全量在树（15000 文件 + 100 目录）')
  assert.ok(coldMs < 1000, `首查冷构建 ${coldMs.toFixed(1)}ms < 1000ms（A2 验收口径）`)

  const WARM = 10
  const t1 = performance.now()
  for (let i = 0; i < WARM; i += 1) assert.equal(listTree(vault), tree, '热=同一快照')
  const warmAvg = (performance.now() - t1) / WARM
  assert.ok(warmAvg < 100, `热查询均摊 ${warmAvg.toFixed(3)}ms < 100ms（缓存命中零盘读）`)
  console.log(`[a2-bench] files=${FILES} dirs=${DIRS} coldMs=${coldMs.toFixed(1)} warmAvgMs=${warmAvg.toFixed(3)}`)
})

// ── ⑥ root 隔离 + LRU 上限 ────────────────────────────────────────────────────────
test('⑥ 多根隔离：不同 root 各自缓存互不冒充 + 注册表 LRU 上限防无界增长', () => {
  resetTreeCaches()
  const a = makeVault('root-a', { 'a.md': '# a\n' })
  const b = makeVault('root-b', { 'b.md': '# b\n' })
  const ta = listTree(a)
  const tb = listTree(b)
  assert.equal(ta.root, path.resolve(a))
  assert.equal(tb.root, path.resolve(b))
  assert.deepEqual(ta.nodes.map((n) => n.name), ['a.md'], 'root A 只见 A 面（绝不冒充）')
  assert.deepEqual(tb.nodes.map((n) => n.name), ['b.md'], 'root B 只见 B 面')

  for (let i = 0; i < TREE_CACHE_MAX_ROOTS + 2; i += 1) listTree(makeVault(`lru-${i}`, { 'x.md': '# x\n' }))
  assert.equal(peekTreeCache(a), null, 'LRU 逐出旧根（注册表有界）')
})

// ── ⑦ symlink 不出树（T12 语义）+ 增量路径防御 ─────────────────────────────────────
test('⑦ symlink 不出树（缓存构建与增量同口径）+ 未建缓存不建（peek 语义）', async () => {
  resetTreeCaches()
  const vault = makeVault('symlink', { 'a.md': '# a\n' })
  fs.symlinkSync(path.join(vault, 'a.md'), path.join(vault, 'alias.md'))
  const tree = listTree(vault)
  assert.deepEqual(tree.nodes.map((n) => n.name), ['a.md'], 'symlink 条目不出树（Dirent isFile/isDirectory 双否）')

  const fresh = makeVault('peek', { 'a.md': '# a\n' })
  await createNote(fresh, 'b.md', '# b\n')
  assert.equal(peekTreeCache(fresh), null, '未建缓存不建（写路径增量 peek 语义=A1 惯例）')
  assert.deepEqual(listTree(fresh).nodes.map((n) => n.name), ['a.md', 'b.md'], '首查构建天然含最新盘面')
})

// ── ⑧ 端到端 /ob/api/tree（真 http + 真 registerWebRoutes；热路径 <1s）──────────────
test('⑧ 端到端 GET /ob/api/tree：{data,total} 形不变 + 热路径 <1s + 重复请求体等价', async () => {
  resetTreeCaches()
  const vault = makeVault('e2e', { 'a.md': '# a\n', 'sub/b.md': '# b\n' })
  const routes = new Map()
  const ctx = {
    logger: { warn: () => {} },
    webServer: {
      register(route) {
        routes.set(`${route.kind}:${route.path}`, route)
        return () => routes.delete(`${route.kind}:${route.path}`)
      },
    },
    connection: { requestRejection: () => undefined },
  }
  registerWebRoutes(ctx, () => ({ vaultRoot: vault, ui: { pageSize: 50 } }), { distDir: DIST })
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://x').pathname
    const route = routes.get(`exact:${pathname}`)
    if (route === undefined) {
      res.writeHead(404)
      res.end()
      return
    }
    Promise.resolve(route.handler(req, res)).catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const t0 = performance.now()
    const res = await fetch(`${base}/ob/api/tree`)
    const firstMs = performance.now() - t0
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(Object.keys(body).sort(), ['data', 'total'], '信封形不变 {data,total}')
    assert.deepEqual(Object.keys(body.data).sort(), ['nodes', 'root'], '树形不变 {root,nodes}')
    assert.equal(body.total, countNodes(body.data.nodes), 'total=递归节点数')
    assert.ok(firstMs < 1000, `端到端首查 ${firstMs.toFixed(1)}ms < 1000ms`)

    const t1 = performance.now()
    const res2 = await fetch(`${base}/ob/api/tree`)
    const hotMs = performance.now() - t1
    const body2 = await res2.json()
    assert.equal(res2.status, 200)
    assert.deepEqual(body2, body, '热路径同快照（重复请求体等价）')
    assert.ok(hotMs < 1000, `端到端热路径 ${hotMs.toFixed(1)}ms < 1000ms`)
    console.log(`[a2-e2e] firstMs=${firstMs.toFixed(1)} hotMs=${hotMs.toFixed(1)}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

// ── ⑨ 重建窗竞态封死（journal 幂等重放）：重建在途的写事件绝不被旧快照吞掉 ───────────────
test('⑨ 重建窗增量绝不丢：后台重建在途 createNote → 重建完成后新文件在树（幂等重放/活版本优先）', async () => {
  resetTreeCaches()
  const vault = makeVault('race')
  for (let i = 0; i < 4000; i += 1) {
    const dir = path.join(vault, `d${i % 20}`)
    if (i < 20) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `f${i}.md`), `# ${i}\n`)
  }
  const opts = { ttlMs: 0, refreshCooldownMs: 0 }
  getTreeSync(vault, opts) // 建缓存
  const stale = getTreeSync(vault, opts) // 触发后台重建（4000 节点 walk 含多次让出=重建窗）
  assert.equal(stale.nodes.length > 0, true)

  const created = await createNote(vault, 'race-winner.md', '# 窗口内新建\n') // 落在重建窗内
  assert.equal(created.ok, true)
  await whenTreeIdle(vault)
  const tree = listTree(vault)
  assert.ok(tree.nodes.some((n) => n.name === 'race-winner.md'), '重建窗内写事件绝不被旧快照吞掉')
  assert.deepEqual(tree.nodes, scanOracle(vault), '重建+重放后 ≡ 全量扫描')
})
