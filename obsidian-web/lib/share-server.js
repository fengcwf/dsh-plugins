// share-server — 分享服务入口（T9 / OW-INV-2/6/10、C2 交接契约；0.2.0 fix-ui-port 双模式）
// 服务形态（0.2.0 修订，照 dsh-better-sidebar 路线）：**双模式共用同一面实现**——
//   ① webServer 模式（server.sharePort=null，默认）：createShareHandler 挂 ctx.webServer.register
//     （dsh web 3080 同域 /ob_share，零自有端口）——默认不再开自有端口（3500 与 login-gate 冲突根治）；
//   ② 独立模式（server.sharePort:number，可选）：宿主内独立 node:http listener（独立端口/独立
//   生命周期）——OW-INV-10「可单独关停」达成：close()/share.enabled=false → 监听关闭=连接拒绝。
// 对外契约 3500 /ob_share/<token> = PATH 契约（非端口契约），由 login-gate/nginx 直通反代保持。
// watchdog 安全：listener 任何失败 fail-open（面不启+degraded 留痕），全路径绝不抛出炸宿主。
//
// 面契约（test/share-server.test.mjs 字面双锁）：
//   - 入口 `/ob_share/<token>` 精确前缀 fail-closed：大小写敏感、`/ob_share`（无尾斜杠）不算面内、
//     URL 词法穿越形（raw ../、%2e%2e、%00、%5c、绝对形）一律统一 404；范围外方法→405+allow。
//   - 一切鉴权/存在性/范围失败 = 同一 404 响应体（share.js accessDenied() 冻结四键形逐字节同）；
//     限流（含缺 ip）= 429 统一形；400=请求体形参级（统一泛化形，零内部 message 外泄）；
//     405=面内操作越权（方法/角色/类型不允许；判在 checkAccess 之后，绝不泄露存在性）。
//     管理面可解释错误（sensitive_name/password_required/bad_request 细节）绝不回 guest（C2 ①）。
//   - 访客页 = 服务端 render.js 直出 HTML（live 渲染唯一源 ARC-1，禁前端二次渲染=整页零 <script>）；
//     内容渲染前过脱敏哨兵（lib/redact.js 三层中和+计数，宁可误伤不可漏放）。
//   - guest 写操作只调不重造（vault-ops saveNote/createNote/deletePath/renameNote）：
//     笔记分享（写）=仅内容编辑（乐观锁+diffUndo undo 源）；文件夹分享（写）=目录内新建/编辑/删除/改名
//     （永不静默覆盖 + 双确认 + .trash 可逆 + journal 事务）；范围外/穿越 → 同形 404（穿越防护）。
//   - IP 口径（C2 钉死）：限流 IP = socket.remoteAddress only；仅显式 server.trustProxy 清单才解析
//     X-Forwarded-For 最右可信跳（直连方必须是可信代理，否则 XFF 一律忽略）；IPv4-mapped (::ffff:) 归一。
//   - guest 响应零 vault 路径外泄（path→subPath 映射；diffUndo 快照只含 content/mtime/etag/size/redactCount）。
//   - diffUndo/表单预填一切对外 content 面一律过脱敏哨兵（C-1/I-1 fix r1）：guest 只见脱敏版（Ruling 6
//     不回退；undo 恢复脱敏版与 C5 自洽）；计数如实——每面 redactCount 随行 + 写响应 x-ob-redact-count 头。
//   - 写面中和（C-1 fix r2，C5 口径=guest 保存落盘=脱敏版覆盖）：edit/create 的 incoming 过 redact() 后
//     落盘（盘上=脱敏版逐字节）；读/响应面 redact()=第二道（幂等零新增）。计数语义=面内容中和处数
//     （痕迹计数：含写面与读面两道，同一处只计一次；redact().count=本次新中和次数，两义分野见报告 §4）。
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import {
  checkAccess, createRateLimiter, resolveSharePath, shareAllowsOperation,
  accessDenied, rateLimited, isSensitiveName, SHARE_URL_PREFIX,
} from './share.js'
import { saveNote, createNote, deletePath, renameNote, readNote, resolveInRoot, assertOpenedRealInRoot, isInternalRealPath } from './vault-ops.js'
import { renderMarkdown } from './render.js'
import { redact, REDACTED } from './redact.js'
import { shareCss } from './share-theme.js'

// 面前缀=分享 URL 前缀常量（share.js SHARE_URL_PREFIX 唯一字面来源，OW-US-9 根治 URL 拼接坑）：
// 与链接生成（share-links.buildShareLinks）同源，路径段绝不二次定义/半路拼接。
const FACE_PREFIX = SHARE_URL_PREFIX
const ALLOWED_METHODS = ['GET', 'HEAD', 'POST']
const MAX_BODY_BYTES = 5 * 1024 * 1024
const DEFAULT_SYNC_INTERVAL_MS = 30_000

// 405/400 冻结统一形（四键同构；与 accessDenied()/rateLimited() 同一形制族）
const NOT_ALLOWED = Object.freeze({ ok: false, status: 405, code: 'not_allowed', message: '不支持的请求方法或操作' })
const BAD_REQUEST = Object.freeze({ ok: false, status: 400, code: 'bad_request', message: '请求参数不合法' })

// URL 词法穿越形（raw 域先拒——URL 解析器会把 raw ../ 归一掉，%2e%2e 形 decode 后由 normalizeSub 拒）
const DOT_SEG_RE = /(?:^|\/)\.{1,2}(?:\/|$)/
const DOT_SEG_ENC_RE = /(?:^|\/)%2e%2e?(?:\/|$)/i

const TEXT_RAW_EXT = new Set(['.txt', '.md', '.markdown', '.json', '.csv', '.tsv', '.yaml', '.yml', '.log', '.xml', '.ini', '.cfg', '.toml'])

// ── IP 口径（C2：socket.remoteAddress only / 显式可信代理才解析 XFF）──────────────
/** IPv4-mapped 归一（::ffff:a.b.c.d → a.b.c.d）——服务端观察值，非客户端可控 */
function canonIp(ip) {
  const s = typeof ip === 'string' ? ip.trim() : ''
  return /^::ffff:\d+\.\d+\.\d+\.\d+$/.test(s) ? s.slice('::ffff:'.length) : s
}

/**
 * 访客 IP 口径（C2 钉死）：默认=socket.remoteAddress only，XFF 一律忽略（客户端可伪造 → 换桶绕限流）。
 * 仅当显式 trustProxy 清单且直连方本身是可信代理时才解析 XFF，取最右可信跳（从右往左跳过可信代理跳，
 * 第一个非可信地址=客户端；全链可信 → 最左原始客户端）。
 * @param {object} req node:http 请求（取 socket.remoteAddress 与 headers）
 * @param {string[]} [trustProxy] 显式可信代理清单（缺省/空=不信任任何 XFF）
 */
export function guestIp(req, trustProxy = []) {
  const direct = canonIp(req?.socket?.remoteAddress)
  const trusted = Array.isArray(trustProxy) ? trustProxy.map(canonIp).filter(Boolean) : []
  if (direct === '') return ''
  if (trusted.length === 0 || !trusted.includes(direct)) return direct // 未配可信代理/直连方非可信代理：XFF 忽略
  const xff = req?.headers?.['x-forwarded-for']
  const raw = Array.isArray(xff) ? xff.join(',') : typeof xff === 'string' ? xff : ''
  const hops = raw.split(',').map(canonIp).filter(Boolean)
  for (let i = hops.length - 1; i >= 0; i--) {
    if (!trusted.includes(hops[i])) return hops[i]
  }
  return hops[0] ?? direct
}

// ── 响应原语（同形体 + HTML 面）────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function sendJson(res, status, body, extra = {}, headOnly = false) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extra,
  })
  res.end(headOnly ? undefined : JSON.stringify(body))
}

function sendHtml(res, status, html, extra = {}, headOnly = false) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    // OW-INV-6 纵深：禁一切脚本与外源（分享页=纯服务端直出）
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
    ...extra,
  })
  res.end(headOnly ? undefined : html)
}

const notFound = (res, headOnly) => sendJson(res, 404, accessDenied(), {}, headOnly)
const rateLimitedRes = (res, headOnly) => sendJson(res, 429, rateLimited(), {}, headOnly)
const notAllowed = (res, headOnly) => sendJson(res, 405, NOT_ALLOWED, { allow: ALLOWED_METHODS.join(', ') }, headOnly)
const badRequest = (res, headOnly) => sendJson(res, 400, BAD_REQUEST, {}, headOnly)

/** vault-ops 抛错 → guest 面映射：形参级 400 泛化形；其余（not_found/io_error/未知）fail-closed 同形 404 */
function mapThrown(res, err, headOnly) {
  if (err?.code === 'bad_request') return badRequest(res, headOnly)
  return notFound(res, headOnly) // 内部细节零外泄（C2 ①）
}

// ── guest 响应脱路径（vault 路径零外泄）+ 对外 content 面一律脱敏（C-1/I-1）+ 写面中和（C-1 fix r2）──
/** 中和处数（痕迹计数）：面内容 `<redacted>` 计数——写面落盘前中和与读/响应面渲染前中和同一处只计一次
 *（fix r2 计数口径，见报告 §4 计数头语义分野）；redact().count=本次新中和次数（幂等二过为 0），两义分野。 */
function countMarks(text) {
  return String(text).split(REDACTED).length - 1
}

/** 对外 content 面（diffUndo before/after/incoming）：一律过哨兵 + 计数如实随行 */
function contentPublic(raw) {
  const { text } = redact(raw) // guest 只见脱敏版（Ruling 6 不回退；写面已中和内容幂等零新增）
  return { content: text, redactCount: countMarks(text) }
}

function snapPublic(s) {
  return { ...contentPublic(s.content), mtime: s.mtime, etag: s.etag, size: s.size }
}

/** diffUndo 计数如实：本响应 content 面中和总数（x-ob-redact-count 头等价通道） */
function diffRedactTotal(pub) {
  return [pub.diffUndo?.before, pub.diffUndo?.after, pub.diffUndo?.incoming]
    .reduce((n, f) => n + (f?.redactCount ?? 0), 0)
}

function editResultPublic(subPath, result) {
  if (result.conflict === true) {
    return {
      conflict: true,
      subPath,
      diffUndo: { before: snapPublic(result.diffUndo.before), incoming: contentPublic(result.diffUndo.incoming.content) },
    }
  }
  return {
    ok: true,
    subPath,
    mtime: result.mtime,
    etag: result.etag,
    size: result.size,
    diffUndo: { before: snapPublic(result.diffUndo.before), after: snapPublic(result.diffUndo.after) },
  }
}

function renameResultPublic(subPath, to, result) {
  return {
    ok: result.ok === true,
    reason: result.reason,
    subPath,
    to,
    renamed: result.ok === true,
    rolledBack: result.rolledBack === true,
    changedCount: result.changed?.length ?? 0,
    rewrittenCount: result.rewritten?.length ?? 0,
    skippedCount: result.skipped?.length ?? 0,
    warningsCount: result.warnings?.length ?? 0,
  }
}

// ── 页面模板（服务端直出；整页零 <script> = 禁前端二次渲染）────────────────────
// 样式=shareCss()（ARC-5 分享页 token 快照导出：--dsw-* 快照内联，独立可离线零外链——
// 规则区零色值字面量，主 UI/分享页同 token 名零漂移；锁形 test/share-theme.test.mjs）
function shell(title, body) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>
${shareCss()}
</style>
</head>
<body>
${body}
</body>
</html>`
}

function redactNotice(count) {
  return count > 0 ? `<p class="ob-redact">⚠ 脱敏哨兵：已中和 ${count} 处疑似敏感内容</p>` : ''
}

function tocHtml(toc) {
  if (!Array.isArray(toc) || toc.length === 0) return ''
  const items = toc.map((t) => `<li class="l${t.level}"><a href="#${escapeHtml(t.id)}">${escapeHtml(t.text)}</a></li>`).join('')
  return `<nav class="ob-toc"><ol>${items}</ol></nav>`
}

function passwordField(password) {
  return password ? `<input type="hidden" name="password" value="${escapeHtml(password)}">` : ''
}

function editForm({ content, mtime, password }) {
  return `<form method="POST">
<input type="hidden" name="op" value="edit">
<input type="hidden" name="expectedMtime" value="${escapeHtml(String(mtime))}">
${passwordField(password)}
<label>内容（保存=全量覆盖）</label>
<textarea name="content" rows="14">${escapeHtml(content)}</textarea>
<button type="submit">保存</button>
</form>`
}

function noteBody({ heading, meta, notice, toc, renderedHtml, forms }) {
  return `<header><h1>${escapeHtml(heading)}</h1><p class="meta">${escapeHtml(meta)}</p></header>
${notice}
${tocHtml(toc)}
<main>${renderedHtml}</main>
${forms}`
}

// ── 请求体读取（JSON / urlencoded；超限/坏形 → bad_request 泛化形）────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let overflow = false
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        overflow = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (overflow) {
        reject(Object.assign(new Error('body overflow'), { code: 'bad_request' }))
        return
      }
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw === '') {
        resolve({})
        return
      }
      const ct = String(req.headers['content-type'] ?? '')
      const asForm = () => {
        const obj = {}
        for (const [k, v] of new URLSearchParams(raw)) obj[k] = v
        return obj
      }
      const asJson = () => JSON.parse(raw)
      try {
        if (ct.includes('application/x-www-form-urlencoded')) resolve(asForm())
        else if (ct.includes('json')) resolve(asJson()) // JSON 形坏体一律 400（不静默降级）
        else resolve(raw.trim().startsWith('{') ? asJson() : asForm())
      } catch {
        reject(Object.assign(new Error('bad body'), { code: 'bad_request' }))
      }
    })
    req.on('error', () => reject(Object.assign(new Error('bad body'), { code: 'bad_request' })))
  })
}

// ── 目录列表（C2 #3：敏感名/内部段/点文件/symlink 零出条目）────────────────────
function listVisible(absDir) {
  let dirents
  try {
    dirents = fs.readdirSync(absDir, { withFileTypes: true })
  } catch {
    return null
  }
  const out = []
  for (const d of dirents) {
    const name = d.name
    if (name.startsWith('.')) continue // 点文件与内部段（.trash/.ob-share）不出条目
    if (isSensitiveName(name)) continue // 敏感名不出条目（OW-INV-1 清单同源）
    if (d.isSymbolicLink()) continue // symlink 不出条目（guest 面纵深）
    if (d.isDirectory()) out.push({ name, type: 'dir' })
    else if (d.isFile()) out.push({ name, type: 'file' })
  }
  out.sort((a, b) => (a.type === b.type ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.type === 'dir' ? -1 : 1))
  return out
}

// ── 类型级操作门（T8 矩阵语义：笔记分享（写）=仅内容编辑；文件夹分享（写）=目录内四操作）────
// 目标级判定仍以 shareAllowsOperation 为单一权威（isSelf/角色/类型逐项）；此门只定 405/404 映射序
// （类型/角色不支持的操作=405，与目标无关；目标越界/敏感/穿越=404）。
function opSupported(share, op) {
  if (!share || share.role !== 'write') return false // 只读角色：一切写操作 405
  if (share.targetType === 'file') return op === 'edit' // 笔记分享（写）=仅内容编辑
  if (share.targetType === 'dir') return op === 'create' || op === 'edit' || op === 'delete' || op === 'rename'
  return false
}

const REASON_TEXT = {
  'target-exists': '目标已存在（永不静默覆盖）',
  'parent-missing': '父目录不存在',
  'confirm-missing': '缺双确认（未删除）',
  'confirm-mismatch': '双确认复述不符（未删除）',
  'not-found': '目标不存在',
  'not-a-file': '目标类型不支持',
  'move-failed': '移入回收站失败（源未动）',
  'in-trash': '回收站条目不可再删',
  'same-path': '新旧路径相同',
  'concurrent-modification': '并发修改冲突（已回滚，请重试）',
  'transaction-failed': '事务失败（已整体回滚）',
  'journal-limit': '事务超出限额（已整体回滚）',
}

// ── createShareServer：独立 listener 生命周期（OW-INV-10 可单独关停）────────────
// 0.2.0 fix-ui-port（照 dsh-better-sidebar 路线，问题 A 裁定）：双模式共用本实现——
//   - webServer 模式（server.sharePort=null，默认）：createShareHandler 取面处理器挂
//     ctx.webServer.register({kind:'prefix', path:'/ob_share', handler})（dsh web 3080 同域，零自有端口）；
//   - 独立模式（server.sharePort:number，可选）：本工厂起自有 listener（照旧可单独关停）。
//   watchdog 安全（掉服务根因回归）：端口占用/任何 listener 失败 → **fail-open**——该次 boot 面不启
//   + degraded 留痕，start()/syncState()/handle() 全路径绝不 reject/绝不抛出（unhandledRejection
//   杀宿主进程=watchdog 判死 dsh 掉服务的根因链）；syncState 定时自愈重试（同口同面）。
/**
 * @param options {{getConfig: () => object, port?: number, host?: string, syncIntervalMs?: number,
 *                  warn?: (line: string) => void}}
 * @returns {{start: () => Promise<{listening: boolean, port?: number, reason?: string}>,
 *            syncState: () => Promise<{listening: boolean}>,
 *            close: () => Promise<void>, listening: () => boolean,
 *            handle: (req, res) => Promise<void>,
 *            address: () => {port: number, host: string} | null}}
 */
export function createShareServer(options = {}) {
  const getConfig = typeof options.getConfig === 'function' ? options.getConfig : () => ({})
  const port = Number.isInteger(options.port) ? options.port : 0
  const host = typeof options.host === 'string' && options.host !== '' ? options.host : '127.0.0.1'
  const syncIntervalMs = options.syncIntervalMs === undefined ? DEFAULT_SYNC_INTERVAL_MS : options.syncIntervalMs
  // 留痕出口（INV-15 禁静默）：缺省回落 console.warn（行为不丢、绝不静默）
  const warn = typeof options.warn === 'function' ? options.warn : console.warn
  const limiter = createRateLimiter() // 120/min 滑窗（OW-INV-2b），判在查表前
  let server = null
  let timer = null
  let boundPort = null // 首绑实得端口（port=0 模式）；热禁用/再启用同面同口（面回来=同一入口）

  const safeConfig = () => {
    try {
      return getConfig() ?? {}
    } catch {
      return {} // 配置读取异常 fail-closed（热禁用语义：当作不可用面）
    }
  }

  function closeServer() {
    return new Promise((resolve) => {
      if (!server) {
        resolve()
        return
      }
      const s = server
      server = null
      try {
        s.closeAllConnections?.() // 关停演练：面立即消失（keep-alive 不吊命）
      } catch { /* 尽力而为 */ }
      s.close(() => resolve())
    })
  }

  function listen() {
    return new Promise((resolve) => {
      const s = http.createServer((req, res) => {
        void handle(req, res)
      })
      let settled = false
      const settle = (value) => {
        if (!settled) {
          settled = true
          resolve(value)
        }
      }
      // 永久 error 监听（非 once）：绑定失败=端口占用（login-gate 3500 冲突面）与运行期错误
      // 一律 fail-open——绝不 reject（API 级绝不抛出）+ 不留无监听 error 事件（unhandled 'error'
      // 同样会炸宿主进程）。失败留痕 degraded（INV-15），syncState 定时自愈重试（同口同面）。
      s.on('error', (err) => {
        if (server === s) server = null
        try {
          warn(`[obsidian-web] 分享面监听失败（fail-open：该次不启面，syncState 自愈重试，绝不炸装载/宿主）：${err?.message ?? err}`)
        } catch { /* 留痕失败不二阶炸 */ }
        settle({ listening: false, reason: 'listen_failed' })
      })
      s.listen(boundPort ?? port, host, () => {
        server = s
        boundPort = s.address()?.port ?? boundPort
        settle({ listening: true, port: boundPort })
      })
    })
  }

  async function start() {
    const cfg = safeConfig()
    if (cfg.share?.enabled === false) return { listening: false, reason: 'share_disabled' } // 面整体关（不绑定）
    if (server) return { listening: true, port: server.address()?.port }
    if (syncIntervalMs > 0) {
      timer = setInterval(() => {
        void syncState().catch((err) => {
          try {
            warn(`[obsidian-web] 分享面自愈重试异常（fail-open 不炸宿主）：${err?.message ?? err}`)
          } catch { /* 留痕失败不二阶炸 */ }
        })
      }, syncIntervalMs)
      timer.unref?.() // 不吊命（关停=面消失语义不被定时器干扰）
    }
    return await listen()
  }

  async function syncState() {
    const cfg = safeConfig()
    const should = cfg.share?.enabled !== false
    if (should && !server) return await listen()
    if (!should && server) {
      await closeServer()
      return { listening: false }
    }
    return { listening: server !== null }
  }

  async function close() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    await closeServer()
  }

  // ── 单请求处理（顺序敏感：热禁用 → 前缀 → 限流 → 校验 → 范围 → 方法 → 操作）────────
  // handle=对外形：全路径 fail-closed 网兜——任何未预期异常绝不变成 unhandledRejection
  //（watchdog 掉服务根因=未处理拒绝杀宿主进程），一律收敛统一 404/400 形 + 留痕。
  async function handle(req, res) {
    try {
      await handleInner(req, res)
    } catch (err) {
      try {
        if (!res.headersSent) mapThrown(res, err, req.method === 'HEAD')
        else res.destroy()
      } catch { /* 尽力而为 */ }
      try {
        warn(`[obsidian-web] 分享面请求处理异常（fail-closed 统一形，不炸宿主）：${err?.message ?? err}`)
      } catch { /* 留痕失败不二阶炸 */ }
    }
  }

  async function handleInner(req, res) {
    const headOnly = req.method === 'HEAD'
    // 0. 热禁用：统一 404 + 面整体关（自关收敛）
    const cfg = safeConfig()
    if (cfg.share?.enabled === false) {
      notFound(res, headOnly)
      void syncState().catch(() => {}) // 自关收敛 fail-open（绝不 unhandledRejection）
      return
    }
    const root = typeof cfg.vaultRoot === 'string' ? cfg.vaultRoot : ''
    if (root === '') {
      notFound(res, headOnly)
      return
    }
    // 1. 精确前缀 fail-closed（词法穿越形先拒；decode 失败同形；前缀按 raw 形核——%2F 借道不算面内）
    const rawUrl = String(req.url ?? '')
    const rawPath = rawUrl.split('?')[0]
    if (DOT_SEG_RE.test(rawPath) || DOT_SEG_ENC_RE.test(rawPath)) {
      notFound(res, headOnly)
      return
    }
    let url
    let rawPathname
    try {
      url = new URL(rawUrl, 'http://localhost')
      rawPathname = url.pathname
    } catch {
      notFound(res, headOnly)
      return
    }
    if (!rawPathname.startsWith(FACE_PREFIX)) {
      notFound(res, headOnly) // 范围外路径：统一 404（含 /ob_share、/ob_sharex、大小写形、%2F 借道形）
      return
    }
    let rest
    try {
      rest = decodeURIComponent(rawPathname.slice(FACE_PREFIX.length))
    } catch {
      notFound(res, headOnly)
      return
    }
    const slash = rest.indexOf('/')
    const token = slash === -1 ? rest : rest.slice(0, slash)
    const subRaw = slash === -1 ? '' : rest.slice(slash + 1)
    // 2. IP + 限流（判在查表前：响应只取决于 IP，token 有效性不得影响；缺 ip fail-closed 429）
    const ip = guestIp(req, cfg.server?.trustProxy)
    if (ip === '' || !limiter.check(ip).allowed) {
      rateLimitedRes(res, headOnly)
      return
    }
    // 3. 访客校验（模型层：一切失败=同形 404；密码走 query/header）
    const headerPw = req.headers['x-ob-share-password']
    const password = typeof headerPw === 'string' && headerPw !== ''
      ? headerPw
      : (url.searchParams.get('password') ?? undefined)
    let access
    try {
      access = await checkAccess(root, { token, password, ip }, { config: cfg })
    } catch {
      notFound(res, headOnly) // fail-closed（checkAccess 内部已信封，此处双保险）
      return
    }
    if (!access.ok) {
      sendJson(res, access.status ?? 404, access, {}, headOnly) // 404 四键形 / 429 统一形
      return
    }
    const share = access.share
    // 4. 范围解析（fail-closed 同形 404；含内部段/敏感名/穿越/绝对形）
    const resolved = resolveSharePath(share, subRaw)
    if (!resolved.ok) {
      notFound(res, headOnly)
      return
    }
    // 5. 方法门（checkAccess 之后：405 绝不先于 404，不泄露存在性）
    if (!ALLOWED_METHODS.includes(req.method)) {
      notAllowed(res, headOnly)
      return
    }
    const state = { root, share, subRaw, resolved, password, headOnly, cfg }
    try {
      if (req.method === 'POST') await serveWrite(req, res, state)
      else await serveRead(res, state)
    } catch (err) {
      if (!res.headersSent) mapThrown(res, err, headOnly) // 内部异常 fail-closed（C2 ①）
      else res.destroy()
    }
  }

  // ── 读面：live 渲染直出（render.js 唯一源 + 脱敏哨兵前置）────────────────────
  async function serveRead(res, state) {
    const { root, share, subRaw, resolved, password, headOnly } = state
    if (!shareAllowsOperation(share, 'read', subRaw)) {
      notFound(res, headOnly) // read 恒真于合法解析（纵深保险）
      return
    }
    let st
    let abs
    try {
      abs = resolveInRoot(root, resolved.path)
      st = fs.lstatSync(abs)
    } catch {
      notFound(res, headOnly)
      return
    }
    // F1 咽喉（share-server 读写面 realpath 前缀判定，与名字级判定并存不替换）：最终真实节点落
    // <rootReal>/.ob-share、<rootReal>/.trash 前缀=内部落点，guest 面一律 404（fail-closed）——
    // 别名（→.ob-share/.trash）下目录列表/读/下载全断（in-root 目录别名经 share-server 触达内部段封死）。
    if (isInternalRealPath(root, abs)) {
      notFound(res, headOnly)
      return
    }
    if (st.isSymbolicLink()) {
      notFound(res, headOnly) // guest 面 symlink 门（不解引用；realpath 围栏已归位（T12），本门=表面纵深）
      return
    }
    const hrefOf = (segs) => `${FACE_PREFIX}${encodeURIComponent(share.token)}${segs.length ? `/${segs.map(encodeURIComponent).join('/')}` : ''}`
    const subSegs = subRaw.split('/').filter(Boolean)
    const backHref = hrefOf(subSegs.slice(0, -1))
    const pwQ = password ? `?password=${encodeURIComponent(password)}` : ''

    if (st.isDirectory()) {
      const entries = listVisible(abs)
      if (entries === null) {
        notFound(res, headOnly)
        return
      }
      const items = entries
        .map((e) => `<li><a href="${escapeHtml(`${hrefOf([...subSegs, e.name])}${pwQ}`)}">${escapeHtml(e.name)}</a>${e.type === 'dir' ? '/' : ''}</li>`)
        .join('')
      const createForm = shareAllowsOperation(share, 'create', `${subRaw ? `${subRaw}/` : ''}__probe__.md`)
        ? `<form method="POST">
<input type="hidden" name="op" value="create">
${passwordField(password)}
<label>新建笔记（文件名）</label>
<input type="text" name="name" placeholder="new-note.md">
<label>初始内容</label>
<textarea name="content" rows="6"></textarea>
<button type="submit">新建</button>
</form>`
        : ''
      const body = `<header><h1>${escapeHtml(subRaw === '' ? path.basename(resolved.path) || '分享目录' : subSegs[subSegs.length - 1])}</h1><p class="meta">分享目录 · ${share.role === 'write' ? '可管理' : '只读'}</p></header>
${subSegs.length ? `<p><a href="${escapeHtml(`${backHref}${pwQ}`)}">↑ 上级</a></p>` : ''}
<ul class="ob-list">${items}</ul>
${createForm}`
      sendHtml(res, 200, shell('分享目录', body), {}, headOnly)
      return
    }
    if (!st.isFile()) {
      notFound(res, headOnly)
      return
    }
    const note = readNote(root, resolved.path)
    const isMd = resolved.path.toLowerCase().endsWith('.md')
    const { text: safeText } = redact(note.content) // 脱敏哨兵前置（宁可误伤不可漏放）
    const count = countMarks(safeText) // 计数=面内容中和处数（痕迹计数，fix r2 口径）
    if (!isMd) {
      const ext = path.extname(resolved.path).toLowerCase()
      const isText = TEXT_RAW_EXT.has(ext)
      let buf
      if (isText) {
        buf = Buffer.from(safeText, 'utf8')
      } else {
        // TOCTOU 收口（T12 口径）：二进制下载 fd 打开 + 打开后复核（assertOpenedRealInRoot：
        // 换物/外逃漂移即 404，内容零外泄——readNote 文本面同款）
        let fd
        try {
          fd = fs.openSync(abs, fs.constants.O_RDONLY)
          assertOpenedRealInRoot(root, abs, fd)
          buf = fs.readFileSync(fd)
        } catch {
          notFound(res, headOnly)
          return
        } finally {
          if (fd !== undefined) fs.closeSync(fd)
        }
      }
      res.writeHead(200, {
        'content-type': isText ? 'text/plain; charset=utf-8' : 'application/octet-stream',
        'content-length': buf.length,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-disposition': 'attachment',
        'x-ob-mtime': String(note.mtime),
        'x-ob-etag': note.etag,
        ...(isText ? { 'x-ob-redact-count': String(count) } : {}),
      })
      res.end(headOnly ? undefined : buf)
      return
    }
    const rendered = renderMarkdown(safeText)
    const forms = shareAllowsOperation(share, 'edit', subRaw)
      ? [
          editForm({ content: safeText, mtime: note.mtime, password }), // 预填脱敏后内容（哨兵不因编辑面旁路）
          ...(share.targetType === 'dir'
            ? [
                `<form method="POST">
<input type="hidden" name="op" value="rename">
${passwordField(password)}
<label>改名/移动到（分享范围内相对路径）</label>
<input type="text" name="to" value="${escapeHtml(subRaw)}">
<button type="submit">改名</button>
</form>`,
                `<form method="POST">
<input type="hidden" name="op" value="delete">
<input type="hidden" name="confirm" value="${escapeHtml(subRaw)}">
${passwordField(password)}
<button type="submit">删除（移入回收站，可逆）</button>
</form>`,
              ]
            : []),
        ].join('\n')
      : ''
    const body = noteBody({
      heading: subSegs[subSegs.length - 1] ?? path.basename(resolved.path),
      meta: `分享笔记 · ${share.role === 'write' ? '可编辑' : '只读'}`,
      notice: redactNotice(count),
      toc: rendered.toc,
      renderedHtml: rendered.html,
      forms,
    })
    sendHtml(
      res,
      200,
      shell(subSegs[subSegs.length - 1] ?? '分享笔记', body),
      { 'x-ob-mtime': String(note.mtime), 'x-ob-etag': note.etag },
      headOnly,
    )
  }

  // ── 写面：乐观锁+undo / trash / 事务 / 穿越防护（只调不重造）─────────────────
  async function serveWrite(req, res, state) {
    const { root, share, subRaw, resolved, password, headOnly } = state
    const wantsHtml = String(req.headers['content-type'] ?? '').includes('application/x-www-form-urlencoded')
    let body
    try {
      body = await readBody(req)
    } catch {
      badRequest(res, headOnly)
      return
    }
    const op = body?.op
    // 操作门先行（类型/角色不支持=405；未知 op 同形）
    if (!opSupported(share, op)) {
      notAllowed(res, headOnly)
      return
    }
    const respond = (data, extraHeaders = {}) => {
      if (wantsHtml) {
        // 表单面计数以页内 redactNotice 可见通道如实呈现（同访客页口径），不叠 x-ob-redact-count 头
        sendHtml(res, 200, formResultPage(state, data, body), {}, headOnly)
        return
      }
      sendJson(res, 200, { data }, extraHeaders, headOnly)
    }

    try {
      if (op === 'edit') {
        if (!shareAllowsOperation(share, 'edit', subRaw)) {
          notAllowed(res, headOnly) // 目录本体不可编辑 / 文件分享非本体
          return
        }
        if (typeof body.content !== 'string') {
          badRequest(res, headOnly)
          return
        }
        const lock = {}
        if (body.expectedMtime !== undefined) lock.expectedMtime = Number(body.expectedMtime)
        if (body.etag !== undefined) lock.etag = String(body.etag)
        // 写面中和（C-1 fix r2，C5 口径）：incoming 过 redact() 后落盘=脱敏版覆盖（undo=脱敏版恢复=自洽）
        const { text: safeContent } = redact(body.content)
        const result = await saveNote(root, resolved.path, safeContent, lock) // 无锁不落盘（抛 bad_request→400）
        const pub = editResultPublic(subRaw, result)
        respond(pub, { 'x-ob-redact-count': String(diffRedactTotal(pub)) }) // diffUndo 计数如实（等价通道）
        return
      }
      if (op === 'create') {
        const name = body.name
        if (typeof name !== 'string' || name === '') {
          badRequest(res, headOnly)
          return
        }
        const newSub = subRaw === '' ? name : `${subRaw}/${name}`
        const rNew = resolveSharePath(share, newSub)
        if (!rNew.ok) {
          notFound(res, headOnly) // 敏感名/穿越/内部段/范围外 → 统一 404（管理面错误不外泄）
          return
        }
        if (!shareAllowsOperation(share, 'create', newSub)) {
          notAllowed(res, headOnly)
          return
        }
        const content = body.content === undefined ? '' : body.content
        if (typeof content !== 'string') {
          badRequest(res, headOnly)
          return
        }
        // 写面中和（C-1 fix r2 同族）：create 的 body.content 同过 redact() 后落盘=脱敏版覆盖
        const result = await createNote(root, rNew.path, redact(content).text) // 永不静默覆盖（target-exists 域结果）
        if (result.ok === true) {
          respond({ ok: true, subPath: newSub, mtime: result.mtime, etag: result.etag, size: result.size })
        } else {
          respond({ ok: false, reason: result.reason, subPath: newSub })
        }
        return
      }
      if (op === 'delete') {
        if (!shareAllowsOperation(share, 'delete', subRaw)) {
          notAllowed(res, headOnly) // 目录本体不可删
          return
        }
        const confirm = body.confirm
        // guest 双确认=subPath 全等复述（删除域契约 confirm=目标相对路径全等复述的 guest 面形）；
        // 确认检查先于一切副作用（deletePath 内再复核 resolved 全等，纵深）
        if (typeof confirm !== 'string' || confirm === '') {
          respond({ ok: false, reason: 'confirm-missing', subPath: subRaw, trashed: false })
          return
        }
        if (confirm !== subRaw) {
          respond({ ok: false, reason: 'confirm-mismatch', subPath: subRaw, trashed: false })
          return
        }
        const result = await deletePath(root, resolved.path, { confirm: resolved.path }) // .trash 可逆
        if (result.ok === true) {
          respond({ ok: true, subPath: subRaw, trashed: true }) // trashPath=内部路径，零外泄
        } else {
          respond({ ok: false, reason: result.reason, subPath: subRaw, trashed: false })
        }
        return
      }
      if (op === 'rename') {
        if (!shareAllowsOperation(share, 'rename', subRaw)) {
          notAllowed(res, headOnly) // 目录本体不可改名
          return
        }
        const to = body.to
        if (typeof to !== 'string' || to === '') {
          badRequest(res, headOnly)
          return
        }
        const rTo = resolveSharePath(share, to)
        if (!rTo.ok) {
          notFound(res, headOnly) // 目标范围外/穿越/敏感 → 统一 404（穿越防护）
          return
        }
        if (!shareAllowsOperation(share, 'rename', to)) {
          notAllowed(res, headOnly) // to=目录本体 → 405
          return
        }
        const result = await renameNote(root, resolved.path, rTo.path, { overwrite: undefined }) // 永不静默覆盖
        respond(renameResultPublic(subRaw, to, result))
        return
      }
      notAllowed(res, headOnly) // 兜底（opSupported 已滤，纵深）
    } catch (err) {
      mapThrown(res, err, headOnly) // 形参级 400 泛化形；其余 fail-closed 同形 404
    }
  }

  /** 表单结果页（无 JS 往返）：成功=反馈+返回；冲突=显式冲突+重试形态（新锁+盘上最新内容） */
  function formResultPage(state, data, reqBody) {
    const { root, resolved, password, subRaw } = state
    const back = `${FACE_PREFIX}${encodeURIComponent(state.share.token)}${subRaw ? `/${subRaw.split('/').filter(Boolean).map(encodeURIComponent).join('/')}` : ''}${password ? `?password=${encodeURIComponent(password)}` : ''}`
    if (data.conflict === true) {
      let retry = ''
      let retryNotice = ''
      try {
        const fresh = readNote(root, resolved.path)
        // I-1：冲突表单预填同过哨兵（同页渲染脱敏、表单不得给原文——与访客页 :564 同口径）；计数如实可见
        const { text: freshSafe } = redact(fresh.content)
        retry = editForm({ content: freshSafe, mtime: fresh.mtime, password })
        retryNotice = redactNotice(countMarks(freshSafe)) // 计数=面内容中和处数（痕迹计数，fix r2 口径）
      } catch { /* 读不到就不给重试形态（结果页本身已说明冲突） */ }
      return shell('保存冲突', `<header><h1>保存冲突</h1></header>
<p>冲突：内容已被他人修改，本次未落盘。以下为盘上最新内容（脱敏后），请复核后重试（OW-INV-3 冲突显式三选的数据基础：盘上内容/本次内容都在）。</p>
${retryNotice}
${retry}
<p><a href="${escapeHtml(back)}">返回</a></p>`)
    }
    const text = data.ok === true
      ? (reqBody?.op === 'create' ? '已创建' : reqBody?.op === 'delete' ? '已删除（移入回收站，可逆）' : reqBody?.op === 'rename' ? '已改名' : '已保存')
      : `操作未完成：${REASON_TEXT[data.reason] ?? data.reason ?? '未知原因'}`
    return shell(data.ok === true ? '操作成功' : '操作未完成', `<header><h1>${data.ok === true ? '操作成功' : '操作未完成'}</h1></header>
<p>${escapeHtml(text)}</p>
<p><a href="${escapeHtml(back)}">返回</a></p>`)
  }

  return {
    start,
    syncState,
    close,
    handle,
    listening: () => server !== null,
    address: () => {
      const a = server?.address()
      return a && typeof a === 'object' ? { port: a.port, host: a.address } : null
    },
  }
}

/**
 * createShareHandler — 分享面单请求处理器（webServer 挂载模式，0.2.0 fix-ui-port 问题 A 裁定）。
 * 零自有 listener：面契约与独立模式**同一实现**（createShareServer 的 handle，面口径零分叉），
 * 由调用方挂 ctx.webServer.register({kind:'prefix', path:'/ob_share', handler})。
 * 热禁用语义照旧由 share.enabled=false 承担（handler 首步统一 404=面消失）。
 * @param options {{getConfig: () => object, warn?: (line: string) => void}}
 * @returns {(req, res) => Promise<void>} node:http 风格请求处理器
 */
export function createShareHandler(options = {}) {
  // syncIntervalMs=0：handler-only 无 listener 生命周期，不起自愈定时器（无面可起）
  return createShareServer({ ...options, syncIntervalMs: 0 }).handle
}
