// lib/settings-routes.js — settings 服务端缝（W6.5 / Ruling-12：读写路由 + web/dist 静态服务）
// 形制（先例 = wiki-steward/lib/{ingest-routes,settings-write}.js + obsidian-web/lib/web-routes.js）：
//   ctx.webServer.register({kind:'prefix', path:'/api/dsh-clsh-search', handler}) 单 prefix 注册 + 内部分发：
//     GET      /api/dsh-clsh-search/settings   设置面展示（Config 面 + 可改白名单 + 写缝在场如实）
//     PUT|POST /api/dsh-clsh-search/settings   设置面写入（白名单→合并→真 zod 校验→configEditor 持久化）
//     其余     /api/dsh-clsh-search/**         web/dist 静态构建物（围栏服务：解码→normalize→前缀核）
// 纪律：
//   · 可改白名单=行为键最小集（K-7：dataDir/cacheDir/logDir 落点目录键只读展示，绝不写）；
//   · patch 白名单外叶子 → 整单拒（not_editable，绝不静默丢键），随后 projectEditable 双保险；
//   · 合并语义=对象深合并、数组/标量整替（与 Config 整行替换语义一致）；
//   · 校验=真 zod（Config.safeParse 合并后的生效面 inherited∪current∪patch），失败如实回 invalid；
//   · P-5/K-4：路由不落明文凭据、日志不记查询词/请求体（warn 只记错误消息本身）。
import fs from 'node:fs'
import path from 'node:path'

/** 本插件 API 前缀（设置页 fetch 走相对路径同基解析——skill-explorer #1707：前导斜杠逃出 <base> 前缀）。 */
export const API_PREFIX = '/api/dsh-clsh-search'

/** 可改字段白名单（叶子路径；数组=叶子整替）。落点目录键（dataDir/cacheDir/logDir）不在列=只读（K-7）。 */
export const EDITABLE_PATHS = Object.freeze([
  Object.freeze(['sources', 'ddg']),
  Object.freeze(['sources', 'bing']),
  Object.freeze(['sources', 'so360']),
  Object.freeze(['sources', 'baidu']),
  Object.freeze(['sources', 'priority']),
  Object.freeze(['timeoutMs']),
  Object.freeze(['retries']),
  Object.freeze(['chainBudgetMs']),
  Object.freeze(['maxResults']),
  Object.freeze(['cacheTtlMs']),
  Object.freeze(['egoBudget']),
  Object.freeze(['takeOver']),
])

const typeName = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value)
const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/** 收集 patch 全部叶子路径（数组/标量=叶子；空对象=叶子）。 */
function leafPaths(value, prefix = [], out = []) {
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
    if (keys.length === 0) out.push(prefix)
    for (const key of keys) leafPaths(value[key], [...prefix, key], out)
  } else {
    out.push(prefix)
  }
  return out
}

const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

/** 路径在白名单内（叶子全等）。 */
export function isEditablePath(target) {
  return EDITABLE_PATHS.some((p) => samePath(p, target))
}

function getPath(obj, target) {
  let cur = obj
  for (const key of target) {
    if (!isPlainObject(cur) && !Array.isArray(cur)) return undefined
    cur = cur[key]
  }
  return cur
}

function mergeInto(base, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(base[key])) mergeInto(base[key], value)
    else base[key] = value
  }
  return base
}

/** 按白名单从 patch 抽出最小写入形（白名单外的键绝不落盘，双保险）。 */
function projectEditable(patch) {
  const out = {}
  for (const target of EDITABLE_PATHS) {
    const value = getPath(patch, target)
    if (value === undefined) continue
    let node = out
    for (const key of target.slice(0, -1)) node = node[key] ??= {}
    node[target[target.length - 1]] = value
  }
  return out
}

/**
 * 补丁白名单预检（纯函数）：形非法/空/白名单外叶子=结构化失败。
 * @returns {{ok:true} | {ok:false, code:string, message:string}}
 */
export function checkPatchEditable(patch) {
  if (!isPlainObject(patch)) return { ok: false, code: 'bad_patch', message: 'patch 必须是对象' }
  const leaves = leafPaths(patch).filter((p) => p.length > 0)
  if (leaves.length === 0) return { ok: false, code: 'bad_patch', message: 'patch 为空（无可改叶子）' }
  for (const leaf of leaves) {
    if (!isEditablePath(leaf)) {
      return {
        ok: false,
        code: 'not_editable',
        message: `字段 ${leaf.join('.')} 不在可改白名单（落点目录键只读，K-7；仅可改：${EDITABLE_PATHS.map((x) => x.join('.')).join('、')}）`,
      }
    }
  }
  return { ok: true }
}

/**
 * 合并 + 真 zod 校验一次设置写入（纯函数）。
 * @param {{inherited?:object, current:object, patch:object}} args 生效面三层。
 * @param {object} Config 插件 zod Config。
 * @returns {{ok:true, config:object, parsed:object} | {ok:false, code:string, message:string}}
 */
export function applyEditablePatch({ inherited = {}, current = {}, patch }, Config) {
  const pre = checkPatchEditable(patch)
  if (!pre.ok) return pre
  const minimal = projectEditable(patch)
  const effective = mergeInto(structuredClone(inherited), structuredClone(current))
  mergeInto(effective, minimal)
  const parsed = Config.safeParse(effective)
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid',
      message: `配置校验失败：${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`,
    }
  }
  return { ok: true, config: mergeInto(structuredClone(current), minimal), parsed: parsed.data }
}

/**
 * 宿主写缝：configEditor.edit（dsh-settings 服务同款持久化缝：校验→落 profile patch→热生效）。
 * 缺缝/缺入口/校验失败=结构化失败，绝不抛穿路由。
 * @param {{configEditor: {entries:Function, edit:Function}, entryId: string, Config: object}} args
 * @returns {(patch:object)=>Promise<{ok:boolean, config?:object, code?:string, message?:string}>}
 */
export function createApplyPatch({ configEditor, entryId, Config }) {
  return async function applyPatch(patch) {
    try {
      const pre = checkPatchEditable(patch)
      if (!pre.ok) return pre
      const entries = typeof configEditor?.entries === 'function' ? configEditor.entries() : []
      const entry = entries.find((e) => e?.options?.id === entryId)
      if (entry === undefined) {
        return { ok: false, code: 'no_entry', message: `配置入口 ${entryId} 不在活动表（插件未挂载或被替换）` }
      }
      let applied = null
      await configEditor.edit(entry, (current, inherited) => {
        const result = applyEditablePatch({ inherited: inherited ?? {}, current: current ?? {}, patch }, Config)
        if (!result.ok) {
          const err = new Error(result.message)
          err.code = result.code
          throw err
        }
        applied = result.config
        return result.config
      })
      return { ok: true, config: applied }
    } catch (error) {
      return { ok: false, code: typeof error?.code === 'string' ? error.code : 'edit_failed', message: String(error?.message ?? error) }
    }
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

function fail(res, status, code, message) {
  sendJson(res, status, { error: { code, message } })
}

function methodGuard(req, res, allowed) {
  if (allowed.includes(req.method)) return true
  res.writeHead(405, { allow: allowed.join(', ') })
  res.end()
  return false
}

/** 鉴权缝（先例 OW-INV-8/T1 惯例）：connection.requestRejection 判定 → 401。 */
function authGate(connection, req, res) {
  if (connection && typeof connection.requestRejection === 'function') {
    const rejection = connection.requestRejection({ headers: req.headers ?? {} })
    if (rejection) {
      fail(res, 401, 'unauthorized', '请求未通过宿主鉴权')
      return false
    }
  }
  return true
}

function pathnameOf(req) {
  try {
    return decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  } catch {
    return ''
  }
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks.map((c) => (typeof c === 'string' ? Buffer.from(c) : c))).toString('utf8')
  if (raw.length === 0) return {}
  try {
    return JSON.parse(raw)
  } catch {
    // W65-N2：坏 JSON = 客户端错误（400 bad_json），不落 500 服务端噪声
    const error = new Error('请求体不是合法 JSON')
    error.code = 'bad_json'
    error.status = 400
    throw error
  }
}

/** 静态构建物服务（web/dist）：解码→normalize→前缀核（穿越/缺文件全不 200，先例 obsidian-web 同形）。 */
export function staticHandler(distDir, prefix = API_PREFIX) {
  const base = path.resolve(distDir)
  return (req, res) => {
    let sub
    try {
      sub = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    } catch {
      return fail(res, 400, 'bad_request', 'URL 解码失败')
    }
    const stripped = sub.startsWith(prefix) ? sub.slice(prefix.length) : sub
    const rel = path.posix.normalize(stripped.replace(/^\/+/, ''))
    if (rel === '..' || rel.startsWith('../') || rel.includes('\0') || path.isAbsolute(rel)) {
      res.writeHead(404)
      res.end()
      return
    }
    let filePath = path.resolve(base, rel === '' ? 'index.html' : rel)
    if (filePath !== base && !filePath.startsWith(base + path.sep)) {
      res.writeHead(404)
      res.end()
      return
    }
    let stat
    let real
    try {
      stat = fs.statSync(filePath)
      if (stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html')
        stat = fs.statSync(filePath)
      }
      // W65-N1：realpath 前缀核（symlink 逃逸不 200）——与 obsidian-web「解码→围栏→realpath 前缀核」
      // 语义对齐（先例注释口径，本实现补齐其机械面）。
      const realBase = fs.realpathSync(base)
      real = fs.realpathSync(filePath)
      if (real !== realBase && !real.startsWith(realBase + path.sep)) {
        res.writeHead(404)
        res.end()
        return
      }
    } catch {
      res.writeHead(404)
      res.end()
      return
    }
    const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    res.writeHead(200, { 'content-type': type, 'content-length': stat.size, 'cache-control': 'no-cache' })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    res.end(fs.readFileSync(real))
  }
}

/**
 * 注册 settings 服务端缝（单 prefix + 内部分发，官方路由形）。
 * @param {object} deps
 * @param {(spec:object)=>Function} deps.register ctx.webServer.register 缝
 * @param {{requestRejection:Function}} [deps.connection] 鉴权缝（缺=不鉴权，测试/降级形）
 * @param {()=>object} deps.getConfig 热改现读 config（Config.parse 产物形）
 * @param {(patch:object)=>Promise<object>} [deps.applyPatch] 设置写缝（createApplyPatch 形；缺=写端点 503 如实）
 * @param {string} deps.distDir web/dist 构建物目录
 * @param {(line:string)=>void} [deps.warn]
 * @returns {Function[]} dispose 列表（交 ctx.effect 收敛）
 */
export function registerSettingsRoutes({ register, connection = null, getConfig, applyPatch = null, distDir, warn = () => {} }) {
  const disposers = []
  const statics = staticHandler(distDir)

  const settingsGet = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['GET'])) return
    try {
      const config = getConfig()
      sendJson(res, 200, {
        data: {
          config,
          editable: EDITABLE_PATHS.map((p) => [...p]),
          writable: typeof applyPatch === 'function',
        },
      })
    } catch (error) {
      warn(`[dsh-clsh-search] 设置面读取失败：${error?.message ?? error}`)
      fail(res, 500, 'internal', String(error?.message ?? error))
    }
  }

  const settingsWrite = async (req, res) => {
    if (!authGate(connection, req, res)) return
    if (!methodGuard(req, res, ['PUT', 'POST'])) return
    if (typeof applyPatch !== 'function') {
      return fail(res, 503, 'write_unavailable', '配置写入缝缺失（configEditor 服务未挂载；本部署暂只读）')
    }
    try {
      const body = await readJsonBody(req)
      const result = await applyPatch(body?.patch ?? body)
      if (!result?.ok) {
        const code = result?.code ?? 'internal'
        const status = code === 'not_editable' || code === 'bad_patch' || code === 'invalid' ? 400 : code === 'no_entry' ? 409 : 500
        return fail(res, status, code, result?.message ?? '配置写入失败')
      }
      return sendJson(res, 200, { data: { ok: true, config: result.config } })
    } catch (error) {
      const status = typeof error?.status === 'number' ? error.status : 500
      warn(`[dsh-clsh-search] 设置面写入失败：${error?.message ?? error}`)
      return fail(res, status, typeof error?.code === 'string' ? error.code : 'internal', String(error?.message ?? error))
    }
  }

  const handler = async (req, res) => {
    const pathname = pathnameOf(req)
    if (pathname === `${API_PREFIX}/settings`) {
      if (req.method === 'GET') return settingsGet(req, res)
      return settingsWrite(req, res)
    }
    return statics(req, res)
  }
  disposers.push(register({ kind: 'prefix', path: API_PREFIX, handler }))
  return disposers
}
