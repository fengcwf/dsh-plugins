// index-service — 索引三保险（T11 / OW-US-11、OW-INV-11）：
//   ①保存即增量：vault-ops 事件钩子（saveNote/createNote/renameNote/deletePath）→ 毫秒级文件级增量
//   ②30min 定时对账：全量 diff 校正（seen/added/updated/removed/degraded）+ 对账账本落盘 JSON
//     （时间戳/计数/degraded 留痕——INV-15 风格）+ 分批可中断 + 账本续跑（start/refresh 先查补跑账本）
//     ——定时器语义保证陈旧窗口 ≤30min（OW-INV-11）
//   ③手动刷新：refresh()（/ob/api/index/refresh 接线，立即对账）
// fts 后端（T3 检索缝接管，零 API 变化）：{name:'fts', search({root,plan,limit})} ——
//   compileQuery plan → FTS MATCH/LIKE（index-store 逐词转义）候选选择 → search.matchDocs 同口径
//   命中行/score/snippet（与 scan 后端逐字节同，test/index-fts 双后端等价锁）。
// 测试缝（沿 vault-ops _onStage 惯例）：reconcile({_onBatch})——每批账本落盘后回调，抛错=中断注入；
//   err.code==='simulate-crash' = 崩溃模拟（跳过一切收尾，账本保持 running 态=进程死亡真实形态）。
// 假时钟/假定时器注入：now / timers({setInterval, clearInterval})——定时语义被测面本身（非 mock 行为）。
import fs from 'node:fs'
import path from 'node:path'
import { onVaultChange, writeAtomicFsync } from './vault-ops.js'
import { matchDocs } from './search.js'
import { createIndexStore, resolveIndexDir, LEGACY_INDEX_DIR_NAME } from './index-store.js'

export const RECONCILE_INTERVAL_MS = 30 * 60 * 1000 // 陈旧窗口 ≤30min（OW-INV-11）
export const INDEX_DIR_NAME = LEGACY_INDEX_DIR_NAME // 旧落点目录名（0.1.1 前 <vaultRoot>/.ob-index/）——现仅用于旧落点检测留痕
const LEDGER_NAME = 'reconcile-ledger.json'
const LEDGER_VERSION = 1
const LEDGER_KEEP_RUNS = 50 // 账本行数上限（防无界增长；计数如实、仅旧 run 滚出）
const DEGRADED_KEEP = 50
const DEFAULT_BATCH_SIZE = 200 // 对账分批（千页秒级 + 可中断 + 续跑）
const LEDGER_MODE = 0o600 // 账本含 vault 路径清单——同 T10 settings.json 口径

function fail(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

const emptyCounts = () => ({ seen: 0, added: 0, updated: 0, removed: 0, degraded: 0 })

/**
 * 创建索引服务（绑定单 vaultRoot；多根=T12 设置页档案数据面，索引按根建库归后续接线——
 * root 不一致查询可解释拒，绝不冒充）。
 * @param {{vaultRoot: string, indexDir?: string, dir?: string, intervalMs?: number, batchSize?: number,
 *          now?: () => number, timers?: {setInterval, clearInterval}, warn?: (line) => void}} opts
 *          落点=index-store.resolveIndexDir（dir > indexDir > 出厂默认 ~/.dsh/cache/obsidian-web/）
 */
export function createIndexService({
  vaultRoot,
  dir,
  indexDir,
  intervalMs = RECONCILE_INTERVAL_MS,
  batchSize = DEFAULT_BATCH_SIZE,
  now = Date.now,
  timers = globalThis,
  warn = (line) => console.warn(line),
  busyTimeoutMs,
  openAttempts,
  retryDelayMs,
} = {}) {
  if (typeof vaultRoot !== 'string' || vaultRoot === '') throw fail('bad_request', 'vaultRoot 参数缺失')
  const rootAbs = path.resolve(vaultRoot)
  const dirAbs = resolveIndexDir({ vaultRoot: rootAbs, indexDir, dir })
  const ledgerPath = path.join(dirAbs, LEDGER_NAME)

  // 旧落点检测（0.1.1 迁出 CIFS）：`<vaultRoot>/.ob-index/` 检测到 → 提示重建留痕。
  // 索引=可重建零损失缓存（ARC-2）——直接在本地盘新落点重建（不迁移旧库）；旧目录绝不静默删除
  //   （不可逆红线），留用户手动清理。显式 dir 落旧落点（测试缝）=同落点，不提示。
  const legacyDir = path.join(rootAbs, LEGACY_INDEX_DIR_NAME)
  if (dirAbs !== legacyDir && fs.existsSync(legacyDir)) {
    warn(
      `[obsidian-web] 检测到旧索引落点 ${legacyDir}（0.1.1 前索引库随 vault 落 CIFS）：`
      + `索引=可重建零损失缓存（ARC-2），已在本地盘新落点 ${dirAbs} 重建；旧目录未删除（防不可逆），可手动清理`,
    )
  }

  // ── 开库 fail-open（fix-boot-lock）：索引库是展示面（ARC-2 可重建零损失）——建库/开库失败绝不炸
  //    插件装载：degraded 留痕（INV-15 风格：warn 线 + 账本 run status='degraded'）后继续，
  //    tick/手动刷新/start 补跑经 ensureStore 自愈重试（busy_timeout+小退避在 index-store 层）。
  let store = null
  let degraded = null // {reason, message, at} 留痕面（status() 可读）
  let degradedEventWarned = false
  const openOpts = { vaultRoot: rootAbs, dir: dirAbs, busyTimeoutMs, openAttempts, retryDelayMs }

  function tryOpen() {
    const opened = createIndexStore(openOpts)
    store = opened
    if (degraded !== null) warn('[obsidian-web] 索引库已恢复（自愈重试成功）：索引面 degraded → ok')
    degraded = null
    degradedEventWarned = false
    if (opened.rebuilt) warn('[obsidian-web] 索引规则指纹变更：已清库待对账重建（fts5/trigram/doc-level）')
    return opened
  }

  function noteDegraded(err) {
    const message = String(err?.message ?? err)
    degraded = { reason: 'index-store-unavailable', message, at: now() }
    warn(`[obsidian-web] 索引库打开失败（fail-open：插件继续装载，索引面 degraded，检索走 scan 兜底；tick/手动刷新自愈重试）：${message}`)
  }

  // degraded 留痕（INV-15 风格）：账本 run 形（键锁定 index-routes RUN_KEYS），status='degraded'
  //   ——unfinishedRun 只续跑 running/interrupted，degraded 行纯留痕不进续跑面
  async function recordDegraded() {
    try {
      const ledger = readLedger()
      const t = now()
      ledger.runs.push({
        runId: `${t}-${Math.random().toString(36).slice(2, 8)}`,
        startedAt: t,
        finishedAt: t,
        status: 'degraded',
        resumedFrom: null,
        cursor: null,
        counts: emptyCounts(),
        degraded: [{ path: null, reason: 'index-store-unavailable', message: String(degraded?.message ?? '索引库打开失败') }],
      })
      if (ledger.runs.length > LEDGER_KEEP_RUNS) ledger.runs = ledger.runs.slice(-LEDGER_KEEP_RUNS)
      await writeLedger(ledger)
    } catch (err) {
      warn(`[obsidian-web] degraded 留痕落账失败（账本目录不可写？warn 线仍留痕）：${err?.message ?? err}`)
    }
  }

  /** 自愈重试入口：库缺失→重开（指数退避在 index-store 层）；失败=degraded 留痕 + index_unavailable */
  async function ensureStore() {
    if (store !== null) return store
    try {
      return tryOpen()
    } catch (err) {
      noteDegraded(err)
      await recordDegraded() // INV-15 禁静默：每轮自愈失败留痕落账
      throw fail('index_unavailable', `索引库不可用（fail-open degraded；检索走 scan 兜底，tick/手动刷新自愈重试）：${err?.message ?? err}`)
    }
  }

  try {
    tryOpen()
  } catch (err) {
    noteDegraded(err)
    void recordDegraded() // 构造期同步面 fire-and-forget（落账失败已在内部留痕）
  }

  // ── 对账账本（INV-15 风格留痕：时间戳/计数/degraded；崩溃后重启可续）──────────────
  function readLedger() {
    try {
      const raw = fs.readFileSync(ledgerPath, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed?.version !== LEDGER_VERSION || !Array.isArray(parsed.runs)) throw new Error('账本形非法')
      return parsed
    } catch (err) {
      if (err?.code !== 'ENOENT') warn(`[obsidian-web] 对账账本不可读（重建账本，索引库不丢）：${err?.message ?? err}`)
      return { version: LEDGER_VERSION, runs: [] }
    }
  }

  async function writeLedger(ledger) {
    await writeAtomicFsync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, LEDGER_MODE)
  }

  function unfinishedRun(ledger) {
    // C-1 双管①：只认「最新一条」未完 run（runs.at(-1) 判定）——陈旧未完 run 绝不复活。
    // 旧实现反向扫描任意 running/interrupted 会重复续跑同一 stale run（cursor 之前的文件永不复检、
    // initialCounts 重加计数系伪造=账本中毒）；配合②续跑完成改写 source=superseded 根除。
    const last = ledger.runs.at(-1)
    return last !== undefined && (last.status === 'running' || last.status === 'interrupted') ? last : null
  }

  // ── 全 vault .md 清单（与 scan 后端同口径：dot 条目跳过、symlink 不入、.md only）────────
  function listVault() {
    const out = []
    const walk = (abs, rel) => {
      let dirents
      try {
        dirents = fs.readdirSync(abs, { withFileTypes: true })
      } catch (err) {
        if (rel === '' && err?.code === 'ENOENT') throw fail('not_found', `vaultRoot 不存在：${rootAbs}`)
        return // 子目录读失败 fail-open 跳过（并发变更竞争不阻塞对账，degraded 不计入）
      }
      for (const d of dirents) {
        if (d.name.startsWith('.')) continue
        const childRel = rel ? `${rel}/${d.name}` : d.name
        if (d.isDirectory()) walk(path.join(abs, d.name), childRel)
        else if (d.isFile() && d.name.toLowerCase().endsWith('.md')) {
          const st = fs.statSync(path.join(abs, d.name), { throwIfNoEntry: false })
          if (st !== null) out.push({ rel: childRel, size: st.size, mtimeMs: st.mtimeMs })
        }
      }
    }
    walk(rootAbs, '')
    return out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  }

  // ── 对账（全量 diff 校正 + 分批 + 账本续跑）────────────────────────────────────────
  // 计数语义：added=新入索引 / updated=mtime|size 变更重索引 / seen=未变 / removed=索引有盘上无 /
  //          degraded=处理失败留痕（INV-15 禁静默）。续跑：cursor 前的文件=中断前已处理（计数随账本累计）。
  async function runReconcile({ _onBatch, resumedFrom = null, initialCounts = null, initialCursor = null } = {}) {
    await ensureStore() // 自愈重试入口（tick/手动刷新/start 补跑同径）；失败=index_unavailable 上抛（degraded 留痕已落）
    const ledger = readLedger()
    const run = {
      runId: `${now()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: now(),
      finishedAt: null,
      status: 'running',
      resumedFrom,
      cursor: initialCursor ?? null,
      counts: initialCounts ? { ...emptyCounts(), ...initialCounts } : emptyCounts(),
      degraded: [],
    }
    ledger.runs.push(run)
    if (ledger.runs.length > LEDGER_KEEP_RUNS) ledger.runs = ledger.runs.slice(-LEDGER_KEEP_RUNS)
    await writeLedger(ledger) // 崩溃态可续：run 态+已处理计数先落盘

    const persist = async ({ supersedeSource = null } = {}) => {
      const current = readLedger()
      const self = current.runs.find((r) => r.runId === run.runId)
      const target = self ?? run
      Object.assign(target, run) // 全字段回写（含 status/finishedAt——漏写会让盘上 run 永停 running）
      // C-1 双管②：续跑完成把 source run 改写 superseded（沿 resumedFrom 链溯源清理，
      // 多级中断/崩溃链一并收敛）——陈旧 running/interrupted 态不得在账本里等待复活
      let srcId = supersedeSource
      while (srcId !== null) {
        const src = current.runs.find((r) => r.runId === srcId)
        if (src === undefined) break
        if (src.status === 'running' || src.status === 'interrupted') src.status = 'superseded'
        srcId = src.resumedFrom ?? null
      }
      await writeLedger(current)
    }

    try {
      const files = listVault()
      const known = store.listDocs()
      const pending = run.cursor === null ? files : files.filter((f) => f.rel > run.cursor)
      let batchesDone = 0
      for (let i = 0; i < pending.length; i += batchSize) {
        const batch = pending.slice(i, i + batchSize)
        const writes = []
        let addedN = 0
        let updatedN = 0
        for (const f of batch) {
          const prev = known.get(f.rel)
          if (prev !== undefined && prev.size === f.size && prev.mtimeMs === f.mtimeMs) {
            run.counts.seen += 1
            continue
          }
          try {
            const content = fs.readFileSync(path.join(rootAbs, f.rel), 'utf8')
            writes.push({ rel: f.rel, content, stat: f })
            if (prev === undefined) addedN += 1
            else updatedN += 1
          } catch (err) {
            run.counts.degraded += 1
            if (run.degraded.length < DEGRADED_KEEP) {
              run.degraded.push({ path: f.rel, reason: 'read-failed', message: String(err?.message ?? err) })
            }
          }
        }
        if (writes.length > 0) store.upsertFiles(writes) // 一事务一批（千页冷建秒级；失败=整批回滚）
        run.counts.added += addedN // 计数在写成功后计入（中断不虚报，续跑按 cursor 重做本批）
        run.counts.updated += updatedN
        batchesDone += 1
        run.cursor = batch[batch.length - 1].rel
        await persist() // 每批账本落盘=续跑凭据（分批可中断）
        await _onBatch?.({ batchesDone, counts: run.counts, cursor: run.cursor })
      }
      // 移除面：known（T0 索引快照）键集 ∉ T0 盘上快照 → 出索引（外部删除/绕过钩子的变更在此校正）
      // I-2：只以 T0 索引快照做差——run 期间经钩子入库（save/create/rename）的路径不在 known=天然保护，
      //      绝不拿 T0 盘上快照否定 run 中新入库的文件（与「保存即增量=零窗口」自洽）
      const diskPaths = new Set(files.map((f) => f.rel))
      for (const rel of known.keys()) {
        if (!diskPaths.has(rel)) {
          store.removeFile(rel)
          run.counts.removed += 1
        }
      }
      run.status = 'done'
      run.finishedAt = now()
      run.cursor = null
      await persist({ supersedeSource: run.resumedFrom }) // C-1②：续跑完成改写 source=superseded
      return run
    } catch (err) {
      if (err?.code !== 'simulate-crash') {
        run.status = 'interrupted' // 中断留痕（INV-15 禁静默）；simulate-crash=崩溃模拟不收尾
        run.finishedAt = now()
        await persist().catch(() => {})
      }
      throw err
    }
  }

  // 串行化：定时器/手动刷新/启动补跑不并发跑对账（重入=跳过/排队到同一队列）
  let queue = Promise.resolve()
  let queued = 0
  function enqueue(task) {
    queued += 1
    const next = queue.then(task, task)
    queue = next.then(() => {}, () => {})
    return next.finally(() => { queued -= 1 })
  }

  /** 手动刷新（第三保险）：立即对账（先查补跑账本——未完 run 先续跑） */
  function refresh() {
    return enqueue(async () => {
      const unfinished = unfinishedRun(readLedger())
      if (unfinished !== null) {
        return runReconcile({
          resumedFrom: unfinished.runId,
          initialCounts: unfinished.counts,
          initialCursor: unfinished.cursor,
        })
      }
      return runReconcile()
    })
  }

  // ── ①保存即增量：事件钩子 → 毫秒级文件级增量（失败留痕不回传写路径，对账兜底校正）────────
  function onEvent(event) {
    if (store === null) {
      // degraded 态增量跳过（不空转重试——自愈归 tick/手动刷新）；每 episode 一条 warn（INV-15 禁静默防刷屏）
      if (!degradedEventWarned) {
        degradedEventWarned = true
        warn('[obsidian-web] 索引增量更新跳过：索引库 degraded（30min 对账兜底校正；tick/手动刷新自愈重试）')
      }
      return
    }
    try {
      if (event.type === 'save' || event.type === 'create') {
        if (!event.path.toLowerCase().endsWith('.md')) return
        const st = fs.statSync(path.join(rootAbs, event.path), { throwIfNoEntry: false })
        if (st === null) return
        store.upsertFile(event.path, event.content, { size: st.size, mtimeMs: st.mtimeMs })
      } else if (event.type === 'rename') {
        store.removeFile(event.from)
        const writes = []
        for (const rel of event.changed) {
          if (rel === event.from || !rel.toLowerCase().endsWith('.md')) continue
          const abs = path.join(rootAbs, rel)
          const content = fs.readFileSync(abs, 'utf8')
          const st = fs.statSync(abs, { throwIfNoEntry: false })
          if (st === null) continue
          writes.push({ rel, content, stat: { size: st.size, mtimeMs: st.mtimeMs } })
        }
        if (writes.length > 0) store.upsertFiles(writes) // 事务改写件一并增量（同事务口径）
      } else if (event.type === 'delete') {
        store.removeFile(event.path)
        if (event.isDir === true) store.removeTree(event.path)
      }
    } catch (err) {
      warn(`[obsidian-web] 索引增量更新失败（30min 对账兜底校正）：${err?.message ?? err}`) // INV-15 禁静默
    }
  }

  // ── 生命周期：start=钩子+定时器+补跑账本；stop=清定时器+退订+关库 ─────────────────────
  let started = false
  let offHook = null
  let timerHandle = null

  async function start() {
    if (started) return
    started = true
    offHook = onVaultChange(onEvent)
    timerHandle = timers.setInterval(() => {
      if (queued > 0) return undefined // 在跑不重入（陈旧窗口仍由下一轮 ≤30min 兜住）
      return refresh().catch((err) => warn(`[obsidian-web] 30min 定时对账失败（下一轮重试）：${err?.message ?? err}`))
    }, intervalMs)
    timerHandle?.unref?.() // 不吊住宿主进程生命周期
    // 先查补跑账本（TECH §3.5）：未完 run → 续跑；无账本或距上次完成 >30min → 立即对账（陈旧窗口兜底）
    try {
      const ledger = readLedger()
      const unfinished = unfinishedRun(ledger)
      const lastDone = [...ledger.runs].reverse().find((r) => r.status === 'done') ?? null
      if (unfinished !== null) {
        await runReconcile({
          resumedFrom: unfinished.runId,
          initialCounts: unfinished.counts,
          initialCursor: unfinished.cursor,
        })
      } else if (lastDone === null || now() - lastDone.finishedAt > intervalMs) {
        await runReconcile()
      }
    } catch (err) {
      warn(`[obsidian-web] 启动补跑对账失败（定时器仍排定，下一轮重试）：${err?.message ?? err}`)
    }
  }

  function stop() {
    if (timerHandle !== null) {
      timers.clearInterval(timerHandle)
      timerHandle = null
    }
    offHook?.()
    offHook = null
    started = false
    store?.close()
    store = null
  }

  // ── fts 后端（T3 检索缝接管：{name, search({root,plan,limit})}，零 API 变化）────────────
  const ftsBackend = {
    name: 'fts',
    async search({ root, plan, limit }) {
      if (path.resolve(root) !== rootAbs) {
        // 绑定根不一致：绝不拿旧根索引冒充（可解释拒；热改可解释拒不冒充=T11 交接，多根档案=T12 数据面）
        throw fail('bad_request', `索引库绑定 ${rootAbs}，与查询根 ${root} 不一致——请以 /ob/api/index/refresh 重建`)
      }
      const s = await ensureStore() // 自愈重试；失败抛 index_unavailable（search 层自动降级 scan）
      const candidates = s.matchCandidates(plan) // compileQuery plan → FTS MATCH/LIKE（逐词转义）
      const hits = matchDocs(plan, candidates) // 命中行/score/snippet=scan 同口径（score=排序权重）
      return {
        hits: hits.slice(0, Math.max(1, Math.floor(limit) || 50)),
        degraded: null, // 零磁盘 IO、AND 窄化候选集——超时降级语义由 scan 兜底路径承载
      }
    },
  }

  /** 索引面状态（degraded 留痕可观测面，INV-15）：ready=库可用；degraded=开库失败留痕 */
  function status() {
    return {
      vaultRoot: rootAbs,
      dir: dirAbs,
      ready: store !== null,
      degraded: degraded === null ? null : { ...degraded },
    }
  }

  return {
    vaultRoot: rootAbs,
    dir: dirAbs,
    ledgerPath,
    get store() {
      return store
    },
    ftsBackend,
    status,
    start,
    stop,
    refresh,
    reconcile: runReconcile,
  }
}
