// hindsight-routes — Hindsight 数据面（2026-10-07 波 U2/U3；单 prefix /api/wiki-steward 内部分发的 hindsight/* 族）：
//   GET  /api/wiki-steward/hindsight/status     状态分析（hindsight_diagnose / hindsight_sync_status 口径聚合）
//   POST /api/wiki-steward/hindsight/sync       手动同步（detached 不阻塞请求，回执 started/reason/note）
//   GET  /api/wiki-steward/hindsight/sync-log   同步日历数据源（?since&until=YYYY-MM-DD，非法参 400）
//   POST /api/wiki-steward/hindsight/toggle     L1 启停写面（走 settings 同一持久化机制=applyPatch 缝）
// API 形与鉴权缝与 ingest-routes 同款：成功 {data}、失败 {error:{code,message}}，每条 handler 第一行过
// authGate（connection.requestRejection）+ methodGuard。控制面逻辑（createSyncStarter）与采集面
// （collectStatus / readDiagnoseConfig）为真实现；I/O 边界（fetch/文件/configEditor）经缝注入。
// 口径纪律（侦察 A 卡#7「勿自造字段名」）：diagnose.config 与 sync_status 段只用官方字段名——
// 取不到的字段不编造（缺省不列）；synced 判据=scout 主判据（operations 中 status∈{pending,processing}==0）。
import fs from 'node:fs'
import path from 'node:path'
import { sendJson, fail, authGate, methodGuard, readJsonBody, queryOf, pathnameOf, API_PREFIX } from './ingest-routes.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * diagnose.config 口径直读（官方字段名：path/exists/api_url/api_token_configured/disabled）。
 * 文件缺失/坏形：exists:false 其余 null（如实不编造）。
 */
export function readDiagnoseConfig({ home }) {
  const configPath = path.join(String(home), '.hindsight', 'coding-agent.json')
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return {
      path: configPath,
      exists: true,
      api_url: raw?.api_url ?? raw?.apiUrl ?? null,
      api_token_configured: Boolean(raw?.api_token ?? raw?.apiToken),
      disabled: raw?.disabled === true,
    }
  } catch {
    return { path: configPath, exists: false, api_url: null, api_token_configured: null, disabled: null }
  }
}

async function jsonGet(fetchImpl, url, timeoutMs) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res || res.ok !== true) throw new Error(`hindsight-routes HTTP ${res?.status ?? 0}：${url}`)
  return res.json()
}

/**
 * 状态聚合（官方口径，勿自造字段名）：
 *   diagnose.config ← ~/.hindsight/coding-agent.json 直读
 *   banks[]         ← GET /v1/default/banks（官方字段 id/fact_count/last_write_at/created_at 原样，活值不缓存）
 *   activeOps/synced← GET /banks/{id}/operations（activeOps=status∈{pending,processing} 计数；
 *                     synced=activeOps===0——scout §主判据「判是否跑完最直接」）
 * 取不到的段如实进 warnings，绝不编造值（INV-15 禁静默但也不造数）。
 */
export async function collectStatus({ fetchImpl, apiUrl, home, timeoutMs = 30_000 }) {
  const warnings = []
  const diagnose = { config: readDiagnoseConfig({ home }) }
  const base = String(apiUrl).replace(/\/+$/, '')
  let bankRows = []
  try {
    const data = await jsonGet(fetchImpl, `${base}/v1/default/banks`, timeoutMs)
    const rows = Array.isArray(data) ? data : (data?.items ?? data?.banks ?? [])
    bankRows = rows.map((e) => ({
      id: String(e?.id ?? e?.bank_id ?? e?.bank ?? e?.name ?? ''),
      fact_count: e?.fact_count ?? null,
      last_write_at: e?.last_write_at ?? null,
      created_at: e?.created_at ?? null,
    })).filter((r) => r.id !== '')
  } catch (e) {
    warnings.push(`banks 清单获取失败：${(e && e.message) || e}`)
  }
  for (const row of bankRows) {
    try {
      const data = await jsonGet(fetchImpl, `${base}/v1/default/banks/${encodeURIComponent(row.id)}/operations`, timeoutMs)
      const list = Array.isArray(data) ? data : (data?.items ?? data?.operations ?? [])
      row.activeOps = list.filter((o) => o?.status === 'pending' || o?.status === 'processing').length
      row.synced = row.activeOps === 0
    } catch (e) {
      warnings.push(`operations 获取失败 bank=${row.id}：${(e && e.message) || e}`)
    }
  }
  const primary = bankRows[0] ?? null
  return {
    diagnose,
    sync_status: primary && primary.activeOps !== undefined
      ? { bank: primary.id, activeOps: primary.activeOps, synced: primary.synced }
      : null,
    banks: bankRows,
    warnings,
  }
}

/**
 * 手动同步触发器（detached 单飞）：L1 门禁（hindsight.enabled）+ running 旗（不重复触发）+
 * 引擎后台跑（fire-and-forget，绝不阻塞请求；结果由引擎落同步日志/告警）。
 * createEngine(cfg) 注入缝：生产=lib/hindsight-sync.js 真引擎；测试=假引擎（控制逻辑全真跑）。
 */
export function createSyncStarter({ getConfig, createEngine, warn = () => {} }) {
  let running = false
  return function startSync() {
    const cfg = getConfig()
    if (cfg?.hindsight?.enabled !== true) {
      return { started: false, reason: 'disabled', note: 'Hindsight 同步未启用（hindsight.enabled=false）——先在设置面开启 L1 开关' }
    }
    if (running) {
      return { started: false, reason: 'already-running', note: '同步进行中，本次不重复触发（detached 单飞）' }
    }
    running = true
    try {
      const engine = createEngine(cfg)
      // detached：syncAll 同步起跑即回执（不 await）；异常/完成都归 finally 清 running 旗
      Promise.resolve(engine.syncAll())
        .catch((e) => { warn(`[wiki-steward] Hindsight 同步异常（fail-open 留痕）：${(e && e.message) || e}`) })
        .finally(() => { running = false })
    } catch (e) {
      running = false
      warn(`[wiki-steward] Hindsight 同步启动失败：${(e && e.message) || e}`)
      return { started: false, reason: 'error', note: String((e && e.message) || e) }
    }
    return { started: true, reason: 'started', note: '同步已启动（detached）：机械转录落 raw/06-hindsight/，逐次记同步日志' }
  }
}

/** 同步日志读取（同步日历数据源）：jsonl 逐行；畸形行跳过计数如实（不静默）；文件缺=空 */
export function readSyncLogLines(logFile) {
  let text
  try {
    text = fs.readFileSync(logFile, 'utf8')
  } catch {
    return { lines: [], skipped: 0 }
  }
  const lines = []
  let skipped = 0
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue
    try {
      lines.push(JSON.parse(raw))
    } catch {
      skipped += 1
    }
  }
  return { lines, skipped }
}

/**
 * Hindsight 数据面 handler 集（单 prefix 内部分发的一段；返回 (req,res)=>handled）。
 * @param {object} deps
 * @param {{requestRejection: Function}} deps.connection 鉴权缝（ingest-routes 同款）
 * @param {()=>object} deps.getConfig 热改现读 config
 * @param {(patch:object)=>Promise<object>} [deps.applyPatch] settings 写缝（缺=toggle 503 如实）
 * @param {()=>{started:boolean,reason:string,note:string}} deps.startSync createSyncStarter 形
 * @param {()=>Promise<object>} deps.statusProbe 状态采集缝（生产=collectStatus 形；测试注入）
 * @param {string} deps.syncLogFile 同步日志文件（data/hindsight-sync-log.jsonl）
 * @param {(line:string)=>void} [deps.warn]
 */
export function createHindsightHandlers({ connection, getConfig, applyPatch = null, startSync, statusProbe, syncLogFile, warn = () => {} }) {
  // GET status —— 状态分析（diagnose/sync_status 口径聚合）+ 插件面（L1/定时配置现值）
  const statusGet = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['GET'])) return
    try {
      const st = await statusProbe()
      const cfg = getConfig()
      sendJson(res, 200, {
        data: {
          enabled: cfg?.hindsight?.enabled === true,
          schedule: cfg?.hindsight?.sync?.schedule ?? null,
          diagnose: st?.diagnose ?? null,
          sync_status: st?.sync_status ?? null,
          banks: Array.isArray(st?.banks) ? st.banks : [],
          warnings: Array.isArray(st?.warnings) ? st.warnings : [],
        },
      })
    } catch (e) {
      warn(`[wiki-steward] hindsight status 读取失败：${e?.message ?? e}`)
      fail(res, 500, 'internal', String(e?.message ?? e))
    }
  }

  // POST sync —— 手动同步（detached 不阻塞；回执 started/reason/note 三键，ingest/distill 同款形）
  const syncPost = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['POST'])) return
    try {
      const r = startSync()
      sendJson(res, 200, { data: { started: r.started, reason: r.reason, note: r.note } })
    } catch (e) {
      warn(`[wiki-steward] Hindsight 同步触发失败：${e?.message ?? e}`)
      fail(res, 500, 'internal', String(e?.message ?? e))
    }
  }

  // GET sync-log —— 同步日历数据源（?since&until=YYYY-MM-DD 闭区间；非法参 400 如实不静默放宽）
  const syncLogGet = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['GET'])) return
    const q = queryOf(req)
    const since = q.get('since') ?? ''
    const until = q.get('until') ?? ''
    for (const [name, v] of [['since', since], ['until', until]]) {
      if (v !== '' && !DATE_RE.test(v)) return fail(res, 400, 'bad_request', `${name} 须为 YYYY-MM-DD`)
    }
    if (since !== '' && until !== '' && since > until) {
      return fail(res, 400, 'bad_request', 'since 晚于 until（区间倒置）')
    }
    const { lines, skipped } = readSyncLogLines(syncLogFile)
    const filtered = lines.filter((l) => {
      const day = String(l?.ts ?? '').slice(0, 10)
      if (since !== '' && day < since) return false
      if (until !== '' && day > until) return false
      return true
    })
    sendJson(res, 200, { data: { lines: filtered, count: filtered.length, skipped } })
  }

  // POST toggle —— L1 启停写面（settings 持久化同一机制=applyPatch 白名单缝；roundtrip 回读一致）
  const togglePost = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['POST'])) return
    if (typeof applyPatch !== 'function') {
      return fail(res, 503, 'write_unavailable', '配置写入缝缺失（configEditor 服务未挂载；本部署暂只读）')
    }
    try {
      const body = await readJsonBody(req)
      if (typeof body?.enabled !== 'boolean') {
        return fail(res, 400, 'bad_request', 'enabled 须为布尔值')
      }
      const r = await applyPatch({ hindsight: { enabled: body.enabled } }) // applyPatch 收裸 patch（settingsPost 同款：body.patch 直传）
      if (!r?.ok) {
        const code = r?.code ?? 'internal'
        const status = code === 'not_editable' || code === 'bad_patch' || code === 'invalid' ? 400 : code === 'no_entry' ? 409 : 500
        return fail(res, status, code, r?.message ?? '配置写入失败')
      }
      return sendJson(res, 200, { data: { ok: true, config: r.config } })
    } catch (e) {
      const status = typeof e?.status === 'number' ? e.status : 500
      warn(`[wiki-steward] Hindsight 启停写入失败：${e?.message ?? e}`)
      return fail(res, status, typeof e?.code === 'string' ? e.code : 'internal', String(e?.message ?? e))
    }
  }

  return async function hindsightDispatch(req, res) {
    const p = pathnameOf(req)
    if (!p.startsWith(`${API_PREFIX}/hindsight/`)) return false
    if (p === `${API_PREFIX}/hindsight/status`) { await statusGet(req, res); return true }
    if (p === `${API_PREFIX}/hindsight/sync`) { await syncPost(req, res); return true }
    if (p === `${API_PREFIX}/hindsight/sync-log`) { await syncLogGet(req, res); return true }
    if (p === `${API_PREFIX}/hindsight/toggle`) { await togglePost(req, res); return true }
    return false // 未提供路径→交静态面（404 如实）
  }
}
