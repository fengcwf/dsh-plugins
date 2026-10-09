// lib/trigger-log.js — 触发日志进程内存环（T9 / US-9 / INV-11~13）
// 职责：搜索触发记录的内存环（容量默认 200，可配）+ 脱敏摘要 + 逐源统计聚合。
// 硬约束（机械判据见 test/trigger-log.test.mjs）：
//   INV-11 纯进程内存：本模块零持久化调用（机械 grep 断言见 test/trigger-log.test.mjs），进程重启即清空；
//   INV-12 脱敏：条目键白名单闭集，白名单外的键一律弃置；queryDigest 只留 {len, first}（首词 + 截断），
//     完整查询词 / 响应正文 / 请求头绝不入条目；
//   INV-13 fail-open：record 全程兜错，写失败不抛、置 available=false 可探测，绝不影响搜索主链。
// 零依赖（K-8 / P-4）：不引用任何模块。

/** 默认容量（调用方从 Config.logCapacity 传入覆盖；INV-11 默认 200）。 */
const DEFAULT_CAPACITY = 200
/** 条目键白名单闭集（TECH.md §2-①；闭集外的键即弃）。 */
const ENTRY_KEYS = ['ts', 'via', 'ok', 'elapsedMs', 'resultCount', 'queryDigest', 'sources']
/** 逐源明细键白名单闭集（code 可选）。 */
const SOURCE_KEYS = ['name', 'elapsedMs', 'ok', 'code']
/** 脱敏摘要首词截断上限（INV-12：只留首词且限量）。 */
const FIRST_TOKEN_MAX = 32
/** 单条目逐源明细条数上限（防条目无界膨胀）。 */
const SOURCE_ITEM_MAX = 32

function sanitizeDigest(raw) {
  const digest = { len: 0, first: '' }
  if (raw == null || typeof raw !== 'object') return digest
  const len = raw.len
  if (typeof len === 'number' && Number.isFinite(len) && len >= 0) digest.len = Math.floor(len)
  const first = raw.first
  if (typeof first === 'string' && first.length > 0) {
    // 首词 + 截断双保险：即使调用方误传整句，也只留第一个词的限量前缀（INV-12）
    digest.first = first.trim().split(/\s+/)[0].slice(0, FIRST_TOKEN_MAX)
  }
  return digest
}

function sanitizeSourceItem(raw) {
  if (raw == null || typeof raw !== 'object') return null
  const name = raw.name
  if (typeof name !== 'string' || name.length === 0) return null
  const item = { name: name.slice(0, 64), elapsedMs: 0, ok: false }
  const elapsedMs = raw.elapsedMs
  if (typeof elapsedMs === 'number' && Number.isFinite(elapsedMs) && elapsedMs >= 0) item.elapsedMs = elapsedMs
  item.ok = raw.ok === true
  const code = raw.code
  if (typeof code === 'string' && code.length > 0) item.code = code.slice(0, 64)
  return item
}

/** 按白名单闭集构造条目（白名单外的键即弃；类型非法字段回落安全默认）。 */
function sanitizeEntry(raw) {
  const input = raw != null && typeof raw === 'object' ? raw : {}
  const ts = input.ts
  const via = input.via
  const elapsedMs = input.elapsedMs
  const resultCount = input.resultCount
  const entry = {
    ts: typeof ts === 'number' && Number.isFinite(ts) ? ts : Date.now(),
    via: typeof via === 'string' && via.length > 0 ? via.slice(0, 32) : 'unknown',
    ok: input.ok === true,
    elapsedMs: typeof elapsedMs === 'number' && Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : 0,
    resultCount: typeof resultCount === 'number' && Number.isFinite(resultCount) && resultCount >= 0 ? Math.floor(resultCount) : 0,
    queryDigest: sanitizeDigest(input.queryDigest),
    sources: [],
  }
  const sources = input.sources
  if (Array.isArray(sources)) {
    for (const raw1 of sources.slice(0, SOURCE_ITEM_MAX)) {
      const item = sanitizeSourceItem(raw1)
      if (item) entry.sources.push(item)
    }
  }
  return entry
}

/**
 * 创建触发日志内存环。
 * @param {{capacity?: number}} [options] - capacity 容量（默认 200，由 Config 的日志容量键传入）。
 * @returns {{
 *   capacity: number,
 *   available: () => boolean,
 *   size: () => number,
 *   record: (entry: object) => boolean,
 *   list: (opts?: {limit?: number}) => object[],
 *   clear: () => number,
 *   stats: () => object[],
 * }}
 */
export function createTriggerLog(options = {}) {
  const rawCapacity = options.capacity
  const capacity =
    typeof rawCapacity === 'number' && Number.isInteger(rawCapacity) && rawCapacity >= 1 ? rawCapacity : DEFAULT_CAPACITY
  const buffer = new Array(capacity).fill(null)
  let head = 0
  let count = 0
  let broken = false

  return {
    capacity,
    /** 日志环是否可用（INV-13：写失败后为 false，供页面明示「日志不可用」）。 */
    available: () => !broken,
    size: () => count,

    /**
     * 记一条触发（fail-open：任何异常都吞下并置 available=false，绝不抛向主链）。
     * @returns {boolean} true=已入环；false=未记录（失败或异常输入）。
     */
    record(entry) {
      if (broken) return false
      try {
        const sanitized = sanitizeEntry(entry)
        if (count < capacity) {
          buffer[(head + count) % capacity] = sanitized
          count += 1
        } else {
          buffer[head] = sanitized
          head = (head + 1) % capacity
        }
        return true
      } catch {
        broken = true
        return false
      }
    },

    /** 环内条目（时间序，最旧在前）；limit 取尾部 N 条。 */
    list(opts = {}) {
      const limit = opts && typeof opts.limit === 'number' && opts.limit >= 0 ? Math.floor(opts.limit) : count
      const out = []
      const start = Math.max(0, count - limit)
      for (let index = start; index < count; index += 1) {
        const entry = buffer[(head + index) % capacity]
        out.push({ ...entry, queryDigest: { ...entry.queryDigest }, sources: entry.sources.map((item) => ({ ...item })) })
      }
      return out
    },

    /** 清空环（R28 一键清空）；返回清掉条数；复位 available（重试缝）。 */
    clear() {
      const cleared = count
      for (let index = 0; index < capacity; index += 1) buffer[index] = null
      head = 0
      count = 0
      broken = false
      return cleared
    },

    /** 逐源统计聚合（US-16：最近耗时 + 成败计数，复用日志环数据，R29）。 */
    stats() {
      const byName = new Map()
      for (let index = 0; index < count; index += 1) {
        const entry = buffer[(head + index) % capacity]
        for (const item of entry.sources) {
          const stat = byName.get(item.name) ?? { name: item.name, count: 0, okCount: 0, failCount: 0, lastMs: null, lastOk: null }
          stat.count += 1
          if (item.ok) stat.okCount += 1
          else stat.failCount += 1
          stat.lastMs = item.elapsedMs
          stat.lastOk = item.ok
          byName.set(item.name, stat)
        }
      }
      return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    },
  }
}

/** 供测试与调用方对齐的条目键闭集（TECH.md §2-①）。 */
export const TRIGGER_LOG_ENTRY_KEYS = [...ENTRY_KEYS]
