// dsh-rtk-kit/lib/doctor-routes.js —— 设置页数据路由（Task 6：authGate + 信封 + 错误码族）
// 依据：changes/20260929-phase0/tasks.md Task 6 + 队长裁决（路由形 / 信封 / 错误码族 / INV-2 / INV-7）；
//      鉴权缝照 wiki-steward/lib/ingest-routes.js:43-48 形（connection.requestRejection：过缝失败直接回拒，绝不进业务面）。
// 路由形：ctx.webServer.register({kind:'prefix', path:'/api/rtk-kit', handler}) 单 prefix + 内部分发：
//   GET  /api/rtk-kit/version   版本面（版本号 + 路径 + 可用性；path=配置 rtkBin 原样回显，M5 结案）
//   GET  /api/rtk-kit/gain      统计面（summary + 日/周/月周期序列；gain -a 一次取全量、客户端切片，INV-3）
//   POST /api/rtk-kit/health    健康面（七项定序结果数组；POST body 不读不进 argv，INV-7）
// API 形：成功 {data}；失败 {error:{code,message[,hint]}}；错误码族收口
//   AUTH_REQUIRED（鉴权拒绝）/ RTK_UNAVAILABLE（二进制缺失，附安装提示）/ RTK_TIMEOUT（超时供 UI 重试）/ RTK_ERROR（其余）。
// 安全红线（INV-7）：路由只走 Task 5 三动作（M1 结案口径）——零破坏性旗标、零透传执行、零用户输入拼接 argv。
// 零 token 面（INV-2）：三功能只走设置页 HTTP——零新会话工具注册、零统计/健康内容注入会话。
// fail-open（TECH.md 错误处理策略）：rtk 缺失不抛 500 不炸装载——版本面软回 available:false + 安装提示（数据态）；
//   统计面回 RTK_UNAVAILABLE + hint 字段；健康面七项如实红叉（getHealth 永不抛）。
//   webServer / connection 缺缝由 Task 8 接线层探测处理；本模块假定两缝在场。
import { getGain, getHealth, getVersion, INSTALL_HINT } from './doctor.js'

export const API_PREFIX = '/api/rtk-kit'

const JSON_TYPE = 'application/json; charset=utf-8'

/** 方法面收口（Task 7 fetch 合约同形，勿改）：version/gain 只 GET，health 只 POST。 */
const METHODS = Object.freeze({
  version: Object.freeze(['GET']),
  gain: Object.freeze(['GET']),
  health: Object.freeze(['POST']),
})

/** 错误码 → HTTP 状态（码族收口四码）。 */
const ERROR_STATUS = Object.freeze({ RTK_UNAVAILABLE: 503, RTK_TIMEOUT: 504, RTK_ERROR: 500 })

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': JSON_TYPE, 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function fail(res, status, code, message, extra) {
  sendJson(res, status, { error: { code, message, ...(extra ?? {}) } })
}

/** 鉴权缝（照 wiki-steward/lib/ingest-routes.js:43-48 形）：过缝失败直接回拒（码族收口 AUTH_REQUIRED），绝不进业务面。 */
function authGate(connection, req, res) {
  const rejection = connection.requestRejection({ headers: req.headers })
  if (rejection === undefined) return true
  const status = Number.isInteger(rejection) && rejection >= 400 ? rejection : 403
  fail(res, status, 'AUTH_REQUIRED', '未通过请求鉴权')
  return false
}

function methodGuard(req, res, allowed) {
  if (allowed.includes(req.method)) return true
  res.setHeader('allow', allowed.join(', '))
  fail(res, 405, 'RTK_ERROR', `不支持 ${req.method}`)
  return false
}

function pathnameOf(req) {
  try {
    return new URL(req.url, 'http://dsh.invalid').pathname
  } catch {
    return ''
  }
}

/** 三动作抛错 → 失败信封（未知错误归 RTK_ERROR；rtk 缺失附安装提示字段）。 */
function failFromError(res, err) {
  const code = err?.code === 'RTK_UNAVAILABLE' || err?.code === 'RTK_TIMEOUT' ? err.code : 'RTK_ERROR'
  const extra = code === 'RTK_UNAVAILABLE' ? { hint: INSTALL_HINT } : undefined
  fail(res, ERROR_STATUS[code], code, String(err?.message ?? err), extra)
}

/**
 * 三端点纯 handler（依赖注入、零模块态；每 handler 第一行 authGate——INV-9）。
 * @param {object} deps
 * @param {{requestRejection: Function}} deps.connection 鉴权缝
 * @param {string} [deps.rtkBin] rtk 二进制（照 config.rtkBin；version 面原样回显）
 * @param {Function} [deps.exec] 注入执行器（测试用假 execFile）
 * @param {number} [deps.timeoutMs] 执行超时（缺省 5s，INV-5）
 * @param {Function} [deps.historyReader] history.db 只读读取器（health 压缩项注入缝）
 * @param {Function} [deps.readHistory] 同上（Task 5 getHealth 的键名；二者取其一）
 * @param {Function} [deps.warn] 服务端留痕
 * @returns {{version: Function, gain: Function, health: Function}} (req,res) 形 handler
 */
export function createDoctorHandlers({
  connection,
  rtkBin,
  exec,
  timeoutMs,
  historyReader,
  readHistory,
  historyDb,
  now,
  warn = () => {},
}) {
  const actionOpts = { rtkBin, exec, timeoutMs }

  const version = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, METHODS.version)) return
    try {
      // 版本面软回（US-1 / M5）：rtk 缺失=数据态 {available:false,version:null,path,hint}，供版本区显示安装提示
      sendJson(res, 200, { data: await getVersion(actionOpts) })
    } catch (err) {
      warn(`[rtk-kit] 版本检查失败：${String(err?.message ?? err)}`)
      failFromError(res, err)
    }
  }

  const gain = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, METHODS.gain)) return
    try {
      sendJson(res, 200, { data: await getGain(actionOpts) })
    } catch (err) {
      warn(`[rtk-kit] 统计读取失败：${String(err?.message ?? err)}`)
      failFromError(res, err)
    }
  }

  const health = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, METHODS.health)) return
    try {
      // INV-7：POST body 不读不解析——七项只走固定白名单动作，请求内容永无路径进入 argv
      const items = await getHealth({ ...actionOpts, readHistory: readHistory ?? historyReader, historyDb, now })
      sendJson(res, 200, { data: items })
    } catch (err) {
      warn(`[rtk-kit] 健康检查异常（纵深防御，getHealth 契约永不抛）：${String(err?.message ?? err)}`)
      failFromError(res, err)
    }
  }

  return { version, gain, health }
}

/**
 * 注册设置页数据路由（Task 8 接线层调用；webServer/connection 缺缝探测由接线层负责）。
 * @param {object} ctx - 宿主 ctx（webServer.register 缝 + connection 鉴权缝；logger 可选）
 * @param {object} [opts] - {rtkBin, exec, timeoutMs, historyReader|readHistory, historyDb, now, warn}
 * @returns {Function} disposer（幂等、收敛不抛；交 ctx.effect 收敛）
 */
export function registerDoctorRoutes(ctx, opts = {}) {
  const connection = ctx.connection
  const warn = opts.warn ?? ((msg) => ctx.logger?.warn?.(msg))
  const handlers = createDoctorHandlers({
    ...opts,
    // F1（T6 审查收口）：connection/warn 最后进——opts.connection 不得遮蔽 ctx.connection 鉴权缝（防鉴权旁路）
    connection,
    warn,
  })

  // F2（T6 审查收口）：dispatch 外层兜底——authGate/methodGuard 抛错或 handler 异步拒绝 → 错误信封
  //（码族收口 RTK_ERROR），绝不 unhandled rejection；响应已发出/损坏时只留痕不二次回写（兜底自身绝不抛）。
  const failSafe = (res, err) => {
    warn(`[rtk-kit] 路由异常兜底：${String(err?.message ?? err)}`)
    try {
      if (res.writableEnded || res.headersSent) return
      fail(res, 500, 'RTK_ERROR', `内部错误：${String(err?.message ?? err)}`)
    } catch {
      /* 兜底不抛（响应已损坏时无处回信封） */
    }
  }

  const handler = (req, res) => {
    try {
      const p = pathnameOf(req)
      let ret
      if (p === `${API_PREFIX}/version`) ret = handlers.version(req, res)
      else if (p === `${API_PREFIX}/gain`) ret = handlers.gain(req, res)
      else if (p === `${API_PREFIX}/health`) ret = handlers.health(req, res)
      else {
        // 未知路径先过鉴权缝再 404（未登录者不获知路径存在性）；码族收口
        if (!authGate(connection, req, res)) return undefined
        return fail(res, 404, 'RTK_ERROR', '不提供该路径')
      }
      return typeof ret?.then === 'function' ? ret.catch((err) => failSafe(res, err)) : ret // F2：异步拒绝收敛为信封
    } catch (err) {
      failSafe(res, err) // F2：分发面同步抛错（authGate 等）同回信封
      return undefined
    }
  }

  const dispose = ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler })
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    if (typeof dispose === 'function') {
      try {
        dispose()
      } catch {
        /* 收敛不抛（INV-8） */
      }
    }
  }
}
