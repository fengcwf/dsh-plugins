// settings-routes — kb-context 设置面数据面（官方路由形，沿 wiki-steward 同款）：
//   ctx.webServer.register({kind:"prefix", path:"/api/kb-context", ...}) 单 prefix 注册 + 内部分发：
//   GET  /api/kb-context/settings   设置面展示（Config 面 + 可改白名单 + writable 缺缝如实）
//   POST /api/kb-context/settings   设置面写入（可改白名单 → configEditor 缝持久化热生效）
// API 形：成功 {data}；失败 {error:{code,message}}。每条 handler 第一行过鉴权缝
// （connection.requestRejection —— OW-INV-8 同款）。客户端一律文档相对请求 api/kb-context/…
// （无前导斜杠——skill-explorer issue #1707 教训）。
import { EDITABLE_PATHS } from './settings-write.js'

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
 * @param {(line:string)=>void} [deps.warn]
 * @returns {Function[]} dispose 列表（交 ctx.effect 收敛）
 */
export function registerSettingsRoutes({ register, connection, getConfig, applyPatch = null, warn = () => {} }) {
  const disposers = []

  const settingsGet = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['GET'])) return
    try {
      const cfg = getConfig()
      sendJson(res, 200, {
        data: {
          config: cfg,
          editable: EDITABLE_PATHS.map((p) => [...p]),
          writable: typeof applyPatch === 'function',
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
    if (typeof applyPatch !== 'function') {
      return fail(res, 503, 'write_unavailable', '配置写入缝缺失（configEditor 服务未挂载；本部署暂只读）')
    }
    try {
      const body = await readJsonBody(req)
      const r = await applyPatch(body?.patch)
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
    return fail(res, 404, 'not_found', '不提供该路径')
  }
  disposers.push(register({ kind: 'prefix', path: API_PREFIX, handler }))

  return disposers
}
