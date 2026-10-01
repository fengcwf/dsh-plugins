// lib/cache.js — LRU 查询缓存（Task 9；K-7 落点 / K-9 TTL 可配）
//
// 语义：缓存键 = 查询词 + 源名（归一 trim）；LRU 淘汰 + TTL 惰性过期；落点 dir 必由调用方注入
// （默认值=Config.cacheDir 的展开产物，本文件不设任何路径默认——K-7 禁硬编码 home/安装位）。
// 存储形：dir 下每键一文件（sha256(查询词\n源名).json），内容 {query, source, sources, savedAt}；
// 内存 Map 维护 LRU 序与索引，进程重启经扫描目录恢复（TTL 内有效）。
// maxEntries 默认 50（可注入覆盖）；ttlMs=0 = 不缓存（get 恒 miss、set 不落盘）。
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** LRU 容量默认值（合同口径 LRU 50 条；可经 options.maxEntries 注入覆盖）。 */
export const DEFAULT_MAX_ENTRIES = 50

const typeName = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value)

/** 缓存键归一：查询词 trim + 源名；键名文件 = sha256(query \n source) 十六进制（路径安全）。 */
function entryFileFor(dir, query, source) {
  const digest = createHash('sha256').update(`${query}\n${source}`).digest('hex')
  return path.join(dir, `${digest}.json`)
}

/**
 * 创建查询缓存实例。
 * @param {{dir: string, ttlMs: number, maxEntries?: number, now?: () => number}} options -
 *   dir 落点目录（必填，K-7 单一入口）；ttlMs 来自 Config.cacheTtlMs（K-9）；now 注入时钟（测试用）。
 * @returns {Promise<{get: Function, set: Function, size: Function, clear: Function}>}
 */
export async function createCache(options = {}) {
  const { dir, ttlMs } = options
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const now = typeof options.now === 'function' ? options.now : () => Date.now()
  if (typeof dir !== 'string' || dir.length === 0) {
    throw new TypeError('createCache: dir 必须是非空字符串（由 Config.cacheDir 展开注入，K-7）')
  }
  if (!Number.isInteger(ttlMs) || ttlMs < 0) {
    throw new TypeError('createCache: ttlMs 必须是非负整数（来自 Config.cacheTtlMs，K-9）')
  }
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new TypeError('createCache: maxEntries 必须是正整数')
  }
  if (typeof options.now !== 'undefined' && typeof options.now !== 'function') {
    throw new TypeError('createCache: now 若在场必须是函数')
  }

  /** LRU 索引：key → {file, savedAt}；Map 迭代序 = 最旧→最新（get/set 时重插刷新）。 */
  const index = new Map()
  const keyOf = (query, source) => `${query}\n${source}`

  // W4-CACHE-FAIL-OPEN：落点不可建/启动扫描失败均 best-effort 降级（内存序仍工作、持久化失效），
  // 缓存是可重建的加速层——绝不因缓存 IO 故障炸掉已成功的检索结果。
  try {
    await mkdir(dir, { recursive: true })
  } catch {
    // 降级：无持久目录（后续 set 落盘失败亦被吞掉）
  }
  let entryNames = []
  try {
    entryNames = await readdir(dir)
  } catch {
    // 降级：跳过重启恢复（缓存冷启动）
  }
  // 重启恢复：扫描落点目录重建索引（TTL 过期条目惰性剔除并删文件）。
  // W4-RELOAD-LRU-ORDER：先收集再按 savedAt 升序重建（最旧在前），满容淘汰序才与 LRU 语义一致。
  const restored = []
  for (const entryName of entryNames) {
    if (!entryName.endsWith('.json')) continue
    const file = path.join(dir, entryName)
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'))
      if (!parsed || typeof parsed.query !== 'string' || typeof parsed.source !== 'string') continue
      const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0
      if (ttlMs === 0 || now() - savedAt >= ttlMs) {
        await rm(file, { force: true }).catch(() => {})
        continue
      }
      restored.push({ key: keyOf(parsed.query, parsed.source), file, savedAt })
    } catch {
      // 损坏条目直接剔除（缓存可重建，不阻塞装载）
      await rm(file, { force: true }).catch(() => {})
    }
  }
  restored.sort((a, b) => (a.savedAt - b.savedAt) || (a.key < b.key ? -1 : 1))
  for (const entry of restored) index.set(entry.key, { file: entry.file, savedAt: entry.savedAt })
  await evictOverflow()

  /** LRU 淘汰：超 maxEntries 时从最旧端删条目（含落盘文件；删除失败 best-effort）。 */
  async function evictOverflow() {
    while (index.size > maxEntries) {
      const [oldestKey, oldest] = index.entries().next().value
      index.delete(oldestKey)
      await rm(oldest.file, { force: true }).catch(() => {})
    }
  }

  return {
    /**
     * 读缓存：键=查询词+源名；TTL 过期/未命中返回 undefined（过期条目顺手剔除）。
     * @returns {Promise<{sources: Array, truncated: boolean}|undefined>} 原始截断标志随读返回
     *   （W4-CACHE-TRUNCATED-LOST：二次查询 truncated 不丢）。
     */
    async get(query, source) {
      const key = keyOf(query, source)
      const entry = index.get(key)
      if (!entry) return undefined
      if (ttlMs === 0 || now() - entry.savedAt >= ttlMs) {
        index.delete(key)
        await rm(entry.file, { force: true }).catch(() => {})
        return undefined
      }
      // 命中刷新 LRU 序
      index.delete(key)
      index.set(key, entry)
      try {
        const parsed = JSON.parse(await readFile(entry.file, 'utf8'))
        return {
          sources: Array.isArray(parsed.sources) ? parsed.sources : [],
          truncated: Boolean(parsed.truncated),
        }
      } catch {
        index.delete(key)
        await rm(entry.file, { force: true }).catch(() => {})
        return undefined
      }
    },

    /**
     * 写缓存：键=查询词+源名；超容量走 LRU 淘汰。ttlMs=0 不落盘。
     * best-effort（W4-CACHE-FAIL-OPEN）：落盘失败静默降级为不缓存，绝不向上抛——
     * 缓存 IO 故障不得炸掉已成功的检索结果。
     * @param {string} query - 查询词。
     * @param {string} source - 源名。
     * @param {{sources: Array, truncated: boolean}} payload - 结果载荷（含原始截断标志）。
     */
    async set(query, source, payload) {
      if (ttlMs === 0) return
      const key = keyOf(query, source)
      const sources = payload && Array.isArray(payload.sources) ? payload.sources : []
      const truncated = Boolean(payload && payload.truncated)
      const savedAt = now()
      const file = entryFileFor(dir, query, source)
      const serialized = JSON.stringify({ query, source, sources, truncated, savedAt })
      try {
        const existing = index.get(key)
        if (existing) {
          index.delete(key)
          await rm(existing.file, { force: true }).catch(() => {})
        }
        await writeFile(file, serialized, 'utf8')
      } catch {
        // 落盘失败：不入索引（等价该键不缓存），读路径不受影响
        index.delete(key)
        return
      }
      index.set(key, { file, savedAt })
      await evictOverflow()
    },

    /** 当前在场条目数（LRU 索引口径）。 */
    size() {
      return index.size
    },

    /** 清空（含落盘文件；删除失败 best-effort）。 */
    async clear() {
      for (const entry of index.values()) await rm(entry.file, { force: true }).catch(() => {})
      index.clear()
    },
  }
}
