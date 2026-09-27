// ingest-routes — 设置页签数据面：REST + web/dist 静态（形对齐 obsidian-web /ob/ 惯例）。
//   GET  /wiki-steward/api/ingest/logs      尾部 N 行 + 滚动加载（cursor 锚点）+ 逐行来源标注
//   GET  /wiki-steward/api/ingest/settings  Config 面只读展示 + vaultRoot/write.readOnly + 通道状态
//   POST /wiki-steward/api/ingest/scan      「扫描增量」（ingest-pipeline.py 机械面，结果写扫描日志）
//   POST /wiki-steward/api/ingest/distill   「触发蒸馏」（呼叫 headless 任务通道；蒸馏由任务执行）
//   prefix /wiki-steward                    web/dist 构建物（Vue 面板 panel.js/style.css）
// API 形：成功 {data}；失败 {error:{code,message}}。每条 handler 第一行过鉴权缝
// （connection.requestRejection —— OW-INV-8 同款：过缝失败直接回拒，绝不进业务面）。
// 静态面围栏：解码失败/绝对路径/'..' 分量/realpath 越界/缺文件一律不 200（穿越围栏）。
import fs from 'node:fs'
import path from 'node:path'
import { readMergedLog, tailSlice } from './ingest-log.js'

const JSON_TYPE = 'application/json; charset=utf-8'
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

/** 静态面（web/dist 构建物）：解码→分量围栏→realpath 前缀核（穿越/缺文件/越界全不 200） */
function staticHandler(distDir) {
  const base = fs.existsSync(distDir) ? fs.realpathSync(distDir) : path.resolve(distDir)
  return (req, res) => {
    let rel
    let pathname
    try {
      const u = new URL(req.url, 'http://dsh.invalid')
      pathname = u.pathname
      rel = decodeURIComponent(u.pathname.slice('/wiki-steward'.length))
    } catch {
      return fail(res, 400, 'bad_request', '路径解码失败')
    }
    // URL 解析器会把 '..' 归一化掉：归一化后脱空前缀=穿越形，必拒（围栏在解析前后双判）
    if (pathname !== '/wiki-steward' && !pathname.startsWith('/wiki-steward/')) {
      return fail(res, 404, 'not_found', '不提供该路径')
    }
    if (rel === '' || rel === '/') rel = '/panel.js' // 面板入口（无独立 index，缺省给构建物入口）
    const stripped = rel.replace(/^\/+/, '') // 前导斜杠=站内绝对形（/wiki-steward/…），不是越界
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
 * 注册 ingest 面板全部路由。
 * @param {object} deps
 * @param {(spec:object)=>Function} deps.register ctx.webServer.register 缝
 * @param {{requestRejection: Function}} deps.connection 鉴权缝
 * @param {()=>object} deps.getConfig 热改现读 config（Config.parse 产物形）
 * @param {{scan:Function,distill:Function,distillStatus:Function}} deps.trigger lib/ingest-trigger.js 形
 * @param {Array} deps.sources lib/ingest-log.js 来源规约（defaultLogSources 形）
 * @param {string} deps.distDir web/dist 构建物目录
 * @param {(line:string)=>void} [deps.warn]
 * @returns {Function[]} dispose 列表（交 ctx.effect 收敛）
 */
export function registerIngestRoutes({ register, connection, getConfig, trigger, sources, distDir, warn = () => {} }) {
  const disposers = []
  const add = (kind, routePath, handler) => disposers.push(register({ kind, path: routePath, handler }))

  // GET logs —— 尾部 N 行 + 滚动加载（cursor=锚点 {s,f,i}）
  add('exact', '/wiki-steward/api/ingest/logs', async (req, res) => {
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
  })

  // GET settings —— Config 面只读展示（可改项=∅）+ 通道状态如实
  add('exact', '/wiki-steward/api/ingest/settings', async (req, res) => {
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
  })

  // POST scan —— 「扫描增量」：ingest-pipeline.py 机械面（child_process 缝，结果写扫描日志）
  add('exact', '/wiki-steward/api/ingest/scan', async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['POST'])) return
    try {
      const r = await trigger.scan()
      sendJson(res, 200, { data: { ok: r.ok, exitCode: r.exitCode, summary: r.summary, output: r.output, logFile: r.logFile, argv: r.argv } })
    } catch (e) {
      warn(`[wiki-steward] 扫描增量失败：${e?.message ?? e}`)
      fail(res, 500, 'internal', String(e?.message ?? e))
    }
  })

  // POST distill —— 「触发蒸馏」：呼叫 headless 任务通道（蒸馏由任务执行，按钮绝不做 LLM 蒸馏）
  add('exact', '/wiki-steward/api/ingest/distill', async (req, res) => {
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
  })

  // 静态面（web/dist）：exact 路由之后兜底；API 面永远走上面的 exact 形
  add('prefix', '/wiki-steward', staticHandler(distDir))

  return disposers
}
