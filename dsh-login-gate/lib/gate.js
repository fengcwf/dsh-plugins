// dsh-login-gate — 门禁 HTTP 服务器：登录页 / 会话校验 / 限速 / 转发
// 端点：
//   GET  /__gate/login      登录页（已登录则跳转 next）
//   POST /__gate/login      校验账号密码 → Set-Cookie → 跳回 next
//   POST /__gate/logout     注销当前会话
//   POST /__gate/logout-all 轮换签名 secret，作废全部已发会话（需已登录）
//   GET  /__gate/health     健康检查（无认证）{ok,users,mode}
//   GET  /__gate/status     当前会话信息（需登录）
//   其余路径                 需登录 → 认证反代转发
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { verifyPassword } from './auth.js'
import { renderLogin } from './login-page.js'
import { filterAnonymousRules } from './anon-rules.js'

const MAX_BODY = 8 * 1024

// 匿名放行的硬否定形（先于前缀匹配生效，防「放行前缀」被借道出前缀之外）：
//   - 点段 `..` / `.`（含百分号编码形 %2e%2e / %2f 编码斜杠，大小写不敏感）→ 路径越界形
//     与上游 obsidian-web lib/share-server.js:58-59 同口径（DOT_SEG_RE / DOT_SEG_ENC_RE）
//   - 段分隔符族 `;` / NUL(%00) / 反斜杠：某些栈把 `;` 当参数分隔符（`..;` 即绕点段匹配）、
//     `%00` 截断后续检查、`\` 被上游当分隔符（Windows 语义）——均为借道形
//     上游同族判据只到 `.`（DOT_SEG_RE = /(?:^|\/)\.{1,2}(?:\/|$)/，不含 ; 与任意长点串），
//     本门禁取**更宽口径**：段内任意长度点串 + 上述分隔符一并硬否定（纵深防御不依赖上游）
//   - 编码斜杠 `%2f`（大小写不敏感）→ 点段借道形（..%2f..%2f 经解码即 ../../）
const ANON_DOT_SEG_RE = /(?:^|\/)\.+(?:\/|;|$|%00|\\)/i
const ANON_DOT_SEG_ENC_RE = /%2e/i
const ANON_ENC_SLASH_RE = /%2f/i
const ANON_NUL_RE = /%00/i
const ANON_METHODS = new Set(['GET', 'HEAD']) // 仅只读方法；写方法一律不放行

/** 解析 application/x-www-form-urlencoded 请求体（≤8KB） */
function readForm(req) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) { req.destroy(); resolve(null) }
      else chunks.push(c)
    })
    req.on('end', () => {
      try {
        const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
        const out = {}
        for (const [k, v] of params) out[k] = v
        resolve(out)
      } catch { resolve(null) }
    })
    req.on('error', () => resolve(null))
  })
}

/**
 * 创建门禁服务器（未监听；由调用方 listen）。
 * @param {object} o
 * @param {Record<string,string>} o.users        账号表 {user: scrypt$...}
 * @param {ReturnType<import('./auth.js').createSessionManager>} o.sessions
 * @param {ReturnType<import('./ratelimit.js').createRateLimiter>} o.limiter
 * @param {{forward:Function, forwardUpgrade:Function}} o.forwarder
 * @param {() => void} o.onLogoutAll   轮换 secret（作废全部会话）
 * @param {() => string} o.sessionMode 原生会话注入模式 A/B/C（展示用）
 * @param {boolean} o.secureCookie
 * @param {number} o.sessionDays
 * @param {string[]} [o.httpAnonymous] HTTP 匿名放行前缀（正则串数组；默认空 = 不放行任何路径）
 * @param {(msg:string)=>void} o.log
 */
export function createGateServer(o) {
  const { users: staticUsers, getUsers, sessions, limiter, forwarder, onLogoutAll, sessionMode, secureCookie, sessionDays, httpAnonymous = [], log } = o
  // 账号表：支持热加载供给器（usersFile 变更无需重启），缺省退回静态表
  const usersNow = () => (typeof getUsers === 'function' ? getUsers() : (staticUsers ?? {}))
  const hasUsers = () => Object.keys(usersNow()).length > 0
  const cookieName = sessions.cookieName
  // 用户名未命中时的哑校验（耗时与真实 scrypt 对齐，防用户名枚举）
  const dummyHash = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

  const clientIp = (req) => {
    const ra = req.socket.remoteAddress ?? 'unknown'
    const isPrivate = ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1' ||
      /^10\./.test(ra) || /^192\.168\./.test(ra) || /^172\.(1[6-9]|2\d|3[01])\./.test(ra)
    if (isPrivate) {
      const xff = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
      if (xff) return xff
    }
    return ra
  }

  const sessionCookie = (token) =>
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax${secureCookie ? '; Secure' : ''}; Max-Age=${sessionDays * 86400}`
  const clearCookie = () =>
    `${cookieName}=; Path=/; HttpOnly; SameSite=Lax${secureCookie ? '; Secure' : ''}; Max-Age=0`

  const sendHtml = (res, status, html) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(html)
  }
  const redirect = (res, to, setCookie) => {
    const headers = { location: to, 'cache-control': 'no-store' }
    if (setCookie) headers['set-cookie'] = setCookie
    res.writeHead(302, headers)
    res.end()
  }
  const sendJson = (res, status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(obj))
  }

  // 请求跳转目标校验：必须是站内绝对路径；拒绝协议相对（//、/\）、CRLF 注入、反斜杠
  const safeNext = (v) => (typeof v === 'string' && /^\/(?!\/)[^\r\n\\]*$/.test(v)) ? v : '/'

  // ── HTTP 匿名放行（默认空 = 零开口）—— 配置驱动，判定在会话校验之前 ──
  // 语义：**锚定前缀 + 只读方法双锁**。不是「免登」：门禁只是决定要不要把请求交给上游，
  // 真正的授权仍由上游（分享面）自己做——坏 token / 过期 / 撤销的响应体门禁一律不改写。
  //
  // F1 治理（装载层兜底，与写入面 settings-write.js 共用 lib/anon-rules.js 同一判据）：
  // 规则内容不满足「锚定前缀」契约（未锚定/纯通配/零宽锚点/目标不绝对）→ **丢该条 + 告警一行**，
  // 绝不静默、绝不炸装载。这样即便配置绕开写入面（cordis.patch.yml 直写 / 老 profile）
  // 也不会把放行面翻成整站。坏正则项由下方编译 catch 收敛（该条不生效）。
  const { rules: anonRuleStrings, dropped: anonDropped } = filterAnonymousRules(httpAnonymous)
  for (const d of anonDropped) {
    const shown = typeof d.rule === 'string' ? JSON.stringify(d.rule) : Object.prototype.toString.call(d.rule)
    log?.(`⚠️ httpAnonymous 规则已丢弃（${d.reason}）：${shown}（合法形=以 ^ 开头、目标为 / 绝对前缀、非通配）`)
  }
  const anonRules = []
  for (const s of anonRuleStrings) {
    try { anonRules.push({ rule: s, re: new RegExp(s) }) } catch { /* 坏正则=该条不生效（不炸装载） */ }
  }
  const anonHit = (method, path) =>
    anonRules.length > 0 &&
    ANON_METHODS.has(String(method ?? '').toUpperCase()) &&
    // 越界硬否定：点段族 / 点段编码 / 编码斜杠 / NUL / 反斜杠（任一命中一律不放行）
    !path.includes('\\') &&
    !ANON_DOT_SEG_RE.test(path) && !ANON_DOT_SEG_ENC_RE.test(path) &&
    !ANON_ENC_SLASH_RE.test(path) && !ANON_NUL_RE.test(path) &&
    anonRules.some((r) => r.re.test(path))

  const server = createServer(async (req, res) => {
    const url = req.url ?? '/'
    const path = url.split('?')[0]

    // ── 门禁端点 ──
    if (path === '/__gate/health') {
      return sendJson(res, 200, { ok: true, users: Object.keys(usersNow()).length, mode: sessionMode() })
    }
    if (path === '/__gate/login') {
      if (req.method === 'POST') {
        const ip = clientIp(req)
        const gate = limiter.check(ip)
        if (!gate.ok) {
          res.writeHead(429, { 'retry-after': String(gate.retryAfter), 'content-type': 'text/plain; charset=utf-8' })
          return res.end(`尝试过于频繁，请 ${gate.retryAfter} 秒后再试`)
        }
        const form = await readForm(req)
        if (!form) return sendHtml(res, 400, renderLogin({ error: '请求无效', usersConfigured: hasUsers(), sessionDays }))
        const user = String(form.u ?? '').trim()
        const pass = String(form.p ?? '')
        const stored = usersNow()[user]
        const ok = verifyPassword(pass, stored ?? dummyHash) && Boolean(stored)
        if (!ok) {
          limiter.recordFailure(ip)
          log?.(`登录失败：user=${user || '(空)'} ip=${ip}`)
          return sendHtml(res, 401, renderLogin({ error: '用户名或密码错误', next: safeNext(form.next), usersConfigured: hasUsers(), sessionDays }))
        }
        limiter.recordSuccess(ip)
        const token = sessions.issue(user, sessionDays * 86400)
        log?.(`登录成功：user=${user} ip=${ip}`)
        return redirect(res, safeNext(form.next), sessionCookie(token))
      }
      // GET：展示登录页
      const session = sessions.verifyCookie(req.headers.cookie)
      if (session) {
        const next = safeNext(new URL(url, 'http://x').searchParams.get('next'))
        return redirect(res, next)
      }
      const next = safeNext(new URL(url, 'http://x').searchParams.get('next'))
      return sendHtml(res, 200, renderLogin({ next, usersConfigured: hasUsers(), sessionDays }))
    }
    if (path === '/__gate/logout' && req.method === 'POST') {
      return redirect(res, '/__gate/login', clearCookie())
    }
    if (path === '/__gate/logout-all' && req.method === 'POST') {
      const session = sessions.verifyCookie(req.headers.cookie)
      if (!session) return sendJson(res, 401, { ok: false, error: '未登录' })
      onLogoutAll()
      log?.(`user=${session.u} 执行 logout-all：全部会话已作废`)
      return redirect(res, '/__gate/login', clearCookie())
    }
    if (path === '/__gate/status') {
      const session = sessions.verifyCookie(req.headers.cookie)
      if (!session) return sendJson(res, 401, { ok: false, error: '未登录' })
      return sendJson(res, 200, { ok: true, user: session.u, exp: session.exp, mode: sessionMode() })
    }

    // ── HTTP 匿名放行（命中 = 免会话直通，与下方同一 forwarder.forward 通道）──
    if (anonHit(req.method, path)) {
      // F4：审计行主 ip 用**连接级观察值**（socket.remoteAddress，服务端可见、访客不可伪造）。
      // clientIp() 在私网/回环来源下会采信访客可控的 X-Forwarded-For 首跳（gate.js:72-81），
      // 匿名面日志记 XFF = 把「谁访问了分享面」这条证据链交给访客改写。故 XFF 仅作附加上下文
      // （xff=，可为空）且不参与主 ip。
      const auditIp = req.socket?.remoteAddress ?? 'unknown'
      const rawXff = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
      log?.(`匿名放行：${req.method} ${url} ip=${auditIp}${rawXff ? ` xff=${rawXff}(不可信,仅附注)` : ''}`)
      try {
        await forwarder.forward(req, res)
      } catch (e) {
        if (!res.headersSent) { res.writeHead(502); res.end('bad gateway: ' + e.message) }
        else res.destroy()
      }
      return
    }

    // ── 其余路径：认证后转发 ──
    const session = sessions.verifyCookie(req.headers.cookie)
    if (!session) {
      const next = safeNext(url)
      return redirect(res, `/__gate/login?next=${encodeURIComponent(next)}`)
    }
    try {
      await forwarder.forward(req, res)
    } catch (e) {
      if (!res.headersSent) { res.writeHead(502); res.end('bad gateway: ' + e.message) }
      else res.destroy()
    }
  })

  // WebSocket：Cookie 会话校验后转发（浏览器/WebView 握手自动带 Cookie，无 Basic Auth 缺失问题）
  // head 为握手后已到达的早期帧数据，必须透传给上游隧道，不能丢弃
  server.on('upgrade', async (req, socket, head) => {
    const session = sessions.verifyCookie(req.headers.cookie)
    if (!session) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    try {
      await forwarder.forwardUpgrade(req, socket, head && head.length ? head : Buffer.alloc(0))
    } catch {
      socket.destroy()
    }
  })

  server.on('clientError', (_err, socket) => { socket.destroy() })
  return server
}
