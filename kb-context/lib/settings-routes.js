// settings-routes — kb-context 设置面数据面（官方路由形，沿 wiki-steward 同款）：
//   ctx.webServer.register({kind:"prefix", path:"/api/kb-context", ...}) 单 prefix 注册 + 内部分发：
//   GET  /api/kb-context/settings   设置面展示（Config 面 + 可改白名单 + writable 缺缝如实）
//   POST /api/kb-context/settings   设置面写入（可改白名单 → configEditor 缝持久化热生效）
//   GET  /api/kb-context/logs       触发日志环条目（0.4.0，TECH 实现面 3：200 {data:{entries,capacity,enabled}}）
//   POST /api/kb-context/logs/clear 触发日志清空（0.4.0：200 {data:{cleared:n}}，弹层清空按钮用）
// API 形：成功统一 {data:…} 包络（settings 面 {data:{config,editable,writable}}；logs 双端点
// {data:{entries,capacity,enabled}} / {data:{cleared:n}}——ledger R-5 修订，原顶层键字面废止）；
// 失败一律 {error:{code,message}} 包络（错误形沿既有）。每条 handler 第一行过鉴权缝
// （connection.requestRejection —— OW-INV-8 同款）。客户端一律文档相对请求 api/kb-context/…
// （无前导斜杠——skill-explorer issue #1707 教训）。
import { EDITABLE_PATHS } from './settings-write.js'
import { DEFAULT_CAPACITY } from './trigger-log.js'

export const API_PREFIX = '/api/kb-context'

const JSON_TYPE = 'application/json; charset=utf-8'
const MAX_BODY_BYTES = 1 << 20

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': JSON_TYPE, 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function fail(res, status, code, message) {
  sendJson(res, status, { error: { code, message } })
}

/** OW-INV-8 同款鉴权缝：过缝失败直接回拒，绝不进业务 handler */
function authGate(connection, req, res) {
  const rejection = connection.requestRejection({ headers: req.headers })
  if (rejection === undefined) return true
  fail(res, rejection, rejection === 401 ? 'unauthorized' : 'forbidden', '未通过请求鉴权')
  return false
}

function methodGuard(req, res, allowed) {
  if (allowed.includes(req.method)) return true
  res.setHeader('allow', allowed.join(', '))
  fail(res, 405, 'method_not_allowed', `不支持 ${req.method}`)
  return false
}

function pathnameOf(req) {
  try {
    return new URL(req.url, 'http://dsh.invalid').pathname
  } catch {
    return ''
  }
}

/** 读 JSON 请求体（有界；畸形=bad_request，绝不静默当空） */
async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += Buffer.byteLength(chunk)
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error('请求体过大'), { code: 'bad_request', status: 400 })
    chunks.push(Buffer.from(chunk))
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    throw Object.assign(new Error('请求体不是合法 JSON'), { code: 'bad_request', status: 400 })
  }
}

/**
 * 注册 kb-context 设置面（单 prefix /api/kb-context + 内部分发）。
 * @param {object} deps
 * @param {(spec:object)=>Function} deps.register ctx.webServer.register 缝
 * @param {{requestRejection: Function}} deps.connection 鉴权缝
 * @param {()=>object} deps.getConfig 热改现读 config（Config.parse 产物形，per-call 读）
 * @param {(patch:object)=>Promise<object>} [deps.applyPatch] 设置写缝（settings-write createApplyPatch 形；缺=写端点 503 如实）
 * @param {()=>((patch:object)=>Promise<object>|null)} [deps.getApplyPatch] 惰性写缝解析器（per-request 求值，B1 修复：
 *   configEditor 后到可见——取到函数=当下可写、null=当下写端点 503 如实；传入时优先于 applyPatch）
 * @param {{record:Function, list:Function, clear:Function, stats:Function}} [deps.triggerLog] 触发日志环
 *   （lib/trigger-log.js createTriggerLog 产物，index.js 注入；缺=logs 双端点 503 logs_unavailable 如实）
 * @param {(line:string)=>void} [deps.warn]
 * @returns {Function[]} dispose 列表（交 ctx.effect 收敛）
 */
export function registerSettingsRoutes({ register, connection, getConfig, applyPatch = null, getApplyPatch = null, triggerLog = null, warn = () => {} }) {
  // 写缝求值：惰性解析器 per-request 现求（解析器抛错=按缺位收敛，绝不抛穿）；缺省回落静态 applyPatch（既有形零变化）
  const resolveApplyPatch = typeof getApplyPatch === 'function'
    ? () => {
        try {
          return getApplyPatch()
        } catch {
          return null
        }
      }
    : () => applyPatch
  const disposers = []

  /** 触发日志数据源现求（缺环=503 logs_unavailable 如实，绝不装有日志；坏环同收敛，绝不抛穿） */
  const resolveTriggerLog = () =>
    (triggerLog !== null && typeof triggerLog === 'object' && typeof triggerLog.list === 'function' && typeof triggerLog.clear === 'function')
      ? triggerLog
      : null

  /** 环统计救济读（stats 缺位/抛错=按在场条目数收敛，绝不炸路由） */
  const safeStats = (log) => {
    try {
      return (typeof log.stats === 'function' && log.stats()) || {}
    } catch {
      return {}
    }
  }

  // ---- GET /api/kb-context/logs（0.4.0，A-TL1/A-TL3 排查面：环内条目 JSON，curl 可查）----
  const logsGet = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['GET'])) return
    const log = resolveTriggerLog()
    if (log === null) return fail(res, 503, 'logs_unavailable', '触发日志数据源缺失（triggerLog 环未挂载）')
    try {
      const raw = log.list()
      const entries = Array.isArray(raw) ? raw : []
      const st = safeStats(log)
      sendJson(res, 200, {
        data: {
          entries, // list() 契约=时间倒序（最新在前，lib/trigger-log.js）
          // 回退=常量 200（DEFAULT_CAPACITY 口径），绝非 entries.length（stats 缺位不虚报环容量）
          capacity: Number.isInteger(st.capacity) && st.capacity > 0 ? st.capacity : DEFAULT_CAPACITY,
          enabled: st.enabled !== false,
        },
      })
    } catch (e) {
      warn(`[kb-context] 触发日志读取失败：${e?.message ?? e}`)
      fail(res, 500, 'internal', String(e?.message ?? e))
    }
  }

  // ---- POST /api/kb-context/logs/clear（0.4.0，A-TL4：清空动作，弹层清空按钮用）----
  const logsClear = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['POST'])) return
    const log = resolveTriggerLog()
    if (log === null) return fail(res, 503, 'logs_unavailable', '触发日志数据源缺失（triggerLog 环未挂载）')
    try {
      try { if (typeof req.resume === 'function') req.resume() } catch { /* 排空请求体（keep-alive 卫生）；清空动作零入参，内容不解析 */ }
      const st = safeStats(log)
      const cleared = Number.isInteger(st.count) && st.count >= 0
        ? st.count
        : (Array.isArray(log.list()) ? log.list().length : 0)
      log.clear()
      sendJson(res, 200, { data: { cleared } })
    } catch (e) {
      warn(`[kb-context] 触发日志清空失败：${e?.message ?? e}`)
      fail(res, 500, 'internal', String(e?.message ?? e))
    }
  }

  const settingsGet = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['GET'])) return
    try {
      const cfg = getConfig()
      sendJson(res, 200, {
        data: {
          config: cfg,
          editable: EDITABLE_PATHS.map((p) => [...p]),
          writable: typeof resolveApplyPatch() === 'function',
        },
      })
    } catch (e) {
      warn(`[kb-context] 设置面读取失败：${e?.message ?? e}`)
      fail(res, 500, 'internal', String(e?.message ?? e))
    }
  }

  const settingsPost = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['POST'])) return
    const write = resolveApplyPatch()
    if (typeof write !== 'function') {
      return fail(res, 503, 'write_unavailable', '配置写入缝缺失（configEditor 服务未挂载；本部署暂只读）')
    }
    try {
      const body = await readJsonBody(req)
      const r = await write(body?.patch)
      if (!r?.ok) {
        const code = r?.code ?? 'internal'
        const status = code === 'not_editable' || code === 'bad_patch' || code === 'invalid' ? 400 : code === 'no_entry' ? 409 : 500
        return fail(res, status, code, r?.message ?? '配置写入失败')
      }
      return sendJson(res, 200, { data: { ok: true, config: r.config } })
    } catch (e) {
      const status = typeof e?.status === 'number' ? e.status : 500
      warn(`[kb-context] 设置面写入失败：${e?.message ?? e}`)
      return fail(res, status, typeof e?.code === 'string' ? e.code : 'internal', String(e?.message ?? e))
    }
  }

  const handler = async (req, res) => {
    const p = pathnameOf(req)
    if (p === `${API_PREFIX}/settings`) {
      if (req.method === 'GET') return settingsGet(req, res)
      if (req.method === 'POST') return settingsPost(req, res)
      return methodGuard(req, res, ['GET', 'POST']) // 其余方法=405 + allow 头（两法并列）
    }
    if (p === `${API_PREFIX}/logs`) {
      if (req.method === 'GET') return logsGet(req, res)
      return methodGuard(req, res, ['GET']) // 其余方法=405 + allow 头
    }
    if (p === `${API_PREFIX}/logs/clear`) {
      if (req.method === 'POST') return logsClear(req, res)
      return methodGuard(req, res, ['POST']) // 其余方法=405 + allow 头
    }
    return fail(res, 404, 'not_found', '不提供该路径')
  }
  disposers.push(register({ kind: 'prefix', path: API_PREFIX, handler }))

  return disposers
}
