// trigger-log — kb-context 触发日志内存环（0.4.0，Task 10-A）
// 职责边界：只做「评估摘要 entry 的内存环记录面」（record/list/clear/stats）；评估与记录点缝在
// lib/inject.js pre-step handler；服务面/设置面在 lib/settings-routes.js + lib/client.js（10-B）。
// 契约源：changes/2026-09-30-kb-context-trigger-log/（TECH.md「记录契约」「实现面 1」、constitution.md INV-TL1…4）。
// ⚠️ INV-TL1（脱敏红线）：entry 键集=闭集白名单 8 键（机械锁，多键即弃）；reason/channel 强制收敛
//   到闭集枚举（自由文本——如用户消息原文/异常信息——**绝不入日志**）；matched 只保字符串数组
//   （调用方按契约只传配置词表/实体路径成员）。全 entry 可序列化面 = 数字/布尔/枚举/词表成员。
// ⚠️ INV-TL2（fail-open）：record 全 try/catch 静默吞——坏 entry（getter 抛错）/坏 isEnabled/
//   任何意外异常都不上抛、不扰触发/注入主链路；list/clear/stats 同样防御性不抛。
// ⚠️ INV-TL4（内存环本性）：全局一份（进程级）容量环、超出丢最旧（Array+头指针覆写）、重启清空；
//   **零 I/O 零持久化**（不碰网络/磁盘/token 预算，INV-TL3）。容量非法回退 200。
// ⚠️ triggerLog.enabled 现读语义（A-TL5 kill switch）：isEnabled 每次 record 现调——热关后
//   record 直接 no-op（零新增 entry，旧条目保留），热开恢复记录；不重建实例。

/** entry 键集闭集（INV-TL1 白名单，机械断言基准）——新增字段必须先过脱敏审查 */
export const ENTRY_KEYS = Object.freeze([
  'ts', 'hit', 'channel', 'matched', 'snippets', 'tokenEst', 'elapsedMs', 'reason',
])

/** reason 闭集（TECH「记录契约」字面 + 复审修复轮 2 增补 'dedup'）：hit=命中且入会话；
 *  'dedup'=触发命中但去重跳过（同 turn/同 query/可见面 SHA-1，本次入会话片段 0）；
 *  其余=未入会话原因摘要。新增枚举成员须过脱敏审查（闭集纪律同键集）。 */
export const ENTRY_REASONS = Object.freeze([
  'hit', 'dedup', 'no-user-source', 'no-trigger-match', 'no-hits', 'timeout', 'error',
])

/** channel 闭集：words=词面窄表 / entity=索引实体 / none=未命中 */
export const ENTRY_CHANNELS = Object.freeze(['words', 'entity', 'none'])

/** 环容量出厂默认（Q3 裁决：内存环 200 条） */
export const DEFAULT_CAPACITY = 200

/** 数值救济：有限非负数沿用，否则回退（防脏值入环破形） */
function salvageNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

/** 容量救济：正整数沿用，否则回退 200（环不塌） */
function salvageCapacity(value) {
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_CAPACITY
}

/**
 * entry 归一（INV-TL1 机械闭合）：只按白名单 8 键构造（多余键丢弃、缺键补齐），
 * reason/channel 枚举强制（非法收敛 'error'/'none'——自由文本不入日志），matched 只保字符串。
 * 取值可能踩脏 entry 的抛错 getter → 由 record 外层 try/catch 兜（吞掉不半写）。
 */
function normalizeEntry(entry, nowMs) {
  const raw = (entry !== null && typeof entry === 'object') ? entry : {}
  return {
    ts: salvageNumber(raw.ts, nowMs),
    hit: raw.hit === true,
    channel: ENTRY_CHANNELS.includes(raw.channel) ? raw.channel : 'none',
    matched: Array.isArray(raw.matched) ? raw.matched.filter((s) => typeof s === 'string') : [],
    snippets: salvageNumber(raw.snippets, 0),
    tokenEst: salvageNumber(raw.tokenEst, 0),
    elapsedMs: salvageNumber(raw.elapsedMs, 0),
    reason: ENTRY_REASONS.includes(raw.reason) ? raw.reason : 'error',
  }
}

/**
 * 触发日志内存环工厂（TECH 实现面 1 形状）。
 * @param {object} [opts]
 * @param {number} [opts.capacity=200] 环容量（正整数；非法回退 200）
 * @param {() => boolean} [opts.isEnabled=()=>true] kill switch 现读缝（每次 record 现调；false=no-op）
 * @returns {{record: Function, list: Function, clear: Function, stats: Function}}
 *  - `record(entry)`：归一后入环（覆写最旧）；任何异常/关闭态静默吞，返回存入的 entry 或 undefined。
 *  - `list()`：时间倒序数组（最新在前）；**快照**——entry 浅拷贝（含 matched 切片），调用方随意改动不破环。
 *  - `clear()`：清空环（可继续用）。
 *  - `stats()`：`{count, capacity, enabled}`（enabled 现读）。
 */
export function createTriggerLog({ capacity = DEFAULT_CAPACITY, isEnabled = () => true } = {}) {
  const cap = salvageCapacity(capacity)
  const enabledFn = typeof isEnabled === 'function' ? isEnabled : () => true
  // 环 = Array + 头指针（TECH 实现面 1）：head=下一写位，size≤cap，满则覆写最旧
  const ring = new Array(cap)
  let head = 0
  let size = 0

  const record = (entry) => {
    try {
      if (!enabledFn()) return undefined // kill switch 现读：热关后 record 直接 no-op（零新增）
      if (entry === null || typeof entry !== 'object') return undefined // 垃圾入参整条吞（零信息不入环）
      const stored = normalizeEntry(entry, Date.now())
      ring[head] = stored
      head = (head + 1) % cap
      if (size < cap) size += 1 // 满则 size 恒=cap，最旧槽位被覆写（丢最旧）
      return stored
    } catch {
      return undefined // INV-TL2：静默吞，绝不扰主链路
    }
  }

  const list = () => {
    try {
      const out = []
      for (let i = 0; i < size; i++) {
        const e = ring[(head - 1 - i + cap) % cap] // 时间倒序（最新在前）
        // 浅拷贝（复审修复轮 2）：entry 本体 + matched 数组各切一刀——调用方改动/排序不污染环内真身
        out.push({ ...e, matched: e.matched.slice() })
      }
      return out
    } catch {
      return []
    }
  }

  const clear = () => {
    try {
      ring.fill(undefined) // 释放引用（GC 面）+ 复位
      head = 0
      size = 0
    } catch { /* 防御性不抛（INV-TL2 同精神） */ }
  }

  const stats = () => {
    try {
      return { count: size, capacity: cap, enabled: enabledFn() !== false }
    } catch {
      return { count: size, capacity: cap, enabled: false }
    }
  }

  return { record, list, clear, stats }
}
