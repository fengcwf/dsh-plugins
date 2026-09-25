// buffer — 捕获缓冲 + 每 3 轮强制 flush + 双轨落点（Task 9；delta-spec §2 / Q7a / Q7b 裁决）。
// 职责边界：内存缓冲（轮次计数/串行链）+ 落盘（原子新增·锁追加·失败重试留痕）；
// 投影与中和归 capture.js（第一道 sanitize），本文件只在**落盘前**过 secrets.redact（第二道双保险）。
// 消费 T8 共享层（冲突扫描裁定勿重复实现）：fs-safe.writeAtomic（新增）/ withFileLock（追加锁）、
// secrets.redact。零第三方运行时依赖。
//
// 裁定锚点（task-9 报告 §2）：
//   - 双轨（Q7b）：通用 → `raw/04-session_logs/<标题> - YYYY-MM-DD-HH-MM.md` **新增**（同名在场即
//     追加，幂等）；clsh 变更相关 → `raw/projects/<项目>/changes/<变更>/conversation.md` **追加**
//     （不存在则白名单内新增）。路由=chunk 文本双 token 正则（项目+变更同时命中才走轨 2，
//     仅变更 id 无项目回退通用轨——防误建垃圾目录；每 flush 重算，前后 chunk 可能分轨，申报）。
//   - 追加锁（T8 withFileLock 无 stale 自愈的消费侧处置）：**短 waitMs(250ms)+幂等重试**（非 lease
//     ——lease 需改 T8 基元暴露 mtime，超本任务面）。锁超时=ELOCKTIMEOUT 计入同一失败面：轮次保
//     留内存、留痕不抛、下次 commit/flush 重试——重复执行恰好一次（幂等）。
//   - 写失败（Q14 同款容错面的捕获侧）：重试 3 次指数退避 50/100/200ms（jitter 归 T13 队列退避）→
//     仍失败：warn 留痕（kbContext/alert 风格，不上抛）+ 轮次保留 + **T13 enqueue 接线**（写失败
//     幂等队列备份；同槽重入=同文件覆盖，幂等）；后续 flush 成功同槽 dequeue——「治愈后重试内容
//     恰一次」由 marker 覆盖判据（appendCapture）兜底。
//   - raw 只增/追加：create 走 writeAtomic（wx 临时+rename），append 走 'a' 追加——绝不改写既有
//     语义内容；既有 conversation.md（无 frontmatter）以 HTML 注释 marker 承载机器标记，
//     新建文件用 YAML frontmatter `source: capture`。
//   - 路径安全：title 过 fs 非法字符净化（无 / .. \\）；project/change token 由正则字符类构造
//     （无 . /）——段均构造性安全，无需 realpathGuard（用户自由路径面归 T11/T12）。
//   - 串行链：commit/flush 经 per-buffer Promise 链串行——flush 在途时新 commit 排队，杜绝
//     「flush 中途入队被 rounds 清零」的计数竞态；turn/end 处理 await commit（有界 I/O，
//     workspace-changes 同款先例）。
import fs from 'node:fs'
import path from 'node:path'
import { writeAtomic, withFileLock } from './fs-safe.js'
import { redact } from './secrets.js'
import { dedupKeyFor } from './queue.js'

/** 通用轨目录（Q7b 白名单面一） */
export const SESSION_LOG_DIR = 'raw/04-session_logs'
/** 变更轨路由正则：项目 token + 变更 token 双命中（workdata/ 与 raw/projects/ 两种来源形） */
const CHANGE_ROUTE = /(?:raw\/projects\/|workdata\/)([A-Za-z0-9][A-Za-z0-9_-]*)\/changes\/(\d{4}-\d{2}(?:-\d{2})?-[a-z0-9][a-z0-9-]*)/

const RETRY_ATTEMPTS = 3 // 失败重试 3 次（Q10「3 次退避」捕获侧同款）
const DEFAULT_RETRY_BASE_MS = 50 // 指数退避基数：50 → 100 → 200
const DEFAULT_LOCK_WAIT_MS = 250 // 追加锁短等待（stale 留白处置）
const LOCK_POLL_MS = 20

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- 告警统计（T13 alert 聚合消费面；本任务只计数不落盘） ----------
const STATS = { committed: 0, flushedTurns: 0, flushes: 0, flushFailures: 0, redacted: 0, swallowed: 0 }
/** 快照当前统计（不动内部态） */
export function getStats() {
  return { ...STATS }
}
/** 归零（测试隔离 / T13 告警汇总后重置） */
export function resetStats() {
  for (const k of Object.keys(STATS)) STATS[k] = 0
}
/** 计数入口（index.js 吞异常时也计 swallowed） */
export function bumpStat(key, n = 1) {
  if (Object.hasOwn(STATS, key)) STATS[key] += n
}

/**
 * 双轨路由（Q7b）：chunk 文本双 token 命中 → 变更轨；否则通用轨（保守回退）。
 * @param {string} text 本 chunk 全文（sanitize 后、redact 前）
 * @returns {{kind:'change', project: string, change: string} | {kind:'generic'}}
 */
export function routeFor(text) {
  const m = CHANGE_ROUTE.exec(String(text))
  if (m) return { kind: 'change', project: m[1], change: m[2] }
  return { kind: 'generic' }
}

// ---------- 文件名/渲染 helpers ----------
const p2 = (n) => String(n).padStart(2, '0')
const dayStamp = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const minuteStamp = (d) => `${dayStamp(d)}-${p2(d.getHours())}-${p2(d.getMinutes())}`
const humanStamp = (d) => `${dayStamp(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}`

/**
 * 标题净化（Q13「Session 产物→标题-时间戳」）：取首行 → fs 非法字符置空格 → 折叠空白 →
 * 去首尾点空格 → 按码点截 40 字（CJK 安全）→ 空则兜底「会话记录」。
 * @param {string} text
 * @returns {string}
 */
export function safeTitle(text) {
  const firstLine = String(text).split('\n', 1)[0]
  let t = firstLine.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  t = t.replace(/^[.\s]+|[.\s]+$/g, '')
  const chars = [...t]
  if (chars.length > 40) t = chars.slice(0, 40).join('')
  return t || '会话记录'
}

// ---------- marker 覆盖幂等（T13 补交「治愈后重试内容恰一次」判据） ----------
const MARKER_RE = /<!-- source: capture session=(\S+) turns=(\d+)-(\d+) seq=\d+ -->/g

/** chunk 首行 marker → {session, min, max}（无 marker=防御返回 null，不幂等跳过） */
function chunkMarker(body) {
  const m = /^<!-- source: capture session=(\S+) turns=(\d+)-(\d+) seq=\d+ -->/.exec(String(body))
  return m === null ? null : { session: m[1], min: Number(m[2]), max: Number(m[3]) }
}

/**
 * 覆盖判据：目标内已有同 session 且轮次区间**覆盖**本 chunk 的 marker → 本 chunk 已落过（零重复）。
 * 覆盖而非精确匹配：失败 chunk（turns=1-3）可能已被后续成功 flush 的**超集**（turns=1-6）满足——
 * 精确匹配会把已并入的内容再追加一遍（重复）。
 */
function coveredByMarker(content, body) {
  const want = chunkMarker(body)
  if (want === null) return false
  for (const m of content.matchAll(MARKER_RE)) {
    if (m[1] === want.session && Number(m[2]) <= want.min && Number(m[3]) >= want.max) return true
  }
  return false
}

/**
 * 落盘（T13 导出：flush 与队列补交 handler 共用同一语义——内容恰一次）：
 * mkdir（白名单内新增目录）→ withFileLock → marker 已覆盖=幂等跳过 : 在场？追加 : writeAtomic 新增。
 * 锁完全不碰数据文件（T8 契约）；覆盖判据与 'a' 追加同在临界区内（判读-写原子）。
 * @param {{target: string, head: string, body: string}} payload 落点+新建头+chunk 正文（首行=marker）
 * @param {{lockWaitMs?: number}} [opts]
 * @returns {Promise<{appended: boolean, target: string, reason?: string}>}
 */
export async function appendCapture({ target, head, body }, { lockWaitMs = DEFAULT_LOCK_WAIT_MS } = {}) {
  await fs.promises.mkdir(path.dirname(target), { recursive: true })
  return withFileLock(
    target,
    async () => {
      let exists = true
      try {
        await fs.promises.access(target, fs.constants.F_OK)
      } catch {
        exists = false
      }
      if (exists) {
        const content = await fs.promises.readFile(target, 'utf8')
        if (coveredByMarker(content, body)) return { appended: false, target, reason: 'already-covered' }
        // 追加语义：只往后接，不读不改既有字节（raw 禁改既有）
        await fs.promises.appendFile(target, `\n\n${body}\n`, 'utf8')
      } else {
        // 新增语义：原子创建（wx 临时 + rename，T8 writeAtomic）
        await writeAtomic(target, `${head}${body}\n`)
      }
      return { appended: true, target }
    },
    { waitMs: lockWaitMs, pollMs: LOCK_POLL_MS },
  )
}

/**
 * 创建单会话缓冲。全部 I/O 经 per-buffer 串行链；任何失败不上抛到调用方语义之外
 * （flush 失败返回 {flushed:false,error}，commit 永不 reject）。
 * @param {{
 *   sessionId: string,
 *   getCfg: () => {vaultRoot: string, capture: {bufferRounds: number}, secrets?: {enabled?: boolean}},
 *   warn: (line: string) => void,
 *   now?: () => Date,
 *   retryBaseMs?: number,
 *   lockWaitMs?: number,
 *   enqueue?: (entry: {dedupKey: string, payload: object, retries: number}) => Promise<any>, // T13 写失败队列
 *   dequeue?: (dedupKey: string) => Promise<any>, // T13 成功后清持久备份
 * }} opts
 */
export function createBuffer({
  sessionId,
  getCfg,
  warn,
  now = () => new Date(),
  retryBaseMs = DEFAULT_RETRY_BASE_MS,
  lockWaitMs = DEFAULT_LOCK_WAIT_MS,
  enqueue,
  dequeue,
}) {
  if (typeof sessionId !== 'string' || sessionId === '') throw new TypeError('createBuffer: sessionId 必须是非空字符串')
  if (typeof getCfg !== 'function') throw new TypeError('createBuffer: getCfg 必须是函数')
  if (typeof warn !== 'function') throw new TypeError('createBuffer: warn 必须是函数')
  if (enqueue !== undefined && typeof enqueue !== 'function') throw new TypeError('createBuffer: enqueue 必须是函数')
  if (dequeue !== undefined && typeof dequeue !== 'function') throw new TypeError('createBuffer: dequeue 必须是函数')
  // marker 内嵌 sid：白名单字符化（防 --> 注入 marker；路径不经此，仅注释内容）
  const sid = String(sessionId).replace(/[^\w:.-]/g, '_')

  let entries = [] // 已提交待落盘轮次（崩溃即丢，≤ bufferRounds 轮——Q7a 上界）
  let rounds = 0 // 已提交未 flush 轮次数
  let roundId = 0 // 轮次单调 id（entry 级标注：flushedTurns 按轮计数不按条目）
  let genericTarget = null // 通用轨目标（首 flush 定名，后续追加同一文件）
  let genericHead = null
  let seq = 0 // chunk 序号（marker 幂等/排序锚点）
  let chain = Promise.resolve() // per-buffer 串行链
  const queuedKeys = new Set() // T13：已入队的 dedupKey（成功 flush 后 dequeue 清账）

  /** 渲染一个 chunk（一次 flush 的最小落盘单元） */
  function renderBody(chunk) {
    const turns = chunk.map((e) => e.turn)
    const lines = [`<!-- source: capture session=${sid} turns=${Math.min(...turns)}-${Math.max(...turns)} seq=${seq} -->`, '']
    let curTurn = null
    for (const e of chunk) {
      if (e.turn !== curTurn) {
        curTurn = e.turn
        lines.push(`## Turn ${e.turn} — ${humanStamp(e.time)}`, '')
      }
      lines.push(`**${e.role}**:`, String(e.text), '')
    }
    return lines.join('\n')
  }

  /** flush 内核（只在串行链上执行） */
  async function doFlush() {
    if (entries.length === 0) return { flushed: false, reason: 'empty' }
    const cfg = getCfg()
    const chunk = entries.slice()
    const route = routeFor(chunk.map((e) => e.text).join('\n'))

    // 落盘前必过 secrets.redact（双保险第二道；计数入告警统计）
    const redactOn = cfg.secrets?.enabled !== false
    if (redactOn) {
      for (const e of chunk) {
        const r = redact(e.text)
        if (r.count > 0) {
          e.text = r.text
          bumpStat('redacted', r.count)
        }
      }
    }

    let target
    let head
    if (route.kind === 'change') {
      target = path.join(cfg.vaultRoot, 'raw/projects', route.project, 'changes', route.change, 'conversation.md')
      head = `---\nsource: capture\nproject: ${route.project}\nchange: ${route.change}\nsession: ${JSON.stringify(sid)}\ndate: ${dayStamp(now())}\n---\n\n`
    } else {
      if (genericTarget === null) {
        // 首 flush 定名：标题=chunk 内首条 user 文本（redact 后再净化文件名，防哨兵进文件名）
        const seed = chunk.find((e) => e.role === 'user') ?? chunk[0]
        let title = safeTitle(seed.text)
        if (redactOn) {
          const r = redact(title)
          if (r.count > 0) {
            title = safeTitle(r.text)
            bumpStat('redacted', r.count)
          }
        }
        const d = now()
        target = path.join(cfg.vaultRoot, SESSION_LOG_DIR, `${title} - ${minuteStamp(d)}.md`)
        genericTarget = target
        genericHead = `---\ntitle: ${JSON.stringify(title)}\ndate: ${dayStamp(d)}\nsource: capture\nsession: ${JSON.stringify(sid)}\n---\n\n# ${title}\n\n`
      }
      target = genericTarget
      head = genericHead
    }

    seq += 1
    const body = renderBody(chunk)

    // 失败面：重试 3 次指数退避 → 仍失败留痕 + 轮次保留（幂等重试，内容恰好一次）
    let lastErr = null
    for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        await appendCapture({ target, head, body }, { lockWaitMs })
        lastErr = null
        break
      } catch (e) {
        lastErr = e
        if (attempt < RETRY_ATTEMPTS) await sleep(retryBaseMs * 2 ** attempt)
      }
    }
    if (lastErr !== null) {
      bumpStat('flushFailures', 1)
      warn(
        `[wiki-steward] 捕获 flush 失败（已重试 ${RETRY_ATTEMPTS} 次退避，轮次保留内存待重试，不上抛）：${target} — ${lastErr?.message ?? lastErr}`,
      )
      // T13 接线（原缝位）：写失败幂等队列备份——dedupKey=sha256(sessionId+\n+最老未落盘轮) 截 32，
      // 同槽重入=同文件覆盖（幂等：chunk=全量余量，失败 chunk 恒被后续失败覆盖成最全形态）。
      if (typeof enqueue === 'function') {
        try {
          const dedupKey = dedupKeyFor(sessionId, Math.min(...chunk.map((e) => e.turn)))
          const r = await enqueue({ dedupKey, payload: { target, head, body }, retries: 0 })
          if (r?.ok !== false) {
            queuedKeys.add(dedupKey)
          } else {
            warn(`[wiki-steward] flush 失败入队未成（留痕；轮次仍在内存）：${dedupKey}`)
          }
        } catch (e) {
          warn(`[wiki-steward] flush 失败入队异常已吞（留痕；轮次仍在内存）：${e?.message ?? e}`)
        }
      }
      return { flushed: false, error: lastErr }
    }

    entries = entries.slice(chunk.length) // 成功才出队（flush 在途时链上无并发 commit，slice 形防御）
    rounds = 0
    // 成功=持久备份已被本次落盘覆盖 → dequeue 清账（恰一次双保险：marker 覆盖判据兜底重复投递）
    if (queuedKeys.size > 0 && typeof dequeue === 'function') {
      for (const k of queuedKeys) {
        try {
          await dequeue(k)
        } catch (e) {
          warn(`[wiki-steward] flush 成功后 dequeue 异常已吞（留痕；marker 判据兜底重复）：${e?.message ?? e}`)
        }
      }
      queuedKeys.clear()
    }
    bumpStat('flushes', 1)
    bumpStat('flushedTurns', new Set(chunk.map((e) => e.round)).size) // 按轮计数（一条 commit=一轮，可含多条消息）
    return { flushed: true, target }
  }

  /** 按 bufferRounds 判强制 flush（Q7a：每 3 轮；热改 bufferRounds 每次现读） */
  function maybeFlush() {
    const { bufferRounds } = getCfg().capture
    if (rounds < Math.max(1, bufferRounds)) return({ flushed: false, reason: 'buffered', rounds })
    return doFlush()
  }

  /** 把 job 排进串行链（commit 与 flush 互斥，计数无竞态） */
  function enqueueJob(job) {
    const p = chain.then(job, job)
    chain = p.then(
      () => undefined,
      () => undefined, // 失败已内部留痕；链本身永不断
    )
    return p
  }

  return {
    /**
     * 提交一轮收口后的 entries（turn/end completed 校验通过才走到这里）。
     * 空轮不计数不落盘。永不 reject（flush 失败→{flushed:false,error}）。
     * @param {number} turn
     * @param {Array<{role: string, text: string}>} list
     * @returns {Promise<{flushed: boolean, target?: string, reason?: string, rounds?: number, error?: Error}>}
     */
    commit(turn, list) {
      if (!Array.isArray(list) || list.length === 0) return Promise.resolve({ flushed: false, reason: 'empty' })
      return enqueueJob(async () => {
        const t = now()
        roundId += 1
        rounds += 1
        for (const e of list) entries.push({ turn, role: e.role, text: e.text, time: t, round: roundId })
        bumpStat('committed', 1)
        return maybeFlush()
      })
    },
    /**
     * 主动 flush（session/disposed 收尾余量、失败后重试入口）。队列空 → no-op。
     * @returns {Promise<{flushed: boolean, target?: string, reason?: string, error?: Error}>}
     */
    flush() {
      return enqueueJob(() => doFlush())
    },
    /** 只读观测（测试/诊断）：内存余量 */
    get pending() {
      return { entries: entries.length, rounds }
    },
  }
}
