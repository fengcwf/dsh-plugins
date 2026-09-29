// dsh-rtk-kit/lib/doctor.js —— 健康检查共享引擎（纯函数 + 异步 execFile 封装）
// 依据：changes/20260929-phase0/TECH.md ADR-003（零污染法）/ ADR-004（异步 execFile 5s 超时）；
//      数据形照 changes/20260929-phase0/proposal.md §4（版本=版本号+路径+可参性；
//      统计=summary 指标对象 + daily/weekly/monthly 周期序列；健康=七项 {id,label,status,detail}）。
// 供 lib/doctor-routes.js（Task 6）与 rtk_doctor 工具（Task 8）单源复用；逻辑与展示分离、逐函数可单测。
// 安全红线（INV-7）：argv 只经 buildArgv 白名单构造——零 --reset、零 rtk run、零用户输入拼接；
// 健康检查零污染（INV-4）：不跑样本命令（rtk 透传执行会写统计库 +1），压缩生效走 history.db 只读查询。
// 执行红线（INV-5）：全层异步 execFile，禁 spawnSync（不阻塞 dsh 宿主）。

import os from 'node:os'
import path from 'node:path'
import { execFile as cpExecFile } from 'node:child_process'
import { decideEligibility, isSafeRewrite, pickRewritten, planRewrite } from './rewrite.js'

/** 默认执行超时（INV-5：三动作 5s 有界）。 */
export const DEFAULT_TIMEOUT_MS = 5000

/** rtk 缺失时的安装提示（US-1 降级显示）。 */
export const INSTALL_HINT =
  '安装：brew install rtk / curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh'

/** 版本行判定（scout-1 §任务4 检查点2：/^rtk x.y.z/）。 */
export const VERSION_RE = /^rtk (\d+\.\d+\.\d+)/

/** rewrite 缝探针固定输入（非透传执行：`rtk rewrite` 只改写字符串不执行命令）。 */
export const REWRITE_PROBE_COMMAND = 'git status'

// ───────────────────────── argv 白名单（INV-7） ─────────────────────────
// 只认 --version / gain / rewrite / config 四种固定形；action 键必须精确命中，其余一律拒绝。
// 用 null 原型对象 + Object.hasOwn 双保险：杜绝 'constructor'/'__proto__' 等原型链键穿透。
const ARGV_WHITELIST = Object.freeze(
  Object.assign(Object.create(null), {
    version: Object.freeze(['--version']),
    gain: Object.freeze(['gain', '-a', '-f', 'json']),
    rewrite: Object.freeze(['rewrite', REWRITE_PROBE_COMMAND]),
    config: Object.freeze(['config']),
  }),
)

/**
 * argv 白名单构造：只对四个白名单动作返回固定 argv，其余动作一律拒绝（抛错）。
 * @param {string} action - 'version' | 'gain' | 'rewrite' | 'config'
 * @param {string} [rtkBin='rtk'] - rtk 二进制（照 config.rtkBin 语义经参数传入，不硬编码）
 * @returns {string[]} 完整 argv（argv[0]=二进制，形同 ADR-004 execFile(argv[0], argv.slice(1))）
 */
export function buildArgv(action, rtkBin = 'rtk') {
  if (typeof rtkBin !== 'string' || rtkBin === '') {
    throw new TypeError('buildArgv: rtkBin 必须是非空字符串')
  }
  if (typeof action !== 'string' || !Object.hasOwn(ARGV_WHITELIST, action)) {
    throw new Error(`buildArgv: argv 白名单拒绝动作 ${JSON.stringify(action)}`)
  }
  return [rtkBin, ...ARGV_WHITELIST[action]]
}

// ───────────────────────── 异步 execFile 封装（ADR-004） ─────────────────────────

/** 构造带错误类别的 reject（错误码族照 API 合约：RTK_TIMEOUT / RTK_UNAVAILABLE / RTK_ERROR）。 */
function rtKError(code, message, cause) {
  const err = new Error(message)
  err.code = code
  if (cause !== undefined) err.cause = cause
  return err
}

/**
 * 默认 execFile 缝（照 wiki-steward/lib/ingest-trigger.js 形）：
 * 非零退出也 resolve {code,stdout,stderr}；spawn 级失败/超时才 reject（原始 err）。
 */
function defaultExecFile(file, args, opts) {
  return new Promise((resolve, reject) => {
    cpExecFile(file, args, { encoding: 'utf8', ...opts }, (err, stdout, stderr) => {
      if (err && typeof err.code !== 'number') return reject(err)
      resolve({ code: err ? err.code : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
  })
}

/** 超时/被杀判定（execFile 超时会 SIGTERM 杀子进程：killed=true / signal / ETIMEDOUT）。 */
function isTimeoutLike(err) {
  return err?.killed === true || err?.signal != null || err?.code === 'ETIMEDOUT'
}

/**
 * 执行一条白名单 argv（异步、有界超时、禁 spawnSync）。
 * @param {string[]} argv - 完整 argv（argv[0]=二进制，建议来自 buildArgv）
 * @param {{timeoutMs?: number, exec?: Function}} [opts] - exec 为注入执行器（测试用假 execFile）
 * @returns {Promise<{code:number, stdout:string, stderr:string}>} 非零退出也 resolve
 * @throws {Error & {code:'RTK_TIMEOUT'|'RTK_UNAVAILABLE'}} 超时归 RTK_TIMEOUT、spawn 级失败归 RTK_UNAVAILABLE
 */
export async function execRtk(argv, opts = {}) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((s) => typeof s !== 'string')) {
    throw new TypeError('execRtk: argv 必须是非空字符串数组')
  }
  const { timeoutMs = DEFAULT_TIMEOUT_MS, exec = defaultExecFile } = opts
  try {
    // ADR-004 形：execFile(argv[0], argv.slice(1), {timeout})；argv 全量数组直传，无 shell 拼接
    return await exec(argv[0], argv.slice(1), { timeout: timeoutMs })
  } catch (err) {
    if (isTimeoutLike(err)) throw rtKError('RTK_TIMEOUT', `rtk 执行超时（${timeoutMs}ms）`, err)
    throw rtKError('RTK_UNAVAILABLE', `rtk 执行失败（spawn 级）：${String(err?.code ?? err?.message ?? err)}`, err)
  }
}

// ───────────────────────── 三动作之 version / gain（proposal.md §4） ─────────────────────────

/** 数值容错（R-3）：非有限数一律 null，供展示层显示占位。 */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** 字符串容错（R-3）。 */
const str = (v) => (typeof v === 'string' ? v : null)

const SUMMARY_METRICS = [
  'total_commands', 'total_input', 'total_output', 'total_saved',
  'avg_savings_pct', 'total_time_ms', 'avg_time_ms',
]
const SERIES_METRICS = [
  'commands', 'input_tokens', 'output_tokens', 'saved_tokens',
  'savings_pct', 'total_time_ms', 'avg_time_ms',
]

function pickMetrics(row, keys) {
  const out = {}
  for (const k of keys) out[k] = num(row?.[k])
  return out
}

function pickSeries(rows, periodKeys) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : []
  return list.map((row) => {
    const out = {}
    for (const k of periodKeys) out[k] = str(row[k])
    return Object.assign(out, pickMetrics(row, SERIES_METRICS))
  })
}

/** 归一 gain JSON → {summary, daily, weekly, monthly}；缺失字段回 null / 空数组（R-3）。 */
function normalizeGain(raw) {
  const s = raw?.summary && typeof raw.summary === 'object' ? raw.summary : {}
  return {
    summary: pickMetrics(s, SUMMARY_METRICS),
    daily: pickSeries(raw?.daily, ['date']),
    weekly: pickSeries(raw?.weekly, ['week_start', 'week_end']),
    monthly: pickSeries(raw?.monthly, ['month']),
  }
}

/** 解析 `rtk gain -a -f json` 输出；JSON 坏 → 抛 RTK_ERROR（供路由映射信封）。 */
export function parseGain(text) {
  let raw
  try {
    raw = JSON.parse(String(text ?? ''))
  } catch (err) {
    throw rtKError('RTK_ERROR', 'rtk gain 输出不是合法 JSON', err)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw rtKError('RTK_ERROR', 'rtk gain JSON 不是对象')
  }
  return normalizeGain(raw)
}

/**
 * 版本检查：rtk 缺失（spawn 级失败）降级为 available:false + 安装提示（US-1）；
 * 超时如实上抛 RTK_TIMEOUT 供 UI 重试（INV-5）。
 * @returns {Promise<{available:boolean, version:string|null, path:string, hint:string|null}>}
 */
export async function getVersion(opts = {}) {
  const rtkBin = opts.rtkBin ?? 'rtk'
  try {
    const r = await execRtk(buildArgv('version', rtkBin), { timeoutMs: opts.timeoutMs, exec: opts.exec })
    const m = String(r.stdout ?? '').trim().match(VERSION_RE)
    return { available: true, version: m ? m[1] : null, path: rtkBin, hint: null }
  } catch (err) {
    if (err?.code === 'RTK_UNAVAILABLE') {
      return { available: false, version: null, path: rtkBin, hint: INSTALL_HINT }
    }
    throw err
  }
}

/**
 * 统计（全局口径）：`rtk gain -a -f json` 一次取全量 → summary + daily/weekly/monthly 序列。
 * @returns {Promise<{summary:object, daily:object[], weekly:object[], monthly:object[]}>}
 */
export async function getGain(opts = {}) {
  const rtkBin = opts.rtkBin ?? 'rtk'
  const r = await execRtk(buildArgv('gain', rtkBin), { timeoutMs: opts.timeoutMs, exec: opts.exec })
  return parseGain(r.stdout)
}

// ───────────────────────── 健康七项（INV-4 零污染法） ─────────────────────────

/** 七项检查定义（顺序即展示顺序，照 INV-4 名单）。 */
export const HEALTH_ITEMS = Object.freeze([
  Object.freeze({ id: 'binary-exec', label: '二进制可执行' }),
  Object.freeze({ id: 'version-parse', label: '版本可解析' }),
  Object.freeze({ id: 'rewrite-seam', label: 'rewrite 缝生效' }),
  Object.freeze({ id: 'guard-matrix', label: '守卫矩阵健全' }),
  Object.freeze({ id: 'fail-open', label: 'fail-open 链路' }),
  Object.freeze({ id: 'gain-source', label: '统计源可用' }),
  Object.freeze({ id: 'compression-effective', label: '压缩生效' }),
])
const HEALTH_BY_ID = new Map(HEALTH_ITEMS.map((e) => [e.id, e]))

const item = (meta, status, detail) => ({ id: meta.id, label: meta.label, status, detail })
const brief = (s, n = 80) => {
  const t = String(s)
  return t.length > n ? `${t.slice(0, n)}…` : t
}
const failDetail = (err) => `${err?.code ?? 'ERR'}：${String(err?.message ?? err)}`

/** 纯函数用例组判定（守卫矩阵 / fail-open 链路自检）。 */
function runPureCases(meta, cases, okSuffix) {
  const failed = []
  for (const [name, fn] of cases) {
    let ok = false
    try {
      ok = fn() === true
    } catch {
      ok = false
    }
    if (!ok) failed.push(name)
  }
  return failed.length === 0
    ? item(meta, 'pass', `${cases.length}/${cases.length} ${okSuffix}`)
    : item(meta, 'fail', `失败用例：${failed.join('、')}`)
}

/** ① 二进制可执行：spawn 级成功即 pass（rc 不作数）。 */
export async function checkBinaryExec(opts = {}) {
  const meta = HEALTH_BY_ID.get('binary-exec')
  try {
    const r = await execRtk(buildArgv('version', opts.rtkBin ?? 'rtk'), { timeoutMs: opts.timeoutMs, exec: opts.exec })
    return item(meta, 'pass', `spawn 成功（exit ${r.code}）`)
  } catch (err) {
    return item(meta, 'fail', failDetail(err))
  }
}

/** ② 版本可解析：stdout 首行命中 /^rtk x.y.z/。 */
export async function checkVersionParse(opts = {}) {
  const meta = HEALTH_BY_ID.get('version-parse')
  try {
    const r = await execRtk(buildArgv('version', opts.rtkBin ?? 'rtk'), { timeoutMs: opts.timeoutMs, exec: opts.exec })
    const first = String(r.stdout ?? '').split('\n').map((s) => s.trim()).find((s) => s.length > 0) ?? ''
    const m = first.match(VERSION_RE)
    return m ? item(meta, 'pass', `版本 ${m[1]}`) : item(meta, 'fail', `stdout 不符 /^rtk x.y.z/ 形：「${brief(first)}」`)
  } catch (err) {
    return item(meta, 'fail', failDetail(err))
  }
}

/**
 * ③ rewrite 缝生效：`rtk rewrite` 固定探针（非透传，不执行样本命令），
 * 只认「非空 stdout 且 ^rtk 前缀」，不信 rc（0.49.0 成功码=3）。
 */
export async function checkRewriteSeam(opts = {}) {
  const meta = HEALTH_BY_ID.get('rewrite-seam')
  try {
    const r = await execRtk(buildArgv('rewrite', opts.rtkBin ?? 'rtk'), { timeoutMs: opts.timeoutMs, exec: opts.exec })
    const line = pickRewritten(r.stdout)
    const ok = typeof line === 'string' && /^\s*rtk(\s|$)/.test(line)
    return ok
      ? item(meta, 'pass', `改写输出有效（rc=${r.code} 不作数）：「${brief(line)}」`)
      : item(meta, 'fail', `stdout 非「rtk 」前缀形（rc=${r.code} 不作数）：「${brief(line ?? '')}」`)
  } catch (err) {
    return item(meta, 'fail', failDetail(err))
  }
}

/** ④ 守卫矩阵健全：rewrite.js 三重守卫纯函数判定（零执行）。 */
const GUARD_CASES = [
  ['简单命令放行', () => decideEligibility('git status').eligible === true],
  ['保守模式拦截 shell 元字符', () => decideEligibility('git log | head').reason === 'shell-metachar'],
  ['拦截凭据命令', () => decideEligibility('echo $GITHUB_TOKEN').reason === 'credential-bearing'],
  ['已含 rtk 不重复改写', () => decideEligibility('rtk git status').reason === 'already-rtk'],
  ['安全改写须 rtk 前缀', () => isSafeRewrite('git status', 'rtk git status') === true],
  ['拒绝非 rtk 前缀改写', () => isSafeRewrite('git status', 'rm -rf /') === false],
  ['拒绝换行注入改写', () => isSafeRewrite('git status', 'rtk git status\nrm -rf /') === false],
]
export function checkGuardMatrix() {
  return runPureCases(HEALTH_BY_ID.get('guard-matrix'), GUARD_CASES, '守卫用例通过')
}

/** ⑤ fail-open 链路：任何失败（空输出/不安全/不合格）都恒等放行，正常改写才生效（零执行）。 */
const FAIL_OPEN_CASES = [
  ['空输出恒等放行', () => planRewrite('git status', '').action === 'passthrough'],
  ['无输出恒等放行', () => planRewrite('git status', undefined).action === 'passthrough'],
  ['不安全改写恒等放行', () => planRewrite('git status', 'rm -rf /').action === 'passthrough'],
  ['不合格命令恒等放行', () => planRewrite('ls | wc', 'rtk ls').action === 'passthrough'],
  ['正常改写生效', () => planRewrite('git status', 'rtk git status').action === 'rewrite'],
]
export function checkFailOpen() {
  return runPureCases(HEALTH_BY_ID.get('fail-open'), FAIL_OPEN_CASES, 'fail-open 用例通过')
}

/** ⑥ 统计源可用：`rtk gain -a -f json` 可解析且 summary 指标在场（gain 不写库，零污染）。 */
export async function checkGainSource(opts = {}) {
  const meta = HEALTH_BY_ID.get('gain-source')
  try {
    const g = await getGain(opts)
    const have = Object.values(g.summary).some((v) => v !== null)
    return have
      ? item(meta, 'pass', 'gain -a -f json 可解析（summary 在场）')
      : item(meta, 'fail', 'gain JSON 无 summary 指标（缺失字段全 null）')
  } catch (err) {
    return item(meta, 'fail', failDetail(err))
  }
}

/**
 * 默认 history.db 只读读取器（零污染：readOnly 打开，永不写库）。
 * 列名以 PRAGMA table_info 探测；缺表/缺列/读失败抛错，由检查项如实回显（R-1）。
 */
export function defaultHistoryReader(opts = {}) {
  const dbPath = opts.historyDb ?? path.join(os.homedir(), '.local', 'share', 'rtk', 'history.db')
  return async function readHistory({ since } = {}) {
    // 惰性加载 node:sqlite：避免插件装载期的 experimental 警告噪声
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
      const cols = db.prepare('PRAGMA table_info(commands)').all().map((c) => c.name)
      if (cols.length === 0) throw new Error('history.db 缺表 commands')
      const missing = ['timestamp', 'savings_pct'].filter((c) => !cols.includes(c))
      if (missing.length > 0) throw new Error(`history.db 缺列：${missing.join('、')}`)
      const row = db
        .prepare(
          'SELECT COUNT(*) AS count, AVG(savings_pct) AS avg_savings FROM commands WHERE datetime(timestamp) >= datetime(?)',
        )
        .get(String(since))
      return {
        count: Number(row?.count ?? 0),
        avgSavingsPct: row?.avg_savings == null ? null : Number(row.avg_savings),
      }
    } finally {
      db.close()
    }
  }
}

/** ⑦ 压缩生效（零污染法，scout-1 §任务4 检查点7）：近 30 天 AVG(savings_pct)>0 且 COUNT>0。 */
export async function checkCompressionEffective(opts = {}) {
  const meta = HEALTH_BY_ID.get('compression-effective')
  const now = typeof opts.now === 'function' ? opts.now : () => new Date()
  try {
    const since = new Date(now().getTime() - 30 * 24 * 3600 * 1000).toISOString()
    const read = typeof opts.readHistory === 'function' ? opts.readHistory : defaultHistoryReader({ historyDb: opts.historyDb })
    const { count, avgSavingsPct } = await read({ since, historyDb: opts.historyDb })
    if (!(Number(count) > 0)) return item(meta, 'fail', `近 30 天无命令记录（COUNT=${Number(count) || 0}）`)
    if (!(avgSavingsPct > 0)) return item(meta, 'fail', `近 30 天 AVG(savings_pct)=${avgSavingsPct ?? 'null'}（须 >0）`)
    return item(meta, 'pass', `近 30 天 COUNT=${count}、AVG(savings_pct)=${avgSavingsPct}`)
  } catch (err) {
    return item(meta, 'fail', `history.db 读取失败：${String(err?.message ?? err)}`)
  }
}

// ───────────────────────── 三动作之 health ─────────────────────────
const HEALTH_RUNNERS = {
  'binary-exec': checkBinaryExec,
  'version-parse': checkVersionParse,
  'rewrite-seam': checkRewriteSeam,
  'guard-matrix': checkGuardMatrix,
  'fail-open': checkFailOpen,
  'gain-source': checkGainSource,
  'compression-effective': checkCompressionEffective,
}

/**
 * 健康检查：七项结果数组（定序），逐项 {id,label,status:pass|fail,detail}；
 * fail-open——任何一项异常都回 fail 如实回显，绝不抛错。
 */
export async function getHealth(opts = {}) {
  return Promise.all(
    HEALTH_ITEMS.map(async (meta) => {
      try {
        return await HEALTH_RUNNERS[meta.id](opts)
      } catch (err) {
        return item(meta, 'fail', `检查异常：${String(err?.message ?? err)}`)
      }
    }),
  )
}

// ───────────────────────── rtk_doctor 工具执行体（Task 8 瘦身 / INV-6） ─────────────────────────

/**
 * rtk_doctor 轻诊断执行体（单源复用本模块 getVersion/getGain；lib/index.js 的工具 execute 薄包装调用本函数）。
 * 输出形：可用性/版本/配置恰三行（US-1：rtk 缺失=可用行 + 安装提示降级显示）；
 * gain 统计段受 `doctorGain && args.gain !== false` 门控，缺省不输出（INV-6 省 350-420 token/次；
 * 完整统计唯一入口=设置页面板）。零 spawnSync（INV-5）：执行全走 execRtk 异步封装修身后的共享函数。
 * @param {object} [args] - 工具参数 {gain?: boolean}
 * @param {object} [opts] - {rtkBin, exec, timeoutMs, doctorGain, autoRewrite, conservative, awareness}
 * @returns {Promise<{text: string}>}
 */
export async function runDoctorTool(args = {}, opts = {}) {
  const {
    rtkBin = 'rtk',
    exec,
    timeoutMs,
    doctorGain = false,
    autoRewrite = false,
    conservative = true,
    awareness = 'default',
  } = opts
  const lines = []
  const v = await getVersion({ rtkBin, exec, timeoutMs })
  lines.push(`rtk available: ${v.available ? 'yes' : 'no'} (bin: ${v.path})`)
  if (!v.available) {
    lines.push(INSTALL_HINT)
    return { text: lines.join('\n') }
  }
  lines.push(`version: ${v.version ?? '(unknown)'}`)
  lines.push(`auto-rewrite: ${autoRewrite ? 'on' : 'off'} | conservative: ${conservative} | awareness: ${awareness}`)
  if (doctorGain === true && args?.gain !== false) {
    // gain 段 fail-soft：统计源异常回 (no data yet)（与瘦身前降级形一致），绝不让诊断工具抛错
    let out = '(no data yet)'
    try {
      const g = await getGain({ rtkBin, exec, timeoutMs })
      out = JSON.stringify(g.summary) || '(no data yet)'
    } catch {
      /* 统计源不可用 → 占位回显 */
    }
    lines.push('', '--- rtk gain (summary) ---', out)
  }
  return { text: lines.join('\n') }
}
