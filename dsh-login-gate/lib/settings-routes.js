// dsh-login-gate — 设置面数据面（官方路由形，沿 kb-context/lib/settings-routes.js 同款）：
//   ctx.webServer.register({kind:'prefix', path:'/api/login-gate', ...}) 单 prefix 注册 + 内部分发：
//   GET  /api/login-gate/settings        设置面展示（config 九键 + writable + applied 恒定 + users 仅名字）
//   POST /api/login-gate/settings        设置面写入（白名单 → 端口预检 → configEditor 缝持久化）
//   POST /api/login-gate/settings/users  账号 CRUD（复用 lib/users.js Task 10 模块，写 Config usersFile）
// API 形：成功 {data}；失败 {error:{code,message}}。每条 handler 首行过鉴权缝
// （connection.requestRejection——INV-4；无角色模型，任何登录用户可写）。客户端一律文档相对请求。
//
// 防自锁身份源（R-10 裁定）：门禁会话 cookie 经反代时被剥（lib/index.js stripCookieNames），
// 路由层身份两源收敛——①getSession 缝（直连/回环，sessions.verifyCookie）②请求体 currentName
// （经门禁场景，客户端取自 GET /__gate/status 的 user）；会话优先（防伪造 body 删自己），
// 两者皆缺→拒删 current_user_unknown（fail-closed，与 Task 10 deleteUser 契约同向）。
import { addUser, updatePassword, deleteUser, loadUsers } from './users.js'
import { validatePatch, precheckPort, probePortBindable } from './settings-write.js'

export const API_PREFIX = '/api/login-gate'
export const SETTINGS_PATH = '/api/login-gate/settings'
export const USERS_PATH = '/api/login-gate/settings/users'

const JSON_TYPE = 'application/json; charset=utf-8'
const MAX_BODY_BYTES = 1 << 20

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': JSON_TYPE, 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function fail(res, status, code, message) {
  sendJson(res, status, { error: { code, message } })
}

/** INV-4 同款鉴权缝：过缝失败直接回拒，绝不进业务 handler */
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

/** 设置面展示投影：九键（users/usersFile/enabled 等内部键绝不外露） */
function displayConfig(cfg) {
  const c = cfg ?? {}
  return {
    port: c.port,
    listenHost: c.listenHost,
    upstreamPort: c.upstreamPort,
    rewriteHost: c.rewriteHost,
    sessionDays: c.sessionDays,
    maxFailures: c.maxFailures,
    secureCookie: c.secureCookie,
    wsAllow: c.wsAllow,
    gzipPass: c.gzipPass,
  }
}

/** 账号列表=合并表（config.users ∪ usersFile）名字，仅名字（INV-3 响应永不含哈希） */
function userList(getUsers) {
  let table = {}
  try {
    table = getUsers() ?? {}
  } catch { /* 账号表读取失败按空表如实 */ }
  return Object.keys(table).sort().map((name) => ({ name }))
}

/** 响应/判定共用：合并表是否已有该账号名（判重/存在性检查走合并表，防 config-only 被文件条目遮蔽） */
function hasUser(getUsers, name) {
  let table = {}
  try {
    table = getUsers() ?? {}
  } catch { /* 同上 */ }
  return Object.hasOwn(table, name)
}

const WRITE_STATUS = { not_editable: 400, invalid: 400, port_in_use: 400, no_entry: 409, write_unavailable: 503 }

/**
 * update/delete 的存在性判据（F4）：以 usersFile 现读为准（CRUD 只写 usersFile）。
 * config-only 条目（config.users 有、usersFile 无）按 not_found 拒并给因（裁定：code 选 not_found
 * 而非新码 config_only——语义都是「不支持在此改/删」，少一个码面）。
 * @returns {string|null} 不存在时返回拒绝消息；存在返回 null
 */
function missingFromFile(getUsers, usersFile, name) {
  let fileTable = {}
  try {
    fileTable = loadUsers({ usersFile }).users ?? {}
  } catch { /* 读取失败按空表 → 走不存在分支（fail-closed，绝不放行写） */ }
  if (Object.hasOwn(fileTable, name)) return null
  return hasUser(getUsers, name)
    ? `用户「${name}」由配置（settings.yaml users）维护，不支持在此修改/删除`
    : `用户「${name}」不存在`
}

/**
 * 注册 login-gate 设置面（单 prefix /api/login-gate + 内部分发）。
 * @param {object} deps
 * @param {(spec:object)=>Function} deps.register ctx.webServer.register 缝
 * @param {{requestRejection:Function}} deps.connection 鉴权缝（INV-4）
 * @param {()=>object} deps.getConfig 热改现读 config（per-call 读）
 * @param {()=>Record<string,string>} [deps.getUsers] 合并账号表（config.users ∪ usersFile，热加载）
 * @param {string} [deps.usersFile] Config usersFile（含 normalize 缺省解析后的路径，CRUD 必传）
 * @param {(patch:object)=>Promise<object>} [deps.applyPatch] 设置写缝（settings-write createApplyPatch 形）
 * @param {()=>((patch:object)=>Promise<object>|null)} [deps.getApplyPatch] 惰性写缝解析器（per-request 求值，
 *   configEditor 后到可见；传入时优先于 applyPatch）
 * @param {(req:object)=>({u:string}|null)} [deps.getSession] 门禁会话解析（防自锁身份源①）
 * @param {(port:number, host:string)=>Promise<boolean>} [deps.probePort] 端口可绑定性探测（可注入 mock）
 * @param {(line:string)=>void} [deps.warn]
 * @returns {Function[]} dispose 列表（交 ctx.effect 收敛）
 */
export function registerSettingsRoutes({
  register,
  connection,
  getConfig,
  getUsers = () => ({}),
  usersFile,
  applyPatch = null,
  getApplyPatch = null,
  getSession = () => null,
  probePort = probePortBindable,
  warn = () => {},
} = {}) {
  // 写缝求值：惰性解析器 per-request 现求（解析器抛错=按缺位收敛，绝不抛穿）；缺省回落静态 applyPatch
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
  // R-16（2026-09-29 实测推翻重启假设，tester F-1）：配置写入经宿主 re-apply **即时生效**——
  // 无 pendingRestart latch、无 boot 面比较；响应面 applied:true 恒定（GET/POST 同形）。

  const settingsGet = async (req, res) => {
    if (!methodGuard(req, res, ['GET'])) return
    try {
      const cfg = getConfig()
      sendJson(res, 200, {
        data: {
          writable: typeof resolveApplyPatch() === 'function',
          applied: true,
          config: displayConfig(cfg),
          users: userList(getUsers),
        },
      })
    } catch (e) {
      warn(`[login-gate] 设置面读取失败（${e?.name ?? 'Error'}）`)
      fail(res, 500, 'internal', String(e?.message ?? e))
    }
  }

  const settingsPost = async (req, res) => {
    if (!methodGuard(req, res, ['POST'])) return
    const write = resolveApplyPatch()
    if (typeof write !== 'function') {
      return fail(res, 503, 'write_unavailable', '配置写入缝缺失（configEditor 服务未挂载；本部署暂只读）')
    }
    try {
      const body = await readJsonBody(req)
      const patch = body?.patch
      const pre = validatePatch(patch) // 白名单+值域预检：绝不触达写缝
      if (!pre.ok) return fail(res, 400, pre.code, pre.message)
      const before = getConfig()
      const portPre = await precheckPort({ patch, current: before, probePort }) // 端口占用预检（brief 裁定 4）
      if (!portPre.ok) return fail(res, 400, portPre.code, portPre.message)
      const r = await write(patch)
      if (!r?.ok) {
        const code = r?.code ?? 'internal'
        return fail(res, WRITE_STATUS[code] ?? 500, code, r?.message ?? '配置写入失败')
      }
      const after = r.effective ?? { ...before, ...(typeof patch === 'object' && patch ? patch : {}) }
      return sendJson(res, 200, { data: { config: displayConfig(after), applied: true } })
    } catch (e) {
      const status = typeof e?.status === 'number' ? e.status : 500
      // F4：畸形 JSON/超限体归入契约码 invalid；警告文案不插值 e.message（审查验收项 4）
      const code = e?.code === 'bad_request' ? 'invalid' : typeof e?.code === 'string' ? e.code : 'internal'
      warn(`[login-gate] 设置面写入失败（${e?.name ?? 'Error'}）`)
      return fail(res, status, code, String(e?.message ?? e))
    }
  }

  /** 防自锁身份：会话优先（不可伪造），body.currentName 兜底（经门禁场景）；皆缺/非字符串=''（F9） */
  const currentNameOf = (req, body) => {
    try {
      const u = getSession(req)?.u
      if (typeof u === 'string' && u.trim()) return u.trim()
    } catch { /* 会话解析失败按无身份收敛（fail-closed） */ }
    const b = body?.currentName
    return typeof b === 'string' ? b.trim() : ''
  }

  const usersPost = async (req, res) => {
    if (!methodGuard(req, res, ['POST'])) return
    try {
      const body = await readJsonBody(req)
      const action = String(body?.action ?? '').trim()
      const name = String(body?.name ?? '').trim()
      const password = body?.password
      if (!['add', 'update', 'delete'].includes(action)) return fail(res, 400, 'invalid', `不支持的 action：${action || '(空)'}（仅 add/update/delete）`)
      if (!name) return fail(res, 400, 'invalid', '用户名不能为空')

      if (action === 'add') {
        if (typeof password !== 'string' || !password) return fail(res, 400, 'invalid', '密码必须为非空字符串')
        if (hasUser(getUsers, name)) return fail(res, 400, 'exists', `用户「${name}」已存在`) // 合并表判重名
        await addUser(name, password, { usersFile }) // 必传 Config usersFile（含 normalize 缺省解析）
      } else if (action === 'update') {
        if (typeof password !== 'string' || !password) return fail(res, 400, 'invalid', '密码必须为非空字符串')
        const missing = missingFromFile(getUsers, usersFile, name)
        if (missing) return fail(res, 400, 'not_found', missing)
        await updatePassword(name, password, { usersFile })
      } else {
        const current = currentNameOf(req, body)
        if (!current) return fail(res, 400, 'current_user_unknown', '无法确定当前登录账号名（防自锁），拒删——请经登录门禁操作或在请求中带 currentName')
        if (current === name) return fail(res, 400, 'self_lock', `不能删除当前登录账号「${name}」（防自锁）`)
        const missing = missingFromFile(getUsers, usersFile, name)
        if (missing) return fail(res, 400, 'not_found', missing)
        await deleteUser(current, name, { usersFile })
      }
      return sendJson(res, 200, { data: { users: userList(getUsers) } })
    } catch (e) {
      // Task 10 模块契约：错误信息不含哈希（INV-3）；message 原文回显给调用方（契约：失败显服务端原文），
      // 但 warn 警告文案不插值任何用户输入（审查验收项 4）；畸形 JSON 归入 invalid（F4）
      warn(`[login-gate] 账号操作失败（${e?.name ?? 'Error'}）`)
      return fail(res, 400, e?.code === 'bad_request' ? 'invalid' : 'user_op_failed', String(e?.message ?? e))
    }
  }

  const handler = async (req, res) => {
    if (!authGate(connection, req, res)) return // INV-4/F1：鉴权缝统一在分发首行——405/404 兜底同样不泄漏路由/方法形
    const p = pathnameOf(req)
    if (p === SETTINGS_PATH) {
      if (req.method === 'GET') return settingsGet(req, res)
      if (req.method === 'POST') return settingsPost(req, res)
      return methodGuard(req, res, ['GET', 'POST'])
    }
    if (p === USERS_PATH) {
      if (req.method === 'POST') return usersPost(req, res)
      return methodGuard(req, res, ['POST'])
    }
    return fail(res, 404, 'route_not_found', '不提供该路径')
  }
  disposers.push(register({ kind: 'prefix', path: API_PREFIX, handler }))

  return disposers
}
