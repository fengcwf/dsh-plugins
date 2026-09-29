// backlink-index — 反链索引面（A1：scanBacklinks 索引化；合同=changes/2026-09-28-b2-effect-fix/delta-specs/runtime-fix-wave.md）
// 根因（reports/p8-r3c-repro.md §0/§2/§7）：scanBacklinks 每次开笔记同步 readFileSync 全库 15277 md
//   （实测 47.4s）→ /ob/api/backlinks 全进程事件循环阻塞 → 服务全挂 + 前端无限加载 + watchdog 误杀。
// 架构（每 vault 一份内存反链缓存；查询=键索引候选 + matchesTarget 精确复核，逐行语义与旧全量扫同源）：
//   构建源二选一（API 形零变化）：
//   ①索引面快照（首选，生产路径）：index-store docs 表（content 列=body，index-store.js）→ replaceFromDocs
//     ——index-service 在 start 与对账完成后推送；完全不碰 vault 盘（CIFS 零读），构建即本地 SQLite 读+解析。
//     陈旧窗口与检索索引同口径 ≤30min（OW-INV-11）；插件内写路径毫秒级增量（见下）。
//   ②文件构建（降级路径：懒构建 + 增量维护 + 上限保护/限流）：首查预算内扫盘构建；walk 与逐文件读
//     双双吃预算（budgetMs），超预算/超文件上限=partial + degraded 留痕（INV-15 禁静默）；cooldown 内
//     不重试构建（限流）。绝不恢复「每次请求无界全库同步扫」——47s 根因不许回归。
// 增量维护（A1 硬要求③）：vault-ops 写路径事件（save/create/rename/delete，emitVaultChange 钩子）→
//   单源 upsert/remove 毫秒级新鲜；快照构建途中的增量并入 syncDirty（finalize 时活版本优先，
//   绝不被旧快照吞掉——同步是异步分批的，事件可能落在构建窗口内）。
// 语义单一来源（既有测试断言零弱化零改动）：解析/匹配（WIKI_LINK_RE/MD_LINK_RE/linkTarget/matchesTarget）
//   自 vault-ops.js 原样逐字迁入本模块；vault-ops.scanBacklinks 变薄封装（围栏 + 查询）。
//   候选键超集证明（绝不漏真反链）：命中只可能经 ①viaRel===noteBase ②tBase===noteBase ③basename 相等；
//   每条出链按 {tBase, viaRel, tName} 三键入桶，查询按 {noteBase, nName} 取桶=真命中必进候选，
//   再以 matchesTarget 原语精确复核（假候选出局）——与旧逐行扫描结果集合同构。
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

// ── 解析/匹配语义（自 vault-ops.js 逐字迁入=语义同源；改动=破坏既有测试锁形）────────────
const WIKI_LINK_RE = /\[\[([^\[\]]+)\]\]/g
const MD_LINK_RE = /\[[^\]]*\]\(((?:[^()]|\([^()]*\))*)\)/g

function linkTarget(raw) {
  const t = raw.split('#')[0].split('|')[0].trim()
  if (!t || t.startsWith('#')) return null
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return null // 外链不计
  return t
}

/** 目标匹配（逐字同 vault-ops 旧实现）：wikilink 别名/锚点剥离 + basename 匹配 + md 相对链接按源目录解析 */
export function matchesTarget(targetNote, srcPath, rawTarget) {
  const t = linkTarget(rawTarget)
  if (!t) return false
  const noteBase = targetNote.replace(/\.md$/i, '')
  const tBase = t.replace(/\.md$/i, '')
  const srcDir = path.posix.dirname(srcPath)
  const viaRel = path.posix.normalize(srcDir === '.' ? tBase : `${srcDir}/${tBase}`)
  if (viaRel === noteBase) return true
  if (tBase === noteBase) return true
  const tName = tBase.split('/').pop()
  const nName = noteBase.split('/').pop()
  return tName !== '' && tName === nName // Obsidian basename 语义（大小写敏感，T11 归位折叠）
}

/**
 * 单源出链提取（逐行语义与旧扫描同构：同行多链只记一条、text=行原文去尾 \r、外链/纯锚点不计）。
 * @returns {{srcPath, line, text, targets: {raw, keys: string[]}[]}[]}
 */
export function extractSourceEntries(srcPath, content) {
  const entries = []
  const lines = String(content).split('\n')
  for (let line = 0; line < lines.length; line += 1) {
    const text = lines[line].replace(/\r$/, '')
    WIKI_LINK_RE.lastIndex = 0
    MD_LINK_RE.lastIndex = 0
    const raws = [
      ...[...text.matchAll(WIKI_LINK_RE)].map((m) => m[1]),
      ...[...text.matchAll(MD_LINK_RE)].map((m) => m[1]),
    ]
    const targets = []
    for (const raw of raws) {
      const t = linkTarget(raw)
      if (t === null) continue
      const tBase = t.replace(/\.md$/i, '')
      const srcDir = path.posix.dirname(srcPath)
      const viaRel = path.posix.normalize(srcDir === '.' ? tBase : `${srcDir}/${tBase}`)
      const tName = tBase.split('/').pop()
      const keys = [...new Set([tBase, viaRel, ...(tName === '' ? [] : [tName])])]
      targets.push({ raw, keys })
    }
    if (targets.length === 0) continue
    entries.push({ srcPath, line: line + 1, text, targets })
  }
  return entries
}

// ── 缓存（每 vault 一份；键=rootAbs）────────────────────────────────────────────
export const DEFAULT_BUILD_BUDGET_MS = 750 // 降级构建单次预算（walk+读盘都在预算内——请求延迟有界）
export const DEFAULT_BUILD_MAX_FILES = 20_000 // 降级构建文件上限（上限保护）
export const DEFAULT_REBUILD_COOLDOWN_MS = 2_000 // 构建限流：cooldown 内不重试（禁止请求风暴重复全扫）
export const DEFAULT_FILES_STALE_MS = 30_000 // 文件构建源 TTL（外部编辑兜底；docs 源由索引面同步保鲜）
const SYNC_BATCH = 200 // docs 快照解析分批（每批让出事件循环）

function buildKeyIndex(entriesMap) {
  const keyIndex = new Map()
  for (const list of entriesMap.values()) {
    for (const entry of list) {
      for (const target of entry.targets) {
        for (const key of target.keys) {
          let bucket = keyIndex.get(key)
          if (bucket === undefined) keyIndex.set(key, (bucket = []))
          bucket.push(entry)
        }
      }
    }
  }
  return keyIndex
}

export function createBacklinkCache(rootAbs) {
  return {
    rootAbs,
    state: 'empty', // empty | partial | ready
    source: null, // 'docs' | 'files'
    entries: new Map(), // rel → Entry[]
    keyIndex: new Map(), // 匹配键 → Entry[]
    builtAt: 0,
    lastAttemptAt: 0,
    scanned: 0,
    syncDepth: 0, // >0 = docs 快照构建在途（含排队）；增量收集窗 syncDirty 同期开启
    syncDirty: null, // Set<rel>（快照构建窗内的增量，finalize 时活版本优先，绝不被旧快照吞掉）
    syncQueue: Promise.resolve(),
    degraded: null, // {reason, message, scanned}（INV-15 留痕面）
  }
}

const caches = new Map()

/** 取/建缓存（rootAbs 归一）；opts.warn 可注入留痕出口（缺省 console.warn） */
export function getBacklinkCache(rootAbs, opts = {}) {
  const key = path.resolve(rootAbs)
  let cache = caches.get(key)
  if (cache === undefined) {
    cache = createBacklinkCache(key)
    caches.set(key, cache)
  }
  if (typeof opts.warn === 'function') cache.warn = opts.warn
  return cache
}

/** 只取不建（写路径增量钩子用：未建缓存不建——首查构建天然含最新盘面/索引面） */
export function peekBacklinkCache(rootAbs) {
  return caches.get(path.resolve(rootAbs)) ?? null
}

/** 测试缝：清全部缓存（强制下次查询重建） */
export function resetBacklinkCaches() {
  caches.clear()
}

function markDirty(cache, rel) {
  if (cache.syncDirty !== null) cache.syncDirty.add(rel)
}

/** 单源增量（save/create/rename 改写件）：旧条目出桶 + 新条目入桶 */
export function upsertSource(cache, relPath, content) {
  removeSource(cache, relPath, { dirty: false })
  const entries = extractSourceEntries(relPath, content)
  if (entries.length > 0) {
    cache.entries.set(relPath, entries)
    for (const entry of entries) {
      for (const target of entry.targets) {
        for (const key of target.keys) {
          let bucket = cache.keyIndex.get(key)
          if (bucket === undefined) cache.keyIndex.set(key, (bucket = []))
          bucket.push(entry)
        }
      }
    }
  }
  markDirty(cache, relPath)
}

/** 单源移除（delete/rename 源） */
export function removeSource(cache, relPath, opts = {}) {
  const list = cache.entries.get(relPath)
  if (list !== undefined) {
    for (const entry of list) {
      for (const target of entry.targets) {
        for (const key of new Set(target.keys)) {
          const bucket = cache.keyIndex.get(key)
          if (bucket === undefined) continue
          const at = bucket.indexOf(entry)
          if (at >= 0) bucket.splice(at, 1)
          if (bucket.length === 0) cache.keyIndex.delete(key)
        }
      }
    }
    cache.entries.delete(relPath)
  }
  if (opts.dirty !== false) markDirty(cache, relPath)
}

/** 子树移除（目录 delete）：path=rel 或 rel 前缀下任意段 */
export function removeTreeSource(cache, rel) {
  for (const key of [...cache.entries.keys()]) {
    if (key === rel || key.startsWith(`${rel}/`)) removeSource(cache, key)
  }
  markDirty(cache, rel)
}

function installSnapshot(cache, built, { source, complete, degraded }) {
  if (cache.syncDirty !== null && cache.syncDirty.size > 0) {
    // 构建窗口内的增量：活版本优先（新增/改写带入、删除保持缺席）——绝不被旧快照吞掉
    for (const rel of cache.syncDirty) {
      const live = cache.entries.get(rel)
      if (live === undefined) built.delete(rel)
      else built.set(rel, live)
    }
  }
  cache.entries = built
  cache.keyIndex = buildKeyIndex(built)
  cache.state = complete ? 'ready' : 'partial'
  cache.source = source
  cache.degraded = degraded
  if (complete) cache.builtAt = Date.now()
}

function yieldTick() {
  return new Promise((resolve) => setImmediate(resolve))
}

/**
 * docs 快照整体替换（①索引面路径；index-service 在 start/对账完成后推送）。
 * 异步分批解析（SYNC_BATCH/批让出事件循环）；同 cache 串行（syncQueue），重入折叠排队。
 * @param {Iterable<{rel: string, content: string}> | AsyncIterable<{rel, content}>} docs
 */
export function replaceFromDocs(cache, docs) {
  // 同步开窗（关键：增量在本调用同步段即被记录，绝不因 run 异步启动而漏记——竞态窗口封死）
  if (cache.syncDirty === null) cache.syncDirty = new Set()
  cache.syncDepth += 1
  const run = cache.syncQueue.then(
    () => runReplaceFromDocs(cache, docs),
    () => runReplaceFromDocs(cache, docs),
  )
  cache.syncQueue = run.then(() => {}, () => {})
  return run
}

async function runReplaceFromDocs(cache, docs) {
  const built = new Map()
  let scanned = 0
  try {
    let batch = []
    const drain = () => {
      for (const d of batch) {
        const entries = extractSourceEntries(d.rel, d.content)
        if (entries.length > 0) built.set(d.rel, entries)
        scanned += 1
      }
      batch = []
    }
    for (const d of docs) {
      batch.push(d)
      if (batch.length >= SYNC_BATCH) {
        drain()
        await yieldTick()
      }
    }
    drain()
    installSnapshot(cache, built, { source: 'docs', complete: true, degraded: null })
    cache.scanned = scanned
  } catch (err) {
    cache.degraded = {
      reason: 'docs-sync-failed',
      message: String(err?.message ?? err),
      scanned,
    }
    throw err
  } finally {
    cache.syncDepth -= 1
    if (cache.syncDepth <= 0) cache.syncDirty = null // 收窗（排队 run 的增量已并入各自 finalize）
  }
}

// ── 降级路径：预算内文件构建（walk 与读盘同吃预算；超限 partial + degraded 留痕）──────────
/** md 清单（同 vault-ops.collectFiles(mdOnly) 口径：dot 条目跳过、symlink 不入、.md only、字典序）；
 *  walk 吃预算：超时即截断返回（禁止无界全库遍历） */
function listMarkdownFiles(rootAbs, deadline) {
  const out = []
  let truncated = false
  const walk = (abs, rel) => {
    if (truncated) return
    if (performance.now() >= deadline) {
      truncated = true
      return
    }
    let dirents
    try {
      dirents = fs.readdirSync(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const d of dirents) {
      if (d.name.startsWith('.')) continue
      const childRel = rel ? `${rel}/${d.name}` : d.name
      if (d.isDirectory()) walk(path.join(abs, d.name), childRel)
      else if (d.isFile() && d.name.toLowerCase().endsWith('.md')) out.push(childRel)
      if (truncated) return
    }
  }
  walk(path.resolve(rootAbs), '')
  return { files: out.sort(), truncated }
}

function buildFromFiles(cache, rootAbs, opts) {
  const budgetMs = opts.buildBudgetMs ?? DEFAULT_BUILD_BUDGET_MS
  const maxFiles = opts.buildMaxFiles ?? DEFAULT_BUILD_MAX_FILES
  const warn = opts.warn ?? cache.warn ?? ((line) => console.warn(line))
  const started = performance.now()
  const deadline = started + Math.max(0, budgetMs)
  const built = new Map()
  let scanned = 0
  let degraded = null
  const { files, truncated } = listMarkdownFiles(rootAbs, deadline)
  if (truncated) {
    degraded = { reason: 'build-budget', message: `反链降级构建超时截断（budget=${budgetMs}ms，避免无界全库同步扫；索引面可用时由索引快照接管）`, scanned }
  } else {
    for (const rel of files) {
      if (scanned >= maxFiles) {
        degraded = { reason: 'build-capped', message: `反链降级构建超文件上限截断（maxFiles=${maxFiles}，避免无界全库同步扫；索引面可用时由索引快照接管）`, scanned }
        break
      }
      if (performance.now() >= deadline) {
        degraded = { reason: 'build-budget', message: `反链降级构建超时截断（budget=${budgetMs}ms，避免无界全库同步扫；索引面可用时由索引快照接管）`, scanned }
        break
      }
      let content
      try {
        content = fs.readFileSync(path.join(rootAbs, rel), 'utf8')
      } catch {
        continue // 单文件读失败跳过（对账/重建兜底；不整建炸）
      }
      const entries = extractSourceEntries(rel, content)
      if (entries.length > 0) built.set(rel, entries)
      scanned += 1
    }
  }
  installSnapshot(cache, built, { source: 'files', complete: degraded === null, degraded })
  cache.scanned = scanned
  if (degraded !== null) {
    warn(`[obsidian-web] 反链索引降级构建（限流/限量留痕）：${degraded.reason} scanned=${scanned}/${files.length}`)
  }
}

function maybeBuild(cache, rootAbs, opts) {
  const now = Date.now()
  const staleMs = opts.filesStaleMs ?? DEFAULT_FILES_STALE_MS
  const need =
    opts.forceRebuild === true ||
    cache.state !== 'ready' ||
    (cache.source === 'files' && now - cache.builtAt >= staleMs)
  if (!need) return
  if (cache.syncDepth > 0) {
    // docs 快照在途：不烧盘上预算（限流），degraded 留痕；快照落地自动恢复
    cache.degraded = {
      reason: 'backlink-syncing',
      message: '索引面反链快照构建中（构建完成自动恢复）',
      scanned: cache.scanned,
    }
    return
  }
  const cooldownMs = opts.rebuildCooldownMs ?? DEFAULT_REBUILD_COOLDOWN_MS
  if (now - cache.lastAttemptAt < cooldownMs) {
    if (cache.state !== 'ready' && cache.degraded === null) {
      cache.degraded = { reason: 'backlink-rebuild-throttled', message: '反链重建限流中（cooldown 内不重复全量构建）', scanned: cache.scanned }
    }
    return
  }
  cache.lastAttemptAt = now
  buildFromFiles(cache, rootAbs, opts)
}

/**
 * 反链查询（A1 核心：键索引候选 + 精确复核；无每请求全库 readFileSync）。
 * @returns {{backlinks: {path, line, text}[], degraded: null | {reason, message, scanned}}}
 */
export function queryBacklinks(rootAbs, relPath, opts = {}) {
  const cache = getBacklinkCache(rootAbs, opts)
  maybeBuild(cache, rootAbs, opts)
  const noteBase = relPath.replace(/\.md$/i, '')
  const queryKeys = [noteBase]
  const nName = noteBase.split('/').pop()
  if (nName !== '') queryKeys.push(nName)
  const seen = new Set()
  const backlinks = []
  for (const key of queryKeys) {
    const bucket = cache.keyIndex.get(key)
    if (bucket === undefined) continue
    for (const entry of bucket) {
      if (seen.has(entry)) continue
      seen.add(entry)
      if (entry.srcPath === relPath) continue // 目标不自指
      if (!entry.targets.some((t) => matchesTarget(relPath, entry.srcPath, t.raw))) continue // 精确复核（假候选出局）
      backlinks.push({ path: entry.srcPath, line: entry.line, text: entry.text })
    }
  }
  backlinks.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line))
  if (cache.state === 'ready') return { backlinks, degraded: null }
  const d = cache.degraded ?? { reason: 'backlink-index-degraded', message: '反链索引未就绪（降级部分结果）', scanned: cache.scanned }
  return { backlinks, degraded: { reason: d.reason, message: d.message, scanned: d.scanned } }
}
