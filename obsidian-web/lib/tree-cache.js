// tree-cache — /ob/api/tree 树缓存面（A2：tree 结果缓存 + 失效；合同=changes/2026-09-28-b2-effect-fix/delta-specs/runtime-fix-wave.md 卡 A2）
// 根因（reports/p8-r3c-repro.md §0/§2）：/ob/api/tree 每请求全量 readdirSync 重扫（4.3–4.5s/次、2MB JSON，
//   生产 CIFS 15k+ 节点）——每次开面板都付全量扫描，且同步扫描占死事件循环（S1「一直慢」的一半）。
// 架构（与 A1 反链缓存同哲学：事件增量维护 + 兜底刷新，绝不回归「每请求全量重扫」）：
//   ①事件增量（主路径，毫秒级新鲜）：vault-ops 写路径 emitVaultChange → applyTreeEvent
//     （save/create/rename/delete 与反链缓存同一钩子面）；upsert/remove 幂等；未建缓存不建
//     （首查构建天然含最新盘面——A1 惯例）。插件内写路径零重建、零 TTL 等待。
//   ②TTL 兜底（外部编辑：人用 Obsidian 直改/绕过钩子的变更）：builtAt 超 TTL → 下次请求立即触发
//     后台重建（「失效即刷」），请求本身立刻返回当前快照（stale-while-revalidate）——
//     tree <1s 是硬验收，绝不为重建把请求拖回 4.3s；陈旧窗口 ≤ TTL + 单次重建时长。
//   ③重建窗竞态封死（A1 syncDirty 同款哲学）：重建（异步分批 walk）期间的事件「现行快照即刻应用」
//     同时进 journal（瘦事件，content 不入）；finalize 把 startSeq 之后的事件幂等重放进新快照再换装
//     ——绝不被旧快照吞掉新变更（upsert/remove 幂等 ⇒ walk 已见过的事件重放为无操作）。
// 形不变：listTree(root) → {root, nodes}（node: {name,path,type,children?}，目录优先字典序；
//   dot 条目与 symlink 不出树）——既有 test/vault-ops.test.mjs / web-routes.test.mjs 锁形零改动零弱化。
// 扫描语义单一来源：scanDir 口径（dot 跳过/symlink 不入/目录优先 byName 码元序）自 vault-ops.listTree
//   原样迁入本模块（构建=同步/异步双入口共享同一语义；既有锁形测试逐字未动）。
import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_TREE_TTL_MS = 30_000 // 外部编辑兜底 TTL（与 backlink-index DEFAULT_FILES_STALE_MS 同口径）
export const DEFAULT_REFRESH_COOLDOWN_MS = 2_000 // 重建限流（cooldown 内不重复起全量重建——A1 cooldown 同款）
export const TREE_CACHE_MAX_ROOTS = 8 // 多根档案（T12）LRU 上限（防无界增长；生产 1-2 根）
const WALK_BATCH = 200 // 分批让出粒度（walk 每 200 个 fs 操作 setImmediate 让出事件循环）

function fail(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

function yieldTick() {
  return new Promise((resolve) => setImmediate(resolve))
}

// ── 树构建（scanDir 语义自 vault-ops 原样迁入；同步/异步双入口同语义）──────────────────
function scanDirSync(abs, rel) {
  let dirents
  try {
    dirents = fs.readdirSync(abs, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') throw fail('not_found', `目录不存在：${rel || '.'}`)
    throw err
  }
  const dirs = []
  const files = []
  for (const d of dirents) {
    if (d.name.startsWith('.')) continue
    const childRel = rel ? `${rel}/${d.name}` : d.name
    if (d.isDirectory()) {
      dirs.push({ name: d.name, path: childRel, type: 'dir', children: scanDirSync(path.join(abs, d.name), childRel) })
    } else if (d.isFile()) {
      files.push({ name: d.name, path: childRel, type: 'file' })
    }
  }
  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  return [...dirs.sort(byName), ...files.sort(byName)]
}

async function scanDirAsync(abs, rel, budget) {
  let dirents
  try {
    dirents = await fs.promises.readdir(abs, { withFileTypes: true })
  } catch (err) {
    if (err?.code === 'ENOENT') throw fail('not_found', `目录不存在：${rel || '.'}`)
    throw err
  }
  const dirs = []
  const files = []
  for (const d of dirents) {
    if (d.name.startsWith('.')) continue
    budget.ops += 1
    if (budget.ops % WALK_BATCH === 0) await yieldTick() // 分批让出：事件循环绝不被整库 walk 占死
    const childRel = rel ? `${rel}/${d.name}` : d.name
    if (d.isDirectory()) {
      dirs.push({ name: d.name, path: childRel, type: 'dir', children: await scanDirAsync(path.join(abs, d.name), childRel, budget) })
    } else if (d.isFile()) {
      files.push({ name: d.name, path: childRel, type: 'file' })
    }
  }
  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  return [...dirs.sort(byName), ...files.sort(byName)]
}

function buildTreeSync(rootAbs) {
  return { root: rootAbs, nodes: scanDirSync(rootAbs, '') }
}

async function buildTreeAsync(rootAbs) {
  return { root: rootAbs, nodes: await scanDirAsync(rootAbs, '', { ops: 0 }) }
}

// ── 增量维护（事件驱动失效/更新；applyEventToTree 幂等——journal 重放安全的前提）──────────
/** 事件路径 → 树可见段（dot 条目不出树=scanDir 同口径 → null=树内不可见）；穿越/空形 → 'invalid' */
function relSegments(rel) {
  const norm = path.posix.normalize(String(rel ?? '').replace(/\\/g, '/'))
  if (norm === '' || norm === '.' || norm.split('/').some((s) => s === '..')) return 'invalid'
  const segs = norm.split('/').filter((s) => s !== '' && s !== '.')
  if (segs.length === 0) return 'invalid'
  if (segs.some((s) => s.startsWith('.'))) return null // dot 条目：树内不可见（无操作=幂等 ok）
  return segs
}

/** 目录优先 + byName 码元序（与 scanDir 的 [...dirs.sort(byName), ...files.sort(byName)] 同序） */
function cmpNodes(a, b) {
  const ad = a.type === 'dir' ? 0 : 1
  const bd = b.type === 'dir' ? 0 : 1
  if (ad !== bd) return ad - bd
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

function insertSorted(list, node) {
  let at = list.length
  for (let i = 0; i < list.length; i += 1) {
    if (cmpNodes(node, list[i]) < 0) {
      at = i
      break
    }
  }
  list.splice(at, 0, node)
}

/** 文件节点 upsert（save/create/rename 目标）；false=缓存陈旧不可增量（交重建校正） */
function upsertFileNode(nodes, rel) {
  const segs = relSegments(rel)
  if (segs === null) return true // 树内不可见条目：无操作（幂等）
  if (segs === 'invalid') return false // 非法/穿越形（写路径围栏已拒；防御性交重建）
  let list = nodes
  for (let i = 0; i < segs.length - 1; i += 1) {
    const child = list.find((n) => n.name === segs[i])
    if (child === undefined || child.type !== 'dir') return false // 中间目录缺席=缓存陈旧
    list = child.children
  }
  const name = segs[segs.length - 1]
  const existing = list.find((n) => n.name === name)
  if (existing !== undefined) {
    if (existing.type === 'file') return true // 幂等：已在树内
    return false // 类型冲突=缓存陈旧（交重建）
  }
  insertSorted(list, { name, path: segs.join('/'), type: 'file' })
  return true
}

/** 节点移除（delete/rename 源；目录=整子树随节点走）；恒幂等 ok */
function removeNodeByRel(nodes, rel) {
  const segs = relSegments(rel)
  if (segs === null || segs === 'invalid') return true // 不可见/非法形：树内无该节点（幂等）
  let list = nodes
  for (let i = 0; i < segs.length - 1; i += 1) {
    const child = list.find((n) => n.name === segs[i])
    if (child === undefined || child.type !== 'dir') return true // 缺席=无操作（幂等）
    list = child.children
  }
  const at = list.findIndex((n) => n.name === segs[segs.length - 1])
  if (at >= 0) list.splice(at, 1)
  return true
}

/** 事件 → 树增量（幂等；true=已按事件语义落位，false=缓存陈旧需重建校正） */
function applyEventToTree(tree, event) {
  if (event.type === 'save' || event.type === 'create') return upsertFileNode(tree.nodes, event.path)
  if (event.type === 'rename') {
    removeNodeByRel(tree.nodes, event.from) // 幂等
    return upsertFileNode(tree.nodes, event.to)
  }
  if (event.type === 'delete') {
    removeNodeByRel(tree.nodes, event.path) // 文件/目录同删（子树随节点走）；幂等
    return true
  }
  return true // 未知事件形：不动树（不脏化）
}

/** journal 瘦事件（content 不入 journal：树形只关心路径结构） */
function slimEvent(event) {
  if (event.type === 'save' || event.type === 'create') return { type: event.type, path: event.path }
  if (event.type === 'rename') return { type: 'rename', from: event.from, to: event.to }
  if (event.type === 'delete') return { type: 'delete', path: event.path, isDir: event.isDir === true }
  return { type: event.type }
}

// ── 缓存注册表（每 vault 一份；键=rootAbs；LRU 上限防无界增长）────────────────────
const caches = new Map()

function makeEntry(rootAbs) {
  return {
    rootAbs,
    tree: null, // {root, nodes}
    builtAt: 0,
    dirty: false, // 增量不可应用留痕（下次请求触发重建校正）
    seq: 0, // 事件序号
    journal: [], // 重建窗内瘦事件 {seq, event}
    rebuilding: null, // 在途重建 Promise（单飞：重入折叠）
    lastRefreshAt: 0, // 重建限流
    lastUsedAt: 0,
  }
}

function getEntry(rootAbs) {
  const key = path.resolve(rootAbs)
  let entry = caches.get(key)
  if (entry === undefined) {
    entry = makeEntry(key)
    caches.set(key, entry)
  }
  entry.lastUsedAt = Date.now() // 先touch 后逐出：刚用/刚建的条目是最新者，绝不自逐出
  evictIfNeeded()
  return entry
}

function evictIfNeeded() {
  if (caches.size <= TREE_CACHE_MAX_ROOTS) return
  const victims = [...caches.values()]
    .filter((e) => e.rebuilding === null) // 在途重建不逐出（结果落地后再走 LRU）
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt)
  for (const v of victims) {
    if (caches.size <= TREE_CACHE_MAX_ROOTS) break
    caches.delete(v.rootAbs)
  }
}

/** 只取不建（写路径增量钩子用；A1 peekBacklinkCache 同款） */
export function peekTreeCache(rootAbs) {
  return caches.get(path.resolve(rootAbs)) ?? null
}

/** 测试缝：清全部缓存（强制下次查询重建） */
export function resetTreeCaches() {
  caches.clear()
}

/** 测试缝：在途重建 Promise（无在途=已落定）——TTL 兜底断言的确定性等待点 */
export function whenTreeIdle(rootAbs) {
  const entry = caches.get(path.resolve(rootAbs))
  return entry?.rebuilding ?? Promise.resolve()
}

/**
 * 写路径事件增量（vault-ops.emitVaultChange 钩子面；与反链缓存 updateBacklinkCache 并列）。
 * peek 语义：未建缓存不建（首查构建天然含最新盘面）；重建窗内事件同时进 journal（finalize 幂等重放）。
 * 返回 true=已按事件语义落位；false=缓存陈旧（已置 dirty + 触发限流后台重建）。
 */
export function applyTreeEvent(rootAbs, event) {
  const entry = caches.get(path.resolve(rootAbs))
  if (entry === undefined) return true
  entry.seq += 1
  if (entry.rebuilding !== null) entry.journal.push({ seq: entry.seq, event: slimEvent(event) })
  if (entry.tree === null) return true // 未建缓存：下次构建读盘即最新
  const ok = applyEventToTree(entry.tree, event)
  if (!ok) {
    entry.dirty = true
    scheduleRefresh(entry)
  }
  return ok
}

/** 换装（重建窗竞态封死：startSeq 之后的 journal 事件幂等重放进新快照，绝不被旧快照吞掉） */
function finalize(entry, tree, startSeq, now) {
  const tail = entry.journal.filter((j) => j.seq > startSeq)
  let ok = true
  for (const j of tail) {
    if (!applyEventToTree(tree, j.event)) ok = false
  }
  // journal 收敛：丢弃已重放段（瘦事件极小；跨重建窗的更晚事件留给更晚 startSeq 的在途重建）
  entry.journal = entry.journal.filter((j) => j.seq > startSeq)
  entry.tree = tree
  entry.builtAt = now()
  entry.dirty = !ok
}

/** 后台重建（异步分批 walk + 让出；单飞；失败=留痕保留旧快照，下次请求重试） */
function scheduleRefresh(entry, opts = {}) {
  if (entry.rebuilding !== null) return entry.rebuilding
  const now = opts.now ?? Date.now
  entry.lastRefreshAt = now()
  const startSeq = entry.seq
  const run = runRebuild(entry, startSeq, now).finally(() => {
    if (entry.rebuilding === run) entry.rebuilding = null
  })
  entry.rebuilding = run
  return run
}

async function runRebuild(entry, startSeq, now) {
  try {
    const tree = await buildTreeAsync(entry.rootAbs)
    finalize(entry, tree, startSeq, now)
  } catch (err) {
    console.warn(`[obsidian-web] tree 缓存后台重建失败（保留旧快照，下次请求重试；TTL 兜底不阻塞请求）：${err?.message ?? err}`)
  }
}

/** 失效即刷（限流）：dirty/TTL 过期 → 起后台重建；请求不等待（tree <1s 硬验收） */
function maybeScheduleRefresh(entry, opts = {}) {
  const now = opts.now ?? Date.now
  const ttlMs = opts.ttlMs ?? DEFAULT_TREE_TTL_MS
  if (!entry.dirty && now() - entry.builtAt < ttlMs) return
  if (entry.rebuilding !== null) return
  const cooldownMs = opts.refreshCooldownMs ?? DEFAULT_REFRESH_COOLDOWN_MS
  if (now() - entry.lastRefreshAt < cooldownMs) return // 限流：不为每次请求起重建
  scheduleRefresh(entry, opts)
}

/**
 * 树快照（同步入口；vault-ops.listTree 契约面）：缓存命中=零盘读；冷=同步构建（首查）；
 * dirty/TTL 过期=立即触发后台重建并返回当前快照（stale-while-revalidate）。
 * @param {{ttlMs?, now?, refreshCooldownMs?}} [opts] 测试缝（缺省=生产口径）
 * @returns {{root: string, nodes: object[]}} 形不变（消费面只读——共享缓存快照，同 A1 查询面口径）
 */
export function getTreeSync(rootAbs, opts = {}) {
  const entry = getEntry(rootAbs)
  const now = opts.now ?? Date.now
  if (entry.tree === null) {
    const tree = buildTreeSync(entry.rootAbs) // 同步构建不可被事件打断（单线程）→ startSeq=当前 seq
    finalize(entry, tree, entry.seq, now)
    return entry.tree
  }
  maybeScheduleRefresh(entry, opts)
  return entry.tree
}

/**
 * 树快照（异步入口；web-routes treeHandler 面）：冷=异步分批构建（请求等 wall，事件循环不被占死
 * ——并发请求不挂死）；热=立即返回快照；dirty/TTL 过期=后台重建不阻塞请求。
 */
export async function getTreeAsync(rootAbs, opts = {}) {
  const entry = getEntry(rootAbs)
  const now = opts.now ?? Date.now
  if (entry.tree === null) {
    if (entry.rebuilding === null) scheduleRefresh(entry, opts) // 冷启动：本次构建即请求等待对象（单飞合流）
    await entry.rebuilding
    if (entry.tree === null) {
      // 后台重建失败（如 vaultRoot 缺失）：直接构建把可解释错误形抛给调用方（与旧 listTree 行为一致）
      const tree = await buildTreeAsync(entry.rootAbs)
      finalize(entry, tree, entry.seq, now)
    }
    return entry.tree
  }
  maybeScheduleRefresh(entry, opts)
  return entry.tree
}
