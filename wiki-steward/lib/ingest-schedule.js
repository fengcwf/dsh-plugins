// ingest-schedule — 定时蒸馏调度（Task F3；诊断 §4.2 选项 A 终裁=插件自管 timer，automation 侦察
// §5 对 C 的否决=原生自动化任务是会话内提醒投递器非 headless 执行器）：
//   到点 spawn 既有 dsh-cron.sh wiki-ingest 通道（复用 lib/ingest-trigger.js distill 缝——
//   通道缺/在跑=如实回报不 spawn，flock 防重入天然兜底）；
//   enabled=false 不调度（不 arm 不触发）；
//   错过补跑判据=既有日志面 ~/.dsh/logs/cron/wiki-ingest-YYYYMMDD.log（当日无跑记录→补触发一次）。
// 语义（task-f3-report.md「timer 生效语义」）：
//   · 到点（armed setTimeout 精确到分）触发=无条件 spawn（cron 同语义）——到点路径不查跑记录，
//     双源并跑由 flock 兜底（flock 在跑→already-running 如实回报）；
//   · 错过补跑=「今日到点未发 + 当日无跑记录」统一判据（启动时/热启用/时钟残局三态同一收口），
//     firedKey 去重防同 occurrence 重复触发；
//   · reconcile 巡检环（默认 60s）热改现读 getCfg——enabled/time 变更下个环生效（非 restartRequired）。
// 生命周期：start()/stop()（index.js 经 ctx.effect 挂拆除器，INV-3 零残留定时器；
// 缺 effect 缝=不裸起定时器+留痕）。全注入缝（假 clock/假 spawn/假 runRecord 测试形）：
// setTimeoutFn/clearTimeoutFn/setIntervalFn/clearIntervalFn/now/runRecordExists/distill。
import fs from 'node:fs'
import path from 'node:path'
import { dateStamp } from './ingest-trigger.js'

/** 缺省执行时间=与现系统 cron 同点（00:25）：开启即等价迁移现状时间 */
export const DEFAULT_SCHEDULE_TIME = '00:25'
/** 严格 HH:MM（00-23:00-59）；Config zod 同源校验，非法值一律拒 */
export const SCHEDULE_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidScheduleTime(time) {
  return typeof time === 'string' && SCHEDULE_TIME_RE.test(time)
}

/**
 * occurrence 计算（纯函数）：今日（本地时区=与 dsh-cron.sh `date +%Y%m%d` 同口径）HH:MM 目标点。
 * @param {number} nowMs 当前毫秒
 * @param {string} time 执行时间（HH:MM；非法回退缺省 00:25）
 * @returns {{stamp:string, key:string, nextKey:string, todayMs:number, tomorrowMs:number}}
 *   key 形 `YYYYMMDD|HH:MM`（同 occurrence 去重口径；换时间=换 key=当日新 occurrence）
 */
export function occurrenceFor(nowMs, time) {
  const m = SCHEDULE_TIME_RE.exec(typeof time === 'string' ? time : '')
  const hh = m ? Number(m[1]) : 0
  const mm = m ? Number(m[2]) : 25
  const norm = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  const d = new Date(nowMs)
  const todayMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0).getTime()
  const tomorrowMs = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, hh, mm, 0, 0).getTime()
  return {
    stamp: dateStamp(d),
    key: `${dateStamp(d)}|${norm}`,
    nextKey: `${dateStamp(new Date(tomorrowMs))}|${norm}`,
    todayMs,
    tomorrowMs,
  }
}

/**
 * 调度器工厂（插件自管 timer）。
 * @param {object} opts
 * @param {()=>{enabled:boolean,time:string}} opts.getCfg 热改现读（Config ingest.schedule 面）
 * @param {(meta:{catchUp:boolean,key:string,at:number})=>Promise<any>} opts.distill 触发缝（ingest-trigger distill 形）
 * @param {()=>number} [opts.now] 假时钟缝
 * @param {string} [opts.logDir] 跑记录判据目录（缺省 ~/.dsh/logs/cron——dsh-cron.sh 同位）
 * @param {string} [opts.taskName] 任务名（跑记录文件 <taskName>-YYYYMMDD.log）
 * @param {(stamp:string)=>boolean} [opts.runRecordExists] 跑记录判据缝（缺省 fs.existsSync 日志面）
 * @param {Function} [opts.setTimeoutFn] [opts.clearTimeoutFn] [opts.setIntervalFn] [opts.clearIntervalFn] 假 timer 缝
 * @param {number} [opts.reconcileIntervalMs] 巡检环间隔（缺省 60s——热改/补跑巡检）
 * @param {(line:string)=>void} [opts.warn]
 * @returns {{start:Function, stop:Function, reconcile:Function}}
 */
export function createIngestScheduler({
  getCfg,
  distill,
  now = () => Date.now(),
  logDir = path.join(process.env.HOME ?? '', '.dsh', 'logs', 'cron'),
  taskName = 'wiki-ingest',
  runRecordExists = null,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  reconcileIntervalMs = 60_000,
  warn = () => {},
} = {}) {
  if (typeof getCfg !== 'function') throw new TypeError('createIngestScheduler: getCfg 必须是函数')
  if (typeof distill !== 'function') throw new TypeError('createIngestScheduler: distill 必须是函数')

  /** 跑记录判据（既有日志面）：当日 wiki-ingest-YYYYMMDD.log 在=当日已有跑（cron/手动/补跑） */
  const recordExists = typeof runRecordExists === 'function'
    ? runRecordExists
    : (stamp) => fs.existsSync(path.join(logDir, `${taskName}-${stamp}.log`))

  let started = false
  /** @type {{key:string, timer:any}|null} */
  let armed = null
  let intervalTimer = null
  let firedKey = null // 本实例已触发的 occurrence（同 occurrence 不重复）

  function readSchedule() {
    let c
    try {
      c = getCfg() ?? {}
    } catch (e) {
      warn(`[wiki-steward] ingest 定时配置读取失败（按停用处理）：${e?.message ?? e}`)
      return { enabled: false, time: DEFAULT_SCHEDULE_TIME }
    }
    return {
      enabled: c.enabled === true,
      time: isValidScheduleTime(c.time) ? c.time : DEFAULT_SCHEDULE_TIME,
    }
  }

  function clearArm() {
    if (armed === null) return
    try { clearTimeoutFn(armed.timer) } catch { /* 清理不抛 */ }
    armed = null
  }

  function armFor(key, delayMs) {
    if (armed !== null && armed.key === key) return // 同 occurrence 不重 arm（防抖）
    clearArm()
    let timer
    try {
      timer = setTimeoutFn(() => {
        armed = null
        void fire(key, false) // 到点=无条件 spawn（cron 同语义；fire 同步段先记 firedKey）
        reconcile() // 到点收口：排下一个 occurrence
      }, Math.max(0, delayMs))
    } catch (e) {
      warn(`[wiki-steward] ingest 定时 arm 失败（下个巡检环重试）：${e?.message ?? e}`)
      return
    }
    timer?.unref?.() // 不挂进程退出（web 宿主常驻；测试/短命进程不被拖住）
    armed = { key, timer }
  }

  /** 触发（firedKey 去重；吞错+留痕——调度环绝不被触发失败拖垮） */
  async function fire(key, catchUp) {
    if (firedKey === key) return { skipped: 'already-fired', key }
    firedKey = key // 同步段先记账（防 fire 异步在途时同 occurrence 二次触发）
    const meta = { catchUp: catchUp === true, key, at: now() }
    try {
      const r = await distill(meta)
      return { ok: true, meta, result: r }
    } catch (e) {
      warn(`[wiki-steward] ingest 定时触发失败（已吞不阻塞调度环，不重试刷屏）：${e?.message ?? e}`)
      return { ok: false, meta, error: String(e?.message ?? e) }
    }
  }

  function ranToday(stamp) {
    try {
      return recordExists(stamp) === true
    } catch (e) {
      warn(`[wiki-steward] 当日跑记录判据读取失败（保守不补跑）：${e?.message ?? e}`)
      return true
    }
  }

  /**
   * 巡检（幂等，同步）：off / armed（未到点）/ due（到点 timer 在途）/ next（今日收口排明日）。
   * 错过补跑判据=今日到点未发 + 当日无跑记录（启动时/热启用/时钟残局三态统一收口）。
   */
  function reconcile() {
    const cfg = readSchedule()
    if (!cfg.enabled) {
      clearArm()
      firedKey = null
      return { state: 'off' }
    }
    const nowMs = now()
    const occ = occurrenceFor(nowMs, cfg.time)
    if (nowMs < occ.todayMs) {
      armFor(occ.key, occ.todayMs - nowMs)
      return { state: 'armed', key: occ.key, at: occ.todayMs }
    }
    // 今日到点已至/已过
    if (armed !== null && armed.key === occ.key) {
      return { state: 'due', key: occ.key, pending: true } // 到点 timer 在途，等它发（不抢发不重 arm）
    }
    if (firedKey !== occ.key) {
      if (!ranToday(occ.stamp)) {
        void fire(occ.key, true) // 错过补跑：当日无跑记录 → 补触发一次
      } else {
        firedKey = occ.key // 当日已有跑记录（cron/手动）→ 不补跑（记账防反复查）
      }
    }
    armFor(occ.nextKey, occ.tomorrowMs - nowMs)
    return { state: 'next', key: occ.nextKey, at: occ.tomorrowMs }
  }

  function start() {
    if (started) return
    started = true
    reconcile()
    try {
      intervalTimer = setIntervalFn(() => {
        try {
          reconcile()
        } catch (e) {
          warn(`[wiki-steward] ingest 调度巡检异常已吞（不阻塞）：${e?.message ?? e}`)
        }
      }, reconcileIntervalMs)
      intervalTimer?.unref?.()
    } catch (e) {
      warn(`[wiki-steward] ingest 调度巡检环启动失败（到点 arm 仍生效）：${e?.message ?? e}`)
    }
  }

  function stop() {
    started = false
    clearArm()
    if (intervalTimer !== null) {
      try { clearIntervalFn(intervalTimer) } catch { /* 清理不抛 */ }
      intervalTimer = null
    }
    firedKey = null
  }

  return { start, stop, reconcile }
}
