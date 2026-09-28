// ingest-routes — wiki-steward 数据面（官方路由形，裁定 3）：
//   ctx.webServer.register({kind:"prefix", path:"/api/wiki-steward", ...}) 单 prefix 注册 + 内部分发：
//   GET  /api/wiki-steward/settings          设置面展示（Config 面 + 可改白名单 + 缺缝如实）
//   POST /api/wiki-steward/settings          设置面写入（可改白名单 → configEditor 缝持久化热生效）
//   GET  /api/wiki-steward/ingest/logs       尾部 N 行 + 滚动加载（cursor 锚点）+ 逐行来源标注
//   GET  /api/wiki-steward/ingest/settings   Config 面只读展示 + vaultRoot/write.readOnly + 通道状态
//   POST /api/wiki-steward/ingest/scan       「扫描增量」（ingest-pipeline.py 机械面，结果写扫描日志）
//   POST /api/wiki-steward/ingest/distill    「触发蒸馏」（呼叫 headless 任务通道；蒸馏由任务执行）
//   其余                                   web/dist 构建物（Vue 面板 panel.js/style.css）静态面
// API 形：成功 {data}；失败 {error:{code,message}}。每条 handler 第一行过鉴权缝
// （connection.requestRejection —— OW-INV-8 同款：过缝失败直接回拒，绝不进业务面）。
// 路径族教训（skill-explorer issue #1707）：客户端一律**文档相对**请求 api/wiki-steward/…（无前导斜杠）；
// 旧站内绝对 '/wiki-steward/panel.js' 在 login-gate 3500 基址下解析失败=生产 404 根因，已弃。
// 静态面围栏：解码失败/绝对路径/'..' 分量/realpath 越界/缺文件一律不 200（穿越围栏）。
import fs from 'node:fs'
import path from 'node:path'
import { readMergedLog, tailSlice } from './ingest-log.js'
import { EDITABLE_PATHS } from './settings-write.js'

export const API_PREFIX = '/api/wiki-steward'

const JSON_TYPE = 'application/json; charset=utf-8'
const MAX_BODY_BYTES = 1 << 20
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': JSON_TYPE, 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function fail(res, status, code, message) {
  sendJson(res, status, { error: { code, message } })
}

/** OW-INV-8 同款鉴权缝：过缝失败直接回拒（形 {error:{code}}），绝不进业务 handler */
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

function queryOf(req) {
  try {
    return new URL(req.url, 'http://dsh.invalid').searchParams
  } catch {
    return new URLSearchParams()
  }
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

/** 静态面（web/dist 构建物）：解码→分量围栏→realpath 前缀核（穿越/缺文件/越界全不 200） */
function staticHandler(distDir, basePrefix = API_PREFIX) {
  const base = fs.existsSync(distDir) ? fs.realpathSync(distDir) : path.resolve(distDir)
  return (req, res) => {
    let rel
    let pathname
    try {
      const u = new URL(req.url, 'http://dsh.invalid')
      pathname = u.pathname
      rel = decodeURIComponent(u.pathname.slice(basePrefix.length))
    } catch {
      return fail(res, 400, 'bad_request', '路径解码失败')
    }
    // URL 解析器会把 '..' 归一化掉：归一化后脱空前缀=穿越形，必拒（围栏在解析前后双判）
    if (pathname !== basePrefix && !pathname.startsWith(basePrefix + '/')) {
      return fail(res, 404, 'not_found', '不提供该路径')
    }
    if (rel === '' || rel === '/') rel = '/panel.js' // 面板入口（无独立 index，缺省给构建物入口）
    const stripped = rel.replace(/^\/+/, '') // 前导斜杠=站内绝对形（/api/wiki-steward/…），不是越界
    const segments = stripped.split('/').filter((s) => s !== '' && s !== '.')
    if (stripped === '' || path.isAbsolute(stripped) || stripped.includes('\\') || segments.some((s) => s === '..')) {
      return fail(res, 404, 'not_found', '不提供该路径')
    }
    const candidate = path.join(base, ...segments)
    let real
    try {
      real = fs.realpathSync(candidate)
    } catch {
      return fail(res, 404, 'not_found', '文件不存在')
    }
    if (real !== base && !real.startsWith(base + path.sep)) {
      return fail(res, 404, 'not_found', '不提供该路径')
    }
    const stat = fs.statSync(real)
    if (!stat.isFile()) return fail(res, 404, 'not_found', '不提供该路径')
    const type = MIME[path.extname(real).toLowerCase()] ?? 'application/octet-stream'
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
    res.end(fs.readFileSync(real))
    return undefined
  }
}

/**
 * 注册 wiki-steward 数据面（单 prefix /api/wiki-steward + 内部分发，官方路由形）。
 * @param {object} deps
 * @param {(spec:object)=>Function} deps.register ctx.webServer.register 缝
 * @param {{requestRejection: Function}} deps.connection 鉴权缝
 * @param {()=>object} deps.getConfig 热改现读 config（Config.parse 产物形）
 * @param {{scan:Function,distill:Function,distillStatus:Function}} deps.trigger lib/ingest-trigger.js 形
 * @param {Array} deps.sources lib/ingest-log.js 来源规约（defaultLogSources 形）
 * @param {string} deps.distDir web/dist 构建物目录
 * @param {(patch:object)=>Promise<object>} [deps.applyPatch] 设置写缝（settings-write createApplyPatch 形；缺=写端点 503 如实）
 * @param {(line:string)=>void} [deps.warn]
 * @returns {Function[]} dispose 列表（交 ctx.effect 收敛）
 */
export function registerIngestRoutes({ register, connection, getConfig, trigger, sources, distDir, applyPatch = null, warn = () => {} }) {
  const disposers = []
  const statics = staticHandler(distDir, API_PREFIX)

  // GET settings —— 设置面展示（配置展示/可改：可改白名单如实列示）
  const settingsGet = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['GET'])) return
    try {
      const cfg = getConfig()
      sendJson(res, 200, {
        data: {
          config: cfg,
          readOnly: cfg?.write?.readOnly === true,
          editable: EDITABLE_PATHS.map((p) => [...p]),
          writable: typeof applyPatch === 'function',
        },
      })
    } catch (e) {
      warn(`[wiki-steward] 设置面读取失败：${e?.message ?? e}`)
      fail(res, 500, 'internal', String(e?.message ?? e))
    }
  }

  // POST settings —— 设置面写入（白名单→合并→真校验→configEditor 持久化热生效）
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
      warn(`[wiki-steward] 设置面写入失败：${e?.message ?? e}`)
      return fail(res, status, typeof e?.code === 'string' ? e.code : 'internal', String(e?.message ?? e))
    }
  }

  // GET logs —— 尾部 N 行 + 滚动加载（cursor=锚点 {s,f,i}）
  const logsGet = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['GET'])) return
    const q = queryOf(req)
    const merged = readMergedLog(sources)
    const page = tailSlice(merged, { limit: q.get('limit') ?? undefined, cursor: q.get('cursor') })
    sendJson(res, 200, {
      data: {
        lines: page.lines,
        hasMore: page.hasMore,
        cursor: page.cursor,
        sources: sources.map((s) => ({ id: s.id, label: s.label })),
        ...(page.stale === true ? { stale: true } : {}),
      },
    })
  }

  // GET ingest/settings —— Config 面只读展示 + 通道状态如实（Vue 面板设置页签用）
  const ingestSettingsGet = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['GET'])) return
    try {
      const cfg = getConfig()
      const st = await trigger.distillStatus()
      sendJson(res, 200, {
        data: {
          config: cfg,
          readOnly: cfg?.write?.readOnly === true,
          channel: {
            available: st.channelAvailable === true,
            running: st.running === true,
            cronScript: st.cronScript ?? null,
            taskFile: st.taskFile ?? null,
            logFile: st.logFile ?? null,
            lockFile: st.lockFile ?? null,
          },
          sources: sources.map((s) => ({ id: s.id, label: s.label })),
        },
      })
    } catch (e) {
      warn(`[wiki-steward] ingest settings 读取失败：${e?.message ?? e}`)
      fail(res, 500, 'internal', String(e?.message ?? e))
    }
  }

  // POST scan —— 「扫描增量」：ingest-pipeline.py 机械面（child_process 缝，结果写扫描日志）
  const scanPost = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['POST'])) return
    try {
      const r = await trigger.scan()
      sendJson(res, 200, { data: { ok: r.ok, exitCode: r.exitCode, summary: r.summary, output: r.output, logFile: r.logFile, argv: r.argv } })
    } catch (e) {
      warn(`[wiki-steward] 扫描增量失败：${e?.message ?? e}`)
      fail(res, 500, 'internal', String(e?.message ?? e))
    }
  }

  // POST distill —— 「触发蒸馏」：呼叫 headless 任务通道（蒸馏由任务执行，按钮绝不做 LLM 蒸馏）
  const distillPost = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['POST'])) return
    try {
      const r = await trigger.distill()
      sendJson(res, 200, {
        data: { started: r.started, reason: r.reason, note: r.note, logFile: r.logFile, lockFile: r.lockFile ?? null, argv: r.argv ?? null },
      })
    } catch (e) {
      warn(`[wiki-steward] 触发蒸馏失败：${e?.message ?? e}`)
      fail(res, 500, 'internal', String(e?.message ?? e))
    }
  }

  // 单 prefix 注册（官方路由形，裁定 3）：内部分发 REST 面；其余走静态面（web/dist 构建物）
  const handler = async (req, res) => {
    const p = pathnameOf(req)
    if (p === `${API_PREFIX}/settings`) {
      if (req.method === 'GET') return settingsGet(req, res)
      if (req.method === 'POST') return settingsPost(req, res)
      return methodGuard(req, res, ['GET', 'POST']) // 其余方法=405 + allow 头（两法并列）
    }
    if (p === `${API_PREFIX}/ingest/logs`) return logsGet(req, res)
    if (p === `${API_PREFIX}/ingest/settings`) return ingestSettingsGet(req, res)
    if (p === `${API_PREFIX}/ingest/scan`) return scanPost(req, res)
    if (p === `${API_PREFIX}/ingest/distill`) return distillPost(req, res)
    return statics(req, res)
  }
  disposers.push(register({ kind: 'prefix', path: API_PREFIX, handler }))

  return disposers
}
