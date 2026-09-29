// ingest-schedule 单测（Task F3 定时执行控制；诊断 §4.2 选项 A 终裁=插件自管 timer）：
// 被测件：lib/ingest-schedule.js —— createIngestScheduler（自管 timer 到点 spawn 既有
// dsh-cron.sh wiki-ingest 通道，复用 lib/ingest-trigger.js distill 缝，flock 防重入天然兜底）。
// 语义契约（changes/2026-09-29-settings-ingest-controls 任务裁定）：
//   · enabled=false 不调度（不 arm 不触发）；启用/时间热改下个 reconcile 生效（≤60s，非 restartRequired）；
//   · 到点（armed timer）触发=无条件 spawn（cron 同语义）；flock 兜底防重入；
//   · 错过补跑：配置时间已过 + 当日无跑记录 → 补触发一次（判据=既有日志面
//     ~/.dsh/logs/cron/wiki-ingest-YYYYMMDD.log；启动时/热启用/时钟残局统一判据）；
//   · distill 缝沿 {data}/{error} 契约：通道缺/在跑=如实回报不 spawn（ingest-trigger 已锁）。
// 测试纪律（brief）：timer 测试用注入缝（假 clock/假 spawn）+ 真 spawn 形只读验（假 CRON 缝——
// 绝不触发真蒸馏、绝不写真 HOME；一切落点 mkdtemp）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const {
  createIngestScheduler,
  occurrenceFor,
  isValidScheduleTime,
  DEFAULT_SCHEDULE_TIME,
  SCHEDULE_TIME_RE,
} = await import('../lib/ingest-schedule.js')
const { createIngestTrigger } = await import('../lib/ingest-trigger.js')
const { apply, Config } = await import('../lib/index.js')

function mkTmp(t, prefix = 'wiki-steward-ingest-schedule-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

const tick = () => new Promise((res) => setTimeout(res, 0))

/** 假 timer 面（假 clock 注入缝）：timeout/interval 全记录、可手动引爆 */
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

/** 本地 2026-09-29 10:00:00（本地时区构造=与 dateStamp 同口径，TZ 无关确定性） */
const T0 = new Date(2026, 8, 29, 10, 0, 0).getTime()
const MIN = 60_000

/** 调度器测试装配：假 clock + 假 distill + 假 runRecord（全注入缝，零外部副作用） */
function mkScheduler(t, { time = '00:25', enabled = true, nowMs = T0, ranToday = false, distillImpl = null } = {}) {
  const timers = fakeTimers()
  const distills = []
  const warns = []
  const recordChecks = []
  const cfg = { enabled, time }
  const sched = createIngestScheduler({
    getCfg: () => cfg,
    distill: async (meta) => {
      distills.push(meta)
      if (distillImpl) return distillImpl(meta)
      return { started: true, reason: 'started', note: '蒸馏由任务执行' }
    },
    now: () => nowMs,
    logDir: mkTmp(t),
    runRecordExists: (stamp) => { recordChecks.push(stamp); return ranToday },
    setTimeoutFn: timers.setTimeout,
    clearTimeoutFn: timers.clearTimeout,
    setIntervalFn: timers.setInterval,
    clearIntervalFn: timers.clearInterval,
    warn: (line) => warns.push(line),
  })
  t.after(() => sched.stop())
  return {
    sched,
    timers,
    distills,
    warns,
    recordChecks,
    cfg,
    setNow: (v) => { nowMs = v },
  }
}

// ── 纯函数面：时间解析 / occurrence 计算 ────────────────────────────────────
test('时间格式契约：HH:MM 严格形（00-23:00-59），非法形不认', () => {
  assert.equal(isValidScheduleTime('00:25'), true)
  assert.equal(isValidScheduleTime('23:59'), true)
  for (const bad of ['24:00', '25:99', '0:25', '00:25:00', '0025', '', '00:5a', null, 25]) {
    assert.equal(isValidScheduleTime(bad), false, `必不认：${String(bad)}`)
  }
  assert.ok(SCHEDULE_TIME_RE.test(DEFAULT_SCHEDULE_TIME))
  assert.equal(DEFAULT_SCHEDULE_TIME, '00:25', '缺省时间=与现系统 cron 同点（00:25）')
})

test('occurrenceFor：今日 HH:MM 目标点 + key 形（YYYYMMDD|HH:MM）+ 跨日滚明日', () => {
  const occ = occurrenceFor(new Date(2026, 8, 29, 10, 0, 0).getTime(), '00:25')
  assert.equal(occ.stamp, '20260929')
  assert.equal(occ.key, '20260929|00:25')
  assert.equal(occ.todayMs, new Date(2026, 8, 29, 0, 25, 0, 0).getTime())
  assert.equal(occ.tomorrowMs, new Date(2026, 8, 30, 0, 25, 0, 0).getTime())
  assert.equal(occ.nextKey, '20260930|00:25')

  const evening = occurrenceFor(new Date(2026, 8, 29, 20, 0, 0).getTime(), '23:00')
  assert.equal(evening.todayMs, new Date(2026, 8, 29, 23, 0, 0, 0).getTime())
  assert.ok(evening.tomorrowMs > evening.todayMs)
  // 月末跨月滚日（9-30 → 10-1）
  const monthEnd = occurrenceFor(new Date(2026, 8, 30, 10, 0, 0).getTime(), '08:00')
  assert.equal(monthEnd.nextKey, '20261001|08:00')
})

// ── 开关/到点/补跑（假 clock 假 spawn 注入缝）────────────────────────────────
test('enabled=false 不调度：不 arm 不触发（零 timeout 零 spawn）；热启用下个 reconcile 生效', async (t) => {
  const { sched, timers, distills, cfg } = mkScheduler(t, { enabled: false, nowMs: new Date(2026, 8, 29, 0, 0).getTime() })
  sched.start()
  assert.equal(timers.timeouts.size, 0, 'disabled 不 arm')
  await tick()
  assert.equal(distills.length, 0, 'disabled 永不触发')

  cfg.enabled = true // 热改：下个 reconcile 生效（≤60s）
  const r = sched.reconcile()
  assert.equal(r.state, 'armed')
  assert.equal(timers.timeouts.size, 1, '热启用后 arm 到今日 00:25')
  assert.equal([...timers.timeouts.values()][0].ms, 25 * MIN)
})

test('到点触发：arm 到 HH:MM → timer 到点 distill 恰一次（无条件 spawn=cron 同语义）+ 重 arm 明日', async (t) => {
  const nowMs = new Date(2026, 8, 29, 0, 0).getTime() // 00:00
  const { sched, timers, distills, recordChecks, setNow } = mkScheduler(t, { time: '00:25', nowMs })
  sched.start()
  assert.equal(timers.timeouts.size, 1)
  const [id] = timers.timeouts.keys()
  assert.equal(timers.timeouts.get(id).ms, 25 * MIN, 'arm 到今日 00:25（精确到点 setTimeout）')

  setNow(new Date(2026, 8, 29, 0, 25).getTime()) // 时钟走到到点时刻（真语义：timer 发火即到点）
  timers.fireTimeout(id) // 到点
  await tick()
  assert.equal(distills.length, 1, '到点恰触发一次')
  assert.equal(distills[0].catchUp, false, '到点触发=无条件（cron 同语义，不查跑记录）')
  assert.equal(recordChecks.length, 0, '到点路径不查日志面（无条件 spawn，flock 兜底）')
  assert.equal(timers.timeouts.size, 1, '触发后重 arm 明日')
  assert.equal([...timers.timeouts.values()][0].ms, 24 * 60 * MIN, '明日 00:25=24h 后')

  setNow(new Date(2026, 8, 30, 0, 25).getTime()) // 时钟推进到次日到点
  timers.fireTimeout([...timers.timeouts.keys()][0]) // 明日到点
  await tick()
  assert.equal(distills.length, 2, '跨日 occurrence 独立触发')
  assert.equal(distills[1].catchUp, false)
})

test('错过补跑：配置时间已过 + 当日无跑记录 → 补触发恰一次（meta.catchUp=true），并排明日', async (t) => {
  const { sched, timers, distills, recordChecks } = mkScheduler(t, { time: '00:25', nowMs: T0 }) // 10:00 已过 00:25
  sched.start()
  await tick()
  assert.deepEqual(recordChecks, ['20260929'], '判据=既有日志面当日跑记录')
  assert.equal(distills.length, 1, '补触发恰一次')
  assert.equal(distills[0].catchUp, true, '补跑标记如实')
  assert.equal(timers.timeouts.size, 1, '补跑后排明日 00:25')
  assert.equal([...timers.timeouts.values()][0].ms, 14 * 60 * MIN + 25 * MIN, '10:00→次日 00:25 = 14h25m')

  sched.reconcile() // 再跑不重复补（firedKey 去重）
  await tick()
  assert.equal(distills.length, 1, '同一 occurrence 补跑不重复')
})

test('错过补跑抑制：当日已有跑记录（wiki-ingest-YYYYMMDD.log 在）→ 不补跑只排明日', async (t) => {
  const { sched, timers, distills, recordChecks } = mkScheduler(t, { time: '00:25', nowMs: T0, ranToday: true })
  sched.start()
  await tick()
  assert.deepEqual(recordChecks, ['20260929'])
  assert.equal(distills.length, 0, '当日已跑（cron/手动）→ 不补触发')
  assert.equal(timers.timeouts.size, 1, '只排明日')
})

test('热改：time 换键重 arm（旧 timer 清掉零残留）；enabled 翻 false → 清 arm；复启用走补跑判据', async (t) => {
  const nowMs = new Date(2026, 8, 29, 0, 0).getTime()
  const { sched, timers, distills, cfg, setNow } = mkScheduler(t, { time: '00:25', nowMs })
  sched.start()
  assert.equal([...timers.timeouts.values()][0].ms, 25 * MIN)

  cfg.time = '23:00' // 热改执行时间
  sched.reconcile()
  assert.equal(timers.timeouts.size, 1, '换键重 arm（旧 timer 已清）')
  assert.equal([...timers.timeouts.values()][0].ms, 23 * 60 * MIN, '新时间 23:00 当日生效')
  assert.equal(distills.length, 0)

  cfg.enabled = false
  sched.reconcile()
  assert.equal(timers.timeouts.size, 0, '停用=清 arm 零残留')
  assert.equal(distills.length, 0)

  setNow(new Date(2026, 8, 29, 23, 30).getTime()) // 停用期间 23:00 经过
  cfg.enabled = true
  sched.reconcile()
  await tick()
  assert.equal(distills.length, 1, '停用期间错过的 occurrence 按补跑判据收口')
  assert.equal(distills[0].catchUp, true)
})

test('distill 抛错吞+留痕（fire 永不 reject、调度环不炸不重试刷屏）', async (t) => {
  const nowMs = new Date(2026, 8, 29, 0, 0).getTime()
  const { sched, timers, distills, warns } = mkScheduler(t, {
    time: '00:25',
    nowMs,
    distillImpl: async () => { throw new Error('spawn boom') },
  })
  sched.start()
  timers.fireTimeout([...timers.timeouts.keys()][0])
  await tick()
  assert.equal(distills.length, 1)
  assert.ok(warns.some((l) => /spawn boom/.test(l)), '失败必须留痕（INV-15 禁静默）')
  sched.reconcile()
  await tick()
  assert.equal(distills.length, 1, '同 occurrence 不重试刷屏')
})

test('stop() 零残留：清 interval + 清 armed timer；幂等；start/stop 可再用', async (t) => {
  const { sched, timers, distills } = mkScheduler(t, { time: '00:25', nowMs: new Date(2026, 8, 29, 0, 0).getTime() })
  sched.start()
  assert.equal(timers.intervals.size, 1, 'reconcile 环在场（热改/补跑巡检）')
  assert.equal(timers.timeouts.size, 1)
  sched.stop()
  assert.equal(timers.intervals.size, 0, 'interval 清干净')
  assert.equal(timers.timeouts.size, 0, 'armed timer 清干净')
  sched.stop() // 幂等
  assert.equal(timers.timeouts.size, 0)

  sched.start() // 再用
  assert.equal(timers.intervals.size, 1)
  assert.equal(timers.timeouts.size, 1)
  assert.equal(distills.length, 0, 'start 不触发（时间未到）')
})

// ── 真 spawn 形只读验（假 CRON 缝真 bash spawn——绝不触发真蒸馏）─────────────
test('真 spawn 形：补跑走真 bash spawn（假 CRON 缝写 marker，真 child_process 通路成立）', async (t) => {
  const logDir = mkTmp(t)
  const marker = path.join(logDir, 'marker.txt')
  const fakeCron = path.join(logDir, 'fake-cron.sh')
  fs.writeFileSync(fakeCron, `#!/bin/bash\necho "FAKE-CRON $@" > "${marker}"\n`, { mode: 0o755 })
  const taskFile = path.join(logDir, 'task.md')
  fs.writeFileSync(taskFile, '# fake task（绝不执行 LLM——假 CRON 缝）')

  // 真 trigger（真 execFile flock 探针 + 真 spawn；cronScript/taskFile 全假件=绝不触真蒸馏）
  const trigger = createIngestTrigger({ home: '/home/x', logDir, cronScript: fakeCron, taskFile, now: () => new Date() })
  const results = []
  const sched = createIngestScheduler({
    getCfg: () => ({ enabled: true, time: '00:25' }),
    distill: async (meta) => { const r = await trigger.distill(); results.push({ meta, r }); return r },
    now: () => T0, // 10:00：时间已过 → 补跑路径（当日无跑记录）
    logDir,
    runRecordExists: () => false,
  })
  t.after(() => sched.stop())
  sched.reconcile()

  for (let i = 0; i < 100 && !fs.existsSync(marker); i += 1) await new Promise((res) => setTimeout(res, 50))
  assert.ok(fs.existsSync(marker), '真 bash spawn 必须真跑假 CRON 缝（detached 通路端到端）')
  const text = fs.readFileSync(marker, 'utf8')
  assert.match(text, /FAKE-CRON wiki-ingest/, 'spawn 形=bash <cron> wiki-ingest <task>（复用 distill 缝 argv）')
  assert.match(text, /task\.md/)
  assert.equal(results[0].r.started, true)
  assert.equal(results[0].meta.catchUp, true)
  assert.ok(!text.includes('/root/bin/dsh-cron.sh'), '绝不触发真蒸馏通道（假 CRON 缝隔离）')
})

// ── index.js 装配（integration 形：真 apply + 假宿主缝）──────────────────────
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

function mkWireOpts(t, { timers, distills, nowRef }) {
  const home = mkTmp(t)
  return {
    paths: {
      queueDir: path.join(home, 'queue'),
      ledgerFile: path.join(home, 'schedule-ledger.json'),
      alertFile: path.join(home, 'kb-alerts.md'),
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
      distill: async (meta) => { distills.push(meta); return { started: true } },
      now: () => nowRef.value,
      logDir: path.join(home, 'logs'),
      runRecordExists: () => false,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    },
  }
}

test('接线：apply 装配定时调度进 ctx.effect（label 钉住=wiki-steward: ingest-schedule），teardown 停表零残留', async (t) => {
  const timers = fakeTimers()
  const distills = []
  const nowRef = { value: new Date(2026, 8, 29, 0, 0).getTime() }
  const ctx = mkWireCtx()
  const cfg = { ingest: { schedule: { enabled: true, time: '00:25' } } }
  apply(ctx, cfg, mkWireOpts(t, { timers, distills, nowRef }))

  const eff = ctx.state.effects.find((e) => e.label === 'wiki-steward: ingest-schedule')
  assert.ok(eff, '调度器必须挂 effect（INV-3 生命周期：拆除器在场）')
  assert.equal(typeof eff.teardown, 'function')
  assert.equal(timers.timeouts.size, 1, '装配即 arm 到点（00:25）')

  timers.fireTimeout([...timers.timeouts.keys()][0])
  await tick()
  assert.equal(distills.length, 1, '到点经 distill 缝（假件记录）')

  eff.teardown()
  assert.equal(timers.timeouts.size, 0, '拆除=armed timer 清零')
  assert.equal(timers.intervals.size, 0, '拆除=interval 清零（零残留定时器）')
  eff.teardown() // 幂等
  assert.equal(timers.timeouts.size, 0)
})

test('接线：缺 effect 缝 + enabled=true → 留痕不裸起定时器（INV-3 零残留纪律）；缺省 disabled 零留痕', async (t) => {
  const timers = fakeTimers()
  const distills = []
  const nowRef = { value: new Date(2026, 8, 29, 0, 0).getTime() }

  const ctx1 = mkWireCtx({ withEffect: false })
  apply(ctx1, { ingest: { schedule: { enabled: true, time: '00:25' } } }, mkWireOpts(t, { timers, distills, nowRef }))
  assert.equal(timers.timeouts.size, 0, '无拆除通道绝不裸起定时器')
  assert.equal(timers.intervals.size, 0)
  assert.ok(ctx1.state.warnings.some((l) => /定时调度/.test(l) && /effect/.test(l)), '缺缝留痕如实（INV-15）')

  const ctx2 = mkWireCtx({ withEffect: false })
  apply(ctx2, { vaultRoot: '/tmp/x' }, mkWireOpts(t, { timers, distills, nowRef }))
  assert.equal(ctx2.state.warnings.length, 0, '缺省 disabled=功能未启用，零留痕（健康路径）')
})

test('接线：配置热改面——rawConfig 现读（改 time → 下个 reconcile 换键重 arm）', async (t) => {
  const timers = fakeTimers()
  const distills = []
  const nowRef = { value: new Date(2026, 8, 29, 0, 0).getTime() }
  const ctx = mkWireCtx()
  const cfg = { ingest: { schedule: { enabled: true, time: '00:25' } } }
  apply(ctx, cfg, mkWireOpts(t, { timers, distills, nowRef }))
  assert.equal([...timers.timeouts.values()][0].ms, 25 * MIN)

  cfg.ingest.schedule.time = '23:30' // 热改（configEditor 持久化缝同款语义：rawConfig 现读）
  const intervalCb = [...timers.intervals.values()][0].fn
  intervalCb()
  assert.equal([...timers.timeouts.values()][0].ms, 23 * 60 * MIN + 30 * MIN, '新时间下个 reconcile 生效（非 restartRequired）')
  assert.equal(distills.length, 0)
})

// ── Config 契约（F3 验收④：新键入 Config + 向后兼容）─────────────────────────
test('Config 新键 ingest.schedule：缺省 enabled:false + time:"00:25"（旧配置不炸=缺省零行为变化）', () => {
  assert.deepEqual(Config.parse({}).ingest.schedule, { enabled: false, time: '00:25' })
  const old = Config.parse({ vaultRoot: '/mnt/x', capture: { enabled: true }, queue: { maxRetries: 2 } })
  assert.deepEqual(old.ingest.schedule, { enabled: false, time: '00:25' }, '旧配置无 ingest 键=全默认不炸')
  assert.equal(old.capture.enabled, true)
})

test('Config ingest.schedule 校验：时间严格 HH:MM、enabled 严格 boolean（错误类型拒）', () => {
  assert.equal(Config.parse({ ingest: { schedule: { enabled: true, time: '23:30' } } }).ingest.schedule.time, '23:30')
  for (const bad of [
    { ingest: { schedule: { time: '25:00' } } },
    { ingest: { schedule: { time: '0:25' } } },
    { ingest: { schedule: { time: 2500 } } },
    { ingest: { schedule: { enabled: 'yes' } } },
  ]) {
    assert.throws(() => Config.parse(bad), `必拒：${JSON.stringify(bad)}`)
  }
})
