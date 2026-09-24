// diagnose — kb-context 空态六态诊断（T7 + 调整轮：独立第六态 no-match 拆出，兑现验收 A4）：触发命中但检索零结果时给出可解释状态。
// 职责边界：六态判定（纯函数）+ 信号提取 + hint 构造 + 观察面收集（fs 在场性 + 只读库查询）；
// 检索归 lib/search.js（T3）、注入归 lib/inject.js（T5 缝 + T7 诊断消费）、索引构建归 lib/index-db.js（T2）
// ——本文件只读观察，不建库、不迁移、不跑 validateIndex 全量校验（读路径零副作用纪律）。
// ⚠️ 六态判据（确定性可测，A4 逐态有用例；优先级序 = 函数内判定顺序）：
//   ① excluded — query 词元落 scope.grepOnDemand 根且**无一**落 scope.indexAll（T6：grepOnDemand=注册不索引；
//      config scope 判、不依赖库健康——缺库也可判，建议动作是「用 wiki_read 直读」而非刷新）；
//   ② indexing — `${activePath}.candidate` 候选库在场 = 构建进行中（copy-on-write：构建收尾自会清场，
//      进程被杀留残留 → 下次 refresh 开场 drop 自愈；期间 docs 是旧版，一切库观察面让位）；
//   ③ failed — index 打开/校验失败：runSearch 捕获的 node:sqlite 错误（探针实证：坏库首查询抛
//      code='ERR_SQLITE_ERROR'/errcode 26 'file is not a database'、缺表 errcode 1）或调用方注入
//      problems 非空 / degraded（refresh summary 位，当前读路径不跑全量校验、留缝给后续接线）；
//   ④ no-text — 信号词元在 docs 有记录但该文档 chunk 全部空/仅空白（零 chunk 同判——空文件
//      chunkText('') = []、仅空白文件 trim 后无实字）；
//   ⑤ not-indexed — 结构性缺索引：范围内信号无 docs 记录（判据字面）/ 索引库不存在 / docs 零记录 /
//      观察面缺席但库在（防御兜底——docs 观察面不可用，无法证实「已入索引有文本」，不判 no-match）；
//   ⑥ no-match（调整轮拆态，审前裁定① 2026-09-25）— **索引健康**（openDb 成功、无 openError/problems/
//      degraded）且 docs 观察面在场证实：索引非空、范围内路径信号全有记录且非空白——此时零命中的唯一
//      解释 = 词面未命中。**不并入 not-indexed**（错标：文件可能已被索引）。hint 给「改写关键词/确认主题在库」。
// ⚠️ 优先级（裁定 2026-09-25 更新）：excluded > indexing > failed > no-text > not-indexed > no-match。
//   excluded 最具体（等构建/修库都救不了 grep 目录）；indexing 压 failed（copy-on-write 构建正是在修坏库，
//   「稍候」比「重建」可行动）；failed 压一切库观察面（打不开就没资格读 docs）；no-text 比缺记录更具体；
//   no-match **垫底（第六位）**——它要求前五态全部不成立：任何结构性原因（缺库/缺文件/空文件/坏库/排除域）
//   都比「检索系统一切正常、查询词没对上」更具体、更可行动。
// ⚠️ hint 纪律：≤200 字符（EMPTY_STATE_HINT_MAX）+ 状态解释 + 建议动作；超长详情/信号 clip 后仍整体钳制。
// ⚠️ normalizeEmptyState 是「wiki_search emptyState 软增、旧调用不破」的第一道闸：坏 state/坏 hint 一律丢弃，
//   inject 零命中缝与 tools 执行层共用——消费侧永远只见合法六态。
import fs from 'node:fs'

/** 六态枚举（delta-spec 裁定口径字面 + 调整轮 no-match） */
export const EMPTY_STATES = Object.freeze(['not-indexed', 'indexing', 'failed', 'excluded', 'no-text', 'no-match'])

/** hint 上限（裁定：≤200 字符） */
export const EMPTY_STATE_HINT_MAX = 200

// 详情/信号进 hint 的展示长度（与总预算 200 协同钳制）
const DETAIL_CLIP = 60
const SIG_CLIP = 40

/** hint 终钳（任何构造路径的最后一道 200 闸） */
function clampHint(hint) {
  return String(hint).slice(0, EMPTY_STATE_HINT_MAX)
}

function clip(s, max) {
  const t = String(s)
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

/**
 * 索引健康面错误（failed 判据的读路径形态）：node:sqlite 抛错（code='ERR_SQLITE_ERROR' 或数值 errcode）。
 * 普通异常/deadline 错误不误判——前者原样上抛走 fail-open（T3 契约），后者走 timeout 语义。
 */
export function isIndexHealthError(e) {
  if (e === null || typeof e !== 'object') return false
  return e.code === 'ERR_SQLITE_ERROR' || typeof e.errcode === 'number'
}

// 尾部句读剥离（trigger.stripTrailPunct 同族口径 + 引号）：'wiki/cost.md，' → 'wiki/cost.md'
const TRAIL_PUNCT = /[)\]}>,.;:!?"'，。、；：！？）】》」』“”‘’]+$/u

function normalizeSignal(raw) {
  let s = String(raw).replace(TRAIL_PUNCT, '')
  s = s.replace(/^(\.\/)+/, '')
  return s
}

function normRoots(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((r) => typeof r === 'string' && r !== '')
    .map((r) => normalizeSignal(r).replace(/\/+$/, ''))
    .filter(Boolean)
}

function underRoot(sig, root) {
  return sig === root || sig.startsWith(`${root}/`)
}

/**
 * query 信号提取（确定性）：空白切词 → 尾部句读剥离 + ./ 归一 → 按 scope 分类，普通词丢弃。
 * kind：'index'=落 scope.indexAll 根｜'grep'=落 scope.grepOnDemand 根｜'other'=路径形（含 '/' 或 .md 结尾）
 *   但不落任何已知根（docs 查找候选）。保 query 出现序、同词元去重（首见 kind 定终身）。
 * @returns {Array<{sig: string, kind: 'index'|'grep'|'other'}>}
 */
export function classifySignals(query, scope = {}) {
  const idxRoots = normRoots(scope.indexAll)
  const grepRoots = normRoots(scope.grepOnDemand)
  const tokens = String(query ?? '').trim().split(/\s+/).filter(Boolean)
  const seen = new Set()
  const out = []
  for (const raw of tokens) {
    const sig = normalizeSignal(raw)
    if (sig === '' || seen.has(sig)) continue
    seen.add(sig)
    let kind = null
    if (idxRoots.some((r) => underRoot(sig, r))) kind = 'index'
    else if (grepRoots.some((r) => underRoot(sig, r))) kind = 'grep'
    else if (sig.includes('/') || /\.md$/i.test(sig)) kind = 'other'
    if (kind !== null) out.push({ sig, kind })
  }
  return out
}

/**
 * 六态判定（纯函数，永远返回 {state, hint}——绝不抛、绝不 null：词面未命中由 no-match 承载、
 * 观察面缺席由 not-indexed 防御兜底）。
 * @param {string} query 零命中检索词（trigger 剥离后的 t.query）
 * @param {{
 *   scope?: {indexAll?: string[], grepOnDemand?: string[]},
 *   candidateExists?: boolean, activeExists?: boolean,
 *   openError?: string|null, problems?: string[], degraded?: string|null,
 *   docs?: {count: number, find: (sig: string) => ({path: string, blank: boolean}|null)}|null,
 * }} obs 观察面（collector 采集或调用方注入；docs=null 表示库观察面不可用）
 */
export function diagnoseEmptyState(query, obs = {}) {
  const scope = obs.scope ?? {}
  const signals = classifySignals(query, scope)

  // ① excluded：只落 grepOnDemand、无一落 indexAll（config 判，库缺席不减损）
  const hasIndexSignal = signals.some((s) => s.kind === 'index')
  const grepSig = signals.find((s) => s.kind === 'grep')
  if (grepSig !== undefined && !hasIndexSignal) {
    return {
      state: 'excluded',
      hint: clampHint(`查询目标「${clip(grepSig.sig, SIG_CLIP)}」属 grepOnDemand 按需范围（只注册不入 FTS 索引）。建议用 wiki_read 按路径直读。`),
    }
  }

  // ② indexing：候选库在场 = 构建进行中（旧 docs 不可信，一切库观察面让位）
  if (obs.candidateExists === true) {
    return { state: 'indexing', hint: clampHint('索引构建进行中（检测到候选库 active.db.candidate），稍候重试。') }
  }

  // ③ failed：打开/校验失败（读路径 sqlite 错误 → openError；problems/degraded = refresh summary 注入位）
  let detail = null
  if (typeof obs.openError === 'string' && obs.openError !== '') detail = obs.openError
  else if (Array.isArray(obs.problems) && obs.problems.length > 0) detail = String(obs.problems[0])
  else if (typeof obs.degraded === 'string' && obs.degraded !== '') detail = `degraded:${obs.degraded}`
  if (detail !== null) {
    return {
      state: 'failed',
      hint: clampHint(`索引库打开/校验失败：${clip(detail, DETAIL_CLIP)}。建议重建索引（运行索引刷新）。`),
    }
  }

  // ④/⑤ 需要 docs 观察面（库不可用 → ⑤ 缺库变体）
  if (obs.docs) {
    // ④ no-text：首个解析到且空白的记录立即判（具体性优先于缺记录）
    for (const s of signals) {
      if (s.kind === 'grep') continue // grep 信号在①已返回；防御跳过
      const rec = obs.docs.find(s.sig)
      if (rec && rec.blank) {
        return {
          state: 'no-text',
          hint: clampHint(`文件「${clip(rec.path, SIG_CLIP)}」已入索引但无可用文本（内容为空/仅空白）。建议补充正文后刷新索引。`),
        }
      }
    }
    // ⑤-a 索引库为空（全局比单路径更根本——空库解释一切缺记录）
    if (obs.docs.count === 0) {
      return { state: 'not-indexed', hint: clampHint('索引库为空（无已索引文件）。建议运行索引刷新。') }
    }
    // ⑤-b 路径在 scope 内但 docs 无此文件记录（判据字面）
    const missing = signals.find((s) => s.kind === 'index' && obs.docs.find(s.sig) == null)
    if (missing !== undefined) {
      return {
        state: 'not-indexed',
        hint: clampHint(`路径「${clip(missing.sig, SIG_CLIP)}」在索引范围内但未入索引。建议运行索引刷新。`),
      }
    }
    // ⑥ no-match（调整轮拆态，审前裁定①）：走到这里 = 索引健康（③ 无 openError/problems/degraded 已过）
    //   + docs 在场证实非空、范围内路径全有记录非空白——词面未命中的终局解释（优先级垫底）
    return {
      state: 'no-match',
      hint: clampHint('索引健康但查询词未命中。可改写关键词重试，或确认目标主题确在库中。'),
    }
  }

  // ⑤-c 索引库不存在
  if (obs.activeExists === false) {
    return { state: 'not-indexed', hint: clampHint('索引库不存在（尚未构建）。建议运行索引刷新。') }
  }
  // ⑤-d 观察面缺席但库在（防御兜底，生产不可达）：docs 观察面不可用 → 无法证实「已入索引有文本」，
  //   不满足 no-match 判据前提，保持 not-indexed（刷新建议无害）
  return {
    state: 'not-indexed',
    hint: clampHint('诊断观察面缺席（库在场但未读取 docs）；查询词未命中。建议运行索引刷新。'),
  }
}

/**
 * emptyState 软校验（消费侧唯一入口）：state ∈ 六态 且 hint 非空串 → 规范化（hint 钳 200）；否则 null。
 * wiki_search 旧调用/坏缝产物不破：非法值直接丢弃，消费侧按「无 emptyState」处理。
 */
export function normalizeEmptyState(raw) {
  if (raw === null || typeof raw !== 'object') return null
  if (!EMPTY_STATES.includes(raw.state)) return null
  if (typeof raw.hint !== 'string' || raw.hint === '') return null
  return { state: raw.state, hint: raw.hint.slice(0, EMPTY_STATE_HINT_MAX) }
}

/**
 * 观察面采集（只读，绝不抛）：fs 在场性 + 传入 handle 的 docs/chunks 查询 + diagnoseEmptyState。
 * - db handle 由调用方（runSearch）持有传入——本函数不打开库、不建库、零副作用；
 * - docs 观察面中途炸（半坏 handle）→ 收敛 openError → failed，异常不出函数边界。
 * @param {{dbPath: string, query: string, scope?: object, db?: object|null,
 *          openError?: string|null, problems?: string[], degraded?: string|null}} opts
 * @returns {{state: string, hint: string}}
 */
export function collectEmptyState(opts = {}) {
  const dbPath = typeof opts.dbPath === 'string' ? opts.dbPath : ''
  let candidateExists = false
  let activeExists = false
  try {
    if (dbPath !== '') {
      candidateExists = fs.existsSync(`${dbPath}.candidate`)
      activeExists = fs.existsSync(dbPath)
    }
  } catch { /* fs 层异常按缺席计（观察面尽力而为） */ }
  let openError = typeof opts.openError === 'string' && opts.openError !== '' ? opts.openError : null
  const problems = Array.isArray(opts.problems) ? opts.problems : []
  const degraded = typeof opts.degraded === 'string' && opts.degraded !== '' ? opts.degraded : null

  // docs 观察面（懒加载 + 每文档 memo）：路径清单精确/后缀两级匹配，空白判定按 doc 扫 chunk 全文 trim
  //（SQLite trim 只去空格字符，'\t\n' 要 JS trim——仅对解析到的单文档扫描，有界）
  let docs = null
  const db = opts.db ?? null
  if (db !== null) {
    try {
      let paths = null
      const loadPaths = () => {
        if (paths === null) paths = db.prepare('SELECT path FROM docs ORDER BY path').all().map((r) => r.path)
        return paths
      }
      const blanks = new Map()
      const blankOf = (p) => {
        if (!blanks.has(p)) {
          const row = db.prepare('SELECT id FROM docs WHERE path = ?').get(p)
          const chunks = row === undefined ? [] : db.prepare('SELECT content FROM chunks WHERE doc_id = ?').all(row.id)
          blanks.set(p, chunks.every((c) => String(c?.content ?? '').trim() === ''))
        }
        return blanks.get(p)
      }
      docs = {
        get count() { return loadPaths().length },
        find(sig) {
          const ps = loadPaths()
          const p = ps.find((x) => x === sig) ?? ps.find((x) => x.endsWith(`/${sig}`))
          return p === undefined ? null : { path: p, blank: blankOf(p) }
        },
      }
    } catch (e) {
      docs = null
      openError = openError ?? String(e?.message ?? e)
    }
  }

  const obs = { scope: opts.scope ?? {}, candidateExists, activeExists, openError, problems, degraded, docs }
  try {
    return diagnoseEmptyState(opts.query, obs)
  } catch (e) {
    // docs 观察面中途炸（半坏 handle）→ 收敛 failed，诊断绝不破坏检索主链路
    return diagnoseEmptyState(opts.query, { ...obs, docs: null, openError: openError ?? String(e?.message ?? e) })
  }
}
