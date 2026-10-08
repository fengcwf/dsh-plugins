// hindsight-model — 「Hindsight 同步」设置节纯模型（日历聚合 / 状态徽标判定 / 时间校验 / L2 展示 / 动作状态机）。
// 容器/展示分离纪律：.vue 只做展示，全部判定逻辑落此（零框架依赖 → node --test 直测）。
// 口径来源 = t9 lib/hindsight-routes.js 响应形（diagnose / sync_status 官方字段名，取不到不编造——
// 侦察 A 卡#7「勿自造字段名」）；同步日志行形 = t8 lib/hindsight-sync.js（{ts,bank,facts,skipped,error?}）。

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 时间校验：HH:MM（00:00–23:59）严格形；空/非形=false（不静默放宽） */
export function isValidHhmm(value) {
  return HHMM_RE.test(String(value ?? '').trim())
}

/** 归一：trim 后返回合法 HH:MM；非法=null（调用方如实报错，绝不改写输入凑合法） */
export function normalizeHhmm(value) {
  const v = String(value ?? '').trim()
  return HHMM_RE.test(v) ? v : null
}

/**
 * 同步日历聚合（「按日计数条」数据源）：sync-log 行 → 逐日聚合。
 * - 畸形行（ts 非 YYYY-MM-DD）不进任何日桶，计入 dropped 如实回报（失败零静默）；
 * - 日行：{dateKey, runs, facts, skipped, errors, banks, pct}——pct=facts 相对峰值百分比（计数条长度）；
 * - 排序：dateKey 降序（最近在前）；opts.limit>0 时截前 N 天（全量仍计 total/dropped）。
 * 返回 { days, dropped, total }。
 */
export function aggregateSyncCalendar(lines, opts = {}) {
  const rows = Array.isArray(lines) ? lines : []
  const byDay = new Map()
  let dropped = 0
  for (const line of rows) {
    const dateKey = String(line?.ts ?? '').slice(0, 10)
    if (!DATE_RE.test(dateKey)) {
      dropped += 1
      continue
    }
    const cur = byDay.get(dateKey) ?? { dateKey, runs: 0, facts: 0, skipped: 0, errors: 0, banks: new Set() }
    cur.runs += 1
    cur.facts += Number.isFinite(line?.facts) ? line.facts : 0
    cur.skipped += Number.isFinite(line?.skipped) ? line.skipped : 0
    if (line?.error) cur.errors += 1
    if (line?.bank != null && String(line.bank) !== '') cur.banks.add(String(line.bank))
    byDay.set(dateKey, cur)
  }
  const days = [...byDay.values()]
    .map((d) => ({ ...d, banks: [...d.banks].sort() }))
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0))
  const maxFacts = days.reduce((m, d) => Math.max(m, d.facts), 0)
  for (const d of days) d.pct = maxFacts === 0 ? 0 : Math.round((d.facts / maxFacts) * 100)
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : 0
  return { days: limit > 0 ? days.slice(0, limit) : days, dropped, total: rows.length }
}

/**
 * 状态徽标判定（状态条数据形，§4 第一行）：L1 启停 / 同步态 / bank·fact 计数 / 警告数。
 * 口径：synced 判据 = activeOps === 0（scout 主判据）；sync_status 取不到（null）=「同步状态未知」
 * 如实呈现，绝不编造值；bank 计数只汇总官方 fact_count 字段（缺=0）。
 * 返回 [{key,label,tone}]，tone ∈ ok/off/warn/busy/info。
 */
export function statusBadges(status) {
  const s = status ?? {}
  const badges = []
  badges.push(
    s.enabled === true
      ? { key: 'l1-on', label: 'L1 同步已启用', tone: 'ok' }
      : s.enabled === false
        ? { key: 'l1-off', label: 'L1 同步已停用', tone: 'off' }
        : { key: 'l1-unknown', label: 'L1 状态未知', tone: 'warn' },
  )
  const ss = s.sync_status ?? null
  if (ss === null) {
    badges.push({ key: 'sync-unknown', label: '同步状态未知', tone: 'warn' })
  } else if (ss.synced === true) {
    badges.push({ key: 'sync-synced', label: '已同步', tone: 'ok' })
  } else if (Number.isFinite(ss.activeOps) && ss.activeOps > 0) {
    badges.push({ key: 'sync-active', label: `同步中（${ss.activeOps} 进行中）`, tone: 'busy' })
  } else {
    badges.push({ key: 'sync-pending', label: '未同步', tone: 'warn' })
  }
  const banks = Array.isArray(s.banks) ? s.banks : []
  const facts = banks.reduce((n, b) => n + (Number.isFinite(b?.fact_count) ? b.fact_count : 0), 0)
  badges.push({ key: 'banks', label: `bank ${banks.length} · fact ${facts}`, tone: 'info' })
  const warns = Array.isArray(s.warnings) ? s.warnings.length : 0
  if (warns > 0) badges.push({ key: 'warnings', label: `警告 ${warns}`, tone: 'warn' })
  return badges
}

/**
 * L2「记忆插件启停」只读展示模型（§4 第六行；写按钮后置不做——本波只展示）：
 * 读 diagnose.config.disabled（~/.hindsight/coding-agent.json 直读口径）三态：true/false/未知；
 * 「⏳ 待重启」徽标语义 = L2 写配置需重启 dsh 才生效（展示区常驻提示）。
 */
export function l2View(diagnose) {
  const cfg = diagnose?.config ?? null
  const disabled = cfg?.disabled ?? null
  const state = disabled === true ? 'disabled' : disabled === false ? 'enabled' : 'unknown'
  const stateLabel =
    state === 'disabled'
      ? '记忆插件已停用（disabled=true）'
      : state === 'enabled'
        ? '记忆插件运行中（disabled=false）'
        : '记忆插件状态未知（配置不可读或缺位）'
  return {
    state,
    stateLabel,
    badge: '⏳ 待重启',
    note: 'L2 写配置需重启 dsh 才生效（写按钮后置，本波只读展示）',
    configPath: cfg?.path ?? null,
    exists: cfg?.exists === true,
  }
}

/** 动作状态机（sync / toggle / time 三动作；.vue 只读渲染）：idle → running → done|error */
export const ACTIONS = ['sync', 'toggle', 'time']

function idleAction() {
  return { status: 'idle', message: '' }
}

export function initialActionState() {
  return { sync: idleAction(), toggle: idleAction(), time: idleAction() }
}

export function beginAction(state, kind) {
  return { ...state, [kind]: { ...state[kind], status: 'running', message: '执行中…' } }
}

/** 完成归位：ok=done / 否则 error；message 如实原文（note/错误信息，不吞不改写） */
export function finishAction(state, kind, result) {
  return {
    ...state,
    [kind]: { status: result?.ok === true ? 'done' : 'error', message: String(result?.message ?? '') },
  }
}
