// Hindsight 定时同步调度单测（2026-10-07 波 repair-r2 F1，U2「同步时间调整」落地）。
// 被测件：lib/index.js 装配面（真 apply + 假宿主缝，integration 形——ingest-schedule 测试同款形）：
//   · createIngestScheduler 同款形复用：消费 hindsight.sync.schedule{enabled,time}，过 L1 门禁
//     hindsight.enabled（关=不触发）；触发缝=createSyncStarter 同一实例（手动/定时同源单飞防重入）；
//   · 补跑判据=同步日志 jsonl 当日有行（syncRanOnStamp）；生命周期挂 ctx.effect（INV-3 零残留）。
// 测试纪律：假 clock/假 timer/假引擎=I/O 边界注入缝（非 mock 自证）——控制逻辑（arm/到点/单飞/
// 门禁/补跑/拆除）全真跑；落点 mkdtemp，绝不写真 home。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { apply, Config } = await import('../lib/index.js')
const { occurrenceFor, DEFAULT_SCHEDULE_TIME } = await import('../lib/ingest-schedule.js')

function mkTmp(t, prefix = 'wiki-steward-hs-schedule-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

const tick = () => new Promise((res) => setTimeout(res, 0))

/** 假 timer 面（假 clock 注入缝）：timeout/interval 全记录、可手动引爆（ingest-schedule 同款形） */
function fakeTimers() {
  let nextId = 1
  const timeouts = new Map()
  const intervals = new Map()
  return {
    timeouts,
    intervals,
    setTimeout: (fn, ms) => { const id = nextId++; timeouts.set(id, { fn, ms }); return id },
    clearTimeout: (id) => { timeouts.delete(id) },
    setInterval: (fn, ms) => { const id = nextId++; intervals.set(id, { fn, ms }); return id },
    clearInterval: (id) => { intervals.delete(id) },
    fireTimeout(id) {
      const t = timeouts.get(id)
      assert.ok(t, `无此 timeout：${id}`)
      timeouts.delete(id)
      t.fn()
    },
  }
}

/** 假宿主 ctx（ingest-schedule 同款形）：effect/工具/事件缝齐备，effects 带 label 可查 */
function mkWireCtx({ withEffect = true } = {}) {
  const state = { warnings: [], effects: [], intervals: [], onRegs: [], toolRegs: [] }
  const ctx = {
    state,
    logger: { warn: (l) => state.warnings.push(l) },
    tools: { register: (tool) => state.toolRegs.push(tool) },
    on: (event, handler) => state.onRegs.push({ event, handler }),
    get: (name) => (name === 'timer' ? { interval: (cb, ms) => { state.intervals.push({ cb, ms }); return () => {} } } : undefined),
    webServer: { register: () => () => {} },
    connection: { requestRejection: () => undefined },
  }
  if (withEffect) {
    ctx.effect = (execute, label) => {
      const teardown = execute()
      state.effects.push({ label, teardown })
      return teardown
    }
  }
  return ctx
}

/**
 * apply 装配缝：Hindsight 面用传入假 timer（断言面干净）；ingest 面独立假表（互不串扰）；
 * createEngine=引擎工厂注入缝（真 createSyncStarter 控制逻辑 + 假引擎 I/O——t9 同款形）。
 */
function mkWireOpts(t, { timers, nowRef, createEngine, runRecordExists = () => false }) {
  const home = mkTmp(t)
  const ingestTimers = fakeTimers()
  const dataDir = path.join(home, 'hsdata')
  return {
    paths: {
      queueDir: path.join(home, 'queue'),
      ledgerFile: path.join(home, 'schedule-ledger.json'),
      alertFile: path.join(home, 'kb-alerts.md'),
      dataDir,
      syncLogFile: path.join(dataDir, 'hindsight-sync-log.jsonl'),
    },
    web: {
      home,
      logDir: path.join(home, 'logs'),
      trigger: {
        scan: async () => ({ ok: true, exitCode: 0, summary: {}, output: '', logFile: '', argv: [] }),
        distill: async () => ({ started: true, reason: 'started', note: '蒸馏由任务执行', logFile: '' }),
        distillStatus: async () => ({ running: false, channelAvailable: true }),
      },
      sources: [],
    },
    ingest: {
      distill: async () => ({ started: true }),
      now: () => nowRef.value,
      logDir: path.join(home, 'logs'),
      runRecordExists: () => true,
      setTimeout: ingestTimers.setTimeout,
      clearTimeout: ingestTimers.clearTimeout,
      setInterval: ingestTimers.setInterval,
      clearInterval: ingestTimers.clearInterval,
    },
    hindsight: {
      createEngine,
      now: () => nowRef.value,
      runRecordExists,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    },
  }
}

/** 记录式假引擎（I/O 边界缝）：syncAll 记录触发次数，可挂起（单飞取证） */
function mkEngine({ pending = false } = {}) {
  const calls = []
  let resolveSync = null
  const createEngine = () => ({
    syncAll: () => {
      calls.push(1)
      if (!pending) return Promise.resolve({ ok: true, banks: [], errors: [] })
      return new Promise((res) => { resolveSync = res })
    },
  })
  return { createEngine, calls, settle: () => resolveSync?.({ ok: true, banks: [], errors: [] }) }
}

const HS_ON = { hindsight: { enabled: true, sync: { schedule: { enabled: true, time: '03:25' } } } }
/** 本地 2026-10-08 00:00（本地时区构造=dateStamp 同口径，TZ 无关确定性） */
const T0 = new Date(2026, 9, 8, 0, 0, 0).getTime()

// ── 接线 + 到点触发 + 拆除零残留（INV-3）────────────────────────────────────
test('接线：apply 装配 Hindsight 定时同步进 ctx.effect（label=wiki-steward: hindsight-schedule）；到点触发引擎一次；teardown 零残留', async (t) => {
  const timers = fakeTimers()
  const nowRef = { value: T0 }
  const engine = mkEngine()
  const ctx = mkWireCtx()
  apply(ctx, HS_ON, mkWireOpts(t, { timers, nowRef, createEngine: engine.createEngine }))

  const eff = ctx.state.effects.find((e) => e.label === 'wiki-steward: hindsight-schedule')
  assert.ok(eff, 'Hindsight 调度器必须挂 effect（INV-3 生命周期：拆除器在场）')
  assert.equal(typeof eff.teardown, 'function')
  assert.equal(timers.timeouts.size, 1, '装配即 arm 到点（03:25）')

  timers.fireTimeout([...timers.timeouts.keys()][0])
  await tick()
  assert.equal(engine.calls.length, 1, '到点触发同步引擎一次（detached）')

  eff.teardown()
  assert.equal(timers.timeouts.size, 0, '拆除=armed timer 清零')
  assert.equal(timers.intervals.size, 0, '拆除=interval 清零（零残留定时器）')
  eff.teardown() // 幂等
  assert.equal(timers.timeouts.size, 0)
})

// ── 单飞（手动/定时同源防重入）──────────────────────────────────────────────
test('单飞：定时触发在途时再次触发=不重建引擎不二跑（already-running；与手动按钮共用 createSyncStarter 旗标）', async (t) => {
  const timers = fakeTimers()
  const nowRef = { value: T0 }
  const engine = mkEngine({ pending: true })
  let factoryCalls = 0
  const createEngine = (cfg) => { factoryCalls += 1; return engine.createEngine(cfg) }
  const ctx = mkWireCtx()
  apply(ctx, HS_ON, mkWireOpts(t, { timers, nowRef, createEngine }))

  timers.fireTimeout([...timers.timeouts.keys()][0]) // 触发①：起跑（pending 不落）
  await tick()
  assert.equal(engine.calls.length, 1, '触发①真起跑')
  assert.equal(factoryCalls, 1)

  timers.fireTimeout([...timers.timeouts.keys()][0]) // 触发②（次日 occurrence）：在途 → 拒
  await tick()
  assert.equal(factoryCalls, 1, '单飞：在途不重建引擎（already-running 防重入）')
  assert.equal(engine.calls.length, 1, '单飞：syncAll 不二跑')

  engine.settle()
  await tick()
})

// ── 错峰（U2：与 wiki-ingest 00:25 蒸馏错开）────────────────────────────────
test('错峰判据：Hindsight 缺省 03:25 ≠ wiki-ingest 00:25（同日错开 3 小时，蒸馏之后跑）', () => {
  assert.equal(Config.parse({}).hindsight.sync.schedule.time, '03:25', 'Config 缺省=03:25')
  assert.equal(DEFAULT_SCHEDULE_TIME, '00:25', 'wiki-ingest 缺省=00:25')
  const hs = occurrenceFor(T0, '03:25')
  const ig = occurrenceFor(T0, '00:25')
  assert.equal(hs.todayMs - ig.todayMs, 3 * 60 * 60 * 1000, '同日错峰恰 3 小时（不撞点）')
  assert.ok(hs.todayMs > ig.todayMs, '同步在蒸馏之后（先落 raw 再蒸馏语义不倒挂）')
})

// ── L1 门禁（hindsight.enabled 关=不触发）+ 热改开 L1 过点补跑 ──────────────
test('L1 门禁：hindsight.enabled=false → 不 arm 到点也不跑；热改开 L1 → 过点无跑记录补跑一次', async (t) => {
  const timers = fakeTimers()
  const nowRef = { value: new Date(2026, 9, 8, 2, 0, 0).getTime() }
  const engine = mkEngine()
  const cfg = { hindsight: { enabled: false, sync: { schedule: { enabled: true, time: '03:25' } } } }
  const ctx = mkWireCtx()
  apply(ctx, cfg, mkWireOpts(t, { timers, nowRef, createEngine: engine.createEngine }))

  assert.equal(timers.timeouts.size, 0, 'L1 关=不 arm（门禁在调度面收口）')

  nowRef.value = new Date(2026, 9, 8, 4, 0, 0).getTime() // 过点（03:25 已过）
  for (const it of timers.intervals.values()) it.fn() // 巡检环驱动
  await tick()
  assert.equal(engine.calls.length, 0, 'L1 关=到点也不跑（disabled 不触发）')

  cfg.hindsight.enabled = true // 热改开 L1（rawConfig 现读，下个 reconcile 生效）
  for (const it of timers.intervals.values()) it.fn()
  await tick()
  assert.equal(engine.calls.length, 1, '热改开 L1 + 过点无跑记录 → 补跑一次')
})

// ── 补跑判据（syncRanOnStamp：当日有记录含失败行=不补跑）────────────────────
test('补跑判据：过点 + 当日无同步记录 → 补触发一次；当日已有记录（含失败行）→ 不补跑', async (t) => {
  // 案一：当日无记录 → 补跑 + 判据被问及当日 stamp（YYYYMMDD）
  const timers1 = fakeTimers()
  const nowRef1 = { value: new Date(2026, 9, 8, 4, 0, 0).getTime() }
  const engine1 = mkEngine()
  const recordChecks = []
  const ctx1 = mkWireCtx()
  apply(ctx1, HS_ON, mkWireOpts(t, {
    timers: timers1, nowRef: nowRef1, createEngine: engine1.createEngine,
    runRecordExists: (stamp) => { recordChecks.push(stamp); return false },
  }))
  await tick()
  assert.equal(engine1.calls.length, 1, '过点+无记录 → 启动即补跑一次')
  assert.deepEqual(recordChecks, ['20261008'], '补跑判据问的是当日 stamp（dateStamp 同口径）')

  // 案二：当日已有记录（含失败行）→ 不补跑
  const timers2 = fakeTimers()
  const nowRef2 = { value: new Date(2026, 9, 8, 4, 0, 0).getTime() }
  const engine2 = mkEngine()
  const ctx2 = mkWireCtx()
  apply(ctx2, HS_ON, mkWireOpts(t, {
    timers: timers2, nowRef: nowRef2, createEngine: engine2.createEngine,
    runRecordExists: () => true,
  }))
  await tick()
  assert.equal(engine2.calls.length, 0, '当日已有记录=不补跑（判据收口，不重复触发）')
})

// ── 缺 effect 缝：留痕不裸起定时器（INV-3）；缺省 disabled 零留痕 ───────────
test('缺 effect 缝 + 启用 → 留痕不裸起定时器（INV-3 零残留纪律）；缺省 disabled 零留痕', async (t) => {
  const timers = fakeTimers()
  const nowRef = { value: T0 }
  const engine = mkEngine()

  const ctx1 = mkWireCtx({ withEffect: false })
  apply(ctx1, HS_ON, mkWireOpts(t, { timers, nowRef, createEngine: engine.createEngine }))
  assert.equal(timers.timeouts.size, 0, '无拆除通道绝不裸起定时器')
  assert.equal(timers.intervals.size, 0)
  assert.ok(ctx1.state.warnings.some((l) => /定时同步/.test(l) && /effect/.test(l)), '缺缝留痕如实（INV-15）')

  const ctx2 = mkWireCtx({ withEffect: false })
  apply(ctx2, { vaultRoot: '/tmp/x' }, mkWireOpts(t, { timers, nowRef, createEngine: engine.createEngine }))
  assert.equal(ctx2.state.warnings.length, 0, '缺省 disabled=功能未启用，零留痕（健康路径）')
})
