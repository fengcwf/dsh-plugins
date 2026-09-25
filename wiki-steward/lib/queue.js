// queue — 写失败幂等队列 + 补跑账本 + timer 轻活 tick（Task 13；delta-spec §2 队列条目/timer 契约）
// 职责边界：只管条目持久化/claim/重试/补跑账本，不认捕获语义（payload 是黑盒，补交 handler 归调用方）。
// 范式来源：tianxingleo/dsh-memory-plugin pending.mjs（🟡 整套抄+避坑）：
//   · 幂等文件名=dedupKey（同槽重入=同文件覆盖，replay 的写幂等）
//   · `.processing` claim+lease 崩溃回收（mtime 超龄归还 pending——宿主崩溃不丢条目）
//   · `.tmp` 60s 宽限（live 写者只持有毫秒级；宽限内绝不误删在途临时文件）
//   · retries≥MAX_RETRIES 删 / TTL 7 天删（双兜底防毒丸永生）
//   · **每轮处理上限且 slice 在 rename 之前**（claim-then-slice 会把溢出卡 .processing——坑）
//   · replay 保序 break（首个可重试失败即停，后续条目不跳序）
//   · **createdAt 必须 epoch ms**（ISO 串比较 NaN 静默失效坑——toEpochMillis 归一，绝不存原始串）
//   · 入队本身 tmp+rename 原子（writeAtomic：O_EXCL+文件 fsync+rename+目录 fsync）
// 我方增量（社区空白自研）：
//   · 指数退避+**对称 jitter**（官方 RetryPolicySchema 参数形 {initialDelayMs:500, maxDelayMs:10000,
//     jitterRatio:0.1}；delay= min(initial·2^(n-1), max) × (1±jitterRatio)）
//   · payload 落盘前必过 secrets.redact（序列化前 raw 域，INV-11；计数回传）
//   · break 后未处理 claim 立即归还（txl 留给 lease 超时=10 分钟卡顿，此坑一并修）
//   · 补跑账本（schedule-ledger.json）+ tick：先查账→漏跑标记补做留痕→原子记账（A6 漏跑补偿）
//   · burst 不重入：同实例 running 旗 + 跨实例 LeaseLock（withLeaseLock），忙时跳过不排队
// 契约（delta-spec §2 队列条目）：{dedupKey: sha256(sessionKey+turn).slice(0,32), payload,
//   createdAt: epoch_ms, retries:0}；.processing lease 10min、TTL 7 天、MAX_RETRIES=3。
// dedupKey 公式申报：`${sessionKey}\n${turn}`（txl 同款分隔符）——裸拼接会把 ('ses_1','23') 与
//   ('ses_12','3') 撞成同键（Ruling，task-13 报告申报①）。
// 异常全吞+留痕（INV-15 / 不阻塞会话铁律）：enqueue/replay/tick 永不抛，失败=软结果+warn。
// 零第三方运行时依赖（node:fs / node:path / node:crypto + 本包 fs-safe/secrets）。
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { writeAtomic, withLeaseLock } from './fs-safe.js'
import { redact } from './secrets.js'

/** claim 租约：超龄 .processing = 崩溃残留 → 归还 pending（txl CLAIM_LEASE_MS 同值） */
export const CLAIM_LEASE_MS = 10 * 60 * 1000
/** 临时文件宽限：新鲜 .tmp 是在途写者 → 绝不误删（txl TMP_GRACE_MS 同值） */
export const TMP_GRACE_MS = 60 * 1000
/** 每轮处理上限（slice 在 rename 之前；txl REPLAY_LIMIT 同值） */
export const REPLAY_LIMIT = 20
/** 退避参数形（官方 RetryPolicySchema backoff 形；jitterRatio=0.1 同官方默认） */
export const DEFAULT_BACKOFF = Object.freeze({ initialDelayMs: 500, maxDelayMs: 10_000, jitterRatio: 0.1 })

/**
 * 队列条目幂等键（delta-spec §2）：sha256(sessionKey+turn) 截 32。
 * ⚠️ 分隔符 `\n`（txl 同款，Ruling）：裸拼接存在 (ses_1,23)/(ses_12,3) 碰撞面。
 */
export function dedupKeyFor(sessionKey, turn) {
  return createHash('sha256').update(`${sessionKey}\n${turn}`).digest('hex').slice(0, 32)
}

/**
 * 时间戳归一为 epoch ms（txl toEpochMillis 同款坑位防御）：数字原样、ISO 串解析、坏值回退。
 * ⚠️ createdAt 绝不能存 ISO 串——TTL/退避比较会 NaN 静默失效（条目永生）。
 */
export function toEpochMillis(value, fallback = Date.now()) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

/**
 * 指数退避 + 对称 jitter（RetryPolicySchema 参数形）：
 * base = min(initialDelayMs·2^(failures-1), maxDelayMs)；jitter ∈ [-jitterRatio, +jitterRatio] 对称。
 * @param {number} failures 已失败次数（1=首败→初值 500ms）
 * @param {{initialDelayMs: number, maxDelayMs: number, jitterRatio: number}} [backoff]
 * @param {() => number} [rand] 0..1 注入缝（测试假随机；缺省 Math.random）
 * @returns {number} 下次尝试前的等待毫秒
 */
export function retryDelay(failures, backoff = DEFAULT_BACKOFF, rand = Math.random) {
  const { initialDelayMs, maxDelayMs, jitterRatio } = backoff
  const n = Math.max(1, Math.floor(Number(failures) || 1))
  const base = Math.min(initialDelayMs * 2 ** (n - 1), maxDelayMs)
  return Math.max(0, Math.round(base * (1 + (rand() * 2 - 1) * jitterRatio)))
}

/** payload 深度脱敏（secrets.js 消费面：queue payload 序列化前，raw 域）；计数如实回传 */
function redactPayload(payload) {
  let count = 0
  const walk = (v) => {
    if (typeof v === 'string') {
      const r = redact(v)
      count += r.count
      return r.text
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out = {}
      for (const [k, vv] of Object.entries(v)) out[k] = walk(vv)
      return out
    }
    return v
  }
  return { payload: walk(payload), count }
}

/**
 * 创建幂等队列（存储布局：<dir>/<dedupKey>.json | .json.processing | <writeAtomic>.tmp）。
 * @param {{
 *   dir: string,
 *   getCfg?: () => {maxRetries?: number, ttlMs?: number}, // 热改：每次 replay 现读（缺省 3 / 7 天）
 *   warn?: (line: string) => void,
 *   now?: () => number,          // epoch ms 注入缝（假时钟）
 *   random?: () => number,       // jitter 注入缝
 *   leaseMs?: number, tmpGraceMs?: number, roundLimit?: number,
 *   backoff?: {initialDelayMs: number, maxDelayMs: number, jitterRatio: number},
 * }} opts
 */
export function createQueue({
  dir,
  getCfg = () => ({}),
  warn = () => {},
  now = () => Date.now(),
  random = Math.random,
  leaseMs = CLAIM_LEASE_MS,
  tmpGraceMs = TMP_GRACE_MS,
  roundLimit = REPLAY_LIMIT,
  backoff = DEFAULT_BACKOFF,
} = {}) {
  if (typeof dir !== 'string' || dir === '') throw new TypeError('createQueue: dir 必须是非空字符串')
  if (typeof getCfg !== 'function') throw new TypeError('createQueue: getCfg 必须是函数')
  const entryFile = (dedupKey) => path.join(dir, `${dedupKey}.json`)

  /**
   * 入队（幂等：同 dedupKey 同文件覆盖）：条目 = {dedupKey, payload(脱敏后), createdAt: epoch_ms, retries:0}。
   * 原子：writeAtomic（tmp+rename）——崩溃绝不留半截条目。永不抛。
   */
  async function enqueue({ dedupKey, payload, createdAt, retries } = {}) {
    try {
      if (typeof dedupKey !== 'string' || dedupKey === '') throw new TypeError('enqueue: dedupKey 必须是非空字符串')
      const safe = redactPayload(payload ?? {})
      const entry = {
        dedupKey,
        payload: safe.payload,
        createdAt: toEpochMillis(createdAt, now()),
        retries: Number.isInteger(retries) && retries >= 0 ? retries : 0,
      }
      await fs.promises.mkdir(dir, { recursive: true })
      await writeAtomic(entryFile(dedupKey), JSON.stringify(entry))
      return { ok: true, dedupKey, redacted: safe.count, file: entryFile(dedupKey) }
    } catch (e) {
      warn(`[wiki-steward] queue enqueue 失败（吞+留痕，不阻塞会话）：${dedupKey ?? '?'} — ${e?.message ?? e}`)
      return { ok: false, dedupKey, error: e }
    }
  }

  /** 出队（成功补交后清理持久备份；幂等 rm force）。永不抛。 */
  async function dequeue(dedupKey) {
    try {
      await fs.promises.rm(entryFile(dedupKey), { force: true })
      return { ok: true, dedupKey }
    } catch (e) {
      warn(`[wiki-steward] queue dequeue 失败（吞+留痕）：${dedupKey} — ${e?.message ?? e}`)
      return { ok: false, dedupKey, error: e }
    }
  }

  /** 在场 .json 条目数（backlog 观测；同步——txl depth() 同款） */
  function depth() {
    try {
      return fs.readdirSync(dir).filter((n) => n.endsWith('.json')).length
    } catch {
      return 0
    }
  }

  /** 崩溃回收：超龄 .processing 归还 pending；超龄 .tmp 清理（txl reclaimStaleClaims 同款+计数） */
  async function sweep() {
    const out = { reclaimed: 0, reapedTmp: 0 }
    let names
    try {
      names = await fs.promises.readdir(dir)
    } catch {
      return out
    }
    const t = now()
    for (const name of names) {
      const p = path.join(dir, name)
      try {
        const st = await fs.promises.stat(p)
        if (name.endsWith('.tmp')) {
          if (t - st.mtimeMs > tmpGraceMs) {
            await fs.promises.rm(p, { force: true })
            out.reapedTmp += 1
          }
        } else if (name.endsWith('.processing')) {
          if (t - st.mtimeMs > leaseMs) {
            await fs.promises.rename(p, p.replace(/\.processing$/, '')) // 归还 pending（保留 retries/退避态）
            out.reclaimed += 1
          }
        }
      } catch (e) {
        warn(`[wiki-steward] queue sweep 单项失败（吞+留痕）：${name} — ${e?.message ?? e}`)
      }
    }
    return out
  }

  /**
   * 处理一轮（timer tick / 会话启动补交共用内核）：
   *   ① sweep（lease 回收 + tmp 清理）→ ② 扫描 purge（retries≥maxRetries 删 / TTL 删）
   *   → ③ (createdAt, dedupKey) 排序 + **保序截断**（首个未到期条目即停——后续不跳序）
   *   → ④ **slice 在 rename 之前**（每轮上限 roundLimit，溢出留 pending 下轮续）→ ⑤ claim 逐条处理。
   * 处理语义：handle 结果 ok!==false 或不抛 = 成功→commit（删 claim）；失败→retries+1 + 退避
   *   nextRunAt 归还（两阶段 tmp+rename）；retries 达 maxRetries = 耗尽→删+报 exhausted（调用方告警）。
   * **保序 break**：首个可重试失败即停——未处理 claim 全部归还（不卡 .processing 至 lease 超时）。
   * 永不抛（异常全吞+留痕）。
   * @param {{handle: (entry: object) => Promise<any>|any}} opts handle 抛错或返 {ok:false}=失败
   * @returns {Promise<{ok: boolean, claimed: number, succeeded: number, failed: number, released: number,
   *   unclaimed: number, exhausted: object[], reclaimed: number, reapedTmp: number,
   *   purgedTtl: number, purgedExhausted: number, broke: boolean, error?: Error}>}
   */
  async function replay({ handle } = {}) {
    try {
      if (typeof handle !== 'function') throw new TypeError('replay: handle 必须是函数')
      const cfg = getCfg()
      const maxRetries = Number.isInteger(cfg?.maxRetries) && cfg.maxRetries > 0 ? cfg.maxRetries : 3
      const ttlMs = Number.isFinite(cfg?.ttlMs) && cfg.ttlMs > 0 ? cfg.ttlMs : 7 * 86_400_000
      await fs.promises.mkdir(dir, { recursive: true })
      const sw = await sweep()
      const res = {
        ok: true, claimed: 0, succeeded: 0, failed: 0, released: 0, unclaimed: 0,
        exhausted: [], reclaimed: sw.reclaimed, reapedTmp: sw.reapedTmp,
        purgedTtl: 0, purgedExhausted: 0, broke: false,
      }
      let names
      try {
        names = await fs.promises.readdir(dir)
      } catch (e) {
        warn(`[wiki-steward] queue 扫描失败（吞+留痕）：${e?.message ?? e}`)
        return { ...res, ok: false, error: e }
      }
      const t = now()
      const candidates = []
      for (const name of names) {
        if (!name.endsWith('.json')) continue
        const p = path.join(dir, name)
        let entry
        try {
          entry = JSON.parse(await fs.promises.readFile(p, 'utf8'))
        } catch {
          continue // 坏条目留着 TTL 收（txl 同款）；不吞并发写者的半截文件
        }
        const createdAt = toEpochMillis(entry?.createdAt, t)
        const retries = Number.isInteger(entry?.retries) && entry.retries >= 0 ? entry.retries : 0
        if (retries >= maxRetries) {
          await fs.promises.rm(p, { force: true })
          res.purgedExhausted += 1
          res.exhausted.push({ ...entry, createdAt, retries })
          continue
        }
        if (t - createdAt > ttlMs) {
          await fs.promises.rm(p, { force: true })
          res.purgedTtl += 1
          continue
        }
        candidates.push({ entry: { ...entry, createdAt, retries }, name, path: p })
      }
      candidates.sort((a, b) => (a.entry.createdAt - b.entry.createdAt) || a.name.localeCompare(b.name))
      // 保序：只取到期连续前缀（首个未到期即停——退避中的头条目阻塞后续，防跳序）
      const due = []
      for (const c of candidates) {
        if (Number.isFinite(c.entry.nextRunAt) && c.entry.nextRunAt > t) break
        due.push(c)
      }
      // ★ slice 在 rename 之前（claim-then-slice 会把溢出卡 .processing——txl 坑）
      const selected = due.slice(0, roundLimit)
      const claims = []
      for (const c of selected) {
        const claimPath = `${c.path}.processing`
        try {
          await fs.promises.rename(c.path, claimPath) // 原子 claim（并发者抢走=ENOENT 跳过）
          claims.push({ entry: c.entry, path: claimPath })
          res.claimed += 1
        } catch {
          /* 被并发 claim 抢走：跳过（他实例在做） */
        }
      }
      for (let i = 0; i < claims.length; i++) {
        const claim = claims[i]
        let err = null
        try {
          const r = await handle(claim.entry)
          if (r && r.ok === false) err = r.error ?? new Error(r.reason ?? 'handle rejected')
        } catch (e) {
          err = e
        }
        if (err === null) {
          await fs.promises.rm(claim.path, { force: true }) // 成功才出队（内容恰一次）
          res.succeeded += 1
          continue
        }
        res.failed += 1
        const retries = claim.entry.retries + 1
        if (retries >= maxRetries) {
          // 重试耗尽：删+报（调用方告警——失败不静默）；解除顺序阻塞，后续条目继续
          await fs.promises.rm(claim.path, { force: true })
          res.exhausted.push({ ...claim.entry, retries })
          continue
        }
        // 两阶段归还（txl release 同款崩溃安全）+ 退避 nextRunAt
        const entry2 = { ...claim.entry, retries, nextRunAt: now() + retryDelay(retries, backoff, random) }
        const newPath = claim.path.replace(/\.processing$/, '')
        try {
          await writeAtomic(newPath, JSON.stringify(entry2))
          await fs.promises.rm(claim.path, { force: true })
          res.released += 1
        } catch (e) {
          warn(`[wiki-steward] queue release 失败（claim 留待 lease 回收，吞+留痕）：${e?.message ?? e}`)
        }
        // ★ 保序 break：首个可重试失败即停（后续条目不跳序）
        res.broke = true
        for (const rest of claims.slice(i + 1)) {
          try {
            await fs.promises.rename(rest.path, rest.path.replace(/\.processing$/, '')) // 未处理 claim 立即归还（不卡）
            res.unclaimed += 1
          } catch (e) {
            warn(`[wiki-steward] queue 归还未处理 claim 失败（留待 lease 回收，吞+留痕）：${e?.message ?? e}`)
          }
        }
        return res
      }
      return res
    } catch (e) {
      warn(`[wiki-steward] queue replay 异常已吞（不阻塞）：${e?.message ?? e}`)
      return { ok: false, error: e, claimed: 0, succeeded: 0, failed: 0, released: 0, unclaimed: 0, exhausted: [], reclaimed: 0, reapedTmp: 0, purgedTtl: 0, purgedExhausted: 0, broke: false }
    }
  }

  return { enqueue, dequeue, depth, sweep, replay }
}

/**
 * 补跑账本（A6 漏跑补偿；~/.dsh/kb-index/schedule-ledger.json）：
 * {version, updatedAt, jobs: {[name]: {lastRunAt, runs, missed, madeUp}}}。
 * 读=容错（缺失=首跑正常；坏 JSON=空账本起步+留痕）；写=writeAtomic 原子。
 */
async function loadLedger(ledgerFile, warn) {
  try {
    const raw = await fs.promises.readFile(ledgerFile, 'utf8')
    const state = JSON.parse(raw)
    if (state && typeof state === 'object' && state.jobs && typeof state.jobs === 'object') return state
    warn(`[wiki-steward] 补跑账本形状异常，按空账本起步（留痕）：${ledgerFile}`)
    return { version: 1, jobs: {} }
  } catch (e) {
    if (e?.code === 'ENOENT') return { version: 1, jobs: {} } // 首跑无账本=正常（不刷屏）
    warn(`[wiki-steward] 补跑账本读取失败，按空账本起步（吞+留痕）：${e?.message ?? e}`)
    return { version: 1, jobs: {} }
  }
}

/**
 * timer 轻活 tick（cordis-plugin-timer 每 intervalMs 一发）：
 *   ① **先查补跑账本**（先于干活——漏跑判定依据 lastRunAt 与 intervalMs 的跳变）；
 *   ② 逐 job 执行（队列补交/索引增量刷新/告警汇总——job 面由调用方注入），job 收到
 *      {catchUp, missed} 补做上下文；单 job 异常吞+留痕不拖垮他 job；
 *   ③ 原子记账 {lastRunAt, runs, missed, madeUp}（漏跑标记+补做留痕）。
 * burst 不重入：同实例 running 旗 + 跨实例 withLeaseLock（ledgerFile 锁），忙时 {skipped} 不排队。
 * 永不抛。
 * @param {{
 *   ledgerFile: string,
 *   jobs?: Array<{name: string, run: (info: {catchUp: boolean, missed: number, now: number}) => Promise<any>|any}>,
 *   intervalMs?: number, now?: () => number, warn?: (line: string) => void, lockWaitMs?: number,
 * }} opts
 */
export function createTick({
  ledgerFile,
  jobs = [],
  intervalMs = 60_000,
  now = () => Date.now(),
  warn = () => {},
  lockWaitMs = 0,
} = {}) {
  if (typeof ledgerFile !== 'string' || ledgerFile === '') throw new TypeError('createTick: ledgerFile 必须是非空字符串')
  let running = false

  async function tick() {
    if (running) return { ok: false, skipped: 'reentrant' } // burst 不重入（同实例）
    running = true
    try {
      await fs.promises.mkdir(path.dirname(ledgerFile), { recursive: true })
      try {
        return await withLeaseLock(ledgerFile, runTick, { waitMs: lockWaitMs })
      } catch (e) {
        if (e?.code === 'ELOCKTIMEOUT') return { ok: false, skipped: 'busy' } // 跨实例 burst 不重入（LeaseLock）
        warn(`[wiki-steward] timer tick 异常已吞（不阻塞）：${e?.message ?? e}`)
        return { ok: false, error: e }
      }
    } catch (e) {
      warn(`[wiki-steward] timer tick 异常已吞（不阻塞）：${e?.message ?? e}`)
      return { ok: false, error: e }
    } finally {
      running = false
    }
  }

  async function runTick() {
    const state = await loadLedger(ledgerFile, warn) // ① 先查补跑账本（漏跑补偿依据）
    const t = now()
    const results = {}
    let missedMax = 0
    for (const job of jobs) {
      const prev = state.jobs[job.name]
      const lastRunAt = Number.isFinite(prev?.lastRunAt) ? prev.lastRunAt : null
      // 漏跑 = 间隔跳变里没跑到的次数（3 个间隔只跑 1 次 = 漏 2）
      const missed = lastRunAt !== null ? Math.max(0, Math.floor((t - lastRunAt) / intervalMs) - 1) : 0
      missedMax = Math.max(missedMax, missed)
      let r
      let ok = true
      try {
        r = (await job.run({ catchUp: missed > 0, missed, now: t })) ?? {}
      } catch (e) {
        ok = false
        r = { error: e?.message ?? String(e) }
        warn(`[wiki-steward] timer job ${job.name} 异常已吞（不阻塞）：${r.error}`)
      }
      results[job.name] = { ok, ...r }
      state.jobs[job.name] = {
        lastRunAt: t,
        runs: (prev?.runs ?? 0) + 1,
        missed: (prev?.missed ?? 0) + missed,
        madeUp: (prev?.madeUp ?? 0) + (Number(r?.madeUp) || 0),
      }
    }
    state.version = 1
    state.updatedAt = t
    await writeAtomic(ledgerFile, JSON.stringify(state, null, 2)) // 原子记账
    return { ok: true, missed: missedMax, catchUp: missedMax > 0, jobs: results }
  }

  return { tick }
}
